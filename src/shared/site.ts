import { siteFrom, type Site } from '@mossplan/core/site';

export { PREVIEW_EMAIL_FROM, isAllowedSiteProtocol, siteFrom } from '@mossplan/core/site';
export type { SiteInput, Site } from '@mossplan/core/site';

/** Build-time adapter for Astro's Vite-injected site config. */
export function buildSite(): Site {
  return siteFrom(__SITE_CONFIG__);
}
