// src/services/armExporter.js
// Converts Miklens Trial data to standard ARM (Agricultural Research Manager) exchange CSV formats.

import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';
import { safeJsonParse } from '../utils/helpers.js';

export function exportToARM(trialOrTrials, category, project = null) {
  const trials = Array.isArray(trialOrTrials) ? trialOrTrials : [trialOrTrials];
  const config = getCategoryConfig(category);

  const csvRows = [];
  // Standard ARM exchange data headers
  csvRows.push([
    'ARM_TRIAL_ID',
    'CATEGORY',
    'PROJECT_NAME',
    'TREATMENT_NAME',
    'DOSAGE_RATE',
    'APPLICATION_TIMING',
    'PLOT_NUMBER',
    'REPLICATION',
    'INVESTIGATOR',
    'LOCATION',
    'DATE',
    'DAA',
    'METRIC_NAME',
    'VALUE',
    'NOTES'
  ].join(','));

  trials.forEach(t => {
    const eff = safeJsonParse(t.EfficacyDataJSON, []);
    const prjName = project ? project.Name : (t.ProjectID || 'Ungrouped');
    const trtName = t.FormulationName || 'Untreated Check';
    const rate = t.Dosage || '0';
    const timing = t.ApplicationTiming || 'N/A';
    const plot = t.PlotNumber || '101';
    const rep = t.Replication || '1';
    const inv = t.InvestigatorName || 'N/A';
    const loc = t.Location || 'N/A';
    const dt = t.Date || 'N/A';

    eff.forEach(obs => {
      const daa = obs.daa ?? 0;
      const notes = (obs.notes || '').replace(/"/g, '""');

      // Export observation values for all numeric metrics configured for this category
      config.observationFields.forEach(field => {
        if (field.type === 'weedArray') return;
        const val = obs[field.key] ?? '';
        if (val !== '') {
          csvRows.push([
            t.ID,
            category,
            `"${prjName.replace(/"/g, '""')}"`,
            `"${trtName.replace(/"/g, '""')}"`,
            `"${rate.replace(/"/g, '""')}"`,
            `"${timing.replace(/"/g, '""')}"`,
            plot,
            rep,
            `"${inv.replace(/"/g, '""')}"`,
            `"${loc.replace(/"/g, '""')}"`,
            dt.split('T')[0],
            daa,
            `"${field.label}"`,
            val,
            `"${notes}"`
          ].join(','));
        }
      });

      // Export species/target breakdown details if present
      if (Array.isArray(obs.weedDetails) && obs.weedDetails.length > 0) {
        obs.weedDetails.forEach(wd => {
          const spName = wd.species || wd.name || 'Unknown';
          const coverVal = wd.cover ?? wd.value ?? '';
          if (coverVal !== '') {
            csvRows.push([
              t.ID,
              category,
              `"${prjName.replace(/"/g, '""')}"`,
              `"${trtName.replace(/"/g, '""')}"`,
              `"${rate.replace(/"/g, '""')}"`,
              `"${timing.replace(/"/g, '""')}"`,
              plot,
              rep,
              `"${inv.replace(/"/g, '""')}"`,
              `"${loc.replace(/"/g, '""')}"`,
              dt.split('T')[0],
              daa,
              `"Weed/Target Breakdown: ${spName.replace(/"/g, '""')}"`,
              coverVal,
              `"${((wd.status || '') + (wd.notes ? ' - ' + wd.notes : '')).replace(/"/g, '""')}"`
            ].join(','));
          }
        });
      }
    });
  });

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  return blob;
}

export function importARMCSV(csvText) {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse CSV helper that handles quotes and commas
  const parseCSVLine = (text) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  };

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toUpperCase());
  const rowObjects = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] !== undefined ? cells[index].trim() : '';
    });
    rowObjects.push(row);
  }

  // Group rows by trial key combination: TREATMENT_NAME + PLOT_NUMBER + REPLICATION (or ARM_TRIAL_ID if provided)
  const trialsMap = {};

  rowObjects.forEach(row => {
    const trialId = row.ARM_TRIAL_ID || `${row.TREATMENT_NAME || 'Unknown'}_P${row.PLOT_NUMBER || '101'}_R${row.REPLICATION || '1'}`;
    if (!trialsMap[trialId]) {
      trialsMap[trialId] = {
        ID: row.ARM_TRIAL_ID || `arm_${Math.random().toString(36).substr(2, 9)}`,
        Category: (row.CATEGORY || 'herbicide').toLowerCase(),
        ProjectID: row.PROJECT_NAME || '',
        FormulationName: row.TREATMENT_NAME || 'Untreated Check',
        Dosage: row.DOSAGE_RATE || '',
        ApplicationTiming: row.APPLICATION_TIMING || 'POST',
        PlotNumber: row.PLOT_NUMBER || '101',
        Replication: row.REPLICATION || '1',
        InvestigatorName: row.INVESTIGATOR || 'ARM Import',
        Location: row.LOCATION || 'N/A',
        Date: row.DATE ? new Date(row.DATE).toISOString() : new Date().toISOString(),
        observationsMap: {} // grouped by DAA
      };
    }

    const trial = trialsMap[trialId];
    const daa = row.DAA || '0';
    if (!trial.observationsMap[daa]) {
      trial.observationsMap[daa] = {
        daa: parseInt(daa) || 0,
        notes: row.NOTES || '',
        weedDetails: []
      };
    }

    const obs = trial.observationsMap[daa];
    const metricLabel = row.METRIC_NAME || '';
    const val = parseFloat(row.VALUE);

    if (metricLabel && !isNaN(val)) {
      if (metricLabel.startsWith('Weed/Target Breakdown:')) {
        const speciesName = metricLabel.replace('Weed/Target Breakdown:', '').trim();
        let status = '';
        let wdNotes = '';
        if (row.NOTES) {
          const parts = row.NOTES.split(' - ');
          status = parts[0] || '';
          wdNotes = parts.slice(1).join(' - ') || '';
        }
        obs.weedDetails.push({
          species: speciesName,
          cover: val,
          status: status,
          notes: wdNotes
        });
      } else if (metricLabel.includes('Cover')) {
        obs.weedCover = val;
      } else if (metricLabel.includes('Severity')) {
        obs.diseaseSeverity = val;
      } else if (metricLabel.includes('Incidence')) {
        obs.diseaseIncidence = val;
      } else if (metricLabel.includes('Pest Count')) {
        obs.pestCount = val;
      } else if (metricLabel.includes('Yield')) {
        obs.yieldKgPlot = val;
      } else if (metricLabel.includes('Vigor')) {
        obs.overallVigor = val;
      } else {
        // Generic dynamic matching
        const fieldKey = metricLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
        obs[fieldKey] = val;
      }
    }
  });

  // Convert observationsMap back to EfficacyDataJSON array
  return Object.values(trialsMap).map(trial => {
    const efficacyList = Object.values(trial.observationsMap).sort((a, b) => a.daa - b.daa);
    delete trial.observationsMap;
    return {
      ...trial,
      EfficacyDataJSON: JSON.stringify(efficacyList)
    };
  });
}
