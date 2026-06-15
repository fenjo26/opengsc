// Next.js instrumentation: runs once when the server process starts.
// We use it to start the in-app Clarity auto-collect scheduler.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startClarityScheduler } = await import('@/lib/clarityScheduler');
    startClarityScheduler();
  }
}
