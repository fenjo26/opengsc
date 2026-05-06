import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runGscSync, isSyncInProgress } from '@/lib/gscSync';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ syncing: isSyncInProgress() });
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
