/**
 * Extract Google Drive file ID from URL, Drive ID string, or photo object
 */
export function getDriveFileId(photoOrUrl) {
  if (!photoOrUrl) return null;
  
  if (typeof photoOrUrl === 'object') {
    const directId = photoOrUrl.driveId || photoOrUrl.fileId || photoOrUrl.driveFileId;
    if (typeof directId === 'string' && directId.length >= 15 && !directId.includes('/')) {
      return directId;
    }
    const url = photoOrUrl.url || photoOrUrl.src || photoOrUrl.fileUrl || photoOrUrl.photoUrl || photoOrUrl.fileData;
    if (typeof url === 'string') return getDriveFileId(url);
    return null;
  }

  if (typeof photoOrUrl !== 'string') return null;
  const str = photoOrUrl.trim();

  // If already a raw Drive ID (e.g. 28-44 alphanumeric characters without slash or colon)
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(str)) {
    return str;
  }

  // Regex patterns for Google Drive and Google User Content URLs
  const patterns = [
    /(?:[?&]id=|\/d\/|\/file\/d\/|\/thumbnail\?id=|\/open\?id=)([a-zA-Z0-9_-]{20,})/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/,
    /drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]{20,})/
  ];

  for (const pattern of patterns) {
    const m = str.match(pattern);
    if (m && m[1]) return m[1];
  }

  return null;
}

/**
 * Resolve a displayable / AI-usable source URL from a photo entry.
 * Handles legacy shapes: string URLs, { url }, { fileData }, { driveId }, etc.
 * Adds Google CDN sizing parameter (=w480) for lightweight instant loading.
 */
export function resolvePhotoSrc(photo, size = 480) {
  if (!photo) return null;

  // Handle string inputs
  if (typeof photo === 'string') {
    const s = photo.trim();
    if (!s || s === '[base64-removed]' || s.includes('[base64-removed]')) return null;
    
    // Direct base64 or standard direct image URL
    if (s.startsWith('data:image/') || s.startsWith('blob:') || s.startsWith('local-photo-id:')) {
      return s;
    }

    const driveId = getDriveFileId(s);
    if (driveId) {
      return size ? `https://lh3.googleusercontent.com/d/${driveId}=w${size}` : `https://lh3.googleusercontent.com/d/${driveId}`;
    }

    if (s.startsWith('http://') || s.startsWith('https://')) {
      return s;
    }

    return null;
  }

  if (typeof photo !== 'object') return null;

  // Check fileData / base64
  const fileData = photo.fileData || photo.dataUrl;
  if (typeof fileData === 'string' && fileData.trim()) {
    const fd = fileData.trim();
    if (fd !== '[base64-removed]' && !fd.includes('[base64-removed]')) {
      if (fd.startsWith('data:') || fd.startsWith('blob:') || fd.startsWith('local-photo-id:')) return fd;
      if (fd.startsWith('http')) return fd;
    }
  }

  // Check direct URL
  const url = photo.url || photo.src || photo.fileUrl || photo.photoUrl;
  if (typeof url === 'string' && url.trim()) {
    const u = url.trim();
    if (u !== '[base64-removed]' && !u.includes('[base64-removed]')) {
      if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('local-photo-id:')) return u;
      const driveId = getDriveFileId(u);
      if (driveId) {
        return size ? `https://lh3.googleusercontent.com/d/${driveId}=w${size}` : `https://lh3.googleusercontent.com/d/${driveId}`;
      }
      if (u.startsWith('http://') || u.startsWith('https://')) return u;
    }
  }

  // Extract Drive ID directly from object properties
  const driveId = getDriveFileId(photo);
  if (driveId) {
    return size ? `https://lh3.googleusercontent.com/d/${driveId}=w${size}` : `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  return null;
}

export function isPhotoBroken(photo) {
  return !resolvePhotoSrc(photo);
}

/** Thumbnail URL for grid display (Drive-aware). Uses size 320 for ultra-fast mobile loading. */
export function getPhotoThumbnailSrc(photo, size = 320) {
  if (!photo) return null;
  
  const driveId = getDriveFileId(photo);
  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${driveId}=w${size}`;
  }

  const raw = resolvePhotoSrc(photo, size);
  if (!raw) return null;
  
  const rawDriveId = getDriveFileId(raw);
  if (rawDriveId) {
    return `https://lh3.googleusercontent.com/d/${rawDriveId}=w${size}`;
  }

  return raw;
}



/** Strip base64 blobs from photo arrays — safe for Sheets mirror (images live on Drive). */
export function stripPhotoArrayForMirror(jsonStr) {
  if (typeof jsonStr !== 'string' || !jsonStr) return jsonStr;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return jsonStr;
    const stripped = parsed.map(item => {
      if (!item || typeof item !== 'object') return item;
      const copy = { ...item };
      if (typeof copy.fileData === 'string' && copy.fileData.startsWith('data:image')) {
        delete copy.fileData;
      }
      if (typeof copy.photoUrl === 'string' && copy.photoUrl.startsWith('data:image')) {
        copy.photoUrl = '[base64-removed]';
      }
      if (typeof copy.url === 'string' && copy.url.startsWith('data:image')) {
        copy.url = '[base64-removed]';
      }
      return copy;
    });
    return JSON.stringify(stripped);
  } catch {
    return jsonStr;
  }
}

/**
 * Compress base64/dataURL image to a manageable size (max dimension and quality)
 * Optimized specifically for AI analysis (Bug, Disease, Weed, and Pest detection).
 */
export async function compressImage(dataUrl, maxDimension = 2048, quality = 0.85) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if too large
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

