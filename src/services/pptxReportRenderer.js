/**
 * pptxReportRenderer.js
 * Tasks 46-52: PowerPoint report generator for the advanced reporting pipeline.
 * Uses pptxgenjs (already installed: "pptxgenjs": "^4.0.1").
 * Accepts a ReportData object from reportDataBuilder.js.
 */

import pptxgen from 'pptxgenjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeName(s) {
  return (s || 'report').replace(/[^a-z0-9_\-]/gi, '_');
}

function fmt(val, d = 2) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

function sigStars(p) {
  if (p === null || p === undefined) return '?';
  if (p <= 0.01) return '**';
  if (p <= 0.05) return '*';
  return 'NS';
}

/**
 * Returns hex accent color for a given category.
 * Used for slide headers and chart bars.
 */
function getCategoryHex(category) {
  switch ((category || '').toLowerCase()) {
    case 'fungicide':    return '4F46E5';
    case 'pesticide':    return 'DC2626';
    case 'nutrition':
    case 'biostimulant': return 'D97706';
    case 'herbicide':
    default:             return '0D9488';
  }
}

function getTier(mean, isCtrl = false) {
  if (isCtrl) return { label: 'UTC/Control', hex: 'DDDDDD' };
  if (mean >= 80) return { label: 'Excellent', hex: 'CCFFCC' };
  if (mean >= 60) return { label: 'Good',      hex: 'FFFFCC' };
  if (mean >= 40) return { label: 'Fair',      hex: 'FFE6CC' };
  return              { label: 'Poor',      hex: 'FFCCCC' };
}

/**
 * Loads an image src to base64 via canvas (for photo slides).
 * Returns null on failure.
 */
async function toBase64(src, maxPx = 600) {
  if (!src) return null;
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const scale = Math.min(1, maxPx / Math.max(img.width || 1, img.height || 1));
          const w = Math.round((img.width || maxPx) * scale);
          const h = Math.round((img.height || maxPx) * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  } catch { return null; }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates and downloads a PowerPoint presentation from a ReportData object.
 *
 * Slides:
 *  1. Title slide
 *  2. Trial Design
 *  3. Treatment Means Bar Chart
 *  4. ANOVA Results Table
 *  5. Treatment Ranking
 *  6. Conclusions
 *  7. (Optional) Photos — up to 6, 2×3 grid
 *
 * @param {object} reportData  — ReportData object from reportDataBuilder.js
 * @param {object} [options]   — { includePhotos }
 */
export async function generateProjectPPTX(reportData, options = {}) {
  const meta      = reportData.meta || {};
  const param     = reportData.primaryParameter || {};
  const anova     = param.anova || null;
  const paramLabel = param.label || param.key || 'Primary Parameter';
  const category   = meta.category || 'herbicide';
  const accentHex  = getCategoryHex(category);
  const accentRgb  = [
    parseInt(accentHex.slice(0,2), 16),
    parseInt(accentHex.slice(2,4), 16),
    parseInt(accentHex.slice(4,6), 16),
  ];

  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);

  // Guard: need at least 2 treatments
  if (treatmentNames.length < 2) {
    window.dispatchEvent(new CustomEvent('app:toast', {
      detail: { msg: 'Cannot generate PPTX: fewer than 2 treatment groups found.', type: 'error' }
    }));
    return;
  }

  const prs = new pptxgen();
  prs.layout = 'LAYOUT_16x9';
  prs.author  = 'Miklens Trial Manager';
  prs.subject = meta.projectName || 'Trial Report';

  const SLIDE_W = 10;   // inches (16x9)
  const SLIDE_H = 5.625;
  const ACCENT   = accentHex;
  const WHITE    = 'FFFFFF';
  const DARK     = '1E293B';
  const GRAY     = '64748B';
  const LIGHT_BG = 'F8FAFC';

  // Shared header band helper
  function addHeaderBand(slide, title, subtitle = '') {
    slide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: 0.85,
      fill: { color: ACCENT },
    });
    slide.addText(title, {
      x: 0.25, y: 0.05, w: SLIDE_W - 0.5, h: 0.55,
      fontSize: 20, bold: true, color: WHITE, align: 'left',
    });
    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.25, y: 0.55, w: SLIDE_W - 0.5, h: 0.28,
        fontSize: 10, color: 'DDFFFD', align: 'left',
      });
    }
  }

  // ─── SLIDE 1: Title ─────────────────────────────────────────────────────────
  {
    const slide = prs.addSlide();
    // Full background accent colour header
    slide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: SLIDE_H * 0.55,
      fill: { color: ACCENT },
    });
    // Project name
    slide.addText(meta.projectName || 'Trial Report', {
      x: 0.5, y: 0.6, w: SLIDE_W - 1, h: 1.4,
      fontSize: 32, bold: true, color: WHITE, align: 'center',
      breakLine: false, wrap: true,
    });
    // Category + date subtitle
    const categoryLabel = (category.charAt(0).toUpperCase() + category.slice(1)) + ' Trial';
    slide.addText(categoryLabel, {
      x: 0.5, y: 1.9, w: SLIDE_W - 1, h: 0.4,
      fontSize: 14, color: 'CCFFF8', align: 'center',
    });
    // Trial count badge
    const trialCount = Array.isArray(reportData.treatmentList) ? reportData.treatmentList.reduce((s, t) => s + (t.replicationCount || 0), 0) : '?';
    slide.addText(`${treatmentNames.length} treatments · ${meta.replications || '?'} reps · ${trialCount} plots`, {
      x: 0.5, y: 2.35, w: SLIDE_W - 1, h: 0.3,
      fontSize: 11, color: 'A7F3D0', align: 'center',
    });
    // Light background bottom area
    slide.addShape(prs.ShapeType.rect, {
      x: 0, y: SLIDE_H * 0.55, w: SLIDE_W, h: SLIDE_H * 0.45,
      fill: { color: LIGHT_BG },
    });
    // Metadata row
    const appDates = Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—');
    const metaText = [
      meta.investigator ? `Investigator: ${meta.investigator}` : null,
      meta.location     ? `Location: ${meta.location}` : null,
      appDates          ? `Applied: ${appDates}` : null,
      meta.reportDate   ? `Report: ${meta.reportDate}` : null,
    ].filter(Boolean).join('   |   ');
    slide.addText(metaText, {
      x: 0.5, y: 3.5, w: SLIDE_W - 1, h: 0.35,
      fontSize: 9, color: GRAY, align: 'center',
    });
  }

  // ─── SLIDE 2: Trial Design ──────────────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, 'Trial Design', `${meta.designLabel || meta.design || 'RCBD'} — ${meta.targetSpecies || ''}`);

    const appDates = Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—');
    const designCards = [
      { label: 'Design', value: meta.designLabel || meta.design || 'RCBD' },
      { label: 'Treatments',   value: String(meta.treatments || treatmentNames.length) },
      { label: 'Replications', value: String(meta.replications || '?') },
      { label: 'Category',     value: (category.charAt(0).toUpperCase() + category.slice(1)) },
      { label: 'Target',       value: meta.targetSpecies || '—' },
      { label: 'Applied',      value: appDates },
      { label: 'Location',     value: meta.location || '—' },
      { label: 'Crop',         value: meta.crop || '—' },
    ];
    const cardW = 2.2, cardH = 0.85, cols = 4, startX = 0.25, startY = 1.0;
    designCards.forEach((card, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (cardW + 0.12);
      const y = startY + row * (cardH + 0.12);
      slide.addShape(prs.ShapeType.rect, { x, y, w: cardW, h: cardH, fill: { color: WHITE }, line: { color: ACCENT, width: 1 } });
      slide.addText(card.label, { x, y: y + 0.06, w: cardW, h: 0.28, fontSize: 8, color: GRAY, align: 'center', bold: false });
      slide.addText(String(card.value), { x, y: y + 0.34, w: cardW, h: 0.44, fontSize: 13, bold: true, color: DARK, align: 'center', wrap: true });
    });
  }

  // ─── SLIDE 3: Treatment Means Bar Chart ─────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, `Treatment Means — ${paramLabel}`, `Mean values with CLD groupings`);

    // Sort treatments by mean descending for display
    const sortedTrts = [...treatmentNames].sort((a, b) => (paramMeansObj[b]?.mean ?? 0) - (paramMeansObj[a]?.mean ?? 0));
    const means = sortedTrts.map(t => parseFloat(fmt(paramMeansObj[t]?.mean ?? 0)));
    const labels = sortedTrts.map(t => {
      const cld = paramMeansObj[t]?.cldLetter || '';
      return `${t}${cld ? ' (' + cld + ')' : ''}`;
    });

    if (means.length > 0) {
      try {
        prs.addChart
          ? slide.addChart(prs.ChartType?.bar || 'bar', [{ name: paramLabel, labels, values: means }], {
              x: 0.3, y: 0.95, w: SLIDE_W - 0.6, h: SLIDE_H - 1.15,
              barDir: 'bar', // horizontal
              barGrouping: 'clustered',
              chartColors: [ACCENT],
              showValue: true,
              valAxisNumFmt: '0.0',
              catAxisLabelFontSize: 9,
              valAxisLabelFontSize: 9,
              dataLabelFontSize: 8,
              dataLabelColor: WHITE,
              titleFontSize: 0,
              showTitle: false,
              showLegend: false,
            })
          : null;
      } catch (_e) {
        // Fallback: text table if chart API unavailable
        slide.addText('Chart rendering not available in this environment.', {
          x: 0.5, y: 2, w: SLIDE_W - 1, h: 0.4, fontSize: 11, color: GRAY, align: 'center',
        });
      }
    }
  }

  // ─── SLIDE 4: ANOVA Results Table ───────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    const pVal0 = anova ? (anova.p?.[0] ?? null) : null;
    const isSig = pVal0 !== null && pVal0 <= 0.05;
    addHeaderBand(slide, 'ANOVA Results', isSig ? `Significant at p = ${fmt(pVal0, 4)}` : (pVal0 !== null ? `Not significant (p = ${fmt(pVal0, 4)})` : ''));

    if (anova && !anova.error && Array.isArray(anova.source)) {
      const colW = [2.5, 1.4, 0.8, 1.4, 1.2, 1.2];
      const headers = ['Source', 'SS', 'df', 'MS', 'F-value', 'p-value'];

      // Header row
      headers.forEach((h, ci) => {
        let x = 0.25; for (let i = 0; i < ci; i++) x += colW[i];
        slide.addShape(prs.ShapeType.rect, { x, y: 1.0, w: colW[ci], h: 0.35, fill: { color: '2C3E50' } });
        slide.addText(h, { x, y: 1.0, w: colW[ci], h: 0.35, fontSize: 9, bold: true, color: WHITE, align: 'center' });
      });

      // Data rows
      anova.source.forEach((src, ri) => {
        const pV = anova.p?.[ri];
        const fV = anova.f?.[ri];
        const rowBg = (src === 'Treatments' && isSig) ? 'D4EDDA' : (ri % 2 === 0 ? 'F0F9F7' : WHITE);
        const rowVals = [
          src,
          fmt(anova.ss?.[ri]),
          String(anova.df?.[ri] ?? '—'),
          anova.ms?.[ri] != null ? fmt(anova.ms[ri]) : '—',
          fV != null ? fmt(fV, 3) : '—',
          pV != null ? fmt(pV, 4) : '—',
        ];
        rowVals.forEach((val, ci) => {
          let x = 0.25; for (let i = 0; i < ci; i++) x += colW[i];
          const y = 1.35 + ri * 0.35;
          slide.addShape(prs.ShapeType.rect, { x, y, w: colW[ci], h: 0.33, fill: { color: rowBg } });
          slide.addText(String(val), { x, y, w: colW[ci], h: 0.33, fontSize: 9, color: DARK, align: 'center' });
        });
      });

      // Stats strip
      const statsY = 1.35 + anova.source.length * 0.35 + 0.15;
      const statsItems = [
        `Grand Mean: ${fmt(anova.grandMean)}`,
        `CV%: ${anova.cv != null ? fmt(anova.cv, 1) + '%' : '—'}`,
        `SEm±: ${fmt(anova.sem)}`,
        `LSD 5%: ${fmt(anova.lsd5)}`,
      ];
      slide.addText(statsItems.join('   |   '), {
        x: 0.25, y: statsY, w: SLIDE_W - 0.5, h: 0.3,
        fontSize: 9, color: GRAY, align: 'center',
      });
    } else {
      slide.addText('Insufficient data for ANOVA.', {
        x: 0.5, y: 2.5, w: SLIDE_W - 1, h: 0.4, fontSize: 12, color: GRAY, align: 'center',
      });
    }
  }

  // ─── SLIDE 5: Treatment Ranking ──────────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, 'Treatment Ranking', `Ranked by ${paramLabel}`);

    const controlNames = treatmentNames.filter(t => {
      const n = t.toLowerCase();
      return n.includes('control') || n.includes('untreated') || n.includes('check');
    });
    const ranked = [...treatmentNames]
      .sort((a, b) => (paramMeansObj[b]?.mean ?? -Infinity) - (paramMeansObj[a]?.mean ?? -Infinity))
      .filter(t => !controlNames.includes(t));
    const allRanked = [...ranked, ...controlNames];

    const rowH = 0.38;
    const maxRows = Math.min(allRanked.length, 9);
    const colWR = [0.4, 3.2, 1.3, 1.2, 1.0, 1.6];
    const headers = ['#', 'Treatment', 'Mean', 'SE', 'CLD', 'Tier'];

    headers.forEach((h, ci) => {
      let x = 0.2; for (let i = 0; i < ci; i++) x += colWR[i];
      slide.addShape(prs.ShapeType.rect, { x, y: 0.95, w: colWR[ci], h: 0.32, fill: { color: '2C3E50' } });
      slide.addText(h, { x, y: 0.95, w: colWR[ci], h: 0.32, fontSize: 8, bold: true, color: WHITE, align: 'center' });
    });

    allRanked.slice(0, maxRows).forEach((trt, idx) => {
      const m = paramMeansObj[trt] || {};
      const isCtrl = controlNames.includes(trt);
      const tier = getTier(m.mean ?? 0, isCtrl);
      const rank = isCtrl ? 'UTC' : String(idx + 1);
      const y = 1.27 + idx * rowH;
      const rowBg = idx % 2 === 0 ? 'F0F9F7' : WHITE;

      const rowVals = [rank, trt, fmt(m.mean), fmt(m.se), m.cldLetter || '—', tier.label];
      rowVals.forEach((val, ci) => {
        let x = 0.2; for (let i = 0; i < ci; i++) x += colWR[i];
        const bg = ci === 5 ? tier.hex : rowBg;
        slide.addShape(prs.ShapeType.rect, { x, y, w: colWR[ci], h: rowH - 0.03, fill: { color: bg } });
        slide.addText(String(val), {
          x, y, w: colWR[ci], h: rowH - 0.03,
          fontSize: ci === 1 ? 8 : 9,
          bold: ci === 5,
          color: DARK, align: 'center',
          wrap: true,
        });
      });
    });
  }

  // ─── SLIDE 6: Conclusions ────────────────────────────────────────────────────
  {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, 'Conclusions & Recommendations', meta.projectName || '');

    const pVal0 = anova ? (anova.p?.[0] ?? null) : null;
    const isSig = pVal0 !== null && pVal0 <= 0.05;

    // Top 3 treatments by mean
    const top3 = [...treatmentNames]
      .filter(t => !t.toLowerCase().includes('control') && !t.toLowerCase().includes('untreated'))
      .sort((a, b) => (paramMeansObj[b]?.mean ?? 0) - (paramMeansObj[a]?.mean ?? 0))
      .slice(0, 3);

    const bullets = [];

    if (isSig) {
      const topStr = top3.length > 0 ? top3.join(', ') : 'top-ranked treatments';
      bullets.push(`✓ Treatments differed significantly (F = ${fmt(anova?.f?.[0], 3)}, p = ${fmt(pVal0, 4)}) — ${topStr} showed highest performance.`);
    } else {
      bullets.push(`— No statistically significant differences detected (p = ${pVal0 !== null ? fmt(pVal0, 4) : '?'}, NS). Further replication is recommended.`);
    }

    if (anova?.cv != null) {
      const cvQuality = anova.cv < 10 ? 'excellent' : anova.cv <= 20 ? 'good' : 'fair/poor';
      bullets.push(`📊 Experimental precision was ${cvQuality} (CV = ${fmt(anova.cv, 1)}%).`);
    }

    if (top3.length > 0) {
      const topMeans = top3.map(t => `${t}: ${fmt(paramMeansObj[t]?.mean)}`).join(' | ');
      bullets.push(`🏆 Top performers: ${topMeans}`);
    }

    bullets.push(`📅 Report generated: ${meta.reportDate || new Date().toISOString().slice(0, 10)}`);

    bullets.forEach((text, i) => {
      slide.addText(text, {
        x: 0.5, y: 1.1 + i * 0.85, w: SLIDE_W - 1, h: 0.7,
        fontSize: 13, color: DARK, align: 'left', wrap: true,
      });
    });
  }

  // ─── SLIDE 7 (Optional): Photos 2×3 grid ────────────────────────────────────
  const photos = Array.isArray(reportData.photos) ? reportData.photos : [];
  if (options.includePhotos !== false && photos.length > 0) {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, 'Trial Photos', `${Math.min(photos.length, 6)} of ${photos.length} photos`);

    const maxPhotos = 6;
    const cols = 3, rows = 2;
    const imgW = 2.9, imgH = 1.85;
    const startX = 0.25, startY = 1.0;
    const gutterX = 0.15, gutterY = 0.15;

    const selectedPhotos = photos.slice(0, maxPhotos);
    for (let i = 0; i < selectedPhotos.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (imgW + gutterX);
      const y = startY + row * (imgH + gutterY);
      const entry = selectedPhotos[i];

      try {
        const imgData = await toBase64(entry.url, 600);
        if (imgData) {
          slide.addImage({ data: imgData, x, y, w: imgW, h: imgH });
        } else {
          slide.addShape(prs.ShapeType.rect, { x, y, w: imgW, h: imgH, fill: { color: 'EEEEEE' }, line: { color: 'CCCCCC' } });
          slide.addText('Image unavailable', { x, y: y + imgH / 2 - 0.15, w: imgW, h: 0.3, fontSize: 8, color: GRAY, align: 'center' });
        }
      } catch { /* skip */ }

      // Label below photo
      const label = [entry.treatment || '', entry.daa != null ? `${entry.daa} DAA` : ''].filter(Boolean).join(' | ');
      if (label) {
        slide.addText(label, { x, y: y + imgH + 0.02, w: imgW, h: 0.18, fontSize: 7, color: GRAY, align: 'center' });
      }
    }
  }

  // ─── Download ────────────────────────────────────────────────────────────────
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${safeName(meta.projectName)}_${safeName(category)}_Trial_Summary_${dateStr}.pptx`;
  prs.writeFile({ fileName: filename });
}
