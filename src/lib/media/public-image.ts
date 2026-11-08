// Public media image helper (CONTRACTS §1a, DESIGN §11.5, T13, P2-01).
// Provides canonical media reference parsing, URL resolution, and AVIF/WebP <picture> generation.

export interface RenderPublicPictureOptions {
  mediaId?: string | null;
  src?: string | null;
  alt?: string;
  caption?: string | null;
  class?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * Parses any media reference string ('media:<id>', '/media/<id>', '/api/admin/media/<id>/file', etc.)
 * and extracts the clean bare media ID.
 */
export function parseMediaReference(ref?: string | null): string {
  if (!ref) return '';
  const trimmed = ref.trim();
  if (trimmed.startsWith('media:')) {
    return trimmed.slice(6);
  }
  if (trimmed.startsWith('/media/')) {
    const filename = trimmed.slice(7).split(/[?#]/)[0] ?? '';
    return filename.split('.')[0] ?? '';
  }
  if (trimmed.includes('/api/admin/media/')) {
    const after = trimmed.split('/api/admin/media/')[1] ?? '';
    return after.split('/')[0] ?? '';
  }
  // If it's a bare ID without slashes or protocols (e.g. 'media-cover-1')
  if (!trimmed.includes('/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }
  return '';
}

/**
 * Resolves a media reference or bare ID to a safe public static URL.
 * NEVER emits /api/admin or any /api/ URL.
 */
export function resolvePublicMediaUrl(
  refOrId?: string | null,
  format: 'webp' | 'avif' | 'original' = 'webp',
): string {
  if (!refOrId) return '';
  const mediaId = parseMediaReference(refOrId) || refOrId.trim();

  // If clean mediaId has no path or protocol, build static public URL
  if (!mediaId.includes('/') && !mediaId.startsWith('http://') && !mediaId.startsWith('https://')) {
    if (format === 'original') {
      return `/media/${mediaId}`;
    }
    return `/media/${mediaId}.${format}`;
  }

  // If it's already an external or absolute URL, ensure it is not /api/
  if (mediaId.includes('/api/admin') || mediaId.startsWith('/api/')) {
    const parsed = parseMediaReference(mediaId);
    return parsed ? `/media/${parsed}.${format}` : '';
  }

  return mediaId;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders an AVIF + WebP <picture> HTML element for public body or card rendering.
 * Never emits /api/admin or any /api/ path.
 */
export function renderPublicPicture(options: RenderPublicPictureOptions): string {
  const {
    mediaId: rawId,
    src: rawSrc,
    alt = '',
    class: className = '',
    sizes,
    priority = false,
  } = options;

  const mediaId = (rawId ? parseMediaReference(rawId) || rawId : '') || parseMediaReference(rawSrc);
  const loading = priority ? 'eager' : 'lazy';
  const fetchpriority = priority ? 'high' : 'auto';
  const classAttr = className ? ` class="${escapeAttr(className)}"` : '';
  const sizesAttr = sizes ? ` sizes="${escapeAttr(sizes)}"` : '';
  const safeAlt = escapeAttr(alt);

  if (mediaId) {
    const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '');
    const avifUrl = `/media/${safeMediaId}.avif`;
    const webpUrl = `/media/${safeMediaId}.webp`;
    const fallbackUrl = `/media/${safeMediaId}.webp`;

    return `<picture data-media-id="${escapeAttr(mediaId)}"${classAttr}><source srcset="${avifUrl}" type="image/avif"${sizesAttr} /><source srcset="${webpUrl}" type="image/webp"${sizesAttr} /><img src="${fallbackUrl}" alt="${safeAlt}" loading="${loading}" decoding="async" fetchpriority="${fetchpriority}"${classAttr} /></picture>`;
  }

  // Fallback for non-media ID images (e.g. external or static asset)
  const safeSrc = rawSrc && !rawSrc.includes('/api/') ? rawSrc : '';
  if (!safeSrc) return '';

  return `<img src="${escapeAttr(safeSrc)}" alt="${safeAlt}" loading="${loading}" decoding="async" fetchpriority="${fetchpriority}"${classAttr} />`;
}
