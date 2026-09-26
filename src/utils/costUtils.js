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
  const used = String(usedUnitStr || 'ml').toLowerCase().trim();
  const base = String(baseUnitStr || 'L').toLowerCase().trim();

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

  if (isBaseL && isUsedMl) return usedQty / 1000;
  if (isBaseMl && isUsedL) return usedQty * 1000;
  if (isBaseKg && isUsedGm) return usedQty / 1000;
  if (isBaseKg && isUsedMg) return usedQty / 1000000;
  if (isBaseGm && isUsedKg) return usedQty * 1000;
  if (isBaseGm && isUsedMg) return usedQty / 1000;
  if (isBaseMg && isUsedGm) return usedQty * 1000;
  if (isBaseMg && isUsedKg) return usedQty * 1000000;

  return usedQty;
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
      costPerUnit: 0,
      totalBatchCost: 0,
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

  ingsList.forEach(ing => {
    if (!ing || !ing.name) return;
    const nameStr = String(ing.name).trim();
    if (!nameStr) return;

    validCount++;
    const usedQty = parseFloat(ing.quantity);
    const usedUnit = String(ing.unit || 'ml').toLowerCase().trim();

    const isVolL = ['l', 'litre', 'litres', 'liter', 'liters'].includes(usedUnit);
    const isVolMl = ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(usedUnit);
    const isWtKg = ['kg', 'kilogram', 'kilograms'].includes(usedUnit);
    const isWtGm = ['gm', 'g', 'gram', 'grams'].includes(usedUnit);
    const isWtMg = ['mg', 'milligram', 'milligrams'].includes(usedUnit);

    if (!isNaN(usedQty) && usedQty > 0) {
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

      if (baseCost > 0 && !isNaN(usedQty) && usedQty > 0) {
        const qtyInBaseUnit = convertQuantityToBase(usedQty, usedUnit, baseUnit);
        const lineCost = baseCost * qtyInBaseUnit;
        totalBatchCost += lineCost;

        matchedIngredients.push({
          name: nameStr,
          libraryName: libIng.Name || libIng.name,
          usedQty,
          usedUnit,
          baseCost,
          baseUnit,
          lineCost
        });
      } else {
        unpricedIngredients.push({ name: nameStr, reason: 'Zero or missing cost in library' });
      }
    } else {
      unpricedIngredients.push({ name: nameStr, reason: 'Not found in ingredients library' });
    }
  });

  // Per-liter or per-kg batch normalization
  // If the recipe specifies volume:
  // - If user entered 0.400 ml, 0.200 ml, etc. (total volume = 1 ml = 0.001 L), cost per Liter = batchCost / 0.001 L
  // - If user entered 400 ml, 200 ml, etc. (total volume = 1000 ml = 1.0 L), cost per Liter = batchCost / 1.0 L
  // - If user entered 0.4 L, 0.2 L, etc. (total volume = 1.0 L), cost per Liter = batchCost / 1.0 L
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
    costPerUnit: Math.round(costPerUnit * 100) / 100,
    totalBatchCost: Math.round(totalBatchCost * 100) / 100,
    totalVolumeL,
    totalWeightKg,
    unitLabel,
    pricedCount: matchedIngredients.length,
    totalCount: validCount,
    matchedIngredients,
    unpricedIngredients
  };
}

/**
 * Real-time formulation cost calculator linked with the ingredients library.
 * Returns cost per unit (per Liter by default).
 */
export function calculateFormulationCost(formulationOrIngs, libraryIngredients = []) {
  const details = getFormulationCostDetails(formulationOrIngs, libraryIngredients);
  return details.costPerUnit;
}
