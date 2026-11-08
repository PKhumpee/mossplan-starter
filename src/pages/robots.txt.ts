// Robots.txt generator (DESIGN §11.3, CONTRACTS §2a, D27, D37, T14).
// Prerendered static text file. Respects PUBLIC_NOINDEX and disallows AI training bots.
import type { APIRoute } from 'astro';
import { buildSite } from '../shared/site';

export const prerender = true;

export const AI_TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'CCBot',
  'Bytespider',
];

export const GET: APIRoute = () => {
  const site = buildSite();

  const aiBotsDisallow = AI_TRAINING_BOTS.map((bot) => `User-agent: ${bot}`).join('\n');

  const content = `# Search engines and AI search / user-triggered fetchers: allowed
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /go/

# AI model training: not allowed
${aiBotsDisallow}
Disallow: /

Sitemap: ${site.url}/sitemap-index.xml
`;

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
