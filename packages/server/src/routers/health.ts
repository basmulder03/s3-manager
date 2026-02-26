import { router, publicProcedure } from '@/trpc';
import { config } from '@/config';
import { getTelemetryStatus } from '@/telemetry';
import { z } from 'zod';

/**
 * Health check router
 * Provides endpoints for Kubernetes liveness and readiness probes
 */
export const healthRouter = router({
  /**
   * Liveness probe - checks if server is running
   */
  liveness: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/health/liveness',
        tags: ['health'],
        summary: 'Liveness probe',
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(() => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
    }),

  /**
   * Readiness probe - checks if server is ready to handle requests
   */
  readiness: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/health/readiness',
        tags: ['health'],
        summary: 'Readiness probe',
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(() => {
    const telemetry = getTelemetryStatus();

    // In the future, check S3 connectivity, database, etc.
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        config: 'ok',
        telemetry: {
          enabled: telemetry.enabled,
          initialized: telemetry.initialized,
          exporterType: telemetry.exporterType,
          tracesEnabled: telemetry.tracesEnabled,
          metricsEnabled: telemetry.metricsEnabled,
          errors: telemetry.errors,
        },
      },
    };
    }),

  /**
   * Get server info (for debugging)
   */
  info: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/health/info',
        tags: ['health'],
        summary: 'Server info',
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(() => {
    return {
      app: config.app.name,
      version: config.app.version,
      env: config.nodeEnv,
      oidcProvider: config.oidcProvider,
    };
    }),
});
