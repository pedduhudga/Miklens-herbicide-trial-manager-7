import { getCategoryConfig } from '../utils/categoryConfig.js';
import { resolvePhotoSrc } from '../utils/photoUtils.js';

// Provider order = fallback priority (first = tried first).
// Free tier limits per Google AI Studio / Groq free plan.
// All Gemini models support: Text + Image + Video + Audio + PDF inputs.
const PROVIDERS = [
  // ── Gemini 3.x (newest generation, best vision quality) ──────────────────
  {
    // Stable | Free: ~1500 RPD, 30 RPM | Frontier-class, best for high-volume weed analysis
    id: 'gemini-3-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    dailyLimit: 1500,
  },
  {
    // Stable | Free: ~500 RPD, 15 RPM | Most intelligent Gemini 3, best for agentic weed ID
    id: 'gemini-3-flash',
    name: 'Gemini 3.5 Flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    dailyLimit: 500,
  },
  {
    // Preview | Free: ~100 RPD, 5 RPM | Frontier preview, deeper reasoning for complex plots
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    dailyLimit: 100,
  },
  {
    // Preview | Free: ~25 RPD, 5 RPM | Most advanced reasoning — use for AI Summary/Reports
    id: 'gemini-3-pro',
    name: 'Gemini 3.1 Pro Preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
    dailyLimit: 25,
  },
  // ── Gemini 2.5 (stable fallback series) ─────────────────────────────────
  {
    // Stable | Free: 1500 RPD, 30 RPM | Fast & cheap fallback
    id: 'gemini-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
    dailyLimit: 1500,
  },
  {
    // Stable | Free: 250 RPD, 10 RPM | Reliable vision + thinking
    id: 'gemini-flash',
    name: 'Gemini 2.5 Flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    dailyLimit: 250,
  },
  {
    // Stable | Free: 25 RPD, 5 RPM | Deep reasoning fallback
    id: 'gemini',
    name: 'Gemini 2.5 Pro',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    dailyLimit: 25,
  },
  // ── Groq (ultra-fast inference, vision support) ──────────────────────────
  {
    // Preview | Free: ~500 RPD | Best Groq vision model, 5 images/request
    id: 'groq-maverick',
    name: 'Groq LLaMA 4 Maverick',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    dailyLimit: 500,
  },
  {
    // Preview | Free: ~500 RPD | Lightweight fast vision
    id: 'groq',
    name: 'Groq LLaMA 4 Scout',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    dailyLimit: 500,
  },
  // ── Mistral (last resort) ────────────────────────────────────────────────
  {
    // Free: ~50 RPD | Last resort fallback
    id: 'pixtral',
    name: 'Pixtral Large (Mistral)',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    model: 'pixtral-large-2411',
    dailyLimit: 50,
  },
];


function getSettings() {
  try {
    const raw = localStorage.getItem('appSettings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function getAPIKeys(providerId) {
  const settings = getSettings();
  const isGemini = providerId.startsWith('gemini');
  const isGroq = providerId === 'groq' || providerId === 'groq-maverick';
  const baseId = isGemini ? 'gemini' : isGroq ? 'groq' : providerId;

  const keys = [];

  const extractKeyStr = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'object') {
      return (val.key || val.apiKey || val.value || '').trim();
    }
    return '';
  };

  const settingsKeys = [
    settings?.apiKeys,
    settings?.geminiApiKeys,
    settings?.geminiApiKey ? [settings.geminiApiKey] : null,
  ];
  if (isGemini) {
    settingsKeys.forEach(k => {
      if (Array.isArray(k)) {
        k.forEach(item => {
          const raw = extractKeyStr(item);
          if (raw) keys.push(raw);
        });
      } else {
        const raw = extractKeyStr(k);
        if (raw) keys.push(raw);
      }
    });
  }
  if (isGroq) {
    const raw = extractKeyStr(settings?.groqApiKey);
    if (raw) keys.push(raw);
    if (Array.isArray(settings?.groqApiKeys)) {
      settings.groqApiKeys.forEach(k => {
        const rawKey = extractKeyStr(k);
        if (rawKey) keys.push(rawKey);
      });
    }
  }
  if (baseId === 'pixtral') {
    const raw = extractKeyStr(settings?.mistralApiKey);
    if (raw) keys.push(raw);
  }

  // Also check localStorage directly
  const lsBase = localStorage.getItem(`AI_KEY_${baseId.toUpperCase()}`);
  if (lsBase) {
    const raw = extractKeyStr(lsBase);
    if (raw) keys.push(raw);
  }
  for (let i = 1; i <= 5; i++) {
    const k = localStorage.getItem(`AI_KEY_${baseId.toUpperCase()}_${i}`);
    if (k) {
      const raw = extractKeyStr(k);
      if (raw) keys.push(raw);
    }
  }

  return [...new Set(keys.filter(Boolean))];
}

function loadUsage() {
  try {
    const data = JSON.parse(localStorage.getItem('ai_provider_usage') || '{}');
    const today = new Date().toISOString().split('T')[0];
    if (data.date !== today) return {};
    return data.usage || {};
  } catch { return {}; }
}

function saveUsage(usage) {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem('ai_provider_usage', JSON.stringify({ date: today, usage }));
}

function hasQuota(provider, keyIndex, usage) {
  const key = `${provider.id}_${keyIndex}`;
  return (usage[key] || 0) < provider.dailyLimit;
}

function incrementUsage(provider, keyIndex, usage) {
  const key = `${provider.id}_${keyIndex}`;
  const updated = { ...usage, [key]: (usage[key] || 0) + 1 };
  saveUsage(updated);
  return updated;
}

function buildPrompt(context) {
  if (context.isHarvest) {
    return `You are an agricultural AI yield expert analyzing a crop harvest photo.
Analyze this photo containing harvested produce/fruits/vegetables and extract:
1. **Fruit/Item Count**: Count the total number of visible fruits or items of produce.
2. **Defect & Quality Detection**: Detect symptoms of damage, cracks, sunscald, disease, rot, blemishes, or size irregularities.
3. **Suggested Yield Weight (Grams)**: Based on the count, size, and type of produce (Category/Crop: ${context.category || 'tomato'}), suggest estimated weights for:
   - Marketable Yield (grams) - clean, pristine, sellable quality.
   - Unmarketable Yield (grams) - cracked, sunburnt, small, or diseased quality.
   (NOTE: Suggest weight values ONLY if fruits are clearly visible, otherwise output 0).

OUTPUT FORMAT - JSON ONLY (no extra text, no markdown wrapper around the JSON):
{
  "fruitCount": 45,
  "marketableYieldEstimateGrams": 950,
  "unmarketableYieldEstimateGrams": 150,
  "detectedDefects": "mild sunscald, minor surface cracks on 3 items",
  "confidence": "HIGH/MEDIUM/LOW"
}`;
  }

  const historyNote = context.historyPrompt ? `\n${context.historyPrompt}\n` : '';
  const photoTag = context.photoTag || 'Whole Canopy';
  let tagInstruction = '';
  const cleanTag = photoTag.toLowerCase();
  if (cleanTag.includes('abaxial') || cleanTag.includes('underside')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a LEAF CLOSE-UP (UNDERSIDE / ABAXIAL) photo. Please focus closely on the underside of the leaf, looking specifically for rust spores, insect eggs, mite colonies, whitefly feeding, or localized lesions. Do not estimate whole canopy coverage.';
  } else if (cleanTag.includes('adaxial') || cleanTag.includes('top')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a LEAF CLOSE-UP (TOP / ADAXIAL) photo. Please focus closely on the upper surface of the leaf, analyzing leaf spot count, disease severity (chlorosis, necrosis), or leaf chewing damage. Do not estimate whole canopy coverage.';
  } else if (cleanTag.includes('new growth')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a LEAF CLOSE-UP (NEW GROWTH) photo from the young/upper leaves. Please focus on symptoms of immobile nutrient deficiencies (such as Iron chlorosis, Calcium necrosis, or young leaf distortion) or sucking insect damage. Do not estimate whole canopy coverage.';
  } else if (cleanTag.includes('old growth')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a LEAF CLOSE-UP (OLD GROWTH) photo from mature/lower leaves. Please focus on symptoms of mobile nutrient deficiencies (such as Nitrogen yellowing, Potassium leaf edge burning, or Magnesium interveinal chlorosis) or older leaf senescence. Do not estimate whole canopy coverage.';
  } else if (cleanTag.includes('leaf close-up')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a LEAF CLOSE-UP photo. Focus closely on leaf spot count, chlorosis, necrosis, and localized damage. Do not estimate whole canopy coverage.';
  } else if (cleanTag.includes('stem') || cleanTag.includes('meristem')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a STEM / MERISTEM CLOSE-UP photo. Focus closely on stem surfaces, node junctions, or the terminal growing tip, looking specifically for cankers, vascular lesions, thrips feeding, or terminal bud necrosis. Do not estimate whole canopy coverage.';
  } else if (cleanTag.includes('fruit') || cleanTag.includes('produce')) {
    tagInstruction = '\nSPECIAL FOCUS: This is a FRUIT / PRODUCE CLOSE-UP photo. Focus closely on fruit/produce quality, estimating count, maturity, rot/mold severity, size uniformity, sunscald, skin blemishes, or surface cracks.';
  } else {
    tagInstruction = `\nSPECIAL FOCUS: This is a CANOPY/PLANT photo (Tag: ${photoTag}). Please focus on overall plant vigor, canopy coverage (%), greenness, shoot density, and overall plant structure.`;
  }

  // If a non-herbicide category is specified, use its custom AI prompt
  if (context.category && context.category !== 'herbicide') {
    try {
      const catConfig = getCategoryConfig(context.category);
      const metricsPlaceholder = {};
      catConfig.observationFields.forEach(f => {
        if (f.key !== 'weedDetails') {
          metricsPlaceholder[f.key] = `Estimated ${f.label} value (number or float)`;
        }
      });

      return `${catConfig.aiPhotoPrompt}
${tagInstruction}

PLOT INFORMATION:
- Treatment/Product: ${context.treatment || 'Unknown'}
- Days After Application (DAA): ${context.daa ?? 0}
- Replication: ${context.rep || 1}
- Category: ${catConfig.name}
${historyNote}

ADDITIONAL ANALYSIS FEATURES: ${catConfig.aiFeatures.join(', ')}

RULES FOR SCIENTIFIC ASSESSMENT (CRITICAL - AVOID HALLUCINATION):
1. STAGE & METRIC ACCURACY: Estimate values only for metrics and symptoms that are directly and clearly visible in the crop plot photo. Do NOT invent or assume data.
2. STAGE-APPROPRIATE METRICS (GROWTH-STAGE FILTERING): If the BBCH Growth Stage is early/vegetative (BBCH stage label starting with BBCH 00 through BBCH 59, i.e., before flowering and fruiting), reproductive and yield metrics (such as "fruitCount", "marketableYield", "unmarketableYield", "marketableYieldEstimateGrams", "unmarketableYieldEstimateGrams") are biologically not applicable. For these metrics in the "metrics" JSON object, you MUST set them to null. Do NOT return 0 or "Not detected". Only return numerical estimations for these if the BBCH stage is BBCH 61 or later (flowering/fruiting/ripening) and fruits are actually visible.
3. PHYSICAL, SENSOR & LABORATORY LIMITATION: Physical parameters like plant height (e.g., 'plantHeightAvg'), sensor measurements like chlorophyll index (SPAD readings), and laboratory chemical tissue tests CANNOT be measured or determined from a 2D photo. You MUST set these to null in the "metrics" JSON object. Do NOT guess or estimate these values under any circumstances.
4. STRICT VERIFICATION & CONFIDENCE: Only report disease lesions, insect pests, nutrient deficiencies, or vigor differences that you are 100% sure exist based on visual evidence. If a symptom is ambiguous or invisible, set its estimated metric value to 0 or leave it out of targets.
5. CONCISE, FACTUAL NARRATIVES: Keep the "overallAssessment" and "notes" fields extremely brief, direct, and factual (1-2 sentences maximum). Do not use fluff, advice, or recommendations.
6. TARGET LEVEL CONFIDENCE: For each item in the "targets" list, you MUST include a "confidence" field containing an estimated percentage confidence (integer 0-100) based on visual clarity and characteristic symptom presentation.
7. STANDARDIZED TARGET TAXONOMY: To prevent duplicate/synonym entries, you MUST only use the following standardized target names. Do not use close variations or different words for the same symptom:
   - Pesticide Category: "Leafminer Damage", "Whitefly Damage", "Thrips Damage", "Aphid Damage", "Caterpillar Damage", "Spider Mite Damage", "General Pest Vigor".
   - Fungicide Category: "Early Blight", "Late Blight", "Powdery Mildew", "Septoria Leaf Spot", "Bacterial Spot", "Leaf Rust", "Stem Canker".
   - Nutrition Category: "Nitrogen Deficiency", "Phosphorus Deficiency", "Potassium Deficiency", "Magnesium Deficiency", "Calcium Deficiency", "Iron Deficiency", "Zinc Deficiency", "Sufficient Nutrient Vigor".
   - Biostimulant Category: "Canopy Expansion", "Shoot Density", "Wilting Recovery", "Abiotic Stress Tolerance", "Root Development Indicator".
8. CATEGORY STATUS LABELS: You MUST ONLY use plant-health/crop-health status values for targets status: "Sufficient", "Deficient", "Marginal", "Healthy", "Symptomatic", "Stressed", or "Vigorous". You are strictly PROHIBITED from using herbicide-specific status terms like "Unaffected", "Controlled", "Burndown", "Slight/Moderate/Severe Injury", or "Dead/Desiccated".
9. BBCH GROWTH STAGE: Identify the overall growth stage of the crop and select the exact matching label from: "BBCH 00: Dry seed / Winter dormancy", "BBCH 09: Emergence / Bud burst", "BBCH 10: First leaf unfolded", "BBCH 13: 3 leaves unfolded", "BBCH 19: 9 or more leaves unfolded", "BBCH 20: No tillers", "BBCH 25: 5 tillers visible", "BBCH 29: Main shoot maximum tillers", "BBCH 30: Beginning of stem elongation", "BBCH 39: Flag leaf fully unrolled", "BBCH 49: First awns visible", "BBCH 51: Inflorescence beginning to emerge", "BBCH 59: Inflorescence fully emerged", "BBCH 61: Beginning of flowering", "BBCH 65: Full flowering", "BBCH 69: End of flowering", "BBCH 71: Watery ripe grain / young fruit", "BBCH 79: Fruit/grain reached maximum size", "BBCH 83: Early dough stage", "BBCH 89: Fully ripe", "BBCH 92: Leaves begin to discolour", "BBCH 99: Harvested product / Dormant plant".

OUTPUT FORMAT - JSON ONLY (no extra text, no markdown wrapper around the JSON):
{
  "metrics": ${JSON.stringify(metricsPlaceholder, null, 2)},
  "targets": [
    {"name": "Standardized Target Name", "value": 0, "status": "Sufficient/Deficient/Marginal/Healthy/Symptomatic/Stressed/Vigorous", "confidence": 95, "notes": "Brief observation details"}
  ],
  "overallAssessment": "Factual scientific assessment of the plot",
  "confidence": "HIGH/MEDIUM/LOW",
  "notes": "Any other notable field observations",
  "bbchStage": "Selected exact BBCH stage label"
}`;
    } catch (e) {
      // Fallback to herbicide prompt if config fails
    }
  }

  // Default herbicide prompt (existing)
  return `You are an agricultural weed science expert analyzing a herbicide trial plot photo. Provide a rigorous, scientifically accurate assessment.
${tagInstruction}

PLOT INFORMATION:
- Treatment/Herbicide: ${context.treatment || 'Unknown'}
- Days After Application (DAA): ${context.daa ?? 0}
- Replication: ${context.rep || 1}
${historyNote}

SCIENTIFIC ANALYSIS TASKS:
1. **Weed Species Identification**: Identify all visible weed species. Write each species as "Common Name (Scientific name)" — Genus capitalised, species lowercase (e.g. "Barnyard Grass (Echinochloa crus-galli)", "Horse Purslane (Trianthema portulacastrum)").

2. **Ground Cover Estimation (CRITICAL FOR EFFICACY)**:
   - Estimate the percentage of the ground covered by *living, active, green* weeds (0-100%).
   - **DO NOT** count weeds that are dead, brown, desiccated, yellow (chlorotic), or bleached white (carotenoid-bleached) as living cover. These are controlled weeds. Only estimate the remaining living green cover.
   - The total weed cover should represent only the surviving green weed pressure.

3. **Herbicidal Injury Response & Symptoms**:
   - Classify the observed treatment response for each weed using:
     - "Unaffected" - Weeds are healthy, growing, and vibrant green.
     - "Slight Injury" - Minor yellowing (chlorosis) or bleaching/whitening at leaf tips.
     - "Moderate Injury" - Moderate yellowing (chlorosis) or bleaching (whitening), partial necrosis (browning), or stunting/wilting.
     - "Severe Injury" - Heavy chlorosis/bleaching, extensive necrosis (browning), or severe wilting/stunting (e.g., ALS/HPPD inhibitor white/bleached symptoms).
     - "Dead/Desiccated" - Weeds are completely dead, dried, and turned entirely brown, yellow, or bleached white, with no surviving green tissue.
     - "Burndown" - Rapid wilting and browning typical of contact herbicides.

4. **Growth Stage**: Record stage as one of: Seedling, Vegetative, Flowering, Mature

5. **Infestation Level**: Classify overall living green weed pressure as: None, Low, Moderate, High, or Severe

6. **Confidence**: Rate image assessment confidence as LOW, MEDIUM, or HIGH

7. **Application Timing**: Estimate the herbicide application timing relative to weed/crop growth stage, choosing one of: PRE (Pre-emergence, bare soil / no weeds emerged), E-POST (Early Post-emergence, small seedlings, 1-3 leaves), POST (Post-emergence, active vegetative growth, 4-6 leaves / tillering), L-POST (Late Post-emergence, mature weeds / flowering / closed canopy). NOTE: If the weeds are already Mature or Flowering, you MUST select L-POST instead of POST.

8. **Overall Weed Growth Stage**: Provide a standardized summary text describing the dominant/overall growth stage of the weeds in the plot (e.g., '2-4 leaf stage', 'tillering', 'seedling', 'flowering', 'pre-emergence', 'mature').

9. **BBCH Growth Stage**: Identify the overall growth stage of the weeds/crop and select the exact matching label from: "BBCH 00: Dry seed / Winter dormancy", "BBCH 09: Emergence / Bud burst", "BBCH 10: First leaf unfolded", "BBCH 13: 3 leaves unfolded", "BBCH 19: 9 or more leaves unfolded", "BBCH 20: No tillers", "BBCH 25: 5 tillers visible", "BBCH 29: Main shoot maximum tillers", "BBCH 30: Beginning of stem elongation", "BBCH 39: Flag leaf fully unrolled", "BBCH 49: First awns visible", "BBCH 51: Inflorescence beginning to emerge", "BBCH 59: Inflorescence fully emerged", "BBCH 61: Beginning of flowering", "BBCH 65: Full flowering", "BBCH 69: End of flowering", "BBCH 71: Watery ripe grain / young fruit", "BBCH 79: Fruit/grain reached maximum size", "BBCH 83: Early dough stage", "BBCH 89: Fully ripe", "BBCH 92: Leaves begin to discolour", "BBCH 99: Harvested product / Dormant plant".

LANGUAGE RULES:
- Do NOT include any recommendations, monitoring suggestions, or next-step advice.
- Do NOT use the words "phytotoxic" or "phytotoxicity".
- The "efficacyAssessment" field must state only what is OBSERVED in this photo at this DAA — no projections or post-application schedules.
- Keep all notes factual and observation-based only.

OUTPUT FORMAT - JSON ONLY (no extra text):
{
  "weeds": [
    {"species": "Common Name (Scientific name)", "cover": 25, "status": "Unaffected", "growthStage": "Vegetative", "notes": "Dense stand, no visible injury observed"}
  ],
  "totalWeedCover": 45,
  "infestationLevel": "Moderate",
  "dominantSpecies": "Primary species name",
  "confidence": "HIGH",
  "efficacyAssessment": "No herbicidal injury observed at DAA 0; baseline assessment.",
  "notes": "Photo quality clear. Mixed infestation noted.",
  "applicationTiming": "POST",
  "overallWeedGrowthStage": "2-4 leaf stage",
  "bbchStage": "Selected exact BBCH stage label"
}`;
}

function parseAIJson(text) {
  const match = text.match(/```json\n([\s\S]*?)\n```/) ||
    text.match(/```\n([\s\S]*?)\n```/) ||
    text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in AI response');
  return JSON.parse(match[1] || match[0]);
}

function getDriveFileId(url) {
  if (typeof url !== 'string') return null;
  if (!url.includes('drive.google.com')) return null;
  const m = url.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function encodeImageViaCanvas(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const MAX = 1024;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (!w || !h) return reject(new Error('Image has zero dimensions'));
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      try {
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        if (!jpeg || jpeg === 'data:,') return reject(new Error('Canvas produced empty image'));
        resolve(jpeg.split(',')[1]);
      } catch (e) {
        reject(new Error('Canvas draw failed (possible CORS taint): ' + e.message));
      }
    };
    img.onerror = () => reject(new Error('Image failed to load: ' + String(src || '').slice(0, 80)));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function imageToBase64(dataUrlOrUrl) {
  // Already a data URL — encode via canvas to normalise format/size
  if (typeof dataUrlOrUrl === 'string' && dataUrlOrUrl.startsWith('data:')) {
    return encodeImageViaCanvas(dataUrlOrUrl);
  }

  // Google Drive URLs can NEVER be fetched from browser (CORS block + 302 redirect)
  // Callers that need base64 (Groq, Pixtral) must skip Drive URLs upstream.
  if (getDriveFileId(dataUrlOrUrl)) {
    throw new Error('DRIVE_URL_NO_BASE64');
  }

  // Regular remote URL — try fetch
  try {
    const response = await fetch(dataUrlOrUrl, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    return encodeImageViaCanvas(dataUrl);
  } catch (fetchErr) {
    console.warn('[AI] fetch failed, trying img load:', fetchErr.message);
    return encodeImageViaCanvas(dataUrlOrUrl);
  }
}

async function callGemini(provider, imageData, context, apiKey) {
  // For Google Drive URLs: use fileUri — Gemini API reads Drive files server-side (no CORS issue)
  const driveId = getDriveFileId(imageData);
  let imagePart;
  if (driveId) {
    imagePart = { fileData: { mimeType: 'image/jpeg', fileUri: `https://drive.google.com/uc?export=download&id=${driveId}` } };
  } else {
    const base64 = await imageToBase64(imageData);
    imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64 } };
  }

  const response = await fetch(`${provider.endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: buildPrompt(context) },
          imagePart
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });
  if (!response.ok) {
    const err = await response.text();
    const e = new Error(`Gemini ${response.status}: ${err.slice(0, 200)}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return parseAIJson(text);
}

async function callGroq(provider, imageData, context, apiKey) {
  // Groq requires base64 — Drive URLs are CORS-blocked, skip immediately
  if (getDriveFileId(imageData)) {
    const e = new Error('Drive images cannot be fetched for Groq (CORS). Use Gemini instead.');
    e.status = 400;
    throw e;
  }
  const base64 = await imageToBase64(imageData);
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(context) },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }],
      temperature: 0.2,
      max_tokens: 500
    })
  });
  if (!response.ok) {
    const err = await response.text();
    const e = new Error(`Groq ${response.status}: ${err.slice(0, 200)}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');
  return parseAIJson(text);
}

async function callPixtral(provider, imageData, context, apiKey) {
  // Pixtral requires base64 — Drive URLs are CORS-blocked, skip immediately
  if (getDriveFileId(imageData)) {
    const e = new Error('Drive images cannot be fetched for Pixtral (CORS). Use Gemini instead.');
    e.status = 400;
    throw e;
  }
  const base64 = await imageToBase64(imageData);
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(context) },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }]
    })
  });
  if (!response.ok) {
    const e = new Error(`Pixtral ${response.status}`);
    e.status = response.status;
    throw e;
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty Pixtral response');
  return parseAIJson(text);
}

async function callProvider(provider, imageData, context, apiKey) {
  if (provider.id === 'groq' || provider.id === 'groq-maverick') return callGroq(provider, imageData, context, apiKey);
  if (provider.id.startsWith('gemini')) return callGemini(provider, imageData, context, apiKey);
  if (provider.id === 'pixtral') return callPixtral(provider, imageData, context, apiKey);
  throw new Error(`Unknown provider: ${provider.id}`);
}

/**
 * Analyze a single photo with AI.
 * @param {string} imageData - dataURL or remote URL
 * @param {object} context - { treatment, daa, rep, historyPrompt }
 * @param {function} onProgress - optional (message: string) => void
 * @returns {{ success: boolean, data?: object, provider?: string, error?: string }}
 */
// Errors where retrying the same image/key will never help
function isNonRetryable(err) {
  const s = err.status;
  if (s === 400 || s === 401 || s === 403) return true;
  const msg = err.message || '';
  if (msg.includes('Unable to process input image')) return true;
  if (msg.includes('Invalid API Key') || msg.includes('invalid_api_key')) return true;
  if (msg.includes('DRIVE_URL_NO_BASE64') || msg.includes('Drive images cannot be fetched')) return true;
  return false;
}

function isDriveSkip(err) {
  const msg = err.message || '';
  return msg.includes('DRIVE_URL_NO_BASE64') || msg.includes('Drive images cannot be fetched');
}

// 429 = quota exceeded for this key, skip to next key but don't retry
function isQuotaError(err) {
  return err.status === 429 || (err.message || '').includes('429');
}

export async function analyzePhoto(imageData, context = {}, onProgress = null) {
  const resolved = typeof imageData === 'string' ? imageData : resolvePhotoSrc(imageData);
  if (!resolved) {
    return { success: false, error: 'Photo has no valid URL or image data. Re-upload the photo and try again.' };
  }
  imageData = resolved;
  
  // Validate category isolation if category is provided in context
  if (context.category) {
    const { validateAIAnalysisCategory } = await import('../utils/aiCategoryIsolation.js');
    validateAIAnalysisCategory(context.category, 'multiProvider photo analysis');
    console.log(`[MultiProvider AI] Category isolation enforced: analyzing ${context.category} photo`);
  }
  
  let usage = loadUsage();
  const delay = ms => new Promise(res => setTimeout(res, ms));
  let imageErrorCount = 0; // track how many providers say image is bad

  for (const provider of PROVIDERS) {
    const keys = getAPIKeys(provider.id);
    if (!keys.length) continue;

    for (let ki = 0; ki < keys.length; ki++) {
      if (!hasQuota(provider, ki, usage)) continue;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (onProgress) onProgress(`Trying ${provider.name}${attempt > 1 ? ' (retry)' : ''}...`);
          const result = await callProvider(provider, imageData, context, keys[ki]);
          usage = incrementUsage(provider, ki, usage);
          return { success: true, provider: provider.name, data: result };
        } catch (err) {
          console.warn(`[AI] ${provider.name} key ${ki + 1} attempt ${attempt} failed:`, err.message);
          if (isNonRetryable(err)) {
            if (!isDriveSkip(err) && (err.status === 400 || (err.message || '').includes('Unable to process input image'))) {
              imageErrorCount++;
            }
            break; // skip to next provider/key
          }
          if (isQuotaError(err)) break; // 429 — skip this key, try next
          if (attempt < 2) await delay(2000);
        }
      }
    }
  }

  // If every provider said bad image, give a clear user-facing message
  if (imageErrorCount >= 3) {
    return { success: false, error: 'Image could not be processed by any AI provider. Try re-capturing or cropping the photo and try again.' };
  }

  return { success: false, error: 'All AI providers exhausted. Check your API keys in Settings.' };
}

/**
 * Analyze multiple photos sequentially with progress callback.
 * @param {Array<{imageData, trialId, treatment, daa, rep}>} items
 * @param {function} onProgress - ({ current, total, trialId, message }) => void
 * @param {function} onResult - ({ trialId, daa, data }) => void
 */
export async function analyzePhotosBatch(items, onProgress, onResult) {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) onProgress({ current: i + 1, total: items.length, trialId: item.trialId, imageData: item.imageData, message: `Analyzing photo ${i + 1}/${items.length}` });

    const result = await analyzePhoto(item.imageData, {
      treatment: item.treatment,
      daa: item.daa,
      rep: item.rep,
      category: item.category,
    }, (msg) => {
      if (onProgress) onProgress({ current: i + 1, total: items.length, trialId: item.trialId, imageData: item.imageData, message: msg });
    });

    if (result.success && result.data) {
      if (onResult) await onResult({ trialId: item.trialId, daa: item.daa, data: result.data, photoDate: item.photoDate, imageData: item.imageData, success: true });
    } else {
      if (onResult) await onResult({ trialId: item.trialId, daa: item.daa, data: null, photoDate: item.photoDate, imageData: item.imageData, success: false, error: result.error || 'AI analysis skipped' });
    }

    if (i < items.length - 1) await delay(4000);
  }
}

/**
 * Save AI keys to localStorage (used by Settings page).
 */
export function saveAIKey(providerId, key) {
  localStorage.setItem(`AI_KEY_${providerId.toUpperCase()}`, key.trim());
}

export function getAIKey(providerId) {
  return localStorage.getItem(`AI_KEY_${providerId.toUpperCase()}`) || '';
}

export async function identifyWeedFromPhoto(imageDataUrl, category = 'herbicide') {
  const geminiKeys = getAPIKeys('gemini-3.5-flash');
  if (!geminiKeys.length) {
    throw new Error('No Gemini API key available in Settings');
  }

  const isHerbicide = category === 'herbicide';
  let targetName = 'weed';
  let categoryInstructions = '';
  
  if (category === 'fungicide') {
    targetName = 'fungal pathogen/disease';
    categoryInstructions = `
SPECIAL FOCUS: Identify early/late blight, powdery mildew, rusts, or leaf spots. Estimate pathogen/lesion coverage on leaves.
For each disease symptom found:
1. Identify the pathogen species (e.g. Phytophthora infestans, Alternaria solani).
2. Draw a bounding box around the affected leaf or crop canopy patch showing the lesions.
3. Every single disease/symptom patch you detect must have a bounding box. Do not leave any major symptomatic area unbounded.`;
  } else if (category === 'pesticide' || category === 'insecticide') {
    targetName = 'pest damage/insect pest';
    categoryInstructions = `
SPECIAL FOCUS: Identify caterpillars, aphids, whiteflies, thrips, spider mites, or their physical feeding damage/lesions.
For each pest/damage indicator found:
1. Identify the pest species or damage type (e.g. Bemisia tabaci, Liriomyza trifolii).
2. Draw a bounding box around the insect cluster or damaged leaves/stems.
3. Every major insect cluster or feeding site must have a bounding box.`;
  } else if (category === 'nutrition') {
    targetName = 'nutrient deficiency symptom';
    categoryInstructions = `
SPECIAL FOCUS: Identify chlorosis, necrosis, leaf tip burn, vein yellowing, or nutrient deficiency stress (nitrogen, iron, potassium, etc.).
For each nutritional symptom found:
1. Identify the deficiency type (e.g. Nitrogen Deficiency, Iron Deficiency).
2. Draw a bounding box around the leaves or canopy area expressing the deficiency.
3. Every major symptomatic leaf or canopy area must have a bounding box.`;
  } else if (category === 'biostimulant') {
    targetName = 'vigor/growth indicator';
    categoryInstructions = `
SPECIAL FOCUS: Identify canopy expansion, shoot density, root development, or wilting recovery indicators.
For each growth/vigor indicator found:
1. Identify the indicator type (e.g. Canopy Expansion, Vigor Indicator).
2. Draw a bounding box around the healthy/expanding vegetative areas showing biostimulation.`;
  } else {
    categoryInstructions = `
SPECIAL FOCUS: Identify weed species (broadleaves, grasses, sedges).
1. Identify the prominent broadleaf weed patch (e.g. Richardia brasiliensis or Spergula arvensis) and draw its bounding box.
2. Identify the surrounding grass weeds (e.g. Barnyard Grass, Crabgrass, or general Grasses) and draw separate bounding boxes enclosing those grassy areas.
3. Every single weed species you detect must have a bounding box. Do not leave any major weed area unbounded.
4. If a species grows in a dense group or overlaps (like dense grass patches), draw a single large bounding box enclosing that entire patch/stand.`;
  }

  const promptText = `Analyze this agricultural plot photo and identify ALL visible ${targetName} species or symptoms.
You MUST search the entire image frame thoroughly. Do NOT just identify the single most prominent symptom/organism. If there are other targets surrounding the main patch, you MUST detect, identify, and draw bounding boxes around them as well.
${categoryInstructions}

Coordinates MUST be in normalized 0-1000 format [ymin, xmin, ymax, xmax] (where 0,0 is top-left of the image and 1000,1000 is bottom-right).

Return a JSON array containing the detected entities.
Each item in the array MUST have this format:
{
  "name": "Scientific/Standardized name of the ${targetName}",
  "commonName": "Common name of the ${targetName}",
  "cover": 25, // estimated percentage cover/severity of this ${targetName} patch/species in the frame (1-100)
  "growthStage": "Vegetative/Seedling/Flowering/Mature/Symptomatic/Stressed/etc.",
  "box_2d": [ymin, xmin, ymax, xmax], // Bounding box coordinates enclosing the plant, lesions, or patch
  "confidence": 0.85 // confidence level (0.0 to 1.0)
}
Example output:
[
  {"name": "Richardia brasiliensis", "commonName": "Tropical Mexican Clover", "cover": 35, "growthStage": "Flowering", "box_2d": [250, 260, 530, 440], "confidence": 0.9},
  {"name": "Echinochloa crus-galli", "commonName": "Barnyard Grass", "cover": 40, "growthStage": "Vegetative", "box_2d": [290, 210, 800, 520], "confidence": 0.85}
]
JSON ONLY. Do not write any conversational text or explanation. Only output the JSON array.`;

  const driveId = getDriveFileId(imageDataUrl);
  let imagePart;
  if (driveId) {
    imagePart = { fileData: { mimeType: 'image/jpeg', fileUri: `https://drive.google.com/uc?export=download&id=${driveId}` } };
  } else {
    const base64 = await imageToBase64(imageDataUrl);
    imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64 } };
  }

  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];
  let lastError = null;

  for (const model of models) {
    for (const apiKey of geminiKeys) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: promptText },
              imagePart
            ]}],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1
            }
          })
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Model ${model} returned HTTP ${resp.status}: ${errText}`);
        }

        const d = await resp.json();
        const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = txt.match(/\[.*\]/s);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        
        if (txt.trim()) {
          return [{ name: 'Unknown', commonName: txt.slice(0, 120), cover: 0, growthStage: '', confidence: 0.5 }];
        }
      } catch (err) {
        console.warn(`Bounds detection failed with model ${model}:`, err.message);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('All Gemini models failed to analyze bounding boxes');
}

export async function generateTextWithAI(prompt, systemInstruction = '', onProgress = null) {
  let usage = loadUsage();
  const delay = ms => new Promise(res => setTimeout(res, ms));

  for (const provider of PROVIDERS) {
    const keys = getAPIKeys(provider.id);
    if (!keys.length) continue;

    for (let ki = 0; ki < keys.length; ki++) {
      if (!hasQuota(provider, ki, usage)) continue;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (onProgress) onProgress(`Trying ${provider.name}${attempt > 1 ? ' (retry)' : ''}...`);
          let responseText = '';
          const apiKey = keys[ki];

          if (provider.id.startsWith('gemini')) {
            const body = {
              contents: [{ parts: [{ text: prompt }] }]
            };
            if (systemInstruction) {
              body.systemInstruction = { parts: [{ text: systemInstruction }] };
            }
            const resp = await fetch(`${provider.endpoint}?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            if (!resp.ok) {
              const err = await resp.text();
              const e = new Error(`Gemini ${resp.status}: ${err.slice(0, 200)}`);
              e.status = resp.status;
              throw e;
            }
            const data = await resp.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          } else if (provider.id === 'groq' || provider.id === 'groq-maverick' || provider.id === 'pixtral') {
            const messages = [];
            if (systemInstruction) {
              messages.push({ role: 'system', content: systemInstruction });
            }
            messages.push({ role: 'user', content: prompt });
            const resp = await fetch(provider.endpoint, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: provider.model,
                messages: messages,
                temperature: 0.2
              })
            });
            if (!resp.ok) {
              const err = await resp.text();
              const e = new Error(`${provider.name} ${resp.status}: ${err.slice(0, 200)}`);
              e.status = resp.status;
              throw e;
            }
            const data = await resp.json();
            responseText = data.choices?.[0]?.message?.content || '';
          }

          if (responseText) {
            usage = incrementUsage(provider, ki, usage);
            return responseText;
          }
        } catch (err) {
          console.warn(`[AI Text] ${provider.name} key ${ki + 1} attempt ${attempt} failed:`, err.message);
          if (isNonRetryable(err)) break;
          if (isQuotaError(err)) break;
          if (attempt < 2) await delay(2000);
        }
      }
    }
  }

  throw new Error('All AI text generation providers exhausted. Please verify your API keys in Settings.');
}

export async function parseHarvestTextLog(textInput, category = 'tomato') {
  const prompt = `You are an agricultural data assistant. Parse the following unstructured harvest log note and extract the structured values:
"${textInput}"

Extract:
1. Harvest Date (Format: YYYY-MM-DD or standard date format if mentioned, otherwise leave empty).
2. Fruit/Item Count (Number of items harvested).
3. Marketable Yield Weight in Grams.
4. Unmarketable Yield Weight in Grams.
5. Notes/Remarks (Summary of defects, grades, observations).

RULES:
- If a value is not mentioned or cannot be inferred, return null or empty string for notes.
- Convert any other weight units (e.g. kg, lbs, oz) to Grams (1 kg = 1000g, 1 lb = 453.59g, 1 oz = 28.35g).

OUTPUT FORMAT - JSON ONLY (no markdown code blocks, no explanation):
{
  "harvestDate": "YYYY-MM-DD",
  "actualFruitCount": 42,
  "actualMarketableWeight": 1200,
  "actualUnmarketableWeight": 150,
  "notes": "Extracted notes"
}`;

  const systemInstruction = "You are a precise JSON extractor. Output ONLY the raw JSON object matching the requested schema. No explanation, no markdown.";
  const rawResponse = await generateTextWithAI(prompt, systemInstruction);
  return parseAIJson(rawResponse);
}

export { PROVIDERS, getAPIKeys };
