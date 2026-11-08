// Pure profile helpers (CONTRACTS §3). No database access.

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** Number of user-perceived characters (graphemes), the unit CONTRACTS §3 uses for profile limits. */
export function graphemeLength(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

export interface ProfileFields {
  slug?: string | null;
  name?: string | null;
  jobTitle?: string | null;
  bio?: string | null;
}

export const MIN_BIO_GRAPHEMES = 150;

/** Complete = `slug`, `name`, `job_title` set and a `bio` of at least 150 graphemes. */
export function isProfileComplete(user: ProfileFields): boolean {
  return (
    !!user.slug?.trim() &&
    !!user.name?.trim() &&
    !!user.jobTitle?.trim() &&
    graphemeLength((user.bio ?? '').trim()) >= MIN_BIO_GRAPHEMES
  );
}

/** Parses `same_as_json` / `knows_about_json`; anything that is not a JSON array of strings gives `[]`. */
export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
