import { describe, it, expect } from 'vitest';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { calculateDAA } from '../utils/dateUtils.js';

describe('Mass Plant Height & Observation Entry System', () => {
  it('correctly creates a new observation with plant height and metric values', () => {
    const trial = {
      ID: 'plot-101',
      FormulationName: 'NutriGrow Max',
      PlotNumber: '101',
      Replication: 1,
      Category: 'nutrition',
      EfficacyDataJSON: '[]',
    };

    const efficacyData = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), 'nutrition', true);
    const date = '2026-05-15';
    const batchDaa = 14;
    const heightVal = 32.5;
    const metricVal = 85.0; // Vigor %
    const noteText = 'Healthy vigorous vegetative growth';
    const bbchStage = 'BBCH 22';

    const obs = {
      daa: Number(batchDaa),
      date,
      treatment: trial.FormulationName,
      plot: trial.PlotNumber,
      rep: trial.Replication,
      notes: noteText,
      bbchStage,
      'Plant Height': heightVal,
      plantHeight: heightVal,
      plant_height: heightVal,
      potHeights: [heightVal],
      vigor: metricVal,
    };
    efficacyData.push(obs);

    expect(efficacyData).toHaveLength(1);
    expect(efficacyData[0]['Plant Height']).toBe(32.5);
    expect(efficacyData[0].plantHeight).toBe(32.5);
    expect(efficacyData[0].plant_height).toBe(32.5);
    expect(efficacyData[0].potHeights).toEqual([32.5]);
    expect(efficacyData[0].vigor).toBe(85.0);
    expect(efficacyData[0].daa).toBe(14);
    expect(efficacyData[0].date).toBe('2026-05-15');
    expect(efficacyData[0].bbchStage).toBe('BBCH 22');
  });

  it('merges mass plant height into an existing observation without overwriting existing data or photos', () => {
    const existingObs = {
      daa: 7,
      date: '2026-05-08',
      treatment: 'Biostimulant X',
      plot: '102',
      rep: 1,
      vigor: 70,
      photoUrl: 'https://example.com/photo.jpg',
      notes: 'Initial check',
    };

    const efficacyData = [existingObs];
    const batchDaa = 7;
    const heightVal = 24.8;
    const newNote = 'Field walk height measurement';

    let obs = efficacyData.find(o => Number(o.daa) === Number(batchDaa));
    expect(obs).toBeDefined();

    // Update with plant height
    obs['Plant Height'] = heightVal;
    obs.plantHeight = heightVal;
    obs.plant_height = heightVal;
    obs.potHeights = [heightVal];
    obs.notes = `${obs.notes} | ${newNote}`;

    expect(efficacyData).toHaveLength(1);
    expect(efficacyData[0].vigor).toBe(70); // Preserved
    expect(efficacyData[0].photoUrl).toBe('https://example.com/photo.jpg'); // Preserved
    expect(efficacyData[0]['Plant Height']).toBe(24.8);
    expect(efficacyData[0].potHeights).toEqual([24.8]);
    expect(efficacyData[0].notes).toBe('Initial check | Field walk height measurement');
  });

  it('calculates DAA correctly against project start date', () => {
    const startDate = '2026-05-01';
    const observationDate = '2026-05-15';
    const daa = calculateDAA(observationDate, startDate);
    expect(daa).toBe(14);
  });

  it('sorts pots in physical greenhouse walk order (Column stripe: Col 1 Row 1..n, Col 2 Row 1..n)', () => {
    const testPots = [
      { ID: '1', PotCol: 2, PotRow: 1, PlotNumber: '201' },
      { ID: '2', PotCol: 1, PotRow: 2, PlotNumber: '102' },
      { ID: '3', PotCol: 1, PotRow: 1, PlotNumber: '101' },
      { ID: '4', PotCol: 2, PotRow: 2, PlotNumber: '202' },
    ];

    const sortedByWalk = [...testPots].sort((a, b) => {
      const colA = a.PotCol != null ? parseInt(a.PotCol, 10) : 999;
      const colB = b.PotCol != null ? parseInt(b.PotCol, 10) : 999;
      if (colA !== colB) return colA - colB;
      const rowA = a.PotRow != null ? parseInt(a.PotRow, 10) : (parseInt(a.PlotNumber, 10) || 0);
      const rowB = b.PotRow != null ? parseInt(b.PotRow, 10) : (parseInt(b.PlotNumber, 10) || 0);
      return rowA - rowB;
    });

    expect(sortedByWalk.map(p => p.ID)).toEqual(['3', '2', '1', '4']);
    expect(sortedByWalk[0].PlotNumber).toBe('101'); // Col 1, Row 1
    expect(sortedByWalk[1].PlotNumber).toBe('102'); // Col 1, Row 2
    expect(sortedByWalk[2].PlotNumber).toBe('201'); // Col 2, Row 1
    expect(sortedByWalk[3].PlotNumber).toBe('202'); // Col 2, Row 2
  });
});
