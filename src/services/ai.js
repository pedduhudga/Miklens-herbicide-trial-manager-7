// src/services/ai.js
// Modern, clean Google Gemini & Multi-Provider AI Service
// Handles model rotation, API key cycling, quota backoff, category-isolated inference,
// and complete plant pathology, entomology, and weed science computer vision.

import { GoogleGenAI, Type } from '@google/genai';
import { AVAILABLE_GEMINI_MODELS, DEFAULT_GEMINI_MODEL, GEMINI_FALLBACK_MODELS } from '../utils/aiConstants.js';
import { analyzeWeedCover } from '../utils/imageAnalysis.js';
import { validateAIAnalysisCategory } from '../utils/aiCategoryIsolation.js';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';

const GEMINI_MODEL_PRIORITY = GEMINI_FALLBACK_MODELS;

/**
 * Reset all Gemini quota/block state.
 * Call whenever new API keys are saved, or to clear stale error state.
 */
export function resetGeminiState() {
  if (typeof window === 'undefined') return;

  let savedBlocks = {};
  try {
    const raw = localStorage.getItem('ai_blocked_models');
    if (raw) savedBlocks = JSON.parse(raw) || {};
  } catch (e) {
    savedBlocks = {};
  }

  const activeBlocks = {};
  const now = Date.now();
  for (const key in savedBlocks) {
    if (savedBlocks[key] > now) {
      activeBlocks[key] = savedBlocks[key];
    }
  }

  window._geminiBlockedModels = activeBlocks;
  try {
    localStorage.setItem('ai_blocked_models', JSON.stringify(activeBlocks));
  } catch (e) {}

  window.geminiQuotaBackoffUntil = 0;
  window._lastAiUiErrorAt = 0;
  window._activeApiModelOverride = null;
  console.log('[AI] Gemini block state initialized (active blocks persisted).');
}

export function getActiveApiModel(getAppState) {
  if (typeof window !== 'undefined' && window._activeApiModelOverride) {
    return window._activeApiModelOverride;
  }
  let settings = {};
  if (getAppState) {
    settings = getAppState().settings || {};
  } else if (typeof window !== 'undefined' && window.appState) {
    settings = window.appState.settings || {};
  } else {
    try {
      const saved = localStorage.getItem('appSettings');
      if (saved) settings = JSON.parse(saved) || {};
    } catch (e) {}
  }
  return settings.apiModel || settings.selectedModel || DEFAULT_GEMINI_MODEL;
}

function getGeminiQuotaBlockKey(model, getAppState) {
  let settings = {};
  if (getAppState) {
    settings = getAppState().settings || {};
  } else {
    try {
      const saved = localStorage.getItem('appSettings');
      if (saved) settings = JSON.parse(saved) || {};
    } catch (e) {}
  }
  const apiKeyIndex = settings.currentApiKeyIndex || 0;
  return `${model}_key${apiKeyIndex}`;
}

export function getGenAIClient(getAppState) {
  let settings = {};
  if (getAppState) {
    settings = getAppState().settings || {};
  } else {
    try {
      const saved = localStorage.getItem('appSettings');
      if (saved) settings = JSON.parse(saved) || {};
    } catch (e) {}
  }
  const apiKeys = settings.apiKeys || [];
  const keyIndex = settings.currentApiKeyIndex || 0;
  const apiKey = apiKeys[keyIndex];
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function rotateApiModel(getAppState) {
  const settings = getAppState ? (getAppState().settings || {}) : {};
  const currentModel = getActiveApiModel(getAppState);
  const currentIndex = GEMINI_MODEL_PRIORITY.indexOf(currentModel);
  let nextModel;
  if (currentIndex === -1 || currentIndex >= GEMINI_MODEL_PRIORITY.length - 1) {
    nextModel = GEMINI_MODEL_PRIORITY[0];
  } else {
    nextModel = GEMINI_MODEL_PRIORITY[currentIndex + 1];
  }

  if (typeof window !== 'undefined') {
    window._activeApiModelOverride = nextModel;
    console.log(`[AI] Rotating model override to: ${nextModel}`);
    if (window.updateState) {
      window.updateState({ settings: { ...settings, apiModel: nextModel } });
    }
  }
  return true;
}

function rotateApiKey(getAppState) {
  const settings = getAppState ? (getAppState().settings || {}) : {};
  const keys = settings.apiKeys || [];
  if (keys.length <= 1) return false;

  const nextIndex = ((settings.currentApiKeyIndex || 0) + 1) % keys.length;
  if (typeof window !== 'undefined' && window.updateState) {
    window.updateState({ settings: { ...settings, currentApiKeyIndex: nextIndex } });
  }
  console.log(`[AI] Rotated to API key index: ${nextIndex}`);
  return true;
}

function extractResponseText(response) {
  if (!response) return '';
  if (typeof response.text === 'function') return response.text();
  if (typeof response.text === 'string') return response.text;
  if (response.candidates && response.candidates[0]?.content?.parts) {
    return response.candidates[0].content.parts.map(p => p.text || '').join('');
  }
  if (typeof response === 'string') return response;
  return JSON.stringify(response);
}

/**
 * Executes a Gemini API function with automatic retry, key rotation, and model fallback.
 */
export async function _callGeminiApiWithRetries(apiCallFunction, getAppState, retries = 0) {
  const genAI = getGenAIClient(getAppState);
  if (!genAI) {
    throw new Error('NO_API_KEY: No Google Gemini API key configured. Please add one in Settings.');
  }

  const currentModel = getActiveApiModel(getAppState);
  const currentBlockKey = getGeminiQuotaBlockKey(currentModel, getAppState);
  const blockedModels = (typeof window !== 'undefined' ? window._geminiBlockedModels : {}) || {};

  if (blockedModels[currentBlockKey] && Date.now() < blockedModels[currentBlockKey]) {
    console.warn(`[AI] Model ${currentModel} is temporarily blocked due to rate limiting. Rotating...`);
    if (rotateApiModel(getAppState)) {
      return _callGeminiApiWithRetries(apiCallFunction, getAppState, retries + 1);
    }
  }

  try {
    return await apiCallFunction(genAI);
  } catch (error) {
    const errorMsg = String(error?.message || '').toLowerCase();
    const status = error?.status || error?.statusCode || (errorMsg.includes('429') ? 429 : 0);

    // Handle Quota / Rate Limiting (429)
    if (status === 429 || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted')) {
      console.warn(`[AI] Rate limit hit on ${currentModel}. Backing off and rotating...`);
      blockedModels[currentBlockKey] = Date.now() + 60000;
      if (typeof window !== 'undefined') {
        window._geminiBlockedModels = blockedModels;
        try {
          localStorage.setItem('ai_blocked_models', JSON.stringify(blockedModels));
        } catch (e) {}
      }

      if (retries < 3) {
        if (rotateApiKey(getAppState) || rotateApiModel(getAppState)) {
          await new Promise(res => setTimeout(res, 1000));
          return _callGeminiApiWithRetries(apiCallFunction, getAppState, retries + 1);
        }
      }
      throw new Error('QUOTA_EXCEEDED: All Gemini models and API keys have reached rate limits. Please try again in a few moments.');
    }

    // Handle Model Overloaded (503)
    if (status === 503 || errorMsg.includes('overloaded') || errorMsg.includes('unavailable')) {
      if (retries < 2) {
        await new Promise(res => setTimeout(res, 2000 * (retries + 1)));
        return _callGeminiApiWithRetries(apiCallFunction, getAppState, retries + 1);
      }
      if (rotateApiModel(getAppState)) {
        return _callGeminiApiWithRetries(apiCallFunction, getAppState, retries + 1);
      }
    }

    // Handle 404 / Model Deprecated
    if (status === 404 || errorMsg.includes('not found') || errorMsg.includes('deprecated')) {
      console.warn(`[AI] Model ${currentModel} not found or deprecated. Rotating...`);
      if (rotateApiModel(getAppState)) {
        return _callGeminiApiWithRetries(apiCallFunction, getAppState, retries + 1);
      }
    }

    throw error;
  }
}

export function callGeminiApi(description, apiCallFunction, getAppState) {
  return _callGeminiApiWithRetries(apiCallFunction, getAppState);
}

/**
 * Enhanced AI analysis wrapper that ensures category isolation.
 */
export async function analyzeWithCategoryContext(analysisType, data, category, getAppState) {
  const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category '${category}' for AI analysis. Must be one of: ${validCategories.join(', ')}`);
  }

  const categoryFilteredData = Array.isArray(data)
    ? data.filter(item => {
        const itemCategory = item?.Category || item?.category;
        return itemCategory === category || (!itemCategory && category === 'herbicide');
      })
    : data;

  console.log(`[AI Service] Category isolation: Processing ${Array.isArray(categoryFilteredData) ? categoryFilteredData.length : 'single'} ${category} record(s)`);

  return {
    type: analysisType,
    category: category,
    data: categoryFilteredData,
    timestamp: new Date().toISOString()
  };
}

/**
 * Identify visible weed species from a base64 photo.
 */
export async function identifyWeedsFromPhoto(fileData, mimeType = 'image/jpeg') {
  try {
    if (!fileData || typeof fileData !== 'string' || !fileData.includes(',')) {
      throw new Error("Invalid image data provided for identification.");
    }
    const prompt = `You are an expert botanist specializing in weed identification for agriculture. Analyze this photo and identify ALL visible weed species. For EACH different weed species you can see:
1. Provide the scientific name
2. List common names
3. Give a confidence score (0-1) for your identification
4. Categorize the growth stage

IMPORTANT: Identify EVERY distinct weed species visible in the photo, not just the most prominent one. List them all in the identifications array.

Respond ONLY with a single minified JSON object in this format: {"identifications": [{"name": "Scientific Name", "commonNames": ["Common Name 1", ...], "confidence": 0.95, "growthStage": "Seedling|Vegetative|Flowering|Mature"}]}`;

    const geminiCall = (genAI) => genAI.models.generateContent({
      model: getActiveApiModel(),
      contents: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: fileData.split(',')[1] } }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identifications: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  commonNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                  confidence: { type: Type.NUMBER },
                  growthStage: { type: Type.STRING }
                },
                required: ["name", "commonNames", "confidence", "growthStage"]
              }
            }
          },
          required: ["identifications"]
        }
      }
    });

    const response = await callGeminiApi('Identifying weeds from photo', geminiCall);
    const text = extractResponseText(response);
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    return parsed?.identifications || [];
  } catch (err) {
    console.warn('[identifyWeedsFromPhoto] Gemini failed, trying multiProviderAI fallback...', err.message);
    try {
      const { identifyWeedFromPhoto } = await import('./multiProviderAI.js');
      const result = await identifyWeedFromPhoto(fileData, 'herbicide');
      if (result && Array.isArray(result.detections)) {
        return result.detections.map(d => ({
          name: d.scientificName || d.name || 'Unknown species',
          commonNames: d.commonNames || [d.name].filter(Boolean),
          confidence: d.confidence || 0.8,
          growthStage: d.growthStage || 'Vegetative'
        }));
      }
    } catch (fallbackErr) {
      console.warn('[identifyWeedsFromPhoto] Fallback also failed:', fallbackErr);
    }
    return [];
  }
}

/**
 * Determine if general photo should be automatically analyzed for weeds.
 */
export function shouldAutoIdentifyGeneralPhotoWeeds(trial, photoLocator = {}) {
  let photos = [];
  try {
    photos = typeof trial?.PhotoURLs === 'string' ? JSON.parse(trial.PhotoURLs) : (trial?.PhotoURLs || []);
  } catch (e) {
    photos = [];
  }
  if (!Array.isArray(photos) || !photos.length) return false;

  let photoIndex = -1;
  if (Number.isInteger(photoLocator.index) && photoLocator.index >= 0 && photoLocator.index < photos.length) {
    photoIndex = photoLocator.index;
  } else if (photoLocator.tempId) {
    photoIndex = photos.findIndex(p => p?.tempId === photoLocator.tempId);
  } else if (photoLocator.url) {
    photoIndex = photos.findIndex(p => p?.url === photoLocator.url);
  }
  if (photoIndex === -1) return false;

  const hasStoredIdentification = photos.some(p => Array.isArray(p?.identifications) && p.identifications.length > 0);
  const trialWeedsMissing = !String(trial?.WeedSpecies || '').trim();

  return photoIndex === 0 || !hasStoredIdentification || trialWeedsMissing;
}

/**
 * Proactively analyze general photos for weeds.
 */
export async function analyzeGeneralPhotoWeeds(trialId, photoLocator = {}, options = {}) {
  const state = typeof window !== 'undefined' && window.appState ? window.appState : {};
  const trial = (state.trials || []).find(t => t.ID === trialId);
  if (!trial) return [];

  let photos = [];
  try {
    photos = typeof trial.PhotoURLs === 'string' ? JSON.parse(trial.PhotoURLs) : (trial.PhotoURLs || []);
  } catch (e) {
    photos = [];
  }

  let photoIndex = -1;
  if (Number.isInteger(photoLocator.index) && photoLocator.index >= 0 && photoLocator.index < photos.length) {
    photoIndex = photoLocator.index;
  } else if (photoLocator.tempId) {
    photoIndex = photos.findIndex(p => p?.tempId === photoLocator.tempId);
  } else if (photoLocator.url) {
    photoIndex = photos.findIndex(p => p?.url === photoLocator.url);
  }
  if (photoIndex === -1 || !photos[photoIndex]) return [];

  const photo = photos[photoIndex];
  const fileData = options.sourceFileData || photo.fileData;
  const mimeType = options.sourceMimeType || photo.mimeType || 'image/jpeg';
  if (!fileData) return [];

  return await identifyWeedsFromPhoto(fileData, mimeType);
}

/**
 * Analyze photo for efficacy across Herbicide, Fungicide, Pesticide, Nutrition, and Biostimulant.
 * Supports domain-specific vision schema prompts, offline weed cover detection, and multi-provider fallback.
 */
export async function analyzePhotoForEfficacy(fileData, mimeType = 'image/jpeg', analysisContext = {}) {
  try {
    if (!fileData || typeof fileData !== 'string' || !fileData.includes(',')) {
      throw new Error("Invalid image data provided for analysis.");
    }
    const categoryId = analysisContext.category || (analysisContext.trial && analysisContext.trial.Category) || 'herbicide';
    validateAIAnalysisCategory(categoryId, 'photo efficacy analysis');
    const primaryField = getPrimaryObservationField(categoryId);

    const historyPrompt = analysisContext.trial && typeof window !== 'undefined' && typeof window.buildWeedTrackingPromptContext === 'function'
      ? window.buildWeedTrackingPromptContext(analysisContext.trial, analysisContext.daa)
      : '';

    // Build category-aware prompt and JSON schema
    let prompt;
    let responseSchema;

    if (categoryId === 'herbicide') {
      prompt = `As an agricultural expert analyzing a photo from a herbicide trial, identify up to 2 dominant weed species and estimate their cover/status. Respond ONLY with a single minified JSON object in this exact format: {"weedDetails": [{"species": "...", "cover": NUMBER, "status": "Controlled|Burndown|Re-emerged|Resistant|Unaffected", "notes": "..."}]}.
- "weedDetails": An array of objects.
- "species": The scientific or common name of the weed.
- "cover": Estimate the percentage of the ground covered by *living, active, green* weeds (0-100%). DO NOT count weeds that are dead, brown/necrosed, yellow/chlorotic, or bleached white/albino as living cover. These are controlled weeds.
- "status": The observed condition of the weed (Controlled/Burndown/Re-emerged/Resistant/Unaffected). Use "Controlled" or "Burndown" for dead, brown, yellow, or white/bleached weeds. Use "Unaffected" for green, healthy weeds.
- "notes": A brief qualitative observation.
- Prefer stable species naming across dates (e.g., Bermudagrass = Cynodon dactylon).
- Do NOT introduce a new species unless clearly visible.
- On day 0 to day 1, avoid reporting increased cover unless there is clear regrowth evidence.
${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          weedDetails: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                species: { type: Type.STRING },
                cover: { type: Type.NUMBER },
                status: { type: Type.STRING },
                notes: { type: Type.STRING }
              },
              required: ["species", "cover", "status", "notes"]
            }
          }
        },
        required: ["weedDetails"]
      };
    } else if (categoryId === 'fungicide') {
      prompt = `Act as an expert plant pathologist. Analyze this fungicide trial plot photo to identify disease symptoms (such as lesions, spots, rusts, blights, or mildews). To prevent hallucinations, only report symptoms and diseases that are clearly and indisputably visible on the leaves or canopy.
      
      Estimate the following observation metrics:
      - "diseaseSeverity": Percentage of leaf/canopy area affected by disease symptoms (0-100%).
      - "diseaseIncidence": Percentage of plants/leaves displaying visible disease symptoms (0-100%).
      - "greenLeafArea": Percentage of healthy, active green leaf area remaining (0-100%).
      - "plantHealthScore": Overall plant health rating on a scale of 1-10 (10 being perfect health, 1 being dead/severely diseased).
      - "phytotoxicity": Percentage of crop displaying pesticide/chemical injury symptoms (0-100%).
      
      Respond ONLY with a single minified JSON object in this exact format:
      {
        "metrics": {
          "diseaseSeverity": NUMBER,
          "diseaseIncidence": NUMBER,
          "greenLeafArea": NUMBER,
          "plantHealthScore": NUMBER,
          "phytotoxicity": NUMBER
        },
        "details": {
          "identifiedDiseases": ["Scientific Name / Common Name"],
          "symptoms": ["e.g. chlorotic spots, powdery lesions"],
          "confidence": "High|Medium|Low",
          "notes": "..."
        }
      }
      ${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          metrics: {
            type: Type.OBJECT,
            properties: {
              diseaseSeverity: { type: Type.NUMBER },
              diseaseIncidence: { type: Type.NUMBER },
              greenLeafArea: { type: Type.NUMBER },
              plantHealthScore: { type: Type.NUMBER },
              phytotoxicity: { type: Type.NUMBER }
            },
            required: ["diseaseSeverity", "diseaseIncidence"]
          },
          details: {
            type: Type.OBJECT,
            properties: {
              identifiedDiseases: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              symptoms: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["identifiedDiseases", "confidence", "notes"]
          }
        },
        required: ["metrics", "details"]
      };
    } else if (categoryId === 'pesticide') {
      prompt = `Act as an expert agricultural entomologist. Analyze this pesticide trial plot photo to identify pests, insect infestations, or crop damage. To prevent hallucinations and ensure 100% accuracy, only report pest species, insects, or feeding damage (e.g., holes, chewing) that are directly and clearly visible in the photo.
      
      Estimate the following observation metrics:
      - "pestCount": Total visual count of target pests per unit/plant.
      - "liveInsectCount": Visual count of active live insects.
      - "deadInsectCount": Visual count of dead target pests.
      - "feedingDamagePct": Estimated percentage of feeding damage on the leaves/crop (0-100%).
      - "damageRating": Overall crop damage rating on a scale of 0-9 (0 being no damage, 9 being completely destroyed).
      - "phytotoxicity": Percentage of crop displaying chemical injury symptoms (0-100%).
      
      Respond ONLY with a single minified JSON object in this exact format:
      {
        "metrics": {
          "pestCount": NUMBER,
          "liveInsectCount": NUMBER,
          "deadInsectCount": NUMBER,
          "feedingDamagePct": NUMBER,
          "damageRating": NUMBER,
          "phytotoxicity": NUMBER
        },
        "details": {
          "identifiedPests": ["Scientific Name / Common Name"],
          "damageTypes": ["e.g. foliar chewing, leaf skeletonizing"],
          "confidence": "High|Medium|Low",
          "notes": "..."
        }
      }
      ${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          metrics: {
            type: Type.OBJECT,
            properties: {
              pestCount: { type: Type.NUMBER },
              liveInsectCount: { type: Type.NUMBER },
              deadInsectCount: { type: Type.NUMBER },
              feedingDamagePct: { type: Type.NUMBER },
              damageRating: { type: Type.NUMBER },
              phytotoxicity: { type: Type.NUMBER }
            },
            required: ["pestCount"]
          },
          details: {
            type: Type.OBJECT,
            properties: {
              identifiedPests: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              damageTypes: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["identifiedPests", "confidence", "notes"]
          }
        },
        required: ["metrics", "details"]
      };
    } else {
      prompt = `As an agricultural expert analyzing a photo from a ${categoryId} trial, estimate the trial's primary observation metric named "${primaryField}". Respond ONLY with a single minified JSON object in this exact format: {"metrics": {"${primaryField}": NUMBER}, "details": {"observations": ["..."], "confidence": "High|Medium|Low", "notes": "..."}}. Provide numeric values where possible (0-100 for percentages, or raw numeric for counts). ${historyPrompt}`;

      const properties = {};
      properties[primaryField] = { type: Type.NUMBER };
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          metrics: {
            type: Type.OBJECT,
            properties: properties,
            required: [primaryField]
          },
          details: {
            type: Type.OBJECT,
            properties: {
              observations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["observations", "confidence", "notes"]
          }
        },
        required: ["metrics", "details"]
      };
    }

    const geminiCall = (genAI) => genAI.models.generateContent({
      model: getActiveApiModel(),
      contents: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: fileData.split(',')[1] } }],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    let aiResponseText;
    try {
      const response = await callGeminiApi('Analyzing photo for efficacy', geminiCall);
      aiResponseText = extractResponseText(response);
    } catch (geminiErr) {
      console.warn('[Efficacy] Gemini failed, trying multiProviderAI vision fallback...', geminiErr.message);
      try {
        const { analyzePhoto } = await import('./multiProviderAI.js');
        const fallbackResult = await analyzePhoto(fileData, { ...analysisContext, category: categoryId });
        if (fallbackResult?.success && fallbackResult?.data) {
          aiResponseText = fallbackResult.data;
        } else {
          throw geminiErr;
        }
      } catch (fallbackErr) {
        console.error('[Efficacy] Vision fallback failed:', fallbackErr);
        throw geminiErr;
      }
    }

    // Run offline weed cover detection in parallel for herbicide
    let weedCoverEstimate = null;
    if (categoryId === 'herbicide') {
      try {
        const greenOnly = true; // Only count living green weeds
        const coverResult = await analyzeWeedCover(fileData, greenOnly);
        weedCoverEstimate = {
          cover: coverResult.cover,
          vari: coverResult.vari,
          vegetationIndex: coverResult.vegetationIndex,
          confidence: coverResult.confidence,
          source: 'offline',
          mode: coverResult.mode,
          breakdown: coverResult.breakdown,
          details: coverResult.details
        };
        console.log('[Weed Cover] Offline estimate (green-only):', coverResult);
      } catch (error) {
        console.warn('[Weed Cover] Offline analysis failed:', error);
      }
    }

    const parsed = typeof aiResponseText === 'string' ? JSON.parse(aiResponseText) : aiResponseText;
    if (categoryId === 'herbicide') {
      let weedDetails = parsed.weedDetails || [];
      if (analysisContext.trial && typeof window !== 'undefined' && typeof window.applyHistoricalWeedTracking === 'function') {
        weedDetails = window.applyHistoricalWeedTracking(analysisContext.trial, { daa: analysisContext.daa, weedDetails }).weedDetails;
      }
      const aiData = { weedDetails };
      if (weedCoverEstimate) aiData.weedCoverEstimate = weedCoverEstimate;
      return aiData;
    }

    // Non-herbicide: expect { metrics: { primaryField: number }, details: {...}, value: number }
    const aiData = {};
    if (parsed.metrics && typeof parsed.metrics === 'object') {
      aiData.metrics = parsed.metrics;
    }
    if (typeof parsed.value === 'number') aiData.value = parsed.value;
    if (parsed.details) aiData.details = parsed.details;
    if (parsed[primaryField] !== undefined) {
      aiData.metrics = aiData.metrics || {};
      const v = Number(parsed[primaryField]);
      if (!Number.isNaN(v)) aiData.metrics[primaryField] = v;
    }

    return aiData;
  } catch (error) {
    console.error('Efficacy analysis failed:', error);
    if (error.message === 'ALL_KEYS_EXHAUSTED' || error.message.includes('quota') || error.message.includes('QUOTA_EXCEEDED')) {
      throw new Error('QUOTA_EXCEEDED');
    }
    return null;
  }
}

/**
 * Initialize AI service and bind runtime globals for legacy/sync compatibility.
 */
export function initAI(getAppState) {
  resetGeminiState();
  if (typeof window !== 'undefined') {
    window.analyzePhotoForEfficacy = analyzePhotoForEfficacy;
    window.identifyWeedsFromPhoto = identifyWeedsFromPhoto;
    window.shouldAutoIdentifyGeneralPhotoWeeds = shouldAutoIdentifyGeneralPhotoWeeds;
    window.analyzeGeneralPhotoWeeds = analyzeGeneralPhotoWeeds;
    window.analyzeWeedCover = analyzeWeedCover;
    window.resetGeminiState = resetGeminiState;
    window._callGeminiApiWithRetries = _callGeminiApiWithRetries;
    window.callGeminiApi = callGeminiApi;
  }
  console.log('[AI] Service initialized cleanly with vision and analysis methods bound.');
}

// Global browser bindings for immediate availability
if (typeof window !== 'undefined') {
  window.analyzePhotoForEfficacy = analyzePhotoForEfficacy;
  window.identifyWeedsFromPhoto = identifyWeedsFromPhoto;
  window.shouldAutoIdentifyGeneralPhotoWeeds = shouldAutoIdentifyGeneralPhotoWeeds;
  window.analyzeGeneralPhotoWeeds = analyzeGeneralPhotoWeeds;
  window.analyzeWeedCover = analyzeWeedCover;
  window.resetGeminiState = resetGeminiState;
  window._callGeminiApiWithRetries = _callGeminiApiWithRetries;
  window.callGeminiApi = callGeminiApi;
}

export class MultiProviderAI {
  async analyzePhoto(imageData, context, onProgress) {
    const { analyzePhoto } = await import('./multiProviderAI.js');
    return analyzePhoto(imageData, context, onProgress);
  }
}

export const aiAnalyzer = new MultiProviderAI();
