// Media size budget & optimization pipeline (DESIGN §11.5, CONTRACTS §1, T13).
// - Files over 200 KB (cover 300 KB): lower quality step by step, warn with media ID when still over.
// - Animated GIF → animated WebP; fail on an animated result over 500 KB with advice to upload to YouTube.
// - Author avatars: square pipeline at 96 and 192 px.

import sharp from 'sharp';

export const BUDGET_IMAGE_BYTES = 200 * 1024; // 200 KB
export const BUDGET_COVER_BYTES = 300 * 1024; // 300 KB
export const BUDGET_ANIMATED_BYTES = 500 * 1024; // 500 KB

export interface OptimizeOptions {
  buffer: Buffer;
  mediaId: string;
  key: string;
  mime?: string;
  isCover?: boolean;
  isAvatar?: boolean;
}

export interface OptimizeResult {
  buffer: Buffer;
  mime: string;
  extension: string;
  width: number | null;
  height: number | null;
  originalBytes: number;
  optimizedBytes: number;
  isAnimated: boolean;
  warned: boolean;
  warningMessage?: string;
}

/** Check if a buffer is an animated GIF. */
export async function isAnimatedGif(buffer: Buffer): Promise<boolean> {
  if (buffer.length < 10) return false;
  // Check GIF magic bytes
  if (buffer[0] !== 0x47 || buffer[1] !== 0x49 || buffer[2] !== 0x46) {
    return false;
  }
  try {
    const meta = await sharp(buffer, { animated: true }).metadata();
    return meta.format === 'gif' && typeof meta.pages === 'number' && meta.pages > 1;
  } catch {
    return false;
  }
}

/**
 * Optimizes a media asset according to DESIGN §11.5 size budgets:
 * - Animated GIF -> Animated WebP (fails if > 500 KB with YouTube advice)
 * - Author avatars -> square 192px/96px
 * - Cover images budget: 300 KB at largest width
 * - General images budget: 200 KB
 * Lowers quality step-by-step when over budget; warns with media ID when still over.
 */
export async function optimizeMedia(options: OptimizeOptions): Promise<OptimizeResult> {
  const { buffer, mediaId, key, isCover = false, isAvatar = false } = options;
  const originalBytes = buffer.length;

  // 1. Detect if animated GIF
  const isAnim = await isAnimatedGif(buffer);
  if (isAnim) {
    return await handleAnimatedGif(buffer, mediaId, key);
  }

  // 2. Read metadata of static image
  const meta = await sharp(buffer).metadata();
  const format: string = meta.format ?? 'jpeg';
  let width = meta.width ?? null;
  let height = meta.height ?? null;

  // 3. Handle author avatar (square 192px max)
  if (isAvatar || key.includes('avatar') || mediaId.includes('avatar')) {
    const avatarSize = 192;
    const avatarBuf = await sharp(buffer)
      .resize(avatarSize, avatarSize, { fit: 'cover', position: 'center' })
      .toFormat('webp', { quality: 85 })
      .toBuffer();

    const avatarMeta = await sharp(avatarBuf).metadata();
    let finalBuf: Buffer = Buffer.from(avatarBuf);
    let warned = false;
    let warningMessage: string | undefined;

    if (finalBuf.length > BUDGET_IMAGE_BYTES) {
      const stepDown = await lowerQuality(finalBuf, 'webp', BUDGET_IMAGE_BYTES);
      finalBuf = Buffer.from(stepDown.buffer);
      if (stepDown.stillOver) {
        warned = true;
        warningMessage = `Avatar media "${mediaId}" (${key}) is still over budget: ${(finalBuf.length / 1024).toFixed(1)} KB > ${(BUDGET_IMAGE_BYTES / 1024).toFixed(0)} KB`;
        console.warn(`[media-budget] WARNING: ${warningMessage}`);
      }
    }

    return {
      buffer: finalBuf,
      mime: 'image/webp',
      extension: 'webp',
      width: avatarMeta.width ?? avatarSize,
      height: avatarMeta.height ?? avatarSize,
      originalBytes,
      optimizedBytes: finalBuf.length,
      isAnimated: false,
      warned,
      warningMessage,
    };
  }

  // 4. Handle standard / cover static images
  const budget = isCover ? BUDGET_COVER_BYTES : BUDGET_IMAGE_BYTES;
  let currentBuffer: Buffer = buffer;
  let currentFormat: string = format;
  let warned = false;
  let warningMessage: string | undefined;

  if (currentBuffer.length > budget) {
    // Step down quality
    const stepDown = await lowerQuality(currentBuffer, currentFormat, budget);
    currentBuffer = Buffer.from(stepDown.buffer);
    currentFormat = stepDown.format;

    if (stepDown.stillOver) {
      warned = true;
      warningMessage = `Media "${mediaId}" (${key}) is still over budget: ${(currentBuffer.length / 1024).toFixed(1)} KB > ${(budget / 1024).toFixed(0)} KB`;
      console.warn(`[media-budget] WARNING: ${warningMessage}`);
    }
  }

  const updatedMeta = await sharp(currentBuffer).metadata();
  const mime = getMimeFromFormat(updatedMeta.format ?? currentFormat);
  const extension = getExtensionFromFormat(updatedMeta.format ?? currentFormat);

  return {
    buffer: currentBuffer,
    mime,
    extension,
    width: updatedMeta.width ?? width,
    height: updatedMeta.height ?? height,
    originalBytes,
    optimizedBytes: currentBuffer.length,
    isAnimated: false,
    warned,
    warningMessage,
  };
}

/** Handles animated GIF -> animated WebP conversion and 500 KB budget enforcement. */
async function handleAnimatedGif(
  buffer: Buffer,
  mediaId: string,
  key: string,
): Promise<OptimizeResult> {
  const originalBytes = buffer.length;
  const meta = await sharp(buffer, { animated: true }).metadata();

  // Convert animated GIF to animated WebP with quality steps if needed
  const qualities = [80, 70, 60, 50, 40, 30];
  let bestWebp: Buffer | null = null;

  for (const q of qualities) {
    const webpBuf = await sharp(buffer, { animated: true })
      .webp({ quality: q, effort: 4 })
      .toBuffer();
    bestWebp = webpBuf;
    if (webpBuf.length <= BUDGET_ANIMATED_BYTES) {
      break;
    }
  }

  if (!bestWebp || bestWebp.length > BUDGET_ANIMATED_BYTES) {
    const sizeKb = ((bestWebp?.length ?? originalBytes) / 1024).toFixed(1);
    throw new Error(
      `[media-budget] Animated GIF "${mediaId}" (${key}) result is ${sizeKb} KB, exceeding the 500 KB budget. Please upload a video to YouTube instead.`,
    );
  }

  const webpMeta = await sharp(bestWebp, { animated: true }).metadata();
  return {
    buffer: bestWebp,
    mime: 'image/webp',
    extension: 'webp',
    width: webpMeta.width ?? meta.width ?? null,
    height: webpMeta.pageHeight ?? meta.pageHeight ?? meta.height ?? null,
    originalBytes,
    optimizedBytes: bestWebp.length,
    isAnimated: true,
    warned: false,
  };
}

/** Step-by-step quality reduction to satisfy size budget. */
async function lowerQuality(
  buffer: Buffer,
  format: string,
  budgetBytes: number,
): Promise<{ buffer: Buffer; format: string; stillOver: boolean }> {
  const qualitySteps = [85, 75, 65, 55, 45, 35, 25];
  let bestBuffer = buffer;
  let bestFormat = format;

  // For JPEG
  if (format === 'jpeg' || format === 'jpg') {
    for (const q of qualitySteps) {
      const candidate = await sharp(buffer).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      bestBuffer = candidate;
      if (candidate.length <= budgetBytes) {
        return { buffer: candidate, format: 'jpeg', stillOver: false };
      }
    }
  }

  // For WebP
  if (format === 'webp') {
    for (const q of qualitySteps) {
      const candidate = await sharp(buffer).webp({ quality: q }).toBuffer();
      bestBuffer = candidate;
      if (candidate.length <= budgetBytes) {
        return { buffer: candidate, format: 'webp', stillOver: false };
      }
    }
  }

  // For PNG: try palette / compression first, then WebP conversion if still over
  if (format === 'png') {
    for (const q of qualitySteps) {
      try {
        const candidate = await sharp(buffer)
          .png({ quality: q, compressionLevel: 9, palette: true })
          .toBuffer();
        bestBuffer = candidate;
        if (candidate.length <= budgetBytes) {
          return { buffer: candidate, format: 'png', stillOver: false };
        }
      } catch {
        break;
      }
    }

    // If still over budget, try WebP
    for (const q of qualitySteps) {
      const candidate = await sharp(buffer).webp({ quality: q }).toBuffer();
      bestBuffer = candidate;
      bestFormat = 'webp';
      if (candidate.length <= budgetBytes) {
        return { buffer: candidate, format: 'webp', stillOver: false };
      }
    }
  }

  // For other formats (e.g. avif)
  if (format === 'avif') {
    for (const q of qualitySteps) {
      const candidate = await sharp(buffer).avif({ quality: q }).toBuffer();
      bestBuffer = candidate;
      if (candidate.length <= budgetBytes) {
        return { buffer: candidate, format: 'avif', stillOver: false };
      }
    }
  }

  return {
    buffer: bestBuffer,
    format: bestFormat,
    stillOver: bestBuffer.length > budgetBytes,
  };
}

function getMimeFromFormat(format: string): string {
  switch (format) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

function getExtensionFromFormat(format: string): string {
  switch (format) {
    case 'jpeg':
    case 'jpg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
      return 'avif';
    case 'gif':
      return 'gif';
    default:
      return 'jpg';
  }
}
