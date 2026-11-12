// Astro middleware (CONTRACTS §4, D34): session verification, /admin/* redirect guard,
// Cloudflare Access assertion validation, and X-Robots-Tag: noindex header.
import { defineMiddleware } from 'astro:middleware';
import { env as workersEnv } from 'cloudflare:workers';
import { getAuth } from './server/auth/better-auth';
import { verifyAccessJwt } from './server/auth/access';
import { sanitizeNextUrl } from './server/http/next-url';
import { applySecurityHeaders } from './server/http/security';
import { setupIsPending, setupPageGuard } from './server/http/setup-page-guard';
import type { Env } from './server/env';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;
  const isSetupPage = pathname === '/admin/setup' || pathname === '/admin/setup/';
  const runtimeEnv =
    (workersEnv as unknown as Env | undefined) ??
    (context.locals as { runtime?: { env?: Env } }).runtime?.env;

  if (isSetupPage) {
    // src/worker.ts completes migrations before Astro middleware runs on the first Worker request.
    const guardResponse = await setupPageGuard(runtimeEnv?.DB);
    if (guardResponse) return guardResponse;
  }

  // 1. Cloudflare Access Zero Trust verification (when configured, D34)
  if (runtimeEnv?.CF_ACCESS_AUD && runtimeEnv?.CF_ACCESS_TEAM_DOMAIN) {
    const isProtectedPath =
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api/admin') ||
      pathname.startsWith('/api/auth');

    if (isProtectedPath && !isSetupPage) {
      const assertion = context.request.headers.get('cf-access-jwt-assertion');
      const payload = await verifyAccessJwt(
        assertion,
        runtimeEnv.CF_ACCESS_TEAM_DOMAIN,
        runtimeEnv.CF_ACCESS_AUD,
      );

      if (!payload) {
        if (pathname.startsWith('/api/')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'ACCESS_REQUIRED',
                message: 'Cloudflare Access authentication required',
              },
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('403 Cloudflare Access authentication required', { status: 403 });
      }
    }
  }

  // 2. Session verification via Better Auth
  let sessionUser: {
    id: string;
    email: string;
    name: string;
    role: 'owner' | 'admin' | 'editor';
  } | null = null;

  if (runtimeEnv) {
    try {
      const auth = await getAuth(runtimeEnv, context.request.url);
      const session = await auth.api.getSession({
        headers: context.request.headers,
      });

      if (session) {
        sessionUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role:
            (session.user as { role?: string }).role === 'owner'
              ? 'owner'
              : (session.user as { role?: string }).role === 'admin'
                ? 'admin'
                : 'editor',
        };
      }
    } catch (err) {
      console.error('[middleware] session check error:', err);
    }
  }

  context.locals.user = sessionUser;

  // 3. /admin/* route protection
  const isAdminRoute = pathname.startsWith('/admin');
  const isLoginPage = pathname === '/admin/login' || pathname === '/admin/login/';

  if (isAdminRoute && !isSetupPage) {
    if (!sessionUser && !isLoginPage) {
      // No one can sign in until setup has created the first administrator.
      if (await setupIsPending(runtimeEnv?.DB)) return context.redirect('/admin/setup/', 302);

      // Unauthenticated user requesting protected admin page: redirect to login
      const nextParam = encodeURIComponent(pathname + url.search);
      return context.redirect(`/admin/login/?next=${nextParam}`, 302);
    }

    if (sessionUser && isLoginPage) {
      // Already authenticated user visiting login page: redirect to destination
      const nextParam = url.searchParams.get('next');
      return context.redirect(sanitizeNextUrl(nextParam, url.origin), 302);
    }
  }

  // 4. Execute request
  const response = await next();

  // 5. Ensure X-Robots-Tag: noindex and security headers on /admin/* responses
  if (isAdminRoute) {
    response.headers.set('X-Robots-Tag', 'noindex');
    // CSP (with nonce) and HSTS are finalized in src/worker.ts (finalizeSecurity).
    applySecurityHeaders(response.headers, {
      isAdmin: true,
      requestUrl: context.request.url,
      env: runtimeEnv,
    });
  }

  return response;
});
