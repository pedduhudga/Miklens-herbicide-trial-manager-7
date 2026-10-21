/**
 * photoCacheService.js
 * Comprehensive Offline Photo Cache Engine for Field Operations.
 * 
 * Allows agronomists in remote field locations with zero cellular coverage
 * to view all trial and observation photos from local CacheStorage and IndexedDB.
 */

import { getPhotoThumbnailSrc, resolvePhotoSrc } from '../utils/photoUtils.js';

const PHOTO_CACHE_NAME = 'trial-photos-v3.1.0';

/**
 * Check if the browser supports CacheStorage API
 */
export function isCacheStorageAvailable() {
  return typeof window !== 'undefined' && 'caches' in window;
}

/**
 * Store a photo URL in the offline CacheStorage
 */
export async function cachePhotoUrl(url) {
  if (!url || !isCacheStorageAvailable() || url.startsWith('data:') || url.startsWith('blob:')) {
    return false;
  }

  try {
    const cache = await caches.open(PHOTO_CACHE_NAME);
    // Check if already cached
    const existing = await cache.match(url);
    if (existing) return true;

    // Fetch and cache with no-cors support for CDN imagery
    const response = await fetch(url, { mode: 'cors' }).catch(() => fetch(url, { mode: 'no-cors' }));
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(url, response.clone());
      return true;
    }
    return false;
  } catch (err) {
    // Non-fatal caching failure
    return false;
  }
}

/**
 * Retrieve a locally cached photo as a Blob / ObjectURL when offline
 */
export async function getCachedPhotoUrl(url) {
  if (!url || !isCacheStorageAvailable() || url.startsWith('data:') || url.startsWith('blob:')) {
    return null;
  }

  try {
    const cache = await caches.open(PHOTO_CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      if (blob && blob.size > 0) {
        return URL.createObjectURL(blob);
      }
    }
  } catch (err) {
    console.warn('[PhotoCache] Cache retrieval error:', err);
  }
  return null;
}

/**
 * Prefetch all photos for a given list of trials into offline cache.
 * Useful before going out to rural plots with no internet reception.
 * 
 * @param {Array} trials - List of trial objects
 * @param {Function} onProgress - Callback with ({ current, total, url, percent })
 */
export async function prefetchTrialPhotos(trials = [], onProgress = null) {
  if (!Array.isArray(trials) || trials.length === 0 || !isCacheStorageAvailable()) {
    return { cachedCount: 0, totalCount: 0 };
  }

  // Gather all unique photo URLs across trial cards and observations
  const photoUrlsToCache = new Set();

  trials.forEach(trial => {
    // 1. Trial photos
    try {
      const photos = typeof trial.PhotoURLs === 'string' 
        ? JSON.parse(trial.PhotoURLs || '[]') 
        : (Array.isArray(trial.PhotoURLs) ? trial.PhotoURLs : []);
      
      photos.forEach(p => {
        if (!p || p.deleted) return;
        const thumb400 = getPhotoThumbnailSrc(p, 400);
        const thumb800 = getPhotoThumbnailSrc(p, 800);
        const resolved = resolvePhotoSrc(p);
        if (thumb400 && thumb400.startsWith('http')) photoUrlsToCache.add(thumb400);
        if (thumb800 && thumb800.startsWith('http')) photoUrlsToCache.add(thumb800);
        if (resolved && resolved.startsWith('http')) photoUrlsToCache.add(resolved);
      });
    } catch {
      // safe fallback
    }

    // 2. Efficacy observation photos
    try {
      const eff = typeof trial.EfficacyDataJSON === 'string'
        ? JSON.parse(trial.EfficacyDataJSON || '[]')
        : (Array.isArray(trial.EfficacyDataJSON) ? trial.EfficacyDataJSON : []);

      eff.forEach(obs => {
        if (!obs) return;
        if (obs.photoUrl) {
          const thumb = getPhotoThumbnailSrc(obs.photoUrl, 400);
          if (thumb && thumb.startsWith('http')) photoUrlsToCache.add(thumb);
        }
        if (Array.isArray(obs.photos)) {
          obs.photos.forEach(op => {
            const thumb = getPhotoThumbnailSrc(op, 400);
            if (thumb && thumb.startsWith('http')) photoUrlsToCache.add(thumb);
          });
        }
      });
    } catch {
      // safe fallback
    }
  });

  const urlList = Array.from(photoUrlsToCache);
  const total = urlList.length;
  let completed = 0;

  // Concurrency limit to prevent mobile browser throttling
  const CONCURRENCY = 3;
  const queue = [...urlList];

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      try {
        await cachePhotoUrl(url);
      } catch {
        // Continue queue despite individual network failure
      }
      completed++;
      if (onProgress) {
        onProgress({
          current: completed,
          total,
          percent: Math.round((completed / total) * 100),
          url
        });
      }
    }
  });

  await Promise.all(workers);

  return { cachedCount: completed, totalCount: total };
}

/**
 * Get offline storage status summary (how many photos cached)
 */
export async function getPhotoCacheStats() {
  if (!isCacheStorageAvailable()) return { count: 0, isSupported: false };

  try {
    const cache = await caches.open(PHOTO_CACHE_NAME);
    const requests = await cache.keys();
    return {
      count: requests.length,
      isSupported: true
    };
  } catch {
    return { count: 0, isSupported: true };
  }
}

/**
 * Purge cached photos to free up device storage
 */
export async function clearPhotoCache() {
  if (!isCacheStorageAvailable()) return false;
  try {
    return await caches.delete(PHOTO_CACHE_NAME);
  } catch {
    return false;
  }
}
