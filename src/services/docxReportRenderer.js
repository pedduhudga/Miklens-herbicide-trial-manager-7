/**
 * docxReportRenderer.js
 *
 * Professional DOCX report generator for the advanced reporting pipeline.
 * Accepts a ReportData object (from reportDataBuilder.js) and produces
 * a fully formatted multi-section Word document using the docx library.
 *
 * DO NOT import from trialReports.js to avoid circular dependencies.
 * All helpers are implemented locally.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  WidthType,
  TableLayoutType,
} from 'docx';

// ─── Local helpers ─────────────────────────────────────────────────────────────

/** Sanitises a string for use in a filename. */
function safeName(s) {
  return (s || 'report').replace(/[^a-z0-9_\-]/gi, '_');
}

/** Safe toFixed with fallback dash. */
function fmt(val, d = 2) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

/** Significance stars. */
function sigStars(p) {
  if (p === null || p === undefined) return '?';
  if (p <= 0.01) return '**';
  if (p <= 0.05) return '*';
  return 'NS';
}

/**
 * Builds a reusable docx Table from header strings and row data arrays.
 * Supports control-row highlighting (light yellow) and alternating row shading.
 *
 * @param {string[]}   headers            — column header labels
 * @param {string[][]} rows               — array of string arrays (one per row)
 * @param {object}     [opts]
 * @param {number[]}   [opts.controlRowIndices=[]]  — row indices to shade as control
 * @param {string}     [opts.headerShading='2C3E50'] — header fill hex (no #)
 * @returns {Table}
 */
function makeTable(headers, rows, { controlRowIndices = [], headerShading = '2C3E50' } = {}) {
  const headerCells = headers.map(h =>
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 }),
          ],
        }),
      ],
      shading: { type: ShadingType.CLEAR, fill: headerShading },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    })
  );

  const dataRows = rows.map((row, rowIdx) => {
    const isControl = controlRowIndices.includes(rowIdx);
    const isAlt = rowIdx % 2 === 0;
    const fillColor = isControl ? 'FFFDE7' : isAlt ? 'F8F9FA' : 'FFFFFF';

    return new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: String(cell ?? '—'), size: 18 })],
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: fillColor },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
        })
      ),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headerCells, tableHeader: true }),
      ...dataRows,
    ],
    layout: TableLayoutType.AUTOFIT,
  });
}

/** Creates a heading Paragraph for a given HeadingLevel. */
function heading(text, level) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
  });
}

/** Creates a standard body text Paragraph. */
function bodyPara(text, { italic = false, size = 22, color, alignment } = {}) {
  const run = new TextRun({ text: String(text), italic, size, color });
  const paraOpts = { children: [run] };
  if (alignment) paraOpts.alignment = alignment;
  return new Paragraph(paraOpts);
}

/** Creates an empty spacer Paragraph. */
function spacer() {
  return new Paragraph({ children: [new TextRun({ text: '' })] });
}

/** Creates a page-break Paragraph. */
function pageBreak() {
  return new Paragraph({ pageBreakBefore: true, children: [] });
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates and triggers download of a professional DOCX project report.
 *
 * @param {object} reportData  — ReportData object from reportDataBuilder.js
 * @param {object} [options]   — { includeWeather, includePhotos, alpha, postHoc }
 */
export async function generateProjectDocx(reportData, options = {}) {
  const meta      = reportData.meta || {};
  const param     = reportData.primaryParameter || {};
  const anova     = param.anova || null;
  const postHoc   = param.postHocMethod || options.postHoc || 'LSD';
  const alpha     = options.alpha || 0.05;
  const category  = (meta.category || 'herbicide');
  const paramLabel = param.label || param.key || 'Primary Parameter';
  const paramKey   = param.key || '';
  const paramMeansObj = param.means || {};
  const treatmentNames = Object.keys(paramMeansObj);

  const appDates = Array.isArray(meta.applicationDates)
    ? meta.applicationDates.join(', ')
    : (meta.applicationDates || '—');

  // ─── Title Page ─────────────────────────────────────────────────────────────

  const titleElements = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: meta.projectName || 'Untitled Project',
          bold: true,
          size: 64, // 32pt in half-points
        }),
      ],
    }),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${(category.charAt(0).toUpperCase() + category.slice(1))} Trial — ${meta.designLabel || meta.design || 'RCBD'}`,
          size: 28, // 14pt
        }),
      ],
    }),
    spacer(),
    bodyPara(`Crop: ${meta.crop || '—'}`, { size: 22 }),
    bodyPara(`Location: ${meta.location || '—'}`, { size: 22 }),
    bodyPara(`Investigator: ${meta.investigator || '—'}`, { size: 22 }),
    bodyPara(`Organisation: ${meta.organisation || '—'}`, { size: 22 }),
    bodyPara(`Trial Period: ${appDates}`, { size: 22 }),
    bodyPara(`Report Date: ${meta.reportDate || new Date().toISOString().slice(0, 10)}`, { size: 22 }),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'CONFIDENTIAL — For Research Purposes Only',
          italic: true,
          color: '888888',
          size: 20,
        }),
      ],
    }),
    pageBreak(),
  ];

  // ─── Task 41: Executive Summary ─────────────────────────────────────────────
  const execSummaryElements = reportData.executiveSummary ? [
    heading('1. Executive Summary', HeadingLevel.HEADING_2),
    spacer(),
    bodyPara(reportData.executiveSummary),
    spacer(),
  ] : [];

  // ─── Section 2: Trial Design & Methodology ──────────────────────────────────

  const nTrt   = meta.treatments  || '?';
  const nRep   = meta.replications || '?';
  const nPlots = (Number(nTrt) && Number(nRep)) ? Number(nTrt) * Number(nRep) : '?';
  const target = meta.targetSpecies || '—';

  const section1Elements = [
    heading('2. Trial Design & Methodology', HeadingLevel.HEADING_2),
    spacer(),
    bodyPara(
      `The trial was conducted using a ${meta.designLabel || meta.design || 'RCBD'} with ${nTrt} treatment(s) ` +
      `and ${nRep} replication(s), totalling ${nPlots} experimental plot(s). ` +
      (meta.analysisModel && meta.analysisModel !== 'RCBD' ? `Statistical analysis model: ${meta.analysisModel}. ` : '') +
      `Applications were made on: ${appDates}. Target species / pest: ${target}.`
    ),
    spacer(),
  ];

  // ─── Section 2: Treatment List ───────────────────────────────────────────────

  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];
  const controlRowIndices = treatmentList
    .map((t, i) => (t.isControl ? i : -1))
    .filter(i => i !== -1);

  const trtRows = treatmentList.map((t, idx) => [
    String(idx + 1),
    t.name || '—',
    t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—',
    t.timing || '—',
    String(t.replicationCount || '—'),
    t.isControl ? 'UTC / Control' : (t.isStandard ? 'Standard' : 'Treatment'),
  ]);

  const section2Elements = [
    heading('3. Treatment List', HeadingLevel.HEADING_2),
    spacer(),
    makeTable(
      ['#', 'Treatment / Formulation', 'Dosage', 'Application Timing', 'Replications', 'Role'],
      trtRows,
      { controlRowIndices }
    ),
    spacer(),
  ];

  // ─── Section 3: Raw Observation Data ────────────────────────────────────────

  const rawMatrix = reportData.rawMatrix || {};
  const allRepIds = [];
  for (const tName of Object.keys(rawMatrix)) {
    for (const repId of Object.keys(rawMatrix[tName] || {})) {
      if (!allRepIds.includes(repId)) allRepIds.push(repId);
    }
  }

  const daaLabel = (meta.daa !== undefined && meta.daa !== null) ? String(meta.daa) : 'Final';

  let section3Elements = [
    heading('4. Raw Observation Data', HeadingLevel.HEADING_2),
    spacer(),
    bodyPara(
      `Primary parameter: ${paramLabel}. Observation timing: ${daaLabel} DAA.`
    ),
    spacer(),
  ];

  if (allRepIds.length > 0 && Object.keys(rawMatrix).length > 0) {
    const rawHeaders = ['Treatment', ...allRepIds, 'Mean', 'SD'];
    const rawRows = Object.keys(rawMatrix).map(tName => {
      const repData = rawMatrix[tName] || {};
      const repVals = allRepIds.map(rid => {
        const row = repData[rid];
        const v = row ? row[paramKey] : undefined;
        return (v !== null && v !== undefined) ? fmt(v) : '—';
      });
      const mObj = paramMeansObj[tName] || {};
      return [
        tName,
        ...repVals,
        mObj.mean !== null && mObj.mean !== undefined ? fmt(mObj.mean) : '—',
        mObj.sd   !== null && mObj.sd   !== undefined ? fmt(mObj.sd)   : '—',
      ];
    });

    section3Elements.push(makeTable(rawHeaders, rawRows));
  } else {
    section3Elements.push(bodyPara('No raw observation data available.', { color: '888888' }));
  }
  section3Elements.push(spacer());

  // ─── Section 4: Treatment Means & Statistics ────────────────────────────────

  const pVal0 = anova ? (anova.p ? anova.p[0] : null) : null;
  const sig   = sigStars(pVal0);
  // PI-4: phytotoxicity / adverse-effect params excluded from efficacy display
  const efficacyExcluded = param.efficacyExcluded === true;
  const efficacyColHeader = efficacyExcluded ? 'Efficacy% (N/A)' : 'Efficacy (%)';

  const meansRows = treatmentNames.map(tName => {
    const m = paramMeansObj[tName] || {};
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

  const section4Elements = [
    heading('5. Treatment Means & Statistics', HeadingLevel.HEADING_2),
    spacer(),
  ];

  if (meansRows.length > 0) {
    section4Elements.push(
      makeTable(
        ['Treatment', 'n', 'Mean', 'SD', 'SE', efficacyColHeader, 'CLD', 'Sig.'],
        meansRows
      )
    );
    section4Elements.push(spacer());

    // PI-4: footnote for excluded efficacy params
    if (efficacyExcluded) {
      section4Elements.push(
        bodyPara(`* ${paramLabel} is an adverse-effect parameter. Efficacy % is not scientifically applicable.`, { italic: true, size: 16 })
      );
    }

    // ANOVA source table
    if (anova && !anova.error) {
      // PI-3: include analysis model in ANOVA heading
      const modelNote = meta.analysisModel && meta.analysisModel !== 'RCBD'
        ? ` (${meta.analysisModel} model)`
        : '';
      section4Elements.push(
        new Paragraph({
          children: [new TextRun({ text: `ANOVA Source Table${modelNote}`, bold: true, size: 22 })],
        })
      );
      section4Elements.push(spacer());

      const sources = anova.source || [];
      const anovaRows = sources.map((src, i) => [
        src,
        fmt(anova.ss?.[i]),
        String(anova.df?.[i] ?? '—'),
        anova.ms?.[i] !== null && anova.ms?.[i] !== undefined ? fmt(anova.ms[i]) : '—',
        anova.f?.[i]  !== null && anova.f?.[i]  !== undefined ? fmt(anova.f[i], 3)  : '—',
        anova.p?.[i]  !== null && anova.p?.[i]  !== undefined ? fmt(anova.p[i], 4)  : '—',
      ]);

      // Highlight Treatment row (index 0) light green if p < 0.05
      const anovaTreatColorIndices = (pVal0 !== null && pVal0 <= 0.05) ? [0] : [];

      // Build ANOVA table manually to support the green treatment row highlight
      const anovaHeaderCells = ['Source', 'SS', 'df', 'MS', 'F', 'p'].map(h =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })],
          shading: { type: ShadingType.CLEAR, fill: '2C3E50' },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
        })
      );

      const anovaDataRows = anovaRows.map((row, rowIdx) => {
        const isGreenRow = anovaTreatColorIndices.includes(rowIdx);
        const fillColor = isGreenRow ? 'E8F5E9' : (rowIdx % 2 === 0 ? 'F8F9FA' : 'FFFFFF');
        return new TableRow({
          children: row.map(cell =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? '—'), size: 18 })] })],
              shading: { type: ShadingType.CLEAR, fill: fillColor },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
            })
          ),
        });
      });

      section4Elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: anovaHeaderCells, tableHeader: true }), ...anovaDataRows],
          layout: TableLayoutType.AUTOFIT,
        })
      );
      section4Elements.push(spacer());

      // Stats block: Grand Mean | CV% | SEm± | LSD 5% | LSD 1%
      const statsRows = [[
        fmt(anova.grandMean),
        anova.cv !== null && anova.cv !== undefined ? fmt(anova.cv, 1) + '%' : '—',
        fmt(anova.sem),
        fmt(anova.lsd5),
        fmt(anova.lsd1),
      ]];
      section4Elements.push(
        makeTable(
          ['Grand Mean', 'CV%', 'SEm±', 'LSD 5%', 'LSD 1%'],
          statsRows
        )
      );
      section4Elements.push(spacer());

      // Significance statement
      section4Elements.push(
        bodyPara(anova.significance_label || '—', { italic: true })
      );

      // LSD footnote
      section4Elements.push(
        bodyPara(
          `Means followed by the same letter are not significantly different at the ` +
          `${Math.round(alpha * 100)}% level of significance using ${(postHoc || 'LSD').toUpperCase()}.`,
          { italic: true, size: 16 }
        )
      );
    } else {
      section4Elements.push(
        bodyPara('Insufficient data for ANOVA.', { color: '888888' })
      );
    }
  }
  section4Elements.push(spacer());

  // ─── Task 42: Treatment Ranking Table ──────────────────────────────────────
  const section4bElements = [];
  {
    const controlNames = treatmentNames.filter(t => {
      const n = t.toLowerCase();
      return n.includes('control') || n.includes('untreated') || n.includes('check');
    });
    const ranked = [...treatmentNames]
      .sort((a, b) => (paramMeansObj[b]?.mean ?? -Infinity) - (paramMeansObj[a]?.mean ?? -Infinity))
      .filter(t => !controlNames.includes(t));
    const allRanked = [...ranked, ...controlNames];

    if (allRanked.length > 0) {
      section4bElements.push(
        new Paragraph({ children: [new TextRun({ text: 'Treatment Ranking', bold: true, size: 22 })] }),
        spacer()
      );
      const tierShadings = {
        Excellent: 'CCFFCC', Good: 'FFFFCC', Fair: 'FFE6CC', Poor: 'FFCCCC', '—': 'FFFFFF',
      };
      const rankRows = allRanked.map((trt, idx) => {
        const m = paramMeansObj[trt] || {};
        const isCtrl = controlNames.includes(trt);
        const mean = m.mean ?? 0;
        let tier = '—';
        if (!isCtrl) {
          if (mean >= 80) tier = 'Excellent';
          else if (mean >= 60) tier = 'Good';
          else if (mean >= 40) tier = 'Fair';
          else tier = 'Poor';
        }
        const tierShading = tierShadings[tier] || 'FFFFFF';
        return [
          isCtrl ? 'UTC' : String(idx + 1),
          trt,
          `${fmt(m.mean)} ± ${fmt(m.se)}`,
          m.efficacy_pct != null ? fmt(m.efficacy_pct, 1) : '—',
          m.cldLetter || '—',
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: tier, bold: true, size: 18 })] })],
            shading: { type: ShadingType.CLEAR, fill: tierShading },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
          }),
        ];
      }).map(row => {
        const cells = row.slice(0, 5).map(val => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(val), size: 18 })] })],
          shading: { type: ShadingType.CLEAR, fill: 'F8F9FA' },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
        }));
        cells.push(row[5]);
        return new TableRow({ children: cells });
      });

      const rankHeaderCells = ['Rank', 'Treatment', 'Mean ± SE', 'Efficacy %', 'CLD', 'Tier'].map(h =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })],
          shading: { type: ShadingType.CLEAR, fill: '2C3E50' },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
        })
      );

      section4bElements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: rankHeaderCells, tableHeader: true }), ...rankRows],
          layout: TableLayoutType.AUTOFIT,
        }),
        spacer()
      );
    }
  }

  // ─── Section 6: Time-Series Means ───────────────────────────────────────────

  const timeSeries = reportData.timeSeries || {};
  const daas       = Array.isArray(timeSeries.daas) ? timeSeries.daas : [];

  const section5Elements = [];
  if (daas.length >= 2) {
    const tsHeaders = ['Treatment', ...daas.map(d => `${d} DAA`)];
    const tsRows = treatmentNames.map(tName => {
      const row = [tName];
      daas.forEach(d => {
        const cell = timeSeries[tName] ? timeSeries[tName][d] : null;
        row.push(cell && cell.mean !== null && cell.mean !== undefined ? fmt(cell.mean) : '—');
      });
      return row;
    });

    section5Elements.push(
      heading('6. Time-Series Means', HeadingLevel.HEADING_2),
      spacer(),
      makeTable(tsHeaders, tsRows),
      spacer()
    );
  }

  // ─── Section 6: Additional Parameters ───────────────────────────────────────

  const allParams = Array.isArray(reportData.parameters) ? reportData.parameters : [];
  const additionalParams = allParams.filter(
    p => p.key !== param.key && p.anova && !p.anova.error
  );

  const section6Elements = [];
  if (additionalParams.length > 0) {
    for (const ap of additionalParams) {
      const apMeans = ap.means || {};
      const apTreatments = Object.keys(apMeans);

      section6Elements.push(
        heading(`Parameter: ${ap.label}`, HeadingLevel.HEADING_3),
        spacer()
      );

      if (apTreatments.length > 0) {
        const compactRows = apTreatments.map(tName => {
          const m = apMeans[tName] || {};
          return [tName, fmt(m.mean), fmt(m.sd), String(m.n ?? '—'), m.cldLetter || '—'];
        });

        section6Elements.push(
          makeTable(['Treatment', 'Mean', 'SD', 'n', 'CLD'], compactRows),
          spacer()
        );

        if (ap.anova) {
          const af  = ap.anova.f ? ap.anova.f[0] : null;
          const ap_p = ap.anova.p ? ap.anova.p[0] : null;
          section6Elements.push(
            bodyPara(
              `F = ${fmt(af, 3)}, p = ${fmt(ap_p, 4)} (${ap.anova.significance_label || '—'})`,
              { size: 18 }
            ),
            spacer()
          );
        }
      }
    }
  }

  // ─── Section 7: Yield Analysis ───────────────────────────────────────────────

  const section7Elements = [];
  const yieldData  = reportData.yield;
  const yieldMeans = yieldData && yieldData.means && Object.keys(yieldData.means).length > 0
    ? yieldData.means
    : null;

  if (yieldMeans) {
    const yAnova      = yieldData.anova || null;
    const yPVal0      = yAnova ? (yAnova.p ? yAnova.p[0] : null) : null;
    const ySig        = sigStars(yPVal0);
    const yTreatments = Object.keys(yieldMeans);

    const yieldRows = yTreatments.map(tName => {
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

    section7Elements.push(
      heading('7. Yield Analysis', HeadingLevel.HEADING_2),
      spacer(),
      makeTable(
        ['Treatment', 'n', 'Mean', 'SD', 'SE', 'Efficacy (%)', 'CLD', 'Sig.'],
        yieldRows
      ),
      spacer()
    );

    if (yAnova && !yAnova.error) {
      const yAnovaRows = (yAnova.source || []).map((src, i) => [
        src,
        fmt(yAnova.ss?.[i]),
        String(yAnova.df?.[i] ?? '—'),
        yAnova.ms?.[i] !== null && yAnova.ms?.[i] !== undefined ? fmt(yAnova.ms[i]) : '—',
        yAnova.f?.[i]  !== null && yAnova.f?.[i]  !== undefined ? fmt(yAnova.f[i], 3)  : '—',
        yAnova.p?.[i]  !== null && yAnova.p?.[i]  !== undefined ? fmt(yAnova.p[i], 4)  : '—',
      ]);

      section7Elements.push(
        new Paragraph({ children: [new TextRun({ text: 'Yield ANOVA Source Table', bold: true, size: 22 })] }),
        spacer(),
        makeTable(['Source', 'SS', 'df', 'MS', 'F', 'p'], yAnovaRows),
        spacer()
      );
    }
  }

  // ─── Task 43: Phytotoxicity & Crop Safety ────────────────────────────────────
  const section7bElements = [];
  const phyto = reportData.phytotoxicity;
  if (phyto?.hasData) {
    const safetyShades = { Safe: 'CCFFCC', Minor: 'FFFFCC', Moderate: 'FFE6CC', Severe: 'FFCCCC' };
    section7bElements.push(
      heading('Phytotoxicity & Crop Safety', HeadingLevel.HEADING_2),
      spacer()
    );
    if (phyto.allZero) {
      section7bElements.push(bodyPara('No phytotoxic effects were observed in any treatment throughout the trial period.'), spacer());
    } else {
      const phytoRows = Object.entries(phyto.means || {}).map(([trt, m]) => [
        trt, fmt(m.mean, 1), fmt(m.sd, 1), m.safetyClass || '—'
      ]);
      section7bElements.push(
        makeTable(
          ['Treatment', 'Mean (%)', 'SD', 'Safety Class'],
          phytoRows,
          { headerShading: 'B40000' }
        ),
        spacer()
      );
    }
  }

  // ─── Task 44: Parameter Correlation Matrix ────────────────────────────────────
  const corrElements = [];
  const corrMatrix = reportData.correlationMatrix;
  if (corrMatrix && corrMatrix.params?.length >= 2) {
    corrElements.push(
      heading('Parameter Correlation Matrix', HeadingLevel.HEADING_2),
      spacer()
    );
    const corrParams = corrMatrix.params;
    const corrHead = ['Parameter', ...corrParams];
    const corrRows = corrParams.map(pA => {
      const row = [pA];
      corrParams.forEach(pB => {
        const cell = corrMatrix.matrix?.[pA]?.[pB];
        if (!cell || cell.r == null) { row.push('N/A'); return; }
        if (pA === pB) { row.push('1.000'); return; }
        row.push(`${cell.r.toFixed(3)}${cell.stars || ''}`);
      });
      return row;
    });
    corrElements.push(
      makeTable(corrHead, corrRows),
      spacer(),
      bodyPara('* p < 0.05   ** p < 0.01   N/A = fewer than 4 treatment pairs', { italic: true, size: 16 }),
      spacer()
    );
  }

  // ─── Task 45: Dose-Response Analysis ─────────────────────────────────────────
  const drElements = [];
  const drData = reportData.doseResponse;
  if (drData && drData.success !== false) {
    drElements.push(
      heading('Dose-Response Analysis', HeadingLevel.HEADING_2),
      spacer()
    );
    const drTreatments = drData.treatments || {};
    const drTrtNames = Object.keys(drTreatments);
    if (drTrtNames.length > 0) {
      const drRows = drTrtNames.map(trt => {
        const r = drTreatments[trt];
        return [trt, fmt(r?.edValues?.ed10 ?? r?.ed10), fmt(r?.edValues?.ed50 ?? r?.ed50), fmt(r?.edValues?.ed90 ?? r?.ed90), fmt(r?.statistics?.rSquared ?? r?.r2, 3), r?.model || '4-PL'];
      });
      drElements.push(
        makeTable(['Treatment', 'ED10', 'ED50', 'ED90', 'R²', 'Model'], drRows),
        spacer(),
        bodyPara('For dose-response curve visualizations, please refer to the Excel report (Chart data tab).', { italic: true, size: 16 }),
        spacer()
      );
      const avgR2 = drTrtNames.map(t => drTreatments[t]?.statistics?.rSquared ?? drTreatments[t]?.r2 ?? 1).reduce((a, b) => a + b, 0) / drTrtNames.length;
      if (avgR2 < 0.70) {
        drElements.push(bodyPara(`Note: Average dose-response fit quality is low (R² = ${fmt(avgR2, 3)}). Results should be interpreted with caution.`, { italic: true, size: 16 }), spacer());
      }
    }
  }

  // ─── Section 8: Weather Conditions ──────────────────────────────────────────

  const weather = Array.isArray(reportData.weather) ? reportData.weather : [];
  const section8Elements = [];
  if (options.includeWeather !== false && weather.length > 0) {
    const weatherRows = weather.map(w => [
      w.date || '—',
      w.daa !== null && w.daa !== undefined ? String(w.daa) : '—',
      w.temp     !== null && w.temp     !== undefined ? fmt(w.temp, 1)     : '—',
      w.humidity !== null && w.humidity !== undefined ? fmt(w.humidity, 1) : '—',
      w.wind     !== null && w.wind     !== undefined ? fmt(w.wind, 1)     : '—',
      w.rain     !== null && w.rain     !== undefined ? fmt(w.rain, 1)     : '—',
    ]);

    section8Elements.push(
      heading('8. Weather Conditions', HeadingLevel.HEADING_2),
      spacer(),
      makeTable(
        ['Date', 'DAA', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)'],
        weatherRows
      ),
      spacer()
    );
  }

  // ─── Section 9: Conclusions & Recommendations ────────────────────────────────

  let conclusionText = '';
  if (anova) {
    const cf   = anova.f ? anova.f[0] : null;
    const cp   = anova.p ? anova.p[0] : null;
    const fStr = fmt(cf, 3);
    const pStr = fmt(cp, 4);
    if (cp !== null && cp <= 0.05) {
      const topTreatments = treatmentNames.filter(tName => {
        const m = paramMeansObj[tName] || {};
        return m.cldLetter && m.cldLetter.toLowerCase().includes('a');
      });
      const topStr   = topTreatments.length > 0 ? topTreatments.join(', ') : 'top-ranked treatments';
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

  const footNote =
    `Report generated ${meta.reportDate || new Date().toISOString().slice(0, 10)}. ` +
    `Statistical analysis: ${(postHoc || 'LSD').toUpperCase()} at α = ${alpha}.`;

  const section9Elements = [
    heading('9. Conclusions & Recommendations', HeadingLevel.HEADING_2),
    spacer(),
    bodyPara(conclusionText),
    spacer(),
    bodyPara(footNote, { italic: true, size: 16 }),
    spacer(),
  ];

  // ─── Assemble document ───────────────────────────────────────────────────────

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...titleElements,
          ...execSummaryElements,
          ...section1Elements,
          ...section2Elements,
          ...section3Elements,
          ...section4Elements,
          ...section4bElements,
          ...section5Elements,
          ...section6Elements,
          ...section7Elements,
          ...section7bElements,
          ...corrElements,
          ...drElements,
          ...section8Elements,
          ...section9Elements,
        ],
      },
    ],
  });

  // ─── Download ────────────────────────────────────────────────────────────────

  const buffer  = await Packer.toBlob(doc);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const a       = document.createElement('a');
  a.href        = URL.createObjectURL(buffer);
  a.download    = `ProjectReport_${safeName(meta.projectName)}_${dateStr}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
