import { describe, it, expect } from 'vitest';
import {
  normalizeIngredientName,
  normalizeQuantityAndUnit,
  canonicalizeIngredients,
  areIngredientsExactDuplicate,
  findDuplicateFormulation,
  detectAllDuplicateFormulations,
  findDuplicateTrial
} from '../utils/formulationDuplicateUtils.js';
import { predictFormulaFeasibility } from '../utils/feasibilityEngine.js';

describe('Formulation Duplicate Utils', () => {
  it('normalizes ingredient names correctly', () => {
    expect(normalizeIngredientName(' Glyphosate 41% SL ')).toBe('glyphosate41sl');
    expect(normalizeIngredientName('2,4-D Ethyl Ester')).toBe('24dethylester');
    expect(normalizeIngredientName('')).toBe('');
  });

  it('normalizes units and quantities (volume and weight)', () => {
    // 1 L = 1000 ml
    expect(normalizeQuantityAndUnit(1, 'L')).toEqual({ qty: 1000, unit: 'ml' });
    expect(normalizeQuantityAndUnit('500', 'ml')).toEqual({ qty: 500, unit: 'ml' });
    // 1.5 kg = 1500 gm
    expect(normalizeQuantityAndUnit(1.5, 'kg')).toEqual({ qty: 1500, unit: 'gm' });
    expect(normalizeQuantityAndUnit('250', 'gm')).toEqual({ qty: 250, unit: 'gm' });
  });

  it('detects exact duplicate ingredient lists regardless of order', () => {
    const listA = [
      { name: 'Glyphosate 41%', quantity: '1', unit: 'L' },
      { name: 'Adjuvant Silwet', quantity: '100', unit: 'ml' }
    ];
    const listB = [
      { name: 'adjuvant silwet', quantity: '100', unit: 'ml' },
      { name: 'GLYPHOSATE 41%', quantity: '1000', unit: 'ml' } // 1000 ml == 1 L
    ];

    const canonA = canonicalizeIngredients(listA);
    const canonB = canonicalizeIngredients(listB);

    expect(areIngredientsExactDuplicate(canonA, canonB)).toBe(true);
  });

  it('distinguishes different quantities or ingredients as non-duplicate', () => {
    const listA = [{ name: 'Glyphosate', quantity: 500, unit: 'ml' }];
    const listDifferentQty = [{ name: 'Glyphosate', quantity: 1000, unit: 'ml' }];
    const listDifferentIng = [{ name: 'Atrazine', quantity: 500, unit: 'ml' }];

    expect(areIngredientsExactDuplicate(canonicalizeIngredients(listA), canonicalizeIngredients(listDifferentQty))).toBe(false);
    expect(areIngredientsExactDuplicate(canonicalizeIngredients(listA), canonicalizeIngredients(listDifferentIng))).toBe(false);
  });

  it('finds duplicate formulation in collection while respecting category and excludeId', () => {
    const existingForms = [
      {
        ID: '101',
        Name: 'Standard Gly-Adjuvant',
        Category: 'herbicide',
        IngredientsJSON: JSON.stringify([
          { name: 'Glyphosate', quantity: '500', unit: 'ml' },
          { name: 'Silwet', quantity: '50', unit: 'ml' }
        ])
      },
      {
        ID: '102',
        Name: 'Fungicide Mix',
        Category: 'fungicide',
        IngredientsJSON: JSON.stringify([
          { name: 'Glyphosate', quantity: '500', unit: 'ml' },
          { name: 'Silwet', quantity: '50', unit: 'ml' }
        ])
      }
    ];

    const proposed = [
      { name: 'silwet', quantity: '50', unit: 'ml' },
      { name: 'glyphosate', quantity: '0.5', unit: 'L' } // 0.5 L == 500 ml
    ];

    // Matches ID 101 in herbicide
    const match = findDuplicateFormulation(proposed, existingForms, 'herbicide');
    expect(match).not.toBeNull();
    expect(match.ID).toBe('101');

    // Exclude self edit
    const matchSelf = findDuplicateFormulation(proposed, existingForms, 'herbicide', '101');
    expect(matchSelf).toBeNull();

    // Isolated by category
    const matchFungicide = findDuplicateFormulation(proposed, existingForms, 'fungicide');
    expect(matchFungicide.ID).toBe('102');
  });

  it('detectAllDuplicateFormulations groups duplicate formulations correctly', () => {
    const forms = [
      { ID: '1', Name: 'Formula A', Category: 'herbicide', IngredientsJSON: JSON.stringify([{ name: 'ActiveX', quantity: 100, unit: 'ml' }]) },
      { ID: '2', Name: 'Formula A Copy', Category: 'herbicide', IngredientsJSON: JSON.stringify([{ name: 'activex', quantity: 100, unit: 'ml' }]) },
      { ID: '3', Name: 'Formula B', Category: 'herbicide', IngredientsJSON: JSON.stringify([{ name: 'ActiveY', quantity: 200, unit: 'ml' }]) }
    ];

    const dupMap = detectAllDuplicateFormulations(forms, 'herbicide');
    expect(dupMap.has('1')).toBe(true);
    expect(dupMap.get('1')[0].ID).toBe('2');
    expect(dupMap.has('2')).toBe(true);
    expect(dupMap.get('2')[0].ID).toBe('1');
    expect(dupMap.has('3')).toBe(false);
  });

  it('findDuplicateTrial detects redundant trials with same formulation, dosage, and target', () => {
    const trials = [
      {
        ID: 'TR-1',
        FormulationName: 'Glycyl',
        Dosage: '10 ml/L',
        WeedTarget: 'Bermudagrass',
        Category: 'herbicide'
      }
    ];

    const candidateSame = {
      formulationName: 'glycyl',
      dosage: '10ml/L',
      targetWeed: 'Bermuda grass'
    };

    const candidateDiffDosage = {
      formulationName: 'Glycyl',
      dosage: '15 ml/L',
      targetWeed: 'Bermudagrass'
    };

    expect(findDuplicateTrial(candidateSame, trials, 'herbicide')).not.toBeNull();
    expect(findDuplicateTrial(candidateDiffDosage, trials, 'herbicide')).toBeNull();
  });
});

describe('Feasibility Engine', () => {
  it('predicts high efficacy and broad spectrum for synergistic combination', () => {
    const candidateRecipe = [
      { name: 'Glyphosate', quantity: 500, unit: 'ml' }, // Group 9
      { name: 'Oxyfluorfen', quantity: 100, unit: 'ml' }  // Group 14
    ];

    const report = predictFormulaFeasibility(candidateRecipe, [], 'Bermudagrass');

    expect(report.feasible).toBe(true);
    expect(report.predictedEfficacyAvg).toBeGreaterThanOrEqual(85);
    expect(report.susceptibleWeeds.length).toBeGreaterThan(0);
    // Should identify bermudagrass as susceptible under glyphosate
    expect(report.susceptibleWeeds.some(w => w.includes('Cynodon') || w.includes('Bermuda'))).toBe(true);
    expect(report.synergies.length).toBeGreaterThan(0);
  });

  it('identifies antagonism risk for ACCase and Auxin combinations', () => {
    const antagonisticRecipe = [
      { name: 'Clethodim', quantity: 100, unit: 'ml' }, // Group 1 ACCase
      { name: '2,4-D', quantity: 200, unit: 'ml' }       // Group 4 Auxin
    ];

    const report = predictFormulaFeasibility(antagonisticRecipe, []);
    expect(report.antagonismAlerts.length).toBeGreaterThan(0);
    expect(report.overallRating).toContain('Antagonism');
  });
});
