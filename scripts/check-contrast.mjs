#!/usr/bin/env node
// WCAG 2.x contrast check for Mossplan tokens. No dependencies.
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

// All foreground pairs are used for text, so all must meet AA 4.5:1.
const pairs = [];
for (const fg of ['text', 'muted', 'primary', 'secondary'])
  for (const bg of ['bg', 'surface']) pairs.push([fg, bg]);

let failed = 0;
for (const [theme, c] of Object.entries(tokens.color)) {
  console.log(`\n${theme}`);
  for (const [fg, bg] of pairs) {
    const r = ratio(c[fg], c[bg]);
    const ok = r >= 4.5;
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${fg}/${bg}  ${c[fg]} on ${c[bg]}  ${r.toFixed(2)}:1`);
  }
}
console.log(failed ? `\n${failed} pair(s) below 4.5:1` : '\nAll text pairs meet WCAG AA (4.5:1)');
process.exit(failed ? 1 : 0);
