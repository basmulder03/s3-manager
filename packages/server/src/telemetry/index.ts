import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import type { Config } from '../config';
import { createExporterSetup } from './exporters';
import { initRootLogger, getLogger, isLoggerInitialized } from './logger';
import { initMetrics } from './metrics';
import { initTracer } from './tracer';
import type { TelemetryRuntime, TelemetryStatus } from './types';

const defaultStatus: TelemetryStatus = {
  enabled: false,
  initialized: false,
  exporterType: 'none',
  tracesEnabled: false,
  metricsEnabled: false,
  errors: [],
};

const runtime: TelemetryRuntime = {
  sdk: null,
  status: defaultStatus,
};

export const initTelemetry = async (config: Config): Promise<TelemetryStatus> => {
  initRootLogger(config);
  const logger = getLogger('Telemetry');

  process.env.OTEL_LOG_LEVEL = 'error';
  if (!process.env.OTEL_LOGS_EXPORTER) {
    process.env.OTEL_LOGS_EXPORTER = 'none';
  }

  if (!config.telemetry.enabled) {
    runtime.status = {
      enabled: false,
      initialized: true,
      exporterType: config.telemetry.exporterType,
      tracesEnabled: false,
      metricsEnabled: false,
      errors: [],
    };
    logger.warn('Telemetry disabled by configuration');
    return runtime.status;
  }

  const exporterSetup = createExporterSetup(config);

  try {
    runtime.sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: config.telemetry.serviceName,
        [SEMRESATTRS_SERVICE_VERSION]: config.telemetry.serviceVersion,
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.nodeEnv,
      }),
      sampler: exporterSetup.sampler,
      spanProcessors: exporterSetup.spanProcessors,
      metricReaders: exporterSetup.metricReaders,
    });

    await runtime.sdk.start();

    initTracer(config);
    initMetrics(config);

    runtime.status = {
      enabled: true,
      initialized: true,
      exporterType: config.telemetry.exporterType,
      tracesEnabled: exporterSetup.traceEnabled,
      metricsEnabled: exporterSetup.metricsEnabled,
      errors: exporterSetup.errors,
    };

    if (exporterSetup.errors.length > 0) {
      logger.warn({ errors: exporterSetup.errors }, 'Telemetry initialized with warnings');
    } else if (exporterSetup.spanProcessors.length === 0 && exporterSetup.metricReaders.length === 0) {
      logger.info('Telemetry initialized without signal exporters');
    } else {
      logger.info('Telemetry initialized');
    }

    return runtime.status;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown telemetry initialization error';
    runtime.status = {
      enabled: true,
      initialized: false,
      exporterType: config.telemetry.exporterType,
      tracesEnabled: false,
      metricsEnabled: false,
      errors: [...exporterSetup.errors, message],
    };

    logger.warn({ error: message }, 'Telemetry failed to initialize, continuing without exporters');
    initTracer(config);
    initMetrics(config);
    return runtime.status;
  }
};

export const shutdownTelemetry = async (): Promise<void> => {
  if (!runtime.sdk) {
    return;
  }

  if (!isLoggerInitialized()) {
    await runtime.sdk.shutdown();
    runtime.sdk = null;
    return;
  }

  const logger = getLogger('Telemetry');

  try {
    await runtime.sdk.shutdown();
    logger.info('Telemetry shutdown complete');
  } catch (error) {
    logger.warn(
      {
        err: error,
      },
      'Telemetry shutdown encountered an error'
    );
  } finally {
    runtime.sdk = null;
  }
};

export const getTelemetryStatus = (): TelemetryStatus => runtime.status;

export { getLogger } from './logger';
export { telemetryMiddleware } from './middleware';
export { recordS3FileAccess } from './metrics';
