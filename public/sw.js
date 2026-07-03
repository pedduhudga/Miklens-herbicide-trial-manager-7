// Service Worker for Miklens Trial Manager PWA
// Version: 2.0.0 - Enhanced caching strategies

const CACHE_NAME = 'trial-manager-v2.0.0';
const STATIC_CACHE = 'static-v2.0.0';
const DYNAMIC_CACHE = 'dynamic-v2.0.0';
const IMAGE_CACHE = 'images-v2.0.0';

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

// Core assets to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  './manifest.json',
  './favicon.svg',
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2.0.0');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Precaching core assets');
      return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(error => {
      console.warn('[SW] Failed to cache some static assets:', error);
    })
  );
  // Activate immediately
  self.skipWaiting();
  console.log('[SW] Service worker installed and ready');
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Clean up old version caches
          if (cacheName !== STATIC_CACHE && 
              cacheName !== DYNAMIC_CACHE && 
              cacheName !== IMAGE_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming all clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Handle different resource types with different strategies
  if (isStaticAsset(url)) {
    // Static assets (JS, CSS, fonts) - Cache First
    event.respondWith(cacheFirst(request));
  } else if (isImage(url)) {
    // Images - Cache First with network fallback
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else if (isApiRequest(url)) {
    // API requests - Network First (always try fresh)
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
  } else {
    // Navigation and other requests - Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
  }
});

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
         url.href.includes('blob:');
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
    // Return offline fallback for images
    if (isImage(new URL(request.url))) {
      return caches.match('/icons/icon-192x192.png');
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
    if (networkResponse.ok) {
      caches.open(cacheName).then(cache => {
        cache.put(request, networkResponse.clone());
      });
    }
    return networkResponse;
  }).catch(() => null);
  
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