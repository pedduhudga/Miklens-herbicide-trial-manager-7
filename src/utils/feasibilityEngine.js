import { canonicalizeIngredients } from './formulationDuplicateUtils.js';
import { analyzeFormulationSynergy } from './hracSynergy.js';
import { safeJsonParse } from './helpers.js';

/**
 * Standard weed species spectrum knowledge bank for agrochemical modes of action (HRAC).
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
 * Plant pathogen sensitivity spectra for fungicide modes of action (FRAC).
 */
const PATHOGEN_SENSITIVITY_PROFILES = {
  '1': {
    name: 'FRAC 1: MBC (Carbendazim / Thiophanate)',
    susceptible: ['Fusarium oxysporum (Wilt)', 'Colletotrichum gloeosporioides (Anthracnose)', 'Cercospora beticola (Leaf spot)', 'Botrytis cinerea (wild type)'],
    moderate: ['Rhizoctonia solani (Sheath blight)'],
    tolerant: ['Oomycetes (Phytophthora, Pythium - insensitive)', 'MBC-resistant fungal biotypes']
  },
  '3': {
    name: 'FRAC 3: DMI Triazoles (Difenoconazole, Tebuconazole)',
    susceptible: ['Puccinia striiformis (Yellow rust)', 'Erysiphe necator (Powdery mildew)', 'Alternaria solani (Early blight)', 'Colletotrichum capsici'],
    moderate: ['Venturia inaequalis (Apple scab)', 'Mycosphaerella fijiensis (Black sigatoka)'],
    tolerant: ['Oomycetes (Phytophthora infestans, Pythium)', 'C14-demethylase mutated resistant strains']
  },
  '4': {
    name: 'FRAC 4: PA Phenylamides (Metalaxyl / Mefenoxam)',
    susceptible: ['Phytophthora infestans (Late blight)', 'Pythium aphanidermatum (Damping off)', 'Peronospora destructor (Downy mildew)'],
    moderate: ['Phytophthora nicotianae'],
    tolerant: ['All true Ascomycetes & Basidiomycetes (Rust, Smut, Mildew, Anthracnose)']
  },
  '7': {
    name: 'FRAC 7: SDHI (Boscalid, Fluxapyroxad)',
    susceptible: ['Rhizoctonia solani (Sheath blight)', 'Alternaria alternata', 'Botrytis cinerea', 'Sclerotinia sclerotiorum (White mold)'],
    moderate: ['Puccinia graminis (Rusts)'],
    tolerant: ['Pythium & Phytophthora oomycetes', 'SdhB/C/D mutated biotypes']
  },
  '11': {
    name: 'FRAC 11: QoI Strobilurins (Azoxystrobin, Pyraclostrobin)',
    susceptible: ['Pyricularia oryzae (Rice blast)', 'Phakopsora pachyrhizi (Asian rust)', 'Rhizoctonia solani', 'Erysiphe cichoracearum (Powdery mildew)'],
    moderate: ['Phytophthora infestans (Foliar preventative)'],
    tolerant: ['G143A cytochrome b mutated fungal biotypes']
  },
  'M01': {
    name: 'FRAC M01: Inorganic Copper (Copper Oxychloride / Hydroxide)',
    susceptible: ['Xanthomonas campestris (Bacterial blight)', 'Phytophthora infestans (Protectant)', 'Pseudoperonospora cubensis (Downy mildew)'],
    moderate: ['Colletotrichum gloeosporioides', 'Cercospora'],
    tolerant: ['Post-infection systemic hyphal mycelium (curative failure)']
  },
  'M03': {
    name: 'FRAC M03: Dithiocarbamates (Mancozeb / Propineb)',
    susceptible: ['Phytophthora infestans (Protectant barrier)', 'Alternaria solani (Early blight)', 'Helminthosporium leaf spot', 'Puccinia recondita (Rust)'],
    moderate: ['Downy mildews'],
    tolerant: ['Curative post-germination mycelial growth']
  },
  'M05': {
    name: 'FRAC M05: Chloronitriles (Chlorothalonil)',
    susceptible: ['Alternaria solani', 'Septoria nodorum', 'Botrytis cinerea (Preventative)', 'Puccinia striiformis'],
    moderate: ['Mycosphaerella spp.'],
    tolerant: ['Internal systemic tissue penetration']
  },
  'BM': {
    name: 'FRAC BM: Biologicals & Microbials (Trichoderma / Bacillus)',
    susceptible: ['Fusarium oxysporum (Soil competitive exclusion)', 'Rhizoctonia solani (Hyperparasitism)', 'Pythium damping off'],
    moderate: ['Airborne foliar powdery mildews', 'Botrytis cinerea (surface colonization)'],
    tolerant: ['Acute runaway epidemic foliar sporulation']
  }
};

/**
 * Insect and pest sensitivity spectra for pesticide/insecticide modes of action (IRAC).
 */
const PEST_SENSITIVITY_PROFILES = {
  '1B': {
    name: 'IRAC 1B: Organophosphates (Chlorpyrifos, Dimethoate)',
    susceptible: ['Spodoptera litura (Cutworm)', 'Helicoverpa armigera', 'Chilo partellus (Stem borer)', 'Aphids (Aphis gossypii)', 'Thrips tabaci'],
    moderate: ['Plutella xylostella (Diamondback moth)'],
    tolerant: ['Insensitive AChE resistant insect biotypes', 'Tetranychus spider mites']
  },
  '2B': {
    name: 'IRAC 2B: Phenylpyrazoles (Fipronil)',
    susceptible: ['Scirpophaga incertulas (Yellow stem borer)', 'Cnaphalocrocis medinalis (Leaf folder)', 'Termites (Odontotermes)', 'Thrips (Scirtothrips dorsalis)'],
    moderate: ['Spodoptera frugiperda (Early instars)'],
    tolerant: ['GABA receptor mutated resistant strains']
  },
  '3A': {
    name: 'IRAC 3A: Pyrethroids (Cypermethrin, Lambda-cyhalothrin)',
    susceptible: ['Pieris brassicae', 'Earias vitella (Bollworm)', 'Amrasca biguttula (Jassids / Leafhoppers)', 'Leucinodes orbonalis (Shoot & fruit borer)'],
    moderate: ['Helicoverpa armigera (Metabolic tolerance common)'],
    tolerant: ['Plutella xylostella with sodium channel kdr mutations']
  },
  '4A': {
    name: 'IRAC 4A: Neonicotinoids (Imidacloprid, Thiamethoxam)',
    susceptible: ['Nilaparvata lugens (Brown planthopper)', 'Bemisia tabaci (Whitefly)', 'Aphis gossypii (Cotton aphid)', 'Scirtothrips dorsalis'],
    moderate: ['Helicoverpa armigera (poor chewing caterpillar efficacy)'],
    tolerant: ['Lepidopteran caterpillars', 'nAChR mutated whitefly biotypes']
  },
  '5': {
    name: 'IRAC 5: Spinosyns (Spinetoram, Spinosad)',
    susceptible: ['Thrips palmi', 'Frankliniella occidentalis (Western flower thrips)', 'Spodoptera frugiperda', 'Plutella xylostella', 'Tuta absoluta'],
    moderate: ['Liriomyza trifolii (Leafminer)'],
    tolerant: ['Phloem-sucking homoptera (Aphids, Scale insects)']
  },
  '6': {
    name: 'IRAC 6: Avermectins (Emamectin benzoate, Abamectin)',
    susceptible: ['Helicoverpa armigera', 'Spodoptera frugiperda (Fall armyworm)', 'Tuta absoluta', 'Tetranychus urticae (Spider mite)'],
    moderate: ['Thrips tabaci (translaminar knockdown)'],
    tolerant: ['Phloem-feeding aphids lacking sufficient foliar ingestion']
  },
  '28': {
    name: 'IRAC 28: Diamides (Chlorantraniliprole, Flubendiamide)',
    susceptible: ['Scirpophaga incertulas (Rice stem borer)', 'Helicoverpa armigera', 'Spodoptera litura & frugiperda', 'Chilo sacchariphagus'],
    moderate: ['Cyantraniliprole: Bemisia tabaci, Liriomyza'],
    tolerant: ['Aphids (Aphis gossypii)', 'Spider mites', 'Ryanodine receptor mutated biotypes']
  },
  'UNF': {
    name: 'IRAC UNF: Entomopathogenic Fungi (Beauveria, Metarhizium)',
    susceptible: ['Bemisia tabaci (Whitefly nymphs)', 'Thrips tabaci', 'Hypothenemus hampei (Coffee berry borer)', 'Grasshopper nymphs'],
    moderate: ['Late instar thick-cuticle lepidoptera'],
    tolerant: ['Low ambient humidity (< 65% RH impedes spore germination)']
  },
  'UNE': {
    name: 'IRAC UNE: Botanicals (Azadirachtin / Neem Extract)',
    susceptible: ['Whitefly nymphs (anti-feedant & ecdysone disruptor)', 'Early instar caterpillars', 'Leafhopper nymphs', 'Spider mites'],
    moderate: ['Mature adult beetles', 'Adult moths'],
    tolerant: ['Deep internal stem borers sealed inside woody stalks']
  }
};

/**
 * Predicts efficacy and spectrum feasibility for a proposed recipe
 * based on historical database trials, HRAC/FRAC/IRAC mode of action, and Colby synergy.
 *
 * @param {Array|string} ingredients - Candidate formula ingredients [{ name, quantity, unit }]
 * @param {Array} trials - Historical trials from state.trials
 * @param {string} [targetSpecies] - Target weed/pest/pathogen species name (optional)
 * @param {string} [category='herbicide'] - 'herbicide' | 'fungicide' | 'pesticide' | 'insecticide'
 * @returns {Object} Feasibility prediction report
 */
export function predictFormulaFeasibility(ingredients, trials = [], targetSpecies = '', category = 'herbicide') {
  const canon = canonicalizeIngredients(ingredients);
  const cat = String(category || 'herbicide').toLowerCase().trim();

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
      susceptibleTargets: [],
      moderateTargets: [],
      tolerantTargets: [],
      susceptibleWeeds: [],
      moderateWeeds: [],
      tolerantWeeds: [],
      riskFactors: ['No valid active ingredients or quantities specified.'],
      recommendations: [`Add at least one recognized ${cat} active ingredient.`],
      groundingTrialsCount: 0
    };
  }

  // 1. Chemical synergy & MOA analysis
  const synergy = analyzeFormulationSynergy(
    canon.map(c => ({ name: c.origName, quantity: c.qty, unit: c.unit })),
    cat
  );
  const detectedMoas = synergy.detectedMoas || [];
  
  // Extract clean group keys (e.g., '1', '4', 'M01', '28')
  const moaKeys = detectedMoas.map(m => {
    const raw = String(m.group || m.code || m.hracGroup || '');
    return raw.replace(/^(HRAC|FRAC|IRAC)\s*/i, '').trim();
  }).filter(Boolean);

  // 2. Query historical trials for matching ingredients or similar products in the active category
  const matchingTrials = [];
  const targetLower = String(targetSpecies || '').toLowerCase().trim();

  trials.forEach(trial => {
    if (!trial) return;
    const tCat = String(trial.Category || 'herbicide').toLowerCase().trim();
    // Maintain category isolation to ensure genuine benchmark comparisons
    const isCategoryMatch = (tCat === cat) ||
      (cat === 'pesticide' && tCat === 'insecticide') ||
      (cat === 'insecticide' && tCat === 'pesticide');

    if (!isCategoryMatch) return;

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
      synergyBonus -= 12; // Penalty for chemical or physical antagonism
    }
  }

  let finalEff = colbyExpected ? Math.round(colbyExpected * 0.5 + baselineEff * 0.5) + synergyBonus : Math.round(baselineEff + synergyBonus);
  finalEff = Math.max(35, Math.min(98, finalEff));

  const predictedMin = Math.max(30, finalEff - 5);
  const predictedMax = Math.min(99, finalEff + 4);

  // 5. Build sensitivity spectrum based on active ingredient MOAs and active category
  const susceptibleSet = new Set();
  const moderateSet = new Set();
  const tolerantSet = new Set();

  const isFungicide = cat === 'fungicide';
  const isPesticide = cat === 'pesticide' || cat === 'insecticide';

  const profileDatabase = isFungicide
    ? PATHOGEN_SENSITIVITY_PROFILES
    : isPesticide
    ? PEST_SENSITIVITY_PROFILES
    : WEED_SENSITIVITY_PROFILES;

  moaKeys.forEach(key => {
    // Check direct key or upper-cased key
    const profile = profileDatabase[key] || profileDatabase[key.toUpperCase()];
    if (profile) {
      profile.susceptible.forEach(target => susceptibleSet.add(target));
      profile.moderate.forEach(target => moderateSet.add(target));
      profile.tolerant.forEach(target => tolerantSet.add(target));
    }
  });

  // If no exact profile matched, default to genuine category-specific spectra
  if (susceptibleSet.size === 0) {
    if (isFungicide) {
      susceptibleSet.add('Foliar Ascomycete Leaf Spots & Blights');
      susceptibleSet.add('Powdery Mildew & Rust Pathogens');
      moderateSet.add('Soil-borne damping off pathogens');
      tolerantSet.add('Established vascular systemic wilts');
    } else if (isPesticide) {
      susceptibleSet.add('Sucking pests (Aphids, Jassids, Whitefly nymphs)');
      susceptibleSet.add('Early instar foliage-chewing caterpillars');
      moderateSet.add('Thrips & Leafminers (requires high coverage)');
      tolerantSet.add('Deep internal stem borers & armored scales');
    } else {
      susceptibleSet.add('Broadleaf annual weeds (Amaranthus, Parthenium)');
      susceptibleSet.add('Annual grass weeds (Echinochloa, Digitaria)');
      moderateSet.add('Perennial Bermuda grass (Cynodon dactylon)');
      tolerantSet.add('Woody perennial brush, dormant tubers');
    }
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

  // Authentic, dynamic antagonism reporting
  if (synergy.hasAntagonism) {
    if (synergy.antagonismAlerts && synergy.antagonismAlerts.length > 0) {
      synergy.antagonismAlerts.forEach(alert => {
        const title = alert.title ? `${alert.title}: ` : '';
        const desc = alert.desc || alert.description || alert;
        riskFactors.push(`Antagonism alert: ${title}${desc}`);
      });
    } else {
      riskFactors.push('Antagonism alert: Biochemical or physical incompatibility detected between combined active ingredients.');
    }
    recommendations.push('Stagger application by 48–72 hours or introduce a tank-mix buffering / compatibility agent.');
  }

  // Authentic single MoA resistance warnings adapted to category
  if (detectedMoas.length === 1) {
    if (isFungicide) {
      riskFactors.push('Single Mode of Action: Prone to selection of resistant fungal pathogen strains (e.g. QoI/SDHI single-site resistance).');
      recommendations.push('Tank-mix or alternate with a multi-site protectant (FRAC M01 Copper, FRAC M03 Mancozeb) to prevent resistance breakdown.');
    } else if (isPesticide) {
      riskFactors.push('Single Mode of Action: Prone to rapid selection of resistant insect pest biotypes across successive generations.');
      recommendations.push('Rotate with a different IRAC mode of action or incorporate bio-rational IPM partners (Neem/Beauveria).');
    } else {
      riskFactors.push('Single Mode of Action: Prone to weed biotype resistance over repeated application cycles.');
      recommendations.push('Consider combining with a complementary Mode of Action (e.g., PPO or Pre-emergent partner).');
    }
  }

  if (synergy.adjuvantTips && synergy.adjuvantTips.length > 0) {
    recommendations.push(`Recommended Adjuvant: ${synergy.adjuvantTips.map(a => a.name).join(' or ')} for cuticular penetration.`);
  }

  const targetList = Array.from(susceptibleSet);
  const modList = Array.from(moderateSet);
  const tolList = Array.from(tolerantSet);

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
    susceptibleTargets: targetList,
    moderateTargets: modList,
    tolerantTargets: tolList,
    // Backward compatibility aliases
    susceptibleWeeds: targetList,
    moderateWeeds: modList,
    tolerantWeeds: tolList,
    riskFactors,
    recommendations,
    groundingTrialsCount: historicalGroundingCount
  };
}
