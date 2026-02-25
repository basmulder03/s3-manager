import { metrics, type Counter, type Histogram, ValueType } from '@opentelemetry/api';
import type { Config } from '@/config';
import type { HttpMetricAttributes, S3AccessMetricAttributes } from '@/telemetry/types';

interface MetricState {
  httpRequestsTotal: Counter;
  httpRequestDurationMs: Histogram;
  s3AccessTotal: Counter;
  s3AccessDurationMs: Histogram;
}

let metricState: MetricState | null = null;

export const initMetrics = (config: Config): void => {
  if (!config.telemetry.enabled) {
    metricState = null;
    return;
  }

  const meter = metrics.getMeter(config.telemetry.serviceName, config.telemetry.serviceVersion);
  metricState = {
    httpRequestsTotal: meter.createCounter('http.server.requests_total', {
      description: 'Total amount of handled HTTP requests',
      valueType: ValueType.INT,
    }),
    httpRequestDurationMs: meter.createHistogram('http.server.request_duration_ms', {
      description: 'Duration of HTTP requests in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),
    s3AccessTotal: meter.createCounter('s3.file_access_total', {
      description: 'Count who accessed which S3 file',
      valueType: ValueType.INT,
    }),
    s3AccessDurationMs: meter.createHistogram('s3.file_access_duration_ms', {
      description: 'Duration of S3 file access operations in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),
  };
};

export const recordHttpRequest = (attributes: HttpMetricAttributes, durationMs: number): void => {
  if (!metricState) {
    return;
  }

  metricState.httpRequestsTotal.add(1, {
    method: attributes.method,
    route: attributes.route,
    status_code: attributes.statusCode,
  });

  metricState.httpRequestDurationMs.record(durationMs, {
    method: attributes.method,
    route: attributes.route,
    status_code: attributes.statusCode,
  });
};

export const recordS3FileAccess = (attributes: S3AccessMetricAttributes, durationMs: number): void => {
  if (!metricState) {
    return;
  }

  metricState.s3AccessTotal.add(1, {
    operation: attributes.operation,
    actor: attributes.actor,
    bucket: attributes.bucket,
    object_key: attributes.objectKey,
    result: attributes.result,
  });

  metricState.s3AccessDurationMs.record(durationMs, {
    operation: attributes.operation,
    actor: attributes.actor,
    bucket: attributes.bucket,
    object_key: attributes.objectKey,
    result: attributes.result,
  });
};
