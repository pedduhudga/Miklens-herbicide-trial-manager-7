/**
 * Extract Google Drive file ID from URL, Drive ID string, or photo object
 */
export function getDriveFileId(photoOrUrl) {
  if (!photoOrUrl) return null;
  
  if (typeof photoOrUrl === 'object') {
    const directId = photoOrUrl.driveId || photoOrUrl.fileId || photoOrUrl.driveFileId;
    if (typeof directId === 'string' && directId.trim().length >= 5 && !directId.includes('/')) {
      return directId.trim();
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
      return size ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}` : `https://drive.google.com/uc?export=view&id=${driveId}`;
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
        return size ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}` : `https://drive.google.com/uc?export=view&id=${driveId}`;
      }
      if (u.startsWith('http://') || u.startsWith('https://')) return u;
    }
  }

  // Extract Drive ID directly from object properties
  const driveId = getDriveFileId(photo);
  if (driveId) {
    return size ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}` : `https://drive.google.com/uc?export=view&id=${driveId}`;
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
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`;
  }

  const raw = resolvePhotoSrc(photo, size);
  if (!raw) return null;
  
  const rawDriveId = getDriveFileId(raw);
  if (rawDriveId) {
    return `https://drive.google.com/thumbnail?id=${rawDriveId}&sz=w${size}`;
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

/**
 * Deduplicates photo items in a photo array based on:
 * 1. Matching Google Drive File IDs (driveId, fileId, or extracted from URL)
 * 2. Identical URLs / fileData (excluding sizing query parameters)
 * 3. Identical timestamps / dates AND identical labels/tags/filenames
 * Retains the highest-quality, healthy link among duplicates.
 */
export function deduplicatePhotoList(photos) {
  if (!Array.isArray(photos)) return [];

  // Filter out null/undefined and tombstoned/deleted items
  const validPhotos = photos.filter(p => p && (typeof p !== 'object' || !p.deleted));

  // Sort so that photos with valid remote URLs or Drive links take precedence over broken ones
  const sorted = [...validPhotos].sort((a, b) => {
    const aHasRealUrl = Boolean(a && typeof a === 'object' && a.url && !a.url.includes('[base64-removed]'));
    const bHasRealUrl = Boolean(b && typeof b === 'object' && b.url && !b.url.includes('[base64-removed]'));
    if (bHasRealUrl !== aHasRealUrl) return bHasRealUrl ? 1 : -1;

    const aResolved = resolvePhotoSrc(a);
    const bResolved = resolvePhotoSrc(b);
    const aHealthy = (aResolved && aResolved.startsWith('http')) ? 2 : (aResolved ? 1 : 0);
    const bHealthy = (bResolved && bResolved.startsWith('http')) ? 2 : (bResolved ? 1 : 0);
    return bHealthy - aHealthy;
  });

  const result = [];
  const seenDriveIds = new Set();
  const seenUrls = new Set();
  const seenTimestampSignatures = new Set();

  for (const p of sorted) {
    const driveId = getDriveFileId(p);
    const rawUrl = typeof p === 'string' ? p.trim() : (p.url || p.src || p.fileUrl || p.fileData || '').trim();
    const dateStr = typeof p === 'object' ? (p.date || p.timestamp || p.createdTime || '').trim() : '';
    const labelStr = typeof p === 'object' ? (p.label || p.tag || '').trim().toLowerCase() : '';
    const daaStr = typeof p === 'object' && p.daa !== undefined && p.daa !== null ? String(p.daa) : '';
    const fileNameStr = typeof p === 'object' ? (p.fileName || p.name || '').trim().toLowerCase() : '';

    // 1. Check Drive ID uniqueness
    if (driveId) {
      if (seenDriveIds.has(driveId)) continue;
      seenDriveIds.add(driveId);
    }

    // 2. Check normalized URL uniqueness (strip sizing parameters like &sz=w480 or &w=400)
    if (rawUrl && !rawUrl.startsWith('data:image')) {
      const cleanUrl = rawUrl.toLowerCase().replace(/(&sz=w\d+)|(&w=\d+)/g, '');
      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);
    }

    // 3. Check exact timestamp / date collision
    if (dateStr && (labelStr || fileNameStr || daaStr)) {
      const timeSig = `${dateStr}__${daaStr}__${labelStr || fileNameStr}`;
      if (seenTimestampSignatures.has(timeSig)) {
        continue; // Drop duplicate item with identical timestamp and observation
      }
      seenTimestampSignatures.add(timeSig);
    }

    result.push(p);
  }

  return result;
}


