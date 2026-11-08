import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logoDir = join(root, 'design/logo');
const mossbitDir = join(root, 'design/mossbit');

mkdirSync(logoDir, { recursive: true });
mkdirSync(mossbitDir, { recursive: true });

// Load brand tokens dynamically from design/tokens.json
const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));

// -------------------------------------------------------------
// 1. Mark SVG (Option B - Primary: Downward V Chevron in center)
// -------------------------------------------------------------
function generateMarkSvg(theme, option = 'B') {
  const c = tokens.color[theme];
  const primary = c.primary;
  const grid = c.grid;

  let centerCell;
  if (option === 'A') {
    // Option A: Canonical 7-cell (equal rounded squares)
    centerCell = `<rect x="24" y="24" width="20" height="20" rx="6" fill="${primary}" />`;
  } else {
    // Option B: Directional downward V chevron in center
    // Cell background is grid, with primary downward chevron
    centerCell = `
    <!-- Center Cell (1,1): Directional V downward to read as M -->
    <rect x="24" y="24" width="20" height="20" rx="6" fill="${grid}" />
    <clipPath id="center-clip-${theme}">
      <rect x="24" y="24" width="20" height="20" rx="6" />
    </clipPath>
    <path d="M 24 24 L 34 34 L 44 24 L 44 29 L 34 44 L 24 29 Z" fill="${primary}" clip-path="url(#center-clip-${theme})" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="68" height="68" fill="none">
  <!-- Mossplan Mark 3x3 Grid (Theme: ${theme}, Option: ${option}) -->
  <!-- Row 0 -->
  <rect x="0" y="0" width="20" height="20" rx="6" fill="${primary}" />
  <rect x="24" y="0" width="20" height="20" rx="6" fill="${grid}" />
  <rect x="48" y="0" width="20" height="20" rx="6" fill="${primary}" />

  <!-- Row 1 -->
  <rect x="0" y="24" width="20" height="20" rx="6" fill="${primary}" />
  ${centerCell}
  <rect x="48" y="24" width="20" height="20" rx="6" fill="${primary}" />

  <!-- Row 2 -->
  <rect x="0" y="48" width="20" height="20" rx="6" fill="${primary}" />
  <rect x="24" y="48" width="20" height="20" rx="6" fill="${grid}" />
  <rect x="48" y="48" width="20" height="20" rx="6" fill="${primary}" />
</svg>`;
}

// -------------------------------------------------------------
// 2. Full Logo SVG (Mark + "mossplan" mono wordmark)
// -------------------------------------------------------------
function generateLogoSvg(theme, option = 'B') {
  const c = tokens.color[theme];
  const primary = c.primary;
  const grid = c.grid;
  const text = c.text;

  let centerCell;
  if (option === 'A') {
    centerCell = `<rect x="24" y="24" width="20" height="20" rx="6" fill="${primary}" />`;
  } else {
    centerCell = `
    <rect x="24" y="24" width="20" height="20" rx="6" fill="${grid}" />
    <clipPath id="logo-center-clip-${theme}">
      <rect x="24" y="24" width="20" height="20" rx="6" />
    </clipPath>
    <path d="M 24 24 L 34 34 L 44 24 L 44 29 L 34 44 L 24 29 Z" fill="${primary}" clip-path="url(#logo-center-clip-${theme})" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 68" width="256" height="68" fill="none">
  <!-- Mossplan Logo (Theme: ${theme}, Option: ${option}) -->
  <g id="mark">
    <!-- Row 0 -->
    <rect x="0" y="0" width="20" height="20" rx="6" fill="${primary}" />
    <rect x="24" y="0" width="20" height="20" rx="6" fill="${grid}" />
    <rect x="48" y="0" width="20" height="20" rx="6" fill="${primary}" />

    <!-- Row 1 -->
    <rect x="0" y="24" width="20" height="20" rx="6" fill="${primary}" />
    ${centerCell}
    <rect x="48" y="24" width="20" height="20" rx="6" fill="${primary}" />

    <!-- Row 2 -->
    <rect x="0" y="48" width="20" height="20" rx="6" fill="${primary}" />
    <rect x="24" y="48" width="20" height="20" rx="6" fill="${grid}" />
    <rect x="48" y="48" width="20" height="20" rx="6" fill="${primary}" />
  </g>

  <!-- Wordmark "mossplan" lowercase JetBrains Mono -->
  <text x="86" y="45" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="33" font-weight="600" fill="${text}" letter-spacing="-0.5px">mossplan</text>
</svg>`;
}

// -------------------------------------------------------------
// 3. Favicon SVG (16x16 Pixel-Aligned, Adaptive light/dark)
// -------------------------------------------------------------
function generateFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none">
  <!-- Mossplan Favicon 16x16 (Pixel-aligned, stepped V chevron) -->
  <style>
    :root {
      --fav-primary: ${tokens.color.light.primary};
      --fav-grid: ${tokens.color.light.grid};
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --fav-primary: ${tokens.color.dark.primary};
        --fav-grid: ${tokens.color.dark.grid};
      }
    }
  </style>

  <!-- Row 0 -->
  <rect x="1" y="1" width="4" height="4" rx="1" fill="var(--fav-primary)" />
  <rect x="6" y="1" width="4" height="4" rx="1" fill="var(--fav-grid)" />
  <rect x="11" y="1" width="4" height="4" rx="1" fill="var(--fav-primary)" />

  <!-- Row 1 -->
  <rect x="1" y="6" width="4" height="4" rx="1" fill="var(--fav-primary)" />
  
  <!-- Center Cell (1,1): 4x4 with stepped downward V -->
  <rect x="6" y="6" width="4" height="4" rx="1" fill="var(--fav-grid)" />
  <!-- Stepped V pixel alignment (100% integer coords, no blur) -->
  <rect x="6" y="6" width="1" height="1" fill="var(--fav-primary)" />
  <rect x="9" y="6" width="1" height="1" fill="var(--fav-primary)" />
  <rect x="7" y="7" width="2" height="2" fill="var(--fav-primary)" />

  <rect x="11" y="6" width="4" height="4" rx="1" fill="var(--fav-primary)" />

  <!-- Row 2 -->
  <rect x="1" y="11" width="4" height="4" rx="1" fill="var(--fav-primary)" />
  <rect x="6" y="11" width="4" height="4" rx="1" fill="var(--fav-grid)" />
  <rect x="11" y="11" width="4" height="4" rx="1" fill="var(--fav-primary)" />
</svg>`;
}

// -------------------------------------------------------------
// 4. Mossbit 8x8 Mascot SVGs (Normal & 404)
// -------------------------------------------------------------
// Matrix definitions (8 rows x 8 cols)
// . = transparent, B = body, E = eye/mouth, A = accent (sprout/sweat)
const mossbitNormalMatrix = [
  '..AA....', // 0: sprout leaf
  '..B.....', // 1: sprout stem
  '.BBBBBB.', // 2: head top
  'BBBBBBBB', // 3: head upper
  'BBEBBEBB', // 4: eyes
  'BBBBBBBB', // 5: cheek
  '.BEEEEE.', // 6: cute small mouth / smile
  '.BB..BB.', // 7: little feet
];

const mossbit404Matrix = [
  '........', // 0: no top sprout
  '..BA....', // 1: drooped sprout
  '.BBBBBB.', // 2: head top
  'BBBBBBBA', // 3: A = sweat drop!
  'BEEB.EBB', // 4: confused eyes (left squint '—', right open 'o')
  'BBBEEBBB', // 5: open 'o' mouth
  '.BBBBBB.', // 6: body lower
  '.BB..BB.', // 7: little feet
];

function generateMossbitSvg(matrix, title) {
  let rects = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const ch = matrix[y][x];
      if (ch === '.') continue;
      let cls = 'b';
      if (ch === 'E') cls = 'e';
      if (ch === 'A') cls = 'a';
      rects += `    <rect class="${cls}" x="${x}" y="${y}" width="1" height="1" />\n`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="64" height="64" shape-rendering="crispEdges">
  <!-- Mossbit 8x8 (${title}) -->
  <style>
    .b { fill: ${tokens.color.dark.primary}; }
    .e { fill: ${tokens.color.light.text}; }
    .a { fill: ${tokens.color.dark.secondary}; }
    @media (prefers-color-scheme: light) {
      .b { fill: ${tokens.color.light.primary}; }
      .e { fill: ${tokens.color.light.text}; }
      .a { fill: ${tokens.color.light.secondary}; }
    }
    @media (prefers-color-scheme: dark) {
      .b { fill: ${tokens.color.dark.primary}; }
      .e { fill: ${tokens.color.dark.bg}; }
      .a { fill: ${tokens.color.dark.secondary}; }
    }
  </style>
  <g>
${rects.trimEnd()}
  </g>
</svg>`;
}

// -------------------------------------------------------------
// 5. CLI Text Assets
// -------------------------------------------------------------
// logo.txt: <= 20 columns width, using █ and spaces
const logoTxt = `██    ██  mossplan
██ \\/ ██
██    ██
`;

// mossbit.txt: CLI pixel art
const mossbitTxt = `Mossbit (CLI Mascot)
Accent: ${tokens.cli.accent}

[Normal]
      ████      
      ██        
  ████████████  
████████████████
████  ████  ████
████████████████
  ██        ██  
  ████    ████  

[404 Not Found]
      ████      
  ████████████  
██████████████  
██    ██  ████  
██████    ████  
████████████████
  ████████████  
  ████    ████  
`;

// Write all assets
writeFileSync(join(logoDir, 'mark-light.svg'), generateMarkSvg('light', 'B'));
writeFileSync(join(logoDir, 'mark-dark.svg'), generateMarkSvg('dark', 'B'));
writeFileSync(join(logoDir, 'logo-light.svg'), generateLogoSvg('light', 'B'));
writeFileSync(join(logoDir, 'logo-dark.svg'), generateLogoSvg('dark', 'B'));
writeFileSync(join(logoDir, 'favicon.svg'), generateFaviconSvg());
writeFileSync(join(logoDir, 'logo.txt'), logoTxt);

writeFileSync(join(mossbitDir, 'mossbit.svg'), generateMossbitSvg(mossbitNormalMatrix, 'Normal'));
writeFileSync(
  join(mossbitDir, 'mossbit-404.svg'),
  generateMossbitSvg(mossbit404Matrix, '404 Not Found'),
);
writeFileSync(join(mossbitDir, 'mossbit.txt'), mossbitTxt);

console.log('Successfully generated all logo and mossbit assets!');
