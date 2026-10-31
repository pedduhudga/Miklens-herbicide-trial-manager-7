// src/utils/categoryConfig.js
// Central configuration for all trial categories.
// Single source of truth for category-specific behavior across the app.

export const CATEGORIES = {
  herbicide: {
    id: 'herbicide',
    name: 'Herbicide',
    description: 'Weed control efficacy trials — evaluate herbicide formulations against target weeds',
    icon: 'Leaf',
    color: {
      primary: 'emerald-600',
      secondary: 'emerald-700',
      light: 'emerald-50',
      badge: 'bg-emerald-100 text-emerald-700',
      gradient: 'from-emerald-600 to-emerald-700',
      ring: 'ring-emerald-400',
      accent: 'emerald',
      hex: '#059669',
      hexLight: '#d1fae5',
    },
    collections: {
      trials: 'herbicide_trials',
      projects: 'herbicide_projects',
      formulations: 'herbicide_formulations',
      ingredients: 'herbicide_ingredients',
      blocks: 'herbicide_blocks',
    },
    primaryMetric: { key: 'WCE', label: 'Weed Control Efficiency', unit: '%' },
    direction: 'reduction',
    targetLabel: 'Weed Species',
    targetField: 'WeedSpecies',
    resultRatings: ['Excellent', 'Good', 'Fair', 'Poor'],
    applicationTimings: [
      { value: 'PRE', label: 'Pre-emergence' },
      { value: 'EPOST', label: 'Early Post-emergence' },
      { value: 'POST', label: 'Post-emergence' },
      { value: 'LPOST', label: 'Late Post-emergence' },
      { value: 'SEQ', label: 'Sequential' },
    ],
    growthStages: [
      'Seedling', 'Vegetative', 'Tillering', 'Jointing', 'Booting', 'Heading', 'Flowering', 'Grain Fill', 'Maturity'
    ],
    // Category-specific form fields (beyond shared fields)
    specificFields: [
      { key: 'WeedSpecies', label: 'Target Weed Species', type: 'text', placeholder: 'e.g. Echinochloa crus-galli' },
      { key: 'WeedGrowthStage', label: 'Weed Growth Stage', type: 'select', options: ['Seedling', 'Vegetative', 'Tillering', 'Reproductive', 'Mature'] },
      { key: 'YieldValue', label: 'Crop Yield (kg/ha)', type: 'number', placeholder: '0' },
    ],
    // Observation schema for efficacy data
    observationFields: [
      { key: 'weedCover', label: 'Weed Cover (%)', type: 'number', min: 0, max: 100 },
      { key: 'weedDetails', label: 'Weed Species Details', type: 'weedArray' },
      // Req 5.1 — phytotoxicity and weather-at-observation fields
      { key: 'phytotoxicityPct', label: 'Phytotoxicity (%)', type: 'number', min: 0, max: 100 },
      { key: 'phytotoxicityNotes', label: 'Phytotoxicity Notes', type: 'text' },
      { key: 'weatherTempAtObs', label: 'Temperature at Obs (°C)', type: 'number' },
      { key: 'weatherHumidityAtObs', label: 'Humidity at Obs (%)', type: 'number', min: 0, max: 100 },
      { key: 'weatherWindAtObs', label: 'Wind Speed at Obs (km/h)', type: 'number', min: 0 },
    ],
    // Formulation-specific fields
    formulationFields: [
      { key: 'ModeOfAction', label: 'Mode of Action (HRAC Group)', type: 'text', placeholder: 'e.g. Group 1 - ACCase' },
      { key: 'TargetWeeds', label: 'Target Weeds', type: 'text', placeholder: 'Comma-separated weed species' },
    ],
    // AI analysis prompts
    aiPhotoPrompt: 'Analyze this photo of a herbicide trial plot. Identify weed species present, estimate total weed cover percentage, identify crop damage or phytotoxicity, and assess overall weed control efficacy. Be scientific and precise.',
    aiFeatures: ['Weed species identification', 'Weed cover estimation', 'Phytotoxicity assessment', 'Crop health analysis'],
    // Dashboard specific widgets
    dashboardWidgets: ['sprayAdvisor', 'weedFinder', 'resistanceTracker'],
    // Which shared features to show
    showSprayAdvisor: true,
    showResistanceTracker: true,
    efficacyCalc: 'wce', // (1 - treated/control) * 100
  },

  fungicide: {
    id: 'fungicide',
    name: 'Fungicide',
    description: 'Disease control efficacy trials — evaluate fungicide products against crop diseases',
    icon: 'Shield',
    color: {
      primary: 'indigo-600',
      secondary: 'indigo-700',
      light: 'indigo-50',
      badge: 'bg-indigo-100 text-indigo-700',
      gradient: 'from-indigo-600 to-purple-700',
      ring: 'ring-indigo-400',
      accent: 'indigo',
      hex: '#4f46e5',
      hexLight: '#e0e7ff',
    },
    collections: {
      trials: 'fungicide_trials',
      projects: 'fungicide_projects',
      formulations: 'fungicide_formulations',
      ingredients: 'fungicide_ingredients',
      blocks: 'fungicide_blocks',
    },
    primaryMetric: { key: 'DCE', label: 'Disease Control Efficiency', unit: '%' },
    direction: 'reduction',
    targetLabel: 'Target Disease',
    targetField: 'DiseaseTarget',
    resultRatings: ['Excellent', 'Good', 'Fair', 'Poor'],
    applicationTimings: [
      { value: 'PREVENTIVE', label: 'Preventive (Before infection)' },
      { value: 'CURATIVE', label: 'Curative (After infection)' },
      { value: 'ERADICANT', label: 'Eradicant (Established disease)' },
      { value: 'SEED', label: 'Seed Treatment' },
      { value: 'SEQ', label: 'Sequential Application' },
    ],
    growthStages: [
      'Germination', 'Seedling', 'Vegetative', 'Tillering', 'Booting', 'Heading', 'Flowering', 'Grain Fill', 'Maturity'
    ],
    specificFields: [
      { key: 'DiseaseTarget', label: 'Target Disease', type: 'text', placeholder: 'e.g. Rice Blast, Powdery Mildew' },
      { key: 'PathogenName', label: 'Pathogen Species', type: 'text', placeholder: 'e.g. Magnaporthe oryzae' },
      { key: 'DiseaseSeverityScale', label: 'Severity Scale', type: 'select', options: ['0-9 Scale', '0-100%', 'Modified Cobb Scale', 'Horsfall-Barratt', 'EPPO standard', 'AUDPC'] },
      { key: 'InoculationMethod', label: 'Inoculation Method', type: 'select', options: ['Natural Infection', 'Artificial Inoculation', 'Spore Suspension Spray', 'Spore Injection'] },
      { key: 'InoculationDate', label: 'Inoculation Date', type: 'date' },
      { key: 'FungicideResistanceRisk', label: 'Fungicide Resistance Risk', type: 'select', options: ['Low Risk', 'Medium Risk', 'High Risk', 'Known Resistant Strain'] },
      { key: 'FRACGroup', label: 'FRAC Group', type: 'text', placeholder: 'e.g. Group 11 - QoI (Strobilurin)' },
      { key: 'CropStageAtApplication', label: 'Crop Stage (BBCH)', type: 'text', placeholder: 'e.g. BBCH 30-39' },
      { key: 'YieldValue', label: 'Crop Yield (kg/ha)', type: 'number', placeholder: '0' },
    ],
    observationFields: [
      { key: 'diseaseSeverity', label: 'Disease Severity (%)', type: 'number', min: 0, max: 100 },
      { key: 'diseaseIncidence', label: 'Disease Incidence (%)', type: 'number', min: 0, max: 100 },
      { key: 'greenLeafArea', label: 'Green Leaf Area (%)', type: 'number', min: 0, max: 100 },
      { key: 'plantHealthScore', label: 'Plant Health Score (1-10)', type: 'number', min: 1, max: 10 },
      { key: 'phytotoxicity', label: 'Crop Phytotoxicity (%)', type: 'number', min: 0, max: 100 },
      { key: 'lesionCountAvg', label: 'Avg Lesions per Leaf', type: 'number', min: 0 },
      { key: 'chloroticHaloIncidence', label: 'Chlorotic Halo Incidence (%)', type: 'number', min: 0, max: 100 },
      { key: 'defoliationPct', label: 'Defoliation (%)', type: 'number', min: 0, max: 100 },
      // Req 5.2 — AUDPC field
      { key: 'AUDPC', label: 'AUDPC (Area Under Disease Progress Curve)', type: 'number', min: 0 },
      { key: 'sporulationScore', label: 'Sporulation / Pustule Score (0-10)', type: 'number', min: 0, max: 10 },
    ],
    formulationFields: [
      { key: 'ModeOfAction', label: 'Mode of Action (FRAC Group)', type: 'text', placeholder: 'e.g. Group 3 - DMI (Triazole)' },
      { key: 'TargetDiseases', label: 'Target Diseases', type: 'text', placeholder: 'Comma-separated disease names' },
    ],
    aiPhotoPrompt: 'Act as a senior clinical plant pathologist with open-domain vision capability. Analyze this fungicide trial plot or pot photo to identify and quantify fungal, bacterial, or viral plant diseases. Distinguish active disease lesions (spots, blights, rust pustules, powdery/downy mildews, anthracnose, sclerotinia) from mechanical damage, sunscald, spray burns, or natural senescence. If the crop foliage is clean and disease-free, report diseaseSeverity: 0, diseaseIncidence: 0, and status "Healthy" — DO NOT invent pathogens. For detected diseases, format names dynamically as "Common Name (Scientific Name)" with visual diagnostic justification.',
    aiFeatures: ['Pathogen identification & taxonomy', 'Disease severity % estimation', 'Disease incidence % calculation', 'Active green leaf area preservation', 'Lesion count per leaf', 'Chlorotic halo detection', 'Sporulation pustule quantification', 'Defoliation percentage', 'Phytotoxicity differentiation'],
    dashboardWidgets: ['sprayAdvisor', 'diseaseFinder'],
    showSprayAdvisor: true,
    showResistanceTracker: false,
    efficacyCalc: 'dce', // (1 - treated_severity/control_severity) * 100
  },

  pesticide: {
    id: 'pesticide',
    name: 'Pesticide',
    description: 'Pest control efficacy trials — evaluate insecticide/pesticide products against crop pests',
    icon: 'Bug',
    color: {
      primary: 'red-600',
      secondary: 'red-700',
      light: 'red-50',
      badge: 'bg-red-100 text-red-700',
      gradient: 'from-red-600 to-orange-700',
      ring: 'ring-red-400',
      accent: 'red',
      hex: '#dc2626',
      hexLight: '#fee2e2',
    },
    collections: {
      trials: 'pesticide_trials',
      projects: 'pesticide_projects',
      formulations: 'pesticide_formulations',
      ingredients: 'pesticide_ingredients',
      blocks: 'pesticide_blocks',
    },
    primaryMetric: { key: 'PRE', label: 'Pest Reduction Efficiency', unit: '%' },
    direction: 'reduction',
    targetLabel: 'Target Pest',
    targetField: 'PestTarget',
    resultRatings: ['Excellent', 'Good', 'Fair', 'Poor'],
    applicationTimings: [
      { value: 'FOLIAR', label: 'Foliar Spray' },
      { value: 'SOIL', label: 'Soil Drench' },
      { value: 'SEED', label: 'Seed Treatment' },
      { value: 'GRANULAR', label: 'Granular Application' },
      { value: 'TRUNK', label: 'Trunk Injection' },
      { value: 'BAIT', label: 'Bait Station' },
    ],
    growthStages: [
      'Germination', 'Seedling', 'Vegetative', 'Tillering', 'Reproductive', 'Flowering', 'Fruiting', 'Maturity'
    ],
    specificFields: [
      { key: 'PestTarget', label: 'Target Pest', type: 'text', placeholder: 'e.g. Brown Planthopper, Fall Armyworm' },
      { key: 'PestSpecies', label: 'Pest Species (Scientific)', type: 'text', placeholder: 'e.g. Nilaparvata lugens' },
      { key: 'PestDensityBefore', label: 'Pest Density Before (per m²)', type: 'number', placeholder: '0' },
      { key: 'PestLifeStage', label: 'Target Life Stage', type: 'select', options: ['Egg', 'Larva / Nymph', 'Pupa', 'Adult', 'Mixed Population'] },
      { key: 'IRACGroup', label: 'IRAC Group', type: 'text', placeholder: 'e.g. Group 4A - Neonicotinoid' },
      { key: 'PHI', label: 'Pre-Harvest Interval (days)', type: 'number', placeholder: '14' },
      { key: 'ApplicationMethod', label: 'Application Method', type: 'select', options: ['Foliar Spray', 'Soil Drench', 'Seed Treatment', 'Granular', 'Trunk Injection', 'Bait'] },
      { key: 'YieldValue', label: 'Crop Yield (kg/ha)', type: 'number', placeholder: '0' },
    ],
    observationFields: [
      { key: 'pestCount', label: 'Pest Count (per unit/plant)', type: 'number', min: 0 },
      { key: 'liveInsectCount', label: 'Live Insect Count (per unit)', type: 'number', min: 0 },
      { key: 'deadInsectCount', label: 'Dead Insect Count (per unit)', type: 'number', min: 0 },
      { key: 'eggCount', label: 'Egg Count (per plant/leaf)', type: 'number', min: 0 },
      { key: 'larvaCount', label: 'Larva / Nymph Count (per plant)', type: 'number', min: 0 },
      { key: 'adultCount', label: 'Adult Count (per plant)', type: 'number', min: 0 },
      { key: 'damageRating', label: 'Crop Damage Rating (0-9)', type: 'number', min: 0, max: 9 },
      { key: 'feedingDamagePct', label: 'Feeding Damage (%)', type: 'number', min: 0, max: 100 },
      { key: 'beneficialCount', label: 'Beneficial Insect Count', type: 'number', min: 0 },
      { key: 'phytotoxicity', label: 'Crop Phytotoxicity (%)', type: 'number', min: 0, max: 100 },
      { key: 'sootyMoldSeverity', label: 'Sooty Mold Severity (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'frassIncidence', label: 'Frass Presence Score (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'leafCurlingSeverity', label: 'Leaf Curling Severity (0-10)', type: 'number', min: 0, max: 10 },
    ],
    formulationFields: [
      { key: 'ModeOfAction', label: 'Mode of Action (IRAC Group)', type: 'text', placeholder: 'e.g. Group 1A - Carbamate' },
      { key: 'TargetPests', label: 'Target Pests', type: 'text', placeholder: 'Comma-separated pest names' },
    ],
    aiPhotoPrompt: 'Act as a senior agricultural entomologist with open-domain vision capability. Analyze this pesticide trial photo to accurately detect, classify, and count crop pests, insect life stages (eggs, nymphs, larvae, pupae, adults), and feeding damage symptoms (foliar chewing holes, windowpaning, leaf skeletonization, leaf curling, silver stippling, honeydew, sooty mold, frass deposits). Distinguish target pests from beneficial predatory insects (ladybird beetles, lacewings, parasitoids). If no insects or feeding injuries exist, report pestCount: 0, feedingDamagePct: 0, and status "Healthy" — DO NOT hallucinate pest presence. Format detected targets as "Common Name (Scientific Name)" with visual justification.',
    aiFeatures: ['Open-domain pest taxonomy & identification', 'Direct pest & colony enumeration', 'Live vs dead mortality counting', 'Life stage classification (egg, larva, adult)', 'Feeding damage % & foliage loss', 'Beneficial predator detection', 'Secondary symptom tracking (frass, sooty mold, curl)', 'Phytotoxicity differentiation'],
    dashboardWidgets: ['sprayAdvisor', 'pestFinder'],
    showSprayAdvisor: true,
    showResistanceTracker: false,
    efficacyCalc: 'pre', // (1 - after_count/before_count) * 100
  },

  nutrition: {
    id: 'nutrition',
    name: 'Nutrition',
    description: 'Plant nutrition trials — evaluate fertilizers, micronutrients, and nutrient management strategies',
    icon: 'Beaker',
    color: {
      primary: 'amber-600',
      secondary: 'amber-700',
      light: 'amber-50',
      badge: 'bg-amber-100 text-amber-700',
      gradient: 'from-amber-600 to-yellow-700',
      ring: 'ring-amber-400',
      accent: 'amber',
      hex: '#d97706',
      hexLight: '#fef3c7',
    },
    collections: {
      trials: 'nutrition_trials',
      projects: 'nutrition_projects',
      formulations: 'nutrition_formulations',
      ingredients: 'nutrition_ingredients',
      blocks: 'nutrition_blocks',
    },
    primaryMetric: { key: 'YieldImprovement', label: 'Yield Improvement', unit: '%' },
    direction: 'increase',
    targetLabel: 'Nutrient Target',
    targetField: 'NutrientType',
    resultRatings: ['Excellent', 'Good', 'Fair', 'Poor'],
    applicationTimings: [
      { value: 'BASAL', label: 'Basal Application' },
      { value: 'TOPDRESS', label: 'Top Dressing' },
      { value: 'FOLIAR', label: 'Foliar Spray' },
      { value: 'FERTIGATION', label: 'Fertigation' },
      { value: 'SEED', label: 'Seed Coating' },
      { value: 'SPLIT', label: 'Split Application' },
    ],
    growthStages: [
      'Pre-planting', 'Germination', 'Seedling', 'Vegetative', 'Tillering', 'Jointing', 'Booting', 'Heading', 'Flowering', 'Grain Fill', 'Maturity'
    ],
    specificFields: [
      { key: 'NutrientType', label: 'Nutrient Type', type: 'select', options: ['Nitrogen (N)', 'Phosphorus (P)', 'Potassium (K)', 'Zinc (Zn)', 'Iron (Fe)', 'Boron (B)', 'Manganese (Mn)', 'Calcium (Ca)', 'Magnesium (Mg)', 'NPK Blend', 'Micronutrient Mix', 'Organic', 'Custom'] },
      { key: 'NutrientSource', label: 'Nutrient Source', type: 'text', placeholder: 'e.g. Urea, DAP, MOP, ZnSO4' },
      { key: 'FertilizerForm', label: 'Fertilizer Form', type: 'select', options: ['Granular', 'Liquid', 'Prilled / Pelleted', 'Chelated Powders', 'Controlled-release (CRF)', 'Organic Compost'] },
      { key: 'SoilApplicationRate', label: 'Soil Application Rate (kg/ha)', type: 'number', placeholder: '0' },
      { key: 'ApplicationMethod', label: 'Application Method', type: 'select', options: ['Basal', 'Top Dressing', 'Foliar Spray', 'Fertigation', 'Seed Coating', 'Band Placement'] },
      { key: 'ChlorophyllIndex', label: 'SPAD/Chlorophyll Reading', type: 'number', placeholder: '0' },
      { key: 'PlantHeight', label: 'Plant Height (cm)', type: 'number', placeholder: '0' },
      { key: 'TillerCount', label: 'Tiller Count (per hill)', type: 'number', placeholder: '0' },
      { key: 'YieldValue', label: 'Crop Yield (kg/ha)', type: 'number', placeholder: '0' }
    ],
    observationFields: [
      { key: 'visualVigor', label: 'Visual Vigor Rating (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'deficiencySign', label: 'Visual Deficiency Sign', type: 'select', options: ['None', 'N', 'P', 'K', 'Mg', 'Ca', 'S', 'Zn', 'Mn', 'Fe', 'B', 'Cu'] },
      { key: 'deficiencySeverity', label: 'Deficiency Severity (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'leafColorScore', label: 'Leaf Color Score (1-5 LCC)', type: 'number', min: 1, max: 5 },
      { key: 'interveinalChlorosis', label: 'Interveinal Chlorosis (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'leafMarginNecrosis', label: 'Leaf Margin Necrosis (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'chlorophyllIndex', label: 'SPAD/Chlorophyll Reading', type: 'number', min: 0 },
      { key: 'plantHeight', label: 'Plant Height (cm)', type: 'number', min: 0 },
      { key: 'tillerCount', label: 'Tiller Count (per hill)', type: 'number', min: 0 },
      { key: 'canopyCoveragePct', label: 'Canopy Coverage (%)', type: 'number', min: 0, max: 100 },
      { key: 'chlorosisIncidencePct', label: 'Chlorosis Incidence (%)', type: 'number', min: 0, max: 100 },
    ],
    formulationFields: [
      { key: 'NutrientComposition', label: 'Nutrient Composition (N-P-K)', type: 'text', placeholder: 'e.g. 46-0-0 (Urea)' },
      { key: 'SourceType', label: 'Source Type', type: 'select', options: ['Synthetic', 'Organic', 'Bio-fertilizer', 'Slow Release', 'Liquid'] },
    ],
    aiPhotoPrompt: 'Act as a senior crop nutritionist and soil-plant diagnostician. Analyze this nutrition trial photo to evaluate foliar nutrition status, chlorosis patterns, and visual vigor. Apply physiological diagnostic keys: Mobile nutrients (N: uniform V-shaped chlorosis on older leaves; P: purple anthocyanin on margins/stems; K: leaf edge scorch/marginal firing; Mg: interveinal chlorosis on mature leaves); Immobile nutrients (Fe: sharp interveinal chlorosis on youngest leaves; Ca: hooked young leaf tips, blossom end rot; Zn: interveinal mottling, little leaf rosetting; B: brittle curled terminal shoots; S: uniform pale chlorosis on upper leaves). If the crop is healthy with rich green foliage, report deficiencySign: "None", deficiencySeverity: 0, and status "Sufficient" — DO NOT fabricate mineral deficiencies. Estimate leafColorScore on standard 1-5 IRRI Leaf Color Chart (LCC) and visualVigor (0-10).',
    aiFeatures: ['Nutrient deficiency diagnostic keys (N, P, K, Mg, Ca, Fe, Zn, B, S)', 'Leaf Color Chart (1-5 LCC) standardization', 'Interveinal chlorosis vs margin necrosis distinction', 'Canopy coverage & shoot density %', 'Foliar chlorosis incidence %', 'Visual vigor rating (0-10 scale)', 'Growth-stage appropriate fruit enumeration', 'Zero-hallucination healthy crop verification'],
    dashboardWidgets: ['yieldTracker', 'nutrientFinder'],
    showSprayAdvisor: false,
    showResistanceTracker: false,
    efficacyCalc: 'yieldImprovement', // (treated_yield/control_yield - 1) * 100
  },

  biostimulant: {
    id: 'biostimulant',
    name: 'Biostimulant',
    description: 'Biostimulant efficacy trials — evaluate growth enhancers, seaweed extracts, and biological products',
    icon: 'Sprout',
    color: {
      primary: 'teal-600',
      secondary: 'teal-700',
      light: 'teal-50',
      badge: 'bg-teal-100 text-teal-700',
      gradient: 'from-teal-600 to-cyan-700',
      ring: 'ring-teal-400',
      accent: 'teal',
      hex: '#0d9488',
      hexLight: '#ccfbf1',
    },
    collections: {
      trials: 'biostimulant_trials',
      projects: 'biostimulant_projects',
      formulations: 'biostimulant_formulations',
      ingredients: 'biostimulant_ingredients',
      blocks: 'biostimulant_blocks',
    },
    primaryMetric: { key: 'GrowthIndex', label: 'Growth Enhancement Index', unit: '' },
    direction: 'increase',
    targetLabel: 'Biostimulant Type',
    targetField: 'BiostimulantType',
    resultRatings: ['Excellent', 'Good', 'Fair', 'Poor'],
    applicationTimings: [
      { value: 'FOLIAR', label: 'Foliar Spray' },
      { value: 'SEED', label: 'Seed Coating / Priming' },
      { value: 'SOIL', label: 'Soil Drench' },
      { value: 'ROOT', label: 'Root Dip' },
      { value: 'FERTIGATION', label: 'Fertigation' },
    ],
    growthStages: [
      'Pre-planting', 'Germination', 'Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Maturity'
    ],
    specificFields: [
      { key: 'BiostimulantType', label: 'Biostimulant Type', type: 'select', options: ['Seaweed Extract', 'Humic Acid', 'Fulvic Acid', 'Amino Acid', 'Microbial Inoculant', 'Mycorrhizal', 'Plant Extract', 'Protein Hydrolysate', 'Chitosan', 'Custom'] },
      { key: 'ActiveBiologicals', label: 'Active Biological Agents', type: 'text', placeholder: 'e.g. Trichoderma, Bacillus subtilis' },
      { key: 'StressType', label: 'Abiotic Stress Condition', type: 'select', options: ['None / Normal Growth', 'Drought Stress', 'Salinity Stress', 'Cold Stress', 'Heat Stress', 'Nutrient Deficiency Stress'] },
      { key: 'ApplicationMethod', label: 'Application Method', type: 'select', options: ['Foliar Spray', 'Seed Coating', 'Soil Drench', 'Root Dip', 'Fertigation'] },
      { key: 'RootBiomass', label: 'Root Biomass (g)', type: 'number', placeholder: '0' },
      { key: 'ShootBiomass', label: 'Shoot Biomass (g)', type: 'number', placeholder: '0' },
      { key: 'PlantHeight', label: 'Plant Height (cm)', type: 'number', placeholder: '0' },
      { key: 'ChlorophyllIndex', label: 'SPAD/Chlorophyll Reading', type: 'number', placeholder: '0' },
      { key: 'YieldValue', label: 'Crop Yield (kg/ha)', type: 'number', placeholder: '0' },
    ],
    observationFields: [
      { key: 'overallVigor', label: 'Overall Vigor Score (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'shootVigor', label: 'Shoot Vigor Rating (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'abioticStressRecovery', label: 'Abiotic Stress Recovery (1-10)', type: 'number', min: 1, max: 10 },
      { key: 'leafAreaIndexEstimated', label: 'Leaf Area Index (0-10 scale)', type: 'number', min: 0, max: 10 },
      { key: 'shootDensityScore', label: 'Shoot Density Score (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'wiltingIndex', label: 'Wilting Index (0-10)', type: 'number', min: 0, max: 10 },
      { key: 'plantHeight', label: 'Plant Height (cm)', type: 'number', min: 0 },
      { key: 'chlorophyllIndex', label: 'SPAD/Chlorophyll Reading', type: 'number', min: 0 },
      { key: 'rootBiomass', label: 'Root Biomass (g)', type: 'number', min: 0 },
      { key: 'shootBiomass', label: 'Shoot Biomass (g)', type: 'number', min: 0 },
      { key: 'rootLength', label: 'Root Length (cm)', type: 'number', min: 0 },
      { key: 'leafCount', label: 'Leaf Count (per plant)', type: 'number', min: 0 },
      { key: 'noduleCount', label: 'Nodule Count (per root system)', type: 'number', min: 0 },
      { key: 'canopyGreennessPct', label: 'Canopy Greenness (%)', type: 'number', min: 0, max: 100 },
      { key: 'foliarUniformityScore', label: 'Foliar Uniformity (0-10)', type: 'number', min: 0, max: 10 },
    ],
    formulationFields: [
      { key: 'ActiveIngredients', label: 'Active Biological Agents', type: 'text', placeholder: 'e.g. Ascophyllum nodosum extract' },
      { key: 'MechanismOfAction', label: 'Mechanism of Action', type: 'text', placeholder: 'e.g. Auxin-like activity, Root growth promotion' },
    ],
    aiPhotoPrompt: 'Act as a senior plant physiologist and crop vigor specialist. Analyze this biostimulant trial photo to evaluate plant growth promotion, canopy vigor, and abiotic stress recovery (drought, heat, salinity, transplant shock). Assess lateral branching, tiller density, leaf turgidity vs wilting, and foliar uniformity. Distinguish genuine physiological enhancement from normal baseline growth. If examining roots, analyze root branching density, taproot elongation, and nodulation. Report strictly visible, verifiable metrics: overallVigor (0-10), shootVigor (0-10), abioticStressRecovery (1-10), leafAreaIndexEstimated (0-10 scale), wiltingIndex (0-10), canopyGreennessPct (0-100%). DO NOT fabricate ungrounded growth claims.',
    aiFeatures: ['Canopy expansion & leaf area index (LAI)', 'Shoot density & tiller proliferation', 'Abiotic stress resilience & recovery (1-10)', 'Wilting index & foliar turgor dynamics', 'Root architecture & nodulation scoring', 'Canopy greenness & foliar luster %', 'Comparative vigor index calculation', 'Zero-hallucination factual growth auditing'],
    dashboardWidgets: ['yieldTracker', 'growthTracker'],
    showSprayAdvisor: false,
    showResistanceTracker: false,
    efficacyCalc: 'growthIndex', // composite of height + biomass + chlorophyll
  },
};

// Helper: get category config by id
export function getCategoryConfig(categoryId) {
  const config = CATEGORIES[categoryId] || CATEGORIES.herbicide;
  if (typeof window !== 'undefined' && window.activeReportFields && window.activeReportFields[categoryId]) {
    const activeKeys = window.activeReportFields[categoryId];
    return {
      ...config,
      observationFields: config.observationFields.filter(f => activeKeys[f.key] !== false)
    };
  }
  return config;
}

// Helper: get all category ids
export function getCategoryIds() {
  return Object.keys(CATEGORIES);
}

// Helper: get all category options for dropdowns
export function getCategoryOptions() {
  return Object.values(CATEGORIES).map(c => ({
    value: c.id,
    label: c.name,
    description: c.description,
    icon: c.icon,
    color: c.color,
  }));
}

// Helper: get Firebase collection name for a category
export function getCollectionName(categoryId, collectionType) {
  const cat = CATEGORIES[categoryId];
  if (!cat) return collectionType; // fallback
  return cat.collections[collectionType] || collectionType;
}

// Helper: calculate efficacy based on category
export function calculateEfficacy(categoryId, treatedValue, controlValue) {
  const cat = CATEGORIES[categoryId];
  if (!cat || !controlValue || controlValue === 0) return 0;

  switch (cat.efficacyCalc) {
    case 'wce':     // Herbicide: (1 - treated_cover/control_cover) * 100
    case 'dce':     // Fungicide: (1 - treated_severity/control_severity) * 100
    case 'pre':     // Pesticide: (1 - after_count/before_count) * 100
      return Math.max(0, (1 - treatedValue / controlValue) * 100);

    case 'yieldImprovement': // Nutrition: (treated/control - 1) * 100
      return Math.max(0, (treatedValue / controlValue - 1) * 100);

    case 'growthIndex': // Biostimulant: composite score
      return Math.max(0, (treatedValue / controlValue - 1) * 100);

    default:
      return Math.max(0, (1 - treatedValue / controlValue) * 100);
  }
}

/**
 * Henderson-Tilton insecticidal efficacy formula:
 * Corrects for natural pest population changes in untreated control plots.
 * Efficacy (%) = (1 - (Ta / Tb) * (Cb / Ca)) * 100
 */
export function calculateHendersonTilton(treatedAfter, treatedBefore, controlAfter, controlBefore) {
  const ta = Number(treatedAfter);
  const tb = Number(treatedBefore);
  const ca = Number(controlAfter);
  const cb = Number(controlBefore);
  if (isNaN(ta) || isNaN(tb) || isNaN(ca) || isNaN(cb) || tb <= 0 || ca <= 0 || cb <= 0) {
    if (ca > 0 && !isNaN(ta)) {
      return Math.max(0, Math.min(100, (1 - ta / ca) * 100));
    }
    return 0;
  }
  const ratio = (ta / tb) * (cb / ca);
  return Math.max(0, Math.min(100, (1 - ratio) * 100));
}

/**
 * Area Under Disease Progress Curve (AUDPC)
 * Shaner and Finney (1977) trapezoidal integration:
 * AUDPC = sum(((y_i + y_{i+1}) / 2) * (t_{i+1} - t_i))
 */
export function calculateAUDPC(observations = [], severityKey = 'diseaseSeverity') {
  if (!Array.isArray(observations) || observations.length < 2) return 0;
  const sorted = [...observations].sort((a, b) => Number(a.daa || 0) - Number(b.daa || 0));
  let audpc = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const t1 = Number(sorted[i].daa || 0);
    const t2 = Number(sorted[i + 1].daa || 0);
    const y1 = Number(sorted[i][severityKey] ?? sorted[i].diseaseSeverity ?? sorted[i].diseaseSeverityPct ?? sorted[i].severity ?? 0);
    const y2 = Number(sorted[i + 1][severityKey] ?? sorted[i + 1].diseaseSeverity ?? sorted[i + 1].diseaseSeverityPct ?? sorted[i + 1].severity ?? 0);
    if (t2 > t1) {
      audpc += ((y1 + y2) / 2) * (t2 - t1);
    }
  }
  return parseFloat(audpc.toFixed(2));
}

// Helper: determine descriptive rating based on calculated efficacy percentage
export function getRatingFromEfficacy(categoryId, efficacyVal) {
  if (efficacyVal === null || efficacyVal === undefined || isNaN(efficacyVal)) return 'Unrated';
  const val = Number(efficacyVal);
  if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
    if (val >= 20) return 'Excellent';
    if (val >= 10) return 'Good';
    if (val >= 5)  return 'Fair';
    return 'Poor';
  } else {
    // International Agricultural Research (EPPO / EWRS 4-tier mapping)
    if (val >= 85) return 'Excellent';
    if (val >= 70) return 'Good';
    if (val >= 50) return 'Fair';
    return 'Poor';
  }
}

/**
 * Standard European Weed Research Society (EWRS) 1–9 Efficacy & Phytotoxicity Scale
 * Reference: EPPO Standard PP 1/152 & EWRS Evaluation Scale
 */
export function getEWRSScale(efficacyVal) {
  if (efficacyVal === null || efficacyVal === undefined || isNaN(efficacyVal)) {
    return { score: null, grade: 'Unrated', description: 'No efficacy data' };
  }
  const eff = Math.max(0, Math.min(100, Number(efficacyVal)));
  if (eff >= 99.9) return { score: 1, grade: 'Complete Kill', description: 'EWRS 1: 100% control, no weeds surviving' };
  if (eff >= 96.5) return { score: 2, grade: 'Very Good Control', description: 'EWRS 2: 96.5–99% control, negligible survival' };
  if (eff >= 90.0) return { score: 3, grade: 'Good Commercial Control', description: 'EWRS 3: 90–96.4% control, commercially acceptable' };
  if (eff >= 80.0) return { score: 4, grade: 'Moderate Control', description: 'EWRS 4: 80–89.9% control, acceptable suppression' };
  if (eff >= 70.0) return { score: 5, grade: 'Marginal Control', description: 'EWRS 5: 70–79.9% control, minimum commercial efficacy' };
  if (eff >= 55.0) return { score: 6, grade: 'Substandard Control', description: 'EWRS 6: 55–69.9% control, heavy competition remaining' };
  if (eff >= 40.0) return { score: 7, grade: 'Poor Control', description: 'EWRS 7: 40–54.9% control, partial suppression only' };
  if (eff >= 20.0) return { score: 8, grade: 'Very Poor Control', description: 'EWRS 8: 20–39.9% control, ineffective treatment' };
  return { score: 9, grade: 'Complete Failure', description: 'EWRS 9: 0–19.9% control, no significant weed reduction' };
}


// Helper: get the primary observation field key for a category
export function getPrimaryObservationField(categoryId) {
  const fieldMap = {
    herbicide: 'weedCover',
    fungicide: 'diseaseSeverity',
    pesticide: 'pestCount',
    nutrition: 'visualVigor',
    biostimulant: 'overallVigor',
  };
  return fieldMap[categoryId] || 'weedCover';
}

export function getObservationPrimaryValue(categoryId, observation) {
  if (!observation || typeof observation !== 'object') return null;
  const primaryField = getPrimaryObservationField(categoryId);
  if (observation[primaryField] !== undefined && observation[primaryField] !== null && observation[primaryField] !== '') {
    return observation[primaryField];
  }
  if (categoryId === 'herbicide' && observation.weedCover !== undefined && observation.weedCover !== null && observation.weedCover !== '') {
    return observation.weedCover;
  }
  return null;
}

// Default access control structure for a user
export const DEFAULT_CATEGORY_ACCESS = {
  herbicide: { read: true, write: true },
  fungicide: { read: true, write: true },
  pesticide: { read: true, write: true },
  nutrition: { read: true, write: true },
  biostimulant: { read: true, write: true },
};

// Admin has full access to everything
export const ADMIN_CATEGORY_ACCESS = {
  herbicide: { read: true, write: true },
  fungicide: { read: true, write: true },
  pesticide: { read: true, write: true },
  nutrition: { read: true, write: true },
  biostimulant: { read: true, write: true },
};

// Helper: check if user has access to a category
export function hasAccess(user, categoryId, action = 'read') {
  if (!user) return false;
  const role = String(user.Role || user.role || 'user').toLowerCase();
  if (role === 'admin') {
    return true;
  }
  
  if (role === 'viewer' && action === 'write') {
    return false;
  }
  
  // Both Scientist/User and Viewer check categoryAccess
  const accessMap = user.categoryAccess || user.CategoryAccess;
  if (!accessMap) return true; // Default fallback if no permissions configured
  
  const categoryPerm = accessMap[categoryId];
  if (!categoryPerm) return false; // Default closed if category not listed
  
  return action === 'write' ? !!categoryPerm.write : !!categoryPerm.read;
}
