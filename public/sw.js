// Service Worker for Miklens Trial Manager PWA
importScripts('https://unpkg.com/dexie@4.4.4/dist/dexie.js');

// Define Dexie DB inside Service Worker matching the app definition
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

const CACHE_NAME = 'trial-manager-v1.0.0';
const STATIC_CACHE = 'static-v1.0.0';
const DYNAMIC_CACHE = 'dynamic-v1.0.0';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Add critical CSS and JS files that will be generated during build
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(error => {
      console.warn('[SW] Failed to cache some static assets:', error);
    })
  );
  // Force activation immediately
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests and chrome-extension requests
  if (url.origin !== location.origin || request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update cache in background
        fetchAndCache(request);
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetchAndCache(request);
    }).catch(() => {
      // Network failed, return offline fallback for navigation requests
      if (request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});

// Helper function to fetch and cache responses
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    
    // Only cache successful responses
    if (response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      // Clone the response because it can only be consumed once
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.warn('[SW] Fetch failed:', error);
    throw error;
  }
}

// Background sync for offline data
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'background-sync-trials') {
    event.waitUntil(syncTrialData());
  }
});

async function syncTrialData() {
  try {
    console.log('[SW] Syncing trial data via Background Sync API...');
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    // Notify foreground client to trigger its sync logic if open
    let notifiedClient = false;
    for (const client of clientsList) {
      client.postMessage({ type: 'TRIGGER_SYNC' });
      notifiedClient = true;
    }
    
    // Open the local Dexie DB to process background sync directly if no foreground client handles it
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
      // Mark as uploading in Dexie so active app state updates reflect this
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

        // Successfully synced, remove from queue
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

// Push notifications (if needed in future)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const options = {
    body: event.data.text(),
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: './icons/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: './icons/icon-192x192.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Trial Manager', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling - skip waiting when requested
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});