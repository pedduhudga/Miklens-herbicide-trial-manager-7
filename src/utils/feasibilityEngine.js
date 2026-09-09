import { canonicalizeIngredients } from './formulationDuplicateUtils.js';
import { analyzeFormulationSynergy } from './hracSynergy.js';
import { safeJsonParse } from './helpers.js';

/**
 * Standard weed species spectrum knowledge bank for agrochemical modes of action.
 */
const WEED_SENSITIVITY_PROFILES = {
  '1': {
    // ACCase inhibitors (Graminicides)
    name: 'ACCase Graminicides',
    susceptible: ['Echinochloa crus-galli (Barnyard grass)', 'Digitaria sanguinalis (Crabgrass)', 'Setaria viridis (Foxtail)', 'Eleusine indica (Goosegrass)', 'Avena fatua (Wild oat)'],
    moderate: ['Cynodon dactylon (Bermuda grass - requires high rate/repeat)', 'Sorghum halepense (Johnsongrass)'],
    tolerant: ['All Broadleaf weeds (Amaranthus, Parthenium, Chenopodium)', 'All Sedges (Cyperus rotundus)']
  },
  '2': {
    // ALS inhibitors
    name: 'ALS Inhibitors',
    susceptible: ['Cyperus rotundus (Purple nutsedge)', 'Cyperus difformis', 'Echinochloa colona', 'Parthenium hysterophorus', 'Amaranthus viridis'],
    moderate: ['Cynodon dactylon', 'Conyza bonariensis (Fleabane - ALS resistance common)'],
    tolerant: ['Resistant biotypes of Lolium rigidum', 'Advanced woody perennials']
  },
  '3': {
    // Microtubule inhibitors (Pre-emergent)
    name: 'Microtubule Inhibitors (Pre-emergent)',
    susceptible: ['Germinating annual grasses (Setaria, Digitaria, Echinochloa)', 'Small-seeded broadleafs (Amaranthus, Portulaca, Chenopodium)'],
    moderate: ['Eleusine indica'],
    tolerant: ['Established perennial weeds (Cynodon, Cyperus with tubers)', 'Emerged weeds > 2 leaf stage']
  },
  '4': {
    // Synthetic Auxins
    name: 'Synthetic Auxins (2,4-D, Dicamba, MCPA)',
    susceptible: ['Parthenium hysterophorus', 'Amaranthus retroflexus', 'Chenopodium album', 'Convolvulus arvensis (Field bindweed)', 'Xanthium strumarium'],
    moderate: ['Solanum nigrum (Black nightshade)', 'Malva parviflora'],
    tolerant: ['Monocot Grasses (Echinochloa, Cynodon, Digitaria, Maize/Wheat tolerant)']
  },
  '5': {
    // PSII Inhibitors
    name: 'Photosystem II Inhibitors (Triazines/Metribuzin)',
    susceptible: ['Amaranthus viridis', 'Chenopodium album', 'Portulaca oleracea', 'Parthenium hysterophorus', 'Annual grass seedlings'],
    moderate: ['Echinochloa crus-galli', 'Digitaria ciliaris'],
    tolerant: ['Perennial rootstock weeds', 'PSII-resistant pigweed biotypes']
  },
  '9': {
    // Glyphosate
    name: 'EPSP Synthase Inhibitors (Glyphosate)',
    susceptible: ['Cynodon dactylon (Bermuda grass)', 'Echinochloa colona', 'Parthenium hysterophorus', 'Digitaria sanguinalis', 'Bidens pilosa', 'Amaranthus viridis'],
    moderate: ['Conyza canadensis (Horseweed/Fleabane)', 'Eleusine indica (Goosegrass - moderate rate tolerance)'],
    tolerant: ['Glyphosate-resistant Amaranthus palmeri', 'Equisetum arvense', 'Waxy cuticle weeds in drought stress']
  },
  '10': {
    // Glufosinate
    name: 'Glutamine Synthetase Inhibitors (Glufosinate)',
    susceptible: ['Eleusine indica (Goosegrass)', 'Amaranthus viridis', 'Echinochloa crus-galli', 'Parthenium hysterophorus', 'Portulaca oleracea', 'Commelina benghalensis'],
    moderate: ['Cynodon dactylon (burndown only, will regrow from rhizomes)', 'Cyperus rotundus (topkill only)'],
    tolerant: ['Perennial underground crowns/tubers without systemic partner']
  },
  '14': {
    // PPO Inhibitors
    name: 'PPO Inhibitors (Oxyfluorfen, Carfentrazone)',
    susceptible: ['Parthenium hysterophorus', 'Amaranthus spinosus', 'Chenopodium album', 'Ipomoea purpurea (Morningglory)', 'Malva sylvestris'],
    moderate: ['Annual grass seedlings (< 2-leaf stage)'],
    tolerant: ['Established perennial grasses (Cynodon)', 'Deep-rooted perennial sedges']
  },
  '22': {
    // Bipyridyliums (Paraquat/Diquat)
    name: 'Photosystem I Diverters (Paraquat)',
    susceptible: ['Fast foliar desiccation on all emerged annual grasses & broadleaves (100% 24h burndown)'],
    moderate: ['Perennial weeds (foliar desiccated, but root crowns re-sprout in 7-14 days)'],
    tolerant: ['Underground tubers, seeds, dormant rhizomes']
  }
};

/**
 * Predicts efficacy and spectrum feasibility for a proposed recipe
 * based on historical database trials, HRAC mode of action, and Colby synergy.
 *
 * @param {Array|string} ingredients - Candidate formula ingredients [{ name, quantity, unit }]
 * @param {Array} trials - Historical trials from state.trials
 * @param {string} [targetSpecies] - Target weed/pest species name (optional)
 * @returns {Object} Feasibility prediction report
 */
export function predictFormulaFeasibility(ingredients, trials = [], targetSpecies = '') {
  const canon = canonicalizeIngredients(ingredients);
  if (canon.length === 0) {
    return {
      feasible: false,
      overallRating: 'Incomplete Recipe',
      predictedEfficacyMin: 0,
      predictedEfficacyMax: 0,
      predictedEfficacyAvg: 0,
      confidence: 'Low',
      primaryMoa: 'None',
      colbySynergy: null,
      susceptibleWeeds: [],
      moderateWeeds: [],
      tolerantWeeds: [],
      riskFactors: ['No valid active ingredients or quantities specified.'],
      recommendations: ['Add at least one recognized herbicide active ingredient.'],
      groundingTrialsCount: 0
    };
  }

  // 1. Chemical synergy & MOA analysis
  const synergy = analyzeFormulationSynergy(canon.map(c => ({ name: c.origName, quantity: c.qty, unit: c.unit })));
  const detectedMoas = synergy.detectedMoas || [];
  const hracKeys = detectedMoas.map(m => String(m.hracGroup || m.group.replace('HRAC ', ''))).filter(Boolean);

  // 2. Query historical trials for matching ingredients or similar products
  const matchingTrials = [];
  const targetLower = String(targetSpecies || '').toLowerCase().trim();

  trials.forEach(trial => {
    if (!trial) return;
    const tName = String(trial.FormulationName || trial.Product || '').toLowerCase();
    const tIngs = safeJsonParse(trial.IngredientsJSON || trial.Ingredients, []);
    const tIngsNames = tIngs.map(i => String(i.name || i.Name || '').toLowerCase());

    // Check if trial shares any ingredients
    const sharesIngredient = canon.some(c => {
      const cName = c.origName.toLowerCase();
      return tName.includes(cName) || tIngsNames.some(tin => tin.includes(cName) || cName.includes(tin));
    });

    if (sharesIngredient) {
      matchingTrials.push(trial);
    }
  });

  // 3. Compute baseline efficacy from historical trials or theoretical mode-of-action models
  let baselineEff = 75; // standard single active default
  let historicalGroundingCount = matchingTrials.length;

  if (matchingTrials.length > 0) {
    const validEfficacies = matchingTrials
      .map(t => parseFloat(t.MaxEfficacy || t.FinalEfficacy || t.Efficacy || (t._stats?.avgEfficacy)))
      .filter(n => !isNaN(n) && n > 0 && n <= 100);

    if (validEfficacies.length > 0) {
      const avgHist = validEfficacies.reduce((a, b) => a + b, 0) / validEfficacies.length;
      baselineEff = avgHist;
    }
  }

  // 4. Calculate Colby's Expected Efficacy for 2+ active ingredients
  // E_expected = X + Y - (X * Y / 100)
  let colbyExpected = null;
  let synergyBonus = 0;

  if (detectedMoas.length >= 2) {
    // Multiple active modes of action
    const singleEfficacies = detectedMoas.map((_, idx) => Math.min(80 - idx * 5, 82));
    let accumulatedColby = singleEfficacies[0];
    for (let i = 1; i < singleEfficacies.length; i++) {
      accumulatedColby = accumulatedColby + singleEfficacies[i] - (accumulatedColby * singleEfficacies[i] / 100);
    }
    colbyExpected = Math.round(accumulatedColby);

    if (synergy.synergies.length > 0) {
      synergyBonus = 5; // Validated complementary speed + systemic boost
    }
    if (synergy.hasAntagonism) {
      synergyBonus -= 12; // Penalty for chemical antagonism (e.g. ACCase + Auxin)
    }
  }

  let finalEff = colbyExpected ? Math.round(colbyExpected * 0.5 + baselineEff * 0.5) + synergyBonus : Math.round(baselineEff + synergyBonus);
  finalEff = Math.max(35, Math.min(98, finalEff));

  const predictedMin = Math.max(30, finalEff - 5);
  const predictedMax = Math.min(99, finalEff + 4);

  // 5. Build weed sensitivity spectrum based on active ingredient MOAs
  const susceptibleSet = new Set();
  const moderateSet = new Set();
  const tolerantSet = new Set();

  hracKeys.forEach(key => {
    const profile = WEED_SENSITIVITY_PROFILES[key];
    if (profile) {
      profile.susceptible.forEach(w => susceptibleSet.add(w));
      profile.moderate.forEach(w => moderateSet.add(w));
      profile.tolerant.forEach(w => tolerantSet.add(w));
    }
  });

  // If no exact HRAC profile matched, default to broad spectrum
  if (susceptibleSet.size === 0) {
    susceptibleSet.add('Broadleaf annual weeds (Amaranthus, Parthenium)');
    susceptibleSet.add('Annual grass weeds (Echinochloa, Digitaria)');
    moderateSet.add('Perennial Bermuda grass (Cynodon dactylon)');
    tolerantSet.add('Woody perennial brush, dormant tubers');
  }

  // Remove susceptible from tolerant if multi-active overcomes tolerance
  susceptibleSet.forEach(s => tolerantSet.delete(s));

  // Determine overall feasibility rating
  let overallRating = 'High Feasibility (Recommended)';
  let feasible = true;

  if (synergy.hasAntagonism) {
    overallRating = 'Conditional / Antagonism Detected';
  } else if (finalEff >= 88) {
    overallRating = 'Superior Efficacy Expected (88–98%)';
  } else if (finalEff >= 75) {
    overallRating = 'Standard Commercial Efficacy (75–87%)';
  } else {
    overallRating = 'Sub-lethal / High Risk (< 75%)';
    feasible = false;
  }

  const riskFactors = [];
  const recommendations = [];

  if (synergy.hasAntagonism) {
    riskFactors.push('Antagonism alert: ACCase graminicide paired with Synthetic Auxin reduces grass absorption by 15–30%.');
    recommendations.push('Stagger application by 48–72 hours or elevate graminicide rate by 20%.');
  }

  if (detectedMoas.length === 1) {
    riskFactors.push('Single Mode of Action: Prone to weed biotype resistance over repeated cycles.');
    recommendations.push('Consider combining with a complementary Mode of Action (e.g. PPO or Pre-emergent partner).');
  }

  if (synergy.adjuvantTips.length > 0) {
    recommendations.push(`Recommended Adjuvant: ${synergy.adjuvantTips.map(a => a.name).join(' or ')} for cuticular penetration.`);
  }

  return {
    feasible,
    overallRating,
    predictedEfficacyMin: predictedMin,
    predictedEfficacyMax: predictedMax,
    predictedEfficacyAvg: finalEff,
    confidence: historicalGroundingCount >= 5 ? 'High (Field Grounded)' : historicalGroundingCount >= 1 ? 'Moderate' : 'Estimated (Theoretical MoA)',
    primaryMoa: synergy.moaSummary,
    colbyExpected,
    synergies: synergy.synergies,
    antagonismAlerts: synergy.antagonismAlerts,
    susceptibleWeeds: Array.from(susceptibleSet),
    moderateWeeds: Array.from(moderateSet),
    tolerantWeeds: Array.from(tolerantSet),
    riskFactors,
    recommendations,
    groundingTrialsCount: historicalGroundingCount
  };
}
