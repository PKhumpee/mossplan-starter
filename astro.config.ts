import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { readSiteConfig } from './scripts/lib/site';
import { loadSnapshot } from './src/lib/content/loader';
import { findMatchingRedirect } from './src/shared/redirects';
import { isSitemapUrl } from './src/lib/seo/sitemap';

const siteConfig = readSiteConfig();
const snapshot = loadSnapshot();

export default defineConfig({
  site: 'https://moss-origin.invalid',
  // Public pages are prerendered by default; only /admin/* and /api/* opt out (AGENTS.md invariants).
  output: 'static',
  trailingSlash: 'always',
  // Images are optimized at build time with sharp (D9); no runtime Images binding.
  adapter: cloudflare({ imageService: 'compile' }),
  // Sessions would provision a KV namespace; the CMS uses Better Auth + D1 instead.
  session: false,
  integrations: [
    vue(),
    sitemap({
      filter: (page) => {
        return isSitemapUrl(new URL(page).pathname);
      },
    }),
  ],
  vite: {
    plugins: [
      {
        // Dev only: Astro's dev server 404s slashless URLs under trailingSlash 'always', but API clients
        // call /api/admin/articles. In production src/worker.ts hands /api straight to Hono.
        name: 'api-trailing-slash',
        enforce: 'post',
        configureServer(server) {
          // Astro puts its own trailing-slash check at the front of the stack in a post hook; this runs
          // after it (enforce: 'post') and goes in front of it.
          return () => {
            server.middlewares.stack.unshift({
              route: '',
              handle: (
                req: { url?: string },
                res: {
                  writeHead?: (status: number, headers: Record<string, string>) => void;
                  end?: () => void;
                },
                next: () => void,
              ) => {
                const [path = '', query] = (req.url ?? '').split('?');
                if (path.startsWith('/api/') && !path.endsWith('/')) {
                  req.url = query === undefined ? `${path}/` : `${path}/?${query}`;
                }

                // Dev only: 301 redirect matching snapshot rules (CONTRACTS §3, D30)
                const redirectTarget = findMatchingRedirect(path, snapshot.redirects);
                if (
                  redirectTarget &&
                  typeof res?.writeHead === 'function' &&
                  typeof res?.end === 'function'
                ) {
                  const targetUrl = query ? `${redirectTarget}?${query}` : redirectTarget;
                  res.writeHead(301, { Location: targetUrl });
                  res.end();
                  return;
                }

                next();
              },
            });
          };
        },
      },
      tailwindcss(),
    ],
    define: {
      // Prerendering may run inside workerd, which cannot read files; `buildSite()` and `getSnapshot()` read this.
      __SITE_CONFIG__: JSON.stringify(siteConfig),
      __SNAPSHOT__: JSON.stringify(snapshot),
    },
  },
});
