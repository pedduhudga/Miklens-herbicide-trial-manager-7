/**
 * Real-time formulation cost calculator linked with the ingredients library.
 * Performs case-insensitive ingredient name matching, flexible property parsing,
 * unit conversions, and per-liter / per-kg batch normalization.
 */

/**
 * Finds a matching ingredient from the library using multi-tier flexible matching:
 * 1. Exact match (case-insensitive & trimmed)
 * 2. Normalized alphanumeric match (removes punctuation, spaces, dashes)
 * 3. Substring match (e.g. "pelargonic acid" matches "Pelargonic Acid 90% EC")
 * 4. Token-based match (e.g. all words match)
 */
export function findIngredientInLibrary(ingName, libraryIngredients = []) {
  if (!ingName || typeof ingName !== 'string') return null;
  const cleanName = ingName.trim().toLowerCase();
  if (!cleanName) return null;
  const cleanAlpha = cleanName.replace(/[^a-z0-9]/g, '');

  const getLibName = (item) => {
    if (!item) return '';
    return String(item.Name || item.name || item.IngredientName || item.ingredientName || '').trim();
  };

  // 1. Direct exact match (case-insensitive)
  for (const item of libraryIngredients) {
    const libName = getLibName(item).toLowerCase();
    if (libName && libName === cleanName) return item;
  }

  // 2. Normalized alphanumeric match
  for (const item of libraryIngredients) {
    const libName = getLibName(item).toLowerCase();
    const libAlpha = libName.replace(/[^a-z0-9]/g, '');
    if (libAlpha.length > 0 && libAlpha === cleanAlpha) return item;
  }

  // 3. Substring match
  for (const item of libraryIngredients) {
    const libName = getLibName(item).toLowerCase();
    const libAlpha = libName.replace(/[^a-z0-9]/g, '');
    if (libAlpha.length >= 3 && cleanAlpha.length >= 3) {
      if (libAlpha.includes(cleanAlpha) || cleanAlpha.includes(libAlpha)) {
        return item;
      }
    }
  }

  // 4. Token-based match
  const tokens = cleanName.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length > 0) {
    for (const item of libraryIngredients) {
      const libName = getLibName(item).toLowerCase();
      if (tokens.every(t => libName.includes(t))) return item;
    }
  }

  return null;
}

/**
 * Parses numeric cost from an ingredient object, handling currency symbols, commas, and string suffixes.
 */
export function parseIngredientCost(item) {
  if (!item) return 0;
  const raw = item.Cost ?? item.cost ?? item.Price ?? item.price ?? item.unitCost ?? item.UnitCost ?? item.rate ?? 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const cleanStr = String(raw).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Converts a quantity from its used unit into the ingredient's library base unit.
 */
export function convertQuantityToBase(usedQty, usedUnitStr, baseUnitStr) {
  const numQty = parseFloat(usedQty);
  if (isNaN(numQty) || numQty <= 0) return 0;

  const used = String(usedUnitStr || 'ml').toLowerCase().trim();
  const base = String(baseUnitStr || 'l').toLowerCase().trim();

  // If units match exactly (e.g. ml to ml, L to L, gm to gm, kg to kg)
  if (used === base) return numQty;

  const isBaseL = ['l', 'litre', 'litres', 'liter', 'liters'].includes(base);
  const isBaseMl = ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(base);
  const isUsedL = ['l', 'litre', 'litres', 'liter', 'liters'].includes(used);
  const isUsedMl = ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(used);

  const isBaseKg = ['kg', 'kilogram', 'kilograms'].includes(base);
  const isBaseGm = ['gm', 'g', 'gram', 'grams'].includes(base);
  const isBaseMg = ['mg', 'milligram', 'milligrams'].includes(base);
  const isUsedKg = ['kg', 'kilogram', 'kilograms'].includes(used);
  const isUsedGm = ['gm', 'g', 'gram', 'grams'].includes(used);
  const isUsedMg = ['mg', 'milligram', 'milligrams'].includes(used);

  // Volume conversions
  if (isBaseL && isUsedMl) return numQty / 1000;
  if (isBaseL && isUsedL) return numQty;
  if (isBaseMl && isUsedL) return numQty * 1000;
  if (isBaseMl && isUsedMl) return numQty;

  // Weight conversions
  if (isBaseKg && isUsedGm) return numQty / 1000;
  if (isBaseKg && isUsedMg) return numQty / 1000000;
  if (isBaseKg && isUsedKg) return numQty;
  if (isBaseGm && isUsedKg) return numQty * 1000;
  if (isBaseGm && isUsedMg) return numQty / 1000;
  if (isBaseGm && isUsedGm) return numQty;
  if (isBaseMg && isUsedGm) return numQty * 1000;
  if (isBaseMg && isUsedKg) return numQty * 1000000;
  if (isBaseMg && isUsedMg) return numQty;

  // Cross volume/weight conversions assuming density ~ 1.0 (standard for aqueous agrochemical formulations)
  if (isBaseL && isUsedGm) return numQty / 1000;
  if (isBaseL && isUsedKg) return numQty;
  if (isBaseMl && isUsedGm) return numQty;
  if (isBaseMl && isUsedKg) return numQty * 1000;
  if (isBaseKg && isUsedMl) return numQty / 1000;
  if (isBaseKg && isUsedL) return numQty;
  if (isBaseGm && isUsedMl) return numQty;
  if (isBaseGm && isUsedL) return numQty * 1000;

  return numQty;
}

/**
 * Calculates detailed formulation cost metrics.
 */
export function getFormulationCostDetails(formulationOrIngs, libraryIngredients = []) {
  let ingsList = [];
  if (Array.isArray(formulationOrIngs)) {
    ingsList = formulationOrIngs;
  } else if (formulationOrIngs && formulationOrIngs.IngredientsJSON) {
    try {
      ingsList = typeof formulationOrIngs.IngredientsJSON === 'string'
        ? JSON.parse(formulationOrIngs.IngredientsJSON)
        : formulationOrIngs.IngredientsJSON;
    } catch (e) {
      ingsList = [];
    }
  }

  if (!Array.isArray(ingsList) || ingsList.length === 0) {
    return {
      totalCost: 0,
      totalBatchCost: 0,
      costPerUnit: 0,
      totalVolumeL: 0,
      totalWeightKg: 0,
      unitLabel: '/ L',
      pricedCount: 0,
      totalCount: 0,
      matchedIngredients: [],
      unpricedIngredients: []
    };
  }

  let totalBatchCost = 0;
  let totalVolumeL = 0;
  let totalWeightKg = 0;
  const matchedIngredients = [];
  const unpricedIngredients = [];
  let validCount = 0;
  let pricedCount = 0;

  ingsList.forEach(ing => {
    if (!ing || !ing.name) return;
    const nameStr = String(ing.name).trim();
    if (!nameStr) return;

    validCount++;
    const rawQty = ing.quantity ?? ing.qty ?? '';
    const usedQty = parseFloat(rawQty);
    const hasValidQty = !isNaN(usedQty) && usedQty > 0;
    const usedUnit = String(ing.unit || '').trim();

    const isVolL = ['l', 'litre', 'litres', 'liter', 'liters'].includes(usedUnit.toLowerCase());
    const isVolMl = ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(usedUnit.toLowerCase());
    const isWtKg = ['kg', 'kilogram', 'kilograms'].includes(usedUnit.toLowerCase());
    const isWtGm = ['gm', 'g', 'gram', 'grams'].includes(usedUnit.toLowerCase());
    const isWtMg = ['mg', 'milligram', 'milligrams'].includes(usedUnit.toLowerCase());

    if (hasValidQty) {
      if (isVolL) totalVolumeL += usedQty;
      else if (isVolMl) totalVolumeL += usedQty / 1000;
      else if (isWtKg) totalWeightKg += usedQty;
      else if (isWtGm) totalWeightKg += usedQty / 1000;
      else if (isWtMg) totalWeightKg += usedQty / 1000000;
    }

    const libIng = findIngredientInLibrary(nameStr, libraryIngredients);
    if (libIng) {
      const baseCost = parseIngredientCost(libIng);
      const baseUnit = String(libIng.Unit || libIng.unit || 'L').trim();

      if (baseCost > 0) {
        pricedCount++;
        let lineCost = 0;
        let qtyInBaseUnit = 0;

        if (hasValidQty) {
          const effectiveUsedUnit = usedUnit || baseUnit;
          qtyInBaseUnit = convertQuantityToBase(usedQty, effectiveUsedUnit, baseUnit);
          lineCost = baseCost * qtyInBaseUnit;
          totalBatchCost += lineCost;
        }

        matchedIngredients.push({
          name: nameStr,
          libraryName: libIng.Name || libIng.name,
          usedQty: hasValidQty ? usedQty : 0,
          usedUnit: usedUnit || baseUnit,
          baseCost,
          baseUnit,
          lineCost: Math.round(lineCost * 100) / 100
        });
      } else {
        unpricedIngredients.push({ name: nameStr, reason: 'Zero or missing cost in library' });
      }
    } else {
      unpricedIngredients.push({ name: nameStr, reason: 'Not found in ingredients library' });
    }
  });

  // Calculate rate per liter / per kg if batch volume / weight is present
  let costPerUnit = totalBatchCost;
  let unitLabel = '/ L';

  if (totalVolumeL > 0) {
    costPerUnit = totalBatchCost / totalVolumeL;
    unitLabel = '/ L';
  } else if (totalWeightKg > 0) {
    costPerUnit = totalBatchCost / totalWeightKg;
    unitLabel = '/ kg';
  }

  return {
    totalCost: Math.round(totalBatchCost * 100) / 100,
    totalBatchCost: Math.round(totalBatchCost * 100) / 100,
    costPerUnit: Math.round(costPerUnit * 100) / 100,
    totalVolumeL,
    totalWeightKg,
    unitLabel,
    pricedCount,
    totalCount: validCount,
    matchedIngredients,
    unpricedIngredients
  };
}

/**
 * Real-time formulation cost calculator linked with the ingredients library.
 * Returns the exact recipe cost calculated from ingredients and their units.
 */
export function calculateFormulationCost(formulationOrIngs, libraryIngredients = []) {
  const details = getFormulationCostDetails(formulationOrIngs, libraryIngredients);
  return details.totalCost;
}

/**
 * Converts Target Active Ingredient (a.i.) application rate into formulated commercial product rate.
 *
 * @param {Object} params
 * @param {number} params.targetAiGramsHa - Target a.i. application rate in grams a.i./ha (e.g. 1080 g/ha)
 * @param {number} params.aiConcentrationPct - Concentration of active ingredient in formulated product % (e.g. 54% or 41%)
 * @param {number} [params.densityKgL=1.0] - Specific gravity / density of liquid formulation (kg/L, default 1.0)
 * @returns {Object} Product requirements:
 *   - productGramsHa: grams product per hectare
 *   - productKgHa: kilograms product per hectare
 *   - productLHa: liters product per hectare (for liquids)
 *   - productMlHa: milliliters product per hectare
 */
export function calculateAiToProductRate({ targetAiGramsHa, aiConcentrationPct, densityKgL = 1.0 }) {
  const targetAi = parseFloat(targetAiGramsHa);
  const conc = parseFloat(aiConcentrationPct);
  const density = parseFloat(densityKgL) || 1.0;

  if (isNaN(targetAi) || targetAi <= 0 || isNaN(conc) || conc <= 0) {
    return { error: 'Target a.i. rate and active concentration % must be positive numbers.' };
  }

  // Grams product/ha = (targetAiGramsHa * 100) / aiConcentrationPct
  const productGramsHa = (targetAi * 100) / conc;
  const productKgHa = productGramsHa / 1000;
  const productLHa = productKgHa / density;
  const productMlHa = productLHa * 1000;

  return {
    targetAiGramsHa: parseFloat(targetAi.toFixed(2)),
    aiConcentrationPct: parseFloat(conc.toFixed(2)),
    densityKgL: parseFloat(density.toFixed(3)),
    productGramsHa: parseFloat(productGramsHa.toFixed(2)),
    productKgHa: parseFloat(productKgHa.toFixed(3)),
    productLHa: parseFloat(productLHa.toFixed(3)),
    productMlHa: parseFloat(productMlHa.toFixed(1))
  };
}

/**
 * Calculates backpack sprayer tank-mix calibration and micro-dosing for small plot research trials.
 *
 * @param {Object} params
 * @param {number} params.plotAreaM2 - Individual plot area in square meters (e.g. 20 m²)
 * @param {number} params.productRateLHa - Product application rate in L/ha (or kg/ha for solid formulations)
 * @param {number} params.waterVolumeLHa - Water carrier volume in L/ha (typically 150-500 L/ha)
 * @param {number} [params.tankCapacityL=16] - Knapsack sprayer tank capacity in Liters (default 16 L)
 * @param {number} [params.replications=4] - Number of replicated plots to be sprayed
 * @returns {Object} Micro-plot spray recipe and tank-mix calibration
 */
export function calculatePlotSprayMix({
  plotAreaM2,
  productRateLHa,
  waterVolumeLHa,
  tankCapacityL = 16,
  replications = 4
}) {
  const area = parseFloat(plotAreaM2);
  const prodRate = parseFloat(productRateLHa);
  const waterRate = parseFloat(waterVolumeLHa);
  const tankCap = parseFloat(tankCapacityL) || 16;
  const reps = parseInt(replications, 10) || 1;

  if (isNaN(area) || area <= 0 || isNaN(prodRate) || prodRate <= 0 || isNaN(waterRate) || waterRate <= 0) {
    return { error: 'Plot area (m²), product rate (L/ha), and water carrier volume (L/ha) must be positive numbers.' };
  }

  // 1 hectare = 10,000 m²
  // Single plot carrier volume in mL
  const plotSprayVolumeMl = (area * waterRate * 1000) / 10000;
  // Single plot chemical dose in mL
  const plotProductDoseMl = (area * prodRate * 1000) / 10000;

  // Total trial requirement across all replications (plus 15% sprayer dead volume / boom priming buffer)
  const totalSprayedAreaM2 = area * reps;
  const netSprayVolumeL = (totalSprayedAreaM2 * waterRate) / 10000;
  const bufferFactor = 1.15; // 15% priming & boom retention safety buffer
  const recommendedMixVolumeL = parseFloat((netSprayVolumeL * bufferFactor).toFixed(2));

  // Concentration in tank: mL product per Liter of water
  const concentrationMlPerL = parseFloat(((prodRate * 1000) / waterRate).toFixed(2));

  // Amount of product to add to a full knapsack tank
  const productPerFullTankMl = parseFloat((concentrationMlPerL * tankCap).toFixed(2));
  // Exact product to add for recommended trial batch volume
  const productForTrialBatchMl = parseFloat((concentrationMlPerL * recommendedMixVolumeL).toFixed(2));

  // Number of plots covered per full knapsack tank
  const plotsPerFullTank = Math.floor((tankCap * 1000) / plotSprayVolumeMl);

  return {
    plotAreaM2: area,
    replications: reps,
    productRateLHa: prodRate,
    waterVolumeLHa: waterRate,
    plotSprayVolumeMl: parseFloat(plotSprayVolumeMl.toFixed(2)),
    plotProductDoseMl: parseFloat(plotProductDoseMl.toFixed(3)),
    concentrationMlPerL,
    recommendedMixVolumeL,
    productForTrialBatchMl,
    tankCapacityL: tankCap,
    productPerFullTankMl,
    plotsPerFullTank,
    mixingInstructions: `To spray ${reps} plot(s) of ${area} m²: Prepare ${recommendedMixVolumeL} L of water solution with ${productForTrialBatchMl} mL of product (${concentrationMlPerL} mL/L). Each plot receives ${plotSprayVolumeMl.toFixed(1)} mL total spray containing ${plotProductDoseMl.toFixed(2)} mL active product.`
  };
}

