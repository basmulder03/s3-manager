import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { existsSync, statSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { appRouter } from '@/trpc/router';
import { createContext } from '@/trpc';
import { config } from '@/config';
import { getLogger, getTelemetryStatus, telemetryMiddleware } from '@/telemetry';
import { registerAuthHttpRoutes } from '@/http/auth';
import { enforceSameOriginForMutation } from '@/http/csrf';
import { registerUploadHttpRoutes } from '@/http/upload';

const webDistDir = resolve(import.meta.dir, '../../web/dist');
const webIndexFile = resolve(webDistDir, 'index.html');

const isBackendPath = (path: string): boolean => {
  return path === '/api' || path.startsWith('/api/');
};

/**
 * Create and configure Hono application
 */
export const createApp = () => {
  const app = new Hono();
  const appLogger = getLogger('App');
  const hasWebBuild = existsSync(webIndexFile);

  const apiCsp = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

  // Middleware
  app.use('*', telemetryMiddleware());

  // CORS configuration (must run before CSRF guards so failures still include CORS headers)
  app.use(
    '*',
    cors({
      origin: [config.web.origin],
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  app.use('*', async (c, next) => {
    const csrfFailure = enforceSameOriginForMutation(c);
    if (csrfFailure) {
      return csrfFailure;
    }

    await next();
  });

  app.use('*', async (c, next) => {
    await next();

    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), microphone=()');
    if (isBackendPath(c.req.path)) {
      c.header('Content-Security-Policy', apiCsp);
    }

    if (config.nodeEnv === 'production') {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });

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
  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/health/ready', (c) => {
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
  registerUploadHttpRoutes(app);

  // tRPC endpoint
  app.use(
    '/api/trpc/*',
    trpcServer({
      router: appRouter,
      createContext,
    })
  );

  app.get('/api', (c) => {
    return c.json({
      app: config.app.name,
      version: config.app.version,
      message: 'S3 Manager API - Use /api/trpc for API endpoints',
    });
  });

  if (hasWebBuild) {
    app.get('*', (c) => {
      if (isBackendPath(c.req.path)) {
        return c.notFound();
      }

      const normalizedPath = normalize(c.req.path);
      const relativePath =
        normalizedPath === '/' ? 'index.html' : normalizedPath.replace(/^\/+/, '');
      const requestedPath = resolve(webDistDir, relativePath);

      if (
        requestedPath.startsWith(webDistDir) &&
        existsSync(requestedPath) &&
        statSync(requestedPath).isFile()
      ) {
        return new Response(Bun.file(requestedPath));
      }

      return new Response(Bun.file(webIndexFile));
    });
  } else {
    app.get('/', (c) => {
      return c.json({
        app: config.app.name,
        version: config.app.version,
        message: 'S3 Manager API - Use /api/trpc for API endpoints',
      });
    });
  }

  return app;
};
