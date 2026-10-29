// src/utils/agronomicInputs.js
// Standardized Agronomic Inputs & Crop Management Operations for scientific agricultural trials.
// Supports Fertilizers, Pesticides, Fungicides, Biostimulants, Micronutrients, Soil Amendments, Irrigation, etc.

import { safeJsonParse } from './helpers.js';

export const INPUT_CATEGORIES = [
  { id: 'fertilizer', label: 'Fertilizer / Nutrient', color: 'amber', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'pesticide', label: 'Insecticide / Pesticide', color: 'red', badge: 'bg-red-100 text-red-800 border-red-300' },
  { id: 'fungicide', label: 'Fungicide / Bactericide', color: 'indigo', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { id: 'biostimulant', label: 'Biostimulant / Growth Promoter', color: 'teal', badge: 'bg-teal-100 text-teal-800 border-teal-300' },
  { id: 'micronutrient', label: 'Micronutrient', color: 'emerald', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'soil_amendment', label: 'Soil Amendment (Lime/Gypsum/Compost)', color: 'stone', badge: 'bg-stone-100 text-stone-800 border-stone-300' },
  { id: 'irrigation', label: 'Irrigation / Fertigation', color: 'sky', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 'herbicide', label: 'Maintenance Weedicide / Herbicide', color: 'lime', badge: 'bg-lime-100 text-lime-800 border-lime-300' },
  { id: 'growth_regulator', label: 'Plant Growth Regulator (PGR)', color: 'purple', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'other', label: 'Other Input', color: 'slate', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
];

export const DOSAGE_UNITS = [
  'kg/ha',
  'g/ha',
  'L/ha',
  'mL/ha',
  'g/L',
  'mL/L',
  'kg/acre',
  'L/acre',
  'g/plant',
  'mL/plant',
  'ppm',
  'kg/plot',
  'g/plot',
  'kg/pot',
  'g/pot',
  '% w/v',
  '% v/v',
  'm³/ha',
];

export const APPLICATION_METHODS = [
  'Foliar Spray',
  'Basal Soil Application',
  'Top Dressing',
  'Fertigation (Drip)',
  'Soil Drench',
  'Seed Treatment',
  'Band Placement',
  'Broadcast',
  'Root Dip',
  'Furrow Application',
  'Trunk Injection',
  'Knapsack Spray',
  'Power Sprayer',
  'Other',
];

// Presets by category to save scientists time when logging trial maintenance
export const CATEGORY_INPUT_PRESETS = {
  nutrition: [
    {
      label: 'Basal NPK (120:60:60 kg/ha equivalent)',
      inputType: 'fertilizer',
      productName: 'NPK Complex (DAP + MOP + Urea)',
      activeIngredient: '18-46-0 + 0-0-60 + 46-0-0',
      dosage: '100',
      dosageUnit: 'kg/ha',
      method: 'Basal Soil Application',
      cropStage: 'Pre-planting / Sowing',
      targetPurpose: 'Basal macro-nutrient foundation for crop establishment',
    },
    {
      label: 'Urea Top Dressing @ Active Tillering / Vegetative',
      inputType: 'fertilizer',
      productName: 'Prilled Urea (46% N)',
      activeIngredient: 'Nitrogen (N) 46%',
      dosage: '45',
      dosageUnit: 'kg/ha',
      method: 'Top Dressing',
      cropStage: 'Tillering / Vegetative (BBCH 21-25)',
      targetPurpose: 'Nitrogen replenishment for canopy and tiller development',
    },
    {
      label: 'Micronutrient Foliar Spray (Zn + Fe + Boron)',
      inputType: 'micronutrient',
      productName: 'Chelated Micronutrient Cocktail',
      activeIngredient: 'Zn EDTA 12% + Fe EDTA 12% + Borax 10%',
      dosage: '1.5',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative / Pre-flowering',
      targetPurpose: 'Prevent and correct hidden micronutrient deficiencies',
    },
    {
      label: 'Potassium Sulphate (0:0:50) Foliar Spray @ Fruit/Grain Fill',
      inputType: 'fertilizer',
      productName: 'SOP (Sulphate of Potash)',
      activeIngredient: '0-0-50 + 17% S',
      dosage: '5',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Fruit Fill / Grain Filling',
      targetPurpose: 'Enhance fruit sizing, test weight, and sugar accumulation',
    },
    {
      label: 'Maintenance Preventive Fungicide (Mancozeb)',
      inputType: 'fungicide',
      productName: 'Mancozeb 75% WP',
      activeIngredient: 'Mancozeb 75%',
      dosage: '2.5',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative',
      targetPurpose: 'Prevent fungal leaf spot/blight interfering with nutrition evaluation',
    },
    {
      label: 'Maintenance Pest Knockdown (Imidacloprid)',
      inputType: 'pesticide',
      productName: 'Imidacloprid 17.8% SL',
      activeIngredient: 'Imidacloprid 17.8%',
      dosage: '0.4',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Seedling / Vegetative',
      targetPurpose: 'Prevent sucking pests (aphids/thrips) from masking nutrient vigor',
    },
  ],

  fungicide: [
    {
      label: 'Preventive Contact Fungicide (Mancozeb 75% WP)',
      inputType: 'fungicide',
      productName: 'Mancozeb 75% WP',
      activeIngredient: 'Mancozeb 75%',
      dosage: '2.5',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative (BBCH 15-20)',
      targetPurpose: 'Protective multi-site blanket barrier against fungal spore germination',
    },
    {
      label: 'Broad-Spectrum Systemic Triazole (Difenoconazole 25% EC)',
      inputType: 'fungicide',
      productName: 'Score 25% EC',
      activeIngredient: 'Difenoconazole 25%',
      dosage: '1',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Booting / Pre-flowering',
      targetPurpose: 'Curative and eradicative arrest of established mycelial growth',
    },
    {
      label: 'Copper Oxychloride (50% WP) - Bacterial & Downy Blight',
      inputType: 'fungicide',
      productName: 'Copper Oxychloride 50% WP',
      activeIngredient: 'Metallic Copper 50%',
      dosage: '3',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Flowering / Early fruit set',
      targetPurpose: 'Bactericidal and broad oomycete disease suppression',
    },
    {
      label: 'Standard Recommended Fertilizer Application (Basal NPK)',
      inputType: 'fertilizer',
      productName: 'NPK Fertilizer Blend (15:15:15)',
      activeIngredient: '15-15-15 N-P2O5-K2O',
      dosage: '150',
      dosageUnit: 'kg/ha',
      method: 'Basal Soil Application',
      cropStage: 'Pre-planting',
      targetPurpose: 'Ensure robust crop nutrition throughout disease testing duration',
    },
    {
      label: 'Maintenance Pest Suppression (Chlorpyrifos 20% EC)',
      inputType: 'pesticide',
      productName: 'Chlorpyrifos 20% EC',
      activeIngredient: 'Chlorpyrifos 20%',
      dosage: '2',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative',
      targetPurpose: 'Suppress insect vectors that could spread secondary viral/fungal pathotypes',
    },
  ],

  pesticide: [
    {
      label: 'Broad-Spectrum Diamide (Chlorantraniliprole 18.5% SC)',
      inputType: 'pesticide',
      productName: 'Coragen 18.5% SC',
      activeIngredient: 'Chlorantraniliprole 18.5%',
      dosage: '0.3',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Active Tillering / Vegetative',
      targetPurpose: 'Rapid ovi-larvicidal control of caterpillars, borers, and defoliators',
    },
    {
      label: 'Sucking Pest Knockdown (Imidacloprid 17.8% SL)',
      inputType: 'pesticide',
      productName: 'Confidor 17.8% SL',
      activeIngredient: 'Imidacloprid 17.8%',
      dosage: '0.5',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative / Shoot elongation',
      targetPurpose: 'Systemic knockdown of jassids, aphids, thrips, and plant hoppers',
    },
    {
      label: 'Bio-Insecticide (Neem Azadirachtin 10,000 ppm)',
      inputType: 'pesticide',
      productName: 'Neem Azadirachtin 1% EC',
      activeIngredient: 'Azadirachtin 10,000 ppm',
      dosage: '2',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Early seedling',
      targetPurpose: 'Antifeedant and oviposition deterrent for IPM resistance management',
    },
    {
      label: 'Standard Recommended Fertilizer Application (Basal NPK)',
      inputType: 'fertilizer',
      productName: 'DAP + MOP + Urea Program',
      activeIngredient: 'Standard NPK (100:50:50)',
      dosage: '120',
      dosageUnit: 'kg/ha',
      method: 'Basal Soil Application',
      cropStage: 'Sowing / Basal',
      targetPurpose: 'Uniform crop stand to prevent pest bias caused by poor plant vigor',
    },
    {
      label: 'Maintenance Protective Fungicide (Chlorothalonil 75% WP)',
      inputType: 'fungicide',
      productName: 'Kavach 75% WP',
      activeIngredient: 'Chlorothalonil 75%',
      dosage: '2',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Mid-vegetative',
      targetPurpose: 'Prevent foliage disease outbreaks during insect evaluation',
    },
  ],

  biostimulant: [
    {
      label: 'Ascophyllum nodosum Seaweed Extract Foliar Spray',
      inputType: 'biostimulant',
      productName: 'Cold-Pressed Seaweed Extract',
      activeIngredient: 'Ascophyllum nodosum bioactives + Betaines',
      dosage: '2',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative / Pre-flowering (BBCH 30)',
      targetPurpose: 'Enhance abiotic stress resilience and stimulate endogenous phytohormones',
    },
    {
      label: 'Humic + Fulvic Acid Root Drench / Fertigation',
      inputType: 'biostimulant',
      productName: 'Liquid Potassium Humate 18%',
      activeIngredient: 'Humic Acid 12% + Fulvic Acid 6%',
      dosage: '5',
      dosageUnit: 'mL/L',
      method: 'Soil Drench',
      cropStage: 'Transplanting / Root establishment (BBCH 12)',
      targetPurpose: 'Stimulate primary and lateral root biomass and rhizosphere CEC',
    },
    {
      label: 'Enzymatic Amino Acid Hydrolysate Foliar Tonic',
      inputType: 'biostimulant',
      productName: 'L-Free Amino Acids 24%',
      activeIngredient: 'Enzymatic Plant-derived L-Amino Acids',
      dosage: '1.5',
      dosageUnit: 'mL/L',
      method: 'Foliar Spray',
      cropStage: 'Post-drought / Post-cold stress recovery',
      targetPurpose: 'Accelerate protein synthesis and chlorophyll restoration under stress',
    },
    {
      label: 'Standard Recommended Fertilizer Program (Basal NPK)',
      inputType: 'fertilizer',
      productName: 'Basal NPK 100% RDF',
      activeIngredient: 'Recommended Dose of Fertilizers',
      dosage: '100',
      dosageUnit: 'kg/ha',
      method: 'Basal Soil Application',
      cropStage: 'Sowing / Basal',
      targetPurpose: 'Standard baseline nutrition across all biostimulant plots',
    },
    {
      label: 'Maintenance Pest & Disease Protection Spray',
      inputType: 'fungicide',
      productName: 'Mancozeb 75% WP + Imidacloprid',
      activeIngredient: 'Mancozeb + Imidacloprid',
      dosage: '2',
      dosageUnit: 'g/L',
      method: 'Foliar Spray',
      cropStage: 'Vegetative',
      targetPurpose: 'Protect trial foliage from pest/disease confounders during bio-evaluations',
    },
  ],
};

/**
 * Normalizes an application log item to include all scientific agronomic fields.
 */
export function normalizeApplicationItem(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `app_${Date.now()}_${idx}`,
      code: `App ${String.fromCharCode(65 + idx)}`,
      date: new Date().toISOString(),
      inputType: 'other',
      productName: '',
      activeIngredient: '',
      dosage: '',
      dosageUnit: 'kg/ha',
      method: 'Foliar Spray',
      cropStage: '',
      targetPurpose: '',
      appliedScope: 'All Plots / Whole Trial',
      operator: '',
      weather: '',
      temp: '',
      humidity: '',
      windspeed: '',
      rain: 'No',
      notes: '',
      adjuvant: '',
      tankMix: '',
    };
  }

  // Detect input type if not provided
  let detectedType = raw.inputType || raw.type || '';
  if (!detectedType) {
    const text = `${raw.productName || ''} ${raw.activeIngredient || ''} ${raw.code || ''} ${raw.notes || ''} ${raw.targetPurpose || ''}`.toLowerCase();
    if (/fertiliz|urea|dap|mop|npk|potash|nitrogen|phosphor|zinc|boron|gypsum|lime|compost/i.test(text)) {
      detectedType = 'fertilizer';
    } else if (/fungic|mancozeb|copper|azoxy|triazole|mildew|blight|rust|pathogen/i.test(text)) {
      detectedType = 'fungicide';
    } else if (/pesticid|insectic|aphid|worm|larva|thrip|borer|chlorpyrifos|imidacloprid|coragen/i.test(text)) {
      detectedType = 'pesticide';
    } else if (/biostim|seaweed|humic|fulvic|amino|microbial|growth/i.test(text)) {
      detectedType = 'biostimulant';
    } else if (/herbicide|weed|glyphosate|atrazine|paraquat/i.test(text)) {
      detectedType = 'herbicide';
    } else {
      detectedType = 'other';
    }
  }

  // Parse dosage and unit if packed as a string like "100 mL/ha"
  let dosageVal = raw.dosage ?? '';
  let dosageUnitVal = raw.dosageUnit ?? '';
  if (typeof dosageVal === 'string' && !dosageUnitVal) {
    const match = dosageVal.match(/^([\d.,]+)\s*([a-zA-Z/%³\s]+)$/);
    if (match) {
      dosageVal = match[1];
      dosageUnitVal = match[2].trim();
    }
  }
  if (!dosageUnitVal) dosageUnitVal = 'kg/ha';

  return {
    id: raw.id || `app_${Date.now()}_${idx}`,
    code: raw.code || `App ${String.fromCharCode(65 + idx)}`,
    date: raw.date || raw.timestamp || '',
    inputType: detectedType,
    productName: raw.productName || raw.product || raw.treatmentName || raw.name || '',
    activeIngredient: raw.activeIngredient || raw.ai || raw.active || '',
    dosage: dosageVal,
    dosageUnit: dosageUnitVal,
    method: raw.method || raw.applicationMethod || 'Foliar Spray',
    cropStage: raw.cropStage || raw.stage || raw.targetStage || '',
    targetPurpose: raw.targetPurpose || raw.purpose || raw.target || '',
    appliedScope: raw.appliedScope || raw.scope || 'All Plots / Whole Trial',
    operator: raw.operator || raw.appliedBy || '',
    temp: raw.temp ?? '',
    humidity: raw.humidity ?? '',
    windspeed: raw.windspeed ?? '',
    rain: raw.rain || 'No',
    weather: raw.weather || (raw.temp || raw.humidity ? `${raw.temp ? `${raw.temp}°C ` : ''}${raw.humidity ? `${raw.humidity}% RH` : ''}`.trim() : ''),
    notes: raw.notes || raw.remarks || '',
    adjuvant: raw.adjuvant || '',
    tankMix: raw.tankMix || '',
  };
}

/**
 * Parses and normalizes an entire application log JSON string or array.
 */
export function parseAgronomicInputLog(raw) {
  const parsed = safeJsonParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item, idx) => normalizeApplicationItem(item, idx));
}

/**
 * Gets category display metadata.
 */
export function getInputCategoryBadge(typeId) {
  const found = INPUT_CATEGORIES.find(c => c.id === typeId);
  return found || { id: typeId || 'other', label: typeId ? typeId.toUpperCase() : 'Input', color: 'slate', badge: 'bg-slate-100 text-slate-800 border-slate-300' };
}
