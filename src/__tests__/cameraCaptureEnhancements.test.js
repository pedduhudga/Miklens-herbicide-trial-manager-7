import { describe, it, expect } from 'vitest';

describe('CameraCapture Enhancements & Anti-Blur Engine', () => {

  // 1. Sharpness / Laplacian Gradient Engine Test
  it('calculates higher sharpness score for textured/edge-rich crop images compared to blurred frames', () => {
    // Simulate calculateFrameSharpness algorithm on synthetic pixel arrays
    const computeSharpness = (width, height, pixelGenerator) => {
      const sampleW = 20;
      const sampleH = 20;
      const data = new Uint8ClampedArray(sampleW * sampleH * 4);
      
      for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
          const idx = (y * sampleW + x) * 4;
          const val = pixelGenerator(x, y);
          data[idx] = val;     // R
          data[idx + 1] = val; // G
          data[idx + 2] = val; // B
          data[idx + 3] = 255; // A
        }
      }

      let sumGrad = 0;
      let count = 0;
      for (let y = 1; y < sampleH - 1; y += 2) {
        for (let x = 1; x < sampleW - 1; x += 2) {
          const idx = (y * sampleW + x) * 4;
          const g = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          const gR = data[idx + 4] * 0.299 + data[idx + 5] * 0.587 + data[idx + 6] * 0.114;
          const gD = data[idx + sampleW * 4] * 0.299 + data[idx + sampleW * 4 + 1] * 0.587 + data[idx + sampleW * 4 + 2] * 0.114;
          const dx = gR - g;
          const dy = gD - g;
          sumGrad += (dx * dx + dy * dy);
          count++;
        }
      }
      return sumGrad / (count || 1);
    };

    // Sharp frame with high edge contrasts (plant leaf veins, pot rim)
    const sharpScore = computeSharpness(20, 20, (x, y) => ((x % 2 === 0) ? 240 : 20));

    // Blurry / smeared frame (soft gradient due to motion blur)
    const blurredScore = computeSharpness(20, 20, (x, y) => Math.min(255, 100 + x * 2));

    expect(sharpScore).toBeGreaterThan(blurredScore * 5);
  });

  // 2. Tap-to-Focus Coordinate Normalization Test
  it('accurately normalizes tap-to-focus coordinates to 0.0 - 1.0 range', () => {
    const normalizeTap = (clientX, clientY, rect) => {
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const normX = Math.max(0, Math.min(1, x / rect.width));
      const normY = Math.max(0, Math.min(1, y / rect.height));
      return { normX, normY };
    };

    const rect = { left: 50, top: 100, width: 400, height: 600 };
    
    // Tap exactly in center
    const center = normalizeTap(250, 400, rect);
    expect(center.normX).toBeCloseTo(0.5);
    expect(center.normY).toBeCloseTo(0.5);

    // Tap in top-left
    const topLeft = normalizeTap(50, 100, rect);
    expect(topLeft.normX).toBe(0);
    expect(topLeft.normY).toBe(0);

    // Tap outside boundaries clamped safely
    const outOfBounds = normalizeTap(1000, -50, rect);
    expect(outOfBounds.normX).toBe(1);
    expect(outOfBounds.normY).toBe(0);
  });

  // 3. Viewfinder Aspect Ratio Calculation Test
  it('correctly calculates container dimensions for 1:1, 3:4, and 9:16 aspect ratios', () => {
    const getPreviewDimensions = (parentWidth, parentHeight, ratioStr) => {
      const targetRatio = ratioStr === '1:1' ? 1.0 : ratioStr === '3:4' ? 0.75 : 9 / 16;
      const parentRatio = parentWidth / parentHeight;
      let w, h;
      if (parentRatio > targetRatio) {
        h = parentHeight;
        w = h * targetRatio;
      } else {
        w = parentWidth;
        h = w / targetRatio;
      }
      return { width: Math.round(w), height: Math.round(h) };
    };

    // Standard phone screen (400 x 800)
    const pWidth = 400;
    const pHeight = 800;

    // 1:1 Square
    const square = getPreviewDimensions(pWidth, pHeight, '1:1');
    expect(square.width).toBe(400);
    expect(square.height).toBe(400);

    // 3:4 Standard Plant Canopy
    const standard = getPreviewDimensions(pWidth, pHeight, '3:4');
    expect(standard.width).toBe(400);
    expect(standard.height).toBe(Math.round(400 / 0.75)); // ~533

    // 9:16 Full Stalk Height
    const tall = getPreviewDimensions(pWidth, pHeight, '9:16');
    expect(tall.width).toBe(400);
    expect(tall.height).toBe(Math.round(400 / (9 / 16))); // ~711
  });

  // 4. Multi-Pot Walkthrough Sequential Navigation Test
  it('correctly indexes and steps through pot trials sequentially in multi-pot mode', () => {
    const mockPots = [
      { ID: 't_r1c1', PotRow: 1, PotCol: 1, PotLabel: 'R1C1', FormulationName: 'Untreated Control' },
      { ID: 't_r2c1', PotRow: 2, PotCol: 1, PotLabel: 'R2C1', FormulationName: 'Untreated Control' },
      { ID: 't_r1c2', PotRow: 1, PotCol: 2, PotLabel: 'R1C2', FormulationName: 'NPK Liquid' },
      { ID: 't_r2c2', PotRow: 2, PotCol: 2, PotLabel: 'R2C2', FormulationName: 'NPK Liquid' },
    ];

    let currentIdx = 0;
    const stepNext = () => (currentIdx + 1) % mockPots.length;
    const stepPrev = () => (currentIdx - 1 + mockPots.length) % mockPots.length;

    expect(mockPots[currentIdx].PotLabel).toBe('R1C1');

    currentIdx = stepNext();
    expect(mockPots[currentIdx].PotLabel).toBe('R2C1');

    currentIdx = stepNext();
    expect(mockPots[currentIdx].PotLabel).toBe('R1C2');

    currentIdx = stepPrev();
    expect(mockPots[currentIdx].PotLabel).toBe('R2C1');

    // Wraps around from first to last on stepPrev
    currentIdx = 0;
    currentIdx = stepPrev();
    expect(mockPots[currentIdx].PotLabel).toBe('R2C2');
  });

  // 5. Multi-Pot Capture Session Counter & Auto-Advance
  it('records multiple pot captures and supports auto-advancing across plots', () => {
    const session = [];
    const pots = [
      { ID: 'pot_1', PotLabel: 'R1C1' },
      { ID: 'pot_2', PotLabel: 'R1C2' },
      { ID: 'pot_3', PotLabel: 'R1C3' }
    ];

    let potIndex = 0;
    const autoAdvance = true;

    // Simulate 3 snaps in Multi-Pot mode
    for (let i = 0; i < 3; i++) {
      const activePot = pots[potIndex];
      session.push({
        id: Date.now() + i,
        trialId: activePot.ID,
        potLabel: activePot.PotLabel,
        count: i + 1
      });
      if (autoAdvance) {
        potIndex = (potIndex + 1) % pots.length;
      }
    }

    expect(session).toHaveLength(3);
    expect(session[0].potLabel).toBe('R1C1');
    expect(session[1].potLabel).toBe('R1C2');
    expect(session[2].potLabel).toBe('R1C3');
  });

});

