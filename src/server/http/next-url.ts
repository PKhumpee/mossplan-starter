/**
 * Returns a same-origin path for a post-login redirect, or /admin/ for anything else. Parsing with
 * URL matches what the browser does with tabs, newlines and backslashes.
 */
export function sanitizeNextUrl(next: string | null, origin: string): string {
  if (!next) return '/admin/';
  try {
    const url = new URL(next, origin);
    if (url.origin === origin) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Unparseable values use the default below.
  }
  return '/admin/';
}
