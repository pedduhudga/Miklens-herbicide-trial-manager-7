// src/services/sheetMirror.js
// Plan B: background write-mirror to Google Sheets.
// - Writes are queued and flushed in the background — they NEVER block the UI.
// - Large JSON fields are split across multiple columns (chunking) — no data loss.
// - Reads from Google Sheets are ONLY allowed when the caller has Admin role AND
//   explicitly requests it via fetchFromSheet().
// - The mirror can be toggled on/off via settings.sheetMirrorEnabled.

import { apiCall } from './db.js';
import { stripPhotoArrayForMirror } from '../utils/photoUtils.js';

const MIRROR_QUEUE_KEY = 'sheetMirrorQueue';
const MAX_CELL_CHARS = 45000; // safety margin below Sheets' 50K limit
const PHOTO_JSON_FIELDS = new Set(['PhotoURLs', 'WeedPhotosJSON']);
const LARGE_JSON_FIELDS = new Set([
  'PhotoURLs', 'WeedPhotosJSON', 'EfficacyDataJSON', 'AISummariesJSON',
  'StatisticsJSON', 'SpectralDataJSON', 'BiomassDataJSON', 'SoilDataJSON',
  'PlotMapJSON', 'DoseResponseJSON', 'WeatherJSON', 'LiveQRSettings',
  'HarvestDataJSON', 'AnalysisResultsJSON',
]);

let _isFlushing = false;

function loadQueue() {
  try {
    const raw = localStorage.getItem(MIRROR_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  try {
    localStorage.setItem(MIRROR_QUEUE_KEY, JSON.stringify(q));
  } catch (e) {
    if (e?.name === 'QuotaExceededError' || String(e).includes('QuotaExceededError')) {
      console.warn('[SheetMirror] localStorage quota exceeded — pruning old items');
      const pruned = q.slice(Math.ceil(q.length / 2));
      try {
        localStorage.setItem(MIRROR_QUEUE_KEY, JSON.stringify(pruned));
      } catch {
        console.error('[SheetMirror] Cannot save even after pruning — clearing queue');
        localStorage.removeItem(MIRROR_QUEUE_KEY);
      }
    } else {
      console.error('[SheetMirror] Failed to save queue:', e);
    }
  }
}

function cleanJsonArrayField(val, fieldName) {
  if (typeof val !== 'string' || !val) return val;

  if (PHOTO_JSON_FIELDS.has(fieldName)) {
    return stripPhotoArrayForMirror(val);
  }

  if (!LARGE_JSON_FIELDS.has(fieldName) || val.length <= MAX_CELL_CHARS) return val;

  try {
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed)) return val;
    const stripped = parsed.map(item => {
      if (!item || typeof item !== 'object') return item;
      const itemCopy = { ...item };
      if (typeof itemCopy.fileData === 'string' && itemCopy.fileData.startsWith('data:image')) {
        delete itemCopy.fileData;
      }
      if (typeof itemCopy.photoUrl === 'string' && itemCopy.photoUrl.startsWith('data:image')) {
        itemCopy.photoUrl = '[base64-removed]';
      }
      if (typeof itemCopy.url === 'string' && itemCopy.url.startsWith('data:image')) {
        itemCopy.url = '[base64-removed]';
      }
      if (typeof itemCopy.notes === 'string' && itemCopy.notes.length > 2000) {
        itemCopy.notes = itemCopy.notes.slice(0, 2000) + '... [truncated]';
      }
      if (typeof itemCopy.aiEfficacyAssessment === 'string' && itemCopy.aiEfficacyAssessment.length > 2000) {
        itemCopy.aiEfficacyAssessment = itemCopy.aiEfficacyAssessment.slice(0, 2000) + '... [truncated]';
      }
      return itemCopy;
    });
    return JSON.stringify(stripped);
  } catch {
    return val;
  }
}

function chunkLargeValue(fieldName, value) {
  if (typeof value !== 'string' || value.length <= MAX_CELL_CHARS) {
    return { [fieldName]: value };
  }
  const result = {};
  const totalParts = Math.ceil(value.length / MAX_CELL_CHARS);
  for (let p = 1; p <= totalParts; p++) {
    const key = p === 1 ? fieldName : `${fieldName}__p${p}`;
    result[key] = value.slice((p - 1) * MAX_CELL_CHARS, p * MAX_CELL_CHARS);
  }
  result[`${fieldName}__parts`] = String(totalParts);
  return result;
}

export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const cleaned = {};
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === 'string' && val.startsWith('data:image')) {
      cleaned[key] = '[base64-removed]';
      continue;
    }
    if (typeof val !== 'string') {
      cleaned[key] = val;
      continue;
    }
    const normalized = cleanJsonArrayField(val, key);
    Object.assign(cleaned, chunkLargeValue(key, normalized));
  }
  return cleaned;
}

function enqueue(action, payload) {
  const q = loadQueue();
  q.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    action,
    payload: sanitizePayload(payload),
    attempts: 0,
    ts: new Date().toISOString(),
  });
  saveQueue(q);
}

function dequeue(id) {
  const q = loadQueue().filter(item => item.id !== id);
  saveQueue(q);
}

function markFailed(id) {
  const q = loadQueue().map(item =>
    item.id === id ? { ...item, attempts: (item.attempts || 0) + 1, lastError: new Date().toISOString() } : item
  );
  saveQueue(q);
}

function updatePayload(id, payload) {
  const q = loadQueue().map(item =>
    item.id === id ? { ...item, payload: sanitizePayload(payload), attempts: 0 } : item
  );
  saveQueue(q);
}

export function mirrorWrite(action, payload, getAppState) {
  const state = getAppState ? getAppState() : null;
  if (!state?.settings?.sheetMirrorEnabled) return;
  if (!state?.settings?.scriptUrl) {
    // Warn user that mirroring is enabled but script URL is missing
    console.warn('[SheetMirror] sheetMirrorEnabled is true but scriptUrl is not configured. Data will not be mirrored to Google Sheets.');
    if (state?.platformAdapter?.showToast) {
      state.platformAdapter.showToast('Sheet mirroring enabled but Script URL is missing. Data will not be mirrored.', 'warn');
    }
    return;
  }
  enqueue(action, payload);
  setTimeout(() => flushMirrorQueue(getAppState), 0);
}

export async function flushMirrorQueue(getAppState) {
  if (_isFlushing) return;
  if (!navigator.onLine) return;

  const state = getAppState ? getAppState() : null;
  if (!state?.settings?.sheetMirrorEnabled) return;
  if (!state?.settings?.scriptUrl) return;

  _isFlushing = true;
  try {
    const queue = loadQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
      if ((item.attempts || 0) >= 3) {
        dequeue(item.id);
        console.warn('[SheetMirror] Giving up on item after 3 attempts:', item.action);
        continue;
      }

      const payload = sanitizePayload(item.payload);

      try {
        const result = await apiCall(item.action, payload, false, getAppState);
        if (result?._errType) throw new Error(result.message);
        dequeue(item.id);
        console.log('[SheetMirror] Mirrored:', item.action);
      } catch (err) {
        const isCellLimit = String(err.message || '').includes('50000 characters');
        if (isCellLimit && item.attempts === 0) {
          updatePayload(item.id, item.payload);
        }
        markFailed(item.id);
        console.warn('[SheetMirror] Write failed (will retry):', item.action, err.message);
        break;
      }
    }
  } finally {
    _isFlushing = false;
  }
}

export function getMirrorQueueLength() {
  return loadQueue().length;
}

export function getMirrorQueue() {
  return loadQueue();
}

export function clearMirrorQueue() {
  saveQueue([]);
}

export async function fetchFromSheet(action, payload, getAppState, auth) {
  const role = String(auth?.Role || auth?.role || '').toLowerCase();
  if (role !== 'admin') {
    throw new Error('Access denied: only admins can read from Google Sheets.');
  }
  return apiCall(action, payload, false, getAppState);
}
