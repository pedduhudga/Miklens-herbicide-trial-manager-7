import { canonicalizeWeedSpecies } from './weedUtils.js';

export function safeJsonParse(str, fallback = null) {
    try {
        return str ? JSON.parse(str) : fallback;
    } catch (e) {
        return fallback;
    }
}

export function truncateText(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

export function escapeHtml(text) {
    if (!text) return '';
    // We shouldn't use document.createElement in a pure util file. Use regex replace instead.
    return text.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
export function extractMetricValue (observation, project) {
    if (!observation) return null;
    const category = project?.Category || 'herbicide';

    if (category === 'herbicide') {
        if (observation.weedDetails && observation.weedDetails.length > 0) {
            const targetWeed = project.TargetWeed || project.WeedSpecies;
            if (targetWeed) {
                const targetCanonical = canonicalizeWeedSpecies(targetWeed);
                const matchedWeed = observation.weedDetails.find(w => {
                    if (!w.species) return false;
                    const speciesCanonical = canonicalizeWeedSpecies(w.species);
                    return speciesCanonical === targetCanonical ||
                        speciesCanonical.toLowerCase().includes(targetCanonical.toLowerCase()) ||
                        targetCanonical.toLowerCase().includes(speciesCanonical.toLowerCase());
                });
                if (matchedWeed) {
                    const v = parseFloat(matchedWeed.cover);
                    return isFinite(v) ? v : null;
                }
            }
            const v = parseFloat(observation.weedDetails[0].cover);
            return isFinite(v) ? v : null;
        }
        return isFinite(parseFloat(observation.weedCover)) ? parseFloat(observation.weedCover) : null;
    }

    if (category === 'fungicide') {
        return isFinite(parseFloat(observation.diseaseSeverity)) ? parseFloat(observation.diseaseSeverity) : 
               isFinite(parseFloat(observation.diseaseIncidence)) ? parseFloat(observation.diseaseIncidence) : null;
    }

    if (category === 'pesticide') {
        return isFinite(parseFloat(observation.pestCount)) ? parseFloat(observation.pestCount) : 
               isFinite(parseFloat(observation.damageRating)) ? parseFloat(observation.damageRating) : null;
    }

    if (category === 'nutrition') {
        return isFinite(parseFloat(observation.yieldKgPlot)) ? parseFloat(observation.yieldKgPlot) : 
               isFinite(parseFloat(observation.plantHeight)) ? parseFloat(observation.plantHeight) : 
               isFinite(parseFloat(observation.chlorophyllIndex)) ? parseFloat(observation.chlorophyllIndex) : 
               isFinite(parseFloat(observation.biomassWeight)) ? parseFloat(observation.biomassWeight) : null;
    }

    if (category === 'biostimulant') {
        return isFinite(parseFloat(observation.overallVigor)) ? parseFloat(observation.overallVigor) : 
               isFinite(parseFloat(observation.plantHeight)) ? parseFloat(observation.plantHeight) : 
               isFinite(parseFloat(observation.chlorophyllIndex)) ? parseFloat(observation.chlorophyllIndex) : 
               isFinite(parseFloat(observation.biomassWeight)) ? parseFloat(observation.biomassWeight) : null;
    }

    return null;
};

export function formatSignificance(pValue) {
    if (pValue === null || pValue === undefined) {
        return { symbol: '?', text: 'Cannot compute', p: null };
    }
    if (pValue < 0.001) {
        return { symbol: '***', text: 'Highly Significant', p: pValue };
    }
    if (pValue < 0.01) {
        return { symbol: '**', text: 'Very Significant', p: pValue };
    }
    if (pValue < 0.05) {
        return { symbol: '*', text: 'Significant', p: pValue };
    }
    return { symbol: 'NS', text: 'Not Significant', p: pValue };
}

export function getPlotAreaHectares(plotSize) {
  let length = 10; // default meters
  let width = 2;   // default meters
  let unit = 'm';  // default meters

  if (plotSize) {
    if (typeof plotSize === 'object') {
      length = parseFloat(plotSize.length || plotSize.Length || 10);
      width = parseFloat(plotSize.width || plotSize.Width || 2);
      unit = String(plotSize.unit || plotSize.Unit || 'm').toLowerCase();
    } else if (typeof plotSize === 'string') {
      const m = plotSize.match(/(\d+(?:\.\d+)?)\s*(m|ft|feet|meters)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(m|ft|feet|meters)?/i);
      if (m) {
        length = parseFloat(m[1]);
        width = parseFloat(m[3]);
        const u = m[2] || m[4] || 'm';
        unit = /ft|feet/i.test(u) ? 'ft' : 'm';
      }
    }
  }

  const areaSq = length * width;
  if (unit === 'ft' || unit === 'feet') {
    return areaSq / 107639.104; // sq ft to hectares
  }
  return areaSq / 10000; // sq meters to hectares
}