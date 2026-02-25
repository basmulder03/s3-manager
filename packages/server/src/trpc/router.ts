import { router } from '@/trpc/index';
import { healthRouter } from '@/routers/health';
import { s3Router } from '@/routers/s3';
import { authRouter } from '@/routers/auth';

/**
 * Main application router
 * Combines all feature routers
 */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  s3: s3Router,
});

export type AppRouter = typeof appRouter;
