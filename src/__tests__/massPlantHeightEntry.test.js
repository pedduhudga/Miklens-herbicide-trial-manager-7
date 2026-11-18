import { describe, it, expect } from 'vitest';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { calculateDAA } from '../utils/dateUtils.js';
import {
  normalizeObsDate,
  formatDisplayDate,
  findObservationForDate,
  getPreviousHeightBeforeDate,
  buildRecordedDatesHistory,
  mergePlotObservationForDate,
  buildMassObservationPayload,
} from '../utils/massObservationUtils.js';

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
    const nextEff = mergePlotObservationForDate({
      trial,
      efficacyData,
      date: '2026-05-15',
      daa: 14,
      heightVal: 32.5,
      numVal: 8.5,
      rating: 'Excellent',
      entryNotes: 'Healthy vigorous vegetative growth',
      generalNotes: '',
      bbchStage: 'BBCH 22',
      primaryField: 'visualVigor',
      trialCat: 'nutrition',
    });

    expect(nextEff).toHaveLength(1);
    expect(nextEff[0]['Plant Height']).toBe(32.5);
    expect(nextEff[0].plantHeight).toBe(32.5);
    expect(nextEff[0].plant_height).toBe(32.5);
    expect(nextEff[0].potHeights).toEqual([32.5]);
    expect(nextEff[0].visualVigor).toBe(8.5);
    expect(nextEff[0].daa).toBe(14);
    expect(nextEff[0].date).toBe('2026-05-15');
    expect(nextEff[0].bbchStage).toBe('BBCH 22');
  });

  it('merges mass plant height into an existing observation on the SAME date without overwriting photos or duplicating notes', () => {
    const existingObs = {
      daa: 7,
      date: '2026-05-08',
      treatment: 'Biostimulant X',
      plot: '102',
      rep: 1,
      overallVigor: 7.5,
      photoUrl: 'https://example.com/photo.jpg',
      notes: 'Initial check',
    };

    const trial = { ID: 'plot-102', FormulationName: 'Biostimulant X', PlotNumber: '102', Replication: 1 };
    const mergedOnce = mergePlotObservationForDate({
      trial,
      efficacyData: [existingObs],
      date: '2026-05-08',
      daa: 7,
      heightVal: 24.8,
      numVal: null,
      rating: '',
      entryNotes: 'Field walk height measurement',
      generalNotes: '',
      bbchStage: '',
      primaryField: 'overallVigor',
      trialCat: 'biostimulant',
    });

    expect(mergedOnce).toHaveLength(1);
    expect(mergedOnce[0].overallVigor).toBe(7.5); // Preserved
    expect(mergedOnce[0].photoUrl).toBe('https://example.com/photo.jpg'); // Preserved
    expect(mergedOnce[0]['Plant Height']).toBe(24.8);
    expect(mergedOnce[0].potHeights).toEqual([24.8]);
    expect(mergedOnce[0].notes).toBe('Initial check | Field walk height measurement');

    // Re-saving same date with same note must NOT duplicate the note text
    const mergedTwice = mergePlotObservationForDate({
      trial,
      efficacyData: mergedOnce,
      date: '2026-05-08',
      daa: 7,
      heightVal: 25.2,
      numVal: null,
      rating: '',
      entryNotes: 'Initial check | Field walk height measurement',
      generalNotes: '',
      bbchStage: '',
      primaryField: 'overallVigor',
      trialCat: 'biostimulant',
    });

    expect(mergedTwice).toHaveLength(1);
    expect(mergedTwice[0].plantHeight).toBe(25.2);
    expect(mergedTwice[0].notes).toBe('Initial check | Field walk height measurement');
  });

  it('strictly isolates different observation dates so changing date gives a clean fresh entry and never overwrites earlier dates', () => {
    const existingEff = [
      { daa: 0, date: '2026-11-13', plantHeight: 26, 'Plant Height': 26, notes: 'Mass observation entry' },
    ];

    // Selecting a NEW date (2026-11-18) must return null (fresh blank entry!), even if DAA happens to be 0 initially
    const matchForNewDate = findObservationForDate(existingEff, '2026-11-18', 0);
    expect(matchForNewDate).toBeNull();

    // Selecting the EXISTING date (2026-11-13) returns that date's observation
    const matchForExistingDate = findObservationForDate(existingEff, '2026-11-13', 0);
    expect(matchForExistingDate).not.toBeNull();
    expect(matchForExistingDate.plantHeight).toBe(26);

    // Saving on 2026-11-18 APPENDS a second observation and preserves 2026-11-13 completely
    const trial = { ID: 'r1c1', FormulationName: 'Untreated Control', IsControl: true, PotLabel: 'R1C1' };
    const updatedEff = mergePlotObservationForDate({
      trial,
      efficacyData: existingEff,
      date: '2026-11-18',
      daa: 5,
      heightVal: 31.5,
      numVal: null,
      rating: 'Control',
      entryNotes: 'Good growth',
      generalNotes: '',
      bbchStage: 'BBCH 16',
      primaryField: 'visualVigor',
      trialCat: 'nutrition',
    });

    expect(updatedEff).toHaveLength(2);
    expect(updatedEff[0].date).toBe('2026-11-13');
    expect(updatedEff[0].plantHeight).toBe(26);
    expect(updatedEff[1].date).toBe('2026-11-18');
    expect(updatedEff[1].plantHeight).toBe(31.5);
    expect(updatedEff[1].daa).toBe(5);
  });

  it('computes previous plant height strictly BEFORE the active date (never comparing a date against itself)', () => {
    const eff = [
      { daa: 1, date: '2026-11-13', plantHeight: 26 },
      { daa: 6, date: '2026-11-18', plantHeight: 39 },
    ];

    // On 2026-11-18, previous height must be 26 (from 2026-11-13), NOT 39 (from 2026-11-18 itself)
    const prevOn18 = getPreviousHeightBeforeDate(eff, '2026-11-18', 6);
    expect(prevOn18).not.toBeNull();
    expect(prevOn18.val).toBe(26);
    expect(prevOn18.date).toBe('2026-11-13');

    // On 2026-11-13 (earliest date), there is no earlier height
    const prevOn13 = getPreviousHeightBeforeDate(eff, '2026-11-13', 1);
    expect(prevOn13).toBeNull();

    // On a future date 2026-11-25, previous height is 39 (from 2026-11-18)
    const prevOn25 = getPreviousHeightBeforeDate(eff, '2026-11-25', 13);
    expect(prevOn25).not.toBeNull();
    expect(prevOn25.val).toBe(39);
  });

  it('merges earlier dates history from both trial cards and Firebase massObservations collection', () => {
    const trials = [
      {
        ID: 't1',
        FormulationName: 'Untreated Control',
        EfficacyDataJSON: JSON.stringify([
          { daa: 1, date: '2026-11-13', plantHeight: 26 },
          { daa: 6, date: '2026-11-18', plantHeight: 34 },
        ]),
      },
      {
        ID: 't2',
        FormulationName: 'NPK Powder',
        EfficacyDataJSON: JSON.stringify([
          { daa: 1, date: '2026-11-13', plantHeight: 28 },
        ]),
      },
    ];

    const firebaseMassObs = [
      {
        ID: 'nutrition_p1_2026-11-18',
        ProjectID: 'p1',
        Category: 'nutrition',
        Date: '2026-11-18',
        DAA: 6,
        BBCHStage: 'BBCH 18',
        GeneralNotes: 'Morning walk',
        Entries: {
          t1: { plantHeight: 34, metricValue: 8 },
          t2: { plantHeight: 38, metricValue: 9 },
        },
      },
    ];

    const history = buildRecordedDatesHistory(trials, firebaseMassObs, 'visualVigor');
    expect(history).toHaveLength(2);
    // Newest date first
    expect(history[0].date).toBe('2026-11-18');
    expect(history[0].fromFirebaseCollection).toBe(true);
    expect(history[0].avgHeight).toBe('36.0');
    expect(history[0].bbchStage).toBe('BBCH 18');
    expect(history[0].entriesByTrialId.t2.plantHeight).toBe(38);

    expect(history[1].date).toBe('2026-11-13');
    expect(history[1].avgHeight).toBe('27.0');
    expect(history[1].plotCount).toBe(2);
  });

  it('builds a clean Firebase massObservations payload with summary stats', () => {
    const payload = buildMassObservationPayload({
      project: { ID: 'PROJ-123', Name: 'Mari Gold Open Field', Category: 'nutrition' },
      trialsList: [
        { ID: 't1', PotLabel: 'R1C1', FormulationName: 'Untreated Control', IsControl: true },
        { ID: 't2', PotLabel: 'R1C2', FormulationName: 'NPK New', IsControl: false },
      ],
      date: '2026-11-18',
      daa: 6,
      generalNotes: 'Clear sky',
      bbchStage: 'BBCH 16',
      plotEntries: {
        t1: { plantHeight: '30', metricValue: '7', rating: 'Control', notes: '' },
        t2: { plantHeight: '36', metricValue: '8.5', rating: 'Excellent', notes: 'Lush' },
      },
      primaryField: 'visualVigor',
      mode: 'both',
      activeCategory: 'nutrition',
    });

    expect(payload.ProjectID).toBe('PROJ-123');
    expect(payload.Category).toBe('nutrition');
    expect(payload.Date).toBe('2026-11-18');
    expect(payload.DAA).toBe(6);
    expect(payload.PlotCount).toBe(2);
    expect(payload.SummaryStats.avgHeight).toBe(33);
    expect(payload.SummaryStats.minHeight).toBe(30);
    expect(payload.SummaryStats.maxHeight).toBe(36);
    expect(payload.Entries.t2.plantHeight).toBe(36);
    expect(payload.Entries.t2.metricValue).toBe(8.5);
  });

  it('normalizes and formats date formats consistently', () => {
    expect(normalizeObsDate('2026-11-18')).toBe('2026-11-18');
    expect(normalizeObsDate('18-11-2026')).toBe('2026-11-18');
    expect(normalizeObsDate('2026-11-18T09:30:00.000Z')).toBe('2026-11-18');
    expect(formatDisplayDate('2026-11-18')).toBe('18-11-2026');
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
