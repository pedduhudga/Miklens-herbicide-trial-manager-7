// src/utils/voiceParser.js
// 100% Free Client-Side Speech & Natural Language Parser for Hands-Free Field Scouting.
// Operates with zero API costs using standard Browser Web Speech API & client NLP.

/**
 * Check if the browser supports native Speech Recognition (Web Speech API)
 * Supported in Chrome, Edge, Safari, Opera, Android Webview.
 */
export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && (
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window
  );
}

/**
 * Create a speech recognition instance with optimal field trial defaults
 */
export function createSpeechRecognizer({ onResult, onError, onEnd }) {
  if (!isSpeechRecognitionSupported()) return null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = new SpeechRecognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = 'en-US';

  recognizer.onresult = (event) => {
    let transcript = '';
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    if (onResult) onResult({ transcript: transcript.trim(), isFinal });
  };

  recognizer.onerror = (event) => {
    if (onError) onError(event);
  };

  recognizer.onend = () => {
    if (onEnd) onEnd();
  };

  return recognizer;
}

/**
 * Parse natural spoken field scouting text into structured observation data.
 * @param {string} text - Raw speech transcript
 * @param {Object} options - Optional context { knownFormulations, knownTargets }
 * @returns {Object} Extracted trial observation fields
 */
export function parseVoiceObservation(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return {
      rawText: '',
      plot: '',
      formulation: '',
      dosage: '',
      target: '',
      efficacy: null,
      result: '',
      notes: '',
      weather: { temp: '', rain: '' }
    };
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Extract Plot Number: e.g. "plot 4", "plot #2", "plot no 3"
  let plot = '';
  const plotMatch = lower.match(/\bplot\s*(?:no\.?|number|#)?\s*(\d+[a-z]?)\b/i);
  if (plotMatch) {
    plot = plotMatch[1].toUpperCase();
  }

  // 2. Extract Efficacy Percentage: e.g. "95 percent", "95%", "95 pct kill", "kill rate 90"
  let efficacy = null;
  const directPct = lower.match(/\b(\d{1,3})\s*(?:%|percent\b|pct\b)/i);
  const keywordEff = lower.match(/\b(?:efficacy|kill|control|mortality)\s*(?:is|at|of|:)?\s*(\d{1,3})\b/i);

  if (directPct) {
    const val = parseInt(directPct[1], 10);
    if (val >= 0 && val <= 100) efficacy = val;
  } else if (keywordEff) {
    const val = parseInt(keywordEff[1], 10);
    if (val >= 0 && val <= 100) efficacy = val;
  }

  // 3. Derive Result rating (agronomic EWRS standard)
  let result = '';
  if (lower.includes('excellent')) {
    result = 'Excellent';
  } else if (lower.includes('good')) {
    result = 'Good';
  } else if (lower.includes('fair')) {
    result = 'Fair';
  } else if (lower.includes('poor')) {
    result = 'Poor';
  } else if (efficacy !== null) {
    if (efficacy >= 70) result = 'Excellent';
    else if (efficacy >= 50) result = 'Good';
    else if (efficacy >= 30) result = 'Fair';
    else result = 'Poor';
  }

  // 4. Extract Dosage: e.g. "at 40 ml", "@ 2.5 ml/l", "10 ml/L", "2 l/ha", "5 grams"
  let dosage = '';
  const doseMatch = lower.match(/\b(?:at|@)?\s*(\d+(?:\.\d+)?)\s*(ml\/l|ml|l\/ha|litres?|liters?|gm|g|kg|kg\/ha)\b/i);
  if (doseMatch) {
    dosage = `${doseMatch[1]} ${doseMatch[2]}`;
  }

  // 5. Extract Weather Info: temperature & rainfall
  const weather = { temp: '', rain: '' };
  const tempMatch = lower.match(/\b(\d{1,2})\s*(?:°?c|degrees|deg|celsius)\b/i);
  if (tempMatch) {
    weather.temp = tempMatch[1];
  }
  if (lower.includes('sunny') || lower.includes('clear')) weather.rain = 'sunny';
  else if (lower.includes('dry') || lower.includes('no rain')) weather.rain = 'dry';
  else if (lower.includes('rainy') || lower.includes('wet') || lower.includes('raining')) weather.rain = 'rain';
  else if (lower.includes('cloudy') || lower.includes('overcast')) weather.rain = 'cloudy';

  // 6. Match Formulation & Target Species
  let formulation = '';
  let target = '';

  const knownFormulations = options.knownFormulations || [];
  for (const f of knownFormulations) {
    const fName = (typeof f === 'string' ? f : f.Name || f.name || '').trim();
    if (fName && lower.includes(fName.toLowerCase())) {
      formulation = fName;
      break;
    }
  }

  const knownTargets = options.knownTargets || [
    'Bermudagrass', 'Cynodon dactylon', 'Parthenium', 'Parthenium hysterophorus',
    'Cyperus rotundus', 'Purple nutsedge', 'Echinochloa', 'Amaranthus',
    'Broadleaf', 'Broadleaf Weed', 'Grassy Weed', 'Sedge'
  ];
  for (const t of knownTargets) {
    const tName = (typeof t === 'string' ? t : t.Name || t.name || '').trim();
    if (tName && lower.includes(tName.toLowerCase())) {
      target = tName;
      break;
    }
  }

  // 7. Clean up Notes: remove matched phrases to leave natural observations
  let notes = raw;
  const phrasesToRemove = [
    plotMatch ? plotMatch[0] : null,
    directPct ? directPct[0] : null,
    doseMatch ? doseMatch[0] : null,
    tempMatch ? tempMatch[0] : null,
    formulation ? new RegExp(formulation, 'i') : null,
    target ? new RegExp(target, 'i') : null,
    /\b(?:kill|control|efficacy|percent|pct|degrees|celsius|plot)\b/gi,
  ].filter(Boolean);

  for (const p of phrasesToRemove) {
    notes = notes.replace(p, '');
  }
  notes = notes.replace(/[,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Capitalize first letter of notes
  if (notes) {
    notes = notes.charAt(0).toUpperCase() + notes.slice(1);
  }

  return {
    rawText: raw,
    plot,
    formulation,
    dosage,
    target,
    efficacy,
    result,
    notes,
    weather
  };
}
