// Marks builds that never reported a result as failed. A Workers Build that fails cannot report
// back, so without this its row would stay `running` and the admin badge would poll forever.
import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';

/** Workers Builds terminates a build at 20 minutes on every plan, so 45 cannot cut one short. */
export const STALE_BUILD_MS = 45 * 60 * 1000;

const STALE_ERROR =
  'No build result received within 45 minutes. Check the build log in Cloudflare.';

export async function run(env: Env, nowMs: number = Date.now()): Promise<void> {
  const db = getDb(env);
  const cutoff = nowMs - STALE_BUILD_MS;
  const failed = { status: 'failed', finishedAt: nowMs, error: STALE_ERROR } as const;

  await db
    .update(schema.build)
    .set(failed)
    .where(and(eq(schema.build.status, 'running'), lt(schema.build.startedAt, cutoff)));
  await db
    .update(schema.build)
    .set(failed)
    .where(and(eq(schema.build.status, 'queued'), lt(schema.build.requestedAt, cutoff)));
}
