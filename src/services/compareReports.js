import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { safeJsonParse } from '../utils/helpers.js';
import { formatDateTime } from '../utils/dateUtils.js';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';
import { performANOVA, performTukeyHSD } from '../utils/statsUtils.js';

function hexToRgb(hex) {
  if (!hex || hex.charAt(0) !== '#') return [13, 148, 136];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/**
 * Generate and download a CSV report of the trial comparison
 */
export function exportComparisonCsv(trialSeries, allDaa, activeCategory = 'herbicide') {
  const config = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);

  let csv = `MIKLENS ${config.name.toUpperCase()} TRIAL COMPARISON REPORT\n`;
  csv += `Generated on: ${formatDateTime(new Date())}\n\n`;

  // 1. General Info Table
  csv += 'GENERAL DETAILS COMPARISON\n';
  const fields = [
    ['Formulation Name', t => t.FormulationName || '—'],
    ['Location', t => t.Location || '—'],
    ['Application Date', t => t.Date ? formatDateTime(t.Date) : '—'],
    ['Dosage', t => t.Dosage || '—'],
    [config.targetLabel, t => t[config.targetField] || '—'],
    ['Investigator', t => t.InvestigatorName || '—'],
    ['Overall Result', t => t.Result || '—'],
    ['Status', t => (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Active'],
    ['Temperature', t => t.Temperature ? `${t.Temperature}°C` : '—'],
    ['Humidity', t => t.Humidity ? `${t.Humidity}%` : '—'],
    ['Windspeed', t => t.Windspeed ? `${t.Windspeed} km/h` : '—'],
    ['Rainfall', t => t.Rain ? `${t.Rain} mm` : '—'],
  ];

  // Header row for general info
  csv += 'Parameter,' + trialSeries.map(s => `"${s.trial.FormulationName || 'Unknown'}"`).join(',') + '\n';
  fields.forEach(([label, getter]) => {
    csv += `"${label}",` + trialSeries.map(s => `"${getter(s.trial)}"`).join(',') + '\n';
  });
  csv += '\n\n';

  // 2. Timeline Table
  csv += `EFFICACY TIMELINE (${config.primaryMetric.label.toUpperCase()} / CONTROL OVER TIME)\n`;
  csv += 'DAA,' + trialSeries.map(s => `"${s.trial.FormulationName} (${config.primaryMetric.label})","${s.trial.FormulationName} (% Control)"`).join(',') + '\n';
  
  allDaa.forEach(daa => {
    let row = `DAA ${daa},`;
    row += trialSeries.map(s => {
      const obs = s.eff.find(o => Number(o.daa ?? 0) === daa);
      const val = obs ? `${obs[primaryObsField]}${config.primaryMetric.unit}` : '—';
      const ctrl = obs && obs.controlPct !== undefined ? `${obs.controlPct}%` : '—';
      return `"${val}","${ctrl}"`;
    }).join(',');
    csv += row + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${activeCategory}_trial_comparison_report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate and download a styled HTML comparative report
 */
export function exportComparisonHtml(trialSeries, allDaa, aiSummaryText, activeCategory = 'herbicide') {
  const config = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);
  const generatedDate = formatDateTime(new Date());
  
  // Build comparison rows
  const fields = [
    ['Location', t => t.Location || '—'],
    ['Application Date', t => t.Date ? formatDateTime(t.Date) : '—'],
    ['Dosage', t => t.Dosage || '—'],
    [config.targetLabel, t => t[config.targetField] || '—'],
    ['Investigator', t => t.InvestigatorName || '—'],
    ['Result', t => t.Result || '—'],
    ['Temperature', t => t.Temperature ? `${t.Temperature}°C` : '—'],
    ['Humidity', t => t.Humidity ? `${t.Humidity}%` : '—'],
    ['Windspeed', t => t.Windspeed ? `${t.Windspeed} km/h` : '—'],
    ['Rainfall', t => t.Rain ? `${t.Rain} mm` : '—'],
    ['Replications', t => t.Replication || '—'],
    ['Plot Number', t => t.PlotNumber || '—'],
  ];

  let headersHtml = trialSeries.map((s, idx) => `<th style="border-bottom: 2px solid #cbd5e1; padding: 12px; font-weight: bold; text-align: left; color: #1e293b;">${s.trial.FormulationName}</th>`).join('');
  let rowsHtml = fields.map(([label, getter]) => {
    const cols = trialSeries.map(s => `<td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #334155;">${getter(s.trial)}</td>`).join('');
    return `<tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; background-color: #f8fafc; width: 180px;">${label}</td>${cols}</tr>`;
  }).join('');

  // Timeline rows
  let timelineHeadersHtml = trialSeries.map(s => `<th style="padding: 10px; text-align: right; color: #475569;">${s.trial.FormulationName}</th>`).join('');
  let timelineRowsHtml = allDaa.map(daa => {
    const cols = trialSeries.map(s => {
      const obs = s.eff.find(o => Number(o.daa ?? 0) === daa);
      if (!obs) return '<td style="padding: 10px; text-align: right; color: #94a3b8;">—</td>';
      const ctrlText = obs.controlPct !== undefined ? `<span style="font-size: 11px; color: #16a34a; margin-left: 6px;">(${obs.controlPct}% ctrl)</span>` : '';
      return `<td style="padding: 10px; text-align: right; color: #1e293b; font-weight: 500;">${obs[primaryObsField]}${config.primaryMetric.unit}${ctrlText}</td>`;
    }).join('');
    return `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px; font-weight: 600; color: #64748b;">DAA ${daa}</td>${cols}</tr>`;
  }).join('');

  const formattedAiText = aiSummaryText 
    ? aiSummaryText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
    : 'No AI summary generated.';

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.name} Trial Comparison Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 2rem 1rem; margin: 0; }
    .card { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 2.5rem; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); }
    h1 { font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
    h2 { font-size: 16px; font-weight: 700; color: #0f172a; border-left: 4px solid ${config.color.hex || '#10b981'}; padding-left: 8px; margin-top: 32px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
    .ai-box { background-color: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 16px; color: #4c1d95; font-size: 14px; line-height: 1.6; }
    .badge { font-size: 10px; font-weight: 700; padding: 2px 6px; rounded: 4px; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${config.name} Trial Comparison Report</h1>
    <div class="subtitle">Generated by Miklens Trial Manager on ${generatedDate}</div>
    
    <h2>AI Executive Summary</h2>
    <div class="ai-box">${formattedAiText}</div>

    <h2>Efficacy Timeline (${config.primaryMetric.label})</h2>
    <table>
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="padding: 10px; text-align: left; color: #475569;">DAA</th>
          ${timelineHeadersHtml}
        </tr>
      </thead>
      <tbody>
        ${timelineRowsHtml}
      </tbody>
    </table>

    <h2>Full Trial Specification Details</h2>
    <table>
      <thead>
        <tr style="background-color: #f1f5f9;">
          <th style="border-bottom: 2px solid #cbd5e1; padding: 12px; font-weight: bold; text-align: left; color: #475569; width: 180px;">Parameter</th>
          ${headersHtml}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${activeCategory}_trial_comparison_report_${new Date().toISOString().slice(0, 10)}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate and download a PDF comparative report using jsPDF
 */
export function exportComparisonPdf(trialSeries, allDaa, aiSummaryText, activeCategory = 'herbicide', chartImgData = null) {
  const config = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight();
  const MARGIN = 15;
  const TEAL = hexToRgb(config.color.hex || '#10b981');
  const DARK = [44, 62, 80];

  // 1. Header Banner
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PAGE_WIDTH, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`SCIENTIFIC ${config.name.toUpperCase()} COMPARATIVE REPORT`, PAGE_WIDTH / 2, 20, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Comparing: ${trialSeries.map(s => s.trial.FormulationName).join(' vs ')}`, PAGE_WIDTH / 2, 30, { align: 'center' });
  
  doc.setFontSize(8.5);
  doc.text(`Generated on: ${formatDateTime(new Date())}`, PAGE_WIDTH / 2, 38, { align: 'center' });

  let y = 55;

  // 2. AI Executive summary box
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('AI COMPARATIVE AGRONOMIST REPORT', MARGIN, y);
  y += 5;

  const aiText = aiSummaryText || 'No AI summary generated. Click "Generate AI Report" in the comparison dashboard to create one.';
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);

  const splitAiText = doc.splitTextToSize(aiText, PAGE_WIDTH - (MARGIN * 2) - 4);
  const textHeight = splitAiText.length * 4.5 + 6;

  // Draw light background for AI box
  doc.setFillColor(245, 243, 255); // light purple
  doc.setDrawColor(221, 214, 254);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, PAGE_WIDTH - (MARGIN * 2), textHeight, 2, 2, 'FD');

  let textY = y + 4.5;
  splitAiText.forEach(line => {
    doc.text(line, MARGIN + 3, textY);
    textY += 4.5;
  });

  y += textHeight + 10;

  // 3. Efficacy Timeline Table
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(`EFFICACY TIMELINE (${config.primaryMetric.label.toUpperCase()})`, MARGIN, y);
  y += 4;

  const timelineHeaders = ['DAA', ...trialSeries.map(s => s.trial.FormulationName)];
  const timelineRows = allDaa.map(daa => {
    const row = [`DAA ${daa}`];
    trialSeries.forEach(s => {
      const obs = s.eff.find(o => Number(o.daa ?? 0) === daa);
      if (obs) {
        const ctrlText = obs.controlPct !== undefined ? ` (${obs.controlPct}% ctrl)` : '';
        row.push(`${obs[primaryObsField]}${config.primaryMetric.unit}${ctrlText}`);
      } else {
        row.push('—');
      }
    });
    return row;
  });

  doc.autoTable({
    startY: y,
    head: [timelineHeaders],
    body: timelineRows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    theme: 'grid'
  });

  y = doc.lastAutoTable.finalY + 10;

  // Embedded Chart Visual
  if (chartImgData) {
    try {
      if (y + 70 > PAGE_HEIGHT - 20) {
        doc.addPage();
        y = 15;
      }
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...DARK);
      doc.text('PERFORMANCE TIMELINE VISUALIZATION', MARGIN, y);
      y += 4;
      doc.addImage(chartImgData, 'PNG', MARGIN, y, PAGE_WIDTH - (MARGIN * 2), 60);
      y += 65;
    } catch (e) {
      console.warn("Failed to embed chart image in comparison PDF:", e);
    }
  }

  // --- Statistical Analysis Block ---
  const treatments = {};
  trialSeries.forEach(s => {
    const trt = s.trial.FormulationName || 'Untreated Check';
    if (!treatments[trt]) treatments[trt] = [];
    
    if (s.eff && s.eff.length > 0) {
      const latest = [...s.eff].sort((a, b) => (b.daa ?? 0) - (a.daa ?? 0))[0];
      const val = latest[primaryObsField];
      if (val !== undefined && val !== null && !isNaN(val)) {
        treatments[trt].push(parseFloat(val));
      }
    }
  });

  // Stage 1: Descriptive Statistics
  const isPositiveMetric = (activeCategory === 'nutrition' || activeCategory === 'biostimulant');
  const descRows = [];
  Object.entries(treatments).forEach(([trt, vals]) => {
    const n = vals.length;
    if (n === 0) return;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    let sd = 0;
    let cv = 0;
    let se = 0;
    if (n > 1) {
      const squaredDiffs = vals.map(v => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
      sd = Math.sqrt(variance);
      cv = mean > 0 ? (sd / mean) * 100 : 0;
      se = sd / Math.sqrt(n);
    }
    const ci_lower = mean - (1.96 * se);
    const ci_upper = mean + (1.96 * se);

    descRows.push({
      treatment: trt,
      mean: mean.toFixed(2),
      meanSE: `${mean.toFixed(2)} ± ${se.toFixed(2)}`,
      sd: sd.toFixed(2),
      se: se.toFixed(2),
      cv: cv.toFixed(1) + '%',
      ciRange: `95% CI: ${ci_lower.toFixed(2)}–${ci_upper.toFixed(2)}`,
      n,
      meanVal: mean
    });
  });

  // Calculate Treatment Improvement over Control
  const controlName = Object.keys(treatments).find(f => 
    f?.toLowerCase().includes('control') || 
    f?.toLowerCase().includes('untreated') ||
    f?.toLowerCase().includes('check') ||
    f?.toLowerCase().includes('utc')
  ) || Object.keys(treatments)[0];

  const improvementText = [];
  if (controlName) {
    const controlMeanObj = descRows.find(r => r.treatment === controlName);
    const controlMean = controlMeanObj ? controlMeanObj.meanVal : 0;
    if (controlMean > 0) {
      descRows.forEach(r => {
        if (r.treatment !== controlName) {
          const diffPct = isPositiveMetric 
            ? ((r.meanVal - controlMean) / controlMean) * 100 
            : ((controlMean - r.meanVal) / controlMean) * 100;
          
          improvementText.push(`${r.treatment} ${isPositiveMetric ? 'increased' : 'reduced'} ${config.primaryMetric.label} by ${diffPct.toFixed(1)}% over untreated control (${controlName}).`);
        }
      });
    }
  }

  if (descRows.length > 0) {
    if (y > PAGE_HEIGHT - 50) { doc.addPage(); y = 15; }
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(`DESCRIPTIVE STATISTICS (${config.primaryMetric.label.toUpperCase()})`, MARGIN, y);
    y += 4;

    doc.autoTable({
      startY: y,
      head: [['Treatment/Formulation', 'Mean ± SE', 'SD', 'CV%', '95% Confidence Interval', 'N (Replications)']],
      body: descRows.map(r => [r.treatment, r.meanSE, r.sd, r.cv, r.ciRange, String(r.n)]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255] },
      theme: 'striped'
    });
    y = doc.lastAutoTable.finalY + 5;

    // Print treatment improvements if any
    if (improvementText.length > 0) {
      if (y + (improvementText.length * 4.5) > PAGE_HEIGHT - 20) { doc.addPage(); y = 15; }
      doc.setFont('Helvetica', 'normal'); doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      improvementText.forEach(txt => {
        doc.text(`• ${txt}`, MARGIN, y);
        y += 4.5;
      });
      y += 5;
    }


    // Stage 2: ANOVA (only if Replications >= 3)
    const maxN = Math.max(...descRows.map(r => r.n), 0);
    if (maxN >= 3 && descRows.length >= 2) {
      const projectTrials = trialSeries.map(s => s.trial);
      const anova = performANOVA(projectTrials, { metric: primaryObsField });
      
      if (anova && !anova.error && anova.anovaTable) {
        if (y > PAGE_HEIGHT - 60) { doc.addPage(); y = 15; }
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('ANALYSIS OF VARIANCE (ANOVA)', MARGIN, y);
        y += 4;

        const nf = (v, d = 2) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
        doc.autoTable({
          startY: y,
          head: [['Source of Variation', 'DF', 'SS', 'MS', 'F-Value', 'P-Value', 'Sig']],
          body: anova.anovaTable.source.map((src, i) => {
            const pVal = anova.anovaTable.p[i];
            const sig = pVal !== null && pVal !== undefined ? (pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns') : '';
            return [
              src,
              anova.anovaTable.df[i] ?? '—',
              nf(anova.anovaTable.ss[i]),
              nf(anova.anovaTable.ms[i]),
              nf(anova.anovaTable.f[i]),
              pVal !== null && pVal !== undefined ? pVal.toFixed(4) : '—',
              sig
            ];
          }),
          margin: { left: MARGIN, right: MARGIN },
          styles: { fontSize: 8.5, cellPadding: 2 },
          headStyles: { fillColor: DARK },
          theme: 'grid'
        });
        y = doc.lastAutoTable.finalY + 10;

        // Stage 3: Tukey Post-hoc (only if ANOVA P-value < 0.05)
        if (anova.pValue < 0.05) {
          if (y > PAGE_HEIGHT - 50) { doc.addPage(); y = 15; }
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(11);
          doc.text('TUKEY HSD MULTIPLE COMPARISONS', MARGIN, y);
          y += 4;

          const tukey = performTukeyHSD(projectTrials, { metric: primaryObsField });
          if (tukey && tukey.groups) {
            doc.autoTable({
              startY: y,
              head: [['Treatment', 'Mean with Significance Grouping']],
              body: descRows.map(r => {
                const letter = tukey.groups[r.treatment] || 'a';
                return [r.treatment, `${r.meanVal.toFixed(2)} ${letter}`];
              }),
              margin: { left: MARGIN, right: MARGIN },
              styles: { fontSize: 8.5, cellPadding: 2 },
              headStyles: { fillColor: TEAL },
              theme: 'striped'
            });
            y = doc.lastAutoTable.finalY + 10;
          }
        }
      }
    }
  }

  // 4. Comparison Table (Parameters)
  if (y > PAGE_HEIGHT - 60) {
    doc.addPage();
    y = 15;
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('DETAILED TRIAL SPECIFICATIONS', MARGIN, y);
  y += 4;

  const fields = [
    // Chemistry
    ['Active Ingredients', t => t.activeIngredients || '—'],
    ['Cost / Hectare', t => t.costPerHa || '—'],
    ['Dosage Rate', t => t.Dosage || '—'],
    [config.targetLabel, t => t[config.targetField] || '—'],
    // Soil
    ['Soil Texture', t => t.texture || '—'],
    ['Soil pH', t => t.pH || '—'],
    ['Soil Clay %', t => t.clay || '—'],
    ['Soil Sand %', t => t.sand || '—'],
    ['Soil Organic Carbon %', t => t.oc || '—'],
    // Weather
    ['Avg Temperature', t => t.avgTemp || '—'],
    ['Avg Humidity', t => t.avgHumid || '—'],
    ['Avg Wind Speed', t => t.avgWind || '—'],
    ['Avg Rainfall', t => t.avgRain || '—'],
    // Meta
    ['Location', t => t.Location || '—'],
    ['Application Date', t => t.Date ? new Date(t.Date).toLocaleDateString() : '—'],
    ['Investigator', t => t.InvestigatorName || '—'],
    ['Overall Assessment', t => t.Result || '—'],
    ['Final Status', t => (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Active'],
  ];

  const specHeaders = ['Parameter', ...trialSeries.map(s => s.trial.FormulationName)];
  const specRows = fields.map(([label, getter]) => {
    return [label, ...trialSeries.map(s => getter(s.trial))];
  });

  doc.autoTable({
    startY: y,
    head: [specHeaders],
    body: specRows,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252], width: 45 } },
    theme: 'grid'
  });

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Miklens ${config.name} Trial Manager | Page ${i} of ${pageCount}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 6, { align: 'center' });
  }

  doc.save(`${activeCategory}_trial_comparison_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
