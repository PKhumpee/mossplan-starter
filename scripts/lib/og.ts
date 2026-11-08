// Open Graph image renderer (S4 verdict, T14).
// Uses Satori (>= 0.33 with HarfBuzz shaping) and @resvg/resvg-js at build time.
// Breaks titles only between grapheme clusters so Thai vowels and tone marks stay attached.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

const fontsDir = resolve(process.cwd(), 'scripts/lib/fonts');
const designTokens = JSON.parse(
  readFileSync(resolve(process.cwd(), 'design/tokens.json'), 'utf8'),
) as { color: { light: Record<string, string> } };
const colors = designTokens.color.light;

const fonts = [
  {
    name: 'Noto Sans Thai',
    weight: 700 as const,
    style: 'normal' as const,
    data: readFileSync(resolve(fontsDir, 'fs-noto-sans-thai-thai-700.ttf')),
  },
  {
    name: 'Noto Sans Thai Latin',
    weight: 700 as const,
    style: 'normal' as const,
    data: readFileSync(resolve(fontsDir, 'fs-noto-sans-thai-latin-700.ttf')),
  },
  {
    name: 'Noto Sans Thai',
    weight: 400 as const,
    style: 'normal' as const,
    data: readFileSync(resolve(fontsDir, 'fs-noto-sans-thai-thai-400.ttf')),
  },
  {
    name: 'Noto Sans Thai Latin',
    weight: 400 as const,
    style: 'normal' as const,
    data: readFileSync(resolve(fontsDir, 'fs-noto-sans-thai-latin-400.ttf')),
  },
];

// Insert U+200B only between grapheme clusters when a caller needs soft wrap points.
const graphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });

export function breakThai(text: string): string {
  return [...graphemeSegmenter.segment(text)].map(({ segment }) => segment).join('\u200B');
}

export function wrapThaiTitle(text: string, maxClusters = 28): string {
  const lines: string[] = [];
  let line = '';
  let lineLength = 0;
  let pendingSpace = false;
  const flush = () => {
    if (line) lines.push(line);
    line = '';
    lineLength = 0;
  };

  for (const { segment, isWordLike } of wordSegmenter.segment(text)) {
    if (/^\s+$/u.test(segment)) {
      pendingSpace = Boolean(line);
      continue;
    }

    const clusters = [...graphemeSegmenter.segment(segment)].map(({ segment: part }) => part);
    if (isWordLike && clusters.length > maxClusters) {
      flush();
      for (let i = 0; i < clusters.length; i += maxClusters) {
        const fragment = clusters.slice(i, i + maxClusters).join('');
        if (i + maxClusters < clusters.length) lines.push(fragment);
        else {
          line = fragment;
          lineLength = Math.min(maxClusters, clusters.length - i);
        }
      }
      pendingSpace = false;
      continue;
    }

    const separator = pendingSpace && line ? ' ' : '';
    if (line && lineLength + (separator ? 1 : 0) + clusters.length > maxClusters) {
      flush();
    }
    if (pendingSpace && line) {
      line += ' ';
      lineLength++;
    }
    line += segment;
    lineLength += clusters.length;
    pendingSpace = false;
  }
  flush();
  return lines.join('\n');
}

export interface OgCardOptions {
  title: string;
  siteName: string;
  category?: string;
  author?: string;
  date?: string;
}

export async function renderOgCard(options: OgCardOptions): Promise<Uint8Array> {
  const { title, siteName, category, author, date } = options;
  const titleLines = wrapThaiTitle(title);
  const lineCount = titleLines.split('\n').length;
  const titleFontSize = Math.max(1, Math.min(60, Math.floor(220 / (lineCount * 1.35))));

  const cardElement: any = {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 80px',
        backgroundColor: colors.bg,
        fontFamily: "'Noto Sans Thai', 'Noto Sans Thai Latin'",
        color: colors.text,
      },
      children: [
        // Faint 3x3 grid motif with moss-coloured cells in the upper-right corner.
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              right: '48px',
              top: '40px',
              width: '180px',
              height: '180px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
              opacity: 0.7,
            },
            children: Array.from({ length: 9 }, (_, index) => ({
              type: 'div',
              props: {
                style: {
                  border: `1px solid ${colors.grid}`,
                  backgroundColor: [2, 5, 8].includes(index) ? colors.primary : 'transparent',
                  opacity: [2, 5, 8].includes(index) ? 0.7 : 1,
                },
              },
            })),
          },
        },
        // Top row: Site Name
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              fontSize: '32px',
              fontWeight: 700,
              color: colors.primary,
              letterSpacing: 'normal',
            },
            children: siteName,
          },
        },
        // Middle: Article Title
        {
          type: 'div',
          props: {
            style: {
              display: 'block',
              fontSize: `${titleFontSize}px`,
              fontWeight: 700,
              lineHeight: 1.35,
              maxHeight: '220px',
              marginTop: '150px',
              maxWidth: '1040px',
              whiteSpace: 'pre-wrap',
              color: colors.text,
            },
            children: titleLines,
          },
        },
        // Bottom metadata row
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              fontSize: '26px',
              fontWeight: 400,
              color: colors.muted,
              gap: '24px',
            },
            children: [
              category
                ? {
                    type: 'span',
                    props: {
                      style: {
                        color: colors.primary,
                        fontWeight: 700,
                      },
                      children: category,
                    },
                  }
                : null,
              author
                ? {
                    type: 'span',
                    props: {
                      children: author,
                    },
                  }
                : null,
              date
                ? {
                    type: 'span',
                    props: {
                      children: date,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
      ],
    },
  };

  const svg = await satori(cardElement, {
    width: 1200,
    height: 630,
    fonts,
  });

  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false },
    fitTo: { mode: 'width', value: 1200 },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}
