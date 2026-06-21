/**
 * Resolve a displayable / AI-usable source URL from a photo entry.
 * Handles legacy shapes: string URLs, { url }, { fileData }, { driveId }, etc.
 */
export function resolvePhotoSrc(photo) {
  if (!photo) return null;
  if (typeof photo === 'string' && photo.trim()) {
    const s = photo.trim();
    return s === '[base64-removed]' ? null : s;
  }

  if (typeof photo !== 'object') return null;

  const fileData = photo.fileData;
  if (typeof fileData === 'string' && fileData.trim()) {
    const fd = fileData.trim();
    if (fd !== '[base64-removed]' && (fd.startsWith('data:') || fd.startsWith('http'))) return fd;
  }

  const url = photo.url || photo.src || photo.fileUrl || photo.photoUrl;
  if (typeof url === 'string' && url.trim()) {
    const u = url.trim();
    if (u !== '[base64-removed]') return u;
  }

  const driveId = photo.driveId || photo.fileId || photo.driveFileId;
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
