// src/utils/phenotyping.js
// 100% Free Client-Side Computer Vision & Digital Plant Phenotyping Engine.
// Uses HTML5 Canvas pixel analytics with standard agronomic vegetative indices:
// - Excess Green Index (ExG = 2G - R - B) for active photosynthesizing canopy.
// - Necrosis & Chlorosis desiccation index for herbicide burn and weed mortality.
// Runs 100% offline in ~40ms on device with ZERO cloud/API costs.

/**
 * Load an image URL or base64 string into an HTMLImageElement
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image for phenotyping analysis'));
    img.src = src;
  });
}

/**
 * Analyze an image or canvas for green canopy cover vs necrotic desiccation.
 * @param {HTMLImageElement|HTMLCanvasElement|string} imageSource - Image element or URL
 * @param {Object} options - { sampleStep, minBrightness }
 * @returns {Promise<Object>} Phenotypic metrics and desiccation stats
 */
export async function analyzePlantPhenotype(imageSource, options = {}) {
  const { sampleStep = 2, minBrightness = 25, canvas: customCanvas } = options;

  let img;
  if (typeof imageSource === 'string') {
    img = await loadImage(imageSource);
  } else {
    img = imageSource;
  }

  // Create an offscreen canvas sized for optimal throughput (max 600px width/height)
  const maxDim = 600;
  let width = img.naturalWidth || img.width || 400;
  let height = img.naturalHeight || img.height || 300;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = customCanvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!canvas) throw new Error('Canvas environment required for pixel phenotyping');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let totalSampled = 0;
  let greenPixels = 0;
  let necroticPixels = 0;
  let soilBackgroundPixels = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 50) continue; // Skip transparent
      totalSampled++;

      // Brightness check to filter dark shadows
      const brightness = (r + g + b) / 3;
      if (brightness < minBrightness) {
        soilBackgroundPixels++;
        continue;
      }

      // Excess Green Index (ExG = 2G - R - B)
      const exg = 2 * g - r - b;
      // Normalized Green-Red Difference Index (NGRDI = (G - R) / (G + R + epsilon))
      const ngrdi = (g - r) / (g + r + 0.001);

      // Active Green Photosynthetic Foliage Threshold
      const isGreen = (exg > 15 && ngrdi > 0.05 && g > b);

      // Desiccated / Chlorotic / Necrotic Foliage Threshold
      // Characteristics: Brownish, yellowing, or bleached foliage where Red & Green dominate over Blue,
      // but Red is significantly elevated relative to Green compared to healthy foliage.
      const isNecrotic = !isGreen && (
        (r > 70 && g > 50 && b < 100 && r >= g - 15 && (r + g) > 2 * b) ||
        (r > 100 && g > 90 && b < 80) // Chlorotic yellowing
      );

      if (isGreen) {
        greenPixels++;
      } else if (isNecrotic) {
        necroticPixels++;
      } else {
        soilBackgroundPixels++;
      }
    }
  }

  const totalFoliage = greenPixels + necroticPixels;
  const greenCanopyPct = totalSampled > 0 ? ((greenPixels / totalSampled) * 100) : 0;
  const necroticPct = totalSampled > 0 ? ((necroticPixels / totalSampled) * 100) : 0;
  
  // Mathematical Weed Control Desiccation Efficacy %:
  // Ratio of necrotic/burnt tissue relative to total observed foliage
  let calculatedDesiccationRate = 0;
  if (totalFoliage > 0) {
    calculatedDesiccationRate = Math.round((necroticPixels / totalFoliage) * 100);
  }

  let heatmapDataUrl = null;
  if (options.generateHeatmap) {
    try {
      heatmapDataUrl = generatePhenotypeHeatmap(img, { sampleStep });
    } catch (e) {
      // In headless test environments canvas/document may be mocked
    }
  }

  const roundedDesiccation = Math.min(Math.max(calculatedDesiccationRate, 0), 100);
  const roundedGreenPct = parseFloat(greenCanopyPct.toFixed(1));
  const roundedNecroticPct = parseFloat(necroticPct.toFixed(1));

  return {
    totalSampled,
    greenPixels,
    necroticPixels,
    totalFoliagePixels: totalFoliage,
    greenCanopyPct: roundedGreenPct,
    necroticPct: roundedNecroticPct,
    necrosisPct: roundedNecroticPct,
    calculatedDesiccationRate: roundedDesiccation,
    estimatedWeedControlPct: roundedDesiccation,
    heatmapDataUrl,
    confidence: totalFoliage > (totalSampled * 0.1) ? 'High' : 'Moderate (Low canopy coverage)'
  };
}

/**
 * Generate a visual heatmap overlay canvas showing detected green foliage in emerald
 * and necrotic/desiccated tissue in burning amber/red.
 */
export function generatePhenotypeHeatmap(imageSource, options = {}) {
  const { sampleStep = 1 } = options;
  const img = imageSource;
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const exg = 2 * g - r - b;
    const ngrdi = (g - r) / (g + r + 0.001);
    const isGreen = (exg > 15 && ngrdi > 0.05 && g > b);
    const isNecrotic = !isGreen && (
      (r > 70 && g > 50 && b < 100 && r >= g - 15 && (r + g) > 2 * b) ||
      (r > 100 && g > 90 && b < 80)
    );

    if (isGreen) {
      // Highlight live weed foliage in translucent emerald green
      data[i] = 16;     // R
      data[i + 1] = 185; // G
      data[i + 2] = 129; // B
    } else if (isNecrotic) {
      // Highlight desiccated/dead weed tissue in glowing amber/orange
      data[i] = 245;    // R
      data[i + 1] = 158; // G
      data[i + 2] = 11;  // B
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Compare two chronological plant canopy images (e.g., 0 DAA Baseline vs 7 DAA Current)
 * to calculate delta canopy reduction, necrotic tissue expansion, and desiccation velocity.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|string} baselineSource - Baseline image (0 DAA)
 * @param {HTMLImageElement|HTMLCanvasElement|string} currentSource - Current observation image (X DAA)
 * @param {Object} options - { daysBetween, generateHeatmaps, sampleStep, baselineCanvas, currentCanvas }
 * @returns {Promise<Object>} Comprehensive progression analysis
 */
export async function comparePhenotypeProgression(baselineSource, currentSource, options = {}) {
  const { daysBetween = null, generateHeatmaps = true, sampleStep = 2, baselineCanvas, currentCanvas } = options;

  const [baselineMetrics, currentMetrics] = await Promise.all([
    analyzePlantPhenotype(baselineSource, { sampleStep, generateHeatmap: generateHeatmaps, canvas: baselineCanvas }),
    analyzePlantPhenotype(currentSource, { sampleStep, generateHeatmap: generateHeatmaps, canvas: currentCanvas })
  ]);

  // Delta Green Canopy Reduction: Baseline Green % - Current Green %
  // Positive value indicates live weed canopy has been destroyed.
  const deltaGreenPct = parseFloat((baselineMetrics.greenCanopyPct - currentMetrics.greenCanopyPct).toFixed(1));

  // Delta Necrosis Expansion: Current Necrosis % - Baseline Necrosis %
  // Positive value indicates herbicide chemical burning has increased.
  const deltaNecrosisPct = parseFloat((currentMetrics.necroticPct - baselineMetrics.necroticPct).toFixed(1));

  // Relative Knockdown Efficacy %:
  // How much of the baseline photosynthetic foliage was suppressed
  let knockdownRate = 0;
  if (baselineMetrics.greenCanopyPct > 0) {
    const rawReduction = ((baselineMetrics.greenCanopyPct - currentMetrics.greenCanopyPct) / baselineMetrics.greenCanopyPct) * 100;
    knockdownRate = Math.min(100, Math.max(0, Math.round(rawReduction)));
  } else {
    knockdownRate = currentMetrics.calculatedDesiccationRate;
  }

  // Desiccation Velocity: % canopy destruction per day
  let desiccationVelocity = null;
  const days = Number(daysBetween);
  if (!isNaN(days) && days > 0) {
    desiccationVelocity = parseFloat((Math.max(deltaGreenPct, deltaNecrosisPct) / days).toFixed(2));
  }

  return {
    baselineMetrics,
    currentMetrics,
    deltaGreenPct,
    deltaNecrosisPct,
    knockdownRate,
    desiccationVelocity,
    daysBetween: days > 0 ? days : null,
    progressionSummary: deltaGreenPct > 0
      ? `Live canopy reduced by ${deltaGreenPct}% with ${currentMetrics.necroticPct}% foliar desiccation.`
      : `No significant canopy reduction detected between observations.`
  };
}

