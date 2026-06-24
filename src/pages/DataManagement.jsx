import React, { useRef, useState, useEffect } from 'react';
import TopBar from '../components/TopBar.jsx';
import { useAppState } from '../hooks/useAppState.jsx';
import { Database, Download, Upload, Archive, Activity, FileSpreadsheet, CheckCircle, AlertCircle, Wrench, Bot, Trash2, FileCode, Cloud, Import, RefreshCw } from 'lucide-react';
import CloudBackup from '../components/CloudBackup.jsx';
import { exportCSV, exportZIP, importCSV } from '../utils/exportUtils.js';
import { updateTrial, updateProject, updateFormulation } from '../services/dataLayer.js'; // Adjust as needed
import { calculateDAA } from '../utils/dateUtils.js';
import { analyzePhoto, generateTextWithAI, getAPIKeys } from '../services/multiProviderAI.js';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue, calculateEfficacy } from '../utils/categoryConfig.js';


// Initialize global states if not existing (Module scope)
if (typeof window !== 'undefined') {
  if (!window.globalRepairState) {
    window.globalRepairState = { isRunning: false, taskName: '', progress: 0, total: 0, currentTrialName: '' };
  }
  if (!window.globalBulkAnalysisState) {
    window.globalBulkAnalysisState = { isRunning: false, isPaused: false, lastProcessedIndex: -1, trialsToProcess: [], totalToProcess: 0, successCount: 0, errorCount: 0, currentTrialName: '' };
  }
}

import { useAuth } from '../hooks/useAuth.js';

export default function DataManagement({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const { isViewer, user } = useAuth();
  const canDownload = user?.tabPermissions?.['Allow Downloads'] !== false;
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);
  const targetField = catConfig.targetField || 'WeedSpecies';
  const targetLabel = catConfig.targetLabel || 'Weed Species';
  const importRef = useRef(null);
  const csvImportRef = useRef(null);
  const [csvImportEntity, setCsvImportEntity] = useState('');
  const [localRepairProgress, setLocalRepairProgress] = useState(typeof window !== 'undefined' ? window.globalRepairProgress || '' : '');
  const [showCloudBackup, setShowCloudBackup] = useState(false);
  const [localScanSummary, setLocalScanSummary] = useState(typeof window !== 'undefined' ? window.globalScanSummary || '' : '');
  const [localBulkAiProgress, setLocalBulkAiProgress] = useState(typeof window !== 'undefined' ? window.globalBulkAiProgress || '' : '');

  // ── Enhanced Bulk AI Analysis State ───────────────────────────────────────
  const [localBulkAnalysisState, setLocalBulkAnalysisState] = useState(typeof window !== 'undefined' ? window.globalBulkAnalysisState : null);

  const [localRepairState, setLocalRepairState] = useState(window.globalRepairState);

  // Track mounted status to avoid setState on unmounted component
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Wrapper functions matching the original state setter names
  const setRepairState = (updater) => {
    const next = typeof updater === 'function' ? updater(window.globalRepairState) : updater;
    window.globalRepairState = { ...window.globalRepairState, ...next };
    if (isMounted.current) {
      setLocalRepairState(window.globalRepairState);
    }
  };

  const setRepairProgress = (val) => {
    window.globalRepairProgress = val;
    if (isMounted.current) {
      setLocalRepairProgress(val);
    }
  };

  const setScanSummary = (val) => {
    window.globalScanSummary = val;
    if (isMounted.current) {
      setLocalScanSummary(val);
    }
  };

  const setBulkAiProgress = (val) => {
    window.globalBulkAiProgress = val;
    if (isMounted.current) {
      setLocalBulkAiProgress(val);
    }
  };

  const setBulkAnalysisState = (updater) => {
    const next = typeof updater === 'function' ? updater(window.globalBulkAnalysisState) : updater;
    window.globalBulkAnalysisState = { ...window.globalBulkAnalysisState, ...next };
    if (isMounted.current) {
      setLocalBulkAnalysisState(window.globalBulkAnalysisState);
    }
  };

  // Map original state variables to local state variables for rendering
  const repairState = localRepairState;
  const repairProgress = localRepairProgress;
  const scanSummary = localScanSummary;
  const bulkAiProgress = localBulkAiProgress;
  const bulkAnalysisState = localBulkAnalysisState;

  const toast = (msg, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportJSON = () => {
    if (!canDownload) {
      toast("Download permission is disabled for your account", "error");
      return;
    }
    const data = {
      trials: state.trials || [],
      projects: state.projects || [],
      formulations: state.formulations || [],
      ingredients: state.ingredients || [],
      organisations: state.organisations || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCategory}_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${catConfig.name} JSON backup exported`);
  };

  const handleExportStandaloneHTML = () => {
    if (!canDownload) {
      toast("Download permission is disabled for your account", "error");
      return;
    }
    toast('Standalone HTML export is only available in the full Google Apps Script environment.', 'info');
  };

  const handleExportCSV = (key, label) => {
    if (!canDownload) {
      toast("Download permission is disabled for your account", "error");
      return;
    }
    const data = state[key] || [];
    if (!data.length) { toast(`No ${label} to export`, 'info'); return; }
    exportCSV(data, `${label}_${new Date().toISOString().split('T')[0]}`);
    toast(`${label} CSV exported`);
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportJSON = (e) => {
    if (isViewer) {
      toast("Viewers cannot import data", "error");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const updates = {};
        if (Array.isArray(parsed.trials))        updates.trials = parsed.trials;
        if (Array.isArray(parsed.projects))      updates.projects = parsed.projects;
        if (Array.isArray(parsed.formulations))  updates.formulations = parsed.formulations;
        if (Array.isArray(parsed.ingredients))   updates.ingredients = parsed.ingredients;
        if (Array.isArray(parsed.organisations)) updates.organisations = parsed.organisations;
        if (Object.keys(updates).length === 0) { toast('No recognizable data in file', 'error'); return; }
        if (!window.confirm(`This will overwrite your current local data with:\n• ${updates.trials?.length ?? 0} trials\n• ${updates.projects?.length ?? 0} projects\n• ${updates.formulations?.length ?? 0} formulations\n\nContinue?`)) return;
        updateState({ ...updates, hasLoadedInitialData: true });
        toast(`Imported ${Object.values(updates).flat().length} records successfully`);
      } catch {
        toast('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Efficacy Repair ───────────────────────────────────────────────────────
  const safeJsonParse = (val, fallback = []) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return fallback; }
  };

  const runAsynchronousRepair = async (taskName, repairFunc) => {
    if (isViewer) {
      toast("Viewers cannot perform data repairs", "error");
      return;
    }
    const trials = [...(state.trials || [])];
    if (!trials.length) {
      toast('No trials on record to repair', 'info');
      return;
    }
    
    setRepairProgress('');
    setScanSummary('');
    setRepairState({
      isRunning: true,
      taskName,
      progress: 0,
      total: trials.length,
      currentTrialName: ''
    });
    
    let updatedCount = 0;
    const currentTrials = [...trials];
    
    for (let i = 0; i < currentTrials.length; i++) {
      const t = currentTrials[i];
      setRepairState(prev => ({
        ...prev,
        progress: i + 1,
        currentTrialName: t.FormulationName || `Trial ${t.ID.slice(-6)}`
      }));
      
      // Short delay so that user can visually track progress animation
      await new Promise(r => setTimeout(r, 60));
      
      const { updatedTrial, isChanged } = repairFunc(t);
      if (isChanged) {
        currentTrials[i] = updatedTrial;
        updatedCount++;
        try {
          await updateTrial(updatedTrial, getAppState);
        } catch (err) {
          console.warn(`Failed to sync trial ${t.ID} to Firestore:`, err);
        }
      }
    }
    
    updateState({ trials: currentTrials });
    setRepairState({
      isRunning: false,
      taskName: '',
      progress: 0,
      total: 0,
      currentTrialName: ''
    });
    
    setRepairProgress(`${taskName} complete: ${updatedCount} trial(s) successfully processed and persisted.`);
    toast(`${taskName} complete: ${updatedCount} updated`, 'success');
  };


  const handleScanTrials = async () => {
    if (isViewer) {
      toast("Viewers cannot perform data scans", "error");
      return;
    }
    const trials = state.trials || [];
    if (!trials.length) {
      toast('No trials on record to scan', 'info');
      return;
    }

    setScanSummary('');
    setRepairProgress('');
    setRepairState({
      isRunning: true,
      taskName: 'Scanning Trials',
      progress: 0,
      total: trials.length,
      currentTrialName: ''
    });

    let missingObsDetails = 0, stringDaa = 0, missingTarget = 0;

    for (let i = 0; i < trials.length; i++) {
      const t = trials[i];
      setRepairState(prev => ({
        ...prev,
        progress: i + 1,
        currentTrialName: t.FormulationName || `Trial ${t.ID.slice(-6)}`
      }));
      await new Promise(r => setTimeout(r, 45));

      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      eff.forEach(o => {
        if (typeof o.daa === 'string') stringDaa++;
        if (activeCategory === 'herbicide') {
          if (!o.weedDetails || o.weedDetails.length === 0) missingObsDetails++;
        } else {
          if (o[primaryObsField] === undefined || o[primaryObsField] === null) missingObsDetails++;
        }
      });
      if (!t[targetField]) missingTarget++;
    }

    setRepairState({
      isRunning: false,
      taskName: '',
      progress: 0,
      total: 0,
      currentTrialName: ''
    });

    setScanSummary(
      `Scanned ${trials.length} trials — ` +
      `${missingObsDetails} observations missing details/primary metric, ` +
      `${stringDaa} observations with string DAA format, ` +
      `${missingTarget} trials missing ${targetLabel} property.`
    );
    toast('Scan complete', 'success');
  };

  const handleAutoFixWeedLinking = () => {
    runAsynchronousRepair(`Auto-Fix ${targetLabel} Linking`, (t) => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return { updatedTrial: t, isChanged: false };
      let changed = false;
      const newEff = eff.map(o => {
        const newO = { ...o };
        if (typeof newO.daa === 'string') { newO.daa = parseFloat(newO.daa) || 0; changed = true; }
        if (activeCategory === 'herbicide') {
          if (!newO.weedDetails || newO.weedDetails.length === 0) {
            newO.weedDetails = [{ species: t[targetField] || 'Unknown', cover: newO.weedCover ?? 0 }];
            changed = true;
          }
        } else {
          if (newO[primaryObsField] === undefined || newO[primaryObsField] === null) {
            newO[primaryObsField] = 0;
            changed = true;
          }
          if (!newO.weedDetails || newO.weedDetails.length === 0) {
            newO.weedDetails = [{ species: t[targetField] || 'Unknown', cover: newO[primaryObsField] || 0 }];
            changed = true;
          }
        }
        return newO;
      });
      return {
        updatedTrial: changed ? { ...t, EfficacyDataJSON: JSON.stringify(newEff) } : t,
        isChanged: changed
      };
    });
  };

  const handleRepairSpeciesTracking = () => {
    runAsynchronousRepair(`Repair ${targetLabel} Tracking`, (t) => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length || t[targetField]) return { updatedTrial: t, isChanged: false };
      const species = new Set();
      eff.forEach(o => (o.weedDetails || []).forEach(w => { if (w.species) species.add(w.species); }));
      if (species.size > 0) {
        return {
          updatedTrial: { ...t, [targetField]: [...species].join(', ') },
          isChanged: true
        };
      }
      return { updatedTrial: t, isChanged: false };
    });
  };


  const handleForceFullRerepair = async () => {
    if (isViewer) {
      toast("Viewers cannot perform data repairs", "error");
      return;
    }
    if (!window.confirm(`This will sequentially re-run all ${targetLabel} Linking and Tracking repair steps on every trial. Continue?`)) return;
    setRepairProgress('');
    setScanSummary('');

    const trials = [...(state.trials || [])];
    if (!trials.length) {
      toast('No trials on record to repair', 'info');
      return;
    }

    setRepairState({
      isRunning: true,
      taskName: `Force Full Re-repair (${targetLabel} & Tracking)`,
      progress: 0,
      total: trials.length,
      currentTrialName: ''
    });

    let repairedCount = 0;
    const currentTrials = [...trials];

    for (let i = 0; i < currentTrials.length; i++) {
      const t = currentTrials[i];
      setRepairState(prev => ({
        ...prev,
        progress: i + 1,
        currentTrialName: t.FormulationName || `Trial ${t.ID.slice(-6)}`
      }));

      await new Promise(r => setTimeout(r, 60));

      let changed = false;
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      let newEff = [...eff];

      if (eff.length > 0) {
        newEff = eff.map(o => {
          const newO = { ...o };
          if (typeof newO.daa === 'string') { newO.daa = parseFloat(newO.daa) || 0; changed = true; }
          if (activeCategory === 'herbicide') {
            if (!newO.weedDetails || newO.weedDetails.length === 0) {
              newO.weedDetails = [{ species: t[targetField] || 'Unknown', cover: newO.weedCover ?? 0 }];
              changed = true;
            }
          } else {
            if (newO[primaryObsField] === undefined || newO[primaryObsField] === null) {
              newO[primaryObsField] = 0;
              changed = true;
            }
            if (!newO.weedDetails || newO.weedDetails.length === 0) {
              newO.weedDetails = [{ species: t[targetField] || 'Unknown', cover: newO[primaryObsField] || 0 }];
              changed = true;
            }
          }
          return newO;
        });
      }

      let trackingVal = t[targetField];
      if (!trackingVal && newEff.length > 0) {
        const species = new Set();
        newEff.forEach(o => (o.weedDetails || []).forEach(w => { if (w.species) species.add(w.species); }));
        if (species.size > 0) {
          trackingVal = [...species].join(', ');
          changed = true;
        }
      }

      if (changed) {
        const updatedTrial = {
          ...t,
          EfficacyDataJSON: JSON.stringify(newEff),
          [targetField]: trackingVal
        };
        currentTrials[i] = updatedTrial;
        repairedCount++;
        try {
          await updateTrial(updatedTrial, getAppState);
        } catch (err) {
          console.warn('Sync failed in full rerepair:', err);
        }
      }
    }

    updateState({ trials: currentTrials });
    setRepairState({
      isRunning: false,
      taskName: '',
      progress: 0,
      total: 0,
      currentTrialName: ''
    });

    setRepairProgress(`Force Full Re-repair successfully complete: ${repairedCount} trial(s) fully repaired and synced to database.`);
    toast(`Force full re-repair complete`, 'success');
  };

  const handleRecalcGridCovers = () => {
    const round1 = (n) => Math.round(n * 10) / 10;
    const isValidCell = (cellId, gridSize) => {
      const parts = String(cellId || '').split(',');
      if (parts.length !== 2) return false;
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      return isFinite(r) && isFinite(c) && r >= 0 && c >= 0 && r < gridSize && c < gridSize;
    };

    runAsynchronousRepair('Recalculate Grid Covers', (t) => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return { updatedTrial: t, isChanged: false };
      
      let changed = false;
      const newEff = eff.map(obs => {
        const mode = String(obs?.weedCoverMode || '').toLowerCase();
        const cells = Array.isArray(obs?.weedCoverGridCells) ? obs.weedCoverGridCells : null;
        if (mode !== 'grid-manual' || !cells || cells.length === 0) {
          return obs;
        }
        const gridSize = parseInt(obs?.weedCoverGridSize, 10) || parseInt(obs?.gridSize, 10) || 10;
        const totalCells = gridSize * gridSize;
        if (!totalCells) return obs;

        const validCells = cells.filter(c => isValidCell(c, gridSize));
        const pct = round1((validCells.length / totalCells) * 100);

        const newObs = { ...obs };
        let obsChanged = false;
        if (newObs.weedCover !== pct) { newObs.weedCover = pct; obsChanged = true; }
        if (newObs.weedCoverGrid !== pct) { newObs.weedCoverGrid = pct; obsChanged = true; }
        if (newObs.weedCoverGridSize !== gridSize) { newObs.weedCoverGridSize = gridSize; obsChanged = true; }
        if (validCells.length !== cells.length) { newObs.weedCoverGridCells = validCells; obsChanged = true; }
        
        if (obsChanged) {
          changed = true;
          return newObs;
        }
        return obs;
      });

      return {
        updatedTrial: changed ? { ...t, EfficacyDataJSON: JSON.stringify(newEff) } : t,
        isChanged: changed
      };
    });
  };

  const handleRebuildCoverAll = () => {
    runAsynchronousRepair('Rebuild %Cover', (t) => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return { updatedTrial: t, isChanged: false };
      let changed = false;
      const newEff = eff.map(o => {
        if (o.weedDetails && o.weedDetails.length > 0 && o.weedCover === undefined) {
          const total = o.weedDetails.reduce((s, w) => s + (parseFloat(w.cover) || 0), 0);
          changed = true;
          return { ...o, weedCover: parseFloat(total.toFixed(2)) };
        }
        return o;
      });
      return {
        updatedTrial: changed ? { ...t, EfficacyDataJSON: JSON.stringify(newEff) } : t,
        isChanged: changed
      };
    });
  };


  const handleRecalculateWceAll = () => {
    runAsynchronousRepair(`Recalculate Efficacy (${catConfig.primaryMetric?.key || 'Efficacy'}%)`, (t) => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return { updatedTrial: t, isChanged: false };
      
      const sortedEff = [...eff].sort((a, b) => {
        const daaA = a.daa ?? a.day ?? a.DAA ?? 0;
        const daaB = b.daa ?? b.day ?? b.DAA ?? 0;
        return daaA - daaB;
      });
      
      const baseline = sortedEff.find(o => (o.daa ?? o.day ?? o.DAA ?? 0) === 0) || sortedEff[0];
      const baselineCover = baseline ? getObservationPrimaryValue(activeCategory, baseline) : null;
      
      if (baselineCover === null || baselineCover <= 0) return { updatedTrial: t, isChanged: false };
      
      let changed = false;
      const newEff = eff.map(obs => {
        const daa = obs.daa ?? obs.day ?? obs.DAA ?? 0;
        const currentVal = getObservationPrimaryValue(activeCategory, obs) ?? null;
        
        const currentWce = obs.wce ?? obs.WCE ?? obs.dce ?? obs.pre ?? obs.controlPct ?? null;
        const currentControlPct = obs.controlPct ?? obs.control ?? obs.efficacy ?? null;
        
        let computedWce = null;
        if (daa === 0) {
          computedWce = 0;
        } else if (currentVal !== null) {
          computedWce = calculateEfficacy(activeCategory, currentVal, baselineCover);
          computedWce = Math.max(-100, Math.min(200, Math.round(computedWce * 10) / 10));
        }
        
        if (computedWce !== null && (currentWce !== computedWce || currentControlPct !== computedWce)) {
          changed = true;
          const metricKey = (catConfig.primaryMetric?.key || 'WCE').toLowerCase();
          return {
            ...obs,
            [metricKey]: computedWce,
            wce: computedWce,
            controlPct: computedWce
          };
        }
        return obs;
      });
      
      return {
        updatedTrial: changed ? { ...t, EfficacyDataJSON: JSON.stringify(newEff) } : t,
        isChanged: changed
      };
    });
  };

  const handleSyncObsDatesWithPhotos = () => {
    runAsynchronousRepair('Sync Dates with Photos', (t) => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      const photos = safeJsonParse(t.PhotoURLs, []);
      if (!eff.length || !photos.length) return { updatedTrial: t, isChanged: false };
      
      let changed = false;
      const sortedEff = [...eff].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
      const sortedPhotos = [...photos].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      
      const newEff = eff.map(obs => {
        const idx = sortedEff.findIndex(o => o.daa === obs.daa && o.date === obs.date);
        if (idx >= 0 && sortedPhotos[idx]) {
          const correspondingPhoto = sortedPhotos[idx];
          const newDate = correspondingPhoto.date;
          if (newDate && (obs.date !== newDate)) {
            const computedDaa = t.Date ? calculateDAA(newDate, t.Date) : obs.daa;
            changed = true;
            return {
              ...obs,
              date: newDate,
              daa: computedDaa
            };
          }
        }
        return obs;
      });
      
      return {
        updatedTrial: changed ? { ...t, EfficacyDataJSON: JSON.stringify(newEff) } : t,
        isChanged: changed
      };
    });
  };

  const handleRecalculateAllDaa = () => {
    runAsynchronousRepair('Recalculate All DAA', (t) => {
      if (!t.Date) return { updatedTrial: t, isChanged: false };
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return { updatedTrial: t, isChanged: false };

      let changed = false;
      const newEff = eff.map(obs => {
        if (!obs.date) return obs;
        const computedDaa = calculateDAA(obs.date, t.Date);
        if (obs.daa !== computedDaa) {
          changed = true;
          return { ...obs, daa: computedDaa };
        }
        return obs;
      });

      return {
        updatedTrial: changed ? { ...t, EfficacyDataJSON: JSON.stringify(newEff) } : t,
        isChanged: changed
      };
    });
  };


  const handleOneClickRepairAll = async () => {
    if (isViewer) {
      toast("Viewers cannot perform data repairs", "error");
      return;
    }
    if (!window.confirm(`⚠️ This will run a complete sequential data repair on ALL trials in your database. It will sync Dates, DAAs, ${targetLabel}, Primary Metrics, Efficacy, Grid Covers, and Ratings in one go.\n\nWould you like to proceed?`)) return;

    const trials = [...(state.trials || [])];
    if (!trials.length) {
      toast('No trials on record to repair', 'info');
      return;
    }
    
    setRepairProgress('');
    setScanSummary('');
    setRepairState({
      isRunning: true,
      taskName: `Complete Data Repair (One-Click - ${catConfig.name})`,
      progress: 0,
      total: trials.length,
      currentTrialName: ''
    });

    const round1 = (n) => Math.round(n * 10) / 10;
    const isValidCell = (cellId, gridSize) => {
      const parts = String(cellId || '').split(',');
      if (parts.length !== 2) return false;
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      return isFinite(r) && isFinite(c) && r >= 0 && c >= 0 && r < gridSize && c < gridSize;
    };
    
    let updatedCount = 0;
    const currentTrials = [...trials];
    
    for (let i = 0; i < currentTrials.length; i++) {
      const t = currentTrials[i];
      setRepairState(prev => ({
        ...prev,
        progress: i + 1,
        currentTrialName: t.FormulationName || `Trial ${t.ID.slice(-6)}`
      }));
      
      await new Promise(r => setTimeout(r, 50));
      
      let changed = false;
      let eff = safeJsonParse(t.EfficacyDataJSON, []);
      let photos = safeJsonParse(t.PhotoURLs, []);
      
      // 1. Sync Dates with Photos
      if (eff.length > 0 && photos.length > 0) {
        const sortedEff = [...eff].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
        const sortedPhotos = [...photos].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
        
        eff = eff.map(obs => {
          const idx = sortedEff.findIndex(o => o.daa === obs.daa && o.date === obs.date);
          if (idx >= 0 && sortedPhotos[idx]) {
            const correspondingPhoto = sortedPhotos[idx];
            const newDate = correspondingPhoto.date;
            if (newDate && (obs.date !== newDate)) {
              changed = true;
              return { ...obs, date: newDate };
            }
          }
          return obs;
        });
      }
      
      // 2. Recalculate DAA based on trial date
      if (t.Date && eff.length > 0) {
        eff = eff.map(obs => {
          if (!obs.date) return obs;
          const computedDaa = calculateDAA(obs.date, t.Date);
          if (obs.daa !== computedDaa) {
            changed = true;
            return { ...obs, daa: computedDaa };
          }
          return obs;
        });
      }
      
      // 3. Auto-Fix Target Linking (text DAA & missing target details)
      if (eff.length > 0) {
        eff = eff.map(obs => {
          const newO = { ...obs };
          if (typeof newO.daa === 'string') { newO.daa = parseFloat(newO.daa) || 0; changed = true; }
          if (activeCategory === 'herbicide') {
            if (!newO.weedDetails || newO.weedDetails.length === 0) {
              newO.weedDetails = [{ species: t[targetField] || 'Unknown', cover: newO.weedCover ?? 0 }];
              changed = true;
            }
          } else {
            if (newO[primaryObsField] === undefined || newO[primaryObsField] === null) {
              newO[primaryObsField] = 0;
              changed = true;
            }
            if (!newO.weedDetails || newO.weedDetails.length === 0) {
              newO.weedDetails = [{ species: t[targetField] || 'Unknown', cover: newO[primaryObsField] || 0 }];
              changed = true;
            }
          }
          return newO;
        });
      }
      
      // 4. Repair Target Tracking (trial targetField property)
      let trackingVal = t[targetField];
      if (!trackingVal && eff.length > 0) {
        const species = new Set();
        eff.forEach(o => (o.weedDetails || []).forEach(w => { if (w.species) species.add(w.species); }));
        if (species.size > 0) {
          trackingVal = [...species].join(', ');
          changed = true;
        }
      }
      
      // 5. Rebuild %Cover / Primary Metric (All observations, herbicide only)
      if (activeCategory === 'herbicide' && eff.length > 0) {
        eff = eff.map(obs => {
          if (obs.weedDetails && obs.weedDetails.length > 0) {
            const total = obs.weedDetails.reduce((s, w) => s + (parseFloat(w.cover) || 0), 0);
            const coverVal = parseFloat(total.toFixed(2));
            if (obs.weedCover !== coverVal) {
              changed = true;
              return { ...obs, weedCover: coverVal };
            }
          }
          return obs;
        });
      }
      
      // 6. Recalculate Grid Covers (herbicide only)
      if (activeCategory === 'herbicide' && eff.length > 0) {
        eff = eff.map(obs => {
          const mode = String(obs?.weedCoverMode || '').toLowerCase();
          const cells = Array.isArray(obs?.weedCoverGridCells) ? obs.weedCoverGridCells : null;
          if (mode !== 'grid-manual' || !cells || cells.length === 0) return obs;
          
          const gridSize = parseInt(obs?.weedCoverGridSize, 10) || parseInt(obs?.gridSize, 10) || 10;
          const totalCells = gridSize * gridSize;
          if (!totalCells) return obs;
          
          const validCells = cells.filter(c => isValidCell(c, gridSize));
          const pct = round1((validCells.length / totalCells) * 100);
          
          const newObs = { ...obs };
          let obsChanged = false;
          if (newObs.weedCover !== pct) { newObs.weedCover = pct; obsChanged = true; }
          if (newObs.weedCoverGrid !== pct) { newObs.weedCoverGrid = pct; obsChanged = true; }
          if (newObs.weedCoverGridSize !== gridSize) { newObs.weedCoverGridSize = gridSize; obsChanged = true; }
          if (validCells.length !== cells.length) { newObs.weedCoverGridCells = validCells; obsChanged = true; }
          if (obsChanged) changed = true;
          return newObs;
        });
      }
      
      // 7. Recalculate Efficacy (WCE% or primary metric)
      if (eff.length > 0) {
        const sortedEff = [...eff].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
        const baseline = sortedEff.find(o => (o.daa ?? 0) === 0) || sortedEff[0];
        const baselineVal = baseline ? getObservationPrimaryValue(activeCategory, baseline) : null;
        
        if (baselineVal !== null && baselineVal > 0) {
          eff = eff.map(obs => {
            const daa = obs.daa ?? 0;
            const currentVal = getObservationPrimaryValue(activeCategory, obs) ?? null;
            let computedWce = null;
            if (daa === 0) {
              computedWce = 0;
            } else if (currentVal !== null) {
              computedWce = calculateEfficacy(activeCategory, currentVal, baselineVal);
              computedWce = Math.max(-100, Math.min(200, Math.round(computedWce * 10) / 10));
            }
            const currentWce = obs.wce ?? obs.WCE ?? obs.dce ?? obs.pre ?? obs.controlPct ?? null;
            if (computedWce !== null && (currentWce !== computedWce || obs.controlPct !== computedWce)) {
              changed = true;
              const metricKey = (catConfig.primaryMetric?.key || 'WCE').toLowerCase();
              return { ...obs, [metricKey]: computedWce, wce: computedWce, controlPct: computedWce };
            }
            return obs;
          });
        }
      }
      
      // 8. Recalculate Rating Result (Qualitative Efficacy Rating)
      let resultRating = t.Result || 'Unrated';
      if (eff.length > 0) {
        const sorted = [...eff].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
        const baseline = sorted[0];
        const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
        const latest = sorted[sorted.length - 1];
        const val = parseFloat(latest?.[primaryObsField] ?? 0) || 0;
        const efficacy = calculateEfficacy(activeCategory, val, baseVal);

        let newRating = 'Unrated';
        if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
          if (efficacy >= 15) newRating = 'Excellent';
          else if (efficacy >= 8) newRating = 'Good';
          else if (efficacy >= 3) newRating = 'Fair';
          else newRating = 'Poor';
        } else {
          if (efficacy >= 85) newRating = 'Excellent';
          else if (efficacy >= 70) newRating = 'Good';
          else if (efficacy >= 50) newRating = 'Fair';
          else newRating = 'Poor';
        }

        if (resultRating !== newRating) {
          resultRating = newRating;
          changed = true;
        }
      }
      
      if (changed) {
        const updatedTrial = {
          ...t,
          EfficacyDataJSON: JSON.stringify(eff),
          [targetField]: trackingVal,
          Result: resultRating
        };
        currentTrials[i] = updatedTrial;
        updatedCount++;
        try {
          await updateTrial(updatedTrial, getAppState);
        } catch (err) {
          console.warn(`Failed to sync trial ${t.ID}:`, err);
        }
      }
    }
    
    updateState({ trials: currentTrials });
    setRepairState({ isRunning: false, taskName: '', progress: 0, total: 0, currentTrialName: '' });
    setRepairProgress(`One-Click Complete Repair successfully finished! ${updatedCount} trial(s) fully repaired and synchronized to database.`);
    toast(`One-Click Repair complete`, 'success');
  };



  const handleForceAiReanalysisAll = async () => {
    if (isViewer) {
      toast("Viewers cannot perform AI photo re-analysis", "error");
      return;
    }
    const hasKeys = (state.settings?.apiKeys || []).length > 0 || state.settings?.geminiApiKey;
    if (!hasKeys) {
      toast('No API keys configured. Please add one in Settings.', 'error');
      return;
    }

    const allTrials = [...(state.trials || [])];
    if (!allTrials.length) {
      toast('No trials on record to analyze', 'info');
      return;
    }

    const selectedTrials = state.selectedTrials || [];
    let trialsToProcess = [...allTrials];
    let isSubset = false;

    if (selectedTrials.length > 0) {
      const useSelected = window.confirm(`You have ${selectedTrials.length} trials selected in the Trials tab. Do you want to re-analyze ONLY these ${selectedTrials.length} selected trials?\n\n- Click OK to analyze ONLY the ${selectedTrials.length} selected trials.\n- Click Cancel to analyze ALL ${allTrials.length} trials.`);
      if (useSelected) {
        trialsToProcess = allTrials.filter(t => selectedTrials.includes(t.ID));
        isSubset = true;
      } else {
        if (!window.confirm(`⚠️ This will sequentially re-analyze all photos in ALL ${allTrials.length} trials using Gemini AI to correct the estimates. This will consume a lot of Gemini API key credits. Do you want to proceed?`)) return;
      }
    } else {
      if (!window.confirm(`⚠️ This will sequentially re-analyze all photos in ALL ${allTrials.length} trials using Gemini AI to correct the estimates. This will consume a lot of Gemini API key credits. Do you want to proceed?`)) return;
    }

    setRepairProgress('');
    setScanSummary('');
    setRepairState({
      isRunning: true,
      taskName: `Force AI Re-analysis of ${isSubset ? trialsToProcess.length + ' Selected' : 'All'} Trials`,
      progress: 0,
      total: trialsToProcess.length,
      currentTrialName: ''
    });

    let updatedCount = 0;
    const currentTrials = [...trialsToProcess];

    for (let i = 0; i < currentTrials.length; i++) {
      const trial = currentTrials[i];
      setRepairState(prev => ({
        ...prev,
        progress: i + 1,
        currentTrialName: trial.FormulationName || `Trial ${trial.ID.slice(-6)}`
      }));

      const photos = safeJsonParse(trial.PhotoURLs, []);
      if (photos.length === 0) continue;

      let efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
      let trialChanged = false;

      for (const photo of photos) {
        const photoUrl = photo.url || photo.fileData;
        if (!photoUrl) continue;

        // Calculate DAA
        const photoDate = photo.date || trial.Date || new Date().toISOString().split('T')[0];
        const trialDate = trial.Date || photoDate;
        const daa = Math.max(0, Math.round((new Date(photoDate) - new Date(trialDate)) / (1000 * 60 * 60 * 24)));

        try {
          const result = await analyzePhoto(photoUrl, {
            treatment: trial.FormulationName || 'Unknown',
            daa: daa,
            rep: trial.Replication || 1,
            category: activeCategory
          }, (progressMsg) => {
            setRepairState(prev => ({
              ...prev,
              currentTrialName: `${trial.FormulationName || 'Trial'} - ${progressMsg}`
            }));
          });

          if (!result.success) throw new Error(result.error || 'AI analysis failed');
          const aiData = result.data;

          const newObs = {
            date: photoDate,
            daa: Number(daa),
            notes: aiData.overallAssessment || aiData.efficacyAssessment || `AI-analyzed on ${new Date().toLocaleDateString()}`,
            aiConfidence: aiData.confidence || 'HIGH',
            aiEfficacyAssessment: aiData.overallAssessment || aiData.efficacyAssessment || '',
            status: 'Analyzed',
            source: 'AI',
            photoUrl: photoUrl,
            bbchStage: aiData.bbchStage || ''
          };

          if (activeCategory === 'herbicide') {
            const normalizedWeeds = (aiData.weeds || []).map(w => ({
              species: w.species || 'Unknown',
              cover: typeof w.cover === 'number' ? w.cover : parseFloat(w.cover || 0),
              status: String(w.status || '').trim(),
              growthStage: String(w.growthStage || '').trim(),
              notes: String(w.notes || '').trim()
            }));

            const totalWeedCover = typeof aiData.totalWeedCover === 'number'
              ? aiData.totalWeedCover
              : normalizedWeeds.reduce((sum, w) => sum + (w.cover || 0), 0);

            newObs.weedCover = totalWeedCover;
            newObs.weedDetails = normalizedWeeds.length > 0 ? normalizedWeeds : [{ species: 'No weeds detected', cover: 0, status: '', notes: aiData.notes || 'AI-analyzed' }];
          } else {
            // Non-herbicide categories
            if (aiData.metrics && typeof aiData.metrics === 'object') {
              Object.keys(aiData.metrics).forEach(k => {
                const val = parseFloat(aiData.metrics[k]);
                if (!isNaN(val)) {
                  newObs[k] = val;
                }
              });
            }
            if (newObs[primaryObsField] === undefined || newObs[primaryObsField] === null) {
              if (aiData.metrics && typeof aiData.metrics === 'object') {
                const firstVal = parseFloat(Object.values(aiData.metrics)[0]);
                newObs[primaryObsField] = !isNaN(firstVal) ? firstVal : 0;
              } else {
                newObs[primaryObsField] = 0;
              }
            }
            newObs.weedCover = newObs[primaryObsField];
            newObs.weedDetails = (aiData.targets || []).map(t => ({
              species: t.name || 'Unknown',
              cover: typeof t.value === 'number' ? t.value : parseFloat(t.value || 0),
              status: t.status || '',
              notes: t.notes || ''
            }));
          }

          // Find index of existing observation for this photo or DAA
          const existingIdx = efficacyData.findIndex(o => o.photoUrl === photoUrl || o.daa === Number(daa));
          if (existingIdx >= 0) {
            efficacyData[existingIdx] = newObs;
          } else {
            efficacyData.push(newObs);
          }
          trialChanged = true;
        } catch (e) {
          console.error(`AI analysis failed for photo in trial ${trial.ID}:`, e);
        }

        // Delay to respect rate limits
        await new Promise(r => setTimeout(r, 3000));
      }

      if (trialChanged) {
        efficacyData.sort((a, b) => a.daa - b.daa);
        
        // Recalculate rating Result
        let resultRating = trial.Result || 'Unrated';
        if (efficacyData.length > 0) {
          const sorted = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
          const baseline = sorted[0];
          const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
          const latest = sorted[sorted.length - 1];
          const val = parseFloat(latest?.[primaryObsField] ?? 0) || 0;
          const efficacy = calculateEfficacy(activeCategory, val, baseVal);

          if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
            if (efficacy >= 15) resultRating = 'Excellent';
            else if (efficacy >= 8) resultRating = 'Good';
            else if (efficacy >= 3) resultRating = 'Fair';
            else resultRating = 'Poor';
          } else {
            if (efficacy >= 85) resultRating = 'Excellent';
            else if (efficacy >= 70) resultRating = 'Good';
            else if (efficacy >= 50) resultRating = 'Fair';
            else resultRating = 'Poor';
          }
        }

        const updatedTrial = {
          ...trial,
          EfficacyDataJSON: JSON.stringify(efficacyData),
          Result: resultRating
        };

        currentTrials[i] = updatedTrial;
        updatedCount++;
        try {
          await updateTrial(updatedTrial, getAppState);
        } catch (err) {
          console.warn(`Failed to sync trial ${trial.ID}:`, err);
        }
      }
    }

    updateState({ trials: currentTrials });
    setRepairState({ isRunning: false, taskName: '', progress: 0, total: 0, currentTrialName: '' });
    setRepairProgress(`Force AI Re-analysis finished! ${updatedCount} trial(s) successfully re-analyzed with Gemini AI.`);
    toast(`Force AI Re-analysis complete`, 'success');
  };

  // ── AI Bulk Analysis ──────────────────────────────────────────────────────
  const startBulkAnalysis = () => {
    if (isViewer) {
      toast("Viewers cannot perform AI bulk analysis", "error");
      return;
    }
    const needsAnalysis = (state.trials || []).filter(
      t => !t.EfficacyDataJSON || t.EfficacyDataJSON === '[]' || !t.AISummariesJSON || t.AISummariesJSON === '{}'
    );
    if (needsAnalysis.length === 0) {
      setBulkAiProgress('All trials already have AI data.');
      toast('All trials up-to-date', 'info');
      return;
    }

    setBulkAnalysisState({
      isRunning: true,
      isPaused: false,
      lastProcessedIndex: -1,
      trialsToProcess: needsAnalysis,
      totalToProcess: needsAnalysis.length,
      successCount: 0,
      errorCount: 0,
      currentTrialName: '',
    });

    toast(`Starting analysis for ${needsAnalysis.length} trials...`, 'info');
    processNextBatch(needsAnalysis, 0);
  };

  const pauseBulkAnalysis = () => {
    setBulkAnalysisState(prev => ({ ...prev, isPaused: true }));
    toast('Analysis paused', 'info');
  };

  const resumeBulkAnalysis = () => {
    setBulkAnalysisState(prev => ({ ...prev, isPaused: false }));
    processNextBatch(bulkAnalysisState.trialsToProcess, bulkAnalysisState.lastProcessedIndex + 1);
    toast('Analysis resumed', 'info');
  };

  const cancelBulkAnalysis = () => {
    setBulkAnalysisState(prev => ({ ...prev, isRunning: false, isPaused: false }));
    toast('Analysis cancelled', 'info');
  };

  const processNextBatch = async (trials, startIndex) => {
    const keys = getAPIKeys('gemini');
    if (!keys || !keys.length) {
      toast('No Gemini API key configured. Please add one in Settings.', 'error');
      cancelBulkAnalysis();
      return;
    }

    for (let i = startIndex; i < trials.length; i++) {
      // Check if paused or cancelled
      if (!bulkAnalysisState.isRunning) break;
      if (bulkAnalysisState.isPaused) {
        setBulkAnalysisState(prev => ({ ...prev, lastProcessedIndex: i - 1 }));
        return;
      }

      const trial = trials[i];
      setBulkAnalysisState(prev => ({
        ...prev,
        lastProcessedIndex: i,
        currentTrialName: trial.FormulationName || `Trial ${trial.ID.slice(-6)}`,
      }));

      try {
        let efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
        let efficacyWasGenerated = false;

        // Step 1: Generate efficacy from photos if needed
        if (efficacyData.length === 0) {
          const photos = safeJsonParse(trial.PhotoURLs, []);
          if (photos.length > 0) {
            const newEfficacyObservations = [];

            for (const photo of photos.slice(0, 3)) { // Limit to first 3 photos
              if (!photo.url) continue;

              // Skip if analysis would take too long
              await new Promise(r => setTimeout(r, 100));

              try {
                // Create a simple efficacy observation from photo metadata
                const observationDate = new Date(photo.date || trial.Date || Date.now());
                const trialDate = new Date(trial.Date || Date.now());
                const daa = Math.max(0, Math.round((observationDate - trialDate) / (1000 * 60 * 60 * 24)));

                newEfficacyObservations.push({
                  date: observationDate.toISOString().split('T')[0],
                  daa,
                  notes: `AI-generated from photo ${photo.label || 'untitled'}`,
                  photoUrl: photo.url,
                  weedCover: null, // Will be estimated
                  weedDetails: [],
                });
              } catch (e) {
                console.warn('Error processing photo for efficacy:', e);
              }
            }

            if (newEfficacyObservations.length > 0) {
              efficacyData = newEfficacyObservations;
              efficacyWasGenerated = true;
            }
          }
        }

        // Step 2: Generate AI summary if we have efficacy data
        if (efficacyData.length > 0) {
          const summaryPrompt = `Analyze this herbicide trial data and provide a brief summary:
Formulation: ${trial.FormulationName || 'Unknown'}
Location: ${trial.Location || 'Unknown'}
Date: ${trial.Date || 'Unknown'}
Weed Species: ${trial.WeedSpecies || 'Unknown'}
Observations: ${efficacyData.length} time points

Provide a 2-sentence summary of expected efficacy based on typical performance patterns for this type of treatment.`;

          try {
            const summaryText = await generateTextWithAI(summaryPrompt, 'You are an agronomist generating professional trial report summaries.');

            // Update trial with AI data
            const updatedTrial = {
              ...trial,
              EfficacyDataJSON: JSON.stringify(efficacyData),
              AISummariesJSON: JSON.stringify({
                efficacySummary: summaryText,
                generatedAt: new Date().toISOString(),
                method: 'bulk-ai',
              }),
            };

            // Update state & persist to DB/Sheets
            updateState({
              trials: (state.trials || []).map(t => t.ID === trial.ID ? updatedTrial : t),
            });
            try {
              await updateTrial(updatedTrial, getAppState);
            } catch (dbErr) {
              console.warn(`Failed to save bulk analysis for trial ${trial.ID}:`, dbErr);
            }

            setBulkAnalysisState(prev => ({ ...prev, successCount: prev.successCount + 1 }));
          } catch (apiError) {
            if (apiError.message === 'QUOTA_EXCEEDED') {
              setBulkAnalysisState(prev => ({
                ...prev,
                isPaused: true,
                errorCount: prev.errorCount + 1,
              }));
              toast('API quota exceeded. Analysis paused.', 'error');
              return;
            }
            throw apiError;
          }
        }
      } catch (error) {
        console.error(`Failed to process trial ${trial.ID}:`, error);
        setBulkAnalysisState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      }

      // Small delay to prevent rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Analysis complete
    setBulkAnalysisState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      currentTrialName: '',
    }));

    toast(`Analysis complete: ${bulkAnalysisState.successCount} succeeded, ${bulkAnalysisState.errorCount} failed`,
      bulkAnalysisState.errorCount > 0 ? 'warning' : 'success'
    );
  };

  // ── Recalculate Efficacy Ratings ──────────────────────────────────────────
  const [isRecalculating, setIsRecalculating] = useState(false);


  const handleRecalculateAllRatings = async () => {
    if (isViewer) {
      toast("Viewers cannot recalculate ratings", "error");
      return;
    }
    if (isRecalculating) return;
    setIsRecalculating(true);
    const safeJsonParse = (str, fallback = []) => {
      try { return JSON.parse(str) || fallback; } catch { return fallback; }
    };
    
    try {
      const currentTrials = state.trials || [];
      const updatedTrials = [];
      let updatedCount = 0;

      for (const trial of currentTrials) {
        const efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
        if (efficacyData.length > 0) {
          const sorted = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
          const baseline = sorted[0];
          const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
          const latest = sorted[sorted.length - 1];
          const val = parseFloat(latest?.[primaryObsField] ?? 0) || 0;
          const efficacy = calculateEfficacy(activeCategory, val, baseVal);

          let resultRating = 'Unrated';
          if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
            if (efficacy >= 15) resultRating = 'Excellent';
            else if (efficacy >= 8) resultRating = 'Good';
            else if (efficacy >= 3) resultRating = 'Fair';
            else resultRating = 'Poor';
          } else {
            if (efficacy >= 85) resultRating = 'Excellent';
            else if (efficacy >= 70) resultRating = 'Good';
            else if (efficacy >= 50) resultRating = 'Fair';
            else resultRating = 'Poor';
          }

          if (trial.Result !== resultRating) {
            const updatedTrial = { ...trial, Result: resultRating };
            await updateTrial({ ID: trial.ID, Result: resultRating }, getAppState);
            updatedTrials.push(updatedTrial);
            updatedCount++;
          } else {
            updatedTrials.push(trial);
          }
        } else {
          updatedTrials.push(trial);
        }
      }

      if (updatedCount > 0) {
        updateState({ trials: updatedTrials });
        toast(`Successfully recalculated and updated ${updatedCount} trial ratings!`, 'success');
      } else {
        toast('All trials already have up-to-date ratings.', 'info');
      }
    } catch (e) {
      console.error('Failed to recalculate ratings:', e);
      toast('Failed to recalculate ratings: ' + e.message, 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  // ── Clear All Data ────────────────────────────────────────────────────────
  const handleClearAllData = () => {
    if (isViewer) {
      toast("Viewers cannot clear data", "error");
      return;
    }
    if (!window.confirm('⚠️ This will permanently delete ALL local data including trials, formulations, projects, and ingredients.\n\nThis action CANNOT be undone.\n\nAre you absolutely sure?')) return;
    if (!window.confirm('Final confirmation: Delete everything?')) return;
    updateState({
      trials: [], projects: [], formulations: [], ingredients: [],
      organisations: [], syncQueue: [], hasLoadedInitialData: false,
    });
    toast('All local data cleared', 'success');
  };

  const dataSummary = [
    { key: 'trials',        label: 'Trials',       count: (state.trials || []).length },
    { key: 'projects',      label: 'Projects',      count: (state.projects || []).length },
    { key: 'formulations',  label: 'Formulations',  count: (state.formulations || []).length },
    { key: 'ingredients',   label: 'Ingredients',   count: (state.ingredients || []).length },
    { key: 'organisations', label: 'Organisations', count: (state.organisations || []).length },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Data Management" onMenuClick={onMenuClick} />
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full space-y-6">

        {/* ── Data Summary ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-gray-500" /> Local Data Summary ({catConfig.name})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {dataSummary.map(({ key, label, count }) => (
              <div key={key} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-slate-800">{count}</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Cloud Backup ── */}
        <div className="bg-white p-6 rounded-lg shadow border border-blue-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-blue-700 flex items-center gap-2">
              <Cloud className="w-5 h-5" /> Cloud Backup
            </h2>
          </div>
          <p className="text-gray-600 mb-4 text-sm">Backup and restore your data to Google Drive, Dropbox, or a local file.</p>
          <button
            onClick={() => setShowCloudBackup(true)}
            disabled={isViewer}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <Cloud className="w-4 h-4" /> Manage Cloud Backup
          </button>
        </div>

        {/* ── Export Data ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-gray-500" /> Export Data
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Download your data for backup. ZIP includes photos. Standalone HTML is a complete viewable offline archive.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExportJSON}
              disabled={!canDownload}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                !canDownload ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-green-600 text-white hover:bg-green-700"
              }`}>
              <Download className="w-4 h-4" /> Export to JSON
            </button>
            <button onClick={() => { 
              if (!canDownload) {
                toast("Download permission is disabled for your account", "error");
                return;
              }
              exportZIP(state.trials); 
              toast('Generating ZIP…', 'info'); 
            }}
              disabled={!canDownload}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                !canDownload ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-green-700 text-white hover:bg-green-800"
              }`}>
              <Archive className="w-4 h-4" /> Export with Photos (ZIP)
            </button>
            <button onClick={handleExportStandaloneHTML}
              disabled={!canDownload}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                !canDownload ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-blue-700 text-white hover:bg-blue-800"
              }`}>
              <FileCode className="w-4 h-4" /> Export Standalone HTML
            </button>
          </div>
          <div className="mt-5 border-t pt-4">
            <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Export CSV per Entity
            </p>
            <div className="flex flex-wrap gap-2">
              {dataSummary.map(({ key, label }) => (
                <button key={key} onClick={() => handleExportCSV(key, label)}
                  disabled={!canDownload}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                    !canDownload ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60" : "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* ── Efficacy Repair & Target Linking ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-gray-500" /> Efficacy Repair &amp; {targetLabel} Linking
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Fix common issues that block {activeCategory} insights: string DAA values, missing details/primary metric, and missing {targetLabel} field.</p>
          <div className="flex flex-wrap gap-3 items-center">
            <button onClick={handleScanTrials}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-slate-700 text-white hover:bg-slate-800"
              }`}>
              Scan Trials
            </button>
            <button onClick={handleAutoFixWeedLinking}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}>
              Auto-Fix {targetLabel} Linking
            </button>
            <button onClick={handleRepairSpeciesTracking}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-purple-600 text-white hover:bg-purple-700"
              }`}>
              Repair {targetLabel} Tracking
            </button>
            <button onClick={handleForceFullRerepair}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-red-600 text-white hover:bg-red-700"
              }`}>
              Force Full Re-repair
            </button>
            {activeCategory === 'herbicide' && (
              <>
                <button onClick={handleRecalcGridCovers}
                  disabled={isViewer}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}>
                  Recalculate Grid Covers
                </button>
                <button onClick={handleRebuildCoverAll}
                  disabled={isViewer}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-amber-600 text-white hover:bg-amber-700"
                  }`}>
                  Rebuild %Cover (All Trials)
                </button>
              </>
            )}
            <button onClick={handleRecalculateWceAll}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}>
              Recalculate Efficacy ({catConfig.primaryMetric?.key || 'Efficacy'}%)
            </button>
            <button onClick={handleSyncObsDatesWithPhotos}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-sky-600 text-white hover:bg-sky-700"
              }`}>
              Sync Dates with Photos
            </button>
            <button onClick={handleRecalculateAllDaa}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-amber-700 text-white hover:bg-amber-800"
              }`}>
              Recalculate DAA (All Trials)
            </button>
            <button onClick={handleOneClickRepairAll}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition shadow-md ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700"
              }`}>
              One-Click Legacy Repair (Fix Everything)
            </button>
            <button onClick={handleForceAiReanalysisAll}
              disabled={isViewer}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition shadow-md ${
                isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-600 hover:to-red-700"
              }`}>
              Force AI Re-analysis of Photos
            </button>
          </div>

          {repairState.isRunning && (
            <div className="mt-4 space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex justify-between items-center text-sm font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                  Running: {repairState.taskName}
                </span>
                <span>{repairState.progress} / {repairState.total}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 animate-pulse">
                <div
                  className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${repairState.total > 0 ? (repairState.progress / repairState.total) * 100 : 0}%`
                  }}
                />
              </div>
              {repairState.currentTrialName && (
                <p className="text-xs text-slate-500 italic font-semibold">Processing: {repairState.currentTrialName}</p>
              )}
            </div>
          )}
          {scanSummary && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">{scanSummary}</div>
          )}
          {repairProgress && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">{repairProgress}</div>
          )}
        </div>

        {/* ── AI Bulk Analysis ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Bot className="w-5 h-5 text-gray-500" /> AI Bulk Analysis
          </h2>
          <p className="text-gray-600 mb-4 text-sm">
            Intelligently generate AI summaries and efficacy data for trials that need it.
            Skips already-analysed trials to save API credits. Processes one trial at a time with rate limiting.
          </p>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            {!bulkAnalysisState.isRunning && (
              <button onClick={startBulkAnalysis}
                disabled={isViewer}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                  isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}>
                <Bot className="w-4 h-4" /> Start Analysis
              </button>
            )}

            {bulkAnalysisState.isRunning && !bulkAnalysisState.isPaused && (
              <button onClick={pauseBulkAnalysis}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition flex items-center gap-2">
              <Activity className="w-4 h-4" /> Pause
              </button>
            )}

            {bulkAnalysisState.isRunning && bulkAnalysisState.isPaused && (
              <button onClick={resumeBulkAnalysis}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center gap-2">
                <Bot className="w-4 h-4" /> Resume
              </button>
            )}

            {bulkAnalysisState.isRunning && (
              <button onClick={cancelBulkAnalysis}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Cancel
              </button>
            )}
          </div>

          {/* Progress Display */}
          {bulkAnalysisState.isRunning && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${bulkAnalysisState.totalToProcess > 0
                      ? ((bulkAnalysisState.lastProcessedIndex + 1) / bulkAnalysisState.totalToProcess) * 100
                      : 0}%`
                  }}
                />
              </div>

              {/* Status info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-500 text-xs uppercase">Progress</div>
                  <div className="font-semibold text-slate-800">
                    {bulkAnalysisState.lastProcessedIndex + 1} / {bulkAnalysisState.totalToProcess}
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <div className="text-emerald-600 text-xs uppercase">Success</div>
                  <div className="font-semibold text-emerald-700">{bulkAnalysisState.successCount}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-red-600 text-xs uppercase">Errors</div>
                  <div className="font-semibold text-red-700">{bulkAnalysisState.errorCount}</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-3">
                  <div className="text-indigo-600 text-xs uppercase">Status</div>
                  <div className="font-semibold text-indigo-700">
                    {bulkAnalysisState.isPaused ? 'Paused' : 'Running'}
                  </div>
                </div>
              </div>

              {/* Current trial */}
              {bulkAnalysisState.currentTrialName && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                  <Bot className="w-4 h-4 text-indigo-500 animate-pulse" />
                  <span>Processing:</span>
                  <span className="font-medium text-slate-800">{bulkAnalysisState.currentTrialName}</span>
                </div>
              )}
            </div>
          )}

          {/* Results summary when complete */}
          {!bulkAnalysisState.isRunning && bulkAnalysisState.lastProcessedIndex >= 0 && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-1">
                <CheckCircle className="w-4 h-4" />
                Analysis Complete
              </div>
              <p className="text-sm text-emerald-600">
                Processed {bulkAnalysisState.lastProcessedIndex + 1} trials:
                {' '}<span className="font-semibold">{bulkAnalysisState.successCount} succeeded</span>,
                {' '}<span className="font-semibold">{bulkAnalysisState.errorCount} failed</span>
              </p>
            </div>
          )}

          {bulkAiProgress && !bulkAnalysisState.isRunning && (
            <p className="text-sm text-gray-600 mt-3">{bulkAiProgress}</p>
          )}
        </div>

        {/* ── Import Data ── */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Upload className="w-5 h-5 text-gray-500" /> Import Data
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Upload a previously exported JSON file to restore your data. <strong className="text-red-600">This will overwrite all current data.</strong></p>
          <button onClick={() => importRef.current?.click()}
            disabled={isViewer}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
            <Upload className="w-4 h-4" /> Select JSON File to Import
          </button>

          <div className="mt-5 border-t pt-4">
            <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
              <Import className="w-4 h-4" /> Import CSV per Entity (Bulk Upsert)
            </p>
            <p className="text-gray-600 mb-4 text-xs">This matches the export CSV schema and will update existing records (matching by ID) or insert new ones.</p>
            <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
              if (isViewer) {
                toast("Viewers cannot import CSV files", "error");
                return;
              }
              const file = e.target.files?.[0];
              if (!file || !csvImportEntity) return;
              importCSV(file, (data) => {
                if (data.length === 0) {
                  toast('No valid data found in CSV', 'error');
                  return;
                }
                const key = csvImportEntity.toLowerCase(); // trials, projects, formulations, ingredients, organisations
                const currentData = [...(state[key] || [])];
                let inserted = 0;
                let updated = 0;

                data.forEach(row => {
                  if (!row.ID) row.ID = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                  const existingIndex = currentData.findIndex(item => item.ID === row.ID);
                  if (existingIndex >= 0) {
                    currentData[existingIndex] = { ...currentData[existingIndex], ...row };
                    updated++;
                  } else {
                    currentData.push(row);
                    inserted++;
                  }
                });

                updateState({ [key]: currentData });
                toast(`Imported ${data.length} records (${inserted} new, ${updated} updated) for ${csvImportEntity}`, 'success');
              });
              e.target.value = '';
            }} />
            <div className="flex flex-wrap gap-2">
              {dataSummary.map(({ key, label }) => (
                <button key={key} onClick={() => { 
                  if (isViewer) {
                    toast("Viewers cannot import data", "error");
                    return;
                  }
                  setCsvImportEntity(key); 
                  csvImportRef.current?.click(); 
                }}
                  disabled={isViewer}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                    isViewer ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60" : "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                  }`}>
                  Import {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sync Queue ── */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" /> Synchronisation Queue
            </h3>
            {state.syncQueue && state.syncQueue.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear the entire sync queue? Pending uploads/changes will be deleted.")) {
                    updateState({ syncQueue: [] });
                    localStorage.setItem('syncQueue', JSON.stringify([]));
                  }
                }}
                className="text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1 bg-red-50 hover:bg-red-100 rounded-lg transition"
              >
                Clear Queue
              </button>
            )}
          </div>
          {state.syncQueue && state.syncQueue.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-600 font-semibold mb-3">{state.syncQueue.length} item{state.syncQueue.length !== 1 ? 's' : ''} pending sync</p>
              {state.syncQueue.slice(0, 10).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{item.action || item.type || 'Unknown action'}</p>
                    <p className="text-xs text-slate-400">{item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pending</span>
                  <button
                    onClick={() => {
                      const nextQueue = state.syncQueue.filter((_, idx) => idx !== i);
                      updateState({ syncQueue: nextQueue });
                      localStorage.setItem('syncQueue', JSON.stringify(nextQueue));
                    }}
                    className="p-1 hover:bg-amber-200 rounded text-amber-700 shrink-0 transition"
                    title="Remove item from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {state.syncQueue.length > 10 && (
                <p className="text-xs text-slate-400 text-center">+{state.syncQueue.length - 10} more items…</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Queue is empty — all data is synced.</p>
            </div>
          )}
        </div>


        {/* ── Recalculate Efficacy Ratings ── */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-600" /> Recalculate Efficacy Ratings
          </h3>
          <p className="text-xs text-slate-500">
            Updates the overall trial efficacy rating (Excellent, Good, Fair, Poor) for all legacy trials. This recalculates using the latest observation's primary metric value according to the category-specific visual rules.
          </p>
          <button
            onClick={handleRecalculateAllRatings}
            disabled={isRecalculating || isViewer}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
              isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {isRecalculating ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Recalculating...</>
            ) : (
              'Recalculate All Ratings'
            )}
          </button>
        </div>

        {/* ── Clear All Data ── */}
        <div className="bg-white p-6 rounded-lg shadow border border-red-200">
          <h2 className="text-xl font-semibold text-red-700 mb-2 flex items-center gap-2">
            <Trash2 className="w-5 h-5" /> Clear All Data
          </h2>
          <p className="text-gray-600 mb-4 text-sm">Permanently delete all your local data. <strong className="text-red-600">This action cannot be undone.</strong></p>
          <button onClick={handleClearAllData}
            disabled={isViewer}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              isViewer ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60" : "bg-red-600 text-white hover:bg-red-700"
            }`}>
            <Trash2 className="w-4 h-4" /> Clear All Data
          </button>
        </div>

      </div>

      {/* Cloud Backup Modal */}
      {showCloudBackup && (
        <CloudBackup onClose={() => setShowCloudBackup(false)} />
      )}
    </div>
  );
}
