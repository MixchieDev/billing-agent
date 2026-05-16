export async function register() {
  // Skip scheduler initialization in Vercel serverless
  // The scheduler won't persist in serverless anyway
  if (process.env.VERCEL) {
    console.log('[Instrumentation] Skipping scheduler in Vercel serverless environment');
    return;
  }

  // In dev, skip unless explicitly enabled — avoids hitting the DB and
  // registering cron on every restart, which slows down dev startup.
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_SCHEDULER !== 'true') {
    console.log('[Instrumentation] Scheduler disabled in dev (set ENABLE_SCHEDULER=true to enable)');
    return;
  }

  // Only run on the server (for local development or self-hosted)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initializeScheduler } = await import('./lib/scheduler');
      console.log('[Instrumentation] Initializing billing scheduler...');
      await initializeScheduler();
    } catch (error) {
      console.error('[Instrumentation] Failed to initialize scheduler:', error);
      // Don't throw - let the app continue without the scheduler
    }
  }
}
