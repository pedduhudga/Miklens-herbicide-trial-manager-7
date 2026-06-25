/**
 * excelReportRenderer.js
 *
 * Excel (.xlsx) report generator for the advanced reporting pipeline.
 * Accepts a ReportData object (from reportDataBuilder.js) and produces
 * a 13-sheet fully-formatted workbook using ExcelJS + file-saver.
 *
 * DO NOT import from trialReports.js to avoid circular dependencies.
 */

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ─── Style constants ───────────────────────────────────────────────────────────

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
const CONTROL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
const SIG_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
const ALT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const BOLD_FONT = { bold: true, size: 10 };
const NUM_FMT_2 = '0.00';
const NUM_FMT_4 = '0.0000';

// ─── Local helpers ─────────────────────────────────────────────────────────────

/** Sanitise string for use in filename */
function safeName(s) {
  return (s || 'report').replace(/[^a-z0-9_\-]/gi, '_');
}

/** Format a number to d decimal places; return '—' for non-finite values */
function fmt(val, d = 2) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

/** Return significance stars for a p-value */
function sigStars(p) {
  if (p === null || p === undefined) return '?';
  if (p <= 0.01) return '**';
  if (p <= 0.05) return '*';
  return 'NS';
}

/**
 * Add a styled dark header row to a worksheet.
 * @param {ExcelJS.Worksheet} ws
 * @param {string[]} values
 * @returns {ExcelJS.Row}
 */
function addHeaderRow(ws, values) {
  const row = ws.addRow(values);
  row.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
  });
  row.height = 20;
  return row;
}

/**
 * Auto-set column widths based on cell content.
 * @param {ExcelJS.Worksheet} ws
 */
function autoColumnWidths(ws) {
  ws.columns.forEach(col => {
    let maxLen = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const len = String(cell.value || '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 50);
  });
}

/**
 * Apply alternating row fill to data rows (after the header).
 * @param {ExcelJS.Worksheet} ws
 * @param {number} headerRowCount  - number of header rows to skip
 */
function applyAltFill(ws, headerRowCount = 1) {
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowCount) return;
    const dataIndex = rowNumber - headerRowCount;
    if (dataIndex % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => {
        if (!cell.fill || cell.fill.fgColor?.argb === 'FFFFFFFF' || !cell.fill.fgColor) {
          cell.fill = ALT_FILL;
        }
      });
    }
  });
}

// ─── Sheet builders ────────────────────────────────────────────────────────────

/**
 * Sheet 1 — Cover / Summary
 */
function buildSheet1Cover(wb, reportData) {
  const ws = wb.addWorksheet('Cover');
  const meta = reportData.meta || {};
  const anova = reportData.primaryParameter?.anova || null;
  const param = reportData.primaryParameter || {};

  // Title row — merged A1:F1
  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = meta.projectName || 'Project Report';
  titleCell.font = { bold: true, size: 18, color: { argb: 'FF2C3E50' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // Metadata rows
  const metaRows = [
    ['Crop',             meta.crop || '—'],
    ['Location',         meta.location || '—'],
    ['Investigator',     meta.investigator || '—'],
    ['Organisation',     meta.organisation || '—'],
    ['Design',           meta.designLabel || meta.design || '—'],
    ['Report Date',      meta.reportDate || new Date().toISOString().slice(0, 10)],
  ];
  metaRows.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = BOLD_FONT;
    row.getCell(1).alignment = { horizontal: 'right' };
  });

  ws.addRow([]);

  // Summary stats section
  const summaryLabel = ws.addRow(['— Summary Statistics —']);
  summaryLabel.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF2C3E50' } };
  ws.mergeCells(`A${summaryLabel.number}:F${summaryLabel.number}`);

  const grandMean = anova?.grandMean ?? null;
  const cv = anova?.cv ?? null;

  const statsRows = [
    ['Treatments',        String(meta.treatments ?? '—')],
    ['Max Replications',  String(meta.replications ?? '—')],
    ['Primary Parameter', param.label || param.key || '—'],
    ['Grand Mean',        grandMean !== null ? fmt(grandMean) : '—'],
    ['CV%',               cv !== null ? fmt(cv, 1) + '%' : '—'],
  ];
  statsRows.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = BOLD_FONT;
  });

  autoColumnWidths(ws);
}

/**
 * Sheet 2 — Trial Info
 */
function buildSheet2TrialInfo(wb, reportData) {
  const ws = wb.addWorksheet('Trial Info');
  const meta = reportData.meta || {};

  addHeaderRow(ws, ['Label', 'Value']);

  const appDates = Array.isArray(meta.applicationDates)
    ? meta.applicationDates.join(', ')
    : (meta.applicationDates || '—');

  const fields = [
    ['Name',             meta.projectName || '—'],
    ['Crop',             meta.crop || '—'],
    ['Variety',          meta.variety || '—'],
    ['Location',         meta.location || '—'],
    ['Investigator',     meta.investigator || '—'],
    ['Organisation',     meta.organisation || '—'],
    ['Design',           meta.designLabel || meta.design || '—'],
    // PI-3: show analysis model for Pot Trial / CRD
    ['Analysis Model',   meta.analysisModel || meta.design || '—'],
    ['Target Species',   meta.targetSpecies || '—'],
    ['Application Dates', appDates],
    ['Category',         meta.category || '—'],
    ['Replications',     String(meta.replications ?? '—')],
    ['Treatments',       String(meta.treatments ?? '—')],
    ['Previous Crop',    meta.previousCrop || '—'],
    ['Irrigation Method',meta.irrigationMethod || '—'],
    ['Plant Population', meta.plantPopulation || '—'],
    ['Report Date',      meta.reportDate || new Date().toISOString().slice(0, 10)],
  ];

  fields.forEach(([label, value], i) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = BOLD_FONT;
    if (i % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
  });

  // Application Log — adjuvant & tankMix table
  const appLog = reportData.applicationLog || [];
  if (appLog.length > 0) {
    ws.addRow([]);
    const appLogLabel = ws.addRow(['Application Log (Adjuvant & Tank Mix)']);
    appLogLabel.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF2C3E50' } };
    ws.mergeCells(`A${appLogLabel.number}:G${appLogLabel.number}`);
    const appHead = ws.addRow(['Application', 'Date', 'Dosage', 'Method', 'Crop Stage', 'Adjuvant', 'Tank Mix Partners']);
    appHead.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A6FA5' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    appLog.forEach((app, idx) => {
      const row = ws.addRow([app.code || `App ${idx + 1}`, app.date || '', app.dosage || '', app.method || '', app.cropStage || '', app.adjuvant || '—', app.tankMix || '—']);
      if (idx % 2 === 0) row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    });
  }

  // PI-5: LargeScale sector summary table
  if (meta.isLargeScale && meta.largescaleSectors && meta.largescaleSectors.length > 0) {    ws.addRow([]);
    const sectorLabel = ws.addRow(['Sector / Quadrant Summary (LargeScale)']);
    sectorLabel.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF2C3E50' } };
    ws.mergeCells(`A${sectorLabel.number}:D${sectorLabel.number}`);

    addHeaderRow(ws, ['Sector Code', 'Treatment / Dosage', 'GPS (Lat, Lon)', 'Spatial CV%']);
    meta.largescaleSectors.forEach((s, idx) => {
      const sp = meta.spatialSummary?.[s.Name || s.Code];
      const row = ws.addRow([
        s.Code || s.ID || '—',
        [s.Name, s.Dosage].filter(Boolean).join(' @ ') || '—',
        (s.Lat && s.Lon) ? `${parseFloat(s.Lat).toFixed(5)}, ${parseFloat(s.Lon).toFixed(5)}` : '—',
        sp?.spatialCV !== null && sp?.spatialCV !== undefined ? parseFloat(fmt(sp.spatialCV, 1)) : '—',
      ]);
      if (idx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
    });
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 3 — Treatment List
 */
function buildSheet3TreatmentList(wb, reportData) {
  const ws = wb.addWorksheet('Treatment List');
  const treatmentList = Array.isArray(reportData.treatmentList) ? reportData.treatmentList : [];

  addHeaderRow(ws, ['#', 'Treatment / Formulation', 'Dosage', 'App. Timing', 'Replications', 'Role']);

  treatmentList.forEach((t, idx) => {
    const role = t.isControl ? 'UTC / Control' : (t.isStandard ? 'Standard' : 'Treatment');
    const dosageStr = t.dosage ? `${t.dosage} ${t.unit || ''}`.trim() : '—';
    const row = ws.addRow([
      idx + 1,
      t.name || '—',
      dosageStr,
      t.timing || '—',
      t.replicationCount ?? '—',
      role,
    ]);

    if (t.isControl) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = CONTROL_FILL; });
    } else if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
  });

  autoColumnWidths(ws);
}

/**
 * Sheet 4 — Raw Data Matrix
 */
function buildSheet4RawData(wb, reportData) {
  const ws = wb.addWorksheet('Raw Data Matrix');
  const rawMatrix = reportData.rawMatrix || {};
  const meta = reportData.meta || {};
  const categoryConfig = meta.categoryConfig || {};
  const observationFields = (categoryConfig.observationFields || []).filter(f => f.type === 'number');

  // Build headers: Treatment | Replication | Plot Number | Date | DAA | [field labels...]
  const fieldKeys = observationFields.map(f => f.key);
  const fieldLabels = observationFields.map(f => f.label || f.key);
  addHeaderRow(ws, ['Treatment', 'Replication', 'Plot Number', 'Date', 'DAA', ...fieldLabels]);

  let rowIdx = 0;
  for (const [treatmentName, reps] of Object.entries(rawMatrix)) {
    for (const [repId, repData] of Object.entries(reps || {})) {
      const rowValues = [
        treatmentName,
        repId,
        repData.plotNumber || '—',
        repData.date || '—',
        repData.daa ?? '—',
        ...fieldKeys.map(key => {
          const v = repData[key];
          return v !== null && v !== undefined ? v : '—';
        }),
      ];
      const row = ws.addRow(rowValues);
      if (rowIdx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
      // Apply number format to data columns
      fieldKeys.forEach((_, colOffset) => {
        const cell = row.getCell(6 + colOffset);
        if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
      });
      rowIdx++;
    }
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 5 — Treatment Means (Primary Parameter)
 */
function buildSheet5TreatmentMeans(wb, reportData) {
  const ws = wb.addWorksheet('Treatment Means');
  const param = reportData.primaryParameter || {};
  const anova = param.anova || null;
  const meansObj = param.means || {};
  const treatmentNames = Object.keys(meansObj);
  // PI-4: phytotoxicity and similar parameters excluded from efficacy display
  const efficacyExcluded = param.efficacyExcluded === true;
  const efficacyHeader = efficacyExcluded ? 'Efficacy% (N/A)' : 'Efficacy (%)';

  // Title row
  const titleRow = ws.addRow([`Treatment Means — ${param.label || param.key || 'Primary Parameter'}`]);
  titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF2C3E50' } };
  ws.mergeCells(`A${titleRow.number}:I${titleRow.number}`);
  titleRow.height = 22;

  addHeaderRow(ws, ['Treatment', 'n', 'Mean', 'SD', 'SE', 'CV%', efficacyHeader, 'CLD Letter', 'Significance']);

  const pVal0 = anova?.p?.[0] ?? null;
  const sig = sigStars(pVal0);

  treatmentNames.forEach((tName, idx) => {
    const m = meansObj[tName] || {};
    // PI-4: excluded params show 'N/A*' in efficacy column
    const efficacyVal = efficacyExcluded
      ? 'N/A*'
      : (m.efficacy_pct !== null && m.efficacy_pct !== undefined ? parseFloat(fmt(m.efficacy_pct, 1)) : '—');
    const row = ws.addRow([
      tName,
      m.n ?? '—',
      m.mean !== null && m.mean !== undefined ? parseFloat(fmt(m.mean)) : '—',
      m.sd   !== null && m.sd   !== undefined ? parseFloat(fmt(m.sd))   : '—',
      m.se   !== null && m.se   !== undefined ? parseFloat(fmt(m.se))   : '—',
      m.cv   !== null && m.cv   !== undefined ? parseFloat(fmt(m.cv, 1)) : '—',
      efficacyVal,
      m.cldLetter || '—',
      sig,
    ]);
    // Number format on numeric columns
    ['C', 'D', 'E', 'F'].forEach(col => {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
    });
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
  });

  // PI-4: footnote row for excluded params
  if (efficacyExcluded) {
    ws.addRow([]);
    const noteRow = ws.addRow([`* ${param.label || param.key} is an adverse-effect parameter. Efficacy % is not scientifically applicable.`]);
    noteRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
    ws.mergeCells(`A${noteRow.number}:I${noteRow.number}`);
  }

  // Footer rows
  ws.addRow([]);
  if (anova) {
    const footerData = [
      ['Grand Mean', anova.grandMean !== null ? parseFloat(fmt(anova.grandMean)) : '—'],
      ['SEm±',       anova.sem        !== null ? parseFloat(fmt(anova.sem))       : '—'],
      ['LSD 5%',     anova.lsd5       !== null ? parseFloat(fmt(anova.lsd5))      : '—'],
      ['LSD 1%',     anova.lsd1       !== null ? parseFloat(fmt(anova.lsd1))      : '—'],
      ['CV%',        anova.cv         !== null ? fmt(anova.cv, 1) + '%'           : '—'],
    ];
    footerData.forEach(([label, value]) => {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = BOLD_FONT;
      if (typeof value === 'number') row.getCell(2).numFmt = NUM_FMT_2;
    });
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 6 — ANOVA Table
 */
function buildSheet6Anova(wb, reportData) {
  const ws = wb.addWorksheet('ANOVA Table');
  const param = reportData.primaryParameter || {};
  const anova = param.anova || null;
  const meta  = reportData.meta || {};

  // PI-3: include analysis model in sheet title for Pot Trial / CRD
  const modelNote = meta.analysisModel && meta.analysisModel !== 'RCBD'
    ? ` (${meta.analysisModel} model)`
    : '';

  // Title row
  const titleRow = ws.addRow([`ANOVA Source Table${modelNote} — ${param.label || param.key || 'Primary Parameter'}`]);
  titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF2C3E50' } };
  ws.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
  titleRow.height = 22;

  addHeaderRow(ws, ['Source of Variation', 'SS', 'df', 'MS', 'F-value', 'p-value']);

  if (anova && !anova.error) {
    const sources = anova.source || [];
    sources.forEach((src, i) => {
      const pVal = anova.p?.[i] ?? null;
      const fVal = anova.f?.[i] ?? null;
      const msVal = anova.ms?.[i] ?? null;
      const row = ws.addRow([
        src,
        anova.ss?.[i] ?? '—',
        anova.df?.[i] ?? '—',
        msVal !== null ? msVal : '—',
        fVal  !== null ? fVal  : '—',
        pVal  !== null ? pVal  : '—',
      ]);

      // Number formats
      const bCell = row.getCell(2); if (typeof bCell.value === 'number') bCell.numFmt = NUM_FMT_2;
      const dCell = row.getCell(4); if (typeof dCell.value === 'number') dCell.numFmt = NUM_FMT_2;
      const eCell = row.getCell(5); if (typeof eCell.value === 'number') eCell.numFmt = NUM_FMT_2;
      const fCell = row.getCell(6); if (typeof fCell.value === 'number') fCell.numFmt = NUM_FMT_4;

      // Highlight significant Treatment row (p < 0.05)
      if (src === 'Treatments' && pVal !== null && pVal < 0.05) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = SIG_FILL; });
      } else if (i % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
    });
    // Significance statement
    ws.addRow([]);
    const sigRow = ws.addRow([anova.significance_label || '']);
    sigRow.getCell(1).font = { italic: true, size: 10 };
    ws.mergeCells(`A${sigRow.number}:F${sigRow.number}`);
  } else {
    const noRow = ws.addRow(['Insufficient data for ANOVA.']);
    noRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 7 — Post-Hoc Comparisons
 */
function buildSheet7PostHoc(wb, reportData) {
  const ws = wb.addWorksheet('Post-Hoc Comparisons');
  const param = reportData.primaryParameter || {};
  const anova = param.anova || null;

  addHeaderRow(ws, ['Treatment A', 'Treatment B', 'Mean A', 'Mean B', 'Mean Diff', 'Significant?', 'Critical Value']);

  // Check if comparisons data exists (stored in anova.comparisons if present)
  const comparisons = anova?.comparisons || null;

  if (comparisons && Array.isArray(comparisons) && comparisons.length > 0) {
    comparisons.forEach((comp, idx) => {
      const row = ws.addRow([
        comp.treatmentA || '—',
        comp.treatmentB || '—',
        comp.meanA !== null && comp.meanA !== undefined ? parseFloat(fmt(comp.meanA)) : '—',
        comp.meanB !== null && comp.meanB !== undefined ? parseFloat(fmt(comp.meanB)) : '—',
        comp.diff  !== null && comp.diff  !== undefined ? parseFloat(fmt(comp.diff))  : '—',
        comp.significant ? 'Yes' : 'No',
        comp.criticalValue !== null && comp.criticalValue !== undefined ? parseFloat(fmt(comp.criticalValue)) : '—',
      ]);
      ['C', 'D', 'E', 'G'].forEach(col => {
        const cell = row.getCell(col);
        if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
      });
      if (idx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
    });
  } else {
    const noRow = ws.addRow(['Post-hoc comparisons not available — run analysis with Tukey or Duncan option']);
    ws.mergeCells(`A${noRow.number}:G${noRow.number}`);
    noRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 8 — All Parameters Data
 */
function buildSheet8AllParameters(wb, reportData) {
  const ws = wb.addWorksheet('All Parameters');
  const allParams = Array.isArray(reportData.parameters) ? reportData.parameters : [];

  const LIGHT_BLUE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };

  allParams.forEach((paramEntry, paramIdx) => {
    if (paramIdx > 0) ws.addRow([]); // blank separator

    // Parameter label row
    const labelRow = ws.addRow([paramEntry.label || paramEntry.key || `Parameter ${paramIdx + 1}`]);
    labelRow.getCell(1).font = { bold: true, size: 11 };
    labelRow.eachCell({ includeEmpty: true }, cell => { cell.fill = LIGHT_BLUE_FILL; });
    ws.mergeCells(`A${labelRow.number}:H${labelRow.number}`);

    // Means table header
    addHeaderRow(ws, ['Treatment', 'n', 'Mean', 'SD', 'SE', 'CLD', 'F-value', 'p-value']);

    const meansObj = paramEntry.means || {};
    const anova = paramEntry.anova || null;
    const fVal = anova?.f?.[0] ?? null;
    const pVal = anova?.p?.[0] ?? null;
    const treatNames = Object.keys(meansObj);

    treatNames.forEach((tName, idx) => {
      const m = meansObj[tName] || {};
      const row = ws.addRow([
        tName,
        m.n ?? '—',
        m.mean !== null && m.mean !== undefined ? parseFloat(fmt(m.mean)) : '—',
        m.sd   !== null && m.sd   !== undefined ? parseFloat(fmt(m.sd))   : '—',
        m.se   !== null && m.se   !== undefined ? parseFloat(fmt(m.se))   : '—',
        m.cldLetter || '—',
        idx === 0 && fVal !== null ? parseFloat(fmt(fVal, 3)) : '',
        idx === 0 && pVal !== null ? pVal : '',
      ]);
      ['C', 'D', 'E'].forEach(col => {
        const cell = row.getCell(col);
        if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
      });
      const pCell = row.getCell('H');
      if (typeof pCell.value === 'number') pCell.numFmt = NUM_FMT_4;

      if (idx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
    });
  });

  autoColumnWidths(ws);
}

/**
 * Sheet 9 — Time-Series Data
 */
function buildSheet9TimeSeries(wb, reportData) {
  const ws = wb.addWorksheet('Time-Series Data');
  const timeSeries = reportData.timeSeries || {};
  const daas = Array.isArray(timeSeries.daas) ? timeSeries.daas : [];

  // Header: Treatment | [DAA1] DAA | [DAA2] DAA | ...
  addHeaderRow(ws, ['Treatment', ...daas.map(d => `${d} DAA`)]);

  // Collect treatment names from timeSeries (skip 'daas' key)
  const treatmentNames = Object.keys(timeSeries).filter(k => k !== 'daas');

  treatmentNames.forEach((tName, idx) => {
    const tsRow = [tName, ...daas.map(daa => {
      const cell = timeSeries[tName]?.[daa];
      return cell && cell.mean !== null && cell.mean !== undefined
        ? parseFloat(fmt(cell.mean))
        : '—';
    })];
    const row = ws.addRow(tsRow);
    // Number format for DAA columns
    daas.forEach((_, colOffset) => {
      const cell = row.getCell(2 + colOffset);
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
    });
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
  });

  autoColumnWidths(ws);
}

/**
 * Sheet 10 — Yield
 */
function buildSheet10Yield(wb, reportData) {
  const ws = wb.addWorksheet('Yield');
  const yieldData = reportData.yield;
  const yieldMeans = yieldData?.means && Object.keys(yieldData.means).length > 0
    ? yieldData.means
    : null;

  if (!yieldMeans) {
    ws.addRow(['No yield data recorded in this project']);
    autoColumnWidths(ws);
    return;
  }

  const yAnova = yieldData.anova || null;
  const pVal0  = yAnova?.p?.[0] ?? null;
  const sig    = sigStars(pVal0);

  // Title row
  const titleRow = ws.addRow(['Yield Analysis']);
  titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF2C3E50' } };
  ws.mergeCells(`A${titleRow.number}:I${titleRow.number}`);
  titleRow.height = 22;

  addHeaderRow(ws, ['Treatment', 'n', 'Mean', 'SD', 'SE', 'CV%', 'Efficacy (%)', 'CLD Letter', 'Significance']);

  Object.entries(yieldMeans).forEach(([tName, m], idx) => {
    const row = ws.addRow([
      tName,
      m.n ?? '—',
      m.mean !== null && m.mean !== undefined ? parseFloat(fmt(m.mean)) : '—',
      m.sd   !== null && m.sd   !== undefined ? parseFloat(fmt(m.sd))   : '—',
      m.se   !== null && m.se   !== undefined ? parseFloat(fmt(m.se))   : '—',
      m.cv   !== null && m.cv   !== undefined ? parseFloat(fmt(m.cv, 1)) : '—',
      m.efficacy_pct !== null && m.efficacy_pct !== undefined ? parseFloat(fmt(m.efficacy_pct, 1)) : '—',
      m.cldLetter || '—',
      sig,
    ]);
    ['C', 'D', 'E', 'F', 'G'].forEach(col => {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
    });
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
  });

  // Footer
  ws.addRow([]);
  if (yAnova) {
    [
      ['Grand Mean', yAnova.grandMean],
      ['SEm±',       yAnova.sem],
      ['LSD 5%',     yAnova.lsd5],
      ['LSD 1%',     yAnova.lsd1],
      ['CV%',        yAnova.cv !== null ? fmt(yAnova.cv, 1) + '%' : '—'],
    ].forEach(([label, value]) => {
      const row = ws.addRow([label, value !== null && value !== undefined ? value : '—']);
      row.getCell(1).font = BOLD_FONT;
    });
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 11 — Weather
 */
function buildSheet11Weather(wb, reportData) {
  const ws = wb.addWorksheet('Weather');
  const weather = Array.isArray(reportData.weather) ? reportData.weather : [];

  addHeaderRow(ws, ['Date', 'DAA', 'Temp (°C)', 'Humidity (%)', 'Wind (km/h)', 'Rain (mm)']);

  if (weather.length === 0) {
    const noRow = ws.addRow(['No weather data recorded']);
    ws.mergeCells(`A${noRow.number}:F${noRow.number}`);
    noRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
  } else {
    weather.forEach((w, idx) => {
      const row = ws.addRow([
        w.date || '—',
        w.daa  !== null && w.daa  !== undefined ? w.daa  : '—',
        w.temp !== null && w.temp !== undefined ? w.temp : '—',
        w.humidity !== null && w.humidity !== undefined ? w.humidity : '—',
        w.wind !== null && w.wind !== undefined ? w.wind : '—',
        w.rain !== null && w.rain !== undefined ? w.rain : '—',
      ]);
      ['C', 'D', 'E', 'F'].forEach(col => {
        const cell = row.getCell(col);
        if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
      });
      if (idx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
    });
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 12 — Charts (data for charting)
 */
function buildSheet12Charts(wb, reportData) {
  const ws = wb.addWorksheet('Charts');
  const param = reportData.primaryParameter || {};
  const meansObj = param.means || {};
  const timeSeries = reportData.timeSeries || {};
  const daas = Array.isArray(timeSeries.daas) ? timeSeries.daas : [];

  // Note cell
  const noteRow = ws.addRow(['Use the data ranges below to create charts in Excel']);
  noteRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF555555' } };
  ws.mergeCells(`A${noteRow.number}:G${noteRow.number}`);
  ws.addRow([]);

  // Bar chart data table
  const barLabelRow = ws.addRow(['Bar Chart Data — Treatment Means with SE']);
  barLabelRow.getCell(1).font = BOLD_FONT;
  ws.mergeCells(`A${barLabelRow.number}:C${barLabelRow.number}`);

  addHeaderRow(ws, ['Treatment', 'Mean', 'SE']);
  const treatmentNames = Object.keys(meansObj);
  treatmentNames.forEach((tName, idx) => {
    const m = meansObj[tName] || {};
    const row = ws.addRow([
      tName,
      m.mean !== null && m.mean !== undefined ? parseFloat(fmt(m.mean)) : '—',
      m.se   !== null && m.se   !== undefined ? parseFloat(fmt(m.se))   : '—',
    ]);
    ['B', 'C'].forEach(col => {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
    });
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
  });

  ws.addRow([]);

  // Time-series data table
  if (daas.length > 0) {
    const tsLabelRow = ws.addRow(['Time-Series Data — Treatment Means by DAA']);
    tsLabelRow.getCell(1).font = BOLD_FONT;
    ws.mergeCells(`A${tsLabelRow.number}:${String.fromCharCode(65 + daas.length)}${tsLabelRow.number}`);

    addHeaderRow(ws, ['Treatment', ...daas.map(d => `${d} DAA`)]);
    const tsNames = Object.keys(timeSeries).filter(k => k !== 'daas');
    tsNames.forEach((tName, idx) => {
      const row = ws.addRow([
        tName,
        ...daas.map(daa => {
          const cell = timeSeries[tName]?.[daa];
          return cell?.mean !== null && cell?.mean !== undefined
            ? parseFloat(fmt(cell.mean))
            : '—';
        }),
      ]);
      daas.forEach((_, colOffset) => {
        const cell = row.getCell(2 + colOffset);
        if (typeof cell.value === 'number') cell.numFmt = NUM_FMT_2;
      });
      if (idx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
      }
    });
  }

  autoColumnWidths(ws);
}

/**
 * Sheet 13 — Photos
 */
function buildSheet13Photos(wb, reportData) {
  const ws = wb.addWorksheet('Photos');
  const photos = Array.isArray(reportData.photos) ? reportData.photos : [];

  addHeaderRow(ws, ['Treatment', 'DAA', 'Date', 'URL']);

  // Note about embedded images
  const noteRow = ws.addRow(['Embedded photo images require manual insertion — URLs listed for reference']);
  ws.mergeCells(`A${noteRow.number}:D${noteRow.number}`);
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };

  photos.forEach((photo, idx) => {
    const row = ws.addRow([
      photo.treatment || '—',
      photo.daa !== null && photo.daa !== undefined ? photo.daa : '—',
      photo.date || '—',
      photo.url || '—',
    ]);
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = ALT_FILL; });
    }
    // Make URL cell a hyperlink if present
    if (photo.url) {
      const urlCell = row.getCell(4);
      urlCell.value = { text: photo.url, hyperlink: photo.url };
      urlCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  });

  autoColumnWidths(ws);
}

/**
 * Sheet 14 — Correlation Matrix
 */
function buildSheet14Correlation(wb, reportData) {
  const ws = wb.addWorksheet('Correlation Matrix');
  const corrMatrix = reportData.correlationMatrix;
  if (!corrMatrix || corrMatrix.params?.length < 2) {
    ws.addRow(['No correlation data available (need ≥ 2 parameters with data)']);
    return;
  }
  const params = corrMatrix.params;
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const SIG_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
  const NUM_FMT_4 = '0.0000';

  // Header row: blank, then param labels
  const headerRow = ws.addRow(['Parameter', ...params]);
  headerRow.eachCell(c => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  headerRow.height = 18;

  // Body rows: one per parameter
  params.forEach((pA, rowIdx) => {
    const rowValues = [pA];
    params.forEach(pB => {
      const cell = corrMatrix.matrix?.[pA]?.[pB];
      if (!cell || cell.r == null) {
        rowValues.push('N/A');
      } else if (pA === pB) {
        rowValues.push(1.000);
      } else {
        const label = cell.stars ? `${parseFloat(cell.r.toFixed(4))}${cell.stars}` : parseFloat(cell.r.toFixed(4));
        rowValues.push(label);
      }
    });
    const row = ws.addRow(rowValues);
    row.getCell(1).font = { bold: true };
    // Highlight high positive/negative correlations
    params.forEach((pB, colIdx) => {
      const cell = corrMatrix.matrix?.[pA]?.[pB];
      if (cell && cell.r != null && Math.abs(cell.r) >= 0.7 && cell.p < 0.05) {
        const excelCell = row.getCell(colIdx + 2);
        excelCell.fill = SIG_FILL;
      }
    });
    if (rowIdx % 2 === 0) {
      row.eachCell({ includeEmpty: false }, (c, cn) => {
        if (cn > 1 && !c.fill.fgColor?.argb?.includes('D4')) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FAF8' } };
        }
      });
    }
  });

  // Footnote
  ws.addRow([]);
  const noteRow = ws.addRow(['* p < 0.05  ** p < 0.01  N/A = fewer than 4 treatment pairs available']);
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
  ws.mergeCells(`A${noteRow.number}:${String.fromCharCode(65 + params.length)}${noteRow.number}`);

  // Auto column widths
  ws.columns.forEach(col => {
    let max = 14;
    col.eachCell({ includeEmpty: false }, c => { const l = String(c.value || '').length; if (l > max) max = l; });
    col.width = Math.min(max + 2, 30);
  });
}

/**
 * Sheet 15 — Tidy Data
 */
function buildSheet15TidyData(wb, reportData) {
  const ws = wb.addWorksheet('Tidy Data');
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
  const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const ALT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };

  const meta = reportData.meta || {};
  const categoryConfig = meta.categoryConfig || {};
  const obsFields = (categoryConfig.observationFields || [])
    .filter(f => f.type === 'number')
    .map(f => f.key);

  const fixedCols = [
    'ProjectID', 'ProjectName', 'TrialID', 'PlotNumber', 'BlockID',
    'TreatmentName', 'DosageValue', 'DosageUnit', 'BBCH',
    'Crop', 'Variety', 'PreviousCrop', 'IrrigationMethod', 'PlantPopulation',
    'GPSLatitude', 'GPSLongitude', 'SoilPH', 'SoilClay',
    'DAA', 'ObservationDate',
  ];

  // Header row
  const headerRow = ws.addRow([...fixedCols, ...obsFields]);
  headerRow.eachCell(c => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = { horizontal: 'center' }; });
  headerRow.height = 18;

  // Build rows from rawMatrix if available
  const rawMatrix = reportData.rawMatrix || {};
  const projectId = meta.projectName ? String(meta.projectName).slice(0, 20) : 'N/A';

  let rowIdx = 0;
  for (const [treatmentName, reps] of Object.entries(rawMatrix)) {
    for (const [repId, repData] of Object.entries(reps || {})) {
      const dataRow = [
        projectId,
        meta.projectName || '—',
        repData.trialID || repId,
        repData.plotNumber || repId || '—',
        repId,
        treatmentName,
        repData.dosage || '—',
        repData.unit || '—',
        repData.bbch || '',
        repData.crop || '',
        repData.variety || '',
        repData.previousCrop || '',
        repData.irrigationMethod || '',
        repData.plantPopulation || '',
        repData.lat || '',
        repData.lon || '',
        repData.soilPH || '',
        repData.soilClay || '',
        repData.daa ?? '',
        repData.date || '',
        ...obsFields.map(k => {
          const v = repData[k];
          return (v === null || v === undefined) ? '' : v;
        }),
      ];
      const row = ws.addRow(dataRow);
      if (rowIdx % 2 === 0) {
        row.eachCell({ includeEmpty: true }, c => { c.fill = ALT_FILL; });
      }
      rowIdx++;
    }
  }

  if (rowIdx === 0) {
    const noDataRow = ws.addRow(['No tidy data available — rawMatrix is empty. Use Tidy Data Export (CSV) from the Reports page for complete per-observation rows.']);
    ws.mergeCells(`A${noDataRow.number}:${String.fromCharCode(64 + fixedCols.length + obsFields.length)}${noDataRow.number}`);
    noDataRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
  }

  ws.columns.forEach(col => {
    let max = 12;
    col.eachCell({ includeEmpty: false }, c => { const l = String(c.value || '').length; if (l > max) max = l; });
    col.width = Math.min(max + 2, 30);
  });
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates and triggers download of a 15-sheet Excel project report.
 *
 * @param {object} reportData  — ReportData object from reportDataBuilder.js
 * @param {object} [options]   — reserved for future use
 */
export async function generateProjectExcel(reportData, options = {}) {
  const wb = new ExcelJS.Workbook();

  // Workbook metadata
  wb.creator = 'Miklens Trial Manager';
  wb.lastModifiedBy = 'Miklens Trial Manager';
  wb.created  = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  // Build all 13 sheets in order
  buildSheet1Cover(wb, reportData);
  buildSheet2TrialInfo(wb, reportData);
  buildSheet3TreatmentList(wb, reportData);
  buildSheet4RawData(wb, reportData);
  buildSheet5TreatmentMeans(wb, reportData);
  buildSheet6Anova(wb, reportData);
  buildSheet7PostHoc(wb, reportData);
  buildSheet8AllParameters(wb, reportData);
  buildSheet9TimeSeries(wb, reportData);
  buildSheet10Yield(wb, reportData);
  buildSheet11Weather(wb, reportData);
  buildSheet12Charts(wb, reportData);
  buildSheet13Photos(wb, reportData);
  buildSheet14Correlation(wb, reportData);
  buildSheet15TidyData(wb, reportData);

  // Write to buffer and trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob(
    [buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );

  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `ProjectReport_${safeName(reportData.meta?.projectName)}_${dateStr}.xlsx`;
  saveAs(blob, filename);
}
