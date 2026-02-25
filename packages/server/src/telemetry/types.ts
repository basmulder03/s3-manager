import type { NodeSDK } from '@opentelemetry/sdk-node';

export type TelemetryExporterType = 'console' | 'otlp' | 'none';

export interface TelemetryStatus {
  enabled: boolean;
  initialized: boolean;
  exporterType: TelemetryExporterType;
  tracesEnabled: boolean;
  metricsEnabled: boolean;
  errors: string[];
}

export interface TelemetryRuntime {
  sdk: NodeSDK | null;
  status: TelemetryStatus;
}

export interface HttpMetricAttributes {
  method: string;
  route: string;
  statusCode: string;
}

export interface S3AccessMetricAttributes {
  operation: 'read' | 'write' | 'delete';
  actor: string;
  bucket: string;
  objectKey: string;
  result: 'success' | 'failure';
}
