// Connects a Workers Build to the live site. `start` downloads published content before the build;
// `done` reports success afterwards. Set BUILD_SITE_URL and BUILD_CALLBACK_TOKEN as build variables.
import { pathToFileURL } from 'node:url';
import { fetchAndWriteSnapshot } from './snapshot';

export type BuildContentMode = 'sample' | 'live';

/** Half a configuration is an error: building sample content over a live site would be worse. */
export function buildContentMode(env: NodeJS.ProcessEnv): BuildContentMode {
  const url = env.BUILD_SITE_URL?.trim();
  const token = env.BUILD_CALLBACK_TOKEN?.trim();
  if (url && token) return 'live';
  if (url || token) throw new Error('Set both BUILD_SITE_URL and BUILD_CALLBACK_TOKEN, or neither');
  return 'sample';
}

async function reportSuccess(env: NodeJS.ProcessEnv): Promise<void> {
  const base = env.BUILD_SITE_URL!.trim().replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/internal/builds/latest/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.BUILD_CALLBACK_TOKEN!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'succeeded' }),
    });
    if (!res.ok) console.warn(`[build-content] status report returned HTTP ${res.status}`);
  } catch {
    // The site is already built, so a failed report must not fail the build.
    console.warn('[build-content] could not report build status');
  }
}

async function main(step: string | undefined): Promise<void> {
  if (buildContentMode(process.env) === 'sample') {
    console.log('[build-content] build variables not set, using sample content');
    return;
  }
  if (step === 'start') await fetchAndWriteSnapshot();
  else if (step === 'done') await reportSuccess(process.env);
  else throw new Error('Usage: build-content.ts <start|done>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : 'build-content failed');
    process.exitCode = 1;
  });
}
