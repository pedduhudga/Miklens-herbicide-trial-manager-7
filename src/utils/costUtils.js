/**
 * Real-time formulation cost calculator linked with the ingredients library.
 * Performs case-insensitive ingredient name matching and unit conversions.
 */
export function calculateFormulationCost(formulationOrIngs, libraryIngredients = []) {
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

  if (!Array.isArray(ingsList) || ingsList.length === 0) return 0;

  let totalCost = 0;

  ingsList.forEach(ing => {
    if (!ing || !ing.name || ing.quantity === undefined || ing.quantity === null || ing.quantity === '') return;
    const ingNameClean = String(ing.name).toLowerCase().trim();
    const usedQty = parseFloat(ing.quantity);
    if (isNaN(usedQty) || usedQty <= 0) return;

    const usedUnit = String(ing.unit || 'ml').toLowerCase().trim();

    // 1. Find matching ingredient in state.ingredients library
    // Case-insensitive & normalized name lookup
    const libIng = (libraryIngredients || []).find(i => {
      if (!i || !i.Name) return false;
      const libNameClean = String(i.Name).toLowerCase().trim();
      if (libNameClean === ingNameClean) return true;
      // Strip special characters & spaces for fuzzy match (e.g. "acetic-acid" vs "acetic acid")
      const normLib = libNameClean.replace(/[^a-z0-9]/g, '');
      const normIng = ingNameClean.replace(/[^a-z0-9]/g, '');
      return normLib.length > 0 && normLib === normIng;
    });

    if (libIng) {
      const baseCost = parseFloat(libIng.Cost);
      if (isNaN(baseCost) || baseCost <= 0) return;

      const baseUnit = String(libIng.Unit || 'L').toLowerCase().trim();
      let qtyInBaseUnit = usedQty;

      // 2. Unit conversion logic
      const isBaseL = ['l', 'litre', 'litres', 'liter', 'liters'].includes(baseUnit);
      const isBaseMl = ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(baseUnit);
      const isUsedL = ['l', 'litre', 'litres', 'liter', 'liters'].includes(usedUnit);
      const isUsedMl = ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(usedUnit);

      const isBaseKg = ['kg', 'kilogram', 'kilograms'].includes(baseUnit);
      const isBaseGm = ['gm', 'g', 'gram', 'grams'].includes(baseUnit);
      const isBaseMg = ['mg', 'milligram', 'milligrams'].includes(baseUnit);

      const isUsedKg = ['kg', 'kilogram', 'kilograms'].includes(usedUnit);
      const isUsedGm = ['gm', 'g', 'gram', 'grams'].includes(usedUnit);
      const isUsedMg = ['mg', 'milligram', 'milligrams'].includes(usedUnit);

      // Volume conversions
      if (isBaseL && isUsedMl) {
        qtyInBaseUnit = usedQty / 1000;
      } else if (isBaseMl && isUsedL) {
        qtyInBaseUnit = usedQty * 1000;
      }
      // Weight conversions
      else if (isBaseKg && isUsedGm) {
        qtyInBaseUnit = usedQty / 1000;
      } else if (isBaseKg && isUsedMg) {
        qtyInBaseUnit = usedQty / 1000000;
      } else if (isBaseGm && isUsedKg) {
        qtyInBaseUnit = usedQty * 1000;
      } else if (isBaseGm && isUsedMg) {
        qtyInBaseUnit = usedQty / 1000;
      } else if (isBaseMg && isUsedGm) {
        qtyInBaseUnit = usedQty * 1000;
      } else if (isBaseMg && isUsedKg) {
        qtyInBaseUnit = usedQty * 1000000;
      }

      totalCost += baseCost * qtyInBaseUnit;
    }
  });

  return totalCost;
}
