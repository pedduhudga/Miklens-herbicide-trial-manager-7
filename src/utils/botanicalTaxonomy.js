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
  {
    scientificName: 'Xanthium strumarium',
    commonName: 'Cocklebur / Chhota gokhru',
    botanicalFamily: 'Asteraceae',
    habit: 'Broadleaf / Herb'
  }
];

/**
 * Resolves botanical taxonomy for any entered weed species query.
 * Matches case-insensitively against scientific and common names.
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

  const clean = query.trim().toLowerCase();
  
  // Exact or partial substring match in registry
  const match = BOTANICAL_WEED_REGISTRY.find(entry => {
    const sName = entry.scientificName.toLowerCase();
    const cName = entry.commonName.toLowerCase();
    return sName.includes(clean) || clean.includes(sName) || cName.includes(clean) || clean.includes(cName);
  });

  if (match) return match;

  // Fallback: If formatted like binomial "Genus species"
  const parts = query.trim().split(/\s+/);
  if (parts.length >= 2) {
    const formattedScientific = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() + ' ' + parts.slice(1).join(' ').toLowerCase();
    return {
      scientificName: formattedScientific,
      commonName: query.trim(),
      botanicalFamily: 'Undetermined Family',
      habit: 'Broadleaf / Weed'
    };
  }

  return {
    scientificName: query.trim(),
    commonName: query.trim(),
    botanicalFamily: 'Botanical Family Unspecified',
    habit: 'Weed Flora'
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
