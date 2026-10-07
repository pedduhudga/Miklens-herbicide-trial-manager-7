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

// ─── deduplicatePhotoList() unit tests ────────────────────────────────────────

import { deduplicatePhotoList } from '../utils/photoUtils.js';

describe('deduplicatePhotoList()', () => {
  it('returns empty array when given null or empty list', () => {
    expect(deduplicatePhotoList(null)).toEqual([]);
    expect(deduplicatePhotoList([])).toEqual([]);
  });

  it('removes duplicate photos with the same Drive ID', () => {
    const photos = [
      { driveId: 'drive_123', url: 'https://drive.google.com/thumbnail?id=drive_123', label: 'Plot 1' },
      { driveId: 'drive_123', url: 'https://drive.google.com/thumbnail?id=drive_123&sz=w480', label: 'Plot 1 copy' },
    ];
    const result = deduplicatePhotoList(photos);
    expect(result).toHaveLength(1);
    expect(result[0].driveId).toBe('drive_123');
  });

  it('removes duplicate photos with the exact same timestamp/date, DAA, and label', () => {
    const photos = [
      { date: '2026-03-15T10:00:00Z', daa: 14, label: 'Weed Control Plot 1', url: 'https://storage/img1.jpg' },
      { date: '2026-03-15T10:00:00Z', daa: 14, label: 'Weed Control Plot 1', url: 'https://storage/img2_copy.jpg' },
      { date: '2026-03-15T10:00:00Z', daa: 28, label: 'Weed Control Plot 1', url: 'https://storage/img3.jpg' },
    ];
    const result = deduplicatePhotoList(photos);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.daa)).toEqual([14, 28]);
  });

  it('deduplicates string URL entries and normalizes Google Drive URLs', () => {
    const photos = [
      'https://drive.google.com/thumbnail?id=photo_abc&sz=w480',
      'https://drive.google.com/thumbnail?id=photo_abc&sz=w1000',
      'https://drive.google.com/thumbnail?id=photo_xyz&sz=w480',
    ];
    const result = deduplicatePhotoList(photos);
    expect(result).toHaveLength(2);
  });

  it('prioritizes valid remote photos over placeholder or broken data URLs', () => {
    const photos = [
      { driveId: 'same_file', fileData: '[base64-removed]', url: null },
      { driveId: 'same_file', url: 'https://drive.google.com/uc?id=same_file' },
    ];
    const result = deduplicatePhotoList(photos);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://drive.google.com/uc?id=same_file');
  });
});

