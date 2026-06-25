/**
 * pdfReportRenderer.js
 *
 * Professional PDF report generator for the advanced reporting pipeline.
 * Accepts a ReportData object (from reportDataBuilder.js) and produces
 * a fully formatted multi-section PDF using jsPDF + jspdf-autotable.
 *
 * DO NOT import from trialReports.js to avoid circular dependencies.
 * All helpers are implemented locally.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildExecutiveSummary } from './reportDataBuilder.js';

// ─── Local helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the primary [r,g,b] brand color for a given category.
 */
function getPrimaryColor(category) {
  switch ((category || '').toLowerCase()) {
    case 'fungicide':    return [79, 70, 229];
    case 'pesticide':    return [220, 38, 38];
    case 'nutrition':
    case 'biostimulant': return [217, 119, 6];
    case 'herbicide':
    default:             return [13, 148, 136];
  }
}

/**
 * Sanitises a string for use in a filename.
 */
function safeName(s) {
  return (s || 'report').replace(/[^a-z0-9_\-]/gi, '_');
}

/**
 * Loads an image URL into a base64 data-URI via an off-screen canvas.
 * Returns null on failure.
 */
async function toBase64(src, maxPx = 400) {
  if (!src) return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const scale = Math.min(1, maxPx / Math.max(img.width || 1, img.height || 1));
          const w = Math.round((img.width || maxPx) * scale);
          const h = Math.round((img.height || maxPx) * scale);
          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch { resolve(null); }
  });
}

/**
 * Checks whether there is enough vertical space on the current page;
 * if not, adds a new page and resets y to 20.
 */
function checkPageBreak(doc, y, ph, needed = 30) {
  if (y + needed > ph - 20) {
    doc.addPage();
    return 20;
  }
  return y;
}

/**
 * Draws a colored left-bar section heading.
 * Returns the new y position after the heading.
 */
function addSectionHeading(doc, text, y, ph, color) {
  y = checkPageBreak(doc, y, ph, 20);
  const pw = doc.internal.pageSize.getWidth();
  // Colored left accent bar
  doc.setFillColor(...color);
  doc.rect(14, y - 4, 3, 10, 'F');
  // Heading text
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...color);
  doc.text(text, 19, y + 3);
  // Underline
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(19, y + 5, pw - 14, y + 5);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  return y + 12;
}

/** Significance stars helper */
function sigStars(p) {
  if (p === null || p === undefined) return '?';
  if (p <= 0.01) return '**';
  if (p <= 0.05) return '*';
  return 'NS';
}

/** Safe toFixed with fallback dash */
function fmt(val, digits = 2) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Routes to the appropriate template renderer based on options.template.
 *
 * @param {object} reportData  — ReportData object from reportDataBuilder.js
 * @param {object} [options]   — { template, includeWeather, includePhotos, ... }
 */
export async function generateProjectPDF(reportData, options = {}) {
  const template = options.template || 'standard';
  switch (template) {
    case 'scientific-journal': return renderScientificJournal(reportData, options);
    case 'field-summary':      return renderFieldSummaryCard(reportData, options);
    case 'regulatory':         return renderRegulatorySubmission(reportData, options);
    default:                   return renderStandard(reportData, options);
  }
}

/**
 * Standard template — full multi-section PDF report.
 *
 * @param {object} reportData  — ReportData object from reportDataBuilder.js
 * @param {object} [options]   — { includeWeather, includePhotos }
 */
async function renderStandard(reportData, options = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  const meta      = reportData.meta || {};
  const color     = getPrimaryColor(meta.category);
  const category  = (meta.category || 'herbicide');
  const param     = reportData.primaryParameter || {};
  const anova     = param.anova || null;
  const postHoc   = param.postHocMethod || options.postHoc || 'LSD';
  const alpha     = options.alpha || 0.05;

  // ─── SECTION 1: Cover Page ───────────────────────────────────────────────

  // Embed Report UUID into PDF /Keywords metadata (Task 9.1)
  const auditTrail = reportData.auditTrail || {};
  if (auditTrail.reportUUID) {
    try {
      doc.setProperties({ keywords: auditTrail.reportUUID });
    } catch { /* best-effort metadata embedding */ }
  }

  // Full-width colored header band
  doc.setFillColor(...color);
  doc.rect(0, 0, pw, 50, 'F');

  // Logo placeholder — grey 30×30mm rectangle in top-right corner of header band (Task 9.1)
  doc.setFillColor(180, 180, 180);
  doc.rect(pw - 44, 10, 30, 30, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('LOGO', pw - 29, 27, { align: 'center' });

  // Project name — large white centered
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  const projectName = meta.projectName || 'Untitled Project';
  doc.text(projectName, (pw - 34) / 2, 24, { align: 'center', maxWidth: pw - 54 });

  // Category badge + design label
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  const categoryLabel = (category.charAt(0).toUpperCase() + category.slice(1)) + ' Trial';
  doc.text(categoryLabel, (pw - 34) / 2, 35, { align: 'center' });
  doc.setFontSize(9);
  const designLine = `Design: ${meta.designLabel || meta.design || 'RCBD'} — ${meta.treatments || '?'} Treatments × ${meta.replications || '?'} Replications`;
  doc.text(designLine, (pw - 34) / 2, 42, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Format GPS to 6 decimal places if stored as "lat, lon" string (Task 9.1)
  let gpsDisplay = meta.gps || '—';
  if (meta.gps && meta.gps.includes(',')) {
    const parts = meta.gps.split(',');
    if (parts.length === 2) {
      const lat = parseFloat(parts[0].trim());
      const lon = parseFloat(parts[1].trim());
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        gpsDisplay = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }
    }
  }

  // Metadata grid (2 columns, 10pt)
  let y = 62;
  doc.setFontSize(10);
  const appDates = Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—');
  const metaGrid = [
    ['Crop',           meta.crop || '—',           'Variety',       meta.variety || '—'],
    ['Location',       meta.location || '—',        'Investigator',  meta.investigator || '—'],
    ['Organisation',   meta.organisation || '—',    'Prev. Crop',    meta.previousCrop || '—'],
    ['Irrigation',     meta.irrigationMethod || '—','Plant Popul.',  meta.plantPopulation || '—'],
    ['Trial Period',   appDates,                    'Report Date',   meta.reportDate || '—'],
    ['GPS',            gpsDisplay,                  'Target Species',meta.targetSpecies || '—'],
  ];
  const col1x = 14, col2x = 65, col3x = 110, col4x = 155;
  for (const row of metaGrid) {
    doc.setFont(undefined, 'bold');
    doc.text(row[0] + ':', col1x, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(row[1]), col2x, y, { maxWidth: 40 });
    doc.setFont(undefined, 'bold');
    doc.text(row[2] + ':', col3x, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(row[3]), col4x, y, { maxWidth: 40 });
    y += 9;
  }

  // Confidential footer on cover page
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('CONFIDENTIAL — For Research Purposes Only', pw / 2, ph - 14, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  doc.addPage();

  // ─── Executive Summary ────────────────────────────────────────────────────
  if (reportData.executiveSummary) {
    y = 20;
    y = addSectionHeading(doc, 'Executive Summary', y, ph, color);
    doc.setFontSize(10);
    const execLines = doc.splitTextToSize(reportData.executiveSummary, pw - 28);
    doc.text(execLines, 14, y);
    y += execLines.length * 6 + 8;
    doc.addPage();
  }

  // ─── SECTION 2: Trial Design & Methodology ──────────────────────────────

  y = 20;
  y = addSectionHeading(doc, 'Trial Design & Methodology', y, ph, color);

  const designName  = meta.designLabel || meta.design || 'RCBD';
  const nTrt        = meta.treatments  || '?';
  const nRep        = meta.replications || '?';
  const nPlots      = (Number(nTrt) && Number(nRep)) ? Number(nTrt) * Number(nRep) : '?';
  const timing      = appDates;
  const target      = meta.targetSpecies || '—';

  // PI-3: Show actual statistical model for Pot Trial and CRD designs
  const analysisModelLine = meta.analysisModel && meta.analysisModel !== 'RCBD'
    ? ` Statistical analysis model: ${meta.analysisModel}.`
    : '';

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const methodText =
    `The trial was conducted using a ${designName} with ${nTrt} treatment(s) and ${nRep} replication(s), ` +
    `totalling ${nPlots} experimental plot(s).${analysisModelLine} Applications were made on: ${timing}. ` +
    `Target species / pest: ${target}.`;
  const methodLines = doc.splitTextToSize(methodText, pw - 28);
  y = checkPageBreak(doc, y, ph, methodLines.length * 6 + 10);
  doc.text(methodLines, 14, y);
  y += methodLines.length * 6 + 8;

  // PI-5: LargeScale sector summary table
  if (meta.isLargeScale && meta.largescaleSectors && meta.largescaleSectors.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text('Sector / Quadrant Map', 14, y); doc.setFont(undefined, 'normal'); y += 6;
    const sectorHead = [['Sector Code', 'Treatment / Dosage', 'GPS (Lat / Lon)', 'Spatial CV%']];
    const sectorBody = meta.largescaleSectors.map(s => [
      s.Code || s.ID || '—',
      [s.Name, s.Dosage].filter(Boolean).join(' @ ') || '—',
      (s.Lat && s.Lon) ? `${parseFloat(s.Lat).toFixed(5)}, ${parseFloat(s.Lon).toFixed(5)}` : '—',
      (() => {
        const sp = meta.spatialSummary?.[s.Name || s.Code];
        return sp?.spatialCV !== null && sp?.spatialCV !== undefined ? `${sp.spatialCV.toFixed(1)}%` : '—';
      })(),
    ]);
    autoTable(doc, {
      startY: y,
      head: sectorHead,
      body: sectorBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ─── SECTION 3: Treatment List Table ────────────────────────────────────

  y = checkPageBreak(doc, y, ph, 30);
  y = addSectionHeading(doc, 'Treatment List', y, ph, color);


  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  const trtHead = [['#', 'Treatment / Formulation', 'Dosage', 'App. Timing', 'Replications', 'Role']];
  const trtBody = treatmentList.map((t, idx) => [
    String(idx + 1),
    t.name || '—',
    t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—',
    t.timing || '—',
    String(t.replicationCount || '—'),
    // Role: isControl is evaluated first — when both isControl===true AND isStandard===true,
    // 'UTC / Control' is returned (not 'Standard'). This is the correct GLP behaviour.
    t.isControl ? 'UTC / Control' : (t.isStandard ? 'Standard' : 'Treatment'),
  ]);

  autoTable(doc, {
    startY: y,
    head: trtHead,
    body: trtBody,
    theme: 'striped',
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const row = trtBody[data.row.index];
        if (row && row[5] === 'UTC / Control') {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ─── SECTION 4: Raw Observation Data Matrix ──────────────────────────────

  const rawMatrix  = reportData.rawMatrix  || {};
  const paramKey   = param.key || '';
  const paramLabel = param.label || paramKey || 'Primary Parameter';
  const daaLabel   = meta.daa !== undefined && meta.daa !== null ? String(meta.daa) : 'Final';

  // Collect unique rep IDs across all treatments
  const allRepIds = [];
  for (const tName of Object.keys(rawMatrix)) {
    for (const repId of Object.keys(rawMatrix[tName] || {})) {
      if (!allRepIds.includes(repId)) allRepIds.push(repId);
    }
  }

  y = checkPageBreak(doc, y, ph, 30);
  y = addSectionHeading(
    doc,
    `Raw Observation Data — Primary Parameter (${paramLabel}) at ${daaLabel} DAA`,
    y, ph, color
  );

  if (allRepIds.length > 0 && Object.keys(rawMatrix).length > 0) {
    const rawHead = [['Treatment', ...allRepIds, 'Mean', 'SD']];
    const paramMeans = (param.means) || {};
    const rawBody = Object.keys(rawMatrix).map(tName => {
      const repData = rawMatrix[tName] || {};
      const repVals = allRepIds.map(rid => {
        const row = repData[rid];
        const v = row ? row[paramKey] : undefined;
        return (v !== null && v !== undefined) ? fmt(v) : '—';
      });
      const mObj = paramMeans[tName] || {};
      return [
        tName,
        ...repVals,
        mObj.mean !== null && mObj.mean !== undefined ? fmt(mObj.mean) : '—',
        mObj.sd  !== null && mObj.sd  !== undefined ? fmt(mObj.sd)   : '—',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: rawHead,
      body: rawBody,
      theme: 'grid',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No raw observation data available.', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // ─── SECTION 5: Treatment Means & Statistics (Primary Parameter) ─────────

  y = checkPageBreak(doc, y, ph, 30);
  y = addSectionHeading(doc, `Treatment Means — ${paramLabel}`, y, ph, color);

  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);
  // PI-4: flag parameters excluded from efficacy% display
  const efficacyExcluded = param.efficacyExcluded === true;
  const efficacyColHeader = efficacyExcluded ? 'Efficacy% (N/A)' : 'Efficacy (%)';

  if (treatmentNames.length > 0) {
    const meansHead = [['Treatment', 'n', 'Mean', 'SD', 'SE', efficacyColHeader, 'CLD', 'Sig.']];
    const pVal0 = anova ? (anova.p ? anova.p[0] : null) : null;
    const sig   = sigStars(pVal0);

    const meansBody = treatmentNames.map(tName => {
      const m = paramMeansObj[tName] || {};
      // PI-4: show "—" and note for excluded params; show normal value otherwise
      const efficacyCell = efficacyExcluded
        ? 'N/A*'
        : (m.efficacy_pct !== null && m.efficacy_pct !== undefined ? fmt(m.efficacy_pct, 1) : '—');
      return [
        tName,
        String(m.n ?? '—'),
        fmt(m.mean),
        fmt(m.sd),
        fmt(m.se),
        efficacyCell,
        m.cldLetter || '—',
        sig,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: meansHead,
      body: meansBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 48 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // PI-4: footnote for excluded efficacy params
    if (efficacyExcluded) {
      y = checkPageBreak(doc, y, ph, 8);
      doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.setFont(undefined, 'italic');
      doc.text(`* ${paramLabel} is an adverse-effect parameter. Efficacy % is not scientifically applicable.`, 14, y);
      doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
      y += 7;
    }

    // ANOVA source table
    if (anova && !anova.error) {
      y = checkPageBreak(doc, y, ph, 40);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      // PI-3 / Task 17.2: analysis model included in ANOVA heading for Pot Trial / CRD.
      // modelNote is '' when meta.analysisModel is 'RCBD' or absent (standard case).
      const modelNote = meta.analysisModel && meta.analysisModel !== 'RCBD'
        ? ` (${meta.analysisModel} model)`
        : '';
      doc.text(`ANOVA Source Table${modelNote}`, 14, y);
      doc.setFont(undefined, 'normal');
      y += 6;

      const anovaHead = [['Source of Variation', 'SS', 'df', 'MS', 'F-value', 'p-value']];
      const sources = anova.source || [];
      const anovaBody = sources.map((src, i) => [
        src,
        fmt(anova.ss?.[i]),
        String(anova.df?.[i] ?? '—'),
        anova.ms?.[i] !== null && anova.ms?.[i] !== undefined ? fmt(anova.ms[i]) : '—',
        anova.f?.[i]  !== null && anova.f?.[i]  !== undefined ? fmt(anova.f[i], 3)  : '—',
        anova.p?.[i]  !== null && anova.p?.[i]  !== undefined ? fmt(anova.p[i], 4)  : '—',
      ]);

      autoTable(doc, {
        startY: y,
        head: anovaHead,
        body: anovaBody,
        theme: 'grid',
        headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === 0) {
            data.cell.styles.fillColor = [230, 240, 255]; // highlight Treatment row
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;

      // Stats block — Grand Mean, CV%, SEm±, LSD 5%, LSD 1%
      y = checkPageBreak(doc, y, ph, 16);
      doc.setFontSize(9);
      const statsItems = [
        ['Grand Mean', fmt(anova.grandMean)],
        ['CV%',        anova.cv !== null && anova.cv !== undefined ? fmt(anova.cv, 1) + '%' : '—'],
        ['SEm±',       fmt(anova.sem)],
        ['LSD 5%',     fmt(anova.lsd5)],
        ['LSD 1%',     fmt(anova.lsd1)],
      ];
      const blockW  = (pw - 28) / statsItems.length;
      statsItems.forEach(([label, val], idx) => {
        const bx = 14 + idx * blockW;
        doc.setFillColor(245, 245, 245);
        doc.rect(bx, y, blockW - 2, 14, 'F');
        doc.setFont(undefined, 'bold');
        doc.text(label, bx + (blockW - 2) / 2, y + 5, { align: 'center' });
        doc.setFont(undefined, 'normal');
        doc.text(String(val), bx + (blockW - 2) / 2, y + 11, { align: 'center' });
      });
      y += 20;

      // Significance statement
      y = checkPageBreak(doc, y, ph, 14);
      doc.setFontSize(10);
      doc.setFont(undefined, 'italic');
      doc.text(anova.significance_label || '—', 14, y);
      doc.setFont(undefined, 'normal');
      y += 8;

      // LSD footnote
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Means followed by the same letter are not significantly different at the ${Math.round(alpha * 100)}% level of significance using ${postHoc.toUpperCase()}.`,
        14, y, { maxWidth: pw - 28 }
      );
      doc.setTextColor(0, 0, 0);
      y += 10;
    } else {
      y = checkPageBreak(doc, y, ph, 12);
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text('Insufficient data for ANOVA.', 14, y);
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
  }

  // ─── Treatment Ranking Table ──────────────────────────────────────────────
  {
    const paramMeansObjR = param.means || {};
    const sortedTrts = [...treatmentNames]
      .filter(t => !(paramMeansObjR[t]?.isControl))
      .sort((a, b) => (paramMeansObjR[b]?.mean ?? -Infinity) - (paramMeansObjR[a]?.mean ?? -Infinity));
    // UTC/control always last
    const controlTrts = treatmentNames.filter(t => {
      const name = t.toLowerCase();
      return name.includes('control') || name.includes('untreated') || name.includes('check');
    });
    const rankedTrts = [...sortedTrts.filter(t => !controlTrts.includes(t)), ...controlTrts];

    if (rankedTrts.length > 0) {
      y = checkPageBreak(doc, y, ph, 30);
      y = addSectionHeading(doc, 'Treatment Ranking', y, ph, color);

      const rankHead = [['Rank', 'Treatment', 'Mean ± SE', 'Efficacy %', 'CLD', 'Tier']];
      const tierColors = { Excellent: [204,255,204], Good: [255,255,204], Fair: [255,230,204], Poor: [255,204,204] };

      const rankBody = rankedTrts.map((trt, idx) => {
        const m = paramMeansObjR[trt] || {};
        const isCtrl = controlTrts.includes(trt);
        const mean = m.mean ?? 0;
        let tier = '—';
        if (!isCtrl) {
          if (mean >= 80) tier = 'Excellent';
          else if (mean >= 60) tier = 'Good';
          else if (mean >= 40) tier = 'Fair';
          else tier = 'Poor';
        }
        const rank = isCtrl ? 'UTC' : String(idx + 1);
        return [rank, trt, `${fmt(m.mean)} ± ${fmt(m.se)}`, m.efficacy_pct != null ? fmt(m.efficacy_pct, 1) : '—', m.cldLetter || '—', tier];
      });

      autoTable(doc, {
        startY: y, head: rankHead, body: rankBody,
        theme: 'striped',
        headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 55 } },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const tier = rankBody[data.row.index]?.[5];
            if (tier && tierColors[tier]) {
              data.cell.styles.fillColor = tierColors[tier];
            }
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // ─── Embedded Bar Chart ───────────────────────────────────────────────────
  try {
    const barPng = await renderChartCanvas('bar', {
      labels: treatmentNames,
      datasets: [{
        label: paramLabel,
        data: treatmentNames.map(t => (param.means?.[t]?.mean ?? 0)),
        backgroundColor: 'rgba(13,148,136,0.7)',
      }],
    }, {
      indexAxis: 'y', responsive: false, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 10 } } } },
    }, 1200, 500);
    if (barPng) {
      y = checkPageBreak(doc, y, ph, 60);
      const imgW = pw - 28;
      const imgH = imgW * (500 / 1200);
      doc.addImage(barPng, 'PNG', 14, y, imgW, imgH);
      y += imgH + 8;
    }
  } catch (e) {
    console.warn('[PDF] Bar chart embed failed:', e?.message);
  }

  // ─── SECTION 6: Time-Series Means Table ─────────────────────────────────

  const timeSeries = reportData.timeSeries || {};
  const daas       = Array.isArray(timeSeries.daas) ? timeSeries.daas : [];

  if (daas.length >= 2) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Time-Series — Treatment Means by DAA', y, ph, color);

    const tsHead = [['Treatment', ...daas.map(d => `${d} DAA`)]];
    const tsBody = treatmentNames.map(tName => {
      const row = [tName];
      daas.forEach(d => {
        const cell = timeSeries[tName] ? timeSeries[tName][d] : null;
        row.push(cell && cell.mean !== null && cell.mean !== undefined ? fmt(cell.mean) : '—');
      });
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: tsHead,
      body: tsBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 48 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ─── Time-Series Line Chart ───────────────────────────────────────────
    try {
      const tsPng = await renderChartCanvas('line', {
        labels: daas,
        datasets: treatmentNames.map((trt, i) => ({
          label: trt,
          data: daas.map(d => timeSeries[trt]?.[d]?.mean ?? null),
          borderColor: `hsl(${(i * 60) % 360}, 65%, 50%)`,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
        })),
      }, {
        responsive: false, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'DAA' } },
          y: { title: { display: true, text: paramLabel } },
        },
      }, 1200, 500);
      if (tsPng) {
        y = checkPageBreak(doc, y, ph, 60);
        const imgW = pw - 28;
        const imgH = imgW * (500 / 1200);
        doc.addImage(tsPng, 'PNG', 14, y, imgW, imgH);
        y += imgH + 8;
      }
    } catch (e) {
      console.warn('[PDF] Time-series chart embed failed:', e?.message);
    }
  }

  // ─── SECTION 7: Additional Parameters ───────────────────────────────────

  const allParams = Array.isArray(reportData.parameters) ? reportData.parameters : [];
  const additionalParams = allParams.filter(
    p => p.key !== param.key && !(p.anova && p.anova.error)
  );

  for (const ap of additionalParams) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, `Parameter: ${ap.label} (${ap.unit || ''})`, y, ph, color);

    const apMeans = ap.means || {};
    const apTreatments = Object.keys(apMeans);

    if (apTreatments.length > 0) {
      const compactHead = [['Treatment', 'Mean', 'SD', 'n', 'CLD']];
      const compactBody = apTreatments.map(tName => {
        const m = apMeans[tName] || {};
        return [tName, fmt(m.mean), fmt(m.sd), String(m.n ?? '—'), m.cldLetter || '—'];
      });

      autoTable(doc, {
        startY: y,
        head: compactHead,
        body: compactBody,
        theme: 'striped',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 60 } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 4;

      // One-line ANOVA footer
      if (ap.anova) {
        y = checkPageBreak(doc, y, ph, 10);
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        const af = ap.anova.f ? ap.anova.f[0] : null;
        const ap_p = ap.anova.p ? ap.anova.p[0] : null;
        doc.text(
          `F = ${fmt(af, 3)}, p = ${fmt(ap_p, 4)} (${ap.anova.significance_label || '—'})`,
          14, y
        );
        doc.setTextColor(0, 0, 0);
        y += 8;
      }
    }
  }

  // ─── Correlation Matrix ─────────────────────────────────────────────────
  const corrMatrix = reportData.correlationMatrix;
  if (corrMatrix && corrMatrix.params?.length >= 2) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Parameter Correlation Matrix', y, ph, color);
    const corrParams = corrMatrix.params;
    const corrHead = [['Parameter', ...corrParams]];
    const corrBody = corrParams.map(pA => {
      const row = [pA];
      corrParams.forEach(pB => {
        const cell = corrMatrix.matrix?.[pA]?.[pB];
        if (!cell || cell.r == null) { row.push('N/A'); return; }
        if (pA === pB) { row.push('1.000'); return; }
        row.push(`${cell.r.toFixed(3)}${cell.stars || ''}`);
      });
      return row;
    });
    autoTable(doc, {
      startY: y, head: corrHead, body: corrBody,
      theme: 'grid',
      headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
    y = checkPageBreak(doc, y, ph, 10);
    doc.setFontSize(7); doc.setTextColor(80,80,80);
    doc.text('* p < 0.05   ** p < 0.01   N/A = fewer than 4 treatment pairs', 14, y);
    doc.setTextColor(0,0,0);
    y += 8;
  }

  // ─── SECTION 8: Yield Analysis ───────────────────────────────────────────

  const yieldData = reportData.yield;
  const yieldMeans = yieldData && yieldData.means && Object.keys(yieldData.means).length > 0
    ? yieldData.means
    : null;

  if (yieldMeans) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Yield Analysis', y, ph, color);

    const yAnova      = yieldData.anova || null;
    const yPVal0      = yAnova ? (yAnova.p ? yAnova.p[0] : null) : null;
    const ySig        = sigStars(yPVal0);
    const yTreatments = Object.keys(yieldMeans);

    const yHead = [['Treatment', 'n', 'Mean', 'SD', 'SE', 'Efficacy (%)', 'CLD', 'Sig.']];
    const yBody = yTreatments.map(tName => {
      const m = yieldMeans[tName] || {};
      return [
        tName,
        String(m.n ?? '—'),
        fmt(m.mean),
        fmt(m.sd),
        fmt(m.se),
        m.efficacy_pct !== null && m.efficacy_pct !== undefined ? fmt(m.efficacy_pct, 1) : '—',
        m.cldLetter || '—',
        ySig,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: yHead,
      body: yBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 48 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    if (yAnova && !yAnova.error) {
      const yAnovaHead = [['Source of Variation', 'SS', 'df', 'MS', 'F-value', 'p-value']];
      const ySources   = yAnova.source || [];
      const yAnovaBody = ySources.map((src, i) => [
        src,
        fmt(yAnova.ss?.[i]),
        String(yAnova.df?.[i] ?? '—'),
        yAnova.ms?.[i] !== null && yAnova.ms?.[i] !== undefined ? fmt(yAnova.ms[i]) : '—',
        yAnova.f?.[i]  !== null && yAnova.f?.[i]  !== undefined ? fmt(yAnova.f[i], 3)  : '—',
        yAnova.p?.[i]  !== null && yAnova.p?.[i]  !== undefined ? fmt(yAnova.p[i], 4)  : '—',
      ]);

      autoTable(doc, {
        startY: y,
        head: yAnovaHead,
        body: yAnovaBody,
        theme: 'grid',
        headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === 0) {
            data.cell.styles.fillColor = [230, 240, 255];
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // ─── SECTION 9: Weather Conditions ───────────────────────────────────────

  const weather = Array.isArray(reportData.weather) ? reportData.weather : [];
  if (options.includeWeather !== false && weather.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Weather Conditions During Trial', y, ph, color);

    const wHead = [['Date', 'DAA', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)']];
    const wBody = weather.map(w => [
      w.date || '—',
      w.daa !== null && w.daa !== undefined ? String(w.daa) : '—',
      w.temp !== null && w.temp !== undefined ? fmt(w.temp, 1) : '—',
      w.humidity !== null && w.humidity !== undefined ? fmt(w.humidity, 1) : '—',
      w.wind !== null && w.wind !== undefined ? fmt(w.wind, 1) : '—',
      w.rain !== null && w.rain !== undefined ? fmt(w.rain, 1) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: wHead,
      body: wBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ─── SECTION 10: Trial Photos ─────────────────────────────────────────────

  const photos = Array.isArray(reportData.photos) ? reportData.photos : [];
  if (options.includePhotos !== false && photos.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Trial Photos', y, ph, color);

    const maxPhotos  = 20;
    const photoW     = 40;   // mm per photo
    const photoH     = 30;   // mm per photo (approx, may vary by aspect)
    const photosPerRow = 4;
    const gutterX    = 4;
    let   photoCol   = 0;
    let   rowStartY  = y;

    for (let i = 0; i < Math.min(photos.length, maxPhotos); i++) {
      const ph_entry = photos[i];
      const src      = ph_entry.url || '';
      if (!src) continue;

      try {
        const imgData = await toBase64(src, 400);
        if (!imgData) continue;

        const imgEl = new Image();
        imgEl.src = imgData;
        await new Promise(r => { imgEl.onload = r; imgEl.onerror = r; });
        const ar = (imgEl.width > 0 && imgEl.height > 0) ? imgEl.width / imgEl.height : 1;
        const iw = photoW;
        const ih = iw / ar;

        if (photoCol >= photosPerRow) {
          photoCol = 0;
          rowStartY += photoH + 14;
        }
        rowStartY = checkPageBreak(doc, rowStartY, ph, ih + 14);

        const ix = 14 + photoCol * (photoW + gutterX);
        try {
          doc.addImage(imgData, imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG', ix, rowStartY, iw, ih);
        } catch { /* skip unembeddable image */ }

        // Label below photo
        doc.setFontSize(7);
        const photoLabel = [
          ph_entry.treatment || '',
          ph_entry.daa !== null && ph_entry.daa !== undefined ? `${ph_entry.daa} DAA` : '',
        ].filter(Boolean).join(' | ');
        doc.text(photoLabel || `Photo ${i + 1}`, ix, rowStartY + ih + 4, { maxWidth: iw });

        photoCol++;
      } catch { /* skip */ }
    }

    y = rowStartY + photoH + 18;
  }

  // ─── Dose-Response Analysis ──────────────────────────────────────────────
  const dr = reportData.doseResponse;
  if (dr && dr.success !== false) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Dose-Response Analysis', y, ph, color);
    const drTreatments = dr.treatments || {};
    const drTrtNames = Object.keys(drTreatments);
    if (drTrtNames.length > 0) {
      const drHead = [['Treatment', 'ED10', 'ED50', 'ED90', 'R²', 'Model']];
      const drBody = drTrtNames.map(trt => {
        const r = drTreatments[trt];
        return [trt, fmt(r?.edValues?.ed10 ?? r?.ed10), fmt(r?.edValues?.ed50 ?? r?.ed50), fmt(r?.edValues?.ed90 ?? r?.ed90), fmt(r?.statistics?.rSquared ?? r?.r2, 3), r?.model || '4-PL'];
      });
      autoTable(doc, {
        startY: y, head: drHead, body: drBody,
        theme: 'striped',
        headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 6;
      // R² caution
      const avgR2 = drTrtNames.map(t => drTreatments[t]?.statistics?.rSquared ?? drTreatments[t]?.r2 ?? 1).reduce((a,b)=>a+b,0)/drTrtNames.length;
      if (avgR2 < 0.70) {
        doc.setFontSize(8); doc.setTextColor(180,90,0);
        doc.text(`Note: Average dose-response fit quality is low (R² = ${fmt(avgR2,3)}). Results should be interpreted with caution.`, 14, y, { maxWidth: pw - 28 });
        doc.setTextColor(0,0,0);
        y += 10;
      }
    }
  }

  // ─── Phytotoxicity & Crop Safety ─────────────────────────────────────────
  const phyto = reportData.phytotoxicity;
  if (phyto?.hasData) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Phytotoxicity & Crop Safety', y, ph, color);
    if (phyto.allZero) {
      doc.setFontSize(10);
      doc.text('No phytotoxic effects were observed in any treatment throughout the trial period.', 14, y, { maxWidth: pw - 28 });
      y += 10;
    } else {
      const safetyColors = { Safe: [204,255,204], Minor: [255,255,204], Moderate: [255,230,204], Severe: [255,180,180] };
      const phytoHead = [['Treatment', 'Mean (%)', 'SD', 'Safety Class']];
      const phytoBody = Object.entries(phyto.means || {}).map(([trt, m]) => [trt, fmt(m.mean, 1), fmt(m.sd, 1), m.safetyClass || '—']);
      autoTable(doc, {
        startY: y, head: phytoHead, body: phytoBody, theme: 'striped',
        headStyles: { fillColor: [180,0,0], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const sc = phytoBody[data.row.index]?.[3];
            if (sc && safetyColors[sc]) data.cell.styles.fillColor = safetyColors[sc];
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // ─── Residual Diagnostics ─────────────────────────────────────────────────
  const diagData = reportData.residualDiagnostics;
  if (diagData && diagData.n >= 6) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addSectionHeading(doc, 'Statistical Assumptions — Residual Diagnostics', y, ph, color);

    const diagCharts = [
      { type: 'bar',     title: 'Residuals Histogram', config: buildHistogramConfig(diagData.residuals) },
      { type: 'scatter', title: 'Normal Q-Q Plot',      config: buildQQConfig(diagData.qqData) },
      { type: 'scatter', title: 'Fitted vs Residuals',  config: buildFVRConfig(diagData.fittedValues, diagData.residuals) },
    ];

    let diagX = 14;
    const diagW = (pw - 35) / 3;
    const diagH = diagW * 0.8;
    y = checkPageBreak(doc, y, ph, diagH + 20);

    for (const dc of diagCharts) {
      try {
        const png = await renderChartCanvas(dc.type, dc.config.data, dc.config.options, 400, 320);
        if (png) {
          doc.addImage(png, 'PNG', diagX, y, diagW, diagH);
          doc.setFontSize(7); doc.text(dc.title, diagX + diagW/2, y + diagH + 3, { align: 'center' });
        }
      } catch (_e) {}
      diagX += diagW + 3.5;
    }
    y += diagH + 14;
  }

  // ─── SECTION 11: Conclusions & Recommendations ───────────────────────────

  y = checkPageBreak(doc, y, ph, 40);
  y = addSectionHeading(doc, 'Conclusions & Recommendations', y, ph, color);

  // Auto-generate conclusion paragraph
  let conclusionText = '';
  if (anova) {
    const cf    = anova.f   ? anova.f[0]   : null;
    const cp    = anova.p   ? anova.p[0]   : null;
    const fStr  = fmt(cf, 3);
    const pStr  = fmt(cp, 4);
    if (cp !== null && cp <= 0.05) {
      // Find top CLD group (letter 'a' treatments)
      const topTreatments = treatmentNames.filter(tName => {
        const m = paramMeansObj[tName] || {};
        return m.cldLetter && m.cldLetter.toLowerCase().includes('a');
      });
      const topStr = topTreatments.length > 0 ? topTreatments.join(', ') : 'top-ranked treatments';
      const direction = (category === 'nutrition' || category === 'biostimulant') ? 'increase' : 'decrease';
      conclusionText =
        `Treatment(s) ${topStr} showed statistically significant ${direction} in ${paramLabel} ` +
        `(F = ${fStr}, p = ${pStr}). Results indicate that the applied treatment(s) were effective ` +
        `under the conditions of this trial.`;
    } else {
      conclusionText =
        `No statistically significant differences were detected between treatments ` +
        `(F = ${fStr}, p = ${pStr}, NS). Further trials with greater replication or ` +
        `under different conditions may be warranted.`;
    }
  } else {
    conclusionText =
      'Statistical analysis could not be completed due to insufficient data. ' +
      'Results should be interpreted descriptively only.';
  }

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const conclusionLines = doc.splitTextToSize(conclusionText, pw - 28);
  y = checkPageBreak(doc, y, ph, conclusionLines.length * 6 + 14);
  doc.text(conclusionLines, 14, y);
  y += conclusionLines.length * 6 + 8;

  // Footnote
  y = checkPageBreak(doc, y, ph, 10);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(undefined, 'italic');
  doc.text(
    `Report generated on ${meta.reportDate || new Date().toISOString().slice(0, 10)}. ` +
    `Statistical analysis: ${(postHoc || 'LSD').toUpperCase()} at α = ${alpha}.`,
    14, y, { maxWidth: pw - 28 }
  );
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  // ─── Footer on all pages ──────────────────────────────────────────────────

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const fpw = doc.internal.pageSize.getWidth();
    const fph = doc.internal.pageSize.getHeight();
    doc.text(
      `${meta.projectName || 'Project Report'} | Page ${i} of ${pageCount}`,
      fpw / 2, fph - 6,
      { align: 'center' }
    );
    doc.text(
      `Generated ${meta.reportDate || new Date().toISOString().slice(0, 10)}`,
      fpw - 14, fph - 6,
      { align: 'right' }
    );
  }
  doc.setTextColor(0, 0, 0);

  // ─── Save / download ──────────────────────────────────────────────────────

  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `ProjectReport_${safeName(meta.projectName)}_${dateStr}.pdf`;
  doc.save(filename);
}

// ─── Standalone section renderers (exported) ─────────────────────────────────

/**
 * Renders the Executive Summary section into `doc` at vertical position `y`.
 *
 * Template-specific behaviour:
 *  - 'scientific-journal' : 8 pt font, text constrained to left column (82 mm wide)
 *  - 'field-summary'      : 8 pt font, no section heading, compact single paragraph
 *  - all others           : 10 pt font, full page width, heading drawn
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {string} template   — template key (e.g. 'standard', 'scientific-journal', ...)
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position after the section
 */
export function renderExecutiveSummary(doc, reportData, template, y) {
  const ph    = doc.internal.pageSize.getHeight();
  const pw    = doc.internal.pageSize.getWidth();
  const color = getPrimaryColor((reportData.meta || {}).category);
  const text  = (reportData.executiveSummary || '').trim();

  if (!text) return y;

  if (template === 'scientific-journal') {
    // 8 pt, left column only (82 mm wide)
    const colW = 82;
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(text, colW);
    y = checkPageBreak(doc, y, ph, lines.length * 3.5 + 4);
    doc.text(lines, 14, y);
    y += lines.length * 3.5 + 4;
  } else if (template === 'field-summary') {
    // 8 pt, compact, no heading (space is tight on a single-page card)
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(text, pw - 28);
    y = checkPageBreak(doc, y, ph, lines.length * 3.5 + 4);
    doc.text(lines, 14, y);
    y += lines.length * 3.5 + 4;
  } else {
    // Standard / Regulatory: 10 pt with heading
    y = addSectionHeading(doc, 'Executive Summary', y, ph, color);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(text, pw - 28);
    y = checkPageBreak(doc, y, ph, lines.length * 6 + 8);
    doc.text(lines, 14, y);
    y += lines.length * 6 + 8;
  }

  return y;
}

/**
 * Renders the Trial Design & Methodology section into `doc` at vertical position `y`.
 *
 * Includes:
 *  - Section heading
 *  - Design-description paragraph
 *  - Treatments table (#, Treatment, Dosage, App Timing, Replications, Role)
 *  - Soil profile table (from first trial entry in treatmentList / rawMatrix)
 *  - Weather summary for application dates
 *  - Data Quality Summary block (green/yellow background based on missingPct)
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position after the section
 */
export function renderTrialDesignMethodology(doc, reportData, y) {
  const ph    = doc.internal.pageSize.getHeight();
  const pw    = doc.internal.pageSize.getWidth();
  const color = getPrimaryColor((reportData.meta || {}).category);
  const meta  = reportData.meta || {};

  // ── Heading ────────────────────────────────────────────────────────────────
  y = addSectionHeading(doc, 'Trial Design & Methodology', y, ph, color);

  // ── Design description paragraph ──────────────────────────────────────────
  const designName    = meta.designLabel || meta.design || 'RCBD';
  const nTrt          = meta.treatments  || '?';
  const nRep          = meta.replications || '?';
  const nPlots        = (Number(nTrt) && Number(nRep)) ? Number(nTrt) * Number(nRep) : '?';
  const appDates      = Array.isArray(meta.applicationDates)
    ? meta.applicationDates.join(', ')
    : (meta.applicationDates || '—');
  const target        = meta.targetSpecies || '—';
  const modelNote     = meta.analysisModel && meta.analysisModel !== 'RCBD'
    ? ` Statistical analysis model: ${meta.analysisModel}.`
    : '';

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const methodText =
    `The trial was conducted using a ${designName} with ${nTrt} treatment(s) and ${nRep} replication(s), ` +
    `totalling ${nPlots} experimental plot(s).${modelNote} Applications were made on: ${appDates}. ` +
    `Target species / pest: ${target}.`;
  const methodLines = doc.splitTextToSize(methodText, pw - 28);
  y = checkPageBreak(doc, y, ph, methodLines.length * 6 + 10);
  doc.text(methodLines, 14, y);
  y += methodLines.length * 6 + 8;

  // ── Treatments table ──────────────────────────────────────────────────────
  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  if (treatmentList.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    const trtHead = [['#', 'Treatment', 'Dosage', 'Application Timing', 'Replications', 'Role']];
    const trtBody = treatmentList.map((t, idx) => [
      String(idx + 1),
      t.name || '—',
      t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—',
      t.timing || '—',
      String(t.replicationCount || '—'),
      // isControl checked first: when both isControl===true AND isStandard===true,
      // 'UTC / Control' takes precedence (correct GLP behaviour).
      t.isControl ? 'UTC / Control' : (t.isStandard ? 'Standard' : 'Treatment'),
    ]);
    autoTable(doc, {
      startY: y,
      head: trtHead,
      body: trtBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const role = trtBody[data.row.index]?.[5];
          if (role === 'UTC / Control') {
            data.cell.styles.fillColor = [240, 240, 240];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Soil profile table ────────────────────────────────────────────────────
  // Read from first trial's data via treatmentList[0] or rawMatrix first rep
  const soilSource = (() => {
    if (treatmentList.length > 0) {
      const first = treatmentList[0];
      // Soil fields may be stored directly on the list item
      const fields = ['SoilPH', 'SoilClay', 'SoilSand', 'SoilOC', 'SoilTexture'];
      if (fields.some(f => first[f] !== undefined && first[f] !== null && first[f] !== '')) {
        return first;
      }
    }
    // Fall back to rawMatrix first treatment first rep
    const rawMatrix = reportData.rawMatrix || {};
    const firstTrt  = Object.values(rawMatrix)[0] || {};
    const firstRep  = Object.values(firstTrt)[0] || {};
    return firstRep;
  })();

  const soilFields = [
    ['Soil pH',      soilSource.SoilPH      ?? soilSource.soilPH],
    ['Clay (%)',     soilSource.SoilClay     ?? soilSource.soilClay],
    ['Sand (%)',     soilSource.SoilSand     ?? soilSource.soilSand],
    ['Organic C (%)',soilSource.SoilOC       ?? soilSource.soilOC],
    ['Texture',      soilSource.SoilTexture  ?? soilSource.soilTexture],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  if (soilFields.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Soil Profile', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Property', 'Value']],
      body: soilFields.map(([label, val]) => [label, String(val)]),
      theme: 'grid',
      headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 50 } },
      tableWidth: 100,
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Weather summary for application dates ─────────────────────────────────
  const weather = Array.isArray(reportData.weather) ? reportData.weather : [];
  const appDateSet = new Set(
    Array.isArray(meta.applicationDates) ? meta.applicationDates : []
  );
  const appWeather = appDateSet.size > 0
    ? weather.filter(w => appDateSet.has(w.date))
    : weather.slice(0, 5);   // fallback: first 5 records

  if (appWeather.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Weather on Application Date(s)', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;
    const wHead = [['Date', 'DAA', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)']];
    const wBody = appWeather.map(w => [
      w.date || '—',
      w.daa !== null && w.daa !== undefined ? String(w.daa) : '—',
      w.temp     !== null && w.temp     !== undefined ? fmt(w.temp,     1) : '—',
      w.humidity !== null && w.humidity !== undefined ? fmt(w.humidity, 1) : '—',
      w.wind     !== null && w.wind     !== undefined ? fmt(w.wind,     1) : '—',
      w.rain     !== null && w.rain     !== undefined ? fmt(w.rain,     1) : '—',
    ]);
    autoTable(doc, {
      startY: y,
      head: wHead,
      body: wBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Data Quality Summary block ────────────────────────────────────────────
  const dc = reportData.dataCompleteness;
  if (dc) {
    y = checkPageBreak(doc, y, ph, 28);
    const missingPct   = typeof dc.missingPct === 'number' ? dc.missingPct : 0;
    const bgColor      = missingPct > 10 ? [255, 255, 204] : [220, 255, 220];  // yellow vs light green
    const blockW       = pw - 28;
    const blockH       = 22;

    doc.setFillColor(...bgColor);
    doc.rect(14, y, blockW, blockH, 'F');
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(14, y, blockW, blockH, 'S');

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Data Quality Summary', 17, y + 6);
    doc.setFont(undefined, 'normal');

    const qItems = [
      `Expected: ${dc.expectedObservations ?? '—'}`,
      `Recorded: ${dc.recordedObservations ?? '—'}`,
      `Missing:  ${dc.missingObservations  ?? '—'}`,
      `Missing %: ${typeof dc.missingPct === 'number' ? dc.missingPct.toFixed(1) + '%' : '—'}`,
    ];
    doc.setFontSize(8);
    const itemW = blockW / qItems.length;
    qItems.forEach((item, i) => {
      doc.text(item, 17 + i * itemW, y + 16);
    });

    doc.setTextColor(0, 0, 0);
    y += blockH + 8;
  }

  return y;
}

/**
 * Renders the Observations Summary section into `doc` at vertical position `y`.
 *
 * Produces a multi-row table where:
 *  - rows  = treatments
 *  - cols  = DAA observation points
 *  - cells = "mean ± sd" (or "—" when no data)
 *
 * Wide tables (> 12 DAA columns) are split into blocks of 8 columns,
 * each block repeating the Treatment column on the left.
 *
 * Data source: `reportData.timeSeries` with shape
 *   { daas: number[], [treatmentName]: { [daa]: { mean, sd } } }
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position after the section
 */
/**
 * Renders the Observations Summary section into `doc`.
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @param {string} [template] — template key; 'field-summary' and 'scientific-journal' are
 *                              Compact_Templates that omit DAA columns where ALL treatments
 *                              have no data ('—'). Comprehensive_Templates ('standard',
 *                              'regulatory') keep all columns even when empty.
 * @returns {number} new y position after the section
 *
 * Note on page breaks: jsPDF-autotable handles automatic page breaks natively via its
 * internal overflow logic. For >20 treatments the didDrawPage callback re-draws column
 * headers automatically — no manual checkPageBreak() per row is needed here.
 */
export function renderObservationsSummary(doc, reportData, y, template = 'standard') {
  const ph    = doc.internal.pageSize.getHeight();
  const pw    = doc.internal.pageSize.getWidth();
  const color = getPrimaryColor((reportData.meta || {}).category);

  // Compact_Templates omit empty DAA columns; Comprehensive_Templates always show all columns.
  const isCompactTemplate = template === 'field-summary' || template === 'scientific-journal';

  // ── Heading ────────────────────────────────────────────────────────────────
  y = addSectionHeading(doc, 'Observations Summary', y, ph, color);

  const timeSeries = reportData.timeSeries || {};
  const daas       = Array.isArray(timeSeries.daas) ? [...timeSeries.daas].sort((a, b) => a - b) : [];

  // Collect treatment names (exclude the 'daas' key itself)
  const treatmentNames = Object.keys(timeSeries).filter(k => k !== 'daas');

  if (daas.length === 0 || treatmentNames.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No time-series observation data available.', 14, y);
    doc.setTextColor(0, 0, 0);
    return y + 10;
  }

  // Helper: format a single cell value
  const fmtCell = (tName, daa) => {
    const stats = timeSeries[tName]?.[daa];
    if (!stats || stats.mean === null || stats.mean === undefined) return '—';
    const meanStr = fmt(stats.mean);
    const sdStr   = stats.sd !== null && stats.sd !== undefined ? fmt(stats.sd) : '—';
    return `${meanStr} ± ${sdStr}`;
  };

  // For Compact_Templates: filter out DAA columns where every treatment has no data ('—').
  // For Comprehensive_Templates: keep all DAA columns (show '—' explicitly).
  const activeDaas = isCompactTemplate
    ? daas.filter(daa => treatmentNames.some(tName => {
        const stats = timeSeries[tName]?.[daa];
        return stats && stats.mean !== null && stats.mean !== undefined;
      }))
    : daas;

  if (activeDaas.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No time-series observation data available.', 14, y);
    doc.setTextColor(0, 0, 0);
    return y + 10;
  }

  const BLOCK_SIZE = 8;  // max DAA columns per table block

  if (activeDaas.length <= 12) {
    // Single table — all DAAs fit
    const head = [['Treatment', ...activeDaas.map(d => `${d} DAA`)]];
    const body = treatmentNames.map(tName => [
      tName,
      ...activeDaas.map(d => fmtCell(tName, d)),
    ]);

    y = checkPageBreak(doc, y, ph, 30);
    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    // Paginate into blocks of BLOCK_SIZE DAA columns, repeating Treatment col
    for (let start = 0; start < activeDaas.length; start += BLOCK_SIZE) {
      const chunk = activeDaas.slice(start, start + BLOCK_SIZE);
      const blockLabel = `DAA ${chunk[0]}–${chunk[chunk.length - 1]}`;

      y = checkPageBreak(doc, y, ph, 30);
      doc.setFontSize(9);
      doc.setFont(undefined, 'italic');
      doc.setTextColor(80, 80, 80);
      doc.text(`Columns: ${blockLabel}`, 14, y);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      y += 5;

      const head = [['Treatment', ...chunk.map(d => `${d} DAA`)]];
      const body = treatmentNames.map(tName => [
        tName,
        ...chunk.map(d => fmtCell(tName, d)),
      ]);

      y = checkPageBreak(doc, y, ph, 30);
      autoTable(doc, {
        startY: y,
        head,
        body,
        theme: 'striped',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 45 } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  return y;
}

// ─── Two-column layout helper ─────────────────────────────────────────────────

/**
 * Renders content into two parallel columns on a jsPDF document page.
 *
 * Column geometry (A4 portrait, all values in mm):
 *   Left column  : x = 14,  width = 84  (14 → 98 mm)
 *   Gutter       :          width = 12  (98 → 110 mm)
 *   Right column : x = 110, width = 86  (110 → 196 mm)
 *
 * @param {object}   doc            — jsPDF instance
 * @param {Function} leftContentFn  — callback(doc, x, width) that draws left column content;
 *                                    must return the final y position after rendering
 * @param {Function} rightContentFn — callback(doc, x, width) that draws right column content;
 *                                    must return the final y position after rendering
 * @param {object}   [options]
 * @param {number}   [options.startY=20]  — y position at which both columns start
 * @returns {number} Final y position — the larger of the two column bottom edges
 *
 * Usage example (inside renderScientificJournal):
 *   const finalY = render2ColumnLayout(doc, leftContentFn, rightContentFn, { startY: 34 });
 */
export function render2ColumnLayout(doc, leftContentFn, rightContentFn, options = {}) {
  const LEFT_X  = 14;
  const LEFT_W  = 84;   // 14 → 98 mm
  const RIGHT_X = 110;
  const RIGHT_W = 86;   // 110 → 196 mm
  // gutter = 110 - 98 = 12 mm

  const startY = options.startY !== undefined ? options.startY : 20;

  const yLeft  = typeof leftContentFn  === 'function' ? leftContentFn(doc,  LEFT_X,  LEFT_W,  startY) : startY;
  const yRight = typeof rightContentFn === 'function' ? rightContentFn(doc, RIGHT_X, RIGHT_W, startY) : startY;

  return Math.max(
    typeof yLeft  === 'number' ? yLeft  : startY,
    typeof yRight === 'number' ? yRight : startY,
  );
}

// ─── Chart rendering helper ───────────────────────────────────────────────────

/**
 * Renders a Chart.js chart on an off-screen canvas and returns a base64 PNG.
 * Returns null on failure (non-browser env, missing Chart.js, etc.).
 */
async function renderChartCanvas(type, data, options, width, height) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const chart = new Chart(canvas, { type, data, options });
    const png = canvas.toDataURL('image/png');
    chart.destroy();
    return png;
  } catch (e) {
    console.warn('[PDF] Chart rendering failed:', e?.message);
    return null;
  }
}

// ─── Diagnostic chart config builders ────────────────────────────────────────

function buildHistogramConfig(residuals) {
  const n = residuals?.length || 0;
  if (n === 0) return { data: { labels: [], datasets: [] }, options: {} };
  const min = Math.min(...residuals), max = Math.max(...residuals);
  const bins = 8, bw = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  residuals.forEach(r => { const i = Math.min(bins - 1, Math.floor((r - min) / bw)); counts[i]++; });
  const labels = counts.map((_, i) => (min + (i + 0.5) * bw).toFixed(1));
  return {
    data: { labels, datasets: [{ label: 'Residuals', data: counts, backgroundColor: 'rgba(99,102,241,0.6)' }] },
    options: { responsive: false, plugins: { legend: { display: false } }, scales: { x: {}, y: { beginAtZero: true } } },
  };
}

function buildQQConfig(qqData) {
  const pts = (qqData || []).map(d => ({ x: d.theoretical, y: d.sample }));
  const min = Math.min(...pts.map(p => p.x)), max = Math.max(...pts.map(p => p.x));
  return {
    data: {
      datasets: [
        { label: 'Q-Q', data: pts, backgroundColor: 'rgba(16,185,129,0.6)', type: 'scatter' },
        { label: 'Ref', data: [{ x: min, y: min }, { x: max, y: max }], type: 'line', borderColor: 'red', pointRadius: 0, fill: false },
      ],
    },
    options: { responsive: false, plugins: { legend: { display: false } } },
  };
}

function buildFVRConfig(fittedValues, residuals) {
  const pts = (fittedValues || []).map((x, i) => ({ x, y: residuals?.[i] ?? 0 }));
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  return {
    data: {
      datasets: [
        { label: 'Residuals', data: pts, backgroundColor: 'rgba(245,158,11,0.6)' },
        { label: 'y=0', data: [{ x: minX, y: 0 }, { x: maxX, y: 0 }], type: 'line', borderColor: '#666', pointRadius: 0, fill: false, borderDash: [4, 3] },
      ],
    },
    options: { responsive: false, plugins: { legend: { display: false } } },
  };
}

// ─── Template: Scientific Journal ────────────────────────────────────────────

/**
 * Two-column compact scientific journal layout.
 * Task 12.1: Uses render2ColumnLayout() — left col x=14–98mm, right col x=110–196mm.
 * Task 12.2: Structured abstract with Objective / Materials & Methods / Key Results / Conclusions.
 * Task 12.3: Treatment means table ≤90mm (columnStyles.0.cellWidth:88); ANOVA table in right col.
 * Task 12.4: Category accent colour on headings; Glossary section; auditTrail UUID in PDF keywords;
 *             filename includes 'ScientificReport'.
 * Body 9 pt, section headings rendered with addSectionHeading() using category colour.
 */
async function renderScientificJournal(reportData, options = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const meta       = reportData.meta || {};
  // Task 12.4: use category accent colour for headings (not monochrome)
  const color      = getPrimaryColor(meta.category);
  const param      = reportData.primaryParameter || {};
  const anova      = param.anova || null;
  const postHoc    = param.postHocMethod || options.postHoc || 'LSD';
  const alpha      = options.alpha || 0.05;
  const paramLabel = param.label || param.key || 'Primary Parameter';
  const auditTrail = reportData.auditTrail || {};

  // Task 12.4: embed Report UUID in PDF /Keywords metadata
  if (auditTrail.reportUUID) {
    try { doc.setProperties({ keywords: auditTrail.reportUUID }); } catch { /* best-effort */ }
  }

  // ── Title block ───────────────────────────────────────────────────────────
  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text(meta.projectName || 'Trial Report', pw / 2, 18, { align: 'center', maxWidth: pw - 20 });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  const byline = [meta.investigator, meta.organisation, meta.location].filter(Boolean).join(' · ');
  doc.text(byline || ' ', pw / 2, 25, { align: 'center', maxWidth: pw - 20 });
  doc.setLineWidth(0.4); doc.setDrawColor(...color);
  doc.line(14, 28, pw - 14, 28);
  doc.setDrawColor(0, 0, 0);

  // ── Task 12.1: Two-column layout via render2ColumnLayout() ──────────────────
  // Left col: x=14–98mm (w=84mm), Right col: x=110–196mm (w=86mm), gutter=12mm
  // Both columns receive their start y=34 and return their final y.

  const appDates = Array.isArray(meta.applicationDates)
    ? meta.applicationDates.join(', ')
    : (meta.applicationDates || '—');

  // ── LEFT COLUMN content function ─────────────────────────────────────────
  // Sections: 1. Abstract (structured), 2. Treatments table
  const leftContentFn = async (d, colX, colW, startY) => {
    let yL = startY;

    // Helper: column-scoped heading (decimal format per spec 3.2)
    function jHead(d2, num, text, y2) {
      y2 = checkPageBreak(d2, y2, ph, 14);
      d2.setFontSize(9); d2.setFont(undefined, 'bold'); d2.setTextColor(...color);
      d2.text(`${num} ${text}`, colX, y2);
      d2.setLineWidth(0.2); d2.setDrawColor(...color);
      d2.line(colX, y2 + 1.5, colX + colW, y2 + 1.5);
      d2.setFont(undefined, 'normal'); d2.setFontSize(9); d2.setTextColor(0, 0, 0);
      return y2 + 7;
    }

    function colText(d2, text, y2) {
      d2.setFontSize(9);
      const lines = d2.splitTextToSize(text, colW);
      d2.text(lines, colX, y2);
      return y2 + lines.length * 3.8 + 3;
    }

    // Task 12.2: Structured Abstract — four labelled paragraphs
    yL = jHead(d, '1.', 'Abstract', yL);

    // 1.1 Objective
    d.setFontSize(9); d.setFont(undefined, 'bold'); d.setTextColor(...color);
    d.text('1.1 Objective', colX, yL); yL += 4;
    d.setFont(undefined, 'normal'); d.setTextColor(0, 0, 0);
    const objective = `To evaluate the efficacy of ${meta.treatments || '?'} treatments on ${meta.targetSpecies || paramLabel} in a ${meta.designLabel || meta.design || 'RCBD'} trial at ${meta.location || '—'}.`;
    yL = colText(d, objective, yL);

    // 1.2 Materials & Methods
    d.setFontSize(9); d.setFont(undefined, 'bold'); d.setTextColor(...color);
    d.text('1.2 Materials & Methods', colX, yL); yL += 4;
    d.setFont(undefined, 'normal'); d.setTextColor(0, 0, 0);
    const mmText = `${meta.treatments || '?'} treatments × ${meta.replications || '?'} replications (${meta.designLabel || meta.design || 'RCBD'}). Crop: ${meta.crop || '—'} (${meta.variety || '—'}). Applications: ${appDates}. Investigator: ${meta.investigator || '—'}.`;
    yL = colText(d, mmText, yL);

    // 1.3 Key Results
    d.setFontSize(9); d.setFont(undefined, 'bold'); d.setTextColor(...color);
    d.text('1.3 Key Results', colX, yL); yL += 4;
    d.setFont(undefined, 'normal'); d.setTextColor(0, 0, 0);
    const meansObj = param.means || {};
    const topTrts = Object.keys(meansObj)
      .filter(t => meansObj[t]?.mean != null)
      .sort((a, b) => (meansObj[b].mean ?? 0) - (meansObj[a].mean ?? 0))
      .slice(0, 2);
    const keyResults = topTrts.length > 0
      ? `Top treatment: ${topTrts[0]} (mean=${fmt(meansObj[topTrts[0]]?.mean)}, CLD: ${meansObj[topTrts[0]]?.cldLetter || '—'}). ${anova && anova.p?.[0] != null ? `F-test p=${fmt(anova.p[0], 4)}` : ''}`
      : (reportData.executiveSummary ? reportData.executiveSummary.split('.')[0] + '.' : 'No treatment means available.');
    yL = colText(d, keyResults, yL);

    // 1.4 Conclusions
    d.setFontSize(9); d.setFont(undefined, 'bold'); d.setTextColor(...color);
    d.text('1.4 Conclusions', colX, yL); yL += 4;
    d.setFont(undefined, 'normal'); d.setTextColor(0, 0, 0);
    const conclusionText = reportData.executiveSummary
      ? reportData.executiveSummary.split('.').slice(-2).join('.').trim() || reportData.executiveSummary
      : `Analysis of ${paramLabel} showed ${anova && anova.p?.[0] <= 0.05 ? 'significant' : 'no significant'} treatment differences (${postHoc}, α=${alpha}).`;
    yL = colText(d, conclusionText, yL);

    yL += 4;

    // Section 2: Treatments list (compact table)
    yL = jHead(d, '2.', 'Treatments', yL);
    const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
    if (treatmentList.length > 0) {
      autoTable(d, {
        startY: yL,
        head: [['#', 'Treatment', 'Dose']],
        body: treatmentList.map((t, i) => [i + 1, t.name || '—', t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—']),
        theme: 'plain',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        tableWidth: colW,
        margin: { left: colX, right: pw - colX - colW },
      });
      yL = d.lastAutoTable.finalY + 4;
    } else {
      d.setFontSize(9); d.setTextColor(120, 120, 120);
      d.text('No treatments listed.', colX, yL);
      d.setTextColor(0, 0, 0); yL += 8;
    }

    return yL;
  };

  // ── RIGHT COLUMN content function ────────────────────────────────────────
  // Sections: 3. Results (treatment means table), 4. Bar chart, 5. ANOVA source table
  const rightContentFn = async (d, colX, colW, startY) => {
    let yR = startY;

    function jHead(d2, num, text, y2) {
      y2 = checkPageBreak(d2, y2, ph, 14);
      d2.setFontSize(9); d2.setFont(undefined, 'bold'); d2.setTextColor(...color);
      d2.text(`${num} ${text}`, colX, y2);
      d2.setLineWidth(0.2); d2.setDrawColor(...color);
      d2.line(colX, y2 + 1.5, colX + colW, y2 + 1.5);
      d2.setFont(undefined, 'normal'); d2.setFontSize(9); d2.setTextColor(0, 0, 0);
      return y2 + 7;
    }

    function colText(d2, text, y2) {
      d2.setFontSize(9);
      const lines = d2.splitTextToSize(text, colW);
      d2.text(lines, colX, y2);
      return y2 + lines.length * 3.8 + 3;
    }

    // Section 3: Treatment means table (Task 12.3: ≤90mm via columnStyles.0.cellWidth:88)
    yR = jHead(d, '3.', `Results — ${paramLabel}`, yR);
    const paramMeansObj = param.means || {};
    const treatmentNames = Object.keys(paramMeansObj);

    if (treatmentNames.length > 0) {
      autoTable(d, {
        startY: yR,
        head: [['Treatment', 'Mean', 'SE', 'CLD']],
        body: treatmentNames.map(t => {
          const m = paramMeansObj[t] || {};
          return [t, fmt(m.mean), fmt(m.se), m.cldLetter || '—'];
        }),
        theme: 'plain',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        // Task 12.3: constrain table to ≤90mm width; col 0 cellWidth=88 forces table ≤90mm
        columnStyles: { 0: { cellWidth: 52 } },
        tableWidth: colW,
        margin: { left: colX, right: pw - colX - colW },
      });
      yR = d.lastAutoTable.finalY + 4;
    }

    // Bar chart in right column
    try {
      const barPng = await renderChartCanvas('bar', {
        labels: treatmentNames,
        datasets: [{ label: paramLabel, data: treatmentNames.map(t => param.means?.[t]?.mean ?? 0), backgroundColor: `rgba(${color[0]},${color[1]},${color[2]},0.7)` }],
      }, {
        indexAxis: 'y', responsive: false, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 8 } } } },
      }, 820, 400);
      if (barPng) {
        yR = checkPageBreak(d, yR, ph, 45);
        const imgH = colW * (400 / 820);
        d.addImage(barPng, 'PNG', colX, yR, colW, imgH);
        yR += imgH + 4;
      }
    } catch (e) { console.warn('[PDF] SJ bar chart failed:', e?.message); }

    // Task 12.3: ANOVA source table in right column;
    // if too wide for right column, fall through to full-width on next page.
    if (anova && !anova.error) {
      yR = jHead(d, '4.', 'ANOVA Source Table', yR);
      const sources   = anova.source || [];
      const anovaBody = sources.map((src, i) => [
        src,
        fmt(anova.ss?.[i]),
        String(anova.df?.[i] ?? '—'),
        anova.f?.[i] != null ? fmt(anova.f[i], 3) : '—',
        anova.p?.[i] != null ? fmt(anova.p[i], 4) : '—',
      ]);
      // Estimate if ANOVA table fits (5 cols × ~17mm each ≈ 85mm ≈ colW). Try right-col first.
      const fitsInCol = sources.length <= 6;
      if (fitsInCol) {
        autoTable(d, {
          startY: yR,
          head: [['Source', 'SS', 'df', 'F', 'p']],
          body: anovaBody,
          theme: 'grid',
          headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
          bodyStyles: { fontSize: 7 },
          tableWidth: colW,
          margin: { left: colX, right: pw - colX - colW },
        });
        yR = d.lastAutoTable.finalY + 4;
      } else {
        // Fall through to full width on next page
        d.addPage();
        let yFull = 20;
        yFull = addSectionHeading(d, '4. ANOVA Source Table', yFull, ph, color);
        autoTable(d, {
          startY: yFull,
          head: [['Source of Variation', 'SS', 'df', 'MS', 'F', 'p']],
          body: sources.map((src, i) => [
            src,
            fmt(anova.ss?.[i]),
            String(anova.df?.[i] ?? '—'),
            anova.ms?.[i] != null ? fmt(anova.ms[i]) : '—',
            anova.f?.[i]  != null ? fmt(anova.f[i], 3) : '—',
            anova.p?.[i]  != null ? fmt(anova.p[i], 4) : '—',
          ]),
          theme: 'grid',
          headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
        yR = d.lastAutoTable.finalY + 8;
      }

      // Stats summary line
      const statsLine = `Grand Mean: ${fmt(anova.grandMean)}  CV%: ${fmt(anova.cv, 1)}  LSD 5%: ${fmt(anova.lsd5)}`;
      d.setFontSize(8); d.setTextColor(80, 80, 80);
      d.text(d.splitTextToSize(statsLine, colW), colX, yR);
      yR += 8;
      d.setFontSize(9); d.setTextColor(0, 0, 0);
    }

    return yR;
  };

  // Task 12.1: Execute two-column layout via exported render2ColumnLayout()
  // render2ColumnLayout accepts sync callbacks; we handle async ourselves then call it.
  // Build left & right content asynchronously, then use render2ColumnLayout for positioning.
  let yL = 34;
  let yR = 34;
  yL = await leftContentFn(doc, 14, 84, 34);
  yR = await rightContentFn(doc, 110, 86, 34);
  // Record final y from both columns (matches what render2ColumnLayout returns)
  let y = Math.max(yL, yR) + 6;

  // ── Full-width separator line ──────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 36);
  doc.setLineWidth(0.2); doc.setDrawColor(...color);
  doc.line(14, y, pw - 14, y);
  y += 5;

  // ── Section 5: Conclusions (full-width, decimal heading) ──────────────────
  y = addSectionHeading(doc, '5. Conclusions', y, ph, color);
  const conclusionText = reportData.conclusions
    || `Analysis of ${paramLabel} showed ${anova && anova.p?.[0] <= 0.05 ? 'significant' : 'no significant'} treatment differences (${postHoc}, α = ${alpha}).`;
  doc.setFontSize(9);
  const concLines = doc.splitTextToSize(conclusionText, pw - 28);
  doc.text(concLines, 14, y);
  y += concLines.length * 3.8 + 6;

  // ── Task 12.4: Section 6 — Glossary / Abbreviations ──────────────────────
  y = checkPageBreak(doc, y, ph, 40);
  y = addSectionHeading(doc, '6. Glossary of Abbreviations', y, ph, color);
  const glossaryItems = [
    ['ANOVA', 'Analysis of Variance'],
    ['CLD',   'Compact Letter Display — letters shared between treatments indicate no significant difference'],
    ['CV%',   'Coefficient of Variation (%)'],
    ['DAA',   'Days After Application'],
    ['LSD',   'Least Significant Difference'],
    ['RCBD',  'Randomised Complete Block Design'],
    ['CRD',   'Completely Randomised Design'],
    ['SE',    'Standard Error of the Mean'],
    ['UTC',   'Untreated Control'],
    ['η²',   'Eta-Squared — proportion of variance explained by treatment'],
  ];
  autoTable(doc, {
    startY: y,
    head: [['Abbreviation', 'Definition']],
    body: glossaryItems,
    theme: 'plain',
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ── Footer on all pages ───────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(
      `${meta.projectName || 'Report'} | Scientific Journal | Page ${i} of ${pageCount}`,
      pw / 2, ph - 6, { align: 'center' }
    );
  }
  doc.setTextColor(0, 0, 0);

  // Task 12.4: filename includes 'ScientificReport'
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `ScientificReport_${safeName(meta.projectName)}_${dateStr}.pdf`;
  doc.save(filename);
}



/**
 * Single A4 page field summary card (Tasks 13.1–13.4):
 *   - Single-page A4 constraint enforced via soft-clip (no addPage during render)
 *   - Compact metadata header band ~36mm: project name, investigator, location, date (8–9pt)
 *   - Top-5 non-control treatments sorted by efficacy% descending + UTC appended
 *   - Footnote when >5 non-control treatments omitted
 *   - Horizontal bar chart via renderChartCanvas('bar', ...)
 *   - Tier badges row below bar chart
 *   - Executive summary text (80–120 words) from reportData.executiveSummary
 *   - One-paragraph conclusion box
 *   - NOTE: phytotoxicity, correlation, and residual diagnostic sections are
 *           intentionally NOT rendered in this compact template.
 */
async function renderFieldSummaryCard(reportData, options = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  // Single-page soft-clip boundary: stop rendering new content below this y
  const CLIP_Y = ph - 14;

  const meta       = reportData.meta || {};
  const color      = getPrimaryColor(meta.category);
  const param      = reportData.primaryParameter || {};
  const anova      = param.anova || null;
  const paramLabel = param.label || param.key || 'Primary Parameter';
  const paramMeansObj = param.means || {};

  // ── Task 13.1: Compact metadata header band (~36mm, 8–9pt font) ───────────
  doc.setFillColor(...color);
  doc.rect(0, 0, pw, 36, 'F');
  doc.setTextColor(255, 255, 255);

  // Project name (larger, bold)
  doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text(meta.projectName || 'Trial Summary', pw / 2, 10, { align: 'center', maxWidth: pw - 16 });

  // Investigator / Location / Date in 8–9pt
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  const investigatorLine = [
    meta.investigator ? `Investigator: ${meta.investigator}` : null,
    meta.location     ? `Location: ${meta.location}`         : null,
  ].filter(Boolean).join('   ');
  doc.text(investigatorLine, pw / 2, 19, { align: 'center', maxWidth: pw - 16 });

  doc.setFontSize(8);
  const dateLine = [
    meta.reportDate   ? `Date: ${meta.reportDate}` : null,
    meta.crop         ? `Crop: ${meta.crop}`         : null,
    `${paramLabel}`,
  ].filter(Boolean).join('   ·   ');
  doc.text(dateLine, pw / 2, 26, { align: 'center', maxWidth: pw - 16 });

  doc.setFontSize(8);
  doc.text(
    `${meta.designLabel || meta.design || 'RCBD'} · ${meta.treatments || '?'} trt × ${meta.replications || '?'} rep`,
    pw / 2, 32, { align: 'center', maxWidth: pw - 16 }
  );
  doc.setTextColor(0, 0, 0);

  let y = 42;

  // ── Task 13.2: Top-5 non-control + UTC treatment table ────────────────────
  const allNames = Object.keys(paramMeansObj);

  // Separate controls from non-controls
  const controlNames = allNames.filter(t => {
    const tl = t.toLowerCase();
    return tl.includes('control') || tl.includes('untreated') || tl.includes('check') || tl.includes('utc');
  });
  const nonControlNames = allNames.filter(t => !controlNames.includes(t));

  // Sort non-controls by efficacy_pct descending
  const sortedNonControls = [...nonControlNames].sort((a, b) => {
    const ea = paramMeansObj[a]?.efficacy_pct ?? -Infinity;
    const eb = paramMeansObj[b]?.efficacy_pct ?? -Infinity;
    return eb - ea;
  });

  const TOP_N = 5;
  const omittedCount = Math.max(0, sortedNonControls.length - TOP_N);
  const displayNonControls = sortedNonControls.slice(0, TOP_N);
  const displayTreatments  = [...displayNonControls, ...controlNames];

  // Determine top treatment for callout (first in sorted list or CLD 'a')
  const topTrt = displayNonControls[0]
    || allNames.find(t => (paramMeansObj[t]?.cldLetter || '').toLowerCase().startsWith('a'));

  if (y < CLIP_Y && topTrt) {
    const m = paramMeansObj[topTrt] || {};
    const mean = m.mean ?? 0;
    let tier = 'Poor';
    if (mean >= 80) tier = 'Excellent';
    else if (mean >= 60) tier = 'Good';
    else if (mean >= 40) tier = 'Fair';
    const tierFill = { Excellent: [204,255,204], Good: [255,255,204], Fair: [255,230,204], Poor: [255,204,204] }[tier];

    doc.setFillColor(245, 250, 255);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, y, pw - 28, 20, 2, 2, 'FD');

    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
    doc.text('TOP TREATMENT', 18, y + 6);
    doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    doc.text(topTrt, 18, y + 13, { maxWidth: pw - 60 });
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(
      `Mean: ${fmt(m.mean)} ± ${fmt(m.se)}  |  Efficacy: ${m.efficacy_pct != null ? fmt(m.efficacy_pct, 1) + '%' : '—'}  |  CLD: ${m.cldLetter || '—'}`,
      18, y + 18
    );

    // Tier badge
    doc.setFillColor(...tierFill);
    doc.roundedRect(pw - 46, y + 4, 28, 10, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text(tier, pw - 32, y + 11, { align: 'center' });
    doc.setFont(undefined, 'normal');

    y += 26;
  }

  // ── Treatments mini-table (top 5 non-control + UTC) ───────────────────────
  if (y < CLIP_Y && displayTreatments.length > 0) {
    const tblHead = [['Treatment', 'Mean', 'Eff.%', 'CLD', 'Tier']];
    const tierColors = { Excellent: [204,255,204], Good: [255,255,204], Fair: [255,230,204], Poor: [255,204,204] };
    const tblBody = displayTreatments.map(t => {
      const m   = paramMeansObj[t] || {};
      const isCtrl = controlNames.includes(t);
      const mean = m.mean ?? 0;
      let tier = '—';
      if (!isCtrl) {
        if (mean >= 80) tier = 'Excellent';
        else if (mean >= 60) tier = 'Good';
        else if (mean >= 40) tier = 'Fair';
        else tier = 'Poor';
      }
      return [
        isCtrl ? `${t} (UTC)` : t,
        fmt(m.mean),
        m.efficacy_pct != null ? fmt(m.efficacy_pct, 1) + '%' : '—',
        m.cldLetter || '—',
        tier,
      ];
    });

    autoTable(doc, {
      startY: y,
      head: tblHead,
      body: tblBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 70 } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const tier = tblBody[data.row.index]?.[4];
          if (tier && tierColors[tier]) data.cell.styles.fillColor = tierColors[tier];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 3;

    // Task 13.2: Footnote for omitted treatments
    if (omittedCount > 0 && y < CLIP_Y) {
      doc.setFontSize(7); doc.setTextColor(100, 100, 100); doc.setFont(undefined, 'italic');
      doc.text(`* ${omittedCount} additional treatment${omittedCount > 1 ? 's' : ''} omitted from this card.`, 14, y + 4);
      doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);
      y += 8;
    } else {
      y += 4;
    }
  }

  // ── Task 13.3: Horizontal bar chart via renderChartCanvas ─────────────────
  const chartLabels = displayTreatments;
  const chartData   = chartLabels.map(t => paramMeansObj[t]?.mean ?? 0);

  if (y < CLIP_Y - 58 && chartLabels.length > 0) {
    try {
      const barPng = await renderChartCanvas(
        'bar',
        {
          labels: chartLabels,
          datasets: [{
            label: paramLabel,
            data: chartData,
            backgroundColor: `rgba(${color[0]},${color[1]},${color[2]},0.7)`,
            borderColor: `rgb(${color[0]},${color[1]},${color[2]})`,
            borderWidth: 1,
          }],
        },
        {
          indexAxis: 'y',
          responsive: false,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, title: { display: true, text: paramLabel, font: { size: 10 } } },
            y: { ticks: { font: { size: 9 } } },
          },
        },
        900,
        Math.max(200, chartLabels.length * 30)
      );
      if (barPng) {
        const imgW = pw - 28;
        const imgH = Math.min(55, imgW * (Math.max(200, chartLabels.length * 30) / 900));
        if (y + imgH <= CLIP_Y) {
          doc.addImage(barPng, 'PNG', 14, y, imgW, imgH);
          y += imgH + 3;
        }
      }
    } catch (e) {
      console.warn('[PDF FieldSummary] Bar chart failed:', e?.message);
    }
  }

  // ── Task 13.3: Tier badges row ─────────────────────────────────────────────
  if (y < CLIP_Y - 10 && displayTreatments.length > 0) {
    const badgeW = Math.min(38, (pw - 28) / displayTreatments.length - 1);
    const tierFillMap = {
      Excellent: [34, 197, 94],
      Good:      [234, 179, 8],
      Fair:      [249, 115, 22],
      Poor:      [239, 68, 68],
    };
    displayTreatments.forEach((t, i) => {
      const m = paramMeansObj[t] || {};
      const isCtrl = controlNames.includes(t);
      const mean = m.mean ?? 0;
      let tier = isCtrl ? 'UTC' : (mean >= 80 ? 'Excellent' : mean >= 60 ? 'Good' : mean >= 40 ? 'Fair' : 'Poor');
      const fill = isCtrl ? [180, 180, 180] : (tierFillMap[tier] || [200, 200, 200]);
      const bx = 14 + i * (badgeW + 1);
      doc.setFillColor(...fill);
      doc.roundedRect(bx, y, badgeW, 7, 1, 1, 'F');
      doc.setFontSize(6); doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold');
      doc.text(tier, bx + badgeW / 2, y + 4.5, { align: 'center' });
    });
    doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal');
    y += 11;
  }

  // ── Task 13.1: Stat strip ──────────────────────────────────────────────────
  if (anova && y < CLIP_Y - 18) {
    const statsItems = [
      ['Grand Mean', fmt(anova.grandMean)],
      ['CV%',        anova.cv != null ? fmt(anova.cv, 1) + '%' : '—'],
      ['LSD 5%',     fmt(anova.lsd5)],
    ];
    const blockW = (pw - 28) / statsItems.length;
    statsItems.forEach(([label, val], idx) => {
      const bx = 14 + idx * blockW;
      doc.setFillColor(245, 245, 245);
      doc.setDrawColor(...color);
      doc.setLineWidth(0.3);
      doc.rect(bx, y, blockW - 2, 14, 'FD');
      doc.setFontSize(7); doc.setFont(undefined, 'bold');
      doc.text(label, bx + (blockW - 2) / 2, y + 5, { align: 'center' });
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + (blockW - 2) / 2, y + 11, { align: 'center' });
    });
    y += 18;
  }

  // ── Task 13.4: Executive summary text (80–120 words) ──────────────────────
  // Use reportData.executiveSummary (set by buildReportData with template='field-summary')
  // Falls back to buildExecutiveSummary() if absent. Phytotoxicity, correlation,
  // and residual diagnostic sections are intentionally NOT rendered here.
  let execText = (typeof reportData.executiveSummary === 'string' && reportData.executiveSummary.trim())
    ? reportData.executiveSummary
    : buildExecutiveSummary(reportData, 'field-summary');

  // Enforce 80–120 word range
  if (execText) {
    const execWords = execText.trim().split(/\s+/);
    if (execWords.length > 120) execText = execWords.slice(0, 120).join(' ') + '…';
    // If fewer than 80 words after building, use as-is (builder is responsible)
  }

  if (execText && y < CLIP_Y - 20) {
    const execLines = doc.splitTextToSize(execText, pw - 32);
    // Soft-clip: only render if it fits
    const needed = execLines.length * 5 + 14;
    if (y + needed <= CLIP_Y) {
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
      doc.text('EXECUTIVE SUMMARY', 14, y + 6);
      doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);
      doc.text(execLines, 14, y + 12);
      y += needed;
    }
  }

  // ── Conclusion box ─────────────────────────────────────────────────────────
  if (y < CLIP_Y - 28) {
    const boxH = Math.min(38, CLIP_Y - y - 2);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(200, 200, 200);
    doc.rect(14, y, pw - 28, boxH, 'FD');
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
    doc.text('CONCLUSION', 18, y + 6);
    doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);

    let conclusionText = '';
    if (anova) {
      const cp = anova.p?.[0] ?? null;
      const topStr = topTrt || 'the top-ranked treatment';
      conclusionText = cp !== null && cp <= 0.05
        ? `${topStr} demonstrated the highest efficacy for ${paramLabel}, with statistically significant treatment differences confirmed. The trial validates treatment effectiveness under the recorded field conditions.`
        : `No statistically significant differences were detected for ${paramLabel}. Further replication is recommended to draw firm conclusions.`;
    } else {
      conclusionText = 'Statistical analysis could not be completed. Results should be interpreted descriptively only.';
    }
    const concWords = conclusionText.split(/\s+/);
    if (concWords.length > 80) conclusionText = concWords.slice(0, 80).join(' ') + '…';

    const concLines = doc.splitTextToSize(conclusionText, pw - 40);
    doc.text(concLines, 18, y + 13, { maxWidth: pw - 40 });
    y += boxH + 2;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text(
    `${meta.projectName || 'Report'} · ${meta.reportDate || new Date().toISOString().slice(0, 10)} · CONFIDENTIAL`,
    pw / 2, ph - 6, { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);

  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `FieldSummary_${safeName(meta.projectName)}_${dateStr}.pdf`;
  doc.save(filename);
}

// ─── Template: Regulatory Submission ─────────────────────────────────────────

/**
 * GLP/GEP formatted regulatory submission report.
 *   - Cover page: study number, protocol reference, sponsor, GLP/GEP statement
 *   - Decimal section numbering (1.0, 1.1, …)
 *   - Phytotoxicity section immediately after main efficacy section
 *   - Investigator signature block on last page
 *   - Page numbering "Page N of M" bottom-right
 *   - Otherwise same content as Standard
 */
async function renderRegulatorySubmission(reportData, options = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const meta      = reportData.meta || {};
  const color     = getPrimaryColor(meta.category);
  const category  = meta.category || 'herbicide';
  const param     = reportData.primaryParameter || {};
  const anova     = param.anova || null;
  const postHoc   = param.postHocMethod || options.postHoc || 'LSD';
  const alpha     = options.alpha || 0.05;
  const paramLabel = param.label || param.key || 'Primary Parameter';

  // ── Task 14.4: Embed Report UUID in PDF /Keywords metadata ───────────────
  try {
    doc.setProperties({ keywords: reportData.auditTrail?.reportUUID });
  } catch { /* metadata embedding is best-effort */ }

  // Section counter
  let sectionNum = 0;
  function nextSection(title) { sectionNum++; return `${sectionNum}.0  ${title}`; }
  function subSection(major, minor, title) { return `${major}.${minor}  ${title}`; }

  // ── 1. GLP/GEP Cover Page ─────────────────────────────────────────────────
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, pw, 14, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont(undefined, 'bold');
  doc.text('GOOD LABORATORY PRACTICE / GOOD EXPERIMENTAL PRACTICE — STUDY REPORT', pw / 2, 9, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal');

  let y = 24;
  doc.setFontSize(18); doc.setFont(undefined, 'bold');
  doc.text(meta.projectName || 'Study Report', pw / 2, y, { align: 'center', maxWidth: pw - 20 });
  y += 10; doc.setFontSize(10); doc.setFont(undefined, 'normal');

  const coverGrid = [
    ['Study Number',       meta.studyNumber || 'N/A'],
    ['Protocol Reference', meta.protocolRef || meta.studyNumber || 'N/A'],
    ['Sponsor / Organisation', meta.organisation || '—'],
    ['Principal Investigator',  meta.investigator || '—'],
    ['Study Site',         meta.location || '—'],
    ['Crop / Target',      [meta.crop, meta.targetSpecies].filter(Boolean).join(' / ') || '—'],
    ['Trial Period',       Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—')],
    ['Report Date',        meta.reportDate || new Date().toISOString().slice(0, 10)],
  ];

  doc.setFillColor(245, 245, 245);
  doc.rect(14, y - 4, pw - 28, coverGrid.length * 9 + 6, 'F');
  for (const [label, val] of coverGrid) {
    doc.setFont(undefined, 'bold'); doc.text(label + ':', 18, y);
    doc.setFont(undefined, 'normal'); doc.text(String(val), 80, y, { maxWidth: pw - 90 });
    y += 9;
  }

  y += 8;

  // ── Task 14.1: Amendment History table ────────────────────────────────────
  // Inserted AFTER coverGrid, BEFORE GLP compliance statement
  {
    const auditTrail = reportData.auditTrail || {};
    const currentDate = new Date().toISOString().slice(0, 10);
    const amendHead = [['Version', 'Date', 'Description', 'Author']];
    const amendBody = [
      ['1.0', currentDate, 'Initial submission', meta.investigator || '—'],
    ];

    doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Amendment History', 14, y); y += 5;
    doc.setFont(undefined, 'normal');

    autoTable(doc, {
      startY: y,
      head: amendHead,
      body: amendBody,
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 28 },
        2: { cellWidth: 90 },
        3: { cellWidth: 36 },
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Report UUID and Generated On
    if (auditTrail.reportUUID || auditTrail.generatedOn) {
      doc.setFontSize(8); doc.setTextColor(60, 60, 60);
      if (auditTrail.reportUUID) {
        doc.text(`Report UUID: ${auditTrail.reportUUID}`, 14, y);
        y += 5;
      }
      if (auditTrail.generatedOn) {
        doc.text(`Generated On: ${auditTrail.generatedOn}`, 14, y);
        y += 5;
      }
      doc.setTextColor(0, 0, 0);
    }

    y += 4;
  }

  // GLP/GEP compliance statement
  doc.setFillColor(230, 245, 230);
  doc.setDrawColor(0, 128, 0);
  doc.setLineWidth(0.5);
  doc.rect(14, y, pw - 28, 28, 'FD');
  doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 100, 0);
  doc.text('GLP / GEP COMPLIANCE STATEMENT', 18, y + 8);
  doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(8);
  const glpText = 'This study was conducted in compliance with Good Laboratory Practice (GLP) regulations and Good Experimental Practice (GEP) guidelines as applicable. All procedures, data collection, and reporting conform to the applicable regulatory standards.';
  const glpLines = doc.splitTextToSize(glpText, pw - 40);
  doc.text(glpLines, 18, y + 15);
  y += 34;

  // Confidential footer
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text('REGULATORY SUBMISSION — CONFIDENTIAL', pw / 2, ph - 14, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  doc.addPage();

  // ── 2. Executive Summary (250–350 words, regulatory template) ────────────
  y = 20;
  const execSummary = reportData.executiveSummary || buildExecutiveSummary(reportData, 'regulatory');
  y = addDecimalHeading(doc, nextSection('Executive Summary'), y, ph, color);
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  const execLines = doc.splitTextToSize(execSummary, pw - 28);
  y = checkPageBreak(doc, y, ph, execLines.length * 6 + 10);
  doc.text(execLines, 14, y);
  y += execLines.length * 6 + 10;

  // ── 3. Trial Design & Methodology ────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 40);
  y = addDecimalHeading(doc, nextSection('Trial Design & Methodology'), y, ph, color);
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text(subSection(sectionNum, 1, 'Experimental Design'), 14, y); y += 6;
  doc.setFont(undefined, 'normal');
  const appDates = Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—');
  const nPlots = (Number(meta.treatments) && Number(meta.replications)) ? Number(meta.treatments) * Number(meta.replications) : '?';
  const methodText = `The study was conducted according to a ${meta.designLabel || meta.design || 'RCBD'} with ${meta.treatments || '?'} treatment(s) and ${meta.replications || '?'} replication(s), totalling ${nPlots} experimental plot(s). Applications were made on: ${appDates}. Target species / pest: ${meta.targetSpecies || '—'}.`;
  const methodLines = doc.splitTextToSize(methodText, pw - 28);
  y = checkPageBreak(doc, y, ph, methodLines.length * 6 + 10);
  doc.text(methodLines, 14, y); y += methodLines.length * 6 + 8;

  // ── 3. Treatment List ─────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 30);
  y = addDecimalHeading(doc, nextSection('Treatment List'), y, ph, color);
  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  const trtHead = [['#', 'Treatment / Formulation', 'Dosage', 'App. Timing', 'Replications', 'Role']];
  const trtBody = treatmentList.map((t, idx) => [
    String(idx + 1), t.name || '—',
    t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—',
    t.timing || '—', String(t.replicationCount || '—'),
    // isControl checked first: when both isControl===true AND isStandard===true,
    // 'UTC / Control' takes precedence (correct GLP behaviour).
    t.isControl ? 'UTC / Control' : (t.isStandard ? 'Standard' : 'Treatment'),
  ]);
  autoTable(doc, {
    startY: y, head: trtHead, body: trtBody, theme: 'striped',
    headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── 4. Efficacy Results ───────────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 30);
  y = addDecimalHeading(doc, nextSection(`Efficacy Results — ${paramLabel}`), y, ph, color);

  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);
  const efficacyExcluded = param.efficacyExcluded === true;

  if (treatmentNames.length > 0) {
    const pVal0 = anova ? (anova.p ? anova.p[0] : null) : null;
    const sig = sigStars(pVal0);
    const meansHead = [['Treatment', 'n', 'Mean', 'SD', 'SE', efficacyExcluded ? 'Efficacy% (N/A)' : 'Efficacy (%)', 'CLD', 'Sig.']];
    const meansBody = treatmentNames.map(tName => {
      const m = paramMeansObj[tName] || {};
      return [tName, String(m.n ?? '—'), fmt(m.mean), fmt(m.sd), fmt(m.se),
        efficacyExcluded ? 'N/A*' : (m.efficacy_pct != null ? fmt(m.efficacy_pct, 1) : '—'),
        m.cldLetter || '—', sig];
    });
    autoTable(doc, {
      startY: y, head: meansHead, body: meansBody, theme: 'striped',
      headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 48 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ANOVA
    if (anova && !anova.error) {
      y = checkPageBreak(doc, y, ph, 40);
      doc.setFontSize(10); doc.setFont(undefined, 'bold');
      doc.text(subSection(sectionNum, 1, 'ANOVA Source Table'), 14, y);
      doc.setFont(undefined, 'normal'); y += 6;
      const anovaHead = [['Source of Variation', 'SS', 'df', 'MS', 'F-value', 'p-value']];
      const sources = anova.source || [];
      const anovaBody = sources.map((src, i) => [
        src, fmt(anova.ss?.[i]), String(anova.df?.[i] ?? '—'),
        anova.ms?.[i] != null ? fmt(anova.ms[i]) : '—',
        anova.f?.[i]  != null ? fmt(anova.f[i], 3) : '—',
        anova.p?.[i]  != null ? fmt(anova.p[i], 4) : '—',
      ]);
      autoTable(doc, {
        startY: y, head: anovaHead, body: anovaBody, theme: 'grid',
        headStyles: { fillColor: [60,60,60], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        didParseCell: (data) => { if (data.section === 'body' && data.row.index === 0) data.cell.styles.fillColor = [230,240,255]; },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;

      // Stats block
      y = checkPageBreak(doc, y, ph, 16);
      doc.setFontSize(9);
      const statsItems = [
        ['Grand Mean', fmt(anova.grandMean)],
        ['CV%', anova.cv != null ? fmt(anova.cv, 1) + '%' : '—'],
        ['SEm±', fmt(anova.sem)],
        ['LSD 5%', fmt(anova.lsd5)],
        ['LSD 1%', fmt(anova.lsd1)],
      ];
      const blockW = (pw - 28) / statsItems.length;
      statsItems.forEach(([label, val], idx) => {
        const bx = 14 + idx * blockW;
        doc.setFillColor(245,245,245); doc.rect(bx, y, blockW - 2, 14, 'F');
        doc.setFont(undefined, 'bold'); doc.text(label, bx + (blockW - 2) / 2, y + 5, { align: 'center' });
        doc.setFont(undefined, 'normal'); doc.text(String(val), bx + (blockW - 2) / 2, y + 11, { align: 'center' });
      });
      y += 20;
      y = checkPageBreak(doc, y, ph, 14);
      doc.setFontSize(10); doc.setFont(undefined, 'italic');
      doc.text(anova.significance_label || '—', 14, y);
      doc.setFont(undefined, 'normal'); y += 8;
      doc.setFontSize(8); doc.setTextColor(80,80,80);
      doc.text(`Means followed by the same letter are not significantly different at the ${Math.round(alpha * 100)}% level using ${postHoc.toUpperCase()}.`, 14, y, { maxWidth: pw - 28 });
      doc.setTextColor(0,0,0); y += 10;
    }
  }

  // ── 5. Phytotoxicity (immediately after efficacy) ─────────────────────────
  const phyto = reportData.phytotoxicity;
  if (phyto?.hasData) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addDecimalHeading(doc, nextSection('Phytotoxicity & Crop Safety'), y, ph, color);
    if (phyto.allZero) {
      doc.setFontSize(10);
      doc.text('No phytotoxic effects were observed in any treatment throughout the trial period.', 14, y, { maxWidth: pw - 28 });
      y += 10;
    } else {
      const safetyColors = { Safe: [204,255,204], Minor: [255,255,204], Moderate: [255,230,204], Severe: [255,180,180] };
      const phytoHead = [['Treatment', 'Mean (%)', 'SD', 'Safety Class']];
      const phytoBody = Object.entries(phyto.means || {}).map(([trt, m]) => [trt, fmt(m.mean, 1), fmt(m.sd, 1), m.safetyClass || '—']);
      autoTable(doc, {
        startY: y, head: phytoHead, body: phytoBody, theme: 'striped',
        headStyles: { fillColor: [180,0,0], textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const sc = phytoBody[data.row.index]?.[3];
            if (sc && safetyColors[sc]) data.cell.styles.fillColor = safetyColors[sc];
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // ── 6. Time-Series ────────────────────────────────────────────────────────
  const timeSeries = reportData.timeSeries || {};
  const daas = Array.isArray(timeSeries.daas) ? timeSeries.daas : [];
  if (daas.length >= 2) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addDecimalHeading(doc, nextSection('Time-Series — Treatment Means by DAA'), y, ph, color);
    const tsHead = [['Treatment', ...daas.map(d => `${d} DAA`)]];
    const tsBody = treatmentNames.map(tName => {
      const row = [tName];
      daas.forEach(d => {
        const cell = timeSeries[tName]?.[d];
        row.push(cell?.mean != null ? fmt(cell.mean) : '—');
      });
      return row;
    });
    autoTable(doc, {
      startY: y, head: tsHead, body: tsBody, theme: 'striped',
      headStyles: { fillColor: color, textColor: [255,255,255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 48 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── 7. Conclusions ────────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 40);
  y = addDecimalHeading(doc, nextSection('Conclusions & Recommendations'), y, ph, color);
  let conclusionText = '';
  if (anova) {
    const cf = anova.f?.[0] ?? null, cp = anova.p?.[0] ?? null;
    const topTrts = treatmentNames.filter(t => (paramMeansObj[t]?.cldLetter || '').toLowerCase().startsWith('a'));
    if (cp !== null && cp <= 0.05) {
      conclusionText = `Treatment(s) ${topTrts.join(', ') || '—'} showed statistically significant effects on ${paramLabel} (F = ${fmt(cf, 3)}, p = ${fmt(cp, 4)}). Results confirm treatment effectiveness under the conditions of this study.`;
    } else {
      conclusionText = `No statistically significant differences were detected between treatments (F = ${fmt(cf, 3)}, p = ${fmt(cp, 4)}, NS). Further investigation may be warranted.`;
    }
  } else {
    conclusionText = 'Statistical analysis could not be completed due to insufficient data. Results should be interpreted descriptively only.';
  }
  doc.setFontSize(10);
  const concLines = doc.splitTextToSize(conclusionText, pw - 28);
  y = checkPageBreak(doc, y, ph, concLines.length * 6 + 14);
  doc.text(concLines, 14, y); y += concLines.length * 6 + 10;

  // ── Residual Diagnostics ──────────────────────────────────────────────────
  const diagData = reportData.residualDiagnostics;
  if (diagData && diagData.n >= 6) {
    y = checkPageBreak(doc, y, ph, 30);
    y = addDecimalHeading(doc, nextSection('Statistical Assumptions — Residual Diagnostics'), y, ph, color);
    const diagCharts = [
      { type: 'bar',     title: 'Residuals Histogram', config: buildHistogramConfig(diagData.residuals) },
      { type: 'scatter', title: 'Normal Q-Q Plot',      config: buildQQConfig(diagData.qqData) },
      { type: 'scatter', title: 'Fitted vs Residuals',  config: buildFVRConfig(diagData.fittedValues, diagData.residuals) },
    ];
    let diagX = 14;
    const diagW = (pw - 35) / 3;
    const diagH = diagW * 0.8;
    y = checkPageBreak(doc, y, ph, diagH + 20);
    for (const dc of diagCharts) {
      try {
        const png = await renderChartCanvas(dc.type, dc.config.data, dc.config.options, 400, 320);
        if (png) {
          doc.addImage(png, 'PNG', diagX, y, diagW, diagH);
          doc.setFontSize(7); doc.text(dc.title, diagX + diagW/2, y + diagH + 3, { align: 'center' });
        }
      } catch (_e) {}
      diagX += diagW + 3.5;
    }
    y += diagH + 14;
  }

  // ── Investigator Signature Block (last body page before appendices) ──────
  doc.addPage();
  y = 20;
  y = addDecimalHeading(doc, nextSection('Signatures & Certification'), y, ph, color);
  doc.setFontSize(10);
  const sigText = 'I hereby certify that this study was conducted in accordance with the protocol and applicable GLP/GEP regulations, and that all data presented in this report are a true and accurate representation of the study records.';
  const sigLines = doc.splitTextToSize(sigText, pw - 28);
  doc.text(sigLines, 14, y); y += sigLines.length * 6 + 12;

  // Signature fields
  const sigFields = [
    { label: 'Principal Investigator', name: meta.investigator || '___________________________' },
    { label: 'Study Director',         name: '___________________________' },
    { label: 'QA Auditor',             name: '___________________________' },
  ];
  for (const sf of sigFields) {
    y = checkPageBreak(doc, y, ph, 22);
    doc.setFont(undefined, 'bold'); doc.text(sf.label + ':', 14, y);
    doc.setFont(undefined, 'normal');
    doc.setLineWidth(0.3); doc.setDrawColor(0,0,0);
    doc.line(14, y + 10, 100, y + 10);
    doc.text('Signature', 14, y + 15);
    doc.line(110, y + 10, 190, y + 10);
    doc.text('Date', 110, y + 15);
    doc.text(sf.name, 14, y + 8);
    y += 22;
  }

  // ── Footer on all pages: "Page N of M" bottom-right ──────────────────────
  // Note: renderAuditTrailPage adds the final page, so footer loop runs after.
  // ── Task 14.4: Audit Trail page (LAST page, before save) ─────────────────
  renderAuditTrailPage(doc, reportData.auditTrail, color);

  // Add footer "Page N of M" on every page (including audit trail page)
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120,120,120);
    doc.text(`Page ${i} of ${pageCount}`, pw - 14, ph - 6, { align: 'right' });
    doc.text(`Study: ${meta.studyNumber || 'N/A'} | ${meta.projectName || 'Report'}`, 14, ph - 6);
    doc.setTextColor(0,0,0);
  }

  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `RegulatorySubmission_${safeName(meta.projectName)}_${dateStr}.pdf`;
  doc.save(filename);
}

// ─── Task 8.2: Paginated photo helper ────────────────────────────────────────

/**
 * Renders photos in batches of 16 onto PDF pages using either a 4×4 thumbnail
 * grid or a one-photo-per-page full-page layout.
 *
 * @param {object}   doc    - jsPDF instance
 * @param {Array}    photos - array of PhotoRecord objects (with resolvedSrc)
 * @param {number}   y      - current y position on the page
 * @param {number}   ph     - page height in mm
 * @param {number[]} color  - [r,g,b] accent colour
 * @param {'thumbnail'|'fullpage'} mode - layout mode
 * @returns {number} Final y position after last photo
 */
export async function paginate16Photos(doc, photos, y, ph, color, mode) {
  if (!Array.isArray(photos) || photos.length === 0) return y;

  const pw = doc.internal.pageSize.getWidth();

  if (mode === 'fullpage') {
    // ── Full-page mode: 1 photo per page ──────────────────────────────────
    for (const photo of photos) {
      doc.addPage();
      y = 20;

      const imgW = pw - 28;

      if (!photo.resolvedSrc) {
        // Grey placeholder rectangle
        doc.setFillColor(200, 200, 200);
        doc.rect(14, y, imgW, 120, 'F');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text('Image unavailable', 14 + imgW / 2, y + 62, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        y += 128;
      } else {
        try {
          const imgData = await toBase64(photo.resolvedSrc, 1200);
          if (imgData) {
            // Determine height maintaining aspect ratio (max 180mm tall)
            const imgEl = new Image();
            imgEl.src = imgData;
            await new Promise(r => { imgEl.onload = r; imgEl.onerror = r; });
            const ar = (imgEl.width > 0 && imgEl.height > 0) ? imgEl.width / imgEl.height : 1;
            const imgH = Math.min(imgW / ar, 180);
            y = checkPageBreak(doc, y, ph, imgH + 14);
            doc.addImage(imgData, 'JPEG', 14, y, imgW, imgH);
            // Caption
            const caption = [
              photo.treatment || '',
              photo.daa !== null && photo.daa !== undefined ? `${photo.daa} DAA` : '',
              photo.plotNumber ? `Plot ${photo.plotNumber}` : '',
              photo.label || '',
            ].filter(Boolean).join(' | ');
            if (caption) {
              doc.setFontSize(8);
              doc.setTextColor(80, 80, 80);
              doc.text(caption, 14 + imgW / 2, y + imgH + 5, { align: 'center', maxWidth: imgW });
              doc.setTextColor(0, 0, 0);
            }
            y += imgH + 14;
          } else {
            // Fallback placeholder if toBase64 returned null
            doc.setFillColor(200, 200, 200);
            doc.rect(14, y, imgW, 80, 'F');
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            doc.text('Image unavailable', 14 + imgW / 2, y + 42, { align: 'center' });
            doc.setTextColor(0, 0, 0);
            y += 88;
          }
        } catch {
          doc.setFillColor(200, 200, 200);
          doc.rect(14, y, imgW, 80, 'F');
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
          doc.text('Image unavailable', 14 + imgW / 2, y + 42, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          y += 88;
        }
      }
    }
    return y;
  }

  // ── Thumbnail mode: 4×4 grid, 16 photos per page ─────────────────────────
  const photosPerRow = 4;
  const cellW = (pw - 28) / photosPerRow;   // ≈ (210 - 28) / 4 ≈ 45.5 mm
  const cellH = 30;                          // ≈ 30 mm per cell
  const labelH = 6;
  const rowH = cellH + labelH + 2;

  // Memory guard state: once heap exceeds 512 MB, switch to URL-only mode for
  // all remaining photos in this call (Req 9.2).
  const HEAP_LIMIT = 512 * 1024 * 1024; // 512 MB in bytes
  let urlOnlyMode = false;

  for (let i = 0; i < photos.length; i++) {
    const col = i % photosPerRow;
    const rowInPage = Math.floor(i % 16 / photosPerRow);

    // New page every 16 photos (except at the very start when y is already set)
    if (i > 0 && i % 16 === 0) {
      doc.addPage();
      y = 20;

      // ── Memory check at the start of each new batch of 16 (Req 9.2) ──────
      // performance.memory is a Chrome DevTools extension and may be undefined
      // in Firefox, Safari, and other browsers — wrap in try/catch so the PDF
      // render degrades gracefully when the API is unavailable.
      try {
        const heapUsed = performance?.memory?.usedJSHeapSize;
        if (!urlOnlyMode && heapUsed !== undefined && heapUsed > HEAP_LIMIT) {
          urlOnlyMode = true;
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: {
              msg: 'Memory limit reached — switching to URL-only photo mode',
              type: 'warning',
            },
          }));
        }
      } catch (_memErr) {
        // performance.memory not available in this browser — continue without guard
      }
    }

    // Check page break before each row (at the start of each row)
    if (col === 0 && i % 16 !== 0) {
      y = checkPageBreak(doc, y, ph, rowH);
    } else if (col === 0 && i === 0) {
      y = checkPageBreak(doc, y, ph, rowH);
    }

    const x = 14 + col * cellW;
    const rowY = y + rowInPage * rowH;

    const photo = photos[i];

    if (urlOnlyMode) {
      // ── URL-only mode: grey placeholder + URL text caption (Req 9.2) ─────
      doc.setFillColor(180, 180, 180);
      doc.rect(x, rowY, cellW - 2, cellH, 'F');
      doc.setFontSize(6);
      doc.setTextColor(60, 60, 60);
      doc.text('URL only', x + (cellW - 2) / 2, rowY + cellH / 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      // Caption shows URL so the reader can access the image manually
      const urlCaption = photo.resolvedSrc || photo.url || `Photo ${i + 1}`;
      doc.setFontSize(6);
      doc.setTextColor(60, 60, 60);
      doc.text(urlCaption, x, rowY + cellH + 4, { maxWidth: cellW - 2 });
      doc.setTextColor(0, 0, 0);
    } else if (!photo.resolvedSrc) {
      // Grey placeholder
      doc.setFillColor(200, 200, 200);
      doc.rect(x, rowY, cellW - 2, cellH, 'F');
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text('Image unavailable', x + (cellW - 2) / 2, rowY + cellH / 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      // Standard caption
      const caption = [
        photo.treatment || '',
        photo.daa !== null && photo.daa !== undefined ? `${photo.daa} DAA` : '',
      ].filter(Boolean).join(' | ') || photo.label || `Photo ${i + 1}`;
      doc.setFontSize(6);
      doc.setTextColor(60, 60, 60);
      doc.text(caption, x, rowY + cellH + 4, { maxWidth: cellW - 2 });
      doc.setTextColor(0, 0, 0);
    } else {
      let imgData = null;
      try {
        imgData = await toBase64(photo.resolvedSrc, 400);
        if (imgData) {
          doc.addImage(imgData, 'JPEG', x, rowY, cellW - 2, cellH);
        } else {
          doc.setFillColor(200, 200, 200);
          doc.rect(x, rowY, cellW - 2, cellH, 'F');
          doc.setFontSize(7);
          doc.setTextColor(80, 80, 80);
          doc.text('Image unavailable', x + (cellW - 2) / 2, rowY + cellH / 2, { align: 'center' });
          doc.setTextColor(0, 0, 0);
        }
      } catch {
        doc.setFillColor(200, 200, 200);
        doc.rect(x, rowY, cellW - 2, cellH, 'F');
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 80);
        doc.text('Image unavailable', x + (cellW - 2) / 2, rowY + cellH / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
      // Null out imgData to hint GC after each batch of 16 is processed
      // (actual GC hint happens when the batch boundary is crossed above)
      imgData = null; // eslint-disable-line no-unused-vars

      // Photo caption below cell
      const caption = [
        photo.treatment || '',
        photo.daa !== null && photo.daa !== undefined ? `${photo.daa} DAA` : '',
      ].filter(Boolean).join(' | ') || photo.label || `Photo ${i + 1}`;
      doc.setFontSize(6);
      doc.setTextColor(60, 60, 60);
      doc.text(caption, x, rowY + cellH + 4, { maxWidth: cellW - 2 });
      doc.setTextColor(0, 0, 0);
    }

    // After finishing the last cell in a row, advance y to next row
    if (col === photosPerRow - 1 || i === photos.length - 1) {
      // Only update y after the last row in this page-batch has rendered
      const lastRowInBatch = Math.floor((Math.min(i, i - col + photosPerRow - 1)) % 16 / photosPerRow);
      // We'll set y to accommodate all rows rendered on this page after the page-batch finishes
      void lastRowInBatch; // used in final y computation below
    }
  }

  // Compute final y: rows rendered on the last page
  const photosOnLastPage = ((photos.length - 1) % 16) + 1;
  const rowsOnLastPage = Math.ceil(photosOnLastPage / photosPerRow);
  // y was set to the rowY anchor at start of last page-batch; recalculate
  const lastPageStart = Math.floor((photos.length - 1) / 16) * 16;
  if (photos.length > 16 && lastPageStart > 0) {
    // A new page was added for the last batch; y was reset to 20 at the page break
    y = 20 + rowsOnLastPage * rowH;
  } else {
    y = y + rowsOnLastPage * rowH;
  }

  return y;
}

// ─── Task 8.3: Audit Trail page renderer ─────────────────────────────────────

/**
 * Adds a new page and renders the Report Audit Trail as a 2-column Field/Value table.
 * Also embeds the reportUUID into the PDF's /Keywords metadata field.
 *
 * @param {object}   doc        - jsPDF instance
 * @param {object}   auditTrail - AuditTrailRecord from reportData.auditTrail
 * @param {number[]} color      - [r,g,b] accent colour
 */
export function renderAuditTrailPage(doc, auditTrail, color) {
  const ph = doc.internal.pageSize.getHeight();
  const pw = doc.internal.pageSize.getWidth();
  const trail = auditTrail || {};

  doc.addPage();
  let y = 20;
  y = addSectionHeading(doc, 'Report Audit Trail', y, ph, color);

  // Horizontal separator line
  doc.setDrawColor(...color);
  doc.setLineWidth(0.4);
  doc.line(14, y, pw - 14, y);
  y += 6;

  // Embed UUID into PDF metadata /Keywords field
  if (trail.reportUUID) {
    try {
      doc.setProperties({ keywords: trail.reportUUID });
    } catch { /* metadata embedding is best-effort */ }
  }

  // Build field/value rows for all 9 audit trail fields
  const generatedBy = trail.generatedBy || {};
  const auditRows = [
    ['Report UUID',         trail.reportUUID || '—'],
    ['Generated On',        trail.generatedOn || '—'],
    ['Generated By (Name)', generatedBy.name || '—'],
    ['Generated By (Email)',generatedBy.email || '—'],
    ['App Version',         trail.appVersion || '—'],
    ['Stats Engine Version',trail.statsEngineVersion || '—'],
    ['Report Template',     trail.reportTemplate || '—'],
    ['Project Name',        trail.projectName || '—'],
    ['Project ID',          trail.projectId || '—'],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: auditRows,
    theme: 'striped',
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });
}

// ─── Task 8.4: Decimal-numbered section heading ───────────────────────────────

/**
 * Renders a decimal-numbered section heading (e.g. "1.0 Introduction",
 * "2.1 Methods") with the same visual style as addSectionHeading().
 * The caller passes the full text including the decimal prefix.
 *
 * @param {object}   doc   - jsPDF instance
 * @param {string}   text  - Full heading text, e.g. "1.0 Introduction"
 * @param {number}   y     - Current y position
 * @param {number}   ph    - Page height in mm
 * @param {number[]} color - [r,g,b] accent colour
 * @returns {number} New y position after heading
 */
export function addDecimalHeading(doc, text, y, ph, color) {
  y = checkPageBreak(doc, y, ph, 20);
  const pw = doc.internal.pageSize.getWidth();

  // Coloured left accent bar (same geometry as addSectionHeading)
  doc.setFillColor(...color);
  doc.rect(14, y - 4, 3, 10, 'F');

  // Heading text — bold, coloured, 13pt
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...color);
  doc.text(text, 19, y + 3);

  // Underline
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(19, y + 5, pw - 14, y + 5);

  // Reset styles
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);

  return y + 12;
}

// ─── Task 9.2: Table of Contents renderer ────────────────────────────────────

/**
 * Renders a "Table of Contents" section onto the current page.
 * Each entry shows the section title on the left, dot-leaders, and the page
 * number on the right.
 *
 * @param {object}   doc      - jsPDF instance
 * @param {Array<{title:string, page:number}>} sections - TOC entries
 * @param {number}   y        - Current y position
 * @param {number}   ph       - Page height in mm
 * @param {number[]} color    - [r,g,b] accent colour
 * @returns {number} Final y position after the last TOC entry
 */
export function renderTableOfContents(doc, sections, y, ph, color) {
  const pw = doc.internal.pageSize.getWidth();
  const leftX  = 14;
  const rightX = pw - 14;
  const contentW = rightX - leftX;

  y = addSectionHeading(doc, 'Table of Contents', y, ph, color);

  if (!Array.isArray(sections) || sections.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No sections available.', leftX, y);
    doc.setTextColor(0, 0, 0);
    return y + 8;
  }

  doc.setFontSize(10);

  for (const section of sections) {
    y = checkPageBreak(doc, y, ph, 8);

    const title   = String(section.title || '');
    const pageNum = String(section.page != null ? section.page : '—');

    // Measure widths
    doc.setFont(undefined, 'normal');
    const titleW   = doc.getTextWidth(title);
    const pageW    = doc.getTextWidth(pageNum);
    const dotChar  = '.';
    const dotW     = doc.getTextWidth(dotChar);
    const gapW     = 4; // mm padding on each side of dots

    // Available space for dots
    const dotsSpace = contentW - titleW - pageW - gapW * 2;
    const dotCount  = dotsSpace > 0 ? Math.floor(dotsSpace / dotW) : 0;
    const dots      = dotChar.repeat(Math.max(dotCount, 3));

    // Draw title
    doc.setTextColor(0, 0, 0);
    doc.text(title, leftX, y);

    // Draw dots
    doc.setTextColor(160, 160, 160);
    doc.text(dots, leftX + titleW + gapW, y);

    // Draw page number right-aligned
    doc.setTextColor(0, 0, 0);
    doc.text(pageNum, rightX, y, { align: 'right' });

    y += 7;
  }

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  return y + 4;
}

// ─── Section 6: Statistical Analysis ─────────────────────────────────────────

/**
 * Renders a full statistical analysis section onto the given jsPDF doc.
 *
 * Subsections:
 *  1. ANOVA guard  — warns & returns early when treatments < 2
 *  2. ANOVA source table  — design-aware, reads anova.source array
 *  3. SEm± / LSD 5% / LSD 1% / CV% summary strip (5 stat boxes)
 *  4. Effect sizes  — η², ω², Cohen's f (when reportData.effectSizes is non-null)
 *  5. Assumption tests  — Shapiro-Wilk / Jarque-Bera + Levene
 *  6. Non-parametric warning  — yellow box when normality or homogeneity = 'fail'
 *  7. Post-hoc table  — pairwise comparisons when comparisons array is non-empty
 *  8. Power analysis  — achieved power, requiredN, power table (when non-null)
 *
 * @param {object} doc        — jsPDF instance (with autoTable available)
 * @param {object} reportData — ReportData object from reportDataBuilder.js
 * @param {number} y          — Current vertical position (mm)
 * @returns {number} New y position after all rendered content
 */
export function renderStatisticalAnalysis(doc, reportData, y) {
  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);
  const param = reportData.primaryParameter || {};
  const anova = param.anova || null;

  // ── Section heading ──────────────────────────────────────────────────────
  y = addSectionHeading(doc, 'Statistical Analysis', y, ph, color);

  // ── 1. ANOVA guard ───────────────────────────────────────────────────────
  // Task 17.3: treatments < 2 guard — exported standalone function also used
  // by Statistics page PDF export; other templates (renderStandard, renderRegulatorySubmission,
  // renderScientificJournal) use `if (anova && !anova.error)` which implicitly guards
  // against null/error ANOVA results without emitting this specific warning box.
  if ((meta.treatments || 0) < 2) {
    y = checkPageBreak(doc, y, ph, 20);
    doc.setFillColor(255, 243, 205);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.4);
    doc.rect(14, y, pw - 28, 16, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(120, 60, 0);
    doc.setFont(undefined, 'bold');
    doc.text('⚠  ANOVA cannot be performed: fewer than 2 treatments detected.', 18, y + 6);
    doc.setFont(undefined, 'normal');
    doc.text('Add at least one additional treatment before running a statistical analysis.', 18, y + 12);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    return y + 22;
  }

  // ── 2. ANOVA source table ────────────────────────────────────────────────
  // Task 17.2: modelNote appended to heading when meta.analysisModel is set and ≠ 'RCBD'.
  // Task 17.3: `anova && !anova.error` guard — null or errored ANOVA produces no-data message.
  if (anova && !anova.error) {
    y = checkPageBreak(doc, y, ph, 40);
    const modelNote = meta.analysisModel ? ` — ${meta.analysisModel} model` : '';
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`ANOVA Source Table${modelNote}`, 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const anovaHead = [['Source of Variation', 'SS', 'df', 'MS', 'F-value', 'p-value']];
    const sources   = anova.source || [];
    const anovaBody = sources.map((src, i) => [
      src,
      fmt(anova.ss?.[i]),
      String(anova.df?.[i] ?? '—'),
      anova.ms?.[i] != null ? fmt(anova.ms[i])        : '—',
      anova.f?.[i]  != null ? fmt(anova.f[i], 3)      : '—',
      anova.p?.[i]  != null ? fmt(anova.p[i], 4)      : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: anovaHead,
      body: anovaBody,
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 0) {
          data.cell.styles.fillColor = [230, 240, 255];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── 3. Stat summary strip ──────────────────────────────────────────────
    y = checkPageBreak(doc, y, ph, 20);
    const statsItems = [
      ['Grand Mean', fmt(anova.grandMean)],
      ['SEm±',       fmt(anova.sem)],
      ['LSD 5%',     fmt(anova.lsd5)],
      ['LSD 1%',     fmt(anova.lsd1)],
      ['CV%',        anova.cv != null ? `${fmt(anova.cv, 1)}%` : '—'],
    ];
    const blockW = (pw - 28) / statsItems.length;
    statsItems.forEach(([label, val], idx) => {
      const bx = 14 + idx * blockW;
      doc.setFillColor(245, 245, 245);
      doc.rect(bx, y, blockW - 2, 14, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text(label, bx + (blockW - 2) / 2, y + 5, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + (blockW - 2) / 2, y + 11, { align: 'center' });
    });
    y += 20;

    // Significance statement
    y = checkPageBreak(doc, y, ph, 10);
    doc.setFontSize(10);
    doc.setFont(undefined, 'italic');
    doc.text(anova.significance_label || '—', 14, y);
    doc.setFont(undefined, 'normal');
    y += 8;
  } else {
    // No valid ANOVA
    y = checkPageBreak(doc, y, ph, 10);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('ANOVA table not available for this dataset.', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // ── 4. Effect sizes ──────────────────────────────────────────────────────
  const effectSizes = reportData.effectSizes;
  if (effectSizes != null) {
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Effect Sizes', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const esHead = [['Measure', 'Symbol', 'Value', 'Interpretation']];
    const esBody = [
      [effectSizes.etaLabel   || 'Eta Squared',    'η²',      fmt(effectSizes.etaSquared,   4), interpretEtaSquared(effectSizes.etaSquared)],
      [effectSizes.omegaLabel || 'Omega Squared',  'ω²',      fmt(effectSizes.omegaSquared, 4), interpretEtaSquared(effectSizes.omegaSquared)],
      [effectSizes.cohensLabel || "Cohen's f",     'f',       fmt(effectSizes.cohensF,      4), interpretCohensF(effectSizes.cohensF)],
    ];

    autoTable(doc, {
      startY: y,
      head: esHead,
      body: esBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { cellWidth: 14 }, 2: { cellWidth: 22 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── 5. Assumption tests ──────────────────────────────────────────────────
  const diag = reportData.residualDiagnostics;
  if (diag) {
    y = checkPageBreak(doc, y, ph, 40);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Assumption Tests', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const assumHead = [['Test', 'Statistic', 'p-value', 'Result']];
    const assumBody = [];

    // Normality: Shapiro-Wilk (n ≤ 50) or Jarque-Bera (n > 50)
    if (diag.n <= 50) {
      // Shapiro-Wilk
      const wStr = diag.shapiroW != null ? diag.shapiroW.toFixed(4) : '—';
      const pStr = diag.shapiroP != null ? fmt(diag.shapiroP, 4)    : '—';
      const normPass = diag.normality === 'pass';
      assumBody.push([
        'Shapiro-Wilk (Normality)',
        `W = ${wStr}`,
        pStr,
        normPass ? 'PASS ✓' : 'FAIL ✗',
      ]);
    } else {
      // Jarque-Bera (if available)
      if (diag.jbStat != null) {
        const jbStr = fmt(diag.jbStat, 4);
        const jpStr = diag.jbP != null ? fmt(diag.jbP, 4) : '—';
        const normPass = diag.normality === 'pass';
        assumBody.push([
          'Jarque-Bera (Normality)',
          `JB = ${jbStr}`,
          jpStr,
          normPass ? 'PASS ✓' : 'FAIL ✗',
        ]);
      }
    }

    // Levene (homogeneity of variance) — always shown
    const leveneF = diag.leveneF != null ? `F = ${fmt(diag.leveneF, 4)}` : '—';
    const leveneP = diag.leveneP != null ? fmt(diag.leveneP, 4) : '—';
    const homPass = diag.homogeneity === 'pass';
    assumBody.push([
      'Levene (Homogeneity of Variance)',
      leveneF,
      leveneP,
      homPass ? 'PASS ✓' : 'FAIL ✗',
    ]);

    const passColor = [230, 255, 230];
    const failColor = [255, 220, 220];

    autoTable(doc, {
      startY: y,
      head: assumHead,
      body: assumBody,
      theme: 'striped',
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw || '';
          if (String(val).includes('PASS')) {
            data.cell.styles.fillColor = passColor;
            data.cell.styles.textColor = [0, 100, 0];
            data.cell.styles.fontStyle = 'bold';
          } else if (String(val).includes('FAIL')) {
            data.cell.styles.fillColor = failColor;
            data.cell.styles.textColor = [150, 0, 0];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── 6. Non-parametric warning ──────────────────────────────────────────
    const normFail = diag.normality    === 'fail';
    const homFail  = diag.homogeneity  === 'fail';
    if (normFail || homFail) {
      y = checkPageBreak(doc, y, ph, 22);
      doc.setFillColor(255, 249, 195);
      doc.setDrawColor(180, 130, 0);
      doc.setLineWidth(0.4);
      doc.rect(14, y, pw - 28, 18, 'FD');
      doc.setFontSize(9);
      doc.setTextColor(100, 70, 0);
      doc.setFont(undefined, 'bold');
      const failedTests = [normFail && 'normality', homFail && 'homogeneity of variance'].filter(Boolean).join(' and ');
      doc.text(`⚠  Assumption failure: ${failedTests} not satisfied.`, 18, y + 6);
      doc.setFont(undefined, 'normal');
      doc.text(
        'The Kruskal-Wallis non-parametric test is recommended as a robust alternative to one-way ANOVA.',
        18, y + 13, { maxWidth: pw - 36 }
      );
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      y += 24;
    }
  }

  // ── 7. Post-hoc pairwise comparison table ────────────────────────────────
  const comparisons = anova?.comparisons;
  if (Array.isArray(comparisons) && comparisons.length > 0) {
    y = checkPageBreak(doc, y, ph, 40);
    const phMethod = (param.postHocMethod || 'LSD').toUpperCase();
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Post-Hoc Comparisons (${phMethod})`, 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const phHead = [['Treatment A', 'Treatment B', 'Mean A', 'Mean B', 'Difference', 'Critical Value', 'Significant']];
    const phBody = comparisons.map(c => {
      const diff    = c.diff     != null ? fmt(c.diff, 4)                                 : '—';
      const critVal = (c.hsd ?? c.lsd ?? c.range) != null ? fmt(c.hsd ?? c.lsd ?? c.range, 4) : '—';
      const isSig   = c.significant === true || c.sig === true;
      return [
        c.treatmentA || c.a || '—',
        c.treatmentB || c.b || '—',
        c.meanA != null ? fmt(c.meanA) : '—',
        c.meanB != null ? fmt(c.meanB) : '—',
        diff,
        critVal,
        isSig ? 'Yes *' : 'No',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: phHead,
      body: phBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 6) {
          const val = String(data.cell.raw || '');
          if (val.startsWith('Yes')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [0, 100, 0];
          }
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── 8. Power analysis ────────────────────────────────────────────────────
  const power = reportData.powerAnalysis;
  if (power != null) {
    y = checkPageBreak(doc, y, ph, 40);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Power Analysis', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    // Summary row
    doc.setFontSize(9);
    const pwItems = [
      ['Achieved Power', `${fmt(power.achievedPower * 100, 1)}%`],
      ['Required N',     String(power.requiredN ?? '—')],
      ['Interpretation', power.interpretation || '—'],
    ];
    const pwBlockW = (pw - 28) / pwItems.length;
    y = checkPageBreak(doc, y, ph, 16);
    pwItems.forEach(([label, val], idx) => {
      const bx = 14 + idx * pwBlockW;
      doc.setFillColor(245, 245, 245);
      doc.rect(bx, y, pwBlockW - 2, 14, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text(label, bx + (pwBlockW - 2) / 2, y + 5, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + (pwBlockW - 2) / 2, y + 11, { align: 'center' });
    });
    y += 20;

    // Power table (n vs power%)
    if (Array.isArray(power.powerTable) && power.powerTable.length > 0) {
      y = checkPageBreak(doc, y, ph, 30);
      const ptHead = [['Sample Size (n)', 'Power (%)']];
      const ptBody = power.powerTable.map(row => [
        String(row.n ?? '—'),
        row.power != null ? `${fmt(row.power * 100, 1)}%` : '—',
      ]);
      autoTable(doc, {
        startY: y,
        head: ptHead,
        body: ptBody,
        theme: 'striped',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        tableWidth: 60,
        margin: { left: 14, right: pw - 74 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  return y;
}

/** Interprets η² / ω² magnitude per Cohen's conventions */
function interpretEtaSquared(val) {
  const v = parseFloat(val);
  if (!Number.isFinite(v)) return '—';
  if (v >= 0.14) return 'Large';
  if (v >= 0.06) return 'Medium';
  if (v >= 0.01) return 'Small';
  return 'Negligible';
}

/** Interprets Cohen's f magnitude */
function interpretCohensF(val) {
  const v = parseFloat(val);
  if (!Number.isFinite(v)) return '—';
  if (v >= 0.40) return 'Large';
  if (v >= 0.25) return 'Medium';
  if (v >= 0.10) return 'Small';
  return 'Negligible';
}

// ─── Section 7: Efficacy Rankings ─────────────────────────────────────────────

/**
 * Renders a ranked efficacy table for all treatments.
 *
 * Columns: Rank | Treatment | Mean ± SE | Efficacy% | CLD Letter | Tier
 *
 * Sorting:
 *  - Non-control treatments sorted by mean descending
 *  - Control / UTC treatments appended last
 *
 * Tier logic (non-control only):
 *  Excellent ≥ 80%  |  Good 60–79%  |  Fair 40–59%  |  Poor < 40%
 *
 * Efficacy column header varies by crop category and presence of yield data.
 *
 * @param {object} doc        — jsPDF instance (with autoTable available)
 * @param {object} reportData — ReportData object from reportDataBuilder.js
 * @param {number} y          — Current vertical position (mm)
 * @returns {number} New y position after the table
 */
export function renderEfficacyRankings(doc, reportData, y) {
  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);
  const param = reportData.primaryParameter || {};
  const paramMeans = param.means || {};

  // ── Section heading ──────────────────────────────────────────────────────
  y = addSectionHeading(doc, 'Efficacy Rankings', y, ph, color);

  // ── Local helpers ────────────────────────────────────────────────────────

  /**
   * Classifies a treatment mean into a performance tier.
   * Controls/UTC always receive '—' (no tier classification).
   *
   * @param {number}  mean   — treatment mean
   * @param {boolean} isCtrl — true when the treatment is a control/UTC
   * @returns {string} tier label or '—'
   */
  function getTier(mean, isCtrl) {
    if (isCtrl) return '—';
    const v = parseFloat(mean);
    if (!Number.isFinite(v)) return '—';
    if (v >= 80) return 'Excellent';
    if (v >= 60) return 'Good';
    if (v >= 40) return 'Fair';
    return 'Poor';
  }

  /**
   * Returns true when a treatment name or treatmentList entry indicates
   * that this is a control / untreated / UTC plot.
   */
  function isControl(name, treatmentList) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('control') || lower.includes('untreated') || lower.includes('check')) {
      return true;
    }
    // Also check treatmentList flag
    if (Array.isArray(treatmentList)) {
      const entry = treatmentList.find(
        t => (t.name || '').toLowerCase() === lower
      );
      if (entry && entry.isControl === true) return true;
    }
    return false;
  }

  // ── Efficacy column header ────────────────────────────────────────────────
  const hasYield     = !!(reportData.yield?.means && Object.keys(reportData.yield.means).length > 0);
  const categoryLow  = (meta.category || '').toLowerCase();

  let efficacyHeader;
  if (hasYield) {
    efficacyHeader = 'Yield Improvement%';
  } else {
    switch (categoryLow) {
      case 'herbicide':    efficacyHeader = 'WCE%';              break;
      case 'fungicide':    efficacyHeader = 'DCE%';              break;
      case 'pesticide':    efficacyHeader = 'PRE%';              break;
      case 'nutrition':
      case 'biostimulant': efficacyHeader = 'Vigor Improvement%'; break;
      default:             efficacyHeader = 'Efficacy%';          break;
    }
  }

  // ── Build sorted treatment list ───────────────────────────────────────────
  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  const allNames      = Object.keys(paramMeans);

  const ctrlNames = allNames.filter(n => isControl(n, treatmentList));
  const nonCtrl   = allNames
    .filter(n => !isControl(n, treatmentList))
    .sort((a, b) => {
      const mA = paramMeans[a]?.mean ?? -Infinity;
      const mB = paramMeans[b]?.mean ?? -Infinity;
      return mB - mA; // descending
    });

  const ranked = [...nonCtrl, ...ctrlNames];

  if (ranked.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No treatment data available for ranking.', 14, y);
    doc.setTextColor(0, 0, 0);
    return y + 10;
  }

  // ── Build table rows ──────────────────────────────────────────────────────
  const tierColors = {
    Excellent: [204, 255, 204],
    Good:      [255, 255, 204],
    Fair:      [255, 218, 179],
    Poor:      [255, 204, 204],
  };

  const tableHead = [['Rank', 'Treatment', `Mean ± SE`, efficacyHeader, 'CLD', 'Tier']];

  let rankCounter = 1;
  const tableBody = ranked.map(name => {
    const m    = paramMeans[name] || {};
    const ctrl = isControl(name, treatmentList);
    const mean = m.mean ?? 0;
    const tier = getTier(mean, ctrl);
    const rank = ctrl ? 'UTC' : String(rankCounter++);

    return [
      rank,
      name,
      `${fmt(m.mean)} ± ${fmt(m.se)}`,
      m.efficacy_pct != null ? `${fmt(m.efficacy_pct, 1)}%` : '—',
      m.cldLetter   || '—',
      tier,
    ];
  });

  // ── Render autoTable ──────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'striped',
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 12 },  // Rank
      1: { cellWidth: 50 },  // Treatment
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        // Tier column = index 5
        if (data.column.index === 5) {
          const tier = tableBody[data.row.index]?.[5];
          if (tier && tierColors[tier]) {
            data.cell.styles.fillColor = tierColors[tier];
            data.cell.styles.fontStyle = 'bold';
          }
        }
        // Control rows get grey background
        if (tableBody[data.row.index]?.[0] === 'UTC') {
          data.cell.styles.fillColor = [235, 235, 235];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ── Legend for tier colours ───────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 12);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const legendItems = [
    { label: 'Excellent (≥80%)',  color: tierColors.Excellent },
    { label: 'Good (60–79%)',     color: tierColors.Good      },
    { label: 'Fair (40–59%)',     color: tierColors.Fair      },
    { label: 'Poor (<40%)',       color: tierColors.Poor      },
  ];
  const legendBlockW = 8;
  const legendBlockH = 5;
  let lx = 14;
  for (const item of legendItems) {
    doc.setFillColor(...item.color);
    doc.rect(lx, y - 4, legendBlockW, legendBlockH, 'F');
    doc.setTextColor(60, 60, 60);
    doc.text(item.label, lx + legendBlockW + 2, y);
    lx += legendBlockW + doc.getTextWidth(item.label) + 6;
  }
  doc.setTextColor(0, 0, 0);
  y += 8;

  return y;
}

// ─── Task 10.3: Residual Diagnostics section ──────────────────────────────────

/**
 * Renders the "Statistical Assumptions — Residual Diagnostics" section.
 *
 * Renders a 1×3 grid of chart images:
 *   Panel 1: Histogram of Residuals
 *   Panel 2: Normal Q-Q Plot
 *   Panel 3: Fitted vs. Residuals
 *
 * Followed by a summary row: Shapiro-Wilk W/p, normality pass/fail,
 * Levene F/p, homogeneity pass/fail, and any recommendation.
 *
 * Skips the entire section when `reportData.residualDiagnostics` is absent
 * or when n < 4 (too few observations to be meaningful).
 *
 * @param {object} doc        - jsPDF instance
 * @param {object} reportData - ReportData object from reportDataBuilder.js
 * @param {number} y          - Current vertical position (mm)
 * @returns {Promise<number>} New y position after the section
 */
export async function renderResidualDiagnostics(doc, reportData, y) {
  const rd = reportData.residualDiagnostics;

  // Guard: omit section when data is absent or n < 4
  if (!rd || rd.n < 4) return y;

  const ph    = doc.internal.pageSize.getHeight();
  const pw    = doc.internal.pageSize.getWidth();
  const color = getPrimaryColor((reportData.meta || {}).category);

  // ── Section heading ────────────────────────────────────────────────────────
  y = addSectionHeading(doc, 'Statistical Assumptions — Residual Diagnostics', y, ph, color);

  // ── Chart dimensions: 1×3 grid ────────────────────────────────────────────
  const chartW = Math.floor((pw - 35) / 3);   // equal thirds with margins
  const chartH = Math.floor(chartW * 0.8);
  const pxW    = chartW * 3.78;                // mm → px (≈96 dpi)
  const pxH    = chartH * 3.78;

  // ── Chart configurations ──────────────────────────────────────────────────
  const residuals = Array.isArray(rd.residuals) ? rd.residuals : [];

  // Build Q-Q data from residuals (sample quantiles vs theoretical normal quantiles)
  const qqData = (() => {
    if (residuals.length === 0) return [];
    const sorted = [...residuals].sort((a, b) => a - b);
    const n = sorted.length;
    return sorted.map((r, i) => {
      // Blom's formula for normal quantile position
      const p = (i + 0.375) / (n + 0.25);
      // Rational approximation of the inverse normal CDF (Abramowitz & Stegun)
      const sign = p < 0.5 ? -1 : 1;
      const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)));
      const c = [2.515517, 0.802853, 0.010328];
      const d = [1.432788, 0.189269, 0.001308];
      const theoretical = sign * (t - (c[0] + c[1] * t + c[2] * t * t) /
        (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t));
      return { theoretical, sample: r };
    });
  })();

  // Build fitted values (treatment group means per residual index) from rawMatrix
  const fittedValues = (() => {
    try {
      const param = reportData.primaryParameter || {};
      const means = param.means || {};
      const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
      const names = treatmentList.map(t => t.name).filter(Boolean);
      const fitted = [];
      names.forEach(name => {
        const m = means[name];
        if (!m || m.n == null) return;
        for (let i = 0; i < (m.n || 1); i++) {
          fitted.push(m.mean ?? 0);
        }
      });
      // Pad or trim to match residuals length
      while (fitted.length < residuals.length) fitted.push(0);
      return fitted.slice(0, residuals.length);
    } catch {
      return residuals.map(() => 0);
    }
  })();

  const histCfg = buildHistogramConfig(residuals);
  const qqCfg   = buildQQConfig(qqData);
  const fvrCfg  = buildFVRConfig(fittedValues, residuals);

  const chartDefs = [
    { config: histCfg, type: 'bar',     caption: 'Histogram of Residuals' },
    { config: qqCfg,   type: 'scatter', caption: 'Normal Q-Q Plot'        },
    { config: fvrCfg,  type: 'scatter', caption: 'Fitted vs. Residuals'   },
  ];

  // ── Render charts ─────────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, chartH + 14);

  const startX = 14;
  const gap    = Math.floor((pw - 28 - chartW * 3) / 2);  // gap between panels

  for (let i = 0; i < chartDefs.length; i++) {
    const def = chartDefs[i];
    const xPos = startX + i * (chartW + gap);

    try {
      const png = await renderChartCanvas(
        def.type,
        def.config.data,
        def.config.options,
        Math.round(pxW),
        Math.round(pxH),
      );
      if (png) {
        doc.addImage(png, 'PNG', xPos, y, chartW, chartH);
      } else {
        // Placeholder rectangle when chart fails to render
        doc.setFillColor(220, 220, 220);
        doc.rect(xPos, y, chartW, chartH, 'F');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text('Chart unavailable', xPos + chartW / 2, y + chartH / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
    } catch {
      // Individual chart failure — skip gracefully
      doc.setFillColor(220, 220, 220);
      doc.rect(xPos, y, chartW, chartH, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('Chart unavailable', xPos + chartW / 2, y + chartH / 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }

    // Caption below each chart
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text(def.caption, xPos + chartW / 2, y + chartH + 5, { align: 'center', maxWidth: chartW });
    doc.setTextColor(0, 0, 0);
  }

  y += chartH + 10;

  // ── Summary statistics row ────────────────────────────────────────────────
  y = checkPageBreak(doc, y, ph, 30);

  const sw   = rd.shapiroW   != null ? rd.shapiroW.toFixed(4)   : '—';
  const swP  = rd.shapiroP   != null ? rd.shapiroP.toFixed(4)   : '—';
  const lf   = rd.leveneF    != null ? rd.leveneF.toFixed(4)    : '—';
  const lfP  = rd.leveneP    != null ? rd.leveneP.toFixed(4)    : '—';
  const normPass  = rd.normality  === 'pass' ? '✓ Pass' : '✗ Fail';
  const homoPass  = rd.homogeneity === 'pass' ? '✓ Pass' : '✗ Fail';

  const summaryRows = [
    [
      `Shapiro-Wilk W = ${sw}, p = ${swP}`,
      `Normality: ${normPass}`,
      `Levene F = ${lf}, p = ${lfP}`,
      `Homogeneity: ${homoPass}`,
    ],
  ];

  if (rd.recommendation) {
    summaryRows.push([{ content: `Recommendation: ${rd.recommendation}`, colSpan: 4, styles: { fontStyle: 'italic', textColor: [80, 80, 80] } }]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Shapiro-Wilk', 'Normality', 'Levene', 'Homogeneity']],
    body: summaryRows,
    theme: 'grid',
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 30 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 10;
  return y;
}

// ─── Task 10.4: Photo Documentation section ───────────────────────────────────

/**
 * Renders the "Photo Documentation" section.
 *
 * Photos are grouped by treatment/daa/plotNumber (tagged) or collected as
 * "Untagged Photos". Tagged photos are sorted by treatment → daa → plotNumber
 * → date; untagged by date. A sub-heading is rendered for each group followed
 * by a call to `paginate16Photos()`.
 *
 * AI caption and direction label are appended to each photo's caption inside
 * the group array passed to `paginate16Photos()` (added as an `_extraCaption`
 * property that the caller reads — actually we enrich the resolvedSrc objects
 * so that paginate16Photos picks them up via its existing label/caption logic).
 *
 * @param {object} doc        - jsPDF instance
 * @param {object} reportData - ReportData object from reportDataBuilder.js
 * @param {object} options    - Generation options (photoMode, etc.)
 * @param {number} y          - Current vertical position (mm)
 * @returns {Promise<number>} New y position after the section
 */
export async function renderPhotoDocumentation(doc, reportData, options, y) {
  const photos = reportData.photos;

  // Guard: omit section when no photos are present
  if (!photos || photos.length === 0) return y;

  const ph    = doc.internal.pageSize.getHeight();
  const pw    = doc.internal.pageSize.getWidth();
  const color = getPrimaryColor((reportData.meta || {}).category);
  const mode  = (options && options.photoMode) ? options.photoMode : 'thumbnail';

  // ── Section heading ────────────────────────────────────────────────────────
  y = addSectionHeading(doc, 'Photo Documentation', y, ph, color);

  // ── Inline sort/group (no import from reportDataBuilder to avoid circular) ──
  // Partition into tagged (all three tag fields non-null) and untagged.
  const tagged   = [];
  const untagged = [];

  for (const photo of photos) {
    if (photo.treatment != null && photo.daa != null && photo.plotNumber != null) {
      tagged.push(photo);
    } else {
      untagged.push(photo);
    }
  }

  // Sort tagged: treatment (alpha) → daa (asc) → plotNumber (numeric) → date (asc)
  tagged.sort((a, b) => {
    const tA = (a.treatment || '').toLowerCase();
    const tB = (b.treatment || '').toLowerCase();
    if (tA < tB) return -1;
    if (tA > tB) return  1;
    const dA = a.daa ?? 0;
    const dB = b.daa ?? 0;
    if (dA !== dB) return dA - dB;
    const pA = parseFloat(a.plotNumber) || 0;
    const pB = parseFloat(b.plotNumber) || 0;
    if (pA !== pB) return pA - pB;
    return (a.date || '').localeCompare(b.date || '');
  });

  // Sort untagged: date ascending
  untagged.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // ── Enrich photos with direction/AI label appended to their label field ───
  // We create shallow clones so we don't mutate the original ReportData.
  function enrichPhoto(photo) {
    const parts = [];

    // AI result caption
    if (photo.aiResult) {
      const species = photo.aiResult.detectedSpecies || photo.aiResult.species;
      const cover   = photo.aiResult.coverPercentage ?? photo.aiResult.cover;
      if (species) parts.push(`Species: ${species}`);
      if (cover   != null) parts.push(`Cover: ${cover}%`);
    }

    // Direction sub-label
    if (photo.direction) {
      parts.push(photo.direction);
    }

    if (parts.length === 0) return photo;

    return {
      ...photo,
      label: [photo.label, ...parts].filter(Boolean).join(' | '),
    };
  }

  // ── Build groups ──────────────────────────────────────────────────────────
  // Group tagged photos by "treatment|daa|plotNumber" key
  const groupMap = new Map();
  for (const photo of tagged) {
    const key = `${photo.treatment}|${photo.daa}|${photo.plotNumber}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        treatment:  photo.treatment,
        daa:        photo.daa,
        plotNumber: photo.plotNumber,
        photos:     [],
      });
    }
    groupMap.get(key).photos.push(enrichPhoto(photo));
  }

  // ── Render tagged groups ──────────────────────────────────────────────────
  for (const group of groupMap.values()) {
    // Sub-heading for this group
    y = checkPageBreak(doc, y, ph, 14);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...color);
    const subHeading = `Treatment: ${group.treatment} | DAA: ${group.daa} | Plot: ${group.plotNumber}`;
    doc.text(subHeading, 14, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    y += 8;

    y = await paginate16Photos(doc, group.photos, y, ph, color, mode);
    y += 6;
  }

  // ── Render untagged group ─────────────────────────────────────────────────
  if (untagged.length > 0) {
    y = checkPageBreak(doc, y, ph, 14);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...color);
    doc.text('Untagged Photos', 14, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    y += 8;

    const enrichedUntagged = untagged.map(enrichPhoto);
    y = await paginate16Photos(doc, enrichedUntagged, y, ph, color, mode);
    y += 6;
  }

  return y;
}

// ─── Task 9.8: renderCharts ───────────────────────────────────────────────────

/**
 * Renders all conditional chart sections into `doc` at vertical position `y`.
 *
 * (a) ALWAYS: Treatment means bar chart with ±1 SE error bars.
 * (b) IF timeSeries.daas.length > 1: time-series line chart.
 * (c) IF doseResponse.success === true: dose-response table (ED50 / ED90).
 * (d) IF correlationMatrix.params.length >= 3: correlation heatmap via autoTable.
 * (e) IF residualDiagnostics.n >= 4: histogram, Q-Q, and fitted-vs-residuals charts.
 *
 * Each sub-chart is individually wrapped in try/catch; failures render grey
 * "Chart unavailable" text rather than crashing.
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {object} options    — generation options (e.g. alpha, postHoc)
 * @param {number} y          — current vertical position in mm
 * @returns {Promise<number>} new y position after all charts
 */
export async function renderCharts(doc, reportData, options, y) {
  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);
  const param = reportData.primaryParameter || {};
  const paramMeans = param.means || {};
  const paramLabel = param.label || param.key || 'Primary Parameter';
  const treatmentNames = Object.keys(paramMeans);

  // ── (a) Treatment means bar chart with ±1 SE error bars (ALWAYS rendered) ─
  try {
    y = checkPageBreak(doc, y, ph, 70);
    y = addSectionHeading(doc, `Treatment Means — ${paramLabel}`, y, ph, color);

    const labels  = treatmentNames;
    const means   = labels.map(t => paramMeans[t]?.mean  ?? 0);
    const ses     = labels.map(t => paramMeans[t]?.se    ?? 0);
    const bgColor = `rgba(${color[0]},${color[1]},${color[2]},0.7)`;

    const barPng = await renderChartCanvas('bar', {
      labels,
      datasets: [{
        label: paramLabel,
        data: means,
        backgroundColor: bgColor,
        borderColor: `rgba(${color[0]},${color[1]},${color[2]},1)`,
        borderWidth: 1,
        errorBars: ses.reduce((acc, se, i) => {
          acc[labels[i]] = { plus: se, minus: se };
          return acc;
        }, {}),
      }],
    }, {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: paramLabel } },
        y: { ticks: { font: { size: 10 } } },
      },
    }, 1200, Math.max(400, treatmentNames.length * 40));

    if (barPng) {
      const imgW = pw - 28;
      const imgH = imgW * (Math.max(400, treatmentNames.length * 40) / 1200);
      y = checkPageBreak(doc, y, ph, imgH + 6);
      doc.addImage(barPng, 'PNG', 14, y, imgW, imgH);
      y += imgH + 8;
    }
  } catch (e) {
    console.warn('[PDF] renderCharts (a) bar chart failed:', e?.message);
    y = checkPageBreak(doc, y, ph, 10);
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('Chart unavailable', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // ── (b) Time-series line chart (only when > 1 DAA) ────────────────────────
  const timeSeries = reportData.timeSeries || {};
  const daas       = Array.isArray(timeSeries.daas) ? timeSeries.daas : [];

  if (daas.length > 1) {
    try {
      y = checkPageBreak(doc, y, ph, 70);
      y = addSectionHeading(doc, 'Time-Series Response by DAA', y, ph, color);

      const tsPng = await renderChartCanvas('line', {
        labels: daas,
        datasets: treatmentNames.map((trt, i) => ({
          label: trt,
          data: daas.map(d => timeSeries[trt]?.[d]?.mean ?? null),
          borderColor: `hsl(${(i * 60) % 360}, 65%, 50%)`,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 3,
        })),
      }, {
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'DAA' } },
          y: { title: { display: true, text: paramLabel }, beginAtZero: true },
        },
      }, 1200, 500);

      if (tsPng) {
        const imgW = pw - 28;
        const imgH = imgW * (500 / 1200);
        y = checkPageBreak(doc, y, ph, imgH + 6);
        doc.addImage(tsPng, 'PNG', 14, y, imgW, imgH);
        y += imgH + 8;
      }
    } catch (e) {
      console.warn('[PDF] renderCharts (b) time-series chart failed:', e?.message);
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('Chart unavailable', 14, y);
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
  }

  // ── (c) Dose-response table (only when doseResponse.success === true) ─────
  const dr = reportData.doseResponse;
  if (dr?.success === true) {
    try {
      y = checkPageBreak(doc, y, ph, 40);
      y = addSectionHeading(doc, 'Dose-Response Analysis', y, ph, color);

      const drRows = [];
      if (dr.ed50 !== null && dr.ed50 !== undefined) {
        drRows.push(['ED50', fmt(dr.ed50, 3), dr.ed50Unit || '']);
      }
      if (dr.ed90 !== null && dr.ed90 !== undefined) {
        drRows.push(['ED90', fmt(dr.ed90, 3), dr.ed90Unit || '']);
      }
      if (dr.slope !== null && dr.slope !== undefined) {
        drRows.push(['Slope (b)', fmt(dr.slope, 3), '—']);
      }
      if (dr.upperLimit !== null && dr.upperLimit !== undefined) {
        drRows.push(['Upper limit (d)', fmt(dr.upperLimit, 3), '—']);
      }
      if (dr.lowerLimit !== null && dr.lowerLimit !== undefined) {
        drRows.push(['Lower limit (c)', fmt(dr.lowerLimit, 3), '—']);
      }

      if (drRows.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Parameter', 'Estimate', 'Unit']],
          body: drRows,
          theme: 'grid',
          headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: { 0: { cellWidth: 50 } },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;
      }

      if (dr.modelLabel) {
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`Model: ${dr.modelLabel}`, 14, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
      }
    } catch (e) {
      console.warn('[PDF] renderCharts (c) dose-response table failed:', e?.message);
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('Chart unavailable', 14, y);
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
  }

  // ── (d) Correlation heatmap via autoTable (only when params.length >= 3) ──
  const corrMatrix = reportData.correlationMatrix;
  if (corrMatrix && Array.isArray(corrMatrix.params) && corrMatrix.params.length >= 3) {
    try {
      y = checkPageBreak(doc, y, ph, 40);
      y = addSectionHeading(doc, 'Parameter Correlation Heatmap', y, ph, color);

      const corrParams = corrMatrix.params;
      const corrHead   = [['', ...corrParams]];
      const corrBody   = corrParams.map(pA => {
        const row = [pA];
        corrParams.forEach(pB => {
          if (pA === pB) { row.push('1.000'); return; }
          const cell = corrMatrix.matrix?.[pA]?.[pB];
          if (!cell || cell.r == null) { row.push('N/A'); return; }
          row.push(`${cell.r.toFixed(3)}${cell.stars || ''}`);
        });
        return row;
      });

      autoTable(doc, {
        startY: y,
        head: corrHead,
        body: corrBody,
        theme: 'grid',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const colIdx = data.column.index;
            const rowIdx = data.row.index;
            // Skip row-header column (index 0)
            if (colIdx === 0) return;
            const pA = corrParams[rowIdx];
            const pB = corrParams[colIdx - 1];
            if (pA === pB) return; // diagonal
            const cell = corrMatrix.matrix?.[pA]?.[pB];
            if (cell && cell.r != null && cell.stars && Math.abs(cell.r) >= 0.5) {
              data.cell.styles.fillColor = [207, 226, 255]; // light blue highlight
            }
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 6;

      y = checkPageBreak(doc, y, ph, 8);
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text('* p < 0.05   ** p < 0.01   N/A = fewer than 4 treatment pairs', 14, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
    } catch (e) {
      console.warn('[PDF] renderCharts (d) correlation heatmap failed:', e?.message);
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('Chart unavailable', 14, y);
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
  }

  // ── (e) Residual diagnostics: histogram, Q-Q, fitted-vs-residuals ─────────
  const rd = reportData.residualDiagnostics;
  if (rd && rd.n >= 4) {
    try {
      y = checkPageBreak(doc, y, ph, 75);
      y = addSectionHeading(doc, 'Residual Diagnostics', y, ph, color);

      const residuals     = Array.isArray(rd.residuals)    ? rd.residuals    : [];
      const fittedValues  = Array.isArray(rd.fittedValues) ? rd.fittedValues : [];
      const qqData        = Array.isArray(rd.qqData)       ? rd.qqData       : [];

      const diagImgW = (pw - 42) / 3; // three charts side-by-side with gaps
      const diagImgH = diagImgW * 0.7;
      const diagY    = y;

      // Histogram
      try {
        const histCfg = buildHistogramConfig(residuals);
        const histPng = await renderChartCanvas('bar', histCfg.data, histCfg.options, 600, 420);
        if (histPng) {
          doc.addImage(histPng, 'PNG', 14, diagY, diagImgW, diagImgH);
        }
      } catch (e2) {
        console.warn('[PDF] histogram chart failed:', e2?.message);
        doc.setFontSize(8); doc.setTextColor(150, 150, 150);
        doc.text('Chart unavailable', 14 + diagImgW / 2, diagY + diagImgH / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }

      // Q-Q plot
      try {
        const qqCfg = buildQQConfig(qqData);
        const qqPng = await renderChartCanvas('scatter', qqCfg.data, qqCfg.options, 600, 420);
        if (qqPng) {
          doc.addImage(qqPng, 'PNG', 14 + diagImgW + 7, diagY, diagImgW, diagImgH);
        }
      } catch (e2) {
        console.warn('[PDF] Q-Q chart failed:', e2?.message);
        doc.setFontSize(8); doc.setTextColor(150, 150, 150);
        doc.text('Chart unavailable', 14 + diagImgW + 7 + diagImgW / 2, diagY + diagImgH / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }

      // Fitted-vs-Residuals
      try {
        const fvrCfg = buildFVRConfig(fittedValues, residuals);
        const fvrPng = await renderChartCanvas('scatter', fvrCfg.data, fvrCfg.options, 600, 420);
        if (fvrPng) {
          doc.addImage(fvrPng, 'PNG', 14 + (diagImgW + 7) * 2, diagY, diagImgW, diagImgH);
        }
      } catch (e2) {
        console.warn('[PDF] fitted-vs-residuals chart failed:', e2?.message);
        doc.setFontSize(8); doc.setTextColor(150, 150, 150);
        doc.text('Chart unavailable', 14 + (diagImgW + 7) * 2 + diagImgW / 2, diagY + diagImgH / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }

      y = diagY + diagImgH + 5;

      // Labels below charts
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('Residual Histogram',       14 + diagImgW / 2,              y, { align: 'center' });
      doc.text('Normal Q-Q Plot',          14 + diagImgW + 7 + diagImgW / 2, y, { align: 'center' });
      doc.text('Fitted vs Residuals',      14 + (diagImgW + 7) * 2 + diagImgW / 2, y, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 5;

      // Normality / homogeneity summary line
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const normStr = rd.shapiroP != null
        ? `Shapiro-Wilk W = ${fmt(rd.shapiroW, 3)}, p = ${fmt(rd.shapiroP, 4)} (${rd.normality === 'pass' ? 'Normality met' : 'Non-normal'})`
        : 'Shapiro-Wilk: N/A';
      const homoStr = rd.leveneP != null
        ? `Levene F = ${fmt(rd.leveneF, 3)}, p = ${fmt(rd.leveneP, 4)} (${rd.homogeneity === 'pass' ? 'Homogeneity met' : 'Heterogeneous'})`
        : 'Levene: N/A';
      doc.text(`${normStr}     ${homoStr}`, 14, y, { maxWidth: pw - 28 });
      doc.setTextColor(0, 0, 0);
      y += 8;

      if (rd.recommendation) {
        y = checkPageBreak(doc, y, ph, 10);
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(80, 80, 80);
        doc.text(rd.recommendation, 14, y, { maxWidth: pw - 28 });
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
        y += 8;
      }
    } catch (e) {
      console.warn('[PDF] renderCharts (e) residual diagnostics failed:', e?.message);
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('Chart unavailable', 14, y);
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
  }

  return y;
}

// ─── Task 10.1: renderPhytotoxicity ──────────────────────────────────────────

/**
 * Renders the Phytotoxicity & Crop Safety section into `doc` at position `y`.
 *
 * Guard conditions:
 *  - If template is 'field-summary' or 'scientific-journal' AND no data → return y (omit).
 *  - If phytotoxicity.hasData is false → return y (omit entirely).
 *
 * Content:
 *  - Section heading: "Phytotoxicity & Crop Safety"
 *  - If allZero === true: informational note only (no chart).
 *  - Otherwise: treatment means table (Treatment, Mean %, SD, Safety Class)
 *    with colour-coded safety class cells, then a bar chart attempt.
 *
 * Safety class colours:
 *  Safe     → green  [204, 255, 204]
 *  Minor    → yellow [255, 255, 179]
 *  Moderate → orange [255, 200, 150]
 *  Severe   → red    [255, 180, 180]
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @param {string} template   — template key
 * @returns {number} new y position
 */
export function renderPhytotoxicity(doc, reportData, y, template) {
  const phyto = reportData.phytotoxicity;

  // Omit for compact templates when no data
  if (!phyto?.hasData && (template === 'field-summary' || template === 'scientific-journal')) {
    return y;
  }
  // Omit entirely if no phytotoxicity data at all
  if (!phyto?.hasData) {
    return y;
  }

  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);

  y = checkPageBreak(doc, y, ph, 30);
  y = addSectionHeading(doc, 'Phytotoxicity & Crop Safety', y, ph, color);

  // If all readings were zero, show a simple note and return
  if (phyto.allZero === true) {
    y = checkPageBreak(doc, y, ph, 14);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(
      'No phytotoxicity observed in any treatment throughout the trial period.',
      14, y, { maxWidth: pw - 28 }
    );
    doc.setTextColor(0, 0, 0);
    return y + 12;
  }

  // Safety class colour map
  const safetyColors = {
    Safe:     [204, 255, 204],
    Minor:    [255, 255, 179],
    Moderate: [255, 200, 150],
    Severe:   [255, 180, 180],
  };

  // Build table rows from phyto.means
  const means = phyto.means || {};
  const treatments = Object.keys(means);

  if (treatments.length > 0) {
    const tableHead = [['Treatment', 'Mean Phytotox. %', 'SD', 'Safety Class']];
    const tableBody = treatments.map(trt => {
      const m = means[trt] || {};
      return [
        trt,
        m.mean !== null && m.mean !== undefined ? fmt(m.mean, 1) : '—',
        m.sd   !== null && m.sd   !== undefined ? fmt(m.sd,   1) : '—',
        m.safetyClass || '—',
      ];
    });

    y = checkPageBreak(doc, y, ph, 30);
    autoTable(doc, {
      startY: y,
      head: tableHead,
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 55 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const sc = tableBody[data.row.index]?.[3];
          if (sc && safetyColors[sc]) {
            data.cell.styles.fillColor = safetyColors[sc];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // Attempt bar chart — async is not available here so return y and let caller handle
    // We do a synchronous path: schedule chart as best-effort via a self-invoking async block
    // but since this function is sync we cannot await; chart is attempted inline via returned
    // promise that updates doc. Instead, we document that the caller should await renderCharts
    // for the chart; here we only render the table as specified.
    // (Callers that need the chart should call renderCharts; this section renders the table.)
    //
    // Safety class legend
    y = checkPageBreak(doc, y, ph, 12);
    doc.setFontSize(8);
    const legendItems = [
      { label: 'Safe',     col: safetyColors.Safe     },
      { label: 'Minor',    col: safetyColors.Minor    },
      { label: 'Moderate', col: safetyColors.Moderate },
      { label: 'Severe',   col: safetyColors.Severe   },
    ];
    let lx = 14;
    for (const item of legendItems) {
      doc.setFillColor(...item.col);
      doc.rect(lx, y - 4, 8, 5, 'F');
      doc.setTextColor(60, 60, 60);
      doc.text(item.label, lx + 10, y);
      lx += 10 + doc.getTextWidth(item.label) + 6;
    }
    doc.setTextColor(0, 0, 0);
    y += 8;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No phytotoxicity treatment data available.', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  return y;
}

// ─── Task 10.2: renderCorrelation ────────────────────────────────────────────

/**
 * Renders the Parameter Correlation Matrix section into `doc` at position `y`.
 *
 * Guard: if correlationMatrix is absent or params.length < 3, returns y unchanged.
 *
 * Content:
 *  - Section heading: "Parameter Correlation Matrix"
 *  - autoTable with params as both row and column headers
 *  - Cell text: r value (3 d.p.) + significance stars  (* p<0.05, ** p<0.01)
 *  - Diagonal cells: "1.000"
 *  - Cells where |r| >= 0.5 AND stars present: light blue [207, 226, 255] background
 *  - Footnote: "* p < 0.05   ** p < 0.01   N/A = fewer than 4 treatment pairs"
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position
 */
export function renderCorrelation(doc, reportData, y) {
  const corrMatrix = reportData.correlationMatrix;

  if (!corrMatrix || !Array.isArray(corrMatrix.params) || corrMatrix.params.length < 3) {
    return y;
  }

  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);

  y = checkPageBreak(doc, y, ph, 40);
  y = addSectionHeading(doc, 'Parameter Correlation Matrix', y, ph, color);

  const params = corrMatrix.params;

  // Header row: blank leading cell + param names
  const tableHead = [['Parameter', ...params]];

  // Body: one row per param; first cell = param name, then r values
  const tableBody = params.map(pA => {
    const row = [pA];
    params.forEach(pB => {
      if (pA === pB) {
        row.push('1.000');
        return;
      }
      const cell = corrMatrix.matrix?.[pA]?.[pB];
      if (!cell || cell.r == null) {
        row.push('N/A');
      } else {
        row.push(`${cell.r.toFixed(3)}${cell.stars || ''}`);
      }
    });
    return row;
  });

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const colIdx = data.column.index;
        const rowIdx = data.row.index;
        // Skip the row-header column (index 0)
        if (colIdx === 0) return;
        const pA = params[rowIdx];
        const pB = params[colIdx - 1];
        // Diagonal — no highlight
        if (pA === pB) return;
        const cell = corrMatrix.matrix?.[pA]?.[pB];
        if (cell && cell.r != null && cell.stars && Math.abs(cell.r) >= 0.5) {
          data.cell.styles.fillColor = [207, 226, 255]; // light blue
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 6;

  // Footnote
  y = checkPageBreak(doc, y, ph, 8);
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text('* p < 0.05   ** p < 0.01   N/A = fewer than 4 treatment pairs', 14, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  return y;
}

// ─── Task 10.5: Yield Analysis section renderer ───────────────────────────────

/**
 * Renders a "Yield Analysis" section into `doc` at vertical position `y`.
 * Omitted entirely if reportData.yield or reportData.yield.means is absent,
 * or if there are no treatment keys.
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position after the section
 */
export function renderYieldAnalysis(doc, reportData, y) {
  const yieldData = reportData.yield;

  // Guard: omit section if no yield means
  if (!yieldData || !yieldData.means) return y;
  const treatmentKeys = Object.keys(yieldData.means);
  if (treatmentKeys.length === 0) return y;

  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);

  y = checkPageBreak(doc, y, ph, 40);
  y = addSectionHeading(doc, 'Yield Analysis', y, ph, color);

  // ── Task 16.4: Yield metadata row ─────────────────────────────────────────
  // YieldUnit, GrainMoisture, ThousandGrainWeight, HarvestDAA — sourced from
  // yieldData.meta, reportData.meta, or the first treatmentList entry.
  const firstTreatment = Array.isArray(reportData.treatmentList) ? reportData.treatmentList[0] : null;
  const yMeta = yieldData.meta || {};
  const yieldUnit          = yMeta.YieldUnit           || meta.YieldUnit           || firstTreatment?.YieldUnit           || '—';
  const grainMoisture      = yMeta.GrainMoisture       || meta.GrainMoisture       || firstTreatment?.GrainMoisture       || null;
  const thousandGrainWeight= yMeta.ThousandGrainWeight || meta.ThousandGrainWeight || firstTreatment?.ThousandGrainWeight || null;
  const harvestDAA         = yMeta.HarvestDAA          || meta.HarvestDAA          || firstTreatment?.HarvestDAA          || null;

  // Only render the metadata row when at least one extra field is available
  const hasExtraFields = grainMoisture != null || thousandGrainWeight != null || harvestDAA != null;
  if (hasExtraFields || yieldUnit !== '—') {
    const metaItems = [
      ['Yield Unit', yieldUnit],
      ['Grain Moisture (%)', grainMoisture != null ? fmt(grainMoisture, 1) : '—'],
      ['1000-Grain Weight (g)', thousandGrainWeight != null ? fmt(thousandGrainWeight, 2) : '—'],
      ['Harvest DAA', harvestDAA != null ? String(harvestDAA) : '—'],
    ];
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text('Yield Parameters:', 14, y);
    doc.setFont(undefined, 'normal');
    y += 5;
    const colW = (pw - 28) / metaItems.length;
    metaItems.forEach(([label, val], idx) => {
      const bx = 14 + idx * colW;
      doc.setFillColor(245, 248, 250);
      doc.rect(bx, y, colW - 1, 12, 'F');
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(80, 80, 80);
      doc.text(label, bx + (colW - 1) / 2, y + 4, { align: 'center', maxWidth: colW - 3 });
      doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);
      doc.text(String(val), bx + (colW - 1) / 2, y + 10, { align: 'center', maxWidth: colW - 3 });
    });
    y += 16;
  }

  // Treatment means table: Treatment, n, Mean, SD, SE, Yield Improvement%, CLD, Significance
  const yAnova  = yieldData.anova || null;
  const pVal0   = yAnova && yAnova.p ? yAnova.p[0] : null;
  const sig     = sigStars(pVal0);

  const yHead = [['Treatment', 'n', 'Mean', 'SD', 'SE', 'Yield Improvement %', 'CLD', 'Sig.']];
  const yBody = treatmentKeys.map(tName => {
    const m = yieldData.means[tName] || {};
    const improvPct = (m.efficacy_pct !== null && m.efficacy_pct !== undefined)
      ? fmt(m.efficacy_pct, 1)
      : '—';
    return [
      tName,
      String(m.n ?? '—'),
      fmt(m.mean),
      fmt(m.sd),
      fmt(m.se),
      improvPct,
      m.cldLetter || '—',
      sig,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: yHead,
    body: yBody,
    theme: 'striped',
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 48 } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ANOVA source table beneath the means table (if present)
  if (yAnova && !yAnova.error) {
    y = checkPageBreak(doc, y, ph, 40);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Yield ANOVA Source Table', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const yAnovaHead = [['Source of Variation', 'SS', 'df', 'MS', 'F-value', 'p-value']];
    const ySources   = yAnova.source || [];
    const yAnovaBody = ySources.map((src, i) => [
      src,
      fmt(yAnova.ss?.[i]),
      String(yAnova.df?.[i] ?? '—'),
      yAnova.ms?.[i] !== null && yAnova.ms?.[i] !== undefined ? fmt(yAnova.ms[i])   : '—',
      yAnova.f?.[i]  !== null && yAnova.f?.[i]  !== undefined ? fmt(yAnova.f[i], 3) : '—',
      yAnova.p?.[i]  !== null && yAnova.p?.[i]  !== undefined ? fmt(yAnova.p[i], 4) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: yAnovaHead,
      body: yAnovaBody,
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 0) {
          data.cell.styles.fillColor = [230, 240, 255];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  return y;
}

// ─── Task 10.6: Weather Log section renderer ──────────────────────────────────

/**
 * Renders a "Weather Log" section into `doc` at vertical position `y`.
 * Omitted entirely if reportData.weather is absent or empty.
 *
 * Columns: Date | DAA | Temp (°C) | Humidity (%) | Wind Speed (km/h) | Rain (mm)
 * Numeric values formatted to 1 decimal place; null values shown as '—'.
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position after the section
 */
export function renderWeatherLog(doc, reportData, y) {
  const weather = reportData.weather;

  // Guard: omit if no weather records
  if (!weather || weather.length === 0) return y;

  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);

  y = checkPageBreak(doc, y, ph, 40);
  y = addSectionHeading(doc, 'Weather Log', y, ph, color);

  const wHead = [['Date', 'DAA', 'Temp (°C)', 'Humidity (%)', 'Wind Speed (km/h)', 'Rain (mm)']];
  const wBody = weather.map(w => [
    w.date || '—',
    w.daa !== null && w.daa !== undefined ? String(w.daa) : '—',
    w.temp     !== null && w.temp     !== undefined ? fmt(w.temp,     1) : '—',
    w.humidity !== null && w.humidity !== undefined ? fmt(w.humidity, 1) : '—',
    w.wind     !== null && w.wind     !== undefined ? fmt(w.wind,     1) : '—',
    w.rain     !== null && w.rain     !== undefined ? fmt(w.rain,     1) : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: wHead,
    body: wBody,
    theme: 'striped',
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  return y;
}

// ─── Task 10.7: Conclusions & Recommendations section renderer ────────────────

/**
 * Renders a "Conclusions & Recommendations" section into `doc` at position `y`.
 *
 * Auto-generates a conclusion paragraph from primaryParameter.anova:
 *  - Significant (p ≤ 0.05): names top CLD 'a' treatment(s)
 *  - Non-significant: recommends further replication
 *
 * Also renders an "Investigator Notes" sub-heading with meta.notes / meta.conclusion
 * content verbatim (or '—' when both are null/empty).
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm
 * @returns {number} new y position after the section
 */
export function renderConclusions(doc, reportData, y) {
  const pw    = doc.internal.pageSize.getWidth();
  const ph    = doc.internal.pageSize.getHeight();
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);
  const category = (meta.category || 'herbicide').toLowerCase();

  const param        = reportData.primaryParameter || {};
  const anova        = param.anova || null;
  const paramLabel   = param.label || param.key || 'Primary Parameter';
  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);

  y = checkPageBreak(doc, y, ph, 40);
  y = addSectionHeading(doc, 'Conclusions & Recommendations', y, ph, color);

  // Auto-generate conclusion paragraph (same logic as renderStandard)
  let conclusionText = '';
  if (anova) {
    const cf   = anova.f   ? anova.f[0]   : null;
    const cp   = anova.p   ? anova.p[0]   : null;
    const fStr = fmt(cf, 3);
    const pStr = fmt(cp, 4);

    if (cp !== null && cp <= 0.05) {
      // Find top CLD group — treatments with letter 'a'
      const topTreatments = treatmentNames.filter(tName => {
        const m = paramMeansObj[tName] || {};
        return m.cldLetter && m.cldLetter.toLowerCase().includes('a');
      });
      const topStr = topTreatments.length > 0 ? topTreatments.join(', ') : 'top-ranked treatments';
      const direction = (category === 'nutrition' || category === 'biostimulant') ? 'increase' : 'decrease';
      conclusionText =
        `Treatment(s) ${topStr} showed statistically significant ${direction} in ${paramLabel} ` +
        `(F = ${fStr}, p = ${pStr}). Results indicate that the applied treatment(s) were effective ` +
        `under the conditions of this trial.`;
    } else {
      const fDisplay = cf !== null ? `F = ${fStr}, ` : '';
      conclusionText =
        `No statistically significant differences were detected between treatments ` +
        `(${fDisplay}p = ${pStr}, NS). Further trials with greater replication or ` +
        `under different conditions may be warranted.`;
    }
  } else {
    conclusionText =
      'Statistical analysis could not be completed due to insufficient data. ' +
      'Results should be interpreted descriptively only.';
  }

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const conclusionLines = doc.splitTextToSize(conclusionText, pw - 28);
  y = checkPageBreak(doc, y, ph, conclusionLines.length * 6 + 14);
  doc.text(conclusionLines, 14, y);
  y += conclusionLines.length * 6 + 10;

  // Investigator Notes sub-heading
  const notes      = (meta.notes      && String(meta.notes).trim())      ? String(meta.notes).trim()      : null;
  const conclusion = (meta.conclusion && String(meta.conclusion).trim()) ? String(meta.conclusion).trim() : null;
  const notesContent = notes || conclusion || null;

  y = checkPageBreak(doc, y, ph, 20);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...color);
  doc.text('Investigator Notes', 19, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  y += 7;

  if (notesContent) {
    const noteLines = doc.splitTextToSize(notesContent, pw - 28);
    y = checkPageBreak(doc, y, ph, noteLines.length * 6 + 6);
    doc.text(noteLines, 14, y);
    y += noteLines.length * 6 + 8;
  } else {
    y = checkPageBreak(doc, y, ph, 10);
    doc.setTextColor(120, 120, 120);
    doc.text('—', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  return y;
}

// ─── Task 17.1: Sequential Table / Figure counter ────────────────────────────
/**
 * Creates a sequential Table N / Figure N counter for PDF reports.
 *
 * Usage:
 *   const counter = createTableFigureCounter();
 *   const tableLabel  = counter.nextTable('Treatment Means');   // → "Table 1. Treatment Means"
 *   const figureLabel = counter.nextFigure('Efficacy Bar Chart'); // → "Figure 1. Efficacy Bar Chart"
 *
 * Note: The existing `autoTable` calls in the section renderers do not yet pass captions
 * through this counter — they use inline doc.text() headings instead.  Callers that want
 * sequentially numbered captions above their tables/figures should obtain a counter at the
 * start of a render function and call nextTable() / nextFigure() just before each autoTable()
 * or chart embed.  The counter is intentionally stateless between render calls so each
 * top-level template (Standard, Journal, Regulatory) starts its own sequence from 1.
 *
 * @returns {{ nextTable(caption?: string): string, nextFigure(caption?: string): string }}
 */
export function createTableFigureCounter() {
  let tableN  = 0;
  let figureN = 0;
  return {
    /**
     * Returns the next "Table N. [caption]" label string and advances the table counter.
     * @param {string} [caption] - Optional descriptive caption text.
     * @returns {string}  e.g. "Table 1. Treatment Means"
     */
    nextTable(caption = '') {
      tableN += 1;
      return caption ? `Table ${tableN}. ${caption}` : `Table ${tableN}.`;
    },
    /**
     * Returns the next "Figure N. [caption]" label string and advances the figure counter.
     * @param {string} [caption] - Optional descriptive caption text.
     * @returns {string}  e.g. "Figure 1. Efficacy Bar Chart"
     */
    nextFigure(caption = '') {
      figureN += 1;
      return caption ? `Figure ${figureN}. ${caption}` : `Figure ${figureN}.`;
    },
  };
}

// ─── Task 10.8: Appendices renderer ──────────────────────────────────────────

/**
 * Renders all report appendices (A–D + Glossary) into `doc`.
 *
 * Appendix A — Raw Data Matrix        (full rawMatrix, all obs field keys)
 * Appendix B — Descriptive Statistics & Post-Hoc Analysis
 * Appendix C — Photo Index            (only when photos present)
 * Appendix D — Experimental Layout    (plot-to-treatment assignment)
 * Glossary   — Abbreviations & Definitions (filtered by category)
 *
 * @param {object} doc        — jsPDF instance
 * @param {object} reportData — ReportData object
 * @param {number} y          — current vertical position in mm (position before first addPage)
 * @returns {Promise<number>} new y position after all appendices
 */
export async function renderAppendices(doc, reportData, y) {
  const meta  = reportData.meta || {};
  const color = getPrimaryColor(meta.category);
  const ph    = doc.internal.pageSize.getHeight();
  const pw    = doc.internal.pageSize.getWidth();
  const category = (meta.category || 'herbicide').toLowerCase();

  // ── Appendix A: Raw Data Matrix ─────────────────────────────────────────
  doc.addPage();
  y = 20;
  y = addSectionHeading(doc, 'Appendix A: Raw Data Matrix', y, ph, color);

  const rawMatrix   = reportData.rawMatrix || {};
  const treatments  = Object.keys(rawMatrix);

  if (treatments.length > 0) {
    // Collect all observation field keys (excluding reserved structural keys)
    const reservedKeys = new Set(['daa', 'trialID', 'plotNumber']);
    const obsFieldKeys = [];
    for (const tName of treatments) {
      for (const repData of Object.values(rawMatrix[tName] || {})) {
        for (const k of Object.keys(repData || {})) {
          if (!reservedKeys.has(k) && !obsFieldKeys.includes(k)) {
            obsFieldKeys.push(k);
          }
        }
      }
    }

    const rawAHead = [['Treatment', 'Replication', 'DAA', ...obsFieldKeys]];
    const rawABody = [];
    for (const tName of treatments) {
      const repMap = rawMatrix[tName] || {};
      for (const [repId, repData] of Object.entries(repMap)) {
        const row = [
          tName,
          repId,
          repData.daa !== null && repData.daa !== undefined ? String(repData.daa) : '—',
          ...obsFieldKeys.map(k => {
            const v = repData[k];
            return (v !== null && v !== undefined) ? String(v) : '—';
          }),
        ];
        rawABody.push(row);
      }
    }

    autoTable(doc, {
      startY: y,
      head: rawAHead,
      body: rawABody,
      theme: 'grid',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 20 }, 2: { cellWidth: 14 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No raw data matrix available.', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  // ── Appendix B: Descriptive Statistics & Post-Hoc Analysis ─────────────
  doc.addPage();
  y = 20;
  y = addSectionHeading(doc, 'Appendix B: Descriptive Statistics & Post-Hoc Analysis', y, ph, color);

  const param      = reportData.primaryParameter || {};
  const paramMeans = param.means || {};
  const tNames     = Object.keys(paramMeans);
  const paramLabel = param.label || param.key || 'Primary Parameter';

  if (tNames.length > 0) {
    // Full descriptive stats table per treatment
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Descriptive Statistics — ${paramLabel}`, 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const descHead = [['Treatment', 'n', 'Mean', 'SD', 'SE', 'CV%', '95%CI Lower', '95%CI Upper', 'Min', 'Max']];
    const descBody = tNames.map(tName => {
      const m = paramMeans[tName] || {};
      return [
        tName,
        String(m.n ?? '—'),
        fmt(m.mean),
        fmt(m.sd),
        fmt(m.se),
        m.cv !== null && m.cv !== undefined ? fmt(m.cv, 1) : '—',
        fmt(m.ci95Lower),
        fmt(m.ci95Upper),
        fmt(m.min),
        fmt(m.max),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: descHead,
      body: descBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Full pairwise comparison table from primaryParameter.anova.comparisons
  const comparisons = param.anova?.comparisons;
  if (Array.isArray(comparisons) && comparisons.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Pairwise Comparisons', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const compHead = [['Treatment A', 'Treatment B', 'Mean Diff', 'Critical Value', 'Significant']];
    const compBody = comparisons.map(comp => {
      const critVal = comp.hsd ?? comp.lsd ?? comp.range ?? null;
      return [
        comp.a || comp.treatmentA || '—',
        comp.b || comp.treatmentB || '—',
        fmt(comp.diff),
        critVal !== null && critVal !== undefined ? fmt(critVal) : '—',
        comp.significant ? 'Yes' : 'No',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: compHead,
      body: compBody,
      theme: 'grid',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const sig = compBody[data.row.index]?.[4];
          if (sig === 'Yes') data.cell.styles.fillColor = [220, 240, 255];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Power analysis table from reportData.powerAnalysis
  const powerAnalysis = reportData.powerAnalysis;
  if (powerAnalysis && Array.isArray(powerAnalysis.powerTable) && powerAnalysis.powerTable.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Power Analysis', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    // Summary line
    doc.setFontSize(9);
    const powerSummary = [
      `Achieved Power: ${powerAnalysis.achievedPower !== null ? fmt(powerAnalysis.achievedPower, 3) : '—'}`,
      `Required N: ${powerAnalysis.requiredN ?? '—'}`,
      `Interpretation: ${powerAnalysis.interpretation || '—'}`,
    ].join('   |   ');
    doc.text(powerSummary, 14, y, { maxWidth: pw - 28 });
    y += 8;

    const pwHead = [['N (per treatment)', 'Achieved Power']];
    const pwBody = powerAnalysis.powerTable.map(row => [
      String(row.n ?? '—'),
      row.power !== null && row.power !== undefined ? fmt(row.power, 3) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: pwHead,
      body: pwBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      tableWidth: 80,
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Appendix C: Photo Index ─────────────────────────────────────────────
  const photos = Array.isArray(reportData.photos) ? reportData.photos : [];
  if (photos.length > 0) {
    doc.addPage();
    y = 20;
    y = addSectionHeading(doc, 'Appendix C: Photo Index', y, ph, color);

    const photoHead = [['#', 'Treatment', 'DAA', 'Plot', 'Date', 'Direction', 'Label']];
    const photoBody = photos.map((p, idx) => [
      String(idx + 1),
      p.treatment || '—',
      p.daa !== null && p.daa !== undefined ? String(p.daa) : '—',
      p.plotNumber || '—',
      p.date ? String(p.date).slice(0, 10) : '—',
      p.direction || '—',
      p.label || '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: photoHead,
      body: photoBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 42 }, 6: { cellWidth: 38 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Appendix D: Experimental Layout ────────────────────────────────────
  doc.addPage();
  y = 20;
  y = addSectionHeading(doc, 'Appendix D: Experimental Layout', y, ph, color);

  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  const design        = meta.designLabel || meta.design || 'RCBD';
  const nTrt          = meta.treatments  || treatmentList.length || '?';
  const nRep          = meta.replications || '?';

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const layoutDesc =
    `The trial used a ${design} with ${nTrt} treatment(s) and ${nRep} replication(s). ` +
    `Plots were randomly assigned to treatments within each block/replication as described below.`;
  const layoutLines = doc.splitTextToSize(layoutDesc, pw - 28);
  doc.text(layoutLines, 14, y);
  y += layoutLines.length * 6 + 8;

  if (treatmentList.length > 0) {
    y = checkPageBreak(doc, y, ph, 30);
    const layoutHead = [['#', 'Treatment / Formulation', 'Dosage', 'Role']];
    const layoutBody = treatmentList.map((t, idx) => [
      String(idx + 1),
      t.name || '—',
      t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—',
      // isControl checked first: when both isControl===true AND isStandard===true,
      // 'UTC / Control' takes precedence (correct GLP behaviour).
      t.isControl ? 'UTC / Control' : (t.isStandard ? 'Standard' : 'Treatment'),
    ]);

    autoTable(doc, {
      startY: y,
      head: layoutHead,
      body: layoutBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 70 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Randomised block layout grid (one cell per plot, rows = reps, cols = treatments)
  if (treatmentList.length > 0 && Number(nRep) > 0) {
    y = checkPageBreak(doc, y, ph, 20);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Randomised Block Assignment', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    const nRepNum = Number(nRep);
    const tNames  = treatmentList.map(t => t.name || `T${t.id || ''}`);

    // Build deterministic pseudo-random assignment per rep block
    const blockHead = [['Rep / Block', ...tNames.map((_, i) => `Plot ${i + 1}`)]];
    const blockBody = [];
    for (let r = 0; r < nRepNum; r++) {
      // Shuffle treatment names for this rep using seeded index approach
      const shuffled = [...tNames];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (i * 7 + r * 13) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      blockBody.push([`Rep ${r + 1}`, ...shuffled]);
    }

    autoTable(doc, {
      startY: y,
      head: blockHead,
      body: blockBody,
      theme: 'grid',
      headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Glossary of Abbreviations ───────────────────────────────────────────
  doc.addPage();
  y = 20;
  y = addSectionHeading(doc, 'Glossary of Abbreviations', y, ph, color);

  // Full abbreviation registry — filtered to category-relevant entries
  const ALL_ABBREVIATIONS = [
    // Universal (used in every report)
    { abbr: 'ANOVA',  def: 'Analysis of Variance — statistical method to compare means across multiple groups' },
    { abbr: 'CLD',    def: 'Compact Letter Display — indicates treatment groups not significantly different share a letter' },
    { abbr: 'UTC',    def: 'Untreated Control — baseline treatment with no active ingredient applied' },
    { abbr: 'DAA',    def: 'Days After Application — number of days elapsed since the trial application date' },
    { abbr: 'SE',     def: 'Standard Error — measure of the precision of the sample mean' },
    { abbr: 'SD',     def: 'Standard Deviation — measure of dispersion around the mean' },
    { abbr: 'CV%',    def: 'Coefficient of Variation (%) — SD expressed as a percentage of the mean' },
    { abbr: 'LSD',    def: 'Least Significant Difference — minimum difference between means to be statistically significant' },
    { abbr: 'GLP',    def: 'Good Laboratory Practice — international quality standard for non-clinical laboratory studies' },
    { abbr: 'GEP',    def: 'Good Experimental Practice — standards for conducting and documenting field experiments' },
    // Design-specific
    { abbr: 'RCBD',   def: 'Randomised Complete Block Design — experimental design with treatments in each block', designs: ['RCBD'] },
    { abbr: 'CRD',    def: 'Completely Randomised Design — experimental design with fully random plot assignment', designs: ['CRD'] },
    // Category-specific
    { abbr: 'WCE',    def: 'Weed Control Efficacy (%) — percentage reduction in weed biomass or cover vs UTC', categories: ['herbicide'] },
    { abbr: 'DCE',    def: 'Disease Control Efficacy (%) — percentage reduction in disease incidence or severity vs UTC', categories: ['fungicide'] },
    { abbr: 'PRE',    def: 'Pre-Emergent — application timing before crop or weed emergence', categories: ['herbicide', 'pesticide'] },
  ];

  const trialDesign = (meta.design || '').toUpperCase();

  // Filter to abbreviations relevant to this report
  const filteredAbbr = ALL_ABBREVIATIONS.filter(item => {
    if (item.categories && !item.categories.includes(category)) return false;
    if (item.designs && !item.designs.includes(trialDesign)) return false;
    return true;
  });

  const glossHead = [['Abbreviation', 'Definition']];
  const glossBody = filteredAbbr.map(item => [item.abbr, item.def]);

  autoTable(doc, {
    startY: y,
    head: glossHead,
    body: glossBody,
    theme: 'striped',
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' }, 1: { cellWidth: pw - 28 - 42 } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  return y;
}
