// Service Worker for Miklens Trial Manager PWA
// Version: 3.0.0 - Advanced PWA Engine with Navigation Preload, Immutable Chunk Cache & Instant Offline SPA

const CACHE_NAME = 'trial-manager-v3.0.0';
const STATIC_CACHE = 'static-v3.0.0';
const DYNAMIC_CACHE = 'dynamic-v3.0.0';
const IMAGE_CACHE = 'images-v3.0.0';

// IndexedDB setup via Dexie for offline data
importScripts('https://unpkg.com/dexie@4.4.4/dist/dexie.js');

const db = new self.Dexie('MiklensTrialManagerDexieDB');
db.version(1).stores({
  trials: 'ID, ProjectID, Date, LastModified',
  projects: 'ID',
  formulations: 'ID',
  ingredients: 'ID',
  organisations: 'ID',
  blocks: 'ID',
  syncQueue: 'id, entityType, entityId, timestamp, status',
  trialPhotos: 'ID',
  conflicts: 'id, entityType, entityId, resolved',
  settings: 'ID'
});

// Assets injected during build for full offline support and instant loading
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Install event - precache all application bundles with error resilience
self.addEventListener('install', (event) => {
  console.log('[SW] Installing advanced service worker v3.0.0');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      console.log(`[SW] Precaching ${STATIC_ASSETS.length} application assets for instant offline speed`);
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (err) {
          // Non-fatal: individual asset miss does not fail overall SW install
          console.warn('[SW] Non-fatal precache item skipped:', url, err.message);
        }
      }
    })
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
  console.log('[SW] Service worker installed and activated');
});

// Activate event - cleanup old caches & enable Navigation Preload
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v3.0.0');
  event.waitUntil(
    (async () => {
      // Enable Navigation Preload if supported for zero-latency page loads
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
          console.log('[SW] Navigation Preload enabled');
        } catch (e) {
          console.warn('[SW] Navigation Preload not supported/enabled:', e);
        }
      }

      // Purge all outdated cache versions
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== STATIC_CACHE && 
            cacheName !== DYNAMIC_CACHE && 
            cacheName !== IMAGE_CACHE
          ) {
            console.log('[SW] Purging old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      // Take control of all open clients immediately
      console.log('[SW] Claiming all clients');
      await self.clients.claim();
    })()
  );
});

// Fetch event - intelligent multi-tier caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip non-http(s)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // CRITICAL: Bypass Service Worker for external media / Google Drive / CDN imagery / tile layers
  // Letting the browser fetch them natively avoids CORS failures, opaque caching rejections, and net::ERR_FAILED
  if (
    url.hostname.includes('drive.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('images.weserv.nl') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    (url.hostname.includes('googleapis.com') && !url.pathname.includes('/v1/'))
  ) {
    return; // Native browser fetch!
  }

  // 1. Navigation requests (HTML / SPA route changes) - Zero latency via Navigation Preload or Network First with instant SPA fallback
  if (isNavigationRequest(request, url)) {
    event.respondWith(handleNavigationRequest(event, request));
    return;
  }

  // 2. Content-hashed static assets (/assets/*-[hash].js|css) - Pure Cache First (Super Speed, 0ms)
  if (isImmutableHashedAsset(url)) {
    event.respondWith(cacheFirstImmutable(request, STATIC_CACHE));
    return;
  }

  // 3. Other static assets (icons, fonts, static scripts) - Cache First with background revalidation
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4. Images - Cache First
  if (isImage(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // 5. API requests - Network First
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // 6. Other requests - Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

// Helper: Check if request is navigation / HTML
function isNavigationRequest(request, url) {
  return request.mode === 'navigate' ||
         url.pathname === '/' ||
         url.pathname.endsWith('/index.html') ||
         request.headers.get('accept')?.includes('text/html');
}

// Helper: Check if asset is an immutable hashed Vite bundle
function isImmutableHashedAsset(url) {
  return url.pathname.includes('/assets/') && /\-[A-Za-z0-9_\-]{8,}\.(js|css|woff2|png|svg)$/.test(url.pathname);
}

// Handler for Navigation requests using Navigation Preload
async function handleNavigationRequest(event, request) {
  try {
    // 1. Check if preload response is available from Navigation Preload
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
      caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, preloadResponse.clone())).catch(() => {});
      return preloadResponse;
    }

    // 2. Try network fetch
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone()).catch(() => {});
      return networkResponse;
    }
  } catch (err) {
    console.log('[SW] Network navigation failed, falling back to cache:', request.url);
  }

  // 3. Instant fallback to cached index.html for SPA offline routing
  const cachedIndex = await caches.match('./index.html') || await caches.match('./') || await caches.match('/index.html');
  if (cachedIndex) {
    return cachedIndex;
  }

  return new Response('Miklens Trial Manager is offline. Please connect to the internet to load new data.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Strategy: Cache First for immutable content-hashed Vite chunks (/assets/index-*.js)
async function cacheFirstImmutable(request, cacheName = STATIC_CACHE) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse; // 0ms Instant Response!
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Immutable fetch failed:', request.url);
    throw error;
  }
}

// Helper: Check if request is for static asset
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot', '.svg'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         url.pathname.includes('/static/') ||
         url.pathname.includes('/icons/');
}

// Helper: Check if request is for image
function isImage(url) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];
  return imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext)) ||
         url.href.includes('data:image') ||
         url.href.includes('blob:') ||
         url.pathname.includes('/thumbnail') ||
         url.search.includes('sz=w');
}

// Helper: Check if request is API call
function isApiRequest(url) {
  return url.href.includes('googleapis.com') ||
         url.href.includes('firebaseio.com') ||
         url.href.includes('script.google.com') ||
         url.href.includes('/api/');
}

// Strategy: Cache First - Check cache, fallback to network
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Update cache in background
    fetchAndCache(request, cacheName);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Cache First failed for:', request.url);
    if (isImage(new URL(request.url))) {
      const fallback = await caches.match('./favicon.svg');
      if (fallback) return fallback;
    }
    throw error;
  }
}

// Strategy: Network First - Try network, fallback to cache
async function networkFirst(request, cacheName = DYNAMIC_CACHE) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Strategy: Stale While Revalidate - Return cached, update in background
async function staleWhileRevalidate(request, cacheName = DYNAMIC_CACHE) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.ok) {
      // Clone BEFORE caching so the original body stream is not consumed
      const responseToCache = networkResponse.clone();
      caches.open(cacheName).then(cache => {
        cache.put(request, responseToCache);
      }).catch(() => {});
    }
    return networkResponse;
  }).catch((err) => {
    if (cachedResponse) return cachedResponse;
    // Return valid response object instead of null to prevent ServiceWorker FetchEvent unhandled rejection
    return new Response('Network error', { 
      status: 503, 
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  });
  
  // Return cached immediately, update if network succeeds
  return cachedResponse || fetchPromise;
}

// Helper: Fetch and cache a request
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn('[SW] Fetch failed:', error);
  }
}

// Background Sync for offline data
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag.startsWith('background-sync')) {
    event.waitUntil(syncTrialData());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'New update available',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    tag: data.tag || 'default',
    renotify: true,
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Trial Manager', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});

// Message handling from main app
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};
  
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'CACHE_URL') {
    // Allow app to request caching of specific URLs
    caches.open(DYNAMIC_CACHE).then(cache => {
      cache.add(data.url);
    });
  } else if (type === 'CLEAR_CACHE') {
    // Clear all caches (e.g., on logout or data reset)
    caches.keys().then(names => Promise.all(names.map(c => caches.delete(c))));
  } else if (type === 'GET_VERSION') {
    // Return current SW version
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncTrialData());
  }
});

async function syncTrialData() {
  try {
    console.log('[SW] Syncing trial data via Background Sync API...');
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    // Notify foreground client to trigger its sync logic
    for (const client of clientsList) {
      client.postMessage({ type: 'TRIGGER_SYNC' });
    }
    
    // Process background sync directly if needed
    await db.open();
    const appSettingsRecord = await db.settings.get('appSettings');
    if (!appSettingsRecord || !appSettingsRecord.settings?.scriptUrl) {
      console.log('[SW] No settings found. Postponing background sync.');
      return;
    }

    const { settings, auth } = appSettingsRecord;
    const pendingItems = await db.syncQueue.toArray();
    const filterPending = pendingItems.filter(item => item.status === 'pending' || item.status === 'failed');

    if (filterPending.length === 0) {
      console.log('[SW] No pending items in syncQueue.');
      return;
    }

    console.log(`[SW] Found ${filterPending.length} pending items to sync directly.`);

    for (const item of filterPending) {
      await db.syncQueue.update(item.id, { status: 'uploading', lastAttempt: new Date().toISOString() });
      clientsList.forEach(c => c.postMessage({ type: 'SYNC_PROGRESS', id: item.id, status: 'uploading' }));

      const effectiveFolderId = (auth && (auth.user?.personalDriveFolderId || auth.personalDriveFolderId)) || settings.folderId;
      let authObject = undefined;
      if (auth) {
        authObject = auth.user ? { ...auth.user, token: auth.token } : { ...auth };
        if (authObject.token && authObject.Token === undefined) authObject.Token = authObject.token;
        if (authObject.Token && authObject.token === undefined) authObject.token = authObject.Token;
      }

      const fullPayload = {
        ...item.payload,
        spreadsheetId: settings.sheetId,
        folderId: effectiveFolderId,
        auth: authObject
      };

      const body = JSON.stringify({
        action: item.action,
        payload: fullPayload,
        appSecretToken: settings.appSecretToken
      });

      try {
        const response = await fetch(settings.scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const resJson = await response.json();
        const isError = resJson?.status === 'error' || resJson?.success === false || resJson?.data?.status === 'error';

        if (isError) {
          const errorMsg = resJson?.message || 'Server error';
          throw new Error(errorMsg);
        }

        await db.syncQueue.delete(item.id);
        clientsList.forEach(c => c.postMessage({ type: 'SYNC_SUCCESS', id: item.id }));
        console.log(`[SW] Successfully synced item: ${item.action}`);
      } catch (err) {
        console.error('[SW] Sync item failed:', item.id, err);
        const nextAttempts = (item.attempts || 0) + 1;
        const status = nextAttempts >= 5 ? 'failed' : 'pending';
        await db.syncQueue.update(item.id, {
          status,
          attempts: nextAttempts,
          lastError: err.message || String(err)
        });
        clientsList.forEach(c => c.postMessage({ type: 'SYNC_FAILED', id: item.id, error: err.message }));
      }
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

console.log('[SW] Service Worker loaded');