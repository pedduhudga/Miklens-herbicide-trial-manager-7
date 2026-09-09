// src/utils/hracSynergy.js
// 100% Free Client-Side Agrochemical Interaction & Resistance Management Engine.
// Grounded in official HRAC (Herbicide Resistance Action Committee) and WSSA standards.
// Evaluates Mode of Action (MoA) diversity, tank-mix antagonism risks, and adjuvant pairings.

export const HRAC_DATABASE = {
  // Group 1: ACCase Inhibitors (Graminicides / Grass killers)
  'clethodim': { group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide', chemicalFamily: 'Cyclohexanedione', systemicity: 'Foliar Systemic', targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)' },
  'haloxyfop': { group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide', chemicalFamily: 'Aryloxyphenoxypropionate', systemicity: 'Foliar Systemic', targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)' },
  'quizalofop': { group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide', chemicalFamily: 'Aryloxyphenoxypropionate', systemicity: 'Foliar Systemic', targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)' },
  'fenoxaprop': { group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide', chemicalFamily: 'Aryloxyphenoxypropionate', systemicity: 'Foliar Systemic', targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)' },
  'propaquizafop': { group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', name: 'ACCase Inhibitors', class: 'Graminicide', chemicalFamily: 'Aryloxyphenoxypropionate', systemicity: 'Foliar Systemic', targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)' },

  // Group 2: ALS Inhibitors
  'imazethapyr': { group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic', chemicalFamily: 'Imidazolinone', systemicity: 'Systemic (Xylem & Phloem)', targetSite: 'Inhibition of acetolactate synthase (ALS)' },
  'halosulfuron': { group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic Sedge Killer', chemicalFamily: 'Sulfonylurea', systemicity: 'Systemic (Xylem & Phloem)', targetSite: 'Inhibition of acetolactate synthase (ALS)' },
  'metsulfuron': { group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic Broadleaf', chemicalFamily: 'Sulfonylurea', systemicity: 'Systemic (Xylem & Phloem)', targetSite: 'Inhibition of acetolactate synthase (ALS)' },
  'pyrazosulfuron': { group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic', chemicalFamily: 'Sulfonylurea', systemicity: 'Systemic (Xylem & Phloem)', targetSite: 'Inhibition of acetolactate synthase (ALS)' },
  'bispyribac': { group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', name: 'ALS Inhibitors', class: 'Systemic', chemicalFamily: 'Pyrimidinyl-benzoate', systemicity: 'Systemic (Xylem & Phloem)', targetSite: 'Inhibition of acetolactate synthase (ALS)' },

  // Group 3: Microtubule Assembly Inhibitors (Pre-emergent)
  'pendimethalin': { group: 'HRAC 3', hracGroup: '3', wssa: 'Group 3', name: 'Microtubule Inhibitors', class: 'Pre-emergent Residual', chemicalFamily: 'Dinitroaniline', systemicity: 'Soil Residual', targetSite: 'Microtubule assembly inhibition' },
  'trifluralin': { group: 'HRAC 3', hracGroup: '3', wssa: 'Group 3', name: 'Microtubule Inhibitors', class: 'Pre-emergent', chemicalFamily: 'Dinitroaniline', systemicity: 'Soil Residual', targetSite: 'Microtubule assembly inhibition' },

  // Group 4: Synthetic Auxins (Broadleaf killers)
  '2,4-d': { group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Systemic Broadleaf', chemicalFamily: 'Phenoxy-carboxylic acid', systemicity: 'Systemic (Symplastic)', targetSite: 'Synthetic auxin action (IAA mimic)' },
  'dicamba': { group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Systemic Broadleaf', chemicalFamily: 'Benzoic acid', systemicity: 'Systemic (Symplastic)', targetSite: 'Synthetic auxin action (IAA mimic)' },
  'triclopyr': { group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Woody Broadleaf', chemicalFamily: 'Pyridine-carboxylic acid', systemicity: 'Systemic (Symplastic)', targetSite: 'Synthetic auxin action (IAA mimic)' },
  'mcpa': { group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', name: 'Synthetic Auxins', class: 'Systemic Broadleaf', chemicalFamily: 'Phenoxy-carboxylic acid', systemicity: 'Systemic (Symplastic)', targetSite: 'Synthetic auxin action (IAA mimic)' },

  // Group 5: Photosystem II Inhibitors (PS II Serine 264)
  'atrazine': { group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', name: 'Photosystem II Inhibitors', class: 'Broadleaf & Grass', chemicalFamily: 'Triazine', systemicity: 'Xylem-mobile Systemic', targetSite: 'Inhibition of photosynthesis at photosystem II' },
  'metribuzin': { group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', name: 'Photosystem II Inhibitors', class: 'Residual Broadleaf', chemicalFamily: 'Triazinone', systemicity: 'Xylem-mobile Systemic', targetSite: 'Inhibition of photosynthesis at photosystem II' },
  'simazine': { group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', name: 'Photosystem II Inhibitors', class: 'Pre-emergent', chemicalFamily: 'Triazine', systemicity: 'Xylem-mobile Systemic', targetSite: 'Inhibition of photosynthesis at photosystem II' },

  // Group 9: EPSP Synthase Inhibitors (Broad-spectrum systemic)
  'glyphosate': { group: 'HRAC 9', hracGroup: '9', wssa: 'Group 9', name: 'Inhibition of EPSP Synthase', class: 'Non-selective Systemic', chemicalFamily: 'Organophosphorus', systemicity: 'Foliar Systemic Translocation', targetSite: 'Inhibition of EPSP synthase' },

  // Group 10: Glutamine Synthetase Inhibitors (Broad-spectrum contact)
  'glufosinate': { group: 'HRAC 10', hracGroup: '10', wssa: 'Group 10', name: 'Glutamine Synthetase Inhibitors', class: 'Broad-spectrum Knockdown', chemicalFamily: 'Phosphinic acid', systemicity: 'Contact Knockdown', targetSite: 'Inhibition of glutamine synthetase' },

  // Group 14: PPO Inhibitors (Cell Membrane Disruptors)
  'oxyfluorfen': { group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', name: 'PPO Inhibitors', class: 'Contact Burn / Pre-emergent', chemicalFamily: 'Diphenylether', systemicity: 'Contact Membrane Disruptor', targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)' },
  'carfentrazone': { group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', name: 'PPO Inhibitors', class: 'Fast Desiccant', chemicalFamily: 'Triazolinone', systemicity: 'Contact Membrane Disruptor', targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)' },
  'flumioxazin': { group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', name: 'PPO Inhibitors', class: 'Residual Knockdown', chemicalFamily: 'N-phenylphthalimide', systemicity: 'Contact / Residual', targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)' },

  // Group 22: Photosystem I Electron Diverters (Bipyridyliums)
  'paraquat': { group: 'HRAC 22', hracGroup: '22', wssa: 'Group 22', name: 'Photosystem I Diverters', class: 'Ultra-fast Contact Desiccant', chemicalFamily: 'Bipyridylium', systemicity: 'Ultra-fast Contact Desiccant', targetSite: 'Photosystem I electron diversion' },
  'diquat': { group: 'HRAC 22', hracGroup: '22', wssa: 'Group 22', name: 'Photosystem I Diverters', class: 'Contact Desiccant', chemicalFamily: 'Bipyridylium', systemicity: 'Ultra-fast Contact Desiccant', targetSite: 'Photosystem I electron diversion' },

  // Group 27: HPPD Inhibitors (Bleachers)
  'mesotrione': { group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', name: 'HPPD Inhibitors (Pigment)', class: 'Systemic Bleacher', chemicalFamily: 'Triketone', systemicity: 'Foliar & Root Systemic', targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)' },
  'tembotrione': { group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', name: 'HPPD Inhibitors (Pigment)', class: 'Systemic Bleacher', chemicalFamily: 'Triketone', systemicity: 'Foliar & Root Systemic', targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)' },
  'topramezone': { group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', name: 'HPPD Inhibitors (Pigment)', class: 'Systemic Bleacher', chemicalFamily: 'Pyrazolone', systemicity: 'Foliar & Root Systemic', targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)' },

  // Miklens Formulation Actives & Bio-Rational Desiccants
  'glycyl': { group: 'HRAC 9', hracGroup: '9', wssa: 'Group 9', name: 'Inhibition of EPSP Synthase (Glycyl)', class: 'Non-selective Systemic', chemicalFamily: 'Organophosphorus', systemicity: 'Foliar Systemic Translocation', targetSite: 'Inhibition of EPSP synthase' },
  'bpd': { group: 'HRAC 22', hracGroup: '22', wssa: 'Group 22', name: 'Photosystem I Diverters (BPD)', class: 'Ultra-fast Contact Desiccant', chemicalFamily: 'Bipyridylium / Contact', systemicity: 'Ultra-fast Contact Desiccant', targetSite: 'Photosystem I electron diversion' },
  'pelargonic': { group: 'Bio-Desiccant', hracGroup: 'Bio', wssa: 'Bio-Burndown', name: 'Fatty Acid Cell Membrane Disruptor', class: 'Bio-Contact Knockdown', chemicalFamily: 'Carboxylic Acid', systemicity: 'Contact Cuticle Burndown', targetSite: 'Rapid disruption of plant cuticle & cellular membranes' },

  // Adjuvants, Synergists & Penetrants
  'surfactant': { group: 'Adjuvant', hracGroup: 'Adj', wssa: 'Adjuvant', name: 'Non-Ionic Surfactant', class: 'Surface Tension Reducer', chemicalFamily: 'Alkoxylate / Surfactant', systemicity: 'Foliar Wetting Agent', targetSite: 'Reduces surface tension and enhances droplet spread' },
  'organosilicone': { group: 'Adjuvant', hracGroup: 'Adj', wssa: 'Adjuvant', name: 'Organosilicone Super-Spreader', class: 'Stomatal Infiltrator', chemicalFamily: 'Siloxane Polyether', systemicity: 'Stomatal Flooding Aid', targetSite: 'Facilitates direct stomatal cuticular infiltration' },
  'penetrant': { group: 'Adjuvant', hracGroup: 'Adj', wssa: 'Adjuvant', name: 'Cuticular Penetration Enhancer', class: 'Bio-Penetrant', chemicalFamily: 'Esterified Bio-Oil', systemicity: 'Cuticular Translocation Aid', targetSite: 'Dissolves epicuticular wax layers for accelerated active uptake' },
  'microweed': { group: 'Adjuvant', hracGroup: 'Adj', wssa: 'Adjuvant', name: 'Bio-Rational Penetrant & Synergist', class: 'Synergy Catalyst', chemicalFamily: 'Bio-adjuvant Complex', systemicity: 'Active Translocation Enhancer', targetSite: 'Accelerates foliar absorption and prevents spray bounce' }
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
      uniqueHracGroups: [],
      detectedMoas: [],
      activeIngredients: [],
      multiSiteScore: 'Single / Unknown',
      moaSummary: 'No active ingredients recorded.',
      antagonismAlerts: [],
      hasAntagonism: false,
      antagonismWarnings: [],
      synergies: [],
      adjuvantTips: [],
      adjuvantRecommendations: [],
      isMultiMoa: false
    };
  }

  const detectedMoas = [];
  const activeNames = [];

  const activeIngredients = ingredients.map(ing => {
    const rawName = (ing.name || ing.Name || '').trim();
    const hrac = identifyHrac(rawName);
    if (rawName) {
      activeNames.push(rawName.toLowerCase());
      if (hrac && !detectedMoas.some(m => m.group === hrac.group)) {
        detectedMoas.push(hrac);
      }
    }
    return {
      name: rawName,
      quantity: ing.quantity ?? ing.qty ?? '',
      unit: ing.unit || 'ml',
      hracGroup: hrac ? (hrac.hracGroup || hrac.group.replace('HRAC ', '')) : 'Unknown',
      chemicalFamily: hrac?.chemicalFamily || 'Organic Compound',
      systemicity: hrac?.systemicity || 'Contact / Systemic',
      targetSite: hrac?.targetSite || hrac?.name || 'Herbicide Active Ingredient'
    };
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
      actives: ['Group 1 (ACCase Graminicide)', 'Group 4 (Synthetic Auxin)'],
      description: 'Tank-mixing Group 1 (ACCase graminicides) with Group 4 (Synthetic Auxins e.g. 2,4-D) can reduce grass uptake & translocation by 15–30%. Recommend staggering applications or increasing graminicide rate by 20%.',
      recommendation: 'Stagger applications by 48-72 hours or increase the graminicide rate by 20% to prevent antagonism.'
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

  const antagonismWarnings = antagonismAlerts.map(a => ({
    actives: a.actives || ['Group 1 (Graminicide)', 'Group 4 (Synthetic Auxin)'],
    description: a.description,
    recommendation: a.recommendation || 'Stagger tank-mix application or elevate graminicide rate by 15-20%.'
  }));

  const adjuvantRecommendations = adjuvantTips.map(t => `${t.name}: ${t.purpose}`);

  const moaSummary = isMultiMoa 
    ? `Combines ${hracGroups.join(' + ')} across distinct biochemical pathways, delivering comprehensive weed spectrum and multi-site resistance defense.`
    : (hracGroups.length === 1 
      ? `Single Mode of Action (${hracGroups[0]}). Recommend rotating with complementary MoA classes to delay resistance development.`
      : 'Standard formulation profile.');

  return {
    hracGroups,
    uniqueHracGroups: hracGroups,
    detectedMoas,
    activeIngredients,
    multiSiteScore,
    moaSummary,
    isMultiMoa,
    antagonismAlerts,
    hasAntagonism: antagonismAlerts.length > 0,
    antagonismWarnings,
    synergies,
    adjuvantTips,
    adjuvantRecommendations
  };
}
