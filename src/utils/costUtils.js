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
