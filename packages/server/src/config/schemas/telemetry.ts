import { z } from 'zod';
import { trueBooleanString } from './common.js';

/**
 * Telemetry and observability schemas
 */

export const otlpSchema = z.object({
  logsEndpoint: z.string().url().default('http://localhost:4318/v1/logs'),
  tracesEndpoint: z.string().url().default('http://localhost:4318/v1/traces'),
  metricsEndpoint: z.string().url().default('http://localhost:4318/v1/metrics'),
});

export const telemetrySchema = z.object({
  enabled: trueBooleanString,
  serviceName: z.string().default('s3-manager'),
  serviceVersion: z.string().default('2.0.0'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  logFormat: z.enum(['pretty', 'json']).default('pretty'),
  exporterType: z.enum(['console', 'otlp', 'none']).default('console'),
  otlp: otlpSchema,
  traceSampleRate: z.coerce.number().min(0).max(1).default(1),
  batchSize: z.coerce.number().int().positive().default(512),
  batchTimeoutMs: z.coerce.number().int().positive().default(30000),
  redactPaths: z
    .array(z.string())
    .default([
      'password',
      '*.password',
      'secret',
      '*.secret',
      'secretKey',
      '*.secretKey',
      'accessKey',
      '*.accessKey',
      'token',
      '*.token',
      'apiKey',
      '*.apiKey',
      'apikey',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      's3.sources.*.accessKey',
      's3.sources.*.secretKey',
      'keycloak.clientSecret',
      'azure.clientSecret',
      'google.clientSecret',
    ]),
});
