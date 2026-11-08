import { and, desc, eq, gt } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';
import { isValidDeployHookUrl, resolveDeployHook } from './deploy-hook';

export interface BuildRequest {
  reason: string;
  requestedBy?: string;
}

const COLLAPSE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Starts a Workers Build. The build begins right away and reads content when it starts, so the row
 * leaves `queued` here: a later publish must not collapse into a build that already read its content.
 * Errors never include the hook URL, which is a credential.
 */
async function triggerDeployHook(
  db: ReturnType<typeof getDb>,
  buildId: string,
  hookUrl: string,
): Promise<void> {
  const markFailed = (error: string) =>
    db
      .update(schema.build)
      .set({ status: 'failed', finishedAt: Date.now(), error })
      .where(eq(schema.build.id, buildId));

  if (!isValidDeployHookUrl(hookUrl)) {
    await markFailed('Deploy Hook URL is invalid');
    return;
  }
  try {
    // A redirect would send the request outside the validated endpoint, so it counts as a failure.
    const response = await fetch(hookUrl, { method: 'POST', redirect: 'manual' });
    if (!response.ok) {
      await markFailed(`Deploy Hook rejected with HTTP ${response.status}`);
      return;
    }
    await db
      .update(schema.build)
      .set({ status: 'running', startedAt: Date.now() })
      .where(eq(schema.build.id, buildId));
  } catch {
    await markFailed('Deploy Hook network failure');
  }
}

/**
 * Requests a site rebuild (CONTRACTS §5, §8, T12).
 *
 * 1. Checks for a still-`queued` build requested within the last 10 minutes and reuses it if found.
 * 2. Otherwise, inserts a new `build` row in `queued` status.
 * 3. Dispatches the GitHub Actions `workflow_dispatch` event (ref: main, inputs: build_id, reason).
 * 4. If GitHub refuses or dispatch fails, marks the build row `failed` with the error.
 */
export async function requestBuild(env: Env, req: BuildRequest): Promise<{ buildId: string }> {
  const db = getDb(env);
  const now = Date.now();
  const cutoff = now - COLLAPSE_WINDOW_MS;

  // 1. Collapse into a still-queued build younger than 10 minutes if one exists
  const [existingQueued] = await db
    .select({ id: schema.build.id })
    .from(schema.build)
    .where(and(eq(schema.build.status, 'queued'), gt(schema.build.requestedAt, cutoff)))
    .orderBy(desc(schema.build.requestedAt))
    .limit(1);

  if (existingQueued) {
    return { buildId: existingQueued.id };
  }

  // 2. Insert new queued build
  const buildId = crypto.randomUUID();
  await db.insert(schema.build).values({
    id: buildId,
    status: 'queued',
    reason: req.reason,
    requestedBy: req.requestedBy ?? null,
    requestedAt: now,
  });

  // 3. Customer installs build through a Workers Builds Deploy Hook (D-002, D-010)
  const deployHook = await resolveDeployHook(env);
  if (deployHook) {
    await triggerDeployHook(db, buildId, deployHook);
    return { buildId };
  }

  // 4. Otherwise dispatch the GitHub workflow used by development installs
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = env.GITHUB_REPO?.trim();
  const workflow = env.GITHUB_DEPLOY_WORKFLOW?.trim() || 'deploy.yml';

  if (!token) {
    const errorMsg = 'Deploy Hook or GITHUB_DISPATCH_TOKEN is not configured';
    await db
      .update(schema.build)
      .set({
        status: 'failed',
        finishedAt: Date.now(),
        error: errorMsg,
      })
      .where(eq(schema.build.id, buildId));
    return { buildId };
  }

  if (!repo) {
    const errorMsg = 'GITHUB_REPO is not configured';
    await db
      .update(schema.build)
      .set({
        status: 'failed',
        finishedAt: Date.now(),
        error: errorMsg,
      })
      .where(eq(schema.build.id, buildId));
    return { buildId };
  }

  const dispatchUrl = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;

  try {
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'mossplan',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          build_id: buildId,
          reason: req.reason,
        },
      }),
    });

    if (!response.ok) {
      let details = '';
      try {
        const bodyText = await response.text();
        if (bodyText) {
          details = `: ${bodyText.slice(0, 300)}`;
        }
      } catch {
        // Ignore response body read failure
      }
      const errorMsg = `GitHub dispatch rejected with HTTP ${response.status}${details}`;
      await db
        .update(schema.build)
        .set({
          status: 'failed',
          finishedAt: Date.now(),
          error: errorMsg,
        })
        .where(eq(schema.build.id, buildId));
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.build)
      .set({
        status: 'failed',
        finishedAt: Date.now(),
        error: `GitHub dispatch network failure: ${errorMsg}`,
      })
      .where(eq(schema.build.id, buildId));
  }

  return { buildId };
}
