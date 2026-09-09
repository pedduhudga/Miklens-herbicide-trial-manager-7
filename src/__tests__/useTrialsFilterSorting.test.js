import { describe, it, expect, vi } from 'vitest';

// Mock React useMemo to execute immediately
vi.mock('react', () => ({
  useMemo: (fn) => fn()
}));

import { useTrialsFilter } from '../hooks/useTrialsFilter.js';

describe('useTrialsFilter - Control Days and Best Performance Sorting', () => {
  const sampleTrials = [
    // Trial A: 1 day control (failed after DAA 1, but has observations logged)
    {
      ID: 'TR-1DAY',
      Date: '27-11-2025',
      FinalControlDuration: 1,
      Result: 'Poor',
      Category: 'herbicide',
      EfficacyDataJSON: JSON.stringify([
        { daa: 1, controlPct: 80 },
        { daa: 2, controlPct: 30 }, // regrowth breakdown (< 70%)
        { daa: 3, controlPct: 20 },
        { daa: 4, controlPct: 15 },
        { daa: 5, controlPct: 10 }
      ])
    },
    // Trial B: 38 days sustained control
    {
      ID: 'TR-38DAYS',
      Date: '02-07-2026',
      FinalControlDuration: 38,
      Result: 'Excellent',
      Category: 'herbicide',
      EfficacyDataJSON: JSON.stringify([
        { daa: 7, controlPct: 100 },
        { daa: 14, controlPct: 100 },
        { daa: 28, controlPct: 95 },
        { daa: 38, controlPct: 85 }
      ])
    },
    // Trial C: 27 days sustained control
    {
      ID: 'TR-27DAYS',
      Date: '03-07-2026',
      FinalControlDuration: 27,
      Result: 'Excellent',
      Category: 'herbicide',
      EfficacyDataJSON: JSON.stringify([
        { daa: 7, controlPct: 98 },
        { daa: 14, controlPct: 92 },
        { daa: 27, controlPct: 80 }
      ])
    }
  ];

  it('sorts trials with longest control days at the top and 1-day control at the bottom', () => {
    const sorted = useTrialsFilter(sampleTrials, {
      activeTab: 'all',
      sortBy: 'control-days',
      activeCategory: 'herbicide'
    });

    const sortedIds = sorted.map(t => t.ID);
    expect(sortedIds[0]).toBe('TR-38DAYS');
    expect(sortedIds[1]).toBe('TR-27DAYS');
    expect(sortedIds[2]).toBe('TR-1DAY');
  });

  it('sorts best performing trials (high kill + long control) at the top', () => {
    const sorted = useTrialsFilter(sampleTrials, {
      activeTab: 'all',
      sortBy: 'best',
      activeCategory: 'herbicide'
    });

    const sortedIds = sorted.map(t => t.ID);
    expect(sortedIds[0]).toBe('TR-38DAYS');
    expect(sortedIds[1]).toBe('TR-27DAYS');
    expect(sortedIds[2]).toBe('TR-1DAY');
  });
});
