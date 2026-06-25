/**
 * photoUtils.test.js
 *
 * Unit tests for photo utilities:
 *   - resolvePhotoSrc() with all input shapes
 *   - sortAndGroupPhotos() property test (Property 7)
 *
 * Run with: npx vitest
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolvePhotoSrc } from '../utils/photoUtils.js';
import { sortAndGroupPhotos } from '../services/reportDataBuilder.js';

// ─── resolvePhotoSrc() unit tests ────────────────────────────────────────────

describe('resolvePhotoSrc()', () => {
  it('returns a string URL when passed a string URL directly', () => {
    const result = resolvePhotoSrc('https://example.com/photo.jpg');
    expect(result).toBe('https://example.com/photo.jpg');
  });

  it('returns photo.url from an object with url field', () => {
    const result = resolvePhotoSrc({ url: 'https://example.com/photo.jpg' });
    expect(result).toBe('https://example.com/photo.jpg');
  });

  it('returns fileData when url is absent and fileData is valid base64', () => {
    const result = resolvePhotoSrc({ fileData: 'data:image/jpeg;base64,/9j/4AAQ' });
    expect(result).toBe('data:image/jpeg;base64,/9j/4AAQ');
  });

  it('returns null when fileData is the stripped sentinel [base64-removed]', () => {
    const result = resolvePhotoSrc({ fileData: '[base64-removed]' });
    expect(result).toBeNull();
  });

  it('builds a Drive thumbnail URL from driveId when url and fileData are absent', () => {
    const result = resolvePhotoSrc({ driveId: 'abc123xyz999' });
    expect(result).toContain('abc123xyz999');
  });

  it('returns null when the photo object has no resolvable source', () => {
    const result = resolvePhotoSrc({});
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    const result = resolvePhotoSrc(null);
    expect(result).toBeNull();
  });
});

// ─── Property 7: Photo Sort Order Correctness ────────────────────────────────

function makePhoto(treatment, daa, plotNumber, date) {
  return { treatment, daa, plotNumber, date, url: null, resolvedSrc: null };
}

describe('Property 7: sortAndGroupPhotos() sort order', () => {
  it('tagged photos appear before untagged photos', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          treatment: fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.constant(null)),
          daa:       fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constant(null)),
          plotNumber:fc.oneof(fc.string({ minLength: 1, maxLength: 5 }), fc.constant(null)),
          date:      fc.string({ minLength: 1, maxLength: 20 }),
          url:       fc.constant(null),
          resolvedSrc: fc.constant(null),
        }), { minLength: 1, maxLength: 20 }),
        (photos) => {
          const sorted = sortAndGroupPhotos(photos);

          // Find the index of the first untagged photo
          const firstUntaggedIdx = sorted.findIndex(
            p => p.treatment == null || p.daa == null || p.plotNumber == null,
          );

          if (firstUntaggedIdx === -1) return true; // all tagged — trivially satisfied

          // All photos after firstUntaggedIdx must also be untagged
          for (let i = firstUntaggedIdx + 1; i < sorted.length; i++) {
            const p = sorted[i];
            if (p.treatment != null && p.daa != null && p.plotNumber != null) {
              return false; // a tagged photo appeared after an untagged one
            }
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('tagged photos are sorted by treatment → daa → plotNumber', () => {
    const photos = [
      makePhoto('Treatment B', 14, '2', '2024-01-03'),
      makePhoto('Treatment A', 21, '1', '2024-01-04'),
      makePhoto('Treatment A', 7,  '3', '2024-01-01'),
      makePhoto('Treatment A', 7,  '1', '2024-01-02'),
    ];
    const sorted = sortAndGroupPhotos(photos);
    const tagged = sorted.filter(p => p.treatment && p.daa != null && p.plotNumber);

    expect(tagged[0].treatment).toBe('Treatment A');
    expect(tagged[0].daa).toBe(7);
    expect(tagged[0].plotNumber).toBe('1');

    expect(tagged[1].daa).toBe(7);
    expect(tagged[1].plotNumber).toBe('3');

    expect(tagged[2].daa).toBe(21);
    expect(tagged[3].treatment).toBe('Treatment B');
  });

  it('handles empty array without throwing', () => {
    expect(() => sortAndGroupPhotos([])).not.toThrow();
    expect(sortAndGroupPhotos([])).toEqual([]);
  });

  it('handles non-array input gracefully', () => {
    expect(sortAndGroupPhotos(null)).toEqual([]);
    expect(sortAndGroupPhotos(undefined)).toEqual([]);
  });
});
