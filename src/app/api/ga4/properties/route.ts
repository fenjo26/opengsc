import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { makeOAuth2, type GoogleAccount } from '@/lib/ga4';

export type GA4Property = {
  id: string;          // numeric property id, e.g. "123456789"
  name: string;        // property display name
  account: string;     // owning GA4 account display name
};

// GET /api/ga4/properties
// Lists every GA4 property visible across all linked Google accounts.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accounts = (await prisma.account.findMany({
    where: { userId, provider: 'google' },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  })) as GoogleAccount[];

  if (accounts.length === 0) {
    return NextResponse.json({ properties: [], connected_accounts: 0 });
  }

  const byId = new Map<string, GA4Property>();
  const errors: string[] = [];

  await Promise.allSettled(
    accounts.map(async (account) => {
      try {
        const oauth2 = makeOAuth2(account);
        const admin = google.analyticsadmin({ version: 'v1beta', auth: oauth2 });
        // accountSummaries.list returns accounts AND their property summaries
        // in a single paginated call — exactly what we need for a picker.
        let pageToken: string | undefined;
        do {
          const res = await admin.accountSummaries.list({ pageSize: 200, pageToken });
          for (const acc of res.data.accountSummaries ?? []) {
            for (const prop of acc.propertySummaries ?? []) {
              // prop.property looks like "properties/123456789"
              const id = (prop.property ?? '').split('/')[1];
              if (!id) continue;
              if (!byId.has(id)) {
                byId.set(id, {
                  id,
                  name: prop.displayName ?? `Property ${id}`,
                  account: acc.displayName ?? '',
                });
              }
            }
          }
          pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
      } catch (err: any) {
        errors.push(`Account ${account.id}: ${err?.message ?? 'error'}`);
      }
    })
  );

  const properties = Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    properties,
    connected_accounts: accounts.length,
    errors: errors.length ? errors : undefined,
  });
}
