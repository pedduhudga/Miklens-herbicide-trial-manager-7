import { describe, it, expect, vi } from 'vitest';
import { analyzePlantPhenotype } from '../utils/phenotyping.js';

describe('phenotyping - Digital Plant Phenotyping & Desiccation Engine', () => {
  it('correctly calculates desiccation rate on synthetic foliage pixels', async () => {
    // Create mock canvas with 50% healthy green pixels and 50% necrotic brown pixels
    const width = 10;
    const height = 10;
    const mockPixels = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (i < 50) {
        // Bright Green Foliage: R: 30, G: 160, B: 30, A: 255
        mockPixels[idx] = 30;
        mockPixels[idx + 1] = 160;
        mockPixels[idx + 2] = 30;
        mockPixels[idx + 3] = 255;
      } else {
        // Desiccated Necrotic Tissue: R: 180, G: 110, B: 40, A: 255
        mockPixels[idx] = 180;
        mockPixels[idx + 1] = 110;
        mockPixels[idx + 2] = 40;
        mockPixels[idx + 3] = 255;
      }
    }

    const mockCanvas = {
      width,
      height,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: mockPixels })
      })
    };

    const result = await analyzePlantPhenotype(mockCanvas, { sampleStep: 1, canvas: mockCanvas });

    expect(result.greenPixels).toBe(50);
    expect(result.necroticPixels).toBe(50);
    expect(result.greenCanopyPct).toBe(50);
    expect(result.necroticPct).toBe(50);
    expect(result.calculatedDesiccationRate).toBe(50);
  });
});
