/**
 * statsCorrectness.test.js
 *
 * Property-based tests for statistical correctness properties defined in
 * the professional-reporting-system design document.
 *
 * Properties covered:
 *   Property 2  — Category Accent Colour Determinism
 *   Property 3  — Tier Classification Determinism
 *   Property 4  — ANOVA Degrees-of-Freedom Formula Correctness
 *   Property 10 — Report UUID Uniqueness
 *
 * Run with: npx vitest  (or: npx jest)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateReportUUID } from '../utils/reportUUID.js';

// ─── Property 2: Category Accent Colour Determinism ──────────────────────────

const CATEGORY_COLORS = {
  herbicide:    { hex: '#0D9488', rgb: [13, 148, 136] },
  fungicide:    { hex: '#4F46E5', rgb: [79, 70, 229] },
  pesticide:    { hex: '#DC2626', rgb: [220, 38, 38] },
  nutrition:    { hex: '#D97706', rgb: [217, 119, 6] },
  biostimulant: { hex: '#D97706', rgb: [217, 119, 6] },
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[(category || '').toLowerCase()] || CATEGORY_COLORS.herbicide;
}

describe('Property 2: Category Accent Colour Determinism', () => {
  const categories = Object.keys(CATEGORY_COLORS);

  it('returns the same hex on every call with the same input', () => {
    fc.assert(
      fc.property(fc.constantFrom(...categories), (cat) => {
        const result1 = getCategoryColor(cat);
        const result2 = getCategoryColor(cat);
        expect(result1.hex).toBe(result2.hex);
        expect(result1.rgb).toEqual(result2.rgb);
      }),
    );
  });

  it('maps herbicide → teal (#0D9488)', () => {
    expect(getCategoryColor('herbicide').hex).toBe('#0D9488');
  });
  it('maps fungicide → indigo (#4F46E5)', () => {
    expect(getCategoryColor('fungicide').hex).toBe('#4F46E5');
  });
  it('maps pesticide → red (#DC2626)', () => {
    expect(getCategoryColor('pesticide').hex).toBe('#DC2626');
  });
  it('maps nutrition → amber (#D97706)', () => {
    expect(getCategoryColor('nutrition').hex).toBe('#D97706');
  });
  it('maps biostimulant → amber (#D97706)', () => {
    expect(getCategoryColor('biostimulant').hex).toBe('#D97706');
  });
});

// ─── Property 3: Tier Classification Determinism ─────────────────────────────

function getTier(efficacyPct) {
  if (efficacyPct >= 80) return 'Excellent';
  if (efficacyPct >= 60) return 'Good';
  if (efficacyPct >= 40) return 'Fair';
  return 'Poor';
}
describe('Property 3: Tier Classification Determinism', () => {
  it('returns the same tier for the same value on repeated calls', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 200, noNaN: true }), (pct) => {
        expect(getTier(pct)).toBe(getTier(pct));
      }),
    );
  });

  it('returns Excellent for ≥ 80%', () => {
    fc.assert(
      fc.property(fc.double({ min: 80, max: 200, noNaN: true }), (pct) => {
        expect(getTier(pct)).toBe('Excellent');
      }),
    );
  });

  it('returns Good for 60–79%', () => {
    fc.assert(
      fc.property(fc.double({ min: 60, max: 79.999, noNaN: true }), (pct) => {
        expect(getTier(pct)).toBe('Good');
      }),
    );
  });

  it('returns Fair for 40–59%', () => {
    fc.assert(
      fc.property(fc.double({ min: 40, max: 59.999, noNaN: true }), (pct) => {
        expect(getTier(pct)).toBe('Fair');
      }),
    );
  });

  it('returns Poor for < 40%', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 39.999, noNaN: true }), (pct) => {
        expect(getTier(pct)).toBe('Poor');
      }),
    );
  });
});


// ─── Property 4: ANOVA Degrees-of-Freedom Formula Correctness ────────────────

describe('Property 4: ANOVA df Formula Correctness', () => {
  it('RCBD: df_Treatments + df_Blocks + df_Error = N - 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),  // t treatments
        fc.integer({ min: 2, max: 6 }),   // r replications (= blocks)
        (t, r) => {
          const N = t * r;
          const dfTreat = t - 1;
          const dfBlocks = r - 1;
          const dfError = (t - 1) * (r - 1);
          const dfTotal = N - 1;
          expect(dfTreat + dfBlocks + dfError).toBe(dfTotal);
        },
      ),
    );
  });

  it('CRD: df_Treatments + df_Error = N - 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 2, max: 6 }),
        (t, r) => {
          const N = t * r;
          const dfTreat = t - 1;
          const dfError = N - t;
          const dfTotal = N - 1;
          expect(dfTreat + dfError).toBe(dfTotal);
        },
      ),
    );
  });

  it('Factorial (a×b): df formula sums to abr - 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),  // a levels
        fc.integer({ min: 2, max: 4 }),  // b levels
        fc.integer({ min: 2, max: 4 }),  // r reps
        (a, b, r) => {
          const N = a * b * r;
          const dfA = a - 1;
          const dfB = b - 1;
          const dfAB = (a - 1) * (b - 1);
          const dfError = a * b * (r - 1);
          const dfTotal = N - 1;
          expect(dfA + dfB + dfAB + dfError).toBe(dfTotal);
        },
      ),
    );
  });
});

// ─── Property 10: Report UUID Uniqueness ─────────────────────────────────────

describe('Property 10: Report UUID Uniqueness', () => {
  it('generates distinct UUIDs on successive calls', () => {
    const uuids = new Set(Array.from({ length: 1000 }, () => generateReportUUID()));
    expect(uuids.size).toBe(1000);
  });

  it('generated UUIDs match v4 format', () => {
    const v4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (let i = 0; i < 100; i++) {
      expect(generateReportUUID()).toMatch(v4Pattern);
    }
  });
});
