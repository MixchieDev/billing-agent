export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeScheduler } = await import('./lib/scheduler');

    console.log('[Instrumentation] Initializing billing scheduler...');
    await initializeScheduler();
  }
}
