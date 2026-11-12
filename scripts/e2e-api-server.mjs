import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPortAvailable, getE2EPort } from './e2e-preview-server.mjs';

const basePort = getE2EPort();
const apiPort = basePort + 1;
const mockPort = basePort + 2;
if (mockPort > 65535)
  throw new Error('E2E_PORT must leave room for the local API and Resend mock ports.');
await assertPortAvailable(apiPort);
await assertPortAvailable(mockPort);

const devVarsPath = resolve('.dev.vars');
if (existsSync(devVarsPath)) {
  throw new Error('Refusing to overwrite existing .dev.vars; move it aside before running e2e.');
}

const statePath = resolve('.wrangler', `e2e-api-${process.pid}`);
mkdirSync(resolve('.wrangler'), { recursive: true });
mkdirSync(statePath, { recursive: true });
let lastOtp = null;
const mock = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/otp') {
    res.writeHead(lastOtp ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(lastOtp ? { otp: lastOtp } : { error: 'No email sent' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/emails') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const email = JSON.parse(body);
    lastOtp = /<strong>(\d{6})<\/strong>/.exec(email.html)?.[1] ?? null;
    if (!lastOtp) {
      res.writeHead(400);
      res.end('OTP missing from mocked email');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'local-resend-mock' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const masterKey = randomBytes(32).toString('base64');
writeFileSync(
  devVarsPath,
  [
    'SETUP_TOKEN=mossplan-e2e-test-token',
    `MOSS_SECRET_KEY=${masterKey}`,
    'RESEND_API_KEY=re_test_local_mock',
    `RESEND_API_URL=http://127.0.0.1:${mockPort}/emails`,
    '',
  ].join('\n'),
  { encoding: 'utf8', flag: 'wx' },
);

function runWrangler(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      stdio: 'inherit',
      env: { ...process.env, CI: '1' },
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`Wrangler exited with code ${code}`)),
    );
  });
}

let worker;
let shuttingDown = false;
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  worker?.kill('SIGTERM');
  rmSync(devVarsPath, { force: true });
  rmSync(statePath, { recursive: true, force: true });
  mock.closeAllConnections();
  await new Promise((resolvePromise) => mock.close(() => resolvePromise()));
}

process.once('exit', () => {
  rmSync(devVarsPath, { force: true });
  rmSync(statePath, { recursive: true, force: true });
});

try {
  await new Promise((resolvePromise, reject) =>
    mock.listen(mockPort, '127.0.0.1', resolvePromise).once('error', reject),
  );
  await runWrangler([
    'd1',
    'migrations',
    'apply',
    'mossplan-db',
    '--local',
    '--persist-to',
    statePath,
  ]);
  worker = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(apiPort),
      '--persist-to',
      statePath,
    ],
    { stdio: 'inherit' },
  );
  worker.once('error', (error) => {
    console.error(`Could not start local Wrangler API: ${error.message}`);
    process.exitCode = 1;
  });
  worker.once('exit', (code) => {
    if (!shuttingDown) process.exitCode = code ?? 1;
  });
  process.once('SIGINT', () => void cleanup());
  process.once('SIGTERM', () => void cleanup());
} catch (error) {
  await cleanup();
  throw error;
}
