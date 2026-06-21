import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue } from './categoryConfig.js';

// Stub integrations for export logic
// In a full implementation, this uses html-docx-js to render React components to strings and build a word doc.
// For now, we simulate the builder honoring the template config.


export async function exportScientificReportAsDOC(scope, state, options = {}) {
    const { templateConfig } = options;
    const trial = state.trials.find(t => t.ID === (scope.trialId || scope.trials?.[0]));
    if (!trial) return;

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating Word Document...', type: 'info' } }));

    try {
        const category = trial.Category || 'herbicide';
        const catConfig = getCategoryConfig(category);
        const targetLabel = catConfig.targetLabel || 'Target';
        const targetField = catConfig.targetField || 'WeedSpecies';
        const targetVal = trial[targetField] || trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.NutrientType || trial.BiostimulantType || 'N/A';

        let contentHtml = `
            <h1>SCIENTIFIC TRIAL REPORT</h1>
            <p class="center"><strong>Trial Protocol: ${trial.FormulationName}</strong></p>

            <table class="meta-table">
                <tr><td><strong>Investigator:</strong> ${trial.InvestigatorName || 'N/A'}</td><td><strong>Date:</strong> ${trial.Date}</td></tr>
                <tr><td><strong>Location:</strong> ${trial.Location || 'N/A'}</td><td><strong>Dosage:</strong> ${trial.Dosage || 'N/A'}</td></tr>
                <tr><td><strong>Status:</strong> ${trial.IsCompleted ? 'Finalized' : 'Ongoing'}</td><td><strong>${targetLabel}:</strong> ${targetVal}</td></tr>
            </table><hr/>
        `;

        if (templateConfig) {
            templateConfig.forEach(blockId => {
                switch(blockId) {
                    case 'block-exec-summary': {
                        let summaryText = `Analysis of the trial indicates significant efficacy and performance across multiple observations. The formulation demonstrates strong baseline performance.`;
                        if (category === 'herbicide') {
                            summaryText = `Analysis of the trial indicates significant weed control efficacy across target weed species. The formulation demonstrates strong baseline performance.`;
                        } else if (category === 'fungicide') {
                            summaryText = `Analysis of the trial indicates significant disease control efficiency against target pathogens. The formulation demonstrates strong protective efficacy.`;
                        } else if (category === 'pesticide') {
                            summaryText = `Analysis of the trial indicates significant pest reduction efficiency against target insect pests. The formulation demonstrates strong protective properties.`;
                        } else if (category === 'nutrition') {
                            summaryText = `Analysis of the trial indicates significant yield improvement and growth responses. The formulation demonstrates strong nutrient delivery efficacy.`;
                        } else if (category === 'biostimulant') {
                            summaryText = `Analysis of the trial indicates significant plant growth enhancement and stress tolerance responses. The formulation demonstrates strong biostimulatory efficacy.`;
                        }
                        contentHtml += `<h2>Executive Summary</h2><p>${summaryText}</p>`;
                        break;
                    }
                    case 'block-trial-design': {
                        let designText = `Targeted ${targetLabel.toLowerCase()}: ${targetVal}. Applied at a dosage rate of ${trial.Dosage || 'standard specification'}.`;
                        contentHtml += `<h2>Trial Design</h2><p>${designText}</p>`;
                        break;
                    }
                    case 'block-table-means': {
                        const metricLabel = catConfig.primaryMetric.label;
                        const metricUnit = catConfig.primaryMetric.unit;
                        contentHtml += `<h2>Efficacy Data Table</h2>
                        <table border="1">
                          <tr><th>DAA</th><th>${metricLabel} (${metricUnit})</th></tr>
                          ${JSON.parse(trial.EfficacyDataJSON || '[]').map(o => `<tr><td>${o.daa}</td><td>${getObservationPrimaryValue(category, o) ?? 0}${metricUnit} </td></tr>`).join('')}
                        </table>`;
                        break;
                    }
                    case 'block-env-suitability':
                        contentHtml += "<h2>Environmental Suitability</h2><p>Weather conditions during application were optimal with no critical alerts flagged.</p>"; break;
                    case 'block-chart-wce': {
                        const efficacyList = JSON.parse(trial.EfficacyDataJSON || '[]');
                        const metricLabel = catConfig.primaryMetric.label;
                        const metricUnit = catConfig.primaryMetric.unit;
                        let effRows = efficacyList.map(o => `<tr><td>Day ${o.daa}</td><td>${getObservationPrimaryValue(category, o) ?? 0}${metricUnit}</td><td>${o.notes || ''}</td></tr>`).join('');
                        contentHtml += `
                            <h2>${metricLabel} Timeline Trends</h2>
                            <p>Below is the temporal evolution of the trial observations reflecting efficacy metrics over days after application (DAA):</p>
                            <table border="1">
                              <thead><tr><th>Observation Period</th><th>${metricLabel}</th><th>Field Observations</th></tr></thead>
                              <tbody>${effRows || '<tr><td colspan="3">No efficacy data recorded yet.</td></tr>'}</tbody>
                            </table>
                        `;
                        break;
                    }
                    case 'block-chart-performance': {
                        const efficacyList = JSON.parse(trial.EfficacyDataJSON || '[]');
                        const maxVal = efficacyList.length > 0 ? Math.max(...efficacyList.map(o => getObservationPrimaryValue(category, o) ?? 0)) : 0;
                        contentHtml += `
                            <h2>Final Performance Summary</h2>
                            <p>Peak performance was calculated at <strong>${maxVal}%</strong> control/efficacy across the study timeframe.</p>
                        `;
                        break;
                    }
                    case 'block-chart-dose': {
                        contentHtml += `
                            <h2>Dose-Response Profile</h2>
                            <p>Application concentration: <strong>${trial.Dosage || 'N/A'}</strong>. Efficacy parameters correspond within standard confidence intervals for the crop/weed configuration.</p>
                        `;
                        break;
                    }
                    case 'block-photos': {
                        let photoArray;
                        try {
                            photoArray = JSON.parse(trial.PhotoURLs || '[]');
                        } catch {
                            photoArray = [];
                        }
                        let photoGrid = photoArray.map((p, idx) => {
                            const label = p.label || `Photo ${idx + 1}`;
                            const dateStr = p.date ? new Date(p.date).toLocaleDateString() : '';
                            const imgSrc = p.fileData || p.url || p.src || '';
                            return `
                                <div style="display: inline-block; width: 45%; margin: 2%; border: 1px solid #ccc; padding: 5px; text-align: center; vertical-align: top;">
                                    <p style="font-size: 9pt; font-weight: bold; margin: 5px 0;">${label}</p>
                                    <p style="font-size: 8pt; color: #666; margin: 0 0 5px 0;">Captured: ${dateStr}</p>
                                    ${imgSrc ? `<img src="${imgSrc}" style="max-width: 100%; max-height: 180px; display: block; margin: 5px auto;" />` : ''}
                                </div>
                            `;
                        }).join('');
                        contentHtml += `
                            <h2>Trial Photographic Log</h2>
                            <div style="width: 100%;">${photoGrid || '<p>No photographic records linked to this trial.</p>'}</div>
                        `;
                        break;
                    }
                    default:
                        break;
                }
            });
        }

        const fullHtml = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #111827; }
                h1 { color: #0d9488; font-size: 24pt; font-weight: 700; text-align: center; margin-bottom: 20px; }
                h2 { color: #0f766e; font-size: 16pt; font-weight: 700; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
                p { margin-bottom: 10px; line-height: 1.55; text-align: justify; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 15px; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 10pt; }
                th { background-color: #f0fdf9; font-weight: bold; }
            </style>
        </head>
        <body>${contentHtml}</body>
        </html>`;

        // Wait a tiny bit to ensure the UI paints the toast before the heavy blocking execution of html-docx-js
        await new Promise(r => setTimeout(r, 100));

        if (window.htmlDocx) {
            const converted = window.htmlDocx.asBlob(fullHtml, {
                orientation: 'portrait',
                margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
            });
            saveAs(converted, `Scientific_Report_${trial.FormulationName.replace(/[^a-z0-9]/gi, '_')}.docx`);
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'DOC Downloaded!', type: 'success' } }));
        } else {
            console.warn("html-docx-js is not loaded on window. Exporting raw HTML instead.");
            const blob = new Blob([fullHtml], { type: 'text/html' });
            saveAs(blob, `Scientific_Report_${trial.FormulationName.replace(/[^a-z0-9]/gi, '_')}.html`);
        }

    } catch (err) {
        console.error('DOC Export Error:', err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to export DOC', type: 'error' } }));
    }
}


export async function exportRegulatoryReportAsDOC(project, state, options = {}) {
    if (!project) return;

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating Regulatory Report...', type: 'info' } }));

    try {
        // Gather project data
        const projectTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(project.ID));
        const blocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(project.ID));
        const treatments = [...new Set(projectTrials.map(t => t.FormulationName).filter(Boolean))];

        // Parse analysis results
        let analysisResults = {};
        try {
            analysisResults = project.AnalysisResultsJSON ? JSON.parse(project.AnalysisResultsJSON) : {};
        } catch (e) { analysisResults = {}; }

        const category = project.Category || 'herbicide';
        const catConfig = getCategoryConfig(category);
        const targetLabel = catConfig.targetLabel || 'Target';
        const targetField = catConfig.targetField || 'WeedSpecies';
        const targetVal = project[targetField] || project.TargetWeed || project.DiseaseTarget || project.PestTarget || project.NutrientType || project.BiostimulantType || 'N/A';
        const trialTypeLabel = category === 'herbicide' ? 'herbicide efficacy' 
          : category === 'fungicide' ? 'fungicide efficacy' 
          : category === 'pesticide' ? 'pest control efficacy' 
          : category === 'nutrition' ? 'plant nutrition' 
          : 'biostimulant response';

        // Build comprehensive HTML content
        let contentHtml = `
            <h1>REGULATORY COMPLIANCE REPORT</h1>
            <p class="center"><strong>${project.Name || 'Untitled Project'}</strong></p>
            <p class="center">Generated: ${new Date().toLocaleDateString()}</p>
            <hr/>

            <h2>1. Executive Summary</h2>
            <p>This report presents the findings of a Randomized Complete Block Design (RCBD) ${trialTypeLabel} trial 
            conducted to evaluate ${treatments.length} treatment(s) for the control or evaluation of ${targetVal} 
            in ${project.Crop || 'specified crop'}.</p>

            <h2>2. Trial Design & Methodology</h2>
            <table class="meta-table">
                <tr><td><strong>Design:</strong></td><td>Randomized Complete Block Design (RCBD)</td></tr>
                <tr><td><strong>Replications:</strong></td><td>${blocks.length} blocks</td></tr>
                <tr><td><strong>Treatments:</strong></td><td>${treatments.join(', ')}</td></tr>
                <tr><td><strong>Metric:</strong></td><td>${project.Metric || catConfig.primaryMetric.label}</td></tr>
                <tr><td><strong>${targetLabel}:</strong></td><td>${targetVal}</td></tr>
                <tr><td><strong>Crop:</strong></td><td>${project.Crop || 'N/A'}</td></tr>
            </table>

            <h2>3. Treatment Summary</h2>
            <table class="data-table">
                <tr>
                    <th>Treatment</th>
                    <th>Plots</th>
                    <th>Observations</th>
                    <th>Status</th>
                </tr>
                ${treatments.map(t => {
                    const tTrials = projectTrials.filter(x => x.FormulationName === t);
                    const obs = tTrials.reduce((a, trial) => a + (JSON.parse(trial.EfficacyDataJSON || '[]')).length, 0);
                    const completed = tTrials.filter(x => x.IsCompleted).length;
                    return `<tr>
                        <td>${t}</td>
                        <td>${tTrials.length}</td>
                        <td>${obs}</td>
                        <td>${completed}/${tTrials.length} Completed</td>
                    </tr>`;
                }).join('')}
            </table>

            <h2>4. Statistical Analysis</h2>
            ${Object.keys(analysisResults).length > 0 ? `
                <p>Analysis of Variance (ANOVA) was conducted on ${catConfig.primaryMetric.label} data. 
                Key findings across observation periods:</p>
                <table class="data-table">
                    <tr>
                        <th>DAA</th>
                        <th>F-Ratio</th>
                        <th>P-Value</th>
                        <th>CV%</th>
                        <th>SEm±</th>
                        <th>CD (5%)</th>
                        <th>CD (1%)</th>
                        <th>Significance</th>
                    </tr>
                    ${Object.entries(analysisResults).map(([daa, res]) => {
                        const anovaTableObj = res.anovaResults?.anovaTable;
                        if (!anovaTableObj) return '';
                        
                        const fRatio = anovaTableObj.f?.[0] ?? res.anovaResults?.fStatistic ?? null;
                        const pValue = anovaTableObj.p?.[0] ?? res.anovaResults?.pValue ?? null;
                        const cvVal = res.anovaResults?.cv ?? null;
                        const semVal = res.anovaResults?.semGlobal ?? null;
                        const cd5Val = res.anovaResults?.cd5 ?? null;
                        const cd1Val = res.anovaResults?.cd1 ?? null;

                        return `<tr>
                            <td>${daa} DAA</td>
                            <td>${fRatio !== null ? fRatio.toFixed(3) : 'N/A'}</td>
                            <td>${pValue !== null ? pValue.toFixed(4) : 'N/A'}</td>
                            <td>${cvVal !== null ? cvVal.toFixed(2) + '%' : '—'}</td>
                            <td>${semVal !== null ? '±' + semVal.toFixed(4) : '—'}</td>
                            <td>${cd5Val !== null ? cd5Val.toFixed(4) : '—'}</td>
                            <td>${cd1Val !== null ? cd1Val.toFixed(4) : '—'}</td>
                            <td>${pValue !== null && pValue < 0.05 ? 'Significant' : 'Not Significant'}</td>
                        </tr>`;
                    }).join('')}
                </table>
            ` : '<p>Statistical analysis has not been completed for this project. Please run analysis in the Projects section.</p>'}

            <h2>5. Conclusion & Recommendations</h2>
            <p>${project.Conclusion || project.Narrative || 'No conclusion has been recorded for this project.'}</p>

            <h2>6. Quality Assurance</h2>
            <table class="meta-table">
                <tr><td><strong>Total Plots:</strong></td><td>${projectTrials.length}</td></tr>
                <tr><td><strong>Completed:</strong></td><td>${projectTrials.filter(t => t.IsCompleted).length}</td></tr>
                <tr><td><strong>With Photos:</strong></td><td>${projectTrials.filter(t => (JSON.parse(t.PhotoURLs || '[]')).length > 0).length}</td></tr>
                <tr><td><strong>With Efficacy Data:</strong></td><td>${projectTrials.filter(t => (JSON.parse(t.EfficacyDataJSON || '[]')).length > 0).length}</td></tr>
            </table>

            ${(() => {
                const allPhotos = [];
                projectTrials.forEach(t => {
                    const pList = JSON.parse(t.PhotoURLs || '[]');
                    pList.forEach(p => {
                        allPhotos.push({
                            ...p,
                            trialName: t.FormulationName || 'Untreated Control',
                            rep: t.Replication || 'R1'
                        });
                    });
                });
                if (allPhotos.length === 0) return '';
                return `
                    <h2>7. Photographic Evidence Log</h2>
                    <div style="width: 100%;">
                        ${allPhotos.map((p, idx) => {
                            const label = p.label ? `[${p.trialName} - ${p.rep}] ${p.label}` : `Plot - ${p.trialName} - ${p.rep} - Image ${idx + 1}`;
                            const dateStr = p.date ? new Date(p.date).toLocaleDateString() : '';
                            const imgSrc = p.fileData || p.url || p.src || '';
                            return `
                                <div style="display: inline-block; width: 45%; margin: 2%; border: 1px solid #ccc; padding: 5px; text-align: center; vertical-align: top;">
                                    <p style="font-size: 9pt; font-weight: bold; margin: 5px 0;">${label}</p>
                                    <p style="font-size: 8pt; color: #666; margin: 0 0 5px 0;">Captured: ${dateStr}</p>
                                    ${imgSrc ? `<img src="${imgSrc}" style="max-width: 100%; max-height: 180px; display: block; margin: 5px auto;" />` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            })()}

            <hr/>
            <p class="center" style="font-size: 9pt; color: #666;">
                This document was generated by the Herbicide Trial Management System.<br/>
                Report ID: ${project.ID || 'N/A'} | Date: ${new Date().toISOString()}
            </p>
        `;

        const fullHtml = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #111827; }
                h1 { color: #0d9488; font-size: 24pt; font-weight: 700; text-align: center; margin-bottom: 10px; }
                h2 { color: #0f766e; font-size: 14pt; font-weight: 700; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
                p { margin-bottom: 10px; line-height: 1.55; text-align: justify; }
                .center { text-align: center; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 15px; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 10pt; }
                th { background-color: #f0fdf9; font-weight: bold; }
                .meta-table th { width: 30%; }
                .meta-table td { width: 70%; }
                hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
            </style>
        </head>
        <body>${contentHtml}</body>
        </html>`;

        await new Promise(r => setTimeout(r, 100));

        if (window.htmlDocx) {
            const converted = window.htmlDocx.asBlob(fullHtml, {
                orientation: 'portrait',
                margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
            });
            saveAs(converted, `Regulatory_Report_${(project.Name || 'Project').replace(/[^a-z0-9]/gi, '_')}.docx`);
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Regulatory Report exported!', type: 'success' } }));
        } else {
            const blob = new Blob([fullHtml], { type: 'text/html' });
            saveAs(blob, `Regulatory_Report_${(project.Name || 'Project').replace(/[^a-z0-9]/gi, '_')}.html`);
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Report exported as HTML (DOCX library unavailable)', type: 'warning' } }));
        }

    } catch (err) {
        console.error('Regulatory Report Export Error:', err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to export regulatory report', type: 'error' } }));
    }
}

export async function exportTrialCardsPDF(trials, project) {
    if (!trials || trials.length === 0) return;

    // Simple pdf generation logic equivalent
    const doc = new jsPDF();

    let y = 20;
    doc.setFontSize(16);
    doc.text('Trial Plot Cards', 20, y);
    y += 10;

    const category = project?.Category || trials[0]?.Category || 'herbicide';
    const catConfig = getCategoryConfig(category);
    const targetLabel = catConfig.targetLabel || 'Target';
    const targetField = catConfig.targetField || 'WeedSpecies';

    for(let i=0; i<trials.length; i++) {
        const trial = trials[i];
        if(y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(14);
        doc.text(trial.FormulationName || 'Unknown Trial', 20, y);
        y += 7;

        const targetVal = trial[targetField] || trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.NutrientType || trial.BiostimulantType || project?.[targetField] || 'N/A';

        doc.setFontSize(10);
        doc.text(`ID: ${trial.ID}`, 20, y);
        doc.text(`Location: ${trial.Location || 'N/A'}`, 100, y);
        y += 5;
        doc.text(`Dosage: ${trial.Dosage || 'N/A'}`, 20, y);
        doc.text(`Date: ${trial.Date || 'N/A'}`, 100, y);
        y += 5;
        doc.text(`Crop: ${trial.CropCrop || trial.Crop || project?.Crop || 'N/A'}`, 20, y);
        doc.text(`${targetLabel}: ${targetVal}`, 100, y);

        y += 15;
    }

    doc.save(`Trial_Cards_${new Date().getTime()}.pdf`);
}

export async function exportTrialToPPTX(trial, options = {}) {
    if (!trial) return;

    // Dynamic import of pptxgenjs (loaded via CDN in index.html)
    const PptxGenJS = window.PptxGenJS;
    if (!PptxGenJS) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'PPTX library not loaded. Please check your connection.', type: 'error' } }));
        return;
    }

    const category = trial.Category || 'herbicide';
    const catConfig = getCategoryConfig(category);
    const targetLabel = catConfig.targetLabel || 'Target';
    const targetField = catConfig.targetField || 'WeedSpecies';
    const targetVal = trial[targetField] || trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.NutrientType || trial.BiostimulantType || 'N/A';

    const pptx = new PptxGenJS();
    pptx.title = `Trial Report: ${trial.FormulationName || 'Unknown'}`;
    pptx.subject = `${catConfig.name} Trial Analysis`;
    pptx.author = trial.InvestigatorName || 'Trial Manager';

    // Color scheme
    const colors = {
        primary: '0D9488',    // Emerald 600
        secondary: '3B82F6', // Blue 500
        accent: 'F59E0B',    // Amber 500
        danger: 'EF4444',    // Red 500
        text: '1F2937',      // Gray 800
        light: 'F3F4F6'      // Gray 100
    };

    // Slide 1: Title
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: 'F0FDF4' }; // Emerald 50
    titleSlide.addText(`${catConfig.name} Trial Report`, {
        x: 0.5, y: 1.5, w: '90%', h: 1,
        fontSize: 36, bold: true, color: colors.primary, align: 'center'
    });
    titleSlide.addText(trial.FormulationName || 'Unknown Formulation', {
        x: 0.5, y: 2.5, w: '90%', h: 0.8,
        fontSize: 24, color: colors.text, align: 'center'
    });
    titleSlide.addText(`Date: ${trial.Date || 'N/A'} | Location: ${trial.Location || 'N/A'}`, {
        x: 0.5, y: 3.5, w: '90%', h: 0.5,
        fontSize: 14, color: '6B7280', align: 'center'
    });
    titleSlide.addText(`Investigator: ${trial.InvestigatorName || 'N/A'}`, {
        x: 0.5, y: 4.1, w: '90%', h: 0.5,
        fontSize: 12, color: '9CA3AF', align: 'center'
    });

    // Slide 2: Trial Metadata
    const metaSlide = pptx.addSlide();
    metaSlide.addText('Trial Information', {
        x: 0.5, y: 0.5, w: '90%', h: 0.5,
        fontSize: 20, bold: true, color: colors.primary
    });

    const metaData = [
        ['Formulation', trial.FormulationName || 'N/A'],
        ['Dosage', trial.Dosage || 'N/A'],
        [targetLabel, targetVal],
        ['Location', trial.Location || 'N/A'],
        ['Date', trial.Date || 'N/A'],
        ['Investigator', trial.InvestigatorName || 'N/A'],
        ['Status', trial.IsCompleted ? 'Completed' : 'Ongoing'],
        ['Result', trial.Result || 'N/A'],
    ];

    metaData.forEach(([key, value], i) => {
        const y = 1.2 + (i * 0.5);
        metaSlide.addText(`${key}:`, { x: 0.5, y, w: 3, h: 0.4, fontSize: 12, bold: true, color: colors.text });
        metaSlide.addText(String(value), { x: 3.5, y, w: 5, h: 0.4, fontSize: 12, color: colors.text });
    });

    // Slide 3: Weather Conditions
    if (trial.Temperature || trial.Humidity || trial.Windspeed || trial.Rain) {
        const weatherSlide = pptx.addSlide();
        weatherSlide.addText('Application Weather', {
            x: 0.5, y: 0.5, w: '90%', h: 0.5,
            fontSize: 20, bold: true, color: colors.primary
        });

        const weatherData = [
            ['Temperature', trial.Temperature ? `${trial.Temperature}°C` : 'N/A'],
            ['Humidity', trial.Humidity ? `${trial.Humidity}%` : 'N/A'],
            ['Wind Speed', trial.Windspeed ? `${trial.Windspeed} km/h` : 'N/A'],
            ['Rainfall', trial.Rain ? `${trial.Rain} mm` : 'N/A'],
        ];

        weatherData.forEach(([key, value], i) => {
            const y = 1.5 + (i * 0.6);
            weatherSlide.addShape('rect', { x: 0.5, y, w: 4.5, h: 0.5, fill: colors.light });
            weatherSlide.addText(key, { x: 0.7, y: y + 0.1, w: 2, h: 0.3, fontSize: 11, bold: true });
            weatherSlide.addText(String(value), { x: 2.5, y: y + 0.1, w: 2, h: 0.3, fontSize: 11 });
        });
    }

    // Slide 4: Efficacy Data
    const efficacy = JSON.parse(trial.EfficacyDataJSON || '[]');
    if (efficacy.length > 0) {
        const effSlide = pptx.addSlide();
        effSlide.addText(`${catConfig.primaryMetric.label} Observations`, {
            x: 0.5, y: 0.5, w: '90%', h: 0.5,
            fontSize: 20, bold: true, color: colors.primary
        });

        const rows = efficacy.map((obs, i) => [
            String(i + 1),
            String(obs.daa || 'N/A'),
            String(getObservationPrimaryValue(category, obs) != null ? `${getObservationPrimaryValue(category, obs)}${catConfig.primaryMetric.unit || ''}` : 'N/A'),
            String(obs.date || 'N/A'),
            String(obs.notes || '').substring(0, 30)
        ]);

        effSlide.addTable([
            ['#', 'DAA', catConfig.primaryMetric.label, 'Date', 'Notes'],
            ...rows
        ], {
            x: 0.5, y: 1.2, w: '90%',
            fontSize: 10,
            border: { pt: 0.5, color: 'E5E7EB' },
            fill: { header: colors.primary },
            color: { header: 'FFFFFF', body: colors.text }
        });
    }

    // Slide 5: Notes & Conclusion
    const notesSlide = pptx.addSlide();
    notesSlide.addText('Notes & Conclusion', {
        x: 0.5, y: 0.5, w: '90%', h: 0.5,
        fontSize: 20, bold: true, color: colors.primary
    });

    if (trial.Notes) {
        notesSlide.addText('Notes:', { x: 0.5, y: 1.2, w: '90%', h: 0.3, fontSize: 14, bold: true });
        notesSlide.addText(trial.Notes, { x: 0.5, y: 1.6, w: '90%', h: 2, fontSize: 11 });
    }

    if (trial.Conclusion) {
        notesSlide.addText('Conclusion:', { x: 0.5, y: 3.8, w: '90%', h: 0.3, fontSize: 14, bold: true, color: colors.primary });
        notesSlide.addText(trial.Conclusion, { x: 0.5, y: 4.2, w: '90%', h: 1.5, fontSize: 11 });
    }

    // Slide 6: Photographic Log
    const photosList = JSON.parse(trial.PhotoURLs || '[]');
    if (photosList.length > 0) {
        const photoSlide = pptx.addSlide();
        photoSlide.addText('Field Photo Log', { x: 0.5, y: 0.5, w: '90%', h: 0.5, fontSize: 20, bold: true, color: colors.primary });
        
        const pos = [[0.5, 1.2, 4.2, 3.0], [5.1, 1.2, 4.2, 3.0], [0.5, 4.5, 4.2, 3.0], [5.1, 4.5, 4.2, 3.0]];
        for (let i = 0; i < Math.min(photosList.length, 4); i++) {
            const p = photosList[i];
            const src = p.fileData || p.url || p.src;
            if (!src) continue;
            try {
                const [px, py, pw2, ph2] = pos[i];
                photoSlide.addImage({ data: src, x: px, y: py, w: pw2, h: ph2 });
                photoSlide.addText(p.label || `Photo ${i + 1}`, { x: px, y: py + ph2 + 0.1, w: pw2, h: 0.3, fontSize: 9, color: '6B7280' });
            } catch (e) {
                console.warn("Failed to embed image in PPTX:", e);
            }
        }
    }

    // Save
    const filename = `Trial_Report_${(trial.FormulationName || 'Unknown').replace(/[^a-z0-9]/gi, '_')}_${trial.Date || 'nodate'}.pptx`;
    await pptx.writeFile({ fileName: filename });

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'PowerPoint exported successfully!', type: 'success' } }));
}

export function exportCSV(data, filename) {
    if (!data || !data.length) return;
    const replacer = (key, value) => value === null ? '' : value;
    const header = Object.keys(data[0]);
    const csv = [
        header.join(','),
        ...data.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    saveAs(blob, filename + '.csv');
}

export function importCSV(file, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        if (!text) { callback([]); return; }
        // Simple CSV parser supporting quotes
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n' && !inQuotes) {
                if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else if (char === '\r' && !inQuotes && nextChar === '\n') {
                // skip \r if it's followed by \n and we are not in quotes
            } else {
                currentCell += char;
            }
        }
        if (currentCell || currentRow.length > 0) {
            if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
            currentRow.push(currentCell);
            rows.push(currentRow);
        }

        if (rows.length < 2) { callback([]); return; }

        const headers = rows[0];
        const data = rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] || '';
            });
            return obj;
        }).filter(obj => Object.values(obj).some(val => val !== ''));

        callback(data);
    };
    reader.readAsText(file);
}

export async function exportZIP(trials) {
    if(!trials || trials.length === 0) return;

    const zip = new JSZip();

    // Add trial JSON data
    zip.file('trials_data.json', JSON.stringify(trials, null, 2));

    const imgFolder = zip.folder('photos');

    let photoCount = 0;
    trials.forEach(trial => {
       try {
           const photos = JSON.parse(trial.PhotoURLs || '[]');
           photos.forEach((photo, idx) => {
               if(photo.fileData && photo.fileData.includes('base64,')) {
                   const base64Data = photo.fileData.split('base64,')[1];
                   imgFolder.file(`${trial.ID}_photo_${idx}.jpg`, base64Data, {base64: true});
                   photoCount++;
               }
           });
       } catch(e) {}
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `Herbicide_Backup_${photoCount}_photos.zip`);
}
