// src/utils/hracSynergy.js
// 100% Free Client-Side Agrochemical Interaction & Resistance Management Engine.
// Grounded in official HRAC (Herbicide Resistance Action Committee) and WSSA standards.
// Evaluates Mode of Action (MoA) diversity, tank-mix antagonism risks, and adjuvant pairings.

export const HRAC_DATABASE = {
  // Group 1: ACCase Inhibitors (Graminicides / Grass killers)
  'clethodim': { group: 'HRAC 1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide' },
  'haloxyfop': { group: 'HRAC 1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide' },
  'quizalofop': { group: 'HRAC 1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide' },
  'fenoxaprop': { group: 'HRAC 1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide' },
  'propaquizafop': { group: 'HRAC 1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide' },

  // Group 2: ALS Inhibitors
  'imazethapyr': { group: 'HRAC 2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic' },
  'halosulfuron': { group: 'HRAC 2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic Sedge Killer' },
  'metsulfuron': { group: 'HRAC 2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic Broadleaf' },
  'pyrazosulfuron': { group: 'HRAC 2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic' },
  'bispyribac': { group: 'HRAC 2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic' },

  // Group 3: Microtubule Assembly Inhibitors (Pre-emergent)
  'pendimethalin': { group: 'HRAC 3', wssa: 'Group 3', name: 'Microtubule Inhibitors', class: 'Pre-emergent Residual' },
  'trifluralin': { group: 'HRAC 3', wssa: 'Group 3', name: 'Microtubule Inhibitors', class: 'Pre-emergent' },

  // Group 4: Synthetic Auxins (Broadleaf killers)
  '2,4-d': { group: 'HRAC 4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Systemic Broadleaf' },
  'dicamba': { group: 'HRAC 4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Systemic Broadleaf' },
  'triclopyr': { group: 'HRAC 4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Woody Broadleaf' },
  'mcpa': { group: 'HRAC 4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Systemic Broadleaf' },

  // Group 5: Photosystem II Inhibitors (PS II Serine 264)
  'atrazine': { group: 'HRAC 5', wssa: 'Group 5', name: 'Photosystem II Inhibitors', class: 'Broadleaf & Grass' },
  'metribuzin': { group: 'HRAC 5', wssa: 'Group 5', name: 'Photosystem II Inhibitors', class: 'Residual Broadleaf' },
  'simazine': { group: 'HRAC 5', wssa: 'Group 5', name: 'Photosystem II Inhibitors', class: 'Pre-emergent' },

  // Group 9: EPSP Synthase Inhibitors (Broad-spectrum systemic)
  'glyphosate': { group: 'HRAC 9', wssa: 'Group 9', name: 'Inhibition of EPSP Synthase', class: 'Non-selective Systemic' },

  // Group 10: Glutamine Synthetase Inhibitors (Broad-spectrum contact)
  'glufosinate': { group: 'HRAC 10', wssa: 'Group 10', name: 'Glutamine Synthetase Inhibitors', class: 'Broad-spectrum Knockdown' },

  // Group 14: PPO Inhibitors (Cell Membrane Disruptors)
  'oxyfluorfen': { group: 'HRAC 14', wssa: 'Group 14', name: 'PPO Inhibitors', class: 'Contact Burn / Pre-emergent' },
  'carfentrazone': { group: 'HRAC 14', wssa: 'Group 14', name: 'PPO Inhibitors', class: 'Fast Desiccant' },
  'flumioxazin': { group: 'HRAC 14', wssa: 'Group 14', name: 'PPO Inhibitors', class: 'Residual Knockdown' },

  // Group 22: Photosystem I Electron Diverters (Bipyridyliums)
  'paraquat': { group: 'HRAC 22', wssa: 'Group 22', name: 'Photosystem I Diverters', class: 'Ultra-fast Contact Desiccant' },
  'diquat': { group: 'HRAC 22', wssa: 'Group 22', name: 'Photosystem I Diverters', class: 'Contact Desiccant' },

  // Group 27: HPPD Inhibitors (Bleachers)
  'mesotrione': { group: 'HRAC 27', wssa: 'Group 27', name: 'HPPD Inhibitors (Pigment)', class: 'Systemic Bleacher' },
  'tembotrione': { group: 'HRAC 27', wssa: 'Group 27', name: 'HPPD Inhibitors (Pigment)', class: 'Systemic Bleacher' },
  'topramezone': { group: 'HRAC 27', wssa: 'Group 27', name: 'HPPD Inhibitors (Pigment)', class: 'Systemic Bleacher' }
};

/**
 * Identify HRAC classification for an active ingredient string.
 */
export function identifyHrac(activeName) {
  if (!activeName || typeof activeName !== 'string') return null;
  const clean = activeName.toLowerCase().trim();

  for (const [key, data] of Object.entries(HRAC_DATABASE)) {
    if (clean.includes(key) || key.includes(clean)) {
      return { active: key, ...data };
    }
  }

  return null;
}

/**
 * Comprehensive chemical formulation synergy, antagonism, and adjuvant analysis.
 * @param {Array<Object>} ingredients - List of ingredients { name, quantity, unit }
 * @returns {Object} Analysis with MOA groups, antagonism alerts, adjuvant recommendations
 */
export function analyzeFormulationSynergy(ingredients = []) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return {
      hracGroups: [],
      multiSiteScore: 'Single / Unknown',
      antagonismAlerts: [],
      synergies: [],
      adjuvantTips: [],
      isMultiMoa: false
    };
  }

  const detectedMoas = [];
  const activeNames = [];

  ingredients.forEach(ing => {
    const name = (ing.name || ing.Name || '').trim();
    if (name) {
      activeNames.push(name.toLowerCase());
      const hrac = identifyHrac(name);
      if (hrac && !detectedMoas.some(m => m.group === hrac.group)) {
        detectedMoas.push(hrac);
      }
    }
  });

  const hracGroups = detectedMoas.map(m => m.group);
  const isMultiMoa = hracGroups.length > 1;

  // Multi-Site Resistance Management Score
  let multiSiteScore = 'Single MOA';
  if (hracGroups.length >= 3) multiSiteScore = 'Triple MOA (Maximum Resistance Defense)';
  else if (hracGroups.length === 2) multiSiteScore = 'Dual MOA (Multi-Site Anti-Resistance)';

  const antagonismAlerts = [];
  const synergies = [];
  const adjuvantTips = [];

  // 1. Antagonism Rule: Group 1 (ACCase) + Group 4 (Auxins)
  const hasGroup1 = detectedMoas.some(m => m.wssa === 'Group 1');
  const hasGroup4 = detectedMoas.some(m => m.wssa === 'Group 4');
  if (hasGroup1 && hasGroup4) {
    antagonismAlerts.push({
      severity: 'high',
      title: 'Graminicide & Auxin Antagonism',
      description: 'Tank-mixing Group 1 (ACCase graminicides) with Group 4 (Synthetic Auxins e.g. 2,4-D) can reduce grass uptake & translocation by 15–30%. Recommend staggering applications or increasing graminicide rate by 20%.'
    });
  }

  // 2. Synergy Rule: Systemic (Group 9) + Fast Desiccant (Group 14)
  const hasGroup9 = detectedMoas.some(m => m.wssa === 'Group 9');
  const hasGroup14 = detectedMoas.some(m => m.wssa === 'Group 14');
  if (hasGroup9 && hasGroup14) {
    synergies.push({
      title: 'Dual Speed Penetration & Translocation',
      description: 'Group 14 (PPO inhibitor) provides immediate 24-48h foliar burning, creating entry micro-lesions for Group 9 (Glyphosate) deep systemic root translocation.'
    });
  }

  // 3. Synergy Rule: Contact Knockdown + Soil Residual (Group 10 + Group 3/5)
  const hasGroup10 = detectedMoas.some(m => m.wssa === 'Group 10');
  const hasResidual = detectedMoas.some(m => m.wssa === 'Group 3' || m.wssa === 'Group 5');
  if (hasGroup10 && hasResidual) {
    synergies.push({
      title: 'Knockdown + Pre-emergent Barrier',
      description: 'Glufosinate delivers immediate vegetative burndown while the residual partner prevents weed seedling emergence for 30–45+ days.'
    });
  }

  // 4. Adjuvant Recommendations
  if (hasGroup9) {
    adjuvantTips.push({
      name: 'Ammonium Sulfate (AMS)',
      purpose: 'Prevents hard water cation binding (Ca²⁺/Mg²⁺) and boosts systemic leaf absorption.'
    });
  }

  if (hasGroup1 || hasGroup14) {
    adjuvantTips.push({
      name: 'Methylated Seed Oil (MSO) / Organosilicone Surfactant',
      purpose: 'Dramatically reduces surface tension for uniform droplet spread across thick waxy cuticles (e.g. Cynodon, Cyperus).'
    });
  } else if (ingredients.length > 0) {
    adjuvantTips.push({
      name: 'Non-Ionic Surfactant (NIS 80/20)',
      purpose: 'Ensures optimal foliar wetting and cuticular penetration.'
    });
  }

  return {
    hracGroups,
    detectedMoas,
    multiSiteScore,
    isMultiMoa,
    antagonismAlerts,
    synergies,
    adjuvantTips
  };
}
