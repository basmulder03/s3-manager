import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from '@/trpc/router';
import { createContext } from '@/trpc';
import { config } from '@/config';
import { getLogger, getTelemetryStatus, telemetryMiddleware } from '@/telemetry';
import { registerAuthHttpRoutes } from '@/http/auth';

/**
 * Create and configure Hono application
 */
export const createApp = () => {
  const app = new Hono();
  const appLogger = getLogger('App');

  // Middleware
  app.use('*', telemetryMiddleware());

  // CORS configuration
  app.use(
    '*',
    cors({
      origin: [config.web.origin],
      credentials: true,
    })
  );

  app.onError((error, c) => {
    appLogger.error(
      {
        err: error,
        method: c.req.method,
        path: c.req.path,
      },
      'Unhandled application error'
    );

    return c.json(
      {
        error: 'Internal Server Error',
      },
      500
    );
  });

  // Health check endpoints (for K8s probes - simple HTTP, not tRPC)
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', (c) => {
    const telemetry = getTelemetryStatus();
    return c.json({
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
    });
  });

  registerAuthHttpRoutes(app);

  // tRPC endpoint
  app.use(
    '/trpc/*',
    trpcServer({
      router: appRouter,
      createContext,
    })
  );

  // Root endpoint
  app.get('/', (c) => {
    return c.json({
      app: config.app.name,
      version: config.app.version,
      message: 'S3 Manager API - Use /trpc for API endpoints',
    });
  });

  return app;
};
