// Scheduled publishing job (CONTRACTS §3, §5, §8, T12).
// Runs every 5 minutes (crons: */5 * * * *).
// Promotes due `scheduled` articles to `published` after verifying publish rules.
// If any rule fails, the article stays `scheduled`, with the failure recorded in the audit log.
// Triggers at most one `requestBuild` per run.
import { and, asc, eq, lte } from 'drizzle-orm';
import policyConfig from '../../../config/content-policy.json';
import { recordAudit } from '../db/audit';
import { getDb } from '../db/client';
import { isProfileComplete } from '../db/profile';
import * as schema from '../db/schema';
import type { Env } from '../env';
import { requestBuild } from '../services/builds';

function extractAllText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  let str = n.text || '';
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      str += ' ' + extractAllText(child);
    }
  }
  return str;
}

function containsBlockedDomain(doc: unknown, blockedDomains: string[]): boolean {
  if (!blockedDomains || !blockedDomains.length) return false;
  const urls: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as {
      marks?: Array<{ type?: string; attrs?: { href?: string } }>;
      content?: unknown[];
    };
    if (Array.isArray(n.marks)) {
      for (const m of n.marks) {
        if (m?.type === 'link' && m.attrs?.href) urls.push(String(m.attrs.href));
      }
    }
    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
  }

  walk(doc);

  for (const urlStr of urls) {
    try {
      const hostname = new URL(urlStr).hostname.toLowerCase();
      for (const blocked of blockedDomains) {
        const b = blocked.toLowerCase().trim();
        if (b && (hostname === b || hostname.endsWith('.' + b))) {
          return true;
        }
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return false;
}

function containsReviewTerms(text: string, reviewTerms: string[]): boolean {
  if (!reviewTerms || !reviewTerms.length) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');

  for (const term of reviewTerms) {
    const t = term.toLowerCase().trim().replace(/\s+/g, ' ');
    if (t && normalized.includes(t)) {
      return true;
    }
  }
  return false;
}

export async function publishScheduledArticles(
  env: Env,
): Promise<{ promoted: number; failed: number }> {
  console.log('[jobs] publish-scheduled ran');
  const db = getDb(env);
  const now = Date.now();

  // 1. Query articles scheduled for publication whose time has passed
  const dueArticles = await db
    .select()
    .from(schema.article)
    .where(and(eq(schema.article.status, 'scheduled'), lte(schema.article.publishedAt, now)))
    .orderBy(asc(schema.article.publishedAt));

  if (dueArticles.length === 0) {
    return { promoted: 0, failed: 0 };
  }

  let promotedCount = 0;
  let failedCount = 0;

  for (const art of dueArticles) {
    // 2. Re-check Rule 1: Author profile completeness
    const [author] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, art.authorId))
      .limit(1);

    if (!author || !isProfileComplete(author)) {
      failedCount++;
      await recordAudit(db, {
        actorId: null,
        action: 'article.publish_failed',
        targetType: 'article',
        targetId: art.id,
        meta: {
          code: 'AUTHOR_PROFILE_INCOMPLETE',
          reason: 'โปรไฟล์ผู้เขียนยังไม่สมบูรณ์',
          authorId: art.authorId,
        },
      });
      continue;
    }

    // Parse article content
    let parsedContent: unknown = null;
    try {
      parsedContent = JSON.parse(art.contentJson);
    } catch {
      parsedContent = null;
    }

    // 3. Re-check Rule 2: Blocked domains
    if (containsBlockedDomain(parsedContent, policyConfig.blockedDomains || [])) {
      failedCount++;
      await recordAudit(db, {
        actorId: null,
        action: 'article.publish_failed',
        targetType: 'article',
        targetId: art.id,
        meta: {
          code: 'CONTENT_BLOCKED',
          reason: 'เนื้อหามีลิงก์ไปยังเว็บไซต์ที่ละเมิดนโยบายความปลอดภัย',
        },
      });
      continue;
    }

    // 4. Re-check Rule 3: Review terms
    const combinedText = `${art.title} ${art.excerpt} ${extractAllText(parsedContent)}`;
    if (containsReviewTerms(combinedText, policyConfig.reviewTerms || []) && !art.reviewedBy) {
      failedCount++;
      await recordAudit(db, {
        actorId: null,
        action: 'article.publish_failed',
        targetType: 'article',
        targetId: art.id,
        meta: {
          code: 'REVIEW_REQUIRED',
          reason: 'บทความนี้มีเนื้อหาที่ต้องผ่านการตรวจทานก่อนเผยแพร่',
        },
      });
      continue;
    }

    // 5. All rules passed: promote to published
    const contentModifiedAt = art.contentModifiedAt ?? art.publishedAt ?? now;

    await db
      .update(schema.article)
      .set({
        status: 'published',
        contentModifiedAt,
        updatedAt: now,
      })
      .where(eq(schema.article.id, art.id));

    await recordAudit(db, {
      actorId: null,
      action: 'article.publish',
      targetType: 'article',
      targetId: art.id,
      meta: {
        trigger: 'scheduled',
        publishedAt: art.publishedAt,
      },
    });

    promotedCount++;
  }

  // 6. Request build once if any articles were promoted
  if (promotedCount > 0) {
    await requestBuild(env, {
      reason: 'job.publish-scheduled',
    });
  }

  return { promoted: promotedCount, failed: failedCount };
}

export async function run(env: Env): Promise<void> {
  await publishScheduledArticles(env);
}
