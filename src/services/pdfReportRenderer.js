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
 * Generates and triggers download of a professional PDF project report.
 *
 * @param {object} reportData  — ReportData object from reportDataBuilder.js
 * @param {object} [options]   — { includeWeather, includePhotos }
 */
export async function generateProjectPDF(reportData, options = {}) {
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

  // Full-width colored header band
  doc.setFillColor(...color);
  doc.rect(0, 0, pw, 50, 'F');

  // Project name — large white centered
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  const projectName = meta.projectName || 'Untitled Project';
  doc.text(projectName, pw / 2, 24, { align: 'center', maxWidth: pw - 20 });

  // Category badge + design label
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  const categoryLabel = (category.charAt(0).toUpperCase() + category.slice(1)) + ' Trial';
  doc.text(categoryLabel, pw / 2, 35, { align: 'center' });
  doc.setFontSize(9);
  const designLine = `Design: ${meta.designLabel || meta.design || 'RCBD'} — ${meta.treatments || '?'} Treatments × ${meta.replications || '?'} Replications`;
  doc.text(designLine, pw / 2, 42, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Metadata grid (2 columns, 10pt)
  let y = 62;
  doc.setFontSize(10);
  const appDates = Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—');
  const metaGrid = [
    ['Crop',           meta.crop || '—',           'Location',      meta.location || '—'],
    ['Investigator',   meta.investigator || '—',    'Organisation',  meta.organisation || '—'],
    ['Trial Period',   appDates,                    'Report Date',   meta.reportDate || '—'],
    ['GPS',            meta.gps || '—',             'Target Species',meta.targetSpecies || '—'],
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
      // PI-3: include analysis model in ANOVA heading for Pot Trial / CRD
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
