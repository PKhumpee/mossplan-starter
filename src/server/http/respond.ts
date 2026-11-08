import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Success envelope: `{ "data": … }` (AGENTS.md conventions, CONTRACTS §5). */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data }, status);
}

/** Failure envelope: `{ "error": { "code", "message" } }`. `code` is SCREAMING_SNAKE. */
export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

/** Handler for route stubs that owners have not filled in yet. */
export function notImplemented(c: Context) {
  return fail(c, 501, 'NOT_IMPLEMENTED', 'ฟังก์ชันนี้ยังไม่พร้อมใช้งาน');
}
