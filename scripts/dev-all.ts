const children = [
  Bun.spawn(['bun', 'run', '--filter', 'server', 'dev'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  }),
  Bun.spawn(['bun', 'run', '--filter', 'web', 'dev'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
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
