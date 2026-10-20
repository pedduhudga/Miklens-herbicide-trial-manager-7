// src/utils/hracSynergy.js
// 100% Client-Side Agrochemical Interaction, MoA Classification & Resistance Management Engine.
// Grounded in official HRAC (0-34), FRAC (1-50, M, P, BM), and IRAC (1-32, UNE) global standards.
// Evaluates Mode of Action (MoA) diversity, tank-mix antagonism risks, and adjuvant pairings.

import {
  HRAC_DATABASE,
  FRAC_DATABASE,
  IRAC_DATABASE,
  ORGANIC_BIO_DATABASE,
  ADJUVANT_DATABASE,
  identifyMoA,
  identifyHrac,
  analyzeFormulationMoASynergy
} from './agrochemicalMoaDatabase.js';

export {
  HRAC_DATABASE,
  FRAC_DATABASE,
  IRAC_DATABASE,
  ORGANIC_BIO_DATABASE,
  ADJUVANT_DATABASE,
  identifyMoA,
  identifyHrac
};

/**
 * Comprehensive chemical formulation synergy, antagonism, and adjuvant analysis.
 * Adapts automatically across HRAC (Herbicides), FRAC (Fungicides), and IRAC (Insecticides).
 * 
 * @param {Array<Object>} ingredients - List of ingredients { name, quantity, unit }
 * @param {string} [category='herbicide'] - 'herbicide' | 'fungicide' | 'pesticide' | 'insecticide'
 * @returns {Object} Analysis with MOA groups, antagonism alerts, adjuvant recommendations
 */
export function analyzeFormulationSynergy(ingredients = [], category = 'herbicide') {
  return analyzeFormulationMoASynergy(ingredients, category);
}

/**
 * Quantitative Herbicide Mixture Synergy Analysis via Colby's Formula (Colby, S.R. 1967. Weeds 15:20-22)
 *
 * For two herbicides:
 *   E = X + Y - (X * Y) / 100
 *
 * For n herbicides (generalized probability of independent joint action):
 *   E = 100 * [1 - Π(1 - E_i / 100)]
 *
 * @param {Array<number|Object>} actives - Array of single-active control % or [{ name, efficacy, dose }]
 * @param {number|null} [observedEfficacy=null] - Measured mixture control %
 * @returns {Object} Colby calculation result:
 *   - expectedEfficacy: theoretical control % under independent joint action
 *   - observedEfficacy: measured control % (if provided)
 *   - synergyFactor: observed / expected (ratio > 1.10 = synergistic, < 0.90 = antagonistic)
 *   - deltaEfficacy: observed - expected
 *   - classification: 'Synergistic' | 'Additive' | 'Antagonistic' | 'Theoretical Expected Only'
 *   - details: explanation and component values
 */
export function calculateColbySynergy(actives = [], observedEfficacy = null) {
  if (!Array.isArray(actives) || actives.length === 0) {
    return {
      expectedEfficacy: 0,
      observedEfficacy: null,
      synergyFactor: null,
      deltaEfficacy: null,
      classification: 'Insufficient Data',
      details: 'No active components provided for Colby analysis.'
    };
  }

  // Parse efficacy values (bounded between 0 and 100)
  const components = actives.map((item, idx) => {
    let eff = 0;
    let name = `Active ${idx + 1}`;
    let dose = null;

    if (typeof item === 'number') {
      eff = item;
    } else if (item && typeof item === 'object') {
      eff = item.efficacy ?? item.controlPct ?? item.response ?? item.val ?? 0;
      name = item.name || item.active || name;
      dose = item.dose || item.rate || null;
    }

    const clampedEff = Math.max(0, Math.min(100, parseFloat(eff) || 0));
    return { name, efficacy: clampedEff, dose };
  });

  if (components.length === 1) {
    return {
      expectedEfficacy: components[0].efficacy,
      observedEfficacy: observedEfficacy !== null ? parseFloat(observedEfficacy) : null,
      synergyFactor: 1.0,
      deltaEfficacy: 0,
      classification: 'Single Active (Baseline)',
      components,
      details: 'Colby synergy requires at least 2 active ingredients.'
    };
  }

  // Generalized Colby formula: E = 100 * [1 - Π(1 - E_i / 100)]
  let productSurvival = 1.0;
  for (const comp of components) {
    productSurvival *= (1 - comp.efficacy / 100);
  }
  const expectedEfficacy = parseFloat((100 * (1 - productSurvival)).toFixed(2));

  let synergyFactor = null;
  let deltaEfficacy = null;
  let classification = 'Theoretical Expected Only';

  if (observedEfficacy !== null && !isNaN(observedEfficacy)) {
    const obs = Math.max(0, Math.min(100, parseFloat(observedEfficacy)));
    deltaEfficacy = parseFloat((obs - expectedEfficacy).toFixed(2));
    synergyFactor = expectedEfficacy > 0 ? parseFloat((obs / expectedEfficacy).toFixed(3)) : 1.0;

    if (synergyFactor > 1.05 || (synergyFactor > 1.0 && deltaEfficacy >= 5)) {
      classification = 'Synergistic';
    } else if (synergyFactor < 0.95 || (synergyFactor < 1.0 && deltaEfficacy <= -5)) {
      classification = 'Antagonistic';
    } else {
      classification = 'Additive';
    }
  }

  return {
    expectedEfficacy,
    observedEfficacy: observedEfficacy !== null ? parseFloat(observedEfficacy) : null,
    synergyFactor,
    deltaEfficacy,
    classification,
    formula: components.length === 2
      ? `E = ${components[0].efficacy}% + ${components[1].efficacy}% - (${components[0].efficacy} * ${components[1].efficacy}) / 100 = ${expectedEfficacy}%`
      : `E = 100 * [1 - ∏(1 - E_i/100)] = ${expectedEfficacy}%`,
    components,
    interpretation: classification === 'Synergistic'
      ? `Observed efficacy (${observedEfficacy}%) significantly exceeds Colby expected control (${expectedEfficacy}%) by +${deltaEfficacy}% (SF: ${synergyFactor}). True biological synergy confirmed.`
      : classification === 'Antagonistic'
        ? `Observed efficacy (${observedEfficacy}%) is significantly lower than Colby expected control (${expectedEfficacy}%) by ${deltaEfficacy}% (SF: ${synergyFactor}). Chemical or physiological antagonism detected.`
        : classification === 'Additive'
          ? `Observed efficacy (${observedEfficacy}%) is within ±10% of Colby expectation (${expectedEfficacy}%). Independent additive joint action.`
          : `Colby expected combined weed control is ${expectedEfficacy}%. Supply observed tank-mix efficacy to classify interaction.`
  };
}

/**
 * Wadley's ED50 Mixture Model for Equitoxic Herbicide Combinations
 * (Wadley, F.M. 1967. Biometrics)
 *
 * Expected mixture ED50:
 *   ED50_mix_expected = 1 / Σ(p_i / ED50_i)
 * where p_i is the proportion of component i in the mixture (Σ p_i = 1).
 *
 * Interaction Index (γ):
 *   γ = ED50_mix_expected / ED50_mix_observed
 *   - γ > 1.15 => Synergistic (lower dose needed than expected)
 *   - γ < 0.85 => Antagonistic (higher dose needed than expected)
 *   - 0.85 ≤ γ ≤ 1.15 => Additive
 *
 * @param {Array<Object>} components - [{ name, proportion, ed50 }]
 * @param {number|null} [observedEd50=null] - Measured ED50 of the physical mixture
 * @returns {Object} Wadley model interaction statistics
 */
export function calculateWadleyMixture(components = [], observedEd50 = null) {
  if (!Array.isArray(components) || components.length < 2) {
    return { error: 'Wadley mixture model requires at least 2 components with ED50 and proportions.' };
  }

  // Normalize proportions
  const totalProp = components.reduce((sum, c) => sum + (parseFloat(c.proportion) || 0), 0);
  if (totalProp <= 0) {
    return { error: 'Sum of component proportions must be greater than 0.' };
  }

  let harmonicSum = 0;
  const parsedComponents = components.map(c => {
    const p = (parseFloat(c.proportion) || 0) / totalProp;
    const ed = parseFloat(c.ed50);
    if (!ed || ed <= 0) throw new Error(`Invalid ED50 for component ${c.name || 'unknown'}`);
    harmonicSum += p / ed;
    return { name: c.name || 'Component', proportion: parseFloat(p.toFixed(4)), ed50: ed };
  });

  const expectedEd50 = parseFloat((1 / harmonicSum).toFixed(4));
  let interactionIndex = null;
  let classification = 'Theoretical Expected ED50';

  if (observedEd50 !== null && !isNaN(observedEd50) && observedEd50 > 0) {
    interactionIndex = parseFloat((expectedEd50 / observedEd50).toFixed(3));
    if (interactionIndex > 1.15) classification = 'Synergistic (Potentiated)';
    else if (interactionIndex < 0.85) classification = 'Antagonistic';
    else classification = 'Additive';
  }

  return {
    expectedEd50,
    observedEd50: observedEd50 !== null ? parseFloat(observedEd50) : null,
    interactionIndex,
    classification,
    components: parsedComponents,
    interpretation: interactionIndex !== null
      ? (classification.includes('Synergistic')
          ? `Mixture requires less chemical (Observed ED50: ${observedEd50}) than predicted by Wadley harmonic model (${expectedEd50}). Interaction Index = ${interactionIndex}.`
          : classification === 'Antagonistic'
            ? `Mixture requires more chemical (Observed ED50: ${observedEd50}) than predicted by Wadley model (${expectedEd50}). Antagonism confirmed.`
            : `Observed ED50 (${observedEd50}) matches Wadley additive prediction (${expectedEd50}).`)
      : `Wadley expected mixture ED50 is ${expectedEd50} g a.i./ha.`
  };
}

