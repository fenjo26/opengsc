// Shared Google Search Console query helpers for server routes/libs that need
// filtered Search Analytics data (e.g. Rank Tracker: per-keyword GSC series).
// Same account-fallback pattern as /api/gsc/site.

import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';

export type GscAccount = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

export async function getUserGoogleAccounts(userId: string): Promise<GscAccount[]> {
  return prisma.account.findMany({
    where: { userId, provider: 'google' },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
}

function makeOAuth2(account: GscAccount) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  oauth2.on('tokens', async (tokens) => {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        refresh_token: tokens.refresh_token ?? account.refresh_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : account.expires_at,
      },
    });
  });
  return oauth2;
}

export interface GscQueryOpts {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  // e.g. [{ dimension: 'query', operator: 'equals', expression: 'buy shoes' }]
  filters?: { dimension: string; operator: string; expression: string }[];
}

// Try each linked account until one successfully queries GSC for the given siteUrl.
export async function queryGsc(accounts: GscAccount[], siteUrl: string, opts: GscQueryOpts) {
  for (const account of accounts) {
    try {
      const oauth2 = makeOAuth2(account);
      const wm = google.webmasters({ version: 'v3', auth: oauth2 });
      const res = await wm.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: opts.startDate,
          endDate: opts.endDate,
          dimensions: opts.dimensions,
          rowLimit: opts.rowLimit ?? 250,
          dataState: 'all',
          ...(opts.filters?.length
            ? { dimensionFilterGroups: [{ filters: opts.filters }] }
            : {}),
        },
      });
      return res.data.rows ?? [];
    } catch {
      continue;
    }
  }
  return [];
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
