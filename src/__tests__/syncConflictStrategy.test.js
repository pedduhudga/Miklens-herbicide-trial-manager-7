import { describe, it, expect } from 'vitest';
import { autoMergeConflict } from '../services/syncManager.js';

describe('Sync Conflict Strategy & Auto-Merge Engine', () => {
  it('intelligently merges observation timelines across local and server without data loss', () => {
    const localData = {
      ID: 'trial-101',
      FormulationName: 'Bio-Herbi A',
      LastModified: '2026-10-20T10:00:00.000Z',
      EfficacyDataJSON: JSON.stringify([
        { daa: 0, date: '2026-10-01', weedCover: 90 },
        { daa: 14, date: '2026-10-15', weedCover: 25, notes: 'Field observation mobile' }
      ])
    };

    const serverData = {
      ID: 'trial-101',
      FormulationName: 'Bio-Herbi A',
      Temperature: 28,
      LastModified: '2026-10-20T11:00:00.000Z',
      EfficacyDataJSON: JSON.stringify([
        { daa: 0, date: '2026-10-01', weedCover: 90 },
        { daa: 7, date: '2026-10-08', weedCover: 45, notes: 'Office uploaded 7 DAA' }
      ])
    };

    const merged = autoMergeConflict(localData, serverData);

    expect(merged.ID).toBe('trial-101');
    expect(merged.Temperature).toBe(28); // Preserved from server

    const mergedObservations = JSON.parse(merged.EfficacyDataJSON);
    expect(mergedObservations.length).toBe(3); // 0 DAA, 7 DAA, 14 DAA
    expect(mergedObservations.map(o => o.daa)).toEqual([0, 7, 14]);
    expect(mergedObservations.find(o => o.daa === 14).notes).toBe('Field observation mobile');
    expect(mergedObservations.find(o => o.daa === 7).notes).toBe('Office uploaded 7 DAA');
  });

  it('merges photo captures from both local offline scouts and server without dropping images', () => {
    const localData = {
      ID: 'trial-202',
      LastModified: '2026-10-20T12:00:00.000Z',
      PhotosJSON: JSON.stringify([
        { id: 'photo-1', url: 'https://storage/photo1.jpg', label: 'Plot 1' },
        { id: 'photo-2', url: 'https://storage/photo2.jpg', label: 'Plot 2 - Offline' }
      ])
    };

    const serverData = {
      ID: 'trial-202',
      LastModified: '2026-10-20T11:30:00.000Z',
      PhotosJSON: JSON.stringify([
        { id: 'photo-1', url: 'https://storage/photo1.jpg', label: 'Plot 1' },
        { id: 'photo-3', url: 'https://storage/photo3.jpg', label: 'Plot 3 - Server' }
      ])
    };

    const merged = autoMergeConflict(localData, serverData);
    const photos = JSON.parse(merged.PhotosJSON);

    expect(photos.length).toBe(3);
    const photoIds = photos.map(p => p.id);
    expect(photoIds).toContain('photo-1');
    expect(photoIds).toContain('photo-2');
    expect(photoIds).toContain('photo-3');
  });

  it('handles object-wrapped observations format { observations: [...] } seamlessly', () => {
    const localData = {
      ID: 'trial-303',
      EfficacyDataJSON: JSON.stringify({
        observations: [
          { daa: 21, weedCover: 15 }
        ]
      })
    };

    const serverData = {
      ID: 'trial-303',
      EfficacyDataJSON: JSON.stringify([
        { daa: 7, weedCover: 50 }
      ])
    };

    const merged = autoMergeConflict(localData, serverData);
    const observations = JSON.parse(merged.EfficacyDataJSON);

    expect(observations.length).toBe(2);
    expect(observations.map(o => o.daa)).toEqual([7, 21]);
  });
});
