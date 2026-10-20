// src/utils/agrochemicalMoaDatabase.js
// Authoritative Global Mode of Action (MoA) Classification Database.
// Verified according to:
// 1. HRAC (Herbicide Resistance Action Committee) 2024 Global System (0–34) & WSSA
// 2. FRAC (Fungicide Resistance Action Committee) 2024 Code List (1–50, M01–M12, P, BM)
// 3. IRAC (Insecticide Resistance Action Committee) 2024 MoA Classification (1–32, UNE)

// ============================================================================
// 1. HERBICIDES - HRAC 2024 GLOBAL CLASSIFICATION (Groups 0 - 34)
// ============================================================================
export const HRAC_DATABASE = {
  // Group 1: ACCase Inhibitors (Graminicides)
  'clethodim': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide (Grass Specialist)',
    chemicalFamily: 'Cyclohexanedione (DIM)', systemicity: 'Foliar Systemic (Phloem & Xylem)',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High (Single target mutations Ile-1781, Asp-2078)',
    crossResistanceRisk: 'High cross-resistance within DIMs and FOPs'
  },
  'sethoxydim': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide (Grass Specialist)',
    chemicalFamily: 'Cyclohexanedione (DIM)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High within ACCase inhibitors'
  },
  'haloxyfop': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide (Grass Specialist)',
    chemicalFamily: 'Aryloxyphenoxypropionate (FOP)', systemicity: 'Foliar Systemic (Phloem & Xylem)',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High cross-resistance across FOPs'
  },
  'quizalofop': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide (Grass Specialist)',
    chemicalFamily: 'Aryloxyphenoxypropionate (FOP)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High across FOPs and DIMs'
  },
  'fenoxaprop': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Selective Post-emergent Graminicide',
    chemicalFamily: 'Aryloxyphenoxypropionate (FOP)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High across ACCase inhibitors'
  },
  'propaquizafop': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide',
    chemicalFamily: 'Aryloxyphenoxypropionate (FOP)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },
  'fluazifop': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide',
    chemicalFamily: 'Aryloxyphenoxypropionate (FOP)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },
  'clodinafop': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Cereal Graminicide',
    chemicalFamily: 'Aryloxyphenoxypropionate (FOP)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },
  'pinoxaden': {
    code: 'HRAC 1', group: 'HRAC 1', hracGroup: '1', wssa: 'Group 1', committee: 'HRAC',
    name: 'ACCase Inhibitors', class: 'Graminicide (Grass Specialist)',
    chemicalFamily: 'Phenylpyrazoline (DEN)', systemicity: 'Foliar Systemic',
    targetSite: 'Inhibition of acetyl CoA carboxylase (ACCase)',
    resistanceRisk: 'High', crossResistanceRisk: 'Cross-resistance observed with FOPs/DIMs'
  },

  // Group 2: ALS Inhibitors (Acetolactate Synthase)
  'imazethapyr': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Broad-spectrum Systemic',
    chemicalFamily: 'Imidazolinone (IMI)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High (Most documented resistant biotypes globally)',
    crossResistanceRisk: 'Cross-resistance common across SU, IMI, and TP families'
  },
  'imazamox': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Broad-spectrum Systemic',
    chemicalFamily: 'Imidazolinone (IMI)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High across ALS inhibitors'
  },
  'halosulfuron': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Selective Sedge & Broadleaf Specialist',
    chemicalFamily: 'Sulfonylurea (SU)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High across SU herbicides'
  },
  'metsulfuron': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Systemic Broadleaf & Brush Killer',
    chemicalFamily: 'Sulfonylurea (SU)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High across SU herbicides'
  },
  'pyrazosulfuron': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Paddy Rice Herbicide',
    chemicalFamily: 'Sulfonylurea (SU)', systemicity: 'Systemic (Root & Foliar)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High in aquatic/paddy weeds'
  },
  'bispyribac': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Post-emergence Rice Grass & Broadleaf',
    chemicalFamily: 'Pyrimidinyl-benzoate (PYB)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High across ALS inhibitors'
  },
  'penoxsulam': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Rice & Turf Herbicide',
    chemicalFamily: 'Triazolopyrimidine (TP)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },
  'florasulam': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Cereal Broadleaf Herbicide',
    chemicalFamily: 'Triazolopyrimidine (TP)', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },
  'chlorsulfuron': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Broadleaf & Grass Herbicide',
    chemicalFamily: 'Sulfonylurea (SU)', systemicity: 'Systemic',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },
  'nicosulfuron': {
    code: 'HRAC 2', group: 'HRAC 2', hracGroup: '2', wssa: 'Group 2', committee: 'HRAC',
    name: 'ALS Inhibitors', class: 'Corn Grass Herbicide',
    chemicalFamily: 'Sulfonylurea (SU)', systemicity: 'Systemic',
    targetSite: 'Inhibition of acetolactate synthase (ALS)',
    resistanceRisk: 'High', crossResistanceRisk: 'High'
  },

  // Group 3: Microtubule Assembly Inhibitors
  'pendimethalin': {
    code: 'HRAC 3', group: 'HRAC 3', hracGroup: '3', wssa: 'Group 3', committee: 'HRAC',
    name: 'Microtubule Assembly Inhibitors', class: 'Pre-emergent Soil Residual',
    chemicalFamily: 'Dinitroaniline', systemicity: 'Soil Applied, Non-systemic (Apical Meristem)',
    targetSite: 'Microtubule assembly inhibition (α-tubulin binding)',
    resistanceRisk: 'Low to Medium (Slow mutation frequency)',
    crossResistanceRisk: 'Moderate within dinitroanilines'
  },
  'trifluralin': {
    code: 'HRAC 3', group: 'HRAC 3', hracGroup: '3', wssa: 'Group 3', committee: 'HRAC',
    name: 'Microtubule Assembly Inhibitors', class: 'Pre-emergent Soil Incorporated',
    chemicalFamily: 'Dinitroaniline', systemicity: 'Soil Residual Meristematic',
    targetSite: 'Microtubule assembly inhibition (α-tubulin binding)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Moderate within dinitroanilines'
  },
  'oryzalin': {
    code: 'HRAC 3', group: 'HRAC 3', hracGroup: '3', wssa: 'Group 3', committee: 'HRAC',
    name: 'Microtubule Assembly Inhibitors', class: 'Pre-emergent Surface Applied',
    chemicalFamily: 'Dinitroaniline', systemicity: 'Soil Residual',
    targetSite: 'Microtubule assembly inhibition',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Moderate'
  },

  // Group 4: Synthetic Auxins (Auxin Mimics)
  '2,4-d': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Selective Broadleaf Systemic',
    chemicalFamily: 'Phenoxy-carboxylic acid', systemicity: 'Symplastic Systemic (Phloem & Xylem)',
    targetSite: 'Indole-3-acetic acid (IAA) auxin receptor mimic (TIR1/AFB)',
    resistanceRisk: 'Low to Medium (Evolved primarily after decades of exclusive use)',
    crossResistanceRisk: 'Variable; some cross-resistance to Dicamba and Triclopyr'
  },
  'dicamba': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Broadleaf Systemic Knockdown',
    chemicalFamily: 'Benzoic acid', systemicity: 'Symplastic Systemic (Phloem & Xylem)',
    targetSite: 'Synthetic auxin action (IAA mimic, TIR1/AFB pathway)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Cross-resistance with other synthetic auxins'
  },
  'triclopyr': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Woody Plant & Brush Specialist',
    chemicalFamily: 'Pyridine-carboxylic acid', systemicity: 'Symplastic Systemic',
    targetSite: 'Synthetic auxin action (IAA mimic)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low across chemical families'
  },
  'mcpa': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Selective Broadleaf Systemic',
    chemicalFamily: 'Phenoxy-carboxylic acid', systemicity: 'Symplastic Systemic',
    targetSite: 'Synthetic auxin action (IAA mimic)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'High with 2,4-D'
  },
  'fluroxypyr': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Broadleaf Herbicide',
    chemicalFamily: 'Pyridine-carboxylic acid', systemicity: 'Symplastic Systemic',
    targetSite: 'Synthetic auxin action (IAA mimic)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Moderate'
  },
  'clopyralid': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Thistle & Legume Specialist',
    chemicalFamily: 'Pyridine-carboxylic acid', systemicity: 'Symplastic Systemic',
    targetSite: 'Synthetic auxin action (IAA mimic)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Moderate'
  },
  'quinclorac': {
    code: 'HRAC 4', group: 'HRAC 4', hracGroup: '4', wssa: 'Group 4', committee: 'HRAC',
    name: 'Synthetic Auxin Mimics', class: 'Grass & Broadleaf Herbicide',
    chemicalFamily: 'Quinoline-carboxylic acid', systemicity: 'Systemic',
    targetSite: 'Synthetic auxin action (IAA mimic) & ACC synthase induction',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Moderate'
  },

  // Group 5: Photosystem II Inhibitors (Serine 264 Binders)
  'atrazine': {
    code: 'HRAC 5', group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Serine 264)', class: 'Selective Residual & Foliar',
    chemicalFamily: '1,3,5-Triazine', systemicity: 'Apoplastic / Xylem-mobile Systemic',
    targetSite: 'Inhibition of photosynthesis at PS II (D1 protein Ser264 binding)',
    resistanceRisk: 'Medium to High (psbA target site Ser264Gly mutation)',
    crossResistanceRisk: 'Cross-resistance across all Triazines'
  },
  'simazine': {
    code: 'HRAC 5', group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Serine 264)', class: 'Pre-emergence Residual',
    chemicalFamily: '1,3,5-Triazine', systemicity: 'Xylem-mobile Systemic',
    targetSite: 'Inhibition of photosynthesis at PS II',
    resistanceRisk: 'High', crossResistanceRisk: 'High with Atrazine'
  },
  'metribuzin': {
    code: 'HRAC 5', group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Serine 264)', class: 'Broadleaf & Grass Residual',
    chemicalFamily: 'Triazinone', systemicity: 'Xylem-mobile Systemic',
    targetSite: 'Inhibition of photosynthesis at PS II',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'High with Triazines'
  },
  'diuron': {
    code: 'HRAC 5', group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Serine 264)', class: 'Broadleaf & Grass Residual',
    chemicalFamily: 'Urea (Phenylurea)', systemicity: 'Xylem-mobile Systemic',
    targetSite: 'Inhibition of photosynthesis at PS II',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'Moderate'
  },
  'linuron': {
    code: 'HRAC 5', group: 'HRAC 5', hracGroup: '5', wssa: 'Group 5', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Serine 264)', class: 'Selective Residual',
    chemicalFamily: 'Urea (Phenylurea)', systemicity: 'Xylem-mobile Systemic',
    targetSite: 'Inhibition of photosynthesis at PS II',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Moderate'
  },

  // Group 6: Photosystem II Inhibitors (Histidine 215 Binders)
  'bentazon': {
    code: 'HRAC 6', group: 'HRAC 6', hracGroup: '6', wssa: 'Group 6', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Histidine 215)', class: 'Post-emergence Broadleaf Contact',
    chemicalFamily: 'Benzothiadiazinone', systemicity: 'Contact with minimal translocation',
    targetSite: 'Inhibition of photosynthesis at PS II (His215 binder)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Does NOT share Ser264 target mutations'
  },
  'bromoxynil': {
    code: 'HRAC 6', group: 'HRAC 6', hracGroup: '6', wssa: 'Group 6', committee: 'HRAC',
    name: 'Photosystem II Inhibitors (Histidine 215)', class: 'Broadleaf Contact Knockdown',
    chemicalFamily: 'Nitrile (Hydroxybenzonitrile)', systemicity: 'Contact Knockdown',
    targetSite: 'Inhibition of photosynthesis at PS II & uncoupler of phosphorylation',
    resistanceRisk: 'Low', crossResistanceRisk: 'Low'
  },

  // Group 9: EPSP Synthase Inhibitors
  'glyphosate': {
    code: 'HRAC 9', group: 'HRAC 9', hracGroup: '9', wssa: 'Group 9', committee: 'HRAC',
    name: 'Inhibition of EPSP Synthase', class: 'Broad-spectrum Non-selective Systemic',
    chemicalFamily: 'Glycine / Organophosphorus', systemicity: 'Symplastic Systemic (Phloem & Xylem Translocation)',
    targetSite: 'Inhibition of 5-enolpyruvylshikimate-3-phosphate (EPSP) synthase',
    resistanceRisk: 'Medium to High (High under continuous exclusive mono-cropping)',
    crossResistanceRisk: 'Isolated to EPSPS target & vacuolar sequestration'
  },
  'glycyl': {
    code: 'HRAC 9', group: 'HRAC 9', hracGroup: '9', wssa: 'Group 9', committee: 'HRAC',
    name: 'Inhibition of EPSP Synthase (Glycyl derivative)', class: 'Broad-spectrum Systemic',
    chemicalFamily: 'Glycine / Organophosphorus', systemicity: 'Foliar Systemic Translocation',
    targetSite: 'Inhibition of EPSP synthase',
    resistanceRisk: 'Medium', crossResistanceRisk: 'EPSPS inhibitor group'
  },

  // Group 10: Glutamine Synthetase Inhibitors
  'glufosinate': {
    code: 'HRAC 10', group: 'HRAC 10', hracGroup: '10', wssa: 'Group 10', committee: 'HRAC',
    name: 'Glutamine Synthetase Inhibitors', class: 'Broad-spectrum Contact Knockdown',
    chemicalFamily: 'Phosphinic acid', systemicity: 'Contact with limited translaminar movement',
    targetSite: 'Inhibition of glutamine synthetase (ammonia accumulation & photoinhibition)',
    resistanceRisk: 'Low to Medium (Slow resistance evolution globally)',
    crossResistanceRisk: 'No cross-resistance with Glyphosate (HRAC 9)'
  },

  // Group 12: Phytoene Desaturase (PDS) Inhibitors
  'diflufenican': {
    code: 'HRAC 12', group: 'HRAC 12', hracGroup: '12', wssa: 'Group 12', committee: 'HRAC',
    name: 'Phytoene Desaturase Inhibitors (PDS)', class: 'Carotenoid Biosynthesis Bleacher',
    chemicalFamily: 'Pyridinecarboxamide', systemicity: 'Contact & Soil Residual',
    targetSite: 'Inhibition of phytoene desaturase (PDS)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Moderate'
  },

  // Group 13: DOXP Synthase Inhibitors
  'clomazone': {
    code: 'HRAC 13', group: 'HRAC 13', hracGroup: '13', wssa: 'Group 13', committee: 'HRAC',
    name: 'DOXP Synthase Inhibitors', class: 'Pigment Bleacher / Pre-emergence',
    chemicalFamily: 'Isoxazolidinone', systemicity: 'Xylem-mobile Systemic',
    targetSite: 'Inhibition of 1-deoxy-D-xylulose 5-phosphate (DOXP) synthase',
    resistanceRisk: 'Low', crossResistanceRisk: 'Low'
  },

  // Group 14: PPO Inhibitors (Protoporphyrinogen Oxidase)
  'oxyfluorfen': {
    code: 'HRAC 14', group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', committee: 'HRAC',
    name: 'PPO Inhibitors', class: 'Contact Burndown & Pre-emergence Barrier',
    chemicalFamily: 'Diphenyl ether', systemicity: 'Contact Membrane Disruptor (Light-activated)',
    targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)',
    resistanceRisk: 'Low to Medium (High synergy partner for non-selective burndowns)',
    crossResistanceRisk: 'Low cross-resistance across other MoAs'
  },
  'carfentrazone': {
    code: 'HRAC 14', group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', committee: 'HRAC',
    name: 'PPO Inhibitors', class: 'Ultra-fast Contact Burndown / Spike Partner',
    chemicalFamily: 'Triazolinone', systemicity: 'Contact Desiccant Membrane Disruptor',
    targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },
  'flumioxazin': {
    code: 'HRAC 14', group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', committee: 'HRAC',
    name: 'PPO Inhibitors', class: 'Residual & Knockdown Herbicide',
    chemicalFamily: 'N-phenylphthalimide', systemicity: 'Contact & Soil Residual',
    targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },
  'fomesafen': {
    code: 'HRAC 14', group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', committee: 'HRAC',
    name: 'PPO Inhibitors', class: 'Post-emergence Broadleaf Herbicide',
    chemicalFamily: 'Diphenyl ether', systemicity: 'Contact & Limited Systemic',
    targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Target-site Arg128 mutations'
  },
  'sulfentrazone': {
    code: 'HRAC 14', group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', committee: 'HRAC',
    name: 'PPO Inhibitors', class: 'Soil Applied Residual & Sedge Killer',
    chemicalFamily: 'Triazolinone', systemicity: 'Root Absorbed, Xylem Systemic',
    targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },
  'saflufenacil': {
    code: 'HRAC 14', group: 'HRAC 14', hracGroup: '14', wssa: 'Group 14', committee: 'HRAC',
    name: 'PPO Inhibitors', class: 'Rapid Burndown & Residual',
    chemicalFamily: 'Pyrimidinedione', systemicity: 'Contact with Xylem mobility',
    targetSite: 'Inhibition of protoporphyrinogen oxidase (PPO)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },

  // Group 15: VLCFA Inhibitors (Very Long Chain Fatty Acid Synthesis)
  's-metolachlor': {
    code: 'HRAC 15', group: 'HRAC 15', hracGroup: '15', wssa: 'Group 15', committee: 'HRAC',
    name: 'VLCFA Inhibitors', class: 'Pre-emergence Grass & Small-seeded Broadleaf',
    chemicalFamily: 'Chloroacetamide', systemicity: 'Soil Residual, Shoot & Root Uptake',
    targetSite: 'Inhibition of very long chain fatty acid synthesis (VLCFA elongases)',
    resistanceRisk: 'Low (Multi-step metabolic resistance observed rarely)',
    crossResistanceRisk: 'Low'
  },
  'metolachlor': {
    code: 'HRAC 15', group: 'HRAC 15', hracGroup: '15', wssa: 'Group 15', committee: 'HRAC',
    name: 'VLCFA Inhibitors', class: 'Pre-emergence Grass Herbicide',
    chemicalFamily: 'Chloroacetamide', systemicity: 'Soil Residual',
    targetSite: 'Inhibition of very long chain fatty acid synthesis',
    resistanceRisk: 'Low', crossResistanceRisk: 'Low'
  },
  'acetochlor': {
    code: 'HRAC 15', group: 'HRAC 15', hracGroup: '15', wssa: 'Group 15', committee: 'HRAC',
    name: 'VLCFA Inhibitors', class: 'Pre-emergence Residual',
    chemicalFamily: 'Chloroacetamide', systemicity: 'Soil Residual',
    targetSite: 'Inhibition of very long chain fatty acid synthesis',
    resistanceRisk: 'Low', crossResistanceRisk: 'Low'
  },
  'pyroxasulfone': {
    code: 'HRAC 15', group: 'HRAC 15', hracGroup: '15', wssa: 'Group 15', committee: 'HRAC',
    name: 'VLCFA Inhibitors', class: 'Next-gen Pre-emergence Grass & Broadleaf',
    chemicalFamily: 'Isoxazoline', systemicity: 'Soil Applied Residual Barrier',
    targetSite: 'Inhibition of very long chain fatty acid synthesis',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },
  'pretilachlor': {
    code: 'HRAC 15', group: 'HRAC 15', hracGroup: '15', wssa: 'Group 15', committee: 'HRAC',
    name: 'VLCFA Inhibitors', class: 'Selective Rice Herbicide',
    chemicalFamily: 'Chloroacetamide', systemicity: 'Soil Applied Shoot Uptake',
    targetSite: 'Inhibition of very long chain fatty acid synthesis',
    resistanceRisk: 'Low', crossResistanceRisk: 'Low'
  },
  'butachlor': {
    code: 'HRAC 15', group: 'HRAC 15', hracGroup: '15', wssa: 'Group 15', committee: 'HRAC',
    name: 'VLCFA Inhibitors', class: 'Paddy Rice Herbicide',
    chemicalFamily: 'Chloroacetamide', systemicity: 'Soil Applied Shoot Uptake',
    targetSite: 'Inhibition of very long chain fatty acid synthesis',
    resistanceRisk: 'Low', crossResistanceRisk: 'Low'
  },

  // Group 22: Photosystem I Electron Diverters
  'paraquat': {
    code: 'HRAC 22', group: 'HRAC 22', hracGroup: '22', wssa: 'Group 22', committee: 'HRAC',
    name: 'Photosystem I Electron Diverters', class: 'Ultra-fast Non-selective Contact Desiccant',
    chemicalFamily: 'Bipyridylium', systemicity: 'Contact Only (Superoxide radical generator)',
    targetSite: 'Diversion of electrons at Photosystem I',
    resistanceRisk: 'Low to Medium (Membrane sequestration in some biotypes)',
    crossResistanceRisk: 'High cross-resistance with Diquat'
  },
  'diquat': {
    code: 'HRAC 22', group: 'HRAC 22', hracGroup: '22', wssa: 'Group 22', committee: 'HRAC',
    name: 'Photosystem I Electron Diverters', class: 'Crop Desiccant & Aquatic Herbicide',
    chemicalFamily: 'Bipyridylium', systemicity: 'Contact Only',
    targetSite: 'Diversion of electrons at Photosystem I',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'High with Paraquat'
  },
  'bpd': {
    code: 'HRAC 22', group: 'HRAC 22', hracGroup: '22', wssa: 'Group 22', committee: 'HRAC',
    name: 'Photosystem I Electron Diverters (BPD Complex)', class: 'Fast Contact Desiccant',
    chemicalFamily: 'Bipyridylium / Contact Radical', systemicity: 'Ultra-fast Contact Desiccant',
    targetSite: 'Diversion of electrons at Photosystem I',
    resistanceRisk: 'Low', crossResistanceRisk: 'Bipyridylium group'
  },

  // Group 27: HPPD Inhibitors (Bleachers)
  'mesotrione': {
    code: 'HRAC 27', group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', committee: 'HRAC',
    name: 'HPPD Inhibitors (Pigment Bleaching)', class: 'Corn Broadleaf Bleacher & Residual',
    chemicalFamily: 'Triketone', systemicity: 'Foliar & Root Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)',
    resistanceRisk: 'Medium (Metabolic P450 detoxification)',
    crossResistanceRisk: 'Cross-resistance observed across Triketones and Isoxazoles'
  },
  'tembotrione': {
    code: 'HRAC 27', group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', committee: 'HRAC',
    name: 'HPPD Inhibitors (Pigment Bleaching)', class: 'Post-emergence Corn Herbicide',
    chemicalFamily: 'Triketone', systemicity: 'Systemic (Xylem & Phloem)',
    targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within HPPD group'
  },
  'topramezone': {
    code: 'HRAC 27', group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', committee: 'HRAC',
    name: 'HPPD Inhibitors (Pigment Bleaching)', class: 'Post-emergence Bleacher',
    chemicalFamily: 'Pyrazolone', systemicity: 'Systemic',
    targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within HPPD group'
  },
  'isoxaflutole': {
    code: 'HRAC 27', group: 'HRAC 27', hracGroup: '27', wssa: 'Group 27', committee: 'HRAC',
    name: 'HPPD Inhibitors (Pigment Bleaching)', class: 'Pre-emergence Bleacher',
    chemicalFamily: 'Isoxazole', systemicity: 'Root Uptake Systemic',
    targetSite: 'Inhibition of 4-hydroxyphenylpyruvate dioxygenase (HPPD)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within HPPD group'
  },

  // Group 0: Natural Bio-Rational Desiccants & Unknown
  'pelargonic': {
    code: 'HRAC 0', group: 'HRAC 0', hracGroup: '0', wssa: 'Bio-Burndown', committee: 'HRAC',
    name: 'Fatty Acid Cell Membrane Disruptor', class: 'Bio-Rational Contact Desiccant',
    chemicalFamily: 'Carboxylic / Fatty Acid (C9)', systemicity: 'Non-systemic Contact Stripper',
    targetSite: 'Physical strip of plant epicuticular wax and cellular lysis',
    resistanceRisk: 'None / Negligible (Physical Mode of Action)',
    crossResistanceRisk: 'Zero risk of cross-resistance'
  },
  'nonanoic': {
    code: 'HRAC 0', group: 'HRAC 0', hracGroup: '0', wssa: 'Bio-Burndown', committee: 'HRAC',
    name: 'Fatty Acid Membrane Disruptor', class: 'Bio-Rational Contact Desiccant',
    chemicalFamily: 'Carboxylic / Fatty Acid (C9)', systemicity: 'Contact Cuticle Stripper',
    targetSite: 'Physical dissolution of epicuticular waxes & membrane disruption',
    resistanceRisk: 'None / Negligible', crossResistanceRisk: 'Zero'
  },
  'acetic': {
    code: 'HRAC 0', group: 'HRAC 0', hracGroup: '0', wssa: 'Bio-Burndown', committee: 'HRAC',
    name: 'Organic Acid Cell Disruptor', class: 'Bio-Contact Burndown',
    chemicalFamily: 'Carboxylic Acid', systemicity: 'Contact',
    targetSite: 'Low pH cellular membrane lysis and rapid protein denaturation',
    resistanceRisk: 'None', crossResistanceRisk: 'Zero'
  }
};

// ============================================================================
// 2. FUNGICIDES - FRAC 2024 CODE LIST (Groups 1 - 50, M01 - M12, P, BM)
// ============================================================================
export const FRAC_DATABASE = {
  // FRAC 1: Methyl Benzimidazole Carbamates (MBC) - β-tubulin
  'carbendazim': {
    code: 'FRAC 1', group: 'FRAC 1', fracGroup: '1', committee: 'FRAC',
    name: 'MBC Fungicides (β-tubulin Assembly)', class: 'Broad-spectrum Systemic Fungicide',
    chemicalFamily: 'Benzimidazole', systemicity: 'Apoplastic / Xylem Systemic (Acropetal)',
    targetSite: 'β-tubulin assembly in mitosis (E198A/K or F200Y mutations)',
    resistanceRisk: 'High (Widespread cross-resistance across all MBC fungicides)',
    crossResistanceRisk: 'Complete cross-resistance with Benomyl and Thiophanate-methyl'
  },
  'thiophanate': {
    code: 'FRAC 1', group: 'FRAC 1', fracGroup: '1', committee: 'FRAC',
    name: 'MBC Fungicides', class: 'Systemic Fungicide',
    chemicalFamily: 'Thiophanate', systemicity: 'Acropetal Systemic',
    targetSite: 'β-tubulin assembly in mitosis',
    resistanceRisk: 'High', crossResistanceRisk: 'High within FRAC 1'
  },
  'benomyl': {
    code: 'FRAC 1', group: 'FRAC 1', fracGroup: '1', committee: 'FRAC',
    name: 'MBC Fungicides', class: 'Broad-spectrum Systemic',
    chemicalFamily: 'Benzimidazole', systemicity: 'Acropetal Systemic',
    targetSite: 'β-tubulin assembly in mitosis',
    resistanceRisk: 'High', crossResistanceRisk: 'High within FRAC 1'
  },

  // FRAC 3: Demethylation Inhibitors (DMI) - Sterol 14α-demethylase (Triazoles)
  'tebuconazole': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'Systemic Curative & Protective Triazole',
    chemicalFamily: 'Triazole', systemicity: 'Acropetal Systemic (Xylem Mobile)',
    targetSite: 'Inhibition of C14-demethylase in sterol biosynthesis (CYP51 / ERG11)',
    resistanceRisk: 'Medium (Gradual, quantitative shift; CYP51 mutations & efflux pumps)',
    crossResistanceRisk: 'Moderate to high cross-resistance across Triazole fungicides'
  },
  'difenoconazole': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'High-potency Broad-spectrum Triazole',
    chemicalFamily: 'Triazole', systemicity: 'Acropetal Systemic & Translaminar',
    targetSite: 'Inhibition of sterol 14α-demethylase (CYP51)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Moderate across DMI Triazoles'
  },
  'propiconazole': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'Cereal & Turf Systemic Triazole',
    chemicalFamily: 'Triazole', systemicity: 'Acropetal Systemic',
    targetSite: 'Inhibition of sterol 14α-demethylase (CYP51)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within Triazoles'
  },
  'hexaconazole': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'Systemic Triazole',
    chemicalFamily: 'Triazole', systemicity: 'Acropetal Systemic',
    targetSite: 'Inhibition of sterol 14α-demethylase (CYP51)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within Triazoles'
  },
  'prothioconazole': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'Next-gen Triazolinthione',
    chemicalFamily: 'Triazolo-thione', systemicity: 'Acropetal Systemic',
    targetSite: 'Inhibition of sterol 14α-demethylase (CYP51)',
    resistanceRisk: 'Medium (High intrinsic activity against resistant strains)',
    crossResistanceRisk: 'Partial cross-resistance with older triazoles'
  },
  'epoxiconazole': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'Cereal Systemic Triazole',
    chemicalFamily: 'Triazole', systemicity: 'Acropetal Systemic',
    targetSite: 'Inhibition of sterol 14α-demethylase (CYP51)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within Triazoles'
  },
  'myclobutanil': {
    code: 'FRAC 3', group: 'FRAC 3', fracGroup: '3', committee: 'FRAC',
    name: 'DMI (Demethylation Inhibitors)', class: 'Fruit & Vegetable Triazole',
    chemicalFamily: 'Triazole', systemicity: 'Acropetal Systemic',
    targetSite: 'Inhibition of sterol 14α-demethylase (CYP51)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'High within Triazoles'
  },

  // FRAC 4: Phenylamides (PA) - RNA polymerase I (Oomycete Specialists)
  'metalaxyl': {
    code: 'FRAC 4', group: 'FRAC 4', fracGroup: '4', committee: 'FRAC',
    name: 'PA (Phenylamides)', class: 'Oomycete Specialist (Downy Mildew & Pythium)',
    chemicalFamily: 'Acylalanine', systemicity: 'Apoplastic / Xylem Systemic (Acropetal)',
    targetSite: 'Inhibition of RNA polymerase I complex in Oomycota',
    resistanceRisk: 'High (Rapid qualitative resistance evolution; combine with multi-site)',
    crossResistanceRisk: 'Complete cross-resistance with Mefenoxam and Oxadixyl'
  },
  'mefenoxam': {
    code: 'FRAC 4', group: 'FRAC 4', fracGroup: '4', committee: 'FRAC',
    name: 'PA (Phenylamides - R-enantiomer)', class: 'Oomycete Specialist',
    chemicalFamily: 'Acylalanine', systemicity: 'Acropetal Systemic',
    targetSite: 'Inhibition of RNA polymerase I complex',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete with Metalaxyl'
  },

  // FRAC 7: SDHI (Succinate Dehydrogenase Inhibitors) - Complex II
  'boscalid': {
    code: 'FRAC 7', group: 'FRAC 7', fracGroup: '7', committee: 'FRAC',
    name: 'SDHI (Succinate Dehydrogenase Inhibitors)', class: 'Protective & Curative Fungicide',
    chemicalFamily: 'Pyridine-carboxamide', systemicity: 'Translaminar & Acropetal Systemic',
    targetSite: 'Complex II: succinate dehydrogenase (sdhB, sdhC, sdhD mutations)',
    resistanceRisk: 'Medium to High (Target site mutations; strict spray limits apply)',
    crossResistanceRisk: 'Variable cross-resistance across SDHI sub-classes'
  },
  'fluxapyroxad': {
    code: 'FRAC 7', group: 'FRAC 7', fracGroup: '7', committee: 'FRAC',
    name: 'SDHI (Succinate Dehydrogenase Inhibitors)', class: 'Broad-spectrum Next-gen SDHI',
    chemicalFamily: 'Pyrazole-4-carboxamide', systemicity: 'Xylem Systemic & Translaminar',
    targetSite: 'Complex II: succinate dehydrogenase inhibition',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'Moderate within SDHI family'
  },
  'fluopyram': {
    code: 'FRAC 7', group: 'FRAC 7', fracGroup: '7', committee: 'FRAC',
    name: 'SDHI Fungicide & Nematicide', class: 'Broad-spectrum SDHI',
    chemicalFamily: 'Pyridinyl-ethyl-benzamide', systemicity: 'Acropetal Systemic',
    targetSite: 'Complex II: succinate dehydrogenase inhibition',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'Unique binding profile among SDHIs'
  },
  'thifluzamide': {
    code: 'FRAC 7', group: 'FRAC 7', fracGroup: '7', committee: 'FRAC',
    name: 'SDHI (Succinate Dehydrogenase Inhibitors)', class: 'Rice Sheath Blight Specialist',
    chemicalFamily: 'Thiazole-carboxamide', systemicity: 'Acropetal Systemic',
    targetSite: 'Complex II: succinate dehydrogenase inhibition',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'Moderate'
  },

  // FRAC 9: Anilinopyrimidines (AP) - Methionine Biosynthesis
  'cyprodinil': {
    code: 'FRAC 9', group: 'FRAC 9', fracGroup: '9', committee: 'FRAC',
    name: 'Anilinopyrimidines (AP)', class: 'Botrytis & Venturia Specialist',
    chemicalFamily: 'Anilinopyrimidine', systemicity: 'Translaminar & Acropetal Systemic',
    targetSite: 'Inhibition of methionine biosynthesis and secretion of hydrolytic enzymes',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Cross-resistance with Pyrimethanil'
  },

  // FRAC 11: QoI (Quinone Outside Inhibitors / Strobilurins) - Complex III
  'azoxystrobin': {
    code: 'FRAC 11', group: 'FRAC 11', fracGroup: '11', committee: 'FRAC',
    name: 'QoI (Strobilurins / Complex III)', class: 'Broad-spectrum Systemic Protective',
    chemicalFamily: 'Methoxy-acrylate', systemicity: 'Xylem-mobile Systemic & Translaminar',
    targetSite: 'Complex III: cytochrome bc1 (ubiquinol oxidase) at Qo site (G143A mutation)',
    resistanceRisk: 'High (Disruptive single-step G143A mutation eliminates efficacy)',
    crossResistanceRisk: 'Complete cross-resistance across all FRAC 11 Strobilurins'
  },
  'pyraclostrobin': {
    code: 'FRAC 11', group: 'FRAC 11', fracGroup: '11', committee: 'FRAC',
    name: 'QoI (Strobilurins / Complex III)', class: 'High-potency Broad-spectrum Strobilurin',
    chemicalFamily: 'Methoxy-carbamate', systemicity: 'Translaminar & Local Systemic',
    targetSite: 'Complex III: cytochrome bc1 at Qo site (G143A mutation)',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete across all FRAC 11'
  },
  'trifloxystrobin': {
    code: 'FRAC 11', group: 'FRAC 11', fracGroup: '11', committee: 'FRAC',
    name: 'QoI (Strobilurins / Complex III)', class: 'Protective & Curative Strobilurin',
    chemicalFamily: 'Oximino-acetate', systemicity: 'Mesostemic (Surface binding & translaminar)',
    targetSite: 'Complex III: cytochrome bc1 at Qo site',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete across all FRAC 11'
  },
  'kresoxim': {
    code: 'FRAC 11', group: 'FRAC 11', fracGroup: '11', committee: 'FRAC',
    name: 'QoI (Strobilurins / Complex III)', class: 'Powdery Mildew & Scab Strobilurin',
    chemicalFamily: 'Oximino-acetate', systemicity: 'Translaminar / Vapor action',
    targetSite: 'Complex III: cytochrome bc1 at Qo site',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete across all FRAC 11'
  },

  // FRAC 12: Phenylpyrroles - MAP Protein Kinase
  'fludioxonil': {
    code: 'FRAC 12', group: 'FRAC 12', fracGroup: '12', committee: 'FRAC',
    name: 'Phenylpyrroles', class: 'Seed Treatment & Contact Protectant',
    chemicalFamily: 'Phenylpyrrole', systemicity: 'Contact / Localized Persistence',
    targetSite: 'Signal transduction: MAP/histidine kinase in osmotic signal pathway',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },

  // FRAC 21: QiI (Quinone Inside Inhibitors) - Complex III
  'cyazofamid': {
    code: 'FRAC 21', group: 'FRAC 21', fracGroup: '21', committee: 'FRAC',
    name: 'QiI (Quinone Inside Inhibitors)', class: 'Oomycete Specialist (Late Blight)',
    chemicalFamily: 'Cyano-imidazole', systemicity: 'Contact with Translaminar activity',
    targetSite: 'Complex III: cytochrome bc1 at Qi site',
    resistanceRisk: 'Medium', crossResistanceRisk: 'No cross-resistance with QoI (FRAC 11)'
  },

  // FRAC 40: Carboxylic Acid Amides (CAA) - Cellulose Synthase
  'dimethomorph': {
    code: 'FRAC 40', group: 'FRAC 40', fracGroup: '40', committee: 'FRAC',
    name: 'CAA (Carboxylic Acid Amides)', class: 'Oomycete Cell Wall Disruptor',
    chemicalFamily: 'Cinnamic acid amide', systemicity: 'Translaminar & Local Systemic',
    targetSite: 'Inhibition of cellulose synthase (CesA3) in Oomycetes',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Cross-resistance within CAA group'
  },
  'mandipropamid': {
    code: 'FRAC 40', group: 'FRAC 40', fracGroup: '40', committee: 'FRAC',
    name: 'CAA (Carboxylic Acid Amides)', class: 'Late Blight & Downy Mildew Protectant',
    chemicalFamily: 'Mandelic acid amide', systemicity: 'Translaminar & Rainfast Surface Adherence',
    targetSite: 'Inhibition of cellulose synthase (CesA3)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Cross-resistance within CAA group'
  },

  // FRAC M: Multi-Site Contact Activity (M01 - M12)
  'mancozeb': {
    code: 'FRAC M03', group: 'FRAC M03', fracGroup: 'M03', committee: 'FRAC',
    name: 'Multi-site Dithiocarbamate', class: 'Broad-spectrum Protectant / Anti-resistance Pillar',
    chemicalFamily: 'Dithiocarbamate (Zinc & Manganese coordination)', systemicity: 'Non-systemic Contact Barrier',
    targetSite: 'Multi-site: Inactivates sulfhydryl (-SH) groups in essential fungal enzymes',
    resistanceRisk: 'Low / None (No field resistance recorded in >60 years of global use)',
    crossResistanceRisk: 'Zero (Universal multi-site anti-resistance tank-mix partner)'
  },
  'propineb': {
    code: 'FRAC M03', group: 'FRAC M03', fracGroup: 'M03', committee: 'FRAC',
    name: 'Multi-site Dithiocarbamate', class: 'Broad-spectrum Protective Fungicide',
    chemicalFamily: 'Dithiocarbamate (Polymeric Zinc complex)', systemicity: 'Non-systemic Contact',
    targetSite: 'Multi-site enzyme inhibition (SH-inactivator)',
    resistanceRisk: 'Low / None', crossResistanceRisk: 'Zero'
  },
  'chlorothalonil': {
    code: 'FRAC M05', group: 'FRAC M05', fracGroup: 'M05', committee: 'FRAC',
    name: 'Multi-site Chloronitrile', class: 'Broad-spectrum Foliar Protectant',
    chemicalFamily: 'Chloronitrile', systemicity: 'Non-systemic Contact / Highly Rainfast',
    targetSite: 'Multi-site: Glutathione depletion & thiol-dependent enzyme inhibition',
    resistanceRisk: 'Low / None (Essential anti-resistance partner)',
    crossResistanceRisk: 'Zero'
  },
  'copper': {
    code: 'FRAC M01', group: 'FRAC M01', fracGroup: 'M01', committee: 'FRAC',
    name: 'Multi-site Inorganic Copper', class: 'Bactericide & Contact Protective Fungicide',
    chemicalFamily: 'Inorganic Copper (Oxychloride / Hydroxide)', systemicity: 'Non-systemic Surface Protectant',
    targetSite: 'Multi-site: Denatures fungal & bacterial proteins and disrupts membranes',
    resistanceRisk: 'Low (Rare copper tolerance in bacteria via plasmid-borne cop genes)',
    crossResistanceRisk: 'Zero cross-resistance with organic fungicides'
  },
  'sulfur': {
    code: 'FRAC M02', group: 'FRAC M02', fracGroup: 'M02', committee: 'FRAC',
    name: 'Multi-site Inorganic Sulfur', class: 'Powdery Mildew & Mite Protectant',
    chemicalFamily: 'Inorganic Elemental Sulfur', systemicity: 'Contact & Vapor Phase Action',
    targetSite: 'Multi-site: Disrupts mitochondrial electron transport (cytochrome system)',
    resistanceRisk: 'Low / None', crossResistanceRisk: 'Zero'
  },
  'captan': {
    code: 'FRAC M04', group: 'FRAC M04', fracGroup: 'M04', committee: 'FRAC',
    name: 'Multi-site Phthalimide', class: 'Broad-spectrum Protectant',
    chemicalFamily: 'Phthalimide', systemicity: 'Non-systemic Contact',
    targetSite: 'Multi-site enzyme and thiol inhibition',
    resistanceRisk: 'Low / None', crossResistanceRisk: 'Zero'
  }
};

// ============================================================================
// 3. INSECTICIDES / PESTICIDES - IRAC 2024 CLASSIFICATION (Groups 1 - 32, UNE)
// ============================================================================
export const IRAC_DATABASE = {
  // IRAC 1A: Acetylcholinesterase (AChE) Inhibitors - Carbamates
  'methomyl': {
    code: 'IRAC 1A', group: 'IRAC 1A', iracGroup: '1A', committee: 'IRAC',
    name: 'AChE Inhibitors (Carbamates)', class: 'Broad-spectrum Contact & Stomach Poison',
    chemicalFamily: 'Carbamate', systemicity: 'Systemic & Contact Knockdown',
    targetSite: 'Inhibition of acetylcholinesterase (AChE) leading to acetylcholine accumulation',
    resistanceRisk: 'High (Target site mutations ace-1 and metabolic detoxification)',
    crossResistanceRisk: 'Cross-resistance across carbamates and some organophosphates'
  },
  'carbosulfan': {
    code: 'IRAC 1A', group: 'IRAC 1A', iracGroup: '1A', committee: 'IRAC',
    name: 'AChE Inhibitors (Carbamates)', class: 'Soil & Foliar Insecticide',
    chemicalFamily: 'Carbamate', systemicity: 'Systemic',
    targetSite: 'Inhibition of acetylcholinesterase (AChE)',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 1A'
  },
  'thiodicarb': {
    code: 'IRAC 1A', group: 'IRAC 1A', iracGroup: '1A', committee: 'IRAC',
    name: 'AChE Inhibitors (Carbamates)', class: 'Lepidoptera Specialist & Ovicidal',
    chemicalFamily: 'Carbamate', systemicity: 'Contact & Ingestion',
    targetSite: 'Inhibition of acetylcholinesterase (AChE)',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 1A'
  },

  // IRAC 1B: Acetylcholinesterase (AChE) Inhibitors - Organophosphates
  'chlorpyrifos': {
    code: 'IRAC 1B', group: 'IRAC 1B', iracGroup: '1B', committee: 'IRAC',
    name: 'AChE Inhibitors (Organophosphates)', class: 'Broad-spectrum Insecticide & Acaricide',
    chemicalFamily: 'Organophosphate', systemicity: 'Non-systemic Contact, Ingestion & Vapor Action',
    targetSite: 'Irreversible inhibition of acetylcholinesterase (AChE)',
    resistanceRisk: 'High (Carboxylesterase and P450 upregulation)',
    crossResistanceRisk: 'Broad cross-resistance across organophosphates'
  },
  'acephate': {
    code: 'IRAC 1B', group: 'IRAC 1B', iracGroup: '1B', committee: 'IRAC',
    name: 'AChE Inhibitors (Organophosphates)', class: 'Systemic Sucking & Chewing Pest Killer',
    chemicalFamily: 'Organophosphate', systemicity: 'Acropetal Systemic (Foliar & Root Uptake)',
    targetSite: 'Inhibition of acetylcholinesterase (metabolized to Methamidophos in vivo)',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 1B'
  },
  'profenofos': {
    code: 'IRAC 1B', group: 'IRAC 1B', iracGroup: '1B', committee: 'IRAC',
    name: 'AChE Inhibitors (Organophosphates)', class: 'Fast Knockdown & Translaminar Insecticide',
    chemicalFamily: 'Organophosphate', systemicity: 'Translaminar & Contact Knockdown',
    targetSite: 'Inhibition of acetylcholinesterase',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 1B'
  },
  'malathion': {
    code: 'IRAC 1B', group: 'IRAC 1B', iracGroup: '1B', committee: 'IRAC',
    name: 'AChE Inhibitors (Organophosphates)', class: 'Contact Insecticide',
    chemicalFamily: 'Organophosphate', systemicity: 'Non-systemic Contact',
    targetSite: 'Inhibition of acetylcholinesterase',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 1B'
  },
  'dimethoate': {
    code: 'IRAC 1B', group: 'IRAC 1B', iracGroup: '1B', committee: 'IRAC',
    name: 'AChE Inhibitors (Organophosphates)', class: 'Systemic Sucking Insect Specialist',
    chemicalFamily: 'Organophosphate', systemicity: 'Systemic',
    targetSite: 'Inhibition of acetylcholinesterase',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 1B'
  },

  // IRAC 2B: GABA-gated Chloride Channel Blockers - Phenylpyrazoles
  'fipronil': {
    code: 'IRAC 2B', group: 'IRAC 2B', iracGroup: '2B', committee: 'IRAC',
    name: 'GABA-gated Chloride Channel Blockers', class: 'Broad-spectrum Soil & Foliar Insecticide',
    chemicalFamily: 'Phenylpyrazole', systemicity: 'Acropetal Systemic & Contact Ingestion',
    targetSite: 'GABA-gated chloride channel antagonist (RDL subunit A302S/G mutation)',
    resistanceRisk: 'Medium to High (High pressure in diamondback moth & planthoppers)',
    crossResistanceRisk: 'Cross-resistance with cyclodiene organochlorines'
  },

  // IRAC 3A: Sodium Channel Modulators - Pyrethroids
  'lambda-cyhalothrin': {
    code: 'IRAC 3A', group: 'IRAC 3A', iracGroup: '3A', committee: 'IRAC',
    name: 'Sodium Channel Modulators (Pyrethroids)', class: 'High-potency Knockdown Pyrethroid',
    chemicalFamily: 'Pyrethroid (Type II - alpha-cyano)', systemicity: 'Non-systemic Contact & Ingestion / Fast Paralysis',
    targetSite: 'Voltage-gated sodium channel modulation (prolonged opening; kdr mutations)',
    resistanceRisk: 'High (Target site kdr / super-kdr and metabolic detoxification)',
    crossResistanceRisk: 'Complete cross-resistance across all synthetic pyrethroids'
  },
  'cypermethrin': {
    code: 'IRAC 3A', group: 'IRAC 3A', iracGroup: '3A', committee: 'IRAC',
    name: 'Sodium Channel Modulators (Pyrethroids)', class: 'Contact Pyrethroid',
    chemicalFamily: 'Pyrethroid (Type II)', systemicity: 'Contact & Stomach',
    targetSite: 'Voltage-gated sodium channel modulation',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete within IRAC 3A'
  },
  'deltamethrin': {
    code: 'IRAC 3A', group: 'IRAC 3A', iracGroup: '3A', committee: 'IRAC',
    name: 'Sodium Channel Modulators (Pyrethroids)', class: 'Fast Knockdown Pyrethroid',
    chemicalFamily: 'Pyrethroid (Type II)', systemicity: 'Contact & Stomach',
    targetSite: 'Voltage-gated sodium channel modulation',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete within IRAC 3A'
  },
  'bifenthrin': {
    code: 'IRAC 3A', group: 'IRAC 3A', iracGroup: '3A', committee: 'IRAC',
    name: 'Sodium Channel Modulators (Pyrethroids)', class: 'Insecticide & Miticide (Termiticide)',
    chemicalFamily: 'Pyrethroid (Type I)', systemicity: 'Contact & Soil Residual Barrier',
    targetSite: 'Voltage-gated sodium channel modulation',
    resistanceRisk: 'High', crossResistanceRisk: 'High within Pyrethroids'
  },

  // IRAC 4A: Nicotinic Acetylcholine Receptor (nAChR) Competitive Modulators - Neonicotinoids
  'imidacloprid': {
    code: 'IRAC 4A', group: 'IRAC 4A', iracGroup: '4A', committee: 'IRAC',
    name: 'nAChR Competitive Modulators (Neonicotinoids)', class: 'Systemic Sucking Pest & Seed Treatment',
    chemicalFamily: 'Neonicotinoid (Chloronicotinyl)', systemicity: 'Acropetal Systemic (Xylem & Phloem Translocation)',
    targetSite: 'Competitive agonist at nicotinic acetylcholine receptors (nAChR α-subunit)',
    resistanceRisk: 'High (Target site mutation Y151S in planthoppers and CYP6CY3 amplification)',
    crossResistanceRisk: 'High cross-resistance across all neonicotinoids'
  },
  'thiamethoxam': {
    code: 'IRAC 4A', group: 'IRAC 4A', iracGroup: '4A', committee: 'IRAC',
    name: 'nAChR Competitive Modulators (Neonicotinoids)', class: 'Second-gen Neonicotinoid Systemic',
    chemicalFamily: 'Neonicotinoid (Thianicotinyl)', systemicity: 'Rapid Acropetal Systemic (Foliar & Seed)',
    targetSite: 'nAChR competitive agonist (metabolized to Clothianidin)',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete across IRAC 4A'
  },
  'clothianidin': {
    code: 'IRAC 4A', group: 'IRAC 4A', iracGroup: '4A', committee: 'IRAC',
    name: 'nAChR Competitive Modulators (Neonicotinoids)', class: 'Soil & Seed Systemic',
    chemicalFamily: 'Neonicotinoid', systemicity: 'Acropetal Systemic',
    targetSite: 'nAChR competitive agonist',
    resistanceRisk: 'High', crossResistanceRisk: 'Complete across IRAC 4A'
  },
  'acetamiprid': {
    code: 'IRAC 4A', group: 'IRAC 4A', iracGroup: '4A', committee: 'IRAC',
    name: 'nAChR Competitive Modulators (Neonicotinoids)', class: 'Aphid & Whitefly Specialist',
    chemicalFamily: 'Neonicotinoid', systemicity: 'Translaminar & Acropetal Systemic',
    targetSite: 'nAChR competitive agonist (low toxicity to honeybees)',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 4A'
  },
  'dinotefuran': {
    code: 'IRAC 4A', group: 'IRAC 4A', iracGroup: '4A', committee: 'IRAC',
    name: 'nAChR Competitive Modulators (Neonicotinoids)', class: 'Third-gen Furanicotinyl Systemic',
    chemicalFamily: 'Neonicotinoid (Furanicotinyl)', systemicity: 'Highly Water-soluble Super-systemic',
    targetSite: 'nAChR competitive agonist',
    resistanceRisk: 'High', crossResistanceRisk: 'High within IRAC 4A'
  },

  // IRAC 5: nAChR Allosteric Modulators - Spinosyns
  'spinosad': {
    code: 'IRAC 5', group: 'IRAC 5', iracGroup: '5', committee: 'IRAC',
    name: 'nAChR Allosteric Modulators (Spinosyns)', class: 'Bio-Rational Fermentation Insecticide',
    chemicalFamily: 'Spinosyn (Saccharopolyspora spinosa ferment)', systemicity: 'Translaminar & Contact Ingestion',
    targetSite: 'Allosteric modulation of nAChR at unique site (different from 4A)',
    resistanceRisk: 'Medium to High (Target site nAChR α6 subunit loss-of-function)',
    crossResistanceRisk: 'Complete cross-resistance with Spinetoram; zero with Neonicotinoids'
  },
  'spinetoram': {
    code: 'IRAC 5', group: 'IRAC 5', iracGroup: '5', committee: 'IRAC',
    name: 'nAChR Allosteric Modulators (Spinosyns)', class: 'Semi-synthetic Advanced Spinosyn',
    chemicalFamily: 'Spinosyn', systemicity: 'Translaminar & Fast Ingestion',
    targetSite: 'Allosteric activation of nAChR α6 subunit',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'High with Spinosad'
  },

  // IRAC 6: Glutamate-gated Chloride Channel (GluCl) Allosteric Modulators - Avermectins
  'emamectin': {
    code: 'IRAC 6', group: 'IRAC 6', iracGroup: '6', committee: 'IRAC',
    name: 'GluCl Allosteric Modulators (Avermectins)', class: 'High-potency Lepidoptera Specialist',
    chemicalFamily: 'Avermectin (Semi-synthetic macrocyclic lactone)', systemicity: 'Translaminar Reservoir (Leaves form translaminar depot)',
    targetSite: 'Allosteric activation of glutamate-gated chloride channels (GluCl)',
    resistanceRisk: 'Medium (Requires mandatory rotational breaks)',
    crossResistanceRisk: 'High cross-resistance with Abamectin'
  },
  'abamectin': {
    code: 'IRAC 6', group: 'IRAC 6', iracGroup: '6', committee: 'IRAC',
    name: 'GluCl Allosteric Modulators (Avermectins)', class: 'Miticide & Leafminer Specialist',
    chemicalFamily: 'Avermectin (Streptomyces avermitilis ferment)', systemicity: 'Translaminar Foliar Depot',
    targetSite: 'Activation of glutamate-gated chloride channels',
    resistanceRisk: 'Medium to High (Rapid in two-spotted spider mites)',
    crossResistanceRisk: 'High within Avermectin family'
  },

  // IRAC 12A: Inhibitors of Mitochondrial ATP Synthase
  'diafenthiuron': {
    code: 'IRAC 12A', group: 'IRAC 12A', iracGroup: '12A', committee: 'IRAC',
    name: 'Mitochondrial ATP Synthase Inhibitors', class: 'Whitefly, Aphid & Mite Specialist',
    chemicalFamily: 'Thiourea', systemicity: 'Contact, Translaminar & Vapor Action (Light-activated)',
    targetSite: 'Inhibition of mitochondrial ATP synthase (carbodiimide metabolite)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low'
  },

  // IRAC 13: Uncouplers of Oxidative Phosphorylation via Proton Gradient Disruption
  'chlorfenapyr': {
    code: 'IRAC 13', group: 'IRAC 13', iracGroup: '13', committee: 'IRAC',
    name: 'Proton Gradient Disrupters (Uncouplers)', class: 'Mite & Resistant Caterpillar Eradicator',
    chemicalFamily: 'Pyrrole (Pro-insecticide activated by P450s)', systemicity: 'Translaminar & Stomach Poison',
    targetSite: 'Disruption of mitochondrial proton gradient uncoupling oxidative phosphorylation',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Zero cross-resistance with Neurotoxins'
  },

  // IRAC 15: Inhibitors of Chitin Biosynthesis (Benzoylureas)
  'novaluron': {
    code: 'IRAC 15', group: 'IRAC 15', iracGroup: '15', committee: 'IRAC',
    name: 'Inhibitors of Chitin Biosynthesis, Type 0', class: 'Insect Growth Regulator (IGR) Larvicide',
    chemicalFamily: 'Benzoylurea', systemicity: 'Contact & Ingestion (Disrupts Molting)',
    targetSite: 'Inhibition of chitin biosynthesis in cuticle synthesis (CHS1)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Cross-resistance within benzoylureas'
  },
  'lufenuron': {
    code: 'IRAC 15', group: 'IRAC 15', iracGroup: '15', committee: 'IRAC',
    name: 'Inhibitors of Chitin Biosynthesis, Type 0', class: 'Insect Growth Regulator (IGR)',
    chemicalFamily: 'Benzoylurea', systemicity: 'Contact & Ingestion',
    targetSite: 'Inhibition of chitin biosynthesis',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'High within IRAC 15'
  },

  // IRAC 22A: Voltage-dependent Sodium Channel Blockers
  'indoxacarb': {
    code: 'IRAC 22A', group: 'IRAC 22A', iracGroup: '22A', committee: 'IRAC',
    name: 'Voltage-dependent Sodium Channel Blockers', class: 'Lepidoptera Larvicide (Pro-insecticide)',
    chemicalFamily: 'Oxadiazine', systemicity: 'Contact & Ingestion Knockdown',
    targetSite: 'Blockade of sodium channels at site distinct from pyrethroids',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Zero cross-resistance with pyrethroids (IRAC 3A)'
  },

  // IRAC 23: Inhibitors of Acetyl CoA Carboxylase (Lipid Synthesis)
  'spirotetramat': {
    code: 'IRAC 23', group: 'IRAC 23', iracGroup: '23', committee: 'IRAC',
    name: 'Inhibitors of ACCase (Lipid Synthesis)', class: 'True 2-Way Fully Systemic Insecticide',
    chemicalFamily: 'Tetramic acid', systemicity: 'Full 2-Way Systemic (Ambimobile: Phloem & Xylem)',
    targetSite: 'Inhibition of acetyl CoA carboxylase in insect lipid biosynthesis',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Moderate with Spiromesifen'
  },
  'spiromesifen': {
    code: 'IRAC 23', group: 'IRAC 23', iracGroup: '23', committee: 'IRAC',
    name: 'Inhibitors of ACCase (Lipid Synthesis)', class: 'Whitefly & Miticide Specialist',
    chemicalFamily: 'Tetronic acid', systemicity: 'Translaminar & Contact Ovicidal',
    targetSite: 'Inhibition of lipid biosynthesis (ACCase)',
    resistanceRisk: 'Medium', crossResistanceRisk: 'Cross-resistance within IRAC 23'
  },

  // IRAC 28: Ryanodine Receptor Modulators (Diamides)
  'chlorantraniliprole': {
    code: 'IRAC 28', group: 'IRAC 28', iracGroup: '28', committee: 'IRAC',
    name: 'Ryanodine Receptor Modulators (Diamides)', class: 'Premier Lepidoptera & Ovi-larvicide',
    chemicalFamily: 'Anthranilic Diamide', systemicity: 'Acropetal Systemic & Translaminar',
    targetSite: 'Activation of ryanodine receptor calcium channels causing uncontrolled Ca2+ depletion',
    resistanceRisk: 'Medium to High (High threat in Plutella xylostella via RyR G4946E mutation)',
    crossResistanceRisk: 'Cross-resistance across all diamides (Cyantraniliprole, Flubendiamide)'
  },
  'cyantraniliprole': {
    code: 'IRAC 28', group: 'IRAC 28', iracGroup: '28', committee: 'IRAC',
    name: 'Ryanodine Receptor Modulators (Diamides)', class: 'Cross-spectrum (Chewing & Sucking Pests)',
    chemicalFamily: 'Anthranilic Diamide', systemicity: 'Acropetal Systemic & Translaminar',
    targetSite: 'Ryanodine receptor activation and intracellular calcium depletion',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'High across diamides'
  },
  'flubendiamide': {
    code: 'IRAC 28', group: 'IRAC 28', iracGroup: '28', committee: 'IRAC',
    name: 'Ryanodine Receptor Modulators (Diamides)', class: 'Lepidoptera Larvicide',
    chemicalFamily: 'Phthalamide Diamide', systemicity: 'Contact & Ingestion Translaminar',
    targetSite: 'Ryanodine receptor calcium release channel activation',
    resistanceRisk: 'Medium to High', crossResistanceRisk: 'High with Anthranilic diamides'
  },

  // IRAC 29: Chordotonal Organ Modulators
  'flonicamid': {
    code: 'IRAC 29', group: 'IRAC 29', iracGroup: '29', committee: 'IRAC',
    name: 'Chordotonal Organ Modulators', class: 'Anti-feedant Aphid & Whitefly Specialist',
    chemicalFamily: 'Pyridinecarboxamide', systemicity: 'Acropetal Systemic & Translaminar',
    targetSite: 'Modulation of chordotonal stretch receptor organs (cessation of feeding within hours)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Zero cross-resistance with Neonicotinoids'
  },

  // IRAC UNE / Botanical / Biologicals
  'azadirachtin': {
    code: 'IRAC UNE', group: 'IRAC Bio', iracGroup: 'Bio', committee: 'IRAC',
    name: 'Botanical Ecdysone & Anti-feedant Disruptor', class: 'Bio-Rational Neem Extract',
    chemicalFamily: 'Limonoid Triterpenoid', systemicity: 'Translaminar & Contact Anti-feedant',
    targetSite: 'Ecdysone receptor antagonism, molting inhibition & sensory anti-feedant',
    resistanceRisk: 'Negligible (Complex botanical multi-site action)',
    crossResistanceRisk: 'Zero'
  },
  'neem': {
    code: 'IRAC UNE', group: 'IRAC Bio', iracGroup: 'Bio', committee: 'IRAC',
    name: 'Botanical Multi-Action Insecticide', class: 'Bio-Rational Plant Extract',
    chemicalFamily: 'Botanical Limonoid Complex', systemicity: 'Contact & Translaminar',
    targetSite: 'Anti-feedant, growth regulation and ovicidal coating',
    resistanceRisk: 'Negligible', crossResistanceRisk: 'Zero'
  },
  'bacillus': {
    code: 'IRAC 11A', group: 'IRAC 11A', iracGroup: '11A', committee: 'IRAC',
    name: 'Microbial Disruptors of Midgut Membranes', class: 'Bio-Insecticide (Bt Cry toxins)',
    chemicalFamily: 'Bacillus thuringiensis protein endotoxins', systemicity: 'Stomach Ingestion Only',
    targetSite: 'Cry/Vip toxin binding to cadherin receptors inducing midgut membrane pore formation',
    resistanceRisk: 'Medium (Receptor mutation / down-regulation in target pests)',
    crossResistanceRisk: 'Specific to Cry/Vip protein subtypes',
    isOrganic: true
  }
};

// ============================================================================
// 4. ORGANIC PRODUCTS, BIO-PESTICIDES, BIO-FUNGICIDES & BIO-STIMULANTS
// ============================================================================
// Comprehensive registry for products that do not fall under conventional single-site
// synthetic chemistry. Grounded in official FRAC BM (Biologicals), FRAC P (Host Defence),
// IRAC UNE (Botanicals), IRAC UNF (Entomopathogenic Fungi), IRAC UNM (Mechanical/Physical),
// HRAC 0 (Bio-Desiccants), and international organic standards (OMRI, NPOP, USDA-NOP).
export const ORGANIC_BIO_DATABASE = {
  // ── A. BIO-FUNGICIDES & MICROBIAL ANTAGONISTS (FRAC BM & P) ──
  'trichoderma': {
    code: 'FRAC BM02', group: 'FRAC BM', fracGroup: 'BM', committee: 'FRAC (Bio)',
    name: 'Microbial Antagonist & Mycoparasite', class: 'Bio-Fungicide (Beneficial Fungi)',
    chemicalFamily: 'Trichoderma viride / harzianum spores', systemicity: 'Protective Rhizosphere & Phyllosphere Colonizer',
    targetSite: 'Multi-site: Mycoparasitism (chitinase/glucanase enzymatic lysis) + competitive rhizosphere exclusion + Induced Systemic Resistance (ISR)',
    resistanceRisk: 'None / Negligible (Complex living biological multi-action)',
    crossResistanceRisk: 'Zero risk of cross-resistance with synthetic fungicides',
    isOrganic: true, organicStandard: 'OMRI / NPOP / USDA-NOP Eligible'
  },
  'subtilis': {
    code: 'FRAC BM02', group: 'FRAC BM', fracGroup: 'BM', committee: 'FRAC (Bio)',
    name: 'Bacterial Lipopeptide Membrane Disruptor', class: 'Bio-Fungicide & Bactericide',
    chemicalFamily: 'Bacillus subtilis / amyloliquefaciens ferment', systemicity: 'Protective Foliar & Root Colonizer',
    targetSite: 'Multi-site: Secretion of cyclic lipopeptides (surfactin, iturin, fengycin) disrupting pathogen cell membranes + Systemic Acquired Resistance (SAR)',
    resistanceRisk: 'None / Negligible', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP / USDA-NOP Eligible'
  },
  'pseudomonas': {
    code: 'FRAC BM02', group: 'FRAC BM', fracGroup: 'BM', committee: 'FRAC (Bio)',
    name: 'Rhizosphere Siderophore & Antibiotic Producer', class: 'Bio-Fungicide & Bio-Control Agent',
    chemicalFamily: 'Pseudomonas fluorescens / putida', systemicity: 'Root & Vascular Shield',
    targetSite: 'Multi-site: Iron chelation via pyoverdine siderophores, 2,4-DAPG antibiotic secretion & plant ISR triggering',
    resistanceRisk: 'None / Negligible', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP / USDA-NOP Eligible'
  },
  'ampelomyces': {
    code: 'FRAC BM02', group: 'FRAC BM', fracGroup: 'BM', committee: 'FRAC (Bio)',
    name: 'Hyperparasitic Fungal Antagonist', class: 'Bio-Fungicide (Powdery Mildew Specialist)',
    chemicalFamily: 'Ampelomyces quisqualis', systemicity: 'Contact Hyperparasite',
    targetSite: 'Direct intracellular penetration and destruction of powdery mildew conidiophores',
    resistanceRisk: 'None', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP'
  },
  'reynoutria': {
    code: 'FRAC P05', group: 'FRAC P', fracGroup: 'P', committee: 'FRAC (Bio)',
    name: 'Host Plant Defense Inducer (Giant Knotweed)', class: 'Bio-Fungicide Plant Extract',
    chemicalFamily: 'Reynoutria sachalinensis extract (Regalia)', systemicity: 'Systemic Acquired Resistance (SAR)',
    targetSite: 'Stimulates plant phytoalexin synthesis, PR proteins, and lignin cell wall reinforcement',
    resistanceRisk: 'None / Negligible (Acts via host defense)', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / USDA-NOP'
  },
  'tea tree': {
    code: 'FRAC BM01', group: 'FRAC BM', fracGroup: 'BM', committee: 'FRAC (Bio)',
    name: 'Botanical Terpene Membrane Disruptor', class: 'Bio-Fungicide (Essential Oil)',
    chemicalFamily: 'Melaleuca alternifolia extract (Tea Tree Oil)', systemicity: 'Contact Membrane Stripper & Translaminar',
    targetSite: 'Disruption of fungal cell membrane integrity and mitochondrial organelle leakage',
    resistanceRisk: 'None / Negligible', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI Eligible'
  },
  'chitosan': {
    code: 'FRAC P06', group: 'FRAC P', fracGroup: 'P', committee: 'FRAC (Bio)',
    name: 'Natural Polysaccharide Elicitor', class: 'Bio-Fungicide & Virucide (Crustacean/Fungal Chitin)',
    chemicalFamily: 'Deacetylated poly-D-glucosamine', systemicity: 'Systemic Plant Defense Elicitor',
    targetSite: 'Binding to plant plasma membrane receptors inducing callose deposition & phytoalexins + direct fungal membrane charge disruption',
    resistanceRisk: 'None', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP'
  },
  'phosphite': {
    code: 'FRAC P07', group: 'FRAC P', fracGroup: 'P', committee: 'FRAC (Bio)',
    name: 'Host Defense Elicitor & Oomycete Inhibitor', class: 'Inorganic Bio-Rational Protectant',
    chemicalFamily: 'Potassium / Sodium Phosphite (Phosphonates)', systemicity: 'Full 2-Way Ambimobile Systemic (Xylem & Phloem)',
    targetSite: 'Direct suppression of oomycete oxidative phosphorylation + triggers host hypersensitive response (SAR)',
    resistanceRisk: 'Low to Medium', crossResistanceRisk: 'Low',
    isOrganic: true, organicStandard: 'Bio-Rational Input'
  },

  // ── B. BIO-INSECTICIDES, BOTANICALS & ENTOMOPATHOGENS (IRAC UNE, UNF, UNM) ──
  'beauveria': {
    code: 'IRAC UNF', group: 'IRAC UNF', iracGroup: 'UNF', committee: 'IRAC (Bio)',
    name: 'Entomopathogenic Fungal Parasite', class: 'Bio-Insecticide (White Muscardine)',
    chemicalFamily: 'Beauveria bassiana fungal blastospores', systemicity: 'Contact Cuticle Penetration (Parasitic Mycosis)',
    targetSite: 'Spore adhesion, germination, enzymatic cuticle breakdown (Pr1 proteases & chitinases) leading to internal hemolymph proliferation and fatal mycosis',
    resistanceRisk: 'None / Negligible (Multi-enzymatic mechanical digestion)',
    crossResistanceRisk: 'Zero cross-resistance with neurotoxic insecticides',
    isOrganic: true, organicStandard: 'OMRI / NPOP / USDA-NOP Eligible'
  },
  'metarhizium': {
    code: 'IRAC UNF', group: 'IRAC UNF', iracGroup: 'UNF', committee: 'IRAC (Bio)',
    name: 'Entomopathogenic Green Muscardine Fungi', class: 'Bio-Insecticide (Soil & Foliar Grubs/Locusts)',
    chemicalFamily: 'Metarhizium anisopliae conidiospores', systemicity: 'Contact Cuticle Infiltration',
    targetSite: 'Enzymatic cuticle penetration followed by destruxin cyclic peptide secretion inducing insect paralysis and death',
    resistanceRisk: 'None / Negligible', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Eligible'
  },
  'verticillium': {
    code: 'IRAC UNF', group: 'IRAC UNF', iracGroup: 'UNF', committee: 'IRAC (Bio)',
    name: 'Entomopathogenic Sucking Pest Parasite', class: 'Bio-Insecticide (Whitefly, Thrips & Aphid Specialist)',
    chemicalFamily: 'Lecanicillium (Verticillium) lecanii', systemicity: 'Contact Cuticular Mycosis',
    targetSite: 'Conidial cuticle penetration and bassianolide/dipicolinic acid toxin release',
    resistanceRisk: 'None / Negligible', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Eligible'
  },
  'karanja': {
    code: 'IRAC UNE', group: 'IRAC UNE', iracGroup: 'UNE', committee: 'IRAC (Bio)',
    name: 'Botanical Furanoflavonoid Antifeedant', class: 'Bio-Pesticide (Pongamia Oil Extract)',
    chemicalFamily: 'Karanjin / Pongamol Botanical Complex', systemicity: 'Contact, Translaminar & Antifeedant',
    targetSite: 'Gut disruption, oviposition deterrence, ecdysone inhibition and spray synergy',
    resistanceRisk: 'Negligible', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Eligible'
  },
  'pyrethrum': {
    code: 'IRAC 3A (Bio)', group: 'IRAC 3A', iracGroup: '3A', committee: 'IRAC (Bio)',
    name: 'Natural Botanical Pyrethrins', class: 'Organic Contact Knockdown Insecticide',
    chemicalFamily: 'Chrysanthemum cinerariifolium botanical extract', systemicity: 'Fast Contact Knockdown (Axonal Excitation)',
    targetSite: 'Modulates voltage-gated sodium channels causing repetitive discharge; natural esters degrade rapidly in sunlight without environmental residues',
    resistanceRisk: 'Low to Medium (Rapidly photodegraded in field)',
    crossResistanceRisk: 'Target-site kdr can affect pyrethrins',
    isOrganic: true, organicStandard: 'OMRI / NPOP / USDA-NOP Certified Organic'
  },
  'diatomaceous': {
    code: 'IRAC UNM', group: 'IRAC UNM', iracGroup: 'UNM', committee: 'IRAC (Bio)',
    name: 'Mechanical Cuticle Desiccant', class: 'Physical / Mineral Bio-Insecticide',
    chemicalFamily: 'Amorphous Silica (Fossilized Freshwater Diatoms)', systemicity: 'Non-chemical Physical Barrier',
    targetSite: 'Microscopic razor-sharp silica particles absorb epicuticular hydrocarbon waxes, causing rapid, fatal insect desiccation and dehydration',
    resistanceRisk: 'Zero (Physical Mode of Action cannot trigger biological resistance)',
    crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified 100% Organic'
  },
  'kaolin': {
    code: 'IRAC UNM', group: 'IRAC UNM', iracGroup: 'UNM', committee: 'IRAC (Bio)',
    name: 'Reflective Mineral Particle Barrier', class: 'Physical Protectant & Sunscreen (Surround)',
    chemicalFamily: 'Processed Aluminosilicate Mineral Clay', systemicity: 'Foliar Surface Particle Film',
    targetSite: 'Creates tactile and visual repellent barrier preventing insect landing, tactile feeding, and oviposition while reflecting excess UV/heat',
    resistanceRisk: 'Zero (Physical / Behavioral Deterrence)', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / USDA-NOP Certified'
  },
  'soap': {
    code: 'IRAC UNM', group: 'IRAC UNM', iracGroup: 'UNM', committee: 'IRAC (Bio)',
    name: 'Potassium Salts of Fatty Acids', class: 'Contact Insecticidal Soap',
    chemicalFamily: 'Potassium Salt of Coconut / Palm Fatty Acids', systemicity: 'Contact Membrane Disruptor',
    targetSite: 'Dissolves outer lipophilic insect cuticular waxes and disrupts cellular osmotic membrane integrity',
    resistanceRisk: 'None / Negligible (Physical membrane lysis)', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / USDA-NOP Eligible'
  },
  'garlic': {
    code: 'IRAC UNE', group: 'IRAC UNE', iracGroup: 'UNE', committee: 'IRAC (Bio)',
    name: 'Botanical Allicin Sensory Repellent', class: 'Bio-Rational Repellent & Nematicide',
    chemicalFamily: 'Diallyl polysulfides / Allicin (Allium sativum extract)', systemicity: 'Contact Repellent & Systemic Root Uptake',
    targetSite: 'Sensory olfactory masking, feeding deterrence, and inhibition of sulfhydryl enzymes in nematode gut',
    resistanceRisk: 'Zero', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Eligible'
  },
  'npv': {
    code: 'IRAC Bio-Virus', group: 'IRAC Bio', iracGroup: 'Bio', committee: 'IRAC (Bio)',
    name: 'Nucleopolyhedrovirus Larval Bio-Control', class: 'Viral Bio-Insecticide (HaNPV / SlNPV)',
    chemicalFamily: 'Baculoviridae (Polyhedral Occlusion Bodies)', systemicity: 'Ingestion Only (Midgut Alkaline Dissolution)',
    targetSite: 'Alkaline dissolution of occlusion bodies in larval midgut, virion fusion with midgut microvilli, massive tissue lysis and "caterpillar wilt"',
    resistanceRisk: 'Low (Strictly host-specific virus)', crossResistanceRisk: 'Zero with chemicals',
    isOrganic: true, organicStandard: 'OMRI / NPOP Eligible'
  },

  // ── C. BIO-HERBICIDES & BOTANICAL BURNDOWNS (HRAC 0) ──
  'clove': {
    code: 'HRAC 0', group: 'HRAC 0', hracGroup: '0', wssa: 'Bio-Burndown', committee: 'HRAC (Bio)',
    name: 'Essential Oil Membrane Stripper', class: 'Bio-Herbicide Contact Desiccant',
    chemicalFamily: 'Eugenol (Syzygium aromaticum extract)', systemicity: 'Fast Non-systemic Contact Burn',
    targetSite: 'Rapid dissolution of plant cuticular lipids and electrolyte leakage within 2-4 hours',
    resistanceRisk: 'Zero (Physical membrane stripping)', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Approved'
  },
  'corn gluten': {
    code: 'HRAC 0', group: 'HRAC 0', hracGroup: '0', wssa: 'Bio-Pre-emergence', committee: 'HRAC (Bio)',
    name: 'Natural Pre-emergence Dipeptide Inhibitor', class: 'Organic Pre-emergence Weed Suppressor',
    chemicalFamily: 'Zea mays corn protein hydrolysate', systemicity: 'Soil Applied Seedling Barrier',
    targetSite: 'Active dipeptides (Ala-Gln, Pro-Ala) inhibit root development in newly germinating weed seedlings',
    resistanceRisk: 'Zero', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },

  // ── D. BIO-STIMULANTS, PLANT GROWTH PROMOTERS & INOCULANTS ──
  'seaweed': {
    code: 'BIO-STIM', group: 'BIO-STIM', committee: 'Bio-Stimulant',
    name: 'Marine Algal Bio-Stimulant & Stress Adaptogen', class: 'Organic Plant Growth Promoter & Tonic',
    chemicalFamily: 'Ascophyllum nodosum / Kappaphycus alvarezii extract', systemicity: 'Systemic Metabolic Enhancer (Foliar & Root)',
    targetSite: 'Abiotic stress alleviation: delivers natural auxins, cytokinins, betaines and stimulates endogenous SOD/catalase antioxidant enzymes',
    resistanceRisk: 'Not Applicable (Plant Nutritional & Metabolic Stimulant)',
    crossResistanceRisk: 'Zero (Universal crop safety & synergistic tank-mix compatibility)',
    isOrganic: true, organicStandard: 'OMRI / NPOP / USDA-NOP Certified Organic'
  },
  'kelp': {
    code: 'BIO-STIM', group: 'BIO-STIM', committee: 'Bio-Stimulant',
    name: 'Cold-water Kelp Extract', class: 'Organic Root Stimulator & Bio-Catalyst',
    chemicalFamily: 'Laminaria / Ascophyllum extract', systemicity: 'Foliar & Root Systemic',
    targetSite: 'Stimulates root elongation, lateral root initiation, and chlorophyll retention (anti-senescence)',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI Certified'
  },
  'humic': {
    code: 'BIO-STIM', group: 'BIO-STIM', committee: 'Bio-Stimulant',
    name: 'Soil Conditioner & Cation Exchanger', class: 'Organic Soil Health & Root Activator',
    chemicalFamily: 'Polymeric Hydroxy-carboxylic Acid (Leonardite humates)', systemicity: 'Soil CEC Enhancer & Root Uptake Aid',
    targetSite: 'Increases soil Cation Exchange Capacity (CEC), complexes insoluble nutrients (P, Fe, Zn), and stimulates root cell membrane ATPase activity',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'fulvic': {
    code: 'BIO-STIM', group: 'BIO-STIM', committee: 'Bio-Stimulant',
    name: 'Low Molecular Weight Cellular Carrier', class: 'Organic Foliar Penetrant & Nutrient Translocator',
    chemicalFamily: 'Fulvic Acid Fraction (Highly oxygenated polyphenol)', systemicity: 'Foliar & Cellular Translocation Facilitator',
    targetSite: 'Acts as a natural chelator that penetrates cellular membranes, accelerating micronutrient and agrochemical foliar absorption',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'amino acid': {
    code: 'BIO-STIM', group: 'BIO-STIM', committee: 'Bio-Stimulant',
    name: 'Enzymatic Protein Hydrolysate Complex', class: 'Stress Recovery & Organic Nitrogen Builder',
    chemicalFamily: 'Free L-Alpha Amino Acids & Short Peptides', systemicity: 'Direct Foliar Cellular Absorption',
    targetSite: 'Provides pre-formed protein building blocks, saving plant metabolic energy during drought, heat, and herbicide shock',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'mycorrhiza': {
    code: 'BIO-INOC', group: 'BIO-INOC', committee: 'Bio-Inoculant',
    name: 'Symbiotic Endomycorrhizal Root Fungi', class: 'Bio-Fertilizer / Inoculant (VAM)',
    chemicalFamily: 'Glomus intraradices / mosseae fungal propagules', systemicity: 'Symbiotic Root Colonization',
    targetSite: 'Fungal hyphae expand plant root surface area by up to 1000%, mobilizing insoluble phosphorus, zinc and moisture under drought stress',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'vam': {
    code: 'BIO-INOC', group: 'BIO-INOC', committee: 'Bio-Inoculant',
    name: 'Vesicular Arbuscular Mycorrhizae', class: 'Bio-Inoculant & Soil Health Builder',
    chemicalFamily: 'Endomycorrhizal fungal spores', systemicity: 'Symbiotic Root Inoculant',
    targetSite: 'Facilitates phosphorus uptake and enhances root tolerance to soil pathogens',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'azotobacter': {
    code: 'BIO-INOC', group: 'BIO-INOC', committee: 'Bio-Inoculant',
    name: 'Free-Living Biological Nitrogen Fixer', class: 'Bio-Fertilizer (Bacterial Inoculant)',
    chemicalFamily: 'Azotobacter chroococcum bacteria', systemicity: 'Rhizosphere Soil Colonizer',
    targetSite: 'Fixes atmospheric nitrogen (N2) into plant-available ammonium (NH4+) and synthesizes plant growth auxins',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'rhizobium': {
    code: 'BIO-INOC', group: 'BIO-INOC', committee: 'Bio-Inoculant',
    name: 'Legume Symbiotic Nitrogen Fixer', class: 'Bio-Fertilizer (Root Nodule Symbiont)',
    chemicalFamily: 'Rhizobium leguminosarum / japonicum', systemicity: 'Root Nodule Symbiosis',
    targetSite: 'Biological nitrogen fixation within root nodules via bacterial nitrogenase enzyme complex',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  },
  'phosphobacteria': {
    code: 'BIO-INOC', group: 'BIO-INOC', committee: 'Bio-Inoculant',
    name: 'Phosphate Solubilizing Bacteria (PSB)', class: 'Bio-Fertilizer / Soil Inoculant',
    chemicalFamily: 'Bacillus megaterium / Pseudomonas striata', systemicity: 'Rhizosphere Soil Colonizer',
    targetSite: 'Produces organic acids (gluconic, citric) that solubilize fixed tricalcium and iron phosphates in soil',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Zero',
    isOrganic: true, organicStandard: 'OMRI / NPOP Certified'
  }
};

// ============================================================================
// 5. ADJUVANTS, SURFACTANTS & SYNERGISTS
// ============================================================================
export const ADJUVANT_DATABASE = {
  'surfactant': {
    code: 'Adjuvant', group: 'Adjuvant', hracGroup: 'Adj', fracGroup: 'Adj', iracGroup: 'Adj', committee: 'Adjuvant',
    name: 'Non-Ionic Surfactant (NIS)', class: 'Surface Tension Reducer & Wetting Agent',
    chemicalFamily: 'Alkoxylate / Ethoxylated Alcohol', systemicity: 'Foliar Wetting Agent',
    targetSite: 'Lowers dynamic surface tension and prevents droplet bounce/run-off',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Universal compatibility'
  },
  'organosilicone': {
    code: 'Adjuvant', group: 'Adjuvant', hracGroup: 'Adj', fracGroup: 'Adj', iracGroup: 'Adj', committee: 'Adjuvant',
    name: 'Organosilicone Super-Spreader', class: 'Stomatal Infiltration Facilitator',
    chemicalFamily: 'Polyether Polymethylsiloxane', systemicity: 'Stomatal Flooding Aid',
    targetSite: 'Dramatically reduces surface tension (<22 mN/m) allowing direct stomatal uptake',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Universal'
  },
  'penetrant': {
    code: 'Adjuvant', group: 'Adjuvant', hracGroup: 'Adj', fracGroup: 'Adj', iracGroup: 'Adj', committee: 'Adjuvant',
    name: 'Bio-Penetrant & Translocation Catalyst', class: 'Cuticle Wax Dissolver',
    chemicalFamily: 'Esterified Vegetable Seed Oil (MSO / COC)', systemicity: 'Cuticular Wax Solubilizer',
    targetSite: 'Plasticizes and dissolves epicuticular wax crystals for rapid systemic uptake',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Universal'
  },
  'microweed': {
    code: 'Adjuvant', group: 'Adjuvant', hracGroup: 'Adj', fracGroup: 'Adj', iracGroup: 'Adj', committee: 'Adjuvant',
    name: 'Bio-Rational Penetrant & Synergist', class: 'Synergy Catalyst & Desiccant Partner',
    chemicalFamily: 'Proprietary Bio-adjuvant Complex', systemicity: 'Active Translocation Enhancer',
    targetSite: 'Accelerates foliar cuticle penetration and prevents spray drift bounce',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Universal'
  },
  'ammonium': {
    code: 'Conditioner', group: 'Conditioner', hracGroup: 'Adj', fracGroup: 'Adj', iracGroup: 'Adj', committee: 'Adjuvant',
    name: 'Water Conditioner & Antagonism Blocker (AMS)', class: 'Hard Water Ion Chelator',
    chemicalFamily: 'Inorganic Salt (Ammonium Sulfate)', systemicity: 'Tank-mix Water Conditioning',
    targetSite: 'Sequester hard water cations (Ca2+, Mg2+, Fe3+) to prevent herbicide inactivation',
    resistanceRisk: 'Not Applicable', crossResistanceRisk: 'Universal'
  }
};

// ============================================================================
// 5. NORMALIZATION AND CLEANING HELPERS
// ============================================================================

/**
 * Strips chemical formulation percentages, salt suffixes, and dosage labels.
 * E.g., "Glyphosate 41% SL", "2,4-D Ethyl Ester 38% EC", "Clethodim 240 EC"
 */
export function normalizeChemicalName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .toLowerCase()
    // Remove formulation codes like 41% SL, 240 EC, 10% WP, 50 SC, etc.
    .replace(/\b\d+(\.\d+)?\s*(%|ec|sl|sc|wg|wp|sg|cs|me|ew|fs|sp|w\/w|w\/v|g\/l|kg\/ha)\b/gi, '')
    // Remove salt and ester derivatives
    .replace(/\b(potassium|sodium|isopropylamine|dimethylammonium|ammonium|choline|ester|ethyl|methyl|butyl|isooctyl|salt|technical|tech)\b/gi, '')
    // Remove punctuation except hyphens/commas inside names like 2,4-d
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Authoritative Mode of Action Identifier.
 * Auto-detects across HRAC (Herbicides), FRAC (Fungicides), and IRAC (Pesticides/Insecticides).
 * 
 * @param {string} activeName - Name of the chemical active or commercial brand
 * @param {string} category - 'herbicide' | 'fungicide' | 'pesticide' | 'insecticide'
 * @returns {Object|null} Verified MoA profile or null
 */
export function identifyMoA(activeName, category = 'herbicide') {
  if (!activeName || typeof activeName !== 'string') return null;
  const rawClean = activeName.toLowerCase().trim();
  const normalized = normalizeChemicalName(rawClean);

  // Normalize category string
  const cat = (category || 'herbicide').toLowerCase();
  const isHerbicide = cat === 'herbicide';
  const isFungicide = cat === 'fungicide';
  const isInsecticide = cat === 'pesticide' || cat === 'insecticide';

  // 1. Check Adjuvants first (common to all categories)
  for (const [key, data] of Object.entries(ADJUVANT_DATABASE)) {
    if (rawClean.includes(key) || normalized.includes(key) || key.includes(normalized)) {
      return { active: key, ...data };
    }
  }

  // 2. Check Organic / Bio-Rational Database
  for (const [key, data] of Object.entries(ORGANIC_BIO_DATABASE)) {
    if (rawClean.includes(key) || normalized.includes(key) || key.includes(normalized)) {
      return { active: key, ...data };
    }
  }

  // 3. Select prioritized category database
  const targetDb = isFungicide
    ? FRAC_DATABASE
    : isInsecticide
    ? IRAC_DATABASE
    : HRAC_DATABASE;

  // Search in priority database
  for (const [key, data] of Object.entries(targetDb)) {
    if (rawClean.includes(key) || normalized.includes(key) || key.includes(normalized)) {
      return { active: key, ...data };
    }
  }

  // 4. Cross-committee fallback: check remaining databases if not found in primary
  const otherDbs = [
    { cat: 'HRAC', db: HRAC_DATABASE },
    { cat: 'FRAC', db: FRAC_DATABASE },
    { cat: 'IRAC', db: IRAC_DATABASE }
  ].filter(item => {
    if (isFungicide && item.cat === 'FRAC') return false;
    if (isInsecticide && item.cat === 'IRAC') return false;
    if (isHerbicide && item.cat === 'HRAC') return false;
    return true;
  });

  for (const { db } of otherDbs) {
    for (const [key, data] of Object.entries(db)) {
      if (rawClean.includes(key) || normalized.includes(key) || key.includes(normalized)) {
        return { active: key, ...data };
      }
    }
  }

  return null;
}

/**
 * Backward compatible alias for existing herbicide calls.
 */
export function identifyHrac(activeName) {
  return identifyMoA(activeName, 'herbicide');
}

/**
 * Committee-aware Formulation Synergy & Multi-Site Resistance Analysis.
 * Seamlessly adapts across HRAC, FRAC, and IRAC committees!
 * 
 * @param {Array<Object>} ingredients - Array of ingredient objects { name, quantity, unit }
 * @param {string} category - 'herbicide' | 'fungicide' | 'pesticide' | 'insecticide'
 * @returns {Object} Comprehensive synergy, MoA diversity, and resistance management analysis
 */
export function analyzeFormulationMoASynergy(ingredients = [], category = 'herbicide') {
  const committee = category === 'fungicide'
    ? 'FRAC'
    : (category === 'pesticide' || category === 'insecticide')
    ? 'IRAC'
    : 'HRAC';

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return {
      committee,
      uniqueGroups: [],
      hracGroups: [],
      uniqueHracGroups: [],
      detectedMoas: [],
      activeIngredients: [],
      multiSiteScore: 'Single / Unknown',
      moaSummary: 'No active ingredients recorded.',
      hasAntagonism: false,
      antagonismAlerts: [],
      antagonismWarnings: [],
      synergies: [],
      adjuvantTips: [],
      adjuvantRecommendations: [],
      isMultiMoa: false,
      badgeLabel: 'Single MOA'
    };
  }

  const detectedMoas = [];
  const activeNames = [];

  const activeIngredients = ingredients.map(ing => {
    const rawName = (ing.name || ing.Name || '').trim();
    const moa = identifyMoA(rawName, category);

    if (rawName) {
      activeNames.push(rawName.toLowerCase());
      if (moa && !detectedMoas.some(m => m.code === moa.code)) {
        detectedMoas.push(moa);
      }
    }

    return {
      name: rawName,
      quantity: ing.quantity ?? ing.qty ?? '',
      unit: ing.unit || 'ml',
      moaCode: moa?.code || 'Unknown',
      hracGroup: moa?.hracGroup || moa?.fracGroup || moa?.iracGroup || 'Unknown',
      committee: moa?.committee || committee,
      chemicalFamily: moa?.chemicalFamily || 'Organic Compound',
      systemicity: moa?.systemicity || 'Contact / Systemic',
      targetSite: moa?.targetSite || moa?.name || `${committee} Active Ingredient`,
      resistanceRisk: moa?.resistanceRisk || 'Unknown'
    };
  });

  // Extract non-adjuvant active groups
  const activeOnlyMoas = detectedMoas.filter(m => m.committee !== 'Adjuvant');
  const uniqueGroups = activeOnlyMoas.map(m => m.code.replace(/^(HRAC|FRAC|IRAC)\s*/, ''));
  const isMultiMoa = uniqueGroups.length > 1;

  // Multi-Site Resistance Management Score
  let multiSiteScore = 'Single MOA';
  if (uniqueGroups.length >= 3) {
    multiSiteScore = `Triple MOA (Optimal ${committee} Anti-Resistance)`;
  } else if (uniqueGroups.length === 2) {
    multiSiteScore = `Dual MOA (Multi-Site Anti-Resistance)`;
  }

  // Generate clean badge label (e.g. "FRAC 11+3", "IRAC 28+4A", "HRAC 9+14")
  const badgeLabel = uniqueGroups.length > 0
    ? `${committee} ${uniqueGroups.join('+')}`
    : 'Single MOA';

  const antagonismAlerts = [];
  const synergies = [];
  const adjuvantTips = [];

  // Antagonism & Synergy heuristics
  const hasGlyphosate = activeNames.some(n => n.includes('glyphosate') || n.includes('glycyl'));
  const hasContactDesiccant = activeNames.some(n => n.includes('paraquat') || n.includes('diquat') || n.includes('pelargonic') || n.includes('carfentrazone'));
  const hasAccase = detectedMoas.some(m => m.hracGroup === '1');
  const hasAuxin = detectedMoas.some(m => m.hracGroup === '4');
  const hasAls = detectedMoas.some(m => m.hracGroup === '2');
  const hasTriazole = detectedMoas.some(m => m.code === 'FRAC 3');
  const hasStrobilurin = detectedMoas.some(m => m.code === 'FRAC 11');
  const hasMultisiteMancozeb = activeNames.some(n => n.includes('mancozeb') || n.includes('chlorothalonil') || n.includes('copper'));
  const hasDiamide = detectedMoas.some(m => m.code === 'IRAC 28');
  const hasNeonic = detectedMoas.some(m => m.code === 'IRAC 4A');

  // Herbicides Rules
  if (hasGlyphosate && hasContactDesiccant) {
    antagonismAlerts.push({
      type: 'Antagonism Warning',
      severity: 'High',
      title: 'Translocation Inhibition (Burnout Shock)',
      description: 'Rapid contact membrane disruption damages vascular phloem bundles before glyphosate can achieve systemic translocation to rhizomes.'
    });
  }
  if (hasAccase && (hasAuxin || hasAls)) {
    antagonismAlerts.push({
      type: 'Antagonism Warning',
      severity: 'Medium',
      title: 'Graminicide Efficacy Reduction',
      description: 'Synthetic auxins (Group 4) or ALS inhibitors (Group 2) can depress ACCase grass control. Consider increasing graminicide rate by 15-20%.'
    });
  }

  // Fungicide Rules
  if (hasTriazole && hasStrobilurin) {
    synergies.push({
      type: 'Curative + Preventive Synergy',
      title: 'FRAC 11 (QoI) + FRAC 3 (DMI) Dual-Site Synergy',
      benefit: 'Combines rapid stomatal prevention (Strobilurin) with deep vascular curative action (Triazole) while protecting against single-site G143A resistance.'
    });
  }
  if ((hasTriazole || hasStrobilurin) && hasMultisiteMancozeb) {
    synergies.push({
      type: 'Anti-Resistance Pillar',
      title: 'Multi-Site Contact Shield (FRAC M03/M05)',
      benefit: 'Multi-site contact protectant prevents resistance development against high-risk single-site systemic fungicides.'
    });
  }

  // Insecticide Rules
  if (hasDiamide && hasNeonic) {
    synergies.push({
      type: 'Dual Feeding Mode Synergy',
      title: 'IRAC 28 (Diamide) + IRAC 4A (Neonicotinoid) Broad-Spectrum Synergy',
      benefit: 'Simultaneously controls chewing caterpillars (ryanodine receptors) and sap-feeding sucking pests (nicotinic receptors).'
    });
  }

  // Adjuvant recommendations
  const hasAdjuvant = detectedMoas.some(m => m.committee === 'Adjuvant');
  if (!hasAdjuvant) {
    adjuvantTips.push({
      type: 'Adjuvant Recommendation',
      title: 'Add Organosilicone or NIS Penetrant',
      tip: 'Adding a non-ionic surfactant or organosilicone super-spreader reduces surface tension and improves foliar canopy penetration.'
    });
  }

  // Organic & Bio-Rational Classification
  const organicMoas = detectedMoas.filter(m => m.isOrganic || (m.committee && m.committee.includes('(Bio)')));
  const hasOrganicName = activeNames.some(n => 
    n.includes('organic') || n.includes('bio-') || n.includes('neem') || 
    n.includes('trichoderma') || n.includes('subtilis') || n.includes('bacillus') || 
    n.includes('beauveria') || n.includes('spinosad') || n.includes('pyrethrin') ||
    n.includes('seaweed') || n.includes('mycorrhiz') || n.includes('pseudomonas')
  );
  const isOrganicBio = organicMoas.length > 0 || hasOrganicName;
  const allOrganic = (detectedMoas.length > 0 && detectedMoas.every(m => m.isOrganic || (m.committee && m.committee.includes('(Bio)')))) ||
    (activeNames.length > 0 && activeNames.every(n => n.includes('organic') || n.includes('bio-') || n.includes('neem')));
  const organicStandard = organicMoas[0]?.organicStandard || (isOrganicBio ? 'OMRI / NPOP / USDA-NOP Eligible' : null);

  const moaSummary = uniqueGroups.length > 0
    ? `${committee} Mode of Action Diversity: Group(s) ${uniqueGroups.join(', ')} (${multiSiteScore})`
    : (isOrganicBio ? `Bio-Rational Input (${organicStandard || 'OMRI Eligible'})` : 'No verified active committee group identified.');

  return {
    committee,
    uniqueGroups,
    hracGroups: uniqueGroups.map(g => `${committee} ${g}`),
    uniqueHracGroups: uniqueGroups,
    detectedMoas,
    activeIngredients,
    multiSiteScore,
    moaSummary,
    hasAntagonism: antagonismAlerts.length > 0,
    antagonismAlerts,
    antagonismWarnings: antagonismAlerts,
    synergies,
    adjuvantTips,
    adjuvantRecommendations: adjuvantTips,
    isMultiMoa,
    badgeLabel,
    isOrganicBio,
    allOrganic,
    organicStandard,
    organicMoas
  };
}
