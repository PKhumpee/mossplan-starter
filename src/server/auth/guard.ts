// Hono authentication and role guards (CONTRACTS §4).
import type { MiddlewareHandler } from 'hono';
import type { AppEnv, SessionUser } from '../http/types';
import { getAuth } from './better-auth';

/**
 * Middleware ensuring a valid session cookie exists. Sets `c.get('user')`.
 * Returns 401 UNAUTHENTICATED if missing or expired.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = await getAuth(c.env, c.req.url);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json(
      {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ',
        },
      },
      401,
    );
  }

  const role = (session.user as { role?: string }).role === 'admin' ? 'admin' : 'editor';
  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role,
  };

  c.set('user', user);
  await next();
};

/**
 * Middleware ensuring the authenticated user has the specified role.
 * Requires `requireSession` to run first. Returns 403 FORBIDDEN on mismatch.
 */
export function requireRole(requiredRole: 'admin' | 'editor'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json(
        {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ',
          },
        },
        401,
      );
    }

    if (requiredRole === 'admin' && user.role !== 'admin') {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดำเนินการนี้ได้',
          },
        },
        403,
      );
    }

    await next();
  };
}
