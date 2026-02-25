import { router } from './index';
import { healthRouter } from '../routers/health';
import { s3Router } from '../routers/s3';

/**
 * Main application router
 * Combines all feature routers
 */
export const appRouter = router({
  health: healthRouter,
  s3: s3Router,
});

export type AppRouter = typeof appRouter;
