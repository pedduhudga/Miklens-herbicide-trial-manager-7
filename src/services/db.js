// src/services/db.js

const OFFLINE_ACTIONS = [
    'addTrial', 'createTrialRecord', 'updateTrialRecord', 'updateTrialStatus',
    'addFormulation', 'addIngredient', 'finalizeTrial', 'addBatchTrials',
    'updateProject', 'addBlock'
];

export async function apiCall(action, payload = {}, showOverlay = true, getAppState) {
    const state = getAppState ? getAppState() : null;

    if (!state || !state.settings || !state.settings.scriptUrl) {
        console.warn('API call attempted without proper state/settings configured:', action);
        return { _errType: 'config', message: 'Application settings not configured.' };
    }

    const queueItem = (errType, msg) => {
        if (OFFLINE_ACTIONS.includes(action)) {
            const queuedAction = {
                id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                action: action,
                payload: payload,
                timestamp: new Date().toISOString(),
                status: 'pending',
                attempts: 0
            };
            try {
                const rawQueue = localStorage.getItem('syncQueue');
                const queue = rawQueue ? JSON.parse(rawQueue) : [];
                const isDup = queue.some(item => item.action === action && JSON.stringify(item.payload) === JSON.stringify(payload));
                if (!isDup) {
                    queue.push(queuedAction);
                    try {
                        localStorage.setItem('syncQueue', JSON.stringify(queue));
                    } catch (quotaErr) {
                        if (quotaErr?.name === 'QuotaExceededError' || String(quotaErr).includes('QuotaExceededError')) {
                            console.warn('[OfflineQueue] localStorage quota exceeded — pruning oldest items');
                            const pruned = queue.slice(Math.ceil(queue.length / 2));
                            try {
                                localStorage.setItem('syncQueue', JSON.stringify(pruned));
                            } catch {
                                console.error('[OfflineQueue] Still full after pruning — clearing syncQueue');
                                localStorage.removeItem('syncQueue');
                            }
                        } else {
                            throw quotaErr;
                        }
                    }
                    if (window.updateState) {
                        window.updateState({ syncQueue: queue });
                    }
                }
            } catch (e) {
                console.error('[OfflineQueue] Failed to append to syncQueue:', e);
            }

            return { success: true, offline: true, _queuedAction: queuedAction, ...payload };
        }
        return { _errType: errType, message: msg };
    };

    const isOnline = getAppState ? getAppState().isOnline !== false : true;
    if (!isOnline) {
        return queueItem('network', 'Offline');
    }

    const getEffectiveFolderId = () => {
        if (state.auth) {
            if (state.auth.user && state.auth.user.personalDriveFolderId) {
                return state.auth.user.personalDriveFolderId;
            }
            if (state.auth.personalDriveFolderId) {
                return state.auth.personalDriveFolderId;
            }
        }
        return state.settings.folderId;
    };

    const getAuthPayload = () => {
        if (!state.auth) return undefined;
        const authObject = state.auth.user ? { ...state.auth.user, token: state.auth.token } : { ...state.auth };
        if (authObject.token && authObject.Token === undefined) {
            authObject.Token = authObject.token;
        }
        if (authObject.Token && authObject.token === undefined) {
            authObject.token = authObject.Token;
        }
        if (state.auth.username) authObject.username = state.auth.username;
        if (state.auth.password) authObject.password = state.auth.password;
        return authObject;
    };

    const unwrapResponse = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return payload;
        if (payload.data !== undefined && payload.data !== payload) return unwrapResponse(payload.data);
        if (payload.response !== undefined && payload.response !== payload) return unwrapResponse(payload.response);
        if (payload.payload !== undefined && payload.payload !== payload) return unwrapResponse(payload.payload);
        return payload;
    };

    const buildQueueError = (errType, msg) => ({ _errType: errType, message: msg });

    const processRawResult = (rawResult) => {
        const errorMsg = rawResult?.message || (rawResult?.data && rawResult.data.message) || (rawResult?.response && rawResult.response.message);
        const isError = rawResult?.status === 'error'
            || (rawResult?.data && rawResult.data.status === 'error')
            || (rawResult?.response && rawResult.response.status === 'error')
            || rawResult?.success === false
            || (rawResult?.data && rawResult.data.success === false)
            || (rawResult?.response && rawResult.response.success === false);

        if (isError) return buildQueueError('server', errorMsg || 'Unknown server error');
        return unwrapResponse(rawResult);
    };

    if (window.google && window.google.script && typeof window.google.script.run === 'object') {
        return new Promise((resolve) => {
            if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(true);
            try {
                const fullPayload = {
                    ...payload,
                    spreadsheetId: state.settings.sheetId,
                    folderId: getEffectiveFolderId(),
                    auth: getAuthPayload()
                };
                window.google.script.run
                    .withSuccessHandler((response) => resolve(processRawResult(response)))
                    .withFailureHandler((error) => resolve(buildQueueError('server', error?.message || String(error))))
                    .handleRequest({ action, payload: fullPayload });
            } catch (err) {
                resolve(buildQueueError('client', err?.message || String(err)));
            } finally {
                if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(false);
            }
        });
    }

    if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(true);

    try {
        const fullPayload = {
            ...payload,
            spreadsheetId: state.settings.sheetId,
            folderId: getEffectiveFolderId(),
        };
        const appSecretToken = payload.handshakeTokenOverride || (state.settings && state.settings.appSecretToken) || 'miklens-secure-api-token-2026';
        const res = await fetch(String(state.settings.scriptUrl).replace(/\s/g, ''), {
            method: 'POST',
            body: JSON.stringify({ action, payload: fullPayload, auth: getAuthPayload(), appSecretToken }),
        });

        if (!res.ok) {
            if (OFFLINE_ACTIONS.includes(action)) {
                return queueItem('network', `HTTP ${res.status}: ${res.statusText}`);
            }
            return buildQueueError('network', `HTTP ${res.status}: ${res.statusText}`);
        }

        const text = await res.text();
        let rawResult;
        try { rawResult = JSON.parse(text); } catch (e) { return buildQueueError('parse', 'Invalid JSON from server'); }

        return processRawResult(rawResult);
    } catch (error) {
        if (OFFLINE_ACTIONS.includes(action)) {
            return queueItem('fetch', error.message);
        }
        return buildQueueError('fetch', error.message);
    } finally {
        if (showOverlay) if(getAppState().platformAdapter?.showLoading) getAppState().platformAdapter.showLoading(false);
    }
}

function findFirstArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return null;

    for (const nested of Object.values(value)) {
        const array = findFirstArray(nested);
        if (array) return array;
    }
    return null;
}

function findObjectValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const values = Object.values(value);
    if (!values.length) return null;
    const allObjects = values.every(v => v && typeof v === 'object' && !Array.isArray(v));
    if (allObjects) return values;
    const nested = values.map(findObjectValues).find(Boolean);
    return nested || null;
}

function normalizeArrayResponse(response, key) {
    if (Array.isArray(response)) return response;
    if (!response || typeof response !== 'object') return [];
    if (Array.isArray(response[key])) return response[key];
    if (Array.isArray(response.data)) return response.data;
    if (response.data && Array.isArray(response.data[key])) return response.data[key];
    if (response.data && response.data.response) {
        const nested = normalizeArrayResponse(response.data.response, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.data && response.data.payload) {
        const nested = normalizeArrayResponse(response.data.payload, key);
        if (Array.isArray(nested)) return nested;
    }
    if (Array.isArray(response.result)) return response.result;
    if (response.result && Array.isArray(response.result[key])) return response.result[key];
    if (response.result && response.result.response) {
        const nested = normalizeArrayResponse(response.result.response, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.result && response.result.payload) {
        const nested = normalizeArrayResponse(response.result.payload, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.payload && Array.isArray(response.payload)) return response.payload;
    if (response.payload && Array.isArray(response.payload[key])) return response.payload[key];
    if (response.payload && response.payload.response) {
        const nested = normalizeArrayResponse(response.payload.response, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.payload && response.payload.data) {
        const nested = normalizeArrayResponse(response.payload.data, key);
        if (Array.isArray(nested)) return nested;
    }
    if (response.response && Array.isArray(response.response[key])) return response.response[key];
    if (response.response) {
        const nested = normalizeArrayResponse(response.response, key);
        if (Array.isArray(nested)) return nested;
    }

    const keys = Object.keys(response);
    if (keys.length === 1 && Array.isArray(response[keys[0]])) return response[keys[0]];

    const foundArray = findFirstArray(response);
    if (Array.isArray(foundArray)) return foundArray;

    const foundObjectValues = findObjectValues(response[key]) || findObjectValues(response.data) || findObjectValues(response.result) || findObjectValues(response.payload) || findObjectValues(response);
    if (Array.isArray(foundObjectValues)) return foundObjectValues;

    if (response._errType || response.message || response.error) {
        console.warn('Received non-array API response for list fetch:', { key, response });
    } else {
        console.warn('Unable to normalize API response to array:', { key, response });
    }
    return [];
}

export const getAllData = (payload, getAppState, showOverlay = true) => apiCall('getAllData', payload, showOverlay, getAppState);
export const getTrials = (payload, getAppState, showOverlay = true) => apiCall('getTrials', payload, showOverlay, getAppState).then(res => normalizeArrayResponse(res, 'trials'));
export const addTrial = (payload, getAppState, showOverlay = true) => apiCall('addTrial', payload, showOverlay, getAppState);
export const updateTrial = (payload, getAppState, showOverlay = true) => apiCall('updateTrialRecord', payload, showOverlay, getAppState);
export const deleteTrial = (payload, getAppState, showOverlay = true) => apiCall('deleteTrialRecord', payload, showOverlay, getAppState);
export const getProjects = (payload, getAppState, showOverlay = true) => apiCall('getProjects', payload, showOverlay, getAppState).then(res => normalizeArrayResponse(res, 'projects'));
export const addProject = (payload, getAppState, showOverlay = true) => apiCall('addProject', payload, showOverlay, getAppState);
export const updateProject = (payload, getAppState, showOverlay = true) => apiCall('updateProject', payload, showOverlay, getAppState);
export const addBlock = (payload, getAppState, showOverlay = true) => apiCall('addBlock', payload, showOverlay, getAppState);
export const addFormulation = (payload, getAppState, showOverlay = true) => apiCall('addFormulation', payload, showOverlay, getAppState);
export const addIngredient = (payload, getAppState, showOverlay = true) => apiCall('addIngredient', payload, showOverlay, getAppState);
export const finalizeTrial = (payload, getAppState, showOverlay = true) => apiCall('finalizeTrial', payload, showOverlay, getAppState);
export const addBatchTrials = (payload, getAppState, showOverlay = true) => apiCall('addBatchTrials', payload, showOverlay, getAppState);
export const updateTrialStatus = (payload, getAppState, showOverlay = true) => apiCall('updateTrialStatus', payload, showOverlay, getAppState);
export const upsertEmbedding = (payload, getAppState, showOverlay = true) => apiCall('upsertEmbedding', payload, showOverlay, getAppState);
export const loadSmartIndex = (payload, getAppState, showOverlay = true) => apiCall('loadSmartIndex', payload, showOverlay, getAppState);
export const clearSmartEmbeddings = (payload, getAppState, showOverlay = true) => apiCall('clearSmartEmbeddings', payload, showOverlay, getAppState);

export const getFormulations = (payload, getAppState, showOverlay = true) => apiCall('getFormulations', payload, showOverlay, getAppState).then(res => normalizeArrayResponse(res, 'formulations'));
export const deleteFormulation = (payload, getAppState, showOverlay = true) => apiCall('deleteFormulation', payload, showOverlay, getAppState);
export const getIngredients = (payload, getAppState, showOverlay = true) => apiCall('getIngredients', payload, showOverlay, getAppState).then(res => normalizeArrayResponse(res, 'ingredients'));
export const deleteIngredient = (payload, getAppState, showOverlay = true) => apiCall('deleteIngredient', payload, showOverlay, getAppState);
export const getOrganisations = (payload, getAppState, showOverlay = true) => apiCall('getOrganisations', payload, showOverlay, getAppState).then(res => normalizeArrayResponse(res, 'organisations'));
export const addOrganisation = (payload, getAppState, showOverlay = true) => apiCall('addOrganisation', payload, showOverlay, getAppState);
export const deleteOrganisation = (payload, getAppState, showOverlay = true) => apiCall('deleteOrganisation', payload, showOverlay, getAppState);
export const deleteProject = (payload, getAppState, showOverlay = true) => apiCall('deleteProject', payload, showOverlay, getAppState);

export const loginUser = (payload, getAppState, showOverlay = true) => apiCall('login', payload, showOverlay, getAppState);
export const getUsers = (payload, getAppState, showOverlay = true) => apiCall('getUsersList', payload, showOverlay, getAppState);
export const updateUser = (payload, getAppState, showOverlay = true) => apiCall('adminUpdateUserConfig', payload, showOverlay, getAppState);
