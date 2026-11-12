export function robotsContentForRuntime(content: string | null, indexing: boolean): string | null {
  if (content === null || (indexing && content.toLowerCase().includes('noindex'))) return content;
  return indexing
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'noindex, nofollow';
}
