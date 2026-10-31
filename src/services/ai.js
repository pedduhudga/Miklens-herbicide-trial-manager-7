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
    if (status === 503 || errorMsg.includes('overloaded') || errorMsg.includes('unavailable') || errorMsg.includes('high demand')) {
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
 * Executes a streaming Gemini API call with automatic retry, key rotation, and model fallback.
 * Calls onChunk(chunkText, fullAccumulatedText) as tokens arrive in real-time.
 */
export async function callGeminiApiStream({ contents, config, onChunk, getAppState, retries = 0 }) {
  const genAI = getGenAIClient(getAppState);
  if (!genAI) {
    throw new Error('NO_API_KEY: No Google Gemini API key configured. Please add one in Settings.');
  }

  const currentModel = getActiveApiModel(getAppState);
  const currentBlockKey = getGeminiQuotaBlockKey(currentModel, getAppState);
  const blockedModels = (typeof window !== 'undefined' ? window._geminiBlockedModels : {}) || {};

  if (blockedModels[currentBlockKey] && Date.now() < blockedModels[currentBlockKey]) {
    console.warn(`[AI Stream] Model ${currentModel} is temporarily blocked due to rate limiting. Rotating...`);
    if (rotateApiModel(getAppState)) {
      return callGeminiApiStream({ contents, config, onChunk, getAppState, retries: retries + 1 });
    }
  }

  let fullText = '';
  try {
    const stream = await genAI.models.generateContentStream({
      model: currentModel,
      contents,
      config
    });

    for await (const chunk of stream) {
      let chunkText = '';
      if (typeof chunk?.text === 'string') {
        chunkText = chunk.text;
      } else if (typeof chunk?.text === 'function') {
        chunkText = chunk.text();
      } else if (chunk?.candidates?.[0]?.content?.parts) {
        chunkText = chunk.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      if (chunkText) {
        fullText += chunkText;
        if (typeof onChunk === 'function') {
          try {
            onChunk(chunkText, fullText);
          } catch (callbackErr) {
            console.warn('[AI Stream] Error in onChunk callback:', callbackErr);
          }
        }
      }
    }

    return fullText;
  } catch (error) {
    // If we already received substantial text before connection dropped, return it
    if (fullText && fullText.length > 50) {
      console.warn('[AI Stream] Stream interrupted after receiving partial text:', error);
      return fullText;
    }

    const errorMsg = String(error?.message || '').toLowerCase();
    const status = error?.status || error?.statusCode || (errorMsg.includes('429') ? 429 : 0);

    // Handle Quota / Rate Limiting (429)
    if (status === 429 || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted')) {
      console.warn(`[AI Stream] Rate limit hit on ${currentModel}. Backing off and rotating...`);
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
          return callGeminiApiStream({ contents, config, onChunk, getAppState, retries: retries + 1 });
        }
      }
      throw new Error('QUOTA_EXCEEDED: All Gemini models and API keys have reached rate limits. Please try again in a few moments.');
    }

    // Handle Model Overloaded (503)
    if (status === 503 || errorMsg.includes('overloaded') || errorMsg.includes('unavailable')) {
      if (retries < 2) {
        await new Promise(res => setTimeout(res, 2000 * (retries + 1)));
        return callGeminiApiStream({ contents, config, onChunk, getAppState, retries: retries + 1 });
      }
      if (rotateApiModel(getAppState)) {
        return callGeminiApiStream({ contents, config, onChunk, getAppState, retries: retries + 1 });
      }
    }

    // Handle 404 / Model Deprecated
    if (status === 404 || errorMsg.includes('not found') || errorMsg.includes('deprecated')) {
      console.warn(`[AI Stream] Model ${currentModel} not found or deprecated. Rotating...`);
      if (rotateApiModel(getAppState)) {
        return callGeminiApiStream({ contents, config, onChunk, getAppState, retries: retries + 1 });
      }
    }

    throw error;
  }
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

    // Run pixel analysis BEFORE building the prompt so the result can be injected
    let earlyPixelResult = null;
    if (categoryId === 'herbicide') {
      try {
        earlyPixelResult = await analyzeWeedCover(fileData, true);
      } catch (pixErr) {
        console.warn('[Efficacy] Early pixel analysis failed:', pixErr);
      }
    }

    if (categoryId === 'herbicide') {
      const pixelContext = earlyPixelResult
        ? `\n\nOBJECTIVE PIXEL SENSOR DATA (GROUND TRUTH — YOU MUST ANCHOR YOUR COVER ESTIMATE TO THIS):
${earlyPixelResult.pixelVerdict}
Green pixel ratio: ${(earlyPixelResult.greenRatio * 100).toFixed(1)}% | Dead/desiccated pixel ratio: ${(earlyPixelResult.deadRatio * 100).toFixed(1)}%
Your "cover" values for LIVING weeds MUST be consistent with these pixel measurements. If pixel analysis shows <15% green, do NOT report total living cover >20%. If pixel analysis shows tan/brown dominates (dead ratio >50%), do NOT mark surviving grass as "Regrowth" — it is "Controlled" or "Dead/Desiccated". Regrowth status should ONLY be used when clearly vibrant, actively growing green shoots are visible and pixel green ratio is high.`
        : '';
      prompt = `As an agricultural expert analyzing a photo from a herbicide trial, identify up to 2 dominant weed species and estimate their cover/status. Respond ONLY with a single minified JSON object in this exact format: {"weedDetails": [{"species": "...", "cover": NUMBER, "status": "Controlled|Burndown|Re-emerged|Resistant|Unaffected", "notes": "..."}]}.
- "weedDetails": An array of objects.
- "species": The scientific or common name of the weed.
- "cover": Estimate the percentage of the ground covered by *living, active, green* weeds (0-100%). DO NOT count weeds that are dead, brown/necrosed, yellow/chlorotic, tan, straw-coloured, or bleached white/albino as living cover. These are controlled weeds.
- "status": The observed condition of the weed. Use "Controlled" or "Dead/Desiccated" for completely brown/tan/yellow/bleached weeds with no surviving green shoots. Use "Burndown" for rapid wilting/browning. Use "Regrowth" ONLY when clearly vibrant green new shoots are visibly emerging from soil or crown — do NOT use Regrowth for surviving tan/pale grass crowns. Use "Unaffected" for fully green, healthy weeds.
- "notes": A brief qualitative observation.
- Prefer stable species naming across dates (e.g., Bermudagrass = Cynodon dactylon).
- Do NOT introduce a new species unless clearly visible.
- On day 0 to day 1, avoid reporting increased cover unless there is clear regrowth evidence.
${pixelContext}
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
      prompt = `Act as a senior clinical plant pathologist. Conduct an expert visual diagnosis on this fungicide trial crop plot or pot photo to identify plant disease symptoms (fungal spots, rust pustules, blights, downy/powdery mildews, anthracnose, sclerotinia, bacterial blights, viral mosaics) with maximum scientific accuracy.

PRE-CHECK (CRITICAL — ZERO FALSE INFO / NON-PLOT REJECTION):
If this photo shows commercial fertilizer/chemical packaging, bottles, product flyers, advertisements, indoor non-plot objects, vehicles, people, or completely blurry/unusable images: YOU MUST set "isValidPlotPhoto": false, "invalidationReason": "Image depicts non-plot asset or packaging rather than crop canopy", "metrics": {"diseaseSeverity": 0, "diseaseIncidence": 0, "greenLeafArea": 0, "plantHealthScore": 0, "phytotoxicity": 0}, "targets": [], "details": {"identifiedDiseases": [], "symptoms": [], "confidence": "Low", "notes": "Evaluation precluded: Non-plot image."}}.

ZERO-HALLUCINATION & ACCURACY RULES:
1. ONLY report symptoms and diseases that are directly, unmistakably visible on the leaves, stems, or fruits. If the foliage is clean, green, and disease-free, report "diseaseSeverity": 0, "diseaseIncidence": 0, "greenLeafArea": 100, "plantHealthScore": 10, "phytotoxicity": 0, and "targets": [{"name": "Healthy Foliage", "value": 0, "status": "Healthy", "confidence": 98, "notes": "No disease symptoms or lesions observed"}]. DO NOT fabricate pathogens on clean crops!
2. Format identified diseases dynamically as "Common Name (Scientific Name)" with specific visual diagnostic grounding.
3. Distinguish disease lesions from physical/mechanical damage, insect chewing, spray burn/phytotoxicity, sunscald, or senescence.
4. Estimate:
   - "diseaseSeverity": Percentage of canopy/leaf area visibly damaged by disease (0-100%).
   - "diseaseIncidence": Percentage of leaves/stems showing symptoms (0-100%).
   - "greenLeafArea": Percentage of active healthy green leaf area remaining (0-100%).
   - "plantHealthScore": Overall health scale 1-10 (10 = pristine, 1 = severely diseased/collapsed).
   - "phytotoxicity": Chemical leaf burn/scorching percentage (0-100%).
   - "lesionCountAvg": Estimated average lesion count per leaf (number).
   - "chloroticHaloIncidence": Percentage of lesions displaying surrounding yellow halos (0-100%).
   - "defoliationPct": Estimated premature leaf drop or defoliation (0-100%).
   - "sporulationScore": Visual spore pustule / velvet coating intensity (0-10).

Respond ONLY with a single minified JSON object in this exact format:
{
  "isValidPlotPhoto": true,
  "invalidationReason": null,
  "metrics": {
    "diseaseSeverity": NUMBER,
    "diseaseIncidence": NUMBER,
    "greenLeafArea": NUMBER,
    "plantHealthScore": NUMBER,
    "phytotoxicity": NUMBER,
    "lesionCountAvg": NUMBER,
    "chloroticHaloIncidence": NUMBER,
    "defoliationPct": NUMBER,
    "sporulationScore": NUMBER
  },
  "targets": [
    {"name": "Common Name (Scientific Name)", "value": NUMBER, "status": "Symptomatic/Healthy/Stressed", "confidence": NUMBER, "notes": "..."}
  ],
  "details": {
    "identifiedDiseases": ["..."],
    "symptoms": ["..."],
    "confidence": "High|Medium|Low",
    "notes": "..."
  }
}
${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          isValidPlotPhoto: { type: Type.BOOLEAN },
          invalidationReason: { type: Type.STRING },
          metrics: {
            type: Type.OBJECT,
            properties: {
              diseaseSeverity: { type: Type.NUMBER },
              diseaseIncidence: { type: Type.NUMBER },
              greenLeafArea: { type: Type.NUMBER },
              plantHealthScore: { type: Type.NUMBER },
              phytotoxicity: { type: Type.NUMBER },
              lesionCountAvg: { type: Type.NUMBER },
              chloroticHaloIncidence: { type: Type.NUMBER },
              defoliationPct: { type: Type.NUMBER },
              sporulationScore: { type: Type.NUMBER }
            },
            required: ["diseaseSeverity", "diseaseIncidence", "greenLeafArea", "plantHealthScore"]
          },
          targets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                status: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                notes: { type: Type.STRING }
              },
              required: ["name", "status"]
            }
          },
          details: {
            type: Type.OBJECT,
            properties: {
              identifiedDiseases: { type: Type.ARRAY, items: { type: Type.STRING } },
              symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["confidence", "notes"]
          }
        },
        required: ["isValidPlotPhoto", "metrics", "details"]
      };
    } else if (categoryId === 'pesticide') {
      prompt = `Act as a senior agricultural entomologist. Analyze this pesticide/insecticide trial plot or pot photo to identify, classify, and count crop insect pests, mites, developmental life stages, and feeding damage symptoms with scientific precision.

PRE-CHECK (CRITICAL — ZERO FALSE INFO / NON-PLOT REJECTION):
If this photo shows commercial chemical/pesticide bottles, jugs, packaging flyers, advertisements, indoor non-plot assets, machinery, people, or completely blurred images: YOU MUST set "isValidPlotPhoto": false, "invalidationReason": "Image depicts non-plot asset or packaging rather than crop canopy", "metrics": {"pestCount": 0, "liveInsectCount": 0, "deadInsectCount": 0, "feedingDamagePct": 0, "damageRating": 0, "phytotoxicity": 0}, "targets": [], "details": {"identifiedPests": [], "damageTypes": [], "confidence": "Low", "notes": "Evaluation precluded: Non-plot image."}}.

ZERO-HALLUCINATION & ACCURACY RULES:
1. ONLY report pest species, insects, or feeding injuries that are directly, unmistakably visible. If the foliage is clean, uninfested, and undamaged, report "pestCount": 0, "liveInsectCount": 0, "deadInsectCount": 0, "feedingDamagePct": 0, "damageRating": 0, "phytotoxicity": 0, and "targets": [{"name": "Healthy Foliage", "value": 0, "status": "Healthy", "confidence": 98, "notes": "No pest infestation or feeding damage observed"}]. DO NOT invent imaginary insects or chewing damage on clean leaves!
2. Format identified pests dynamically as "Common Name (Scientific Name)" with life stage.
3. Distinguish target pests from beneficial predators (ladybeetles, lacewing larvae, syrphid flies, parasitoid wasps).
4. Estimate:
   - "pestCount": Total visual count of target pest individuals.
   - "liveInsectCount": Count of active, motile insects.
   - "deadInsectCount": Count of desiccated, moribund, or dead insects.
   - "eggCount": Count of egg clusters or individual eggs.
   - "larvaCount": Count of caterpillars, nymphs, or larvae.
   - "adultCount": Count of winged or mature adult insects.
   - "feedingDamagePct": Estimated percentage of foliar area consumed or damaged (0-100%).
   - "damageRating": Standard crop damage score 0-9 (0 = zero damage, 9 = completely skeletonized/destroyed).
   - "beneficialCount": Count of observed beneficial predatory insects.
   - "sootyMoldSeverity": Score 0-10 for black sooty mold following honeydew excretion.
   - "frassIncidence": Score 0-10 for visible fecal frass deposits.
   - "leafCurlingSeverity": Score 0-10 for leaf rolling or twisting from sucking pests.
   - "phytotoxicity": Chemical injury percentage (0-100%).

Respond ONLY with a single minified JSON object in this exact format:
{
  "isValidPlotPhoto": true,
  "invalidationReason": null,
  "metrics": {
    "pestCount": NUMBER,
    "liveInsectCount": NUMBER,
    "deadInsectCount": NUMBER,
    "eggCount": NUMBER,
    "larvaCount": NUMBER,
    "adultCount": NUMBER,
    "feedingDamagePct": NUMBER,
    "damageRating": NUMBER,
    "beneficialCount": NUMBER,
    "sootyMoldSeverity": NUMBER,
    "frassIncidence": NUMBER,
    "leafCurlingSeverity": NUMBER,
    "phytotoxicity": NUMBER
  },
  "targets": [
    {"name": "Common Name (Scientific Name)", "value": NUMBER, "status": "Symptomatic/Healthy/Stressed", "confidence": NUMBER, "notes": "..."}
  ],
  "details": {
    "identifiedPests": ["..."],
    "damageTypes": ["..."],
    "confidence": "High|Medium|Low",
    "notes": "..."
  }
}
${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          isValidPlotPhoto: { type: Type.BOOLEAN },
          invalidationReason: { type: Type.STRING },
          metrics: {
            type: Type.OBJECT,
            properties: {
              pestCount: { type: Type.NUMBER },
              liveInsectCount: { type: Type.NUMBER },
              deadInsectCount: { type: Type.NUMBER },
              eggCount: { type: Type.NUMBER },
              larvaCount: { type: Type.NUMBER },
              adultCount: { type: Type.NUMBER },
              feedingDamagePct: { type: Type.NUMBER },
              damageRating: { type: Type.NUMBER },
              beneficialCount: { type: Type.NUMBER },
              sootyMoldSeverity: { type: Type.NUMBER },
              frassIncidence: { type: Type.NUMBER },
              leafCurlingSeverity: { type: Type.NUMBER },
              phytotoxicity: { type: Type.NUMBER }
            },
            required: ["pestCount", "feedingDamagePct", "damageRating"]
          },
          targets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                status: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                notes: { type: Type.STRING }
              },
              required: ["name", "status"]
            }
          },
          details: {
            type: Type.OBJECT,
            properties: {
              identifiedPests: { type: Type.ARRAY, items: { type: Type.STRING } },
              damageTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["confidence", "notes"]
          }
        },
        required: ["isValidPlotPhoto", "metrics", "details"]
      };
    } else if (categoryId === 'nutrition') {
      prompt = `Act as a senior crop nutritionist and soil-plant diagnostician. Analyze this plant nutrition trial plot or pot photo to evaluate crop nutrient status, foliar chlorosis patterns, and visual vigor with clinical scientific rigor.

PRE-CHECK (CRITICAL — ZERO FALSE INFO / NON-PLOT REJECTION):
If this photo shows commercial fertilizer bags, chemical bottles, marketing brochures, flyers, indoor non-plot items, or non-canopy imagery: YOU MUST set "isValidPlotPhoto": false, "invalidationReason": "Image depicts non-plot asset or fertilizer packaging rather than crop canopy", "metrics": {"visualVigor": 0, "deficiencySeverity": 0, "leafColorScore": 1, "interveinalChlorosis": 0, "leafMarginNecrosis": 0, "canopyCoveragePct": 0, "chlorosisIncidencePct": 0}, "targets": [], "details": {"deficiencySymptoms": [], "confidence": "Low", "notes": "Evaluation precluded: Non-plot image."}}.

ZERO-HALLUCINATION & DIAGNOSTIC ACCURACY RULES:
1. ONLY report nutrient deficiencies that are clearly substantiated by foliar diagnostic symptoms:
   - Mobile Nutrients (Lower/Old leaves affected first):
     * Nitrogen (N): Uniform chlorosis starting from tip along midrib (V-shape).
     * Phosphorus (P): Dark green foliage with purple/bronze anthocyanin pigments on margins and stems.
     * Potassium (K): Marginal necrosis, leaf edge firing, tip scorch.
     * Magnesium (Mg): Distinct interveinal chlorosis on mature leaves with dark green veins.
   - Immobile Nutrients (Upper/Young leaves affected first):
     * Iron (Fe): Sharp interveinal chlorosis on youngest apical leaves (ivory-white when severe).
     * Calcium (Ca): Hooked distorted young leaf tips, marginal necrosis, blossom end rot.
     * Zinc (Zn): Interveinal chlorotic bands, "little leaf", rosetting of terminal nodes.
     * Boron (B): Thick, brittle, curled terminal leaves, hollow/cracked stems.
     * Sulfur (S): Uniform pale chlorosis on upper leaves.
2. If the crop is healthy, turgid, and rich green, report "visualVigor": 9, "deficiencySign": "None", "deficiencySeverity": 0, "leafColorScore": 4, "interveinalChlorosis": 0, "leafMarginNecrosis": 0, and "targets": [{"name": "Adequate Nutrition", "value": 0, "status": "Sufficient", "confidence": 98, "notes": "Foliage exhibits uniform greenness with no visible deficiency symptoms"}]. DO NOT fabricate mineral deficiencies on healthy crops!
3. Laboratory limitations: Do NOT invent exact SPAD sensor units, tissue ppm, or plant height in cm without reference scale. Estimate visible canopy indices.
4. Estimate:
   - "visualVigor": Overall visual vigor rating on scale 0-10 (10 = lush, optimal vigor).
   - "deficiencySign": Dominant visible deficiency code ("None", "N", "P", "K", "Mg", "Ca", "S", "Zn", "Mn", "Fe", "B", "Cu").
   - "deficiencySeverity": Severity of visible deficiency on scale 0-10 (0 = none, 10 = acute necrosis/collapse).
   - "leafColorScore": Standard 1-5 scale on IRRI Leaf Color Chart (1 = yellowish-green, 5 = deep dark green).
   - "interveinalChlorosis": Rating 0-10 for interveinal yellowing.
   - "leafMarginNecrosis": Rating 0-10 for edge firing/scorch.
   - "canopyCoveragePct": Ground/pot surface area covered by green canopy (0-100%).
   - "chlorosisIncidencePct": Percentage of leaves showing yellowing/chlorosis (0-100%).

Respond ONLY with a single minified JSON object in this exact format:
{
  "isValidPlotPhoto": true,
  "invalidationReason": null,
  "metrics": {
    "visualVigor": NUMBER,
    "deficiencySign": "None|N|P|K|Mg|Ca|S|Zn|Mn|Fe|B|Cu",
    "deficiencySeverity": NUMBER,
    "leafColorScore": NUMBER,
    "interveinalChlorosis": NUMBER,
    "leafMarginNecrosis": NUMBER,
    "canopyCoveragePct": NUMBER,
    "chlorosisIncidencePct": NUMBER
  },
  "targets": [
    {"name": "Nutrient Target", "value": NUMBER, "status": "Sufficient/Deficient/Marginal", "confidence": NUMBER, "notes": "..."}
  ],
  "details": {
    "deficiencySymptoms": ["..."],
    "confidence": "High|Medium|Low",
    "notes": "..."
  }
}
${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          isValidPlotPhoto: { type: Type.BOOLEAN },
          invalidationReason: { type: Type.STRING },
          metrics: {
            type: Type.OBJECT,
            properties: {
              visualVigor: { type: Type.NUMBER },
              deficiencySign: { type: Type.STRING },
              deficiencySeverity: { type: Type.NUMBER },
              leafColorScore: { type: Type.NUMBER },
              interveinalChlorosis: { type: Type.NUMBER },
              leafMarginNecrosis: { type: Type.NUMBER },
              canopyCoveragePct: { type: Type.NUMBER },
              chlorosisIncidencePct: { type: Type.NUMBER }
            },
            required: ["visualVigor", "deficiencySeverity", "leafColorScore"]
          },
          targets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                status: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                notes: { type: Type.STRING }
              },
              required: ["name", "status"]
            }
          },
          details: {
            type: Type.OBJECT,
            properties: {
              deficiencySymptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["confidence", "notes"]
          }
        },
        required: ["isValidPlotPhoto", "metrics", "details"]
      };
    } else if (categoryId === 'biostimulant') {
      prompt = `Act as a senior plant physiologist and crop vigor specialist. Analyze this biostimulant trial plot or pot photo to evaluate vegetative growth enhancement, canopy expansion, foliar luster, and abiotic stress resilience (drought, heat, salinity, transplant shock).

PRE-CHECK (CRITICAL — ZERO FALSE INFO / NON-PLOT REJECTION):
If this photo shows commercial biostimulant bottles, jugs, advertising flyers, marketing posters, indoor office assets, or non-canopy imagery: YOU MUST set "isValidPlotPhoto": false, "invalidationReason": "Image depicts non-plot asset or packaging rather than crop canopy", "metrics": {"overallVigor": 0, "shootVigor": 0, "abioticStressRecovery": 5, "leafAreaIndexEstimated": 0, "shootDensityScore": 0, "wiltingIndex": 0, "canopyGreennessPct": 0, "foliarUniformityScore": 0}, "targets": [], "details": {"growthObservations": [], "confidence": "Low", "notes": "Evaluation precluded: Non-plot image."}}.

ZERO-HALLUCINATION & ACCURACY RULES:
1. ONLY report verifiable physiological differences. Distinguish genuine biostimulant enhancement (enhanced shoot density, expanded leaf area, darker green foliar luster, turgid leaves) from normal baseline growth. DO NOT fabricate miraculous growth spurts or unsubstantiated claims.
2. In stress recovery trials, accurately evaluate turgidity vs wilting, absence of leaf roll, and recovery from thermal or osmotic stress.
3. If viewing root systems (washed roots or rhizobox), evaluate root branching density, lateral root proliferation, and nodulation.
4. Estimate:
   - "overallVigor": Overall crop vigor rating on scale 0-10 (10 = exceptional vigor).
   - "shootVigor": Shoot and branch development rating on scale 0-10.
   - "abioticStressRecovery": Resilience and recovery score 1-10 (1 = severe unrecovered stress/wilting, 10 = complete recovery, fully turgid).
   - "leafAreaIndexEstimated": Visual canopy density index on scale 0-10 (10 = fully closed dense canopy).
   - "shootDensityScore": Density of shoots/tillers per plant/pot on scale 0-10.
   - "wiltingIndex": Wilting or flaccidity score on scale 0-10 (0 = fully turgid/erect, 10 = completely desiccated/wilted).
   - "canopyGreennessPct": Percentage of canopy displaying vibrant, healthy green foliage (0-100%).
   - "foliarUniformityScore": Uniformity and consistency of canopy growth on scale 0-10.

Respond ONLY with a single minified JSON object in this exact format:
{
  "isValidPlotPhoto": true,
  "invalidationReason": null,
  "metrics": {
    "overallVigor": NUMBER,
    "shootVigor": NUMBER,
    "abioticStressRecovery": NUMBER,
    "leafAreaIndexEstimated": NUMBER,
    "shootDensityScore": NUMBER,
    "wiltingIndex": NUMBER,
    "canopyGreennessPct": NUMBER,
    "foliarUniformityScore": NUMBER
  },
  "targets": [
    {"name": "Growth / Vigor Parameter", "value": NUMBER, "status": "Vigorous/Healthy/Stressed", "confidence": NUMBER, "notes": "..."}
  ],
  "details": {
    "growthObservations": ["..."],
    "confidence": "High|Medium|Low",
    "notes": "..."
  }
}
${historyPrompt}`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          isValidPlotPhoto: { type: Type.BOOLEAN },
          invalidationReason: { type: Type.STRING },
          metrics: {
            type: Type.OBJECT,
            properties: {
              overallVigor: { type: Type.NUMBER },
              shootVigor: { type: Type.NUMBER },
              abioticStressRecovery: { type: Type.NUMBER },
              leafAreaIndexEstimated: { type: Type.NUMBER },
              shootDensityScore: { type: Type.NUMBER },
              wiltingIndex: { type: Type.NUMBER },
              canopyGreennessPct: { type: Type.NUMBER },
              foliarUniformityScore: { type: Type.NUMBER }
            },
            required: ["overallVigor", "shootVigor", "abioticStressRecovery"]
          },
          targets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.NUMBER },
                status: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                notes: { type: Type.STRING }
              },
              required: ["name", "status"]
            }
          },
          details: {
            type: Type.OBJECT,
            properties: {
              growthObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["confidence", "notes"]
          }
        },
        required: ["isValidPlotPhoto", "metrics", "details"]
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

    // Weed cover pixel analysis — use earlyPixelResult if already computed, else run now
    let weedCoverEstimate = null;
    if (categoryId === 'herbicide') {
      try {
        const coverResult = earlyPixelResult || await analyzeWeedCover(fileData, true);
        weedCoverEstimate = {
          cover: coverResult.cover,
          deadCover: coverResult.deadCover || 0,
          greenRatio: coverResult.greenRatio || 0,
          deadRatio: coverResult.deadRatio || 0,
          vari: coverResult.vari,
          vegetationIndex: coverResult.vegetationIndex,
          confidence: coverResult.confidence,
          source: 'offline',
          mode: coverResult.mode,
          pixelVerdict: coverResult.pixelVerdict || '',
          breakdown: coverResult.breakdown,
          details: coverResult.details
        };
        console.log('[Weed Cover] Pixel analysis (multi-class):', coverResult);
      } catch (error) {
        console.warn('[Weed Cover] Pixel analysis failed:', error);
      }
    }

    const parsed = typeof aiResponseText === 'string' ? JSON.parse(aiResponseText) : aiResponseText;
    if (categoryId === 'herbicide') {
      let weedDetails = parsed.weedDetails || [];
      if (analysisContext.trial && typeof window !== 'undefined' && typeof window.applyHistoricalWeedTracking === 'function') {
        weedDetails = window.applyHistoricalWeedTracking(analysisContext.trial, { daa: analysisContext.daa, weedDetails }).weedDetails;
      }

      // ── Cross-validation: anchor AI cover to pixel measurement ────────────
      // If pixel analysis is available, use it to correct AI over-estimates.
      if (weedCoverEstimate && weedCoverEstimate.greenRatio !== undefined) {
        const pixelGreenPct = Math.round(weedCoverEstimate.greenRatio * 100);
        const pixelDeadDominant = weedCoverEstimate.deadRatio > 0.50; // >50% dead tissue
        const aiTotalCover = weedDetails.reduce((sum, w) => sum + (w.cover || 0), 0);

        // If AI is over-reporting green cover vs pixels by >15pp, scale down
        if (aiTotalCover > 0 && (aiTotalCover - pixelGreenPct) > 15) {
          const scaleFactor = Math.max(0, pixelGreenPct) / aiTotalCover;
          console.warn(`[Cover Cross-Validation] AI reported ${aiTotalCover}% but pixels show ${pixelGreenPct}%. Scaling down by factor ${scaleFactor.toFixed(2)}.`);
          weedDetails = weedDetails.map(w => ({
            ...w,
            cover: Math.round((w.cover || 0) * scaleFactor)
          }));
        }

        // If plot is dead-dominant (>50% dead pixels), correct any "Regrowth" labels
        // on species that have very low individual cover
        if (pixelDeadDominant) {
          weedDetails = weedDetails.map(w => {
            const status = String(w.status || '').toLowerCase();
            // "Regrowth" on a dead-dominant plot with low cover is likely misclassified
            if ((status === 'regrowth' || status === 're-emerged') && (w.cover || 0) < 15) {
              console.warn(`[Cover Cross-Validation] Pixel dead-dominant (${Math.round(weedCoverEstimate.deadRatio*100)}% dead). Correcting "${w.species}" from "${w.status}" → "Controlled" (cover ${w.cover}%).`);
              return { ...w, status: 'Controlled', notes: (w.notes || '') + ' [Pixel-corrected: dead tissue dominant]' };
            }
            return w;
          });
        }
      }

      const aiData = { weedDetails };
      if (weedCoverEstimate) aiData.weedCoverEstimate = weedCoverEstimate;
      return aiData;
    }


    // Non-herbicide: process structured output with invalidation and targets support
    const aiData = {
      isValidPlotPhoto: parsed.isValidPlotPhoto !== false,
      invalidationReason: parsed.invalidationReason || null,
      metrics: (parsed.metrics && typeof parsed.metrics === 'object') ? parsed.metrics : {},
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      details: parsed.details || {},
      overallAssessment: parsed.overallAssessment || parsed.details?.notes || parsed.notes || '',
      notes: parsed.notes || parsed.details?.notes || '',
      confidence: parsed.confidence || parsed.details?.confidence || 'MEDIUM',
      bbchStage: parsed.bbchStage || ''
    };

    if (typeof parsed.value === 'number') aiData.value = parsed.value;
    if (parsed[primaryField] !== undefined) {
      const v = Number(parsed[primaryField]);
      if (!Number.isNaN(v)) aiData.metrics[primaryField] = v;
    }

    // Auto-normalize identified items into targets array if targets was empty
    if (aiData.targets.length === 0 && parsed.details) {
      if (Array.isArray(parsed.details.identifiedDiseases) && parsed.details.identifiedDiseases.length > 0) {
        aiData.targets = parsed.details.identifiedDiseases.map(d => ({
          name: d,
          value: parsed.metrics?.diseaseSeverity ?? 0,
          status: (parsed.metrics?.diseaseSeverity ?? 0) > 0 ? 'Symptomatic' : 'Healthy',
          confidence: parsed.details.confidence === 'High' ? 90 : parsed.details.confidence === 'Medium' ? 70 : 50,
          notes: Array.isArray(parsed.details.symptoms) ? parsed.details.symptoms.join(', ') : (parsed.details.notes || '')
        }));
      } else if (Array.isArray(parsed.details.identifiedPests) && parsed.details.identifiedPests.length > 0) {
        aiData.targets = parsed.details.identifiedPests.map(p => ({
          name: p,
          value: parsed.metrics?.pestCount ?? 0,
          status: (parsed.metrics?.pestCount ?? 0) > 0 ? 'Symptomatic' : 'Healthy',
          confidence: parsed.details.confidence === 'High' ? 90 : parsed.details.confidence === 'Medium' ? 70 : 50,
          notes: Array.isArray(parsed.details.damageTypes) ? parsed.details.damageTypes.join(', ') : (parsed.details.notes || '')
        }));
      } else if (Array.isArray(parsed.details.deficiencySymptoms) && parsed.details.deficiencySymptoms.length > 0) {
        aiData.targets = parsed.details.deficiencySymptoms.map(s => ({
          name: typeof s === 'string' ? s : (s.name || 'Deficiency'),
          value: parsed.metrics?.deficiencySeverity ?? 0,
          status: (parsed.metrics?.deficiencySeverity ?? 0) > 0 ? 'Deficient' : 'Sufficient',
          confidence: 85,
          notes: parsed.details.notes || ''
        }));
      }
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

// ── Consolidated AI Unified Gateway ──────────────────────────────────────────
export {
  analyzePhoto,
  analyzePhotosBatch,
  identifyWeedFromPhoto,
  generateTextWithAI,
  parseHarvestTextLog,
  getAPIKeys,
  PROVIDERS
} from './multiProviderAI.js';

export class MultiProviderAI {
  async analyzePhoto(imageData, context, onProgress) {
    const { analyzePhoto } = await import('./multiProviderAI.js');
    return analyzePhoto(imageData, context, onProgress);
  }
}

export const aiAnalyzer = new MultiProviderAI();
