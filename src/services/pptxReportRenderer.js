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

// ─── Multi-slide photo renderer ───────────────────────────────────────────────

/**
 * Renders photos in batches of 6 onto separate slides (2 rows × 3 cols grid).
 * Each photo's resolvedSrc is awaited sequentially to avoid memory spikes.
 * Each slide is subtitled "Trial Photos (N of M)" where N = batch end, M = total.
 *
 * @param {object} prs          — pptxgenjs presentation instance
 * @param {object} reportData   — ReportData object (reportData.photos used)
 * @param {object} ctx          — slide-rendering context helpers & constants
 */
async function renderPhotoSlides(prs, reportData, ctx) {
  const { addHeaderBand, LIGHT_BG, GRAY, SLIDE_W, SLIDE_H } = ctx;
  const photos = reportData.photos || [];
  if (photos.length === 0) return;

  const BATCH_SIZE = 6;
  const COLS = 3;
  const IMG_W = 2.9;
  const IMG_H = 1.85;
  const START_X = 0.25;
  const START_Y = 1.0;
  const GUTTER_X = 0.15;
  const GUTTER_Y = 0.15;

  const totalSlides = Math.ceil(photos.length / BATCH_SIZE);

  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);
    const slideIndex = Math.floor(i / BATCH_SIZE) + 1; // 1-based
    // e.g. "Trial Photos (1 of 3)", "Trial Photos (2 of 3)"
    const subtitle = `Trial Photos (${slideIndex} of ${totalSlides})`;

    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
      fill: { color: LIGHT_BG },
    });
    addHeaderBand(slide, 'Trial Photos', subtitle);

    // Process photos in the batch sequentially (one await at a time)
    for (let j = 0; j < batch.length; j++) {
      const col = j % COLS;
      const row = Math.floor(j / COLS);
      const x = START_X + col * (IMG_W + GUTTER_X);
      const y = START_Y + row * (IMG_H + GUTTER_Y);
      const photo = batch[j];

      // Resolve image data — use resolvedSrc first, fall back to url
      const src = photo.resolvedSrc || photo.url || null;
      let imgData = null;
      try {
        imgData = await toBase64(src, 600); // sequential: one at a time
      } catch (_e) {
        imgData = null;
      }

      if (imgData) {
        slide.addImage({ data: imgData, x, y, w: IMG_W, h: IMG_H });
      } else {
        // Grey placeholder with "Image unavailable" label
        slide.addShape(prs.ShapeType.rect, {
          x, y, w: IMG_W, h: IMG_H,
          fill: { color: 'EEEEEE' },
          line: { color: 'CCCCCC', width: 1 },
        });
        slide.addText('Image unavailable', {
          x, y: y + IMG_H / 2 - 0.15,
          w: IMG_W, h: 0.3,
          fontSize: 8, color: GRAY, align: 'center',
        });
      }

      // Photo caption below image (treatment | DAA)
      const label = [
        photo.treatment || '',
        photo.daa != null ? `${photo.daa} DAA` : '',
      ].filter(Boolean).join(' | ');
      if (label) {
        slide.addText(label, {
          x, y: y + IMG_H + 0.02,
          w: IMG_W, h: 0.18,
          fontSize: 7, color: GRAY, align: 'center',
        });
      }
    }
  }
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
 *  5. Statistical Residual Diagnostics (conditional — only when residualDiagnostics.n >= 4)
 *  6. Treatment Ranking
 *  7. Conclusions
 *  8+. Trial Photos — multi-slide 2×3 grid, 6 per slide (optional)
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

  // ─── SLIDE 5: Statistical Residual Diagnostics (conditional) ───────────────
  const residDiag = reportData.residualDiagnostics || null;
  if (residDiag && typeof residDiag.n === 'number' && residDiag.n >= 4) {
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, 'Statistical Residual Diagnostics', `n = ${residDiag.n} observations`);

    // ── 1×3 panel grid ────────────────────────────────────────────────────────
    const panelW  = 3.0;
    const panelH  = 2.6;
    const startX  = 0.25;
    const panelY  = 0.95;
    const gutterX = 0.25;

    const panels = [
      {
        title: 'Histogram of Residuals',
        icon: '📊',
        lines: (() => {
          const res = Array.isArray(residDiag.residuals) ? residDiag.residuals : [];
          if (res.length === 0) return ['No residual data'];
          const mn = Math.min(...res);
          const mx = Math.max(...res);
          const mean = res.reduce((s, v) => s + v, 0) / res.length;
          const sd = Math.sqrt(res.reduce((s, v) => s + (v - mean) ** 2, 0) / res.length);
          return [
            `n = ${res.length}`,
            `Min: ${fmt(mn, 3)}`,
            `Max: ${fmt(mx, 3)}`,
            `Mean: ${fmt(mean, 4)}`,
            `SD: ${fmt(sd, 4)}`,
          ];
        })(),
      },
      {
        title: 'Q-Q Plot',
        icon: '📈',
        lines: (() => {
          const normLabel = residDiag.normality === 'pass' ? '✓ PASS' : '✗ FAIL';
          const normColor = residDiag.normality === 'pass' ? '1E8C3A' : 'C0392B';
          return [
            `Shapiro-Wilk W: ${fmt(residDiag.shapiroW, 4)}`,
            `p-value: ${fmt(residDiag.shapiroP, 4)}`,
            { text: `Normality: ${normLabel}`, color: normColor },
            '',
            residDiag.normality === 'fail'
              ? 'Consider Kruskal-Wallis'
              : 'Normal distribution assumed',
          ];
        })(),
      },
      {
        title: 'Fitted vs. Residuals',
        icon: '🔬',
        lines: (() => {
          const homoLabel = residDiag.homogeneity === 'pass' ? '✓ PASS' : '✗ FAIL';
          const homoColor = residDiag.homogeneity === 'pass' ? '1E8C3A' : 'C0392B';
          return [
            `Levene F: ${fmt(residDiag.leveneF, 4)}`,
            `p-value: ${fmt(residDiag.leveneP, 4)}`,
            { text: `Homogeneity: ${homoLabel}`, color: homoColor },
            '',
            residDiag.homogeneity === 'fail'
              ? 'Variance unequal across groups'
              : 'Variances approximately equal',
          ];
        })(),
      },
    ];

    panels.forEach((panel, pi) => {
      const x = startX + pi * (panelW + gutterX);

      // Panel background card
      slide.addShape(prs.ShapeType.rect, {
        x, y: panelY, w: panelW, h: panelH,
        fill: { color: WHITE },
        line: { color: ACCENT, width: 1.5 },
      });

      // Panel title bar
      slide.addShape(prs.ShapeType.rect, {
        x, y: panelY, w: panelW, h: 0.38,
        fill: { color: ACCENT },
      });
      slide.addText(`${panel.icon} ${panel.title}`, {
        x: x + 0.1, y: panelY + 0.04, w: panelW - 0.2, h: 0.3,
        fontSize: 9, bold: true, color: WHITE, align: 'center',
      });

      // Panel content lines
      let lineY = panelY + 0.46;
      const lineH = 0.32;
      panel.lines.forEach((line) => {
        if (line === '') { lineY += lineH * 0.4; return; }
        const isObj = typeof line === 'object' && line !== null;
        const text  = isObj ? line.text : line;
        const color = isObj ? line.color : DARK;
        slide.addText(String(text), {
          x: x + 0.12, y: lineY, w: panelW - 0.24, h: lineH,
          fontSize: 9, color, align: 'left', wrap: true,
          bold: isObj,
        });
        lineY += lineH;
      });
    });

    // ── Recommendation strip below panels ─────────────────────────────────────
    if (residDiag.recommendation) {
      const recY = panelY + panelH + 0.14;
      slide.addShape(prs.ShapeType.rect, {
        x: startX, y: recY, w: SLIDE_W - startX * 2, h: 0.38,
        fill: { color: 'FFF8E1' },
        line: { color: 'F59E0B', width: 1 },
      });
      slide.addText(`⚠ Recommendation: ${residDiag.recommendation}`, {
        x: startX + 0.1, y: recY + 0.05, w: SLIDE_W - startX * 2 - 0.2, h: 0.28,
        fontSize: 9, color: '92400E', align: 'left', wrap: true,
      });
    }

    // ── Overall assumption summary (bottom-right) ──────────────────────────────
    const overallPass = residDiag.normality === 'pass' && residDiag.homogeneity === 'pass';
    const overallY    = panelY + panelH + (residDiag.recommendation ? 0.6 : 0.14);
    const summaryText = overallPass
      ? '✓ ANOVA assumptions satisfied — parametric results are valid.'
      : '⚠ One or more assumptions failed — interpret ANOVA results with caution.';
    const summaryColor = overallPass ? '1E8C3A' : 'C0392B';
    slide.addText(summaryText, {
      x: startX, y: overallY, w: SLIDE_W - startX * 2, h: 0.3,
      fontSize: 9, bold: true, color: summaryColor, align: 'center',
    });
  }

  // ─── SLIDE 6 (was 5): Treatment Ranking ──────────────────────────────────────
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

  // ─── SLIDE 7 (was 6): Conclusions ────────────────────────────────────────────
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

  // ─── SLIDES: Photos — multi-slide 2×3 grid (batch of 6 per slide) ───────────
  const photos = Array.isArray(reportData.photos) ? reportData.photos : [];
  if (options.includePhotos !== false && photos.length > 0) {
    await renderPhotoSlides(prs, reportData, { addHeaderBand, LIGHT_BG, GRAY, SLIDE_W, SLIDE_H });
  }

  // ─── SLIDE: Audit Trail ──────────────────────────────────────────────────────
  {
    const auditTrail = reportData.auditTrail || {};
    const slide = prs.addSlide();
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: { color: LIGHT_BG } });
    addHeaderBand(slide, 'Report Audit Trail', 'Traceability record for this generated report');

    // Build rows: field name / value pairs
    const auditRows = [
      ['Report UUID',            auditTrail.reportUUID            || '—'],
      ['Generated On',           auditTrail.generatedOn           || '—'],
      ['Generated By (Name)',    auditTrail.generatedBy?.name     || '—'],
      ['Generated By (Email)',   auditTrail.generatedBy?.email    || '—'],
      ['App Version',            auditTrail.appVersion            || '—'],
      ['Stats Engine Version',   auditTrail.statsEngineVersion    || '—'],
      ['Report Template',        auditTrail.reportTemplate        || '—'],
      ['Project Name',           auditTrail.projectName           || '—'],
      ['Project ID',             auditTrail.projectId             || '—'],
    ];

    const colWA  = [3.8, 5.8]; // Field | Value
    const startX = 0.5;
    const rowH   = 0.38;
    const headerY = 1.0;

    // Header row
    const colHeaders = ['Field', 'Value'];
    colHeaders.forEach((h, ci) => {
      const x = startX + (ci === 0 ? 0 : colWA[0]);
      slide.addShape(prs.ShapeType.rect, {
        x, y: headerY, w: colWA[ci], h: 0.34,
        fill: { color: ACCENT },
      });
      slide.addText(h, {
        x, y: headerY, w: colWA[ci], h: 0.34,
        fontSize: 9, bold: true, color: WHITE, align: 'center',
      });
    });

    // Data rows — alternating fill
    auditRows.forEach(([field, value], ri) => {
      const y = headerY + 0.34 + ri * rowH;
      const rowBg = ri % 2 === 0 ? 'F0F9F7' : WHITE;

      [field, value].forEach((cell, ci) => {
        const x = startX + (ci === 0 ? 0 : colWA[0]);
        slide.addShape(prs.ShapeType.rect, {
          x, y, w: colWA[ci], h: rowH - 0.02,
          fill: { color: rowBg },
          line: { color: 'E2E8F0', width: 0.5 },
        });
        slide.addText(String(cell), {
          x: x + 0.1, y, w: colWA[ci] - 0.2, h: rowH - 0.02,
          fontSize: 8, color: DARK, align: ci === 0 ? 'left' : 'left',
          bold: ci === 0,
          wrap: true,
        });
      });
    });
  }

  // ─── Download ────────────────────────────────────────────────────────────────
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${safeName(meta.projectName)}_${safeName(category)}_Trial_Summary_${dateStr}.pptx`;
  prs.writeFile({ fileName: filename });
}
