// src/services/advancedReportGenerator.js
// Programmatically generates a 11-sheet professional Excel report matching TOK2322C Tomato Fertility Report.
// Fully client-side, using exceljs, file-saver, jstat, and chart.js/auto.

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import Chart from 'chart.js/auto';
import jStat from 'jstat';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { getAPIKeys, generateTextWithAI } from './multiProviderAI.js';
import { getPlotAreaHectares } from '../utils/helpers.js';
import { performTypeIIIANOVA, getStudentTCritical } from '../utils/statsUtils.js';
import { calculateDAA, formatDaaLabel } from '../utils/dateUtils.js';

// Local helper for safe JSON parsing
function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
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

// Helper to convert 1-based column index to Excel column letters (e.g. 7 -> G)
function getColumnLetter(col) {
  let letter = '';
  while (col > 0) {
    let temp = (col - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    col = Math.floor((col - temp) / 26);
  }
  return letter;
}

// Helper: Strip raw LaTeX / markdown math wrappers (e.g. "$p = 0.5764$" -> "p = 0.5764") for clean Excel text
function sanitizeExcelNarrativeText(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .trim();
}

// Helper to generate dynamic scientific narrative using Gemini AI
async function generateNarrativeWithAI(trial, category, observations, activeFields, treatmentNames, design, anovaResults) {
  try {
    const daaMap = {};
    (observations || []).forEach(o => {
      const daa = o.daa ?? 0;
      if (!daaMap[daa]) daaMap[daa] = [];
      daaMap[daa].push(o);
    });

    const summaryParts = [];
    const fieldsToSummarize = activeFields || [];

    Object.keys(daaMap).sort((a, b) => Number(a) - Number(b)).forEach(daa => {
      const obsAtDaa = daaMap[daa];
      const fieldAverages = [];
      fieldsToSummarize.forEach(f => {
        const vals = obsAtDaa.map(o => parseFloat(o[f.key])).filter(v => !isNaN(v));
        if (vals.length > 0) {
          const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
          fieldAverages.push(`${f.label}: ${avg.toFixed(2)}`);
        }
      });
      if (fieldAverages.length > 0) {
        summaryParts.push(`DAA ${daa} averages (${fieldAverages.join(', ')})`);
      }
    });

    const obsSummary = summaryParts.slice(0, 20).join('; ');
    const interpretation = compileAgronomicInterpretation(observations, activeFields, treatmentNames, category, design, trial?.Date);

    const prompt = `You are a professional agronomist. Write a concise, executive-level scientific narrative (2 paragraphs) summarizing the results of this trial.
Trial: ${trial.FormulationName || 'Test formulation'} on crop ${trial.CropCrop || trial.Crop || 'N/A'}.
Category: ${category}
Design: ${design}
Treatments Evaluated: ${treatmentNames.join(', ')}
ANOVA Results / Efficacy: ${JSON.stringify(anovaResults || {})}
Detailed Agronomic Interpretation:
${interpretation}
Observations summary: ${obsSummary}
CRITICAL INSTRUCTION: 
1. Avoid all causal physiological, biological or metabolic claims (such as "nutrient uptake", "assimilation", "photosynthetic rate", "metabolic demand") unless those biological parameters were directly measured. Focus strictly on physical, visual, and statistical observations (e.g. height, vigor, leaf color, SPAD, yield).
2. Differentiate clearly between numerical differences and statistically significant differences. Do NOT write that observations were "uniform" across replicates unless all replicate data values are identical; describe the numerical means observed for the treatments and state that the differences were not statistically significant.
3. Only state that deficiency symptoms were not noted if the actual deficiency or chlorosis values in the data are zero or absent.
14. If leaf gloss / luster data (leafGlossScore) is present, interpret higher scores (≥7) as an indicator of healthy cuticle wax development, foliar health, and positive treatment response across plots (whether from nutrition, foliar inputs, biostimulants, or other treatments); lower scores (≤3) indicate dull, matte, or stressed foliage. Attribute differences objectively to the treatments evaluated rather than assuming any single input type.
15. If flower stage data is present and not "none", mention the reproductive stage observed and any treatment differences in flowering progression.
16. If fruit health score data is present (fruitHealthScore > 0), describe the fruit condition and any visible disorders such as blossom-end-rot, cracking, or sunscald noted in the fruitHealthNote, and relate this to treatment efficacy if differences exist.
4. Never infer that the experiment lacked sufficient data, inadequate replication, or inadequate statistical power unless those conditions are explicitly supported by the statistical output. Do NOT claim the trial has "insufficient data" (it has multiple replication blocks and pots).
5. Do NOT mention "Completely Randomized Design" or "CRD" unless the selected design is explicitly CRD.
9. Avoid informal phrases like: "performed comparably", "showed comparable vigor", or "uniform". Instead, write: "no statistically significant treatment differences were detected under the conditions of this study."
10. If the design is PotTrial, refer to it consistently as "Randomized Complete Block Pot Trial (RCBD Pot Trial)".
11. Do NOT write that the trial "did not establish a baseline of nutrient deficiency". Instead, write: "Deficiency symptoms remained minimal throughout the observation period..."
12. Do NOT use the word "variance" when describing percentage differences between treatment means (e.g. do not write "20% numerical variance"). Instead, use "higher/lower numerical mean" (e.g. "20% higher numerical mean").
13. Avoid using terms like "colorimetric indices". Instead, use "visual and physiological observations" (such as leaf color, SPAD, vigor, plant height).
14. ZERO BIAS TOWARDS EXPERIMENTAL TREATMENTS: Do NOT presume that experimental treatments must outperform untreated controls. In agricultural trials, untreated controls may equal or outperform treatments (e.g. where treatments cause phytotoxicity, fertilizer burn, vegetative stunting, or delay flowering/fruiting). If untreated controls yield higher or have superior vigor/metrics, report this finding clearly, objectively, and without bias.
15. STRICT YIELD & MISSING DATA INTEGRITY: If Yield / Harvest observations were NOT recorded in this dataset, NEVER state that treatments showed "zero yield", "no measurable yield response", or "no agronomic efficacy on yield". Explicitly state that yield has not yet been harvested/measured and restrict conclusions strictly to the parameters actually recorded.
16. PARAMETER ELIGIBILITY & SCALE CLARITY: Explicitly distinguish parameters statistically analysed via latest post-application ANOVA from parameters excluded due to insufficient observations, constant values, or ordinal/mixed coding scales (such as Flower Stage when BBCH codes are mixed with 0/1 scores). Clearly distinguish overall multi-date descriptive summaries from latest post-application independent ANOVA means. Do NOT use LaTeX math symbols like $p = 0.5764$; write plain text "(p = 0.5764)".
Do NOT use markdown headers or lists. Keep it strictly scientific, professional, and factual.`;

    const text = await generateTextWithAI(prompt, 'You are a professional agronomist.');
    return sanitizeExcelNarrativeText(text) || null;
  } catch (e) {
    console.warn('Failed to generate AI narrative during export:', e);
    return null;
  }
}

// Helper to generate dynamic conclusions using Gemini AI
async function generateConclusionsWithAI(trial, category, activeFields, observations, treatmentNames, design, anovaResults) {
  try {
    const daaMap = {};
    (observations || []).forEach(o => {
      const daa = o.daa ?? 0;
      if (!daaMap[daa]) daaMap[daa] = [];
      daaMap[daa].push(o);
    });

    const summaryParts = [];
    const fieldsToSummarize = activeFields || [];

    Object.keys(daaMap).sort((a, b) => Number(a) - Number(b)).forEach(daa => {
      const obsAtDaa = daaMap[daa];
      const fieldAverages = [];
      fieldsToSummarize.forEach(f => {
        const vals = obsAtDaa.map(o => parseFloat(o[f.key])).filter(v => !isNaN(v));
        if (vals.length > 0) {
          const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
          fieldAverages.push(`${f.label}: ${avg.toFixed(2)}`);
        }
      });
      if (fieldAverages.length > 0) {
        summaryParts.push(`DAA ${daa} averages (${fieldAverages.join(', ')})`);
      }
    });

    const obsSummary = summaryParts.slice(0, 20).join('; ');
    const interpretation = compileAgronomicInterpretation(observations, activeFields, treatmentNames, category, design, trial?.Date);

    const prompt = `You are a senior agricultural scientist. Write a bulleted list of 3 scientific conclusions and practical grower recommendations based on this trial's statistical results.
Trial: ${trial.FormulationName || 'Test treatment'}
Category: ${category}
Design: ${design}
Treatments Evaluated: ${treatmentNames.join(', ')}
Observations summary: ${obsSummary}
Detailed Agronomic Interpretation:
${interpretation}
ANOVA Results: ${JSON.stringify(anovaResults || {})}
CRITICAL INSTRUCTION: 
1. Avoid all causal physiological, biological or metabolic claims unless biological parameters were directly measured. Focus strictly on physical, visual, and statistical observations.
2. Differentiate clearly between numerical differences and statistically significant differences. Do NOT write that observations were "uniform" across replicates unless all replicate data values are identical.
3. Compare all treatment groups collectively: ${treatmentNames.join(', ')}. Use the exact treatment names.
4. Never infer that the experiment lacked sufficient data, inadequate replication, or inadequate statistical power unless those conditions are explicitly supported by the statistical output.
5. Do NOT mention "Completely Randomized Design" or "CRD" unless the selected design is CRD.
6. Provide research-oriented recommendations, such as: repeating the trial under additional agro-climatic conditions, evaluating across multiple seasons, or validating under commercial farming conditions. Do NOT recommend business-oriented actions.
7. Use neutral phrasing like: "Given the absence of statistically significant treatment differences..." instead of "lack of variance".
8. If high coefficients of variation (CV%) are observed for a measured parameter, write: "The relatively high variability in [Parameter Name] measurements (CV = [Value]%) may have reduced the ability to detect small treatment effects." Do not reference "SPAD" or "chlorophyll" unless that metric is actually present in the dataset.
9. Avoid informal phrases like: "performed comparably", "showed comparable vigor", or "uniform". Instead, write: "no statistically significant treatment differences were detected under the conditions of this study."
10. If the design is PotTrial, refer to it consistently as "Randomized Complete Block Pot Trial (RCBD Pot Trial)".
11. Do NOT write that the trial "did not establish a baseline of nutrient deficiency". Instead, write: "Deficiency symptoms remained minimal throughout the observation period..."
12. Do NOT use the word "variance" when describing percentage differences between treatment means (e.g. do not write "20% numerical variance"). Instead, use "higher/lower numerical mean" (e.g. "20% higher numerical mean").
13. Avoid using terms like "colorimetric indices". Instead, use "visual and physiological observations" (such as leaf color, SPAD, vigor, plant height).
14. ZERO BIAS TOWARDS EXPERIMENTAL TREATMENTS: Do NOT presume that experimental treatments must outperform untreated controls. In agricultural trials, untreated controls may equal or outperform treatments (e.g. where treatments cause phytotoxicity, fertilizer burn, vegetative stunting, or delay flowering/fruiting). If untreated controls yield higher or have superior vigor/metrics, report this finding clearly, objectively, and without bias.
15. STRICT YIELD & MISSING DATA INTEGRITY: If Yield / Harvest observations were NOT recorded in this dataset, NEVER state that treatments showed "zero yield", "no measurable yield response", or "no agronomic efficacy on yield". Explicitly state that yield has not yet been harvested/measured and restrict conclusions strictly to the parameters actually recorded.
16. PARAMETER ELIGIBILITY & SCALE CLARITY: Explicitly distinguish parameters statistically analysed via latest post-application ANOVA from parameters excluded due to insufficient observations, constant values, or ordinal/mixed coding scales (e.g. Flower Stage). Clearly note if any growth-stage parameter requires scale verification before statistical interpretation. Do NOT use LaTeX math delimiters like $p = 0.5764$; write plain text "(p = 0.5764)".
Do NOT use markdown headers or lists. Keep it strictly scientific, professional, and factual.`;

    const text = await generateTextWithAI(prompt, 'You are a senior agricultural scientist.');
    return sanitizeExcelNarrativeText(text) || null;
  } catch (e) {
    console.warn('Failed to generate AI conclusions during export:', e);
    return null;
  }
}

// Scientific helper: Root-to-Shoot Ratio
function calculateRootToShoot(obs) {
  const root = parseFloat(obs.rootBiomass);
  const shoot = parseFloat(obs.shootBiomass);
  if (!isNaN(root) && !isNaN(shoot) && shoot > 0) {
    return parseFloat((root / shoot).toFixed(3));
  }
  return null;
}

// Scientific helper: AUDPC (Area Under Disease Progress Curve)
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

// Scientific helper: Nutrient Use Efficiency (NUE)
function calculateNUE(tMean, cMean, rate) {
  const r = parseFloat(rate);
  if (!isNaN(r) && r > 0) {
    return parseFloat(((tMean - cMean) / r).toFixed(3));
  }
  return null;
}

// Approximate p-value from F-distribution using regularized incomplete beta function
function logGamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedIncompleteBeta(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;
  const f_eps = 1e-15;
  const max_iter = 100;
  let f = 1.0; let c = 1.0; let d = 0.0;
  for (let m = 0; m <= max_iter; m++) {
    let numerator;
    if (m === 0) numerator = 1.0;
    else if (m % 2 === 0) {
      const k = m / 2;
      numerator = (k * (b - k) * x) / ((a + 2 * k - 1) * (a + 2 * k));
    } else {
      const k = (m - 1) / 2;
      numerator = -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1));
    }
    d = 1.0 + numerator * d;
    if (Math.abs(d) < f_eps) d = f_eps;
    d = 1.0 / d;
    c = 1.0 + numerator / c;
    if (Math.abs(c) < f_eps) c = f_eps;
    const delta = c * d;
    f = f * delta;
    if (Math.abs(delta - 1.0) < f_eps) break;
  }
  return front * (f - 1.0);
}

function approximatePValue(f, df1, df2) {
  if (f <= 0 || isNaN(f)) return 1.0;
  const x = (df1 * f) / (df1 * f + df2);
  const pVal = 1 - regularizedIncompleteBeta(x, df1 / 2, df2 / 2);
  return isNaN(pVal) ? 1.0 : Math.max(0, Math.min(1, pVal));
}

// Helper to normalize all date formats to DD-MMM-YYYY (e.g. 17-Jun-2026)
function normalizeDateString(dateStr, fallbackDate = null) {
  if (!dateStr) {
    if (fallbackDate) return normalizeDateString(fallbackDate);
    return 'N/A';
  }
  try {
    let parsedDate = null;
    const parts = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      const year = parseInt(parts[3], 10);
      parsedDate = new Date(year, month, day);
    } else {
      parsedDate = new Date(dateStr);
    }
    
    if (isNaN(parsedDate.getTime())) {
      if (fallbackDate && fallbackDate !== dateStr) return normalizeDateString(fallbackDate);
      return 'N/A';
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = String(parsedDate.getDate()).padStart(2, '0');
    const m = months[parsedDate.getMonth()];
    const y = parsedDate.getFullYear();
    return `${d}-${m}-${y}`;
  } catch (e) {
    if (fallbackDate) return normalizeDateString(fallbackDate);
    return 'N/A';
  }
}

function isReductionMetric(key, category) {
  if (!key) return false;
  
  // Convert key/label to lowercase to check content
  const cleanKey = String(key).toLowerCase();
  
  // List of standard adverse keywords (where lower is better)
  const adverseKeywords = [
    'deficiency', 'severity', 'chlorosis', 'necrosis', 'pest', 'disease', 
    'injury', 'mortality', 'weed', 'damage', 'incidence', 'phytotoxicity', 
    'infestation', 'score_deficiency', 'score_injury', 'control_fail'
  ];
  
  if (adverseKeywords.some(keyword => cleanKey.includes(keyword))) {
    return true;
  }
  
  // Fallback for pesticide/herbicide/fungicide categories:
  // If the category is crop protection and it is NOT one of the beneficial growth keys, treat it as an adverse trait (lower is better)
  if (['herbicide', 'fungicide', 'pesticide'].includes(category)) {
    const growthKeys = ['yield', 'height', 'area', 'health', 'vigor', 'color', 'beneficial', 'quality', 'mass', 'length', 'nue', 'spad', 'biomass'];
    const isGrowth = growthKeys.some(gk => cleanKey.includes(gk));
    return !isGrowth;
  }
  
  return false;
}

// Helper: Normalize date string for chronological grouping
export function normalizeReportDateKey(val) {
  if (!val) return '';
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return '';
}

/**
 * Compute TRUE cell-level parameter data completeness across observation rows × active fields.
 * Never hardcodes 100% or counts only row presence.
 */
export function computeDataCompleteness(observations = [], activeFields = []) {
  const rows = Array.isArray(observations) ? observations : [];
  const fields = (Array.isArray(activeFields) ? activeFields : []).filter(
    f => f && f.key && !['nue', 'audpc', 'rootToShootRatio'].includes(f.key)
  );
  const totalRows = rows.length;
  const totalExpectedCells = totalRows * fields.length;

  let validCells = 0;
  let parametersWithMissing = 0;
  const perParameter = {};

  fields.forEach(f => {
    let validCount = 0;
    rows.forEach(obs => {
      if (!obs) return;
      if (f.key.toLowerCase().replace(/\s/g, '') === 'plantheight' && Array.isArray(obs.potHeights)) {
        const validHeights = obs.potHeights.map(h => parseFloat(h)).filter(v => Number.isFinite(v));
        if (validHeights.length > 0) {
          validCount++;
          return;
        }
      }
      const raw = obs[f.key];
      if (raw === undefined || raw === null || raw === '') return;
      if (f.key === 'flowerStage' || f.key === 'fruitHealthNote') {
        if (String(raw).trim().length > 0) validCount++;
        return;
      }
      const num = parseFloat(raw);
      if (!Number.isFinite(num)) return;
      if (f.key === 'fruitHealthScore' && num <= 0) return;
      validCount++;
    });

    const missingCount = Math.max(0, totalRows - validCount);
    if (missingCount > 0) parametersWithMissing++;
    validCells += validCount;
    perParameter[f.key] = {
      key: f.key,
      label: f.label || f.key,
      validCount,
      missingCount,
      totalRows,
      completenessPct: totalRows > 0 ? parseFloat(((validCount / totalRows) * 100).toFixed(1)) : 0
    };
  });

  const missingCells = Math.max(0, totalExpectedCells - validCells);
  const completenessPct = totalExpectedCells > 0
    ? parseFloat(((validCells / totalExpectedCells) * 100).toFixed(1))
    : 0;

  return {
    totalRows,
    parameterCount: fields.length,
    totalExpectedCells,
    validCells,
    missingCells,
    parametersWithMissing,
    completenessPct,
    perParameter
  };
}

function extractNumericMetricValue(obs, metricKey) {
  if (!obs || typeof obs !== 'object') return NaN;
  const raw = obs[metricKey];
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (String(metricKey).toLowerCase().replace(/\s/g, '') === 'plantheight' && Array.isArray(obs.potHeights)) {
    const valid = obs.potHeights.map(h => parseFloat(h)).filter(v => Number.isFinite(v));
    if (valid.length > 0) return valid.reduce((a, b) => a + b, 0) / valid.length;
  }
  return NaN;
}

/**
 * Identify ordinal / categorical phenological growth-stage fields (e.g. Flower Stage,
 * Growth Stage, BBCH Stage, Phenology) where ratio percentage-improvement calculations
 * (+2420%) and parametric ANOVA on mixed stage codes are scientifically invalid.
 */
export function isOrdinalOrStageField(field) {
  if (!field) return false;
  const key = typeof field === 'string' ? field : (field.key || '');
  const label = typeof field === 'string' ? field : (field.label || '');
  const type = typeof field === 'object' ? (field.type || '') : '';
  if (type === 'select' || type === 'categorical' || type === 'ordinal') return true;
  return /flowerstage|growthstage|bbch|phenolog|stage$/i.test(String(key).replace(/\s+/g, '')) ||
    /\b(flower\s*stage|growth\s*stage|bbch|phenology\s*stage)\b/i.test(String(label));
}

/**
 * Validate measurement scale consistency across all observations for a field.
 * Detects mixed coding systems (e.g. binary/ordinal 0–1 scores mixed with two-digit
 * BBCH codes such as 61, or numeric codes mixed with text stage labels) WITHOUT
 * altering or deleting raw measurements, and computes descriptive stage distributions.
 */
export function validateMeasurementScale(observations = [], field = {}, treatmentNames = []) {
  const key = typeof field === 'string' ? field : (field.key || '');
  const label = typeof field === 'string' ? field : (field.label || key);
  const rows = Array.isArray(observations) ? observations : [];
  const isStage = isOrdinalOrStageField(field);

  const nonEmpty = [];
  const numericEntries = [];
  const textEntries = [];

  rows.forEach((obs, idx) => {
    if (!obs || obs[key] === undefined || obs[key] === null || obs[key] === '') return;
    const raw = obs[key];
    const str = String(raw).trim();
    if (!str) return;
    const num = Number(str);
    const entry = {
      raw,
      str,
      num: Number.isFinite(num) ? num : null,
      plot: obs.plot || obs.plotNumber || `#${idx + 1}`,
      treatment: obs.treatment || treatmentNames[(parseInt(obs.treatmentNumber || 1, 10) - 1)] || `Treatment ${obs.treatmentNumber || 1}`,
      treatmentNumber: parseInt(obs.treatmentNumber || 1, 10),
      date: obs.date || 'N/A'
    };
    nonEmpty.push(entry);
    if (entry.num !== null) numericEntries.push(entry);
    else textEntries.push(entry);
  });

  // Detect mixed coding systems on growth-stage / ordinal fields
  let hasMixedCoding = false;
  let detectedScale = isStage ? 'ordinal-stage' : 'continuous-numeric';
  const flaggedEntries = [];

  if (nonEmpty.length > 0) {
    if (numericEntries.length > 0 && textEntries.length > 0) {
      hasMixedCoding = true;
      detectedScale = 'mixed-numeric-and-text';
      flaggedEntries.push(...numericEntries.slice(0, 3), ...textEntries.slice(0, 3));
    } else if (isStage && numericEntries.length > 0) {
      const smallOrdinal = numericEntries.filter(e => e.num >= 0 && e.num <= 5);
      const bbchLike = numericEntries.filter(e => e.num >= 10 && e.num <= 99);
      const outOfRange = numericEntries.filter(e => e.num < 0 || e.num > 99);
      if (smallOrdinal.length > 0 && bbchLike.length > 0) {
        hasMixedCoding = true;
        detectedScale = 'mixed-ordinal-and-bbch';
        flaggedEntries.push(...bbchLike);
      } else if (outOfRange.length > 0) {
        hasMixedCoding = true;
        detectedScale = 'inconsistent-stage-codes';
        flaggedEntries.push(...outOfRange);
      } else if (bbchLike.length > 0) {
        detectedScale = 'bbch-code';
      } else {
        detectedScale = 'ordinal-numeric';
      }
    } else if (isStage && textEntries.length > 0) {
      detectedScale = 'ordinal-categorical';
    }
  }

  // Compute descriptive stage frequency distribution per treatment
  const distributionByTreatment = {};
  nonEmpty.forEach(e => {
    const tName = e.treatment;
    if (!distributionByTreatment[tName]) {
      distributionByTreatment[tName] = { n: 0, counts: {} };
    }
    distributionByTreatment[tName].n++;
    const codeKey = e.str;
    distributionByTreatment[tName].counts[codeKey] = (distributionByTreatment[tName].counts[codeKey] || 0) + 1;
  });

  let warningMessage = null;
  if (hasMixedCoding) {
    const samplePlots = flaggedEntries
      .slice(0, 4)
      .map(e => `Plot ${e.plot} (${e.treatment}, ${e.date}) = ${e.str}`)
      .join('; ');
    warningMessage = `Measurement Scale Verification Required (${label}): Inconsistent coding systems detected (${detectedScale.replace(/-/g, ' ')}) — e.g. ${samplePlots}. Do NOT mix BBCH codes with 0/1 ordinal scores; verify and standardize the scale before statistical interpretation. Raw values were NOT altered or deleted.`;
  }

  return {
    key,
    label,
    isOrdinalStage: isStage,
    totalValid: nonEmpty.length,
    hasMixedCoding,
    detectedScale,
    flaggedEntries,
    distributionByTreatment,
    warningMessage
  };
}

/**
 * Detect anomalous / extreme outlier values across continuous numeric parameters without
 * modifying or deleting raw field observations (e.g. Plant Height = 0 cm when other plots
 * are 20–30 cm). Skips ordinal/stage fields (handled by validateMeasurementScale) and
 * skips legitimate bounded 0–10 symptom scores within [0, 10].
 */
export function detectAnomalousObservations(observations = [], activeFields = []) {
  const anomalies = [];
  const rows = Array.isArray(observations) ? observations : [];
  const fields = (Array.isArray(activeFields) ? activeFields : []).filter(
    f => f && f.key && !['nue', 'audpc', 'rootToShootRatio', 'fruitHealthNote'].includes(f.key) && !isOrdinalOrStageField(f)
  );

  fields.forEach(f => {
    const entries = [];
    rows.forEach((obs, idx) => {
      const val = extractNumericMetricValue(obs, f.key);
      if (Number.isFinite(val)) {
        entries.push({ val, obs, idx });
      }
    });
    if (entries.length < 4) return;

    const isBounded0to10 = /\(0-10\)/i.test(f.label || '') || (f.min === 0 && f.max === 10);
    const isPercentSymptom = /chlorosis|deficiency|necrosis|severity|incidence/i.test(f.key || f.label || '');

    const vals = entries.map(e => e.val);
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (vals.length - 1);
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

    const absDevs = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b);
    const madMid = Math.floor(absDevs.length / 2);
    const mad = absDevs.length % 2 !== 0 ? absDevs[madMid] : (absDevs[madMid - 1] + absDevs[madMid]) / 2;

    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    entries.forEach(({ val, obs, idx }) => {
      // Do not falsely flag legitimate low-incidence symptom readings inside their valid 0–10 or 0–25% scale
      if (isBounded0to10 && val >= 0 && val <= 10) return;
      if (isPercentSymptom && val >= 0 && val <= 25 && median === 0) return;

      let isExtreme = false;
      let reason = '';

      if (mad > 0) {
        const modZ = (0.6745 * Math.abs(val - median)) / mad;
        if (modZ > 3.5 && Math.abs(val - median) > Math.max(2 * iqr, 1)) {
          isExtreme = true;
          reason = `Modified Z-score = ${modZ.toFixed(1)}`;
        }
      } else if (stdDev > 0) {
        const z = Math.abs(val - mean) / stdDev;
        const gap = Math.abs(val - median);
        if ((z >= 3.0 && gap >= Math.max(10, 5 * Math.max(1, iqr))) || (gap >= 10 && val >= 10 * Math.max(1, Math.abs(median)))) {
          isExtreme = true;
          reason = `Extreme spike (Z = ${z.toFixed(1)}, CV = ${cv.toFixed(1)}%)`;
        }
      }

      if (isExtreme) {
        const plot = obs.plot || obs.plotNumber || `#${idx + 1}`;
        const trt = obs.treatment || `Treatment ${obs.treatmentNumber || 1}`;
        const dateStr = obs.date || 'N/A';
        anomalies.push({
          fieldKey: f.key,
          fieldLabel: f.label || f.key,
          plot,
          treatment: trt,
          date: dateStr,
          value: val,
          median,
          cv: parseFloat(cv.toFixed(1)),
          reason,
          message: `Anomalous Value Flag (Requires Field Verification): Plot ${plot} (${trt}, ${dateStr}) has ${f.label || f.key} = ${val} vs dataset median = ${median.toFixed(2)} (${reason}). Value was NOT altered or deleted — verify whether this is a genuine reading, unit mismatch, or data entry error.`
        });
      }
    });
  });

  return anomalies;
}

/**
 * Prevent statistical pseudoreplication:
 * Repeated measurements of the same experimental plots across multiple assessment dates
 * MUST NOT be pooled as independent replicates in a single RCBD/CRD ANOVA.
 *
 * Selects the latest valid post-application assessment date (keeping pre-application baseline
 * separate unless includeBaseline=true or targetDateKey is explicitly specified) and aggregates
 * any sub-samples per experimental unit (treatment × replication) to 1 value per unit.
 */
export function selectIndependentAssessmentSlice(data, metricKey, options = {}) {
  const validRows = (data || []).filter(obs => Number.isFinite(extractNumericMetricValue(obs, metricKey)));

  if (validRows.length === 0) {
    return {
      sliceData: [],
      analyzedDate: null,
      analyzedDaa: null,
      totalDatesObserved: 0,
      isRepeatedMeasuresSliced: false,
      isPreApplicationBaseline: false,
      baselineDatesExcluded: 0
    };
  }

  const startDateKey = normalizeReportDateKey(options.trialStartDate);
  const isBaselineRow = (obs) => {
    const daaNum = obs.daa !== undefined && obs.daa !== null && obs.daa !== '' ? Number(obs.daa) : null;
    if (daaNum !== null && !isNaN(daaNum) && daaNum < 0) return true;
    if (startDateKey) {
      const ok = normalizeReportDateKey(obs.date);
      if (ok && ok < startDateKey) return true;
    }
    return false;
  };

  // Group valid rows by assessment date (or DAA fallback if date absent)
  const dateBuckets = new Map();
  validRows.forEach(obs => {
    const normDate = normalizeReportDateKey(obs.date);
    const daaNum = obs.daa !== undefined && obs.daa !== null && obs.daa !== '' ? Number(obs.daa) : null;
    const bucketKey = normDate || (daaNum !== null && !isNaN(daaNum) ? `DAA:${daaNum}` : 'SINGLE');
    if (!dateBuckets.has(bucketKey)) {
      dateBuckets.set(bucketKey, {
        key: bucketKey,
        normDate,
        daa: daaNum,
        rows: [],
        treatments: new Set(),
        isBaseline: isBaselineRow(obs)
      });
    }
    const b = dateBuckets.get(bucketKey);
    b.rows.push(obs);
    b.treatments.add(parseInt(obs.treatmentNumber || obs.treatment || obs.Treatment || 1));
    if (b.daa === null && daaNum !== null && !isNaN(daaNum)) b.daa = daaNum;
  });

  const totalDatesObserved = dateBuckets.size;
  let chosenBucket = null;
  let baselineDatesExcluded = 0;

  if (options.targetDateKey) {
    if (!dateBuckets.has(options.targetDateKey)) {
      // Explicit date requested but this parameter has NO measurements on that date — NEVER fall back to another date!
      return {
        sliceData: [],
        analyzedDate: options.targetDateKey,
        analyzedDaa: null,
        totalDatesObserved,
        isRepeatedMeasuresSliced: totalDatesObserved > 1,
        isPreApplicationBaseline: false,
        baselineDatesExcluded: 0
      };
    }
    chosenBucket = dateBuckets.get(options.targetDateKey);
  } else {
    const allBuckets = Array.from(dateBuckets.values());
    const postAppBuckets = options.includeBaseline ? allBuckets : allBuckets.filter(b => !b.isBaseline);
    baselineDatesExcluded = allBuckets.length - postAppBuckets.length;
    const candidateBuckets = postAppBuckets.length > 0 ? postAppBuckets : allBuckets;

    // Sort newest date / highest DAA first, prefer latest date with >= 2 treatments
    const sortedBuckets = candidateBuckets.sort((a, b) => {
      if (a.normDate && b.normDate && a.normDate !== b.normDate) return b.normDate.localeCompare(a.normDate);
      return (b.daa ?? -999) - (a.daa ?? -999);
    });
    chosenBucket = sortedBuckets.find(b => b.treatments.size >= 2) || sortedBuckets[0];
  }

  // Collapse any duplicate sub-samples per experimental unit (treatment × replication) on that date
  const unitMap = new Map();
  chosenBucket.rows.forEach(obs => {
    const trt = parseInt(obs.treatmentNumber || obs.treatment || obs.Treatment || 1);
    const rep = parseInt(obs.replication || obs.rep || obs.Replication || 1);
    const unitKey = `${trt}_${rep}`;
    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, { obs, vals: [] });
    }
    unitMap.get(unitKey).vals.push(extractNumericMetricValue(obs, metricKey));
  });

  const sliceData = Array.from(unitMap.values()).map(({ obs, vals }) => ({
    ...obs,
    [metricKey]: vals.reduce((s, v) => s + v, 0) / vals.length
  }));

  return {
    sliceData,
    analyzedDate: chosenBucket.normDate || chosenBucket.rows[0]?.date || null,
    analyzedDaa: chosenBucket.daa,
    totalDatesObserved,
    isRepeatedMeasuresSliced: totalDatesObserved > 1,
    isPreApplicationBaseline: Boolean(chosenBucket.isBaseline),
    baselineDatesExcluded
  };
}

// Perform ANOVA (RCB or CRD) on statistically independent experimental units with strict eligibility & scale checks
export function calculateAnovaRCB(data, metricKey, category = 'nutrition', design = 'RCBD', options = {}) {
  // Ordinal / phenological growth-stage fields (e.g. Flower Stage, BBCH) are NOT ratio variables:
  // never compute parametric ANOVA or +2420% ratio improvement on ordinal or mixed stage codes!
  if (isOrdinalOrStageField({ key: metricKey, label: options.fieldLabel || metricKey })) {
    const scaleReport = validateMeasurementScale(data || [], { key: metricKey, label: options.fieldLabel || metricKey });
    if (scaleReport.hasMixedCoding) {
      return {
        error: 'NOT ANALYSED – Mixed/inconsistent coding scale detected; requires data verification before statistical interpretation',
        ineligible: true,
        ineligibleReason: 'mixed-scale',
        scaleReport,
        analyzedDate: null,
        analyzedDateKey: null,
        analyzedDaa: null,
        nIndependentUnits: scaleReport.totalValid,
        totalDatesObserved: 0,
        isRepeatedMeasuresSliced: false,
        isPreApplicationBaseline: false
      };
    }
    return {
      error: 'NOT ANALYSED – Ordinal/phenological growth-stage scale (parametric ANOVA and % improvement not applicable; see stage frequency distribution)',
      ineligible: true,
      ineligibleReason: 'ordinal-scale',
      scaleReport,
      analyzedDate: null,
      analyzedDateKey: null,
      analyzedDaa: null,
      nIndependentUnits: scaleReport.totalValid,
      totalDatesObserved: 0,
      isRepeatedMeasuresSliced: false,
      isPreApplicationBaseline: false
    };
  }

  const {
    sliceData,
    analyzedDate,
    analyzedDaa,
    totalDatesObserved,
    isRepeatedMeasuresSliced,
    isPreApplicationBaseline,
    baselineDatesExcluded
  } = selectIndependentAssessmentSlice(data, metricKey, options);

  const values = [];
  const trtGroups = {};
  const repGroups = {};
  
  sliceData.forEach(obs => {
    const val = parseFloat(obs[metricKey]);
    const trt = parseInt(obs.treatmentNumber || obs.treatment || obs.Treatment || 1);
    const rep = parseInt(obs.replication || obs.rep || obs.Replication || 1);
    if (!isNaN(val)) {
      values.push(val);
      if (!trtGroups[trt]) trtGroups[trt] = [];
      trtGroups[trt].push(val);
      if (!repGroups[rep]) repGroups[rep] = [];
      repGroups[rep].push(val);
    }
  });

  const N = values.length;
  const t = Object.keys(trtGroups).length;
  const b = Object.keys(repGroups).length;
  const formattedDate = analyzedDate ? normalizeDateString(analyzedDate) : null;
  
  // RCBD Pot Trials with >= 2 replications MUST be analyzed as RCBD (blocking on Rep/Row),
  // matching both the experimental design metadata and Regulatory PDF DF (e.g. Trt=3, Blk=4, Err=12, Total=19).
  const isCrd = design === 'CRD' || b < 2;

  // Strict statistical eligibility validation before ANOVA:
  // 1) Require >= 2 treatments (and all expected treatments represented if expectedTreatments >= 2)
  // 2) Every represented treatment must have >= 2 valid independent replicates
  // 3) RCBD requires >= 2 blocks and N >= 4
  const trtRepCounts = Object.values(trtGroups).map(arr => arr.length);
  const minTrtReps = trtRepCounts.length > 0 ? Math.min(...trtRepCounts) : 0;
  const expectedTrts = Number(options.expectedTreatments) || 0;

  if (
    N < 4 ||
    t < 2 ||
    (!isCrd && b < 2) ||
    minTrtReps < 2 ||
    (expectedTrts >= 2 && t < expectedTrts)
  ) {
    return {
      error: 'NOT ANALYSED – Insufficient valid observations',
      ineligible: true,
      ineligibleReason: 'insufficient',
      analyzedDate: formattedDate,
      analyzedDateKey: analyzedDate || null,
      analyzedDaa,
      nIndependentUnits: N,
      totalDatesObserved,
      isRepeatedMeasuresSliced,
      isPreApplicationBaseline
    };
  }

  const allIdentical = values.every(v => v === values[0]);
  if (allIdentical) {
    return {
      error: 'NOT ANALYSED – Constant values across all experimental units (zero variance)',
      ineligible: true,
      ineligibleReason: 'constant',
      analyzedDate: formattedDate,
      analyzedDateKey: analyzedDate || null,
      analyzedDaa,
      nIndependentUnits: N,
      totalDatesObserved,
      isRepeatedMeasuresSliced,
      isPreApplicationBaseline
    };
  }

  const grandMean = values.reduce((a, b) => a + b, 0) / N;
  
  // Check if design is balanced
  const counts = {};
  let isBalanced = true;
  sliceData.forEach(obs => {
    const trt = parseInt(obs.treatmentNumber || obs.treatment || obs.Treatment || 1);
    const rep = parseInt(obs.replication || obs.rep || obs.Replication || 1);
    const key = `${trt}_${rep}`;
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] > 1) isBalanced = false;
  });
  if (Object.keys(counts).length !== t * b) {
    isBalanced = false;
  }

  // SSTotal
  let ssTotal = 0;
  values.forEach(y => { ssTotal += Math.pow(y - grandMean, 2); });

  let ssTreatments = 0;
  let ssBlocks = 0;
  let ssError = 0;

  let dfTreatments = t - 1;
  let dfBlocks = isCrd ? 0 : b - 1;
  let dfError = isCrd ? (N - t) : (dfTreatments * dfBlocks);
  let dfTotal = N - 1;
  if (dfError < 1) dfError = 1;

  let msTreatments = 0;
  let msBlocks = 0;
  let msError = 0;

  let fStatistic = 0;
  let fBlock = 0;

  let pValue = 1.0;
  let pBlock = 1.0;

  let useTypeIII = false;
  if (!isBalanced && !isCrd) {
    const mockTrials = sliceData.map(obs => ({
      FormulationName: String(obs.treatmentNumber || obs.treatment || obs.Treatment || 1),
      Replication: String(obs.replication || obs.rep || obs.Replication || 1),
      EfficacyDataJSON: JSON.stringify([{
        [metricKey]: parseFloat(obs[metricKey])
      }])
    }));
    const typeIII = performTypeIIIANOVA(mockTrials, { metric: metricKey });
    if (typeIII && !typeIII.error && typeIII.anovaTable) {
      const table = typeIII.anovaTable;
      ssTreatments = table.ss[0];
      ssBlocks = table.ss[1];
      ssError = table.ss[2];
      
      dfTreatments = table.df[0];
      dfBlocks = table.df[1];
      dfError = table.df[2];
      dfTotal = table.df[3];
      
      msTreatments = table.ms[0];
      msBlocks = table.ms[1];
      msError = table.ms[2];
      
      fStatistic = table.f[0] || 0;
      fBlock = table.f[1] || 0;
      
      pValue = table.p[0] ?? 1.0;
      pBlock = table.p[1] ?? 1.0;
      useTypeIII = true;
    }
  }

  if (!useTypeIII) {
    // SSTreatments
    ssTreatments = 0;
    Object.keys(trtGroups).forEach(trt => {
      const trtVals = trtGroups[trt];
      const trtMean = trtVals.reduce((a, b) => a + b, 0) / trtVals.length;
      ssTreatments += trtVals.length * Math.pow(trtMean - grandMean, 2);
    });

    if (isCrd) {
      ssBlocks = 0;
      ssError = Math.max(0, ssTotal - ssTreatments);
    } else {
      // SSBlocks (Replications)
      ssBlocks = 0;
      Object.keys(repGroups).forEach(rep => {
        const repVals = repGroups[rep];
        const repMean = repVals.reduce((a, b) => a + b, 0) / repVals.length;
        ssBlocks += repVals.length * Math.pow(repMean - grandMean, 2);
      });
      ssError = Math.max(0, ssTotal - ssTreatments - ssBlocks);
    }

    // MS
    msTreatments = ssTreatments / dfTreatments;
    msBlocks = isCrd ? 0 : ssBlocks / dfBlocks;
    msError = ssError / dfError;

    // F
    fStatistic = msError > 0 ? msTreatments / msError : 0;
    fBlock = (!isCrd && msError > 0) ? msBlocks / msError : 0;

    // p-values
    pValue = approximatePValue(fStatistic, dfTreatments, dfError);
    pBlock = isCrd ? 1.0 : approximatePValue(fBlock, dfBlocks, dfError);
  }

  // Advanced post-hoc statistics: CV, SEM, LSD
  const tCritical5 = getStudentTCritical(0.05, dfError);
  const tCritical1 = getStudentTCritical(0.01, dfError);
  const repDivisor = isCrd ? (N / t) : b;
  const lsd = tCritical5 * Math.sqrt((2 * msError) / (repDivisor || 1));
  const lsd1 = tCritical1 * Math.sqrt((2 * msError) / (repDivisor || 1));
  const sem = Math.sqrt(msError / (repDivisor || 1));
  const cv = grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0;

  // Compute means, SDs, SEs dynamically for ALL treatments
  const treatmentMeans = {};
  Object.keys(trtGroups).forEach(trt => {
    const trtVals = trtGroups[trt];
    const trtMean = trtVals.reduce((a, b) => a + b, 0) / trtVals.length;
    const trtVar = trtVals.length > 1 ? trtVals.reduce((a, b) => a + Math.pow(b - trtMean, 2), 0) / (trtVals.length - 1) : 0;
    const trtSD = Math.sqrt(trtVar);
    const trtSE = trtSD / Math.sqrt(trtVals.length || 1);
    
    treatmentMeans[trt] = {
      n: trtVals.length,
      mean: trtMean,
      sd: trtSD,
      se: trtSE,
      ci_lower: trtMean - 1.96 * trtSE,
      ci_upper: trtMean + 1.96 * trtSE,
      group: 'a'
    };
  });

  // Assign letters dynamically based on LSD post-hoc separation
  const sortedTrts = Object.keys(treatmentMeans).map(t => parseInt(t)).sort((a, b) => treatmentMeans[b].mean - treatmentMeans[a].mean);
  let currentGroupChar = 97; // 'a'
  const groups = {};
  sortedTrts.forEach((trt, idx) => {
    if (idx === 0) {
      groups[trt] = String.fromCharCode(currentGroupChar);
    } else {
      const prevTrt = sortedTrts[idx - 1];
      const diff = treatmentMeans[prevTrt].mean - treatmentMeans[trt].mean;
      if (diff > lsd) {
        currentGroupChar++;
      }
      groups[trt] = String.fromCharCode(currentGroupChar);
    }
  });
  
  Object.keys(treatmentMeans).forEach(trt => {
    treatmentMeans[trt].group = groups[trt] || 'a';
  });

  const cMean = treatmentMeans[1]?.mean || 0;
  const tMean = treatmentMeans[2]?.mean || 0;

  return {
    ss_treatment: ssTreatments,
    df_treatment: dfTreatments,
    ms_treatment: msTreatments,
    f_value: fStatistic,
    p_value: pValue,
    grandMean: grandMean,

    ss_block: ssBlocks,
    df_block: dfBlocks,
    ms_block: msBlocks,
    f_block: fBlock,
    p_block: pBlock,

    ss_error: ssError,
    df_error: dfError,
    ms_error: msError,

    ss_total: ssTotal,
    df_total: dfTotal,

    analyzedDate: analyzedDate ? normalizeDateString(analyzedDate) : null,
    analyzedDateKey: analyzedDate || null,
    analyzedDaa: analyzedDaa,
    nIndependentUnits: N,
    totalDatesObserved,
    isRepeatedMeasuresSliced,
    isPreApplicationBaseline,
    baselineDatesExcluded,
    modelType: isCrd ? 'CRD' : 'RCBD',
    controlBaselineZero: cMean <= 0,

    cv,
    sem,
    lsd,
    lsd1,
    
    control_group: treatmentMeans[1]?.group || 'a',
    treatment_group: treatmentMeans[2]?.group || 'a',

    control_mean: cMean,
    control_sd: treatmentMeans[1]?.sd || 0,
    control_se: treatmentMeans[1]?.se || 0,
    control_ci_lower: treatmentMeans[1]?.ci_lower || 0,
    control_ci_upper: treatmentMeans[1]?.ci_upper || 0,

    treatment_mean: tMean,
    treatment_sd: treatmentMeans[2]?.sd || 0,
    treatment_se: treatmentMeans[2]?.se || 0,
    treatment_ci_lower: treatmentMeans[2]?.ci_lower || 0,
    treatment_ci_upper: treatmentMeans[2]?.ci_upper || 0,

    treatmentMeans,

    efficacy_percent: (() => {
      if (category === 'pesticide' && metricKey === 'pestCount') {
        const sortedDates = [...new Set((data || []).map(o => normalizeReportDateKey(o.date)).filter(Boolean))].sort();
        if (sortedDates.length > 1) {
          const baselineDate = sortedDates[0];
          const baselineObs = (data || []).filter(o => normalizeReportDateKey(o.date) === baselineDate);
          const cBaseline = baselineObs.filter(o => parseInt(o.treatmentNumber || o.treatment || 1) === 1).map(o => parseFloat(o[metricKey])).filter(v => !isNaN(v));
          const tBaseline = baselineObs.filter(o => parseInt(o.treatmentNumber || o.treatment || 2) === 2).map(o => parseFloat(o[metricKey])).filter(v => !isNaN(v));
          
          const cb = cBaseline.length ? cBaseline.reduce((s,v) => s+v, 0)/cBaseline.length : 0;
          const tb = tBaseline.length ? tBaseline.reduce((s,v) => s+v, 0)/tBaseline.length : 0;
          const ca = cMean;
          const ta = tMean;
          if (tb > 0 && ca > 0) {
            return parseFloat(((1 - (ta * cb) / (tb * ca)) * 100).toFixed(2));
          }
        }
      }
      if (cMean <= 0) return null;
      return isReductionMetric(metricKey, category) ? ((cMean - tMean) / cMean) * 100 : ((tMean - cMean) / cMean) * 100;
    })()
  };
}

// Compile structured statistical interpretations to feed the AI prompt
function compileAgronomicInterpretation(observations, activeFields, treatmentNames, category, design, trialStartDate = null) {
  const analyzedSummaries = [];
  const excludedSummaries = [];
  
  activeFields.forEach(f => {
    const anova = calculateAnovaRCB(observations, f.key, category, design, {
      trialStartDate,
      expectedTreatments: treatmentNames.length,
      fieldLabel: f.label
    });
    if (anova.error) {
      excludedSummaries.push(`- ${f.label}: EXCLUDED from parametric ANOVA (${anova.error}).`);
      return;
    }

    const isSig = anova.p_value < 0.05;
    const sortedTrts = Object.entries(anova.treatmentMeans)
      .map(([trtNum, stats]) => ({
        trtNum: parseInt(trtNum),
        name: treatmentNames[parseInt(trtNum) - 1] || `Treatment ${trtNum}`,
        mean: stats.mean,
        group: stats.group
      }))
      .sort((a, b) => b.mean - a.mean);

    if (sortedTrts.length === 0) return;

    const best = sortedTrts[0];
    const worst = sortedTrts[sortedTrts.length - 1];
    
    const controlStats = anova.treatmentMeans[1];
    let impStr = '';
    if (controlStats && controlStats.mean > 0) {
      if (best.trtNum === 1) {
        impStr = `with the untreated control achieving the highest numerical mean among all treatments.`;
      } else {
        const bestImp = ((best.mean - controlStats.mean) / controlStats.mean) * 100;
        impStr = `with the highest numerical mean (${best.name}) showing a ${bestImp >= 0 ? '+' : ''}${bestImp.toFixed(1)}% difference compared to control.`;
      }
    } else if (controlStats && controlStats.mean <= 0) {
      impStr = `(percentage change vs control is N/A because the control baseline is zero).`;
    }

    const isMeanNearZero = anova.grandMean < 2.0 || 
      ((/deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.key)) && anova.grandMean < 5.0);
    const cvRating = anova.cv < 10 ? 'Excellent' : anova.cv <= 20 ? 'Good' : anova.cv <= 30 ? 'Acceptable' : 'Poor';
    const cvInfo = !isMeanNearZero ? ` (CV: ${anova.cv.toFixed(1)}% - ${cvRating} precision)` : '';
    const sliceContext = `[Latest Post-App ${anova.modelType} ANOVA on ${anova.analyzedDate || 'latest date'}, DAA ${anova.analyzedDaa ?? 'N/A'}, n=${anova.nIndependentUnits} independent units, DF=${anova.df_treatment},${anova.df_error}]`;

    if (anova.f_value === 0 && anova.p_value === 1) {
      analyzedSummaries.push(`- ${f.label} ${sliceContext}: Measurements were identical across all treatments and replicates.`);
      return;
    }

    analyzedSummaries.push(`- ${f.label} ${sliceContext}: ${isSig ? 'Statistically significant' : 'No statistically significant'} differences between treatments (p = ${anova.p_value.toFixed(4)})${cvInfo}. Highest numerical mean: ${best.name} (${best.mean.toFixed(2)}, Group '${best.group}'); lowest: ${worst.name} (${worst.mean.toFixed(2)}, Group '${worst.group}') ${impStr}`);
  });

  const summaries = [];
  summaries.push('STATISTICALLY ANALYSED PARAMETERS (Latest Post-Application Independent RCBD/CRD ANOVA — distinct from overall multi-date descriptive summaries):');
  summaries.push(...(analyzedSummaries.length ? analyzedSummaries : ['- None met statistical eligibility criteria.']));

  if (excludedSummaries.length > 0) {
    summaries.push('PARAMETERS EXCLUDED FROM PARAMETRIC ANOVA (Not Analysed Statistically):');
    summaries.push(...excludedSummaries);
  }

  // Explicitly report whether yield was actually measured
  const hasRecordedYield = (observations || []).some(o => {
    const raw = o?.yield ?? o?.Yield ?? o?.yieldKgPlot;
    return raw !== undefined && raw !== null && raw !== '' && Number.isFinite(parseFloat(raw));
  });
  if (!hasRecordedYield) {
    summaries.push('Yield Status: No harvest or yield observations were recorded in this dataset. Yield performance cannot be evaluated and NO yield efficacy conclusion may be drawn.');
  }

  // Summarize reproductive stage (Flower Stage) if observed in plots
  const flowerStages = (observations || [])
    .map(o => o.flowerStage)
    .filter(s => s && s !== 'none');
  if (flowerStages.length > 0) {
    const stageCounts = {};
    flowerStages.forEach(s => { stageCounts[s] = (stageCounts[s] || 0) + 1; });
    const dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0][0];
    summaries.push(`Reproductive Phenology: Flowers were observed across plots with dominant stage '${dominantStage}' (${flowerStages.length} recorded observation points).`);
  }

  // Summarize fruit disorders (Fruit Health) if observed in plots
  const fruitHealthNotes = (observations || [])
    .map(o => o.fruitHealthNote)
    .filter(n => n && n !== 'none' && n !== 'healthy');
  if (fruitHealthNotes.length > 0) {
    const noteCounts = {};
    fruitHealthNotes.forEach(n => { noteCounts[n] = (noteCounts[n] || 0) + 1; });
    const noteSummary = Object.entries(noteCounts).map(([k, v]) => `${k} (${v} plots)`).join(', ');
    summaries.push(`Fruit Quality Observation: Specific fruit disorders detected in field canopy photos: ${noteSummary}.`);
  }

  return summaries.join('\n');
}

// Local helper to calculate Excess Green (ExG) index from a base64 image (NDVI surrogate)
function calculateExGFromBase64(base64Str) {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve({ exgMean: 0.12, healthPct: 75, stressPct: 15 });
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = Math.min(1, 200 / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const total = canvas.width * canvas.height;
        let sumExG = 0;
        let healthy = 0;
        let stress = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i] / 255;
          const g = pixels[i + 1] / 255;
          const b = pixels[i + 2] / 255;
          const exg = 2 * g - r - b;
          sumExG += exg;
          if (exg > 0.1) healthy++;
          else if (exg >= 0) stress++;
        }
        const mean = sumExG / total;
        resolve({
          exgMean: mean,
          healthPct: (healthy / total) * 100,
          stressPct: (stress / total) * 100
        });
      } catch (e) {
        resolve({ exgMean: 0.12, healthPct: 75, stressPct: 15 });
      }
    };
    img.onerror = () => resolve({ exgMean: 0.12, healthPct: 75, stressPct: 15 });
    img.src = base64Str;
  });
}

function toBase64(src, maxPx = 400) {
  return new Promise(resolve => {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(null), 8000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const r = img.width / img.height;
          let w = img.width, h = img.height;
          if (w > maxPx || h > maxPx) {
            if (r > 1) { w = maxPx; h = Math.round(maxPx / r); }
            else { h = maxPx; w = Math.round(maxPx * r); }
          }
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.85));
        } catch { resolve(null); }
      };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      
      if (src && !src.startsWith('data:image/')) {
        const driveMatch = src.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
                           src.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
                           src.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
        if (driveMatch) {
          const directUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
          img.src = `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=${maxPx}&output=jpg`;
        } else if (/^https?:\/\//i.test(src)) {
          img.src = `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${maxPx}&output=jpg`;
        } else {
          img.src = src;
        }
      } else {
        img.src = src;
      }
    } catch { resolve(null); }
  });
}

// Local helper to convert human-readable label to camelCase key
function labelToKey(label) {
  if (!label) return '';
  const clean = label.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  return parts.map((p, idx) => {
    if (idx === 0) return p.toLowerCase();
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join('');
}

export class AdvancedReportGenerator {
  constructor(trialOrTrials, category = 'nutrition', project = null) {
    this.category = category;
    this.config = getCategoryConfig(category);
    this.workbook = new ExcelJS.Workbook();
    this.workbook.calcProperties.fullCalcOnLoad = true;
    
    // Find representative trial to determine if it is a PotTrial
    const isArr = Array.isArray(trialOrTrials);
    const representative = isArr ? (trialOrTrials[0] || {}) : trialOrTrials;
    
    // Attempt to lookup backup project if design or custom pot fields are needed
    const projects = getBackupProjects();
    const proj = project || projects.find(p => String(p.ID) === String(representative.ProjectID));
    this.project = proj || null;
    
    // Start with category default observation fields
    const combinedFields = [...(this.config.observationFields || [])];

    // If it's a Pot Trial, also merge the custom pot fields mapped to their camelCase keys
    if (proj?.Design === 'PotTrial' || representative?.Design === 'PotTrial') {
      const potFields = proj?.PotFields || representative?.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'];
      potFields.forEach(f => {
        const key = labelToKey(f);
        if (key && !combinedFields.some(existing => existing.key === key)) {
          combinedFields.push({ key, label: f });
        }
      });
    }
    this.activeFields = combinedFields;

    // Append category-specific advanced agronomic metrics
    // NOTE: These derived metrics are only included if actual data exists for them.
    // They are added tentatively here and pruned after observations are loaded (see end of constructor).
    if (this.category === 'biostimulant') {
      this.activeFields.push({ key: 'rootToShootRatio', label: 'Root-to-Shoot Ratio' });
    } else if (this.category === 'fungicide') {
      this.activeFields.push({ key: 'audpc', label: 'AUDPC' });
    } else if (this.category === 'nutrition') {
      this.activeFields.push({ key: 'nue', label: 'Nutrient Use Efficiency (NUE)' });
    }

    // Visual/morphological indicators: tentatively supported across any treatment/category
    if (!this.activeFields.some(f => f.key === 'leafGlossScore')) {
      this.activeFields.push({ key: 'leafGlossScore', label: 'Leaf Gloss / Luster (0-10)' });
    }
    if (!this.activeFields.some(f => f.key === 'fruitHealthScore')) {
      this.activeFields.push({ key: 'fruitHealthScore', label: 'Fruit Health Score (0-10)' });
    }
    if (!this.activeFields.some(f => f.key === 'flowerStage')) {
      this.activeFields.push({ key: 'flowerStage', label: 'Flower Stage' });
    }

    if (Array.isArray(trialOrTrials)) {
      // It's a list of trials (project-wide consolidated export)
      this.isProjectWide = true;
      this.trials = trialOrTrials;
      
      // Let's create a combined/representative trial object for single-trial compatibility fields
      const firstTrial = trialOrTrials[0] || {};
      const isCleanMeta = (v) => v && !/^(various|n\/a|not specified|unknown|—|-)$/i.test(String(v).trim());
      const resolvedLocation = isCleanMeta(proj?.Location)
        ? String(proj.Location).trim()
        : (trialOrTrials.find(t => isCleanMeta(t?.Location))?.Location || firstTrial.Location || 'Not specified');
      const resolvedInvestigator = isCleanMeta(proj?.Investigator)
        ? String(proj.Investigator).trim()
        : (trialOrTrials.find(t => isCleanMeta(t?.InvestigatorName))?.InvestigatorName || firstTrial.InvestigatorName || 'Project Team');
      const resolvedCrop = isCleanMeta(proj?.Crop)
        ? String(proj.Crop).trim()
        : (firstTrial.CropCrop || firstTrial.Crop || 'N/A');
      const resolvedStartDate = proj?.StartDate || firstTrial.Date || trialOrTrials.find(t => t?.Date)?.Date || 'N/A';

      this.trial = {
        ID: proj?.ID || `PROJ-${firstTrial.ProjectID || 'ALL'}`,
        FormulationName: firstTrial.FormulationName || 'Consolidated Project Plots',
        Crop: resolvedCrop,
        CropCrop: resolvedCrop,
        InvestigatorName: resolvedInvestigator,
        Location: resolvedLocation,
        Dosage: firstTrial.Dosage || 'Various',
        Replication: 'Multiple',
        Date: resolvedStartDate,
        Temperature: firstTrial.Temperature,
        Humidity: firstTrial.Humidity,
        Windspeed: firstTrial.Windspeed,
        Rain: firstTrial.Rain,
        SoilDataJSON: firstTrial.SoilDataJSON,
        AISummariesJSON: '{}'
      };

      const uniqueTreatments = [...new Set(trialOrTrials.map(t => t.FormulationName || 'Untreated Control'))];
      let utcIdx = uniqueTreatments.findIndex(n => /untreated|utc|negative\s*control/i.test(n));
      if (utcIdx === -1) {
        utcIdx = uniqueTreatments.findIndex(n => /control/i.test(n));
      }
      if (utcIdx === -1) {
        utcIdx = uniqueTreatments.findIndex(n => /check/i.test(n));
      }
      if (utcIdx > -1) {
        const [utc] = uniqueTreatments.splice(utcIdx, 1);
        uniqueTreatments.unshift(utc);
      }
      this.design = proj?.Design || representative?.Design || 'RCBD';
      this.treatmentNames = uniqueTreatments;

      // Aggregate all observations from all sub-trials
      this.observations = [];
      this.photos = [];
      const seenProjectPhotoKeys = new Set();
      
      trialOrTrials.forEach(t => {
        const obsList = safeJsonParse(t.EfficacyDataJSON, []);
        const photoList = safeJsonParse(t.PhotoURLs, []);
        const trtName = t.FormulationName || (t.IsControl ? 'Untreated Check (Control)' : 'Treated');
        let trtNum = uniqueTreatments.indexOf(trtName) + 1;
        if (trtNum === 0) trtNum = 1;
        
        // Tag observations with treatment name to distinguish them in Consolidated report
        obsList.forEach(obs => {
          const cleanedObs = { ...obs };
          (this.config.observationFields || []).forEach(f => {
            if (f.type === 'number' && cleanedObs[f.key] !== undefined && cleanedObs[f.key] !== null && cleanedObs[f.key] !== '') {
              let v = parseFloat(cleanedObs[f.key]);
              if (!isNaN(v)) {
                if (f.max === 10 && v > 10 && v <= 100) {
                  v = parseFloat((v / 10).toFixed(1));
                }
                if (f.min !== undefined && v < f.min) v = f.min;
                if (f.max !== undefined && v > f.max) v = f.max;
                cleanedObs[f.key] = v;
              }
            }
          });

          const normDateStr = normalizeDateString(obs.date, t.Date);
          const refStart = resolvedStartDate && resolvedStartDate !== 'N/A' ? resolvedStartDate : t.Date;
          // Preserve signed DAA when observation predates trial start (e.g. 12-Nov vs 13-Nov -> -1)
          let effectiveDaa = obs.daa;
          if (obs.date && refStart) {
            const signedDaa = calculateDAA(obs.date, refStart);
            if (signedDaa < 0) {
              effectiveDaa = signedDaa;
            } else if (effectiveDaa === undefined || effectiveDaa === null || effectiveDaa === '') {
              effectiveDaa = signedDaa;
            }
          }

          this.observations.push({
            ...cleanedObs,
            date: normDateStr,
            daa: effectiveDaa,
            isPreApplicationBaseline: Number(effectiveDaa) < 0,
            treatment: obs.treatment || trtName,
            treatmentNumber: obs.treatmentNumber || trtNum,
            plot: obs.plot || t.PlotNumber || 'N/A',
            rep: obs.rep || t.Replication || 1
          });
        });

        photoList.forEach(photo => {
          if (!photo || photo.deleted) return;
          const pKey = String(photo.driveId || photo.id || photo.url || photo.src || photo.fileData || '').trim();
          if (pKey && seenProjectPhotoKeys.has(pKey)) return;
          if (pKey) seenProjectPhotoKeys.add(pKey);
          this.photos.push({
            ...photo,
            plot: photo.plot || photo.plotNumber || t.PlotNumber || '',
            rep: photo.rep || photo.replication || t.Replication || '',
            treatment: photo.treatment || t.FormulationName || 'Untreated Control',
            treatmentNumber: photo.treatmentNumber || trtNum,
            date: normalizeDateString(photo.date, t.Date),
            label: photo.label ? `[Plot ${t.PlotNumber || ''} · ${t.FormulationName}] ${photo.label}` : `Plot ${t.PlotNumber || ''} - ${t.FormulationName}`
          });
        });
      });

      this.applicationLog = trialOrTrials.flatMap(t => {
        const apps = safeJsonParse(t.ApplicationLogJSON, []);
        return apps.map(a => ({
          ...a,
          treatmentName: t.FormulationName || 'Treated',
          plotNumber: t.PlotNumber || '1'
        }));
      });

      this.harvestPickings = trialOrTrials.flatMap(t => {
        const hData = safeJsonParse(t.HarvestDataJSON, {});
        let pList = Array.isArray(hData.pickings) ? [...hData.pickings] : [];
        if (pList.length === 0 && (hData.harvestDate || hData.actualMarketableWeight || hData.actualFruitCount)) {
          pList = [{
            id: 'p_1',
            pickingNumber: 1,
            harvestDate: hData.harvestDate || t.Date,
            actualMarketableWeight: hData.actualMarketableWeight,
            actualUnmarketableWeight: hData.actualUnmarketableWeight,
            actualFruitCount: hData.actualFruitCount,
            notes: hData.notes,
            photos: hData.photos || []
          }];
        }
        return pList.map(p => ({
          ...p,
          treatmentName: t.FormulationName || 'Treated',
          plotNumber: t.PlotNumber || '1'
        }));
      });

      this.soil = safeJsonParse(firstTrial.SoilDataJSON, null);
    } else {
      // Single trial mode
      this.isProjectWide = false;
      this.trial = trialOrTrials;
      this.design = proj?.Design || representative?.Design || 'RCBD';
      
      const rawObs = safeJsonParse(trialOrTrials.EfficacyDataJSON, []);
      const currentTrt = trialOrTrials.IsControl
        ? 'Untreated Check (Control)'
        : (trialOrTrials.FormulationName || 'Test Treatment');

      let obsTrts = [...new Set(rawObs.map(o => o.treatment).filter(Boolean))];
      if (!obsTrts.includes(currentTrt)) {
        obsTrts.push(currentTrt);
      }
      let controlIdx = obsTrts.findIndex(n => /untreated|utc|negative\s*control/i.test(n));
      if (controlIdx === -1) {
        controlIdx = obsTrts.findIndex(n => /control/i.test(n));
      }
      if (controlIdx === -1) {
        controlIdx = obsTrts.findIndex(n => /check/i.test(n));
      }
      if (controlIdx > -1) {
        const [ctl] = obsTrts.splice(controlIdx, 1);
        obsTrts.unshift(ctl);
      } else if (!trialOrTrials.IsControl) {
        // If single tested product, provide reference Control label for contrast
        obsTrts.unshift('Untreated Check (Control)');
      }
      this.treatmentNames = obsTrts;

      this.observations = rawObs.map(obs => {
        const cleanedObs = { ...obs };
        (this.config.observationFields || []).forEach(f => {
          if (f.type === 'number' && cleanedObs[f.key] !== undefined && cleanedObs[f.key] !== null && cleanedObs[f.key] !== '') {
            let v = parseFloat(cleanedObs[f.key]);
            if (!isNaN(v)) {
              if (f.max === 10 && v > 10 && v <= 100) {
                v = parseFloat((v / 10).toFixed(1));
              }
              if (f.min !== undefined && v < f.min) v = f.min;
              if (f.max !== undefined && v > f.max) v = f.max;
              cleanedObs[f.key] = v;
            }
          }
        });

        const trtName = obs.treatment || currentTrt;
        let trtNum = this.treatmentNames.indexOf(trtName) + 1;
        if (trtNum === 0) {
          this.treatmentNames.push(trtName);
          trtNum = this.treatmentNames.length;
        }
        return {
          ...cleanedObs,
          date: normalizeDateString(obs.date, trialOrTrials.Date),
          treatmentNumber: trtNum,
          treatment: trtName,
          plot: obs.plot || trialOrTrials.PlotNumber || '1',
          rep: obs.rep || trialOrTrials.Replication || 1
        };
      });

      const apps = safeJsonParse(trialOrTrials.ApplicationLogJSON, []);
      this.applicationLog = apps.map(a => ({
        ...a,
        treatmentName: currentTrt,
        plotNumber: trialOrTrials.PlotNumber || '1'
      }));

      const hData = safeJsonParse(trialOrTrials.HarvestDataJSON, {});
      let pList = Array.isArray(hData.pickings) ? [...hData.pickings] : [];
      if (pList.length === 0 && (hData.harvestDate || hData.actualMarketableWeight || hData.actualFruitCount)) {
        pList = [{
          id: 'p_1',
          pickingNumber: 1,
          harvestDate: hData.harvestDate || trialOrTrials.Date,
          actualMarketableWeight: hData.actualMarketableWeight,
          actualUnmarketableWeight: hData.actualUnmarketableWeight,
          actualFruitCount: hData.actualFruitCount,
          notes: hData.notes,
          photos: hData.photos || []
        }];
      }
      this.harvestPickings = pList.map(p => ({
        ...p,
        treatmentName: currentTrt,
        plotNumber: trialOrTrials.PlotNumber || '1'
      }));

      const seenSinglePhotoKeys = new Set();
      this.photos = safeJsonParse(trialOrTrials.PhotoURLs, [])
        .filter(photo => {
          if (!photo || photo.deleted) return false;
          const pKey = String(photo.driveId || photo.id || photo.url || photo.src || photo.fileData || '').trim();
          if (pKey && seenSinglePhotoKeys.has(pKey)) return false;
          if (pKey) seenSinglePhotoKeys.add(pKey);
          return true;
        })
        .map(photo => {
          return {
            ...photo,
            date: normalizeDateString(photo.date, trialOrTrials.Date)
          };
        });
      this.soil = safeJsonParse(trialOrTrials.SoilDataJSON, null);
    }

    // Prune derived metrics (NUE, AUDPC, rootToShootRatio) that have zero actual data
    this.activeFields = this.activeFields.filter(f => {
      const isDerived = ['nue', 'audpc', 'rootToShootRatio'].includes(f.key);
      if (!isDerived) return true;
      return this.observations.some(obs => {
        const val = parseFloat(obs[f.key]);
        return !isNaN(val) && val !== 0;
      });
    });

    // Filter out any active fields that have absolutely NO observations recorded
    this.skippedFields = [];
    const fieldsToKeep = [];

    this.activeFields.forEach(f => {
      const hasAnyData = this.observations.some(obs => {
        const val = obs[f.key];
        if (val === undefined || val === null || val === '') return false;
        if (f.key === 'flowerStage') return String(val).trim().length > 0;
        const num = parseFloat(val);
        if (isNaN(num)) return false;
        if (f.key === 'fruitHealthScore') return num > 0;
        return true;
      });

      if (hasAnyData) {
        fieldsToKeep.push(f);
      } else {
        const reason = f.key === 'fruitHealthScore' ? 'No fruit present in observed plots'
          : f.key === 'flowerStage' ? 'No flowers present in observed plots'
          : 'No observations recorded';
        this.skippedFields.push({ ...f, reason });
      }
    });

    this.activeFields = fieldsToKeep;

    // Analyze for duplicate values within subsamples (subsample/pot copy warning)
    let potReplicatesCount = 0;
    let identicalPotReplicatesCount = 0;
    const trtRepGroups = {};

    this.observations.forEach(obs => {
      const key = `${obs.treatmentNumber}_${obs.replication}_${obs.date || obs.daa || ''}`;
      if (!trtRepGroups[key]) trtRepGroups[key] = [];
      trtRepGroups[key].push(obs);
    });

    Object.values(trtRepGroups).forEach(group => {
      if (group.length > 1) {
        potReplicatesCount++;
        // Check if all active fields have identical values across all observations in this group
        let allFieldsIdentical = true;
        this.activeFields.forEach(f => {
          const firstVal = group[0][f.key];
          const allSame = group.every(obs => String(obs[f.key]) === String(firstVal));
          if (!allSame) {
            allFieldsIdentical = false;
          }
        });
        if (allFieldsIdentical) {
          identicalPotReplicatesCount++;
        }
      }
    });

    this.duplicatePotWarning = false;
    if (potReplicatesCount > 0 && identicalPotReplicatesCount === potReplicatesCount) {
      this.duplicatePotWarning = true;
    }
  }

  matchesTreatment(obs, trtNum, trtName) {
    if (!obs) return false;
    if (obs.treatmentNumber !== undefined && obs.treatmentNumber !== null) {
      if (Number(obs.treatmentNumber) === Number(trtNum)) return true;
    }
    if (obs.treatment && trtName) {
      if (String(obs.treatment).trim().toLowerCase() === String(trtName).trim().toLowerCase()) return true;
    }
    if (!obs.treatment && !obs.treatmentNumber && Number(trtNum) === 1) return true;
    return false;
  }

  async processObservationsWithAI() {
    // SCIENTIFIC INTEGRITY GUARANTEE:
    // NEVER fabricate or impute missing field observations (e.g. visualVigor = 8,
    // plantHeight = 40 + daa*1.5, ndvi = 0.75) when a parameter was not actually recorded
    // on a given date. Unmeasured cells MUST remain empty so missing-data reporting and
    // per-date independent ANOVA reflect genuine field observations only.

    // Perform ONLY genuine derived agronomic calculations when their measured inputs exist:
    // A. Root-to-Shoot Ratio for Biostimulant trials
    if (this.category === 'biostimulant') {
      this.observations.forEach(obs => {
        const r2s = calculateRootToShoot(obs);
        if (r2s !== null) {
          obs.rootToShootRatio = r2s;
        }
      });
    }

    // B. AUDPC for Fungicide trials (only if >= 2 dates have valid diseaseSeverity)
    if (this.category === 'fungicide') {
      const plots = [...new Set(this.observations.map(o => o.plotNumber || o.plot || 1))];
      plots.forEach(plotNum => {
        const plotObs = this.observations.filter(o => (o.plotNumber || o.plot || 1) === plotNum);
        const validSevCount = plotObs.filter(o => o.diseaseSeverity !== undefined && o.diseaseSeverity !== null && o.diseaseSeverity !== '' && !isNaN(parseFloat(o.diseaseSeverity))).length;
        if (validSevCount >= 2) {
          const audpcVal = calculateAUDPC(plotObs, 'diseaseSeverity');
          plotObs.forEach(o => {
            o.audpc = audpcVal;
          });
        }
      });
    }

    // C. Nutrient Use Efficiency (NUE) for Nutrition trials — ONLY when actual yield was recorded
    if (this.category === 'nutrition') {
      const hasActualYield = this.observations.some(o => {
        const raw = o.yield ?? o.yieldKgPlot;
        return raw !== undefined && raw !== null && raw !== '' && Number.isFinite(parseFloat(raw));
      });
      if (hasActualYield) {
        const plotSize = this.trial.plotSize || this.trial.PlotSize || this.trial.plot_size || this.trial.Plot_Size;
        const areaHa = getPlotAreaHectares(plotSize);

        const getYieldInKgHa = (o) => {
          const raw = o.yield ?? o.yieldKgPlot;
          if (raw === undefined || raw === null || raw === '') return null;
          const rawYield = parseFloat(raw);
          if (!Number.isFinite(rawYield)) return null;
          return areaHa > 0 ? rawYield / areaHa : rawYield;
        };

        const cYields = this.observations
          .filter(o => parseInt(o.treatmentNumber || o.treatment || 1) === 1)
          .map(getYieldInKgHa).filter(v => v !== null);
        const tYields = this.observations
          .filter(o => parseInt(o.treatmentNumber || o.treatment || 1) === 2)
          .map(getYieldInKgHa).filter(v => v !== null);

        if (cYields.length > 0 && tYields.length > 0) {
          const cMeanYield = cYields.reduce((a, b) => a + b, 0) / cYields.length;
          const tMeanYield = tYields.reduce((a, b) => a + b, 0) / tYields.length;
          const appliedRate = parseFloat(this.trial.Dosage || 1);
          const nueVal = calculateNUE(tMeanYield, cMeanYield, appliedRate);
          if (nueVal !== null) {
            this.observations.forEach(obs => {
              obs.nue = nueVal;
            });
          }
        }
      }
    }
  }

  validateData() {
    const warnings = [];
    
    // Helper to zero-out time portion of Date objects
    const getZeroedDate = (d) => {
      if (!d || isNaN(d.getTime())) return null;
      const zeroed = new Date(d);
      zeroed.setHours(0, 0, 0, 0);
      return zeroed;
    };

    // 1. Check trial start date
    let startDate = null;
    if (this.trial.Date) {
      const parts = this.trial.Date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (parts) {
        startDate = new Date(parseInt(parts[3], 10), parseInt(parts[2], 10) - 1, parseInt(parts[1], 10));
      } else {
        startDate = new Date(this.trial.Date);
      }
    }
    const sDateZero = getZeroedDate(startDate);

    // Group unique DAA by date
    const daaByDate = {};
    const seenPlotsAtDaa = {};
    const trtDaaCounts = {};
    const trtRepSets = {};

    const baselineDateCounts = {};

    // 2. Check observations
    this.observations.forEach((obs, idx) => {
      const daa = obs.daa ?? 0;
      const trt = obs.treatment || 'Untreated Check (Control)';
      const rep = obs.rep || obs.replication || 1;
      const plot = obs.plotNumber || obs.plot || (idx + 1);

      if (!trtRepSets[trt]) trtRepSets[trt] = new Set();
      trtRepSets[trt].add(rep);

      if (!trtDaaCounts[trt]) trtDaaCounts[trt] = {};
      trtDaaCounts[trt][daa] = (trtDaaCounts[trt][daa] || 0) + 1;

      const plotKey = `${daa}_${plot}_${rep}`;
      if (seenPlotsAtDaa[plotKey]) {
        warnings.push(`Duplicate Entry Warning: Replicated plot/pot combination (${plot}, Rep ${rep}) recorded multiple times at DAA ${daa}.`);
      }
      seenPlotsAtDaa[plotKey] = true;

      if (!obs.treatment) {
        warnings.push(`Observation #${idx + 1}: Missing treatment name.`);
      }

      if (obs.date && startDate && !isNaN(startDate.getTime())) {
        let obsDate = null;
        const oParts = obs.date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (oParts) {
          obsDate = new Date(parseInt(oParts[3], 10), parseInt(oParts[2], 10) - 1, parseInt(oParts[1], 10));
        } else {
          obsDate = new Date(obs.date);
        }
        
        const oDateZero = getZeroedDate(obsDate);
        if (oDateZero && sDateZero && oDateZero < sDateZero) {
          const daysBefore = Math.round((sDateZero - oDateZero) / (1000 * 60 * 60 * 24));
          const bKey = `${obs.date}|${daysBefore}`;
          baselineDateCounts[bKey] = (baselineDateCounts[bKey] || 0) + 1;
        }
      }

      if (obs.daa !== undefined && obs.daa !== null) {
        const daaNum = Number(obs.daa);
        if (obs.date) {
          const dStr = obs.date;
          if (!daaByDate[dStr]) daaByDate[dStr] = [];
          daaByDate[dStr].push(daaNum);
        }
      }

      // Check for impossible values
      this.activeFields.forEach(f => {
        const val = parseFloat(obs[f.key]);
        if (!isNaN(val)) {
          if (val < 0) {
            warnings.push(`Observation #${idx + 1}: Impossible negative value (${val}) recorded for ${f.label}.`);
          }
          if (f.key === 'ndvi' && val > 1.0) {
            warnings.push(`Observation #${idx + 1}: Impossible NDVI value (${val} > 1.0) recorded.`);
          }
          if (/spad|chlorophyll/i.test(f.key) && val > 150) {
            warnings.push(`Observation #${idx + 1}: Unrealistic chlorophyll/SPAD value (${val}) recorded.`);
          }
          if (/percent|pct|cover|severity/i.test(f.key) && val > 100) {
            warnings.push(`Observation #${idx + 1}: Percentage value (${val}% > 100%) recorded for ${f.label}.`);
          }
        }
      });

      const repVal = obs.rep || obs.replication;
      if (repVal === undefined || repVal === null || repVal === '') {
        warnings.push(`Observation #${idx + 1}: Missing replication number.`);
      }
    });

    // Verify DAA chronological progression across unique dates
    const sortedDates = Object.keys(daaByDate).sort((a,b) => {
      const aParts = a.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      const bParts = b.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      const aD = aParts ? new Date(parseInt(aParts[3],10), parseInt(aParts[2],10)-1, parseInt(aParts[1],10)) : new Date(a);
      const bD = bParts ? new Date(parseInt(bParts[3],10), parseInt(bParts[2],10)-1, parseInt(bParts[1],10)) : new Date(b);
      return aD - bD;
    });

    let sequenceError = false;
    let lastDaaVal = -1;
    sortedDates.forEach(dStr => {
      const daas = daaByDate[dStr];
      const avgDaa = daas.reduce((sum,v) => sum+v, 0) / daas.length;
      if (avgDaa < lastDaaVal) {
        sequenceError = true;
      }
      lastDaaVal = avgDaa;
    });

    if (sequenceError) {
      warnings.push("Chronological Warning: DAA values do not follow a strictly sequential progression over time.");
    }

    // Check missing observations for a treatment at a DAA
    const uniqueDaas = [...new Set(this.observations.map(o => o.daa ?? 0))];
    this.treatmentNames.forEach(trtName => {
      uniqueDaas.forEach(daa => {
        if (!trtDaaCounts[trtName] || !trtDaaCounts[trtName][daa]) {
          warnings.push(`Missing Observation: Treatment "${trtName}" has no data recorded at DAA ${daa}.`);
        }
      });
    });

    // Unequal replication counts check
    const repCounts = Object.entries(trtRepSets).map(([trt, set]) => ({ trt, count: set.size }));
    if (repCounts.length > 1) {
      const firstCount = repCounts[0].count;
      const isUnequal = repCounts.some(rc => rc.count !== firstCount);
      if (isUnequal) {
        const countsStr = repCounts.map(rc => `"${rc.trt}": ${rc.count} reps`).join(', ');
        warnings.push(`Experimental Bias Warning: Unequal replication counts detected across treatments (${countsStr}).`);
      }
    }

    if (this.treatmentNames.length < 2) {
      warnings.push("Experimental Design Warning: Less than 2 distinct treatments found. Efficacy comparison is limited.");
    }

    const seenTrts = new Set();
    this.treatmentNames.forEach(tName => {
      if (seenTrts.has(tName)) {
        warnings.push(`Duplicate Treatment detected: ${tName}`);
      }
      seenTrts.add(tName);
    });

    if (this.duplicatePotWarning) {
      warnings.push('Duplicate Subsamples Alert: Every pot within a treatment × replication block has identical measurements. The data appear to be plot-level measurements copied to multiple pots; recommend analysing block means rather than treating each pot as an independent replicate.');
    }

    // Summarize Pre-Application Baseline dates cleanly (1 summary entry per date instead of repeating per plot)
    Object.entries(baselineDateCounts).forEach(([bKey, count]) => {
      const [bDate, daysBefore] = bKey.split('|');
      warnings.push(`Pre-Application Baseline Date (${bDate}, DAA -${daysBefore}): ${count} plot observation(s) recorded ${daysBefore} day(s) before Trial Start Date (${this.trial.Date || 'N/A'}); classified as pre-application baseline and kept separate from post-application treatment-effect ANOVA.`);
    });

    // Measurement scale consistency check across all active fields (e.g. BBCH 61 mixed with 0/1 ordinal Flower Stage)
    this.scaleValidationReports = {};
    this.activeFields.forEach(f => {
      const report = validateMeasurementScale(this.observations, f, this.treatmentNames);
      this.scaleValidationReports[f.key] = report;
      if (report.warningMessage) {
        warnings.push(report.warningMessage);
      }
    });

    // Anomalous / extreme outlier detection on continuous numeric parameters (flags for field verification WITHOUT altering data)
    const anomalies = detectAnomalousObservations(this.observations, this.activeFields);
    this.detectedAnomalies = anomalies;
    anomalies.forEach(a => {
      warnings.push(a.message);
    });

    return warnings;
  }

  async generateCompleteReport() {
    try {
      // Asynchronously fetch project from Dexie DB if not passed synchronously
      if (!this.project) {
        try {
          const { db } = await import('./dexieDB.js');
          const projId = this.trial.ProjectID || (this.trials && this.trials[0] ? this.trials[0].ProjectID : null);
          if (projId) {
            const offlineProj = await db.projects.get(String(projId));
            if (offlineProj) {
              this.project = offlineProj;
              if (offlineProj.Design === 'PotTrial') {
                this.design = 'PotTrial';
                const potFields = offlineProj.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'];
                potFields.forEach(f => {
                  const key = labelToKey(f);
                  if (key && !this.activeFields.some(existing => existing.key === key)) {
                    const hasAnyData = this.observations.some(obs => {
                      const val = obs[key];
                      return val !== undefined && val !== null && val !== '' && !isNaN(parseFloat(val));
                    });
                    if (hasAnyData) {
                      this.activeFields.push({ key, label: f });
                    }
                  }
                });
              }
            }
          }
        } catch (err) {
          console.warn('Failed to load project from Dexie asynchronously in generateCompleteReport:', err);
        }
      }

      // 0. Auto-process observations with Spectral ExG index AI and growth fallbacks
      await this.processObservationsWithAI();
      
      // Run Data Validation
      this.validationWarnings = this.validateData();

      // Compute ANOVA on primary metric to supply to AI narrative writer
      const primaryMetricKey = this.config.primaryMetric?.key || 'plantHeight';
      const anovaResults = calculateAnovaRCB(this.observations, primaryMetricKey, this.category, this.design, {
        trialStartDate: this.trial.Date,
        expectedTreatments: this.treatmentNames.length
      });

      // 1. Build Narrative Sheet
      await this.createNarrativeSheet(anovaResults);
      
      // 2. Build Trial Info Sheet
      await this.createTrialInfoSheet();
      
      // 3. Build Treatment List & Map Sheet
      await this.createTreatmentListSheet();
      
      // 3.5. Build Assessment Summary Sheet (Descriptive Statistics & Rankings)
      await this.createAssessmentSummarySheet();

      // 4. Build Assessment Data Sheet
      await this.createAssessmentDataSheet();
      
      // 5. Build Chartwork Sheet
      await this.createChartworkSheet();
      
      // 6. Build Post-Harvest Sheet (ONLY if genuine harvest pickings or post-harvest yield/storage observations exist;
      //    note word boundary \bloss\b so "leafGlossScore" never falsely matches "loss"!)
      const postHarvestFieldRe = /harvest|yield|storage|firmness|\bloss\b|weightLoss|postHarvest/i;
      const hasHarvestPickings = (this.harvestPickings && this.harvestPickings.length > 0);
      const hasPostHarvestObs = this.activeFields.some(f => 
        postHarvestFieldRe.test(f.key)
      ) && this.observations.some(o => 
        this.activeFields.some(f => postHarvestFieldRe.test(f.key) && o[f.key] !== undefined && o[f.key] !== null && o[f.key] !== '')
      );
      const hasPostHarvest = hasHarvestPickings || hasPostHarvestObs;
      if (hasPostHarvest) {
        await this.createPostHarvestSheet();
      }
      
      // 7. Build ANOVA/AOV sheet
      await this.createAOVMeansTable();

      // 7.5. Build ANOVA Summary sheet
      await this.createANOVASummarySheet();
      
      // 8. Build Figures sheet (dynamic images embedded)
      await this.createFiguresSheet();
      
      // 9. Build Post-Harvest Charts sheet (dynamic images embedded)
      if (hasPostHarvest) {
        await this.createChartsSheet();
      }
      
      // 10. Build Weather Sheet
      const hasWeather = this.trial.Temperature || this.trial.Humidity || this.trial.Windspeed || this.trial.Rain;
      if (hasWeather) {
        await this.createWeatherSheet();
      }
      
      // 11. Build Photos Sheet
      await this.createPhotosSheet();

      // Write to Buffer & Trigger download
      const buffer = await this.workbook.xlsx.writeBuffer();
      const filename = `Advanced_Report_${this.trial.FormulationName || 'Trial'}_${this.category}_${this.trial.ID || 'report'}.xlsx`;
      
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, filename);

      return {
        success: true,
        filename,
        sheets: 11
      };
    } catch (error) {
      console.error('Advanced report generation failed:', error);
      throw error;
    }
  }

  // 1. Narrative Sheet
  async createNarrativeSheet(anovaResults = null) {
    const ws = this.workbook.addWorksheet('Narrative');
    ws.views = [{ showGridLines: true }];
    
    // Title
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${this.category.toUpperCase()} TRIAL SUMMARY REPORT — NARRATIVE`;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { rgb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: this.config.color.hex.replace('#', '') } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 40;

    // Report details
    ws.getCell('A3').value = 'Report ID:';
    ws.getCell('A3').font = { bold: true };
    ws.getCell('B3').value = this.trial.ID || 'N/A';
    
    ws.getCell('D3').value = 'Date Generated:';
    ws.getCell('D3').font = { bold: true };
    ws.getCell('E3').value = new Date().toLocaleDateString();

    // Key Findings Box
    ws.mergeCells('A5:F5');
    ws.getCell('A5').value = 'KEY FINDINGS SUMMARY';
    ws.getCell('A5').font = { bold: true, size: 12 };
    ws.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F3F4F6' } };

    const aiSaved = safeJsonParse(this.trial.AISummariesJSON, {});
    let findingsText = aiSaved.narrative || aiSaved.cover || null;
    
    if (!findingsText) {
      findingsText = await generateNarrativeWithAI(this.trial, this.category, this.observations, this.activeFields, this.treatmentNames, this.design, anovaResults);
    }
    if (!findingsText) {
      const isSig = anovaResults && !anovaResults.error && anovaResults.p_value < 0.05;
      const metricsText = this.activeFields.map(f => f.label).join(', ');
      findingsText = `The trial evaluating "${this.trial.FormulationName || 'test formulation'}" on crop "${this.trial.CropCrop || this.trial.Crop || this.project?.Crop || 'N/A'}" (Design: ${this.trial.TrialDesign || this.trial.Design || this.design}, Category: ${this.category}) was successfully conducted. Observations were recorded for key parameters including ${metricsText}. `;
      if (isSig) {
        findingsText += `Statistical analysis (ANOVA) confirmed significant treatment differences (p < 0.05) across the primary evaluation parameters, demonstrating significant efficacy of the applied formulation over the control replicates.`;
      } else {
        findingsText += `Statistical analysis (ANOVA) showed no statistically significant differences (p > 0.05) between the test formulation and the control, suggesting equivalent performance or higher replication variability under the observed conditions.`;
      }
    }
    
    ws.mergeCells('A6:F9');
    ws.getCell('A6').value = sanitizeExcelNarrativeText(findingsText);
    ws.getCell('A6').alignment = { wrapText: true, vertical: 'top' };

    // Methodology Summary
    ws.mergeCells('A11:F11');
    ws.getCell('A11').value = 'METHODOLOGY & TRIAL OVERVIEW';
    ws.getCell('A11').font = { bold: true, size: 12 };
    ws.getCell('A11').fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F3F4F6' } };

    const rawLoc = this.trial.Location;
    const displayLoc = (!rawLoc || rawLoc === 'N/A' || rawLoc === 'Various') ? 'Not specified' : rawLoc;
    
    const methodParts = [];
    if (displayLoc !== 'Not specified') {
      methodParts.push(`Location: ${displayLoc}`);
    }
    if (this.trial.CropVariety && this.trial.CropVariety !== 'N/A') {
      methodParts.push(`Crop Variety: ${this.trial.CropVariety}`);
    }
    if (this.trial.InvestigatorName && this.trial.InvestigatorName !== 'N/A') {
      methodParts.push(`Investigator: ${this.trial.InvestigatorName}`);
    }
    
    // ── Derive design parameters from REAL project data ──
    const proj = this.project;
    const repsList = [...new Set(this.observations.map(o => o.replication || o.rep).filter(Boolean))];
    const computedReplications = repsList.length > 0
      ? repsList.length
      : (proj?.PotBlocks && !isNaN(proj.PotBlocks))
        ? parseInt(proj.PotBlocks)
        : (this.trial.Replication && !isNaN(this.trial.Replication))
          ? parseInt(this.trial.Replication)
          : 3;

    const designLabel = this.design === 'CRD' 
      ? 'Completely Randomized Design (CRD)' 
      : this.design === 'PotTrial' 
        ? 'Randomized Complete Block Pot Trial (RCBD Pot Trial)' 
        : 'Randomized Complete Block Design (RCBD)';

    // Add real pot grid and observation mode info
    const potRows = proj?.PotRows ? parseInt(proj.PotRows) : null;
    const potCols = proj?.PotCols ? parseInt(proj.PotCols) : null;
    const trtCount = this.treatmentNames.length;
    const independentUnits = trtCount * computedReplications;
    const totalPots = (potRows && potCols) ? potRows * potCols : (this.isProjectWide ? (this.trials || []).length : this.observations.length);
    const potsPerUnit = independentUnits > 0 ? Math.round(totalPots / independentUnits) : 1;

    let methodologyText;
    if (this.design === 'PotTrial') {
      const trtCount = this.treatmentNames.length;
      methodologyText = `Randomized Complete Block Pot Trial consisting of ${trtCount} treatments, ${computedReplications} blocks (replications), and ${totalPots} pots (${potsPerUnit} pots per treatment × block).`;
    } else {
      methodParts.push(`Design: ${designLabel} with ${computedReplications} replicates`);
      if (this.trial.Dosage && this.trial.Dosage !== 'N/A') {
        methodParts.push(`Dosage applied: ${this.trial.Dosage}`);
      }
      if (potRows && potCols) {
        methodParts.push(`Pot layout: ${potRows} rows × ${potCols} columns (${potRows * potCols} total pots)`);
      }
      const rawObsMode = proj?.PotObsMode || '';
      if (rawObsMode === 'column-wise') {
        methodParts.push('Observation mode: Treatment Column-wise');
      } else if (rawObsMode === 'row-wise') {
        methodParts.push('Observation mode: Row-wise');
      } else if (rawObsMode === 'plant-wise' || rawObsMode === 'pot-wise') {
        methodParts.push('Observation mode: Plant-wise (Individual Pot)');
      }
      methodologyText = methodParts.join('. ') + '.';
    }
    
    ws.mergeCells('A12:F14');
    ws.getCell('A12').value = methodologyText;
    ws.getCell('A12').alignment = { wrapText: true, vertical: 'top' };

    // Conclusion
    ws.mergeCells('A16:F16');
    ws.getCell('A16').value = 'STUDY CONCLUSIONS';
    ws.getCell('A16').font = { bold: true, size: 12 };
    ws.getCell('A16').fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F3F4F6' } };

    let conclusionText = this.trial.Conclusion || null;
    if (!conclusionText) {
      conclusionText = await generateConclusionsWithAI(this.trial, this.category, this.activeFields, this.observations, this.treatmentNames, this.design, anovaResults);
    }
    if (!conclusionText) {
      const isSig = anovaResults && !anovaResults.error && anovaResults.p_value < 0.05;
      const cMeanVal = anovaResults?.treatmentMeans?.[1]?.mean ?? 0;
      const tMeanVal = anovaResults?.treatmentMeans?.[2]?.mean ?? 0;
      const primaryKey = this.config.primaryMetric?.key || (this.activeFields[0]?.key) || 'plantHeight';
      const isReduction = isReductionMetric(primaryKey, this.category);
      const isBetterThanControl = cMeanVal > 0 ? (isReduction ? tMeanVal < cMeanVal : tMeanVal > cMeanVal) : true;
      const performanceDesc = isBetterThanControl
        ? `${isSig ? 'statistically significant' : 'numerical'} improvement`
        : `${isSig ? 'statistically significant' : 'numerical'} reduction / depression`;
      const contrastDesc = isBetterThanControl
        ? 'compared to the untreated control'
        : 'relative to the untreated control (untreated control demonstrated higher performance)';
      conclusionText = `• Treatment "${this.trial.FormulationName || 'test formulation'}" showed a ${performanceDesc} in primary observation metrics ${contrastDesc}.\n• The experimental design (${this.trial.TrialDesign || this.trial.Design || this.design}) provided sufficient resolution to monitor treatment performance.\n• Further multi-site testing is recommended to evaluate agronomic response across varying environmental conditions.`;
    }

    ws.mergeCells('A17:F20');
    ws.getCell('A17').value = sanitizeExcelNarrativeText(conclusionText);
    ws.getCell('A17').alignment = { wrapText: true, vertical: 'top' };

    // Executive Summary Dashboard
    ws.mergeCells('A22:F22');
    ws.getCell('A22').value = 'EXECUTIVE SUMMARY DASHBOARD';
    ws.getCell('A22').font = { bold: true, size: 12 };
    ws.getCell('A22').fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F3F4F6' } };

    const maxDaa = this.observations.length ? Math.max(...this.observations.map(o => Number(o.daa || 0))) : 0;
    const anovaOpts = { trialStartDate: this.trial.Date, expectedTreatments: this.treatmentNames.length };
    const sigParams = [];
    this.activeFields.forEach(f => {
      const anova = calculateAnovaRCB(this.observations, f.key, this.category, this.design, anovaOpts);
      if (!anova.error && anova.p_value < 0.05) {
        sigParams.push(f.label);
      }
    });
    const sigParamsList = sigParams.length ? sigParams.join(', ') : 'None';

    const primaryMetricKey = this.config.primaryMetric?.key || (this.activeFields[0]?.key) || 'plantHeight';
    let primaryAnova = calculateAnovaRCB(this.observations, primaryMetricKey, this.category, this.design, anovaOpts);
    if (!primaryAnova || primaryAnova.error) {
      for (let i = 0; i < this.activeFields.length; i++) {
        const testAnova = calculateAnovaRCB(this.observations, this.activeFields[i].key, this.category, this.design, anovaOpts);
        if (testAnova && !testAnova.error) {
          primaryAnova = testAnova;
          break;
        }
      }
    }

    let bestTrtName = 'N/A';
    let bestTrtLabel = 'Numerically Highest Mean (Primary Parameter)';
    if (primaryAnova && !primaryAnova.error) {
      const isRed = isReductionMetric(primaryMetricKey, this.category);
      bestTrtLabel = isRed 
        ? 'Numerically Lowest Mean (Primary Parameter)' 
        : 'Numerically Highest Mean (Primary Parameter)';

      const sortedTrts = Object.entries(primaryAnova.treatmentMeans)
        .map(([trtNum, stats]) => ({
          name: this.treatmentNames[parseInt(trtNum) - 1] || `Treatment ${trtNum}`,
          mean: stats.mean
        }))
        .sort((a, b) => isRed ? a.mean - b.mean : b.mean - a.mean);
      if (sortedTrts.length > 0) {
        const bestMeanVal = sortedTrts[0].mean;
        const bestTrts = sortedTrts.filter(t => Math.abs(t.mean - bestMeanVal) < 0.0001);
        const trtNamesStr = bestTrts.map(t => t.name).join(', ');
        
        const isPrimarySig = primaryAnova.p_value < 0.05;
        bestTrtName = isPrimarySig
          ? `${trtNamesStr} (Statistically superior)`
          : `${trtNamesStr} (Not statistically different)`;
      }
    }

    const execSummaryRows = [
      ['Trial Design', designLabel],
      ['Treatments Evaluated', this.treatmentNames.length],
      ['Replications / Blocks', computedReplications],
      ['Total Pots', totalPots],
      ['Observation Period', `${maxDaa} DAA`],
      ['Statistically Significant Parameters', sigParamsList],
      [bestTrtLabel, bestTrtName],
      ['Statistical Significance Detected', sigParams.length > 0 ? 'Yes (p < 0.05)' : 'No (p >= 0.05)'],
      ['Key Recommendation', sigParams.length > 0 ? 'Proceed with commercial validation & scaling' : 'Additional replication and multi-site validation recommended']
    ];

    execSummaryRows.forEach((rowVals, idx) => {
      const rIdx = 24 + idx;
      ws.getCell(`A${rIdx}`).value = rowVals[0];
      ws.getCell(`A${rIdx}`).font = { bold: true };
      ws.getCell(`B${rIdx}`).value = rowVals[1];
      ws.mergeCells(`B${rIdx}:F${rIdx}`);
    });
  }

  // 2. Trial Info Sheet
  async createTrialInfoSheet() {
    const ws = this.workbook.addWorksheet('Trial Information');
    ws.views = [{ showGridLines: true }];

    ws.mergeCells('A1:D1');
    const header = ws.getCell('A1');
    header.value = 'TRIAL OVERVIEW & METADATA';
    header.font = { bold: true, size: 13, color: { rgb: 'FFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '2C3E50' } };
    header.alignment = { horizontal: 'center' };

    const designLabel = this.design === 'CRD' 
      ? 'Completely Randomized Design (CRD)' 
      : this.design === 'PotTrial' 
        ? 'RCBD Pot Trial' 
        : 'Randomized Complete Block Design (RCBD)';

    // ── Derive design parameters from REAL project data ──
    const proj = this.project;
    const repsList = [...new Set(this.observations.map(o => o.replication || o.rep).filter(Boolean))];
    const computedReplications = repsList.length > 0
      ? repsList.length
      : (proj?.PotBlocks && !isNaN(proj.PotBlocks))
        ? parseInt(proj.PotBlocks)
        : (this.trial.Replication && !isNaN(this.trial.Replication))
          ? parseInt(this.trial.Replication)
          : 3;

    const trtCount = this.treatmentNames.length;
    const independentUnits = trtCount * computedReplications;

    // Read actual pot grid dimensions from the project object
    const potRows = proj?.PotRows ? parseInt(proj.PotRows) : null;
    const potCols = proj?.PotCols ? parseInt(proj.PotCols) : null;
    const totalPots = (potRows && potCols) ? potRows * potCols : (this.isProjectWide ? (this.trials || []).length : this.observations.length);
    const potsPerUnit = independentUnits > 0 ? Math.round(totalPots / independentUnits) : 1;

    // Read real observation mode from the project
    const rawObsMode = proj?.PotObsMode || '';
    let obsMode = 'N/A';
    let expUnit = 'Treatment × Replication';
    if (rawObsMode === 'column-wise') {
      obsMode = 'Treatment Column-wise';
      expUnit = 'Treatment Column within Block';
    } else if (rawObsMode === 'row-wise') {
      obsMode = 'Row-wise';
      expUnit = 'Treatment Row within Block';
    } else if (rawObsMode === 'plant-wise' || rawObsMode === 'pot-wise') {
      obsMode = 'Plant-wise (Individual Pot)';
      expUnit = 'Individual Pot within Block';
    } else if (totalPots > independentUnits) {
      obsMode = 'Plant-wise';
      expUnit = 'Treatment × Replication (mean)';
    } else {
      obsMode = 'Treatment Column-wise';
      expUnit = 'Treatment × Block';
    }

    // Build methodology note from real data
    let unitText;
    if (potsPerUnit > 1) {
      unitText = `Statistical analysis was performed using ${independentUnits} experimental units (${expUnit} means), while observations were collected from ${totalPots} pots (${potsPerUnit} pots per experimental unit).`;
    } else {
      unitText = `Statistical analysis was performed using ${independentUnits} independent experimental units (${totalPots} total pots).`;
    }

    // Read pot layout from project (aligned with RCBD statistical model)
    const rawLayout = proj?.PotLayout || '';
    let layoutLabel = '';
    if (rawLayout === 'rcbd-pot') layoutLabel = 'RCBD Pot Trial';
    else if (rawLayout === 'stripe') layoutLabel = computedReplications >= 2 ? 'RCBD Pot Trial (Stripe Grid)' : 'Stripe Layout';
    else if (rawLayout === 'randomized-row') layoutLabel = computedReplications >= 2 ? 'RCBD Pot Trial (Randomized Row)' : 'Randomized Row';
    else if (rawLayout) layoutLabel = rawLayout;

    const exportTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const rawMetadata = [
      ['Trial ID', this.trial.ID],
      ['Investigator', this.trial.InvestigatorName],
      ['Sponsor', this.trial.Sponsor],
      ['Location', this.trial.Location],
      ['Crop', this.trial.CropCrop || this.trial.Crop || proj?.Crop],
      ['Variety', this.trial.CropVariety || this.trial.Variety],
      ['Previous Crop', this.trial.PreviousCrop],
      ['Irrigation Method', this.trial.IrrigationMethod],
      ['Plant Population (plants/ha)', this.trial.PlantPopulation],
      ['Design Type', designLabel],
      ['Pot Layout', layoutLabel],
      ['Pot Grid Dimensions', (potRows && potCols) ? `${potRows} rows × ${potCols} columns` : ''],
      ['Treatments', trtCount],
      ['Replications / Blocks', computedReplications],
      ['Experimental Unit', expUnit],
      ['Experimental Units', independentUnits],
      ['Independent Units Used per ANOVA', independentUnits],
      ['Total Plot-Date Records', this.observations.length],
      ['Total Pots', totalPots],
      ['Pots per Experimental Unit', potsPerUnit > 1 ? potsPerUnit : ''],
      ['Observation Mode', obsMode !== 'N/A' ? obsMode : ''],
      ['Methodology Note', unitText],
      ['Trial Start Date', this.trial.Date],
      ['Soil pH', this.soil?.ph],
      ['Soil Texture', this.soil?.texture],
      ['Soil Clay %', this.soil?.clay],
      ['Soil Sand %', this.soil?.sand],
      ['Soil Organic Carbon', this.soil?.organicCarbon],
      ['Report Version', 'v1.2'],
      ['Export Timestamp', exportTime],
      ['Software Version', 'v7.5.0'],
      ['Statistical Engine', 'v2.1.2']
    ];

    // Filter out rows that have empty/N/A values
    const metadata = rawMetadata.filter(row => {
      const val = row[1];
      return val !== undefined && val !== null && val !== '' && val !== 'N/A' && val !== '—' && val !== '-';
    });

    metadata.forEach((row, index) => {
      const r = index + 3;
      ws.getCell(`A${r}`).value = row[0];
      ws.getCell(`A${r}`).font = { bold: true };
      ws.getCell(`B${r}`).value = row[1];
    });

    let vRow = metadata.length + 5;
    ws.mergeCells(`A${vRow}:B${vRow}`);
    ws.getCell(`A${vRow}`).value = 'DATA QUALITY & VALIDATION REPORT';
    ws.getCell(`A${vRow}`).font = { bold: true, size: 11, color: { rgb: 'FFFFFF' } };
    ws.getCell(`A${vRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'C0392B' } }; // Deep red header
    vRow++;

    const warnings = this.validationWarnings || [];
    if (warnings.length === 0) {
      ws.mergeCells(`A${vRow}:B${vRow}`);
      ws.getCell(`A${vRow}`).value = '✓ All automated data quality checks passed successfully (100% integrity).';
      ws.getCell(`A${vRow}`).font = { bold: true, color: { rgb: '27AE60' } };
      vRow++;
    } else {
      warnings.forEach(warning => {
        ws.mergeCells(`A${vRow}:B${vRow}`);
        ws.getCell(`A${vRow}`).value = `⚠ ${warning}`;
        ws.getCell(`A${vRow}`).font = { color: { rgb: 'D35400' }, bold: true };
        vRow++;
      });
    }

    if (this.duplicatePotWarning) {
      ws.mergeCells(`A${vRow}:B${vRow}`);
      ws.getCell(`A${vRow}`).value = '⚠ Duplicate Subsamples Alert: Every pot within a treatment × replication block has identical measurements. The data appear to be plot-level measurements copied to multiple pots; recommend analysing block means rather than treating each pot as an independent replicate.';
      ws.getCell(`A${vRow}`).font = { color: { rgb: 'C0392B' }, bold: true };
      vRow++;
    }

    if (this.skippedFields && this.skippedFields.length > 0) {
      vRow += 2;
      ws.mergeCells(`A${vRow}:B${vRow}`);
      ws.getCell(`A${vRow}`).value = 'PARAMETERS NOT ANALYSED (SKIPPED)';
      ws.getCell(`A${vRow}`).font = { bold: true, size: 11, color: { rgb: 'FFFFFF' } };
      ws.getCell(`A${vRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '7F8C8D' } };
      vRow++;

      this.skippedFields.forEach(f => {
        ws.getCell(`A${vRow}`).value = f.label;
        ws.getCell(`A${vRow}`).font = { bold: true };
        ws.getCell(`B${vRow}`).value = f.reason || 'No observations recorded';
        vRow++;
      });
    }

    ws.column_dimensions = {
      'A': { width: 35 },
      'B': { width: 65 }
    };
  }

  async createTreatmentListSheet() {
    const ws = this.workbook.addWorksheet('Treatments & Map');
    ws.views = [{ showGridLines: true }];

    ws.getCell('A1').value = 'Treatment List';
    ws.getCell('A1').font = { bold: true, size: 12 };

    ws.getRow(2).values = ['Trt No', 'Treatment/Formulation Name', 'Dosage Rate', 'Application Timing', 'Notes'];
    ws.getRow(2).font = { bold: true };
    ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'BDC3C7' } };

    this.treatmentNames.forEach((trtName, index) => {
      const trtNum = index + 1;
      const trialObj = (this.trials || []).find(t => (t.FormulationName || 'Untreated Control') === trtName) || this.trial;
      const rate = trialObj.Dosage && String(trialObj.Dosage).toUpperCase() !== 'NA' ? trialObj.Dosage : 'Not Applicable';
      const notes = trtName.toLowerCase().includes('control') || trtName.toLowerCase().includes('check') || trtName.toLowerCase().includes('utc') 
        ? 'Negative control' 
        : 'Efficacy evaluation';
      
      ws.getRow(3 + index).values = [
        trtNum,
        trtName,
        rate,
        'At Planting',
        notes
      ];
    });

    const mapStartRow = 5 + this.treatmentNames.length;
    ws.getCell(`A${mapStartRow}`).value = 'Field Trial Layout Map (RCB Grid)';
    ws.getCell(`A${mapStartRow}`).font = { bold: true, size: 12 };

    const proj = this.project;
    const repsList = [...new Set(this.observations.map(o => o.replication || o.rep).filter(Boolean))];
    const computedReplications = repsList.length > 0
      ? repsList.length
      : (proj?.PotBlocks && !isNaN(proj.PotBlocks))
        ? parseInt(proj.PotBlocks)
        : (this.trial.Replication && !isNaN(this.trial.Replication))
          ? parseInt(this.trial.Replication)
          : 3;

    const potRows = proj?.PotRows ? parseInt(proj.PotRows) : null;
    const potCols = proj?.PotCols ? parseInt(proj.PotCols) : null;
    const gridInfo = (potRows && potCols) ? ` (${potRows}×${potCols} = ${potRows * potCols} pots)` : '';

    const trtCount = this.treatmentNames.length;
    const independentUnits = trtCount * computedReplications;
    const totalPots = (potRows && potCols) ? potRows * potCols : (this.isProjectWide ? (this.trials || []).length : this.observations.length);

    let layoutText = `Replications: ${computedReplications}${gridInfo}\nPlots layout:\n`;
    if (this.isProjectWide && this.trials) {
      const repGroups = {};
      this.trials.forEach(t => {
        const rep = t.Replication || 1;
        if (!repGroups[rep]) repGroups[rep] = [];
        repGroups[rep].push(t);
      });

      Object.keys(repGroups).sort((a,b)=>parseInt(a)-parseInt(b)).forEach(rep => {
        const plots = repGroups[rep].map(t => {
          const trtName = t.FormulationName || 'Untreated Control';
          let trtNum = this.treatmentNames.indexOf(trtName) + 1;
          if (trtNum === 0) trtNum = 1;
          return `Plot ${t.PlotNumber || 'N/A'} (Trt ${trtNum})`;
        }).join(' | ');
        layoutText += `Rep ${rep}: ${plots}\n`;
      });
    } else {
      // Generate dynamic layout from treatment names and computed replications
      for (let r = 1; r <= computedReplications; r++) {
        const plots = this.treatmentNames.map((name, idx) => {
          const plotNum = r * 100 + (idx + 1);
          return `Plot ${plotNum} (Trt ${idx + 1}: ${name})`;
        }).join(' | ');
        layoutText += `Rep ${r}: ${plots}\n`;
      }
    }

    ws.mergeCells(`A${mapStartRow + 1}:F${mapStartRow + 6}`);
    ws.getCell(`A${mapStartRow + 1}`).value = layoutText;
    ws.getCell(`A${mapStartRow + 1}`).alignment = { wrapText: true, vertical: 'top' };

    // Add summary metadata below the layout map
    const summaryStartRow = mapStartRow + 8;
    ws.getCell(`A${summaryStartRow}`).value = 'Experimental Units';
    ws.getCell(`A${summaryStartRow}`).font = { bold: true };
    ws.getCell(`B${summaryStartRow}`).value = independentUnits;

    ws.getCell(`A${summaryStartRow + 1}`).value = 'Total Pots';
    ws.getCell(`A${summaryStartRow + 1}`).font = { bold: true };
    ws.getCell(`B${summaryStartRow + 1}`).value = totalPots;

    // Render Treatment Applications Log Table if recorded
    if (this.applicationLog && this.applicationLog.length > 0) {
      let appRow = summaryStartRow + 4;
      ws.getCell(`A${appRow}`).value = 'Sequential Treatment Applications Log';
      ws.getCell(`A${appRow}`).font = { bold: true, size: 12, color: { rgb: '2C3E50' } };
      appRow++;

      const appHeaders = ['App # / Code', 'Application Date', 'Treatment / Formulation', 'Plot #', 'Dosage', 'Application Method', 'Crop Stage', 'Weather Conditions', 'Adjuvant / Tank Mix', 'Notes'];
      ws.getRow(appRow).values = appHeaders;
      ws.getRow(appRow).font = { bold: true, color: { rgb: 'FFFFFF' } };
      ws.getRow(appRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '27AE60' } };
      appRow++;

      this.applicationLog.forEach((app, aIdx) => {
        const weatherStr = [
          app.temp ? `${app.temp}°C` : '',
          app.humidity ? `${app.humidity}% RH` : '',
          app.windspeed ? `${app.windspeed} km/h` : '',
          app.rain === 'Yes' ? 'Rain' : ''
        ].filter(Boolean).join(', ') || 'Normal';

        const mixStr = [app.adjuvant, app.tankMix].filter(Boolean).join(' + ') || '—';

        ws.getRow(appRow).values = [
          app.code || `App ${aIdx + 1}`,
          app.date || '—',
          app.treatmentName || '—',
          app.plotNumber || '—',
          app.dosage || '—',
          app.method || 'Foliar Spray',
          app.cropStage || '—',
          weatherStr,
          mixStr,
          app.notes || '—'
        ];
        if (aIdx % 2 === 1) {
          ws.getRow(appRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F9FAFB' } };
        }
        appRow++;
      });
    }
  }

  // 4. Assessment Data Summary Sheet
  async createAssessmentDataSheet() {
    const ws = this.workbook.addWorksheet('Assessment Data Summary');
    ws.views = [
      { state: 'frozen', ySplit: 1, xSplit: 7, activeCell: 'H2', showGridLines: true }
    ];

    // Columns: Date, Days After App, Harvest, Plot, Rep, Treatment, Pot ID, and the category observation fields
    const headerRow = ['Date', 'Days After App', 'Harvest', 'Plot', 'Rep', 'Treatment', 'Pot ID'];
    const fieldsToUse = this.activeFields;

    fieldsToUse.forEach(f => {
      headerRow.push(f.label);
    });

    ws.getRow(1).values = headerRow;
    ws.getRow(1).font = { bold: true, color: { rgb: 'FFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '2980B9' } };

    // Determine if it is a PotTrial and calculate pots per unit
    const proj = this.project;
    const isPotTrial = this.design === 'PotTrial' || proj?.Design === 'PotTrial';
    const repsList = [...new Set(this.observations.map(o => o.replication || o.rep).filter(Boolean))];
    const computedReplications = repsList.length > 0
      ? repsList.length
      : (proj?.PotBlocks && !isNaN(proj.PotBlocks))
        ? parseInt(proj.PotBlocks)
        : (this.trial.Replication && !isNaN(this.trial.Replication))
          ? parseInt(this.trial.Replication)
          : 3;
    const trtCount = this.treatmentNames.length;
    const independentUnits = trtCount * computedReplications;
    const potRows = proj?.PotRows ? parseInt(proj.PotRows) : null;
    const potCols = proj?.PotCols ? parseInt(proj.PotCols) : null;
    const totalPots = (potRows && potCols) ? potRows * potCols : (this.isProjectWide ? (this.trials || []).length : this.observations.length);
    const potsPerUnit = isPotTrial && independentUnits > 0 ? Math.round(totalPots / independentUnits) : 1;

    const uniqueDates = [...new Set(this.observations.map(o => o.date || this.trial.Date || 'N/A'))];
    let currentRow = 2;

    // Fill observations
    this.observations.forEach((obs, idx) => {
      const potsCountToWrite = isPotTrial && potsPerUnit > 1 ? potsPerUnit : 1;

      for (let potIdx = 0; potIdx < potsCountToWrite; potIdx++) {
        const potLetter = String.fromCharCode(65 + potIdx);
        const potIdValue = isPotTrial && potsPerUnit > 1 ? `Pot ${potLetter}` : '—';

        const dateVal = obs.date || this.trial.Date || 'N/A';
        const dateIdx = uniqueDates.indexOf(dateVal);
        const useGreyBg = dateIdx % 2 === 1;

        if (useGreyBg) {
          for (let col = 1; col <= 7 + fieldsToUse.length; col++) {
            ws.getCell(currentRow, col).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { rgb: 'F2F4F4' }
            };
          }
        }

        // Write metadata
        ws.getCell(currentRow, 1).value = dateVal;
        const rawDaaVal = obs.daa !== undefined && obs.daa !== null && obs.daa !== '' ? Number(obs.daa) : 0;
        ws.getCell(currentRow, 2).value = rawDaaVal < 0 ? formatDaaLabel(rawDaaVal) : rawDaaVal;
        ws.getCell(currentRow, 3).value = obs.harvestNumber || obs.harvest || 1;
        ws.getCell(currentRow, 4).value = obs.plotNumber || obs.plot || (idx + 1);
        ws.getCell(currentRow, 5).value = obs.replication || obs.rep || 1;
        ws.getCell(currentRow, 6).value = obs.treatment || (this.treatmentNames[Number(obs.treatmentNumber || 1) - 1]) || `Trt ${obs.treatmentNumber || 1}`;
        ws.getCell(currentRow, 7).value = potIdValue;

        // Write category-specific variables & apply critical deficiency formats
        fieldsToUse.forEach((f, fIdx) => {
          let val = obs[f.key];
          
          // If this is the plant height column and we have pot-wise data, use the specific pot value
          const cleanKey = f.key.toLowerCase().replace(/\s/g, '');
          if (cleanKey === 'plantheight' && obs.potHeights && obs.potHeights[potIdx] !== undefined && obs.potHeights[potIdx] !== '') {
            val = obs.potHeights[potIdx];
          }

          const cell = ws.getCell(currentRow, 8 + fIdx);
          cell.value = (val !== undefined && val !== null && val !== '') ? val : null;

          // Add scientific critical deficiency highlights for tissue concentrations
          if (val !== undefined && val !== null && val !== '') {
            const numVal = parseFloat(val);
            if (!isNaN(numVal)) {
              let deficient = false;
              if (f.key === 'tissueN' && numVal < 3.5) deficient = true;
              else if (f.key === 'tissueP' && numVal < 0.3) deficient = true;
              else if (f.key === 'tissueK' && numVal < 3.0) deficient = true;

              if (deficient) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { rgb: 'FCE4D6' } // Light light orange/red alert
                };
                cell.font = {
                  color: { rgb: 'C00000' }, // Dark red text
                  bold: true
                };
              }
            }
          }
        });

        currentRow++;
      }
    });

    // Formatting column widths
    headerRow.forEach((_, colIndex) => {
      ws.getColumn(colIndex + 1).width = 15;
    });
  }

  async createAssessmentSummarySheet() {
    const ws = this.workbook.addWorksheet('Assessment Summary');
    ws.views = [{ showGridLines: true }];

    // Title Block
    ws.mergeCells('A1:N1');
    const header = ws.getCell('A1');
    header.value = 'DESCRIPTIVE STATISTICS & ASSESSMENT SUMMARY';
    header.font = { name: 'Calibri', bold: true, size: 14, color: { rgb: 'FFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '2C3E50' } };
    header.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 35;

    // 1. Trial Overview Section
    ws.mergeCells('A3:D3');
    ws.getCell('A3').value = '1. TRIAL OVERVIEW';
    ws.getCell('A3').font = { name: 'Calibri', bold: true, size: 11, color: { rgb: '2980B9' } };
    
    const proj = this.project;
    const repsList = [...new Set(this.observations.map(o => o.replication || o.rep).filter(Boolean))];
    const computedReplications = repsList.length > 0
      ? repsList.length
      : (proj?.PotBlocks && !isNaN(proj.PotBlocks))
        ? parseInt(proj.PotBlocks)
        : (this.trial.Replication && !isNaN(this.trial.Replication))
          ? parseInt(this.trial.Replication)
          : 3;

    const potRows = proj?.PotRows ? parseInt(proj.PotRows) : null;
    const potCols = proj?.PotCols ? parseInt(proj.PotCols) : null;
    const totalPots = (potRows && potCols) ? potRows * potCols : (this.isProjectWide ? (this.trials || []).length : this.observations.length);
    const rawObsMode = proj?.PotObsMode || '';
    const obsMode = rawObsMode === 'column-wise' ? 'Treatment Column-wise' : rawObsMode === 'row-wise' ? 'Row-wise' : 'Plant-wise';
    const dates = [...new Set(this.observations.map(o => o.date || 'N/A'))];
    const daas = [...new Set(this.observations.map(o => o.daa ?? 0))].sort((a,b)=>a-b);
    const daaRange = daas.length > 0 ? `${daas[0]} - ${daas[daas.length - 1]} DAA` : 'N/A';

    // Real cell-level parameter completeness (NEVER hardcoded to 100%)
    const completeness = computeDataCompleteness(this.observations, this.activeFields);

    // Identify any pre-trial baseline assessment dates
    const startKey = normalizeReportDateKey(this.trial.Date);
    const baselineDates = startKey
      ? [...new Set(this.observations
          .filter(o => {
            const dk = normalizeReportDateKey(o.date);
            return dk && dk < startKey;
          })
          .map(o => o.date || 'N/A'))]
      : [];

    const overviewRows = [
      ['Total Treatments', this.treatmentNames.length],
      ['Total Replications / Blocks', computedReplications],
      ['Total Pots / Experimental Units', totalPots],
      ['Observation Mode', obsMode],
      ['Experimental Units', proj?.ExperimentalUnit || (rawObsMode === 'column-wise' ? 'Treatment Column within Block' : 'Treatment × Block')],
      ['Assessment Dates Count', dates.length],
      ['Plot-Date Records Logged', this.observations.length],
      ['DAA Range Covered', daaRange],
      ['Pre-Application Baseline Dates', baselineDates.length > 0 ? `${baselineDates.join(', ')} (before Trial Start ${this.trial.Date})` : 'None'],
      ['Missing Parameter Values (Cells)', `${completeness.missingCells} / ${completeness.totalExpectedCells}`],
      ['Parameters with Missing Values', `${completeness.parametersWithMissing} / ${completeness.parameterCount}`],
      ['Parameter Data Completeness', `${completeness.completenessPct.toFixed(1)}%`]
    ];

    overviewRows.forEach((row, idx) => {
      const r = 4 + idx;
      ws.getCell(`A${r}`).value = row[0];
      ws.getCell(`A${r}`).font = { name: 'Calibri', bold: true };
      ws.getCell(`B${r}`).value = row[1];
    });

    // 1.5. Variability Rating Legend Section (moved above statistics)
    let legendRow = 4 + overviewRows.length + 2;
    ws.mergeCells(`A${legendRow}:D${legendRow}`);
    ws.getCell(`A${legendRow}`).value = 'VARIABILITY RATING LEGEND';
    ws.getCell(`A${legendRow}`).font = { name: 'Calibri', bold: true, size: 10, color: { rgb: '2980B9' } };
    legendRow++;

    ws.getRow(legendRow).values = ['CV Range', 'Variability Rating', 'Scientific Quality Definition'];
    ws.getRow(legendRow).font = { name: 'Calibri', bold: true };
    legendRow++;

    const legendItems = [
      ['< 10%', 'Excellent', 'Highly consistent crop response, low experimental error'],
      ['10% - 20%', 'Good', 'Expected agricultural/greenhouse variation'],
      ['20% - 30%', 'Moderate', 'Moderate spatial/micro-climatic block variation'],
      ['> 30%', 'High', 'Relatively high variability; interpret differences with caution']
    ];
    legendItems.forEach(item => {
      ws.getRow(legendRow).values = item;
      legendRow++;
    });

    // 2. Observation Summary Section (Overall Parameter Metrics)
    let curRow = legendRow + 2;
    ws.mergeCells(`A${curRow}:P${curRow}`);
    ws.getCell(`A${curRow}`).value = '2. OVERALL OBSERVATION STATISTICS BY PARAMETER';
    ws.getCell(`A${curRow}`).font = { name: 'Calibri', bold: true, size: 11, color: { rgb: '2980B9' } };
    curRow++;

    const descHeaders = [
      'Parameter', 'Min', 'Max', 'Mean', 'Median', 'Std Dev', 'CV %', 'Range', 
      'Valid Records', 'Missing Records', 'Completeness %', 'Variability Class', 
      'Numerically Best Treatment(s)', 'Best Mean Value', 
      'Numerically Worst Treatment(s)', 'Worst Mean Value'
    ];
    ws.getRow(curRow).values = descHeaders;
    ws.getRow(curRow).font = { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' } };
    ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '34495E' } };
    curRow++;

    this.activeFields.forEach(f => {
      const vals = this.observations.map(o => {
        if (f.key.toLowerCase().replace(/\s/g, '') === 'plantheight' && o.potHeights) {
          return o.potHeights.map(h => parseFloat(h)).filter(v => !isNaN(v));
        }
        return parseFloat(o[f.key]);
      }).flat().filter(v => !isNaN(v));

      if (!vals.length) return;

      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / vals.length;
      const range = max - min;
      const sampleSize = vals.length;

      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

      const variance = vals.length > 1 ? vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length - 1) : 0;
      const stdDev = Math.sqrt(variance);
      const rawCv = mean > 0 ? (stdDev / mean) * 100 : 0;

      // Proper CV & Variability Class handling (NEVER report CV = 0% -> "Excellent" on n=1 or constant zeros!)
      const isStageField = isOrdinalOrStageField(f);
      const scaleReport = isStageField ? validateMeasurementScale(this.observations, f, this.treatmentNames) : null;
      const isSymptom = /deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.key) || 
                       /deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.label);
      const suppressCV = isSymptom && mean < 2.0;

      let cvDisplay;
      let variabilityClass;
      let suppressVarStyling = false;

      if (isStageField) {
        cvDisplay = scaleReport?.hasMixedCoding
          ? 'N/A – Mixed scale (verify coding)'
          : 'N/A – Ordinal/phenological scale';
        variabilityClass = scaleReport?.hasMixedCoding
          ? 'Scale verification required'
          : 'Ordinal / Categorical';
        suppressVarStyling = true;
      } else if (sampleSize < 2) {
        cvDisplay = 'N/A – Insufficient observations';
        variabilityClass = 'N/A – Insufficient observations';
        suppressVarStyling = true;
      } else if (stdDev === 0) {
        cvDisplay = 'N/A – Constant observations';
        variabilityClass = 'N/A – Constant observations';
        suppressVarStyling = true;
      } else if (mean === 0) {
        cvDisplay = 'N/A – Zero mean';
        variabilityClass = 'N/A – Zero mean';
        suppressVarStyling = true;
      } else if (suppressCV) {
        cvDisplay = 'N/A (Low Incidence)';
        variabilityClass = 'N/A (Low Incidence)';
        suppressVarStyling = true;
      } else {
        cvDisplay = parseFloat(rawCv.toFixed(1)) + '%';
        if (rawCv > 30) variabilityClass = 'High';
        else if (rawCv > 20) variabilityClass = 'Moderate';
        else if (rawCv > 10) variabilityClass = 'Good';
        else variabilityClass = 'Excellent';
      }

      // Calculate treatment means strictly over valid numeric values (NEVER coerce missing to 0)
      const trtMeans = this.treatmentNames.map((name, idx) => {
        const trtNum = idx + 1;
        const trtVals = this.observations.filter(o => this.matchesTreatment(o, trtNum, name))
                                         .map(o => {
                                           if (f.key.toLowerCase().replace(/\s/g, '') === 'plantheight' && o.potHeights) {
                                             return o.potHeights.map(h => parseFloat(h)).filter(v => !isNaN(v));
                                           }
                                           return parseFloat(o[f.key]);
                                         })
                                         .flat()
                                         .filter(v => Number.isFinite(v));
        if (!trtVals.length) return null;
        const avg = trtVals.reduce((sum1, v1) => sum1 + v1, 0) / trtVals.length;
        return { name, mean: avg, n: trtVals.length };
      }).filter(Boolean);

      const isRed = isReductionMetric(f.key, this.category);
      const sortedTrts = [...trtMeans].sort((a, b) => isRed ? a.mean - b.mean : b.mean - a.mean);
      
      const bestMeanVal = sortedTrts[0]?.mean;
      const worstMeanVal = sortedTrts[sortedTrts.length - 1]?.mean;

      const bestTrts = sortedTrts.filter(t => bestMeanVal !== undefined && Math.abs(t.mean - bestMeanVal) < 0.0001);
      const worstTrts = sortedTrts.filter(t => worstMeanVal !== undefined && Math.abs(t.mean - worstMeanVal) < 0.0001);

      const bestTrtsName = isStageField
        ? 'See Section 3c (Stage Frequencies)'
        : (bestTrts.length > 1 ? `Tie (${bestTrts.map(t => t.name).join(', ')})` : (bestTrts[0]?.name || 'N/A'));
      const worstTrtsName = isStageField
        ? 'See Section 3c (Stage Frequencies)'
        : (worstTrts.length > 1 ? `Tie (${worstTrts.map(t => t.name).join(', ')})` : (worstTrts[0]?.name || 'N/A'));

      const bestMean = isStageField ? null : (bestTrts[0]?.mean ?? null);
      const worstMean = isStageField ? null : (worstTrts[0]?.mean ?? null);

      const paramComp = completeness.perParameter[f.key] || {
        validCount: sampleSize,
        missingCount: Math.max(0, this.observations.length - sampleSize),
        completenessPct: this.observations.length > 0 ? parseFloat(((sampleSize / this.observations.length) * 100).toFixed(1)) : 0
      };

      ws.getRow(curRow).values = [
        f.label,
        parseFloat(min.toFixed(2)),
        parseFloat(max.toFixed(2)),
        isStageField ? 'N/A (Ordinal)' : parseFloat(mean.toFixed(2)),
        parseFloat(median.toFixed(2)),
        sampleSize < 2 || isStageField ? 'N/A' : parseFloat(stdDev.toFixed(2)),
        cvDisplay,
        parseFloat(range.toFixed(2)),
        paramComp.validCount,
        paramComp.missingCount,
        `${paramComp.completenessPct.toFixed(1)}%`,
        variabilityClass,
        bestTrtsName,
        bestMean !== null ? parseFloat(bestMean.toFixed(2)) : 'N/A',
        worstTrtsName,
        worstMean !== null ? parseFloat(worstMean.toFixed(2)) : 'N/A'
      ];
      
      // Styling the Variability Class
      const varCell = ws.getCell(curRow, 12);
      if (suppressVarStyling) {
        varCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: scaleReport?.hasMixedCoding ? 'FCE4D6' : 'F2F4F4' } };
        varCell.font = { name: 'Calibri', color: { rgb: scaleReport?.hasMixedCoding ? 'C00000' : '7F8C8D' }, italic: !scaleReport?.hasMixedCoding, bold: Boolean(scaleReport?.hasMixedCoding) };
      } else if (rawCv > 30) {
        varCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'FCE4D6' } };
        varCell.font = { name: 'Calibri', color: { rgb: 'C00000' }, bold: true };
      } else if (rawCv < 10) {
        varCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'E2EFDA' } };
        varCell.font = { name: 'Calibri', color: { rgb: '375623' }, bold: true };
      }

      curRow++;
    });

    // 3a. Beneficial Parameters (Higher is Better) — strictly separates numerical order from ANOVA significance
    curRow += 2;
    ws.mergeCells(`A${curRow}:H${curRow}`);
    ws.getCell(`A${curRow}`).value = '3a. BENEFICIAL PARAMETERS (HIGHER IS BETTER — LATEST VALID INDEPENDENT ASSESSMENT)';
    ws.getCell(`A${curRow}`).font = { name: 'Calibri', bold: true, size: 11, color: { rgb: '2980B9' } };
    curRow++;

    const rankHeaders = ['Parameter', 'Analyzed Date', 'Treatment', 'n', 'Mean Value', 'Numerical Rank', '% vs Control', 'Statistical & Numerical Classification'];
    ws.getRow(curRow).values = rankHeaders;
    ws.getRow(curRow).font = { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' } };
    ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '34495E' } };
    curRow++;

    const summaryAnovaOpts = { trialStartDate: this.trial.Date, expectedTreatments: this.treatmentNames.length };

    const renderRankingRows = (fieldsList, isAdverse) => {
      fieldsList.forEach(f => {
        const anova = calculateAnovaRCB(this.observations, f.key, this.category, this.design, summaryAnovaOpts);
        if (anova.error) {
          ws.getRow(curRow).values = [
            f.label,
            anova.analyzedDate || 'N/A',
            '—',
            anova.nIndependentUnits || 0,
            '—',
            '—',
            '—',
            anova.error
          ];
          ws.getCell(curRow, 8).font = { name: 'Calibri', color: { rgb: '7F8C8D' }, italic: true };
          curRow++;
          return;
        }

        const isStatSig = anova.p_value < 0.05;
        const trtMeans = Object.entries(anova.treatmentMeans).map(([trtNumStr, st]) => {
          const trtNum = parseInt(trtNumStr, 10);
          return {
            name: this.treatmentNames[trtNum - 1] || `Treatment ${trtNum}`,
            trtNum,
            n: st.n || 0,
            mean: st.mean,
            group: st.group || 'a'
          };
        });

        const sortedTrts = [...trtMeans].sort((a, b) => isAdverse ? a.mean - b.mean : b.mean - a.mean);
        const controlEntry = trtMeans.find(t => t.trtNum === 1);
        const controlMean = controlEntry ? controlEntry.mean : null;

        sortedTrts.forEach((trt, sortIdx) => {
          const rank = sortIdx + 1;
          let diffStr;
          if (trt.trtNum === 1) {
            diffStr = 'Control (Ref)';
          } else if (controlMean === null || controlMean <= 0) {
            diffStr = 'N/A – Control baseline is zero';
          } else {
            const pctDiff = isAdverse
              ? ((controlMean - trt.mean) / controlMean) * 100
              : ((trt.mean - controlMean) / controlMean) * 100;
            diffStr = `${pctDiff > 0 ? '+' : ''}${pctDiff.toFixed(2)}%`;
          }

          let classification;
          if (!isStatSig) {
            if (sortIdx === 0) {
              classification = isAdverse
                ? 'Lowest numerical mean (No statistically significant difference)'
                : 'Highest numerical mean (No statistically significant difference)';
            } else if (sortIdx === sortedTrts.length - 1) {
              classification = isAdverse
                ? 'Highest numerical mean (No statistically significant difference)'
                : 'Lowest numerical mean (No statistically significant difference)';
            } else {
              classification = 'Intermediate (No statistically significant difference)';
            }
          } else {
            if (sortIdx === 0) {
              classification = isAdverse
                ? `Lowest numerical mean (Statistically significant, Group '${trt.group}')`
                : `Highest numerical mean (Statistically significant, Group '${trt.group}')`;
            } else if (sortIdx === sortedTrts.length - 1) {
              classification = isAdverse
                ? `Highest numerical mean (Group '${trt.group}')`
                : `Lowest numerical mean (Group '${trt.group}')`;
            } else {
              classification = `Intermediate (Group '${trt.group}')`;
            }
          }

          ws.getRow(curRow).values = [
            f.label,
            anova.analyzedDate || 'N/A',
            trt.name,
            trt.n,
            parseFloat(trt.mean.toFixed(2)),
            rank,
            diffStr,
            classification
          ];

          if (isStatSig && sortIdx === 0) {
            ws.getCell(curRow, 8).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'E2EFDA' } };
            ws.getCell(curRow, 8).font = { name: 'Calibri', color: { rgb: '375623' }, bold: true };
          } else if (!isStatSig) {
            ws.getCell(curRow, 8).font = { name: 'Calibri', color: { rgb: '566573' }, italic: true };
          }

          curRow++;
        });
      });
    };

    const beneficialFields = this.activeFields.filter(f => !isReductionMetric(f.key, this.category) && !isOrdinalOrStageField(f));
    renderRankingRows(beneficialFields, false);

    // 3b. Stress / Adverse Parameters (Lower is Better)
    curRow += 2;
    ws.mergeCells(`A${curRow}:H${curRow}`);
    ws.getCell(`A${curRow}`).value = '3b. STRESS / ADVERSE PARAMETERS (LOWER IS BETTER — LATEST VALID INDEPENDENT ASSESSMENT)';
    ws.getCell(`A${curRow}`).font = { name: 'Calibri', bold: true, size: 11, color: { rgb: '2980B9' } };
    curRow++;

    ws.getRow(curRow).values = rankHeaders;
    ws.getRow(curRow).font = { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' } };
    ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '34495E' } };
    curRow++;

    const stressFields = this.activeFields.filter(f => isReductionMetric(f.key, this.category) && !isOrdinalOrStageField(f));
    renderRankingRows(stressFields, true);

    // 3c. Ordinal / Phenological Stage Frequency Distributions (no ratio % improvement!)
    const ordinalStageFields = this.activeFields.filter(f => isOrdinalOrStageField(f));
    if (ordinalStageFields.length > 0) {
      curRow += 2;
      ws.mergeCells(`A${curRow}:F${curRow}`);
      ws.getCell(`A${curRow}`).value = '3c. ORDINAL / PHENOLOGICAL STAGE FREQUENCY DISTRIBUTIONS (NO RATIO % IMPROVEMENT)';
      ws.getCell(`A${curRow}`).font = { name: 'Calibri', bold: true, size: 11, color: { rgb: '2980B9' } };
      curRow++;

      ws.getRow(curRow).values = [
        'Parameter',
        'Measurement Scale Status',
        'Treatment',
        'n (Valid)',
        'Observed Stage Distribution',
        'Statistical Guidance'
      ];
      ws.getRow(curRow).font = { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' } };
      ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '34495E' } };
      curRow++;

      ordinalStageFields.forEach(f => {
        const scaleRep = validateMeasurementScale(this.observations, f, this.treatmentNames);
        const statusStr = scaleRep.hasMixedCoding
          ? `Mixed/Inconsistent Scale (${scaleRep.detectedScale.replace(/-/g, ' ')})`
          : `Ordinal / Phenological (${scaleRep.detectedScale.replace(/-/g, ' ')})`;
        const guidanceStr = scaleRep.hasMixedCoding
          ? 'Requires data correction / scale standardization before statistical analysis'
          : 'Ordinal scale: use stage frequency tables / non-parametric rank tests (no % improvement)';

        this.treatmentNames.forEach(trtName => {
          const dist = scaleRep.distributionByTreatment[trtName] || { n: 0, counts: {} };
          const distText = dist.n > 0
            ? Object.entries(dist.counts)
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
                .map(([code, cnt]) => `Stage ${code}: ${cnt} (${((cnt / dist.n) * 100).toFixed(0)}%)`)
                .join('; ')
            : 'No valid records';

          ws.getRow(curRow).values = [
            f.label,
            statusStr,
            trtName,
            dist.n,
            distText,
            guidanceStr
          ];
          if (scaleRep.hasMixedCoding) {
            ws.getCell(curRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'FCE4D6' } };
            ws.getCell(curRow, 2).font = { name: 'Calibri', color: { rgb: 'C00000' }, bold: true };
          }
          curRow++;
        });
      });
    }

    // 4. DAA Trends Analysis — compares ONLY dates with adequate paired longitudinal coverage!
    curRow += 2;
    ws.mergeCells(`A${curRow}:G${curRow}`);
    ws.getCell(`A${curRow}`).value = '4. DAA-WISE DEVELOPMENTAL TRENDS (VALID PAIRED MEASUREMENTS ONLY — NO ZERO COERCION)';
    ws.getCell(`A${curRow}`).font = { name: 'Calibri', bold: true, size: 11, color: { rgb: '2980B9' } };
    curRow++;

    ws.getRow(curRow).values = [
      'Parameter',
      'Initial Valid Date (DAA, n)',
      'Initial Mean',
      'Latest Valid Date (DAA, n)',
      'Final Mean',
      'Net Change',
      'Trend Classification'
    ];
    ws.getRow(curRow).font = { name: 'Calibri', bold: true, color: { rgb: 'FFFFFF' } };
    ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '34495E' } };
    curRow++;

    const expectedUnitsForTrends = Math.max(
      this.treatmentNames.length * computedReplications,
      this.isProjectWide ? (this.trials || []).length : 0,
      4
    );
    const minDateCoverageN = Math.max(4, Math.ceil(expectedUnitsForTrends * 0.5));

    this.activeFields.forEach(f => {
      if (isOrdinalOrStageField(f)) {
        const scaleRep = validateMeasurementScale(this.observations, f, this.treatmentNames);
        ws.getRow(curRow).values = [
          f.label,
          '—',
          'N/A',
          '—',
          'N/A',
          'N/A',
          scaleRep.hasMixedCoding
            ? 'Not evaluated – Mixed/inconsistent coding scale (requires verification)'
            : 'Ordinal/phenological scale — evaluate via stage frequency progression (Section 3c)'
        ];
        curRow++;
        return;
      }

      // Group strictly by dates where THIS parameter actually has valid finite values
      const bucketMap = new Map();
      this.observations.forEach(o => {
        const val = extractNumericMetricValue(o, f.key);
        if (!Number.isFinite(val)) return;
        const normDate = normalizeReportDateKey(o.date);
        const daaNum = o.daa !== undefined && o.daa !== null && o.daa !== '' ? Number(o.daa) : null;
        const key = normDate || (daaNum !== null && !isNaN(daaNum) ? `DAA:${daaNum}` : 'SINGLE');
        if (!bucketMap.has(key)) {
          bucketMap.set(key, {
            key,
            normDate,
            displayDate: o.date || normDate || 'N/A',
            daa: daaNum,
            vals: [],
            treatments: new Set(),
            unitKeys: new Set()
          });
        }
        const entry = bucketMap.get(key);
        entry.vals.push(val);
        entry.treatments.add(parseInt(o.treatmentNumber || o.treatment || 1, 10));
        entry.unitKeys.add(`${o.plot || o.plotNumber || ''}_${o.rep || o.replication || ''}_${o.treatmentNumber || ''}`);
        if (entry.daa === null && daaNum !== null && !isNaN(daaNum)) entry.daa = daaNum;
      });

      const validBuckets = Array.from(bucketMap.values()).sort((a, b) => {
        if (a.normDate && b.normDate && a.normDate !== b.normDate) return a.normDate.localeCompare(b.normDate);
        return (a.daa ?? -999) - (b.daa ?? -999);
      });

      if (validBuckets.length === 0) return;

      const firstB = validBuckets[0];
      const firstMean = firstB.vals.reduce((s, v) => s + v, 0) / firstB.vals.length;
      const firstLabel = `${firstB.displayDate} (DAA ${formatDaaLabel(firstB.daa)}, n=${firstB.vals.length})`;

      if (validBuckets.length < 2) {
        ws.getRow(curRow).values = [
          f.label,
          firstLabel,
          parseFloat(firstMean.toFixed(2)),
          '—',
          'N/A',
          'N/A',
          'Single valid assessment date only (No temporal trend)'
        ];
        curRow++;
        return;
      }

      const lastB = validBuckets[validBuckets.length - 1];
      const lastMean = lastB.vals.reduce((s, v) => s + v, 0) / lastB.vals.length;
      const lastLabel = `${lastB.displayDate} (DAA ${formatDaaLabel(lastB.daa)}, n=${lastB.vals.length})`;

      // Longitudinal coverage check: prevent classifying e.g. n=2 vs n=8 Tiller Count or n=1 vs n=20 Leaf Gloss as "Stable"!
      const pairedUnits = [...firstB.unitKeys].filter(k => lastB.unitKeys.has(k)).length;
      const hasAdequateCoverage =
        firstB.vals.length >= minDateCoverageN &&
        lastB.vals.length >= minDateCoverageN &&
        firstB.treatments.size >= Math.min(2, this.treatmentNames.length) &&
        lastB.treatments.size >= Math.min(2, this.treatmentNames.length) &&
        pairedUnits >= Math.min(minDateCoverageN, Math.max(2, this.treatmentNames.length));

      if (!hasAdequateCoverage) {
        ws.getRow(curRow).values = [
          f.label,
          firstLabel,
          parseFloat(firstMean.toFixed(2)),
          lastLabel,
          parseFloat(lastMean.toFixed(2)),
          'N/A',
          `Insufficient paired observations / Incomplete longitudinal coverage (paired n=${pairedUnits})`
        ];
        ws.getCell(curRow, 7).font = { name: 'Calibri', color: { rgb: '7F8C8D' }, italic: true };
        curRow++;
        return;
      }

      const netChange = lastMean - firstMean;

      let trend = 'Stable';
      const threshold = Math.abs(firstMean) > 0 ? Math.abs(firstMean) * 0.05 : 0.05;
      if (netChange > threshold) trend = '↑ Increased';
      else if (netChange < -threshold) trend = '↓ Decreased';

      ws.getRow(curRow).values = [
        f.label,
        firstLabel,
        parseFloat(firstMean.toFixed(2)),
        lastLabel,
        parseFloat(lastMean.toFixed(2)),
        parseFloat(netChange.toFixed(2)),
        trend
      ];

      curRow++;
    });

    // Formatting column widths
    const columnWidthHeaders = [
      'Parameter', 'Min', 'Max', 'Mean', 'Median', 'Std Dev', 'CV %', 'Range', 
      'Assessment Records Used', 'Variability Class', 
      'Numerically Best Treatment(s)', 'Best Mean Value', 
      'Numerically Worst Treatment(s)', 'Worst Mean Value'
    ];
    columnWidthHeaders.forEach((_, colIndex) => {
      ws.getColumn(colIndex + 1).width = 18;
    });
  }

  async createChartworkSheet() {
    const ws = this.workbook.addWorksheet('Chartwork');
    ws.views = [{ showGridLines: true }];

    ws.getCell('A1').value = 'TREATMENT MEANS BY TIMING (FORMULA CALCULATION)';
    ws.getCell('A1').font = { bold: true, size: 12 };

    const dates = [...new Set(this.observations.map(o => o.date || this.trial.Date || 'N/A'))];
    
    ws.getRow(3).values = ['Metric / Treatment', ...dates];
    ws.getRow(3).font = { bold: true };

    let r = 4;
    this.activeFields.forEach((f, fIdx) => {
      const fieldCol = getColumnLetter(8 + fIdx);
      ws.getCell(`A${r}`).value = f.label;
      ws.getCell(`A${r}`).font = { bold: true };
      
      const trtMeansByDate = {}; // date -> array of means indexed by trtIdx
      dates.forEach(d => {
        trtMeansByDate[d] = [];
      });

      this.treatmentNames.forEach((trtName, trtIdx) => {
        const trtNum = trtIdx + 1;
        ws.getCell(`A${r + trtNum}`).value = `  ${trtName} (Trt ${trtNum})`;
        const escapedTrt = trtName.replace(/"/g, '""');

        dates.forEach((date, colIdx) => {
          const cLetter = getColumnLetter(2 + colIdx);
          
          // Pre-calculate exact mean in JS using matchesTreatment
          const matchingObs = this.observations.filter(o => 
            (o.date || this.trial.Date || 'N/A') === date && this.matchesTreatment(o, trtNum, trtName)
          );
          const vals = matchingObs.map(o => {
            if (f.key.toLowerCase().replace(/\s/g, '') === 'plantheight' && o.potHeights) {
              return o.potHeights.map(h => parseFloat(h)).filter(v => !isNaN(v));
            }
            return parseFloat(o[f.key]);
          }).flat().filter(v => !isNaN(v));

          // Missing values MUST remain null/blank — NEVER coerce to 0!
          const meanVal = vals.length > 0 ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;
          trtMeansByDate[date][trtIdx] = meanVal;

          if (meanVal === null) {
            ws.getCell(`${cLetter}${r + trtNum}`).value = null;
          } else {
            ws.getCell(`${cLetter}${r + trtNum}`).value = {
              formula: `IFERROR(AVERAGEIFS('Assessment Data Summary'!${fieldCol}:${fieldCol}, 'Assessment Data Summary'!F:F, "${escapedTrt}", 'Assessment Data Summary'!A:A, "${date}"), "")`,
              result: meanVal
            };
          }
        });
      });

      let offset = this.treatmentNames.length;
      const isRed = isReductionMetric(f.key, this.category);
      const isStageField = isOrdinalOrStageField(f);
      const stageScaleRep = isStageField ? validateMeasurementScale(this.observations, f, this.treatmentNames) : null;

      for (let i = 1; i < this.treatmentNames.length; i++) {
        const trtName = this.treatmentNames[i];
        const trtNum = i + 1;
        ws.getCell(`A${r + offset + i}`).value = isStageField
          ? `  Comparison of ${trtName} (Ordinal Stage)`
          : isRed 
            ? `  Efficacy of ${trtName} (% Control)` 
            : `  Improvement of ${trtName} (%)`;

        dates.forEach((date, colIdx) => {
          const cLetter = getColumnLetter(2 + colIdx);
          const controlMean = trtMeansByDate[date]?.[0] ?? null;
          const trtMean = trtMeansByDate[date]?.[i] ?? null;

          if (controlMean === null || trtMean === null) {
            ws.getCell(`${cLetter}${r + offset + i}`).value = null;
            return;
          }

          if (isStageField) {
            ws.getCell(`${cLetter}${r + offset + i}`).value = stageScaleRep?.hasMixedCoding
              ? 'N/A – Mixed scale (verify coding)'
              : 'N/A – Ordinal/phenological scale';
            return;
          }

          if (controlMean <= 0) {
            ws.getCell(`${cLetter}${r + offset + i}`).value = 'N/A – Control baseline is zero';
            return;
          }

          const calculatedEff = isRed
            ? parseFloat(((controlMean - trtMean) / controlMean * 100).toFixed(2))
            : parseFloat(((trtMean - controlMean) / controlMean * 100).toFixed(2));

          ws.getCell(`${cLetter}${r + offset + i}`).value = {
            formula: isRed
              ? `IF(OR(${cLetter}${r + 1}="",${cLetter}${r + trtNum}=""),"",IF(${cLetter}${r + 1}>0,(${cLetter}${r + 1}-${cLetter}${r + trtNum})/${cLetter}${r + 1}*100,"N/A – Control baseline is zero"))`
              : `IF(OR(${cLetter}${r + 1}="",${cLetter}${r + trtNum}=""),"",IF(${cLetter}${r + 1}>0,(${cLetter}${r + trtNum}-${cLetter}${r + 1})/${cLetter}${r + 1}*100,"N/A – Control baseline is zero"))`,
            result: calculatedEff
          };
        });
      }

      r += offset + this.treatmentNames.length;
    });

    ws.columns = [
      { width: 35 },
      ...dates.map(() => ({ width: 18 }))
    ];
  }

  // 6. Post-Harvest Sheet
  async createPostHarvestSheet() {
    const ws = this.workbook.addWorksheet('Post-Harvest');
    ws.views = [{ showGridLines: true }];

    ws.getCell('A1').value = 'POST-HARVEST & YIELD RETENTION DATA';
    ws.getCell('A1').font = { bold: true, size: 14, color: { rgb: '2C3E50' } };

    ws.mergeCells('A3:H4');
    ws.getCell('A3').value = `Comprehensive post-harvest, sequential pickings, and cumulative yield retention analysis.\nSummarizes all recorded harvest cycles, marketable vs unmarketable yields, fruit counts, and treatment averages.`;
    ws.getCell('A3').alignment = { wrapText: true, vertical: 'top' };

    let curRow = 6;

    // 1. Render Sequential Multi-Harvest Pickings Log if available
    if (this.harvestPickings && this.harvestPickings.length > 0) {
      ws.getCell(`A${curRow}`).value = '1. SEQUENTIAL HARVEST PICKINGS LOG';
      ws.getCell(`A${curRow}`).font = { bold: true, size: 11, color: { rgb: '2980B9' } };
      curRow++;

      const pickingHeaders = [
        'Picking #',
        'Harvest Date',
        'Treatment Name',
        'Plot #',
        'Marketable Yield (kg)',
        'Unmarketable Yield (kg)',
        'Total Yield (kg)',
        'Marketable %',
        'Fruit / Plant Count',
        'Quality Notes'
      ];
      ws.getRow(curRow).values = pickingHeaders;
      ws.getRow(curRow).font = { bold: true, color: { rgb: 'FFFFFF' } };
      ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '27AE60' } };
      curRow++;

      this.harvestPickings.forEach((p, pIdx) => {
        const mYield = parseFloat(p.actualMarketableWeight ?? p.marketableWeight ?? 0) || 0;
        const uYield = parseFloat(p.actualUnmarketableWeight ?? p.unmarketableWeight ?? 0) || 0;
        const totYield = mYield + uYield;
        const mPct = totYield > 0 ? ((mYield / totYield) * 100).toFixed(1) + '%' : (mYield > 0 ? '100%' : '—');
        const count = p.actualFruitCount ?? p.fruitCount ?? '—';

        ws.getRow(curRow).values = [
          `Picking ${p.pickingNumber || (pIdx + 1)}`,
          p.harvestDate || '—',
          p.treatmentName || '—',
          p.plotNumber || '—',
          mYield > 0 ? parseFloat(mYield.toFixed(2)) : (p.actualMarketableWeight ?? '—'),
          uYield > 0 ? parseFloat(uYield.toFixed(2)) : (p.actualUnmarketableWeight ?? '—'),
          totYield > 0 ? parseFloat(totYield.toFixed(2)) : '—',
          mPct,
          count,
          p.notes || '—'
        ];
        if (pIdx % 2 === 1) {
          ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F9FAFB' } };
        }
        curRow++;
      });

      curRow += 2;

      // 2. Cumulative Treatment Yield Summary
      ws.getCell(`A${curRow}`).value = '2. CUMULATIVE HARVEST YIELD SUMMARY BY TREATMENT';
      ws.getCell(`A${curRow}`).font = { bold: true, size: 11, color: { rgb: '2980B9' } };
      curRow++;

      const summaryHeaders = [
        'Treatment Name',
        'Total Pickings',
        'Cumulative Marketable Yield (kg)',
        'Cumulative Unmarketable Yield (kg)',
        'Cumulative Total Yield (kg)',
        'Overall Marketable %',
        'Total Fruit / Specimen Count',
        '% Yield Gain vs Control'
      ];
      ws.getRow(curRow).values = summaryHeaders;
      ws.getRow(curRow).font = { bold: true, color: { rgb: 'FFFFFF' } };
      ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '34495E' } };
      curRow++;

      // Compute cumulative per treatment
      const trtSummaries = this.treatmentNames.map((tName, tIdx) => {
        const trtNum = tIdx + 1;
        const trtPickings = this.harvestPickings.filter(p => {
          if (p.treatmentName && String(p.treatmentName).trim().toLowerCase() === String(tName).trim().toLowerCase()) return true;
          if (p.treatmentNumber && Number(p.treatmentNumber) === trtNum) return true;
          return tIdx === 0 && !p.treatmentName;
        });

        let cumMarketable = 0;
        let cumUnmarketable = 0;
        let cumCount = 0;
        trtPickings.forEach(p => {
          cumMarketable += parseFloat(p.actualMarketableWeight ?? p.marketableWeight ?? 0) || 0;
          cumUnmarketable += parseFloat(p.actualUnmarketableWeight ?? p.unmarketableWeight ?? 0) || 0;
          cumCount += parseFloat(p.actualFruitCount ?? p.fruitCount ?? 0) || 0;
        });
        const cumTotal = cumMarketable + cumUnmarketable;
        const cumPct = cumTotal > 0 ? ((cumMarketable / cumTotal) * 100).toFixed(1) + '%' : (cumMarketable > 0 ? '100%' : '—');

        return {
          treatmentName: tName,
          pickingsCount: trtPickings.length,
          cumMarketable,
          cumUnmarketable,
          cumTotal,
          cumPct,
          cumCount
        };
      });

      const controlTrt = trtSummaries.find(s => /untreated|utc|negative\s*control/i.test(s.treatmentName)) 
        || trtSummaries.find(s => /control/i.test(s.treatmentName)) 
        || trtSummaries[0];
      const ctlYield = controlTrt?.cumMarketable || 0;

      trtSummaries.forEach((s, sIdx) => {
        let diffStr = '—';
        if (s === controlTrt) {
          diffStr = 'Control (Ref)';
        } else if (ctlYield > 0 && s.cumMarketable > 0) {
          const diff = ((s.cumMarketable - ctlYield) / ctlYield) * 100;
          diffStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
        }

        ws.getRow(curRow).values = [
          s.treatmentName,
          s.pickingsCount,
          parseFloat(s.cumMarketable.toFixed(2)),
          parseFloat(s.cumUnmarketable.toFixed(2)),
          parseFloat(s.cumTotal.toFixed(2)),
          s.cumPct,
          s.cumCount > 0 ? s.cumCount : '—',
          diffStr
        ];
        if (sIdx % 2 === 1) {
          ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'F9FAFB' } };
        }
        curRow++;
      });

      curRow += 2;
    }

    // 3. Observation harvest fields if present (word-boundary \bloss\b so "leafGlossScore" never matches!)
    const harvestFields = this.activeFields.filter(f => 
      /harvest|yield|storage|firmness|\bloss\b|weightLoss|postHarvest/i.test(f.key)
    );

    if (harvestFields.length > 0) {
      ws.getCell(`A${curRow}`).value = '3. OBSERVATION HARVEST & YIELD PARAMETERS';
      ws.getCell(`A${curRow}`).font = { bold: true, size: 11, color: { rgb: '2980B9' } };
      curRow++;

      harvestFields.forEach(f => {
        ws.getCell(`A${curRow}`).value = `${f.label} - Treatment Averages`;
        ws.getCell(`A${curRow}`).font = { bold: true, size: 10 };
        curRow++;

        const dates = [...new Set(this.observations.map(o => o.date).filter(Boolean))];
        ws.getRow(curRow).values = ['Treatment Name', ...dates.map(d => `Date: ${d}`)];
        ws.getRow(curRow).font = { bold: true };
        ws.getRow(curRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'ECF0F1' } };
        curRow++;

        this.treatmentNames.forEach((trtName, trtIdx) => {
          const trtNum = trtIdx + 1;
          const rowValues = [trtName];
          dates.forEach(d => {
            const obsList = this.observations.filter(o => 
              this.matchesTreatment(o, trtNum, trtName) && o.date === d
            );
            const vals = obsList.map(o => parseFloat(o[f.key])).filter(v => !isNaN(v));
            if (vals.length > 0) {
              const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
              rowValues.push(parseFloat(avg.toFixed(2)));
            } else {
              rowValues.push('N/A');
            }
          });
          ws.getRow(curRow).values = rowValues;
          curRow++;
        });

        curRow += 2;
      });
    }

    ws.column_dimensions = {
      'A': { width: 30 },
      'B': { width: 18 },
      'C': { width: 25 },
      'D': { width: 25 },
      'E': { width: 22 },
      'F': { width: 18 },
      'G': { width: 22 },
      'H': { width: 22 }
    };
  }

  // 7. ANOVA/AOV sheet
  async createAOVMeansTable() {
    const ws = this.workbook.addWorksheet('AOV Means Table');
    ws.views = [{ showGridLines: true }];

    let currentObs = this.observations;
    let r = 1;
    const aovOpts = { trialStartDate: this.trial.Date, expectedTreatments: this.treatmentNames.length };

    this.activeFields.forEach(f => {
      const anova = calculateAnovaRCB(currentObs, f.key, this.category, this.design, aovOpts);
      if (anova.error) {
        ws.getCell(`A${r}`).value = `ANOVA for ${f.label}: ${anova.error}`;
        ws.getCell(`A${r}`).font = { italic: true, color: { rgb: '7F8C8D' } };
        r += 2;
        return;
      }

      const designTitle = this.design === 'CRD' 
        ? 'Completely Randomized Design (CRD)' 
        : this.design === 'PotTrial' 
          ? 'RCBD Pot Trial' 
          : 'Randomized Complete Block Design (RCBD)';

      ws.mergeCells(`A${r}:H${r}`);
      const sliceBadge = anova.analyzedDate
        ? ` — Latest Valid Post-App Assessment: ${anova.analyzedDate} (DAA ${formatDaaLabel(anova.analyzedDaa)}, n = ${anova.nIndependentUnits} independent units)`
        : ` (n = ${anova.nIndependentUnits} independent units)`;
      ws.getCell(`A${r}`).value = `ANOVA: ${f.label} (${designTitle}${sliceBadge})`;
      ws.getCell(`A${r}`).font = { bold: true, color: { rgb: 'FFFFFF' } };
      ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '8E44AD' } };
      r++;

      ws.getRow(r).values = ['Source', 'DF', 'Sum of Squares', 'Mean Square', 'F Value', 'Pr > F'];
      ws.getRow(r).font = { bold: true };
      r++;

      // Treatment Row
      ws.getRow(r).values = [
        'Treatment', 
        anova.df_treatment, 
        parseFloat(anova.ss_treatment.toFixed(4)), 
        parseFloat(anova.ms_treatment.toFixed(4)), 
        parseFloat(anova.f_value.toFixed(4)), 
        `${anova.p_value.toFixed(4)} ${anova.p_value < 0.05 ? '*' : 'ns'}`
      ];
      r++;

      // Block Row (RCBD and RCBD Pot Trial whenever >= 2 blocks/replications exist)
      if (anova.modelType !== 'CRD' && anova.df_block > 0) {
        ws.getRow(r).values = [
          'Replications (Block)', 
          anova.df_block, 
          parseFloat(anova.ss_block.toFixed(4)), 
          parseFloat(anova.ms_block.toFixed(4)), 
          parseFloat(anova.f_block.toFixed(4)), 
          `${anova.p_block.toFixed(4)} ${anova.p_block < 0.05 ? '*' : 'ns'}`
        ];
        r++;
      }

      // Error Row
      ws.getRow(r).values = [
        'Error', 
        anova.df_error, 
        parseFloat(anova.ss_error.toFixed(4)), 
        parseFloat(anova.ms_error.toFixed(4)), 
        '', ''
      ];
      r++;

      // Total Row
      ws.getRow(r).values = [
        'Total', 
        anova.df_total, 
        parseFloat(anova.ss_total.toFixed(4)), 
        '', '', ''
      ];
      r += 2;

      // Treatment Means
      ws.getCell(`A${r}`).value = 'Treatment Means Summary';
      ws.getCell(`A${r}`).font = { bold: true };
      r++;

      ws.getRow(r).values = ['Treatment', 'n (Units)', 'Mean', 'LSD Group', 'Std Dev', 'SE', '95% CI Lower', '95% CI Upper'];
      ws.getRow(r).font = { bold: true };
      r++;

      Object.keys(anova.treatmentMeans).forEach(trtNum => {
        const trtStats = anova.treatmentMeans[trtNum];
        const trtName = this.treatmentNames[trtNum - 1] || `Treatment ${trtNum}`;
        const sdVal = trtStats.sd === 0 ? '0.00 (Constant observations)' : parseFloat(trtStats.sd.toFixed(2));
        const seVal = trtStats.sd === 0 ? '0.00 (Constant observations)' : parseFloat(trtStats.se.toFixed(2));
        const ciLowerVal = trtStats.sd === 0 ? parseFloat(trtStats.mean.toFixed(2)) : parseFloat(trtStats.ci_lower.toFixed(2));
        const ciUpperVal = trtStats.sd === 0 ? parseFloat(trtStats.mean.toFixed(2)) : parseFloat(trtStats.ci_upper.toFixed(2));

        ws.getRow(r).values = [
          trtName,
          trtStats.n || 0,
          parseFloat(trtStats.mean.toFixed(2)),
          trtStats.group || 'a',
          sdVal,
          seVal,
          ciLowerVal,
          ciUpperVal
        ];
        r++;
      });

      // Explicit Grand Mean row (reconciles directly with ANOVA Summary even when treatment n differs)
      ws.getRow(r).values = [
        'Grand Mean (All Analyzed Independent Units)',
        anova.nIndependentUnits,
        parseFloat(anova.grandMean.toFixed(4)),
        '', '', '', '', ''
      ];
      ws.getRow(r).font = { bold: true, italic: true };
      r++;

      // Efficacy row for each non-control treatment compared to control (Trt 1)
      for (let i = 1; i < this.treatmentNames.length; i++) {
        const trtNum = i + 1;
        const trtStats = anova.treatmentMeans[trtNum];
        const cStats = anova.treatmentMeans[1];
        if (trtStats && cStats) {
          const diffVal = trtStats.mean - cStats.mean;
          const isSameGroup = (trtStats.group || 'a') === (cStats.group || 'a');
          const significanceNote = isSameGroup ? ' (No statistically significant difference)' : '';
          let pctDisplay;
          if (cStats.mean <= 0) {
            pctDisplay = 'N/A – Control baseline is zero';
          } else {
            const pctVal = isReductionMetric(f.key, this.category)
              ? ((cStats.mean - trtStats.mean) / cStats.mean) * 100
              : ((trtStats.mean - cStats.mean) / cStats.mean) * 100;
            pctDisplay = `${pctVal > 0 ? '+' : ''}${pctVal.toFixed(1)}%${significanceNote}`;
          }

          ws.getRow(r).values = [
            `Difference from Control (${this.treatmentNames[i]})`,
            '',
            parseFloat(diffVal.toFixed(2)),
            '',
            '', '', '',
            pctDisplay
          ];
          r++;
        }
      }

      const getCvRating = (c) => {
        if (c < 10) return 'Excellent';
        if (c <= 20) return 'Good';
        if (c <= 30) return 'Moderate';
        return 'High';
      };

      const isSymptom = /deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.key) || 
                       /deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.label);
      const isMeanNearZero = anova.grandMean < 2.0 || (isSymptom && anova.grandMean < 5.0);
      const cvDisplay = isMeanNearZero 
        ? 'N/A (Mean near zero / low incidence)'
        : (anova.cv ? `${anova.cv.toFixed(2)}% (${getCvRating(anova.cv)})` : 'N/A');

      ws.getRow(r).values = [
        'LSD (p=0.05)',
        anova.lsd ? parseFloat(anova.lsd.toFixed(4)) : 'N/A',
        'LSD (p=0.01)',
        anova.lsd1 ? parseFloat(anova.lsd1.toFixed(4)) : 'N/A',
        'CV (%)',
        cvDisplay,
        'Trial SEm±',
        anova.sem ? parseFloat(anova.sem.toFixed(4)) : 'N/A'
      ];
      ws.getRow(r).font = { italic: true, bold: true };

      r += 4;
    });

    ws.column_dimensions = {
      'A': { width: 25 },
      'B': { width: 10 },
      'C': { width: 18 },
      'D': { width: 18 },
      'E': { width: 15 },
      'F': { width: 15 }
    };
  }

  // 8 & 9. Figures Sheet
  async createFiguresSheet() {
    const ws = this.workbook.addWorksheet('Figures');
    ws.views = [{ showGridLines: true }];

    ws.getCell('A1').value = 'TRIAL VISUALIZATIONS';
    ws.getCell('A1').font = { bold: true, size: 14 };

    // Dynamic Chart rendering with Canvas/Chart.js
    const dates = [...new Set(this.observations.map(o => o.date || this.trial.Date || 'N/A'))];
    
    // We will render charts for active fields that have data
    let chartIndex = 0;
    
    for (const f of this.activeFields) {
      if (isOrdinalOrStageField(f)) continue;
      const hasData = this.observations.some(obs => {
        const val = parseFloat(obs[f.key]);
        return !isNaN(val) && val !== 0;
      });
      if (!hasData) continue;

      const datasets = this.treatmentNames.map((trtName, trtIdx) => {
        const trtNum = trtIdx + 1;
        const trtData = [];
        dates.forEach(d => {
          const tObs = this.observations.filter(o => (o.date || this.trial.Date || 'N/A') === d && this.matchesTreatment(o, trtNum, trtName));
          const validVals = tObs.map(o => extractNumericMetricValue(o, f.key)).filter(v => Number.isFinite(v));
          // Push null (gap) when parameter was NOT measured on this date — NEVER coerce missing to 0!
          const tAvg = validVals.length > 0 ? parseFloat((validVals.reduce((a, b) => a + b, 0) / validVals.length).toFixed(2)) : null;
          trtData.push(tAvg);
        });
        
        const colors = ['#95A5A6', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];
        return {
          label: `${trtName} (Trt ${trtNum})`,
          data: trtData,
          backgroundColor: colors[trtIdx % colors.length],
          spanGaps: false
        };
      });

      // Render chart to Base64 using Chart.js on client side
      if (typeof document !== 'undefined') {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 500;
          canvas.height = 300;
          
          const ctx = canvas.getContext('2d');
          
          // Disable Chart.js animation for synchronous rendering
          const chart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: dates,
              datasets: datasets
            },
            options: {
              animation: false,
              responsive: false,
              plugins: {
                title: {
                  display: true,
                  text: f.label
                }
              }
            }
          });

          const base64Image = canvas.toDataURL('image/png');
          chart.destroy();
          
          // Add image to Workbook
          const imageId = this.workbook.addImage({
            base64: base64Image,
            extension: 'png'
          });

          // Embed in worksheet
          const rowOffset = 3 + (chartIndex * 16);
          ws.addImage(imageId, `A${rowOffset}:H${rowOffset + 14}`);
          
          chartIndex++;
        } catch (e) {
          console.error('Failed to render chart image:', e);
        }
      }
    }
    if (chartIndex === 0) {
      this.workbook.removeWorksheet(ws.name);
    }
  }

  // 9. Post-Harvest Quality Charts Sheet (ONLY renders from genuine recorded harvest pickings — NEVER fabricated curves)
  async createChartsSheet() {
    if (!this.harvestPickings || this.harvestPickings.length === 0) {
      return;
    }

    const pickingLabels = [...new Set(this.harvestPickings.map((p, i) => `Picking ${p.pickingNumber || (i + 1)}`))];
    if (pickingLabels.length === 0) return;

    const ws = this.workbook.addWorksheet('Charts');
    ws.views = [{ showGridLines: true }];

    ws.getCell('A1').value = 'POST-HARVEST MARKETABLE YIELD BY PICKING';
    ws.getCell('A1').font = { bold: true, size: 14, color: { rgb: 'FFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: this.config.color.hex.replace('#', '') } };
    ws.mergeCells('A1:J1');
    ws.getRow(1).height = 30;

    const colors = ['#95A5A6', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];
    const datasetsYield = this.treatmentNames.map((trtName, trtIdx) => {
      const trtNum = trtIdx + 1;
      const data = pickingLabels.map((label, pIdx) => {
        const matching = this.harvestPickings.filter((p, idx) =>
          `Picking ${p.pickingNumber || (idx + 1)}` === label &&
          ((p.treatmentName && String(p.treatmentName).trim().toLowerCase() === String(trtName).trim().toLowerCase()) ||
           Number(p.treatmentNumber) === trtNum)
        );
        const vals = matching
          .map(p => parseFloat(p.actualMarketableWeight ?? p.marketableWeight))
          .filter(v => Number.isFinite(v));
        return vals.length > 0 ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;
      });
      return {
        label: `${trtName} (Trt ${trtNum})`,
        data,
        borderColor: colors[trtIdx % colors.length],
        backgroundColor: colors[trtIdx % colors.length],
        borderWidth: 2,
        spanGaps: false
      };
    });

    if (typeof document !== 'undefined') {
      try {
        const canvas1 = document.createElement('canvas');
        canvas1.width = 500;
        canvas1.height = 300;
        const ctx1 = canvas1.getContext('2d');
        const chart1 = new Chart(ctx1, {
          type: 'bar',
          data: { labels: pickingLabels, datasets: datasetsYield },
          options: {
            animation: false,
            responsive: false,
            plugins: {
              title: { display: true, text: 'Recorded Marketable Yield per Picking (kg)' }
            }
          }
        });
        const img1 = canvas1.toDataURL('image/png');
        chart1.destroy();
        const imgId1 = this.workbook.addImage({ base64: img1, extension: 'png' });
        ws.addImage(imgId1, 'A3:H17');
      } catch (e) {
        console.error('Failed to render post-harvest yield chart:', e);
      }
    }
  }

  // 10. Weather Sheet
  async createWeatherSheet() {
    const ws = this.workbook.addWorksheet('Weather');
    ws.views = [{ showGridLines: true }];

    ws.getRow(1).values = ['Date', 'Temp (°C)', 'Humidity (%)', 'Wind Speed (km/h)', 'Rainfall (mm)', 'Notes'];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'E67E22' } };

    // Fill weather on application day
    ws.getRow(2).values = [
      this.trial.Date || 'N/A',
      this.trial.Temperature || 'N/A',
      this.trial.Humidity || 'N/A',
      this.trial.Windspeed || 'N/A',
      this.trial.Rain || 'N/A',
      'Application Day Weather'
    ];

    ws.column_dimensions = {
      'A': { width: 15 },
      'B': { width: 15 },
      'C': { width: 15 },
      'D': { width: 18 },
      'E': { width: 15 },
      'F': { width: 25 }
    };
  }

  async createPhotosSheet() {
    const ws = this.workbook.addWorksheet('Photos');
    ws.views = [{ showGridLines: true }];

    ws.mergeCells('A1:K1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'TRIAL PHOTO DOCUMENTATION GALLERY';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { rgb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: this.config.color.hex.replace('#', '') } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    if (!this.photos.length) {
      ws.getCell('A3').value = 'No photo records attached to this trial.';
      return;
    }

    // Assign uniform column widths
    ws.getColumn(1).width = 13;
    ws.getColumn(2).width = 13;
    ws.getColumn(3).width = 13;
    ws.getColumn(4).width = 3; // Gutter
    ws.getColumn(5).width = 13;
    ws.getColumn(6).width = 13;
    ws.getColumn(7).width = 13;
    ws.getColumn(8).width = 3; // Gutter
    ws.getColumn(9).width = 13;
    ws.getColumn(10).width = 13;
    ws.getColumn(11).width = 13;

    let colOffset = 0; // 0 = A-C, 1 = E-G, 2 = I-K
    let startRow = 3;

    for (let i = 0; i < this.photos.length; i++) {
      const p = this.photos[i];
      const src = p.fileData || p.url || p.src;
      if (!src) continue;
      
      let data = src;
      if (!src.startsWith('data:image/')) {
        data = await toBase64(src, 600);
      }
      
      if (data && data.startsWith('data:image/')) {
        try {
          const imageId = this.workbook.addImage({
            base64: data,
            extension: data.includes('png') ? 'png' : 'jpeg'
          });
          
          const colStartIdx = 1 + colOffset * 4; // Columns A(1), E(5), I(9)
          const colStart = getColumnLetter(colStartIdx);
          const colEnd = getColumnLetter(colStartIdx + 2);
          
          ws.addImage(imageId, `${colStart}${startRow}:${colEnd}${startRow + 7}`);
          
          ws.getCell(`${colStart}${startRow + 8}`).value = `Caption: ${p.label || 'Image'}`;
          ws.getCell(`${colStart}${startRow + 8}`).font = { italic: true, size: 9 };
          
          let photoTrtName = '';
          if (this.isProjectWide) {
            photoTrtName = p.treatment || (p.treatmentNumber ? this.treatmentNames[p.treatmentNumber - 1] : '');
          } else {
            photoTrtName = this.trial.FormulationName || '';
          }

          const traceParts = [];
          const repVal = p.rep || p.replication || p.block;
          if (repVal) {
            traceParts.push(`Rep ${repVal}`);
          } else if (this.trial.Replication && !isNaN(this.trial.Replication)) {
            const totalReps = parseInt(this.trial.Replication);
            if (totalReps === 1) traceParts.push(`Rep 1`);
          }
          
          const plotVal = p.plot || p.plotNumber || this.trial.PlotNumber;
          if (plotVal) traceParts.push(`Plot ${plotVal}`);
          
          const potVal = p.pot || p.potNumber || p.tag;
          if (potVal) traceParts.push(`Pot ${potVal}`);

          let metaInfo = traceParts.length > 0 ? traceParts.join(' • ') : 'Unspecified';
          if (photoTrtName) {
            metaInfo += ` (${photoTrtName})`;
          }
          ws.getCell(`${colStart}${startRow + 9}`).value = `Info: ${metaInfo}`;
          ws.getCell(`${colStart}${startRow + 9}`).font = { size: 9, bold: true, color: { rgb: '2980B9' } };
          
          ws.getCell(`${colStart}${startRow + 10}`).value = `Date: ${p.date || 'N/A'}`;
          ws.getCell(`${colStart}${startRow + 10}`).font = { size: 9, color: { rgb: '7F8C8D' } };
          
          colOffset++;
          if (colOffset >= 3) {
            colOffset = 0;
            startRow += 12;
          }
        } catch (e) {
          console.warn('Failed to embed photo in excel:', e);
        }
      }
    }
  }

  async createANOVASummarySheet() {
    const ws = this.workbook.addWorksheet('ANOVA Summary');
    ws.views = [{ showGridLines: true }];

    ws.mergeCells('A1:N1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'PROJECT ANOVA & POST-HOC SUMMARY';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { rgb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: this.config.color.hex.replace('#', '') } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 40;

    ws.getCell('A3').value = 'Project / Study Design:';
    ws.getCell('A3').font = { bold: true };
    ws.getCell('B3').value = this.design === 'PotTrial' ? 'Randomized Complete Block Pot Trial (RCBD Pot Trial)' : this.design;

    ws.getCell('D3').value = 'Statistical Independence Rule:';
    ws.getCell('D3').font = { bold: true };
    ws.mergeCells('E3:N3');
    ws.getCell('E3').value = 'One independent observation per experimental unit (Treatment × Block) on the latest valid assessment date per parameter. Repeated dates are NOT pooled as independent replicates.';
    ws.getCell('E3').font = { italic: true, color: { rgb: '34495E' } };

    ws.getRow(5).values = [
      'Parameter / Metric',
      'Analyzed Date (DAA)',
      'Model / Design',
      'DF (Trt, Blk, Err)',
      'Mean Square Error (MSE)',
      'F-Value',
      'P-Value',
      'Significance',
      'LSD (p=0.05)',
      'SEm±',
      'CV (%)',
      'Grand Mean',
      'LSD Groupings (Treatment: Group)',
      'Interpretation'
    ];
    ws.getRow(5).font = { bold: true };
    ws.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'ECF0F1' } };

    let r = 6;
    const summaryAnovaOpts = { trialStartDate: this.trial.Date, expectedTreatments: this.treatmentNames.length };
    this.activeFields.forEach(f => {
      if (f.key === 'nue') return;
      const anova = calculateAnovaRCB(this.observations, f.key, this.category, this.design, summaryAnovaOpts);
      if (anova.error) {
        // NEVER emit fake 0.00 / F=0 / P=1.000 / LSD=0 / CV=0% / All Treatments: a for ineligible or constant parameters!
        ws.getRow(r).values = [
          f.label,
          anova.analyzedDate ? `${anova.analyzedDate}${anova.analyzedDaa !== null && anova.analyzedDaa !== undefined ? ` (DAA ${formatDaaLabel(anova.analyzedDaa)})` : ''}` : 'N/A',
          'NOT ANALYSED',
          '—', '—', '—', '—', '—', '—', '—', '—',
          '—',
          '—',
          anova.error
        ];
        ws.getRow(r).font = { italic: true, color: { rgb: '7F8C8D' } };
        r++;
        return;
      }

      const sig = anova.p_value < 0.01 ? '**' : anova.p_value < 0.05 ? '*' : 'ns';
      
      const groupings = Object.entries(anova.treatmentMeans)
        .map(([trtNum, stats]) => {
          const name = this.treatmentNames[parseInt(trtNum) - 1] || `Treatment ${trtNum}`;
          return `${name}: ${stats.group || 'a'}`;
        })
        .join(', ');

      const isSymptom = /deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.key) || 
                       /deficiency|severity|chlorosis|necrosis|pest|disease|injury|mortality/i.test(f.label);
      const isMeanNearZero = anova.grandMean < 2.0 || (isSymptom && anova.grandMean < 5.0);
      const cvDisplay = isMeanNearZero 
        ? 'N/A (Mean near zero / low incidence)'
        : (anova.cv ? `${anova.cv.toFixed(2)}%` : 'N/A');

      const safeFloatFixed = (val, digits = 4, fallback = 'N/A') => {
        if (val === undefined || val === null || isNaN(val)) return fallback;
        return parseFloat(Number(val).toFixed(digits));
      };

      const interpretationText = anova.p_value < 0.05
        ? 'Reject H₀: Statistically significant treatment effect detected (p < 0.05)'
        : 'Fail to reject H₀. Treatments belong to the same statistical grouping.';

      const dfDisplay = (anova.df_treatment !== undefined && anova.df_error !== undefined)
        ? (anova.modelType === 'CRD' ? `${anova.df_treatment}, —, ${anova.df_error}` : `${anova.df_treatment}, ${anova.df_block}, ${anova.df_error}`)
        : 'N/A';

      const dateDisplay = anova.analyzedDate
        ? `${anova.analyzedDate}${anova.analyzedDaa !== null && anova.analyzedDaa !== undefined ? ` (DAA ${anova.analyzedDaa})` : ''}`
        : 'Latest Valid';

      ws.getRow(r).values = [
        f.label,
        dateDisplay,
        `${anova.modelType || (this.design === 'CRD' ? 'CRD' : 'RCBD')} (n=${anova.nIndependentUnits || 'N/A'})`,
        dfDisplay,
        safeFloatFixed(anova.ms_error),
        safeFloatFixed(anova.f_value),
        safeFloatFixed(anova.p_value),
        sig,
        safeFloatFixed(anova.lsd),
        safeFloatFixed(anova.sem),
        cvDisplay,
        safeFloatFixed(anova.grandMean),
        groupings,
        interpretationText
      ];
      r++;
    });

    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 22;
    ws.getColumn(6).width = 12;
    ws.getColumn(7).width = 12;
    ws.getColumn(8).width = 12;
    ws.getColumn(9).width = 15;
    ws.getColumn(10).width = 12;
    ws.getColumn(11).width = 28;
    ws.getColumn(12).width = 15;
    ws.getColumn(13).width = 65;
    ws.getColumn(14).width = 45;

    r += 3;
    ws.mergeCells(`A${r}:M${r}`);
    ws.getCell(`A${r}`).value = 'TREATMENT MEANS & EFFICACY PERCENT OVERVIEW (RELATIVE TO CONTROL)';
    ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { rgb: 'FFFFFF' } };
    ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: this.config.color.hex.replace('#', '') } };
    ws.getRow(r).height = 25;
    r++;

    const headers = ['Parameter / Metric', 'Control Mean'];
    this.treatmentNames.slice(1).forEach(name => {
      headers.push(`${name} Mean`, `% Efficacy`);
    });
    ws.getRow(r).values = headers;
    ws.getRow(r).font = { bold: true };
    ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'ECF0F1' } };
    r++;

    this.activeFields.forEach(f => {
      if (f.key === 'nue') return;
      const anova = calculateAnovaRCB(this.observations, f.key, this.category, this.design, summaryAnovaOpts);
      if (anova.error) {
        ws.getRow(r).values = [f.label, anova.error];
        ws.getRow(r).font = { italic: true, color: { rgb: '7F8C8D' } };
        r++;
        return;
      }

      const controlMean = anova.treatmentMeans[1]?.mean ?? 0;
      const controlLetter = anova.treatmentMeans[1]?.group || 'a';
      const rowVals = [f.label, `${controlMean.toFixed(2)} ${controlLetter}`];

      this.treatmentNames.slice(1).forEach((name, idx) => {
        const trtNum = idx + 2;
        const trtMean = anova.treatmentMeans[trtNum]?.mean ?? 0;
        const trtLetter = anova.treatmentMeans[trtNum]?.group || 'a';
        
        let pctDisplay;
        if (controlMean <= 0) {
          pctDisplay = 'N/A – Control baseline is zero';
        } else {
          const pctEff = isReductionMetric(f.key, this.category)
            ? ((controlMean - trtMean) / controlMean) * 100
            : ((trtMean - controlMean) / controlMean) * 100;
          pctDisplay = `${pctEff > 0 ? '+' : ''}${pctEff.toFixed(2)}%`;
        }

        rowVals.push(`${trtMean.toFixed(2)} ${trtLetter}`, pctDisplay);
      });

      ws.getRow(r).values = rowVals;
      r++;
    });

    // Per-Assessment-Date Independent ANOVA Breakdown (when multiple dates were observed)
    const uniqueDateKeys = [...new Set(this.observations.map(o => normalizeReportDateKey(o.date)).filter(Boolean))].sort();
    if (uniqueDateKeys.length > 1) {
      r += 3;
      ws.mergeCells(`A${r}:N${r}`);
      ws.getCell(`A${r}`).value = 'PER-ASSESSMENT-DATE INDEPENDENT ANOVA BREAKDOWN (NO PSEUDOREPLICATION)';
      ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { rgb: 'FFFFFF' } };
      ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: '2C3E50' } };
      ws.getRow(r).height = 25;
      r++;

      ws.getRow(r).values = [
        'Assessment Date', 'Parameter / Metric', 'n (Plots)', 'DF (Trt, Blk, Err)',
        'F-Value', 'P-Value', 'Sig', 'LSD (0.05)', 'CV (%)', 'Grand Mean', 'Groupings'
      ];
      ws.getRow(r).font = { bold: true };
      ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'ECF0F1' } };
      r++;

      uniqueDateKeys.forEach(dateKey => {
        this.activeFields.forEach(f => {
          if (f.key === 'nue') return;
          const dateAnova = calculateAnovaRCB(this.observations, f.key, this.category, this.design, {
            targetDateKey: dateKey,
            expectedTreatments: this.treatmentNames.length
          });
          if (dateAnova.error) return;
          const sig = dateAnova.p_value < 0.01 ? '**' : dateAnova.p_value < 0.05 ? '*' : 'ns';
          const dfStr = dateAnova.modelType === 'CRD'
            ? `${dateAnova.df_treatment}, —, ${dateAnova.df_error}`
            : `${dateAnova.df_treatment}, ${dateAnova.df_block}, ${dateAnova.df_error}`;
          const grpStr = Object.entries(dateAnova.treatmentMeans)
            .map(([tNum, st]) => `${this.treatmentNames[parseInt(tNum) - 1] || `Trt ${tNum}`}: ${st.mean.toFixed(2)} (${st.group || 'a'})`)
            .join('; ');
          ws.getRow(r).values = [
            dateAnova.analyzedDate || dateKey,
            f.label,
            dateAnova.nIndependentUnits,
            dfStr,
            parseFloat(Number(dateAnova.f_value || 0).toFixed(4)),
            parseFloat(Number(dateAnova.p_value ?? 1).toFixed(4)),
            sig,
            parseFloat(Number(dateAnova.lsd || 0).toFixed(4)),
            dateAnova.grandMean >= 2 ? `${Number(dateAnova.cv || 0).toFixed(2)}%` : 'N/A',
            parseFloat(Number(dateAnova.grandMean || 0).toFixed(2)),
            grpStr
          ];
          r++;
        });
      });
    }

    r += 2;
    ws.mergeCells(`A${r}:N${r}`);
    ws.getCell(`A${r}`).value = '* Note: Repeated observations from the same experimental plots across multiple dates are NEVER pooled as independent replicates. Primary ANOVA evaluates 1 observation per independent experimental unit (Treatment × Block) on the latest valid assessment date.';
    ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { rgb: '2C3E50' }, bold: true };
    r++;

    ws.mergeCells(`A${r}:N${r}`);
    ws.getCell(`A${r}`).value = '* Note: Treatments sharing the same LSD letter are not significantly different at α = 0.05.';
    ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { rgb: '7F8C8D' }, bold: true };
    r++;

    ws.mergeCells(`A${r}:N${r}`);
    ws.getCell(`A${r}`).value = '* Note: Percentage efficacy values are descriptive only and should not be interpreted as statistically significant unless supported by the corresponding ANOVA results.';
    ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { rgb: '7F8C8D' } };
    r++;

    ws.mergeCells(`A${r}:N${r}`);
    ws.getCell(`A${r}`).value = '* Note: F-value of 0.00 and P-value of 1.00 indicate identical measurements across all treatments and replicates (zero variance within and between groups).';
    ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { rgb: '7F8C8D' } };
    r++;

    ws.mergeCells(`A${r}:N${r}`);
    ws.getCell(`A${r}`).value = '* Note: Nutrient Use Efficiency (NUE) values are derived/calculated from observed crop yield and nitrogen application rates, rather than directly measured physiological parameters.';
    ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { rgb: '7F8C8D' } };
  }
}
