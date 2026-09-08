import { safeJsonParse } from '../utils/helpers.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';

/**
 * Generates and triggers a formatted, printable R&D Agronomic Dossier for a formulation
 */
export function exportFormulationDossier(formulation, allTrials = [], libraryIngredients = [], activeCategory = 'herbicide') {
  if (!formulation) return;

  const config = getCategoryConfig(activeCategory);
  const formName = formulation.Name || 'Unnamed Formulation';
  const formCode = formulation.Code || formulation.ID || 'N/A';
  const rawIngs = safeJsonParse(formulation.IngredientsJSON, []);
  const calculatedCost = calculateFormulationCost(rawIngs, libraryIngredients);

  // Filter linked trials
  const linkedTrials = (allTrials || []).filter(t => {
    const trialForm = String(t.FormulationID || t.FormulationName || '').trim().toLowerCase();
    const fId = String(formulation.ID || '').toLowerCase();
    const fName = String(formulation.Name || '').toLowerCase();
    const fCode = String(formulation.Code || '').toLowerCase();
    return trialForm && (trialForm === fId || trialForm === fName || trialForm === fCode);
  });

  const microplotTrials = linkedTrials.filter(t => !t.ProjectDesign || t.ProjectDesign !== 'LargeScale');
  const fieldTrials = linkedTrials.filter(t => t.ProjectDesign === 'LargeScale');
  const finalizedTrials = linkedTrials.filter(t => t.ControlFinalized || t.Result || t.IsCompleted);

  const totalTrials = linkedTrials.length;
  const finalizedCount = finalizedTrials.length;

  // Win rate
  const winCount = linkedTrials.filter(t => {
    const r = (t.Result || '').toLowerCase();
    return r === 'excellent' || r === 'good';
  }).length;
  const winRate = totalTrials > 0 ? Math.round((winCount / totalTrials) * 100) : 0;

  // Efficacies
  const effs = linkedTrials
    .map(t => Number(t.FinalEfficacy ?? t.Efficacy ?? t.AverageEfficacy))
    .filter(v => !isNaN(v) && v > 0);
  const avgEff = effs.length > 0 ? (effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1) : 'N/A';
  const maxEff = effs.length > 0 ? Math.max(...effs).toFixed(1) : 'N/A';

  // Target Spectrum
  const targetMap = {};
  linkedTrials.forEach(t => {
    const tgt = (t.TargetWeed || t.TargetWeeds || t.TargetDisease || t.TargetPest || t.Crop || 'Broad Spectrum').trim();
    if (!targetMap[tgt]) {
      targetMap[tgt] = { count: 0, sumEff: 0, validEffCount: 0, results: [] };
    }
    targetMap[tgt].count++;
    const e = Number(t.FinalEfficacy ?? t.Efficacy ?? t.AverageEfficacy);
    if (!isNaN(e) && e > 0) {
      targetMap[tgt].sumEff += e;
      targetMap[tgt].validEffCount++;
    }
    if (t.Result) targetMap[tgt].results.push(t.Result);
  });

  // Dosage Response
  const dosageMap = {};
  linkedTrials.forEach(t => {
    const dose = (t.Dosage || t.DosageRate || 'Standard Rate').trim();
    if (!dosageMap[dose]) {
      dosageMap[dose] = { count: 0, sumEff: 0, validEffCount: 0 };
    }
    dosageMap[dose].count++;
    const e = Number(t.FinalEfficacy ?? t.Efficacy ?? t.AverageEfficacy);
    if (!isNaN(e) && e > 0) {
      dosageMap[dose].sumEff += e;
      dosageMap[dose].validEffCount++;
    }
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Agronomic Dossier - ${formCode} - ${formName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #1e293b; background: #fff; line-height: 1.5; font-size: 13px; }
    @media print { body { padding: 0; } .no-print { display: none; } }
    .header { border-bottom: 2px solid #059669; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 18px; font-weight: 800; color: #065f46; letter-spacing: -0.5px; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
    .meta-box { text-align: right; font-size: 11px; color: #475569; }
    .dossier-title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .kpi-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
    .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
    .kpi-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
    h2 { font-size: 14px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 24px 0 12px 0; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 700; color: #475569; border: 1px solid #cbd5e1; }
    td { padding: 8px 10px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .rating-pill { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; display: inline-block; }
    .rating-excellent { background: #dcfce7; color: #15803d; }
    .rating-good { background: #dbeafe; color: #1d4ed8; }
    .rating-fair { background: #fef3c7; color: #b45309; }
    .rating-poor { background: #fee2e2; color: #b91c1c; }
    .notes-box { background: #f8fafc; border-left: 4px solid #059669; padding: 10px 14px; font-size: 12px; color: #334155; margin-bottom: 16px; border-radius: 0 6px 6px 0; }
    .action-bar { margin-bottom: 20px; display: flex; gap: 10px; }
    .btn { padding: 8px 14px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
    .btn:hover { background: #047857; }
    .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="action-bar no-print">
    <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn" style="background: #475569;" onclick="window.close()">Close Window</button>
  </div>

  <div class="header">
    <div>
      <div class="brand">MIKLENS BIO-SCIENCES</div>
      <div class="subtitle">Agrochemical R&D & Formulation Dossier • Category: ${config.name}</div>
      <div style="margin-top: 8px;">
        <h1 class="dossier-title">${formName}</h1>
        <span class="badge">Code: ${formCode}</span>
        ${formulation.CreatedAt ? `<span style="font-size: 11px; color: #64748b; margin-left: 8px;">Registered: ${new Date(formulation.CreatedAt).toLocaleDateString()}</span>` : ''}
      </div>
    </div>
    <div class="meta-box">
      <div><strong>Confidential R&D File</strong></div>
      <div>Generated: ${new Date().toLocaleString()}</div>
      <div>Trials Evaluated: ${totalTrials}</div>
      <div>Database: Live Operational State</div>
    </div>
  </div>

  <!-- Key Metrics Summary -->
  <div class="grid">
    <div class="kpi-card">
      <div class="kpi-title">Win Rate</div>
      <div class="kpi-val" style="color: ${winRate >= 75 ? '#059669' : winRate >= 50 ? '#2563eb' : '#d97706'}">${winRate}%</div>
      <div class="kpi-sub">${winCount} of ${totalTrials} trials rated Good/Exc</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Average Efficacy</div>
      <div class="kpi-val">${avgEff}${avgEff !== 'N/A' ? '%' : ''}</div>
      <div class="kpi-sub">Peak recorded: ${maxEff}${maxEff !== 'N/A' ? '%' : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Trial Portfolio</div>
      <div class="kpi-val">${totalTrials}</div>
      <div class="kpi-sub">${microplotTrials.length} Microplot • ${fieldTrials.length} Large Field</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Estimated Recipe Cost</div>
      <div class="kpi-val">₹${calculatedCost.toFixed(2)}</div>
      <div class="kpi-sub">Per liter/kg formulation mix</div>
    </div>
  </div>

  ${formulation.Notes ? `
    <div class="notes-box">
      <strong>Agronomic Rationale & Field Notes:</strong><br/>
      ${formulation.Notes}
    </div>
  ` : ''}

  <!-- Formulation Recipe Specification -->
  <h2>
    <span>1. Recipe & Active Ingredient Specification</span>
    <span style="font-size: 11px; font-weight: normal; color: #64748b;">${rawIngs.length} Components</span>
  </h2>
  <table>
    <thead>
      <tr>
        <th style="width: 40px;">#</th>
        <th>Ingredient / Active Component</th>
        <th style="width: 120px;">Quantity</th>
        <th style="width: 80px;">Unit</th>
        <th style="width: 140px;">Library Unit Cost</th>
        <th style="width: 140px;">Component Cost</th>
      </tr>
    </thead>
    <tbody>
      ${rawIngs.length > 0 ? rawIngs.map((ing, idx) => {
        const libMatch = libraryIngredients.find(l => l.Name?.toLowerCase().trim() === ing.name?.toLowerCase().trim());
        const unitCost = libMatch ? Number(libMatch.Cost || 0) : 0;
        return `
          <tr>
            <td style="text-align: center; color: #64748b;">${idx + 1}</td>
            <td><strong>${ing.name || 'Unknown'}</strong></td>
            <td>${ing.quantity ?? ing.qty ?? 0}</td>
            <td>${ing.unit || 'ml'}</td>
            <td>${unitCost > 0 ? `₹${unitCost.toFixed(2)} / ${libMatch.Unit || 'unit'}` : '<span style="color: #94a3b8;">Not listed</span>'}</td>
            <td><strong>${unitCost > 0 ? `₹${((Number(ing.quantity ?? ing.qty) || 0) * (unitCost / (libMatch?.Unit?.toLowerCase() === 'l' ? 1000 : 1))).toFixed(2)}` : '—'}</strong></td>
          </tr>
        `;
      }).join('') : `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 16px;">No recipe ingredients listed</td></tr>`}
      <tr style="background: #f1f5f9; font-weight: bold;">
        <td colspan="5" style="text-align: right; padding-right: 14px;">Total Estimated Formulation Cost:</td>
        <td style="color: #059669; font-size: 14px;">₹${calculatedCost.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Target Spectrum Performance -->
  <h2>
    <span>2. Target Spectrum Efficacy Matrix</span>
    <span style="font-size: 11px; font-weight: normal; color: #64748b;">${Object.keys(targetMap).length} Targets Tested</span>
  </h2>
  <table>
    <thead>
      <tr>
        <th>Target Species / Condition</th>
        <th style="width: 100px; text-align: center;">Trials Evaluated</th>
        <th style="width: 140px; text-align: center;">Average Efficacy</th>
        <th style="width: 160px;">Result Breakdown</th>
      </tr>
    </thead>
    <tbody>
      ${Object.keys(targetMap).length > 0 ? Object.entries(targetMap).map(([tgt, data]) => {
        const avg = data.validEffCount > 0 ? `${(data.sumEff / data.validEffCount).toFixed(1)}%` : 'N/A';
        const numAvg = data.validEffCount > 0 ? data.sumEff / data.validEffCount : 0;
        const rating = numAvg >= 85 ? 'Excellent' : numAvg >= 70 ? 'Good' : numAvg >= 50 ? 'Fair' : 'Poor';
        return `
          <tr>
            <td><strong>${tgt}</strong></td>
            <td style="text-align: center;">${data.count}</td>
            <td style="text-align: center; font-weight: bold; color: ${numAvg >= 75 ? '#059669' : '#d97706'};">${avg}</td>
            <td>
              <span class="rating-pill rating-${rating.toLowerCase()}">${rating}</span>
            </td>
          </tr>
        `;
      }).join('') : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 16px;">No target spectrum data recorded yet</td></tr>`}
    </tbody>
  </table>

  <!-- Dosage Response Breakdown -->
  <h2>
    <span>3. Dosage-Response Performance Matrix</span>
    <span style="font-size: 11px; font-weight: normal; color: #64748b;">${Object.keys(dosageMap).length} Application Rates</span>
  </h2>
  <table>
    <thead>
      <tr>
        <th>Dosage Rate</th>
        <th style="width: 120px; text-align: center;">Trials Conducted</th>
        <th style="width: 160px; text-align: center;">Mean Control Efficacy</th>
      </tr>
    </thead>
    <tbody>
      ${Object.keys(dosageMap).length > 0 ? Object.entries(dosageMap).map(([rate, data]) => {
        const avg = data.validEffCount > 0 ? `${(data.sumEff / data.validEffCount).toFixed(1)}%` : 'N/A';
        return `
          <tr>
            <td><strong>${rate}</strong></td>
            <td style="text-align: center;">${data.count}</td>
            <td style="text-align: center; font-weight: bold;">${avg}</td>
          </tr>
        `;
      }).join('') : `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 16px;">No dosage response data recorded yet</td></tr>`}
    </tbody>
  </table>

  <!-- Complete Linked Trial Log -->
  <h2>
    <span>4. Complete Field & Plot Trial Evaluation Log</span>
    <span style="font-size: 11px; font-weight: normal; color: #64748b;">${linkedTrials.length} Trial Records</span>
  </h2>
  <table>
    <thead>
      <tr>
        <th style="width: 80px;">Type</th>
        <th>Trial Title / ID</th>
        <th>Date</th>
        <th>Location</th>
        <th>Target</th>
        <th>Dosage</th>
        <th style="text-align: center;">Efficacy</th>
        <th style="text-align: center;">Rating</th>
      </tr>
    </thead>
    <tbody>
      ${linkedTrials.length > 0 ? linkedTrials.map(t => {
        const isField = t.ProjectDesign === 'LargeScale';
        const eff = t.FinalEfficacy ?? t.Efficacy ?? t.AverageEfficacy;
        const res = t.Result || 'Unrated';
        return `
          <tr>
            <td>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${isField ? 'background: #fef3c7; color: #92400e;' : 'background: #e0f2fe; color: #0369a1;'}">
                ${isField ? '🚜 Field' : '🌿 Plot'}
              </span>
            </td>
            <td><strong>${t.TrialName || t.ID}</strong></td>
            <td>${t.Date ? new Date(t.Date).toLocaleDateString() : 'N/A'}</td>
            <td>${t.Location || '—'}</td>
            <td>${t.TargetWeed || t.TargetWeeds || t.TargetDisease || t.TargetPest || t.Crop || '—'}</td>
            <td>${t.Dosage || t.DosageRate || '—'}</td>
            <td style="text-align: center; font-weight: bold;">${eff !== undefined && eff !== null ? `${eff}%` : '—'}</td>
            <td style="text-align: center;">
              <span class="rating-pill rating-${res.toLowerCase()}">${res}</span>
            </td>
          </tr>
        `;
      }).join('') : `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 16px;">No trials linked to this formulation</td></tr>`}
    </tbody>
  </table>

  <div class="footer">
    <div>Miklens Agrochemical Trial Manager • Proprietary R&D Record</div>
    <div>Document Ref: DOS-${formCode}-${Date.now().toString().slice(-6)}</div>
  </div>
</body>
</html>`;

  // Open formatted print/save window
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    // Fallback: create downloadable HTML blob
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Formulation-Dossier-${formCode}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
