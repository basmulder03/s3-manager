import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

// Load environment variables FIRST, before any other imports
const rootDir = resolve(import.meta.dir, '../../..');  // src -> server -> packages -> root
loadDotenv({ path: resolve(rootDir, '.env.local') });
loadDotenv({ path: resolve(rootDir, '.env') });

import { config } from './config';
import { createApp } from './app';
import { getLogger, initTelemetry, shutdownTelemetry } from './telemetry';

const telemetryStatus = await initTelemetry(config);
const startupLogger = getLogger('Server');

startupLogger.info(
  {
    environment: config.nodeEnv,
    oidcProvider: config.oidcProvider,
    s3Endpoint: config.s3.endpoint,
    telemetry: telemetryStatus,
  },
  'Starting S3 Manager Server'
);

if (config.localDevMode) {
  startupLogger.warn('LOCAL_DEV_MODE is enabled (mock authentication in use)');
}

const app = createApp();

const server = Bun.serve({
  fetch: app.fetch,
  port: config.port,
});

startupLogger.info(
  {
    listenAddress: `http://localhost:${server.port}`,
    trpcEndpoint: `http://localhost:${server.port}/trpc`,
    healthEndpoint: `http://localhost:${server.port}/health`,
    readinessEndpoint: `http://localhost:${server.port}/health/ready`,
  },
  'Server ready'
);

// Graceful shutdown
process.on('SIGINT', () => {
  void (async () => {
    const logger = getLogger('Server');
    logger.info('Shutting down gracefully (SIGINT)');
    await shutdownTelemetry();
    server.stop();
    process.exit(0);
  })();
});

process.on('SIGTERM', () => {
  void (async () => {
    const logger = getLogger('Server');
    logger.info('Shutting down gracefully (SIGTERM)');
    await shutdownTelemetry();
    server.stop();
    process.exit(0);
  })();
});
