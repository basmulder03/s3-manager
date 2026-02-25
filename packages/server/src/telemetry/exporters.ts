import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExportResultCode } from '@opentelemetry/core';
import { PeriodicExportingMetricReader, type IMetricReader } from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Sampler,
  TraceIdRatioBasedSampler,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Config } from '@/config';

class NoopSpanExporter implements SpanExporter {
  export(_spans: ReadableSpan[], resultCallback: (result: { code: ExportResultCode }) => void): void {
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export interface ExporterSetup {
  spanProcessors: SpanProcessor[];
  metricReaders: IMetricReader[];
  sampler: Sampler;
  traceEnabled: boolean;
  metricsEnabled: boolean;
  errors: string[];
}

export const createExporterSetup = (config: Config): ExporterSetup => {
  const errors: string[] = [];
  const spanProcessors: SpanProcessor[] = [];
  const metricReaders: IMetricReader[] = [];

  const sampler = new TraceIdRatioBasedSampler(config.telemetry.traceSampleRate);

  if (!config.telemetry.enabled) {
    return {
      spanProcessors,
      metricReaders,
      sampler,
      traceEnabled: false,
      metricsEnabled: false,
      errors,
    };
  }

  if (config.telemetry.exporterType === 'none') {
    return {
      spanProcessors,
      metricReaders,
      sampler,
      traceEnabled: false,
      metricsEnabled: false,
      errors,
    };
  }

  if (config.telemetry.exporterType === 'console') {
    spanProcessors.push(
      new BatchSpanProcessor(new NoopSpanExporter(), {
        maxQueueSize: config.telemetry.batchSize,
        scheduledDelayMillis: config.telemetry.batchTimeoutMs,
      })
    );

    return {
      spanProcessors,
      metricReaders,
      sampler,
      traceEnabled: true,
      metricsEnabled: false,
      errors,
    };
  }

  try {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.telemetry.otlp.tracesEndpoint,
        }),
        {
          maxQueueSize: config.telemetry.batchSize,
          scheduledDelayMillis: config.telemetry.batchTimeoutMs,
        }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to configure OTLP trace exporter';
    errors.push(message);
  }

  try {
    metricReaders.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: config.telemetry.otlp.metricsEndpoint,
        }),
        exportIntervalMillis: config.telemetry.batchTimeoutMs,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to configure OTLP metric exporter';
    errors.push(message);
  }

  return {
    spanProcessors,
    metricReaders,
    sampler,
    traceEnabled: spanProcessors.length > 0,
    metricsEnabled: metricReaders.length > 0,
    errors,
  };
};
