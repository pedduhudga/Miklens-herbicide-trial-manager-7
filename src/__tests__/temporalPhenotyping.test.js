import { describe, it, expect, vi } from 'vitest';
import { comparePhenotypeProgression } from '../utils/phenotyping.js';

describe('comparePhenotypeProgression - Chronological Plant Canopy Delta Analysis', () => {
  it('correctly calculates delta green reduction and necrosis progression across two timepoints', async () => {
    const width = 10;
    const height = 10;

    // Baseline: 80% Green live weed foliage, 20% soil/dark background
    const baselinePixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (i < 80) {
        // Healthy green foliage
        baselinePixels[idx] = 25;
        baselinePixels[idx + 1] = 165;
        baselinePixels[idx + 2] = 25;
        baselinePixels[idx + 3] = 255;
      } else {
        // Soil/background
        baselinePixels[idx] = 40;
        baselinePixels[idx + 1] = 30;
        baselinePixels[idx + 2] = 20;
        baselinePixels[idx + 3] = 255;
      }
    }

    // Follow-up (e.g. 7 DAA): 20% remaining Green foliage, 60% desiccated necrosis, 20% background
    const currentPixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (i < 20) {
        // Green foliage
        currentPixels[idx] = 25;
        currentPixels[idx + 1] = 165;
        currentPixels[idx + 2] = 25;
        currentPixels[idx + 3] = 255;
      } else if (i < 80) {
        // Necrotic brown burned tissue
        currentPixels[idx] = 180;
        currentPixels[idx + 1] = 110;
        currentPixels[idx + 2] = 40;
        currentPixels[idx + 3] = 255;
      } else {
        // Soil/background
        currentPixels[idx] = 40;
        currentPixels[idx + 1] = 30;
        currentPixels[idx + 2] = 20;
        currentPixels[idx + 3] = 255;
      }
    }

    const mockBaselineCanvas = {
      width,
      height,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: baselinePixels })
      })
    };

    const mockCurrentCanvas = {
      width,
      height,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: currentPixels })
      })
    };

    const result = await comparePhenotypeProgression(mockBaselineCanvas, mockCurrentCanvas, {
      sampleStep: 1,
      baselineCanvas: mockBaselineCanvas,
      currentCanvas: mockCurrentCanvas,
      daysBetween: 7,
      generateHeatmaps: false
    });

    // Baseline: 80% green, 0% necrosis
    expect(result.baselineMetrics.greenCanopyPct).toBe(80);
    expect(result.baselineMetrics.necroticPct).toBe(0);

    // Current: 20% green, 60% necrosis
    expect(result.currentMetrics.greenCanopyPct).toBe(20);
    expect(result.currentMetrics.necroticPct).toBe(60);

    // Delta Green: 80 - 20 = 60% live canopy reduction
    expect(result.deltaGreenPct).toBe(60);

    // Delta Necrosis: 60 - 0 = 60% necrosis expansion
    expect(result.deltaNecrosisPct).toBe(60);

    // Knockdown Efficacy: (80 - 20) / 80 = 75%
    expect(result.knockdownRate).toBe(75);

    // Desiccation Velocity: 60% / 7 days = 8.57 %/day
    expect(result.desiccationVelocity).toBe(8.57);
    expect(result.progressionSummary).toContain('reduced by 60%');
  });
});
