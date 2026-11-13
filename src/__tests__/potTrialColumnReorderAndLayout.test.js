import { describe, it, expect } from 'vitest';

describe('Pot Trial Column Reordering, Locking and Layout', () => {
  it('moves unlocked columns correctly and preserves locked columns', () => {
    // Initial column order with 4 treatments
    let columns = ['Untreated Control', 'NPK LIQUID', 'NPK POWDER', 'N 16'];
    let locked = { 0: true }; // Untreated Control locked in Column 1

    // Move NPK POWDER (idx 2) left to idx 1
    const moveColumn = (cols, lockedCols, fromIdx, toIdx) => {
      if (toIdx < 0 || toIdx >= cols.length) return cols;
      if (lockedCols[fromIdx] || lockedCols[toIdx]) return cols; // prevent moving onto/from locked
      const updated = [...cols];
      const [item] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, item);
      return updated;
    };

    // Attempting to move into locked index 0 should be prevented
    const attemptedMoveToLocked = moveColumn(columns, locked, 1, 0);
    expect(attemptedMoveToLocked).toEqual(['Untreated Control', 'NPK LIQUID', 'NPK POWDER', 'N 16']);

    // Moving unlocked column 2 to column 1
    const moved = moveColumn(columns, locked, 2, 1);
    expect(moved).toEqual(['Untreated Control', 'NPK POWDER', 'NPK LIQUID', 'N 16']);
  });

  it('assigns correct row replication instead of confusing 3-digit plotNum blocks', () => {
    const potRows = 5;
    const potCols = 4;
    const treatments = ['Untreated Control', 'NPK LIQUID', 'NPK POWDER', 'N 16'];

    const generatedTrials = [];
    for (let r = 1; r <= potRows; r++) {
      for (let c = 1; c <= potCols; c++) {
        const trt = treatments[c - 1];
        const isControl = trt.toLowerCase().includes('control');
        const plotNum = r * 100 + c; // e.g. 101, 102, 201
        
        // Corrected replication assignment for vertical columns: row index is replication
        const replication = String(r);
        const potLabel = `R${r}C${c}`;

        generatedTrials.push({
          ID: `pot_${r}_${c}`,
          PlotNumber: String(plotNum),
          Replication: replication,
          PotRow: r,
          PotCol: c,
          PotLabel: potLabel,
          FormulationName: trt,
          IsControl: isControl
        });
      }
    }

    expect(generatedTrials).toHaveLength(20);
    
    // Check that Replication is clean row index (1, 2, 3, 4, 5) and NOT 101, 102, 201...
    generatedTrials.forEach(trial => {
      expect(Number(trial.Replication)).toBeGreaterThanOrEqual(1);
      expect(Number(trial.Replication)).toBeLessThanOrEqual(5);
      expect(Number(trial.Replication)).not.toBeGreaterThan(10);
    });

    // Check that Column 1 pots all have Untreated Control
    const col1Pots = generatedTrials.filter(t => t.PotCol === 1);
    expect(col1Pots).toHaveLength(5);
    col1Pots.forEach(t => {
      expect(t.FormulationName).toBe('Untreated Control');
      expect(t.IsControl).toBe(true);
    });
  });

  it('groups pot trials by physical column lanes with sequential row ordering', () => {
    const trials = [
      { ID: '1', PotCol: 1, PotRow: 1, PotLabel: 'R1C1', FormulationName: 'Untreated Control' },
      { ID: '2', PotCol: 2, PotRow: 1, PotLabel: 'R1C2', FormulationName: 'NPK LIQUID' },
      { ID: '3', PotCol: 1, PotRow: 2, PotLabel: 'R2C1', FormulationName: 'Untreated Control' },
      { ID: '4', PotCol: 2, PotRow: 2, PotLabel: 'R2C2', FormulationName: 'NPK LIQUID' },
      { ID: '5', PotCol: 1, PotRow: 3, PotLabel: 'R3C1', FormulationName: 'Untreated Control' },
      { ID: '6', PotCol: 2, PotRow: 3, PotLabel: 'R3C2', FormulationName: 'NPK LIQUID' }
    ];

    const columnLanes = {};
    trials.forEach(t => {
      const c = t.PotCol;
      if (!columnLanes[c]) columnLanes[c] = [];
      columnLanes[c].push(t);
    });

    Object.keys(columnLanes).forEach(c => {
      columnLanes[c].sort((a, b) => a.PotRow - b.PotRow);
    });

    expect(Object.keys(columnLanes)).toEqual(['1', '2']);
    expect(columnLanes['1'].map(t => t.PotLabel)).toEqual(['R1C1', 'R2C1', 'R3C1']);
    expect(columnLanes['2'].map(t => t.PotLabel)).toEqual(['R1C2', 'R2C2', 'R3C2']);
  });

  it('correctly persists custom PotFields in observation payload', () => {
    const potFields = ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'];
    const obsForm = {
      daa: '14',
      date: '2026-11-13',
      'Plant Height': '45.2',
      Branches: '8',
      Flowers: '12',
      'Fruit Count': '5',
      Yield: '120.5'
    };

    const newObs = {
      daa: Number(obsForm.daa),
      date: obsForm.date
    };

    potFields.forEach(pf => {
      const val = obsForm[pf];
      if (val !== undefined && val !== '') {
        const num = parseFloat(val);
        newObs[pf] = isNaN(num) ? val : num;
      }
    });

    expect(newObs['Plant Height']).toBe(45.2);
    expect(newObs['Branches']).toBe(8);
    expect(newObs['Flowers']).toBe(12);
    expect(newObs['Fruit Count']).toBe(5);
    expect(newObs['Yield']).toBe(120.5);
  });

  it('automatically maps columns 1:1 when multiple treatments are added to initial setup', () => {
    // Initial state: 1 treatment, 4 columns all initialized with trt_control
    const initialTreatments = [{ id: 'trt_control', name: 'Untreated Control' }];
    let customColumnOrder = ['trt_control', 'trt_control', 'trt_control', 'trt_control'];
    const lockedColumns = { 0: true }; // Column 1 locked to control

    // User adds 3 more treatments in Treatments Setup
    const updatedTreatments = [
      { id: 'trt_control', name: 'Untreated Control' },
      { id: 'trt_npk_liq', name: 'NPK LIQUID' },
      { id: 'trt_npk_pwd', name: 'NPK POWDER' },
      { id: 'trt_n16', name: 'N 16' }
    ];

    const trtIds = updatedTreatments.map(t => t.id);
    const potColsCount = 4;

    // Simulation of our reactive sync effect:
    const validPrev = customColumnOrder.filter(Boolean);
    const allSame = validPrev.length > 1 && validPrev.every(id => id === validPrev[0]);

    const synchronizedColumns = Array.from({ length: potColsCount }, (_, i) => {
      const colId = customColumnOrder[i];
      if (lockedColumns[i] && trtIds.includes(colId)) return colId;
      if (allSame && trtIds.length > 1) {
        return trtIds[i % trtIds.length];
      }
      if (trtIds.includes(colId)) return colId;
      return trtIds[i % trtIds.length];
    });

    expect(synchronizedColumns).toEqual(['trt_control', 'trt_npk_liq', 'trt_npk_pwd', 'trt_n16']);
  });

  it('cascades treatment deletion into column order without orphaned IDs', () => {
    let treatments = [
      { id: 'trt_control', name: 'Untreated Control' },
      { id: 'trt_npk_liq', name: 'NPK LIQUID' },
      { id: 'trt_npk_pwd', name: 'NPK POWDER' },
      { id: 'trt_n16', name: 'N 16' }
    ];
    let customColumnOrder = ['trt_control', 'trt_npk_liq', 'trt_npk_pwd', 'trt_n16'];

    // Delete NPK POWDER
    const idToDelete = 'trt_npk_pwd';
    treatments = treatments.filter(t => t.id !== idToDelete);
    
    // In 1:1 pot trial setup, deleting treatment also adjusts column count and order
    const remaining = treatments;
    const foundIdx = customColumnOrder.indexOf(idToDelete);
    if (foundIdx !== -1) customColumnOrder.splice(foundIdx, 1);

    expect(treatments).toHaveLength(3);
    expect(customColumnOrder).toEqual(['trt_control', 'trt_npk_liq', 'trt_n16']);
    expect(customColumnOrder.includes(idToDelete)).toBe(false);
  });

  it('supports direct column addition and deletion in greenhouse layout', () => {
    let potCols = 4;
    let customColumnOrder = ['t1', 't2', 't3', 't4'];
    let locked = { 1: true }; // Col 2 locked

    // Delete Column 1 (index 0)
    const cIdxToDelete = 0;
    potCols -= 1;
    customColumnOrder.splice(cIdxToDelete, 1);
    
    // Adjust locked indices
    const updatedLocked = {};
    Object.keys(locked).forEach(key => {
      const idx = parseInt(key);
      if (idx < cIdxToDelete) updatedLocked[idx] = true;
      else if (idx > cIdxToDelete) updatedLocked[idx - 1] = true;
    });

    expect(potCols).toBe(3);
    expect(customColumnOrder).toEqual(['t2', 't3', 't4']);
    expect(updatedLocked[0]).toBe(true); // Locked index shifted from 1 to 0

    // Add a new column
    const newTrt = 't5';
    potCols += 1;
    customColumnOrder.push(newTrt);

    expect(potCols).toBe(4);
    expect(customColumnOrder).toEqual(['t2', 't3', 't4', 't5']);
  });
});

