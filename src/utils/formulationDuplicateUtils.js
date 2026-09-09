import { safeJsonParse } from './helpers.js';

/**
 * Normalizes an ingredient name for strict or fuzzy comparison.
 * Trims whitespace, lowercases, and removes punctuation / special characters.
 */
export function normalizeIngredientName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Converts a quantity and unit into standard base units:
 * - Volume (ml, l, cc, litre) -> standard: 'ml'
 * - Weight (gm, g, kg, mg) -> standard: 'gm'
 * - Other/Unknown -> unchanged with normalized unit
 */
export function normalizeQuantityAndUnit(qty, unit) {
  const num = parseFloat(qty);
  if (isNaN(num)) return { qty: 0, unit: '' };

  const u = String(unit || 'ml').toLowerCase().trim();

  // Volume conversions to 'ml'
  if (['l', 'litre', 'litres', 'liter', 'liters'].includes(u)) {
    return { qty: Math.round(num * 1000 * 1000) / 1000, unit: 'ml' };
  }
  if (['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc'].includes(u)) {
    return { qty: Math.round(num * 1000) / 1000, unit: 'ml' };
  }

  // Weight conversions to 'gm'
  if (['kg', 'kilogram', 'kilograms'].includes(u)) {
    return { qty: Math.round(num * 1000 * 1000) / 1000, unit: 'gm' };
  }
  if (['mg', 'milligram', 'milligrams'].includes(u)) {
    return { qty: Math.round((num / 1000) * 1000) / 1000, unit: 'gm' };
  }
  if (['gm', 'g', 'gram', 'grams'].includes(u)) {
    return { qty: Math.round(num * 1000) / 1000, unit: 'gm' };
  }

  return { qty: Math.round(num * 1000) / 1000, unit: u };
}

/**
 * Parses and normalizes an ingredient array or JSON string.
 * Returns a canonical sorted list of ingredients: [{ normName, origName, qty, unit, rawQty, rawUnit }]
 */
export function canonicalizeIngredients(ingredientsInput) {
  let list = [];
  if (Array.isArray(ingredientsInput)) {
    list = ingredientsInput;
  } else if (typeof ingredientsInput === 'string') {
    list = safeJsonParse(ingredientsInput, []);
  }

  if (!Array.isArray(list)) return [];

  const normalized = list
    .filter(item => item && (item.name || item.Name) && String(item.name || item.Name).trim() !== '')
    .map(item => {
      const origName = String(item.name || item.Name || '').trim();
      const normName = normalizeIngredientName(origName);
      const rawQty = item.quantity !== undefined ? item.quantity : (item.Quantity !== undefined ? item.Quantity : '');
      const rawUnit = item.unit || item.Unit || 'ml';
      const { qty, unit } = normalizeQuantityAndUnit(rawQty, rawUnit);

      return {
        normName,
        origName,
        qty,
        unit,
        rawQty,
        rawUnit
      };
    })
    .filter(item => item.normName.length > 0);

  // Sort deterministically by normalized name for exact multi-ingredient order-independent comparison
  return normalized.sort((a, b) => a.normName.localeCompare(b.normName));
}

/**
 * Checks if two canonical ingredient arrays are an EXACT duplicate recipe
 * (identical ingredients, quantities, and compatible units).
 * Tolerance for floating-point quantities: ±0.01
 */
export function areIngredientsExactDuplicate(canonA, canonB, tolerance = 0.01) {
  if (!Array.isArray(canonA) || !Array.isArray(canonB)) return false;
  if (canonA.length === 0 || canonB.length === 0) return false;
  if (canonA.length !== canonB.length) return false;

  for (let i = 0; i < canonA.length; i++) {
    const itemA = canonA[i];
    const itemB = canonB[i];

    if (itemA.normName !== itemB.normName) {
      return false;
    }

    if (itemA.unit !== itemB.unit) {
      return false;
    }

    if (Math.abs(itemA.qty - itemB.qty) > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Finds an existing formulation in the database that has the exact same ingredients & quantities.
 *
 * @param {Array|string} candidateIngredients - The proposed ingredients
 * @param {Array} formulations - All formulations from state.formulations
 * @param {string} category - Active category (e.g. 'herbicide')
 * @param {string|number} [excludeId] - Formulation ID to exclude (e.g. when editing an existing formula)
 * @returns {Object|null} The matching formulation or null
 */
export function findDuplicateFormulation(candidateIngredients, formulations = [], category = 'herbicide', excludeId = null) {
  const candidateCanon = canonicalizeIngredients(candidateIngredients);
  if (candidateCanon.length === 0) return null;

  const targetCategory = String(category || 'herbicide').toLowerCase().trim();

  for (const form of formulations) {
    if (!form) continue;
    if (excludeId && String(form.ID || form.id) === String(excludeId)) continue;

    const formCat = String(form.Category || 'herbicide').toLowerCase().trim();
    if (formCat !== targetCategory) continue;

    const formCanon = canonicalizeIngredients(form.IngredientsJSON || form.Ingredients);
    if (formCanon.length === 0) continue;

    if (areIngredientsExactDuplicate(candidateCanon, formCanon)) {
      return form;
    }
  }

  return null;
}

/**
 * Scans the entire formulations collection and detects all duplicate recipes.
 * Returns a Map of formId -> Array of duplicate formulations.
 */
export function detectAllDuplicateFormulations(formulations = [], category = 'herbicide') {
  const targetCategory = String(category || 'herbicide').toLowerCase().trim();
  const categoryForms = (formulations || []).filter(
    f => f && String(f.Category || 'herbicide').toLowerCase().trim() === targetCategory
  );

  const duplicateGroups = [];
  const handledIds = new Set();

  for (let i = 0; i < categoryForms.length; i++) {
    const formA = categoryForms[i];
    const idA = String(formA.ID || formA.id);
    if (handledIds.has(idA)) continue;

    const canonA = canonicalizeIngredients(formA.IngredientsJSON || formA.Ingredients);
    if (canonA.length === 0) continue;

    const matches = [formA];

    for (let j = i + 1; j < categoryForms.length; j++) {
      const formB = categoryForms[j];
      const idB = String(formB.ID || formB.id);
      if (handledIds.has(idB)) continue;

      const canonB = canonicalizeIngredients(formB.IngredientsJSON || formB.Ingredients);
      if (canonB.length === 0) continue;

      if (areIngredientsExactDuplicate(canonA, canonB)) {
        matches.push(formB);
        handledIds.add(idB);
      }
    }

    if (matches.length > 1) {
      handledIds.add(idA);
      duplicateGroups.push(matches);
    }
  }

  // Create a fast lookup map: formId -> other duplicates in the group
  const duplicateLookup = new Map();
  duplicateGroups.forEach(group => {
    group.forEach(form => {
      const id = String(form.ID || form.id);
      duplicateLookup.set(id, group.filter(f => String(f.ID || f.id) !== id));
    });
  });

  return duplicateLookup;
}

/**
 * Checks if a trial duplication would result in an exact redundant trial
 * (same formulation + same dosage + same target weed / species in the same category).
 *
 * @param {Object} candidate - { formulationName, formulationId, dosage, weedTarget, targetWeed }
 * @param {Array} trials - Existing trials list
 * @param {string} category - Active category
 * @param {string|number} [excludeTrialId] - ID of current trial being edited/duplicated
 * @returns {Object|null} Matching existing trial or null
 */
export function findDuplicateTrial(candidate, trials = [], category = 'herbicide', excludeTrialId = null) {
  if (!candidate) return null;

  const targetCategory = String(category || 'herbicide').toLowerCase().trim();
  const candFormName = String(candidate.formulationName || candidate.FormulationName || '').trim().toLowerCase();
  const candFormId = String(candidate.formulationId || candidate.FormulationID || '').trim();
  const candDosage = String(candidate.dosage || candidate.Dosage || '').trim().toLowerCase();
  const candTarget = String(
    candidate.targetWeed || candidate.WeedTarget || candidate.WeedSpecies || candidate.Target || ''
  ).trim().toLowerCase();

  if (!candFormName && !candFormId) return null;

  for (const trial of trials) {
    if (!trial) continue;
    if (excludeTrialId && String(trial.ID || trial.id) === String(excludeTrialId)) continue;

    const trialCat = String(trial.Category || 'herbicide').toLowerCase().trim();
    if (trialCat !== targetCategory) continue;

    const tFormName = String(trial.FormulationName || trial.Product || '').trim().toLowerCase();
    const tFormId = String(trial.FormulationID || trial.formulationId || '').trim();
    const tDosage = String(trial.Dosage || '').trim().toLowerCase();
    const tTarget = String(trial.WeedTarget || trial.WeedSpecies || trial.Target || '').trim().toLowerCase();

    const formMatches = (candFormId && tFormId && candFormId === tFormId) || (candFormName && tFormName && candFormName === tFormName);
    if (!formMatches) continue;

    // Compare dosage (normalized, ignoring spaces)
    const normCandDosage = candDosage.replace(/\s+/g, '');
    const normTDosage = tDosage.replace(/\s+/g, '');
    const dosageMatches = normCandDosage === normTDosage || (!normCandDosage && !normTDosage);

    // Compare target (normalized)
    const normCandTarget = candTarget.replace(/[^a-z0-9]/g, '');
    const normTTarget = tTarget.replace(/[^a-z0-9]/g, '');
    const targetMatches = !normCandTarget || !normTTarget || normCandTarget === normTTarget;

    if (dosageMatches && targetMatches) {
      return trial;
    }
  }

  return null;
}
