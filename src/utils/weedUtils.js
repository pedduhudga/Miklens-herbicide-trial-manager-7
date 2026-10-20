export function canonicalizeWeedSpecies (rawName) {
  const name = String(rawName || '').trim();
  if (!name) return 'Unknown';

  const lower = name.toLowerCase().replace(/\s+/g, ' ');
  const aliasMap = {
    // Sedges
    'motha': 'Purple Nutsedge (Cyperus rotundus)',
    'nutgrass': 'Purple Nutsedge (Cyperus rotundus)',
    'nut grass': 'Purple Nutsedge (Cyperus rotundus)',
    'purple nutsedge': 'Purple Nutsedge (Cyperus rotundus)',
    'cyperus rotundus': 'Purple Nutsedge (Cyperus rotundus)',
    'yellow nutsedge': 'Yellow Nutsedge (Cyperus esculentus)',
    'cyperus esculentus': 'Yellow Nutsedge (Cyperus esculentus)',
    'chufa': 'Yellow Nutsedge (Cyperus esculentus)',
    'umbrella sedge': 'Smallflower Umbrella Sedge (Cyperus difformis)',
    'smallflower umbrella sedge': 'Smallflower Umbrella Sedge (Cyperus difformis)',
    'cyperus difformis': 'Smallflower Umbrella Sedge (Cyperus difformis)',
    'rice flatsedge': 'Rice Flatsedge (Cyperus iria)',
    'cyperus iria': 'Rice Flatsedge (Cyperus iria)',
    'globe fringed rush': 'Globe Fringed Rush (Fimbristylis miliacea)',
    'fimbristylis miliacea': 'Globe Fringed Rush (Fimbristylis miliacea)',

    // Grasses
    'bermudagrass': 'Bermuda Grass (Cynodon dactylon)',
    'couch grass': 'Bermuda Grass (Cynodon dactylon)',
    'doob grass': 'Bermuda Grass (Cynodon dactylon)',
    'doob': 'Bermuda Grass (Cynodon dactylon)',
    'durva': 'Bermuda Grass (Cynodon dactylon)',
    'durva grass': 'Bermuda Grass (Cynodon dactylon)',
    'cynodon dactylon': 'Bermuda Grass (Cynodon dactylon)',
    'barnyard grass': 'Barnyard Grass (Echinochloa crus-galli)',
    'barnyardgrass': 'Barnyard Grass (Echinochloa crus-galli)',
    'echinochloa crus-galli': 'Barnyard Grass (Echinochloa crus-galli)',
    'echinochloa crusgalli': 'Barnyard Grass (Echinochloa crus-galli)',
    'sanwa': 'Barnyard Grass (Echinochloa crus-galli)',
    'sawa': 'Barnyard Grass (Echinochloa crus-galli)',
    'jungle rice': 'Jungle Rice (Echinochloa colona)',
    'junglerice': 'Jungle Rice (Echinochloa colona)',
    'echinochloa colona': 'Jungle Rice (Echinochloa colona)',
    'echinochloa colonum': 'Jungle Rice (Echinochloa colona)',
    'shama': 'Jungle Rice (Echinochloa colona)',
    'goosegrass': 'Goosegrass (Eleusine indica)',
    'goose grass': 'Goosegrass (Eleusine indica)',
    'eleusine indica': 'Goosegrass (Eleusine indica)',
    'wiregrass': 'Goosegrass (Eleusine indica)',
    'crowfoot grass': 'Crowfoot Grass (Dactyloctenium aegyptium)',
    'crowfoot': 'Crowfoot Grass (Dactyloctenium aegyptium)',
    'dactyloctenium aegyptium': 'Crowfoot Grass (Dactyloctenium aegyptium)',
    'makra': 'Crowfoot Grass (Dactyloctenium aegyptium)',
    'johnsongrass': 'Johnsongrass (Sorghum halepense)',
    'johnson grass': 'Johnsongrass (Sorghum halepense)',
    'sorghum halepense': 'Johnsongrass (Sorghum halepense)',
    'baru': 'Johnsongrass (Sorghum halepense)',
    'canary grass': 'Little Seed Canary Grass (Phalaris minor)',
    'canarygrass': 'Little Seed Canary Grass (Phalaris minor)',
    'phalaris minor': 'Little Seed Canary Grass (Phalaris minor)',
    'gulli danda': 'Little Seed Canary Grass (Phalaris minor)',
    'mandusi': 'Little Seed Canary Grass (Phalaris minor)',
    'wild oat': 'Wild Oat (Avena fatua)',
    'wild oats': 'Wild Oat (Avena fatua)',
    'avena fatua': 'Wild Oat (Avena fatua)',
    'jangli jai': 'Wild Oat (Avena fatua)',
    'crabgrass': 'Large Crabgrass (Digitaria sanguinalis)',
    'crab grass': 'Large Crabgrass (Digitaria sanguinalis)',
    'digitaria sanguinalis': 'Large Crabgrass (Digitaria sanguinalis)',
    'large crabgrass': 'Large Crabgrass (Digitaria sanguinalis)',
    'southern crabgrass': 'Southern Crabgrass (Digitaria ciliaris)',
    'digitaria ciliaris': 'Southern Crabgrass (Digitaria ciliaris)',
    'foxtail': 'Green Foxtail (Setaria viridis)',
    'green foxtail': 'Green Foxtail (Setaria viridis)',
    'setaria viridis': 'Green Foxtail (Setaria viridis)',
    'yellow foxtail': 'Yellow Foxtail (Setaria pumila)',
    'setaria pumila': 'Yellow Foxtail (Setaria pumila)',
    'setaria glauca': 'Yellow Foxtail (Setaria pumila)',
    'banra': 'Green Foxtail (Setaria viridis)',
    'cogon grass': 'Cogon Grass (Imperata cylindrica)',
    'cogongrass': 'Cogon Grass (Imperata cylindrica)',
    'imperata cylindrica': 'Cogon Grass (Imperata cylindrica)',
    'kanso': 'Cogon Grass (Imperata cylindrica)',
    'dallisgrass': 'Dallisgrass (Paspalum dilatatum)',
    'paspalum dilatatum': 'Dallisgrass (Paspalum dilatatum)',
    'sour paspalum': 'Sour Paspalum (Paspalum conjugatum)',
    'paspalum conjugatum': 'Sour Paspalum (Paspalum conjugatum)',
    'chinese sprangletop': 'Chinese Sprangletop (Leptochloa chinensis)',
    'sprangletop': 'Chinese Sprangletop (Leptochloa chinensis)',
    'leptochloa chinensis': 'Chinese Sprangletop (Leptochloa chinensis)',
    'ryegrass': 'Italian Ryegrass (Lolium multiflorum)',
    'italian ryegrass': 'Italian Ryegrass (Lolium multiflorum)',
    'lolium multiflorum': 'Italian Ryegrass (Lolium multiflorum)',
    'lolium perenne': 'Perennial Ryegrass (Lolium perenne)',
    'poaceae': 'Unknown Grass Species (Poaceae spp.)',
    'poaceae spp.': 'Unknown Grass Species (Poaceae spp.)',

    // Broadleaf Weeds
    'parthenium': 'Parthenium / Congress Grass (Parthenium hysterophorus)',
    'congress grass': 'Parthenium / Congress Grass (Parthenium hysterophorus)',
    'carrot grass': 'Parthenium / Congress Grass (Parthenium hysterophorus)',
    'carrot weed': 'Parthenium / Congress Grass (Parthenium hysterophorus)',
    'gajar ghas': 'Parthenium / Congress Grass (Parthenium hysterophorus)',
    'parthenium hysterophorus': 'Parthenium / Congress Grass (Parthenium hysterophorus)',
    'pigweed': 'Slender Amaranth (Amaranthus viridis)',
    'slender amaranth': 'Slender Amaranth (Amaranthus viridis)',
    'amaranthus viridis': 'Slender Amaranth (Amaranthus viridis)',
    'chaulai': 'Slender Amaranth (Amaranthus viridis)',
    'redroot pigweed': 'Redroot Pigweed (Amaranthus retroflexus)',
    'amaranthus retroflexus': 'Redroot Pigweed (Amaranthus retroflexus)',
    'spiny amaranth': 'Spiny Amaranth (Amaranthus spinosus)',
    'amaranthus spinosus': 'Spiny Amaranth (Amaranthus spinosus)',
    'kante wali chaulai': 'Spiny Amaranth (Amaranthus spinosus)',
    'bathua': 'Common Lambsquarters (Chenopodium album)',
    'lambsquarters': 'Common Lambsquarters (Chenopodium album)',
    'lambs quarters': 'Common Lambsquarters (Chenopodium album)',
    'common lambsquarters': 'Common Lambsquarters (Chenopodium album)',
    'chenopodium album': 'Common Lambsquarters (Chenopodium album)',
    'white goosefoot': 'Common Lambsquarters (Chenopodium album)',
    'field bindweed': 'Field Bindweed (Convolvulus arvensis)',
    'bindweed': 'Field Bindweed (Convolvulus arvensis)',
    'convolvulus arvensis': 'Field Bindweed (Convolvulus arvensis)',
    'hirankhuri': 'Field Bindweed (Convolvulus arvensis)',
    'horse purslane': 'Horse Purslane (Trianthema portulacastrum)',
    'trianthema portulacastrum': 'Horse Purslane (Trianthema portulacastrum)',
    'santhi': 'Horse Purslane (Trianthema portulacastrum)',
    'bishkapra': 'Horse Purslane (Trianthema portulacastrum)',
    'purslane': 'Common Purslane (Portulaca oleracea)',
    'common purslane': 'Common Purslane (Portulaca oleracea)',
    'portulaca oleracea': 'Common Purslane (Portulaca oleracea)',
    'kulfa': 'Common Purslane (Portulaca oleracea)',
    'loniya': 'Common Purslane (Portulaca oleracea)',
    'false amaranth': 'False Amaranth (Digera arvensis)',
    'digera arvensis': 'False Amaranth (Digera arvensis)',
    'kundra': 'False Amaranth (Digera arvensis)',
    'dayflower': 'Tropical Spiderwort (Commelina benghalensis)',
    'tropical spiderwort': 'Tropical Spiderwort (Commelina benghalensis)',
    'commelina benghalensis': 'Tropical Spiderwort (Commelina benghalensis)',
    'kankawwa': 'Tropical Spiderwort (Commelina benghalensis)',
    'black nightshade': 'Black Nightshade (Solanum nigrum)',
    'solanum nigrum': 'Black Nightshade (Solanum nigrum)',
    'makoi': 'Black Nightshade (Solanum nigrum)',
    'sunberry': 'Sunberry (Physalis minima)',
    'physalis minima': 'Sunberry (Physalis minima)',
    'rasbhari': 'Sunberry (Physalis minima)',
    'mexican poppy': 'Mexican Prickly Poppy (Argemone mexicana)',
    'prickly poppy': 'Mexican Prickly Poppy (Argemone mexicana)',
    'argemone mexicana': 'Mexican Prickly Poppy (Argemone mexicana)',
    'satyanashi': 'Mexican Prickly Poppy (Argemone mexicana)',
    'wild poinsettia': 'Wild Poinsettia (Euphorbia geniculata)',
    'euphorbia geniculata': 'Wild Poinsettia (Euphorbia geniculata)',
    'euphorbia heterophylla': 'Wild Poinsettia (Euphorbia geniculata)',
    'asthma plant': 'Asthma Plant (Euphorbia hirta)',
    'euphorbia hirta': 'Asthma Plant (Euphorbia hirta)',
    'badi dudhi': 'Asthma Plant (Euphorbia hirta)',
    'silver cockscomb': 'Silver Cockscomb (Celosia argentea)',
    'celosia argentea': 'Silver Cockscomb (Celosia argentea)',
    'safed murga': 'Silver Cockscomb (Celosia argentea)',
    'beggarticks': 'Hairy Beggarticks (Bidens pilosa)',
    'blackjack': 'Hairy Beggarticks (Bidens pilosa)',
    'bidens pilosa': 'Hairy Beggarticks (Bidens pilosa)',
    'billygoat weed': 'Billygoat Weed (Ageratum conyzoides)',
    'goatweed': 'Billygoat Weed (Ageratum conyzoides)',
    'ageratum conyzoides': 'Billygoat Weed (Ageratum conyzoides)',
    'gandhari': 'Billygoat Weed (Ageratum conyzoides)',
    'cocklebur': 'Common Cocklebur (Xanthium strumarium)',
    'xanthium strumarium': 'Common Cocklebur (Xanthium strumarium)',
    'chhota gokhru': 'Common Cocklebur (Xanthium strumarium)',
    'velvetleaf': 'Velvetleaf (Abutilon theophrasti)',
    'abutilon theophrasti': 'Velvetleaf (Abutilon theophrasti)',
    'sessile joyweed': 'Sessile Joyweed (Alternanthera sessilis)',
    'alternanthera sessilis': 'Sessile Joyweed (Alternanthera sessilis)',
    'water primrose': 'Water Primrose (Ludwigia octovalvis)',
    'ludwigia octovalvis': 'Water Primrose (Ludwigia octovalvis)',
    'ludwigia parviflora': 'Water Primrose (Ludwigia octovalvis)',
    'gooseweed': 'Gooseweed (Sphenoclea zeylanica)',
    'sphenoclea zeylanica': 'Gooseweed (Sphenoclea zeylanica)',
    'pickerel weed': 'Pickerel Weed (Monochoria vaginalis)',
    'monochoria vaginalis': 'Pickerel Weed (Monochoria vaginalis)',
    'false daisy': 'False Daisy (Eclipta prostrata)',
    'eclipta prostrata': 'False Daisy (Eclipta prostrata)',
    'eclipta alba': 'False Daisy (Eclipta prostrata)',
    'bhringraj': 'False Daisy (Eclipta prostrata)',
    'coatbuttons': 'Coatbuttons (Tridax procumbens)',
    'tridax procumbens': 'Coatbuttons (Tridax procumbens)',
    'thumbai': 'Thumbai (Leucas aspera)',
    'leucas aspera': 'Thumbai (Leucas aspera)',
    'wireweed': 'Wireweed (Sida acuta)',
    'sida acuta': 'Wireweed (Sida acuta)',
    'sicklepod': 'Sicklepod (Cassia tora)',
    'cassia tora': 'Sicklepod (Cassia tora)',
    'senna obtusifolia': 'Sicklepod (Cassia tora)',
    'chakunda': 'Sicklepod (Cassia tora)',
    'ricinus communis': 'Castor (Ricinus communis)',
    'castor bean': 'Castor (Ricinus communis)',
    'castor': 'Castor (Ricinus communis)',
    'broadleaf': 'Broadleaf weed (unidentified)',
    'broad leaf': 'Broadleaf weed (unidentified)',
    'broadleaf weed': 'Broadleaf weed (unidentified)',
    'mixed weeds': 'Mixed weed population',
    'unidentified weeds (mixed weeds)': 'Mixed weed population',
    'mixed weed population': 'Mixed weed population',
    'total': 'Total',

    // Plant Health & Damage Indicators
    'leafminer damage': 'Leafminer Damage',
    'leaf mining damage': 'Leafminer Damage',
    'leaf miner damage': 'Leafminer Damage',
    'leafminer damage (liriomyza spp.)': 'Leafminer Damage',
    'general plant vigor': 'General Plant Vigor',
    'general vigor': 'General Plant Vigor',
    'vigor': 'General Plant Vigor',
    'visual vigor': 'General Plant Vigor',
    'general plant health': 'General Plant Health',
    'plant health': 'General Plant Health',
    'crop health': 'General Plant Health',
    'general leaf health': 'General Leaf Health',
    'leaf health': 'General Leaf Health',
    'general foliage': 'General Foliage',
    'foliage': 'General Foliage',
    'general vegetative development': 'General Vegetative Development',
    'vegetative development': 'General Vegetative Development',
    'vegetative growth': 'General Vegetative Development'
  };

  if (aliasMap[lower]) return aliasMap[lower];

  // Pattern-based smart matching
  if (lower.includes('cynodon') || lower.includes('bermuda') || lower.includes('doob')) return 'Bermuda Grass (Cynodon dactylon)';
  if (lower.includes('rotundus') || lower.includes('motha') || lower.includes('nutsedge')) return 'Purple Nutsedge (Cyperus rotundus)';
  if (lower.includes('parthenium') || lower.includes('gajar ghas')) return 'Parthenium / Congress Grass (Parthenium hysterophorus)';
  if (lower.includes('echinochloa') && (lower.includes('colona') || lower.includes('shama'))) return 'Jungle Rice (Echinochloa colona)';
  if (lower.includes('echinochloa') || lower.includes('barnyard') || lower.includes('sanwa')) return 'Barnyard Grass (Echinochloa crus-galli)';
  if (lower.includes('amaranthus') || lower.includes('chaulai') || lower.includes('pigweed')) return 'Slender Amaranth (Amaranthus viridis)';
  if (lower.includes('chenopodium') || lower.includes('bathua') || lower.includes('lambsquarters')) return 'Common Lambsquarters (Chenopodium album)';
  if (lower.includes('convolvulus') || lower.includes('bindweed') || lower.includes('hirankhuri')) return 'Field Bindweed (Convolvulus arvensis)';
  if (lower.includes('trianthema') || lower.includes('santhi') || lower.includes('bishkapra')) return 'Horse Purslane (Trianthema portulacastrum)';
  if (lower.includes('portulaca') || lower.includes('purslane') || lower.includes('kulfa')) return 'Common Purslane (Portulaca oleracea)';
  if (lower.includes('eleusine') || lower.includes('goosegrass')) return 'Goosegrass (Eleusine indica)';
  if (lower.includes('crowfoot') || lower.includes('dactyloctenium')) return 'Crowfoot Grass (Dactyloctenium aegyptium)';
  if (lower.includes('sorghum halepense') || lower.includes('johnsongrass') || lower.includes('baru')) return 'Johnsongrass (Sorghum halepense)';
  if (lower.includes('phalaris') || lower.includes('gulli danda')) return 'Little Seed Canary Grass (Phalaris minor)';
  if (lower.includes('commelina') || lower.includes('kankawwa')) return 'Tropical Spiderwort (Commelina benghalensis)';
  if (lower.includes('poaceae')) return 'Unknown Grass Species (Poaceae spp.)';
  if (lower.includes('broadleaf')) return 'Broadleaf weed (unidentified)';
  if (lower.includes('leafminer') || lower.includes('leaf miner') || lower.includes('leaf mining')) return 'Leafminer Damage';
  if (lower.includes('plant vigor') || lower.includes('general vigor') || lower.includes('visual vigor') || lower === 'vigor') return 'General Plant Vigor';
  if (lower.includes('plant health') || lower.includes('general plant health') || lower === 'crop health') return 'General Plant Health';
  if (lower.includes('leaf health') || lower.includes('general leaf health')) return 'General Leaf Health';
  if (lower.includes('foliage') || lower.includes('general foliage')) return 'General Foliage';
  if (lower.includes('vegetative development') || lower.includes('vegetative growth')) return 'General Vegetative Development';

  return name
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

// Placeholder bucket for unknown baseline composition, not a true species.
export function isMixedWeedPlaceholder (speciesName) {
  const s = String(speciesName || '').trim().toLowerCase();
  return s === 'mixed weeds' || s === 'mixed weed population' || s === 'unidentified weeds (mixed weeds)';
}

// Keep only one canonical cover-correction annotation in notes.
export function upsertCoverCorrectionNote (notes, message) {
  const base = String(notes || '').replace(/\s*\[Cover corrected:[^\]]*\]/gi, '').trim();
  const suffix = ` [Cover corrected: ${String(message || '').trim()}]`;
  return base ? `${base}${suffix}` : suffix.trim();
}

export function getCoverCorrectionValue (notes) {
  const match = String(notes || '').match(/Cover\s*corrected:\s*(\d+(?:\.\d+)?)%/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

export function isAutoGeneratedWeedEntry (wd) {
  if (!wd || typeof wd !== 'object') return false;
  if (wd.autoInjected === true) return true;
  const notes = String(wd.notes || wd.note || '').trim().toLowerCase();
  return notes === 'added from prior observation history for daily species tracking.'
    || /^(auto-repaired:|auto-added:|auto-tracking:)/i.test(notes);
}

// Known perennial weeds - 0% cover indicates top-kill, not full root/tuber elimination
export const PERENNIAL_WEEDS = new Set([
  'cynodon dactylon', 'cyperus rotundus', 'cyperus esculentus',
  'digitaria abyssinica', 'imperata cylindrica', 'paspalum conjugatum',
  'commelina benghalensis', 'oxalis corniculata', 'convolvulus arvensis',
  'sorghum halepense', 'cirsium arvense', 'equisetum arvense',
  'agropyron repens', 'elytrigia repens', 'rumex crispus',
  'taraxacum officinale', 'plantago major', 'ranunculus repens',
  'trifolium repens', 'pennisetum clandestinum', 'panicum maximum',
  'paspalum dilatatum', 'axonopus compressus', 'stenotaphrum secundatum',
  'alternanthera philoxeroides'
]);

// Known annual weeds reproducing primarily through seeds
export const ANNUAL_WEEDS = new Set([
  'parthenium hysterophorus', 'amaranthus viridis', 'amaranthus retroflexus',
  'amaranthus spinosus', 'echinochloa colona', 'echinochloa crus-galli',
  'digera arvensis', 'trianthema portulacastrum', 'chenopodium album',
  'portulaca oleracea', 'solanum nigrum', 'physalis minima',
  'eleusine indica', 'dactyloctenium aegyptium', 'phalaris minor',
  'avena fatua', 'digitaria sanguinalis', 'setaria viridis',
  'setaria pumila', 'celosia argentea', 'bidens pilosa',
  'ageratum conyzoides', 'xanthium strumarium', 'abutilon theophrasti'
]);

// Sedge species (Cyperaceae family)
export const SEDGE_WEEDS = new Set([
  'cyperus rotundus', 'cyperus esculentus', 'cyperus difformis',
  'cyperus iria', 'fimbristylis miliacea'
]);

export const WEED_EPPO_MAPPING = {
  // Sedges
  'cyperus rotundus': 'CYPRO',
  'purple nutsedge': 'CYPRO',
  'cyperus esculentus': 'CYPES',
  'yellow nutsedge': 'CYPES',
  'cyperus difformis': 'CYPDI',
  'smallflower umbrella sedge': 'CYPDI',
  'cyperus iria': 'CYPIR',
  'rice flatsedge': 'CYPIR',
  'fimbristylis miliacea': 'FIBMI',
  'globe fringed rush': 'FIBMI',

  // Grasses
  'cynodon dactylon': 'CYNDA',
  'bermuda grass': 'CYNDA',
  'echinochloa crus-galli': 'ECHCG',
  'barnyard grass': 'ECHCG',
  'echinochloa colona': 'ECHCO',
  'jungle rice': 'ECHCO',
  'eleusine indica': 'ELEIN',
  'goosegrass': 'ELEIN',
  'dactyloctenium aegyptium': 'DTTAE',
  'crowfoot grass': 'DTTAE',
  'sorghum halepense': 'SORHA',
  'johnsongrass': 'SORHA',
  'phalaris minor': 'PHAMI',
  'little seed canary grass': 'PHAMI',
  'avena fatua': 'AVEFA',
  'wild oat': 'AVEFA',
  'digitaria sanguinalis': 'DIGSA',
  'large crabgrass': 'DIGSA',
  'digitaria ciliaris': 'DIGCI',
  'southern crabgrass': 'DIGCI',
  'setaria viridis': 'SETVI',
  'green foxtail': 'SETVI',
  'setaria pumila': 'SETLU',
  'yellow foxtail': 'SETLU',
  'imperata cylindrica': 'IMPCY',
  'cogon grass': 'IMPCY',
  'paspalum dilatatum': 'PASDI',
  'dallisgrass': 'PASDI',
  'paspalum conjugatum': 'PASCO',
  'sour paspalum': 'PASCO',
  'leptochloa chinensis': 'LEFCH',
  'chinese sprangletop': 'LEFCH',
  'lolium multiflorum': 'LOLMU',
  'italian ryegrass': 'LOLMU',
  'lolium perenne': 'LOLPE',
  'perennial ryegrass': 'LOLPE',

  // Broadleaves
  'parthenium hysterophorus': 'PTNHY',
  'parthenium': 'PTNHY',
  'amaranthus viridis': 'AMAVI',
  'slender amaranth': 'AMAVI',
  'amaranthus retroflexus': 'AMARE',
  'redroot pigweed': 'AMARE',
  'amaranthus spinosus': 'AMASP',
  'spiny amaranth': 'AMASP',
  'chenopodium album': 'CHEAL',
  'common lambsquarters': 'CHEAL',
  'convolvulus arvensis': 'CONAR',
  'field bindweed': 'CONAR',
  'trianthema portulacastrum': 'TRTPO',
  'horse purslane': 'TRTPO',
  'portulaca oleracea': 'PORTU',
  'common purslane': 'PORTU',
  'commelina benghalensis': 'COMBE',
  'tropical spiderwort': 'COMBE',
  'solanum nigrum': 'SOLNI',
  'black nightshade': 'SOLNI',
  'physalis minima': 'PHYMN',
  'sunberry': 'PHYMN',
  'argemone mexicana': 'ARGME',
  'mexican prickly poppy': 'ARGME',
  'euphorbia geniculata': 'EPHHL',
  'wild poinsettia': 'EPHHL',
  'euphorbia hirta': 'EPHHI',
  'asthma plant': 'EPHHI',
  'celosia argentea': 'CELAR',
  'silver cockscomb': 'CELAR',
  'bidens pilosa': 'BIDPI',
  'hairy beggarticks': 'BIDPI',
  'ageratum conyzoides': 'AGECO',
  'billygoat weed': 'AGECO',
  'xanthium strumarium': 'XANST',
  'common cocklebur': 'XANST',
  'abutilon theophrasti': 'ABUTH',
  'velvetleaf': 'ABUTH',
  'alternanthera sessilis': 'ALRSE',
  'sessile joyweed': 'ALRSE',
  'ludwigia octovalvis': 'LUDOC',
  'water primrose': 'LUDOC',
  'sphenoclea zeylanica': 'SPDZE',
  'gooseweed': 'SPDZE',
  'monochoria vaginalis': 'MOOVA',
  'pickerel weed': 'MOOVA',
  'eclipta prostrata': 'ECLAL',
  'false daisy': 'ECLAL',
  'tridax procumbens': 'TRQPR',
  'coatbuttons': 'TRQPR',
  'leucas aspera': 'LEUAS',
  'thumbai': 'LEUAS',
  'sida acuta': 'SIDAC',
  'wireweed': 'SIDAC',
  'cassia tora': 'CASTO',
  'sicklepod': 'CASTO',
  'ricinus communis': 'RICCO',
  'castor': 'RICCO'
};

export function getWeedEPPOCode(speciesName) {
  if (!speciesName) return null;
  const s = String(speciesName).toLowerCase().trim();
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1].trim().toLowerCase();
    if (WEED_EPPO_MAPPING[inside]) return WEED_EPPO_MAPPING[inside];
  }
  const cleanS = s.replace(/\([^)]*\)/g, '').trim();
  if (WEED_EPPO_MAPPING[cleanS]) return WEED_EPPO_MAPPING[cleanS];
  if (WEED_EPPO_MAPPING[s]) return WEED_EPPO_MAPPING[s];
  for (const [name, code] of Object.entries(WEED_EPPO_MAPPING)) {
    if (s.includes(name) || name.includes(s)) return code;
  }
  return null;
}

// Classify weed biology so logic is lifecycle-driven for any species.
export function getWeedBiology (speciesName) {
  const s = String(speciesName || '').trim().toLowerCase();
  let cleanS = s;
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) {
    cleanS = parenMatch[1].trim();
  }
  const perennialSet = PERENNIAL_WEEDS || new Set();
  const annualSet = ANNUAL_WEEDS || new Set();
  const sedgeSet = SEDGE_WEEDS || new Set();
  const type = sedgeSet.has(cleanS) || sedgeSet.has(s) || /cyperus|sedge|fimbristylis/i.test(s)
    ? 'Sedge'
    : (/(grass|poa|panicum|digitaria|cynodon|paspalum|sorghum|echinochloa|eleusine|dactyloctenium|phalaris|avena|setaria|imperata|leptochloa|lolium)/i.test(s) ? 'Grass' : 'Broadleaf');
  
  let lifecycle = 'Unknown';
  if (perennialSet.has(cleanS) || perennialSet.has(s)) lifecycle = 'Perennial';
  else if (annualSet.has(cleanS) || annualSet.has(s)) lifecycle = 'Annual';
  else if (type === 'Sedge') lifecycle = 'Perennial'; // Most agricultural sedges are tuberous perennials

  const eppoCode = getWeedEPPOCode(cleanS) || getWeedEPPOCode(s);

  return {
    type,
    lifecycle,
    isPerennial: lifecycle === 'Perennial',
    regrowthRisk: lifecycle === 'Perennial' || type === 'Sedge',
    eppoCode
  };
}

            /**
             * Graded weed efficacy status based on control % (reduction from baseline).
             * @param {number} controlPct - Control % (0-100). 100 = weed eliminated.
             * @param {boolean} isPerennial - If true, 0% cover ? Top-kill instead of Eliminated.
             * @returns {{ grade: string, label: string }}
             */
            export function getGradedWeedStatus (controlPct, isPerennial, lifecycle = 'Known') {
                if (!isFinite(controlPct) || controlPct < 0) controlPct = 0;
                if (controlPct > 100) controlPct = 100;
                if (lifecycle === 'Unknown' && controlPct >= 100) {
                    return { grade: 'Suppressed', label: 'Control uncertain (unknown lifecycle)' };
                }
                if (controlPct === 100) return { grade: isPerennial ? 'Top-kill' : 'Eliminated', label: '100% control' };
                if (controlPct >= 90)   return { grade: 'Excellent control', label: `${controlPct.toFixed(0)}% control` };
                if (controlPct >= 70)   return { grade: 'Strong control',    label: `${controlPct.toFixed(0)}% control` };
                if (controlPct >= 40)   return { grade: 'Moderate control',  label: `${controlPct.toFixed(0)}% control` };
                if (controlPct >= 20)   return { grade: 'Weak control',      label: `${controlPct.toFixed(0)}% control` };
                return { grade: 'Unaffected', label: controlPct > 0 ? `${controlPct.toFixed(0)}% control` : 'No effect' };
            };

            // Global status safety layer so lifecycle/regrowth rules are enforced consistently.
            export function normalizeLifecycleSafeStatus (speciesName, status, notes = '', prevCover = null, currentCover = null) {
                if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(speciesName)) {
                    return 'Baseline reference';
                }
                const bio = getWeedBiology(speciesName);
                const deadRx = /\b(brown|browning|desiccated|desiccation|wilting|wilted|chlorosis|chlorotic|necrosis|necrotic|dead|dying|burned|burning|scorched|dried|suppressed|suppression|controlled|killed|die-?back|dieback)\b/i;
                const growthRx = /\b(regrowth|re-emerg|re-grow|new\s+growth|new\s+green|seedling|sprouting|emerging|active\s+growth|green\s+shoot)\b/i;

                let next = String(status || '').trim();
                let lower = next.toLowerCase();
                const prev = isFinite(parseFloat(prevCover)) ? (parseFloat(prevCover) || 0) : null;
                const current = isFinite(parseFloat(currentCover)) ? (parseFloat(currentCover) || 0) : null;

                if (lower === 'not detected' && current !== null && current <= 0.1) {
                    return 'Not detected';
                }

                if ((/^auto-repaired:\s*species tracked in other observations/i.test(String(notes || '')) || /^auto-tracking:\s*species tracked in other observations/i.test(String(notes || ''))) &&
                    (prev === null || prev <= 0.1) && current !== null && current <= 0.1) {
                    return 'Not detected';
                }

                // Strict precedence: if cover rebounds above the prior observation, it is regrowth.
                if (prev !== null && current !== null && current > (prev + 0.1) && lower !== 'emerged') {
                    next = 'Regrowth';
                    lower = 'regrowth';
                }

                // Preserve explicit emergence label.
                if (lower === 'emerged') return 'Emerged';

                // Lifecycle-first zero-cover mapping.
                if (current !== null && current <= 0.1) {
                    if (bio.lifecycle === 'Perennial') return 'Top-kill';
                    if (bio.lifecycle === 'Annual') return 'Controlled';
                }

                // Reduced but still present: suppression, not terminal control.
                if (prev !== null && prev > 0 && current !== null && current > 0 && current < prev && lower !== 'regrowth') {
                    next = 'Suppressed';
                    lower = 'suppressed';
                }

                // Stable non-zero cover should not be reported as terminal control.
                if (prev !== null && current !== null && current > 0 && Math.abs(current - prev) <= 0.1 &&
                    (lower === 'controlled' || lower === 'eliminated' || lower === 'top-kill' || lower === 'suppressed')) {
                    next = 'Unaffected';
                    lower = 'unaffected';
                }

                // Lifecycle-safe terminal status mapping.
                if (lower === 'eliminated') {
                    if (bio.lifecycle === 'Perennial') next = (current !== null && current > 0.1) ? 'Suppressed' : 'Top-kill';
                    else if (bio.lifecycle === 'Unknown') next = 'Suppressed';
                    lower = String(next).toLowerCase();
                }

                // "Controlled" cannot mean full control for perennial weeds and cannot coexist with positive cover.
                if (lower === 'controlled') {
                    if (bio.lifecycle === 'Perennial') next = (current !== null && current > 0.1) ? 'Suppressed' : 'Top-kill';
                    else if (current !== null && current > 0) next = 'Suppressed';
                    lower = String(next).toLowerCase();
                }

                // Top-kill cannot coexist with positive surviving cover.
                if (lower === 'top-kill' && current !== null && current > 0.1) {
                    next = 'Suppressed';
                    lower = 'suppressed';
                }

                // Strong regrowth refinement: post-reduction rebound is regrowth, not top-kill.
                const noteText = String(notes || '');
                const hasGenuineRegrowthNote = growthRx.test(noteText);

                if (prev !== null && current !== null && current > (prev + 0.1)) {
                    next = 'Regrowth';
                    lower = 'regrowth';
                }

                // Status/notes consistency: regrowth cannot coexist if there is ZERO living green cover
                if (lower === 'regrowth' && current !== null && current <= 0.1) {
                    next = bio.isPerennial ? 'Top-kill' : 'Controlled';
                }

                return next;
            };

            if (typeof window !== 'undefined') {
                window.canonicalizeWeedSpecies = canonicalizeWeedSpecies;
                window.isMixedWeedPlaceholder = isMixedWeedPlaceholder;
                window.upsertCoverCorrectionNote = upsertCoverCorrectionNote;
            }