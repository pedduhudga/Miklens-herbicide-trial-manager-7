/**
 * Image compression utilities for reducing memory footprint
 * Compresses images to max dimension with configurable quality
 */

/**
 * Compress an image using canvas
 * @param {string} base64 - Base64 image string
 * @param {number} maxDimension - Maximum width or height (default 600)
 * @param {number} quality - JPEG quality 0-1 (default 0.7)
 * @returns {Promise<string>} Compressed base64 string
 */
export async function compressImage(base64, maxDimension = 1920, quality = 0.95) {
  return new Promise((resolve, reject) => {
    if (!base64 || !base64.startsWith('data:image/')) {
      resolve(base64);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        // Calculate new dimensions while preserving aspect ratio
        let { width, height } = img;
        
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }

        // Create canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        // Fill with white background (for transparent images)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get compressed base64
        const compressed = canvas.toDataURL('image/jpeg', quality);
        
        // Estimate size
        const base64Length = compressed.length - ('data:image/jpeg;base64,'.length);
        const sizeInKB = Math.round((base64Length * 3) / 4 / 1024);
        
        console.log(`[ImageCompression] Compressed from ~${Math.round((base64.length * 3) / 4 / 1024)}KB to ${sizeInKB}KB (${width}x${height})`);
        
        resolve(compressed);
      } catch (err) {
        console.error('[ImageCompression] Failed to compress:', err);
        resolve(base64); // Return original on failure
      }
    };

    img.onerror = () => {
      console.warn('[ImageCompression] Failed to load image');
      resolve(base64);
    };

    img.src = base64;
  });
}

/**
 * Compress multiple images
 * @param {Array} photos - Array of photo objects with fileData, url, or src
 * @param {number} maxDimension - Max dimension (default 600)
 * @param {number} quality - JPEG quality (default 0.7)
 * @returns {Promise<Array>} Array of compressed photos
 */
export async function compressPhotos(photos, maxDimension = 1920, quality = 0.95) {
  if (!photos || !Array.isArray(photos)) return photos;

  const compressed = await Promise.all(
    photos.map(async (photo) => {
      // Get the image data
      const src = photo.fileData || photo.url || photo.src;
      
      if (!src) return photo;
      
      // Skip if already compressed (small enough)
      if (src.startsWith('data:image/') && src.length < 500000) {
        return photo;
      }

      try {
        const compressedData = await compressImage(src, maxDimension, quality);
        
        return {
          ...photo,
          fileData: compressedData,
          compressed: true,
          originalSize: src.length,
          compressedSize: compressedData.length
        };
      } catch (err) {
        console.warn('[ImageCompression] Failed to compress photo:', err);
        return photo;
      }
    })
  );

  return compressed;
}

/**
 * Check if an image needs compression
 * @param {string} base64 - Base64 image string
 * @param {number} thresholdKB - Size threshold in KB (default 150KB)
 * @returns {boolean} True if image needs compression
 */
export function needsCompression(base64, thresholdKB = 150) {
  if (!base64 || !base64.startsWith('data:image/')) return false;
  
  // Estimate size
  const base64Length = base64.length - ('data:image/jpeg;base64,'.length);
  const sizeInKB = Math.round((base64Length * 3) / 4 / 1024);
  
  return sizeInKB > thresholdKB;
}

/**
 * Get image dimensions from base64
 * @param {string} base64 - Base64 image string
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageDimensions(base64) {
  return new Promise((resolve, reject) => {
    if (!base64 || !base64.startsWith('data:image/')) {
      resolve({ width: 0, height: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = base64;
  });
}

/**
 * Resize image to specific dimensions
 * @param {string} base64 - Base64 image string
 * @param {number} targetWidth - Target width
 * @param {number} targetHeight - Target height
 * @param {number} quality - JPEG quality
 * @returns {Promise<string>} Resized base64
 */
export async function resizeImage(base64, targetWidth, targetHeight, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!base64 || !base64.startsWith('data:image/')) {
      resolve(base64);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        
        // Fill with white
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        
        // Draw scaled image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        resolve(base64);
      }
    };

    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

// Run compression when idle
export function compressWhenIdle(photos, maxDimension = 1920, quality = 0.95) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(() => compressPhotos(photos, maxDimension, quality), { timeout: 5000 });
  }
  return setTimeout(() => compressPhotos(photos, maxDimension, quality), 100);
}