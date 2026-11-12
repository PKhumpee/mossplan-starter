import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const devVarsPath = resolve('.dev.vars');
const hadDevVars = existsSync(devVarsPath);
const stateRoot = resolve('.wrangler');
const stateBefore = new Set(
  existsSync(stateRoot) ? readdirSync(stateRoot).filter((name) => name.startsWith('e2e-api-')) : [],
);
const hadTestResults = existsSync('test-results');
const playwright = resolve('node_modules/@playwright/test/cli.js');

let exitCode = 1;
try {
  exitCode = await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [playwright, 'test'], {
      stdio: 'inherit',
      env: process.env,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolvePromise(code ?? 1));
  });
} finally {
  if (!hadDevVars) rmSync(devVarsPath, { force: true });
  if (existsSync(stateRoot)) {
    for (const name of readdirSync(stateRoot)) {
      if (name.startsWith('e2e-api-') && !stateBefore.has(name)) {
        rmSync(resolve(stateRoot, name), { recursive: true, force: true });
      }
    }
  }
  if (!hadTestResults) rmSync('test-results', { recursive: true, force: true });
}
process.exitCode = exitCode;
