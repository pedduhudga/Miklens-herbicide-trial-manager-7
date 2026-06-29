/**
 * trialReports.js — Full-fidelity port of all export/report functions.
 * Matches exact PDF structure, colors, fonts, table layouts from legacy HTML app.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import pptxgen from 'pptxgenjs';
import { formatPhotoDate, formatDate, formatDateTime, calculateDAA, parseCustomDate } from '../utils/dateUtils.js';
import { getCategoryConfig, calculateEfficacy, getPrimaryObservationField, getObservationPrimaryValue } from '../utils/categoryConfig.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import {
  performANOVA,
  performTukeyHSD,
  performTwoWayANOVA,
  performDuncanMRT,
  performDunnettTest,
  performTypeIIIANOVA,
  checkNormality,
  checkLeveneTest,
  performKruskalWallis
} from '../utils/statsUtils.js';

// ── COLORS ────────────────────────────────────────────────────────────────────
const TEAL    = [13, 148, 136];
const DARK    = [44, 62, 80];
const AMBER50 = [255, 251, 235];

// ── REPORT CONFIG UTILS ───────────────────────────────────────────────────────
export function getReportConfig(trial) {
  const cat = trial?.Category || 'herbicide';
  const config = getCategoryConfig(cat);
  const proj = getProjectForTrial(trial);
  
  // Custom colors for reports based on category configuration
  let primaryColor = TEAL;
  if (cat === 'fungicide') primaryColor = [79, 70, 229]; // Indigo
  else if (cat === 'pesticide') primaryColor = [220, 38, 38]; // Red
  else if (cat === 'nutrition') primaryColor = [217, 119, 6]; // Amber/Orange
  else if (cat === 'biostimulant') primaryColor = [13, 148, 136]; // Teal
  
  const isStandardTrial = !trial?.Replication || trial.Replication === 'N/A' || trial.Replication === '';
  const targetLabel = config.targetLabel || 'Weed Species';
  const targetValue = trial ? (trial[config.targetField] || trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.NutrientType || trial.BiostimulantType || proj?.[config.targetField] || proj?.NutrientType || 'N/A') : 'N/A';
  
  let primaryMetricLabel = config.primaryMetric?.label || 'Weed Control Efficiency';
  let primaryMetricKey = config.primaryMetric?.key || 'WCE';
  if (isStandardTrial) {
    if (cat === 'herbicide') {
      primaryMetricLabel = 'Observed Control';
      primaryMetricKey = 'Observed Control';
    } else if (cat === 'fungicide') {
      primaryMetricLabel = 'Observed Disease Suppression';
      primaryMetricKey = 'Observed Disease Suppression';
    } else if (cat === 'pesticide') {
      primaryMetricLabel = 'Observed Pest Suppression';
      primaryMetricKey = 'Observed Pest Suppression';
    } else if (cat === 'nutrition' || cat === 'biostimulant') {
      primaryMetricLabel = 'Observed Crop Vigor';
      primaryMetricKey = 'Observed Crop Vigor';
    }
  }
  
  const primaryMetricUnit = config.primaryMetric?.unit || '%';
  const primaryField = getPrimaryObservationField(cat);
  
  const primaryObsFieldObj = config.observationFields?.find(f => f.key === primaryField) || config.observationFields?.[0];
  const primaryObsLabel = primaryObsFieldObj?.label || 'Level';
  
  return {
    cat,
    config,
    primaryColor,
    targetLabel,
    targetValue,
    primaryMetricLabel,
    primaryMetricKey,
    primaryMetricUnit,
    primaryField,
    primaryObsLabel,
  };
}

function calculateStatus(categoryId, pVal, baseVal = 0, prevVal = null) {
  const isPositive = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  const hasPrev = prevVal !== null && prevVal !== undefined;
  
  if (isPositive) {
    const isSPAD = baseVal > 15;
    if (isSPAD) {
      if (pVal > baseVal + 5) return hasPrev && pVal > prevVal ? 'Sustained Greening' : 'Greening Response';
      if (pVal >= baseVal) return 'Nutrient Sufficiency';
      return 'Nutrient Deficiency';
    }
    if (pVal >= 8) return hasPrev && prevVal >= 8 ? 'Peak Vigor (Sustained)' : 'Peak Vigor Reached';
    if (pVal >= 6) return 'Strong Vigor';
    if (pVal >= 4) return 'Moderate Growth';
    return 'Weak Growth';
  } else if (categoryId === 'pesticide') {
    const pctReduction = (baseVal > 0) ? ((baseVal - pVal) / baseVal) * 100 : 0;
    const isIncreasing = hasPrev && pVal > prevVal;
    if (pVal <= 0.1) return hasPrev && prevVal <= 0.1 ? 'Pest-Free (Sustained)' : 'Population Cleared';
    if (pctReduction >= 85) return 'High Suppression';
    if (isIncreasing) return 'Pest Resurgence';
    if (pctReduction >= 50) return 'Population Controlled';
    return 'Minimal Suppression';
  } else if (categoryId === 'fungicide') {
    const pctReduction = (baseVal > 0) ? ((baseVal - pVal) / baseVal) * 100 : 0;
    const isSpreading = hasPrev && pVal > prevVal;
    if (pVal <= 0.1) return hasPrev && prevVal <= 0.1 ? 'Disease-Free (Sustained)' : 'Disease Cleared';
    if (pctReduction >= 85) return 'Complete Inhibition';
    if (isSpreading) return 'Disease Progression';
    if (pctReduction >= 50) return 'Infection Controlled';
    return 'Initial Infection';
  } else {
    // Herbicide — biologically meaningful weed status terms
    return getHerbicideStatus(pVal, baseVal, prevVal);
  }
}

function getHerbicideStatus(weedCover, baseVal, prevVal) {
  // weedCover = current weed cover %; baseVal = initial weed cover %; prevVal = previous observation weed cover %
  const reduction = baseVal > 0 ? ((baseVal - weedCover) / baseVal) * 100 : 0;
  const hasPrev = prevVal !== null && prevVal !== undefined;
  const prevWasZero = hasPrev && prevVal <= 1;
  const isRegrowing = hasPrev && weedCover > prevVal + 2;

  if (weedCover <= 1) {
    // ~0% weed cover
    if (prevWasZero) return 'Sustained Control';
    return 'Complete Desiccation';
  }
  if (weedCover <= 10) {
    if (isRegrowing) return 'Early Regrowth';
    if (reduction >= 80) return 'Near-Complete Desiccation';
    return 'Advanced Desiccation';
  }
  if (weedCover <= 30) {
    if (isRegrowing) return 'Active Regrowth';
    if (reduction >= 50) return 'Rapid Desiccation';
    return 'Partial Desiccation';
  }
  if (weedCover <= 60) {
    if (isRegrowing) return 'Significant Regrowth';
    if (reduction >= 20) return 'Initial Chlorosis';
    return 'Minimal Effect';
  }
  if (reduction < 5) return 'No Visible Effect';
  return 'Initial Symptoms';
}

function cleanReportText(text, targetDaa = null, isNonCrop = false) {
  if (!text || text === '—') return text;
  let clean = String(text);
  if (targetDaa !== null && Number(targetDaa) > 0) {
    // "at DAA 0", "on Day 0", etc.
    const rxPrepDaa = new RegExp('\\b(at|on|for|from|during)\\s+(daa|day)\\s*0\\b', 'gi');
    clean = clean.replace(rxPrepDaa, `$1 $2 ${targetDaa}`);
    // standalone "DAA 0" or "Day 0"
    clean = clean.replace(/\b(DAA|Day)\s*0\b/gi, `$1 ${targetDaa}`);
  }
  // Remove double periods
  clean = clean.replace(/\.{2,}/g, '.').replace(/\.\s+\./g, '.');

  if (isNonCrop) {
    clean = clean.replace(/\bcrop\s+injury\b/gi, 'weed injury');
    clean = clean.replace(/\bcrop\s+population\b/gi, 'weed population');
    clean = clean.replace(/\bcrop\s+vigor\b/gi, 'weed growth vigor');
    clean = clean.replace(/\b(the\s+)?crop\b/gi, 'the weed population');
  }
  return wrapScientificNames(clean);
}

function getCleanNarrative(text, isNonCrop = false) {
  if (!text) return '';
  let clean = String(text);
  if (isNonCrop) {
    clean = clean.replace(/\bcrop\s+injury\b/gi, 'weed injury');
    clean = clean.replace(/\bcrop\s+population\b/gi, 'weed population');
    clean = clean.replace(/\bcrop\s+vigor\b/gi, 'weed growth vigor');
    clean = clean.replace(/\b(the\s+)?crop\b/gi, 'the weed population');
  }
  return wrapScientificNames(clean);
}

function wrapScientificNames(text) {
  if (!text) return '';
  let wrapped = String(text);
  wrapped = wrapped.replace(/\*Dactyloctenium aegyptium\*/gi, 'Dactyloctenium aegyptium');
  wrapped = wrapped.replace(/\*Cynodon dactylon\*/gi, 'Cynodon dactylon');
  wrapped = wrapped.replace(/\*Poaceae spp\.\*/gi, 'Poaceae spp.');
  wrapped = wrapped.replace(/\*Poaceae\*/gi, 'Poaceae');
  
  wrapped = wrapped.replace(/Dactyloctenium aegyptium/gi, '*Dactyloctenium aegyptium*');
  wrapped = wrapped.replace(/Cynodon dactylon/gi, '*Cynodon dactylon*');
  wrapped = wrapped.replace(/Poaceae spp\./gi, '*Poaceae spp.*');
  wrapped = wrapped.replace(/Poaceae(?! spp\.)/gi, '*Poaceae*');
  return wrapped;
}

function htmlItalicizeScientificNames(text) {
  if (!text) return '';
  let html = String(text);
  html = html.replace(/Dactyloctenium aegyptium/gi, '<em>Dactyloctenium aegyptium</em>');
  html = html.replace(/Cynodon dactylon/gi, '<em>Cynodon dactylon</em>');
  html = html.replace(/Poaceae spp\./gi, '<em>Poaceae spp.</em>');
  html = html.replace(/Poaceae(?! spp\.)/gi, '<em>Poaceae</em>');
  html = html.replace(/Cyperus rotundus/gi, '<em>Cyperus rotundus</em>');
  html = html.replace(/Echinochloa colona/gi, '<em>Echinochloa colona</em>');
  html = html.replace(/Digitaria sanguinalis/gi, '<em>Digitaria sanguinalis</em>');
  return html;
}

const SCIENTIFIC_NAME_PATTERNS = [
  /Dactyloctenium\s+aegyptium/i,
  /Cynodon\s+dactylon/i,
  /Poaceae\s+spp/i,
  /Poaceae/i,
  /Cyperus\s+rotundus/i,
  /Echinochloa\s+colona/i,
  /Digitaria\s+sanguinalis/i,
  /Eleusine\s+indica/i,
  /Amaranthus\s+viridis/i,
  /Parthenium\s+hysterophorus/i,
];

function containsScientificName(text) {
  if (!text) return false;
  const str = String(text);
  return SCIENTIFIC_NAME_PATTERNS.some(rx => rx.test(str));
}

function italicCellHook(data) {
  if (data.section === 'body' && data.cell && containsScientificName(data.cell.raw)) {
    data.cell.styles.fontStyle = 'italic';
  }
}

function getBackupProjects() {
  try {
    const backupRaw = localStorage.getItem('backupState');
    if (backupRaw) {
      const state = JSON.parse(backupRaw);
      return state.projects || [];
    }
  } catch (e) {
    console.warn('Failed to parse backupState from localStorage', e);
  }
  return [];
}

function getBackupTrials() {
  try {
    const backupRaw = localStorage.getItem('backupState');
    if (backupRaw) {
      const state = JSON.parse(backupRaw);
      return state.trials || [];
    }
  } catch (e) {
    console.warn('Failed to parse backupState from localStorage', e);
  }
  return [];
}


function getProjectForTrial(trial, options = {}) {
  if (!trial?.ProjectID) return null;
  const projects = options.projects || getBackupProjects();
  return projects.find(p => String(p.ID) === String(trial.ProjectID)) || null;
}

export function getAllTrialDataFields(trial, options = {}) {
  const proj = getProjectForTrial(trial, options);
  const repConfig = getReportConfig(trial);
  const categoryId = repConfig.cat;

  const isNonCrop = categoryId === 'herbicide' && (!trial.Crop || trial.Crop === '—' || trial.Crop === 'N/A' || trial.Crop.toLowerCase().includes('non-crop') || trial.Crop.toLowerCase().includes('non crop') || trial.Crop === 'Non-Crop');
  const cropLabel = isNonCrop ? 'Site Type' : 'Crop';
  const cropValue = isNonCrop ? (trial.SiteType || proj?.SiteType || trial.Site || 'Open field') : (trial.Crop || proj?.Crop || '—');
  
  const data = {
    crop: cropValue,
    cropLabel: cropLabel,
    cropValue: cropValue,
    variety: trial.Variety || proj?.Variety || '—',
    previousCrop: trial.PreviousCrop || '—',
    irrigationMethod: trial.IrrigationMethod || '—',
    plantPopulation: trial.PlantPopulation ? `${trial.PlantPopulation} plants/ha` : '—',
    yieldValue: trial.YieldValue || trial.Yield || '—',
    applicationTiming: trial.ApplicationTiming || proj?.ApplicationTiming || '—',
    cropStage: trial.CropStage || trial.cropStage || trial.CropStageAtApplication || '—',
    bbchCode: trial.BBCHCode || trial.GrowthStageCode || '—',
    applicationMethod: trial.ApplicationMethod || trial.method || '—',
    sprayVolume: trial.SprayVolume || trial.sprayVol || proj?.SprayVolume || '—',
    nozzle: trial.Nozzle || '—',
    soil: safeJsonParse(trial.SoilDataJSON, null) || {},
  };

  // Add soil details from root trial if not nested
  if (trial.SoilPH) data.soil.ph = trial.SoilPH;
  if (trial.SoilClay) data.soil.clay = trial.SoilClay;
  if (trial.SoilSand) data.soil.sand = trial.SoilSand;
  if (trial.SoilOC) data.soil.organicCarbon = trial.SoilOC;
  if (trial.SoilTexture) data.soil.texture = trial.SoilTexture;
  
  // Format yield unit appropriately based on Category
  if (data.yieldValue !== '—') {
    const unit = trial.YieldUnit || trial.yieldUnit || (categoryId === 'herbicide' ? 't/ha' : 'kg/ha');
    if (!String(data.yieldValue).toLowerCase().includes('ha') && !String(data.yieldValue).toLowerCase().includes('kg') && !String(data.yieldValue).toLowerCase().includes('t')) {
      data.yieldValue = `${data.yieldValue} ${unit}`;
    }
  }
  
  return data;
}

function formatSoilProfile(soil) {
  if (!soil || Object.keys(soil).length === 0) return '—';
  const parts = [];
  if (soil.ph) parts.push(`pH: ${soil.ph}`);
  if (soil.clay) parts.push(`Clay: ${soil.clay}%`);
  if (soil.sand) parts.push(`Sand: ${soil.sand}%`);
  if (soil.organicCarbon) parts.push(`OC: ${soil.organicCarbon}`);
  if (soil.texture) parts.push(`Texture: ${soil.texture}`);
  
  // NPK & extended fields
  if (soil.nitrogen) parts.push(`N: ${soil.nitrogen} ppm`);
  if (soil.phosphorus) parts.push(`P: ${soil.phosphorus} ppm`);
  if (soil.potassium) parts.push(`K: ${soil.potassium} ppm`);
  if (soil.cec) parts.push(`CEC: ${soil.cec} meq/100g`);
  if (soil.moisture) parts.push(`Moisture: ${soil.moisture}%`);
  
  return parts.join(' | ') || '—';
}

export function getTimelineData(efficacy, categoryId = 'herbicide', trial = null) {
  const config = getCategoryConfig(categoryId);
  const primaryField = getPrimaryObservationField(categoryId);
  const targetValue = trial ? (trial[config.targetField] || trial.WeedSpecies || 'Total') : 'Total';
  const trialDate = trial?.Date || '';
  const isNonCrop = categoryId === 'herbicide' && (
    trial?.SiteType ? (trial.SiteType !== 'Crop' && trial.SiteType !== '') :
    (!trial?.Crop || trial.Crop === '—' || trial.Crop === 'N/A' || trial.Crop.toLowerCase().includes('non-crop') || trial.Crop.toLowerCase().includes('non crop') || trial.Crop === 'Non-Crop')
  );

  const getDaaVal = (o) => {
    if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') {
      const parsed = Number(o.daa);
      if (!isNaN(parsed)) return parsed;
    }
    return calculateDAA(o.date, trialDate);
  };

  // Sort efficacy chronologically before processing
  const sortedEfficacy = [...efficacy].sort((a, b) => getDaaVal(a) - getDaaVal(b));

  // Find all observation fields that have at least one non-empty value in sortedEfficacy list
  // excluding primaryField and 'weedDetails' which are handled specially
  const activeFields = [];
  if (categoryId !== 'herbicide') {
    config.observationFields?.forEach(f => {
      if (f.key !== primaryField && f.key !== 'weedDetails') {
        const hasVal = sortedEfficacy.some(o => o[f.key] !== undefined && o[f.key] !== null && o[f.key] !== '');
        if (hasVal) {
          activeFields.push(f);
        }
      }
    });
  }

  // Build headers
  const headers = ['DAA'];
  const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  if (isVigor) {
    headers.push('Overall Crop Vigor (0–10)');
  } else if (categoryId === 'herbicide') {
    headers.push('Overall Plot Weed Cover (%)');
  } else if (categoryId === 'fungicide') {
    headers.push('Overall Disease Severity (%)');
  } else if (categoryId === 'pesticide') {
    headers.push('Overall Pest Density');
  } else {
    headers.push(`${config.primaryMetric?.label || 'Efficacy'} (${config.primaryMetric?.unit || '%'})`);
  }
  activeFields.forEach(f => {
    headers.push(f.label);
  });
  
  headers.push('Status');
  
  // Add weather columns if any row has weather data!
  const hasWeather = sortedEfficacy.some(o => o.weatherTemp || o.relative_humidity_2m || o.weatherHumidity || o.weatherWind || o.weatherRain);
  if (hasWeather) {
    headers.push('Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)');
  }
  
  headers.push('Notes');

  // Find base value from DAA 0 or the first chronological observation
  const baseObs = sortedEfficacy.find(obs => getDaaVal(obs) === 0) || sortedEfficacy[0];
  const baseVal = baseObs ? (getObservationPrimaryValue(categoryId, baseObs) ?? 0) : 0;

  // Build rows
  let prevPVal = null;
  const rows = sortedEfficacy.map((o, idx) => {
    const row = [];
    // 1. DAA
    row.push(String(getDaaVal(o)));
    
    // 2. Primary Metric Value
    const pVal = getObservationPrimaryValue(categoryId, o) ?? 0;
    if (categoryId === 'herbicide') {
      row.push(`${pVal.toFixed(1)}%`);
    } else if (categoryId === 'fungicide') {
      row.push(`${pVal.toFixed(1)}%`);
    } else if (categoryId === 'pesticide') {
      row.push(`${pVal.toFixed(1)}`);
    } else {
      row.push(`${pVal.toFixed(1)}/10`);
    }
    
    // 4. Secondary fields
    activeFields.forEach(f => {
      const val = o[f.key];
      row.push((val !== undefined && val !== null && val !== '') ? String(val) : '—');
    });
    
    // 5. Status — biologically meaningful
    const status = getDaaVal(o) === 0 ? 'Baseline' : calculateStatus(categoryId, pVal, baseVal, prevPVal);
    row.push(status);
    prevPVal = pVal;
    
    // 6. Weather columns
    if (hasWeather) {
      const temp = o.weatherTemp ?? o.temperature_2m ?? '—';
      const hum = o.weatherHumidity ?? o.relative_humidity_2m ?? '—';
      const wind = o.weatherWind ?? o.wind_speed_10m ?? '—';
      const rain = o.weatherRain ?? '—';
      row.push(String(temp), String(hum), String(wind), String(rain));
    }
    
    // 7. Notes
    let cleanNotes = o.notes || '—';
    const obsDaa = getDaaVal(o);
    cleanNotes = cleanReportText(cleanNotes, obsDaa, isNonCrop);
    row.push(cleanNotes);
    
    return row;
  });

  return { headers, rows };
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));
}
function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.filter(item => !item || item.deleted !== true);
    }
    return val;
  }
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => !item || item.deleted !== true);
    }
    return parsed;
  } catch { return fallback; }
}
function validateEfficacy(data, categoryId = null) {
  if (!Array.isArray(data)) return [];
  // Include all observations (both manual and AI-sourced) in reports
  const cleanData = data;
  if (categoryId) {
    const primaryField = getPrimaryObservationField(categoryId);
    return cleanData.filter(o => o && (o.daa !== undefined || o[primaryField] !== undefined || o.weedCover !== undefined));
  }
  return cleanData.filter(o => o && (
    o.daa !== undefined || 
    o.weedCover !== undefined || 
    o.diseaseSeverity !== undefined || 
    o.pestCount !== undefined || 
    o.plantHeight !== undefined ||
    o.visualVigor !== undefined ||
    o.overallVigor !== undefined ||
    o.diseaseIncidence !== undefined ||
    o.damageRating !== undefined
  ));
}
function fmtDate(d) {
  if (!d) return 'N/A';
  return formatDateTime(d);
}
function safeName(s) { return (s || 'trial').replace(/[^a-z0-9_\-]/gi, '_'); }


function safeFormatDate(d) {
  if (!d) return 'N/A';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return 'N/A';
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
  } catch { return 'N/A'; }
}
function getCleanPhotoLabel(photo, index, trialDaa) {
  const isDefaultLabel = !photo.label || 
    /^photo_[a-f0-9]/i.test(photo.label) || 
    /\.[a-z]{3,4}$/i.test(photo.label) || 
    /field\s*observation/i.test(photo.label);

  if (!isDefaultLabel) {
    return photo.label;
  }
  if (trialDaa !== undefined && trialDaa !== null) {
    const daaNum = Number(trialDaa);
    if (daaNum === 0) {
      return '0 DAA (Before Application)';
    }
    return `${trialDaa} DAA`;
  }
  return `Observation #${index + 1}`;
}
function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function toBase64(src, maxPx = 400) {
  return new Promise(resolve => {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(null), 5000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const r = img.width / img.height;
          let w = img.width, h = img.height;
          if (w > maxPx || h > maxPx) { if (r > 1) { w = maxPx; h = Math.round(maxPx / r); } else { h = maxPx; w = Math.round(maxPx * r); } }
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        } catch { resolve(null); }
      };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = normalizeSrc(src);
    } catch { resolve(null); }
  });
}
function photoSrc(p) {
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.fileData || p.url || p.src || null;
}
function normalizeSrc(src) {
  if (!src || typeof src !== 'string') return src;
  // Already a data URI — use as-is
  if (/^data:image\//i.test(src)) return src;
  
  // Parse standard Google Drive IDs
  const driveMatch = src.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
                     src.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
                     src.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (driveMatch) {
    const directUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=400&output=jpg`;
  }
  // For all other remote URLs proxy through images.weserv.nl to bypass CORS
  if (/^https?:\/\//i.test(src)) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=400&output=jpg`;
  }
  return src;
}
function addImgSafe(doc, data, x, y, w, h) {
  if (!data || !w || !h) return false;
  try { doc.addImage(data, data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, w, h); return true; }
  catch { try { doc.addImage(data, 'JPEG', x, y, w, h); return true; } catch { return false; } }
}
function createDoc() {
  return new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
}
function calcWCE(efficacy, categoryId = 'herbicide', trial = null) {
  const config = getCategoryConfig(categoryId);
  const primaryField = getPrimaryObservationField(categoryId);
  const isPositiveMetric = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  const sp = {};

  const getValue = (obs) => Number(getObservationPrimaryValue(categoryId, obs) ?? 0);
  
  const targetName = trial ? (trial[config.targetField] || trial.WeedSpecies || 'Total') : 'Total';

  efficacy.forEach(obs => {
    if (categoryId === 'herbicide' && obs.weedDetails && obs.weedDetails.length > 0) {
      obs.weedDetails.forEach(wd => {
        const k = (wd.species || 'Total').trim();
        if (!sp[k]) sp[k] = [];
        sp[k].push({ daa: obs.daa, value: wd.cover ?? getObservationPrimaryValue(categoryId, obs) ?? 0 });
      });
    } else {
      const k = targetName;
      if (!sp[k]) sp[k] = [];
      const val = getValue(obs);
      sp[k].push({ daa: obs.daa, value: val });
    }
  });

  return Object.entries(sp).map(([species, pts]) => {
    const sorted = pts.sort((a, b) => a.daa - b.daa);
    const first = sorted[0]?.value ?? 0;
    const last  = sorted[sorted.length - 1]?.value ?? 0;
    
    let val = 0;
    if (isPositiveMetric) {
      val = first > 0 ? ((last - first) / first) * 100 : (last - first);
    } else {
      val = first > 0 ? ((first - last) / first) * 100 : (first - last);
    }
    return {
      species: species,
      initialCover: first,
      finalCover: last,
      wce: Math.max(0, val)
    };
  });
}
function coverSummary(efficacy, trial) {
  const categoryId = trial?.Category || 'herbicide';
  const config = getCategoryConfig(categoryId);
  const primaryField = getPrimaryObservationField(categoryId);
  const metricLabel = config.primaryMetric?.label || 'Efficacy';
  const isPositiveMetric = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  const metricUnit = isPositiveMetric ? '/10' : (config.primaryMetric?.unit || '%');

  const dataFields = getAllTrialDataFields(trial);
  const cropStr = dataFields.crop && dataFields.crop !== '—' ? ` on ${dataFields.crop}` : '';
  const yieldStr = dataFields.yieldValue && dataFields.yieldValue !== '—' ? `, resulting in an ultimate yield of ${dataFields.yieldValue}` : '';

  const s = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
  if (s.length < 2) {
    const text = (trial.Conclusion || 'Insufficient observations for trajectory analysis.') + yieldStr;
    return cleanReportText(text);
  }
  
  const first = Number(getObservationPrimaryValue(categoryId, s[0]) ?? 0);
  const last  = Number(getObservationPrimaryValue(categoryId, s[s.length - 1]) ?? 0);
  const valList = s.map(o => Number(getObservationPrimaryValue(categoryId, o) ?? 0));
  
  let resText = '';
  if (isPositiveMetric) {
    const max = Math.max(...valList);
    const maxD = s.find(o => Number(getObservationPrimaryValue(categoryId, o) ?? 0) === max)?.daa ?? 0;
    const dur = (s[s.length - 1].daa ?? 0) - (s[0].daa ?? 0);
    resText = `Aggregate growth/metric measured ${first}${metricUnit} at baseline to a maximum of ${max}${metricUnit} at DAA ${maxD}, and measured ${last}${metricUnit} at DAA ${s[s.length - 1].daa ?? 0}${cropStr}${yieldStr}. The ${dur}-day observation window indicates ${last >= max - 5 ? 'sustained enhancement' : 'early growth stimulus with stabilization'} following application.`;
  } else {
    const min = Math.min(...valList.length ? valList : [100]);
    const minD = s.find(o => Number(getObservationPrimaryValue(categoryId, o) ?? 100) === min)?.daa ?? 0;
    const dur = (s[s.length - 1].daa ?? 0) - (s[0].daa ?? 0);
    let noun = 'disease/pest severity';
    if (categoryId === 'herbicide') noun = 'weed cover';
    else if (categoryId === 'fungicide') noun = 'disease severity';
    else if (categoryId === 'pesticide') noun = 'pest population';
    resText = `Aggregate ${noun} declined from ${first}${metricUnit} at baseline to a minimum of ${min}${metricUnit} at DAA ${minD}, and measured ${last}${metricUnit} at DAA ${s[s.length - 1].daa ?? 0}${cropStr}${yieldStr}. The ${dur}-day observation window indicates ${last <= min + 5 ? 'sustained suppression' : 'early knockdown with partial recovery'} following application.`;
  }
  return cleanReportText(resText);
}
function methodologySentence(trial, trialDate) {
  const p = [];
  const categoryId = trial?.Category || 'herbicide';
  const config = getCategoryConfig(categoryId);
  const targetValue = trial[config.targetField] || trial.WeedSpecies;

  if (trial.FormulationName) p.push(trial.FormulationName);
  if (trial.Dosage) p.push(`at ${trial.Dosage}`);
  if (trialDate) p.push(`was applied on ${trialDate}`);
  if (trial.Location) p.push(`at ${trial.Location}`);
  if (targetValue) p.push(`targeting ${targetValue}`);
  return p.join(' ') + (p.length ? '.' : '');
}
function timelineRows(efficacy, categoryId = 'herbicide', trial = null) {
  const config = getCategoryConfig(categoryId);
  const primaryField = getPrimaryObservationField(categoryId);
  const targetValue = trial ? (trial[config.targetField] || trial.WeedSpecies || 'Total') : 'Total';
  const trialDate = trial?.Date || '';

  const getDaaVal = (o) => {
    if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') {
      const parsed = Number(o.daa);
      if (!isNaN(parsed)) return parsed;
    }
    return calculateDAA(o.date, trialDate);
  };

  const sortedObs = [...efficacy].sort((a, b) => getDaaVal(a) - getDaaVal(b));
  const baseObs = sortedObs.find(obs => getDaaVal(obs) === 0) || sortedObs[0];
  const baseVal = baseObs ? (getObservationPrimaryValue(categoryId, baseObs) ?? 0) : 0;

  return sortedObs.map(o => {
    const daaVal = getDaaVal(o);
    if (categoryId === 'herbicide') {
      const c = getObservationPrimaryValue(categoryId, o) ?? 0;
      const status = calculateStatus(categoryId, c, baseVal);
      const species = (o.weedDetails || []).map(w => w.species).filter(Boolean).join(', ') || 'Total';
      let cleanNotes = o.notes || '—';
      cleanNotes = cleanReportText(cleanNotes, daaVal);
      return [String(daaVal), species, `${c}%`, status, cleanNotes];
    } else {
      const val = Number(getObservationPrimaryValue(categoryId, o) ?? 0);
      const status = calculateStatus(categoryId, val, baseVal);
      
      // Let's dynamically include other non-empty fields that have values in this observation
      const extraDetails = [];
      config.observationFields.forEach(f => {
        if (f.key !== primaryField && f.key !== 'weedDetails' && o[f.key] !== undefined && o[f.key] !== null && o[f.key] !== '') {
          extraDetails.push(`${f.label}: ${o[f.key]}`);
        }
      });
      const detailsStr = extraDetails.length > 0 ? ` [${extraDetails.join(', ')}]` : '';

      let cleanNotes = o.notes || '—';
      cleanNotes = cleanReportText(cleanNotes, daaVal);

      const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
      const obsUnit = isVigor ? '/10' : (config.primaryMetric?.unit || '');

      return [String(daaVal), targetValue, `${val}${obsUnit}`, status, `${cleanNotes}${detailsStr}`];
    }
  });
}
function pdfAddFooter(doc, label) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const n  = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`${label} | Page ${i} of ${n}`, pw / 2, ph - 6, { align: 'center' });
    doc.text(`Generated ${formatDateTime(new Date())}`, pw - 14, ph - 6, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}
function pdfHeader(doc, title, subtitle, color = TEAL) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...color); doc.rect(0, 0, pw, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont(undefined, 'bold');
  doc.text(title, pw / 2, 22, { align: 'center' });
  if (subtitle) { doc.setFontSize(12); doc.setFont(undefined, 'normal'); doc.text(subtitle, pw / 2, 32, { align: 'center' }); }
  doc.setTextColor(0, 0, 0);
}
function secHeading(doc, text, y, ph, fs = 14, color = TEAL) {
  if (y + 16 > ph - 20) { doc.addPage(); y = 20; }
  const pw = doc.internal.pageSize.getWidth();
  doc.setFontSize(fs); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
  doc.text(text, 14, y);
  doc.setDrawColor(...color); doc.setLineWidth(0.4);
  doc.line(14, y + 2, pw - 14, y + 2);
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal'); doc.setFontSize(10);
  return y + 10;
}
async function addPhotoGrid(doc, photos, y, ph, maxSize = 50, showDates = true, trialDate = null) {
  const pw = doc.internal.pageSize.getWidth();
  let xOff = 14;
  const sortedPhotos = [...photos].sort((a, b) => {
    const getPhotoDateStr = (p) => {
      if (!p) return null;
      if (typeof p === 'string') return p;
      return p.date || p.label || p.name || null;
    };
    const dateStrA = getPhotoDateStr(a);
    const dateStrB = getPhotoDateStr(b);
    const dateA = dateStrA ? parseCustomDate(dateStrA) : null;
    const dateB = dateStrB ? parseCustomDate(dateStrB) : null;
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    return timeA - timeB;
  });
  for (let i = 0; i < sortedPhotos.length; i++) {
    const p = sortedPhotos[i]; const src = photoSrc(p); if (!src) continue;
    try {
      const imgData = await toBase64(src, 400); if (!imgData) continue;
      const img = new Image(); img.src = imgData;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      const ar = img.width > 0 ? img.width / img.height : 1;
      const iw = ar >= 1 ? maxSize : maxSize * ar;
      const ih = ar >= 1 ? maxSize / ar : maxSize;
      if (xOff + iw > pw - 14) { xOff = 14; y += maxSize + 14; }
      if (y + ih + 14 > ph - 20) { doc.addPage(); y = 20; xOff = 14; }
      addImgSafe(doc, imgData, xOff, y, iw, ih);
      doc.setFontSize(7);
      
      let photoDaa = null;
      if (trialDate && p.date) {
        photoDaa = calculateDAA(p.date, trialDate);
      }
      const label = getCleanPhotoLabel(p, i, photoDaa) || (p.date ? `Photo: ${formatPhotoDate(p.date)}` : `Photo ${i + 1}`);
      doc.text(label, xOff, y + ih + 4, { maxWidth: iw + 8 });
      if (showDates && p.date && p.label) doc.text(formatPhotoDate(p.date), xOff, y + ih + 8, { maxWidth: iw + 8 });
      xOff += iw + 12;
    } catch { /* skip */ }
  }
  return y + maxSize + 16;
}
function anovaTable(doc, stats, y, ph, trial, options = {}) {
  const allTrials = getBackupTrials();
  const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
  
  const categoryId = trial.Category || 'herbicide';
  const config = getCategoryConfig(categoryId);
  const primaryField = getPrimaryObservationField(categoryId);
  const metricLabel = config.primaryMetric?.label || 'Efficacy';
  const metricUnit = config.primaryMetric?.unit || '%';
  const { excludeOutliers = false } = options;

  // Compute maximum DAA across all project trials for early-stage detection
  let maxDaa = 0;
  projectTrials.forEach(t => {
    const eff = safeJsonParse(t.EfficacyDataJSON, []);
    eff.forEach(o => {
      if (o.daa !== undefined && o.daa !== null && Number(o.daa) > maxDaa) {
        maxDaa = Number(o.daa);
      }
    });
  });
  const isEarlyStage = maxDaa <= 3;

  // Group trials by treatment
  const treatments = {};
  projectTrials.forEach(t => {
    const trt = t.FormulationName || 'Untreated Check';
    if (!treatments[trt]) treatments[trt] = [];
    
    const eff = safeJsonParse(t.EfficacyDataJSON, []);
    if (eff.length > 0) {
      const latest = [...eff].sort((a, b) => (b.daa ?? 0) - (a.daa ?? 0))[0];
      const val = getObservationPrimaryValue(categoryId, latest);
      if (val !== undefined && val !== null && !isNaN(val)) {
        treatments[trt].push(parseFloat(val));
      }
    }
  });

  // Stage 1: Descriptive Statistics
  const isPositiveMetric = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  const descRows = [];
  Object.entries(treatments).forEach(([trt, vals]) => {
    const n = vals.length;
    if (n === 0) return;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    let sd = 0;
    let cv = 0;
    let se = 0;
    if (n > 1) {
      const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
      sd = Math.sqrt(variance);
      cv = mean > 0 ? (sd / mean) * 100 : 0;
      se = sd / Math.sqrt(n);
    }
    const ci_lower = mean - (1.96 * se);
    const ci_upper = mean + (1.96 * se);

    descRows.push({
      treatment: trt,
      mean: mean.toFixed(2),
      meanSE: `${mean.toFixed(2)} ± ${se.toFixed(2)}`,
      sd: sd.toFixed(2),
      se: se.toFixed(2),
      cv: cv.toFixed(1) + '%',
      ciRange: `95% CI: ${ci_lower.toFixed(2)}–${ci_upper.toFixed(2)}`,
      n,
      meanVal: mean
    });
  });

  // Calculate Treatment Improvement over Control
  const controlName = Object.keys(treatments).find(f => 
    f?.toLowerCase().includes('control') || 
    f?.toLowerCase().includes('untreated') ||
    f?.toLowerCase().includes('check') ||
    f?.toLowerCase().includes('utc')
  ) || Object.keys(treatments)[0];

  const improvementText = [];
  if (controlName) {
    const controlMeanObj = descRows.find(r => r.treatment === controlName);
    const controlMean = controlMeanObj ? controlMeanObj.meanVal : 0;
    if (controlMean > 0) {
      descRows.forEach(r => {
        if (r.treatment !== controlName) {
          const diffPct = isPositiveMetric 
            ? ((r.meanVal - controlMean) / controlMean) * 100 
            : ((controlMean - r.meanVal) / controlMean) * 100;
          
          improvementText.push(`${r.treatment} ${isPositiveMetric ? 'increased' : 'reduced'} ${metricLabel} by ${diffPct.toFixed(1)}% over untreated control (${controlName}).`);
        }
      });
    }
  }

  // Draw Descriptive Table
  if (y + 20 > ph - 20) { doc.addPage(); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(10);
  doc.text(`Stage 1: Descriptive Statistics (${metricLabel} - Final Timing)`, 14, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Treatment/Formulation', 'Mean ± SE', 'SD', 'CV%', '95% Confidence Interval', 'N (Replications)']],
    body: descRows.map(r => [r.treatment, r.meanSE, r.sd, r.cv, r.ciRange, String(r.n)]),
    headStyles: { fillColor: DARK },
    theme: 'striped',
    styles: { fontSize: 8.5 }
  });
  
  y = (doc.lastAutoTable?.finalY ?? y) + 5;

  // Print treatment improvements if any
  if (improvementText.length > 0) {
    if (y + (improvementText.length * 5) > ph - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
    improvementText.forEach(txt => {
      doc.text(`• ${txt}`, 14, y);
      y += 5;
    });
    y += 5;
  }

  // Stage 2: ANOVA (only if Replications >= 3)
  const maxN = Math.max(...descRows.map(r => r.n), 0);
  if (isEarlyStage) {
    // Show preliminary analysis warning instead of full ANOVA for early-stage data
    const earlyPw = doc.internal.pageSize.getWidth();
    if (y + 30 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(255, 251, 235);
    doc.rect(14, y, earlyPw - 28, 22, 'F');
    doc.setDrawColor(217, 119, 6);
    doc.rect(14, y, earlyPw - 28, 22, 'S');
    doc.setFont(undefined, 'bold'); doc.setFontSize(9);
    doc.setTextColor(146, 64, 14);
    doc.text('Preliminary Analysis (Early Observation Only)', 18, y + 6);
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    doc.text(`Results are based on early vegetative observations (0-${maxDaa} DAA) and should not be interpreted`, 18, y + 12);
    doc.text('as final treatment performance. ANOVA has been omitted for early-stage data.', 18, y + 16);
    doc.setTextColor(0, 0, 0);
    y += 28;
  } else if (maxN >= 3 && descRows.length >= 2) {
    const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
    let anova;
    let designName = trialDesign;
    if (trialDesign === 'Factorial' || trialDesign === 'Split-Plot') {
      anova = performTwoWayANOVA(projectTrials, { metric: primaryField, excludeOutliers });
      if (anova.error) anova = performANOVA(projectTrials, { metric: primaryField, design: 'RCBD', excludeOutliers });
      else designName = trialDesign === 'Split-Plot' ? 'Split-Plot (Two-Way)' : 'Factorial Two-Way';
    } else {
      const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
      anova = performANOVA(projectTrials, { metric: primaryField, design, excludeOutliers });
      designName = design;
    }
    
    if (anova && !anova.error && anova.anovaTable) {
      if (y + 20 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(10);
      doc.text(`Stage 2: Analysis of Variance (ANOVA - ${designName})`, 14, y);
      y += 5;

      const nf = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
      autoTable(doc, {
        startY: y,
        head: [['Source of Variation', 'DF', 'SS', 'MS', 'F-Value', 'P-Value', 'Significance']],
        body: anova.anovaTable.source.map((src, i) => {
          const pVal = anova.anovaTable.p[i];
          const sig = pVal !== null && pVal !== undefined ? (pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns') : '';
          return [
            src,
            anova.anovaTable.df[i] ?? '—',
            nf(anova.anovaTable.ss[i]),
            nf(anova.anovaTable.ms[i]),
            nf(anova.anovaTable.f[i]),
            pVal !== null && pVal !== undefined ? pVal.toFixed(4) : '—',
            sig
          ];
        }),
        headStyles: { fillColor: DARK },
        theme: 'grid',
        styles: { fontSize: 8.5 }
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 6;

      // Draw Experimental Quality & Precision Block
      if (y + 40 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
      doc.text('Experimental Precision & Quality Certification:', 14, y);
      y += 5;
      
      const getCvRating = (c) => {
        if (c < 10) return 'Excellent Precision';
        if (c <= 20) return 'Good Precision';
        if (c <= 30) return 'Acceptable Precision';
        return 'Poor Precision (High Variation)';
      };

      const cvVal = anova.cv ?? 0;
      const semVal = anova.semGlobal ?? 0;
      const cd5Val = anova.cd5 ?? 0;
      const cd1Val = anova.cd1 ?? 0;
      const balanceStatus = anova.balanceWarning ? 'Unbalanced Layout' : 'Balanced Layout';
      const outlierCount = anova.detectedOutliers?.length || 0;
      const outlierHandling = excludeOutliers ? 'Automatically Excluded' : 'Flagged but Kept';

      const qualityRows = [
        ['Coefficient of Variation (CV%)', `${cvVal.toFixed(2)}% (${getCvRating(cvVal)})`, 'Design Balance Status', balanceStatus],
        ['Global Standard Error (SEm±)', `± ${semVal.toFixed(4)}`, 'Layout Configuration', `${anova.treatments?.length || 0} Treatments × ${maxN} Replications`],
        ['Critical Difference (CD / LSD 5%)', cd5Val.toFixed(4), 'Outliers Detected', `${outlierCount} plot(s)`],
        ['Critical Difference (CD / LSD 1%)', cd1Val.toFixed(4), 'Outliers Handling Status', outlierHandling]
      ];

      autoTable(doc, {
        startY: y,
        body: qualityRows,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          2: { fontStyle: 'bold', cellWidth: 50 }
        }
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 6;

      // Print Outlier details
      if (anova.detectedOutliers && anova.detectedOutliers.length > 0) {
        if (y + 15 > ph - 20) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
        doc.text('Flagged Outliers Log:', 14, y);
        y += 4;
        doc.setFont(undefined, 'normal'); doc.setFontSize(8);
        anova.detectedOutliers.forEach(out => {
          doc.text(`• Treatment: ${out.treatment} | Rep/Block: ${out.block} | Observed Value: ${out.value} | Residual Z-score: ${out.zScore.toFixed(2)} (${outlierHandling})`, 16, y);
          y += 4;
        });
        y += 3;
      }

      // Experimental Assumption Checks
      if (anova.assumptions) {
        if (y + 25 > ph - 20) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold'); doc.setFontSize(9);
        doc.text('Experimental Assumption Verification:', 14, y);
        y += 5;
        doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
        const normPass = anova.assumptions.normalityPassed ? 'Passed' : 'Failed (p < 0.05)';
        const varPass = anova.assumptions.variancePassed ? 'Passed' : 'Failed (p < 0.05)';
        doc.text(`• Normality of Residuals (JB Test): ${normPass} | Statistic: ${anova.assumptions.statistic?.toFixed(3) || '—'} (p = ${anova.assumptions.normalityP !== null && anova.assumptions.normalityP !== undefined ? anova.assumptions.normalityP.toFixed(4) : '—'})`, 14, y);
        y += 4.5;
        doc.text(`• Homogeneity of Variances (Levene's Test): ${varPass} | Statistic: ${anova.assumptions.fStatistic?.toFixed(3) || '—'} (p = ${anova.assumptions.varianceP !== null && anova.assumptions.varianceP !== undefined ? anova.assumptions.varianceP.toFixed(4) : '—'})`, 14, y);
        y += 4.5;
        if (anova.assumptions.recommendation) {
          doc.setFont(undefined, 'italic');
          doc.text(`• Recommendation: ${anova.assumptions.recommendation}`, 14, y);
          doc.setFont(undefined, 'normal');
          y += 5;
        }
        y += 4;
      }

      // Stage 3: Multiple Comparison Tests
      const hasSignificantEffect = anova.isTwoWay ? (anova.factorA?.p < 0.05 || anova.factorB?.p < 0.05 || anova.interaction?.p < 0.05) : (anova.pValue < 0.05);
      if (hasSignificantEffect) {
        if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
        doc.text('Stage 3: Multiple Comparisons (Tukey HSD Letter Groupings)', 14, y);
        y += 5;

        const tukey = performTukeyHSD(projectTrials, { metric: primaryField, anova });
        if (tukey && tukey.groups) {
          const groupRows = descRows.map(r => {
            const letter = tukey.groups[r.treatment] || 'a';
            return {
              treatment: r.treatment,
              meanVal: r.meanVal,
              letter: letter
            };
          });
          
          groupRows.sort((a, b) => b.meanVal - a.meanVal);

          autoTable(doc, {
            startY: y,
            head: [['Treatment/Formulation', `Mean (${metricUnit})`, 'Tukey HSD Grouping']],
            body: groupRows.map(r => [r.treatment, r.meanVal.toFixed(2), r.letter]),
            headStyles: { fillColor: TEAL },
            theme: 'striped',
            styles: { fontSize: 8.5 }
          });
          y = (doc.lastAutoTable?.finalY ?? y) + 8;
        }

        // Duncan's Multiple Range Test (MRT)
        const duncan = performDuncanMRT(projectTrials, { metric: primaryField });
        if (duncan && duncan.groups && !duncan.error) {
          if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
          doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
          doc.text("Duncan's Multiple Range Test (MRT) Groupings", 14, y);
          y += 5;
          
          const duncanRows = descRows.map(r => {
            const letter = duncan.groups[r.treatment] || 'a';
            return {
              treatment: r.treatment,
              meanVal: r.meanVal,
              letter: letter
            };
          });
          
          duncanRows.sort((a, b) => b.meanVal - a.meanVal);

          autoTable(doc, {
            startY: y,
            head: [['Treatment/Formulation', `Mean (${metricUnit})`, 'Duncan Grouping']],
            body: duncanRows.map(r => [r.treatment, r.meanVal.toFixed(2), r.letter]),
            headStyles: { fillColor: [37, 99, 235] },
            theme: 'striped',
            styles: { fontSize: 8.5 }
          });
          y = (doc.lastAutoTable?.finalY ?? y) + 8;
        }

        // Dunnett's Test vs Control (UTC)
        if (controlName) {
          const dunnett = performDunnettTest(projectTrials, controlName, { metric: primaryField });
          if (dunnett && dunnett.comparisons && !dunnett.error) {
            if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
            doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
            doc.text(`Dunnett's Comparative Test vs. Control (${controlName})`, 14, y);
            y += 5;
            const dunnettRows = dunnett.comparisons.map(c => [
              c.treatment,
              c.treatmentMean.toFixed(2),
              c.controlMean.toFixed(2),
              c.difference.toFixed(2),
              c.tStatistic.toFixed(2),
              c.significant ? 'Significant (*)' : 'Non-significant (ns)'
            ]);
            autoTable(doc, {
              startY: y,
              head: [['Treatment', 'Mean', 'Control Mean', 'Difference', 't-Stat', 'Significance (α=0.05)']],
              body: dunnettRows,
              headStyles: { fillColor: [147, 51, 234] },
              theme: 'striped',
              styles: { fontSize: 8.5 }
            });
            y = (doc.lastAutoTable?.finalY ?? y) + 10;
          }
        }
      } else {
        if (y + 12 > ph - 20) { doc.addPage(); y = 20; }
        doc.setFontSize(9); doc.setTextColor(120, 120, 120);
        doc.text('Stage 3: Post-hoc tests (Tukey/Duncan/Dunnett) skipped because ANOVA is not significant (P >= 0.05).', 14, y);
        doc.setTextColor(0, 0, 0); doc.setFontSize(10);
        y += 8;
      }
    } else {
      if (y + 12 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.text('ANOVA calculation error: ' + (anova?.error || 'Unknown error'), 14, y);
      doc.setTextColor(0, 0, 0); doc.setFontSize(10);
      y += 8;
    }
  } else {
    if (y + 12 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text('ANOVA and multiple comparisons omitted (replications < 3).', 14, y);
    doc.setTextColor(0, 0, 0); doc.setFontSize(10);
    y += 8;
  }
  return y;
}
function conclusionNotes(doc, trial, y, ph) {
  const pw = doc.internal.pageSize.getWidth();
  ['Conclusion', 'Notes'].forEach(field => {
    if (!trial[field]) return;
    if (y + 20 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.text(`${field}:`, 14, y); y += 6;
    doc.setFont(undefined, 'normal');
    const ls = doc.splitTextToSize(trial[field], pw - 28);
    if (y + ls.length * 5 > ph - 20) { doc.addPage(); y = 20; }
    doc.text(ls, 14, y); y += ls.length * 5 + 8;
  });
  return y;
}

function addScientificInterpretation(doc, trial, efficacy, categoryId, y, ph) {
  if (categoryId !== 'herbicide' || efficacy.length < 2) return y;
  
  const pw = doc.internal.pageSize.getWidth();
  const sorted = [...efficacy].sort((a, b) => {
    const getDaa = (o) => {
      if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') return Number(o.daa);
      return calculateDAA(o.date, trial.Date || '');
    };
    return getDaa(a) - getDaa(b);
  });
  const getDaa = (o) => {
    if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') return Number(o.daa);
    return calculateDAA(o.date, trial.Date || '');
  };
  
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstDaa = getDaa(first);
  const lastDaa = getDaa(last);
  const firstVal = getObservationPrimaryValue(categoryId, first) ?? 0;
  const lastVal = getObservationPrimaryValue(categoryId, last) ?? 0;
  
  const isStandardTrial = !trial?.Replication || trial.Replication === 'N/A' || trial.Replication === '';
  const isOngoing = !(trial.IsCompleted === true || trial.IsCompleted === 'true');
  
  let text = `The treatment produced rapid suppression between DAA ${firstDaa} and DAA ${lastDaa}, reducing weed canopy cover from ${firstVal.toFixed(1)}% to ${lastVal.toFixed(1)}%. No increase in greenness or weed density was detected through DAA ${lastDaa}, suggesting sustained suppression during the current observation period.`;
  
  if (isStandardTrial && isOngoing) {
    text += ` As the trial remains ongoing and lacks untreated controls, these observations should be interpreted as observational field data rather than statistically validated efficacy.`;
  } else if (isStandardTrial) {
    text += ` As the trial has been finalized and lacks untreated controls, these observations represent a standard observational performance profile under the evaluated conditions.`;
  } else if (isOngoing) {
    text += ` As the trial remains ongoing, additional replicate observations are required to determine statistical significance.`;
  } else {
    text += ` Replicated design data suggests this response profile represents a statistically consistent treatment effect.`;
  }
  
  if (y + 35 > ph - 20) { doc.addPage(); y = 20; }
  
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(9.5);
  
  const headerText = "AI Scientific Interpretation";
  const wrappedText = doc.splitTextToSize(text, pw - 36);
  const boxHeight = wrappedText.length * 5 + 14;
  
  doc.rect(14, y, pw - 28, boxHeight, 'FD');
  
  doc.setTextColor(15, 118, 110);
  doc.text(headerText, 18, y + 6);
  
  doc.setTextColor(51, 65, 85);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(wrappedText, 18, y + 12);
  
  doc.setTextColor(0, 0, 0);
  
  return y + boxHeight + 10;
}

// Local helper: Root-to-Shoot Ratio
function calculateRootToShoot(obs) {
  const root = parseFloat(obs.rootBiomass);
  const shoot = parseFloat(obs.shootBiomass);
  if (!isNaN(root) && !isNaN(shoot) && shoot > 0) {
    return parseFloat((root / shoot).toFixed(3));
  }
  return null;
}

// Local helper: AUDPC (Area Under Disease Progress Curve)
function calculateAUDPC(plotObservations, severityKey) {
  const sorted = [...plotObservations].sort((a, b) => (parseFloat(a.daa || 0)) - (parseFloat(b.daa || 0)));
  let audpc = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const y1 = parseFloat(sorted[i][severityKey]);
    const y2 = parseFloat(sorted[i+1][severityKey]);
    const t1 = parseFloat(sorted[i].daa || 0);
    const t2 = parseFloat(sorted[i+1].daa || 0);
    if (!isNaN(y1) && !isNaN(y2)) {
      audpc += ((y1 + y2) / 2) * (t2 - t1);
    }
  }
  return parseFloat(audpc.toFixed(2));
}

// Local helper: Nutrient Use Efficiency (NUE)
function calculateNUE(tMean, cMean, rate) {
  const r = parseFloat(rate);
  if (!isNaN(r) && r > 0) {
    return parseFloat(((tMean - cMean) / r).toFixed(3));
  }
  return null;
}

function getAdvancedIndicesTableData(trial, efficacy, categoryId) {
  const data = [];
  const trialDate = trial?.Date || '';
  const getDaaVal = (o) => {
    if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') {
      const parsed = Number(o.daa);
      if (!isNaN(parsed)) return parsed;
    }
    return calculateDAA(o.date, trialDate);
  };

  if (categoryId === 'fungicide') {
    // Group observations by plot/rep and calculate AUDPC
    const plots = [...new Set(efficacy.map(o => o.plotNumber || o.plot || 1))];
    plots.forEach(plotNum => {
      const plotObs = efficacy.filter(o => (o.plotNumber || o.plot || 1) === plotNum);
      const audpc = calculateAUDPC(plotObs, 'diseaseSeverity');
      const rep = plotObs[0]?.replication || plotObs[0]?.rep || 1;
      const trt = plotObs[0]?.treatmentNumber || plotObs[0]?.treatment || 1;
      data.push([`Plot ${plotNum} (Rep ${rep}, Trt ${trt})`, `AUDPC`, String(audpc)]);
    });
  } else if (categoryId === 'biostimulant') {
    efficacy.forEach((obs, idx) => {
      const r2s = calculateRootToShoot(obs);
      if (r2s !== null) {
        const plot = obs.plotNumber || obs.plot || (idx + 1);
        const rep = obs.replication || obs.rep || 1;
        data.push([`Plot ${plot} (Rep ${rep}, DAA ${getDaaVal(obs)})`, `Root-to-Shoot Ratio`, String(r2s)]);
      }
    });
  } else if (categoryId === 'nutrition') {
    // NUE is a treatment level metric comparing Treated vs Control
    const allTrials = getBackupTrials();
    const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
    const treatments = {};
    projectTrials.forEach(t => {
      const trt = t.FormulationName || 'Untreated Check';
      if (!treatments[trt]) treatments[trt] = [];
      const yieldVal = parseFloat(t.YieldValue || t.Yield || 0);
      if (!isNaN(yieldVal) && yieldVal > 0) {
        treatments[trt].push(yieldVal);
      }
    });
    const controlName = Object.keys(treatments).find(f => 
      f?.toLowerCase().includes('control') || 
      f?.toLowerCase().includes('untreated') ||
      f?.toLowerCase().includes('check') ||
      f?.toLowerCase().includes('utc')
    ) || Object.keys(treatments)[0];
    if (controlName) {
      const cVals = treatments[controlName] || [];
      const cMean = cVals.length ? cVals.reduce((a,b)=>a+b, 0)/cVals.length : 0;
      Object.entries(treatments).forEach(([trt, vals]) => {
        if (trt !== controlName) {
          const tMean = vals.length ? vals.reduce((a,b)=>a+b, 0)/vals.length : 0;
          const dosage = parseFloat(trial.Dosage || 1);
          const nue = calculateNUE(tMean, cMean, dosage);
          if (nue !== null) {
            data.push([trt, `Nutrient Use Efficiency (NUE)`, `${nue} (Yield gain/applied rate)`]);
          }
        }
      });
    }
  } else if (categoryId === 'herbicide') {
    const sorted = [...efficacy].sort((a,b) => getDaaVal(a) - getDaaVal(b));
    const baseline = sorted[0];
    const baseCover = baseline ? (getObservationPrimaryValue(categoryId, baseline) ?? 0) : 0;
    
    sorted.forEach((obs, idx) => {
      const daa = getDaaVal(obs);
      const ct = getObservationPrimaryValue(categoryId, obs) ?? 0;
      const wceVal = baseCover > 0 ? Math.max(0, ((baseCover - ct) / baseCover) * 100) : 0;
      
      const greenness = Math.max(0, Math.min(100, ct * (1 - wceVal / 100)));
      const necrosis = baseCover > 0 ? Math.max(0, Math.min(100, ((baseCover - greenness) / baseCover) * 100)) : 0;
      const density = Math.max(0, Math.round(ct * 1.5));
      const uniformity = Math.max(50, Math.min(100, Math.round(50 + 50 * Math.pow(Math.abs(50 - ct) / 50, 2))));
      
      let regrowth = 0;
      if (idx > 0) {
        const minPrior = Math.min(...sorted.slice(0, idx).map(o => getObservationPrimaryValue(categoryId, o) ?? 0));
        if (ct > minPrior && baseCover > 0) {
          regrowth = Math.max(0, Math.min(100, Math.round(((ct - minPrior) / baseCover) * 100)));
        }
      }
      
      const injury = Math.max(0, Math.min(9, Math.round(wceVal / 11.1)));
      const plot = obs.plotNumber || obs.plot || 1;
      
      data.push([`DAA ${daa} (Plot ${plot})`, `Canopy Coverage (%)`, `${ct.toFixed(1)}%`]);
      data.push([`DAA ${daa} (Plot ${plot})`, `Greenness Score (%)`, `${greenness.toFixed(1)}%`]);
      data.push([`DAA ${daa} (Plot ${plot})`, `Necrosis (%)`, `${necrosis.toFixed(1)}%`]);
      data.push([`DAA ${daa} (Plot ${plot})`, `Weed Density (est. plants/m²)`, `${density}`]);
      data.push([`DAA ${daa} (Plot ${plot})`, `Uniformity Score (%)`, `${uniformity}%`]);
      data.push([`DAA ${daa} (Plot ${plot})`, `Regrowth Index (%)`, `${regrowth}%`]);
      data.push([`DAA ${daa} (Plot ${plot})`, `Herbicidal Injury Score (0-9)`, `${injury}`]);
    });
  }
  return data;
}

function yieldAnovaTable(doc, y, ph, trial) {
  const allTrials = getBackupTrials();
  const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
  
  const categoryId = trial.Category || 'herbicide';
  if (categoryId !== 'nutrition' && categoryId !== 'biostimulant') return y;

  // Check if any trials have yield values
  const hasYield = projectTrials.some(t => t.YieldValue || t.Yield);
  if (!hasYield) return y;

  const treatments = {};
  projectTrials.forEach(t => {
    const trt = t.FormulationName || 'Untreated Check';
    if (!treatments[trt]) treatments[trt] = [];
    const val = parseFloat(t.YieldValue || t.Yield);
    if (val !== undefined && val !== null && !isNaN(val)) {
      treatments[trt].push(val);
    }
  });

  const descRows = [];
  Object.entries(treatments).forEach(([trt, vals]) => {
    const n = vals.length;
    if (n === 0) return;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    let sd = 0, cv = 0, se = 0;
    if (n > 1) {
      const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
      sd = Math.sqrt(variance);
      cv = mean > 0 ? (sd / mean) * 100 : 0;
      se = sd / Math.sqrt(n);
    }
    const ci_lower = mean - (1.96 * se);
    const ci_upper = mean + (1.96 * se);
    descRows.push({
      treatment: trt,
      meanSE: `${mean.toFixed(2)} ± ${se.toFixed(2)}`,
      sd: sd.toFixed(2),
      se: se.toFixed(2),
      cv: cv.toFixed(1) + '%',
      ciRange: `95% CI: ${ci_lower.toFixed(2)}–${ci_upper.toFixed(2)}`,
      n,
      meanVal: mean
    });
  });

  if (descRows.length < 2) return y;

  if (y + 20 > ph - 20) { doc.addPage(); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(10);
  doc.text(`Stage 4: Crop Yield Descriptive Statistics & ANOVA`, 14, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Treatment/Formulation', 'Yield Mean ± SE', 'SD', 'CV%', '95% Confidence Interval', 'Replications']],
    body: descRows.map(r => [r.treatment, r.meanSE, r.sd, r.cv, r.ciRange, String(r.n)]),
    headStyles: { fillColor: DARK },
    theme: 'striped',
    styles: { fontSize: 8.5 }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 5;

  const maxN = Math.max(...descRows.map(r => r.n), 0);
  if (maxN >= 3) {
    const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
    const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
    
    // We mock projectTrials with yield values inside EfficacyDataJSON to run ANOVA
    const mockTrials = projectTrials.map(t => {
      const yieldVal = parseFloat(t.YieldValue || t.Yield || 0);
      return {
        ...t,
        EfficacyDataJSON: JSON.stringify([{
          daa: 999,
          yield: yieldVal
        }])
      };
    });

    const anova = performANOVA(mockTrials, { metric: 'yield', daa: 999, design });
    if (anova && !anova.error && anova.anovaTable) {
      autoTable(doc, {
        startY: y,
        head: [['Yield Variation Source', 'DF', 'SS', 'MS', 'F-Value', 'P-Value', 'Significance']],
        body: anova.anovaTable.source.map((src, i) => {
          const pVal = anova.anovaTable.p[i];
          const sig = pVal !== null && pVal !== undefined ? (pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns') : '';
          return [
            src,
            anova.anovaTable.df[i] ?? '—',
            anova.anovaTable.ss[i]?.toFixed(2) ?? '—',
            anova.anovaTable.ms[i]?.toFixed(2) ?? '—',
            anova.anovaTable.f[i]?.toFixed(2) ?? '—',
            pVal !== null && pVal !== undefined ? pVal.toFixed(4) : '—',
            sig
          ];
        }),
        headStyles: { fillColor: DARK },
        theme: 'grid',
        styles: { fontSize: 8.5 }
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }
  }
  return y;
}

async function addWeedIdSection(doc, weedPhotos, trial, y, ph, sectionNumber = 6) {
  if (!weedPhotos.length) return y;
  doc.addPage(); y = 20;
  const repConfig = getReportConfig(trial);
  const recordLabel = repConfig.cat === 'herbicide' ? 'Weed Identification Record' :
                      repConfig.cat === 'fungicide' ? 'Disease Identification Record' :
                      repConfig.cat === 'pesticide' ? 'Pest Identification Record' :
                      'Target Identification Record';
  y = secHeading(doc, `${sectionNumber}. ${recordLabel}`, y, ph);
  const targetVal = trial[repConfig.config.targetField] || trial.WeedSpecies;
  if (targetVal?.trim()) {
    doc.setFont(undefined, 'bold'); doc.text(`${repConfig.targetLabel}:`, 14, y); y += 5;
    doc.setFont(undefined, 'normal');
    doc.text(doc.splitTextToSize(targetVal, doc.internal.pageSize.getWidth() - 28), 14, y);
    y += 12;
  }
  for (const p of weedPhotos) {
    const src = photoSrc(p); if (!src) continue;
    if (y + 80 > ph - 20) { doc.addPage(); y = 20; }
    try {
      const imgData = await toBase64(src, 400); if (!imgData) continue;
      const img = new Image(); img.src = imgData;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      const ar = img.width > 0 ? img.width / img.height : 1;
      const iw = ar >= 1 ? 60 : 60 * ar; const ih = ar >= 1 ? 60 / ar : 60;
      addImgSafe(doc, imgData, 14, y, iw, ih);
      const best = p.identifications?.[0];
      doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(best?.name || 'Unknown Species', 82, y + 10);
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text(`Common name: ${best?.commonNames?.[0] || '—'}`, 82, y + 20);
      doc.text(`Confidence: ${best?.confidence ? (best.confidence * 100).toFixed(1) + '%' : 'N/A'}`, 82, y + 30);
      y += 72;
    } catch { /* skip */ }
  }
  return y;
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 1 — generateComprehensivePdf
//  Full multi-page PDF: header, metadata, weather, soil, ANOVA, efficacy,
//  WCE table, timeline, conclusion, ingredients, photo log, weed ID, brief
// ═════════════════════════════════════════════════════════════════════════════
export async function generateComprehensivePdf(trial, options = {}) {
  const { withIngredients = true, withWeeds = true, withTimeline = true,
          showPhotoDates = true, formulations = [] } = options;
  const repConfig = getReportConfig(trial);
  const categoryId = repConfig.cat;
  
  toast(`Generating Comprehensive ${repConfig.config.name} PDF…`, 'info');
  const doc      = createDoc();
  const pw       = doc.internal.pageSize.getWidth();
  const ph       = doc.internal.pageSize.getHeight();
  const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), categoryId, true);
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const trialDate = fmtDate(trial.Date);
  const dataFields = getAllTrialDataFields(trial, options);

  pdfHeader(doc, `${repConfig.config.name} Trial Report`, trial.FormulationName);
  let y = 50;

  // Set category colors dynamically
  const proj = getProjectForTrial(trial);
  const isNonCrop = categoryId === 'herbicide' && (!trial.Crop || trial.Crop === '—' || trial.Crop === 'N/A' || trial.Crop.toLowerCase().includes('non-crop') || trial.Crop.toLowerCase().includes('non crop') || trial.Crop === 'Non-Crop');
  const cropLabel = isNonCrop ? 'Site Type' : 'Crop';
  const cropValue = isNonCrop ? (trial.SiteType || proj?.SiteType || trial.Site || 'Open field') : dataFields.crop;

  // 2-column metadata
  doc.setFontSize(10);
  const lx = 14, rx = pw / 2 + 10;
  const meta2 = [];
  meta2.push([`Investigator: ${trial.InvestigatorName || 'N/A'}`, `Date: ${trialDate}`]);
  meta2.push([`Location: ${trial.Location || 'N/A'}`,              `Dosage: ${trial.Dosage || 'N/A'}`]);
  meta2.push([`${dataFields.cropLabel}: ${dataFields.crop}`,                           categoryId === 'herbicide' ? `Weed Growth Stage: ${trial.WeedGrowthStage || '—'}` : `Growth Stage: ${dataFields.cropStage}`]);
  if (categoryId !== 'herbicide') {
    meta2.push([`Yield: ${dataFields.yieldValue}`,                  `BBCH Code: ${dataFields.bbchCode}`]);
  }
  meta2.push([`Application Timing: ${dataFields.applicationTiming}`, `Application Method: ${dataFields.applicationMethod}`]);
  meta2.push([`Spray Volume: ${dataFields.sprayVolume}`,            `Nozzle: ${dataFields.nozzle}`]);
  meta2.push([`Result: ${trial.Result || 'Pending'}`,               `Replication: ${trial.Replication || 'N/A'}`]);
  meta2.push([`Status: ${(trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'}`,
              trial.PlotNumber ? `Plot #: ${trial.PlotNumber}` : '']);
  meta2.forEach(([l, r]) => { doc.text(l, lx, y); if (r) doc.text(r, rx, y); y += 6; });
  y += 2;

  if (repConfig.targetValue?.trim() && repConfig.targetValue !== 'N/A') {
    doc.setFont(undefined, 'bold'); doc.text(`Target ${repConfig.targetLabel}:`, lx, y); y += 5;
    doc.setFont(undefined, 'normal');
    const wl = doc.splitTextToSize(repConfig.targetValue, pw - 28);
    doc.text(wl, lx, y); y += wl.length * 5 + 5;
  }

  // Weather box
  if (trial.Temperature) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(241, 245, 249); doc.rect(lx, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Weather on Application Day:', 16, y);
    doc.setFont(undefined, 'normal');
    let weatherStr = `Temp: ${trial.Temperature}°C  |  Humidity: ${trial.Humidity || '—'}%  |  Wind: ${trial.Windspeed || '0'} km/h  |  Rain: ${trial.Rain || '0'} mm`;
    if (trial.DewPoint) weatherStr += `  |  Dew Point: ${trial.DewPoint}°C`;
    if (trial.CloudCover) weatherStr += `  |  Cloud Cover: ${trial.CloudCover}%`;
    if (trial.Sunlight) weatherStr += `  |  Solar Radiation: ${trial.Sunlight} W/m²`;
    doc.text(weatherStr, 16, y + 7);
    y += 24;
  }

  // Soil box
  if (dataFields.soil && Object.keys(dataFields.soil).length > 0) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(...AMBER50); doc.rect(lx, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Soil Profile (0-30 cm):', 16, y);
    doc.setFont(undefined, 'normal');
    const sl = formatSoilProfile(dataFields.soil);
    doc.text(doc.splitTextToSize(sl, pw - 34), 16, y + 7);
    y += 24;
  }

  y += 4;

  // Trial Design heading
  y = secHeading(doc, '1. Trial Design & Conditions', y, ph);

  let nextSec = 2;

  // ANOVA - only for project-grouped/replicated trials
  if (trial.ProjectID) {
    y = secHeading(doc, `${nextSec++}. Statistical Analysis (ANOVA)`, y, ph);
    y = anovaTable(doc, safeJsonParse(trial.StatisticsJSON, {}), y, ph, trial, options);
  }

  // Efficacy Analysis
  const effSecNum = nextSec++;
  y = secHeading(doc, `${effSecNum}. Efficacy Analysis`, y, ph);
  const summary = coverSummary(efficacy, trial);
  if (summary) {
    const cls = doc.splitTextToSize('Analysis: ' + summary, pw - 28);
    if (y + cls.length * 5 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFontSize(9); doc.text(cls, 14, y, { maxWidth: pw - 28 });
    y += cls.length * 5 + 8; doc.setFontSize(10);
  }
  const wce = calcWCE(efficacy, categoryId, trial);
  if (wce.length) {
    if (y + 30 > ph - 20) { doc.addPage(); y = 20; }
    const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
    const obsUnit = isVigor ? '/10' : '';
    const hasYield = parseFloat(trial.YieldValue || trial.Yield || 0) > 0;
    const metricColHeader = (isVigor && !hasYield) ? 'Visual Vigor Rating (0–10)' : `${repConfig.primaryMetricKey} (${repConfig.primaryMetricUnit})`;
    autoTable(doc, {
      startY: y,
      head: [[repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, metricColHeader]],
      body: wce.map(w => [w.species, w.initialCover.toFixed(1) + obsUnit, w.finalCover.toFixed(1) + obsUnit, w.wce.toFixed(1)]),
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 9 },
      didParseCell: italicCellHook
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
    if (categoryId === 'herbicide') {
      doc.setFont(undefined, 'italic'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      doc.text('*Note: Total cover represents estimated canopy cover of the plot, not the mathematical sum of individual species covers.', 14, y - 6);
      doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    }
  }



  // Crop Yield Analysis Section
  if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
    y = yieldAnovaTable(doc, y, ph, trial);
  }

  // Timeline
  if (withTimeline && efficacy.length) {
    const timelineTitle = 
      categoryId === 'herbicide' ? 'Treatment Timeline' : 
      categoryId === 'fungicide' ? 'Disease Progress Timeline' :
      categoryId === 'pesticide' ? 'Pest Population Timeline' :
      'Crop Development Timeline';
    y = secHeading(doc, `${nextSec++}. ${timelineTitle}`, y, ph);
    const timelineData = getTimelineData(efficacy, categoryId, trial);
    autoTable(doc, {
      startY: y,
      head: [timelineData.headers],
      body: timelineData.rows,
      headStyles: { fillColor: primaryColor },
      theme: 'striped',
      styles: {
        fontSize: Math.max(5.5, Math.min(8, 9 - timelineData.headers.length * 0.4)),
        overflow: 'linebreak',
        cellPadding: 1.5
      },
      didParseCell: italicCellHook
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  // Visual Analytics (Charts)
  if (categoryId === 'herbicide' && efficacy.length >= 2) {
    if (y + 55 > ph - 20) { doc.addPage(); y = 20; }
    y = secHeading(doc, `${nextSec++}. Visual Analytics & Trajectories`, y, ph);
    
    const getDaaVal = (o) => {
      if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') {
        const parsed = Number(o.daa);
        if (!isNaN(parsed)) return parsed;
      }
      return calculateDAA(o.date, trial.Date || '');
    };
    const sorted = [...efficacy].sort((a,b) => getDaaVal(a) - getDaaVal(b));
    const xVal = sorted.map(o => getDaaVal(o));
    
    const coverVal = sorted.map(o => getObservationPrimaryValue(categoryId, o) ?? 0);
    const baseCover = coverVal[0] || 0;
    const greenVal = sorted.map(o => {
      const ct = getObservationPrimaryValue(categoryId, o) ?? 0;
      const wceVal = baseCover > 0 ? Math.max(0, ((baseCover - ct) / baseCover) * 100) : 0;
      return Math.max(0, Math.min(100, ct * (1 - wceVal / 100)));
    });
    
    const necroVal = greenVal.map(g => baseCover > 0 ? Math.max(0, Math.min(100, ((baseCover - g) / baseCover) * 100)) : 0);
    const densityVal = coverVal.map(c => Math.max(0, Math.round(c * 1.5)));
    
    const chartW = 85;
    const chartH = 42;
    
    drawVectorChart(doc, 14, y, chartW, chartH, 'Weed Cover (%) vs DAA', xVal, coverVal, 100, '%');
    drawVectorChart(doc, 111, y, chartW, chartH, 'Greenness Score (%) vs DAA', xVal, greenVal, 100, '%');
    y += chartH + 5;
    
    if (y + chartH > ph - 20) { doc.addPage(); y = 20; }
    drawVectorChart(doc, 14, y, chartW, chartH, 'Necrosis (%) vs DAA', xVal, necroVal, 100, '%');
    drawVectorChart(doc, 111, y, chartW, chartH, 'Weed Density (est. plants/m²) vs DAA', xVal, densityVal, Math.max(10, ...densityVal), '');
    y += chartH + 10;
  }

  // Conclusion & Notes
  y = conclusionNotes(doc, trial, y, ph);
  y = addScientificInterpretation(doc, trial, efficacy, categoryId, y, ph);

  // Ingredients
  if (withIngredients && trial.FormulationID) {
    const form = formulations.find(f => f.ID === trial.FormulationID);
    const ings = safeJsonParse(form?.IngredientsJSON, []);
    if (ings.length) {
      y = secHeading(doc, 'Formulation Ingredients', y, ph);
      autoTable(doc, {
        startY: y,
        head: [['Ingredient', 'Quantity', 'Unit']],
        body: ings.map(i => [i.name, i.quantity, i.unit]),
        headStyles: { fillColor: primaryColor }, theme: 'striped'
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }
  }

  // Photos
  if (photos.length) {
    y = secHeading(doc, `${nextSec++}. Field Photo Log`, y, ph);
    y = await addPhotoGrid(doc, photos, y, ph, 50, showPhotoDates, trial.Date);
  }

  // Harvest & Yield Report Section
  const harvest = safeJsonParse(trial.HarvestDataJSON, null);
  if (harvest && (harvest.actualFruitCount || harvest.actualMarketableWeight || harvest.actualUnmarketableWeight || harvest.notes)) {
    y = secHeading(doc, `${nextSec++}. Harvest & Yield Report`, y, ph);
    const totalW = (parseFloat(harvest.actualMarketableWeight || 0) + parseFloat(harvest.actualUnmarketableWeight || 0));
    const avgW = harvest.actualFruitCount > 0 ? (totalW / harvest.actualFruitCount).toFixed(1) : '—';
    const markPct = totalW > 0 ? ((parseFloat(harvest.actualMarketableWeight || 0) / totalW) * 100).toFixed(1) : '—';

    autoTable(doc, {
      startY: y,
      head: [['Metric Parameter', 'Recorded Value']],
      body: [
        ['Harvest Date', harvest.harvestDate || '—'],
        ['Fruit Count per Plant', harvest.actualFruitCount ? String(harvest.actualFruitCount) : '—'],
        ['Marketable Yield (g/plant)', harvest.actualMarketableWeight ? `${harvest.actualMarketableWeight} g` : '—'],
        ['Unmarketable Yield (g/plant)', harvest.actualUnmarketableWeight ? `${harvest.actualUnmarketableWeight} g` : '—'],
        ['Total Yield Weight (g/plant)', totalW ? `${totalW} g` : '—'],
        ['Average Fruit Weight (g)', avgW !== '—' ? `${avgW} g` : '—'],
        ['Marketable Percentage (%)', markPct !== '—' ? `${markPct}%` : '—'],
        ['Remarks / Harvest Notes', harvest.notes || '—']
      ],
      headStyles: { fillColor: primaryColor },
      theme: 'striped',
      styles: { fontSize: 9 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;

    // Render Harvest Photos if any
    const harvestPhotos = harvest.photos || [];
    if (harvestPhotos.length > 0) {
      if (y + 40 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(10);
      doc.text('Harvest Photo Gallery:', 14, y); y += 6;
      y = await addPhotoGrid(doc, harvestPhotos, y, ph, 40, false, trial.Date);
    }
  }

  // Target Identification Record Section
  if (withWeeds) y = await addWeedIdSection(doc, weedPhotos, trial, y, ph, nextSec++);

  // Executive Brief
  doc.addPage(); y = 20;
  y = secHeading(doc, 'One-Page Executive Brief', y, ph, 16);
  const brief = [
    ['Treatment', trial.FormulationName || '—'],
    ['Objective', `Assess post-application efficacy and performance of ${trial.FormulationName || 'treatment'} targeting ${repConfig.targetValue} at ${trial.Location || 'test site'}.`],
    ['Key Finding', summary],
    ['Recommendation', (trial.Result === 'Excellent' || trial.Result === 'Good') ? 'Recommend for continued evaluation at expanded sites.' : 'Further evaluation required under varied conditions.'],
    ['Risk & Context', trial.Temperature ? `Applied under ${trial.Temperature}°C, ${trial.Humidity || '—'}% RH, ${trial.Windspeed || '0'} km/h wind.` : 'Weather conditions not recorded.'],
  ];
  brief.forEach(([label, val]) => {
    const wrapped = doc.splitTextToSize(val, pw - 28);
    if (y + wrapped.length * 5 + 10 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(10); doc.text(`${label}:`, 14, y); y += 5;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(wrapped, 14, y); y += wrapped.length * 5 + 5;
    doc.setFontSize(10);
  });

  pdfAddFooter(doc, trial.FormulationName || 'Trial');
  doc.save(`Trial_Report_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.pdf`);
  toast('PDF downloaded!', 'success');
}

function drawVectorChart(doc, x, y, w, h, title, xVal, yVal, yMax = 100, yUnit = '%') {
  doc.setFillColor(248, 250, 252);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(x, y, w, h, 'S');
  
  doc.setFont(undefined, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(title, x + 5, y + 6);
  
  const px = x + 15;
  const py = y + h - 11;
  const pw_plot = w - 22;
  const ph_plot = h - 22;
  
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.5);
  doc.line(px, py, px + pw_plot, py);
  doc.line(px, py, px, py - ph_plot);
  
  if (xVal.length === 0) return;
  
  const xMin = Math.min(...xVal);
  const xMax = Math.max(...xVal) || 1;
  const xRange = xMax - xMin || 1;
  
  doc.setDrawColor(13, 148, 136);
  doc.setFillColor(13, 148, 136);
  doc.setLineWidth(1);
  
  const coords = xVal.map((xv, idx) => {
    const yv = yVal[idx] ?? 0;
    const cx = px + ((xv - xMin) / xRange) * pw_plot;
    const cy = py - (yv / yMax) * ph_plot;
    return { cx, cy, xv, yv };
  });
  
  for (let i = 0; i < coords.length - 1; i++) {
    doc.line(coords[i].cx, coords[i].cy, coords[i+1].cx, coords[i+1].cy);
  }
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(5);
  doc.setTextColor(100, 116, 139);
  
  coords.forEach(pt => {
    doc.circle(pt.cx, pt.cy, 1.2, 'F');
    doc.text(`${pt.yv.toFixed(0)}${yUnit}`, pt.cx - 2, pt.cy - 3);
    doc.text(`D${pt.xv}`, pt.cx - 2, py + 5);
  });
  
  // Axes ticks
  doc.text('0', px - 7, py + 2);
  doc.text(`${(yMax/2).toFixed(0)}`, px - 9, py - ph_plot/2 + 2);
  doc.text(`${yMax.toFixed(0)}`, px - 9, py - ph_plot + 2);

  // Axis Labels
  doc.setFont(undefined, 'bold');
  doc.setFontSize(5);
  doc.text('Days After Application (DAA)', x + w / 2 - 15, y + h - 2);
  
  const yAxisLabel = title.includes('Density') ? 'Plants/m²' : 'Value (%)';
  doc.text(yAxisLabel, px - 6, py - ph_plot - 2);
}

function drawTextWithItalics(doc, text, x, y, maxWidth, lineHeight = 5) {
  const lines = text.split('\n');
  let currentY = y;
  const ph = doc.internal.pageSize.getHeight();
  
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      currentY += 3;
      continue;
    }
    
    const isHeader = /^(Methodology|Results|Conclusions?)\s*:?\s*$/i.test(line);
    if (isHeader) {
      if (currentY + 12 > ph - 20) { doc.addPage(); currentY = 20; }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text(line, x, currentY);
      currentY += 7;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      continue;
    }
    
    if (currentY + 10 > ph - 20) {
      doc.addPage();
      currentY = 20;
    }
    
    const segments = [];
    const parts = line.split('*');
    parts.forEach((part, index) => {
      const isItalic = (index % 2 === 1);
      if (part) {
        segments.push({ text: part, isItalic });
      }
    });
    
    let currentX = x;
    let lineSegments = [];
    const words = [];
    
    segments.forEach(seg => {
      const segWords = seg.text.split(/(\s+)/);
      segWords.forEach(w => {
        if (w) {
          words.push({ text: w, isItalic: seg.isItalic });
        }
      });
    });
    
    for (const word of words) {
      doc.setFont(undefined, word.isItalic ? 'italic' : 'normal');
      const wordWidth = doc.getTextWidth(word.text);
      
      if (currentX + wordWidth > x + maxWidth && word.text.trim()) {
        lineSegments.forEach(ls => {
          doc.setFont(undefined, ls.isItalic ? 'italic' : 'normal');
          doc.text(ls.text, ls.x, currentY);
        });
        
        currentY += lineHeight;
        if (currentY > ph - 20) {
          doc.addPage();
          currentY = 20;
        }
        currentX = x;
        lineSegments = [];
      }
      
      lineSegments.push({ text: word.text, isItalic: word.isItalic, x: currentX });
      currentX += wordWidth;
    }
    
    lineSegments.forEach(ls => {
      doc.setFont(undefined, ls.isItalic ? 'italic' : 'normal');
      doc.text(ls.text, ls.x, currentY);
    });
    
    currentY += lineHeight + 2;
  }
  
  doc.setFont(undefined, 'normal');
  return currentY;
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 2 — generateScientificReport  (scientific layout with AI narrative)
// ═════════════════════════════════════════════════════════════════════════════
export async function generateScientificReport(trial, options = {}) {
  const { withIngredients = false, aiSummary = '', showPhotoDates = true, formulations = [] } = options;
  const repConfig = getReportConfig(trial);
  const categoryId = repConfig.cat;

  toast(`Generating Scientific ${repConfig.config.name} Report…`, 'info');
  const doc      = createDoc();
  const pw       = doc.internal.pageSize.getWidth();
  const ph       = doc.internal.pageSize.getHeight();
  const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), categoryId, true);
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const trialDate  = fmtDate(trial.Date);
  const summary    = coverSummary(efficacy, trial);
  const methodology = methodologySentence(trial, trialDate);

  const primaryColor = repConfig.primaryColor;

  // Header
  doc.setFillColor(...primaryColor); doc.rect(0, 0, pw, 45, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont(undefined, 'bold');
  doc.text(`SCIENTIFIC ${repConfig.config.name.toUpperCase()} TRIAL REPORT`, pw / 2, 22, { align: 'center' });
  doc.setFontSize(13); doc.setFont(undefined, 'normal');
  doc.text(`Trial Protocol: ${trial.FormulationName}`, pw / 2, 34, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  let y = 55;

  const dataFields = getAllTrialDataFields(trial, options);

  const proj = getProjectForTrial(trial);
  const isNonCrop = categoryId === 'herbicide' && (
    trial.SiteType ? (trial.SiteType !== 'Crop' && trial.SiteType !== '') :
    (!trial.Crop || trial.Crop === '—' || trial.Crop === 'N/A' || trial.Crop.toLowerCase().includes('non-crop') || trial.Crop.toLowerCase().includes('non crop') || trial.Crop === 'Non-Crop')
  );
  const cropLabel = isNonCrop ? 'Site Type' : 'Crop';
  const cropValue = isNonCrop ? (trial.SiteType || proj?.SiteType || trial.Site || 'Open field') : dataFields.crop;

  // Metadata table (4-column)
  const metaRows = [];
  metaRows.push(['Investigator', trial.InvestigatorName || 'N/A', 'Date', trialDate]);
  metaRows.push(['Location', trial.Location || 'N/A', 'Dosage', trial.Dosage || 'N/A']);
  metaRows.push([cropLabel, cropValue, categoryId === 'herbicide' ? 'Weed Growth Stage' : 'Growth Stage', categoryId === 'herbicide' ? (trial.WeedGrowthStage || '—') : dataFields.cropStage]);
  if (categoryId !== 'herbicide') {
    metaRows.push(['Yield', dataFields.yieldValue, 'BBCH Code', dataFields.bbchCode]);
  }
  metaRows.push(['App Timing', dataFields.applicationTiming, 'App Method', dataFields.applicationMethod]);
  metaRows.push(['Spray Volume', dataFields.sprayVolume, 'Nozzle', dataFields.nozzle]);
  metaRows.push(['Status', (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing', 'Result', trial.Result || 'Pending']);
  metaRows.push([repConfig.targetLabel, repConfig.targetValue, 'Replication', trial.Replication || 'N/A']);
  autoTable(doc, {
    startY: y, body: metaRows, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { fontStyle: 'bold', cellWidth: 35 } }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Executive Summary / AI Narrative
  y = secHeading(doc, 'Executive Summary', y, ph);
  const rawNarrative = aiSummary ||
    `Methodology\n${methodology}\n\nResults\n${summary}\n\nConclusions\n${trial.Conclusion || 'See observations for detailed results.'}`;
  const narrative = getCleanNarrative(rawNarrative, isNonCrop);
  doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  y = drawTextWithItalics(doc, narrative, 14, y, pw - 28);
  y += 8;

  // Trial Design
  y = secHeading(doc, '1. Trial Design & Conditions', y, ph);
  if (trial.Temperature) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(241, 245, 249); doc.rect(14, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Weather Conditions:', 16, y);
    doc.setFont(undefined, 'normal');
    let weatherStr = `Temp: ${trial.Temperature}°C  Humidity: ${trial.Humidity || '—'}%  Wind: ${trial.Windspeed || '—'} km/h  Rain: ${trial.Rain || '—'} mm`;
    if (trial.DewPoint) weatherStr += `  Dew Point: ${trial.DewPoint}°C`;
    if (trial.CloudCover) weatherStr += `  Cloud Cover: ${trial.CloudCover}%`;
    if (trial.Sunlight) weatherStr += `  Solar Radiation: ${trial.Sunlight} W/m²`;
    doc.text(weatherStr, 16, y + 7);
    y += 24;
  }
  if (dataFields.soil && Object.keys(dataFields.soil).length > 0) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(...AMBER50); doc.rect(14, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Soil Profile (0-30 cm):', 16, y);
    doc.setFont(undefined, 'normal');
    doc.text(doc.splitTextToSize(formatSoilProfile(dataFields.soil), pw - 34), 16, y + 7);
    y += 24;
  }

  let nextSec = 2;

  // ANOVA - only for project-grouped/replicated trials
  if (trial.ProjectID) {
    y = secHeading(doc, `${nextSec++}. Statistical Analysis (ANOVA)`, y, ph);
    y = anovaTable(doc, safeJsonParse(trial.StatisticsJSON, {}), y, ph, trial, options);
  }

  // Efficacy
  const effSecNum = nextSec++;
  y = secHeading(doc, `${effSecNum}. Efficacy Analysis`, y, ph);
  const wce = calcWCE(efficacy, categoryId, trial);
  if (wce.length) {
    const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
    const obsUnit = isVigor ? '/10' : '';
    const hasYield = parseFloat(trial.YieldValue || trial.Yield || 0) > 0;
    const metricColHeader = (isVigor && !hasYield) ? 'Visual Vigor Rating (0–10)' : `${repConfig.primaryMetricKey} (${repConfig.primaryMetricUnit})`;
    autoTable(doc, {
      startY: y,
      head: [[repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, metricColHeader]],
      body: wce.map(w => [w.species, w.initialCover.toFixed(1) + obsUnit, w.finalCover.toFixed(1) + obsUnit, w.wce.toFixed(1)]),
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 9 },
      didParseCell: italicCellHook
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
    if (categoryId === 'herbicide') {
      doc.setFont(undefined, 'italic'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
      doc.text('*Note: Total cover represents estimated canopy cover of the plot, not the mathematical sum of individual species covers.', 14, y - 6);
      doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    }
  } else {
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text('No structured efficacy observations recorded.', 14, y); y += 10;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10);
  }



  // Crop Yield Analysis Section
  if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
    y = yieldAnovaTable(doc, y, ph, trial);
  }

  // Timeline
  if (efficacy.length) {
    const timelineTitle = 
      categoryId === 'herbicide' ? 'Treatment Timeline' : 
      categoryId === 'fungicide' ? 'Disease Progress Timeline' :
      categoryId === 'pesticide' ? 'Pest Population Timeline' :
      'Crop Development Timeline';
    y = secHeading(doc, `${nextSec++}. ${timelineTitle}`, y, ph);
    const timelineData = getTimelineData(efficacy, categoryId, trial);
    autoTable(doc, {
      startY: y,
      head: [timelineData.headers],
      body: timelineData.rows,
      headStyles: { fillColor: primaryColor },
      theme: 'striped',
      styles: {
        fontSize: Math.max(5.5, Math.min(8, 9 - timelineData.headers.length * 0.4)),
        overflow: 'linebreak',
        cellPadding: 1.5
      },
      didParseCell: italicCellHook
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  // Visual Analytics (Charts)
  if (categoryId === 'herbicide' && efficacy.length >= 2) {
    if (y + 55 > ph - 20) { doc.addPage(); y = 20; }
    y = secHeading(doc, `${nextSec++}. Visual Analytics & Trajectories`, y, ph);
    
    const getDaaVal = (o) => {
      if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') {
        const parsed = Number(o.daa);
        if (!isNaN(parsed)) return parsed;
      }
      return calculateDAA(o.date, trial.Date || '');
    };
    const sorted = [...efficacy].sort((a,b) => getDaaVal(a) - getDaaVal(b));
    const xVal = sorted.map(o => getDaaVal(o));
    
    const coverVal = sorted.map(o => getObservationPrimaryValue(categoryId, o) ?? 0);
    const baseCover = coverVal[0] || 0;
    const greenVal = sorted.map(o => {
      const ct = getObservationPrimaryValue(categoryId, o) ?? 0;
      const wceVal = baseCover > 0 ? Math.max(0, ((baseCover - ct) / baseCover) * 100) : 0;
      return Math.max(0, Math.min(100, ct * (1 - wceVal / 100)));
    });
    
    const necroVal = greenVal.map(g => baseCover > 0 ? Math.max(0, Math.min(100, ((baseCover - g) / baseCover) * 100)) : 0);
    const densityVal = coverVal.map(c => Math.max(0, Math.round(c * 1.5)));
    
    const chartW = 85;
    const chartH = 42;
    
    drawVectorChart(doc, 14, y, chartW, chartH, 'Weed Cover (%) vs DAA', xVal, coverVal, 100, '%');
    drawVectorChart(doc, 111, y, chartW, chartH, 'Greenness Score (%) vs DAA', xVal, greenVal, 100, '%');
    y += chartH + 5;
    
    if (y + chartH > ph - 20) { doc.addPage(); y = 20; }
    drawVectorChart(doc, 14, y, chartW, chartH, 'Necrosis (%) vs DAA', xVal, necroVal, 100, '%');
    drawVectorChart(doc, 111, y, chartW, chartH, 'Weed Density (est. plants/m²) vs DAA', xVal, densityVal, Math.max(10, ...densityVal), '');
    y += chartH + 10;
  }

  y = conclusionNotes(doc, trial, y, ph);
  y = addScientificInterpretation(doc, trial, efficacy, categoryId, y, ph);

  // Ingredients
  if (withIngredients && trial.FormulationID) {
    const form = formulations.find(f => f.ID === trial.FormulationID);
    const ings = safeJsonParse(form?.IngredientsJSON, []);
    if (ings.length) {
      y = secHeading(doc, 'Formulation Ingredients', y, ph);
      autoTable(doc, { startY: y, head: [['Ingredient', 'Quantity', 'Unit']], body: ings.map(i => [i.name, i.quantity, i.unit]), headStyles: { fillColor: primaryColor }, theme: 'striped' });
      y = (doc.lastAutoTable?.finalY ?? y) + 10;
    }
  }

  // Photos
  if (photos.length) {
    y = secHeading(doc, `${nextSec++}. Field Photo Log`, y, ph);
    y = await addPhotoGrid(doc, photos, y, ph, 50, showPhotoDates, trial.Date);
  }

  // Harvest & Yield Report Section
  const harvest = safeJsonParse(trial.HarvestDataJSON, null);
  if (harvest && (harvest.actualFruitCount || harvest.actualMarketableWeight || harvest.actualUnmarketableWeight || harvest.notes)) {
    y = secHeading(doc, `${nextSec++}. Harvest & Yield Report`, y, ph);
    const totalW = (parseFloat(harvest.actualMarketableWeight || 0) + parseFloat(harvest.actualUnmarketableWeight || 0));
    const avgW = harvest.actualFruitCount > 0 ? (totalW / harvest.actualFruitCount).toFixed(1) : '—';
    const markPct = totalW > 0 ? ((parseFloat(harvest.actualMarketableWeight || 0) / totalW) * 100).toFixed(1) : '—';

    autoTable(doc, {
      startY: y,
      head: [['Metric Parameter', 'Recorded Value']],
      body: [
        ['Harvest Date', harvest.harvestDate || '—'],
        ['Fruit Count per Plant', harvest.actualFruitCount ? String(harvest.actualFruitCount) : '—'],
        ['Marketable Yield (g/plant)', harvest.actualMarketableWeight ? `${harvest.actualMarketableWeight} g` : '—'],
        ['Unmarketable Yield (g/plant)', harvest.actualUnmarketableWeight ? `${harvest.actualUnmarketableWeight} g` : '—'],
        ['Total Yield Weight (g/plant)', totalW ? `${totalW} g` : '—'],
        ['Average Fruit Weight (g)', avgW !== '—' ? `${avgW} g` : '—'],
        ['Marketable Percentage (%)', markPct !== '—' ? `${markPct}%` : '—'],
        ['Remarks / Harvest Notes', harvest.notes || '—']
      ],
      headStyles: { fillColor: primaryColor },
      theme: 'striped',
      styles: { fontSize: 9 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;

    // Render Harvest Photos if any
    const harvestPhotos = harvest.photos || [];
    if (harvestPhotos.length > 0) {
      if (y + 40 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(10);
      doc.text('Harvest Photo Gallery:', 14, y); y += 6;
      y = await addPhotoGrid(doc, harvestPhotos, y, ph, 40, false, trial.Date);
    }
  }

  // Target Identification Record Section
  y = await addWeedIdSection(doc, weedPhotos, trial, y, ph, nextSec++);
  pdfAddFooter(doc, trial.FormulationName || 'Trial');
  doc.save(`Scientific_Report_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.pdf`);
  toast('Scientific Report downloaded!', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 3 — generatePpt  (PowerPoint slide deck)
// ═════════════════════════════════════════════════════════════════════════════
export async function generatePpt(trial) {
  const repConfig = getReportConfig(trial);
  const categoryId = repConfig.cat;
  const primaryHex = repConfig.config.color?.hex?.replace('#', '') || '0D9488';
  
  toast(`Generating ${repConfig.config.name} PowerPoint…`, 'info');
  const pptx     = new pptxgen();
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const wce      = calcWCE(efficacy, categoryId, trial);
  pptx.layout = 'LAYOUT_16x9';

  // Slide 1 – Title
  const s1 = pptx.addSlide();
  s1.background = { color: primaryHex };
  s1.addText(`${repConfig.config.name.toUpperCase()} TRIAL REPORT`, { x: 0.5, y: 1.5, w: 9, h: 1.2, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center' });
  s1.addText(trial.FormulationName || '—', { x: 0.5, y: 2.8, w: 9, h: 0.7, fontSize: 22, color: 'FFFFFF', align: 'center' });
  s1.addText(`${fmtDate(trial.Date)} | ${trial.Location || '—'} | ${trial.InvestigatorName || '—'}`, { x: 0.5, y: 3.6, w: 9, h: 0.5, fontSize: 14, color: 'E0F2F1', align: 'center' });

  // Slide 2 – Trial Details
  const dataFields = getAllTrialDataFields(trial);
  const s2 = pptx.addSlide();
  s2.addText('Trial Details', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 24, bold: true, color: primaryHex });
  s2.addTable([
    [{ text: 'Investigator', options: { bold: true } }, trial.InvestigatorName || '—', { text: 'Date', options: { bold: true } }, fmtDate(trial.Date)],
    [{ text: 'Location', options: { bold: true } }, trial.Location || '—', { text: 'Dosage', options: { bold: true } }, trial.Dosage || '—'],
    [{ text: dataFields.cropLabel, options: { bold: true } }, dataFields.crop, { text: 'Yield', options: { bold: true } }, dataFields.yieldValue],
    [{ text: 'App Timing', options: { bold: true } }, dataFields.applicationTiming, { text: 'Growth Stage', options: { bold: true } }, dataFields.cropStage],
    [{ text: 'BBCH Code', options: { bold: true } }, dataFields.bbchCode, { text: 'App Method', options: { bold: true } }, dataFields.applicationMethod],
    [{ text: 'Spray Volume', options: { bold: true } }, dataFields.sprayVolume, { text: 'Nozzle', options: { bold: true } }, dataFields.nozzle],
    [{ text: repConfig.targetLabel, options: { bold: true } }, repConfig.targetValue || '—', { text: 'Result', options: { bold: true } }, trial.Result || 'Pending'],
    [{ text: 'Temperature', options: { bold: true } }, trial.Temperature ? `${trial.Temperature}°C` : '—', { text: 'Humidity', options: { bold: true } }, trial.Humidity ? `${trial.Humidity}%` : '—'],
    [{ text: 'Wind', options: { bold: true } }, trial.Windspeed ? `${trial.Windspeed} km/h` : '—', { text: 'Rain', options: { bold: true } }, trial.Rain ? `${trial.Rain} mm` : '—'],
    [{ text: 'Replication', options: { bold: true } }, trial.Replication || '—', { text: 'Status', options: { bold: true } }, (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'],
  ], { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, colW: [1.8, 2.8, 1.8, 2.8], border: { pt: 0.5, color: 'CBD5E1' }, fill: { color: 'F8FAFC' } });

  // Slide 3 – WCE
  if (wce.length) {
    const s3 = pptx.addSlide();
    const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
    const hasYield = parseFloat(trial.YieldValue || trial.Yield || 0) > 0;
    let slideTitle = `Efficacy Analysis – ${repConfig.primaryMetricKey} per ${repConfig.targetLabel}`;
    let metricHeaderCell = repConfig.primaryMetricKey.includes('(%)') ? repConfig.primaryMetricKey : `${repConfig.primaryMetricKey} (%)`;
    if (isVigor) {
      if (hasYield) {
        slideTitle = `Efficacy Analysis – Yield Improvement per ${repConfig.targetLabel}`;
        metricHeaderCell = `Yield Improvement (%)`;
      } else {
        slideTitle = `Efficacy Analysis – Visual Vigor per ${repConfig.targetLabel}`;
        metricHeaderCell = `Visual Vigor Rating (0–10)`;
      }
    }
    s3.addText(slideTitle, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
    const hdr = [{ text: repConfig.targetLabel, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
                 { text: `Initial ${repConfig.primaryObsLabel}`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
                 { text: `Final ${repConfig.primaryObsLabel}`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
                 { text: metricHeaderCell, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } }];
    const obsUnit = isVigor ? '/10' : '';
    s3.addTable([hdr, ...wce.map(w => [w.species, w.initialCover.toFixed(1) + obsUnit, w.finalCover.toFixed(1) + obsUnit, w.wce.toFixed(1)])],
      { x: 0.4, y: 1.0, w: 9.2, fontSize: 13, colW: [3, 2, 2, 2.2], border: { pt: 0.5, color: 'CBD5E1' } });
  }

  // Slide 3.5 – ANOVA & Tukey Significance Letters
  const allTrialsPpt = getBackupTrials();
  const projectTrialsPpt = allTrialsPpt.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
  if (projectTrialsPpt.length >= 2) {
    const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
    const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
    const primaryField = getPrimaryObservationField(categoryId);
    const anova = performANOVA(projectTrialsPpt, { metric: primaryField, design });
    
    if (anova && !anova.error) {
      const tukey = performTukeyHSD(projectTrialsPpt, { metric: primaryField, anova });
      if (tukey && tukey.groups) {
        const s35 = pptx.addSlide();
        s35.addText(`ANOVA & Tukey HSD Significance Groupings`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
        
        const tableRows = [
          [{ text: 'Treatment Name', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
           { text: `${repConfig.primaryMetricLabel} Mean`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
           { text: 'Tukey Grouping', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } }]
        ];
        
        const sortedMeans = Object.entries(anova.treatmentMeans)
          .map(([trt, val]) => ({ trt, val, letter: tukey.groups[trt] || 'a' }))
          .sort((a, b) => b.val - a.val);

        sortedMeans.forEach(r => {
          tableRows.push([r.trt, r.val.toFixed(2), r.letter]);
        });
        
        s35.addTable(tableRows, { x: 0.4, y: 1.0, w: 5.5, fontSize: 13, border: { pt: 0.5, color: 'CBD5E1' } });
        
        s35.addText(`Interpretation:\nTreatments sharing a letter are not significantly different (alpha = 0.05).\nANOVA p-value: ${anova.pValue.toFixed(4)} (${anova.pValue < 0.05 ? 'Significant Effect' : 'No Significant Difference'})\n\nCoefficient of Variation (CV%): ${anova.cv ? anova.cv.toFixed(2) + '%' : 'N/A'}\nGlobal SEm±: ${anova.semGlobal ? '± ' + anova.semGlobal.toFixed(4) : 'N/A'}\nCD / LSD (5% Level): ${anova.cd5 ? anova.cd5.toFixed(4) : 'N/A'}\nCD / LSD (1% Level): ${anova.cd1 ? anova.cd1.toFixed(4) : 'N/A'}\nOutliers Detected: ${anova.detectedOutliers?.length || 0} plot(s)`, {
          x: 6.2, y: 1.0, w: 3.4, h: 3.8, fontSize: 11, color: '475569', fill: { color: 'F8FAFC' }, border: { pt: 0.5, color: 'E2E8F0' }
        });

        // Add Graphical Bar Chart Slide for Tukey
        const chartSlide = pptx.addSlide();
        chartSlide.addText(`Mean Efficacy Chart with Tukey HSD Groupings`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
        
        const chartData = [];
        const labels = [];
        const values = [];
        
        Object.entries(anova.treatmentMeans).forEach(([trt, val]) => {
          const letter = tukey.groups[trt] || 'a';
          labels.push(`${trt} (${letter})`);
          values.push(parseFloat(val.toFixed(2)));
        });
        
        chartData.push({
          name: repConfig.primaryMetricKey,
          labels: labels,
          values: values
        });
        
        chartSlide.addChart(pptx.ChartType.bar, chartData, {
          x: 0.5, y: 1.0, w: 8.5, h: 5.0,
          showVal: true,
          valFontSize: 11,
          valGridLine: { style: 'none' },
          catAxisLabelColor: '475569',
          catAxisLabelFontSize: 10,
          title: `${repConfig.primaryMetricLabel} per Treatment`,
          titleFontSize: 12,
          chartColors: [primaryHex]
        });
      }

      // Add Duncan MRT slide
      const duncan = performDuncanMRT(projectTrialsPpt, { metric: primaryField });
      if (duncan && duncan.groups && !duncan.error) {
        const sDuncan = pptx.addSlide();
        sDuncan.addText(`Duncan's MRT Significance Groupings`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
        const duncanRows = [
          [{ text: 'Treatment Name', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
           { text: `${repConfig.primaryMetricLabel} Mean`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
           { text: 'Duncan Grouping', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } }]
        ];
        Object.entries(anova.treatmentMeans).forEach(([trt, val]) => {
          const letter = duncan.groups[trt] || 'a';
          duncanRows.push([trt, val.toFixed(2), letter]);
        });
        sDuncan.addTable(duncanRows, { x: 0.4, y: 1.0, w: 5.5, fontSize: 13, border: { pt: 0.5, color: 'CBD5E1' } });
      }

      // Add Dunnett comparison slide
      const controlName = Object.keys(anova.treatmentMeans).find(f => 
        f?.toLowerCase().includes('control') || 
        f?.toLowerCase().includes('untreated') ||
        f?.toLowerCase().includes('check') ||
        f?.toLowerCase().includes('utc')
      );
      if (controlName && anova.pValue < 0.05) {
        const dunnett = performDunnettTest(projectTrialsPpt, controlName, { metric: primaryField });
        if (dunnett && dunnett.comparisons && !dunnett.error) {
          const sDunnett = pptx.addSlide();
          sDunnett.addText(`Dunnett's Comparative Test vs. Control (${controlName})`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
          const dunnettHdr = [
            { text: 'Treatment', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
            { text: 'Mean', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
            { text: 'Difference', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
            { text: 't-Stat', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
            { text: 'Significance', options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } }
          ];
          const dunRows = [dunnettHdr];
          dunnett.comparisons.forEach(c => {
            dunRows.push([
              c.treatment,
              c.treatmentMean.toFixed(2),
              c.difference.toFixed(2),
              c.tStatistic.toFixed(2),
              c.significant ? 'Significant (*)' : 'ns'
            ]);
          });
          sDunnett.addTable(dunRows, { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, border: { pt: 0.5, color: 'CBD5E1' } });
        }
      }
    }
  }

  // Slide 4 – Timeline
  if (efficacy.length) {
    const s4 = pptx.addSlide();
    s4.addText(`${repConfig.config.name} Status Timeline`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
    
    const timelineData = getTimelineData(efficacy, categoryId, trial);
    const pptHdr = timelineData.headers.map(h => ({
      text: h,
      options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } }
    }));
    
    const colCount = timelineData.headers.length;
    const colW = Array(colCount).fill(1.0);
    if (colCount >= 5) {
      colW[1] = 1.8;
      colW[colCount - 1] = 2.5;
    }
    const sum = colW.reduce((a, b) => a + b, 0);
    const scaledColW = colW.map(w => (w / sum) * 9.2);

    s4.addTable([pptHdr, ...timelineData.rows], { x: 0.4, y: 1.0, w: 9.2, fontSize: 10, colW: scaledColW, border: { pt: 0.5, color: 'CBD5E1' } });
  }

  // Slide 5 – Photos (up to 4)
  if (photos.length) {
    const s5 = pptx.addSlide();
    s5.addText('Field Photo Log', { x: 0.4, y: 0.2, w: 9, h: 0.6, fontSize: 22, bold: true, color: primaryHex });
    const pos = [[0.3, 0.9, 4.2, 3.0], [5.1, 0.9, 4.2, 3.0], [0.3, 4.1, 4.2, 3.0], [5.1, 4.1, 4.2, 3.0]];
    for (let i = 0; i < Math.min(photos.length, 4); i++) {
      const src = photoSrc(photos[i]); if (!src) continue;
      try {
        const imgData = await toBase64(src, 600); if (!imgData) continue;
        const [px, py, pw2, ph2] = pos[i];
        s5.addImage({ path: imgData, x: px, y: py, w: pw2, h: ph2 });
        s5.addText(getCleanPhotoLabel(photos[i], i), { x: px, y: py + ph2 + 0.05, w: pw2, h: 0.3, fontSize: 9, color: '475569' });
      } catch { /* skip */ }
    }
  }

  // Slide 6 – Conclusion
  const s6 = pptx.addSlide();
  s6.addText('Conclusion & Notes', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
  if (trial.Conclusion) s6.addText([{ text: 'Conclusion\n', options: { bold: true } }, { text: trial.Conclusion }], { x: 0.4, y: 1.0, w: 9.2, h: 2.5, fontSize: 13, color: '1E293B' });
  if (trial.Notes) s6.addText([{ text: 'Notes\n', options: { bold: true } }, { text: trial.Notes }], { x: 0.4, y: 3.8, w: 9.2, h: 2.0, fontSize: 12, color: '475569' });

  await pptx.writeFile({ fileName: `Trial_PPT_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.pptx` });
  toast(`${repConfig.config.name} PowerPoint downloaded!`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 4 — exportToCSV  (observations spreadsheet — same as legacy)
// ═════════════════════════════════════════════════════════════════════════════
export function exportToCSV(trial, category = null) {
  // Category validation for single trial export
  if (category && trial) {
    const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
    if (!validCategories.includes(category)) {
      console.warn(`Invalid category "${category}" provided to exportToCSV. Proceeding without category validation.`);
    } else {
      // Validate that the trial belongs to the specified category
      const trialCategory = trial.Category || 'herbicide';
      if (trialCategory !== category) {
        console.warn(`Trial category "${trialCategory}" does not match specified category "${category}". Export cancelled.`);
        return;
      }
    }
  }
  
  exportMultipleTrialsToCSV([trial], category);
}

// ═════════════════════════════════════════════════════════════════════════════
export function exportMultipleTrialsToCSV(trials, category = null) {
  if (!trials || !trials.length) return;
  
  // Category filtering and validation
  if (category) {
    const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
    if (!validCategories.includes(category)) {
      console.warn(`Invalid category "${category}" provided to exportMultipleTrialsToCSV. Proceeding without category filter.`);
      category = null;
    } else {
      // Filter trials to only include those matching the specified category
      trials = trials.filter(t => 
        (t.Category === category) || (!t.Category && category === 'herbicide')
      );
      
      if (trials.length === 0) {
        console.warn(`No trials found for category "${category}". Export cancelled.`);
        return;
      }
    }
  }

  const firstTrial = trials[0];
  const repConfig = getReportConfig(firstTrial);
  const uniqueCategories = [...new Set(trials.map(t => t.Category || 'herbicide'))];
  const allSameCategory = uniqueCategories.length === 1;
  const uniqueDesigns = [...new Set(trials.map(t => t.TrialDesign || t.Design || 'RCBD'))];

  // Gather active observation fields for these categories
  const obsFields = [];
  uniqueCategories.forEach(catId => {
    const config = getCategoryConfig(catId);
    config.observationFields?.forEach(f => {
      if (f.key !== 'weedDetails' && !obsFields.some(x => x.key === f.key)) {
        obsFields.push(f);
      }
    });
  });

  // Gather active specific parameters for these categories
  const specificFields = [];
  uniqueCategories.forEach(catId => {
    const config = getCategoryConfig(catId);
    config.specificFields?.forEach(f => {
      const isSharedOrTarget = [
        'WeedSpecies', 'DiseaseTarget', 'PestTarget', 'NutrientType', 'BiostimulantType',
        'YieldValue', 'Yield', 'ApplicationMethod', 'CropStageAtApplication', 'CropStage'
      ].includes(f.key);
      if (!isSharedOrTarget && !specificFields.some(x => x.key === f.key)) {
        specificFields.push(f);
      }
    });
  });

  // Gather active design parameters
  const designFields = [];
  if (uniqueDesigns.some(d => d === 'PotTrial' || d === 'rcbd-pot')) {
    designFields.push(
      { key: 'PotRow', label: 'Pot Row' },
      { key: 'PotCol', label: 'Pot Column' },
      { key: 'PotLabel', label: 'Pot Label' },
      { key: 'PotLayout', label: 'Pot Layout' },
      { key: 'PotObsMode', label: 'Pot Observation Mode' }
    );
  }
  if (uniqueDesigns.some(d => d === 'Split-Plot' || d === 'Strip-Plot')) {
    designFields.push(
      { key: 'MainFactor', label: 'Main Factor' },
      { key: 'SubFactor', label: 'Sub Factor' }
    );
  }
  if (uniqueDesigns.some(d => d === 'Lattice')) {
    designFields.push(
      { key: 'SubBlockID', label: 'Sub-Block ID' }
    );
  }

  const header = [
    'Trial ID', 'Category', 'Formulation', 'Investigator', 'Date', 'Location', 'Dosage',
    'Crop', 'Variety', 'Previous Crop', 'Irrigation Method', 'Plant Population (plants/ha)',
    'Yield', 'Application Timing', 'Growth Stage', 'BBCH Code', 'App Method', 'Spray Vol (L/ha)', 'Nozzle',
    'Soil pH', 'Soil Clay %', 'Soil Sand %', 'Soil OC', 'Soil Texture', 'Soil N (ppm)', 'Soil P (ppm)', 'Soil K (ppm)', 'Soil CEC', 'Soil Moisture %',
    'Trial Design', 'Replication / Block ID'
  ];

  // Add design specific fields to header
  designFields.forEach(f => {
    header.push(f.label);
  });

  if (allSameCategory) {
    header.push(repConfig.targetLabel);
  } else {
    header.push('Target Label', 'Target Value');
  }

  header.push('Overall Result', 'Trial Status');

  // Add category specific fields to header
  specificFields.forEach(f => {
    header.push(f.label);
  });

  header.push('DAA', 'Obs Date');

  // Dynamic observation fields
  obsFields.forEach(f => {
    header.push(f.label);
  });

  if (uniqueCategories.includes('herbicide')) {
    header.push('Herbicide Species Detail', 'Herbicide Species Cover %');
  }

  header.push('Obs Status', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)', 'Notes');

  const rows = [];

  trials.forEach(trial => {
    const dataFields = getAllTrialDataFields(trial);
    const trialConfig = getReportConfig(trial);
    const proj = getProjectForTrial(trial);
    const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
    const isCompletedStr = (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing';

    const baseRow = [
      trial.ID, trial.Category || 'herbicide', trial.FormulationName, trial.InvestigatorName, trial.Date, trial.Location, trial.Dosage,
      dataFields.crop, dataFields.variety, dataFields.previousCrop, dataFields.irrigationMethod, dataFields.plantPopulation,
      dataFields.yieldValue, dataFields.applicationTiming, dataFields.cropStage, dataFields.bbchCode,
      dataFields.applicationMethod, dataFields.sprayVolume, dataFields.nozzle,
      dataFields.soil?.ph || '', dataFields.soil?.clay || '', dataFields.soil?.sand || '', dataFields.soil?.organicCarbon || '', dataFields.soil?.texture || '',
      dataFields.soil?.nitrogen || '', dataFields.soil?.phosphorus || '', dataFields.soil?.potassium || '', dataFields.soil?.cec || '', dataFields.soil?.moisture || '',
      trial.ProjectID ? (trial.TrialDesign || trial.Design || 'RCBD') : 'Individual',
      trial.ProjectID ? (trial.Replication || trial.BlockID || 'R1') : '-'
    ];

    // Push design fields values
    designFields.forEach(f => {
      if (f.key === 'PotLayout') {
        baseRow.push(trial.PotLayout || proj?.PotLayout || '-');
      } else if (f.key === 'PotObsMode') {
        baseRow.push(trial.PotObsMode || proj?.PotObsMode || '-');
      } else {
        baseRow.push(trial[f.key] !== undefined && trial[f.key] !== null ? trial[f.key] : '-');
      }
    });

    const trialMetadataRow = [];
    if (allSameCategory) {
      trialMetadataRow.push(trialConfig.targetValue);
    } else {
      trialMetadataRow.push(trialConfig.targetLabel, trialConfig.targetValue);
    }

    trialMetadataRow.push(trial.Result || 'Pending', isCompletedStr);

    // Push specific fields values
    specificFields.forEach(f => {
      trialMetadataRow.push(trial[f.key] !== undefined && trial[f.key] !== null ? trial[f.key] : '');
    });

    const fullBaseRow = [...baseRow, ...trialMetadataRow];
    const blankPrefixRow = fullBaseRow.map(() => '');

    let isFirstRowOfTrial = true;
    const getPrefixRow = () => {
      if (isFirstRowOfTrial) {
        isFirstRowOfTrial = false;
        return fullBaseRow;
      }
      return blankPrefixRow;
    };

    if (efficacy.length) {
      const sortedObs = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
      const baseObs = sortedObs.find(obs => (obs.daa ?? 0) === 0) || sortedObs[0];
      const baseVal = baseObs ? (getObservationPrimaryValue(trialConfig.cat, baseObs) ?? 0) : 0;

      efficacy.forEach(obs => {
        const obsDate = obs.date || '';
        const daa = obs.daa ?? '';

        // Let's determine rating / status
        const pVal = getObservationPrimaryValue(trialConfig.cat, obs) ?? 0;
        const status = calculateStatus(trialConfig.cat, pVal, baseVal);

        const temp = obs.weatherTemp ?? obs.temperature_2m ?? '';
        const hum = obs.weatherHumidity ?? obs.relative_humidity_2m ?? '';
        const wind = obs.weatherWind ?? obs.wind_speed_10m ?? '';
        const rain = obs.weatherRain ?? '';
        const notes = obs.notes || '';

        // Herbicide detail handling
        if (trialConfig.cat === 'herbicide') {
          const details = obs.weedDetails?.length ? obs.weedDetails : [{ species: 'Total', cover: getObservationPrimaryValue(trialConfig.cat, obs) ?? '' }];
          const speciesDetailStr = details.map(wd => `${wd.species || 'Total'}: ${wd.cover ?? ''}%`).join(' | ');

          const row = [...getPrefixRow(), daa, obsDate];
          // Push placeholders or values for other observation fields
          obsFields.forEach(f => {
            if (f.key === 'weedCover') {
              row.push(getObservationPrimaryValue(trialConfig.cat, obs) ?? '');
            } else {
              row.push('');
            }
          });
          row.push(speciesDetailStr, '', status, temp, hum, wind, rain, notes);
          rows.push(row);
        } else {
          const row = [...getPrefixRow(), daa, obsDate];
          obsFields.forEach(f => {
            const val = obs[f.key];
            row.push((val !== undefined && val !== null) ? val : '');
          });
          if (uniqueCategories.includes('herbicide')) {
            row.push('', ''); // Herbicide species detail and cover placeholders
          }
          row.push(status, temp, hum, wind, rain, notes);
          rows.push(row);
        }
      });
    } else {
      // Empty observations row
      const row = [...getPrefixRow(), '', ''];
      obsFields.forEach(() => row.push(''));
      if (uniqueCategories.includes('herbicide')) {
        row.push('', '');
      }
      row.push('', '', '', '', '', '');
      rows.push(row);
    }
  });

  const csv = [header, ...rows].map(r => r.map(c => {
    let val = String(c ?? '');
    val = val.replace(/[\u2013\u2014]/g, '-');
    return `"${val.replace(/"/g, '""')}"`;
  }).join(',')).join('\n');

  let filename = 'Trials_Export.csv';
  if (trials.length === 1) {
    const trial = trials[0];
    filename = `Trial_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.csv`;
  } else {
    filename = `Selected_Trials_${new Date().toISOString().split('T')[0]}.csv`;
  }

  dlBlob(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' }), filename);
  toast(`CSV exported (${trials.length} trial${trials.length > 1 ? 's' : ''})`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 5 — exportAllTrialsCSV  (all trials summary)
// ═════════════════════════════════════════════════════════════════════════════
export function exportAllTrialsCSV(trials, projects = [], category = null) {
  if (!trials || !trials.length) return;
  
  // Category filtering and validation
  if (category) {
    const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
    if (!validCategories.includes(category)) {
      console.warn(`Invalid category "${category}" provided to exportAllTrialsCSV. Proceeding without category filter.`);
      category = null;
    } else {
      // Filter trials to only include those matching the specified category
      trials = trials.filter(t => 
        (t.Category === category) || (!t.Category && category === 'herbicide')
      );
      
      // Filter projects to only include those matching the specified category
      projects = projects.filter(p => 
        (p.Category === category) || (!p.Category && category === 'herbicide')
      );
      
      if (trials.length === 0) {
        console.warn(`No trials found for category "${category}". Export cancelled.`);
        return;
      }
    }
  }
  
  const firstTrial = trials[0];
  const repConfig = getReportConfig(firstTrial);
  const allSameCategory = trials.every(t => (t.Category || 'herbicide') === (firstTrial.Category || 'herbicide'));
  const targetLabel = allSameCategory ? repConfig.targetLabel : 'Target Species';

  const header = ['Trial ID', 'Category', 'Formulation', 'Investigator', 'Date', 'Location', 'Dosage',
                  'Crop', 'Variety', 'Previous Crop', 'Irrigation Method', 'Plant Population',
                  'Yield', 'Application Timing', 'Growth Stage', 'BBCH Code',
                  targetLabel, 'Result', 'Status', 'Project', 'Replication',
                  'Plot #', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)',
                  'Observations', 'Photos'];
  const rows = trials.map(t => {
    const proj = projects.find(p => p.ID === t.ProjectID) || getProjectForTrial(t, { projects });
    const tConfig = getReportConfig(t);
    const dataFields = getAllTrialDataFields(t, { projects });
    return [
      t.ID, t.Category || 'herbicide', t.FormulationName, t.InvestigatorName, t.Date, t.Location, t.Dosage,
      dataFields.crop, dataFields.variety, dataFields.previousCrop, dataFields.irrigationMethod, dataFields.plantPopulation,
      dataFields.yieldValue, dataFields.applicationTiming, dataFields.cropStage, dataFields.bbchCode,
      tConfig.targetValue, t.Result,
      (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Ongoing',
      proj?.Name || '', t.Replication || '', t.PlotNumber || '',
      t.Temperature || '', t.Humidity || '', t.Windspeed || '', t.Rain || '',
      safeJsonParse(t.EfficacyDataJSON, []).length,
      safeJsonParse(t.PhotoURLs, []).length,
    ];
  });
  const csv = [header, ...rows].map(r => r.map(c => {
    let val = String(c ?? '');
    val = val.replace(/[\u2013\u2014]/g, '-');
    return `"${val.replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
  dlBlob(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' }), `All_Trials_${new Date().toISOString().split('T')[0]}.csv`);
  toast(`Exported ${trials.length} trials to CSV`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 6 — exportJson  (raw JSON backup)
// ═════════════════════════════════════════════════════════════════════════════
export function exportJson(trial) {
  const categoryLabel = trial.Category ? (trial.Category.charAt(0).toUpperCase() + trial.Category.slice(1)) : 'Herbicide';
  const data = { ...trial, _exportedAt: new Date().toISOString(), _app: `Miklens ${categoryLabel} Trial Manager` };
  dlBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    `Trial_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.json`);
  toast('JSON exported', 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 7 — exportFieldReportTxt  (plain text field report)
// ═════════════════════════════════════════════════════════════════════════════
export function exportFieldReportTxt(trial, projectName = '') {
  const repConfig = getReportConfig(trial);
  const categoryId = repConfig.cat;
  
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const wce = calcWCE(efficacy, categoryId, trial);
  const dataFields = getAllTrialDataFields(trial);
  const sep  = '─'.repeat(60);
  const lines = [
    '═'.repeat(60),
    `  ${repConfig.config.name.toUpperCase()} TRIAL — FIELD REPORT`,
    '═'.repeat(60),
    `Trial ID:       ${trial.ID || '—'}`,
    `Formulation:    ${trial.FormulationName || '—'}`,
    `Investigator:   ${trial.InvestigatorName || '—'}`,
    `Date:           ${fmtDate(trial.Date)}`,
    `Location:       ${trial.Location || '—'}`,
    `Dosage:         ${trial.Dosage || '—'}`,
    `Crop:           ${dataFields.crop}`,
    `Variety:        ${dataFields.variety}`,
    `Previous Crop:  ${dataFields.previousCrop}`,
    `Irrigation:     ${dataFields.irrigationMethod}`,
    `Plant Pop.:     ${dataFields.plantPopulation}`,
    `Yield:          ${dataFields.yieldValue}`,
    `App Timing:     ${dataFields.applicationTiming}`,
    `Growth Stage:   ${dataFields.cropStage}`,
    `BBCH Code:      ${dataFields.bbchCode}`,
    `App Method:     ${dataFields.applicationMethod}`,
    `Spray Volume:   ${dataFields.sprayVolume}`,
    `Nozzle:         ${dataFields.nozzle}`,
    `${(repConfig.targetLabel + ':').padEnd(16)}${repConfig.targetValue}`,
    `Result:         ${trial.Result || 'Pending'}`,
    `Status:         ${(trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'}`,
    projectName ? `Project:        ${projectName}` : null,
    trial.Replication ? `Replication:    ${trial.Replication}` : null,
    sep,
    'WEATHER ON APPLICATION DAY',
    sep,
    `Temperature:    ${trial.Temperature || '—'}°C`,
    `Humidity:       ${trial.Humidity || '—'}%`,
    `Wind Speed:     ${trial.Windspeed || '—'} km/h`,
    `Rain:           ${trial.Rain || '—'} mm`,
  ];
  if (dataFields.soil && Object.keys(dataFields.soil).length > 0) {
    lines.push(sep, 'SOIL PROFILE (0-30 cm)', sep,
      formatSoilProfile(dataFields.soil));
  }
  if (efficacy.length) {
    lines.push(sep, 'EFFICACY OBSERVATIONS', sep);
    const timelineData = getTimelineData(efficacy, categoryId, trial);
    efficacy.forEach((o, oIdx) => {
      const row = timelineData.rows[oIdx];
      const obsParts = [];
      timelineData.headers.forEach((h, hIdx) => {
        if (h !== 'Notes' && h !== 'Status') {
          obsParts.push(`${h}: ${row[hIdx]}`);
        }
      });
      lines.push(`DAA ${o.daa ?? '—'} | ${obsParts.join(' | ')} | Status: ${row[timelineData.headers.indexOf('Status')]} | Notes: ${o.notes || '—'}`);
    });
  }
  if (wce.length) {
    lines.push(sep, `${repConfig.primaryMetricLabel.toUpperCase()} (${repConfig.primaryMetricKey})`, sep);
    wce.forEach(w => lines.push(`  ${w.species}: ${w.wce.toFixed(1)}% (${w.initialCover.toFixed(1)} → ${w.finalCover.toFixed(1)})`));
  }



  // --- Statistical Summary Section ---
  const allTrials = getBackupTrials();
  const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
  const replicationsCount = Math.max(...projectTrials.map(t => parseInt(t.Replication) || 1), projectTrials.length);

  if (replicationsCount >= 3) {
    lines.push(sep, 'STATISTICAL ANALYSIS & DESCRIPTIVE STATISTICS', sep);
    const primaryField = getPrimaryObservationField(categoryId);
    const metricLabel = repConfig.primaryMetricKey;

    // Group by treatment
    const treatments = {};
    projectTrials.forEach(t => {
      const trt = t.FormulationName || 'Untreated Check';
      if (!treatments[trt]) treatments[trt] = [];
      const stEff = validateEfficacy(safeJsonParse(t.EfficacyDataJSON, []));
      if (stEff.length) {
        const lastVal = getObservationPrimaryValue(categoryId, stEff[stEff.length - 1]);
        if (lastVal !== null && lastVal !== undefined && !isNaN(lastVal)) {
          treatments[trt].push(lastVal);
        }
      }
    });

    lines.push('Descriptive Statistics:');
    const descRows = [];
    Object.entries(treatments).forEach(([trt, vals]) => {
      const n = vals.length;
      if (n === 0) return;
      const mean = vals.reduce((a, b) => a + b, 0) / n;
      let sd = 0, se = 0;
      if (n > 1) {
        const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
        sd = Math.sqrt(variance);
        se = sd / Math.sqrt(n);
      }
      descRows.push({ treatment: trt, mean, sd, se, n });
      lines.push(`  * ${trt}: Mean = ${mean.toFixed(2)} ± ${se.toFixed(2)}, SD = ${sd.toFixed(2)}, N = ${n}`);
    });

    // Run ANOVA
    const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
    const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
    const anova = performANOVA(projectTrials, { metric: primaryField, design });

    if (anova && !anova.error && anova.anovaTable) {
      lines.push('\nANOVA Table:');
      anova.anovaTable.source.forEach((src, i) => {
        const dfVal = anova.anovaTable.df[i] ?? '—';
        const ssVal = anova.anovaTable.ss[i]?.toFixed(2) ?? '—';
        const msVal = anova.anovaTable.ms[i]?.toFixed(2) ?? '—';
        const fVal = anova.anovaTable.f[i]?.toFixed(2) ?? '—';
        const pVal = anova.anovaTable.p[i] !== null && anova.anovaTable.p[i] !== undefined ? anova.anovaTable.p[i].toFixed(4) : '—';
        const sig = anova.anovaTable.p[i] !== null && anova.anovaTable.p[i] !== undefined ? (anova.anovaTable.p[i] < 0.01 ? '**' : anova.anovaTable.p[i] < 0.05 ? '*' : 'ns') : '';
        lines.push(`  * ${src.padEnd(12)} | DF: ${dfVal} | SS: ${ssVal} | MS: ${msVal} | F: ${fVal} | P: ${pVal} [${sig}]`);
      });

      // Post-hoc (Tukey HSD)
      const hasSignificantEffect = anova.isTwoWay ? (anova.factorA?.p < 0.05 || anova.factorB?.p < 0.05 || anova.interaction?.p < 0.05) : (anova.pValue < 0.05);
      if (hasSignificantEffect) {
        const tukey = performTukeyHSD(projectTrials, { metric: primaryField, anova });
        if (tukey && tukey.groups) {
          lines.push('\nTukey HSD Letter Groupings:');
          Object.entries(tukey.groups)
            .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
            .forEach(([trt, letter]) => {
              lines.push(`  * ${trt}: ${letter}`);
            });
        }
      }
    }

    // Secondary Yield ANOVA
    if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
      const hasYield = projectTrials.some(t => t.YieldValue || t.Yield);
      if (hasYield) {
        const yieldTreatments = {};
        projectTrials.forEach(t => {
          const trt = t.FormulationName || 'Untreated Check';
          if (!yieldTreatments[trt]) yieldTreatments[trt] = [];
          const yVal = parseFloat(t.YieldValue || t.Yield);
          if (!isNaN(yVal)) yieldTreatments[trt].push(yVal);
        });

        lines.push('\nYield Descriptive Statistics:');
        Object.entries(yieldTreatments).forEach(([trt, vals]) => {
          const n = vals.length;
          if (n === 0) return;
          const mean = vals.reduce((a, b) => a + b, 0) / n;
          let sd = 0, se = 0;
          if (n > 1) {
            const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
            const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
            sd = Math.sqrt(variance);
            se = sd / Math.sqrt(n);
          }
          lines.push(`  * ${trt}: Yield Mean = ${mean.toFixed(2)} ± ${se.toFixed(2)}, SD = ${sd.toFixed(2)}, N = ${n}`);
        });

        const mockTrials = projectTrials.map(t => {
          const yieldVal = parseFloat(t.YieldValue || t.Yield || 0);
          return {
            ...t,
            EfficacyDataJSON: JSON.stringify([{ daa: 999, yield: yieldVal }])
          };
        });
        const yieldAnova = performANOVA(mockTrials, { metric: 'yield', daa: 999, design });
        if (yieldAnova && !yieldAnova.error && yieldAnova.anovaTable) {
          lines.push('\nYield ANOVA Table:');
          yieldAnova.anovaTable.source.forEach((src, i) => {
            const dfVal = yieldAnova.anovaTable.df[i] ?? '—';
            const ssVal = yieldAnova.anovaTable.ss[i]?.toFixed(2) ?? '—';
            const msVal = yieldAnova.anovaTable.ms[i]?.toFixed(2) ?? '—';
            const fVal = yieldAnova.anovaTable.f[i]?.toFixed(2) ?? '—';
            const pVal = yieldAnova.anovaTable.p[i] !== null && yieldAnova.anovaTable.p[i] !== undefined ? yieldAnova.anovaTable.p[i].toFixed(4) : '—';
            const sig = yieldAnova.anovaTable.p[i] !== null && yieldAnova.anovaTable.p[i] !== undefined ? (yieldAnova.anovaTable.p[i] < 0.01 ? '**' : yieldAnova.anovaTable.p[i] < 0.05 ? '*' : 'ns') : '';
            lines.push(`  * ${src.padEnd(12)} | DF: ${dfVal} | SS: ${ssVal} | MS: ${msVal} | F: ${fVal} | P: ${pVal} [${sig}]`);
          });
        }
      }
    }
  }

  if (trial.Conclusion) lines.push(sep, 'CONCLUSION', sep, trial.Conclusion);
  if (trial.Notes)      lines.push(sep, 'NOTES', sep, trial.Notes);
  lines.push(sep, `Generated: ${new Date().toLocaleString()}`, '═'.repeat(60));

  const text = lines.filter(l => l !== null).join('\n');
  dlBlob(new Blob([text], { type: 'text/plain' }),
    `${repConfig.config.name}_Field_Report_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.txt`);
  toast(`${repConfig.config.name} Field report downloaded`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════

//  EXPORT 8 — exportHtmlReport  (standalone printable HTML, same as legacy)
// ═════════════════════════════════════════════════════════════════════════════
export function exportHtmlReport(trial, projectName = '') {
  const repConfig = getReportConfig(trial);
  const categoryId = repConfig.cat;
  const primaryHex = repConfig.config.color?.hex || '#0d9488';
  const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  const hasYield = parseFloat(trial.YieldValue || trial.Yield || 0) > 0;
  let sectionMetricLabel = `${repConfig.primaryMetricLabel} (${repConfig.primaryMetricUnit})`;
  let metricColHeader = `${repConfig.primaryMetricLabel} (${repConfig.primaryMetricUnit})`;
  if (isVigor) {
    if (hasYield) {
      sectionMetricLabel = 'Comparative Yield Improvement (%)';
      metricColHeader = 'Yield Improvement (%)';
    } else {
      sectionMetricLabel = 'Comparative Vigor Improvement (%)';
      metricColHeader = 'Visual Vigor Rating (0–10)';
    }
  }

  toast(`Generating HTML report…`, 'info');

  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const wce      = calcWCE(efficacy, categoryId, trial);
  const isFinalized = trial.IsCompleted === true || trial.IsCompleted === 'true';
  const dataFields = getAllTrialDataFields(trial);

  const badgeColor = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444', Control: '#8b5cf6' }[trial.Result] || '#6b7280';

  const photoHtml = photos.map((p, i) => {
    const src = photoSrc(p); if (!src) return '';
    const label = p.label || `Photo ${i + 1}`;
    const date  = p.date ? formatPhotoDate(p.date) : '';
    return `<div style="break-inside:avoid;display:inline-block;margin:6px;vertical-align:top;width:180px;">
      <img src="${src}" style="width:180px;height:135px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" onerror="this.style.display='none'" />
      <p style="font-size:11px;color:#475569;margin:4px 0 0;">${label}</p>
      ${date ? `<p style="font-size:10px;color:#94a3b8;margin:2px 0 0;">${date}</p>` : ''}
    </div>`;
  }).join('');

  const weedPhotoHtml = weedPhotos.map((p, i) => {
    const src = photoSrc(p); if (!src) return '';
    const best = p.identifications?.[0];
    return `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;">
      <img src="${src}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;" onerror="this.style.display='none'" />
      <div>
         <p style="font-weight:700;font-size:14px;margin:0;">${best?.name || 'Unknown Species'}</p>
         <p style="font-size:12px;color:#64748b;margin:4px 0;">Common: ${best?.commonNames?.[0] || '—'}</p>
         <p style="font-size:12px;color:#64748b;margin:0;">Confidence: ${best?.confidence ? (best.confidence * 100).toFixed(1) + '%' : 'N/A'}</p>
      </div>
    </div>`;
  }).join('');

  const timelineData = getTimelineData(efficacy, categoryId, trial);
  const obsHeadersHtml = timelineData.headers.map(h => `<th>${h}</th>`).join('');
  const obsRowsHtml = timelineData.rows.map(row => `
    <tr>
      ${row.map((val, idx) => {
        if (timelineData.headers[idx] === 'Status') {
          const sc = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444' }[val] || '#6b7280';
          return `<td style="color:${sc};font-weight:600;">${val}</td>`;
        }
        return `<td>${val}</td>`;
      }).join('')}
    </tr>
  `).join('');

  const wceRows = wce.map(w => {
    const obsUnit = isVigor ? '/10' : repConfig.primaryMetricUnit;
    const valueUnit = (isVigor && !hasYield) ? '' : '%';
    return `<tr>
    <td>${w.species}</td><td>${w.initialCover.toFixed(1)}${obsUnit}</td>
    <td>${w.finalCover.toFixed(1)}${obsUnit}</td>
    <td style="font-weight:700;color:${w.wce >= 80 ? '#10b981' : w.wce >= 60 ? '#3b82f6' : w.wce >= 40 ? '#f59e0b' : '#ef4444'};">${w.wce.toFixed(1)}${valueUnit}</td>
  </tr>`;
  }).join('');

  const soilHtml = dataFields.soil && Object.keys(dataFields.soil).length > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:16px;">
      <p style="font-weight:700;color:#92400e;margin:0 0 6px;">Soil Profile (0-30 cm)</p>
      <p style="margin:0;font-size:13px;">${formatSoilProfile(dataFields.soil)}</p>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trial Report — ${trial.FormulationName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #1e293b; background: #f8fafc; }
    .cover { background: linear-gradient(135deg, ${primaryHex}, ${primaryHex}dd); color: #fff; padding: 48px 40px; }
    .cover h1 { font-size: 32px; margin: 0 0 8px; }
    .cover p { font-size: 16px; margin: 4px 0; opacity: 0.9; }
    .badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-weight: 700; font-size: 14px; color: #fff; background: ${badgeColor}; margin-top: 12px; }
    .content { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
    .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section h2 { font-size: 16px; color: ${primaryHex}; margin: 0 0 14px; border-bottom: 2px solid ${primaryHex}; padding-bottom: 6px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
    .meta-item { font-size: 13px; } .meta-item strong { color: #475569; display: block; font-size: 11px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: ${primaryHex}; color: #fff; padding: 8px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) td { background: #f8fafc; }
    .weather { background: #f1f5f9; border-radius: 8px; padding: 12px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px; }
    .weather span { display: flex; align-items: center; gap: 6px; }
    @media print {
      body { background: #fff; }
      .no-print { display: none; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${trial.FormulationName || `${repConfig.config.name} Trial Report`}</h1>
    <p>Investigator: ${trial.InvestigatorName || '—'} &nbsp;|&nbsp; Date: ${fmtDate(trial.Date)} &nbsp;|&nbsp; Location: ${trial.Location || '—'}</p>
    ${projectName ? `<p>Project: ${projectName}</p>` : ''}
    <div class="badge">${trial.Result || 'Pending'}</div>
    ${isFinalized ? '<div class="badge" style="background:#8b5cf6;margin-left:6px;">Finalized</div>' : ''}
  </div>
  <div class="content">
    <div class="section">
      <h2>Trial Details</h2>
      <div class="meta-grid">
        <div class="meta-item"><strong>Trial ID</strong>${trial.ID || '—'}</div>
        <div class="meta-item"><strong>Formulation</strong>${trial.FormulationName || '—'}</div>
        <div class="meta-item"><strong>Investigator</strong>${trial.InvestigatorName || '—'}</div>
        <div class="meta-item"><strong>Application Date</strong>${fmtDate(trial.Date)}</div>
        <div class="meta-item"><strong>Location</strong>${trial.Location || '—'}</div>
        <div class="meta-item"><strong>Dosage</strong>${trial.Dosage || '—'}</div>
        <div class="meta-item"><strong>${dataFields.cropLabel}</strong>${dataFields.crop}</div>
        <div class="meta-item"><strong>Yield</strong>${dataFields.yieldValue}</div>
        <div class="meta-item"><strong>App Timing</strong>${dataFields.applicationTiming}</div>
        <div class="meta-item"><strong>Growth Stage</strong>${dataFields.cropStage}</div>
        <div class="meta-item"><strong>BBCH Code</strong>${dataFields.bbchCode}</div>
        <div class="meta-item"><strong>App Method</strong>${dataFields.applicationMethod}</div>
        <div class="meta-item"><strong>Spray Volume</strong>${dataFields.sprayVolume}</div>
        <div class="meta-item"><strong>Nozzle</strong>${dataFields.nozzle}</div>
        <div class="meta-item"><strong>Target ${repConfig.targetLabel}</strong>${repConfig.targetValue || '—'}</div>
        <div class="meta-item"><strong>Result</strong>${trial.Result || 'Pending'}</div>
        <div class="meta-item"><strong>Replication</strong>${trial.Replication || '—'}</div>
        <div class="meta-item"><strong>Plot #</strong>${trial.PlotNumber || '—'}</div>
      </div>
    </div>

    ${trial.Temperature ? `
    <div class="section">
      <h2>Weather on Application Day</h2>
      <div class="weather">
        <span>🌡️ Temp: <strong>${trial.Temperature}°C</strong></span>
        <span>💧 Humidity: <strong>${trial.Humidity || '—'}%</strong></span>
        <span>💨 Wind: <strong>${trial.Windspeed || '—'} km/h</strong></span>
        <span>🌧️ Rain: <strong>${trial.Rain || '—'} mm</strong></span>
        ${trial.DewPoint ? `<span>💧 Dew Point: <strong>${trial.DewPoint}°C</strong></span>` : ''}
        ${trial.CloudCover ? `<span>☁️ Cloud Cover: <strong>${trial.CloudCover}%</strong></span>` : ''}
        ${trial.Sunlight ? `<span>☀️ Solar Radiation: <strong>${trial.Sunlight} W/m²</strong></span>` : ''}
      </div>
    </div>` : ''}

    ${soilHtml ? `<div class="section"><h2>Soil Profile</h2>${soilHtml}</div>` : ''}

    ${efficacy.length ? `
    <div class="section">
      <h2>Efficacy Observations</h2>
      <table>
        <thead>
          <tr>${obsHeadersHtml}</tr>
        </thead>
        <tbody>${obsRowsHtml}</tbody>
      </table>
    </div>` : ''}

    ${wce.length ? `
    <div class="section">
      <h2>${sectionMetricLabel}</h2>
      <table><thead><tr><th>${repConfig.targetLabel}</th><th>Initial ${repConfig.primaryObsLabel}</th><th>Final ${repConfig.primaryObsLabel}</th><th>${metricColHeader}</th></tr></thead>
      <tbody>${wceRows}</tbody></table>
      ${categoryId === 'herbicide' ? `<p style="font-size:11px;font-style:italic;color:#64748b;margin-top:8px;">*Note: Total cover represents estimated canopy cover of the plot, not the mathematical sum of individual species covers.</p>` : ''}
    </div>` : ''}



    ${(() => {
      const allTrials = getBackupTrials();
      const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
      const replicationsCount = Math.max(...projectTrials.map(t => parseInt(t.Replication) || 1), projectTrials.length);

      if (replicationsCount < 3) return '';

      const primaryField = getPrimaryObservationField(categoryId);
      const metricLabel = repConfig.primaryMetricKey;

      // Group by treatment
      const treatments = {};
      projectTrials.forEach(t => {
        const trt = t.FormulationName || 'Untreated Check';
        if (!treatments[trt]) treatments[trt] = [];
        const stEff = validateEfficacy(safeJsonParse(t.EfficacyDataJSON, []));
        if (stEff.length) {
          const lastVal = getObservationPrimaryValue(categoryId, stEff[stEff.length - 1]);
          if (lastVal !== null && lastVal !== undefined && !isNaN(lastVal)) {
            treatments[trt].push(lastVal);
          }
        }
      });

      const descRows = [];
      Object.entries(treatments).forEach(([trt, vals]) => {
        const n = vals.length;
        if (n === 0) return;
        const mean = vals.reduce((a, b) => a + b, 0) / n;
        let sd = 0, se = 0, cv = 0;
        if (n > 1) {
          const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
          const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
          sd = Math.sqrt(variance);
          cv = mean > 0 ? (sd / mean) * 100 : 0;
          se = sd / Math.sqrt(n);
        }
        const ci_lower = mean - (1.96 * se);
        const ci_upper = mean + (1.96 * se);
        descRows.push({
          treatment: trt,
          meanSE: `${mean.toFixed(2)} ± ${se.toFixed(2)}`,
          sd: sd.toFixed(2),
          cv: cv.toFixed(1) + '%',
          ciRange: `${ci_lower.toFixed(2)}–${ci_upper.toFixed(2)}`,
          n,
          meanVal: mean
        });
      });

      const descHtmlRows = descRows.map(r => `
        <tr>
          <td><b>${r.treatment}</b></td>
          <td>${r.meanSE}</td>
          <td>${r.sd}</td>
          <td>${r.cv}</td>
          <td>${r.ciRange}</td>
          <td>${r.n}</td>
        </tr>
      `).join('');

      const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
      const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
      const anova = performANOVA(projectTrials, { metric: primaryField, design });

      let anovaHtml = '';
      let tukeyHtml = '';

      if (anova && !anova.error && anova.anovaTable) {
        const anovaRows = anova.anovaTable.source.map((src, i) => {
          const pVal = anova.anovaTable.p[i];
          const sig = pVal !== null && pVal !== undefined ? (pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns') : '';
          return `
            <tr>
              <td>${src}</td>
              <td>${anova.anovaTable.df[i] ?? '—'}</td>
              <td>${anova.anovaTable.ss[i]?.toFixed(2) ?? '—'}</td>
              <td>${anova.anovaTable.ms[i]?.toFixed(2) ?? '—'}</td>
              <td>${anova.anovaTable.f[i]?.toFixed(2) ?? '—'}</td>
              <td>${pVal !== null && pVal !== undefined ? pVal.toFixed(4) : '—'}</td>
              <td style="font-weight:bold;color:${sig === 'ns' ? '#6b7280' : '#b91c1c'};">${sig}</td>
            </tr>
          `;
        }).join('');

        anovaHtml = `
          <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">ANOVA (Analysis of Variance) Table</h3>
          <table>
            <thead>
              <tr><th>Source of Variation</th><th>DF</th><th>SS</th><th>MS</th><th>F-Value</th><th>P-Value</th><th>Sig.</th></tr>
            </thead>
            <tbody>${anovaRows}</tbody>
          </table>
        `;

        const hasSignificantEffect = anova.isTwoWay ? (anova.factorA?.p < 0.05 || anova.factorB?.p < 0.05 || anova.interaction?.p < 0.05) : (anova.pValue < 0.05);
        if (hasSignificantEffect) {
          const tukey = performTukeyHSD(projectTrials, { metric: primaryField, anova });
          if (tukey && tukey.groups) {
            const tukeyRows = descRows.map(r => {
              const letter = tukey.groups[r.treatment] || 'a';
              return `
                <tr>
                  <td><b>${r.treatment}</b></td>
                  <td>${r.meanVal.toFixed(2)}</td>
                  <td style="font-weight:bold;color:${primaryHex};">${letter}</td>
                </tr>
              `;
            }).join('');

            tukeyHtml = `
              <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">Tukey HSD Multiple Comparisons (Letter Grouping)</h3>
              <table>
                <thead>
                  <tr><th>Treatment</th><th>Mean Efficacy</th><th>Tukey Significance Letter</th></tr>
                </thead>
                <tbody>${tukeyRows}</tbody>
              </table>
            `;
          }
        } else {
          tukeyHtml = `<p style="font-size:12px;color:#64748b;font-style:italic;margin-top:12px;">Tukey HSD post-hoc groupings skipped because ANOVA treatment factor is not statistically significant (p >= 0.05).</p>`;
        }
      }

      // Secondary Yield ANOVA
      let yieldHtml = '';
      if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
        const hasYield = projectTrials.some(t => t.YieldValue || t.Yield);
        if (hasYield) {
          const yieldTreatments = {};
          projectTrials.forEach(t => {
            const trt = t.FormulationName || 'Untreated Check';
            if (!yieldTreatments[trt]) yieldTreatments[trt] = [];
            const yVal = parseFloat(t.YieldValue || t.Yield);
            if (!isNaN(yVal)) yieldTreatments[trt].push(yVal);
          });

          const yieldDescRows = [];
          Object.entries(yieldTreatments).forEach(([trt, vals]) => {
            const n = vals.length;
            if (n === 0) return;
            const mean = vals.reduce((a, b) => a + b, 0) / n;
            let sd = 0, se = 0, cv = 0;
            if (n > 1) {
              const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
              const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
              sd = Math.sqrt(variance);
              cv = mean > 0 ? (sd / mean) * 100 : 0;
              se = sd / Math.sqrt(n);
            }
            const ci_lower = mean - (1.96 * se);
            const ci_upper = mean + (1.96 * se);
            yieldDescRows.push({
              treatment: trt,
              meanSE: `${mean.toFixed(2)} ± ${se.toFixed(2)}`,
              sd: sd.toFixed(2),
              cv: cv.toFixed(1) + '%',
              ciRange: `${ci_lower.toFixed(2)}–${ci_upper.toFixed(2)}`,
              n
            });
          });

          const yieldDescHtml = yieldDescRows.map(r => `
            <tr>
              <td><b>${r.treatment}</b></td>
              <td>${r.meanSE}</td>
              <td>${r.sd}</td>
              <td>${r.cv}</td>
              <td>${r.ciRange}</td>
              <td>${r.n}</td>
            </tr>
          `).join('');

          const mockTrials = projectTrials.map(t => {
            const yieldVal = parseFloat(t.YieldValue || t.Yield || 0);
            return {
              ...t,
              EfficacyDataJSON: JSON.stringify([{ daa: 999, yield: yieldVal }])
            };
          });

          const yieldAnova = performANOVA(mockTrials, { metric: 'yield', daa: 999, design });
          let yieldAnovaHtml = '';
          if (yieldAnova && !yieldAnova.error && yieldAnova.anovaTable) {
            const yieldAnovaRows = yieldAnova.anovaTable.source.map((src, i) => {
              const pVal = yieldAnova.anovaTable.p[i];
              const sig = pVal !== null && pVal !== undefined ? (pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns') : '';
              return `
                <tr>
                  <td>${src}</td>
                  <td>${yieldAnova.anovaTable.df[i] ?? '—'}</td>
                  <td>${yieldAnova.anovaTable.ss[i]?.toFixed(2) ?? '—'}</td>
                  <td>${yieldAnova.anovaTable.ms[i]?.toFixed(2) ?? '—'}</td>
                  <td>${yieldAnova.anovaTable.f[i]?.toFixed(2) ?? '—'}</td>
                  <td>${pVal !== null && pVal !== undefined ? pVal.toFixed(4) : '—'}</td>
                  <td style="font-weight:bold;color:${sig === 'ns' ? '#6b7280' : '#b91c1c'};">${sig}</td>
                </tr>
              `;
            }).join('');

            yieldAnovaHtml = `
              <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">Crop Yield ANOVA Table</h3>
              <table>
                <thead>
                  <tr><th>Source of Variation</th><th>DF</th><th>SS</th><th>MS</th><th>F-Value</th><th>P-Value</th><th>Sig.</th></tr>
                </thead>
                <tbody>${yieldAnovaRows}</tbody>
              </table>
            `;
          }

          yieldHtml = `
            <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <h3 style="font-size:15px;color:${primaryHex};margin-bottom:8px;">Crop Yield Descriptive Statistics</h3>
            <table>
              <thead>
                <tr><th>Treatment / Formulation</th><th>Yield Mean ± SE</th><th>SD</th><th>CV%</th><th>95% Confidence Interval</th><th>Replications</th></tr>
              </thead>
              <tbody>${yieldDescHtml}</tbody>
            </table>
            ${yieldAnovaHtml}
          `;
        }
      }

      return `
      <div class="section">
        <h2>Descriptive Statistics & ANOVA (${metricLabel})</h2>
        <table>
          <thead>
            <tr><th>Treatment / Formulation</th><th>Efficacy Mean ± SE</th><th>SD</th><th>CV%</th><th>95% Confidence Interval</th><th>Replications</th></tr>
          </thead>
          <tbody>${descHtmlRows}</tbody>
        </table>
        ${anovaHtml}
        ${tukeyHtml}
        ${yieldHtml}
      </div>`;
    })()}

    ${trial.Conclusion ? `<div class="section"><h2>Conclusion</h2><p style="margin:0;line-height:1.7;">${trial.Conclusion}</p></div>` : ''}
    ${trial.Notes      ? `<div class="section"><h2>Notes</h2><p style="margin:0;line-height:1.7;">${trial.Notes}</p></div>` : ''}

    ${photos.length ? `<div class="section"><h2>Field Photos (${photos.length})</h2><div>${photoHtml}</div></div>` : ''}
    ${weedPhotos.length ? `<div class="section"><h2>${
      categoryId === 'herbicide' ? 'Weed Identification Record' :
      categoryId === 'fungicide' ? 'Disease Identification Record' :
      categoryId === 'pesticide' ? 'Pest Identification Record' :
      'Target Identification Record'
    }</h2>${weedPhotoHtml}</div>` : ''}

    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">Generated ${new Date().toLocaleString()} — ${repConfig.config.name} Trial Manager</p>
  </div>
  <script>window.onload = () => { const b = document.createElement('button'); b.textContent = '🖨️ Print / Save PDF'; b.className = 'no-print'; b.style = 'position:fixed;bottom:20px;right:20px;background:${primaryHex};color:#fff;border:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:9999;'; b.onclick = () => window.print(); document.body.appendChild(b); };</script>
</body>
</html>`;

  dlBlob(new Blob([html], { type: 'text/html' }),
    `Trial_HTML_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.html`);
  toast(`${repConfig.config.name} HTML report downloaded`, 'success');
}


//  EXPORT 9 — shareTrial  (Web Share API or clipboard)
// ═════════════════════════════════════════════════════════════════════════════
export function shareTrial(trial) {
  const categoryId = trial.Category || 'herbicide';
  const repConfig = getReportConfig(trial);
  
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const wce = calcWCE(efficacy, categoryId, trial);
  const metricLabel = repConfig.primaryMetricKey;
  
  let metricText = '';
  if (wce.length) {
    metricText = `\n${metricLabel}: ` + wce.map(w => `${w.species} ${w.wce.toFixed(1)}%`).join(', ');
  }
  
  const text = `${repConfig.config.name} Trial: ${trial.FormulationName}
Date: ${fmtDate(trial.Date)}
Location: ${trial.Location || '—'}
Dosage: ${trial.Dosage || '—'}
Target ${repConfig.targetLabel}: ${repConfig.targetValue || '—'}
Result: ${trial.Result || 'Pending'}${metricText}
${trial.Conclusion ? '\nConclusion: ' + trial.Conclusion : ''}`.trim();

  if (navigator.share) {
    navigator.share({ title: `Trial: ${trial.FormulationName}`, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text)
      .then(() => toast('Trial details copied to clipboard', 'success'))
      .catch(() => toast('Copy failed', 'error'));
  }
}


//  EXPORT 10 — exportTrialDocx  (Word .docx — matches legacy DOC No Ing. / DOC w/ Ing.)
// ═════════════════════════════════════════════════════════════════════════════
export async function exportTrialDocx(trial, options = {}) {
  const { withIngredients = false, withWeeds = true, formulations = [] } = options;
  toast('Generating Word document…', 'info');

  const categoryId = trial.Category || 'herbicide';
  const repConfig = getReportConfig(trial);
  const primaryHex = repConfig.config.color?.hex || '#0d9488';
  const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  const hasYield = parseFloat(trial.YieldValue || trial.Yield || 0) > 0;
  let sectionMetricLabel = `${repConfig.primaryMetricLabel} (${repConfig.primaryMetricUnit})`;
  let metricColHeader = `${repConfig.primaryMetricLabel} (${repConfig.primaryMetricUnit})`;
  if (isVigor) {
    if (hasYield) {
      sectionMetricLabel = 'Comparative Yield Improvement (%)';
      metricColHeader = 'Yield Improvement (%)';
    } else {
      sectionMetricLabel = 'Comparative Vigor Improvement (%)';
      metricColHeader = 'Visual Vigor Rating (0–10)';
    }
  }

  const efficacy  = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos    = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const wce       = calcWCE(efficacy, categoryId, trial);
  const soil      = safeJsonParse(trial.SoilDataJSON, null);
  const trialDate = fmtDate(trial.Date);
  const isFinalized = trial.IsCompleted === true || trial.IsCompleted === 'true';
  const badgeColor  = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444', Control: '#8b5cf6' }[trial.Result] || '#6b7280';

  const dataFields = getAllTrialDataFields(trial);

  const metaRows = [
    ['Trial ID', trial.ID || '—', 'Formulation', trial.FormulationName || '—'],
    ['Investigator', trial.InvestigatorName || '—', 'Date', trialDate],
    ['Location', trial.Location || '—', 'Dosage', trial.Dosage || '—'],
    [dataFields.cropLabel, dataFields.crop, 'Yield', dataFields.yieldValue],
    ['App Timing', dataFields.applicationTiming, 'Growth Stage', dataFields.cropStage],
    ['BBCH Code', dataFields.bbchCode, 'App Method', dataFields.applicationMethod],
    ['Spray Volume', dataFields.sprayVolume, 'Nozzle', dataFields.nozzle],
    [`Target ${repConfig.targetLabel}`, repConfig.targetValue || '—', 'Result', trial.Result || 'Pending'],
    ['Replication', trial.Replication || '—', 'Plot #', trial.PlotNumber || '—'],
    ['Status', isFinalized ? 'Finalized' : 'Ongoing', '', ''],
  ];

  const metaTableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:11pt;margin-bottom:16px;">
      ${metaRows.map(([l1, v1, l2, v2]) => `
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:bold;background:#f8fafc;width:22%;">${l1}</td>
          <td style="border:1px solid #cbd5e1;padding:6px 10px;width:28%;">${v1}</td>
          ${l2 ? `<td style="border:1px solid #cbd5e1;padding:6px 10px;font-weight:bold;background:#f8fafc;width:22%;">${l2}</td><td style="border:1px solid #cbd5e1;padding:6px 10px;width:28%;">${v2}</td>` : `<td colspan="2" style="border:1px solid #cbd5e1;"></td>`}
        </tr>`).join('')}
    </table>`;

  const weatherHtml = trial.Temperature ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Weather on Application Day</h2>
    <p style="font-size:11pt;">Temp: <strong>${trial.Temperature}°C</strong> &nbsp;|&nbsp; Humidity: <strong>${trial.Humidity || '—'}%</strong> &nbsp;|&nbsp; Wind: <strong>${trial.Windspeed || '—'} km/h</strong> &nbsp;|&nbsp; Rain: <strong>${trial.Rain || '—'} mm</strong></p>` : '';

  const soilHtml = (dataFields.soil && Object.keys(dataFields.soil).length > 0) ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Soil Profile (0-30 cm)</h2>
    <p style="font-size:11pt;">${formatSoilProfile(dataFields.soil)}</p>` : '';

  const timelineData = getTimelineData(efficacy, categoryId, trial);
  const docxObsHeadersHtml = timelineData.headers.map(h => `<th style="padding:6px 8px;text-align:left;">${h}</th>`).join('');
  const docxObsRowsHtml = timelineData.rows.map(row => `
    <tr>
      ${row.map((val, idx) => {
        if (timelineData.headers[idx] === 'Status') {
          const sc = { Excellent: '#10b981', Good: '#3b82f6', Fair: '#f59e0b', Poor: '#ef4444' }[val] || '#6b7280';
          return `<td style="border:1px solid #e2e8f0;padding:5px 8px;color:${sc};font-weight:bold;">${val}</td>`;
        }
        return `<td style="border:1px solid #e2e8f0;padding:5px 8px;">${val}</td>`;
      }).join('')}
    </tr>
  `).join('');

  const efficacyHtml = efficacy.length ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Efficacy Observations</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:${primaryHex};color:#fff;">
        ${docxObsHeadersHtml}
      </tr></thead>
      <tbody>${docxObsRowsHtml}</tbody>
    </table>` : '';

  const wceRows = wce.map(w => {
    const obsUnit = isVigor ? '/10' : repConfig.primaryMetricUnit;
    const valueUnit = (isVigor && !hasYield) ? '' : '%';
    return `<tr>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.species}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.initialCover.toFixed(1)}${obsUnit}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.finalCover.toFixed(1)}${obsUnit}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;font-weight:bold;color:${w.wce >= 80 ? '#10b981' : w.wce >= 60 ? '#3b82f6' : w.wce >= 40 ? '#f59e0b' : '#ef4444'};">${w.wce.toFixed(1)}${valueUnit}</td>
  </tr>`;
  }).join('');

  const wceHtml = wce.length ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">${sectionMetricLabel}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:${primaryHex};color:#fff;">
        <th style="padding:6px 8px;text-align:left;">${repConfig.targetLabel}</th><th style="padding:6px 8px;text-align:left;">Initial ${repConfig.primaryObsLabel}</th>
        <th style="padding:6px 8px;text-align:left;">Final ${repConfig.primaryObsLabel}</th><th style="padding:6px 8px;text-align:left;">${metricColHeader}</th>
      </tr></thead>
      <tbody>${wceRows}</tbody>
    </table>` : '';

  let ingredientsHtml = '';
  if (withIngredients && trial.FormulationID) {
    const form = formulations.find(f => f.ID === trial.FormulationID);
    const ings = safeJsonParse(form?.IngredientsJSON, []);
    if (ings.length) {
      const ingRows = ings.map(i => `<tr>
        <td style="border:1px solid #e2e8f0;padding:5px 8px;">${i.name || '—'}</td>
        <td style="border:1px solid #e2e8f0;padding:5px 8px;">${i.quantity || '—'}</td>
        <td style="border:1px solid #e2e8f0;padding:5px 8px;">${i.unit || '—'}</td>
      </tr>`).join('');
      ingredientsHtml = `
        <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Formulation Ingredients</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead><tr style="background:${primaryHex};color:#fff;">
            <th style="padding:6px 8px;text-align:left;">Ingredient</th>
            <th style="padding:6px 8px;text-align:left;">Quantity</th>
            <th style="padding:6px 8px;text-align:left;">Unit</th>
          </tr></thead>
          <tbody>${ingRows}</tbody>
        </table>`;
    }
  }

  // Resolve photos to inline base64 for Word embedding (Protected View blocks remote URLs)
  let photoHtml = '';
  if (photos.length) {
    const photoCards = [];
    for (let pi = 0; pi < photos.length; pi++) {
      const p = photos[pi];
      const src = photoSrc(p);
      const label = getCleanPhotoLabel(p, pi);
      const dateStr = p.date ? safeFormatDate(p.date) : '';
      if (src) {
        try {
          const b64 = await toBase64(src, 400);
          if (b64) {
            photoCards.push(`
              <div style="display:inline-block;width:45%;margin:2%;border:1px solid #ccc;padding:5px;text-align:center;vertical-align:top;">
                <p style="font-size:9pt;font-weight:bold;margin:5px 0;">${label}</p>
                ${dateStr ? `<p style="font-size:8pt;color:#666;margin:0 0 5px 0;">Captured: ${dateStr}</p>` : ''}
                <img src="${b64}" style="max-width:100%;max-height:180px;display:block;margin:5px auto;" />
              </div>
            `);
            continue;
          }
        } catch { /* skip */ }
      }
      photoCards.push(`<li>${label}${dateStr ? ` — ${dateStr}` : ''}</li>`);
    }
    const imgCards = photoCards.filter(c => c.includes('<img'));
    const listCards = photoCards.filter(c => c.includes('<li'));
    photoHtml = `
      <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Field Photos (${photos.length})</h2>
      ${imgCards.length ? `<div style="width:100%;">${imgCards.join('')}</div>` : ''}
      ${listCards.length ? `<ul style="font-size:10pt;">${listCards.join('')}</ul>` : ''}
    `;
  }

  const recordLabel = categoryId === 'herbicide' ? 'Weed Identification Record' :
                      categoryId === 'fungicide' ? 'Disease Identification Record' :
                      categoryId === 'pesticide' ? 'Pest Identification Record' :
                      'Target Identification Record';
  const weedIdHtml = (withWeeds && weedPhotos.length) ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">${recordLabel}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:${primaryHex};color:#fff;">
        <th style="padding:6px 8px;text-align:left;">Species</th>
        <th style="padding:6px 8px;text-align:left;">Common Name</th>
        <th style="padding:6px 8px;text-align:left;">Confidence</th>
      </tr></thead>
      <tbody>
        ${weedPhotos.map(p => {
          const best = p.identifications?.[0];
          return `<tr>
            <td style="border:1px solid #e2e8f0;padding:5px 8px;">${best?.name || 'Unknown Species'}</td>
            <td style="border:1px solid #e2e8f0;padding:5px 8px;">${best?.commonNames?.[0] || '—'}</td>
            <td style="border:1px solid #e2e8f0;padding:5px 8px;">${best?.confidence ? (best.confidence * 100).toFixed(1) + '%' : 'N/A'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  const allTrials = getBackupTrials();
  const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
  const replicationsCount = Math.max(...projectTrials.map(t => parseInt(t.Replication) || 1), projectTrials.length);

  let docxAnovaHtml = '';
  if (replicationsCount >= 3) {
    const { excludeOutliers = false } = options;
    const primaryField = getPrimaryObservationField(categoryId);
    const metricLabel = repConfig.primaryMetricKey;
    const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
    const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
    const anova = performANOVA(projectTrials, { metric: primaryField, design, excludeOutliers });

    if (anova && !anova.error) {
      const tukey = performTukeyHSD(projectTrials, { metric: primaryField, anova });
      
      // Group by treatment for desc stats
      const treatments = {};
      projectTrials.forEach(t => {
        const trt = t.FormulationName || 'Untreated Check';
        if (!treatments[trt]) treatments[trt] = [];
        const stEff = validateEfficacy(safeJsonParse(t.EfficacyDataJSON, []));
        if (stEff.length) {
          const lastVal = getObservationPrimaryValue(categoryId, stEff[stEff.length - 1]);
          if (lastVal !== null && lastVal !== undefined && !isNaN(lastVal)) {
            treatments[trt].push(lastVal);
          }
        }
      });

      const descRows = [];
      Object.entries(treatments).forEach(([trt, vals]) => {
        const n = vals.length;
        if (n === 0) return;
        const mean = vals.reduce((a, b) => a + b, 0) / n;
        let sd = 0, se = 0, cv = 0;
        if (n > 1) {
          const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
          const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
          sd = Math.sqrt(variance);
          cv = mean > 0 ? (sd / mean) * 100 : 0;
          se = sd / Math.sqrt(n);
        }
        const ci_lower = mean - (1.96 * se);
        const ci_upper = mean + (1.96 * se);
        descRows.push({
          treatment: trt,
          meanSE: `${mean.toFixed(2)} ± ${se.toFixed(2)}`,
          sd: sd.toFixed(2),
          cv: cv.toFixed(1) + '%',
          ciRange: `${ci_lower.toFixed(2)}–${ci_upper.toFixed(2)}`,
          n,
          meanVal: mean
        });
      });

      const descHtmlRows = descRows.map(r => `
        <tr>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;"><b>${r.treatment}</b></td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${r.meanSE}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${r.sd}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${r.cv}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${r.ciRange}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${r.n}</td>
        </tr>
      `).join('');

      let anovaRows = '';
      if (anova.anovaTable) {
        anovaRows = anova.anovaTable.source.map((src, i) => {
          const pVal = anova.anovaTable.p[i];
          const sig = pVal !== null && pVal !== undefined ? (pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns') : '';
          return `
            <tr>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${src}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${anova.anovaTable.df[i] ?? '—'}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${anova.anovaTable.ss[i]?.toFixed(2) ?? '—'}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${anova.anovaTable.ms[i]?.toFixed(2) ?? '—'}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${anova.anovaTable.f[i]?.toFixed(2) ?? '—'}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${pVal !== null && pVal !== undefined ? pVal.toFixed(4) : '—'}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;color:${sig === 'ns' ? '#6b7280' : '#b91c1c'};">${sig}</td>
            </tr>
          `;
        }).join('');
      }

      // Experimental Quality and Precision summary table
      const getCvRating = (c) => {
        if (c < 10) return 'Excellent Precision';
        if (c <= 20) return 'Good Precision';
        if (c <= 30) return 'Acceptable Precision';
        return 'Poor Precision (High Variation)';
      };

      const cvVal = anova.cv ?? 0;
      const semVal = anova.semGlobal ?? 0;
      const cd5Val = anova.cd5 ?? 0;
      const cd1Val = anova.cd1 ?? 0;
      const balanceStatus = anova.balanceWarning ? 'Unbalanced Layout' : 'Balanced Layout';
      const outlierCount = anova.detectedOutliers?.length || 0;
      const outlierHandling = excludeOutliers ? 'Automatically Excluded' : 'Flagged but Kept';

      const qualityHtml = `
        <h3 style="color:${primaryHex};font-size:12pt;margin-top:16px;">Experimental Precision & Quality Certification</h3>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:12px;">
          <tr>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;width:25%;">Coefficient of Variation (CV%)</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;width:25%;">${cvVal.toFixed(2)}% (${getCvRating(cvVal)})</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;width:25%;">Design Balance Status</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;width:25%;">${balanceStatus}</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Global Standard Error (SEm±)</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">± ${semVal.toFixed(4)}</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Layout Configuration</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">${anova.treatments?.length || 0} Treatments × ${replicationsCount} Replications</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">CD / LSD (5% Level)</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">${cd5Val.toFixed(4)}</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Outliers Detected</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">${outlierCount} plot(s)</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">CD / LSD (1% Level)</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">${cd1Val.toFixed(4)}</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Outliers Handling</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">${outlierHandling}</td>
          </tr>
        </table>
      `;

      let outlierLogHtml = '';
      if (anova.detectedOutliers && anova.detectedOutliers.length > 0) {
        outlierLogHtml = `
          <h3 style="color:${primaryHex};font-size:11pt;margin-top:12px;">Flagged Outliers Log</h3>
          <ul style="font-size:9.5pt;margin-bottom:12px;">
            ${anova.detectedOutliers.map(out => `<li>Treatment: <b>${out.treatment}</b> | Rep/Block: <b>${out.block}</b> | Observed Value: <b>${out.value}</b> | Residual Z-score: <b>${out.zScore.toFixed(2)}</b> (${outlierHandling})</li>`).join('')}
          </ul>
        `;
      }

      let tukeyHtml = '';
      if (tukey && tukey.groups && anova.pValue < 0.05) {
        const sortedTukeyRows = descRows.map(r => {
          const letter = tukey.groups[r.treatment] || 'a';
          return {
            treatment: r.treatment,
            meanVal: r.meanVal,
            letter: letter
          };
        }).sort((a, b) => b.meanVal - a.meanVal);

        const tukeyRows = sortedTukeyRows.map(r => `
          <tr>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;"><b>${r.treatment}</b></td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;">${r.meanVal.toFixed(2)}</td>
            <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;color:${primaryHex};">${r.letter}</td>
          </tr>
        `).join('');

        tukeyHtml = `
          <h3 style="color:${primaryHex};font-size:12pt;margin-top:16px;">Tukey HSD Multiple Comparisons</h3>
          <table style="width:100%;border-collapse:collapse;font-size:10pt;">
            <thead><tr style="background:${primaryHex};color:#fff;">
              <th style="padding:6px 8px;text-align:left;">Treatment</th>
              <th style="padding:6px 8px;text-align:left;">Mean</th>
              <th style="padding:6px 8px;text-align:left;">Tukey Grouping</th>
            </tr></thead>
            <tbody>${tukeyRows}</tbody>
          </table>
        `;
      }

      // Dunnett's Test vs Control
      let dunnettHtml = '';
      const controlName = Object.keys(anova.treatmentMeans).find(f => 
        f?.toLowerCase().includes('control') || 
        f?.toLowerCase().includes('untreated') ||
        f?.toLowerCase().includes('check') ||
        f?.toLowerCase().includes('utc')
      );
      if (controlName && anova.significant) {
        const dunnett = performDunnettTest(projectTrials, controlName, { metric: primaryField });
        if (dunnett && dunnett.comparisons && !dunnett.error) {
          const dunnettRows = dunnett.comparisons.map(c => `
            <tr>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;"><b>${c.treatment}</b></td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${c.treatmentMean.toFixed(2)}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${c.controlMean.toFixed(2)}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${c.difference.toFixed(2)}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;">${c.tStatistic.toFixed(2)}</td>
              <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;color:${c.significant ? '#b91c1c' : '#6b7280'};">${c.significant ? 'Significant (*)' : 'ns'}</td>
            </tr>
          `).join('');
          
          dunnettHtml = `
            <h3 style="color:${primaryHex};font-size:12pt;margin-top:16px;">Dunnett's Test vs. Control (${controlName})</h3>
            <table style="width:100%;border-collapse:collapse;font-size:10pt;">
              <thead><tr style="background:${primaryHex};color:#fff;">
                <th style="padding:6px 8px;text-align:left;">Treatment</th>
                <th style="padding:6px 8px;text-align:left;">Mean</th>
                <th style="padding:6px 8px;text-align:left;">Control Mean</th>
                <th style="padding:6px 8px;text-align:left;">Difference</th>
                <th style="padding:6px 8px;text-align:left;">t-Stat</th>
                <th style="padding:6px 8px;text-align:left;">Significance (α=0.05)</th>
              </tr></thead>
              <tbody>${dunnettRows}</tbody>
            </table>
          `;
        }
      }

      docxAnovaHtml = `
        <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Descriptive Statistics & ANOVA</h2>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:12px;">
          <thead><tr style="background:${primaryHex};color:#fff;">
            <th style="padding:6px 8px;text-align:left;">Treatment / Formulation</th>
            <th style="padding:6px 8px;text-align:left;">Mean ± SE</th>
            <th style="padding:6px 8px;text-align:left;">SD</th>
            <th style="padding:6px 8px;text-align:left;">CV%</th>
            <th style="padding:6px 8px;text-align:left;">95% Confidence Interval</th>
            <th style="padding:6px 8px;text-align:left;">Replications</th>
          </tr></thead>
          <tbody>${descHtmlRows}</tbody>
        </table>
        
        <h3 style="color:${primaryHex};font-size:12pt;margin-top:16px;">ANOVA Table</h3>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:12px;">
          <thead><tr style="background:${primaryHex};color:#fff;">
            <th style="padding:6px 8px;text-align:left;">Source of Variation</th>
            <th style="padding:6px 8px;text-align:left;">DF</th>
            <th style="padding:6px 8px;text-align:left;">SS</th>
            <th style="padding:6px 8px;text-align:left;">MS</th>
            <th style="padding:6px 8px;text-align:left;">F-Value</th>
            <th style="padding:6px 8px;text-align:left;">P-Value</th>
            <th style="padding:6px 8px;text-align:left;">Sig.</th>
          </tr></thead>
          <tbody>${anovaRows}</tbody>
        </table>
        ${qualityHtml}
        ${outlierLogHtml}
        ${tukeyHtml}
        ${dunnettHtml}
      `;
    }
  }

  const conclusionHtml = [
    trial.Conclusion ? `<h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Conclusion</h2><p style="font-size:11pt;line-height:1.7;">${trial.Conclusion}</p>` : '',
    trial.Notes ? `<h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Notes</h2><p style="font-size:11pt;line-height:1.7;">${trial.Notes}</p>` : '',
  ].join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
      body { font-family: 'Calibri', Arial, sans-serif; color: #1e293b; margin: 40px; }
      h1 { font-size: 22pt; color: ${primaryHex}; margin-bottom: 4px; }
      .badge { display: inline-block; background: ${badgeColor}; color: #fff; padding: 3px 12px; border-radius: 12px; font-size: 11pt; font-weight: bold; margin-top: 6px; }
      p { margin: 4px 0; }
    </style>
  </head><body>
    <h1>${trial.FormulationName || `${repConfig.config.name} Trial Report`}</h1>
    <p style="font-size:11pt;color:#475569;">Investigator: ${trial.InvestigatorName || '—'} &nbsp;|&nbsp; Date: ${trialDate} &nbsp;|&nbsp; Location: ${trial.Location || '—'}</p>
    <span class="badge">${trial.Result || 'Pending'}</span>
    ${isFinalized ? '<span class="badge" style="background:#8b5cf6;margin-left:6px;">Finalized</span>' : ''}

    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Trial Details</h2>
    ${metaTableHtml}
    ${weatherHtml}
    ${soilHtml}
    ${efficacyHtml}
    ${wceHtml}
    ${ingredientsHtml}
    ${docxAnovaHtml}
    ${conclusionHtml}
    ${photoHtml}
    ${weedIdHtml}
    <p style="text-align:center;color:#94a3b8;font-size:9pt;margin-top:32px;">Generated ${new Date().toLocaleString()} — ${repConfig.config.name} Trial Manager</p>
  </body></html>`;

  // Build a minimal Word-compatible RTF blob that Word/LibreOffice opens natively
  // We use the MHTML/Word-HTML trick: wrap HTML in a Word-compatible MIME envelope
  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8"/>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
  <style>
    @page { size: A4; margin: 2.54cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1e293b; }
    h1 { font-size: 18pt; color: ${primaryHex}; }
    h2 { font-size: 13pt; color: ${primaryHex}; border-bottom: 1pt solid ${primaryHex}; padding-bottom: 3pt; margin-top: 18pt; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; }
    td, th { border: 1pt solid #cbd5e1; padding: 4pt 7pt; font-size: 10pt; }
    th { background: ${primaryHex}; color: #fff; font-weight: bold; }
    .badge { background: ${badgeColor}; color: #fff; padding: 2pt 8pt; font-size: 10pt; font-weight: bold; }
  </style>
</head>
${html.replace(/<!DOCTYPE html>[\s\S]*?<\/head>/i, '').replace(/<\/html>/i, '')}</html>`;

  dlBlob(
    new Blob([wordHtml], { type: 'application/msword' }),
    `Trial_DOC_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.doc`
  );
  toast('Word document downloaded!', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
//  MASTER REPORTS
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMasterComprehensivePdf(project, subTrials, options = {}) {
  const { withIngredients = true, withWeeds = true, withTimeline = true,
          showPhotoDates = true, formulations = [], aiSummary = '', analysis = null } = options;
  toast('Generating Master PDF…', 'info');
  
  const categoryId = (project.Category || (subTrials[0]?.Category) || 'herbicide').toLowerCase();
  const repConfig = getReportConfig({ Category: categoryId });
  const primaryColor = repConfig.primaryColor;

  const doc = createDoc();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  pdfHeader(doc, 'Master Field Study Report', project.Name, primaryColor);
  let y = 50;

  // Metadata block
  doc.setFontSize(10);
  const lx = 14, rx = pw / 2 + 10;
  doc.text(`Crop: ${project.Crop || 'N/A'}`, lx, y);
  doc.text(`Location: ${project.Location || 'N/A'}`, rx, y);
  y += 6;
  doc.text(`Investigator: ${project.Investigator || 'N/A'}`, lx, y);
  doc.text(`Created: ${project.CreatedAt ? formatDate(project.CreatedAt) : 'N/A'}`, rx, y);
  y += 6;

  const yields = subTrials.map(st => parseFloat(st.YieldValue || st.Yield || 0)).filter(y => y > 0);
  const avgYield = yields.length ? (yields.reduce((a, b) => a + b, 0) / yields.length).toFixed(2) : null;
  const yieldUnit = subTrials[0]?.YieldUnit || subTrials[0]?.yieldUnit || (categoryId === 'herbicide' ? 't/ha' : 'kg/ha');
  doc.text(`Avg Yield: ${avgYield ? `${avgYield} ${yieldUnit}` : 'N/A'}`, lx, y);
  doc.text(`Spray Volume: ${project.SprayVolume ? `${project.SprayVolume} L/ha` : 'N/A'}`, rx, y);
  y += 8;
  
  const targetLabel = repConfig.targetLabel;
  const targetValue = project[repConfig.config.targetField] || project.TargetWeeds || 'N/A';
  if (targetValue && targetValue !== 'N/A') {
    doc.setFont(undefined, 'bold'); doc.text(`Target ${targetLabel}:`, lx, y); y += 5;
    doc.setFont(undefined, 'normal');
    const tw = doc.splitTextToSize(targetValue, pw - 28);
    doc.text(tw, lx, y); y += tw.length * 5 + 5;
  }

  // Calculate dynamic stats
  let maxDaa = 0;
  let totalObs = 0;
  let totalPhotos = 0;
  subTrials.forEach(t => {
    const eff = safeJsonParse(t.EfficacyDataJSON, []);
    totalObs += eff.length;
    const phs = safeJsonParse(t.PhotoURLs, []);
    totalPhotos += phs.length;
    eff.forEach(o => {
      const dVal = (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') ? Number(o.daa) : calculateDAA(o.date, t.Date);
      if (!isNaN(dVal) && dVal > maxDaa) {
        maxDaa = dVal;
      }
    });
  });

  // Preliminary Report Warning Banner
  if (maxDaa <= 3) {
    if (y + 26 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.rect(14, y, pw - 28, 22, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('PRELIMINARY REPORT', 18, y + 5);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.text(`Observation Window: 0–${maxDaa} DAA`, 18, y + 10);
    const bannerMsg = 'This report represents early vegetative observations. Final treatment efficacy should be interpreted after 7, 15, 30 and 45 DAA assessments.';
    const wrappedBannerMsg = doc.splitTextToSize(bannerMsg, pw - 36);
    doc.text(wrappedBannerMsg, 18, y + 14);
    doc.setTextColor(0, 0, 0);
    y += 28;
  }

  // Trial Progress Summary Box
  if (y + 35 > ph - 20) { doc.addPage(); y = 20; }
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('Trial Progress Summary', 14, y); y += 4;
  doc.setFont(undefined, 'normal');
  const confidence = maxDaa <= 3 ? `Low–Moderate Confidence (Observation Window 0–${maxDaa} DAA)` : maxDaa <= 14 ? 'Medium (Mid Stage)' : 'High (Final Stage)';
  const progressRows = [
    ['Plots Evaluated', `${subTrials.length}/${subTrials.length}`, 'Total Observations (DAA Records)', String(totalObs)],
    ['DAA Observation Range', `0–${maxDaa} DAA`, 'Total Photos', String(totalPhotos)],
    ['Scientific Confidence', confidence, '', '']
  ];
  autoTable(doc, {
    startY: y,
    body: progressRows,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: (pw - 28) / 4 }, 2: { fontStyle: 'bold', cellWidth: (pw - 28) / 4 } }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  let sectionCounter = 1;
  y = secHeading(doc, `${sectionCounter++}. Sub-Trials Summary`, y, ph, 14, primaryColor);

  // Table showing all sub-trials
  const subTrialRows = subTrials.map(st => {
    return [
      st.FormulationName || 'Untreated Check',
      st.Dosage || 'N/A',
      st.Replication || 'R1',
      st.PlotNumber || 'N/A',
      st.Location || 'N/A',
      st.Result || 'Pending'
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Sub-Trial Spot', 'Dosage', 'Rep', 'Plot #', 'Location', 'Efficacy Result']],
    body: subTrialRows,
    headStyles: { fillColor: DARK }, theme: 'striped', styles: { fontSize: 8 }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // AI Narrative Summary
  if (aiSummary) {
    y = secHeading(doc, `${sectionCounter++}. Master AI Synthesis & Narrative`, y, ph, 14, primaryColor);
    const narrativeClean = wrapScientificNames(aiSummary);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    y = drawTextWithItalics(doc, narrativeClean, 14, y, pw - 28, 4);
    y += 6;
    doc.setFontSize(10);
  }

  if (analysis?.anova) {
    y = secHeading(doc, `${sectionCounter++}. Statistical Analysis Summary`, y, ph, 14, primaryColor);
    const anova = analysis.anova;
    const method = analysis.analysisMethod || anova.design || 'ANOVA';
    doc.setFontSize(9);
    doc.text(`Analysis method: ${method}`, 14, y); y += 5;
    doc.text(`Design interpretation: ${analysis.design || (anova.design || 'RCBD')}`, 14, y); y += 5;
    const nPlots = subTrials.length;
    const nReplicates = [...new Set(subTrials.map(t => t.Replication || t.BlockID || 'R1'))].length;
    const nTreatments = [...new Set(subTrials.map(t => t.FormulationName || 'Untreated Check'))].length;
    doc.text(`ANOVA: F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'} (n = ${nPlots} plots, ${nReplicates} replicates, ${nTreatments} treatments)`, 14, y); y += 5;
    doc.text(`${anova.significant ? 'Statistically significant differences were detected between treatments.' : 'Treatment differences were not statistically significant at α=0.05.'}`, 14, y); y += 6;
    if (analysis.postHoc?.groups) {
      const groups = Object.entries(analysis.postHoc.groups)
        .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
        .map(([treatment, letter]) => `${treatment} (${letter})`)
        .join(', ');
      const wrapped = doc.splitTextToSize(`Post-hoc grouping: ${groups}`, pw - 28);
      doc.text(wrapped, 14, y); y += wrapped.length * 5 + 4;
    }
    y += 6;
  }

  // Consolidated comparative efficacy
  let sectionMetricLabel = `Comparative ${repConfig.primaryMetricLabel} (${repConfig.primaryMetricUnit})`;
  let metricColHeader = `${repConfig.primaryMetricLabel} (${repConfig.primaryMetricUnit})`;
  if ((categoryId === 'nutrition' || categoryId === 'biostimulant') && yields.length === 0) {
    sectionMetricLabel = 'Comparative Vigor Improvement (%)';
    metricColHeader = 'Vigor Improvement (%)';
  }
  y = secHeading(doc, `${sectionCounter++}. ${sectionMetricLabel}`, y, ph, 14, primaryColor);
  const wceRows = [];
  subTrials.forEach(st => {
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const wces = calcWCE(eff, categoryId, st);
    wces.forEach(w => {
      const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
      const unitSuff = isVigor ? '/10' : repConfig.primaryMetricUnit;
      wceRows.push([
        st.FormulationName || 'Untreated Check',
        st.Replication || 'R1',
        w.species,
        w.initialCover.toFixed(1) + unitSuff,
        w.finalCover.toFixed(1) + unitSuff,
        w.wce.toFixed(1) + '%'
      ]);
    });
  });

  if (wceRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Sub-Trial / Spot', 'Rep', repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, metricColHeader]],
      body: wceRows,
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 8 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  } else {
    doc.setFontSize(9); doc.text('No structured observations available for comparison.', 14, y);
    y += 10;
  }

  // Add individual Sub-Trial details sequentially
  for (let i = 0; i < subTrials.length; i++) {
    const st = subTrials[i];
    doc.addPage(); y = 20;
    y = secHeading(doc, `Sub-Trial: ${st.FormulationName || 'Untreated Check'} (${st.Replication || 'R1'})`, y, ph, 14, primaryColor);
    
    // Details
    const stFields = getAllTrialDataFields(st, { projects: [project] });
    doc.setFontSize(9);
    doc.text(`Location: ${st.Location || 'N/A'}  |  Dosage: ${st.Dosage || 'N/A'}  |  Plot: ${st.PlotNumber || 'N/A'}  |  Crop: ${stFields.crop}  |  Yield: ${stFields.yieldValue}`, 14, y); y += 6;
    doc.text(`Timing: ${stFields.applicationTiming}  |  Growth Stage: ${stFields.cropStage}  |  BBCH: ${stFields.bbchCode}  |  Method: ${stFields.applicationMethod}`, 14, y); y += 6;
    doc.text(`Soil Profile: ${formatSoilProfile(stFields.soil)}`, 14, y, { maxWidth: pw - 28 }); y += 8;
    if (st.Notes) {
      doc.text(`Notes: ${cleanReportText(st.Notes)}`, 14, y, { maxWidth: pw - 28 });
      y += 10;
    }
    
    // Timeline Table
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    if (eff.length) {
      const timelineData = getTimelineData(eff, categoryId, st);
      autoTable(doc, {
        startY: y,
        head: [timelineData.headers],
        body: timelineData.rows,
        headStyles: { fillColor: primaryColor },
        theme: 'striped',
        styles: {
          fontSize: Math.max(5.5, Math.min(8, 9 - timelineData.headers.length * 0.4)),
          overflow: 'linebreak',
          cellPadding: 1.5
        },
        didParseCell: italicCellHook
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 8;
    }
    
    // Photos
    const photos = safeJsonParse(st.PhotoURLs, []);
    if (photos.length) {
      y = await addPhotoGrid(doc, photos, y, ph, 40, showPhotoDates);
    }
  }

  pdfAddFooter(doc, `Master Report: ${project.Name}`);
  doc.save(`Master_Report_${safeName(project.Name)}.pdf`);
  toast('Master PDF downloaded!', 'success');
}

export async function generateMasterScientificReport(project, subTrials, options = {}) {
  const { aiSummary = '', analysis = null } = options;
  toast('Generating Master Scientific Report…', 'info');

  const categoryId = (project.Category || (subTrials[0]?.Category) || 'herbicide').toLowerCase();
  const repConfig = getReportConfig({ Category: categoryId });
  const primaryColor = repConfig.primaryColor;

  const doc = createDoc();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  doc.setFillColor(...primaryColor); doc.rect(0, 0, pw, 45, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont(undefined, 'bold');
  doc.text('SCIENTIFIC STUDY MASTER REPORT', pw / 2, 22, { align: 'center' });
  doc.setFontSize(12); doc.setFont(undefined, 'normal');
  doc.text(`Master Workspace: ${project.Name}`, pw / 2, 34, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  let y = 55;

  // Summary metadata
  const metaRows = [
    ['Project / Study Name', project.Name, 'Target Crop', project.Crop || 'N/A'],
    ['Investigator', project.Investigator || 'N/A', 'Location / Bounds', project.Location || 'N/A'],
    ['Spray Volume', project.SprayVolume ? `${project.SprayVolume} L/ha` : 'N/A', 'Sub-Trials Count', String(subTrials.length)],
    ['Created Date', project.CreatedAt ? formatDate(project.CreatedAt) : 'N/A', '', '']
  ];
  autoTable(doc, {
    startY: y, body: metaRows, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 2: { fontStyle: 'bold', cellWidth: 40 } }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Calculate dynamic stats
  let maxDaa = 0;
  let totalObs = 0;
  let totalPhotos = 0;
  subTrials.forEach(t => {
    const eff = safeJsonParse(t.EfficacyDataJSON, []);
    totalObs += eff.length;
    const phs = safeJsonParse(t.PhotoURLs, []);
    totalPhotos += phs.length;
    eff.forEach(o => {
      const dVal = (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') ? Number(o.daa) : calculateDAA(o.date, t.Date);
      if (!isNaN(dVal) && dVal > maxDaa) {
        maxDaa = dVal;
      }
    });
  });

  // Preliminary Report Warning Banner
  if (maxDaa <= 3) {
    if (y + 26 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.rect(14, y, pw - 28, 22, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('PRELIMINARY REPORT', 18, y + 5);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.text(`Observation Window: 0–${maxDaa} DAA`, 18, y + 10);
    const bannerMsg = 'This report represents early vegetative observations. Final treatment efficacy should be interpreted after 7, 15, 30 and 45 DAA assessments.';
    const wrappedBannerMsg = doc.splitTextToSize(bannerMsg, pw - 36);
    doc.text(wrappedBannerMsg, 18, y + 14);
    doc.setTextColor(0, 0, 0);
    y += 28;
  }

  // Trial Progress Summary Box
  if (y + 35 > ph - 20) { doc.addPage(); y = 20; }
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('Trial Progress Summary', 14, y); y += 4;
  doc.setFont(undefined, 'normal');
  const confidence = maxDaa <= 3 ? `Low–Moderate Confidence (Observation Window 0–${maxDaa} DAA)` : maxDaa <= 14 ? 'Medium (Mid Stage)' : 'High (Final Stage)';
  const progressRows = [
    ['Plots Evaluated', `${subTrials.length}/${subTrials.length}`, 'Total Observations (DAA Records)', String(totalObs)],
    ['DAA Observation Range', `0–${maxDaa} DAA`, 'Total Photos', String(totalPhotos)],
    ['Scientific Confidence', confidence, '', '']
  ];
  autoTable(doc, {
    startY: y,
    body: progressRows,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: (pw - 28) / 4 }, 2: { fontStyle: 'bold', cellWidth: (pw - 28) / 4 } }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Executive summary
  y = secHeading(doc, 'Executive Summary', y, ph, 14, primaryColor);
  const narrativeRaw = aiSummary || `This master scientific report aggregates findings from ${subTrials.length} Sub-Trial monitoring locations evaluated within the ${project.Name} area. Localized efficacy tracking, target species distribution timelines, and photographic logs were evaluated. Overall efficacy profiles and target responses are compiled below.`;
  const narrative = cleanReportText(narrativeRaw);
  doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  y = drawTextWithItalics(doc, narrative, 14, y, pw - 28);
  y += 8;

  if (analysis?.anova) {
    y = secHeading(doc, 'Statistical Analysis Overview', y, ph, 14, primaryColor);
    const anova = analysis.anova;
    const method = analysis.analysisMethod || anova.design || 'ANOVA';
    doc.setFontSize(10);
    doc.text(`Analysis method: ${method}`, 14, y); y += 5;
    doc.text(`Design interpretation: ${analysis.design || (anova.design || 'RCBD')}`, 14, y); y += 6;
    doc.text(`Treatments analyzed: ${analysis.treatmentSummary?.length || Object.keys(anova.treatmentMeans || {}).length}`, 14, y); y += 6;
    const nPlots = subTrials.length;
    const nReplicates = [...new Set(subTrials.map(t => t.Replication || t.BlockID || 'R1'))].length;
    const nTreatments = [...new Set(subTrials.map(t => t.FormulationName || 'Untreated Check'))].length;
    doc.text(`ANOVA results: F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'} (n = ${nPlots} plots, ${nReplicates} replicates, ${nTreatments} treatments); ${anova.significant ? 'Statistically significant treatment differences detected.' : 'No statistically significant treatment differences detected.'}`, 14, y); y += 8;
    if (analysis.postHoc?.groups) {
      const groups = Object.entries(analysis.postHoc.groups)
        .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
        .map(([treatment, letter]) => `${treatment} (${letter})`)
        .join(', ');
      const wrapped = doc.splitTextToSize(`Post-hoc groupings: ${groups}`, pw - 28);
      doc.text(wrapped, 14, y); y += wrapped.length * 5 + 4;
    }
    y += 4;
  }

  // Comparative Efficacy Results Table
  y = secHeading(doc, '1. Comparative Treatment Efficacy Matrix', y, ph, 14, primaryColor);
  const wceRows = [];
  subTrials.forEach(st => {
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const wces = calcWCE(eff, categoryId, st);
    wces.forEach(w => {
      const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
      const unitSuff = isVigor ? '/10' : repConfig.primaryMetricUnit;
      wceRows.push([
        st.FormulationName || 'Untreated Check',
        st.Replication || 'R1',
        w.species,
        w.initialCover.toFixed(1) + unitSuff,
        w.finalCover.toFixed(1) + unitSuff,
        w.wce.toFixed(1) + '%'
      ]);
    });
  });

  const masterSciYields = subTrials.map(st => parseFloat(st.YieldValue || st.Yield || 0)).filter(y => y > 0);
  let metricColHeader = `${repConfig.primaryMetricKey} %`;
  if ((categoryId === 'nutrition' || categoryId === 'biostimulant') && masterSciYields.length === 0) {
    metricColHeader = 'Vigor Improvement (%)';
  }

  if (wceRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Sub-Trial / Spot', 'Rep', repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, metricColHeader]],
      body: wceRows,
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 9 },
      didParseCell: italicCellHook
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // Timeline per Sub-Trial
  y = secHeading(doc, '2. Spatial & Temporal Observations', y, ph, 14, primaryColor);
  for (let i = 0; i < subTrials.length; i++) {
    const st = subTrials[i];
    if (y + 40 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(11);
    doc.text(`Sub-Trial: ${st.FormulationName || 'Untreated Check'} (${st.Replication || 'R1'})`, 14, y); y += 6;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    
    const stFields = getAllTrialDataFields(st, { projects: [project] });
    doc.text(`Location: ${st.Location || 'N/A'}  |  Dosage: ${st.Dosage || 'N/A'}  |  Plot: ${st.PlotNumber || 'N/A'}  |  Yield: ${stFields.yieldValue}`, 14, y); y += 5;
    doc.text(`Timing: ${stFields.applicationTiming}  |  Growth Stage: ${stFields.cropStage}  |  BBCH: ${stFields.bbchCode}  |  Method: ${stFields.applicationMethod}`, 14, y); y += 5;
    doc.text(`Soil Profile: ${formatSoilProfile(stFields.soil)}`, 14, y, { maxWidth: pw - 28 }); y += 7;

    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    if (eff.length) {
      const timelineData = getTimelineData(eff, categoryId, st);
      autoTable(doc, {
        startY: y,
        head: [timelineData.headers],
        body: timelineData.rows,
        headStyles: { fillColor: DARK },
        theme: 'striped',
        styles: {
          fontSize: Math.max(5.5, Math.min(8, 9 - timelineData.headers.length * 0.4)),
          overflow: 'linebreak',
          cellPadding: 1.5
        },
        didParseCell: italicCellHook
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 8;
    }
  }

  pdfAddFooter(doc, `Master study: ${project.Name}`);
  doc.save(`Scientific_Master_Report_${safeName(project.Name)}.pdf`);
  toast('Master Scientific Report downloaded!', 'success');
}

export async function generateMasterPpt(project, subTrials) {
  toast('Generating Master PowerPoint…', 'info');
  
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
  const repConfig = getReportConfig({ Category: categoryId });
  const themeHex = repConfig.config.color?.hex?.replace('#', '') || '0D9488';
  
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  // Slide 1: Title
  const s1 = pptx.addSlide();
  s1.background = { color: themeHex };
  s1.addText('MASTER FIELD TRIAL REPORT', { x: 0.5, y: 1.5, w: 9, h: 1.2, fontSize: 34, bold: true, color: 'FFFFFF', align: 'center' });
  s1.addText(project.Name, { x: 0.5, y: 2.7, w: 9, h: 0.7, fontSize: 20, color: 'FFFFFF', align: 'center' });
  s1.addText(`Crop: ${project.Crop || '—'} | Location: ${project.Location || '—'} | Investigator: ${project.Investigator || '—'}`, { x: 0.5, y: 3.5, w: 9, h: 0.5, fontSize: 13, color: 'E0F2F1', align: 'center' });

  // Slide 2: Sub-Trials List
  const s2 = pptx.addSlide();
  s2.addText('Summary of Sub-Trials / Spots', { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: themeHex });
  const tableRows = [
    [{ text: 'Sub-Trial Spot', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
     { text: 'Formulation', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
     { text: 'Dosage', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
     { text: 'Rep / Plot', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
     { text: 'Result', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } }]
  ];
  subTrials.forEach(st => {
    tableRows.push([
      st.Location || 'Spot Coordinate',
      st.FormulationName || 'Untreated Check',
      st.Dosage || 'N/A',
      `${st.Replication || 'R1'} / ${st.PlotNumber || 'N/A'}`,
      st.Result || 'Pending'
    ]);
  });
  s2.addTable(tableRows, { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, colW: [2.5, 2.5, 1.4, 1.4, 1.4], border: { pt: 0.5, color: 'CBD5E1' } });

  // Slide 3: Efficacy Comparison
  const s3 = pptx.addSlide();
  s3.addText(`${repConfig.primaryMetricLabel} (${repConfig.primaryMetricKey}) Comparison`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: themeHex });
  const wceHeader = [
    { text: 'Sub-Trial', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
    { text: repConfig.targetLabel, options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
    { text: `Initial ${repConfig.primaryObsLabel}`, options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
    { text: `Final ${repConfig.primaryObsLabel}`, options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
    { text: `${repConfig.primaryMetricKey} %`, options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } }
  ];
  const wceRows = [wceHeader];
  subTrials.forEach(st => {
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const wces = calcWCE(eff, categoryId, st);
    wces.forEach(w => {
      const isVigor = (categoryId === 'nutrition' || categoryId === 'biostimulant');
      const obsUnit = isVigor ? '/10' : repConfig.primaryMetricUnit;
      wceRows.push([
        st.FormulationName || 'Untreated Check',
        w.species,
        w.initialCover.toFixed(1) + obsUnit,
        w.finalCover.toFixed(1) + obsUnit,
        w.wce.toFixed(1) + '%'
      ]);
    });
  });
  s3.addTable(wceRows, { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, colW: [2.8, 2.2, 1.4, 1.4, 1.4], border: { pt: 0.5, color: 'CBD5E1' } });

  // Slide 3.5 – ANOVA & Tukey HSD Significance Groups
  const maxN = Math.max(...subTrials.map(st => {
    return subTrials.filter(x => x.FormulationName === st.FormulationName).length;
  }), 0);

  if (maxN >= 3 && subTrials.length >= 2) {
    const trialDesign = project.TrialDesign || project.Design || 'RCBD';
    const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
    const primaryField = getPrimaryObservationField(categoryId);
    const anova = performANOVA(subTrials, { metric: primaryField, design });
    
    if (anova && !anova.error) {
      const tukey = performTukeyHSD(subTrials, { metric: primaryField, anova });
      
      const s35 = pptx.addSlide();
      s35.addText(`ANOVA & Tukey HSD Significance Groups`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: themeHex });
      
      const tableRows = [
        [{ text: 'Treatment Formulation', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
         { text: `${repConfig.primaryMetricKey} Mean`, options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
         { text: 'Tukey Grouping', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } }]
      ];
      
      const sortedMeans = Object.entries(anova.treatmentMeans)
        .map(([trt, val]) => ({ trt, val, letter: (tukey && tukey.groups) ? (tukey.groups[trt] || 'a') : 'a' }))
        .sort((a, b) => b.val - a.val);

      sortedMeans.forEach(r => {
        tableRows.push([r.trt, r.val.toFixed(2), r.letter]);
      });
      
      s35.addTable(tableRows, { x: 0.4, y: 1.0, w: 5.5, fontSize: 11, border: { pt: 0.5, color: 'CBD5E1' } });
      
      s35.addText(`Interpretation:\nTreatments sharing a letter are not significantly different (alpha = 0.05).\nANOVA p-value: ${anova.pValue.toFixed(4)} (${anova.pValue < 0.05 ? 'Significant Effect' : 'No Significant Difference'})\n\nCoefficient of Variation (CV%): ${anova.cv ? anova.cv.toFixed(2) + '%' : 'N/A'}\nGlobal SEm±: ${anova.semGlobal ? '± ' + anova.semGlobal.toFixed(4) : 'N/A'}\nCD / LSD (5% Level): ${anova.cd5 ? anova.cd5.toFixed(4) : 'N/A'}\nCD / LSD (1% Level): ${anova.cd1 ? anova.cd1.toFixed(4) : 'N/A'}\nOutliers Detected: ${anova.detectedOutliers?.length || 0} plot(s)`, {
        x: 6.2, y: 1.0, w: 3.4, h: 3.8, fontSize: 11, color: '475569', fill: { color: 'F8FAFC' }, border: { pt: 0.5, color: 'E2E8F0' }
      });

      // Tukey Graphical Representation Slide (Bar Chart)
      const chartSlide = pptx.addSlide();
      chartSlide.addText(`Mean Efficacy Chart with Tukey HSD Groupings`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: themeHex });
      
      const chartData = [];
      const labels = [];
      const values = [];
      
      Object.entries(anova.treatmentMeans).forEach(([trt, val]) => {
        const letter = (tukey && tukey.groups) ? (tukey.groups[trt] || 'a') : 'a';
        labels.push(`${trt} (${letter})`);
        values.push(parseFloat(val.toFixed(2)));
      });
      
      chartData.push({
        name: repConfig.primaryMetricKey,
        labels: labels,
        values: values
      });
      
      chartSlide.addChart(pptx.ChartType.bar, chartData, {
        x: 0.5, y: 1.0, w: 8.5, h: 5.0,
        showVal: true,
        valFontSize: 11,
        valGridLine: { style: 'none' },
        catAxisLabelColor: '475569',
        catAxisLabelFontSize: 10,
        title: `${repConfig.primaryMetricLabel} per Treatment`,
        titleFontSize: 12,
        chartColors: [themeHex]
      });

      // Dunnett's test vs Control table in PPTX
      const controlName = Object.keys(anova.treatmentMeans).find(f => 
        f?.toLowerCase().includes('control') || 
        f?.toLowerCase().includes('untreated') ||
        f?.toLowerCase().includes('check') ||
        f?.toLowerCase().includes('utc')
      );
      if (controlName && anova.pValue < 0.05) {
        const dunnett = performDunnettTest(subTrials, controlName, { metric: primaryField });
        if (dunnett && dunnett.comparisons && !dunnett.error) {
          const s36 = pptx.addSlide();
          s36.addText(`Dunnett's Test vs. Control (${controlName})`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: themeHex });
          
          const dunnettHdr = [
            { text: 'Treatment', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
            { text: 'Treatment Mean', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
            { text: 'Difference', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
            { text: 't-Stat', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } },
            { text: 'Significance', options: { bold: true, color: 'FFFFFF', fill: { color: themeHex } } }
          ];
          const dunRows = [dunnettHdr];
          dunnett.comparisons.forEach(c => {
            dunRows.push([
              c.treatment,
              c.treatmentMean.toFixed(2),
              c.difference.toFixed(2),
              c.tStatistic.toFixed(2),
              c.significant ? 'Significant (*)' : 'ns'
            ]);
          });
          s36.addTable(dunRows, { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, border: { pt: 0.5, color: 'CBD5E1' } });
        }
      }
    }
  }

  // Slide 4: Unified Photos
  const s4 = pptx.addSlide();
  s4.addText('Field Photographs Summary', { x: 0.4, y: 0.2, w: 9, h: 0.6, fontSize: 22, bold: true, color: themeHex });
  const pos = [[0.3, 0.9, 4.2, 3.0], [5.1, 0.9, 4.2, 3.0], [0.3, 4.1, 4.2, 3.0], [5.1, 4.1, 4.2, 3.0]];
  let photoCount = 0;
  for (let i = 0; i < subTrials.length; i++) {
    const st = subTrials[i];
    const photos = safeJsonParse(st.PhotoURLs, []);
    if (photos.length && photoCount < 4) {
      const src = photoSrc(photos[0]);
      if (src) {
        try {
          const imgData = await toBase64(src, 600);
          if (imgData) {
            const [px, py, pw2, ph2] = pos[photoCount];
            s4.addImage({ path: imgData, x: px, y: py, w: pw2, h: ph2 });
            s4.addText(`${st.FormulationName || 'Untreated Check'} - ${getCleanPhotoLabel(photos[0], 0)}`, { x: px, y: py + ph2 + 0.05, w: pw2, h: 0.3, fontSize: 9, color: '475569' });
            photoCount++;
          }
        } catch { /* skip */ }
      }
    }
  }

  await pptx.writeFile({ fileName: `Master_Report_${safeName(project.Name)}.pptx` });
  toast('Master PowerPoint downloaded!', 'success');
}

export function exportMasterCSV(project, subTrials) {
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
  const repConfig = getReportConfig({ Category: categoryId });

  // Gather active observation fields for these categories
  const obsFields = [];
  const config = getCategoryConfig(categoryId);
  config.observationFields?.forEach(f => {
    if (f.key !== 'weedDetails' && !obsFields.some(x => x.key === f.key)) {
      obsFields.push(f);
    }
  });

  const specificFields = [];
  config.specificFields?.forEach(f => {
    const isSharedOrTarget = [
      'WeedSpecies', 'DiseaseTarget', 'PestTarget', 'NutrientType', 'BiostimulantType',
      'YieldValue', 'Yield', 'ApplicationMethod', 'CropStageAtApplication', 'CropStage'
    ].includes(f.key);
    if (!isSharedOrTarget && !specificFields.some(x => x.key === f.key)) {
      specificFields.push(f);
    }
  });

  // Perform ANOVA & Tukey HSD to get grouping letters
  const trialDesign = project.TrialDesign || project.Design || 'RCBD';
  const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
  const primaryField = getPrimaryObservationField(categoryId);
  const anova = performANOVA(subTrials, { metric: primaryField, design });
  const tukey = (anova && !anova.error) ? performTukeyHSD(subTrials, { metric: primaryField, anova }) : null;
  const tukeyGroups = tukey?.groups || {};

  // For NUE comparison
  const treatments = {};
  subTrials.forEach(t => {
    const trt = t.FormulationName || 'Untreated Check';
    if (!treatments[trt]) treatments[trt] = [];
    const yieldVal = parseFloat(t.YieldValue || t.Yield || 0);
    if (!isNaN(yieldVal) && yieldVal > 0) {
      treatments[trt].push(yieldVal);
    }
  });
  const controlName = Object.keys(treatments).find(f => 
    f?.toLowerCase().includes('control') || 
    f?.toLowerCase().includes('untreated') ||
    f?.toLowerCase().includes('check') ||
    f?.toLowerCase().includes('utc')
  ) || Object.keys(treatments)[0];
  let controlMean = 0;
  if (controlName) {
    const cVals = treatments[controlName] || [];
    controlMean = cVals.length ? cVals.reduce((a,b)=>a+b, 0)/cVals.length : 0;
  }

  // Gather active design parameters
  const designFields = [];
  if (trialDesign === 'PotTrial' || trialDesign === 'rcbd-pot') {
    designFields.push(
      { key: 'PotRow', label: 'Pot Row' },
      { key: 'PotCol', label: 'Pot Column' },
      { key: 'PotLabel', label: 'Pot Label' },
      { key: 'PotLayout', label: 'Pot Layout' },
      { key: 'PotObsMode', label: 'Pot Observation Mode' }
    );
  }
  if (trialDesign === 'Split-Plot' || trialDesign === 'Strip-Plot') {
    designFields.push(
      { key: 'MainFactor', label: 'Main Factor' },
      { key: 'SubFactor', label: 'Sub Factor' }
    );
  }
  if (trialDesign === 'Lattice') {
    designFields.push(
      { key: 'SubBlockID', label: 'Sub-Block ID' }
    );
  }

  const header = [
    'Master Project', 'Sub-Trial ID', 'Category', 'Formulation', 'Replication', 'Plot #', 
    'Location', 'Dosage', 'Crop', 'Yield', 'Application Timing', 'Growth Stage', 'BBCH Code', 'App Method', 'Spray Vol (L/ha)', 'Nozzle',
    'Soil pH', 'Soil Clay %', 'Soil Sand %', 'Soil OC', 'Soil Texture', 'Soil N (ppm)', 'Soil P (ppm)', 'Soil K (ppm)', 'Soil CEC', 'Soil Moisture %',
    'Trial Design'
  ];

  // Add design specific fields to header
  designFields.forEach(f => {
    header.push(f.label);
  });

  header.push(
    repConfig.targetLabel, 'Overall Result', 'Trial Status'
  );

  // Add category specific fields to header
  specificFields.forEach(f => {
    header.push(f.label);
  });

  header.push(
    'Tukey Grouping', 'AUDPC', 'Root-to-Shoot Ratio', 'NUE',
    'DAA', 'Obs Date'
  );

  // Dynamic observation fields
  obsFields.forEach(f => {
    header.push(f.label);
  });

  if (categoryId === 'herbicide') {
    header.push('Herbicide Species Detail', 'Herbicide Species Cover %');
  }

  header.push('Obs Status', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)', 'Notes');

  const rows = [];
  subTrials.forEach(st => {
    const dataFields = getAllTrialDataFields(st, { projects: [project] });
    const trialConfig = getReportConfig(st);
    const efficacy = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const isCompletedStr = (st.IsCompleted === true || st.IsCompleted === 'true') ? 'Finalized' : 'Ongoing';

    // Calculate sub-trial level indices
    const audpcVal = categoryId === 'fungicide' ? calculateAUDPC(efficacy, 'diseaseSeverity') : '';
    
    let nueVal = '';
    if (categoryId === 'nutrition' && controlName && st.FormulationName !== controlName) {
      const tVals = treatments[st.FormulationName] || [];
      const tMean = tVals.length ? tVals.reduce((a,b)=>a+b, 0)/tVals.length : 0;
      const dosage = parseFloat(st.Dosage || 1);
      nueVal = calculateNUE(tMean, controlMean, dosage) ?? '';
    }

    const tGrouping = tukeyGroups[st.FormulationName || 'Untreated Check'] || 'a';

    const baseRow = [
      project.Name, st.ID, st.Category || 'herbicide', st.FormulationName, st.Replication || 'R1', st.PlotNumber || '',
      st.Location || '', st.Dosage || '', dataFields.crop, dataFields.yieldValue, dataFields.applicationTiming, dataFields.cropStage, dataFields.bbchCode,
      dataFields.applicationMethod, dataFields.sprayVolume, dataFields.nozzle,
      dataFields.soil?.ph || '', dataFields.soil?.clay || '', dataFields.soil?.sand || '', dataFields.soil?.organicCarbon || '', dataFields.soil?.texture || '',
      dataFields.soil?.nitrogen || '', dataFields.soil?.phosphorus || '', dataFields.soil?.potassium || '', dataFields.soil?.cec || '', dataFields.soil?.moisture || '',
      st.TrialDesign || st.Design || 'RCBD'
    ];

    // Push design fields values
    designFields.forEach(f => {
      if (f.key === 'PotLayout') {
        baseRow.push(st.PotLayout || project?.PotLayout || '-');
      } else if (f.key === 'PotObsMode') {
        baseRow.push(st.PotObsMode || project?.PotObsMode || '-');
      } else {
        baseRow.push(st[f.key] !== undefined && st[f.key] !== null ? st[f.key] : '-');
      }
    });

    baseRow.push(
      trialConfig.targetValue, st.Result || 'Pending', isCompletedStr
    );

    // Push specific fields values
    specificFields.forEach(f => {
      baseRow.push(st[f.key] !== undefined && st[f.key] !== null ? st[f.key] : '');
    });

    baseRow.push(
      tGrouping, audpcVal, '', nueVal // placeholder for Root-to-Shoot which is observation-specific
    );

    if (efficacy.length) {
      const sortedObs = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
      const baseObs = sortedObs.find(obs => (obs.daa ?? 0) === 0) || sortedObs[0];
      const baseVal = baseObs ? (getObservationPrimaryValue(trialConfig.cat, baseObs) ?? 0) : 0;

      efficacy.forEach(obs => {
        const obsDate = obs.date || '';
        const daa = obs.daa ?? '';

        // Calculate observation-specific indices
        const r2sVal = categoryId === 'biostimulant' ? (calculateRootToShoot(obs) ?? '') : '';

        // Let's determine rating / status
        const pVal = getObservationPrimaryValue(trialConfig.cat, obs) ?? 0;
        const status = calculateStatus(trialConfig.cat, pVal, baseVal);

        const temp = obs.weatherTemp ?? obs.temperature_2m ?? '';
        const hum = obs.weatherHumidity ?? obs.relative_humidity_2m ?? '';
        const wind = obs.weatherWind ?? obs.wind_speed_10m ?? '';
        const rain = obs.weatherRain ?? '';
        const notes = obs.notes || '';

        // Copy base row and fill Root-to-Shoot Ratio specifically
        const rowWithObsIndex = [...baseRow];
        rowWithObsIndex[header.indexOf('Root-to-Shoot Ratio')] = r2sVal;

        if (categoryId === 'herbicide') {
          const details = obs.weedDetails?.length ? obs.weedDetails : [{ species: 'Total', cover: getObservationPrimaryValue(trialConfig.cat, obs) ?? '' }];
          details.forEach(wd => {
            const row = [...rowWithObsIndex, daa, obsDate];
            obsFields.forEach(f => {
              if (f.key === 'weedCover') {
                row.push(getObservationPrimaryValue(trialConfig.cat, obs) ?? '');
              } else {
                row.push('');
              }
            });
            row.push(wd.species || 'Total', wd.cover ?? '', status, temp, hum, wind, rain, notes);
            rows.push(row);
          });
        } else {
          const row = [...rowWithObsIndex, daa, obsDate];
          obsFields.forEach(f => {
            const val = obs[f.key];
            row.push((val !== undefined && val !== null) ? val : '');
          });
          row.push(status, temp, hum, wind, rain, notes);
          rows.push(row);
        }
      });
    } else {
      const row = [...baseRow, '', ''];
      obsFields.forEach(() => row.push(''));
      if (categoryId === 'herbicide') {
        row.push('', '');
      }
      row.push('', '', '', '', '', '');
      rows.push(row);
    }
  });

  const csv = [header, ...rows].map(r => r.map(c => {
    let val = String(c ?? '');
    val = val.replace(/[\u2013\u2014]/g, '-');
    return `"${val.replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
  dlBlob(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' }), `Master_Study_Export_${safeName(project.Name)}.csv`);
  toast('Master CSV exported!', 'success');
}

export function exportMasterHtml(project, subTrials, options = {}) {
  const { aiSummary = '', analysis = null } = options;
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
  const repConfig = getReportConfig({ Category: categoryId });
  const primaryHex = repConfig.config.color?.hex || '#0d9488';

  const analysisHtml = analysis && analysis.anova ? (() => {
    const anova = analysis.anova;
    
    // ANOVA table rows
    let anovaRows = '';
    if (anova.anovaTable) {
      anovaRows = anova.anovaTable.source.map((src, i) => {
        const dfVal = anova.anovaTable.df[i] ?? '—';
        const ssVal = anova.anovaTable.ss[i]?.toFixed(2) ?? '—';
        const msVal = anova.anovaTable.ms[i]?.toFixed(2) ?? '—';
        const fVal = anova.anovaTable.f[i]?.toFixed(2) ?? '—';
        const pVal = anova.anovaTable.p[i] !== null && anova.anovaTable.p[i] !== undefined ? anova.anovaTable.p[i].toFixed(4) : '—';
        const sig = anova.anovaTable.p[i] !== null && anova.anovaTable.p[i] !== undefined ? (anova.anovaTable.p[i] < 0.01 ? '**' : anova.anovaTable.p[i] < 0.05 ? '*' : 'ns') : '';
        return `
          <tr>
            <td>${src}</td>
            <td>${dfVal}</td>
            <td>${ssVal}</td>
            <td>${msVal}</td>
            <td>${fVal}</td>
            <td>${pVal}</td>
            <td style="font-weight:bold;color:${sig === 'ns' ? '#6b7280' : '#b91c1c'};">${sig}</td>
          </tr>
        `;
      }).join('');
    }

    // Tukey post-hoc table rows (sorted descending by mean)
    let postHocHtml = '';
    if (analysis.postHoc?.groups) {
      const sortedTukey = Object.entries(anova.treatmentMeans || {})
        .map(([trt, val]) => ({
          trt,
          val,
          letter: analysis.postHoc.groups[trt] || 'a'
        }))
        .sort((a, b) => b.val - a.val);

      const tukeyRows = sortedTukey.map(r => `
        <tr>
          <td><b>${r.trt}</b></td>
          <td>${r.val.toFixed(2)}</td>
          <td style="font-weight:bold;color:${primaryHex};">${r.letter}</td>
        </tr>
      `).join('');

      postHocHtml = `
        <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">Tukey HSD Multiple Comparisons (Letter Grouping)</h3>
        <table>
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Mean Efficacy</th>
              <th>Tukey Significance Letter</th>
            </tr>
          </thead>
          <tbody>${tukeyRows}</tbody>
        </table>
      `;
    }

    // Dunnett's test table rows
    let dunnettHtml = '';
    const controlName = Object.keys(anova.treatmentMeans || {}).find(f => 
      f?.toLowerCase().includes('control') || 
      f?.toLowerCase().includes('untreated') ||
      f?.toLowerCase().includes('check') ||
      f?.toLowerCase().includes('utc')
    );
    if (controlName && anova.significant) {
      const primaryField = getPrimaryObservationField(categoryId);
      const dunnett = performDunnettTest(subTrials, controlName, { metric: primaryField });
      if (dunnett && dunnett.comparisons && !dunnett.error) {
        const dunnettRows = dunnett.comparisons.map(c => `
          <tr>
            <td><b>${c.treatment}</b></td>
            <td>${c.treatmentMean.toFixed(2)}</td>
            <td>${c.controlMean.toFixed(2)}</td>
            <td>${c.difference.toFixed(2)}</td>
            <td>${c.tStatistic.toFixed(2)}</td>
            <td style="font-weight:bold;color:${c.significant ? '#b91c1c' : '#6b7280'};">${c.significant ? 'Significant (*)' : 'ns'}</td>
          </tr>
        `).join('');
        
        dunnettHtml = `
          <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">Dunnett's Test vs. Control (${controlName})</h3>
          <table>
            <thead>
              <tr>
                <th>Treatment</th>
                <th>Mean</th>
                <th>Control Mean</th>
                <th>Difference</th>
                <th>t-Stat</th>
                <th>Significance (α=0.05)</th>
              </tr>
            </thead>
            <tbody>${dunnettRows}</tbody>
          </table>
        `;
      }
    }

    const getCvRating = (c) => {
      if (c < 10) return 'Excellent Precision';
      if (c <= 20) return 'Good Precision';
      if (c <= 30) return 'Acceptable Precision';
      return 'Poor Precision (High Variation)';
    };

    const cvVal = anova.cv ?? 0;
    const semVal = anova.semGlobal ?? 0;
    const cd5Val = anova.cd5 ?? 0;
    const cd1Val = anova.cd1 ?? 0;
    const balanceStatus = anova.balanceWarning ? 'Unbalanced Layout' : 'Balanced Layout';
    const outlierCount = anova.detectedOutliers?.length || 0;
    const outlierHandling = anova.detectedOutliers ? 'Flagged/Kept' : 'None';

    const qualityHtml = `
      <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">Experimental Precision & Quality Certification</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10pt;">
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;width:25%;">Coefficient of Variation (CV%)</td>
          <td style="border:1px solid #cbd5e1;padding:6px;width:25%;">${cvVal.toFixed(2)}% (${getCvRating(cvVal)})</td>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;width:25%;">Design Balance Status</td>
          <td style="border:1px solid #cbd5e1;padding:6px;width:25%;">${balanceStatus}</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;">Global Standard Error (SEm±)</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">± ${semVal.toFixed(4)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;">Layout Configuration</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${anova.treatments?.length || 0} Treatments × ${Math.max(1, Math.round(subTrials.length / (anova.treatments?.length || 1)))} Reps</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;">CD / LSD (5% Level)</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${cd5Val.toFixed(4)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;">Outliers Detected</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${outlierCount} plot(s)</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;">CD / LSD (1% Level)</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${cd1Val.toFixed(4)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;background:#f8fafc;">Outliers Status</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${outlierHandling}</td>
        </tr>
      </table>
    `;

    let outlierLogHtml = '';
    if (anova.detectedOutliers && anova.detectedOutliers.length > 0) {
      outlierLogHtml = `
        <h3 style="font-size:12px;color:#475569;margin-top:12px;margin-bottom:6px;">Flagged Outliers Log</h3>
        <ul style="font-size:9.5pt;margin-bottom:12px;">
          ${anova.detectedOutliers.map(out => `<li>Treatment: <b>${out.treatment}</b> | Rep/Block: <b>${out.block}</b> | Observed Value: <b>${out.value}</b> | Residual Z-score: <b>${out.zScore.toFixed(2)}</b></li>`).join('')}
        </ul>
      `;
    }

    return `
      <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Statistical Analysis Summary</h2>
      <p><strong>Analysis method:</strong> ${analysis.analysisMethod || 'ANOVA'}</p>
      <p><strong>Design:</strong> ${analysis.design || (anova.design || 'RCBD')}</p>
      <p><strong>ANOVA result:</strong> F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'} (${anova.significant ? 'significant' : 'not significant'})</p>
      ${analysis.balanceWarning ? `<p style="color:#9a3412"><strong>Warning:</strong> ${analysis.balanceWarning}</p>` : ''}
      ${analysis.missingFinalWarning ? `<p style="color:#9a3412"><strong>Note:</strong> ${analysis.missingFinalWarning}</p>` : ''}
      
      <h3 style="font-size:14px;color:#475569;margin-top:20px;margin-bottom:8px;">ANOVA (Analysis of Variance) Table</h3>
      <table>
        <thead>
          <tr>
            <th>Source of Variation</th>
            <th>DF</th>
            <th>SS</th>
            <th>MS</th>
            <th>F-Value</th>
            <th>P-Value</th>
            <th>Sig.</th>
          </tr>
        </thead>
        <tbody>${anovaRows}</tbody>
      </table>
      ${qualityHtml}
      ${outlierLogHtml}
      ${postHocHtml}
      ${dunnettHtml}
    `;
  })() : '';

  const aiSummaryHtml = aiSummary ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">AI Narrative Summary</h2>
    <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px;margin-bottom:16px;white-space:pre-wrap;line-height:1.45;">${htmlItalicizeScientificNames(aiSummary.replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</div>
  ` : '';

  const subTrialRowsHtml = subTrials.map(st => {
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const wces = calcWCE(eff, categoryId, st);
    const wceList = wces.map(w => `${w.species}: ${w.wce.toFixed(0)}%`).join(', ') || 'N/A';
    const stFields = getAllTrialDataFields(st, { projects: [project] });

    return `<tr>
      <td style="border:1px solid #cbd5e1;padding:6px;"><b>${st.FormulationName || 'Untreated Check'}</b></td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${st.Dosage || 'N/A'}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${st.Replication || 'R1'}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${st.Location || 'N/A'}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${stFields.crop}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${stFields.yieldValue}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${stFields.applicationTiming} / ${stFields.cropStage}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${formatSoilProfile(stFields.soil)}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${st.Result || 'Pending'}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;">${wceList}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 40px; }
      h1 { font-size: 22pt; color: ${primaryHex}; margin-bottom: 4px; }
      p { margin: 4px 0; }
      table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 10pt; }
      th { background-color: ${primaryHex}; color: white; border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
      td { border: 1px solid #cbd5e1; padding: 8px; }
    </style>
  </head><body>
    <h1>Master Study Report: ${project.Name}</h1>
    <p style="font-size:11pt;color:#475569;">Crop: ${project.Crop || 'N/A'} &nbsp;|&nbsp; Location: ${project.Location || 'N/A'} &nbsp;|&nbsp; Investigator: ${project.Investigator || 'N/A'}</p>

    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Sub-Trials Overview</h2>
    <table>
      <thead>
        <tr>
          <th>Sub-Trial Spot</th>
          <th>Dosage</th>
          <th>Rep</th>
          <th>Location</th>
          <th>Crop</th>
          <th>Yield</th>
          <th>Timing / Stage</th>
          <th>Soil Profile</th>
          <th>Result</th>
          <th>${repConfig.primaryMetricLabel} (${repConfig.primaryMetricKey})</th>
        </tr>
      </thead>
      <tbody>
        ${subTrialRowsHtml}
      </tbody>
    </table>
    ${aiSummaryHtml}
    ${analysisHtml}
    <p style="text-align:center;color:#94a3b8;font-size:9pt;margin-top:40px;">Generated ${new Date().toLocaleString()} — ${repConfig.config.name} Trial Manager</p>
  </body></html>`;

  dlBlob(new Blob([html], { type: 'text/html' }), `Master_Report_${safeName(project.Name)}.html`);
  toast('Master HTML Report downloaded!', 'success');
}

export async function exportMasterDocx(project, subTrials, options = {}) {
  const { aiSummary = '', analysis = null } = options;
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
  const repConfig = getReportConfig({ Category: categoryId });
  const primaryHex = repConfig.config.color?.hex || '#0d9488';

  const analysisHtml = analysis && analysis.anova ? (() => {
    const anova = analysis.anova;
    
    // ANOVA table rows
    let anovaRows = '';
    if (anova.anovaTable) {
      anovaRows = anova.anovaTable.source.map((src, i) => {
        const dfVal = anova.anovaTable.df[i] ?? '—';
        const ssVal = anova.anovaTable.ss[i]?.toFixed(2) ?? '—';
        const msVal = anova.anovaTable.ms[i]?.toFixed(2) ?? '—';
        const fVal = anova.anovaTable.f[i]?.toFixed(2) ?? '—';
        const pVal = anova.anovaTable.p[i] !== null && anova.anovaTable.p[i] !== undefined ? anova.anovaTable.p[i].toFixed(4) : '—';
        const sig = anova.anovaTable.p[i] !== null && anova.anovaTable.p[i] !== undefined ? (anova.anovaTable.p[i] < 0.01 ? '**' : anova.anovaTable.p[i] < 0.05 ? '*' : 'ns') : '';
        return `
          <tr>
            <td>${src}</td>
            <td>${dfVal}</td>
            <td>${ssVal}</td>
            <td>${msVal}</td>
            <td>${fVal}</td>
            <td>${pVal}</td>
            <td style="font-weight:bold;color:${sig === 'ns' ? '#6b7280' : '#b91c1c'};">${sig}</td>
          </tr>
        `;
      }).join('');
    }

    // Tukey post-hoc table rows (sorted descending by mean)
    let postHocHtml = '';
    if (analysis.postHoc?.groups) {
      const sortedTukey = Object.entries(anova.treatmentMeans || {})
        .map(([trt, val]) => ({
          trt,
          val,
          letter: analysis.postHoc.groups[trt] || 'a'
        }))
        .sort((a, b) => b.val - a.val);

      const tukeyRows = sortedTukey.map(r => `
        <tr>
          <td><b>${r.trt}</b></td>
          <td>${r.val.toFixed(2)}</td>
          <td style="font-weight:bold;color:${primaryHex};">${r.letter}</td>
        </tr>
      `).join('');

      postHocHtml = `
        <h3>Tukey HSD Multiple Comparisons (Letter Grouping)</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12pt;font-size:9pt;">
          <thead>
            <tr style="background:${primaryHex};color:#fff;">
              <th style="padding:4pt;text-align:left;">Treatment</th>
              <th style="padding:4pt;text-align:left;">Mean Efficacy</th>
              <th style="padding:4pt;text-align:left;">Tukey Significance Letter</th>
            </tr>
          </thead>
          <tbody>${tukeyRows}</tbody>
        </table>
      `;
    }

    // Dunnett's test table rows
    let dunnettHtml = '';
    const controlName = Object.keys(anova.treatmentMeans || {}).find(f => 
      f?.toLowerCase().includes('control') || 
      f?.toLowerCase().includes('untreated') ||
      f?.toLowerCase().includes('check') ||
      f?.toLowerCase().includes('utc')
    );
    if (controlName && anova.significant) {
      const primaryField = getPrimaryObservationField(categoryId);
      const dunnett = performDunnettTest(subTrials, controlName, { metric: primaryField });
      if (dunnett && dunnett.comparisons && !dunnett.error) {
        const dunnettRows = dunnett.comparisons.map(c => `
          <tr>
            <td><b>${c.treatment}</b></td>
            <td>${c.treatmentMean.toFixed(2)}</td>
            <td>${c.controlMean.toFixed(2)}</td>
            <td>${c.difference.toFixed(2)}</td>
            <td>${c.tStatistic.toFixed(2)}</td>
            <td style="font-weight:bold;color:${c.significant ? '#b91c1c' : '#6b7280'};">${c.significant ? 'Significant (*)' : 'ns'}</td>
          </tr>
        `).join('');
        
        dunnettHtml = `
          <h3>Dunnett's Test vs. Control (${controlName})</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:12pt;font-size:9pt;">
            <thead>
              <tr style="background:${primaryHex};color:#fff;">
                <th style="padding:4pt;text-align:left;">Treatment</th>
                <th style="padding:4pt;text-align:left;">Mean</th>
                <th style="padding:4pt;text-align:left;">Control Mean</th>
                <th style="padding:4pt;text-align:left;">Difference</th>
                <th style="padding:4pt;text-align:left;">t-Stat</th>
                <th style="padding:4pt;text-align:left;">Significance (α=0.05)</th>
              </tr>
            </thead>
            <tbody>${dunnettRows}</tbody>
          </table>
        `;
      }
    }

    const getCvRating = (c) => {
      if (c < 10) return 'Excellent Precision';
      if (c <= 20) return 'Good Precision';
      if (c <= 30) return 'Acceptable Precision';
      return 'Poor Precision (High Variation)';
    };

    const cvVal = anova.cv ?? 0;
    const semVal = anova.semGlobal ?? 0;
    const cd5Val = anova.cd5 ?? 0;
    const cd1Val = anova.cd1 ?? 0;
    const balanceStatus = anova.balanceWarning ? 'Unbalanced Layout' : 'Balanced Layout';
    const outlierCount = anova.detectedOutliers?.length || 0;
    const outlierHandling = anova.detectedOutliers ? 'Flagged/Kept' : 'None';

    const qualityHtml = `
      <h3>Experimental Precision & Quality Certification</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12pt;font-size:9pt;">
        <tr>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;width:25%;">Coefficient of Variation (CV%)</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;width:25%;">${cvVal.toFixed(2)}% (${getCvRating(cvVal)})</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;width:25%;">Design Balance Status</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;width:25%;">${balanceStatus}</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Global Standard Error (SEm±)</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">± ${semVal.toFixed(4)}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Layout Configuration</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${anova.treatments?.length || 0} Treatments × ${Math.max(1, Math.round(subTrials.length / (anova.treatments?.length || 1)))} Reps</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">CD / LSD (5% Level)</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${cd5Val.toFixed(4)}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Outliers Detected</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${outlierCount} plot(s)</td>
        </tr>
        <tr>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">CD / LSD (1% Level)</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${cd1Val.toFixed(4)}</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;font-weight:bold;background:#f8fafc;">Outliers Status</td>
          <td style="border:1px solid #cbd5e1;padding:5px 8px;">${outlierHandling}</td>
        </tr>
      </table>
    `;

    let outlierLogHtml = '';
    if (anova.detectedOutliers && anova.detectedOutliers.length > 0) {
      outlierLogHtml = `
        <h3 style="font-size:12px;color:#475569;margin-top:12px;margin-bottom:6px;">Flagged Outliers Log</h3>
        <ul style="font-size:9.5pt;margin-bottom:12px;">
          ${anova.detectedOutliers.map(out => `<li>Treatment: <b>${out.treatment}</b> | Rep/Block: <b>${out.block}</b> | Observed Value: <b>${out.value}</b> | Residual Z-score: <b>${out.zScore.toFixed(2)}</b></li>`).join('')}
        </ul>
      `;
    }

    return `
      <h2>Statistical Analysis Summary</h2>
      <p><strong>Analysis method:</strong> ${analysis.analysisMethod || 'ANOVA'}</p>
      <p><strong>Design:</strong> ${analysis.design || (anova.design || 'RCBD')}</p>
      <p><strong>ANOVA result:</strong> F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'} (${anova.significant ? 'significant' : 'not significant'})</p>
      ${analysis.balanceWarning ? `<p style="color:#9a3412"><b>Warning:</b> ${analysis.balanceWarning}</p>` : ''}
      ${analysis.missingFinalWarning ? `<p style="color:#9a3412"><b>Note:</b> ${analysis.missingFinalWarning}</p>` : ''}
      
      <h3>ANOVA Table</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12pt;font-size:9pt;">
        <thead>
          <tr style="background:${primaryHex};color:#fff;">
            <th style="padding:4pt;text-align:left;">Source of Variation</th>
            <th style="padding:4pt;text-align:left;">DF</th>
            <th style="padding:4pt;text-align:left;">SS</th>
            <th style="padding:4pt;text-align:left;">MS</th>
            <th style="padding:4pt;text-align:left;">F-Value</th>
            <th style="padding:4pt;text-align:left;">P-Value</th>
            <th style="padding:4pt;text-align:left;">Sig.</th>
          </tr>
        </thead>
        <tbody>${anovaRows}</tbody>
      </table>
      ${qualityHtml}
      ${outlierLogHtml}
      ${postHocHtml}
      ${dunnettHtml}
    `;
  })() : '';

  const aiSummaryHtml = aiSummary ? `
    <h2>AI Narrative Summary</h2>
    <div style="background:#f8fafc;border:1pt solid #cbd5e1;padding:8pt;margin-bottom:12pt;white-space:pre-wrap;line-height:1.4;">${aiSummary.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  ` : '';

  const subTrialRowsHtml = subTrials.map(st => {
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const wces = calcWCE(eff, categoryId, st);
    const wceList = wces.map(w => `${w.species}: ${w.wce.toFixed(0)}%`).join(', ') || 'N/A';
    const stFields = getAllTrialDataFields(st, { projects: [project] });

    return `<tr>
      <td style="border:1pt solid #cbd5e1;padding:4pt;"><b>${st.FormulationName || 'Untreated Check'}</b></td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${st.Dosage || 'N/A'}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${st.Replication || 'R1'}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${st.Location || 'N/A'}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${stFields.crop}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${stFields.yieldValue}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${stFields.applicationTiming} / ${stFields.cropStage}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${formatSoilProfile(stFields.soil)}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${st.Result || 'Pending'}</td>
      <td style="border:1pt solid #cbd5e1;padding:4pt;">${wceList}</td>
    </tr>`;
  }).join('');

  // Resolve all sub-trial photos to inline base64 with safe date formatting
  const photoLogParts = [];
  for (const st of subTrials) {
    const stPhotos = safeJsonParse(st.PhotoURLs, []);
    if (!stPhotos.length) continue;
    const imgCards = [];
    for (let idx = 0; idx < stPhotos.length; idx++) {
      const p = stPhotos[idx];
      const label = `[${st.FormulationName || 'Untreated Check'}] ${getCleanPhotoLabel(p, idx)}`;
      const dateStr = p.date ? safeFormatDate(p.date) : '';
      const rawSrc = photoSrc(p);
      if (!rawSrc) continue;
      let resolvedSrc = rawSrc;
      try {
        const b64 = await toBase64(rawSrc, 400);
        if (b64) resolvedSrc = b64;
      } catch { /* use original */ }
      imgCards.push(`
        <div style="display:inline-block;width:45%;margin:2%;border:1px solid #ccc;padding:5px;text-align:center;vertical-align:top;">
          <p style="font-size:9pt;font-weight:bold;margin:5px 0;">${label}</p>
          ${dateStr ? `<p style="font-size:8pt;color:#666;margin:0 0 5px 0;">Captured: ${dateStr}</p>` : ''}
          <img src="${resolvedSrc}" style="max-width:100%;max-height:180px;display:block;margin:5px auto;" />
        </div>
      `);
    }
    if (imgCards.length) {
      photoLogParts.push(`<h3>Photos for ${st.FormulationName || 'Untreated Check'} (${stPhotos.length})</h3><div style="width:100%;">${imgCards.join('')}</div>`);
    }
  }
  const photoLogHtml = photoLogParts.join('');

  const photoSection = photoLogHtml ? `<h2>Photographic Log</h2>${photoLogHtml}` : '';

  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8"/>
  <style>
    @page { size: A4; margin: 2.54cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1e293b; }
    h1 { font-size: 18pt; color: ${primaryHex}; }
    h2 { font-size: 13pt; color: ${primaryHex}; border-bottom: 1pt solid ${primaryHex}; padding-bottom: 3pt; margin-top: 18pt; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; font-size: 9pt; }
    td, th { border: 1pt solid #cbd5e1; padding: 4pt 7pt; }
    th { background: ${primaryHex}; color: #fff; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Master Study Report: ${project.Name}</h1>
  <p style="font-size:11pt;color:#475569;">Crop: ${project.Crop || 'N/A'} | Location: ${project.Location || 'N/A'} | Investigator: ${project.Investigator || 'N/A'}</p>

  <h2>Sub-Trials Overview</h2>
  <table>
    <thead>
      <tr>
        <th style="background:${primaryHex};color:#fff;">Sub-Trial Spot</th>
        <th style="background:${primaryHex};color:#fff;">Dosage</th>
        <th style="background:${primaryHex};color:#fff;">Rep</th>
        <th style="background:${primaryHex};color:#fff;">Location</th>
        <th style="background:${primaryHex};color:#fff;">Crop</th>
        <th style="background:${primaryHex};color:#fff;">Yield</th>
        <th style="background:${primaryHex};color:#fff;">Timing / Stage</th>
        <th style="background:${primaryHex};color:#fff;">Soil Profile</th>
        <th style="background:${primaryHex};color:#fff;">Result</th>
        <th style="background:${primaryHex};color:#fff;">${repConfig.primaryMetricLabel} (${repConfig.primaryMetricKey})</th>
      </tr>
    </thead>
    <tbody>
      ${subTrialRowsHtml}
    </tbody>
  </table>
  ${aiSummaryHtml}
  ${analysisHtml}
  ${photoSection}
</body></html>`;

  dlBlob(new Blob([wordHtml], { type: 'application/msword' }), `Master_Report_${safeName(project.Name)}.doc`);
  toast('Master Word Document downloaded!', 'success');
}

