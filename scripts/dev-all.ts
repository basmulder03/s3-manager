const devEnv = {
  ...process.env,
  S3_SOURCE_0_ID: process.env.S3_SOURCE_0_ID ?? 'localstack',
  S3_SOURCE_0_ENDPOINT: process.env.S3_SOURCE_0_ENDPOINT ?? 'http://localhost:4566',
  S3_SOURCE_0_ACCESS_KEY: process.env.S3_SOURCE_0_ACCESS_KEY ?? 'test',
  S3_SOURCE_0_SECRET_KEY: process.env.S3_SOURCE_0_SECRET_KEY ?? 'test',
  S3_SOURCE_0_REGION: process.env.S3_SOURCE_0_REGION ?? 'us-east-1',
  S3_SOURCE_0_USE_SSL: process.env.S3_SOURCE_0_USE_SSL ?? 'false',
  S3_SOURCE_0_VERIFY_SSL: process.env.S3_SOURCE_0_VERIFY_SSL ?? 'false',
  S3_SOURCE_1_ID: process.env.S3_SOURCE_1_ID ?? 'localstack-2',
  S3_SOURCE_1_ENDPOINT: process.env.S3_SOURCE_1_ENDPOINT ?? 'http://localhost:4567',
  S3_SOURCE_1_ACCESS_KEY: process.env.S3_SOURCE_1_ACCESS_KEY ?? 'test-2',
  S3_SOURCE_1_SECRET_KEY: process.env.S3_SOURCE_1_SECRET_KEY ?? 'test-2',
  S3_SOURCE_1_REGION: process.env.S3_SOURCE_1_REGION ?? 'us-east-1',
  S3_SOURCE_1_USE_SSL: process.env.S3_SOURCE_1_USE_SSL ?? 'false',
  S3_SOURCE_1_VERIFY_SSL: process.env.S3_SOURCE_1_VERIFY_SSL ?? 'false',
};

const children = [
  Bun.spawn(['bun', 'run', '--filter', 'server', 'dev'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: devEnv,
  }),
  Bun.spawn(['bun', 'run', '--filter', 'web', 'dev'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: devEnv,
  }),
];

let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const results = await Promise.all(children.map((child) => child.exited));
const exitCode = results.find((code) => code !== 0) ?? 0;

shutdown();
process.exit(exitCode);
