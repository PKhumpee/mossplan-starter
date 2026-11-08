import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { fail } from './respond';
import { InvalidJsonError } from './validate';
import type { AppEnv } from './types';

/**
 * Maps validation failures to 400 `VALIDATION_FAILED` and anything unexpected to 500 `INTERNAL`
 * without leaking details; the real error goes to the Worker log only.
 */
export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof ZodError) {
    const paths = [...new Set(err.issues.map((i) => i.path.join('.') || '(body)'))];
    return fail(c, 400, 'VALIDATION_FAILED', `ข้อมูลไม่ถูกต้อง: ${paths.join(', ')}`);
  }
  if (err instanceof InvalidJsonError) {
    return fail(c, 400, 'VALIDATION_FAILED', 'ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง');
  }
  if (err instanceof HTTPException && err.status < 500) {
    return fail(c, err.status as 400, 'HTTP_ERROR', err.message || 'คำขอไม่ถูกต้อง');
  }
  console.error('[api] unhandled error', err);
  return fail(c, 500, 'INTERNAL', 'เกิดข้อผิดพลาดภายในระบบ');
};

export const onNotFound: NotFoundHandler<AppEnv> = (c) =>
  fail(c, 404, 'NOT_FOUND', 'ไม่พบสิ่งที่ร้องขอ');
