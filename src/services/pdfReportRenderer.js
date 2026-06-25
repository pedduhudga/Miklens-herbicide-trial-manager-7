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
    ['Crop',           meta.crop || '—',           'Variety',       meta.variety || '—'],
    ['Location',       meta.location || '—',        'Investigator',  meta.investigator || '—'],
    ['Organisation',   meta.organisation || '—',    'Prev. Crop',    meta.previousCrop || '—'],
    ['Irrigation',     meta.irrigationMethod || '—','Plant Popul.',  meta.plantPopulation || '—'],
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
 * Left column: x 14–96 mm  |  Right column: x 110–195 mm
 * Body 8 pt, section headings 9 pt bold, monochrome table headers.
 */
async function renderScientificJournal(reportData, options = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const meta      = reportData.meta || {};
  const monoColor = [80, 80, 80];
  const param     = reportData.primaryParameter || {};
  const anova     = param.anova || null;
  const postHoc   = param.postHocMethod || options.postHoc || 'LSD';
  const alpha     = options.alpha || 0.05;
  const paramLabel = param.label || param.key || 'Primary Parameter';

  // Shared heading helper (monochrome, 9 pt bold)
  function addJournalHeading(d, text, y2) {
    y2 = checkPageBreak(d, y2, ph, 14);
    d.setFontSize(9); d.setFont(undefined, 'bold'); d.setTextColor(0, 0, 0);
    d.text(text.toUpperCase(), 14, y2);
    d.setLineWidth(0.2); d.setDrawColor(0, 0, 0);
    d.line(14, y2 + 1.5, pw - 14, y2 + 1.5);
    d.setFont(undefined, 'normal'); d.setFontSize(8);
    return y2 + 7;
  }

  // Title block
  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text(meta.projectName || 'Trial Report', pw / 2, 18, { align: 'center', maxWidth: pw - 20 });
  doc.setFontSize(8); doc.setFont(undefined, 'normal');
  const byline = [meta.investigator, meta.organisation, meta.location].filter(Boolean).join(' · ');
  doc.text(byline, pw / 2, 25, { align: 'center', maxWidth: pw - 20 });
  doc.setLineWidth(0.4); doc.line(14, 28, pw - 14, 28);

  // Column definitions
  const colL = { x: 14,  w: 82 };
  const colR = { x: 110, w: 85 };
  let yL = 34, yR = 34;

  // Helper: write text in a column
  function colText(d, col, text, yRef, fs = 8) {
    d.setFontSize(fs);
    const lines = d.splitTextToSize(text, col.w);
    d.text(lines, col.x, yRef);
    return yRef + lines.length * (fs * 0.42) + 3;
  }

  // Abstract / executive summary — left column
  if (reportData.executiveSummary) {
    yL = addJournalHeading(doc, 'Abstract', yL);
    yL = colText(doc, colL, reportData.executiveSummary, yL);
  }

  // Methods — left column
  yL = addJournalHeading(doc, 'Materials & Methods', yL);
  const appDates = Array.isArray(meta.applicationDates) ? meta.applicationDates.join(', ') : (meta.applicationDates || '—');
  const methodSummary = `Design: ${meta.designLabel || meta.design || 'RCBD'}, ${meta.treatments || '?'} trt × ${meta.replications || '?'} rep. Applied: ${appDates}. Target: ${meta.targetSpecies || '—'}.`;
  yL = colText(doc, colL, methodSummary, yL);

  // Treatment list — left column compact table
  yL = addJournalHeading(doc, 'Treatments', yL);
  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  if (treatmentList.length > 0) {
    autoTable(doc, {
      startY: yL,
      head: [['#', 'Treatment', 'Dose']],
      body: treatmentList.map((t, i) => [i + 1, t.name || '—', t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—']),
      theme: 'plain',
      headStyles: { fillColor: monoColor, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      tableWidth: colL.w,
      margin: { left: colL.x, right: pw - colL.x - colL.w },
    });
    yL = doc.lastAutoTable.finalY + 4;
  }

  // Results — right column
  yR = addJournalHeading(doc, 'Results', yR);
  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);
  if (treatmentNames.length > 0) {
    const pVal0 = anova ? (anova.p ? anova.p[0] : null) : null;
    autoTable(doc, {
      startY: yR,
      head: [['Treatment', 'Mean', 'SE', 'CLD']],
      body: treatmentNames.map(t => {
        const m = paramMeansObj[t] || {};
        return [t, fmt(m.mean), fmt(m.se), m.cldLetter || '—'];
      }),
      theme: 'plain',
      headStyles: { fillColor: monoColor, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      tableWidth: colR.w,
      margin: { left: colR.x, right: pw - colR.x - colR.w },
    });
    yR = doc.lastAutoTable.finalY + 4;
  }

  // Bar chart — right column
  try {
    const barPng = await renderChartCanvas('bar', {
      labels: treatmentNames,
      datasets: [{ label: paramLabel, data: treatmentNames.map(t => (param.means?.[t]?.mean ?? 0)), backgroundColor: 'rgba(80,80,80,0.7)' }],
    }, {
      indexAxis: 'y', responsive: false, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 8 } } } },
    }, 820, 400);
    if (barPng) {
      yR = checkPageBreak(doc, yR, ph, 50);
      const imgH = colR.w * (400 / 820);
      doc.addImage(barPng, 'PNG', colR.x, yR, colR.w, imgH);
      yR += imgH + 4;
    }
  } catch (e) { console.warn('[PDF] SJ bar chart failed:', e?.message); }

  // ANOVA summary — right column
  if (anova && !anova.error) {
    yR = addJournalHeading(doc, 'ANOVA Summary', yR);
    yR = colText(doc, colR, anova.significance_label || '—', yR);
    const statsLine = `Grand Mean: ${fmt(anova.grandMean)}  CV%: ${fmt(anova.cv, 1)}  LSD5%: ${fmt(anova.lsd5)}`;
    yR = colText(doc, colR, statsLine, yR);
  }

  // Discussion / Conclusions — spanning full width at bottom
  const yBottom = Math.max(yL, yR) + 6;
  let y = checkPageBreak(doc, yBottom, ph, 30);
  doc.setLineWidth(0.2); doc.line(14, y, pw - 14, y); y += 5;
  y = addJournalHeading(doc, 'Conclusions', y);
  const conclusionLines = doc.splitTextToSize(
    reportData.conclusions || `Analysis of ${paramLabel} showed ${anova && anova.p?.[0] <= 0.05 ? 'significant' : 'no significant'} treatment differences (${postHoc}, α = ${alpha}).`,
    pw - 28
  );
  doc.setFontSize(8); doc.text(conclusionLines, 14, y);
  y += conclusionLines.length * 3.5 + 5;

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`${meta.projectName || 'Report'} | Page ${i} of ${pageCount}`, pw / 2, ph - 6, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);

  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `ScientificReport_${safeName(meta.projectName)}_${dateStr}.pdf`;
  doc.save(filename);
}

// ─── Template: Field Summary Card ────────────────────────────────────────────

/**
 * Single A4 page field summary card:
 *   - Large project name header
 *   - Top treatment callout box (CLD 'a', mean, tier badge)
 *   - First available photo (40×30 mm) if available
 *   - Stat strip: CV%, LSD 5%, Grand Mean
 *   - One-paragraph conclusion (≤ 100 words)
 */
async function renderFieldSummaryCard(reportData, options = {}) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const meta     = reportData.meta || {};
  const color    = getPrimaryColor(meta.category);
  const param    = reportData.primaryParameter || {};
  const anova    = param.anova || null;
  const paramLabel = param.label || param.key || 'Primary Parameter';
  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);

  // ── Header band
  doc.setFillColor(...color);
  doc.rect(0, 0, pw, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont(undefined, 'bold');
  doc.text(meta.projectName || 'Trial Summary', pw / 2, 16, { align: 'center', maxWidth: pw - 16 });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  const subtitle = [meta.crop, meta.location, meta.reportDate].filter(Boolean).join(' · ');
  doc.text(subtitle, pw / 2, 24, { align: 'center', maxWidth: pw - 16 });
  doc.setFontSize(8);
  doc.text(`${paramLabel} | ${meta.designLabel || meta.design || 'RCBD'} | ${meta.treatments || '?'} trt × ${meta.replications || '?'} rep`, pw / 2, 30, { align: 'center', maxWidth: pw - 16 });
  doc.setTextColor(0, 0, 0);

  let y = 44;

  // ── Top Treatment Callout Box
  const topTrt = treatmentNames.find(t => {
    const m = paramMeansObj[t] || {};
    return m.cldLetter && m.cldLetter.toLowerCase().startsWith('a');
  });
  if (topTrt) {
    const m = paramMeansObj[topTrt] || {};
    const mean = m.mean ?? 0;
    let tier = 'Poor';
    if (mean >= 80) tier = 'Excellent';
    else if (mean >= 60) tier = 'Good';
    else if (mean >= 40) tier = 'Fair';
    const tierFill = { Excellent: [204,255,204], Good: [255,255,204], Fair: [255,230,204], Poor: [255,204,204] }[tier];

    doc.setFillColor(245, 250, 255);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.6);
    doc.roundedRect(14, y, pw - 28, 24, 3, 3, 'FD');

    doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
    doc.text('TOP PERFORMING TREATMENT', 18, y + 7);
    doc.setFontSize(12); doc.setTextColor(0, 0, 0);
    doc.text(topTrt, 18, y + 14, { maxWidth: pw - 60 });
    doc.setFontSize(9);
    doc.text(`Mean: ${fmt(m.mean)} ± ${fmt(m.se)}  |  Efficacy: ${m.efficacy_pct != null ? fmt(m.efficacy_pct, 1) + '%' : '—'}  |  CLD: ${m.cldLetter || '—'}`, 18, y + 20);

    // Tier badge (right side)
    doc.setFillColor(...tierFill);
    doc.roundedRect(pw - 48, y + 6, 30, 12, 2, 2, 'F');
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text(tier, pw - 33, y + 14, { align: 'center' });
    doc.setFont(undefined, 'normal');

    y += 30;
  }

  // ── Photo (first available, 40×30 mm)
  const photos = Array.isArray(reportData.photos) ? reportData.photos : [];
  if (options.includePhotos !== false && photos.length > 0) {
    const ph_entry = photos[0];
    if (ph_entry?.url) {
      try {
        const imgData = await toBase64(ph_entry.url, 400);
        if (imgData) {
          doc.addImage(imgData, imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG', 14, y, 40, 30);
          doc.setFontSize(7);
          doc.text(ph_entry.treatment || 'Trial Photo', 14, y + 33, { maxWidth: 40 });
          y += 38;
        }
      } catch { /* skip */ }
    }
  }

  // ── Stat strip
  if (anova) {
    y += 2;
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
      doc.rect(bx, y, blockW - 2, 16, 'FD');
      doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text(label, bx + (blockW - 2) / 2, y + 6, { align: 'center' });
      doc.setFontSize(11); doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + (blockW - 2) / 2, y + 13, { align: 'center' });
    });
    y += 22;
  }

  // ── One-paragraph conclusion (≤ 100 words)
  y += 4;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(200, 200, 200);
  doc.rect(14, y, pw - 28, 40, 'FD');
  doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
  doc.text('SUMMARY', 18, y + 7);
  doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0); doc.setFontSize(9);

  let conclusionText = '';
  if (anova) {
    const cp = anova.p?.[0] ?? null;
    const topStr = topTrt || 'the top-ranked treatment';
    conclusionText = cp !== null && cp <= 0.05
      ? `${topStr} demonstrated the highest efficacy for ${paramLabel}, showing statistically significant differences between treatments. The trial confirms treatment effectiveness under the recorded conditions.`
      : `No statistically significant differences were detected for ${paramLabel}. Further replication is recommended.`;
  } else {
    conclusionText = `Statistical analysis could not be completed. Results should be interpreted descriptively only.`;
  }
  // Trim to ~100 words
  const words = conclusionText.split(/\s+/);
  if (words.length > 100) conclusionText = words.slice(0, 100).join(' ') + '…';

  const concLines = doc.splitTextToSize(conclusionText, pw - 40);
  doc.text(concLines, 18, y + 14, { maxWidth: pw - 40 });

  // Footer
  doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text(`${meta.projectName || 'Report'} · ${meta.reportDate || new Date().toISOString().slice(0,10)} · CONFIDENTIAL`, pw / 2, ph - 6, { align: 'center' });
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

  // ── 2. Trial Design & Methodology ────────────────────────────────────────
  y = 20;
  y = addSectionHeading(doc, nextSection('Trial Design & Methodology'), y, ph, color);
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
  y = addSectionHeading(doc, nextSection('Treatment List'), y, ph, color);
  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  const trtHead = [['#', 'Treatment / Formulation', 'Dosage', 'App. Timing', 'Replications', 'Role']];
  const trtBody = treatmentList.map((t, idx) => [
    String(idx + 1), t.name || '—',
    t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—',
    t.timing || '—', String(t.replicationCount || '—'),
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
  y = addSectionHeading(doc, nextSection(`Efficacy Results — ${paramLabel}`), y, ph, color);

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
    y = addSectionHeading(doc, nextSection('Phytotoxicity & Crop Safety'), y, ph, color);
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
    y = addSectionHeading(doc, nextSection('Time-Series — Treatment Means by DAA'), y, ph, color);
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
  y = addSectionHeading(doc, nextSection('Conclusions & Recommendations'), y, ph, color);
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
    y = addSectionHeading(doc, nextSection('Statistical Assumptions — Residual Diagnostics'), y, ph, color);
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

  // ── Investigator Signature Block (last page) ──────────────────────────────
  doc.addPage();
  y = 20;
  y = addSectionHeading(doc, nextSection('Signatures & Certification'), y, ph, color);
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
