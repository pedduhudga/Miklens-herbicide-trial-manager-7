/**
 * trialReports.js — Full-fidelity port of all export/report functions.
 * Matches exact PDF structure, colors, fonts, table layouts from legacy HTML app.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import pptxgen from 'pptxgenjs';
import { formatPhotoDate, formatDate, formatDateTime } from '../utils/dateUtils.js';
import { getCategoryConfig, calculateEfficacy, getPrimaryObservationField, getObservationPrimaryValue } from '../utils/categoryConfig.js';
import { performANOVA, performTukeyHSD, performTwoWayANOVA } from '../utils/statsUtils.js';


// ── COLORS ────────────────────────────────────────────────────────────────────
const TEAL    = [13, 148, 136];
const DARK    = [44, 62, 80];
const AMBER50 = [255, 251, 235];

// ── REPORT CONFIG UTILS ───────────────────────────────────────────────────────
function getReportConfig(trial) {
  const cat = trial?.Category || 'herbicide';
  const config = getCategoryConfig(cat);
  
  // Custom colors for reports based on category configuration
  let primaryColor = TEAL;
  if (cat === 'fungicide') primaryColor = [79, 70, 229]; // Indigo
  else if (cat === 'pesticide') primaryColor = [220, 38, 38]; // Red
  else if (cat === 'nutrition') primaryColor = [217, 119, 6]; // Amber/Orange
  else if (cat === 'biostimulant') primaryColor = [13, 148, 136]; // Teal
  
  const targetLabel = config.targetLabel || 'Weed Species';
  const targetValue = trial ? (trial[config.targetField] || trial.WeedSpecies || 'N/A') : 'N/A';
  const primaryMetricLabel = config.primaryMetric?.label || 'Weed Control Efficiency';
  const primaryMetricKey = config.primaryMetric?.key || 'WCE';
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
  };
}

function calculateStatus(categoryId, pVal, baseVal = 0) {
  const isPositive = (categoryId === 'nutrition' || categoryId === 'biostimulant');
  if (isPositive) {
    return pVal >= 80 ? 'Excellent' : pVal >= 60 ? 'Good' : pVal >= 40 ? 'Fair' : 'Poor';
  } else if (categoryId === 'pesticide') {
    const pctReduction = (baseVal > 0) ? ((baseVal - pVal) / baseVal) * 100 : 0;
    return pctReduction >= 90 ? 'Excellent' : pctReduction >= 70 ? 'Good' : pctReduction >= 40 ? 'Fair' : 'Poor';
  } else {
    return pVal <= 10 ? 'Excellent' : pVal <= 30 ? 'Good' : pVal <= 60 ? 'Fair' : 'Poor';
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
  
  const data = {
    crop: trial.Crop || proj?.Crop || '—',
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

  // Find all observation fields that have at least one non-empty value in efficacy list
  // excluding primaryField and 'weedDetails' which are handled specially
  const activeFields = [];
  if (categoryId !== 'herbicide') {
    config.observationFields?.forEach(f => {
      if (f.key !== primaryField && f.key !== 'weedDetails') {
        const hasVal = efficacy.some(o => o[f.key] !== undefined && o[f.key] !== null && o[f.key] !== '');
        if (hasVal) {
          activeFields.push(f);
        }
      }
    });
  }

  // Build headers
  const headers = ['DAA', categoryId === 'herbicide' ? 'Weed Species' : config.targetLabel];
  
  // Add primary metric column
  headers.push(`${config.primaryMetric?.label || 'Efficacy'} (${config.primaryMetric?.unit || '%'})`);
  
  // Add secondary observation fields as actual columns!
  activeFields.forEach(f => {
    headers.push(f.label);
  });
  
  headers.push('Status');
  
  // Add weather columns if any row has weather data!
  const hasWeather = efficacy.some(o => o.weatherTemp || o.relative_humidity_2m || o.weatherHumidity || o.weatherWind || o.weatherRain);
  if (hasWeather) {
    headers.push('Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)');
  }
  
  headers.push('Notes');

  // Build rows
  const rows = efficacy.map(o => {
    const row = [];
    // 1. DAA
    row.push(String(o.daa ?? '—'));
    
    // 2. Weed Species / Target value
    if (categoryId === 'herbicide') {
      const species = (o.weedDetails || []).map(w => w.species).filter(Boolean).join(', ') || 'Total';
      row.push(species);
    } else {
      row.push(targetValue);
    }
    
    // 3. Primary Metric Value
    const pVal = getObservationPrimaryValue(categoryId, o) ?? 0;
    row.push(`${pVal}${config.primaryMetric?.unit || ''}`);
    
    // 4. Secondary fields
    activeFields.forEach(f => {
      const val = o[f.key];
      row.push((val !== undefined && val !== null && val !== '') ? String(val) : '—');
    });
    
    // 5. Status
    const sortedObs = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseObs = sortedObs.find(obs => (obs.daa ?? 0) === 0) || sortedObs[0];
    const baseVal = baseObs ? (getObservationPrimaryValue(categoryId, baseObs) ?? 0) : 0;
    const status = calculateStatus(categoryId, pVal, baseVal);
    row.push(status);
    
    // 6. Weather columns
    if (hasWeather) {
      const temp = o.weatherTemp ?? o.temperature_2m ?? '—';
      const hum = o.weatherHumidity ?? o.relative_humidity_2m ?? '—';
      const wind = o.weatherWind ?? o.wind_speed_10m ?? '—';
      const rain = o.weatherRain ?? '—';
      row.push(String(temp), String(hum), String(wind), String(rain));
    }
    
    // 7. Notes
    row.push(o.notes || '—');
    
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
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
function validateEfficacy(data, categoryId = null) {
  if (!Array.isArray(data)) return [];
  if (categoryId) {
    const primaryField = getPrimaryObservationField(categoryId);
    return data.filter(o => o && (o.daa !== undefined || o[primaryField] !== undefined || o.weedCover !== undefined));
  }
  return data.filter(o => o && (
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
  const metricUnit = config.primaryMetric?.unit || '%';
  const isPositiveMetric = (categoryId === 'nutrition' || categoryId === 'biostimulant');

  const dataFields = getAllTrialDataFields(trial);
  const cropStr = dataFields.crop && dataFields.crop !== '—' ? ` on ${dataFields.crop}` : '';
  const yieldStr = dataFields.yieldValue && dataFields.yieldValue !== '—' ? `, resulting in an ultimate yield of ${dataFields.yieldValue}` : '';

  const s = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
  if (s.length < 2) return (trial.Conclusion || 'Insufficient observations for trajectory analysis.') + yieldStr;
  
  const first = Number(getObservationPrimaryValue(categoryId, s[0]) ?? 0);
  const last  = Number(getObservationPrimaryValue(categoryId, s[s.length - 1]) ?? 0);
  const valList = s.map(o => Number(getObservationPrimaryValue(categoryId, o) ?? 0));
  
  if (isPositiveMetric) {
    const max = Math.max(...valList);
    const maxD = s.find(o => Number(getObservationPrimaryValue(categoryId, o) ?? 0) === max)?.daa ?? 0;
    const dur = (s[s.length - 1].daa ?? 0) - (s[0].daa ?? 0);
    return `Aggregate growth/metric measured ${first}${metricUnit} at baseline to a maximum of ${max}${metricUnit} at DAA ${maxD}, and measured ${last}${metricUnit} at DAA ${s[s.length - 1].daa ?? 0}${cropStr}${yieldStr}. The ${dur}-day observation window indicates ${last >= max - 5 ? 'sustained enhancement' : 'early growth stimulus with stabilization'} following application.`;
  } else {
    const min = Math.min(...valList.length ? valList : [100]);
    const minD = s.find(o => Number(getObservationPrimaryValue(categoryId, o) ?? 100) === min)?.daa ?? 0;
    const dur = (s[s.length - 1].daa ?? 0) - (s[0].daa ?? 0);
    let noun = 'disease/pest severity';
    if (categoryId === 'herbicide') noun = 'weed cover';
    else if (categoryId === 'fungicide') noun = 'disease severity';
    else if (categoryId === 'pesticide') noun = 'pest population';
    return `Aggregate ${noun} declined from ${first}${metricUnit} at baseline to a minimum of ${min}${metricUnit} at DAA ${minD}, and measured ${last}${metricUnit} at DAA ${s[s.length - 1].daa ?? 0}${cropStr}${yieldStr}. The ${dur}-day observation window indicates ${last <= min + 5 ? 'sustained suppression' : 'early knockdown with partial recovery'} following application.`;
  }
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

  const sortedObs = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
  const baseObs = sortedObs.find(obs => (obs.daa ?? 0) === 0) || sortedObs[0];
  const baseVal = baseObs ? (getObservationPrimaryValue(categoryId, baseObs) ?? 0) : 0;

  return efficacy.map(o => {
    if (categoryId === 'herbicide') {
      const c = getObservationPrimaryValue(categoryId, o) ?? 0;
      const status = calculateStatus(categoryId, c, baseVal);
      const species = (o.weedDetails || []).map(w => w.species).filter(Boolean).join(', ') || 'Total';
      return [String(o.daa ?? '—'), species, `${c}%`, status, o.notes || '—'];
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

      return [String(o.daa ?? '—'), targetValue, `${val}${config.primaryMetric?.unit || ''}`, status, `${o.notes || '—'}${detailsStr}`];
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
async function addPhotoGrid(doc, photos, y, ph, maxSize = 50, showDates = true) {
  const pw = doc.internal.pageSize.getWidth();
  let xOff = 14;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]; const src = photoSrc(p); if (!src) continue;
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
      const label = p.label || (p.date ? `Photo: ${formatPhotoDate(p.date)}` : `Photo ${i + 1}`);
      doc.text(label, xOff, y + ih + 4, { maxWidth: iw + 8 });
      if (showDates && p.date && p.label) doc.text(formatPhotoDate(p.date), xOff, y + ih + 8, { maxWidth: iw + 8 });
      xOff += iw + 12;
    } catch { /* skip */ }
  }
  return y + maxSize + 16;
}
function anovaTable(doc, stats, y, ph, trial) {
  const allTrials = getBackupTrials();
  const projectTrials = allTrials.filter(t => t.ProjectID && trial.ProjectID && String(t.ProjectID) === String(trial.ProjectID));
  
  const categoryId = trial.Category || 'herbicide';
  const config = getCategoryConfig(categoryId);
  const primaryField = getPrimaryObservationField(categoryId);
  const metricLabel = config.primaryMetric?.label || 'Efficacy';
  const metricUnit = config.primaryMetric?.unit || '%';

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
  if (maxN >= 3 && descRows.length >= 2) {
    const trialDesign = trial.TrialDesign || trial.Design || 'RCBD';
    let anova;
    let designName = trialDesign;
    if (trialDesign === 'Factorial' || trialDesign === 'Split-Plot') {
      anova = performTwoWayANOVA(projectTrials, { metric: primaryField });
      if (anova.error) anova = performANOVA(projectTrials, { metric: primaryField, design: 'RCBD' });
      else designName = trialDesign === 'Split-Plot' ? 'Split-Plot (Two-Way)' : 'Factorial Two-Way';
    } else {
      const design = /CRD/i.test(trialDesign) ? 'CRD' : 'RCBD';
      anova = performANOVA(projectTrials, { metric: primaryField, design });
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
      y = (doc.lastAutoTable?.finalY ?? y) + 5;

      // Calculate Coefficient of Variation (CV%)
      const errIdx = anova.anovaTable.source.indexOf('Error');
      const msError = errIdx !== -1 ? anova.anovaTable.ms[errIdx] : (anova.anovaTable.source.includes('Blocks') ? anova.anovaTable.ms[2] : anova.anovaTable.ms[1]);
      const grandMean = anova.grandMean;
      const cv = (grandMean > 0 && msError >= 0) ? (Math.sqrt(msError) / grandMean) * 100 : null;

      if (cv !== null) {
        doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
        doc.text(`Coefficient of Variation (CV%): ${cv.toFixed(2)}%`, 14, y);
        y += 5;
      }
      y += 5;

      // Stage 3: Multiple Comparison Tests (only if ANOVA pValue < 0.05 or any factor has significant effect in two-way/split-plot)
      const hasSignificantEffect = anova.isTwoWay ? (anova.factorA?.p < 0.05 || anova.factorB?.p < 0.05 || anova.interaction?.p < 0.05) : (anova.pValue < 0.05);
      if (hasSignificantEffect) {
        if (y + 20 > ph - 20) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold'); doc.setFontSize(10);
        doc.text('Stage 3: Multiple Comparisons (Tukey HSD Letter Groupings)', 14, y);
        y += 5;

        const tukey = performTukeyHSD(projectTrials, { metric: primaryField, anova });
        if (tukey && tukey.groups) {
          const groupRows = descRows.map(r => {
            const letter = tukey.groups[r.treatment] || 'a';
            return [r.treatment, `${r.meanVal.toFixed(2)} ${letter}`];
          });

          autoTable(doc, {
            startY: y,
            head: [['Treatment', `${metricLabel} Mean with Significance Grouping`]],
            body: groupRows,
            headStyles: { fillColor: TEAL },
            theme: 'striped',
            styles: { fontSize: 8.5 }
          });
          y = (doc.lastAutoTable?.finalY ?? y) + 10;
        }
      } else {
        if (y + 12 > ph - 20) { doc.addPage(); y = 20; }
        doc.setFontSize(9); doc.setTextColor(120, 120, 120);
        doc.text('Stage 3: Post-hoc tests (Tukey HSD) skipped because ANOVA is not significant (P >= 0.05).', 14, y);
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
async function addWeedIdSection(doc, weedPhotos, trial, y, ph) {
  if (!weedPhotos.length) return y;
  doc.addPage(); y = 20;
  const repConfig = getReportConfig(trial);
  const recordLabel = repConfig.cat === 'herbicide' ? 'Weed Identification Record' :
                      repConfig.cat === 'fungicide' ? 'Disease Identification Record' :
                      repConfig.cat === 'pesticide' ? 'Pest Identification Record' :
                      'Target Identification Record';
  y = secHeading(doc, `6. ${recordLabel}`, y, ph);
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
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
  const photos   = safeJsonParse(trial.PhotoURLs, []);
  const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
  const trialDate = fmtDate(trial.Date);
  const dataFields = getAllTrialDataFields(trial, options);

  pdfHeader(doc, `${repConfig.config.name} Trial Report`, trial.FormulationName);
  let y = 50;

  // Set category colors dynamically
  const primaryColor = repConfig.primaryColor;

  // 2-column metadata
  doc.setFontSize(10);
  const lx = 14, rx = pw / 2 + 10;
  const meta2 = [
    [`Investigator: ${trial.InvestigatorName || 'N/A'}`, `Date: ${trialDate}`],
    [`Location: ${trial.Location || 'N/A'}`,              `Dosage: ${trial.Dosage || 'N/A'}`],
    [`Crop: ${dataFields.crop}`,                           `Yield: ${dataFields.yieldValue}`],
    [`Application Timing: ${dataFields.applicationTiming}`, `Growth Stage: ${dataFields.cropStage}`],
    [`BBCH Code: ${dataFields.bbchCode}`,                  `Application Method: ${dataFields.applicationMethod}`],
    [`Spray Volume: ${dataFields.sprayVolume}`,            `Nozzle: ${dataFields.nozzle}`],
    [`Result: ${trial.Result || 'Pending'}`,               `Replication: ${trial.Replication || 'N/A'}`],
    [`Status: ${(trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing'}`,
     trial.PlotNumber ? `Plot #: ${trial.PlotNumber}` : ''],
  ];
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
    doc.text(`Temp: ${trial.Temperature}°C  |  Humidity: ${trial.Humidity || '—'}%  |  Wind: ${trial.Windspeed || '0'} km/h  |  Rain: ${trial.Rain || '0'} mm`, 16, y + 7);
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

  // ANOVA
  y = secHeading(doc, '2. Statistical Analysis (ANOVA)', y, ph);
  y = anovaTable(doc, safeJsonParse(trial.StatisticsJSON, {}), y, ph, trial);

  // Efficacy Analysis
  y = secHeading(doc, '3. Efficacy Analysis', y, ph);
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
    autoTable(doc, {
      startY: y,
      head: [[repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, `${repConfig.primaryMetricKey} (${repConfig.primaryMetricUnit})`]],
      body: wce.map(w => [w.species, w.initialCover.toFixed(1), w.finalCover.toFixed(1), w.wce.toFixed(1)]),
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 9 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  // Timeline
  if (withTimeline && efficacy.length) {
    y = secHeading(doc, `4. ${repConfig.config.name} Status Timeline`, y, ph);
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
      }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  // Conclusion & Notes
  y = conclusionNotes(doc, trial, y, ph);

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
    y = secHeading(doc, '5. Field Photo Log', y, ph);
    y = await addPhotoGrid(doc, photos, y, ph, 50, showPhotoDates);
  }

  // Harvest & Yield Report Section
  const harvest = safeJsonParse(trial.HarvestDataJSON, null);
  if (harvest && (harvest.actualFruitCount || harvest.actualMarketableWeight || harvest.actualUnmarketableWeight || harvest.notes)) {
    y = secHeading(doc, '6. Harvest & Yield Report', y, ph);
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
      y = await addPhotoGrid(doc, harvestPhotos, y, ph, 40, false);
    }
  }

  // Target Identification Record Section
  if (withWeeds) y = await addWeedIdSection(doc, weedPhotos, trial, y, ph);

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
  const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
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

  // Metadata table (4-column)
  const metaRows = [
    ['Investigator', trial.InvestigatorName || 'N/A', 'Date', trialDate],
    ['Location', trial.Location || 'N/A', 'Dosage', trial.Dosage || 'N/A'],
    ['Crop', dataFields.crop, 'Yield', dataFields.yieldValue],
    ['App Timing', dataFields.applicationTiming, 'Growth Stage', dataFields.cropStage],
    ['BBCH Code', dataFields.bbchCode, 'App Method', dataFields.applicationMethod],
    ['Spray Volume', dataFields.sprayVolume, 'Nozzle', dataFields.nozzle],
    ['Status', (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing', 'Result', trial.Result || 'Pending'],
    [repConfig.targetLabel, repConfig.targetValue, 'Replication', trial.Replication || 'N/A'],
  ];
  autoTable(doc, {
    startY: y, body: metaRows, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { fontStyle: 'bold', cellWidth: 35 } }
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Executive Summary / AI Narrative
  y = secHeading(doc, 'Executive Summary', y, ph);
  const narrative = aiSummary ||
    `Methodology\n${methodology}\n\nResults\n${summary}\n\nConclusions\n${trial.Conclusion || 'See observations for detailed results.'}`;
  for (const rawLine of narrative.split('\n')) {
    const line = rawLine.trim();
    if (!line) { y += 3; continue; }
    if (/^(Methodology|Results|Conclusions?)\s*:?\s*$/i.test(line)) {
      if (y + 12 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFont(undefined, 'bold'); doc.setFontSize(11);
      doc.text(line, 14, y); y += 7;
      doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    } else {
      const wrapped = doc.splitTextToSize(line, pw - 28);
      if (y + wrapped.length * 5 > ph - 20) { doc.addPage(); y = 20; }
      doc.text(wrapped, 14, y); y += wrapped.length * 5 + 2;
    }
  }
  y += 8;

  // Trial Design
  y = secHeading(doc, '1. Trial Design & Conditions', y, ph);
  if (trial.Temperature) {
    if (y + 22 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFillColor(241, 245, 249); doc.rect(14, y - 4, pw - 28, 20, 'F');
    doc.setFont(undefined, 'bold'); doc.text('Weather Conditions:', 16, y);
    doc.setFont(undefined, 'normal');
    doc.text(`Temp: ${trial.Temperature}°C  Humidity: ${trial.Humidity || '—'}%  Wind: ${trial.Windspeed || '—'} km/h  Rain: ${trial.Rain || '—'} mm`, 16, y + 7);
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

  // ANOVA
  y = secHeading(doc, '2. Statistical Analysis (ANOVA)', y, ph);
  y = anovaTable(doc, safeJsonParse(trial.StatisticsJSON, {}), y, ph, trial);

  // Efficacy
  y = secHeading(doc, '3. Efficacy Analysis', y, ph);
  const wce = calcWCE(efficacy, categoryId, trial);
  if (wce.length) {
    autoTable(doc, {
      startY: y,
      head: [[repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, `${repConfig.primaryMetricKey} (${repConfig.primaryMetricUnit})`]],
      body: wce.map(w => [w.species, w.initialCover.toFixed(1), w.finalCover.toFixed(1), w.wce.toFixed(1)]),
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 9 }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  } else {
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text('No structured efficacy observations recorded.', 14, y); y += 10;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10);
  }

  // Timeline
  if (efficacy.length) {
    y = secHeading(doc, `4. ${repConfig.config.name} Status Timeline`, y, ph);
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
      }
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 12;
  }

  y = conclusionNotes(doc, trial, y, ph);

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
    y = secHeading(doc, '5. Field Photo Log', y, ph);
    y = await addPhotoGrid(doc, photos, y, ph, 50, showPhotoDates);
  }

  // Harvest & Yield Report Section
  const harvest = safeJsonParse(trial.HarvestDataJSON, null);
  if (harvest && (harvest.actualFruitCount || harvest.actualMarketableWeight || harvest.actualUnmarketableWeight || harvest.notes)) {
    y = secHeading(doc, '6. Harvest & Yield Report', y, ph);
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
      y = await addPhotoGrid(doc, harvestPhotos, y, ph, 40, false);
    }
  }

  // Target Identification Record Section
  y = await addWeedIdSection(doc, weedPhotos, trial, y, ph);
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
    [{ text: 'Crop', options: { bold: true } }, dataFields.crop, { text: 'Yield', options: { bold: true } }, dataFields.yieldValue],
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
    s3.addText(`Efficacy Analysis – ${repConfig.primaryMetricKey} per ${repConfig.targetLabel}`, { x: 0.4, y: 0.2, w: 9, h: 0.7, fontSize: 22, bold: true, color: primaryHex });
    const hdr = [{ text: repConfig.targetLabel, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
                 { text: `Initial ${repConfig.primaryObsLabel}`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
                 { text: `Final ${repConfig.primaryObsLabel}`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } },
                 { text: `${repConfig.primaryMetricKey} (%)`, options: { bold: true, color: 'FFFFFF', fill: { color: primaryHex } } }];
    s3.addTable([hdr, ...wce.map(w => [w.species, w.initialCover.toFixed(1), w.finalCover.toFixed(1), w.wce.toFixed(1)])],
      { x: 0.4, y: 1.0, w: 9.2, fontSize: 13, colW: [3, 2, 2, 2.2], border: { pt: 0.5, color: 'CBD5E1' } });
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
        s5.addImage({ data: imgData, x: px, y: py, w: pw2, h: ph2 });
        s5.addText(photos[i].label || `Photo ${i + 1}`, { x: px, y: py + ph2 + 0.05, w: pw2, h: 0.3, fontSize: 9, color: '475569' });
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
export function exportToCSV(trial) {
  exportMultipleTrialsToCSV([trial]);
}

// ═════════════════════════════════════════════════════════════════════════════
export function exportMultipleTrialsToCSV(trials) {
  if (!trials || !trials.length) return;

  const firstTrial = trials[0];
  const repConfig = getReportConfig(firstTrial);
  const uniqueCategories = [...new Set(trials.map(t => t.Category || 'herbicide'))];

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

  const header = [
    'Trial ID', 'Category', 'Formulation', 'Investigator', 'Date', 'Location', 'Dosage',
    'Crop', 'Yield', 'Application Timing', 'Growth Stage', 'BBCH Code', 'App Method', 'Spray Vol (L/ha)', 'Nozzle',
    'Soil pH', 'Soil Clay %', 'Soil Sand %', 'Soil OC', 'Soil Texture', 'Soil N (ppm)', 'Soil P (ppm)', 'Soil K (ppm)', 'Soil CEC', 'Soil Moisture %',
    'Trial Design', 'Replication / Block ID',
    'Target Label', 'Target Value', 'Overall Result', 'Trial Status',
    'DAA', 'Obs Date'
  ];

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
    const efficacy = validateEfficacy(safeJsonParse(trial.EfficacyDataJSON, []));
    const isCompletedStr = (trial.IsCompleted === true || trial.IsCompleted === 'true') ? 'Finalized' : 'Ongoing';

    const baseRow = [
      trial.ID, trial.Category || 'herbicide', trial.FormulationName, trial.InvestigatorName, trial.Date, trial.Location, trial.Dosage,
      dataFields.crop, dataFields.yieldValue, dataFields.applicationTiming, dataFields.cropStage, dataFields.bbchCode,
      dataFields.applicationMethod, dataFields.sprayVolume, dataFields.nozzle,
      dataFields.soil?.ph || '', dataFields.soil?.clay || '', dataFields.soil?.sand || '', dataFields.soil?.organicCarbon || '', dataFields.soil?.texture || '',
      dataFields.soil?.nitrogen || '', dataFields.soil?.phosphorus || '', dataFields.soil?.potassium || '', dataFields.soil?.cec || '', dataFields.soil?.moisture || '',
      trial.TrialDesign || trial.Design || 'RCBD', trial.Replication || trial.BlockID || 'R1',
      trialConfig.targetLabel, trialConfig.targetValue, trial.Result || 'Pending', isCompletedStr
    ];

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
          details.forEach(wd => {
            const row = [...baseRow, daa, obsDate];
            // Push placeholders or values for other observation fields
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
          const row = [...baseRow, daa, obsDate];
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
      const row = [...baseRow, '', ''];
      obsFields.forEach(() => row.push(''));
      if (uniqueCategories.includes('herbicide')) {
        row.push('', '');
      }
      row.push('', '', '', '', '', '');
      rows.push(row);
    }
  });

  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  let filename = 'Trials_Export.csv';
  if (trials.length === 1) {
    const trial = trials[0];
    filename = `Trial_${safeName(trial.FormulationName)}_${trial.Date || 'nodate'}.csv`;
  } else {
    filename = `Selected_Trials_${new Date().toISOString().split('T')[0]}.csv`;
  }

  dlBlob(new Blob([csv], { type: 'text/csv' }), filename);
  toast(`CSV exported (${trials.length} trial${trials.length > 1 ? 's' : ''})`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT 5 — exportAllTrialsCSV  (all trials summary)
// ═════════════════════════════════════════════════════════════════════════════
export function exportAllTrialsCSV(trials, projects = []) {
  if (!trials || !trials.length) return;
  const firstTrial = trials[0];
  const repConfig = getReportConfig(firstTrial);
  const allSameCategory = trials.every(t => (t.Category || 'herbicide') === (firstTrial.Category || 'herbicide'));
  const targetLabel = allSameCategory ? repConfig.targetLabel : 'Target Species';

  const header = ['Trial ID', 'Category', 'Formulation', 'Investigator', 'Date', 'Location', 'Dosage',
                  'Crop', 'Yield', 'Application Timing', 'Growth Stage', 'BBCH Code',
                  targetLabel, 'Result', 'Status', 'Project', 'Replication',
                  'Plot #', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)',
                  'Observations', 'Photos'];
  const rows = trials.map(t => {
    const proj = projects.find(p => p.ID === t.ProjectID) || getProjectForTrial(t, { projects });
    const tConfig = getReportConfig(t);
    const dataFields = getAllTrialDataFields(t, { projects });
    return [
      t.ID, t.Category || 'herbicide', t.FormulationName, t.InvestigatorName, t.Date, t.Location, t.Dosage,
      dataFields.crop, dataFields.yieldValue, dataFields.applicationTiming, dataFields.cropStage, dataFields.bbchCode,
      tConfig.targetValue, t.Result,
      (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Ongoing',
      proj?.Name || '', t.Replication || '', t.PlotNumber || '',
      t.Temperature || '', t.Humidity || '', t.Windspeed || '', t.Rain || '',
      safeJsonParse(t.EfficacyDataJSON, []).length,
      safeJsonParse(t.PhotoURLs, []).length,
    ];
  });
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  dlBlob(new Blob([csv], { type: 'text/csv' }), `All_Trials_${new Date().toISOString().split('T')[0]}.csv`);
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

  const wceRows = wce.map(w => `<tr>
    <td>${w.species}</td><td>${w.initialCover.toFixed(1)}${repConfig.primaryMetricUnit}</td>
    <td>${w.finalCover.toFixed(1)}${repConfig.primaryMetricUnit}</td>
    <td style="font-weight:700;color:${w.wce >= 80 ? '#10b981' : w.wce >= 60 ? '#3b82f6' : w.wce >= 40 ? '#f59e0b' : '#ef4444'};">${w.wce.toFixed(1)}%</td>
  </tr>`).join('');

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
        <div class="meta-item"><strong>Crop</strong>${dataFields.crop}</div>
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
      <h2>${repConfig.primaryMetricLabel} (${repConfig.primaryMetricKey})</h2>
      <table><thead><tr><th>${repConfig.targetLabel}</th><th>Initial ${repConfig.primaryObsLabel}</th><th>Final ${repConfig.primaryObsLabel}</th><th>${repConfig.primaryMetricKey} %</th></tr></thead>
      <tbody>${wceRows}</tbody></table>
    </div>` : ''}

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
    ['Crop', dataFields.crop, 'Yield', dataFields.yieldValue],
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

  const wceRows = wce.map(w => `<tr>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.species}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.initialCover.toFixed(1)}${repConfig.primaryMetricUnit}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;">${w.finalCover.toFixed(1)}${repConfig.primaryMetricUnit}</td>
    <td style="border:1px solid #e2e8f0;padding:5px 8px;font-weight:bold;color:${w.wce >= 80 ? '#10b981' : w.wce >= 60 ? '#3b82f6' : w.wce >= 40 ? '#f59e0b' : '#ef4444'};">${w.wce.toFixed(1)}%</td>
  </tr>`).join('');

  const wceHtml = wce.length ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">${repConfig.primaryMetricLabel} (${repConfig.primaryMetricKey})</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      <thead><tr style="background:${primaryHex};color:#fff;">
        <th style="padding:6px 8px;text-align:left;">${repConfig.targetLabel}</th><th style="padding:6px 8px;text-align:left;">Initial ${repConfig.primaryObsLabel}</th>
        <th style="padding:6px 8px;text-align:left;">Final ${repConfig.primaryObsLabel}</th><th style="padding:6px 8px;text-align:left;">${repConfig.primaryMetricKey} %</th>
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

  const photoHtml = photos.length ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Field Photos (${photos.length})</h2>
    <p style="font-size:10pt;color:#64748b;font-style:italic;">Note: Photos are embedded in the HTML report export. This document lists ${photos.length} photo(s) on record.</p>
    <ul style="font-size:10pt;">
      ${photos.map((p, i) => `<li>${p.label || `Photo ${i + 1}`}${p.date ? ` — ${formatDateTime(p.date)}` : ''}</li>`).join('')}
    </ul>` : '';

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
  
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
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

  y += 4;
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
    const narrativeLines = aiSummary.split('\n');
    for (const rawLine of narrativeLines) {
      const line = rawLine.trim();
      if (!line) { y += 3; continue; }
      const wrapped = doc.splitTextToSize(line, pw - 28);
      if (y + wrapped.length * 5 > ph - 20) { doc.addPage(); y = 20; }
      doc.setFontSize(9); doc.text(wrapped, 14, y); y += wrapped.length * 5 + 2;
    }
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
    doc.text(`ANOVA: F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'}`, 14, y); y += 5;
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
  y = secHeading(doc, `${sectionCounter++}. Comparative ${repConfig.primaryMetricLabel} (${repConfig.primaryMetricKey}%)`, y, ph, 14, primaryColor);
  const wceRows = [];
  subTrials.forEach(st => {
    const eff = validateEfficacy(safeJsonParse(st.EfficacyDataJSON, []));
    const wces = calcWCE(eff, categoryId, st);
    wces.forEach(w => {
      wceRows.push([
        st.FormulationName || 'Untreated Check',
        st.Replication || 'R1',
        w.species,
        w.initialCover.toFixed(1) + repConfig.primaryMetricUnit,
        w.finalCover.toFixed(1) + repConfig.primaryMetricUnit,
        w.wce.toFixed(1) + '%'
      ]);
    });
  });

  if (wceRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Sub-Trial / Spot', 'Rep', repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, `${repConfig.primaryMetricKey} %`]],
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
      doc.text(`Notes: ${st.Notes}`, 14, y, { maxWidth: pw - 28 });
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
        }
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

  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
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

  // Executive summary
  y = secHeading(doc, 'Executive Summary', y, ph, 14, primaryColor);
  const narrative = aiSummary || `This master scientific report aggregates findings from ${subTrials.length} Sub-Trial monitoring locations evaluated within the ${project.Name} area. Localized efficacy tracking, target species distribution timelines, and photographic logs were evaluated. Overall efficacy profiles and target responses are compiled below.`;
  const narrativeLines = narrative.split('\n');
  for (const rawLine of narrativeLines) {
    const line = rawLine.trim();
    if (!line) { y += 3; continue; }
    const wrapped = doc.splitTextToSize(line, pw - 28);
    if (y + wrapped.length * 5 > ph - 20) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.text(wrapped, 14, y); y += wrapped.length * 5 + 2;
  }
  y += 8;

  if (analysis?.anova) {
    y = secHeading(doc, 'Statistical Analysis Overview', y, ph, 14, primaryColor);
    const anova = analysis.anova;
    const method = analysis.analysisMethod || anova.design || 'ANOVA';
    doc.setFontSize(10);
    doc.text(`Analysis method: ${method}`, 14, y); y += 5;
    doc.text(`Design interpretation: ${analysis.design || (anova.design || 'RCBD')}`, 14, y); y += 6;
    doc.text(`Treatments analyzed: ${analysis.treatmentSummary?.length || Object.keys(anova.treatmentMeans || {}).length}`, 14, y); y += 6;
    doc.text(`ANOVA results: F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'}; ${anova.significant ? 'Statistically significant treatment differences detected.' : 'No statistically significant treatment differences detected.'}`, 14, y); y += 8;
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
      wceRows.push([
        st.FormulationName || 'Untreated Check',
        st.Replication || 'R1',
        w.species,
        w.initialCover.toFixed(1) + repConfig.primaryMetricUnit,
        w.finalCover.toFixed(1) + repConfig.primaryMetricUnit,
        w.wce.toFixed(1) + '%'
      ]);
    });
  });

  if (wceRows.length) {
    autoTable(doc, {
      startY: y,
      head: [['Sub-Trial / Spot', 'Rep', repConfig.targetLabel, `Initial ${repConfig.primaryObsLabel}`, `Final ${repConfig.primaryObsLabel}`, `${repConfig.primaryMetricKey} %`]],
      body: wceRows,
      headStyles: { fillColor: primaryColor }, theme: 'striped', styles: { fontSize: 9 }
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
        }
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
      wceRows.push([
        st.FormulationName || 'Untreated Check',
        w.species,
        w.initialCover.toFixed(1) + repConfig.primaryMetricUnit,
        w.finalCover.toFixed(1) + repConfig.primaryMetricUnit,
        w.wce.toFixed(1) + '%'
      ]);
    });
  });
  s3.addTable(wceRows, { x: 0.4, y: 1.0, w: 9.2, fontSize: 11, colW: [2.8, 2.2, 1.4, 1.4, 1.4], border: { pt: 0.5, color: 'CBD5E1' } });

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
            s4.addImage({ data: imgData, x: px, y: py, w: pw2, h: ph2 });
            s4.addText(`${st.FormulationName || 'Untreated Check'} - ${photos[0].label || 'Latest'}`, { x: px, y: py + ph2 + 0.05, w: pw2, h: 0.3, fontSize: 9, color: '475569' });
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

  const header = [
    'Master Project', 'Sub-Trial ID', 'Category', 'Formulation', 'Replication', 'Plot #', 
    'Location', 'Dosage', 'Crop', 'Yield', 'Application Timing', 'Growth Stage', 'BBCH Code', 'App Method', 'Spray Vol (L/ha)', 'Nozzle',
    'Soil pH', 'Soil Clay %', 'Soil Sand %', 'Soil OC', 'Soil Texture', 'Soil N (ppm)', 'Soil P (ppm)', 'Soil K (ppm)', 'Soil CEC', 'Soil Moisture %',
    'Trial Design',
    'Target Label', 'Target Value', 'Overall Result', 'Trial Status',
    'DAA', 'Obs Date'
  ];

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

    const baseRow = [
      project.Name, st.ID, st.Category || 'herbicide', st.FormulationName, st.Replication || 'R1', st.PlotNumber || '',
      st.Location || '', st.Dosage || '', dataFields.crop, dataFields.yieldValue, dataFields.applicationTiming, dataFields.cropStage, dataFields.bbchCode,
      dataFields.applicationMethod, dataFields.sprayVolume, dataFields.nozzle,
      dataFields.soil?.ph || '', dataFields.soil?.clay || '', dataFields.soil?.sand || '', dataFields.soil?.organicCarbon || '', dataFields.soil?.texture || '',
      dataFields.soil?.nitrogen || '', dataFields.soil?.phosphorus || '', dataFields.soil?.potassium || '', dataFields.soil?.cec || '', dataFields.soil?.moisture || '',
      st.TrialDesign || st.Design || 'RCBD',
      trialConfig.targetLabel, trialConfig.targetValue, st.Result || 'Pending', isCompletedStr
    ];

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

        if (categoryId === 'herbicide') {
          const details = obs.weedDetails?.length ? obs.weedDetails : [{ species: 'Total', cover: getObservationPrimaryValue(trialConfig.cat, obs) ?? '' }];
          details.forEach(wd => {
            const row = [...baseRow, daa, obsDate];
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
          const row = [...baseRow, daa, obsDate];
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

  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  dlBlob(new Blob([csv], { type: 'text/csv' }), `Master_Study_Export_${safeName(project.Name)}.csv`);
  toast('Master CSV exported!', 'success');
}

export function exportMasterHtml(project, subTrials, options = {}) {
  const { aiSummary = '', analysis = null } = options;
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
  const repConfig = getReportConfig({ Category: categoryId });
  const primaryHex = repConfig.config.color?.hex || '#0d9488';

  const analysisHtml = analysis && analysis.anova ? (() => {
    const anova = analysis.anova;
    const postHoc = analysis.postHoc?.groups ? Object.entries(analysis.postHoc.groups)
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
      .map(([treatment, letter]) => `${treatment} (${letter})`).join(', ') : '';
    return `
      <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">Statistical Analysis Summary</h2>
      <p><strong>Analysis method:</strong> ${analysis.analysisMethod || 'ANOVA'}</p>
      <p><strong>Design:</strong> ${analysis.design || (anova.design || 'RCBD')}</p>
      <p><strong>ANOVA result:</strong> F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'} (${anova.significant ? 'significant' : 'not significant'})</p>
      ${postHoc ? `<p><strong>Post-hoc grouping:</strong> ${postHoc}</p>` : ''}
      ${analysis.balanceWarning ? `<p style="color:#9a3412"><strong>Warning:</strong> ${analysis.balanceWarning}</p>` : ''}
      ${analysis.missingFinalWarning ? `<p style="color:#9a3412"><strong>Note:</strong> ${analysis.missingFinalWarning}</p>` : ''}
    `;
  })() : '';

  const aiSummaryHtml = aiSummary ? `
    <h2 style="color:${primaryHex};font-size:14pt;border-bottom:2px solid ${primaryHex};padding-bottom:4px;margin-top:24px;">AI Narrative Summary</h2>
    <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px;margin-bottom:16px;white-space:pre-wrap;line-height:1.45;">${aiSummary.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
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

export function exportMasterDocx(project, subTrials, options = {}) {
  const { aiSummary = '', analysis = null } = options;
  const categoryId = project.Category || (subTrials[0]?.Category) || 'herbicide';
  const repConfig = getReportConfig({ Category: categoryId });
  const primaryHex = repConfig.config.color?.hex || '#0d9488';

  const analysisHtml = analysis && analysis.anova ? (() => {
    const anova = analysis.anova;
    const postHoc = analysis.postHoc?.groups ? Object.entries(analysis.postHoc.groups)
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
      .map(([treatment, letter]) => `${treatment} (${letter})`).join(', ') : '';
    return `
      <h2>Statistical Analysis Summary</h2>
      <p><strong>Analysis method:</strong> ${analysis.analysisMethod || 'ANOVA'}</p>
      <p><strong>Design:</strong> ${analysis.design || (anova.design || 'RCBD')}</p>
      <p><strong>ANOVA result:</strong> F = ${anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${anova.pValue?.toFixed(4) || 'N/A'} (${anova.significant ? 'significant' : 'not significant'})</p>
      ${postHoc ? `<p><strong>Post-hoc grouping:</strong> ${postHoc}</p>` : ''}
      ${analysis.balanceWarning ? `<p><strong>Warning:</strong> ${analysis.balanceWarning}</p>` : ''}
      ${analysis.missingFinalWarning ? `<p><strong>Note:</strong> ${analysis.missingFinalWarning}</p>` : ''}
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
</body></html>`;

  dlBlob(new Blob([wordHtml], { type: 'application/msword' }), `Master_Report_${safeName(project.Name)}.doc`);
  toast('Master Word Document downloaded!', 'success');
}

