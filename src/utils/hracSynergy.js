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

/**
 * Quantitative Herbicide Mixture Synergy Analysis via Colby's Formula (Colby, S.R. 1967. Weeds 15:20-22)
 *
 * For two herbicides:
 *   E = X + Y - (X * Y) / 100
 *
 * For n herbicides (generalized probability of independent joint action):
 *   E = 100 * [1 - Π(1 - E_i / 100)]
 *
 * @param {Array<number|Object>} actives - Array of single-active control % or [{ name, efficacy, dose }]
 * @param {number|null} [observedEfficacy=null] - Measured mixture control %
 * @returns {Object} Colby calculation result:
 *   - expectedEfficacy: theoretical control % under independent joint action
 *   - observedEfficacy: measured control % (if provided)
 *   - synergyFactor: observed / expected (ratio > 1.10 = synergistic, < 0.90 = antagonistic)
 *   - deltaEfficacy: observed - expected
 *   - classification: 'Synergistic' | 'Additive' | 'Antagonistic' | 'Theoretical Expected Only'
 *   - details: explanation and component values
 */
export function calculateColbySynergy(actives = [], observedEfficacy = null) {
  if (!Array.isArray(actives) || actives.length === 0) {
    return {
      expectedEfficacy: 0,
      observedEfficacy: null,
      synergyFactor: null,
      deltaEfficacy: null,
      classification: 'Insufficient Data',
      details: 'No active components provided for Colby analysis.'
    };
  }

  // Parse efficacy values (bounded between 0 and 100)
  const components = actives.map((item, idx) => {
    let eff = 0;
    let name = `Active ${idx + 1}`;
    let dose = null;

    if (typeof item === 'number') {
      eff = item;
    } else if (item && typeof item === 'object') {
      eff = item.efficacy ?? item.controlPct ?? item.response ?? item.val ?? 0;
      name = item.name || item.active || name;
      dose = item.dose || item.rate || null;
    }

    const clampedEff = Math.max(0, Math.min(100, parseFloat(eff) || 0));
    return { name, efficacy: clampedEff, dose };
  });

  if (components.length === 1) {
    return {
      expectedEfficacy: components[0].efficacy,
      observedEfficacy: observedEfficacy !== null ? parseFloat(observedEfficacy) : null,
      synergyFactor: 1.0,
      deltaEfficacy: 0,
      classification: 'Single Active (Baseline)',
      components,
      details: 'Colby synergy requires at least 2 active ingredients.'
    };
  }

  // Generalized Colby formula: E = 100 * [1 - Π(1 - E_i / 100)]
  let productSurvival = 1.0;
  for (const comp of components) {
    productSurvival *= (1 - comp.efficacy / 100);
  }
  const expectedEfficacy = parseFloat((100 * (1 - productSurvival)).toFixed(2));

  let synergyFactor = null;
  let deltaEfficacy = null;
  let classification = 'Theoretical Expected Only';

  if (observedEfficacy !== null && !isNaN(observedEfficacy)) {
    const obs = Math.max(0, Math.min(100, parseFloat(observedEfficacy)));
    deltaEfficacy = parseFloat((obs - expectedEfficacy).toFixed(2));
    synergyFactor = expectedEfficacy > 0 ? parseFloat((obs / expectedEfficacy).toFixed(3)) : 1.0;

    if (synergyFactor > 1.10) {
      classification = 'Synergistic';
    } else if (synergyFactor < 0.90) {
      classification = 'Antagonistic';
    } else {
      classification = 'Additive';
    }
  }

  return {
    expectedEfficacy,
    observedEfficacy: observedEfficacy !== null ? parseFloat(observedEfficacy) : null,
    synergyFactor,
    deltaEfficacy,
    classification,
    formula: components.length === 2
      ? `E = ${components[0].efficacy}% + ${components[1].efficacy}% - (${components[0].efficacy} * ${components[1].efficacy}) / 100 = ${expectedEfficacy}%`
      : `E = 100 * [1 - ∏(1 - E_i/100)] = ${expectedEfficacy}%`,
    components,
    interpretation: classification === 'Synergistic'
      ? `Observed efficacy (${observedEfficacy}%) significantly exceeds Colby expected control (${expectedEfficacy}%) by +${deltaEfficacy}% (SF: ${synergyFactor}). True biological synergy confirmed.`
      : classification === 'Antagonistic'
        ? `Observed efficacy (${observedEfficacy}%) is significantly lower than Colby expected control (${expectedEfficacy}%) by ${deltaEfficacy}% (SF: ${synergyFactor}). Chemical or physiological antagonism detected.`
        : classification === 'Additive'
          ? `Observed efficacy (${observedEfficacy}%) is within ±10% of Colby expectation (${expectedEfficacy}%). Independent additive joint action.`
          : `Colby expected combined weed control is ${expectedEfficacy}%. Supply observed tank-mix efficacy to classify interaction.`
  };
}

/**
 * Wadley's ED50 Mixture Model for Equitoxic Herbicide Combinations
 * (Wadley, F.M. 1967. Biometrics)
 *
 * Expected mixture ED50:
 *   ED50_mix_expected = 1 / Σ(p_i / ED50_i)
 * where p_i is the proportion of component i in the mixture (Σ p_i = 1).
 *
 * Interaction Index (γ):
 *   γ = ED50_mix_expected / ED50_mix_observed
 *   - γ > 1.15 => Synergistic (lower dose needed than expected)
 *   - γ < 0.85 => Antagonistic (higher dose needed than expected)
 *   - 0.85 ≤ γ ≤ 1.15 => Additive
 *
 * @param {Array<Object>} components - [{ name, proportion, ed50 }]
 * @param {number|null} [observedEd50=null] - Measured ED50 of the physical mixture
 * @returns {Object} Wadley model interaction statistics
 */
export function calculateWadleyMixture(components = [], observedEd50 = null) {
  if (!Array.isArray(components) || components.length < 2) {
    return { error: 'Wadley mixture model requires at least 2 components with ED50 and proportions.' };
  }

  // Normalize proportions
  const totalProp = components.reduce((sum, c) => sum + (parseFloat(c.proportion) || 0), 0);
  if (totalProp <= 0) {
    return { error: 'Sum of component proportions must be greater than 0.' };
  }

  let harmonicSum = 0;
  const parsedComponents = components.map(c => {
    const p = (parseFloat(c.proportion) || 0) / totalProp;
    const ed = parseFloat(c.ed50);
    if (!ed || ed <= 0) throw new Error(`Invalid ED50 for component ${c.name || 'unknown'}`);
    harmonicSum += p / ed;
    return { name: c.name || 'Component', proportion: parseFloat(p.toFixed(4)), ed50: ed };
  });

  const expectedEd50 = parseFloat((1 / harmonicSum).toFixed(4));
  let interactionIndex = null;
  let classification = 'Theoretical Expected ED50';

  if (observedEd50 !== null && !isNaN(observedEd50) && observedEd50 > 0) {
    interactionIndex = parseFloat((expectedEd50 / observedEd50).toFixed(3));
    if (interactionIndex > 1.15) classification = 'Synergistic (Potentiated)';
    else if (interactionIndex < 0.85) classification = 'Antagonistic';
    else classification = 'Additive';
  }

  return {
    expectedEd50,
    observedEd50: observedEd50 !== null ? parseFloat(observedEd50) : null,
    interactionIndex,
    classification,
    components: parsedComponents,
    interpretation: interactionIndex !== null
      ? (classification.includes('Synergistic')
          ? `Mixture requires less chemical (Observed ED50: ${observedEd50}) than predicted by Wadley harmonic model (${expectedEd50}). Interaction Index = ${interactionIndex}.`
          : classification === 'Antagonistic'
            ? `Mixture requires more chemical (Observed ED50: ${observedEd50}) than predicted by Wadley model (${expectedEd50}). Antagonism confirmed.`
            : `Observed ED50 (${observedEd50}) matches Wadley additive prediction (${expectedEd50}).`)
      : `Wadley expected mixture ED50 is ${expectedEd50} g a.i./ha.`
  };
}

