import type { Context as HonoContext, Next } from 'hono';
import { context as otelContext, trace } from '@opentelemetry/api';
import { getLogger } from './logger';
import { recordHttpRequest } from './metrics';
import { getTracer, SpanStatusCode } from './tracer';

const httpLogger = () => getLogger('HTTP');

const getRouteLabel = (ctx: HonoContext): string => {
  return ctx.req.path;
};

export const telemetryMiddleware = () => {
  return async (ctx: HonoContext, next: Next): Promise<void> => {
    const method = ctx.req.method;
    const route = getRouteLabel(ctx);
    const startedAt = Date.now();

    const tracer = getTracer();
    const span = tracer.startSpan(`${method} ${route}`, {
      attributes: {
        'http.request.method': method,
        'http.route': route,
        'url.full': ctx.req.url,
      },
    });

    try {
      await otelContext.with(trace.setSpan(otelContext.active(), span), async () => {
        await next();
      });

      const durationMs = Date.now() - startedAt;
      const statusCode = ctx.res.status;
      const traceId = span.spanContext().traceId;
      const compactMessage = `${method} ${route} -> ${statusCode} (${durationMs}ms) [trace:${traceId}]`;
      httpLogger().info(compactMessage);

      recordHttpRequest(
        {
          method,
          route,
          statusCode: String(statusCode),
        },
        durationMs
      );

      span.setAttribute('http.response.status_code', statusCode);
      span.setStatus({
        code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      span.end();
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const statusCode = ctx.res.status || 500;
      const traceId = span.spanContext().traceId;

      httpLogger().error(
        {
          err: error,
          method,
          route,
          statusCode,
          durationMs,
          traceId,
        },
        `${method} ${route} -> ${statusCode} (${durationMs}ms) [trace:${traceId}]`
      );

      recordHttpRequest(
        {
          method,
          route,
          statusCode: String(statusCode),
        },
        durationMs
      );

      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.end();

      throw error;
    }
  };
};
