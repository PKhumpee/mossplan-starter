async function setupCompleted(db: D1Database): Promise<boolean> {
  const setup = await db
    .prepare('SELECT setup_completed_at FROM site_settings WHERE id = 1')
    .first<{ setup_completed_at: number | null }>();
  return setup?.setup_completed_at != null;
}

/** Stops setup rendering when setup is complete or its state cannot be verified. */
export async function setupPageGuard(db?: D1Database): Promise<Response | null> {
  if (!db) return unavailable();
  try {
    return (await setupCompleted(db))
      ? new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      : null;
  } catch {
    return unavailable();
  }
}

/** True only when the database confirms setup is unfinished, so an outage keeps the login redirect. */
export async function setupIsPending(db?: D1Database): Promise<boolean> {
  if (!db) return false;
  try {
    return !(await setupCompleted(db));
  } catch {
    return false;
  }
}

function unavailable(): Response {
  return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
