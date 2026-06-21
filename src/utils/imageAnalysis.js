/**
 * AI-Powered Weed Cover Analyzer
 * Offline image analysis using color-based segmentation
 * Detects GREEN (living weeds) and BROWN/YELLOW (burnt/dead weeds)
 */
export async function analyzeWeedCover(imageDataUrl, greenOnly = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Resize for performance
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else if (height > maxDim) {
          width = (width / height) * maxDim;
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        let totalPixels = 0;
        let vegetationPixels = 0;
        let greenPixels = 0;
        let brownPixels = 0;
        let totalVARI = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          totalPixels++;

          // --- SCIENTIFIC UPGRADE: VARI (Visible Atmospherically Resistant Index) ---
          const denom = g + r - b;
          const vari = (g - r) / (denom === 0 ? 0.0001 : denom);
          totalVARI += vari;

          // --- SCIENTIFIC UPGRADE: Green Leaf Index (GLI) ---
          const gli = (2 * g - r - b) / (2 * g + r + b || 1);
          const isVegetation = gli > 0.05; // Standard threshold for living green

          if (isVegetation) {
            greenPixels++;
            vegetationPixels++;
          } else if (!greenOnly) {
            // Fallback for senesced/brown tissue using HSV if needed
            const { h, s, v } = rgbToHsv(r, g, b);
            const isBrown = h >= 20 && h <= 55 && s > 12 && v > 20 && v < 85;
            if (isBrown) {
              brownPixels++;
              vegetationPixels++;
            }
          }
        }

        const coveragePercent = (vegetationPixels / totalPixels) * 100;
        const avgVARI = totalVARI / totalPixels;
        // Vegetation index normalization: VARI -0.1 to 0.4 -> 0 to 100
        const vegetationIndex = Math.min(100, Math.max(0, ((avgVARI + 0.1) / 0.5) * 100));
        const confidence = calculateConfidence(totalPixels, width, height);

        resolve({
          cover: Math.round(coveragePercent),
          vari: avgVARI.toFixed(4),
          vegetationIndex: Math.round(vegetationIndex),
          confidence: confidence,
          mode: greenOnly ? 'green-only' : 'all-vegetation',
          breakdown: {
            green: Math.round((greenPixels / totalPixels) * 100),
            brown: Math.round((brownPixels / totalPixels) * 100),
            total: Math.round(coveragePercent)
          },
          details: {
            totalPixels: totalPixels,
            vegetationPixels: vegetationPixels,
            greenPixels: greenPixels,
            brownPixels: brownPixels,
            resolution: `${Math.round(width)}-${Math.round(height)}`
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

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = max === 0 ? 0 : (diff / max) * 100;
  let v = max * 100;

  if (diff !== 0) {
    if (max === r) h = 60 * (((g - b) / diff) % 6);
    else if (max === g) h = 60 * (((b - r) / diff) + 2);
    else h = 60 * (((r - g) / diff) + 4);
  }
  if (h < 0) h += 360;
  return { h, s, v };
}

function calculateConfidence(totalPixels, width, height) {
  const resolutionScore = Math.min((totalPixels / 100000) * 50, 50);
  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  const aspectScore = aspectRatio < 2 ? 30 : 20;
  return Math.round(20 + resolutionScore + aspectScore);
}
