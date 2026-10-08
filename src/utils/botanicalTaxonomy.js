/**
 * botanicalTaxonomy.js
 *
 * Comprehensive botanical taxonomy dictionary and classification utility.
 * Maps common and scientific weed species names to their botanical family,
 * common name, scientific name, and growth habit.
 * Company Standard: Miklens Bio R&D Centre
 */

export const BOTANICAL_WEED_REGISTRY = [
  // Tropical & Plantation Weeds (e.g., Tea, Coffee, Pineapple, Orchard systems)
  {
    scientificName: 'Commelina diffusa',
    commonName: 'Tropical wandering Jew / Dayflower',
    botanicalFamily: 'Commelinaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Mikania micrantha',
    commonName: 'Mile-a-minute weed / Climbing hempvine',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Climber'
  },
  {
    scientificName: 'Asystasia gangetica',
    commonName: 'Chinese violet / Creeping foxglove',
    botanicalFamily: 'Acanthaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Chromolaena odorata',
    commonName: 'Siam weed / Christmas bush',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Shrub'
  },
  {
    scientificName: 'Cleome rutidosperma',
    commonName: 'Fringed spider flower',
    botanicalFamily: 'Cleomaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Merremia umbellata',
    commonName: 'Yellow morning glory / Hogvine',
    botanicalFamily: 'Convolvulaceae',
    habit: 'Broadleaf / Vine'
  },
  {
    scientificName: 'Colocasia esculenta',
    commonName: 'Wild Taro / Elephant ear',
    botanicalFamily: 'Araceae',
    habit: 'Broadleaf / Tuberous'
  },
  {
    scientificName: 'Ageratum conyzoides',
    commonName: 'Billygoat weed / Goatweed',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Bidens pilosa',
    commonName: "Blackjack / Beggar's ticks",
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Borreria hispida',
    commonName: 'Landrina / Shaggy buttonweed',
    botanicalFamily: 'Rubiaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Mimosa pudica',
    commonName: 'Touch-me-not / Sensitive plant',
    botanicalFamily: 'Fabaceae',
    habit: 'Broadleaf / Legume'
  },
  {
    scientificName: 'Synedrella nodiflora',
    commonName: "Cinderella weed / Node weed",
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  },

  // Grasses (Gramineae / Poaceae)
  {
    scientificName: 'Echinochloa crus-galli',
    commonName: 'Barnyard grass',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Echinochloa colona',
    commonName: 'Jungle rice',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Digitaria sanguinalis',
    commonName: 'Crabgrass / Large crabgrass',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Eleusine indica',
    commonName: 'Goosegrass / Wiregrass',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Cynodon dactylon',
    commonName: 'Bermuda grass / Hariali',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Paspalum conjugatum',
    commonName: 'Buffalo grass / Sour paspalum',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Phalaris minor',
    commonName: 'Canary grass / Gullidanda',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Setaria viridis',
    commonName: 'Green foxtail',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Imperata cylindrica',
    commonName: 'Cogon grass / Lalang',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },

  // Sedges (Cyperaceae)
  {
    scientificName: 'Cyperus rotundus',
    commonName: 'Purple nutsedge / Motha',
    botanicalFamily: 'Cyperaceae',
    habit: 'Sedge'
  },
  {
    scientificName: 'Cyperus iria',
    commonName: 'Rice flatsedge',
    botanicalFamily: 'Cyperaceae',
    habit: 'Sedge'
  },
  {
    scientificName: 'Cyperus difformis',
    commonName: 'Smallflower umbrella sedge',
    botanicalFamily: 'Cyperaceae',
    habit: 'Sedge'
  },
  {
    scientificName: 'Fimbristylis miliacea',
    commonName: 'Globe fringerush',
    botanicalFamily: 'Cyperaceae',
    habit: 'Sedge'
  },

  // Major Arable Broadleaves
  {
    scientificName: 'Parthenium hysterophorus',
    commonName: 'Carrot grass / Congress grass',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Amaranthus viridis',
    commonName: 'Slender amaranth / Green amaranth',
    botanicalFamily: 'Amaranthaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Chenopodium album',
    commonName: "Lamb's quarters / Bathua",
    botanicalFamily: 'Amaranthaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Convolvulus arvensis',
    commonName: 'Field bindweed / Hirankhuri',
    botanicalFamily: 'Convolvulaceae',
    habit: 'Broadleaf / Vine'
  },
  {
    scientificName: 'Eclipta prostrata',
    commonName: 'False daisy / Bhringraj',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Portulaca oleracea',
    commonName: 'Common purslane / Kulfa',
    botanicalFamily: 'Portulacaceae',
    habit: 'Broadleaf / Succulent'
  },
  {
    scientificName: 'Trianthema portulacastrum',
    commonName: 'Horse purslane / Santhi',
    botanicalFamily: 'Aizoaceae',
    habit: 'Broadleaf / Succulent'
  },
  // Tropical Broadleaves & Plantation Species
  {
    scientificName: 'Centella asiatica',
    commonName: 'Asiatic pennywort / Gotu kola / Brahmi',
    botanicalFamily: 'Apiaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Euphorbia hirta',
    commonName: 'Asthma plant / Dudhi',
    botanicalFamily: 'Euphorbiaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Euphorbia geniculata',
    commonName: 'Wild poinsettia',
    botanicalFamily: 'Euphorbiaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Phyllanthus niruri',
    commonName: 'Gale of the wind / Bhumi amla',
    botanicalFamily: 'Phyllanthaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Boerhavia diffusa',
    commonName: 'Punarnava / Tarvine',
    botanicalFamily: 'Nyctaginaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Cleome viscosa',
    commonName: 'Asian spiderflower / Hurhur',
    botanicalFamily: 'Cleomaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Celosia argentea',
    commonName: 'Silver cockscomb / Kurdu',
    botanicalFamily: 'Amaranthaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Alternanthera sessilis',
    commonName: 'Sessile joyweed / Ponnakanni',
    botanicalFamily: 'Amaranthaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Physalis minima',
    commonName: 'Sunberry / Wild cape gooseberry',
    botanicalFamily: 'Solanaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Solanum nigrum',
    commonName: 'Black nightshade / Makoi',
    botanicalFamily: 'Solanaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Sida acuta',
    commonName: 'Wireweed / Common wireweed',
    botanicalFamily: 'Malvaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Tridax procumbens',
    commonName: 'Coat buttons / Ghamra',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Commelina benghalensis',
    commonName: 'Benghal dayflower / Kankawa',
    botanicalFamily: 'Commelinaceae',
    habit: 'Broadleaf / Herb'
  },
  {
    scientificName: 'Dactyloctenium aegyptium',
    commonName: "Egyptian crowfoot grass / Makra",
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Digitaria ciliaris',
    commonName: 'Tropical finger-grass',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Leptochloa chinensis',
    commonName: 'Chinese sprangletop',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Brachiaria ramosa',
    commonName: 'Browntop millet',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Panicum repens',
    commonName: 'Torpedograss',
    botanicalFamily: 'Poaceae',
    habit: 'Grass'
  },
  {
    scientificName: 'Xanthium strumarium',
    commonName: 'Cocklebur / Chhota gokhru',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  }
];

/**
 * Resolves botanical taxonomy for any entered weed species query.
 * Matches case-insensitively against scientific and common names,
 * resolves parenthesized synonyms, and infers families from taxonomic indicators.
 */
export function getBotanicalTaxonomy(query) {
  if (!query || typeof query !== 'string') {
    return {
      scientificName: 'Mixed Weed Flora',
      commonName: 'Mixed weeds',
      botanicalFamily: 'Mixed Families',
      habit: 'Mixed'
    };
  }

  const rawTrimmed = query.trim();
  const clean = rawTrimmed.toLowerCase();
  
  // Extract candidates from parenthesized queries like "Asiatic pennywort (centella asiatica)"
  const candidates = [clean];
  const parenMatch = clean.match(/\(([^)]+)\)/);
  if (parenMatch) {
    candidates.push(parenMatch[1].trim());
    const outsideParen = clean.replace(/\([^)]+\)/g, '').trim();
    if (outsideParen) candidates.push(outsideParen);
  }

  // 1. Check registry against all candidate strings
  for (const cand of candidates) {
    const match = BOTANICAL_WEED_REGISTRY.find(entry => {
      const sName = entry.scientificName.toLowerCase();
      const cName = entry.commonName.toLowerCase();
      return sName === cand || sName.includes(cand) || cand.includes(sName) || cName.includes(cand) || cand.includes(cName);
    });
    if (match) return match;
  }

  // 2. Taxonomic indicator inference for common families/habits
  let inferredFamily = null;
  let inferredHabit = 'Broadleaf / Weed';

  if (/poaceae|gramineae|grass/i.test(clean)) {
    inferredFamily = 'Poaceae';
    inferredHabit = 'Grass';
  } else if (/cyperaceae|sedge|cyperus/i.test(clean)) {
    inferredFamily = 'Cyperaceae';
    inferredHabit = 'Sedge';
  } else if (/asteraceae|compositae/i.test(clean)) {
    inferredFamily = 'Asteraceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/apiaceae|umbelliferae/i.test(clean)) {
    inferredFamily = 'Apiaceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/amaranthaceae/i.test(clean)) {
    inferredFamily = 'Amaranthaceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/euphorbiaceae/i.test(clean)) {
    inferredFamily = 'Euphorbiaceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/fabaceae|leguminosae|legume/i.test(clean)) {
    inferredFamily = 'Fabaceae';
    inferredHabit = 'Broadleaf / Legume';
  } else if (/solanaceae/i.test(clean)) {
    inferredFamily = 'Solanaceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/malvaceae/i.test(clean)) {
    inferredFamily = 'Malvaceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/convolvulaceae/i.test(clean)) {
    inferredFamily = 'Convolvulaceae';
    inferredHabit = 'Broadleaf / Vine';
  } else if (/commelinaceae/i.test(clean)) {
    inferredFamily = 'Commelinaceae';
    inferredHabit = 'Broadleaf / Herb';
  } else if (/rubiaceae/i.test(clean)) {
    inferredFamily = 'Rubiaceae';
    inferredHabit = 'Broadleaf / Herb';
  }

  // 3. Fallback: If formatted like binomial "Genus species"
  const cleanParts = (parenMatch ? parenMatch[1].trim() : clean).split(/\s+/).filter(Boolean);
  if (cleanParts.length >= 2 && !cleanParts[0].toLowerCase().includes('unknown')) {
    const formattedScientific = cleanParts[0].charAt(0).toUpperCase() + cleanParts[0].slice(1).toLowerCase() + ' ' + cleanParts.slice(1).join(' ').toLowerCase();
    return {
      scientificName: formattedScientific,
      commonName: rawTrimmed,
      botanicalFamily: inferredFamily || 'Undetermined Family',
      habit: inferredHabit
    };
  }

  return {
    scientificName: rawTrimmed,
    commonName: rawTrimmed,
    botanicalFamily: inferredFamily || 'Botanical Family Unspecified',
    habit: inferredHabit
  };
}

/**
 * Standard 0 to 10 Crop Phytotoxicity Rating Scale (Institutional Standard)
 */
export const PHYTOTOXICITY_10_SCALE = [
  { score: 0, injuryLevel: 'No injury', symptoms: 'Normal growth, no visible symptoms' },
  { score: 1, injuryLevel: 'Very slight', symptoms: '<5% leaf tip burn, very faint chlorosis' },
  { score: 2, injuryLevel: 'Slight', symptoms: '5–10% leaf yellowing, minor spotting' },
  { score: 3, injuryLevel: 'Mild', symptoms: '10–20% chlorosis, slight leaf edge burn' },
  { score: 4, injuryLevel: 'Moderate', symptoms: '20–30% chlorosis + visible necrotic spots' },
  { score: 5, injuryLevel: 'Moderate-high', symptoms: '30–40% injury, clear leaf burn, slight stunting' },
  { score: 6, injuryLevel: 'High', symptoms: '40–60% injury, severe chlorosis + necrosis' },
  { score: 7, injuryLevel: 'Very high', symptoms: '60–75% leaf damage, strong stunting' },
  { score: 8, injuryLevel: 'Severe', symptoms: '75–90% tissue death, growth almost stopped' },
  { score: 9, injuryLevel: 'Very severe', symptoms: '>90% damage, plant survival doubtful' },
  { score: 10, injuryLevel: 'Complete kill', symptoms: 'Plant completely dead' }
];

export function getPhytotoxicityDescription(score) {
  const rounded = Math.min(10, Math.max(0, Math.round(Number(score) || 0)));
  return PHYTOTOXICITY_10_SCALE.find(s => s.score === rounded) || PHYTOTOXICITY_10_SCALE[0];
}
