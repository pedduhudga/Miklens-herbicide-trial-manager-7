/**
 * statsExporter.js
 *
 * Exports statistical analysis results from the Statistics page to PDF and Excel.
 * PDF uses jsPDF + jspdf-autotable following the same patterns as pdfReportRenderer.js.
 *
 * Exports:
 *   exportStatsPDF(results, options)  — 1-3 page PDF with full stats output
 *   exportStatsExcel(results, options) — Excel workbook (treatment means + ANOVA sheets)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Local helpers ─────────────────────────────────────────────────────────────

/** Safe toFixed with fallback dash */
function fmt(val, digits = 4) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

/** Format p-value: show exact to 4dp, mark very small values */
function fmtP(val) {
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return '—';
  if (n < 0.0001) return '< 0.0001';
  return n.toFixed(4);
}

/** Significance stars */
function sigStars(p) {
  const n = parseFloat(p);
  if (!Number.isFinite(n)) return '—';
  if (n <= 0.01) return '**';
  if (n <= 0.05) return '*';
  return 'NS';
}

/**
 * Sanitise a string for use in a filename:
 * replace spaces with underscores and strip characters outside [a-z0-9_-].
 */
function safeName(s) {
  return (s || 'unknown').trim().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/gi, '');
}

/**
 * Build the filename: stats_[ProjectName]_[TestType]_[YYYY-MM-DD].pdf
 */
function buildPdfFilename(options) {
  const project  = safeName(options.projectName  || 'Project');
  const testType = safeName(options.testType     || 'Stats');
  const date     = options.date
    ? String(options.date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `stats_${project}_${testType}_${date}.pdf`;
}

/**
 * Checks whether there is enough vertical space on the current page;
 * if not, adds a new page and resets y to 20.
 */
function checkPageBreak(doc, y, ph, needed = 30) {
  if (y + needed > ph - 16) {
    doc.addPage();
    return 20;
  }
  return y;
}

/**
 * Draws a coloured left-bar section heading.
 * Returns the new y position after the heading.
 */
function addSectionHeading(doc, text, y, ph, color) {
  y = checkPageBreak(doc, y, ph, 18);
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...color);
  doc.rect(14, y - 4, 3, 10, 'F');
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...color);
  doc.text(text, 19, y + 3);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(19, y + 5, pw - 14, y + 5);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  return y + 12;
}

// Brand colour: teal (matches herbicide default in pdfReportRenderer)
const BRAND_COLOR = [13, 148, 136];
const DARK_COLOR  = [60, 60, 60];

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate and download a 1-3 page PDF of statistical analysis results.
 *
 * @param {object} results  — StatResults from analysisUtils.js / statsUtils.js
 * @param {object} options  — { projectName, testType, metric, alpha, daa, transformation, date }
 *
 * If results.error is set, the function returns silently without downloading.
 */
export async function exportStatsPDF(results, options = {}) {
  // Guard: silently return when there is an error in results
  if (!results || results.error) return;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const color = BRAND_COLOR;

  let y = 0;

  // ── PAGE 1: Config header + Treatment means + ANOVA ────────────────────────

  // Coloured header band
  doc.setFillColor(...color);
  doc.rect(0, 0, pw, 36, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  const title = options.projectName ? `Statistical Results — ${options.projectName}` : 'Statistical Results';
  doc.text(title, pw / 2, 16, { align: 'center', maxWidth: pw - 20 });

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const subLine = [
    options.testType   ? `Test: ${options.testType}`   : null,
    options.metric     ? `Metric: ${options.metric}`   : null,
    options.alpha      ? `α = ${options.alpha}`        : null,
    options.daa != null ? `DAA: ${options.daa}`        : null,
  ].filter(Boolean).join('   |   ');
  if (subLine) doc.text(subLine, pw / 2, 27, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  y = 46;

  // ── Config metadata row ────────────────────────────────────────────────────
  {
    const configItems = [
      ['Project',        options.projectName      || '—'],
      ['Test Type',      options.testType         || '—'],
      ['Metric',         options.metric           || '—'],
      ['α level',        options.alpha != null ? String(options.alpha) : '0.05'],
      ['DAA',            options.daa != null ? String(options.daa) : '—'],
      ['Transformation', options.transformation   || 'none'],
      ['Date',           options.date             || new Date().toISOString().slice(0, 10)],
    ];
    const cols = 4;
    const cellW = (pw - 28) / cols;
    doc.setFontSize(9);
    let rowY = y;
    configItems.forEach(([label, val], i) => {
      const col = i % cols;
      const bx  = 14 + col * cellW;
      if (col === 0 && i > 0) rowY += 12;
      doc.setFillColor(245, 245, 245);
      doc.rect(bx, rowY - 1, cellW - 2, 10, 'F');
      doc.setFont(undefined, 'bold');
      doc.text(label + ':', bx + 2, rowY + 5);
      doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + 2 + doc.getTextWidth(label + ': '), rowY + 5, { maxWidth: cellW - 4 });
    });
    // Two rows maximum for config items
    y = rowY + 15;
  }

  // ── Section: Treatment Means with CLD ─────────────────────────────────────
  if (results.groups && Object.keys(results.groups).length > 0) {
    y = addSectionHeading(doc, 'Treatment Means', y, ph, color);

    const groupEntries = Object.entries(results.groups);
    // Sort by mean descending
    groupEntries.sort((a, b) => (parseFloat(b[1].mean) || 0) - (parseFloat(a[1].mean) || 0));

    const meansHead = [['Treatment', 'Mean', 'SE', 'n', 'CLD Letter']];
    const meansBody = groupEntries.map(([name, g]) => [
      name,
      fmt(g.mean, 4),
      fmt(g.se, 4),
      String(g.n ?? '—'),
      g.cldLetter || '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: meansHead,
      body: meansBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 60 } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // Footnote for CLD interpretation
    y = checkPageBreak(doc, y, ph, 10);
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, 'italic');
    doc.text(
      `Means followed by the same letter are not significantly different at the α = ${options.alpha || 0.05} level.`,
      14, y, { maxWidth: pw - 28 }
    );
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    y += 8;
  }

  // ── Section: ANOVA Table ───────────────────────────────────────────────────
  if (results.anova) {
    const anova = results.anova;
    y = checkPageBreak(doc, y, ph, 40);
    y = addSectionHeading(doc, 'ANOVA Table', y, ph, color);

    const anovaHead = [['Source', 'SS', 'df', 'MS', 'F-value', 'p-value', 'Sig.']];
    const anovaRows = [
      ['Treatments',
        fmt(anova.ssTreatments, 4),
        String(anova.dfTreatments ?? '—'),
        fmt(anova.msTreatments, 4),
        fmt(anova.fValue, 4),
        fmtP(anova.pValue),
        sigStars(anova.pValue),
      ],
      ['Error',
        fmt(anova.ssError, 4),
        String(anova.dfError ?? '—'),
        fmt(anova.msError, 4),
        '—', '—', '—',
      ],
      ['Total',
        fmt(anova.ssTotal, 4),
        String(anova.dfTotal ?? '—'),
        '—', '—', '—', '—',
      ],
    ];

    autoTable(doc, {
      startY: y,
      head: anovaHead,
      body: anovaRows,
      theme: 'grid',
      headStyles: { fillColor: DARK_COLOR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 0) {
          data.cell.styles.fillColor = [230, 240, 255];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Precision statistics (CV%, SEm±, LSD 5%, LSD 1%) ──────────────────────
  if (results.precision) {
    const prec = results.precision;
    y = checkPageBreak(doc, y, ph, 20);
    const precItems = [
      ['CV%',    prec.cv  != null ? fmt(prec.cv, 2) + '%' : '—'],
      ['SEm±',   fmt(prec.sem, 4)],
      ['LSD 5%', fmt(prec.lsd05, 4)],
      ['LSD 1%', fmt(prec.lsd01, 4)],
    ];
    const blockW = (pw - 28) / precItems.length;
    doc.setFontSize(9);
    precItems.forEach(([label, val], idx) => {
      const bx = 14 + idx * blockW;
      doc.setFillColor(240, 248, 255);
      doc.rect(bx, y, blockW - 2, 14, 'F');
      doc.setFont(undefined, 'bold');
      doc.text(label, bx + (blockW - 2) / 2, y + 5, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + (blockW - 2) / 2, y + 11, { align: 'center' });
    });
    y += 20;
  }

  // ── Section: Assumptions Validation (4 tests) ─────────────────────────────
  if (results.assumptions) {
    const asmp = results.assumptions;
    y = checkPageBreak(doc, y, ph, 40);
    y = addSectionHeading(doc, 'Assumptions Validation', y, ph, color);

    const asmpHead = [['Test', 'Statistic', 'p-value', 'Result']];
    const asmpRows = [];

    // Jarque-Bera
    if (asmp.jarqueBera) {
      const jb = asmp.jarqueBera;
      asmpRows.push([
        'Jarque-Bera (Normality)',
        fmt(jb.statistic, 4),
        fmtP(jb.pValue),
        jb.passed === true ? 'PASS' : jb.passed === false ? 'FAIL' : '—',
      ]);
    }

    // Shapiro-Wilk
    if (asmp.shapiroWilk) {
      const sw = asmp.shapiroWilk;
      asmpRows.push([
        sw.note ? `Shapiro-Wilk — ${sw.note}` : 'Shapiro-Wilk (Normality)',
        sw.W != null ? fmt(sw.W, 4) : '—',
        sw.pValue != null ? fmtP(sw.pValue) : '—',
        sw.passed === true ? 'PASS' : sw.passed === false ? 'FAIL' : '—',
      ]);
    }

    // Levene
    if (asmp.levene) {
      const lv = asmp.levene;
      asmpRows.push([
        "Levene's (Homogeneity of Variance)",
        fmt(lv.statistic, 4),
        fmtP(lv.pValue),
        lv.passed === true ? 'PASS' : lv.passed === false ? 'FAIL' : '—',
      ]);
    }

    // Bartlett
    if (asmp.bartlett) {
      const bt = asmp.bartlett;
      asmpRows.push([
        "Bartlett's (Homogeneity of Variance)",
        fmt(bt.chiSquared, 4),
        fmtP(bt.pValue),
        bt.passed === true ? 'PASS' : bt.passed === false ? 'FAIL' : '—',
      ]);
    }

    if (asmpRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: asmpHead,
        body: asmpRows,
        theme: 'striped',
        headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const cell = data.cell.raw;
            if (cell === 'PASS') data.cell.styles.textColor = [22, 163, 74];
            if (cell === 'FAIL') data.cell.styles.textColor = [220, 38, 38];
          }
        },
        columnStyles: { 0: { cellWidth: 70 } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // ── Section: Effect Sizes ──────────────────────────────────────────────────
  if (results.effectSizes) {
    const es = results.effectSizes;
    y = checkPageBreak(doc, y, ph, 24);
    y = addSectionHeading(doc, 'Effect Sizes', y, ph, color);

    const esItems = [
      ['η² (Eta²)',      es.etaSquared   != null ? fmt(es.etaSquared, 4)   : '—'],
      ['ω² (Omega²)',    es.omegaSquared != null ? fmt(es.omegaSquared, 4) : '—'],
      ["Cohen's f",      es.cohensF      != null ? fmt(es.cohensF, 4)      : '—'],
    ];
    const blockW2 = (pw - 28) / esItems.length;
    doc.setFontSize(9);
    esItems.forEach(([label, val], idx) => {
      const bx = 14 + idx * blockW2;
      doc.setFillColor(248, 245, 255);
      doc.rect(bx, y, blockW2 - 2, 14, 'F');
      doc.setFont(undefined, 'bold');
      doc.text(label, bx + (blockW2 - 2) / 2, y + 5, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.text(String(val), bx + (blockW2 - 2) / 2, y + 11, { align: 'center' });
    });
    y += 18;

    // Interpretation label
    if (es.interpretation) {
      y = checkPageBreak(doc, y, ph, 10);
      doc.setFontSize(9);
      doc.setFont(undefined, 'italic');
      doc.setTextColor(80, 80, 80);
      let interpText = '';
      if (typeof es.interpretation === 'string') {
        interpText = `Interpretation: ${es.interpretation}`;
      } else if (typeof es.interpretation === 'object') {
        interpText = Object.entries(es.interpretation)
          .map(([k, v]) => `${k}: ${v}`)
          .join('   |   ');
      }
      if (interpText) doc.text(interpText, 14, y, { maxWidth: pw - 28 });
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);
      y += 8;
    }
  }

  // ── Section: Pairwise Comparisons ─────────────────────────────────────────
  if (Array.isArray(results.comparisons) && results.comparisons.length > 0) {
    y = checkPageBreak(doc, y, ph, 40);
    y = addSectionHeading(doc, 'Pairwise Comparisons', y, ph, color);

    // Show Bonferroni adjusted alpha if available
    if (results.postHoc?.adjustedAlpha != null) {
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Adjusted α = ${fmtP(results.postHoc.adjustedAlpha)}` +
        (results.postHoc.m != null ? ` (m = ${results.postHoc.m} comparisons)` : ''),
        14, y
      );
      doc.setTextColor(0, 0, 0);
      y += 6;
    }

    const compHead = [['Treatment 1', 'Treatment 2', 'Difference', 'p-value', 'Significant']];
    const compBody = results.comparisons.map(c => [
      c.trt1 ?? c.treatmentA ?? '—',
      c.trt2 ?? c.treatmentB ?? '—',
      fmt(c.diff ?? c.difference, 4),
      fmtP(c.pValue),
      c.significant ? 'Yes' : 'No',
    ]);

    autoTable(doc, {
      startY: y,
      head: compHead,
      body: compBody,
      theme: 'striped',
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const sig = compBody[data.row.index]?.[4];
          if (sig === 'Yes') data.cell.styles.textColor = [220, 38, 38];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Footer on every page ────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${p} of ${totalPages}   |   ${options.projectName || ''}   |   Generated: ${new Date().toISOString().slice(0, 10)}`,
      pw / 2,
      ph - 8,
      { align: 'center' }
    );
    doc.setTextColor(0, 0, 0);
  }

  // ── Save / download ─────────────────────────────────────────────────────────
  const filename = buildPdfFilename(options);
  doc.save(filename);
}

// ─── Excel export ──────────────────────────────────────────────────────────────

/**
 * Generate and download an Excel workbook (.xlsx) with two sheets:
 *   Sheet 1 — Treatment means with CLD letters
 *   Sheet 2 — Full ANOVA table
 *
 * Requires ExcelJS to be available.
 *
 * @param {object} results  — StatResults from analysisUtils.js / statsUtils.js
 * @param {object} options  — { projectName, testType, metric, alpha, daa, transformation, date }
 *
 * If results.error is set, the function returns silently without downloading.
 */
export async function exportStatsExcel(results, options = {}) {
  if (!results || results.error) return;

  // Lazy-load ExcelJS to keep the module lightweight when not used
  let ExcelJS;
  try {
    const mod = await import('exceljs');
    ExcelJS = mod.default ?? mod;
  } catch (e) {
    console.error('[statsExporter] ExcelJS not available:', e);
    return;
  }

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'Miklens Herbicide Trial Manager';
  workbook.created  = new Date();

  const headerFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  const headerFont   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const boldFont     = { bold: true, size: 10 };
  const numFmt       = '0.0000';

  // ── Sheet 1: Treatment Means ────────────────────────────────────────────────
  const ws1 = workbook.addWorksheet('Treatment Means');
  ws1.columns = [
    { header: 'Treatment',  key: 'name',      width: 30 },
    { header: 'Mean',       key: 'mean',       width: 14 },
    { header: 'SE',         key: 'se',         width: 14 },
    { header: 'n',          key: 'n',          width: 8  },
    { header: 'CLD Letter', key: 'cldLetter',  width: 12 },
  ];
  // Style header row
  ws1.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center' };
  });

  if (results.groups) {
    const entries = Object.entries(results.groups)
      .sort((a, b) => (parseFloat(b[1].mean) || 0) - (parseFloat(a[1].mean) || 0));
    entries.forEach(([name, g]) => {
      const row = ws1.addRow({
        name,
        mean: parseFloat(g.mean) || 0,
        se:   parseFloat(g.se)   || 0,
        n:    g.n ?? 0,
        cldLetter: g.cldLetter || '',
      });
      row.getCell('mean').numFmt = numFmt;
      row.getCell('se').numFmt   = numFmt;
    });
  }

  // Config metadata rows at the bottom
  ws1.addRow([]);
  ws1.addRow(['Configuration']);
  ws1.lastRow.getCell(1).font = boldFont;
  const configMeta = [
    ['Project',        options.projectName      || ''],
    ['Test Type',      options.testType         || ''],
    ['Metric',         options.metric           || ''],
    ['α level',        options.alpha            ?? 0.05],
    ['DAA',            options.daa              ?? ''],
    ['Transformation', options.transformation   || 'none'],
    ['Date',           options.date             || new Date().toISOString().slice(0, 10)],
  ];
  configMeta.forEach(([k, v]) => ws1.addRow([k, v]));

  // ── Sheet 2: ANOVA Table ────────────────────────────────────────────────────
  const ws2 = workbook.addWorksheet('ANOVA Table');
  ws2.columns = [
    { header: 'Source',  key: 'source',  width: 18 },
    { header: 'SS',      key: 'ss',      width: 16 },
    { header: 'df',      key: 'df',      width: 8  },
    { header: 'MS',      key: 'ms',      width: 16 },
    { header: 'F-value', key: 'f',       width: 12 },
    { header: 'p-value', key: 'p',       width: 12 },
    { header: 'Sig.',    key: 'sig',     width: 8  },
  ];
  ws2.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center' };
  });

  if (results.anova) {
    const a = results.anova;
    const anovaRows2 = [
      { source: 'Treatments', ss: a.ssTreatments, df: a.dfTreatments, ms: a.msTreatments, f: a.fValue,  p: a.pValue, sig: sigStars(a.pValue) },
      { source: 'Error',      ss: a.ssError,      df: a.dfError,      ms: a.msError,      f: null,      p: null,     sig: '' },
      { source: 'Total',      ss: a.ssTotal,      df: a.dfTotal,      ms: null,           f: null,      p: null,     sig: '' },
    ];
    anovaRows2.forEach(r => {
      const row = ws2.addRow(r);
      ['ss','ms','f','p'].forEach(k => {
        if (r[k] != null) row.getCell(k).numFmt = numFmt;
      });
    });
  }

  // Precision stats
  if (results.precision) {
    const prec = results.precision;
    ws2.addRow([]);
    ws2.addRow(['Precision Statistics']);
    ws2.lastRow.getCell(1).font = boldFont;
    ws2.addRow(['CV%',    prec.cv  != null ? parseFloat(prec.cv)   : '']);
    ws2.addRow(['SEm±',   prec.sem != null ? parseFloat(prec.sem)  : '']);
    ws2.addRow(['LSD 5%', prec.lsd05 != null ? parseFloat(prec.lsd05) : '']);
    ws2.addRow(['LSD 1%', prec.lsd01 != null ? parseFloat(prec.lsd01) : '']);
  }

  // Assumptions validation (JB, SW, Levene, Bartlett)
  if (results.assumptions) {
    const asmp = results.assumptions;
    ws2.addRow([]);
    const asmpHeadRow = ws2.addRow(['Assumptions Validation']);
    asmpHeadRow.getCell(1).font = boldFont;

    // Sub-header row: Test | Statistic | p-value | Pass/Fail
    const asmpColHeadRow = ws2.addRow(['Test', 'Statistic', 'p-value', 'Pass/Fail']);
    asmpColHeadRow.eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center' };
    });

    const asmpEntries = [];
    if (asmp.jarqueBera) {
      const jb = asmp.jarqueBera;
      asmpEntries.push({
        test: 'Jarque-Bera (Normality)',
        stat: jb.statistic != null ? parseFloat(jb.statistic) : '',
        p:    jb.pValue    != null ? parseFloat(jb.pValue)    : '',
        pass: jb.passed === true ? 'PASS' : jb.passed === false ? 'FAIL' : '—',
      });
    }
    if (asmp.shapiroWilk) {
      const sw = asmp.shapiroWilk;
      asmpEntries.push({
        test: sw.note ? `Shapiro-Wilk — ${sw.note}` : 'Shapiro-Wilk (Normality)',
        stat: sw.W      != null ? parseFloat(sw.W)      : '',
        p:    sw.pValue != null ? parseFloat(sw.pValue) : '',
        pass: sw.passed === true ? 'PASS' : sw.passed === false ? 'FAIL' : '—',
      });
    }
    if (asmp.levene) {
      const lv = asmp.levene;
      asmpEntries.push({
        test: "Levene's (Homogeneity of Variance)",
        stat: lv.statistic != null ? parseFloat(lv.statistic) : '',
        p:    lv.pValue    != null ? parseFloat(lv.pValue)    : '',
        pass: lv.passed === true ? 'PASS' : lv.passed === false ? 'FAIL' : '—',
      });
    }
    if (asmp.bartlett) {
      const bt = asmp.bartlett;
      asmpEntries.push({
        test: "Bartlett's (Homogeneity of Variance)",
        stat: bt.chiSquared != null ? parseFloat(bt.chiSquared) : '',
        p:    bt.pValue     != null ? parseFloat(bt.pValue)     : '',
        pass: bt.passed === true ? 'PASS' : bt.passed === false ? 'FAIL' : '—',
      });
    }

    asmpEntries.forEach(e => {
      const row = ws2.addRow([e.test, e.stat, e.p, e.pass]);
      if (typeof e.stat === 'number') row.getCell(2).numFmt = numFmt;
      if (typeof e.p    === 'number') row.getCell(3).numFmt = numFmt;
      // Colour PASS/FAIL cell
      const passCell = row.getCell(4);
      if (e.pass === 'PASS') passCell.font = { color: { argb: 'FF16A34A' } };
      if (e.pass === 'FAIL') passCell.font = { color: { argb: 'FFDC2626' } };
    });
  }

  // Effect sizes
  if (results.effectSizes) {
    const es = results.effectSizes;
    ws2.addRow([]);
    ws2.addRow(['Effect Sizes']);
    ws2.lastRow.getCell(1).font = boldFont;
    ws2.addRow(['η² (Eta²)',   es.etaSquared   != null ? parseFloat(es.etaSquared)   : '']);
    ws2.addRow(['ω² (Omega²)', es.omegaSquared != null ? parseFloat(es.omegaSquared) : '']);
    ws2.addRow(["Cohen's f",   es.cohensF      != null ? parseFloat(es.cohensF)      : '']);
  }

  // ── Trigger download ────────────────────────────────────────────────────────
  const project  = safeName(options.projectName  || 'Project');
  const testType = safeName(options.testType     || 'Stats');
  const date     = options.date
    ? String(options.date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const xlsxFilename = `stats_${project}_${testType}_${date}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = xlsxFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
