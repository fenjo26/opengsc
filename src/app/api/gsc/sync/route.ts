import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runGscSync } from '@/lib/gscSync';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runGscSync();
    return NextResponse.json({ success: true, message: 'Sync completed' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
