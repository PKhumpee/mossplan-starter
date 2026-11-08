import type { Db } from './client';
import { auditLog } from './schema';

export interface AuditEntry {
  actorId: string | null;
  /** `<entity>.<verb>`, e.g. `article.publish`, `team.invite`. */
  action: string;
  targetType: string;
  targetId?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metaJson: entry.meta === undefined ? null : JSON.stringify(entry.meta),
    createdAt: Date.now(),
  });
}
