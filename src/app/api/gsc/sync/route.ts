import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runGscSync, isSyncInProgress, getLastSyncResult } from '@/lib/gscSync';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = getLastSyncResult();
  return NextResponse.json({
    syncing: isSyncInProgress(),
    lastResult: result.completedAt ? {
      sitesSynced: result.sitesSynced,
      needsReauth: result.accountErrors.some(e => e.needsReauth),
      accountErrors: result.accountErrors.length,
      siteErrors: result.siteErrors.length,
      completedAt: result.completedAt,
    } : null,
  });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isSyncInProgress()) {
    return NextResponse.json({ started: false, message: 'Already in progress' });
  }

  // Fire-and-forget: respond immediately, sync runs in background
  setImmediate(() => {
    runGscSync().catch((err) => console.error('[GSC Sync] Background error:', err));
  });

  return NextResponse.json({ started: true, message: 'Sync started' });
}
