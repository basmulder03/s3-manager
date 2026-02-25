import { context, trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import type { Config } from '@/config';

let tracer: Tracer | null = null;

export const initTracer = (config: Config): Tracer => {
  tracer = trace.getTracer(config.telemetry.serviceName, config.telemetry.serviceVersion);
  return tracer;
};

export const getTracer = (): Tracer => {
  if (tracer) {
    return tracer;
  }
  return trace.getTracer('s3-manager');
};

export const getActiveTraceContext = (): { traceId?: string; spanId?: string } => {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) {
    return {};
  }

  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
};

export { SpanStatusCode, context };
