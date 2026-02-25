import { router } from './index';
import { healthRouter } from '../routers/health';

/**
 * Main application router
 * Combines all feature routers
 */
export const appRouter = router({
  health: healthRouter,
  // Will add: s3, auth, etc.
});

export type AppRouter = typeof appRouter;
