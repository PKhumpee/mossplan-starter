/// <reference types="astro/client" />

/** Injected by `astro.config.ts` (Vite `define`); read it through `buildSite()` in `src/shared/site.ts`. */
declare const __SITE_CONFIG__: { SITE_URL: string; PUBLIC_NOINDEX: string };

/** Injected by `astro.config.ts` (Vite `define`); read it through `getSnapshot()` in `src/lib/content/queries.ts`. */
declare const __SNAPSHOT__: import('./shared/snapshot').Snapshot;

declare namespace App {
  interface Locals {
    /** Set by `src/middleware.ts` (T06). `null` when signed out. */
    user: { id: string; email: string; name: string; role: 'admin' | 'editor' } | null;
  }
}
