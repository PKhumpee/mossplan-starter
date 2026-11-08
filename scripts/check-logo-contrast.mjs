#!/usr/bin/env node
// WCAG 2.1 contrast checks for Mossplan Logo and Graphics (SC 1.4.11 Non-text Contrast >= 3:1, SC 1.4.3 Text >= 4.5:1)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(n.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failed = 0;

console.log('=== Mossplan Logo & Graphics Contrast Verification ===\n');

for (const theme of ['light', 'dark']) {
  const c = tokens.color[theme];
  console.log(`[${theme.toUpperCase()} THEME]`);

  const tests = [
    // WCAG 1.4.11 Non-text contrast (graphics >= 3.0:1)
    {
      type: 'GRAPHIC (1.4.11)',
      name: 'Logo Mark (primary) on Background (bg)',
      fg: c.primary,
      bg: c.bg,
      min: 3.0,
    },
    {
      type: 'GRAPHIC (1.4.11)',
      name: 'Logo Mark (primary) on Card Surface',
      fg: c.primary,
      bg: c.surface,
      min: 3.0,
    },
    {
      type: 'GRAPHIC (1.4.11)',
      name: 'Logo Mark (primary) vs Inactive Grid Cell',
      fg: c.primary,
      bg: c.grid,
      min: 3.0,
    },
    {
      type: 'GRAPHIC (1.4.11)',
      name: 'Mossbit Body (primary) on Background (bg)',
      fg: c.primary,
      bg: c.bg,
      min: 3.0,
    },
    {
      type: 'GRAPHIC (1.4.11)',
      name: 'Mossbit Body (primary) on Card Surface',
      fg: c.primary,
      bg: c.surface,
      min: 3.0,
    },
    {
      type: 'GRAPHIC (1.4.11)',
      name: 'Mossbit Eye/Feature on Body (primary)',
      fg: theme === 'light' ? tokens.color.light.surface : tokens.color.dark.bg,
      bg: c.primary,
      min: 3.0,
    },
    // WCAG 1.4.3 Contrast (text >= 4.5:1)
    {
      type: 'TEXT (1.4.3)',
      name: 'Wordmark "mossplan" on Background (bg)',
      fg: c.text,
      bg: c.bg,
      min: 4.5,
    },
    {
      type: 'TEXT (1.4.3)',
      name: 'Wordmark "mossplan" on Card Surface',
      fg: c.text,
      bg: c.surface,
      min: 4.5,
    },
  ];

  for (const t of tests) {
    const r = ratio(t.fg, t.bg);
    const pass = r >= t.min;
    if (!pass) failed++;
    const status = pass ? 'PASS' : 'FAIL';
    console.log(
      `  ${status}  [${t.type}] ${t.name}\n` +
        `        ${t.fg} on ${t.bg} -> ${r.toFixed(2)}:1 (required >= ${t.min}:1)`,
    );
  }
  console.log('');
}

if (failed === 0) {
  console.log('All logo, mark, wordmark, and mascot graphics pass WCAG contrast requirements!\n');
} else {
  console.error(`${failed} contrast check(s) failed!\n`);
}

process.exit(failed ? 1 : 0);
