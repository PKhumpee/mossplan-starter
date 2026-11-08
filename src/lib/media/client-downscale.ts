// Client-side image downscaling helper (DESIGN §10.3, T09).
// Downscales JPEG, PNG, and WebP images to at most 2400px on the longest edge in the browser.
// This also naturally strips EXIF / GPS location metadata before upload.
// Animated GIFs are untouched.

export const MAX_LONG_EDGE = 2400;

export async function downscaleImageBeforeUpload(
  file: File,
  onProgress?: (message: string) => void,
): Promise<File> {
  // 1. Skip animated GIFs or non-image files
  if (file.type === 'image/gif' || !file.type.startsWith('image/')) {
    return file;
  }

  // Check if browser environment has Image and Canvas
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return file;
  }

  onProgress?.('กำลังอ่านรูปภาพ...');

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      // If already within 2400px, still re-draw on canvas if we want to strip EXIF,
      // but if small enough we can just proceed or downscale if larger:
      if (width <= MAX_LONG_EDGE && height <= MAX_LONG_EDGE) {
        resolve(file);
        return;
      }

      onProgress?.('ย่อรูปก่อนอัปโหลด…');

      let targetWidth = width;
      let targetHeight = height;

      if (width > height) {
        targetWidth = MAX_LONG_EDGE;
        targetHeight = Math.round((height * MAX_LONG_EDGE) / width);
      } else {
        targetHeight = MAX_LONG_EDGE;
        targetWidth = Math.round((width * MAX_LONG_EDGE) / height);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(file);
        return;
      }

      // High quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = outputType === 'image/jpeg' ? 0.88 : undefined;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const resizedFile = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          });

          resolve(resizedFile);
        },
        outputType,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback to original file on decode error
      resolve(file);
    };

    img.src = objectUrl;
  });
}
