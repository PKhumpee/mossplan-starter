// JSON-LD Schema.org builders (DESIGN §11.2, CONTRACTS §2a, D25, D26, D38, T14).
// Pure functions constructing standard schema objects for Google Rich Results.

export interface SiteMeta {
  url: string;
  name: string;
  description: string;
}

export interface BreadcrumbItem {
  name: string;
  url?: string;
}

export function buildWebSiteGraph(site: SiteMeta) {
  return {
    '@type': 'WebSite',
    '@id': `${site.url}/#website`,
    url: `${site.url}/`,
    name: '__MOSS_SITE_NAME__',
    alternateName: 'Mossplan',
    description: site.description,
    inLanguage: 'th',
    publisher: {
      '@id': `${site.url}/#organization`,
    },
  };
}

export function buildOrganizationGraph(site: SiteMeta) {
  return {
    '@type': 'Organization',
    '@id': `${site.url}/#organization`,
    name: '__MOSS_SITE_NAME__',
    url: `${site.url}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${site.url}/logo.png`,
      width: 512,
      height: 512,
      caption: '__MOSS_SITE_NAME__',
    },
  };
}

export function buildBreadcrumbListGraph(siteUrl: string, items: BreadcrumbItem[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url
        ? { item: item.url.startsWith('http') ? item.url : `${siteUrl}${item.url}` }
        : {}),
    })),
  };
}

export interface AuthorData {
  id: string;
  name: string;
  slug?: string | null;
  jobTitle?: string | null;
  bio?: string | null;
  sameAs?: string[];
  knowsAbout?: string[];
}

export function buildPersonGraph(siteUrl: string, author: AuthorData) {
  const authorSlug = author.slug || author.id;
  const authorUrl = `${siteUrl}/authors/${authorSlug}/`;

  return {
    '@type': 'Person',
    '@id': `${authorUrl}#person`,
    name: author.name,
    url: authorUrl,
    ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}),
    ...(author.bio ? { description: author.bio } : {}),
    ...(author.sameAs && author.sameAs.length > 0 ? { sameAs: author.sameAs } : {}),
    ...(author.knowsAbout && author.knowsAbout.length > 0 ? { knowsAbout: author.knowsAbout } : {}),
  };
}

export interface ArticleSchemaOptions {
  site: SiteMeta;
  canonicalUrl: string;
  title: string;
  description: string;
  slug: string;
  publishedAt?: number | null;
  modifiedAt?: number | null;
  categoryName?: string;
  tagNames?: string[];
  author: AuthorData;
  reviewer?: AuthorData | null;
  reviewedAt?: number | null;
  breadcrumbs: BreadcrumbItem[];
}

export function buildArticleGraph(opts: ArticleSchemaOptions) {
  const {
    site,
    canonicalUrl,
    title,
    description,
    slug,
    publishedAt,
    modifiedAt,
    categoryName,
    tagNames = [],
    author,
    reviewer,
    reviewedAt,
    breadcrumbs,
  } = opts;

  const ogImageUrl = `${site.url}/og/${slug}.png`;
  const authorPerson = buildPersonGraph(site.url, author);

  const webPage = {
    '@type': 'WebPage',
    '@id': canonicalUrl,
    url: canonicalUrl,
    name: title,
    description,
    isPartOf: {
      '@id': `${site.url}/#website`,
    },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: ogImageUrl,
      width: 1200,
      height: 630,
    },
    breadcrumb: {
      '@id': `${canonicalUrl}#breadcrumb`,
    },
    inLanguage: 'th',
  };

  const blogPosting: Record<string, unknown> = {
    '@type': 'BlogPosting', // D38: always BlogPosting, never NewsArticle
    '@id': `${canonicalUrl}#article`,
    isPartOf: {
      '@id': canonicalUrl,
    },
    mainEntityOfPage: canonicalUrl,
    headline: title,
    description,
    url: canonicalUrl,
    inLanguage: 'th',
    datePublished: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
    dateModified: modifiedAt ? new Date(modifiedAt).toISOString() : new Date().toISOString(),
    image: {
      '@type': 'ImageObject',
      url: ogImageUrl,
      width: 1200,
      height: 630,
    },
    author: authorPerson,
    publisher: buildOrganizationGraph(site),
  };

  if (categoryName) blogPosting.articleSection = categoryName;
  if (tagNames.length > 0) blogPosting.keywords = tagNames;

  if (reviewer && reviewedAt) {
    const reviewerPerson = buildPersonGraph(site.url, reviewer);
    blogPosting.reviewedBy = reviewerPerson;
    blogPosting.lastReviewed = new Date(reviewedAt).toISOString();
  }

  const breadcrumbList = {
    ...buildBreadcrumbListGraph(site.url, breadcrumbs),
    '@id': `${canonicalUrl}#breadcrumb`,
  };

  return [
    buildWebSiteGraph(site),
    buildOrganizationGraph(site),
    webPage,
    blogPosting,
    breadcrumbList,
  ];
}

export function buildCollectionPageGraph(
  site: SiteMeta,
  canonicalUrl: string,
  name: string,
  description: string,
  breadcrumbs: BreadcrumbItem[],
) {
  return [
    buildWebSiteGraph(site),
    buildOrganizationGraph(site),
    {
      '@type': 'CollectionPage',
      '@id': canonicalUrl,
      url: canonicalUrl,
      name,
      description,
      isPartOf: {
        '@id': `${site.url}/#website`,
      },
    },
    buildBreadcrumbListGraph(site.url, breadcrumbs),
  ];
}

export function buildProfilePageGraph(
  site: SiteMeta,
  canonicalUrl: string,
  author: AuthorData,
  breadcrumbs: BreadcrumbItem[],
) {
  const authorPerson = buildPersonGraph(site.url, author);
  return [
    buildWebSiteGraph(site),
    buildOrganizationGraph(site),
    {
      '@type': 'ProfilePage',
      '@id': canonicalUrl,
      url: canonicalUrl,
      name: `ประวัติและผลงานของ ${author.name}`,
      isPartOf: {
        '@id': `${site.url}/#website`,
      },
      mainEntity: authorPerson,
    },
    authorPerson,
    buildBreadcrumbListGraph(site.url, breadcrumbs),
  ];
}

export function buildTrustPageGraph(
  site: SiteMeta,
  canonicalUrl: string,
  type: 'AboutPage' | 'ContactPage',
  name: string,
  description: string,
  breadcrumbs: BreadcrumbItem[],
) {
  return [
    buildWebSiteGraph(site),
    buildOrganizationGraph(site),
    {
      '@type': type,
      '@id': canonicalUrl,
      url: canonicalUrl,
      name,
      description,
      isPartOf: {
        '@id': `${site.url}/#website`,
      },
      mainEntity: {
        '@id': `${site.url}/#organization`,
      },
    },
    buildBreadcrumbListGraph(site.url, breadcrumbs),
  ];
}
