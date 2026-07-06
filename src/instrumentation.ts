// Next.js instrumentation: runs once when the server process starts.
// We use it to start the in-app background schedulers (Clarity auto-collect,
// rank tracker position checks).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startClarityScheduler } = await import('@/lib/clarityScheduler');
    startClarityScheduler();
    const { startRankScheduler } = await import('@/lib/rankScheduler');
    startRankScheduler();
  }
}
