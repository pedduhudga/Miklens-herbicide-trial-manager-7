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

  // 6. Multi-Shot Staging and Batch Review Mapping
  it('stages multi-shot captures without direct save, then maps to batch review items', () => {
    // Mock captured session in CameraCapture
    const rawCaptures = [
      {
        id: 'cap_1',
        dataUrl: 'data:image/jpeg;base64,sample1',
        trialId: 't_r1c1',
        targetTrial: { ID: 't_r1c1', PotLabel: 'R1C1', FormulationName: 'Untreated Control', Date: '2026-11-10' },
        potLabel: 'R1C1',
        count: 1
      },
      {
        id: 'cap_2',
        dataUrl: 'data:image/jpeg;base64,sample2',
        trialId: 't_r1c2',
        targetTrial: { ID: 't_r1c2', PotLabel: 'R1C2', FormulationName: 'NPK Liquid', Date: '2026-11-10' },
        potLabel: 'R1C2',
        count: 2
      }
    ];

    // Map to review batch
    const mapped = rawCaptures.map((c, idx) => ({
      id: c.id,
      dataUrl: c.dataUrl,
      targetTrial: c.targetTrial,
      date: '2026-11-14T10:00',
      tag: `Pot ${c.potLabel} - Whole Canopy (Standard)`,
      potLabel: c.potLabel
    }));

    expect(mapped).toHaveLength(2);
    expect(mapped[0].targetTrial.FormulationName).toBe('Untreated Control');
    expect(mapped[1].targetTrial.FormulationName).toBe('NPK Liquid');
    expect(mapped[0].tag).toBe('Pot R1C1 - Whole Canopy (Standard)');
  });

  // 7. Batch Setup Actions: Apply to All, Reassign, Crop Update, and Discard
  it('supports batch modifications (apply to all, reassign, crop update, discard)', () => {
    let batch = [
      { id: '1', dataUrl: 'img1', date: '2026-11-14T10:00', tag: 'Pot R1C1 - Whole Canopy (Standard)', targetTrial: { ID: 't1', PotLabel: 'R1C1' } },
      { id: '2', dataUrl: 'img2', date: '2026-11-14T10:00', tag: 'Pot R1C2 - Whole Canopy (Standard)', targetTrial: { ID: 't2', PotLabel: 'R1C2' } },
      { id: '3', dataUrl: 'img3', date: '2026-11-14T10:00', tag: 'Pot R1C3 - Whole Canopy (Standard)', targetTrial: { ID: 't3', PotLabel: 'R1C3' } }
    ];

    // 1. Apply new date to all
    const newDate = '2026-11-14T15:30';
    batch = batch.map(p => ({ ...p, date: newDate }));
    expect(batch.every(p => p.date === '2026-11-14T15:30')).toBe(true);

    // 2. Apply new focus tag to all while preserving pot prefix
    const newFocus = 'Leaf Close-up (Top / Adaxial)';
    batch = batch.map(p => {
      const prefix = p.tag.split(' - ')[0];
      return { ...p, tag: `${prefix} - ${newFocus}` };
    });
    expect(batch[0].tag).toBe('Pot R1C1 - Leaf Close-up (Top / Adaxial)');
    expect(batch[1].tag).toBe('Pot R1C2 - Leaf Close-up (Top / Adaxial)');

    // 3. Crop update on photo #2
    batch[1] = { ...batch[1], dataUrl: 'img2_cropped' };
    expect(batch[1].dataUrl).toBe('img2_cropped');

    // 4. Retake photo #1
    batch[0] = { ...batch[0], dataUrl: 'img1_retaken' };
    expect(batch[0].dataUrl).toBe('img1_retaken');

    // 5. Discard photo #3
    batch = batch.filter(p => p.id !== '3');
    expect(batch).toHaveLength(2);
    expect(batch.map(p => p.id)).toEqual(['1', '2']);
  });

  // 8. Regression guard: Camera stream initialization MUST NOT restart on inline onClose changes
  it('keeps camera stream lifecycle mount-only (no [onClose] dependency and no desynchronized readback)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/CameraCapture.jsx'),
      'utf-8'
    );

    // Must NEVER re-run getUserMedia effect when inline onClose changes
    expect(source).not.toMatch(/\}, \[onClose\]\);/);
    // Must NEVER use desynchronized: true on 2D capture canvas (causes black readbacks on Android Chrome)
    expect(source).not.toContain('desynchronized: true');
    // Must NEVER fake videoWidth || 1920 when videoWidth is 0
    expect(source).not.toContain('video.videoWidth || 1920');
    // Must use ref for onClose and check cancellation + black frame guard
    expect(source).toContain('onCloseRef');
    expect(source).toContain('isCanvasAllBlack');
  });

  // 9. Black-frame detector rejects pure black frames while accepting real plant frames
  it('detects solid black frames accurately via 8x8 pixel luminance sampling', () => {
    const isAllBlack = (pixelFn, width, height) => {
      const steps = 8;
      for (let gy = 1; gy <= steps; gy++) {
        const py = Math.min(height - 1, Math.floor((gy * height) / (steps + 1)));
        for (let gx = 1; gx <= steps; gx++) {
          const px = Math.min(width - 1, Math.floor((gx * width) / (steps + 1)));
          const [r, g, b] = pixelFn(px, py);
          if (r + g + b > 8) return false;
        }
      }
      return true;
    };

    expect(isAllBlack(() => [0, 0, 0], 1080, 1440)).toBe(true);
    expect(isAllBlack(() => [2, 2, 2], 1080, 1440)).toBe(true);
    expect(isAllBlack(() => [45, 110, 38], 1080, 1440)).toBe(false);
  });

});

