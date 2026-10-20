// src/utils/eppoBBCHData.js
// Standardized seed database for EPPO Codes and BBCH Growth Scales

export const EPPO_CODES = [
  // --- Weeds (Standard EPPO 5-letter codes) ---
  { code: 'CYPRO', commonName: 'Purple Nutsedge / Motha', scientificName: 'Cyperus rotundus', type: 'weed' },
  { code: 'CYPES', commonName: 'Yellow Nutsedge', scientificName: 'Cyperus esculentus', type: 'weed' },
  { code: 'CYPDI', commonName: 'Smallflower Umbrella Sedge', scientificName: 'Cyperus difformis', type: 'weed' },
  { code: 'CYPIR', commonName: 'Rice Flatsedge', scientificName: 'Cyperus iria', type: 'weed' },
  { code: 'FIBMI', commonName: 'Globe Fringed Rush', scientificName: 'Fimbristylis miliacea', type: 'weed' },
  { code: 'CYNDA', commonName: 'Bermuda Grass / Doob Grass', scientificName: 'Cynodon dactylon', type: 'weed' },
  { code: 'ECHCG', commonName: 'Barnyard Grass / Sanwa', scientificName: 'Echinochloa crus-galli', type: 'weed' },
  { code: 'ECHCO', commonName: 'Jungle Rice / Shama', scientificName: 'Echinochloa colona', type: 'weed' },
  { code: 'ELEIN', commonName: 'Goosegrass / Wiregrass', scientificName: 'Eleusine indica', type: 'weed' },
  { code: 'DTTAE', commonName: 'Crowfoot Grass / Makra', scientificName: 'Dactyloctenium aegyptium', type: 'weed' },
  { code: 'SORHA', commonName: 'Johnsongrass / Baru', scientificName: 'Sorghum halepense', type: 'weed' },
  { code: 'PHAMI', commonName: 'Little Seed Canary Grass / Gulli Danda', scientificName: 'Phalaris minor', type: 'weed' },
  { code: 'AVEFA', commonName: 'Wild Oat / Jangli Jai', scientificName: 'Avena fatua', type: 'weed' },
  { code: 'DIGSA', commonName: 'Large Crabgrass', scientificName: 'Digitaria sanguinalis', type: 'weed' },
  { code: 'DIGCI', commonName: 'Southern Crabgrass', scientificName: 'Digitaria ciliaris', type: 'weed' },
  { code: 'SETVI', commonName: 'Green Foxtail / Banra', scientificName: 'Setaria viridis', type: 'weed' },
  { code: 'SETLU', commonName: 'Yellow Foxtail', scientificName: 'Setaria pumila', type: 'weed' },
  { code: 'IMPCY', commonName: 'Cogon Grass / Kanso', scientificName: 'Imperata cylindrica', type: 'weed' },
  { code: 'PASDI', commonName: 'Dallisgrass', scientificName: 'Paspalum dilatatum', type: 'weed' },
  { code: 'PASCO', commonName: 'Sour Paspalum', scientificName: 'Paspalum conjugatum', type: 'weed' },
  { code: 'LEFCH', commonName: 'Chinese Sprangletop', scientificName: 'Leptochloa chinensis', type: 'weed' },
  { code: 'LOLMU', commonName: 'Italian Ryegrass', scientificName: 'Lolium multiflorum', type: 'weed' },
  { code: 'LOLPE', commonName: 'Perennial Ryegrass', scientificName: 'Lolium perenne', type: 'weed' },
  { code: 'PTNHY', commonName: 'Parthenium / Congress Grass', scientificName: 'Parthenium hysterophorus', type: 'weed' },
  { code: 'AMAVI', commonName: 'Slender Amaranth / Chaulai', scientificName: 'Amaranthus viridis', type: 'weed' },
  { code: 'AMARE', commonName: 'Redroot Pigweed', scientificName: 'Amaranthus retroflexus', type: 'weed' },
  { code: 'AMASP', commonName: 'Spiny Amaranth / Kanta Chaulai', scientificName: 'Amaranthus spinosus', type: 'weed' },
  { code: 'CHEAL', commonName: 'Common Lambsquarters / Bathua', scientificName: 'Chenopodium album', type: 'weed' },
  { code: 'CONAR', commonName: 'Field Bindweed / Hirankhuri', scientificName: 'Convolvulus arvensis', type: 'weed' },
  { code: 'TRTPO', commonName: 'Horse Purslane / Santhi / Bishkapra', scientificName: 'Trianthema portulacastrum', type: 'weed' },
  { code: 'PORTU', commonName: 'Common Purslane / Kulfa', scientificName: 'Portulaca oleracea', type: 'weed' },
  { code: 'COMBE', commonName: 'Tropical Spiderwort / Kankawwa', scientificName: 'Commelina benghalensis', type: 'weed' },
  { code: 'SOLNI', commonName: 'Black Nightshade / Makoi', scientificName: 'Solanum nigrum', type: 'weed' },
  { code: 'PHYMN', commonName: 'Sunberry / Rasbhari', scientificName: 'Physalis minima', type: 'weed' },
  { code: 'ARGME', commonName: 'Mexican Prickly Poppy / Satyanashi', scientificName: 'Argemone mexicana', type: 'weed' },
  { code: 'EPHHL', commonName: 'Wild Poinsettia', scientificName: 'Euphorbia geniculata', type: 'weed' },
  { code: 'EPHHI', commonName: 'Asthma Plant / Badi Dudhi', scientificName: 'Euphorbia hirta', type: 'weed' },
  { code: 'CELAR', commonName: 'Silver Cockscomb / Safed Murga', scientificName: 'Celosia argentea', type: 'weed' },
  { code: 'BIDPI', commonName: 'Hairy Beggarticks / Blackjack', scientificName: 'Bidens pilosa', type: 'weed' },
  { code: 'AGECO', commonName: 'Billygoat Weed / Gandhari', scientificName: 'Ageratum conyzoides', type: 'weed' },
  { code: 'XANST', commonName: 'Common Cocklebur / Chhota Gokhru', scientificName: 'Xanthium strumarium', type: 'weed' },
  { code: 'ABUTH', commonName: 'Velvetleaf', scientificName: 'Abutilon theophrasti', type: 'weed' },
  { code: 'ALRSE', commonName: 'Sessile Joyweed', scientificName: 'Alternanthera sessilis', type: 'weed' },
  { code: 'LUDOC', commonName: 'Water Primrose', scientificName: 'Ludwigia octovalvis', type: 'weed' },
  { code: 'SPDZE', commonName: 'Gooseweed', scientificName: 'Sphenoclea zeylanica', type: 'weed' },
  { code: 'MOOVA', commonName: 'Pickerel Weed', scientificName: 'Monochoria vaginalis', type: 'weed' },
  { code: 'ECLAL', commonName: 'False Daisy / Bhringraj', scientificName: 'Eclipta prostrata', type: 'weed' },
  { code: 'TRQPR', commonName: 'Coatbuttons', scientificName: 'Tridax procumbens', type: 'weed' },
  { code: 'LEUAS', commonName: 'Thumbai', scientificName: 'Leucas aspera', type: 'weed' },
  { code: 'SIDAC', commonName: 'Wireweed', scientificName: 'Sida acuta', type: 'weed' },
  { code: 'CASTO', commonName: 'Sicklepod / Chakunda', scientificName: 'Cassia tora', type: 'weed' },
  { code: 'RICCO', commonName: 'Castor Bean', scientificName: 'Ricinus communis', type: 'weed' },

  // --- Diseases (Pathogens) ---
  { code: 'PUCCRE', commonName: 'Crown Rust', scientificName: 'Puccinia coronata', type: 'disease' },
  { code: 'MAGNOR', commonName: 'Rice Blast', scientificName: 'Magnaporthe oryzae', type: 'disease' },
  { code: 'ERYSPH', commonName: 'Powdery Mildew', scientificName: 'Erysiphe pisi', type: 'disease' },
  { code: 'PHYPIN', commonName: 'Late Blight', scientificName: 'Phytophthora infestans', type: 'disease' },
  { code: 'SEPTAP', commonName: 'Septoria Leaf Spot', scientificName: 'Septoria apiicola', type: 'disease' },
  { code: 'BOTRCI', commonName: 'Grey Mould', scientificName: 'Botrytis cinerea', type: 'disease' },
  { code: 'COLLGL', commonName: 'Anthracnose', scientificName: 'Colletotrichum gloeosporioides', type: 'disease' },
  { code: 'FUSASP', commonName: 'Fusarium Wilt', scientificName: 'Fusarium oxysporum', type: 'disease' },

  // --- Pests (Insects/Nematodes) ---
  { code: 'NILALU', commonName: 'Brown Planthopper', scientificName: 'Nilaparvata lugens', type: 'pest' },
  { code: 'SPODFR', commonName: 'Fall Armyworm', scientificName: 'Spodoptera frugiperda', type: 'pest' },
  { code: 'PLUTMA', commonName: 'Diamondback Moth', scientificName: 'Plutella xylostella', type: 'pest' },
  { code: 'BEMITA', commonName: 'Silverleaf Whitefly', scientificName: 'Bemisia tabaci', type: 'pest' },
  { code: 'TETRUR', commonName: 'Two-Spotted Spider Mite', scientificName: 'Tetranychus urticae', type: 'pest' },
  { code: 'APHIFA', commonName: 'Black Bean Aphid', scientificName: 'Aphis fabae', type: 'pest' },
  { code: 'HELIVI', commonName: 'Tobacco Budworm', scientificName: 'Heliothis virescens', type: 'pest' },
  { code: 'MELGIN', commonName: 'Root-Knot Nematode', scientificName: 'Meloidogyne incognita', type: 'pest' },

  // --- Crops ---
  { code: 'ZEAMX', commonName: 'Maize / Corn', scientificName: 'Zea mays', type: 'crop' },
  { code: 'ORYSA', commonName: 'Rice', scientificName: 'Oryza sativa', type: 'crop' },
  { code: 'TRITA', commonName: 'Wheat', scientificName: 'Triticum aestivum', type: 'crop' },
  { code: 'GLYMA', commonName: 'Soybean', scientificName: 'Glycine max', type: 'crop' },
  { code: 'SOLTU', commonName: 'Potato', scientificName: 'Solanum tuberosum', type: 'crop' },
  { code: 'GOSHI', commonName: 'Upland Cotton', scientificName: 'Gossypium hirsutum', type: 'crop' },
  { code: 'HORVX', commonName: 'Barley', scientificName: 'Hordeum vulgare', type: 'crop' },
  { code: 'BRANP', commonName: 'Canola / Oilseed Rape', scientificName: 'Brassica napus', type: 'crop' }
];

export const BBCH_STAGES = [
  { value: '00', label: 'BBCH 00: Dry seed / Winter dormancy', description: 'Germination / Bud development stage' },
  { value: '09', label: 'BBCH 09: Emergence / Bud burst', description: 'Emergence of coleoptile or cotyledons' },
  { value: '10', label: 'BBCH 10: First leaf unfolded', description: 'Leaf development stage' },
  { value: '13', label: 'BBCH 13: 3 leaves unfolded', description: 'Leaf development stage' },
  { value: '19', label: 'BBCH 19: 9 or more leaves unfolded', description: 'Leaf development stage' },
  { value: '20', label: 'BBCH 20: No tillers', description: 'Tillering/Side shoot formation' },
  { value: '25', label: 'BBCH 25: 5 tillers visible', description: 'Tillering stage' },
  { value: '29', label: 'BBCH 29: Main shoot maximum tillers', description: 'End of tillering' },
  { value: '30', label: 'BBCH 30: Beginning of stem elongation', description: 'Stem elongation / Jointing' },
  { value: '39', label: 'BBCH 39: Flag leaf fully unrolled', description: 'End of stem elongation' },
  { value: '49', label: 'BBCH 49: First awns visible', description: 'Booting / Inflorescence protection' },
  { value: '51', label: 'BBCH 51: Inflorescence beginning to emerge', description: 'Heading / Inflorescence emergence' },
  { value: '59', label: 'BBCH 59: Inflorescence fully emerged', description: 'End of heading' },
  { value: '61', label: 'BBCH 61: Beginning of flowering', description: 'Anthesis / Flowering' },
  { value: '65', label: 'BBCH 65: Full flowering', description: '50% of flowers open' },
  { value: '69', label: 'BBCH 69: End of flowering', description: 'Fruit/seed set starting' },
  { value: '71', label: 'BBCH 71: Watery ripe grain / young fruit', description: 'Development of fruit' },
  { value: '79', label: 'BBCH 79: Fruit/grain reached maximum size', description: 'End of fruit development' },
  { value: '83', label: 'BBCH 83: Early dough stage', description: 'Ripening of fruit/seed' },
  { value: '89', label: 'BBCH 89: Fully ripe', description: 'Fruit/seed fully coloured and hard' },
  { value: '92', label: 'BBCH 92: Leaves begin to discolour', description: 'Senescence / Dormancy initiation' },
  { value: '99', label: 'BBCH 99: Harvested product / Dormant plant', description: 'End of crop cycle' }
];

export function lookupEPPO(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  return EPPO_CODES.filter(item => 
    item.code.toLowerCase().includes(q) ||
    item.commonName.toLowerCase().includes(q) ||
    item.scientificName.toLowerCase().includes(q)
  );
}
