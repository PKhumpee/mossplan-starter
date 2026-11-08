// Pure-JS image info parser (CONTRACTS §5, T09).
// Detects mime type by magic bytes and parses width/height without any native dependencies or Workers resizing.

export interface ImageInfo {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/avif';
  extension: 'jpg' | 'png' | 'webp' | 'gif' | 'avif';
  width: number | null;
  height: number | null;
}

export function detectImageInfo(buffer: Uint8Array): ImageInfo | null {
  if (buffer.length < 12) return null;

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    if (buffer.length >= 24) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return { mime: 'image/png', extension: 'png', width, height };
    }
    return { mime: 'image/png', extension: 'png', width: null, height: null };
  }

  // 2. GIF: GIF87a or GIF89a (47 49 46 38 37/39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    if (buffer.length >= 10) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const width = view.getUint16(6, true);
      const height = view.getUint16(8, true);
      return { mime: 'image/gif', extension: 'gif', width, height };
    }
    return { mime: 'image/gif', extension: 'gif', width: null, height: null };
  }

  // 3. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const { width, height } = parseJpegDimensions(buffer);
    return { mime: 'image/jpeg', extension: 'jpg', width, height };
  }

  // 4. WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    const { width, height } = parseWebpDimensions(buffer);
    return { mime: 'image/webp', extension: 'webp', width, height };
  }

  // 5. AVIF: ....ftypavif or ....ftypavis
  if (buffer.length >= 16) {
    // Check ftyp box (bytes 4-7 are 'ftyp', bytes 8-11 are 'avif' or 'avis')
    const isFtyp =
      buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
    const isAvif =
      (buffer[8] === 0x61 && buffer[9] === 0x76 && buffer[10] === 0x69 && buffer[11] === 0x66) ||
      (buffer[8] === 0x61 && buffer[9] === 0x76 && buffer[10] === 0x69 && buffer[11] === 0x73);

    if (isFtyp && isAvif) {
      const { width, height } = parseAvifDimensions(buffer);
      return { mime: 'image/avif', extension: 'avif', width, height };
    }
  }

  return null;
}

function parseJpegDimensions(buffer: Uint8Array): { width: number | null; height: number | null } {
  let offset = 2;
  const len = buffer.length;

  while (offset < len) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === undefined) break;

    // Ignore padding FF bytes
    if (marker === 0xff || marker === 0x00) {
      offset++;
      continue;
    }

    // End of image or SOS (Start of Scan) - image data follows
    if (marker === 0xd9 || marker === 0xda) break;

    // Length of the segment
    if (offset + 3 >= len) break;
    const segmentLength = (buffer[offset + 2]! << 8) | buffer[offset + 3]!;

    // SOF markers: SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof && offset + 8 < len) {
      const height = (buffer[offset + 5]! << 8) | buffer[offset + 6]!;
      const width = (buffer[offset + 7]! << 8) | buffer[offset + 8]!;
      return { width, height };
    }

    offset += 2 + segmentLength;
  }

  return { width: null, height: null };
}

function parseWebpDimensions(buffer: Uint8Array): { width: number | null; height: number | null } {
  if (buffer.length < 30) return { width: null, height: null };

  const formatChunk = String.fromCharCode(
    buffer[12] ?? 0,
    buffer[13] ?? 0,
    buffer[14] ?? 0,
    buffer[15] ?? 0,
  );

  // VP8 (lossy)
  if (formatChunk === 'VP8 ') {
    if (buffer.length >= 30) {
      // 0x9d 0x01 0x2a sync code
      const width = (buffer[26]! | (buffer[27]! << 8)) & 0x3fff;
      const height = (buffer[28]! | (buffer[29]! << 8)) & 0x3fff;
      return { width, height };
    }
  }

  // VP8L (lossless)
  if (formatChunk === 'VP8L') {
    if (buffer.length >= 25 && buffer[20] === 0x2f) {
      const b1 = buffer[21]!;
      const b2 = buffer[22]!;
      const b3 = buffer[23]!;
      const b4 = buffer[24]!;
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }
  }

  // VP8X (extended)
  if (formatChunk === 'VP8X') {
    if (buffer.length >= 30) {
      const width = 1 + (buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16));
      const height = 1 + (buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16));
      return { width, height };
    }
  }

  return { width: null, height: null };
}

function parseAvifDimensions(buffer: Uint8Array): { width: number | null; height: number | null } {
  // Search for 'ispe' box in the buffer (Image Spatial Extents box)
  // 'ispe' = 0x69, 0x73, 0x70, 0x65
  for (let i = 0; i < buffer.length - 12; i++) {
    if (
      buffer[i] === 0x69 &&
      buffer[i + 1] === 0x73 &&
      buffer[i + 2] === 0x70 &&
      buffer[i + 3] === 0x65
    ) {
      // Next 4 bytes are version/flags, then 4 bytes width, then 4 bytes height
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const width = view.getUint32(i + 8, false);
      const height = view.getUint32(i + 12, false);
      return { width, height };
    }
  }
  return { width: null, height: null };
}
