// Bot detection for /go/ redirect (AFFILIATE §3, S6).
// Matches obvious crawlers, fetchers, and bots to skip click logging.

export const BOT_REGEX =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|curl|wget|python|postman|scraper|headless|google-extended|applebot|bytespider|gptbot|claudebot|ccbot|meta-externalagent|mediapartners-google|adsbot-google|semrush|ahrefs|screaming frog/i;

/** Returns true if the user agent is an obvious bot or crawler. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_REGEX.test(ua);
}
