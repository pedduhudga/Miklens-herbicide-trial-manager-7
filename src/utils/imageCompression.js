/**
 * Utility to compress a base64 DataURL image.
 * Resizes the image so that the maximum dimension (width or height) is `maxDimension` (default 600).
 * Outputs a JPEG image with the specified `quality` (default 0.7).
 * Returns the compressed base64 DataURL.
 */
export async function compressImage(dataUrl, maxDimension = 600, quality = 0.7) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl); // Fallback to original if loading fails
    };
    img.src = dataUrl;
  });
}
