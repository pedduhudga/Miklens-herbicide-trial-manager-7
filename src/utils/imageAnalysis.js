/**
 * Precision Weed Cover Analyzer - Pixel-Level Green vs Dead Classification
 * 
 * Uses multi-spectral vegetation index voting (GLI + VARI + ExG + NGRDI) to
 * strictly distinguish LIVING GREEN tissue from DEAD/DESICCATED/TAN/STRAW tissue.
 * 
 * Key Design Decisions:
 * - GLI threshold raised to 0.12 (was 0.05) to exclude pale/faded dry grass
 * - All 4 indices must AGREE a pixel is green (majority vote >= 3/4)
 * - Explicit HSV dead-tissue exclusion zone for tan/straw/brown hues
 * - Returns structured data that can be injected into AI prompts
 */

/**
 * Convert RGB [0-255] to HSL [h: 0-360, s: 0-100, l: 0-100]
 */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = diff / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / diff) % 6);
    else if (max === g) h = 60 * ((b - r) / diff + 2);
    else h = 60 * ((r - g) / diff + 4);
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Convert RGB [0-255] to HSV [h: 0-360, s: 0-100, v: 0-100]
 */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (diff / max) * 100;
  const v = max * 100;

  if (diff !== 0) {
    if (max === r) h = 60 * (((g - b) / diff) % 6);
    else if (max === g) h = 60 * ((b - r) / diff + 2);
    else h = 60 * ((r - g) / diff + 4);
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

/**
 * Classify a single pixel as: 'green' | 'dead' | 'soil' | 'other'
 * Uses 4-index majority voting with HSV sanity checks.
 */
function classifyPixel(r, g, b) {
  // ── Fast-path exclusion: very dark (shadow/deep soil) ──────────────────────
  const brightness = (r + g + b) / 3;
  if (brightness < 30) return 'soil';

  // ── Vegetation indices ─────────────────────────────────────────────────────
  const rn = r / 255, gn = g / 255, bn = b / 255;

  // 1. GLI (Green Leaf Index) — strict threshold
  const gliDenom = (2 * gn + rn + bn) || 1;
  const gli = (2 * gn - rn - bn) / gliDenom;

  // 2. VARI (Visible Atmospherically Resistant Index)
  const variDenom = (gn - rn + bn) || 0.0001;
  const vari = (gn - rn) / Math.abs(variDenom);

  // 3. ExG (Excess Green) - classic vegetation index
  const exg = 2 * gn - rn - bn;

  // 4. NGRDI (Normalized Green-Red Difference Index)
  const ngrdiDenom = (gn + rn) || 0.0001;
  const ngrdi = (gn - rn) / ngrdiDenom;

  // Vote: each index contributes 1 "green" vote if it passes threshold
  let greenVotes = 0;
  if (gli > 0.12) greenVotes++;       // Strict: was 0.05, exclude pale/faded/tan
  if (vari > 0.10) greenVotes++;       // VARI > 0.10 means clearly more green than red
  if (exg > 0.05) greenVotes++;        // ExG > 0.05 is reliable living vegetation
  if (ngrdi > 0.08) greenVotes++;      // NGRDI > 0.08 means green > red channel

  // ── HSV dead-tissue exclusion ──────────────────────────────────────────────
  // Tan, straw, light-brown, and bleached-white (desiccated/dead herbicide control)
  // hues fall in 20-75° range with low saturation. Exclude these even if an index
  // marginally passes (e.g. slightly higher green channel from image compression).
  const { h: hHsv, s: sHsv, v: vHsv } = rgbToHsv(r, g, b);
  const { s: sHsl, l: lHsl } = rgbToHsl(r, g, b);

  // Dead/desiccated exclusion zone:
  // Tan/straw: hue 20-75°, low-medium saturation, medium-high value
  const isDeadTissue =
    (hHsv >= 20 && hHsv <= 75 && sHsv > 8 && sHsv < 55 && vHsv > 25) ||
    // Bleached/white (carotenoid bleaching): very low saturation, high lightness
    (sHsl < 12 && lHsl > 65) ||
    // Reddish-brown (necrosis): red-dominant, low green
    (r > g * 1.25 && r > b * 1.3 && sHsv > 15);

  if (isDeadTissue) {
    // Even if some indices voted green, dead tissue exclusion wins if >=2 votes or dead pattern strong
    if (greenVotes <= 2) return 'dead';
  }

  // ── Soil exclusion (bare dark soil, mulch) ─────────────────────────────────
  const isSoil =
    (hHsv >= 5 && hHsv <= 35 && sHsv > 10 && vHsv < 40) ||
    (brightness < 60 && sHsv < 20);

  if (isSoil && greenVotes < 3) return 'soil';

  // ── Final classification ────────────────────────────────────────────────────
  // Require ≥ 3/4 votes for confident "green" to prevent false positives
  if (greenVotes >= 3) return 'green';
  if (greenVotes >= 2 && gli > 0.08 && exg > 0.02) return 'green'; // softer fallback for confirmed dual-index

  return isDeadTissue ? 'dead' : 'other';
}

/**
 * Main export: Analyze weed cover from an image data URL.
 * 
 * Returns:
 *  - cover: % of frame that is LIVING GREEN weed
 *  - deadCover: % of frame that is DEAD/DESICCATED vegetation
 *  - greenRatio: 0-1 fraction of pixels classified as green
 *  - deadRatio: 0-1 fraction of pixels classified as dead
 *  - vari: average VARI index
 *  - vegetationIndex: 0-100 normalized VARI
 *  - confidence: analysis confidence (%)
 *  - pixelVerdict: human-readable string for injection into AI prompts
 *  - breakdown: { green, dead, soil, other } as percentages
 */
export async function analyzeWeedCover(imageDataUrl, greenOnly = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Resize for performance — larger than before (1024px) for better accuracy
        const maxDim = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        let totalPixels = 0;
        let greenPixels = 0;
        let deadPixels = 0;
        let soilPixels = 0;
        let otherPixels = 0;
        let totalVARI = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // Skip transparent pixels
          if (a < 10) continue;

          totalPixels++;

          // VARI for overall greenness index
          const gn = g / 255, rn = r / 255, bn = b / 255;
          const variDenom = (gn - rn + bn) || 0.0001;
          totalVARI += (gn - rn) / Math.abs(variDenom);

          const cls = classifyPixel(r, g, b);
          if (cls === 'green') greenPixels++;
          else if (cls === 'dead') deadPixels++;
          else if (cls === 'soil') soilPixels++;
          else otherPixels++;
        }

        if (totalPixels === 0) {
          reject(new Error('No valid pixels found in image'));
          return;
        }

        const greenRatio = greenPixels / totalPixels;
        const deadRatio = deadPixels / totalPixels;
        const soilRatio = soilPixels / totalPixels;

        const coverPct = Math.round(greenRatio * 100);
        const deadCoverPct = Math.round(deadRatio * 100);

        const avgVARI = totalVARI / totalPixels;
        // Normalize VARI -0.3 to +0.6 → 0 to 100
        const vegetationIndex = Math.min(100, Math.max(0, ((avgVARI + 0.3) / 0.9) * 100));

        const confidence = calculateConfidence(totalPixels, width, height);

        // Build a human-readable pixel verdict for injection into AI prompts
        let pixelVerdict;
        if (coverPct <= 5) {
          pixelVerdict = `Pixel analysis: ${coverPct}% active green tissue detected. ${deadCoverPct}% dead/desiccated tissue visible. The plot is predominantly brown/tan — herbicide control appears near-complete.`;
        } else if (coverPct <= 20) {
          pixelVerdict = `Pixel analysis: ${coverPct}% active green tissue detected. ${deadCoverPct}% dead/desiccated tissue visible. Strong herbicide activity evident with limited surviving green patches.`;
        } else if (coverPct <= 40) {
          pixelVerdict = `Pixel analysis: ${coverPct}% active green tissue detected. ${deadCoverPct}% dead/desiccated tissue visible. Moderate herbicide control with significant green survivors.`;
        } else {
          pixelVerdict = `Pixel analysis: ${coverPct}% active green tissue detected. ${deadCoverPct}% dead/desiccated tissue visible. High surviving green cover — limited herbicide activity.`;
        }

        resolve({
          cover: coverPct,
          deadCover: deadCoverPct,
          greenRatio,
          deadRatio,
          vari: avgVARI.toFixed(4),
          vegetationIndex: Math.round(vegetationIndex),
          confidence,
          mode: greenOnly ? 'green-only' : 'multi-class',
          pixelVerdict,
          breakdown: {
            green: coverPct,
            dead: deadCoverPct,
            soil: Math.round(soilRatio * 100),
            other: Math.round((otherPixels / totalPixels) * 100)
          },
          details: {
            totalPixels,
            greenPixels,
            deadPixels,
            soilPixels,
            resolution: `${Math.round(width)}x${Math.round(height)}`
          }
        });

      } catch (error) {
        reject(new Error('Failed to analyze image: ' + error.message));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}

function calculateConfidence(totalPixels, width, height) {
  const resolutionScore = Math.min((totalPixels / 150000) * 50, 50);
  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  const aspectScore = aspectRatio < 2.5 ? 35 : 20;
  return Math.round(15 + resolutionScore + aspectScore);
}
