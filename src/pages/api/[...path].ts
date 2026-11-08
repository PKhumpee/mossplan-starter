import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { app } from '../../server/app';
import type { Env } from '../../server/env';

// SSR on purpose: the API is never prerendered (AGENTS.md invariants).
export const prerender = false;

export const ALL: APIRoute = ({ request, locals }) =>
  app.fetch(request, env as unknown as Env, locals.cfContext);
