// Thai text helpers (DESIGN §11.4). One implementation shared by the editor counters (T08), the
// category admin (T10) and check:seo (T14), so every word/grapheme count in the product agrees.
// Thai has no spaces between words: never split on spaces and never cut inside a grapheme cluster
// (base + vowels + tone marks), or stacked marks such as ผู้ใหญ่ / น้ำ / กิ๊ฟ come apart.

const graphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });

/** Number of user-perceived characters (grapheme clusters), the unit of every length rule. */
export function graphemeLength(text: string): number {
  let count = 0;
  for (const _ of graphemeSegmenter.segment(text)) count++;
  return count;
}

/** Word segments the Thai dictionary recognises; Latin words count as words too. */
export function thaiWords(text: string): string[] {
  const words: string[] = [];
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) words.push(segment.segment);
  }
  return words;
}

export function thaiWordCount(text: string): number {
  return thaiWords(text).length;
}

/**
 * Cuts at a Thai word boundary so the result never splits a word or a grapheme cluster, and counts
 * in graphemes. When the text is longer than `maxGraphemes`, the cut is followed by an ellipsis
 * that fits inside the limit (so meta descriptions stay within their cap).
 */
export function truncateThai(text: string, maxGraphemes: number): string {
  if (maxGraphemes < 1) return '';
  if (graphemeLength(text) <= maxGraphemes) return text;

  const limit = maxGraphemes - 1; // reserve one grapheme for the ellipsis
  let kept = '';
  let keptGraphemes = 0;
  for (const segment of wordSegmenter.segment(text)) {
    const segmentGraphemes = graphemeLength(segment.segment);
    if (keptGraphemes + segmentGraphemes > limit) break;
    kept += segment.segment;
    keptGraphemes += segmentGraphemes;
  }
  // A single word longer than the limit (a long compound or a URL): fall back to a grapheme cut.
  if (kept === '') {
    for (const segment of graphemeSegmenter.segment(text)) {
      if (keptGraphemes + 1 > limit) break;
      kept += segment.segment;
      keptGraphemes += 1;
    }
  }
  return `${kept.trimEnd()}…`;
}

/** Thai reading pace used across the site. 250 word-units/min is the slow side of typical, so the
 * shown reading time errs long rather than short. */
export const THAI_WORDS_PER_MINUTE = 250;

/** Reading time in whole minutes, minimum 1 ("อ่าน 6 นาที"). */
export function readingTimeMinutes(text: string): number {
  return Math.max(1, Math.round(thaiWordCount(text) / THAI_WORDS_PER_MINUTE));
}
