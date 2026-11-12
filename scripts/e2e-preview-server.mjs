import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function getE2EPort(value = process.env.E2E_PORT) {
  const port = Number(value ?? 4321);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_PORT must be a valid TCP port (1-65535); received ${value}`);
  }
  return port;
}

export function assertPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `E2E port ${port} is already in use on ${host}; stop its owner or set E2E_PORT to a free port.`,
          ),
        );
      } else reject(error);
    });
    server.listen(port, host, () => server.close((error) => (error ? reject(error) : resolve())));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = getE2EPort();
  await assertPortAvailable(port);
  const child = spawn(
    process.execPath,
    [
      resolve('node_modules/astro/bin/astro.mjs'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { stdio: ['inherit', 'pipe', 'pipe'], env: process.env },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      const text = chunk.toString();
      process[stream === child.stdout ? 'stdout' : 'stderr'].write(text);
      if (
        text.includes(`Port ${port} is in use`) ||
        text.includes(`Port ${port} is already in use`)
      ) {
        console.error(
          `E2E port ${port} is already in use; stop its owner or set E2E_PORT to a free port.`,
        );
        child.kill('SIGTERM');
        process.exitCode = 1;
      }
    });
  }
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('error', (error) => {
    console.error(`Could not start Astro preview: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
