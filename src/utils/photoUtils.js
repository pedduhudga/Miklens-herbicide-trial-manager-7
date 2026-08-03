/**
 * Resolve a displayable / AI-usable source URL from a photo entry.
 * Handles legacy shapes: string URLs, { url }, { fileData }, { driveId }, etc.
 */
export function resolvePhotoSrc(photo) {
  if (!photo) return null;
  if (typeof photo === 'string' && photo.trim()) {
    const s = photo.trim();
    if (s !== '[base64-removed]' && !s.includes('[base64-removed]')) return s;
    return null;
  }

  if (typeof photo !== 'object') return null;

  const fileData = photo.fileData;
  if (typeof fileData === 'string' && fileData.trim()) {
    const fd = fileData.trim();
    if (fd !== '[base64-removed]' && !fd.includes('[base64-removed]') && (fd.startsWith('data:') || fd.startsWith('http'))) return fd;
  }

  const url = photo.url || photo.src || photo.fileUrl || photo.photoUrl;
  if (typeof url === 'string' && url.trim()) {
    const u = url.trim();
    if (u !== '[base64-removed]' && !u.includes('[base64-removed]')) return u;
  }

  // Extract Drive ID from any property (driveId, fileId, fileName, or embedded strings)
  let driveId = photo.driveId || photo.fileId || photo.driveFileId || photo.id;
  if (!driveId && typeof photo.fileName === 'string') {
    const m = photo.fileName.match(/([a-zA-Z0-9_-]{15,})/);
    if (m) driveId = m[1];
  }
  if (!driveId && typeof url === 'string') {
    const m = url.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
    if (m) driveId = m[1];
  }

  if (typeof driveId === 'string' && driveId.length >= 10 && !driveId.includes('/')) {
    return `https://drive.google.com/uc?export=view&id=${driveId}`;
  }

  return null;
}

export function isPhotoBroken(photo) {
  return !resolvePhotoSrc(photo);
}

export function getDriveFileId(url) {
  if (typeof url !== 'string') return null;
  if (!url.includes('drive.google.com')) return null;
  const m = url.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Thumbnail URL for grid display (Drive-aware). */
export function getPhotoThumbnailSrc(photo, size = 400) {
  const raw = resolvePhotoSrc(photo);
  if (!raw) return null;
  const driveId = getDriveFileId(raw);
  if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`;
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

