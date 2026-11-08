// Thai query helpers for Pagefind (CONTRACTS §9, S2 verdict, T15).
// Pre-segments queries with Intl.Segmenter('th'), normalizes common Thai typing slips,
// and re-ranks top results so phrase matches come first.
// Runs in the browser on /search/ and in Node during build.

const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const THAI = /[฀-๿]/;

/**
 * Insert `sep` between adjacent word segments that are not already separated by whitespace.
 * Existing whitespace is kept as is. "ราคาน้ำมันดีเซล" -> "ราคา น้ำมัน ดีเซล".
 */
export function segmentThai(text: string, sep = ' '): string {
  let out = '';
  let prevWord = false;
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    const space = /^\s+$/.test(segment);
    if (!space && prevWord && (isWordLike || THAI.test(segment))) out += sep;
    out += segment;
    prevWord = !space && (isWordLike || THAI.test(segment));
  }
  return out;
}

/**
 * Fix Thai typing slips that look the same to the reader:
 * - "เเ" (two SARA E) typed instead of "แ" (SARA AE)
 * - "ํา" (NIKHAHIT + SARA AA) typed instead of "ำ" (SARA AM)
 * then collapses spaces.
 */
export function normalizeThai(text: string): string {
  return text.normalize('NFC').replace(/เเ/g, 'แ').replace(/ํา/g, 'ำ').replace(/\s+/g, ' ').trim();
}

export const squash = (s: string): string => normalizeThai(s).replace(/\s+/g, '').toLowerCase();

export interface SearchResultItem {
  url: string;
  meta?: Record<string, string>;
  excerpt?: string;
  phrase?: boolean;
}

export interface SearchOptions {
  filters?: Record<string, any>;
  limit?: number;
  rerankDepth?: number;
}

/**
 * Recommended query path (S2 verdict): normalize, segment with Intl.Segmenter, search, then move
 * results whose text contains the whole query (spaces ignored) to the top.
 */
export async function searchThai(
  pagefind: any,
  raw: string,
  opts: SearchOptions = {},
): Promise<SearchResultItem[]> {
  const query = normalizeThai(raw);
  if (!query) return [];

  const search = await pagefind.search(
    segmentThai(query),
    opts.filters ? { filters: opts.filters } : undefined,
  );

  if (!search?.results?.length) return [];

  const needle = squash(query);
  const rerankDepth = opts.rerankDepth ?? 20;
  const limit = opts.limit ?? 10;

  const top = await Promise.all(search.results.slice(0, rerankDepth).map((r: any) => r.data()));

  const scored = top.map((d: any, i: number) => ({
    url: d.url,
    meta: d.meta,
    excerpt: d.excerpt,
    phrase: squash(`${d.meta?.title ?? ''} ${d.content}`).includes(needle),
    rank: i,
  }));

  // Stable sort: phrase matches first, Pagefind's order inside each group
  scored.sort((a: any, b: any) => Number(b.phrase) - Number(a.phrase) || a.rank - b.rank);

  return scored.slice(0, limit).map(({ rank: _rank, ...r }: any) => r);
}
