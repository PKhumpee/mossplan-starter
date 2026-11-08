// RFC 9116 security.txt generator (CONTRACTS §2a, DESIGN §11.3, T17).
// Writes dist/client/.well-known/security.txt during pnpm build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSiteConfig } from './lib/site';
import { siteFrom } from '../src/shared/site';

function generateSecurityTxt(): void {
  const siteConfig = readSiteConfig();
  const site = siteFrom(siteConfig);

  const outDir = resolve(process.cwd(), 'dist/client/.well-known');
  mkdirSync(outDir, { recursive: true });

  // Expires 1 year from now
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const content = `# Security Contact Information (RFC 9116)
Contact: mailto:${site.securityEmail}
Expires: ${expires}
Preferred-Languages: th, en
Canonical: ${site.url}/.well-known/security.txt
Policy: ${site.url}/editorial-policy/
`;

  writeFileSync(resolve(outDir, 'security.txt'), content, 'utf8');
  console.log(`[well-known] wrote .well-known/security.txt for ${site.url}`);
}

try {
  generateSecurityTxt();
} catch (err) {
  console.error('[well-known] error generating security.txt:', err);
  process.exit(1);
}
