#!/usr/bin/env node
// Generates CSS from design/tokens.json (D-007). No dependencies.
//
//   node scripts/build-tokens.mjs           write design/tokens.css and design/tokens.tailwind.css
//   node scripts/build-tokens.mjs --check   exit 1 if the committed files are out of date
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function render(tokens) {
  const { light, dark } = tokens.color;
  const colorVars = (c, indent) =>
    Object.entries(c)
      .map(([k, v]) => `${indent}--moss-${k}: ${v};`)
      .join('\n');

  const base = [
    `  color-scheme: ${tokens.defaultTheme};`,
    colorVars(light, '  '),
    '',
    `  --moss-font-sans: ${tokens.font.sans};`,
    `  --moss-font-mono: ${tokens.font.mono};`,
    '',
    Object.entries(tokens.space)
      .map(([k, v]) => `  --moss-space-${k}: ${v};`)
      .join('\n'),
    `  --moss-radius: ${tokens.radius.base};`,
  ].join('\n');

  const css = `/* Mossplan design tokens. Generated from design/tokens.json by scripts/build-tokens.mjs; do not edit. */
:root {
${base}
}

[data-theme="dark"] {
  color-scheme: dark;
${colorVars(dark, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${colorVars(dark, '    ')}
  }
}
`;

  // Tailwind 4 theme that points utilities at the runtime variables, so the
  // dark theme switches without rebuilding classes. Import after tokens.css.
  const tailwind = `/* Tailwind 4 theme for Mossplan. Generated from design/tokens.json by scripts/build-tokens.mjs; do not edit. */
@theme inline {
${Object.keys(light)
  .map((k) => `  --color-moss-${k}: var(--moss-${k});`)
  .join('\n')}
  --font-sans: var(--moss-font-sans);
  --font-mono: var(--moss-font-mono);
  --radius-moss: var(--moss-radius);
${Object.keys(tokens.space)
  .map((k) => `  --spacing-moss-${k}: var(--moss-space-${k});`)
  .join('\n')}
}
`;
  return { 'design/tokens.css': css, 'design/tokens.tailwind.css': tailwind };
}

function main(argv) {
  const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
  const outputs = render(tokens);
  const check = argv.includes('--check');
  let stale = 0;
  for (const [path, body] of Object.entries(outputs)) {
    const full = join(root, path);
    const current = existsSync(full) ? readFileSync(full, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === body) continue;
    if (check) {
      stale++;
      console.log(`out of date: ${path}`);
    } else {
      writeFileSync(full, body);
      console.log(`wrote ${path}`);
    }
  }
  if (check) console.log(stale ? 'Run: node scripts/build-tokens.mjs' : 'Token CSS is up to date');
  return stale ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
