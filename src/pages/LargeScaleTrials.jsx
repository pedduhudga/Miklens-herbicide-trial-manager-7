import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
import CropperModal from '../components/CropperModal.jsx';
import TrialCard from '../components/TrialCard.jsx';
import {
  addProject,
  deleteProject,
  addTrial,
  deleteTrial,
  updateTrial,
  uploadPhoto
} from '../services/dataLayer.js';
import {
  Plus, Trash2, MapPin, Calendar, Camera, Info, Sparkles, X,
  Compass, Map as MapIcon, RefreshCw, Layers, Thermometer, Wind, Droplets, CloudRain,
  Eye, CheckCircle, ChevronRight, BarChart2, Edit, ArrowLeft, FileText, Download,
  TrendingUp, Leaf, SlidersHorizontal, BookOpen, Layers3, Activity, FolderPlus, Hash, Clock, Navigation, Lock, Unlock, Copy, Share2, MoreVertical, Image as ImageIcon
} from 'lucide-react';
import { getAPIKeys, analyzePhoto, identifyWeedFromPhoto as identifyWeedFromPhotoService, generateTextWithAI, parseHarvestTextLog } from '../services/multiProviderAI.js';
import { calculateDAA, toDatetimeLocal, formatDate, formatDateTime, formatPhotoDate } from '../utils/dateUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { compressImage } from '../utils/imageCompression.js';
import { validateEfficacyData, AnalysisEngine } from '../utils/analysisUtils.js';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue, calculateEfficacy } from '../utils/categoryConfig.js';
import { performANOVA, performTwoWayANOVA, performTukeyHSD } from '../utils/statsUtils.js';
import { EPPO_CODES, BBCH_STAGES, lookupEPPO } from '../utils/eppoBBCHData.js';
import { exportToARM, importARMCSV } from '../services/armExporter.js';
import { fetchWeather as fetchWeatherService, fetchSoilData } from '../services/weather.js';

function computeSummaryStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, variance: 0, stdDev: 0, min: 0, max: 0, n: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  if (n === 1) return { mean, variance: 0, stdDev: 0, min: mean, max: mean, n };
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  return { mean, variance, stdDev, min: Math.min(...values), max: Math.max(...values), n };
}

function getSubTrialTreatmentLabel(trial) {
  const treatment = trial.FormulationName || 'Untreated Check';
  const dosageLabel = trial.Dosage ? ` @ ${trial.Dosage}` : '';
  return `${treatment}${dosageLabel}`;
}

function getFinalObservationValue(trial, categoryId) {
  const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []));
  if (!efficacy.length) return null;
  const sorted = efficacy.slice().sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
  const latest = sorted[sorted.length - 1];
  const value = getObservationPrimaryValue(categoryId, latest);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildAnalysisTrials(trials, primaryField) {
  return trials.map(trial => ({
    ...trial,
    FormulationName: getSubTrialTreatmentLabel(trial)
  }));
}

function summarizeSubTrialsByTreatment(subTrials, primaryField) {
  const groups = {};
  subTrials.forEach(trial => {
    const label = getSubTrialTreatmentLabel(trial);
    const value = getFinalObservationValue(trial, primaryField);
    if (value === null) return;
    if (!groups[label]) {
      groups[label] = { label, treatment: trial.FormulationName || 'Untreated Check', dosage: trial.Dosage || '', values: [], trials: [] };
    }
    groups[label].values.push(value);
    groups[label].trials.push(trial);
  });

  return Object.values(groups).map(group => {
    const stats = computeSummaryStats(group.values);
    return {
      treatment: group.treatment,
      dosage: group.dosage,
      label: group.label,
      values: group.values,
      n: stats.n,
      mean: stats.mean,
      sd: stats.stdDev,
      cv: stats.mean !== 0 ? Math.abs(stats.stdDev / stats.mean) * 100 : 0,
      entries: group.trials
    };
  });
}

export function getThemeClasses(accentColor = 'emerald') {
  const accentMap = {
    emerald: {
      bg: 'bg-emerald-600 hover:bg-emerald-700',
      bgSecondary: 'bg-emerald-600',
      text: 'text-emerald-600',
      textDark: 'text-emerald-700',
      ring: 'focus:ring-emerald-400',
      bgLight: 'bg-emerald-50',
      textLight: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      border: 'border-emerald-200',
      borderLight: 'border-emerald-100',
      hoverBgLight: 'hover:bg-emerald-50 text-emerald-700',
      hoverTextLight: 'hover:text-emerald-700',
      ringFocus: 'focus:ring-emerald-500',
    },
    indigo: {
      bg: 'bg-indigo-600 hover:bg-indigo-700',
      bgSecondary: 'bg-indigo-600',
      text: 'text-indigo-600',
      textDark: 'text-indigo-700',
      ring: 'focus:ring-indigo-400',
      bgLight: 'bg-indigo-50',
      textLight: 'text-indigo-700',
      badge: 'bg-indigo-100 text-indigo-700',
      border: 'border-indigo-200',
      borderLight: 'border-indigo-100',
      hoverBgLight: 'hover:bg-indigo-50 text-indigo-700',
      hoverTextLight: 'hover:text-indigo-700',
      ringFocus: 'focus:ring-indigo-500',
    },
    red: {
      bg: 'bg-red-600 hover:bg-red-700',
      bgSecondary: 'bg-red-600',
      text: 'text-red-600',
      textDark: 'text-red-700',
      ring: 'focus:ring-red-400',
      bgLight: 'bg-red-50',
      textLight: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      border: 'border-red-200',
      borderLight: 'border-red-100',
      hoverBgLight: 'hover:bg-red-50 text-red-700',
      hoverTextLight: 'hover:text-red-700',
      ringFocus: 'focus:ring-red-500',
    },
    amber: {
      bg: 'bg-amber-600 hover:bg-amber-700',
      bgSecondary: 'bg-amber-600',
      text: 'text-amber-600',
      textDark: 'text-amber-700',
      ring: 'focus:ring-amber-400',
      bgLight: 'bg-amber-50',
      textLight: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      border: 'border-amber-200',
      borderLight: 'border-amber-100',
      hoverBgLight: 'hover:bg-amber-50 text-amber-700',
      hoverTextLight: 'hover:text-amber-700',
      ringFocus: 'focus:ring-amber-500',
    },
    teal: {
      bg: 'bg-teal-600 hover:bg-teal-700',
      bgSecondary: 'bg-teal-600',
      text: 'text-teal-600',
      textDark: 'text-teal-700',
      ring: 'focus:ring-teal-400',
      bgLight: 'bg-teal-50',
      textLight: 'text-teal-700',
      badge: 'bg-teal-100 text-teal-700',
      border: 'border-teal-200',
      borderLight: 'border-teal-100',
      hoverBgLight: 'hover:bg-teal-50 text-teal-700',
      hoverTextLight: 'hover:text-teal-700',
      ringFocus: 'focus:ring-teal-500',
    },
  };
  return accentMap[accentColor] || accentMap.emerald;
}

import {
  generateComprehensivePdf,
  generateScientificReport,
  generatePpt,
  exportToCSV,
  exportHtmlReport,
  exportTrialDocx,
  generateMasterComprehensivePdf,
  generateMasterScientificReport,
  generateMasterPpt,
  exportMasterCSV,
  exportMasterHtml,
  exportMasterDocx
} from '../services/trialReports.js';

const L = window.L;

const emptySubTrialForm = () => ({
  FormulationName: '',
  InvestigatorName: '',
  Date: toDatetimeLocal(new Date()),
  Location: '',
  Dosage: '',
  Lat: '',
  Lon: '',
  WeedSpecies: '',
  Result: 'Pending',
  Notes: '',
  Conclusion: '',
  IsControl: false,
  IsStandardCheck: false,
  IsCompleted: false,
  Replication: '',
  PlotNumber: '',
  Temperature: '',
  Humidity: '',
  Windspeed: '',
  Rain: '',
  SoilPH: '',
  SoilClay: '',
  SoilSand: '',
  SoilOC: '',
  SoilTexture: '',
  ApplicationTiming: 'POST',
  WeedGrowthStage: 'Vegetative',
  EfficacyDataJSON: '[]',
  PhotoURLs: '[]',
  WeedPhotosJSON: '[]',
  AISummariesJSON: '{}'
});

const emptyVisitForm = () => ({
  daa: '',
  date: new Date().toISOString().split('T')[0],
  weedCover: '',
  notes: '',
  weatherTemp: '',
  weatherHumidity: '',
  weatherWind: '',
  weatherRain: '',
  photoUrl: '',
  weedDetails: []
});

export default function LargeScaleTrials({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const { isViewer, user } = useAuth();
  const canDownload = !isViewer && user?.tabPermissions?.['Allow Downloads'] !== false;

  const toast = (msg, type = 'success') =>
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

  const checkDownload = (fn, ...args) => {
    if (!canDownload) {
      toast('Download permission is disabled for your account.', 'error');
      return;
    }
    fn(...args);
  };

  const activeCategory = state.activeCategory || 'herbicide';
  const config = getCategoryConfig(activeCategory);
  const theme = useMemo(() => getThemeClasses(config.color.accent), [config.color.accent]);
  const INPUT = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${theme.ring} bg-white`;
  

  // Master projects filter
  const masterProjects = useMemo(() => {
    return (state.projects || []).filter(p => p.Design === 'LargeScale' && (p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide')));
  }, [state.projects, activeCategory]);

  const [activeProjectId, setActiveProjectId] = useState('');
  const [selectedSubTrialId, setSelectedSubTrialId] = useState('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isSubTrialModalOpen, setIsSubTrialModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [editingSubTrial, setEditingSubTrial] = useState(null);
  const [editingVisitIdx, setEditingVisitIdx] = useState(null);

  // Forms
  const [projectForm, setProjectForm] = useState({ Name: '', Crop: '', Location: '', Investigator: '', TargetWeed: '', GPSBounds: '' });
  const [subTrialForm, setSubTrialForm] = useState(emptySubTrialForm());
  const [visitForm, setVisitForm] = useState(emptyVisitForm());

  // UI state
  const [dashboardTab, setDashboardTab] = useState('map'); // 'map' | 'charts' | 'ai'
  const [loading, setLoading] = useState(false);
  const [aiReportRunning, setAiReportRunning] = useState(false);
  const [gpsFetching, setGpsFetching] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Additional states for sub-trials (matching standard Trials)
  const [selectedForBulk, setSelectedForBulk] = useState(new Set());
  const [openCardMenu, setOpenCardMenu] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [pendingPhotoAnalysis, setPendingPhotoAnalysis] = useState(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [cameraMode, setCameraMode] = useState('general');
  const [detectingCover, setDetectingCover] = useState(false);
  const [coverDetectResult, setCoverDetectResult] = useState(null);
  const [qrCardSize, setQrCardSize] = useState('id-card');
  const [aiGenRunning, setAiGenRunning] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [duplicateFormulation, setDuplicateFormulation] = useState('');
  const [duplicateDate, setDuplicateDate] = useState('');
  const [duplicateDosage, setDuplicateDosage] = useState('');
  const [weedIdResult, setWeedIdResult] = useState(null);
  const [projectAnalysis, setProjectAnalysis] = useState({
    treatmentSummary: [],
    analysisTrials: [],
    anova: null,
    postHoc: null,
    design: 'RCBD',
    analysisMethod: 'One-way ANOVA',
    balanceWarning: null,
    missingFinalWarning: null,
    insufficientWarning: 'Analysis has not yet been computed.',
    loading: false
  });

  // --- Harvest & Yield ---
  const [harvestForm, setHarvestForm] = useState({
    actualFruitCount: '',
    actualMarketableWeight: '',
    actualUnmarketableWeight: '',
    harvestDate: '',
    notes: '',
    photos: []
  });
  const [aiHarvestLoading, setAiHarvestLoading] = useState(false);
  const [harvestDictationText, setHarvestDictationText] = useState('');
  const [aiNotesParsing, setAiNotesParsing] = useState(false);
  const [pendingHarvestAiResult, setPendingHarvestAiResult] = useState(null);

  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [eppoSearchQuery, setEppoSearchQuery] = useState('');
  const [showEppoDropdown, setShowEppoDropdown] = useState(false);

  const [viewMode, setViewMode] = useState('gis'); // 'gis' | 'spots'
  const [search, setSearch] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterRole, setFilterRole] = useState(''); // 'all' | 'control' | 'standard'
  const [sortBy, setSortBy] = useState('date-desc');

  // Refs
  const quickActionTrialRef = useRef(null);
  const cropCallbackRef = useRef(null);
  const fileInputRef = useRef(null);
  const harvestFileRef = useRef(null);
  const armFileInputRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [qrMode, setQrMode] = useState('offline'); // 'offline' | 'online'

  // Map refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);

  // Selected Master Project document
  const activeProject = useMemo(() => {
    return masterProjects.find(p => p.ID === activeProjectId);
  }, [masterProjects, activeProjectId]);

  // Sub-trials belonging to active project
  const subTrials = useMemo(() => {
    if (!activeProjectId) return [];
    return (state.trials || []).filter(t => t.ProjectID === activeProjectId);
  }, [state.trials, activeProjectId]);

  const filteredSubTrials = useMemo(() => {
    let result = [...subTrials];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(st =>
        (st.FormulationName || '').toLowerCase().includes(q) ||
        (st.InvestigatorName || '').toLowerCase().includes(q) ||
        (st.Location || '').toLowerCase().includes(q) ||
        (st.Notes || '').toLowerCase().includes(q)
      );
    }
    if (filterResult) {
      result = result.filter(st => st.Result === filterResult);
    }
    if (filterRole === 'control') {
      result = result.filter(st => st.IsControl === true || st.IsControl === 'true');
    } else if (filterRole === 'standard') {
      result = result.filter(st => st.IsStandardCheck === true || st.IsStandardCheck === 'true');
    }

    result.sort((a, b) => {
      if (sortBy === 'date-desc') return new Date(b.Date || 0) - new Date(a.Date || 0);
      if (sortBy === 'date-asc') return new Date(a.Date || 0) - new Date(b.Date || 0);
      if (sortBy === 'name') return (a.FormulationName || '').localeCompare(b.FormulationName || '');
      if (sortBy === 'obs') {
        const lenA = safeJsonParse(a.EfficacyDataJSON, []).length;
        const lenB = safeJsonParse(b.EfficacyDataJSON, []).length;
        return lenB - lenA;
      }
      return 0;
    });

    return result;
  }, [subTrials, search, filterResult, filterRole, sortBy]);

  // Active sub-trial details
  const activeSubTrial = useMemo(() => {
    return subTrials.find(t => t.ID === selectedSubTrialId);
  }, [subTrials, selectedSubTrialId]);

  useEffect(() => {
    if (activeSubTrial) {
      const data = safeJsonParse(activeSubTrial.HarvestDataJSON, {});
      setHarvestForm({
        actualFruitCount: data.actualFruitCount ?? '',
        actualMarketableWeight: data.actualMarketableWeight ?? '',
        actualUnmarketableWeight: data.actualUnmarketableWeight ?? '',
        harvestDate: data.harvestDate ?? '',
        notes: data.notes ?? '',
        photos: data.photos ?? []
      });
    }
  }, [activeSubTrial]);

  // Derivations for sub-trials (matching standard Trials detail tab)
  const obsData = useMemo(() => {
    if (!activeSubTrial) return { sorted: [], baseCover: 100 };
    const sorted = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, [])).sort((a, b) => a.daa - b.daa);
    const baseline = sorted[0];
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const baseCover = baseline ? parseFloat(baseline[primaryObsField] ?? 100) : 100;
    return { sorted, baseCover };
  }, [activeSubTrial, activeCategory]);

  const daaCoverage = useMemo(() => {
    if (!activeSubTrial) return { allDAAs: [], obsDAAs: [], photoDAAs: [], hasGaps: false };
    const obs = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, []));
    const photos = safeJsonParse(activeSubTrial.PhotoURLs, []).filter(p => !p.deleted);
    const obsDAAs = obs.map(o => o.daa);
    const photoDAAs = photos.map(p => {
      if (!p.date || !activeSubTrial.Date) return 0;
      return calculateDAA(p.date, activeSubTrial.Date);
    });
    const allDAAs = Array.from(new Set([...obsDAAs, ...photoDAAs])).sort((a, b) => a - b);
    const hasGaps = allDAAs.some(daa => !obsDAAs.includes(daa));
    return { allDAAs, obsDAAs, photoDAAs, hasGaps };
  }, [activeSubTrial]);

  const statsData = useMemo(() => {
    if (!activeSubTrial) return { stats: null, hasStats: false, renderWces: [], renderMeanWce: 0 };
    const stats = activeSubTrial.StatisticsJSON ? (() => { try { return JSON.parse(activeSubTrial.StatisticsJSON); } catch(e) { return null; } })() : null;
    const hasStats = stats && (stats.wce || stats.anovaResults);
    const renderWces = (stats?.wce || []).map(r => r.wce).filter(v => v !== null && isFinite(v));
    const renderMeanWce = renderWces.length ? renderWces.reduce((s, v) => s + v, 0) / renderWces.length : 0;
    return { stats, hasStats, renderWces, renderMeanWce };
  }, [activeSubTrial]);

  const projectTreatmentSummary = useMemo(() => {
    const primaryObsField = getPrimaryObservationField(activeCategory);
    return summarizeSubTrialsByTreatment(subTrials, primaryObsField).sort((a, b) => b.mean - a.mean);
  }, [subTrials, activeCategory]);

  const projectDesign = useMemo(() => {
    const rawDesign = String(activeProject?.Design || activeProject?.TrialDesign || 'RCBD').trim();
    return /POT/i.test(rawDesign)
      ? 'Pot Trial'
      : /FACTORIAL|TWO[- ]?WAY|2WAY/i.test(rawDesign)
      ? 'Two-way factorial'
      : /CRD/i.test(rawDesign)
      ? 'CRD'
      : /RCBD|BLOCK/i.test(rawDesign)
      ? 'RCBD'
      : rawDesign || 'RCBD';
  }, [activeProject]);

  const projectWarnings = useMemo(() => {
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const missingFinalCount = subTrials.filter(st => getFinalObservationValue(st, primaryObsField) === null).length;
    const replicateCounts = projectTreatmentSummary.map(ts => ts.n);
    const balanced = replicateCounts.length > 1 && replicateCounts.every(n => n === replicateCounts[0]);
    return {
      balanceWarning: !balanced ? 'Treatment replicate counts are unequal. Interpret ANOVA and group comparisons with caution.' : null,
      missingFinalWarning: missingFinalCount > 0 ? `${missingFinalCount} spot(s) are missing final observations and are excluded from the analysis.` : null
    };
  }, [subTrials, activeCategory, projectTreatmentSummary]);

  useEffect(() => {
    if (!activeProjectId) {
      setProjectAnalysis(prev => ({
        ...prev,
        treatmentSummary: [],
        analysisTrials: [],
        anova: null,
        postHoc: null,
        design: 'RCBD',
        analysisMethod: 'One-way ANOVA',
        balanceWarning: null,
        missingFinalWarning: null,
        insufficientWarning: 'Analysis has not yet been computed.',
        loading: false
      }));
      return;
    }

    const primaryObsField = getPrimaryObservationField(activeCategory);
    const validFinalTrials = subTrials.filter(st => getFinalObservationValue(st, primaryObsField) !== null);
    const analysisTrials = buildAnalysisTrials(validFinalTrials, primaryObsField);
    const rawDesign = String(activeProject?.Design || activeProject?.TrialDesign || 'RCBD').trim();
    const analysisMethod = /FACTORIAL|TWO[- ]?WAY|2WAY/i.test(rawDesign)
      ? 'Two-way ANOVA'
      : /CRD/i.test(rawDesign)
      ? 'One-way ANOVA (CRD)'
      : 'One-way ANOVA (RCBD)';

    const baseline = {
      treatmentSummary: projectTreatmentSummary,
      analysisTrials,
      anova: null,
      postHoc: null,
      design: projectDesign,
      analysisMethod,
      balanceWarning: projectWarnings.balanceWarning,
      missingFinalWarning: projectWarnings.missingFinalWarning,
      insufficientWarning: 'Analysis is being computed.',
      loading: true
    };
    setProjectAnalysis(baseline);

    let isMounted = true;
    const engine = new AnalysisEngine(activeProjectId, state, getAppState);
    const primaryMetric = analysisTrials.some(t => parseFloat(t.YieldValue || t.Yield) > 0) ? 'yield' : primaryObsField;

    const runAnalysis = async () => {
      try {
        const results = await engine.analyze(primaryMetric, null, null, { postHoc: 'tukey', persist: false });
        if (!isMounted) return;
        setProjectAnalysis({
          ...baseline,
          ...results,
          design: projectDesign,
          analysisMethod,
          balanceWarning: projectWarnings.balanceWarning,
          missingFinalWarning: projectWarnings.missingFinalWarning,
          insufficientWarning: (!results?.anova || results?.anova?.error) ? 'Not enough valid observations or treatment groups for formal ANOVA.' : null,
          loading: false
        });
      } catch (err) {
        if (!isMounted) return;
        setProjectAnalysis({
          ...baseline,
          anova: null,
          postHoc: null,
          insufficientWarning: 'Scientific analysis failed to run. Please verify trial data completeness.',
          loading: false
        });
        console.warn('[LargeScaleTrials] AnalysisEngine error:', err);
      } finally {
        // Analysis completion is reflected via projectAnalysis.loading
      }
    };

    runAnalysis();
    return () => { isMounted = false; };
  }, [activeProjectId, activeCategory, subTrials, activeProject, projectDesign, projectWarnings, projectTreatmentSummary, state, getAppState]);

  // Color mappings matching TrialCard
  const RESULT_COLORS = {
    'Excellent': '${theme.badge} ${theme.border}',
    'Good': 'bg-blue-100 text-blue-700 border-blue-200',
    'Fair': 'bg-amber-100 text-amber-700 border-amber-200',
    'Poor': 'bg-red-100 text-red-700 border-red-200',
    'Control': 'bg-purple-100 text-purple-700 border-purple-200',
  };

  const STATUS_CLS = {
    'Active': 'bg-slate-100 text-slate-700 border-slate-200',
    'Slight Injury': 'bg-blue-50 text-blue-700 border-blue-100',
    'Moderate Injury': 'bg-amber-50 text-amber-700 border-amber-100',
    'Severe Injury': 'bg-orange-50 text-orange-700 border-orange-100',
    'Dead/Desiccated': 'bg-red-50 text-red-700 border-red-100',
    'N/A': 'bg-slate-100 text-slate-400 border border-slate-200',
  };

  // Card toggle & detail view callbacks
  const toggleBulk = useCallback((id) => {
    setSelectedForBulk(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const toggleMenu = useCallback((id) => {
    setOpenCardMenu(prev => prev === id ? null : id);
  }, []);

  const onViewDetails = useCallback((trial) => {
    setSelectedSubTrialId(trial.ID);
    setDetailTab('info');
    setOpenCardMenu(null);
  }, []);

  const onEdit = useCallback((trial) => {
    if (isViewer) {
      toast('Viewer role cannot modify sub-trials.', 'error');
      return;
    }
    setEditingSubTrial(trial);
    setSubTrialForm({
      FormulationName: trial.FormulationName || '',
      InvestigatorName: trial.InvestigatorName || '',
      Date: toDatetimeLocal(trial.Date),
      Location: trial.Location || '',
      Dosage: trial.Dosage || '',
      Lat: trial.Lat || '',
      Lon: trial.Lon || '',
      WeedSpecies: trial.WeedSpecies || '',
      Result: trial.Result || 'Pending',
      Notes: trial.Notes || '',
      Conclusion: trial.Conclusion || '',
      IsControl: trial.IsControl === true || trial.IsControl === 'true',
      IsStandardCheck: trial.IsStandardCheck === true || trial.IsStandardCheck === 'true',
      IsCompleted: trial.IsCompleted === true || trial.IsCompleted === 'true',
      Replication: trial.Replication || 'R1',
      PlotNumber: trial.PlotNumber || '',
      Temperature: trial.Temperature || '',
      Humidity: trial.Humidity || '',
      Windspeed: trial.Windspeed || '',
      Rain: trial.Rain || '',
      SoilPH: trial.SoilPH || '',
      SoilClay: trial.SoilClay || '',
      SoilSand: trial.SoilSand || '',
      SoilOC: trial.SoilOC || '',
      SoilTexture: trial.SoilTexture || '',
      ApplicationTiming: trial.ApplicationTiming || 'POST',
      WeedGrowthStage: trial.WeedGrowthStage || 'Vegetative',
      EfficacyDataJSON: trial.EfficacyDataJSON || '[]',
      PhotoURLs: trial.PhotoURLs || '[]',
      WeedPhotosJSON: trial.WeedPhotosJSON || '[]',
      AISummariesJSON: trial.AISummariesJSON || '{}'
    });
    setIsSubTrialModalOpen(true);
    setOpenCardMenu(null);
  }, []);

  const onDuplicate = useCallback((trial) => {
    if (isViewer) {
      toast('Viewer role cannot duplicate sub-trials.', 'error');
      return;
    }
    setDuplicateModal(trial);
    setDuplicateFormulation(trial.FormulationName || '');
    setDuplicateDate(toDatetimeLocal(new Date()));
    setDuplicateDosage(trial.Dosage || '');
    setOpenCardMenu(null);
  }, []);

  const onMoveToProject = useCallback(async (trial) => {
    if (isViewer) {
      toast('Viewer role cannot move sub-trials.', 'error');
      return;
    }
    const activeProjects = (state.projects || []).filter(p => p.Design === 'LargeScale');
    if (activeProjects.length <= 1) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No other large field workspaces to move to.', type: 'info' } }));
      return;
    }
    const projectList = activeProjects.map((p, i) => `${i + 1}. ${p.Name}`).join('\n');
    const choice = window.prompt(`Move sub-trial to workspace:\n\n${projectList}\n\nEnter number:`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= activeProjects.length) return;
    const updated = { ...trial, ProjectID: activeProjects[idx].ID };
    try {
      await updateTrial(updated, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === trial.ID ? updated : t) });
      if (selectedSubTrialId === trial.ID) setSelectedSubTrialId('');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Moved to workspace "${activeProjects[idx].Name}"`, type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to move sub-trial.', type: 'error' } }));
    }
  }, [state.projects, state.trials, selectedSubTrialId, getAppState, updateState]);

  const onActivateToggle = useCallback(async (trial) => {
    if (isViewer) {
      toast('Viewer role cannot activate/deactivate sub-trials.', 'error');
      return;
    }
    const updated = { ...trial, IsLive: String(trial.IsLive) === 'false' };
    try {
      await updateTrial(updated, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === trial.ID ? updated : t) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Sub-trial ${updated.IsLive ? 'activated' : 'deactivated'}`, type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to update activation status.', type: 'error' } }));
    }
  }, [state.trials, getAppState, updateState]);

  const handleScanHarvestPhotos = async () => {
    const photos = harvestForm.photos || [];
    if (photos.length === 0) return;
    setAiHarvestLoading(true);
    try {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI is analyzing your harvest photos...', type: 'info' } }));
      const primaryPhoto = photos[0];
      const result = await analyzePhoto(primaryPhoto, { isHarvest: true, category: activeCategory });
      if (result.success && result.data) {
        const data = result.data;
        setPendingHarvestAiResult({
          fruitCount: data.fruitCount ?? 0,
          marketableWeight: data.marketableYieldEstimateGrams ?? 0,
          unmarketableWeight: data.unmarketableYieldEstimateGrams ?? 0,
          defects: data.detectedDefects ?? '',
          sourcePhoto: primaryPhoto
        });
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: result.error || 'Failed to analyze harvest photo', type: 'error' } }));
      }
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Error analyzing harvest photos: ' + e.message, type: 'error' } }));
    } finally {
      setAiHarvestLoading(false);
    }
  };

  const handleParseHarvestNotes = async () => {
    if (!harvestDictationText.trim()) return;
    setAiNotesParsing(true);
    try {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Parsing harvest notes...', type: 'info' } }));
      const parsed = await parseHarvestTextLog(harvestDictationText, activeCategory);
      setPendingHarvestAiResult({
        harvestDate: parsed.harvestDate || '',
        fruitCount: parsed.actualFruitCount ?? 0,
        marketableWeight: parsed.actualMarketableWeight ?? 0,
        unmarketableWeight: parsed.actualUnmarketableWeight ?? 0,
        defects: parsed.notes ?? '',
        notesText: parsed.notes || ''
      });
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to parse notes: ' + e.message, type: 'error' } }));
    } finally {
      setAiNotesParsing(false);
    }
  };

  const onMarkComplete = useCallback(async (trial) => {
    if (isViewer) {
      toast('Viewer role cannot finalize sub-trials.', 'error');
      return;
    }
    const updated = { ...trial, IsCompleted: true };
    try {
      await updateTrial(updated, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === trial.ID ? updated : t) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sub-trial finalized.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to finalize sub-trial.', type: 'error' } }));
    }
  }, [state.trials, getAppState, updateState]);

  const onQuickRate = useCallback(async (trial, rating) => {
    if (isViewer) {
      toast('Viewer role cannot rate sub-trials.', 'error');
      return;
    }
    const newRating = trial.Result === rating ? '' : rating;
    const updated = { ...trial, Result: newRating };
    try {
      await updateTrial(updated, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === trial.ID ? updated : t) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Rating updated!', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to update rating.', type: 'error' } }));
    }
  }, [state.trials, getAppState, updateState]);

  const onQuickPhoto = useCallback((trial) => {
    if (isViewer) {
      toast('Viewer role cannot capture photos.', 'error');
      return;
    }
    quickActionTrialRef.current = trial;
    setCameraMode('general');
    setIsCameraOpen(true);
  }, []);

  const onQuickGalleryUpload = useCallback((trial) => {
    if (isViewer) {
      toast('Viewer role cannot upload files.', 'error');
      return;
    }
    quickActionTrialRef.current = trial;
    fileInputRef.current?.click();
  }, []);

  // Duplicate handler confirm
  const handleDuplicateConfirm = async () => {
    if (isViewer) {
      toast('Viewer role cannot duplicate sub-trials.', 'error');
      return;
    }
    if (!duplicateModal) return;
    const isCompleted = duplicateModal.IsCompleted === true || duplicateModal.IsCompleted === 'true';
    const payload = {
      ...duplicateModal,
      ID: `sub_${Date.now()}`,
      FormulationName: duplicateFormulation,
      Date: duplicateDate || new Date().toISOString(),
      Dosage: duplicateDosage,
      IsCompleted: false,
      Result: 'Pending',
      EfficacyDataJSON: '[]',
      PhotoURLs: '[]',
      WeedPhotosJSON: '[]',
      AISummariesJSON: '{}',
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };
    try {
      await addTrial(payload, getAppState);
      updateState({ trials: [...state.trials, payload] });
      setDuplicateModal(null);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sub-trial duplicated successfully!', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to duplicate sub-trial.', type: 'error' } }));
    }
  };

  // AI & Photo Processing Helpers
  const openCropperFor = (dataUrl, callback) => {
    setCropSource(dataUrl);
    cropCallbackRef.current = callback;
    setCropperOpen(true);
  };

  const handleCropComplete = (croppedUrl) => {
    setCropperOpen(false);
    setCropSource(null);
    if (cropCallbackRef.current) {
      cropCallbackRef.current(croppedUrl);
      cropCallbackRef.current = null;
    }
  };

  const promptPhotoDate = (dataUrl, targetTrial = null) => {
    setPendingPhotoAnalysis({ dataUrl, date: toDatetimeLocal(new Date()), targetTrial });
  };

  const saveAndAnalyzePhoto = async (dataUrl, photoDateStr, targetTrialOverride = null) => {
    const targetTrial = targetTrialOverride || activeSubTrial;
    if (!targetTrial) return;
    setAiGenRunning(true);

    // Compress image before saving/uploading to prevent quota errors
    try {
      dataUrl = await compressImage(dataUrl, 600, 0.7);
    } catch (compressErr) {
      console.warn('Photo compression failed, using original:', compressErr);
    }

    const photoDate = formatPhotoDate(photoDateStr || new Date().toISOString());
    const fileName = `photo_sub_${targetTrial.ID}_${Date.now()}.jpg`;
    const tempId = `local_${Date.now()}`;

    const projectName = activeProject?.Name || 'LargeScale Field Trials';
    const dosageSuffix = targetTrial.Dosage ? ` (${targetTrial.Dosage})` : '';
    const trialNameWithDate = `${targetTrial.FormulationName || 'Unknown Spot'}${dosageSuffix} (${targetTrial.Date ? targetTrial.Date.split('T')[0] : photoDate})`.trim();
    
    const rawCategory = targetTrial.Category || activeProject?.Category || state?.activeCategory || 'herbicide';
    const categoryLower = String(rawCategory).trim().toLowerCase();
    const categoryName = categoryLower === 'herbicide' ? 'Herbicide' :
                         categoryLower === 'fungicide' ? 'Fungicide' :
                         categoryLower === 'pesticide' ? 'Pesticide' :
                         categoryLower === 'nutrition' ? 'Nutrition' :
                         categoryLower === 'biostimulant' ? 'Biostimulant' :
                         categoryLower.charAt(0).toUpperCase() + categoryLower.slice(1);

    const userName = String(
      state?.auth?.user?.Name || 
      state?.auth?.user?.Username || 
      state?.auth?.Name || 
      state?.auth?.Username || 
      targetTrial.InvestigatorName || 
      activeProject?.Investigator || 
      'Default User'
    ).trim() || 'Default User';

    const folderPath = [categoryName, userName, projectName, trialNameWithDate];

    // Optimistically add a placeholder
    const photoEntry = { tempId, fileData: dataUrl, date: photoDate, label: cameraMode === 'weed' ? 'Weed Photo' : 'Field Observation', identifications: [] };
    const photosOptimistic = [...safeJsonParse(targetTrial.PhotoURLs, []), photoEntry];
    const optimisticTrial = { ...targetTrial, PhotoURLs: JSON.stringify(photosOptimistic) };
    updateState({ trials: state.trials.map(t => t.ID === optimisticTrial.ID ? optimisticTrial : t) });
    if (selectedSubTrialId === targetTrial.ID) setSelectedSubTrialId(optimisticTrial.ID);

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Uploading field photo...', type: 'info' } }));

    try {
      const uploadResult = await uploadPhoto({
        trialId: targetTrial.ID,
        fileData: dataUrl,
        mimeType: 'image/jpeg',
        fileName,
        isWeed: cameraMode === 'weed',
        label: photoEntry.label,
        date: photoDate,
        folderPath,
      }, getAppState);

      const driveUrl = uploadResult?.url || uploadResult?.fileUrl || null;
      const currentPhotos = safeJsonParse(targetTrial.PhotoURLs, []).filter(p => p.tempId !== tempId);
      const finalEntry = driveUrl
        ? { url: driveUrl, date: photoDate, label: photoEntry.label, identifications: [] }
        : { ...photoEntry, tempId: undefined };
      currentPhotos.push(finalEntry);

      const updatedTrial = { ...targetTrial, PhotoURLs: JSON.stringify(currentPhotos) };
      updateState({ trials: state.trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
      if (selectedSubTrialId === targetTrial.ID) setSelectedSubTrialId(updatedTrial.ID);

      await updateTrial({ ID: updatedTrial.ID, PhotoURLs: updatedTrial.PhotoURLs }, getAppState);

      const daa = calculateDAA(photoDate, targetTrial.Date);

      // AI Analysis
      const keys = getAPIKeys('gemini-3-flash');
      if (keys.length) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Analyzing photo with AI...', type: 'info' } }));
        const result = await analyzePhoto(dataUrl, {
          treatment: targetTrial.FormulationName,
          daa,
          rep: targetTrial.Replication || 'R1'
        }, (msg) => {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } }));
        });

        if (result.success) {
          await createObservationFromAI(targetTrial, daa, result.data, photoDate, driveUrl || dataUrl);
        }
      }
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save and analyze photo', type: 'error' } }));
    } finally {
      setAiGenRunning(false);
      setPendingPhotoAnalysis(null);
    }
  };

  const createObservationFromAI = async (trial, daa, aiData, obsDate = null, photoUrl = null) => {
    const latestTrial = state.trials.find(t => t.ID === trial.ID) || trial;
    const trialCat = latestTrial.Category || activeCategory;
    const catConfig = getCategoryConfig(trialCat);
    const efficacyData = validateEfficacyData(safeJsonParse(latestTrial.EfficacyDataJSON, []));

    const getNormalizedTargetName = (name) => {
      if (!name) return 'Unknown';
      const clean = name.trim().toLowerCase();
      if (clean.includes('leafminer') || clean.includes('leaf miner') || clean.includes('leaf mining')) {
        return 'Leafminer Damage';
      }
      if (clean.includes('plant vigor') || clean.includes('general vigor') || clean.includes('visual vigor')) {
        return 'General Plant Vigor';
      }
      if (clean.includes('plant health') || clean.includes('general plant health')) {
        return 'General Plant Health';
      }
      if (clean.includes('leaf health') || clean.includes('general leaf health')) {
        return 'General Leaf Health';
      }
      if (clean.includes('foliage') || clean.includes('general foliage')) {
        return 'General Foliage';
      }
      if (clean.includes('vegetative development') || clean.includes('vegetative growth')) {
        return 'General Vegetative Development';
      }
      return name.replace(/\b\w/g, c => c.toUpperCase());
    };

    // Normalize target details list
    const isHerbicide = trialCat === 'herbicide';
    const aiTargetsList = isHerbicide ? (aiData.weeds || []) : (aiData.targets || []);
    
    const isDetectedVal = (coverVal, statusStr) => {
      const s = String(statusStr || '').toLowerCase();
      return s !== 'not detected' && s !== 'absent' && parseFloat(coverVal || 0) > 0;
    };

    const normalizedWeeds = aiTargetsList.map(w => {
      let rawStatus = String(w.status || '').trim();
      if (!isHerbicide && (rawStatus === 'Unaffected' || !rawStatus)) {
        rawStatus = 'Healthy';
      }
      const rawSpecies = w.species || w.name || 'Unknown';
      const cleanSpecies = isHerbicide ? rawSpecies : getNormalizedTargetName(rawSpecies);
      
      // Stage-appropriate metrics (Growth-Stage Filtering)
      const isReproductiveMetric = ['fruit count', 'marketable yield', 'unmarketable yield'].includes(cleanSpecies.toLowerCase());
      let isEarlyStage = false;
      const bbchVal = aiData.bbchStage || '';
      const m = bbchVal.match(/BBCH\s*(\d+)/i);
      const bbchNum = m ? parseInt(m[1], 10) : null;
      if (bbchNum !== null) {
        if (bbchNum < 60) isEarlyStage = true;
      } else if (Number(daa) < 30) {
        isEarlyStage = true;
      }

      if (!isHerbicide && isReproductiveMetric && isEarlyStage) {
        return {
          species: cleanSpecies,
          cover: 0,
          status: 'N/A',
          growthStage: '',
          notes: 'Not applicable at early growth stage',
          confidence: null,
          detectedCount: 0,
          incidence: 0.0
        };
      }

      const coverVal = typeof w.cover === 'number' ? w.cover : parseFloat(w.cover || w.value || 0);
      const det = isDetectedVal(coverVal, rawStatus) ? 1 : 0;
      return {
        species: cleanSpecies,
        cover: coverVal,
        status: rawStatus,
        growthStage: String(w.growthStage || '').trim(),
        notes: String(w.notes || '').trim(),
        confidence: w.confidence !== undefined ? parseInt(w.confidence, 10) : null,
        detectedCount: det,
        incidence: det ? 100.0 : 0.0
      };
    });

    // Calculate primary values
    const primaryObsField = getPrimaryObservationField(trialCat);
    let primaryValue = 0;
    
    if (isHerbicide) {
      primaryValue = typeof aiData.totalWeedCover === 'number'
        ? aiData.totalWeedCover
        : normalizedWeeds.reduce((sum, w) => sum + (w.cover || 0), 0);
    } else {
      if (aiData.metrics && typeof aiData.metrics[primaryObsField] === 'number') {
        primaryValue = aiData.metrics[primaryObsField];
      } else if (aiData.metrics && aiData.metrics[primaryObsField] !== undefined) {
        primaryValue = parseFloat(aiData.metrics[primaryObsField] || 0);
      } else {
        primaryValue = normalizedWeeds.reduce((sum, w) => sum + (w.cover || 0), 0);
      }
    }

    const deduplicateText = (existingText, newText) => {
      if (!existingText) return newText || '';
      if (!newText) return existingText || '';
      const splitSentences = (txt) => {
        return txt.split(/[.|;\n]/).map(s => s.trim()).filter(s => s.length > 5);
      };
      const getWordSet = (str) => new Set(str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/).filter(Boolean));
      const getSimilarity = (s1, s2) => {
        const set1 = getWordSet(s1);
        const set2 = getWordSet(s2);
        if (set1.size === 0 || set2.size === 0) return 0;
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        return intersection.size / Math.min(set1.size, set2.size);
      };
      
      const existingParts = splitSentences(existingText);
      const newParts = splitSentences(newText);
      const combined = [...existingParts];
      newParts.forEach(part => {
        const words = part.split(/\s+/).filter(Boolean).length;
        const threshold = words < 10 || part.length < 50 ? 0.75 : 0.65;
        const isDuplicate = combined.some(existingPart => {
          const sim = getSimilarity(existingPart, part);
          return sim > threshold;
        });
        if (!isDuplicate) {
          combined.push(part);
        }
      });
      return combined.join('. ') + (combined.length > 0 && !combined[combined.length - 1].endsWith('.') ? '.' : '');
    };

    const aiNotes = [];
    if (aiData.efficacyAssessment || aiData.overallAssessment) aiNotes.push(aiData.efficacyAssessment || aiData.overallAssessment);
    if (aiData.notes) aiNotes.push(aiData.notes);

    const newObs = {
      date: obsDate || toDatetimeLocal(new Date()),
      daa: Number(daa),
      weedCover: primaryValue, // mirrored for backwards compatibility
      weedDetails: normalizedWeeds.length > 0 ? normalizedWeeds : [{ species: isHerbicide ? 'No weeds detected' : `No ${catConfig.targetLabel}s detected`, cover: 0, status: '', notes: aiData.notes || 'AI-analyzed', confidence: null, detectedCount: 0, incidence: 0.0 }],
      notes: aiNotes.length > 0 ? deduplicateText('', aiNotes.join('. ')) : `AI-analyzed on ${formatDateTime(new Date())}`,
      aiConfidence: aiData.confidence || 'MEDIUM',
      aiEfficacyAssessment: aiData.efficacyAssessment || aiData.overallAssessment || '',
      competitionLevel: aiData.competitionLevel || '',
      status: 'Analyzed',
      source: 'AI',
      photoUrl: photoUrl || '',
      bbchStage: aiData.bbchStage || ''
    };

    // Save all dynamic metrics fields directly into the observation
    if (aiData.metrics && typeof aiData.metrics === 'object') {
      Object.entries(aiData.metrics).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;
        const num = parseFloat(v);
        if (!isNaN(num)) {
          newObs[k] = num;
        }
      });
    }
    // ensure primary metric field has its value
    newObs[primaryObsField] = primaryValue;

    const existingIdx = efficacyData.findIndex(o => o.daa === Number(daa));
    if (existingIdx >= 0) {
      const existing = efficacyData[existingIdx];
      const count = Number(existing.sampleCount || 1);
      
      const mergedPrimaryValue = parseFloat(((parseFloat(existing.weedCover || 0) * count) + primaryValue) / (count + 1));
      
      const mergedObs = {
        ...existing,
        sampleCount: count + 1,
        weedCover: Number(mergedPrimaryValue.toFixed(2)),
      };

      // Average all dynamic metrics
      if (aiData.metrics && typeof aiData.metrics === 'object') {
        Object.entries(aiData.metrics).forEach(([k, v]) => {
          if (v === null || v === undefined || v === '') return;
          const num = parseFloat(v);
          if (!isNaN(num)) {
            const oldVal = parseFloat(existing[k]);
            if (!isNaN(oldVal)) {
              mergedObs[k] = Number((((oldVal * count) + num) / (count + 1)).toFixed(2));
            } else {
              mergedObs[k] = num;
            }
          }
        });
      }
      mergedObs[primaryObsField] = mergedObs.weedCover;

      // Synthesize notes with AI
      if (newObs.notes || existing.notes) {
        const combined = [existing.notes, newObs.notes].filter(Boolean).join(' | ');
        try {
          const prompt = `You are a professional agricultural scientist.
We are merging observations from multiple plant scans/samples at DAA ${daa} for Treatment: ${latestTrial.FormulationName || latestTrial.FormulationId || 'Unknown'} (Category: ${trialCat}, Crop: ${latestTrial.CropCrop || latestTrial.Crop || 'Crop'}).
Here are the plant-level raw notes:
${combined}

Please synthesize these raw notes into a single, cohesive, publication-grade scientific summary of 1-2 sentences.
Rules:
1. Deduplicate similar observations.
2. Reconcile any contradictions (e.g. if some plants have minor pests but others are healthy, state 'Minor pest activity was observed on some plants, while the majority of foliage appeared healthy').
3. Keep it strictly factual, professional, and concise. Do NOT give advice, recommendations, or monitoring schedules.
4. Do NOT include markdown headers or bullet points.`;
          
          const synth = await generateTextWithAI(prompt, 'You are a professional agronomist.');
          if (synth && synth.trim()) {
            mergedObs.notes = synth.trim();
          } else {
            mergedObs.notes = deduplicateText(existing.notes, newObs.notes);
          }
        } catch (e) {
          console.warn('Failed to synthesize notes:', e);
          mergedObs.notes = deduplicateText(existing.notes, newObs.notes);
        }
      }

      // Synthesize efficacy assessment with AI
      if (newObs.aiEfficacyAssessment || existing.aiEfficacyAssessment) {
        const combined = [existing.aiEfficacyAssessment, newObs.aiEfficacyAssessment].filter(Boolean).join(' | ');
        try {
          const prompt = `You are a professional agricultural scientist.
We are merging observations from multiple plant scans/samples at DAA ${daa} for Treatment: ${latestTrial.FormulationName || latestTrial.FormulationId || 'Unknown'} (Category: ${trialCat}, Crop: ${latestTrial.CropCrop || latestTrial.Crop || 'Crop'}).
Here are the plant-level efficacy assessments:
${combined}

Please synthesize these assessments into a single, cohesive, publication-grade scientific summary of 1-2 sentences.
Rules:
1. Deduplicate similar observations.
2. Reconcile any contradictions.
3. Keep it strictly factual, professional, and concise. Do NOT give advice, recommendations, or monitoring schedules.
4. Do NOT include markdown headers or bullet points.`;
          
          const synth = await generateTextWithAI(prompt, 'You are a professional agronomist.');
          if (synth && synth.trim()) {
            mergedObs.aiEfficacyAssessment = synth.trim();
          } else {
            mergedObs.aiEfficacyAssessment = deduplicateText(existing.aiEfficacyAssessment, newObs.aiEfficacyAssessment);
          }
        } catch (e) {
          console.warn('Failed to synthesize efficacy assessment:', e);
          mergedObs.aiEfficacyAssessment = deduplicateText(existing.aiEfficacyAssessment, newObs.aiEfficacyAssessment);
        }
      }

      // Merge photoUrls (comma separated list)
      if (photoUrl) {
        const urls = existing.photoUrl ? existing.photoUrl.split(',').map(u => u.trim()).filter(Boolean) : [];
        if (!urls.includes(photoUrl)) {
          urls.push(photoUrl);
        }
        mergedObs.photoUrl = urls.join(', ');
      }

      // Merge targets/weeds details list with clean normalization match
      const mergedWeedDetails = [...(existing.weedDetails || [])];
      normalizedWeeds.forEach(newW => {
        const matchIdx = mergedWeedDetails.findIndex(w => {
          const wName = getNormalizedTargetName(w.species || w.name).toLowerCase();
          const newName = getNormalizedTargetName(newW.species || newW.name).toLowerCase();
          return wName === newName;
        });
        if (matchIdx >= 0) {
          const oldW = mergedWeedDetails[matchIdx];
          const oldConf = oldW.confidence !== undefined && oldW.confidence !== null ? parseFloat(oldW.confidence) : null;
          const newConf = newW.confidence !== undefined && newW.confidence !== null ? parseFloat(newW.confidence) : null;
          let mergedConf = null;
          if (oldConf !== null && newConf !== null) {
            mergedConf = Math.round(((oldConf * count) + newConf) / (count + 1));
          } else {
            mergedConf = newConf !== null ? newConf : oldConf;
          }
          
          const oldDetCount = oldW.detectedCount !== undefined ? parseInt(oldW.detectedCount, 10) : (isDetectedVal(oldW.cover || 0, oldW.status) ? count : 0);
          const newDetCount = isDetectedVal(newW.cover, newW.status) ? 1 : 0;
          const mergedDetCount = oldDetCount + newDetCount;
          const mergedIncidence = parseFloat((mergedDetCount / (count + 1) * 100).toFixed(1));

          mergedWeedDetails[matchIdx] = {
            ...oldW,
            species: getNormalizedTargetName(oldW.species || oldW.name),
            status: newW.status === 'N/A' || oldW.status === 'N/A' ? 'N/A' : (newW.status || oldW.status),
            cover: newW.status === 'N/A' || oldW.status === 'N/A' ? 0 : Number((((parseFloat(oldW.cover || 0) * count) + newW.cover) / (count + 1)).toFixed(2)),
            confidence: newW.status === 'N/A' || oldW.status === 'N/A' ? null : mergedConf,
            detectedCount: mergedDetCount,
            incidence: mergedIncidence,
            notes: deduplicateText(oldW.notes, newW.notes)
          };
        } else {
          const det = isDetectedVal(newW.cover, newW.status) ? 1 : 0;
          mergedWeedDetails.push({
            ...newW,
            species: getNormalizedTargetName(newW.species || newW.name),
            detectedCount: det,
            incidence: parseFloat((det / (count + 1) * 100).toFixed(1))
          });
        }
      });
      mergedObs.weedDetails = mergedWeedDetails;

      efficacyData[existingIdx] = mergedObs;
    } else {
      newObs.sampleCount = 1;
      efficacyData.push(newObs);
    }
    efficacyData.sort((a, b) => a.daa - b.daa);

    let resultRating = 'Unrated';
    if (efficacyData.length > 0) {
      const latestObs = [...efficacyData].sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
      const remainingVal = Number(getObservationPrimaryValue(trialCat, latestObs) ?? 0);
      if (isHerbicide || trialCat === 'fungicide' || trialCat === 'pesticide') {
        if (remainingVal <= 10) resultRating = 'Excellent';
        else if (remainingVal <= 25) resultRating = 'Good';
        else if (remainingVal <= 50) resultRating = 'Fair';
        else resultRating = 'Poor';
      } else {
        resultRating = 'Pending';
      }
    }

    const updated = {
      ...latestTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      WeedSpecies: normalizedWeeds.length > 0 ? normalizedWeeds.map(w => w.species).join(', ') : (isHerbicide ? 'No weeds detected' : `No ${catConfig.targetLabel}s detected`),
    };

    updateState({ trials: state.trials.map(t => t.ID === updated.ID ? updated : t) });
    if (selectedSubTrialId === latestTrial.ID) setSelectedSubTrialId(updated.ID);

    try {
      await updateTrial({
        ID: latestTrial.ID,
        EfficacyDataJSON: updated.EfficacyDataJSON,
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies
      }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis and observation logged!', type: 'success' } }));
    } catch (e) {
      console.error(e);
    }
  };

  const analyzeWeedCoverFromPixels = useCallback((imageDataUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 800;
          let w = img.width, h = img.height;
          if (w > maxDim) { h = (h / w) * maxDim; w = maxDim; }
          if (h > maxDim) { w = (w / h) * maxDim; h = maxDim; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          let total = 0, green = 0, brown = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            total++;
            const gli = (2*g - r - b) / (2*g + r + b + 1);
            if (gli > 0.05) { green++; }
            else {
              const max = Math.max(r,g,b), min = Math.min(r,g,b), diff = max - min;
              const h2 = max === 0 ? 0 : max === r ? 60*((g-b)/diff%6) : max === g ? 60*((b-r)/diff+2) : 60*((r-g)/diff+4);
              const s = max === 0 ? 0 : (diff/max)*100, v = max/2.55;
              if (h2 >= 20 && h2 <= 55 && s > 12 && v > 20 && v < 85) brown++;
            }
          }
          const cover = Math.round(((green + brown) / total) * 100);
          resolve({ cover, greenPct: Math.round((green/total)*100), brownPct: Math.round((brown/total)*100), confidence: Math.min(95, 60 + Math.round(total/2000)), source: 'pixel' });
        } catch(e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataUrl;
    });
  }, []);

  const detectWeedCoverAI = useCallback(async (imageUrl) => {
    if (weedIdResult && weedIdResult.length > 0) {
      const totalCover = weedIdResult.reduce((sum, w) => sum + (Number(w.cover) || 0), 0);
      const avgConf = Math.round((weedIdResult.reduce((sum, w) => sum + (Number(w.confidence) || 0), 0) / weedIdResult.length) * 100);
      const result = {
        cover: totalCover,
        confidence: avgConf || 85,
        source: 'AI (Weed ID Sum)',
        greenPct: totalCover,
        brownPct: 0
      };
      setCoverDetectResult(result);
      return result;
    }
    setDetectingCover(true);
    setCoverDetectResult(null);
    try {
      const rawApiKey = state.settings?.geminiApiKey || (state.settings?.geminiApiKeys || state.settings?.apiKeys || [])[0];
      const apiKey = typeof rawApiKey === 'object' ? rawApiKey?.key : rawApiKey;
      let dataUrl = imageUrl;
      if (typeof imageUrl === 'string' && !imageUrl.startsWith('data:')) {
        const blob = await fetch(imageUrl, { mode: 'cors' }).then(r => r.blob());
        dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      }
      const pixelResult = await analyzeWeedCoverFromPixels(dataUrl);
      const geminiKeys = getAPIKeys('gemini');

      if (geminiKeys.length) {
        try {
          const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            const models = ['gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];
            let successResult = null;
            for (const model of models) {
              for (const key of geminiKeys) {
                try {
                  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [
                      { text: config.aiPhotoPrompt },
                      { inlineData: { mimeType, data: base64 } }
                    ]}] })
                  });
                  if (!resp.ok) continue;
                  const d = await resp.json();
                  const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  const m2 = txt.match(/\d+/);
                  if (m2) {
                    const cover = Math.min(100, Math.max(0, parseInt(m2[0])));
                    successResult = { cover, confidence: 90, source: `AI (${model})`, greenPct: pixelResult.greenPct, brownPct: pixelResult.brownPct };
                    break;
                  }
                } catch (err) {
                  console.warn(`Cover detection failed with ${model}:`, err.message);
                }
              }
              if (successResult) break;
            }
            if (successResult) {
              setCoverDetectResult(successResult);
              return successResult;
            }
          }
        } catch(aiErr) {
          console.warn('Gemini vision failed, using pixel fallback:', aiErr.message);
        }
      }
      setCoverDetectResult(pixelResult);
      return pixelResult;
    } catch(e) {
      console.error(e);
      return null;
    } finally {
      setDetectingCover(false);
    }
  }, [state.settings, analyzeWeedCoverFromPixels]);

  const getClimateRisks = useCallback((temp, wind, rain) => {
    const risks = [];
    const t = parseFloat(temp), w = parseFloat(wind), r = parseFloat(rain);
    if (isFinite(t)) {
      if (t > 30) risks.push({ type: 'warning', msg: `Heat stress risk (${t}°C > 30°C) — may reduce efficacy.` });
      if (t < 5)  risks.push({ type: 'info',    msg: `Cold conditions (${t}°C) — slow herbicide uptake.` });
    }
    if (isFinite(w)) {
      if (w > 15) risks.push({ type: 'danger',  msg: `High wind (${w} km/h) — severe spray drift risk.` });
      else if (w > 10) risks.push({ type: 'warning', msg: `Moderate wind (${w} km/h) — use low-drift nozzles.` });
    }
    if (isFinite(r) && r > 0) risks.push({ type: 'danger', msg: `Rain (${r} mm) — wash-off risk if not rain-fast.` });
    return risks;
  }, []);

  const fetchObsWeather = useCallback(async (date) => {
    if (!activeSubTrial?.Lat || !activeSubTrial?.Lon) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeSubTrial.Lat}&longitude=${activeSubTrial.Lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
      const r = await fetch(url);
      const d = await r.json();
      const c = d.current;
      if (c) {
        setVisitForm(prev => ({ ...prev,
          weatherTemp: c.temperature_2m ?? prev.weatherTemp,
          weatherHumidity: c.relative_humidity_2m ?? prev.weatherHumidity,
          weatherWind: c.wind_speed_10m ?? prev.weatherWind,
          weatherRain: c.precipitation ?? prev.weatherRain,
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather synced for observation', type: 'success' } }));
      }
    } catch(e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather fetch failed', type: 'info' } }));
    }
  }, [activeSubTrial]);

  const identifyWeedFromPhoto = useCallback(async (imageDataUrl) => {
    setWeedIdLoading(true);
    setWeedIdResult(null);
    try {
      const weeds = await identifyWeedFromPhotoService(imageDataUrl, activeCategory);
      setWeedIdResult(weeds);
      
      // Sync with coverDetectResult to avoid contradiction
      const totalCover = weeds.reduce((sum, w) => sum + (Number(w.cover) || 0), 0);
      const avgConf = Math.round((weeds.reduce((sum, w) => sum + (Number(w.confidence) || 0), 0) / (weeds.length || 1)) * 100);
      setCoverDetectResult({
        cover: totalCover,
        confidence: avgConf || 85,
        source: 'AI (Weed ID Sum)',
        greenPct: totalCover,
        brownPct: 0
      });
    } catch (e) {
      console.error('Weed ID failed:', e);
      setWeedIdResult([{ name: 'Unknown', commonName: e.message || 'No response from AI', cover: 0, growthStage: '', confidence: 0.5 }]);
    } finally {
      setWeedIdLoading(false);
    }
  }, [activeCategory, updateState]);

  const handleCropExistingPhoto = (idx, currentSrc) => {
    if (isViewer) {
      toast('Viewer role cannot crop photos.', 'error');
      return;
    }
    openCropperFor(currentSrc, async (croppedUrl) => {
      const photos = safeJsonParse(activeSubTrial.PhotoURLs, []);
      photos[idx] = { ...photos[idx], fileData: croppedUrl, url: undefined };
      const updated = { ...activeSubTrial, PhotoURLs: JSON.stringify(photos) };
      updateState({ trials: state.trials.map(t => t.ID === updated.ID ? updated : t) });
      if (selectedSubTrialId === activeSubTrial.ID) setSelectedSubTrialId(updated.ID);
      try { await updateTrial({ ID: updated.ID, PhotoURLs: updated.PhotoURLs }, getAppState); } catch (e) {}
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo cropped & saved', type: 'success' } }));
    });
  };

  const handleDeletePhoto = async (idx) => {
    if (isViewer) {
      toast('Viewer role cannot delete photos.', 'error');
      return;
    }
    if (!activeSubTrial || !window.confirm('Delete this photo?')) return;
    const photos = safeJsonParse(activeSubTrial.PhotoURLs, []);
    const activePhotos = photos.filter(p => !p.deleted);
    const deletedPhoto = activePhotos[idx];
    if (deletedPhoto) {
      const rawIdx = photos.indexOf(deletedPhoto);
      if (rawIdx !== -1) {
        if (typeof photos[rawIdx] === 'string') {
          const isDrive = photos[rawIdx].includes('drive.google.com');
          photos[rawIdx] = {
            [isDrive ? 'url' : 'fileData']: photos[rawIdx],
            deleted: true
          };
        } else {
          photos[rawIdx].deleted = true;
        }
      }
    }

    let efficacyData = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, []));
    if (deletedPhoto) {
      const deletedUrl = deletedPhoto.fileData || deletedPhoto.url || deletedPhoto;
      if (deletedUrl) {
        efficacyData = efficacyData.filter(obs => obs.photoUrl !== deletedUrl);
      }
    }

    const resultRating = 'Pending';
    const updated = {
      ...activeSubTrial,
      PhotoURLs: JSON.stringify(photos),
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      AISummariesJSON: '{}'
    };
    updateState({ trials: state.trials.map(t => t.ID === updated.ID ? updated : t) });
    if (selectedSubTrialId === activeSubTrial.ID) setSelectedSubTrialId(updated.ID);
    try {
      await updateTrial({
        ID: updated.ID,
        PhotoURLs: updated.PhotoURLs,
        EfficacyDataJSON: updated.EfficacyDataJSON,
        Result: updated.Result,
        AISummariesJSON: '{}'
      }, getAppState);
    } catch (e) {}
  };
  
  const buildPrintableTrialUrl = (trial) => {
    const appBase = window.location.origin + window.location.pathname;
    const settings = state.settings;
    if (settings?.firebaseEnabled && settings?.firebaseConfig?.apiKey) {
      const config = settings.firebaseConfig;
      const params = new URLSearchParams({
        apiKey: config.apiKey || '',
        authDomain: config.authDomain || '',
        projectId: config.projectId || '',
        storageBucket: config.storageBucket || '',
        messagingSenderId: config.messagingSenderId || '',
        appId: config.appId || ''
      }).toString();
      return `${appBase}#/live/${trial.ID}?${params}`;
    }
    return `${appBase}#/live/${trial.ID}`;
  };

  const buildQrText = (trial, mode) => {
    if (mode === 'online') {
      return buildPrintableTrialUrl(trial);
    }
    const fields = state.settings?.qrOfflineFields || ['FormulationName','Dosage','WeedSpecies','Date','Location'];
    const fmt = (d) => formatDate(d);
    const lines = [`MIKLENS-TRIAL`];
    lines.push(`ID:${trial.ID}`);
    if (fields.includes('FormulationName') && trial.FormulationName) lines.push(`Product:${trial.FormulationName}`);
    if (fields.includes('InvestigatorName') && trial.InvestigatorName) lines.push(`Inv:${trial.InvestigatorName}`);
    if (fields.includes('Date') && trial.Date) lines.push(`Date:${fmt(trial.Date)}`);
    if (fields.includes('Dosage') && trial.Dosage) lines.push(`Dose:${trial.Dosage}`);
    if (fields.includes('Location') && trial.Location) lines.push(`Loc:${trial.Location}`);
    if (fields.includes('WeedSpecies') && trial.WeedSpecies) lines.push(`Weeds:${trial.WeedSpecies}`);
    if (fields.includes('Result') && trial.Result) lines.push(`Result:${trial.Result}`);
    if (trial.Replication) lines.push(`Rep:${trial.Replication}`);
    return lines.join('\n');
  };

  const generateQR = async (trial, mode) => {
    if (!trial || !qrCanvasRef.current) return;
    setQrGenerated(false);
    const resolvedMode = mode || qrMode;
    const qrText = buildQrText(trial, resolvedMode);
    try {
      await QRCodeLib.toCanvas(qrCanvasRef.current, qrText, {
        width: 220,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
        errorCorrectionLevel: 'H'
      });
      setQrGenerated(true);
    } catch (e) {
      console.error('QR gen error', e);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'QR generation failed: ' + e.message, type: 'error' } }));
    }
  };

  const downloadQR = () => {
    if (!qrCanvasRef.current) return;
    const a = document.createElement('a');
    a.download = `QR_${activeSubTrial?.FormulationName || 'subtrial'}_${qrMode}.png`;
    a.href = qrCanvasRef.current.toDataURL('image/png');
    a.click();
  };

  const handleAnalyzeSinglePhoto = async (photoSrc, photoDate) => {
    if (isViewer) {
      toast('Viewer role cannot analyze photos.', 'error');
      return;
    }
    if (!activeSubTrial || aiGenRunning) return;
    setAiGenRunning(true);
    const daa = calculateDAA(photoDate, activeSubTrial.Date);

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Analyzing photo with AI (DAA ${daa})...`, type: 'info' } }));
    try {
      const result = await analyzePhoto(photoSrc, {
        treatment: activeSubTrial.FormulationName,
        daa,
        rep: activeSubTrial.Replication || 1
      }, (msg) => window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } })));

      if (result.success) {
        await createObservationFromAI(activeSubTrial, daa, result.data, photoDate, photoSrc);
        const detectedCount = activeCategory === 'herbicide' ? (result.data.weeds?.length || 0) : (result.data.targets?.length || 0);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI complete! Detected ${detectedCount} ${config.targetLabel.toLowerCase()}(s) at DAA ${daa}. Observation saved.`, type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + (result.error || 'Unknown error'), type: 'error' } }));
      }
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis error: ' + e.message, type: 'error' } }));
    } finally {
      setAiGenRunning(false);
    }
  };

  const generateAISummary = async (trial = null) => {
    if (isViewer) {
      toast('Viewer role cannot generate AI summaries.', 'error');
      return;
    }
    const targetTrial = trial || activeSubTrial;
    if (!targetTrial) return;
    const efficacyData = validateEfficacyData(safeJsonParse(targetTrial.EfficacyDataJSON, []));
    if (efficacyData.length < 2) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Need at least 2 observations to generate summary', type: 'warning' } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating AI trial summary...', type: 'info' } }));

    const sorted = [...efficacyData].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseline = sorted[0];
    const latest = sorted[sorted.length - 1];
    
    const baseCover = parseFloat(getObservationPrimaryValue(activeCategory, baseline) ?? 100) || 100;
    const finalCover = parseFloat(getObservationPrimaryValue(activeCategory, latest) ?? 0) || 0;
    const wce = baseCover > 0 ? calculateEfficacy(activeCategory, finalCover, baseCover) : 0;

    const allSpecies = new Set();
    const speciesControlStatus = {};
    sorted.forEach(obs => {
      (obs.weedDetails || []).forEach(wd => {
        allSpecies.add(wd.species);
        if (!speciesControlStatus[wd.species]) {
          speciesControlStatus[wd.species] = { initial: wd.cover, final: wd.cover, status: wd.status };
        } else {
          speciesControlStatus[wd.species].final = wd.cover;
          speciesControlStatus[wd.species].status = wd.status;
        }
      });
    });

    const daysTracked = latest.daa - baseline.daa;
    const controlRating = wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';

    let summaryText = `**${activeCategory === 'herbicide' ? 'Weed Control Summary' : config.primaryMetric.label + ' Summary'}**\n`;
    summaryText += `Treatment: ${targetTrial.FormulationName || 'Unknown'}\n`;
    summaryText += `Duration: ${daysTracked} days (DAA ${baseline.daa} to ${latest.daa})\n`;
    summaryText += `Initial ${activeCategory === 'herbicide' ? 'Cover' : config.primaryMetric.key}: ${baseCover.toFixed(1)}${config.primaryMetric.unit || ''} → Final: ${finalCover.toFixed(1)}${config.primaryMetric.unit || ''}\n`;
    summaryText += `${config.primaryMetric.label} (${config.primaryMetric.key}): ${wce.toFixed(1)}% - ${controlRating} Control\n\n`;

    summaryText += `**${config.targetLabel}s Observed:** ${Array.from(allSpecies).join(', ') || 'None identified'}\n`;
    summaryText += `**Control Status by ${config.targetLabel}:**\n`;
    Object.entries(speciesControlStatus).forEach(([sp, data]) => {
      const spWCE = data.initial > 0 ? calculateEfficacy(activeCategory, data.final, data.initial).toFixed(0) : 0;
      summaryText += `- ${sp}: ${data.initial}${config.primaryMetric.unit || ''} → ${data.final}${config.primaryMetric.unit || ''} (Efficacy: ${spWCE}%, Status: ${data.status || 'Unknown'})\n`;
    });

    const updated = { ...targetTrial, Conclusion: summaryText };
    updateState({ trials: state.trials.map(t => t.ID === updated.ID ? updated : t) });
    if (selectedSubTrialId === updated.ID) setSelectedSubTrialId(updated.ID);

    try {
      await updateTrial({ ID: updated.ID, Conclusion: summaryText }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI summary generated!', type: 'success' } }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickPhotoCapture = (dataUrl) => {
    if (isViewer) {
      toast('Viewer role cannot capture photos.', 'error');
      return;
    }
    const targetTrial = quickActionTrialRef.current || activeSubTrial;
    if (!targetTrial) return;
    quickActionTrialRef.current = null;
    setIsCameraOpen(false);
    if (cameraMode === 'harvest') {
      openCropperFor(dataUrl, async (url) => {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Adding harvest photo...', type: 'info' } }));
        // Compress harvest photo before upload/storage
        try { url = await compressImage(url, 600, 0.7); } catch (e) { console.warn('Harvest compress failed:', e); }
        let finalUrl = url;
        if (navigator.onLine && getAppState().isOnline !== false) {
          try {
            const userName = user?.displayName || user?.email || 'User';
            const folderPath = [activeCategory, userName, 'Harvest', targetTrial.FormulationName || 'Trial'];
            const fileName = `harvest_${targetTrial.ID}_${Date.now()}.jpg`;
            const uploadResult = await uploadPhoto({
              trialId: targetTrial.ID,
              fileData: url,
              mimeType: 'image/jpeg',
              fileName,
              isWeed: false,
              label: 'Harvest Photo',
              date: new Date().toISOString().split('T')[0],
              folderPath
            }, getAppState);
            if (uploadResult && !uploadResult._errType) {
              finalUrl = uploadResult.url || uploadResult.fileUrl || url;
            }
          } catch (err) {
            console.warn('Harvest photo upload failed, using local URL:', err.message);
          }
        }
        setHarvestForm(prev => ({
          ...prev,
          photos: [...(prev.photos || []), finalUrl]
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Harvest photo added successfully!', type: 'success' } }));
      });
    } else {
      openCropperFor(dataUrl, (url) => promptPhotoDate(url, targetTrial));
    }
  };

  const handleQuickFileUpload = async (e) => {
    if (isViewer) {
      toast('Viewer role cannot upload files.', 'error');
      return;
    }
    const file = e.target.files?.[0];
    const targetTrial = quickActionTrialRef.current || activeSubTrial;
    if (!file || !targetTrial) return;
    quickActionTrialRef.current = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      e.target.value = '';
      if (cameraMode === 'harvest') {
        openCropperFor(ev.target.result, async (url) => {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Adding harvest photo...', type: 'info' } }));
          // Compress harvest photo before upload/storage
          try { url = await compressImage(url, 600, 0.7); } catch (e) { console.warn('Harvest compress failed:', e); }
          let finalUrl = url;
          if (navigator.onLine && getAppState().isOnline !== false) {
            try {
              const userName = user?.displayName || user?.email || 'User';
              const folderPath = [activeCategory, userName, 'Harvest', targetTrial.FormulationName || 'Trial'];
              const fileName = `harvest_${targetTrial.ID}_${Date.now()}.jpg`;
              const uploadResult = await uploadPhoto({
                trialId: targetTrial.ID,
                fileData: url,
                mimeType: 'image/jpeg',
                fileName,
                isWeed: false,
                label: 'Harvest Photo',
                date: new Date().toISOString().split('T')[0],
                folderPath
              }, getAppState);
              if (uploadResult && !uploadResult._errType) {
                finalUrl = uploadResult.url || uploadResult.fileUrl || url;
              }
            } catch (err) {
              console.warn('Harvest photo upload failed, using local URL:', err.message);
            }
          }
          setHarvestForm(prev => ({
            ...prev,
            photos: [...(prev.photos || []), finalUrl]
          }));
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Harvest photo added successfully!', type: 'success' } }));
        });
      } else {
        openCropperFor(ev.target.result, (url) => promptPhotoDate(url, targetTrial));
      }
    };
    reader.readAsDataURL(file);
  };

  // Initialise Leaflet Map
  useEffect(() => {
    if (!L || !mapContainerRef.current) return;

    // If a map instance already exists, but the container was unmounted/re-created in DOM,
    // we must clean up the old instance to prevent holding onto a detached DOM element.
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { maxZoom: 22 }).setView([20.5937, 78.9629], 5);
      L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 22,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
      }).addTo(mapRef.current);

      markersGroupRef.current = L.layerGroup().addTo(mapRef.current);

      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 400);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [dashboardTab, activeProjectId, selectedSubTrialId, viewMode]);

  // Draw sub-trial markers on Map
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();
    const coords = [];

    subTrials.forEach(st => {
      const lat = parseFloat(st.Lat);
      const lon = parseFloat(st.Lon);
      if (isNaN(lat) || isNaN(lon)) return;

      coords.push([lat, lon]);

      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'custom-subtrial-pin',
          html: `<div class="w-8 h-8 rounded-full ${theme.bgSecondary} border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow-lg ${theme.hoverBg} transition-colors">${st.Replication || 'ST'}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      });

      marker.bindPopup(`
        <div class="p-2.5 font-sans text-xs min-w-[140px]">
          <h4 class="font-bold text-slate-800">${st.FormulationName || 'Untreated Spot'}</h4>
          <p class="text-slate-500 font-medium mt-0.5">Rep: ${st.Replication} | Plot: ${st.PlotNumber || 'N/A'}</p>
          <p class="text-slate-400 mt-1">${lat.toFixed(6)}, ${lon.toFixed(6)}</p>
          <button onclick="window.dispatchEvent(new CustomEvent('app:select-subtrial', {detail: '${st.ID}'}))" class="mt-2 w-full px-2 py-1 ${theme.bg} text-white font-bold rounded text-[10px] text-center border-none cursor-pointer">Inspect Spot</button>
        </div>
      `);

      marker.addTo(markersGroupRef.current);
    });

    if (coords.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(coords).pad(0.25));
    }
  }, [subTrials, dashboardTab, activeProjectId, selectedSubTrialId, viewMode]);

  // Listen for popup select event
  useEffect(() => {
    const handleSelectST = (e) => {
      setSelectedSubTrialId(e.detail);
    };
    window.addEventListener('app:select-subtrial', handleSelectST);
    return () => window.removeEventListener('app:select-subtrial', handleSelectST);
  }, []);

  const handleARMImportClick = () => {
    armFileInputRef.current?.click();
  };

  const handleARMImportChange = useCallback(async (e) => {
    if (isViewer) {
      toast('Viewer role cannot import ARM files.', 'error');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const csvText = evt.target?.result;
      try {
        const importedTrials = importARMCSV(csvText);
        if (importedTrials.length === 0) {
          throw new Error('No valid trials found in the CSV.');
        }

        // Map imported trials to large-scale subtrials
        const mappedTrials = importedTrials.map(t => {
          const formMatch = state.formulations?.find(f => f.Name.toLowerCase() === t.FormulationName.toLowerCase());
          return {
            ...emptySubTrialForm(),
            ...t,
            ProjectID: activeProjectId,
            FormulationID: formMatch?.ID || '',
            IsLive: true,
            CreatedAt: new Date().toISOString(),
            UpdatedAt: new Date().toISOString(),
            Category: activeCategory
          };
        });

        // Add them to database and state
        await Promise.all(mappedTrials.map(t => addTrial(t, getAppState)));
        updateState({ trials: [...(state.trials || []), ...mappedTrials] });

        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Imported ${mappedTrials.length} trials from ARM CSV!`, type: 'success' } }));
      } catch (err) {
        console.error(err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to import ARM CSV: ' + err.message, type: 'error' } }));
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // clear input
  }, [activeProjectId, activeCategory, state.formulations, state.trials, updateState, getAppState]);

  // Fetch coordinates
  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Geolocation not supported by this browser.', type: 'error' } }));
      return;
    }
    setGpsFetching(true);
    setGpsAccuracy(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setSubTrialForm(prev => ({ ...prev, Lat: latitude.toFixed(8), Lon: longitude.toFixed(8) }));
        setGpsAccuracy(accuracy);
        setGpsFetching(false);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `GPS coordinates updated! (Accuracy: ±${accuracy.toFixed(1)}m)`, type: 'success' } }));
      },
      (err) => {
        setGpsFetching(false);
        let errorMsg = 'Unable to retrieve location.';
        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = 'GPS Permission Denied. Please enable location services.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMsg = 'GPS Position Unavailable. Try moving outside or checking settings.';
        } else if (err.code === err.TIMEOUT) {
          errorMsg = 'GPS Timeout. Trying again might help.';
        }
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: errorMsg, type: 'error' } }));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );
  };

  // Weather fetch for sub-trial creation
  const fetchWeather = async () => {
    const lat = parseFloat(subTrialForm.Lat);
    const lon = parseFloat(subTrialForm.Lon);
    if (isNaN(lat) || isNaN(lon)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Enter GPS coordinates to fetch weather.', type: 'error' } }));
      return;
    }
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
      const d = await res.json();
      const c = d.current;
      
      const soil = await fetchSoilData(lat, lon);
      
      setSubTrialForm(prev => {
        const updated = { ...prev };
        if (c) {
          updated.Temperature = c.temperature_2m?.toString() || '';
          updated.Humidity = c.relative_humidity_2m?.toString() || '';
          updated.Windspeed = c.wind_speed_10m?.toString() || '';
          updated.Rain = c.precipitation?.toString() || '';
        }
        if (soil) {
          updated.SoilPH = soil.soilPH?.toString() || '';
          updated.SoilClay = soil.soilClay?.toString() || '';
          updated.SoilSand = soil.soilSand?.toString() || '';
          updated.SoilOC = soil.soilOC?.toString() || '';
          updated.SoilTexture = soil.soilTexture || '';
        }
        return updated;
      });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather & soil parameters synced!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather & soil sync failed.', type: 'error' } }));
    }
  };

  // Weather fetch for visits
  const fetchVisitWeather = async () => {
    const lat = parseFloat(activeSubTrial?.Lat);
    const lon = parseFloat(activeSubTrial?.Lon);
    if (isNaN(lat) || isNaN(lon)) return;
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
      const d = await res.json();
      const c = d.current;
      if (c) {
        setVisitForm(prev => ({
          ...prev,
          weatherTemp: c.temperature_2m?.toString() || '',
          weatherHumidity: c.relative_humidity_2m?.toString() || '',
          weatherWind: c.wind_speed_10m?.toString() || '',
          weatherRain: c.precipitation?.toString() || ''
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather synced for visit!', type: 'success' } }));
      }
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather sync failed.', type: 'error' } }));
    }
  };

  // Edit & Delete Project Workspaces
  const handleEditProjectClick = () => {
    if (!activeProject) return;
    setProjectForm({
      ID: activeProject.ID,
      Name: activeProject.Name || '',
      Crop: activeProject.Crop || '',
      Location: activeProject.Location || '',
      Investigator: activeProject.Investigator || '',
      TargetWeed: activeProject.TargetWeed || '',
      GPSBounds: activeProject.GPSBounds || ''
    });
    setIsProjectModalOpen(true);
  };

  const handleDeleteProjectClick = async () => {
    if (isViewer) {
      toast('Viewer role cannot delete projects.', 'error');
      return;
    }
    if (!activeProject) return;
    if (!window.confirm(`Are you absolutely sure you want to delete the Master Workspace "${activeProject.Name}"?\n\nThis will permanently delete this workspace and ALL its (${subTrials.length}) sub-trial spots and observation logs. This action cannot be undone.`)) return;
    try {
      for (const st of subTrials) {
        await deleteTrial({ ID: st.ID }, getAppState);
      }
      await deleteProject({ ID: activeProjectId }, getAppState);
      updateState({
        projects: state.projects.filter(p => p.ID !== activeProjectId),
        trials: state.trials.filter(t => t.ProjectID !== activeProjectId)
      });
      setActiveProjectId('');
      setSelectedSubTrialId('');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Master Workspace and all sub-trials deleted.', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete workspace.', type: 'error' } }));
    }
  };

  // Create or Update Project Workspace
  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (isViewer) {
      toast('Viewer role cannot save or modify projects.', 'error');
      return;
    }
    const isEdit = !!projectForm.ID;
    const payload = {
      ...(isEdit ? activeProject : {}),
      ...projectForm,
      Category: activeCategory,
      Design: 'LargeScale',
      Status: 'Active',
      UpdatedAt: new Date().toISOString(),
      ...(isEdit ? {} : { CreatedAt: new Date().toISOString() })
    };
    try {
      const res = await addProject(payload, getAppState);
      if (isEdit) {
        updateState({ projects: state.projects.map(p => p.ID === payload.ID ? payload : p) });
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Master Workspace Updated!', type: 'success' } }));
      } else {
        const updatedList = [...(state.projects || []), res];
        updateState({ projects: updatedList });
        setActiveProjectId(res.ID);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Large Field Trial Workspace Created!', type: 'success' } }));
      }
      setIsProjectModalOpen(false);
      setProjectForm({ Name: '', Crop: '', Location: '', Investigator: '', TargetWeed: '', GPSBounds: '' });
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to ${isEdit ? 'update' : 'save'} workspace.`, type: 'error' } }));
    }
  };

  // Create or Update Sub-Trial
  const handleSaveSubTrial = async (e) => {
    e.preventDefault();
    if (isViewer) {
      toast('Viewer role cannot save sub-trials.', 'error');
      return;
    }
    if (!activeProjectId) return;
 
    const formMatch = state.formulations?.find(f => f.Name === subTrialForm.FormulationName);
    const isEdit = !!editingSubTrial;
 
    const payload = {
      ...(isEdit ? editingSubTrial : {}),
      ...subTrialForm,
      Category: activeCategory,
      ProjectID: activeProjectId,
      FormulationID: formMatch?.ID || '',
      IsLive: true,
      UpdatedAt: new Date().toISOString(),
      ...(isEdit ? {} : {
        ID: `sub_${Date.now()}`,
        CreatedAt: new Date().toISOString()
      })
    };

    try {
      if (isEdit) {
        await updateTrial(payload, getAppState);
        updateState({ trials: state.trials.map(t => t.ID === payload.ID ? payload : t) });
      } else {
        await addTrial(payload, getAppState);
        updateState({ trials: [...(state.trials || []), payload] });
      }
      setIsSubTrialModalOpen(false);
      setEditingSubTrial(null);
      setSubTrialForm(emptySubTrialForm());
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Sub-trial ${isEdit ? 'updated' : 'created'} successfully!`, type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save sub-trial.', type: 'error' } }));
    }
  };

  // Delete Sub-Trial
  const handleDeleteSubTrial = async (stId, e) => {
    if (isViewer) {
      toast('Viewer role cannot delete sub-trials.', 'error');
      return;
    }
    e?.stopPropagation();
    if (!window.confirm('Delete this sub-trial and all its logs?')) return;
    try {
      await deleteTrial({ ID: stId }, getAppState);
      updateState({ trials: state.trials.filter(t => t.ID !== stId) });
      if (selectedSubTrialId === stId) setSelectedSubTrialId('');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sub-trial deleted.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete sub-trial.', type: 'error' } }));
    }
  };

  // Photo Capture
  const handleCapturePhoto = (dataUrl) => {
    setVisitForm(prev => ({ ...prev, photoUrl: dataUrl }));
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo captured! Run AI to analyze.', type: 'success' } }));
  };

  // Image upload fallback
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setVisitForm(prev => ({ ...prev, photoUrl: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // AI weed analysis for visits
  const handleAnalyzePhoto = async () => {
    if (!visitForm.photoUrl) return;
    setLoading(true);
    try {
      // Find Gemini API Key
      const keys = getAPIKeys('gemini-3-flash');
      if (!keys.length) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please configure Gemini API key in Settings.', type: 'error' } }));
        setLoading(false);
        return;
      }
      
      const mimeType = visitForm.photoUrl.split(';')[0].split(':')[1] || 'image/jpeg';
      const base64 = visitForm.photoUrl.split(',')[1];
      const targetLabel = config.targetLabel;
      const promptText = `${config.aiPhotoPrompt}\n\nOutput a JSON array only containing observations for each target detected. Each object in the array should have: 1) species (the name of the target/species detected), 2) cover (numeric value for severity/cover/count 0-100), 3) status (response description, e.g. Controlled, Symptomatic, Deficient, Healthy). Output format: [{"species":"Target Name","cover":20,"status":"Symptomatic"}]`;
      
      const models = ['gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];
      let successResultText = null;
      let matchedModel = '';
      for (const model of models) {
        for (const key of keys) {
          try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: promptText },
                    { inlineData: { mimeType, data: base64 } }
                  ]
                }]
              })
            });
            if (!resp.ok) continue;
            const d = await resp.json();
            const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (txt.match(/\[.*\]/s)) {
              successResultText = txt;
              matchedModel = model;
              break;
            }
          } catch (err) {
            console.warn(`Vision model ${model} failed for weed list:`, err.message);
          }
        }
        if (successResultText) break;
      }

      if (!successResultText) throw new Error('All Gemini models failed to analyze image details');

      const match = successResultText.match(/\[.*\]/s);
      if (match) {
        const weeds = JSON.parse(match[0]);
        const totalCover = weeds.reduce((acc, w) => acc + (w.cover || 0), 0);
        const primaryObsField = getPrimaryObservationField(activeCategory);
        setVisitForm(prev => ({
          ...prev,
          [primaryObsField]: Math.min(100, totalCover),
          weedDetails: weeds
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI ${config.targetLabel} Analysis Successful (${matchedModel})!`, type: 'success' } }));
      } else {
        throw new Error('Failed to parse JSON response');
      }
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + err.message, type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  // Add / Edit Observation Visit
  const handleSaveVisit = async (e) => {
    e.preventDefault();
    if (isViewer) {
      toast('Viewer role cannot save observations.', 'error');
      return;
    }
    if (!activeSubTrial) return;

    // Check if any fields that were previously recorded in this project are missing
    const projId = activeSubTrial.ProjectID;
    const projectTrials = (getAppState().trials || []).filter(t => String(t.ProjectID) === String(projId));
    const previouslyRecordedFields = [];

    config.observationFields?.forEach(field => {
      const hasValue = projectTrials.some(t => {
        const eff = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []));
        return eff.some(obs => obs[field.key] !== undefined && obs[field.key] !== null && obs[field.key] !== '');
      });
      if (hasValue) {
        previouslyRecordedFields.push(field);
      }
    });

    const missingFields = previouslyRecordedFields.filter(field => {
      const val = visitForm[field.key];
      return val === undefined || val === null || val === '';
    });

    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(f => f.label).join(', ');
      const confirmSave = window.confirm(`You previously recorded data for the following fields in this trial, but they are currently missing:\n\n${fieldLabels}\n\nAre you sure you want to save without this data?`);
      if (!confirmSave) return;
    }

    setLoading(true);

    let drivePhotoUrl = visitForm.photoUrl;
    if (visitForm.photoUrl && visitForm.photoUrl.startsWith('data:')) {
      let compressedPhotoUrl = visitForm.photoUrl;
      try {
        compressedPhotoUrl = await compressImage(visitForm.photoUrl, 600, 0.7);
      } catch (compressErr) {
        console.warn('Compression failed, using original size:', compressErr);
      }
      drivePhotoUrl = compressedPhotoUrl;

      try {
        const fileName = `subtrial_${activeSubTrial.ID}_daa${visitForm.daa}_${Date.now()}.jpg`;
        const res = await uploadPhoto({
          base64: compressedPhotoUrl,
          filename: fileName,
          folderName: activeProject?.Name || 'LargeScale Field Trials'
        }, getAppState);
        if (res && res.url) {
          drivePhotoUrl = res.url;
        }
      } catch (err) {
        console.warn('Drive upload failed, using base64 fallback', err);
      }
    }

    const efficacyData = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, []));
    const primaryObsField = getPrimaryObservationField(activeCategory);

    const newVisit = {
      daa: Number(visitForm.daa),
      date: visitForm.date,
      notes: visitForm.notes,
      weatherTemp: visitForm.weatherTemp,
      weatherHumidity: visitForm.weatherHumidity,
      weatherWind: visitForm.weatherWind,
      weatherRain: visitForm.weatherRain,
      photoUrl: drivePhotoUrl,
      weedDetails: visitForm.weedDetails || []
    };

    config.observationFields?.forEach(f => {
      const val = visitForm[f.key];
      newVisit[f.key] = (val === '' || val === undefined || val === null) ? null : Number(val);
    });

    if (primaryObsField !== 'weedCover') {
      newVisit.weedCover = newVisit[primaryObsField];
    }

    if (newVisit.weedDetails.length === 0) {
      newVisit.weedDetails = [{ species: `Total ${config.targetLabel}s`, cover: newVisit[primaryObsField] || 0, status: 'Active' }];
    }

    if (editingVisitIdx !== null) {
      efficacyData[editingVisitIdx] = newVisit;
    } else {
      efficacyData.push(newVisit);
    }

    efficacyData.sort((a, b) => a.daa - b.daa);

    // Update PhotoURLs list to include latest photos
    const photoUrlsList = safeJsonParse(activeSubTrial.PhotoURLs, []);
    if (drivePhotoUrl && !photoUrlsList.some(p => p.url === drivePhotoUrl)) {
      photoUrlsList.push({
        url: drivePhotoUrl,
        date: visitForm.date,
        label: `DAA ${visitForm.daa} Photo`
      });
    }

    // Determine Efficacy Outcome Result
    let resultRating = activeSubTrial.Result || 'Pending';
    if (efficacyData.length > 1) {
      const base = efficacyData[0][primaryObsField] || 100;
      const last = efficacyData[efficacyData.length - 1][primaryObsField] || 0;
      const reduction = calculateEfficacy(activeCategory, last, base);
      
      if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
        if (reduction >= 15) resultRating = 'Excellent';
        else if (reduction >= 8) resultRating = 'Good';
        else if (reduction >= 3) resultRating = 'Fair';
        else resultRating = 'Poor';
      } else {
        if (reduction >= 90) resultRating = 'Excellent';
        else if (reduction >= 70) resultRating = 'Good';
        else if (reduction >= 40) resultRating = 'Fair';
        else resultRating = 'Poor';
      }
    }

    const payload = {
      ...activeSubTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      PhotoURLs: JSON.stringify(photoUrlsList),
      Result: resultRating,
      UpdatedAt: new Date().toISOString()
    };

    try {
      await updateTrial(payload, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === payload.ID ? payload : t) });
      setIsVisitModalOpen(false);
      setEditingVisitIdx(null);
      setVisitForm(emptyVisitForm());
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'DAA observation log saved!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation.', type: 'error' } }));
    } finally {
      setLoading(false);
    }
  };

  // Delete Visit
  const handleDeleteVisit = async (idx) => {
    if (isViewer) {
      toast('Viewer role cannot delete observations.', 'error');
      return;
    }
    if (!activeSubTrial || !window.confirm('Delete this observation visit record?')) return;
    const efficacyData = validateEfficacyData(safeJsonParse(activeSubTrial.EfficacyDataJSON, []));
    efficacyData.splice(idx, 1);

    const payload = {
      ...activeSubTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      UpdatedAt: new Date().toISOString()
    };

    try {
      await updateTrial(payload, getAppState);
      updateState({ trials: state.trials.map(t => t.ID === payload.ID ? payload : t) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Visit log deleted.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete visit log.', type: 'error' } }));
    }
  };

  // Master AI report synthesis
  const handleGenerateMasterReport = async () => {
    if (isViewer) {
      toast('Viewer role cannot generate AI reports.', 'error');
      return;
    }
    if (subTrials.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please add sub-trials to synthesize a report.', type: 'error' } }));
      return;
    }
    const keys = getAPIKeys('gemini-3-flash');
    if (!keys.length) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Configure Gemini API key in Settings.', type: 'error' } }));
      return;
    }

    setAiReportRunning(true);
    try {
      // Gather all sub-trial logs into a clean text summary
const primaryObsField = getPrimaryObservationField(activeCategory);
      const subTrialText = subTrials.map(st => {
        const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
        const obs = eff.map(o => {
          const val = getObservationPrimaryValue(activeCategory, o) ?? 0;
          return `DAA ${o.daa}: value=${val}${config.primaryMetric.unit || '%'} [${(o.weedDetails || []).map(w => `${w.species} ${w.cover}%`).join(', ')}]`;
        }).join('; ');
        return `Sub-trial formulation: ${st.FormulationName}, dosage: ${st.Dosage || 'N/A'}, replication: ${st.Replication}, plot: ${st.PlotNumber || 'N/A'}. History: ${obs}`;
      }).join('\n\n');

      const treatmentSummaryText = projectAnalysis.treatmentSummary.map(ts => {
        return `Treatment: ${ts.label}, replicates: ${ts.n}, mean final ${config.primaryMetric.label}: ${ts.mean.toFixed(1)}${config.primaryMetric.unit || '%'}, CV: ${ts.cv.toFixed(1)}%`;
      }).join('\n');

      let anovaSummary = '';
      let postHocSummary = '';
      if (projectAnalysis.anova && !projectAnalysis.anova.error) {
        anovaSummary = `ANOVA (${projectAnalysis.analysisMethod}) on final ${config.primaryMetric.label} values: F = ${projectAnalysis.anova.fStatistic?.toFixed(2) || 'N/A'}, p = ${projectAnalysis.anova.pValue?.toFixed(4) || 'N/A'}. ${projectAnalysis.anova.significant ? 'The treatment effect is statistically significant at α=0.05.' : 'No statistically significant treatment effect was detected at α=0.05.'}`;
        if (projectAnalysis.postHoc && projectAnalysis.postHoc.groups) {
          const groups = Object.entries(projectAnalysis.postHoc.groups)
            .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
            .map(([name, letter]) => `${name} (${letter})`)
            .join(', ');
          postHocSummary = `Post-hoc Tukey HSD grouping: ${groups}.`;
        }
      }
      const warningText = [projectAnalysis.balanceWarning, projectAnalysis.missingFinalWarning, projectAnalysis.insufficientWarning].filter(Boolean).join(' ');
      const warningSummary = warningText ? `Note: ${warningText}` : '';

      const prompt = `You are an expert agricultural scientist evaluating a large-scale field study for the ${config.name} category. Please write a highly professional, comprehensive executive master summary (4-6 paragraphs) synthesizing study outcomes across all monitoring spots/sub-trials:\n\nProject Name: ${activeProject.Name}\nCrop: ${activeProject.Crop || 'N/A'}\nTarget ${config.targetLabel.toLowerCase()}s: ${activeProject.TargetWeed || 'N/A'}\nLocation: ${activeProject.Location || 'N/A'}\nTrial design: ${projectAnalysis.design} with ${subTrials.length} spots/sub-trials and ${projectAnalysis.treatmentSummary.map(ts => `${ts.label} (${ts.n} reps)`).join(', ')}.\n\nTreatment summary:\n${treatmentSummaryText}\n${warningSummary ? `\n${warningSummary}` : ''}\n${anovaSummary ? `\nANOVA summary: ${anovaSummary}` : ''}\n${postHocSummary ? `\n${postHocSummary}` : ''}\n\nSub-Trial Data:\n${subTrialText}\n\nDiscuss: \n1. Overall efficacy trajectory (measured as ${config.primaryMetric.label}).\n2. ${config.targetLabel}-specific outcomes (which targets were successfully controlled/suppressed).\n3. Spatial variability (differences across replicates/spots).\n4. Definitive scientific conclusion and recommendation for future applications.`;

      const summaryText = await generateTextWithAI(prompt, `You are an expert agricultural scientist evaluating a large-scale field study for the ${config.name} category.`);

      // Save AI narrative summary to project document
      const updatedProject = {
        ...activeProject,
        _aiMasterSummary: summaryText,
        _aiSummaryGeneratedAt: new Date().toISOString()
      };
      await addProject(updatedProject, getAppState);
      updateState({ projects: state.projects.map(p => p.ID === activeProjectId ? updatedProject : p) });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Master AI Synthesis Complete!', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI synthesis failed: ' + err.message, type: 'error' } }));
    } finally {
      setAiReportRunning(false);
    }
  };

  const handleBulkDeleteSubTrials = async () => {
    if (isViewer) {
      toast('Viewer role cannot delete sub-trials.', 'error');
      return;
    }
    if (!selectedForBulk.size) return;
    if (!window.confirm(`Delete ${selectedForBulk.size} selected sub-trial spot(s) and all their observations?`)) return;
    try {
      const ids = Array.from(selectedForBulk);
      for (const id of ids) {
        await deleteTrial({ ID: id }, getAppState);
      }
      updateState({ trials: state.trials.filter(t => !selectedForBulk.has(t.ID)) });
      setSelectedForBulk(new Set());
      setSelectedSubTrialId('');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Selected sub-trials deleted.', type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete some sub-trials.', type: 'error' } }));
    }
  };

  // Comparative charts calculations
  const chartData = useMemo(() => {
    const daaSet = new Set([0]);
    subTrials.forEach(st => {
      const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
      eff.forEach(o => daaSet.add(o.daa));
    });
    const daas = Array.from(daaSet).sort((a, b) => a - b);

    const datasets = subTrials.map(st => {
      const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
      const primaryObsField = getPrimaryObservationField(activeCategory);
      const dataPoints = daas.map(daa => {
        const match = eff.find(o => o.daa === daa);
        return match ? getObservationPrimaryValue(activeCategory, match) : null;
      });
      return {
        label: `${st.FormulationName || 'Spot'} (${st.Replication})`,
        data: dataPoints
      };
    });

    return { daas, datasets };
  }, [subTrials, activeCategory]);

  const projectChartData = useMemo(() => {
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const treatmentGroups = {};
    const daaSet = new Set();

    subTrials.forEach(st => {
      const eff = validateEfficacyData(safeJsonParse(st.EfficacyDataJSON, []));
      const label = `${st.FormulationName || 'Unknown'}${st.Dosage ? ` (${st.Dosage})` : ''}`;
      if (!treatmentGroups[label]) treatmentGroups[label] = {};
      eff.forEach(o => {
        const daa = Number(o.daa);
        if (!Number.isFinite(daa)) return;
        daaSet.add(daa);
        const value = Number(getObservationPrimaryValue(activeCategory, o) ?? 0);
        if (!treatmentGroups[label][daa]) treatmentGroups[label][daa] = [];
        treatmentGroups[label][daa].push(value);
      });
    });

    const daas = Array.from(daaSet).sort((a, b) => a - b);
    const datasets = Object.entries(treatmentGroups).map(([label, valuesByDaa]) => ({
      label,
      data: daas.map(daa => {
        const values = valuesByDaa[daa] || [];
        if (!values.length) return null;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        return Number(mean.toFixed(1));
      })
    }));

    return { daas, datasets };
  }, [subTrials, activeCategory]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 font-sans">
      <TopBar title="Large Scale Field Trials" onMenuClick={onMenuClick} />

      <div className="flex-grow overflow-y-auto p-6 space-y-6">
        {/* Workspace Bar */}
        <div className="backdrop-blur-md bg-white/70 rounded-2xl p-4 border border-white/40 shadow-sm flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-3">
            <Compass className={`${theme.textDark} h-6 w-6 shrink-0`} />
            <div>
              <label className={`block text-[10px] uppercase tracking-wider font-extrabold ${theme.textDark}`}>Large Scale Workspace</label>
              <div className="flex items-center gap-2">
                <select
                  value={activeProjectId}
                  onChange={e => {
                    setActiveProjectId(e.target.value);
                    setSelectedSubTrialId('');
                  }}
                  className={`bg-transparent border-b border-slate-300 text-slate-800 font-bold focus:outline-none focus:border-emerald-700 pr-4 text-sm`}
                >
                  <option value="">-- Select Master Project --</option>
                  {masterProjects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
                </select>
                {activeProjectId && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={handleEditProjectClick}
                      title="Edit Master Workspace"
                      className={`p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:${theme.textDark} transition`}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleDeleteProjectClick}
                      title="Delete Master Workspace"
                      className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-red-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsProjectModalOpen(true)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create Master Workspace
            </button>
            {activeProjectId && (
              <>
                <button
                  onClick={handleARMImportClick}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  title="Import spots from ARM CSV"
                >
                  <Download className="w-4 h-4 text-emerald-600 rotate-180" /> Import ARM CSV
                </button>
                <input
                  type="file"
                  ref={armFileInputRef}
                  onChange={handleARMImportChange}
                  accept=".csv"
                  className="hidden"
                />
                <button
                  onClick={() => {
                    setEditingSubTrial(null);
                    const matchedForm = state.formulations?.find(f =>
                      f.Name.toLowerCase() === activeProject?.Name?.toLowerCase() ||
                      activeProject?.Name?.toLowerCase().includes(f.Name.toLowerCase())
                    );
                    setSubTrialForm({
                      ...emptySubTrialForm(),
                      FormulationName: matchedForm ? matchedForm.Name : '',
                      InvestigatorName: state.auth?.user?.Name || ''
                    });
                    setIsSubTrialModalOpen(true);
                  }}
                  className={`px-4 py-2 ${theme.bg} text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm`}
                >
                  <Plus className="w-4 h-4" /> Add Sub-Trial / Spot
                </button>
              </>
            )}
          </div>
        </div>

        {activeProjectId ? (
          selectedSubTrialId && activeSubTrial ? (
            // Full Width Inspector Panel
            <div className="space-y-6">
              {/* Top back banner */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedSubTrialId('')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <ArrowLeft className={`w-4 h-4 ${theme.textDark}`} /> Back to Spots Directory
                  </button>
                  <div className="h-4 w-px bg-slate-200" />
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">
                      {activeSubTrial.FormulationName || 'Untitled Spot'}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Rep: {activeSubTrial.Replication} | Plot: {activeSubTrial.PlotNumber || 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${activeSubTrial.IsCompleted ? '${theme.badge}' : 'bg-blue-100 text-blue-800'}`}>
                    {activeSubTrial.IsCompleted ? 'Finalized' : 'Active'}
                  </span>
                  {activeSubTrial.IsControl === true || activeSubTrial.IsControl === 'true' ?
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-800">Control</span> : null}
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${theme.bgLight} ${theme.textDark} border`}>
                    {activeSubTrial.Result || 'Unrated'}
                  </span>
                </div>
              </div>

              {/* Inspector Body (spacious content tabs) */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 min-h-[500px]">
                {/* Tabs Nav */}
                <div className="flex border-b bg-white overflow-x-auto whitespace-nowrap scrollbar-none mb-6">
                  {[['info','Info'],['observations','Obs'],['harvest','Harvest & Yield'],['photos','Photos'],['weather','Weather'],['chart','Chart'],['statistics','Stats'],['qr','QR'],['export','Export']].map(([k, label]) => {
                    const obsCount = obsData.sorted.length;
                    const photosCount = safeJsonParse(activeSubTrial.PhotoURLs, []).length;
                    const harvestPhotos = safeJsonParse(activeSubTrial.HarvestDataJSON, {}).photos || [];
                    return (
                      <button
                        key={k}
                        onClick={() => setDetailTab(k)}
                        className={`px-3 py-2.5 text-xs font-bold border-b-2 transition
                          ${detailTab === k ? 'border-emerald-600 ${theme.textDark}' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        {label}
                        {k === 'observations' && obsCount > 0 && <span className={`ml-1 text-[9px] ${theme.badge} px-1 rounded-full`}>{obsCount}</span>}
                        {k === 'harvest' && harvestPhotos.length > 0 && <span className={`ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded-full`}>{harvestPhotos.length}</span>}
                        {k === 'photos' && photosCount > 0 && <span className="ml-1 text-[9px] bg-blue-100 text-blue-700 px-1 rounded-full">{photosCount}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content Panel */}
                <div className="space-y-4">
                  {/* INFO TAB */}
                  {detailTab === 'info' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(() => {
                          const subInfoFields = [
                            ['Investigator', activeSubTrial.InvestigatorName, Info],
                            ['Dosage', activeSubTrial.Dosage, SlidersHorizontal],
                          ];
                          if (activeCategory === 'herbicide') {
                            subInfoFields.push(['Weeds targeted', activeSubTrial.WeedSpecies, Leaf]);
                          } else {
                            subInfoFields.push([config.targetLabel, activeSubTrial[config.targetField] || activeSubTrial.WeedSpecies || '—', Leaf]);
                          }
                          subInfoFields.push(
                            ['Replication', activeSubTrial.Replication, Hash],
                            ['Plot #', activeSubTrial.PlotNumber, Hash]
                          );
                          if (activeCategory === 'herbicide') {
                            subInfoFields.push(
                              ['App Timing', activeSubTrial.ApplicationTiming, Clock],
                              ['Growth Stage', activeSubTrial.WeedGrowthStage, Leaf]
                            );
                          } else {
                            const timingOpt = config.applicationTimings.find(t => t.value === activeSubTrial.ApplicationTiming);
                            subInfoFields.push(
                              ['App Timing', timingOpt ? timingOpt.label : (activeSubTrial.ApplicationTiming || '—'), Clock]
                            );
                            config.specificFields.forEach(f => {
                              if (f.key !== config.targetField && f.key !== 'YieldValue') {
                                subInfoFields.push([f.label, activeSubTrial[f.key] || '—', Leaf]);
                              }
                            });
                          }
                          subInfoFields.push(['Soil Texture', activeSubTrial.SoilTexture, Compass]);

                          return subInfoFields.map(([label, val, Icon]) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Icon className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase">{label}</span>
                              </div>
                              <p className="font-bold text-slate-800">{val || '—'}</p>
                            </div>
                          ));
                        })()}
                      </div>

                      {activeSubTrial.Notes && (
                        <div className="bg-slate-50 rounded-xl p-4 border text-xs">
                          <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Notes</span>
                          <p className="text-slate-600 whitespace-pre-wrap">{activeSubTrial.Notes}</p>
                        </div>
                      )}

                      {activeSubTrial.Conclusion && (
                        <div className={`${theme.bgLight}/50 rounded-xl p-4 border ${theme.borderLight} text-xs`}>
                          <span className={`text-[9px] font-bold ${theme.text} uppercase block mb-1`}>Conclusion</span>
                          <p className="text-slate-700 whitespace-pre-wrap">{activeSubTrial.Conclusion}</p>
                        </div>
                      )}

                      {/* Soil Data */}
                      {(activeSubTrial.SoilPH || activeSubTrial.SoilClay || activeSubTrial.SoilSand) && (
                        <div className="bg-amber-50/30 rounded-xl p-4 border border-amber-100/50 text-xs">
                          <span className="text-[9px] font-bold text-amber-700 uppercase block mb-2">Soil Characteristics</span>
                          <div className="grid grid-cols-3 gap-4">
                            {activeSubTrial.SoilPH && <div><span className="text-amber-800 font-medium">pH:</span> {activeSubTrial.SoilPH}</div>}
                            {activeSubTrial.SoilClay && <div><span className="text-amber-800 font-medium">Clay:</span> {activeSubTrial.SoilClay}%</div>}
                            {activeSubTrial.SoilSand && <div><span className="text-amber-800 font-medium">Sand:</span> {activeSubTrial.SoilSand}%</div>}
                            {activeSubTrial.SoilOC && <div><span className="text-amber-800 font-medium">OC:</span> {activeSubTrial.SoilOC}%</div>}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap pt-4 border-t">
                        {!activeSubTrial.IsCompleted ? (
                          <button
                            onClick={() => onMarkComplete(activeSubTrial)}
                            className={`px-4 py-2 ${theme.bg} text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm`}
                          >
                            <CheckCircle className="w-4 h-4" /> Finalize Spot
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              const updated = { ...activeSubTrial, IsCompleted: false };
                              try {
                                await updateTrial(updated, getAppState);
                                updateState({ trials: state.trials.map(t => t.ID === activeSubTrial.ID ? updated : t) });
                              } catch {}
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                          >
                            <RefreshCw className="w-4 h-4" /> Reactivate Spot
                          </button>
                        )}
                        <button
                          onClick={() => onDuplicate(activeSubTrial)}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => {
                            setEditingSubTrial(activeSubTrial);
                            setSubTrialForm({ ...activeSubTrial });
                            setIsSubTrialModalOpen(true);
                          }}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <Edit className="w-4 h-4" /> Edit Info
                        </button>
                      </div>
                    </div>
                  )}

                  {/* OBSERVATIONS TAB */}
                  {detailTab === 'observations' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">DAA Observations Log</span>
                        <div className="flex gap-1.5">
                          {obsData.sorted.length >= 2 && (
                            <button
                              onClick={generateAISummary}
                              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1.5 shadow-sm"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> AI Summary
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingVisitIdx(null);
                              setVisitForm({ ...emptyVisitForm(), date: new Date().toISOString().split('T')[0] });
                              setIsVisitModalOpen(true);
                            }}
                            className={`px-3 py-1.5 ${theme.bg} text-white font-bold rounded-lg text-[10px] flex items-center gap-1`}
                          >
                            <Plus className="w-3.5 h-3.5" /> Log Visit
                          </button>
                        </div>
                      </div>

                      {obsData.sorted.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {obsData.sorted.map((visit, idx) => {
                            const isBaseline = visit.daa === obsData.sorted[0]?.daa;
                            const primaryObsField = getPrimaryObservationField(activeCategory);
                            const currentVal = parseFloat(getObservationPrimaryValue(activeCategory, visit) ?? 0);
                            const baseVal = parseFloat(obsData.baseCover ?? 0);
                            const wce = baseVal > 0 && !isBaseline ? calculateEfficacy(activeCategory, currentVal, baseVal) : null;
                            const wceRating = wce === null ? null : wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';
                            const wceCls = wce === null ? '' : wce >= 85 ? `${theme.textDark} ${theme.bgLight}` : wce >= 70 ? 'text-blue-700 bg-blue-50' : wce >= 50 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                            const risks = getClimateRisks(visit.weatherTemp, visit.weatherWind, visit.weatherRain);

                            return (
                              <div key={idx} className="bg-white border rounded-2xl p-4 shadow-sm space-y-3 text-xs">
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="bg-slate-700 text-white font-bold px-1.5 py-0.5 rounded text-[9px]">DAA {visit.daa}</span>
                                    <span className="text-[10px] text-slate-400">{visit.date}</span>
                                    {wceRating && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${wceCls}`}>{wceRating}</span>}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingVisitIdx(idx);
                                        const formObj = {
                                          daa: visit.daa || '',
                                          date: visit.date || '',
                                          weedCover: visit.weedCover || '',
                                          notes: visit.notes || '',
                                          weatherTemp: visit.weatherTemp || '',
                                          weatherHumidity: visit.weatherHumidity || '',
                                          weatherWind: visit.weatherWind || '',
                                          weatherRain: visit.weatherRain || '',
                                          photoUrl: visit.photoUrl || '',
                                          weedDetails: visit.weedDetails || []
                                        };
                                        config.observationFields?.forEach(f => {
                                          formObj[f.key] = visit[f.key] ?? visit[getPrimaryObservationField(activeCategory)] ?? '';
                                        });
                                        setVisitForm(formObj);
                                        setIsVisitModalOpen(true);
                                      }}
                                      className={`text-xs text-slate-500 hover:${theme.textDark} font-bold`}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteVisit(idx)}
                                      className="text-xs text-red-500 hover:text-red-700 font-bold"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold">{config.primaryMetric.label}</span>
                                    <span className="font-bold text-slate-700">{getObservationPrimaryValue(activeCategory, visit) ?? '—'}{config.primaryMetric.unit || '%'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold">{config.primaryMetric.key} %</span>
                                    <span className="font-bold text-slate-700">{wce !== null ? `${wce.toFixed(1)}%` : isBaseline ? 'Baseline' : '—'}</span>
                                  </div>
                                </div>

                                {visit.photoUrl && (
                                  <div className="relative rounded-lg overflow-hidden border bg-black h-36">
                                    <img src={visit.photoUrl} alt="" className="w-full h-full object-cover" />
                                  </div>
                                )}

                                {visit.weedDetails && visit.weedDetails.length > 0 && (
                                  <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg space-y-1 border">
                                    {visit.weedDetails.map((w, wIdx) => (
                                      <div key={wIdx} className="flex justify-between">
                                        <span className="font-semibold">{w.species}</span>
                                        <span className="text-slate-600 font-bold">
                                          {w.cover}% Sev
                                          {w.incidence !== undefined && w.incidence !== null ? ` / ${w.incidence}% Inc` : ''}
                                          {w.detectedCount !== undefined ? ` (${w.detectedCount}/${visit.sampleCount || 1} plants)` : ''}
                                          {w.status ? ` (${w.status})` : ''}
                                          {w.confidence ? ` [Conf: ${w.confidence}%]` : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {visit.notes && (() => {
                                  const parts = visit.notes.split(' | ').map(p => p.trim()).filter(Boolean);
                                  if (parts.length === 1) {
                                    return <p className="mt-2 text-xs text-slate-500 italic">"{parts[0]}"</p>;
                                  }
                                  return (
                                    <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-slate-500 pl-1">
                                      {parts.map((p, idx) => <li key={idx} className="italic">"{p}"</li>)}
                                    </ul>
                                  );
                                })()}

                                {visit.aiEfficacyAssessment && (
                                  <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-2">
                                    <p className="text-[10px] font-bold text-purple-700 uppercase mb-0.5">AI Efficacy Assessment</p>
                                    {(() => {
                                      const parts = visit.aiEfficacyAssessment.split(' | ').map(p => p.trim()).filter(Boolean);
                                      if (parts.length === 1) {
                                        return <p className="text-xs text-purple-800">{parts[0]}</p>;
                                      }
                                      return (
                                        <ul className="space-y-1 list-disc list-inside text-xs text-purple-800 pl-1">
                                          {parts.map((p, idx) => <li key={idx}>{p}</li>)}
                                        </ul>
                                      );
                                    })()}
                                  </div>
                                )}

                                {risks.length > 0 && (
                                  <div className="space-y-1">
                                    {risks.map((risk, ri) => (
                                      <div key={ri} className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-700">
                                        ⚠️ {risk.msg}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-400 italic">No observation visits logged yet.</div>
                      )}
                    </div>
                  )}

                  {/* PHOTOS TAB */}
                  {detailTab === 'photos' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Field Spot Photos</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              quickActionTrialRef.current = activeSubTrial;
                              setCameraMode('general');
                              setIsCameraOpen(true);
                            }}
                            className="px-3 py-1.5 border rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                          >
                            <Camera className={`w-4 h-4 ${theme.text}`} /> Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              quickActionTrialRef.current = activeSubTrial;
                              fileInputRef.current?.click();
                            }}
                            className="px-3 py-1.5 border rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                          >
                            <ImageIcon className={`w-4 h-4 ${theme.text}`} /> Choose File
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const activePhotos = safeJsonParse(activeSubTrial.PhotoURLs, []).filter(p => !p.deleted);
                        if (activePhotos.length === 0) return null;
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {activePhotos.map((photo, pIdx) => {
                              const photoSrc = photo.url || photo.fileData || photo;
                            return (
                              <div key={pIdx} className="border rounded-2xl overflow-hidden shadow-sm bg-white flex flex-col">
                                <div className="relative h-36 bg-black">
                                  <img src={photoSrc} alt="" className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => handleDeletePhoto(pIdx)}
                                    className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 hover:bg-red-600 transition"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="p-3 space-y-1.5 text-xs">
                                  <p className="font-semibold text-slate-700">{photo.label || `Photo ${pIdx + 1}`}</p>
                                  <p className="text-slate-400">{photo.date}</p>
                                  <div className="flex gap-1.5 pt-2 border-t">
                                    <button
                                      onClick={() => handleCropExistingPhoto(pIdx, photoSrc)}
                                      className="flex-1 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-center"
                                    >
                                      Crop
                                    </button>
                                    <button
                                      onClick={() => handleAnalyzeSinglePhoto(photoSrc, photo.date)}
                                      disabled={aiGenRunning}
                                      className="flex-1 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded font-bold text-center"
                                    >
                                      AI Scan
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        );
                      })() || (
                        <div className="text-center py-8 text-slate-400 italic">No photos added yet. Snap or upload to perform AI {activeCategory === 'herbicide' ? 'Weed' : config.targetLabel} Identification.</div>
                      )}
                    </div>
                  )}

              {/* HARVEST TAB */}
              {detailTab === 'harvest' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Harvest & Final Yield Log</h4>
                      <p className="text-xs text-slate-500">Record final physical harvest yields, weights, and photos.</p>
                    </div>
                    {activeSubTrial.EfficacyDataJSON && safeJsonParse(activeSubTrial.EfficacyDataJSON, []).some(o => o.fruitCount || o.marketableYield || o.unmarketableYield) && (
                      <button
                        type="button"
                        onClick={() => {
                          const obs = safeJsonParse(activeSubTrial.EfficacyDataJSON, []);
                          const validCounts = obs.map(o => o.fruitCount).filter(v => typeof v === 'number' && v > 0);
                          const validMark = obs.map(o => o.marketableYield).filter(v => typeof v === 'number' && v > 0);
                          const validUnmark = obs.map(o => o.unmarketableYield).filter(v => typeof v === 'number' && v > 0);
                          
                          const avgCount = validCounts.length ? Math.round(validCounts.reduce((s,v)=>s+v, 0)/validCounts.length) : '';
                          const avgMark = validMark.length ? Math.round(validMark.reduce((s,v)=>s+v, 0)/validMark.length) : '';
                          const avgUnmark = validUnmark.length ? Math.round(validUnmark.reduce((s,v)=>s+v, 0)/validUnmark.length) : '';
                          
                          setHarvestForm(prev => ({
                            ...prev,
                            actualFruitCount: avgCount,
                            actualMarketableWeight: avgMark,
                            actualUnmarketableWeight: avgUnmark,
                          }));
                          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Prefilled from AI averages!', type: 'success' } }));
                        }}
                        className="flex items-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg font-bold transition shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Suggest from AI Obs
                      </button>
                    )}
                  </div>

                  {/* Calculations card */}
                  {(() => {
                    const totalWeight = (parseFloat(harvestForm.actualMarketableWeight || 0) + parseFloat(harvestForm.actualUnmarketableWeight || 0));
                    const avgFruitWeight = harvestForm.actualFruitCount > 0 ? (totalWeight / harvestForm.actualFruitCount).toFixed(1) : '—';
                    const marketableRatio = totalWeight > 0 ? ((parseFloat(harvestForm.actualMarketableWeight || 0) / totalWeight) * 100).toFixed(1) : '—';
                    return (
                      <div className="grid grid-cols-3 gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Total Yield</p>
                          <p className="text-lg font-black text-emerald-700">{totalWeight ? `${totalWeight} g` : '—'}</p>
                        </div>
                        <div className="text-center border-x border-slate-200">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Avg Fruit Size</p>
                          <p className="text-lg font-black text-emerald-700">{avgFruitWeight !== '—' ? `${avgFruitWeight} g` : '—'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Marketable %</p>
                          <p className="text-lg font-black text-emerald-700">{marketableRatio !== '—' ? `${marketableRatio}%` : '—'}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* AI Quick-Fill Notes/Dictation */}
                  {!isViewer && !activeSubTrial.IsCompleted && (
                    <div className="border border-purple-100 rounded-xl p-3.5 bg-purple-50/30 space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" /> AI Quick-Fill Notes/Dictation
                        </label>
                        {aiNotesParsing && <span className="text-xs text-purple-600 animate-pulse font-medium">Parsing...</span>}
                      </div>
                      <textarea
                        rows="2"
                        placeholder="Type or dictate e.g., 'Harvested 30 good tomatoes today (850g) and 4 damaged ones (90g) on June 18'"
                        value={harvestDictationText}
                        onChange={e => setHarvestDictationText(e.target.value)}
                        className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                      ></textarea>
                      <button
                        type="button"
                        onClick={handleParseHarvestNotes}
                        disabled={!harvestDictationText.trim() || aiNotesParsing}
                        className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:bg-purple-300 disabled:cursor-not-allowed"
                      >
                        Parse Notes & Fill Form
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Harvest Date</label>
                      <input
                        type="date"
                        value={harvestForm.harvestDate || ''}
                        onChange={e => setHarvestForm(prev => ({ ...prev, harvestDate: e.target.value }))}
                        disabled={isViewer || activeSubTrial.IsCompleted}
                        className="w-full border rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fruit Count per Plant</label>
                      <input
                        type="number"
                        placeholder="e.g. 45"
                        value={harvestForm.actualFruitCount || ''}
                        onChange={e => setHarvestForm(prev => ({ ...prev, actualFruitCount: e.target.value }))}
                        disabled={isViewer || activeSubTrial.IsCompleted}
                        className="w-full border rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Marketable Yield (g/plant)</label>
                      <input
                        type="number"
                        placeholder="Pristine fruits > 20g"
                        value={harvestForm.actualMarketableWeight || ''}
                        onChange={e => setHarvestForm(prev => ({ ...prev, actualMarketableWeight: e.target.value }))}
                        disabled={isViewer || activeSubTrial.IsCompleted}
                        className="w-full border rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Unmarketable Yield (g/plant)</label>
                      <input
                        type="number"
                        placeholder="Cracked/sunburnt/damaged"
                        value={harvestForm.actualUnmarketableWeight || ''}
                        onChange={e => setHarvestForm(prev => ({ ...prev, actualUnmarketableWeight: e.target.value }))}
                        disabled={isViewer || activeSubTrial.IsCompleted}
                        className="w-full border rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Harvest Notes / Remarks</label>
                    <textarea
                      rows="3"
                      placeholder="Enter fruit grades, damage observations, or yield summaries..."
                      value={harvestForm.notes || ''}
                      onChange={e => setHarvestForm(prev => ({ ...prev, notes: e.target.value }))}
                      disabled={isViewer || activeSubTrial.IsCompleted}
                      className="w-full border rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    ></textarea>
                  </div>

                  {/* Harvest Photo Gallery */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Harvest Photos ({(harvestForm.photos || []).length})</label>
                      {!isViewer && !activeSubTrial.IsCompleted && (
                        <div className="flex gap-2">
                          {(harvestForm.photos || []).length > 0 && (
                            <button
                              type="button"
                              onClick={handleScanHarvestPhotos}
                              disabled={aiHarvestLoading}
                              className="px-2.5 py-1.5 border rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> {aiHarvestLoading ? 'Scanning...' : 'AI Scan'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCameraMode('harvest');
                              harvestFileRef.current?.click();
                            }}
                            className="px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 flex items-center gap-1"
                          >
                            <ImageIcon className="w-3.5 h-3.5" /> Upload File
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCameraMode('harvest');
                              setIsCameraOpen(true);
                            }}
                            className="px-2.5 py-1.5 border rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1"
                          >
                            <Camera className="w-3.5 h-3.5" /> Camera
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {(harvestForm.photos || []).length > 0 ? (
                      <div className="grid grid-cols-3 gap-3">
                        {(harvestForm.photos || []).map((photo, pIdx) => {
                          const rawSrc = photo.fileData || photo.url || (typeof photo === 'string' ? photo : null);
                          const driveMatch = typeof rawSrc === 'string' && rawSrc.includes('drive.google.com') && rawSrc.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
                          const thumbnailSrc = driveMatch ? `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w200` : rawSrc;
                          return (
                            <div key={pIdx} className="relative group rounded-xl overflow-hidden border bg-slate-50 aspect-video flex items-center justify-center">
                              <img src={thumbnailSrc} alt={`Harvest photo ${pIdx + 1}`} className="object-cover w-full h-full" />
                              {!isViewer && !activeSubTrial.IsCompleted && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if(window.confirm('Remove this harvest photo?')) {
                                      setHarvestForm(prev => ({
                                        ...prev,
                                        photos: prev.photos.filter((_, idx) => idx !== pIdx)
                                      }));
                                    }
                                  }}
                                  className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic py-2">No harvest/yield photos attached yet.</p>
                    )}
                  </div>

                  {/* Save button */}
                  {!isViewer && !activeSubTrial.IsCompleted && (
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = {
                          ...activeSubTrial,
                          HarvestDataJSON: JSON.stringify(harvestForm)
                        };
                        updateState({ trials: state.trials.map(t => t.ID === updated.ID ? updated : t) });
                        if (selectedSubTrialId === activeSubTrial.ID) setSelectedSubTrialId(updated.ID);
                        try {
                          await updateTrial({ ID: updated.ID, HarvestDataJSON: updated.HarvestDataJSON }, getAppState);
                          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Harvest & Yield data saved successfully!', type: 'success' } }));
                        } catch (e) {
                          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save harvest data', type: 'error' } }));
                        }
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition"
                    >
                      Save Harvest Data
                    </button>
                  )}
                </div>
              )}

                  {/* WEATHER TAB */}
                  {detailTab === 'weather' && (
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Application Meteorological Parameters</span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-50 p-6 border rounded-2xl">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Temperature</span>
                          <span className="font-bold text-slate-700 text-base">{activeSubTrial.Temperature || 'N/A'} °C</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Relative Humidity</span>
                          <span className="font-bold text-slate-700 text-base">{activeSubTrial.Humidity || 'N/A'} %</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Windspeed</span>
                          <span className="font-bold text-slate-700 text-base">{activeSubTrial.Windspeed || 'N/A'} km/h</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Precipitation</span>
                          <span className="font-bold text-slate-700 text-base">{activeSubTrial.Rain || 'N/A'} mm</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CHART TAB */}
                  {detailTab === 'chart' && (() => {
                    const primaryObsField = getPrimaryObservationField(activeCategory);
                    return (
                      <div className="space-y-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Efficacy Curves</span>
                        {obsData.sorted.length > 0 ? (
                          <div className="h-72 bg-slate-50/50 p-6 border rounded-2xl flex flex-col justify-between">
                            <div className="flex-1 relative">
                              <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                                {[0, 20, 40, 60, 80, 100].map(yVal => {
                                  const y = 200 - (yVal * 2);
                                  return <line key={yVal} x1="0" y1={y} x2="500" y2={y} stroke="#e2e8f0" strokeWidth="1" />;
                                })}
                                <polyline
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth="3"
                                  points={obsData.sorted.map((o, idx) => {
                                    const x = (idx / (obsData.sorted.length - 1 || 1)) * 500;
                                    const val = parseFloat(getObservationPrimaryValue(activeCategory, o) ?? 0);
                                    const y = 200 - (val * 2);
                                    return `${x},${y}`;
                                  }).join(' ')}
                                />
                              </svg>
                            </div>
                            <div className="flex justify-between pt-3 border-t text-[10px] font-bold text-slate-400">
                              {obsData.sorted.map(o => (
                                <span key={o.daa}>DAA {o.daa} ({getObservationPrimaryValue(activeCategory, o) ?? 0}{config.primaryMetric.unit || '%'})</span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-400 italic">No efficacy visits logged yet.</div>
                        )}

                        {projectChartData.datasets.length > 0 ? (
                          <div className="space-y-4 mt-6">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Treatment mean curves across replicates</span>
                            <div className="h-64 bg-slate-50/50 p-4 border rounded-2xl overflow-hidden">
                              <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                                {[0, 20, 40, 60, 80, 100].map(yVal => {
                                  const y = 200 - (yVal * 2);
                                  return <line key={yVal} x1="0" y1={y} x2="500" y2={y} stroke="#e2e8f0" strokeWidth="1" />;
                                })}
                                {projectChartData.datasets.map((ds, idx) => {
                                  const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
                                  return (
                                    <polyline
                                      key={ds.label}
                                      fill="none"
                                      stroke={colors[idx % colors.length]}
                                      strokeWidth="2"
                                      points={projectChartData.daas.map((daa, dataIdx) => {
                                        const val = ds.data[dataIdx];
                                        const x = (dataIdx / (projectChartData.daas.length - 1 || 1)) * 500;
                                        const y = Number.isFinite(val) ? 200 - (val * 2) : 200;
                                        return `${x},${y}`;
                                      }).join(' ')}
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-slate-500">
                              {projectChartData.datasets.map(ds => (
                                <div key={ds.label} className="leading-5">
                                  <strong className="text-slate-700">{ds.label}</strong><br />
                                  {projectChartData.daas.map((daa, dataIdx) => {
                                    const value = ds.data[dataIdx];
                                    return value !== null ? `DAA ${daa}: ${value}${config.primaryMetric.unit || '%'} ` : null;
                                  }).filter(Boolean).join(' · ')}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}

                  {/* STATISTICS TAB */}
                  {detailTab === 'statistics' && (() => {
                    const primaryObsField = getPrimaryObservationField(activeCategory);
                    return (
                      <div className="space-y-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">ANOVA Statistics & {config.primaryMetric.key} Diagnostics</span>
                        {projectAnalysis.treatmentSummary.length > 0 && (
                          <div className="space-y-4 text-sm max-w-2xl">
                            <div className={`${theme.bgLight}/50 border ${theme.borderLight} rounded-xl p-4 ${theme.textDark}`}>
                              <p className="font-bold text-base">Project treatment summary</p>
                              {projectAnalysis.treatmentSummary.map(ts => (
                                <p key={ts.label} className="text-xs">
                                  <strong>{ts.label}:</strong> N={ts.n}, mean final {config.primaryMetric.label}: {ts.mean.toFixed(1)}{config.primaryMetric.unit || '%'}, CV: {ts.cv.toFixed(1)}%
                                </p>
                              ))}
                              {projectAnalysis.anova && !projectAnalysis.anova.error ? (
                                <>
                                  <p className="text-xs mt-2">{projectAnalysis.analysisMethod}: F={projectAnalysis.anova.fStatistic?.toFixed(2) || 'N/A'}, p={projectAnalysis.anova.pValue?.toFixed(4) || 'N/A'} ({projectAnalysis.anova.significant ? 'significant' : 'not significant'})</p>
                                  {projectAnalysis.postHoc?.groups ? (
                                    <p className="text-xs mt-1">Post-hoc groupings: {Object.entries(projectAnalysis.postHoc.groups)
                                      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
                                      .map(([treatment, letter]) => `${treatment} (${letter})`).join(', ')}</p>
                                  ) : null}
                                  {projectAnalysis.balanceWarning ? (
                                    <p className="text-xs mt-1 text-amber-600">{projectAnalysis.balanceWarning}</p>
                                  ) : null}
                                  {projectAnalysis.missingFinalWarning ? (
                                    <p className="text-xs mt-1 text-amber-600">{projectAnalysis.missingFinalWarning}</p>
                                  ) : null}
                                </>
                              ) : (
                                <p className="text-xs mt-2 text-slate-500">Project-level ANOVA requires at least two treatments and final observations in each spot.</p>
                              )}
                            </div>
                          </div>
                        )}
                        {statsData.hasStats ? (
                          <div className="space-y-4 text-sm max-w-2xl">
                            <div className={`${theme.bgLight}/50 border ${theme.borderLight} rounded-xl p-4 ${theme.textDark}`}>
                              <p className="font-bold text-base">Mean {config.primaryMetric.key} Efficacy: {statsData.renderMeanWce.toFixed(1)}%</p>
                              <p className="text-xs mt-1">Coefficient of Variation (CV): {statsData.stats.anovaResults?.diagnostics?.cv || 'N/A'}%</p>
                            </div>
                            <div className="border rounded-xl overflow-hidden bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500">
                                  <tr>
                                    <th className="px-4 py-2.5 text-left">Source</th>
                                    <th className="px-4 py-2.5 text-center">DF</th>
                                    <th className="px-4 py-2.5 text-right">MS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y text-slate-700 bg-white">
                                  <tr>
                                    <td className="px-4 py-2.5 font-medium">Treatment</td>
                                    <td className="px-4 py-2.5 text-center">{statsData.stats.anovaResults?.anovaTable?.treatment?.df || 0}</td>
                                    <td className="px-4 py-2.5 text-right">{statsData.stats.anovaResults?.anovaTable?.treatment?.ms || 0}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 p-6 border rounded-2xl text-center space-y-3 max-w-md">
                            <p className="text-slate-500 text-xs">Run {config.primaryMetric.key} calculations on the sub-trial observations.</p>
                            <button
                              onClick={async () => {
                                if (obsData.sorted.length < 2) {
                                  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Need at least 2 observations to calculate statistics', type: 'error' } }));
                                  return;
                                }
                                const wceRows = obsData.sorted.map(obs => {
                                  const val = parseFloat(getObservationPrimaryValue(activeCategory, obs) ?? 0) || 0;
                                  const wce = obs.daa === obsData.sorted[0].daa ? null : (obsData.baseCover > 0 ? calculateEfficacy(activeCategory, val, obsData.baseCover) : 0);
                                  return { daa: obs.daa, wce };
                                });
                                const wces = wceRows.map(r => r.wce).filter(v => v !== null);
                                const meanWce = wces.length ? wces.reduce((s, v) => s + v, 0) / wces.length : 0;
                                const df = wces.length - 1;
                                const result = {
                                  wce: wceRows,
                                  anovaResults: { anovaTable: { treatment: { source: 'Treatment', df, ms: 0 } }, diagnostics: { cv: 0 } },
                                  calculatedAt: new Date().toISOString()
                                };
                                const updated = { ...activeSubTrial, StatisticsJSON: JSON.stringify(result) };
                                try {
                                  await updateTrial(updated, getAppState);
                                  updateState({ trials: state.trials.map(t => t.ID === activeSubTrial.ID ? updated : t) });
                                  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Calculated successfully!', type: 'success' } }));
                                } catch {}
                              }}
                              className={`px-4 py-2 ${theme.bg} text-white rounded-lg text-xs font-bold transition shadow`}
                            >
                            Calculate Statistics
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* QR CODE TAB */}
                  {detailTab === 'qr' && (() => {
                    const liveUrl = buildPrintableTrialUrl(activeSubTrial);
                    const fmtDate = (d) => formatDate(d);
                    return (
                    <div className="flex flex-col items-center gap-4 w-full">
                      {/* Mode picker */}
                      <div className="flex w-full rounded-xl overflow-hidden border border-slate-200">
                        {['offline','online'].map(m => (
                          <button key={m}
                            onClick={() => { setQrMode(m); setQrGenerated(false); }}
                            className={`flex-1 py-2 text-sm font-semibold capitalize transition-colors ${
                              qrMode === m ? '${theme.bgSecondary} text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                            }`}>
                            {m === 'offline' ? '📦 Offline QR' : '🌐 Online / Live QR'}
                          </button>
                        ))}
                      </div>

                      {/* Canvas */}
                      <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-sm">
                        <canvas ref={qrCanvasRef} className="block mx-auto" />
                        {!qrGenerated && (
                          <div className="w-[220px] h-[220px] flex items-center justify-center text-slate-300 text-xs">
                            Click Generate to create QR
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        <button onClick={() => generateQR(activeSubTrial, qrMode)}
                          className={`flex items-center gap-2 px-4 py-2 ${theme.bgSecondary} text-white rounded-lg text-sm font-semibold ${theme.hoverBg}`}>
                          <Plus className="w-4 h-4" /> Generate QR
                        </button>
                        {qrGenerated && (
                          <button onClick={downloadQR}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200">
                            <Download className="w-4 h-4" /> Download PNG
                          </button>
                        )}
                      </div>

                      {/* Info panel */}
                      {qrMode === 'offline' ? (
                        <div className="w-full bg-slate-50 rounded-xl p-4 text-xs text-slate-600 border space-y-1">
                          <p className="font-bold text-slate-700 mb-2">📦 Offline QR — encoded data:</p>
                          <p><span className="font-semibold text-slate-500">Trial ID:</span> <span className="font-mono">{activeSubTrial?.ID}</span></p>
                          <p><span className="font-semibold text-slate-500">Product:</span> {activeSubTrial?.FormulationName}</p>
                          <p><span className="font-semibold text-slate-500">Date:</span> {fmtDate(activeSubTrial?.Date)}</p>
                          <p><span className="font-semibold text-slate-500">Dosage:</span> {activeSubTrial?.Dosage || '—'}</p>
                          <p><span className="font-semibold text-slate-500">Location:</span> {activeSubTrial?.Location || '—'}</p>
                          <p><span className="font-semibold text-slate-500">Weeds:</span> {activeSubTrial?.WeedSpecies || '—'}</p>
                          <p><span className="font-semibold text-slate-500">Replication:</span> {activeSubTrial?.Replication || '—'}</p>
                          <p className="mt-2 text-slate-400">Works without internet. Scan with Plot Scanner to open this trial.</p>
                        </div>
                      ) : (() => {
                        const LIVE_FIELDS = [
                          { key: 'showFormulationName', label: 'Product Name' },
                          { key: 'showInvestigator', label: 'Investigator' },
                          { key: 'showDate', label: 'Application Date' },
                          { key: 'showDosage', label: 'Dosage' },
                          { key: 'showLocation', label: 'Location' },
                          { key: 'showWeedSpecies', label: 'Target ${config.targetLabel}s' },
                          { key: 'showResult', label: 'Result' },
                          { key: 'showWeather', label: 'Weather' },
                          { key: 'showIngredients', label: 'Ingredients' },
                          { key: 'showConclusion', label: 'Conclusion & Notes' },
                          { key: 'showPhotos', label: 'Field Photos' },
                          { key: 'showObservations', label: 'Observations / Efficacy' },
                          { key: 'showAISummary', label: 'AI Narrative' },
                          { key: 'showReplication', label: 'Replication' },
                        ];
                        const defaultOn = {
                          showFormulationName: true,
                          showInvestigator: true,
                          showDate: true,
                          showDosage: true,
                          showLocation: true,
                          showWeedSpecies: true,
                          showResult: true,
                          showWeather: true,
                          showIngredients: false,
                          showConclusion: true,
                          showPhotos: true,
                          showObservations: false,
                          showAISummary: false,
                          showReplication: false,
                        };
                        const globalOnlineRaw = state.settings?.qrOnlineFields;
                        const globalOnlineDefaults = Array.isArray(globalOnlineRaw)
                          ? {
                              ...defaultOn,
                              showFormulationName: globalOnlineRaw.includes('FormulationName'),
                              showInvestigator: globalOnlineRaw.includes('InvestigatorName'),
                              showDate: globalOnlineRaw.includes('Date'),
                              showDosage: globalOnlineRaw.includes('Dosage'),
                              showLocation: globalOnlineRaw.includes('Location'),
                              showWeedSpecies: globalOnlineRaw.includes('WeedSpecies'),
                              showResult: globalOnlineRaw.includes('Result'),
                              showWeather: globalOnlineRaw.includes('Weather'),
                              showConclusion: globalOnlineRaw.includes('Conclusion'),
                              showPhotos: globalOnlineRaw.includes('Photos'),
                            }
                          : (globalOnlineRaw && typeof globalOnlineRaw === 'object'
                            ? { ...defaultOn, ...globalOnlineRaw }
                            : defaultOn);
                        const rawLiveSettings = safeJsonParse(activeSubTrial?.LiveQRSettings, {});
                        const liveSettings = {
                          ...globalOnlineDefaults,
                          ...rawLiveSettings,
                          ...(Object.prototype.hasOwnProperty.call(rawLiveSettings, 'showInvestigatorName')
                            ? { showInvestigator: rawLiveSettings.showInvestigatorName }
                            : {}),
                        };

                        const handleToggleLiveField = async (fieldKey) => {
                          const updated = { ...liveSettings, [fieldKey]: !liveSettings[fieldKey] };
                          const updatedTrial = { ...activeSubTrial, LiveQRSettings: JSON.stringify(updated) };
                          updateState({ trials: state.trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
                          if (selectedSubTrialId === activeSubTrial.ID) setSelectedSubTrialId(updatedTrial.ID);
                          try {
                            await updateTrial({ ID: updatedTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings }, getAppState);
                          } catch (e) {
                            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Could not save: ' + e.message, type: 'error' } }));
                          }
                        };

                        return (
                          <div className="w-full space-y-3">
                            <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-800 border border-blue-200 space-y-2">
                              <p className="font-bold text-blue-700 mb-1">🌐 Online / Live QR — links to:</p>
                              <p className="font-mono break-all text-blue-600 bg-blue-100 rounded p-2">{liveUrl}</p>
                              <p>Anyone with this QR can view live trial data directly from Firebase — no login required.</p>
                            </div>
                            <div className="w-full bg-white rounded-xl border border-slate-200 p-4">
                              <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                                Control what visitors see — changes save instantly to Firebase
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {LIVE_FIELDS.map(({ key, label }) => (
                                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                                    <div
                                      onClick={() => handleToggleLiveField(key)}
                                      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
                                        liveSettings[key] ? theme.bgSecondary : 'bg-slate-300'
                                      }`}
                                    >
                                      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                                        liveSettings[key] ? 'translate-x-4' : 'translate-x-0'
                                      }`} />
                                    </div>
                                    <span className={`text-xs ${liveSettings[key] ? 'text-slate-700 font-semibold' : 'text-slate-400 line-through'}`}>
                                      {label}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                  {/* EXPORT TAB */}
                  {detailTab === 'export' && (
                    <div className="space-y-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Export Sub-Trial Data</span>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <button
                          onClick={() => checkDownload(generateComprehensivePdf, activeSubTrial, { formulations: state.formulations })}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                          <FileText className={`w-4 h-4 ${theme.text}`} /> PDF Report
                        </button>
                        <button
                          onClick={() => checkDownload(generateScientificReport, activeSubTrial, { formulations: state.formulations })}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-sky-600" /> Scientific PDF
                        </button>
                        <button
                          onClick={() => checkDownload(generatePpt, activeSubTrial)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                          <BarChart2 className="w-4 h-4 text-amber-600" /> PowerPoint
                        </button>
                        <button
                          onClick={() => checkDownload(exportToCSV, activeSubTrial)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                          <TrendingUp className="w-4 h-4 text-purple-600" /> CSV Dataset
                        </button>
                        <button
                          onClick={() => {
                            if (!canDownload) {
                              toast('Download permission is disabled for your account.', 'error');
                              return;
                            }
                            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating ARM exchange file...', type: 'info' } }));
                            try {
                              const blob = exportToARM(activeSubTrial, activeCategory, activeProject);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `ARM_Export_${activeSubTrial.FormulationName || 'SubTrial'}_${activeCategory}.csv`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'ARM file exported successfully!', type: 'success' } }));
                            } catch (err) {
                              console.error(err);
                              window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to generate ARM file.', type: 'error' } }));
                            }
                          }}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                          title="Export sub-trial data to ARM CSV format"
                        >
                          <TrendingUp className="w-4 h-4 text-emerald-600" /> ARM CSV Exchange
                        </button>
                        <button
                          onClick={() => checkDownload(exportHtmlReport, activeSubTrial)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                          <Leaf className="w-4 h-4 text-teal-600" /> HTML view
                        </button>
                        <button
                          onClick={() => checkDownload(exportTrialDocx, activeSubTrial, { formulations: state.formulations })}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                        >
                          <BookOpen className="w-4 h-4 text-indigo-600" /> Word Document
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Overview view (either GIS workspace or Spot Directory)
            <div className="space-y-6">
              {/* Workspace Navigation Mode Toggle */}
              <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setViewMode('gis')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${viewMode === 'gis' ? 'bg-white ${theme.textDark} shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <MapIcon className="w-3.5 h-3.5" /> GIS Workspace & Analytics
                </button>
                <button
                  onClick={() => setViewMode('spots')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${viewMode === 'spots' ? 'bg-white ${theme.textDark} shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Layers3 className="w-3.5 h-3.5" /> Spot Directory ({subTrials.length})
                </button>
              </div>

              {viewMode === 'gis' ? (
                // Full Width GIS Maps and Master Analytics
                <div className="space-y-6">
                  {/* Dashboard Navigation Tabs */}
                  <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
                    <button
                      onClick={() => setDashboardTab('map')}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboardTab === 'map' ? 'bg-white ${theme.textDark} shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      <MapIcon className="inline-block w-3.5 h-3.5 mr-1" /> GIS Satellite Map
                    </button>
                    <button
                      onClick={() => setDashboardTab('charts')}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboardTab === 'charts' ? 'bg-white ${theme.textDark} shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      <BarChart2 className="inline-block w-3.5 h-3.5 mr-1" /> Efficacy Curves
                    </button>
                    <button
                      onClick={() => setDashboardTab('ai')}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${dashboardTab === 'ai' ? 'bg-white ${theme.textDark} shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      <Sparkles className="inline-block w-3.5 h-3.5 mr-1" /> Master Report
                    </button>
                  </div>

                  {/* Tab: Map */}
                  {dashboardTab === 'map' && (
                    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-[520px] relative">
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                          <MapIcon className={`w-4 h-4 ${theme.text}`} /> Esri Satellite Spatial Coordinates
                        </span>
                        <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {subTrials.length} Monitoring Spots
                        </div>
                      </div>
                      <div ref={mapContainerRef} className="flex-1 w-full h-full bg-slate-50" />
                    </div>
                  )}

                  {/* Tab: Curves */}
                  {dashboardTab === 'charts' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                      <h3 className="font-bold text-slate-800 text-base mb-2">{activeCategory === 'herbicide' ? 'Weed Cover Trajectories' : `${config.primaryMetric.label} Trajectories`}</h3>
                      <p className="text-xs text-slate-400 mb-6">Compare {activeCategory === 'herbicide' ? 'weed cover reduction' : config.primaryMetric.label.toLowerCase()} rates (%) across different sub-trial zones side-by-side.</p>

                      {chartData.daas.length > 0 && chartData.datasets.length > 0 ? (
                        <div className="h-72 flex flex-col justify-between">
                          <div className="flex-1 relative">
                            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                              {/* Y-axis lines */}
                              {[0, 20, 40, 60, 80, 100].map(yVal => {
                                const y = 200 - (yVal * 200 / 100);
                                return (
                                  <line key={yVal} x1="0" y1={y} x2="500" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                                );
                              })}

                              {/* Data Timelines */}
                              {chartData.datasets.map((ds, dsIdx) => {
                                const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                                const points = ds.data.map((val, idx) => {
                                  if (val === null) return null;
                                  const x = (idx / (chartData.daas.length - 1 || 1)) * 500;
                                  const y = 200 - (val * 200 / 100);
                                  return `${x},${y}`;
                                }).filter(p => p !== null).join(' ');

                                return points ? (
                                  <polyline
                                    key={ds.label}
                                    fill="none"
                                    stroke={colors[dsIdx % colors.length]}
                                    strokeWidth="3"
                                    points={points}
                                  />
                                ) : null;
                              })}
                            </svg>
                          </div>

                          {/* Legend */}
                          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
                            {chartData.datasets.map((ds, dsIdx) => {
                              const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                              return (
                                <div key={ds.label} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold font-sans">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[dsIdx % colors.length] }} />
                                  <span>{ds.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="py-16 text-center text-slate-400 italic">No historical visits logged yet.</div>
                      )}
                    </div>
                  )}

                  {/* Tab: Master Report & AI Narrative */}
                  {dashboardTab === 'ai' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
                      <div className="flex justify-between items-center pb-4 border-b">
                        <div>
                          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-violet-600 animate-pulse" /> Master Efficacy Report
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Unified report synthesizing all Sub-Trial outcomes in the workspace.</p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleGenerateMasterReport}
                            disabled={aiReportRunning}
                            className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${aiReportRunning ? 'animate-spin' : ''}`} />
                            {aiReportRunning ? 'Generating...' : 'Synthesize AI Summary'}
                          </button>
                        </div>
                      </div>

                      {/* AI Output */}
                      <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Executive Study Narrative</h4>
                        {activeProject?._aiMasterSummary ? (
                          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                            {activeProject._aiMasterSummary}
                          </div>
                        ) : (
                          <div className="text-slate-400 italic text-sm py-8 text-center">
                            No narrative summary generated. Click "Synthesize AI Summary" to compile sub-trial findings.
                          </div>
                        )}
                      </div>

                      {/* Analysis Summary */}
                      <div className="bg-white rounded-2xl p-4 border border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Analysis Summary</h4>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em]">Analytics</span>
                        </div>
                        {projectAnalysis.anova && !projectAnalysis.anova.error ? (
                          <div className="space-y-3 text-sm text-slate-700">
                            <p><span className="font-semibold">Method:</span> {projectAnalysis.analysisMethod}</p>
                            <p><span className="font-semibold">Design:</span> {projectAnalysis.design}</p>
                            <p><span className="font-semibold">ANOVA result:</span> F={projectAnalysis.anova.fStatistic?.toFixed(2) || 'N/A'}, p={projectAnalysis.anova.pValue?.toFixed(4) || 'N/A'} ({projectAnalysis.anova.significant ? 'significant' : 'not significant'})</p>
                            {projectAnalysis.postHoc?.groups ? (
                              <p className="text-slate-600"><span className="font-semibold">Post-hoc:</span> {Object.entries(projectAnalysis.postHoc.groups).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([treatment, letter]) => `${treatment} (${letter})`).join(', ')}</p>
                            ) : null}
                            <div className="grid gap-2 text-xs text-slate-600">
                              {projectAnalysis.treatmentSummary.map(ts => (
                                <div key={ts.label} className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                                  <p className="font-semibold text-slate-800">{ts.label}</p>
                                  <p>Replicates: {ts.n} · Mean final {config.primaryMetric.label}: {ts.mean.toFixed(1)}{config.primaryMetric.unit || '%'} · CV: {ts.cv.toFixed(1)}%</p>
                                </div>
                              ))}
                            </div>
                            {projectAnalysis.balanceWarning ? (
                              <p className="text-xs text-amber-600">⚠️ {projectAnalysis.balanceWarning}</p>
                            ) : null}
                            {projectAnalysis.missingFinalWarning ? (
                              <p className="text-xs text-amber-600">⚠️ {projectAnalysis.missingFinalWarning}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">Project-level analysis is not available. Add more final observations or check the experiment design metadata.</p>
                        )}
                      </div>

                      {/* Export Options */}
                      <div className="pt-4 border-t space-y-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block font-sans">Export Unified Master Study Report</span>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                          <button
                            onClick={() => checkDownload(generateMasterComprehensivePdf, activeProject, subTrials, { formulations: state.formulations, aiSummary: activeProject?._aiMasterSummary, analysis: projectAnalysis })}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <FileText className={`w-4 h-4 ${theme.text}`} /> Comprehensive PDF
                          </button>
                          <button
                            onClick={() => checkDownload(generateMasterScientificReport, activeProject, subTrials, { aiSummary: activeProject?._aiMasterSummary, analysis: projectAnalysis })}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <FileText className="w-4 h-4 text-sky-600" /> Scientific PDF
                          </button>
                          <button
                            onClick={() => checkDownload(generateMasterPpt, activeProject, subTrials)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <BarChart2 className="w-4 h-4 text-amber-600" /> PowerPoint Deck
                          </button>
                          <button
                            onClick={() => checkDownload(exportMasterCSV, activeProject, subTrials)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <TrendingUp className="w-4 h-4 text-purple-600" /> CSV Dataset
                          </button>
                          <button
                            onClick={() => {
                              if (!canDownload) {
                                toast('Download permission is disabled for your account.', 'error');
                                return;
                              }
                              window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating ARM exchange file...', type: 'info' } }));
                              try {
                                const blob = exportToARM(subTrials, activeCategory, activeProject);
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `ARM_Export_${activeProject?.Name || 'Master'}_${activeCategory}.csv`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'ARM file exported successfully!', type: 'success' } }));
                              } catch (err) {
                                console.error(err);
                                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to generate ARM file.', type: 'error' } }));
                              }
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                            title="Export master project trials to ARM CSV format"
                          >
                            <TrendingUp className="w-4 h-4 text-emerald-600" /> ARM CSV Exchange
                          </button>
                          <button
                            onClick={() => checkDownload(exportMasterHtml, activeProject, subTrials)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <Leaf className="w-4 h-4 text-teal-600" /> Standalone HTML
                          </button>
                          <button
                            onClick={() => checkDownload(exportMasterDocx, activeProject, subTrials)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <BookOpen className="w-4 h-4 text-indigo-600" /> Word Document
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Full Width Directory view
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col min-h-[560px]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 font-sans">
                        <Layers3 className={`w-5 h-5 ${theme.text}`} /> Sub-Trial Monitoring Spots
                      </h3>
                      <p className="text-xs text-slate-400">Standard trial cards managed inside this Master project workspace.</p>
                    </div>

                    {/* Search & Sort Panel */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search spots..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          className={`pl-8 pr-4 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 ${theme.ring} bg-slate-50/50 w-44`}
                        />
                        <div className="absolute left-2.5 top-2.5 text-slate-400">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                      </div>

                      <select
                        value={filterResult}
                        onChange={e => setFilterResult(e.target.value)}
                        className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 ${theme.ring}`}
                      >
                        <option value="">All Results</option>
                        {['Excellent', 'Good', 'Fair', 'Poor', 'Pending'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>

                      <select
                        value={filterRole}
                        onChange={e => setFilterRole(e.target.value)}
                        className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 ${theme.ring}`}
                      >
                        <option value="">All Roles</option>
                        <option value="control">Control Spot</option>
                        <option value="standard">Standard Check</option>
                      </select>

                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 ${theme.ring}`}
                      >
                        <option value="date-desc">Newest First</option>
                        <option value="date-asc">Oldest First</option>
                        <option value="name">By Formulation</option>
                        <option value="obs">Most Observations</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex-grow overflow-y-auto pr-1">
                    {filteredSubTrials.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredSubTrials.map((st, idx) => {
                          const sortedSubTrialsByDate = [...subTrials].sort((a, b) => new Date(a.CreatedAt || a.Date || 0) - new Date(b.CreatedAt || b.Date || 0));
                          const subIdx = sortedSubTrialsByDate.findIndex(t => t.ID === st.ID);
                          const subTrialLabel = `Sub ${subIdx >= 0 ? subIdx + 1 : idx + 1}`;

                          return (
                            <TrialCard
                              key={st.ID}
                              trial={st}
                              project={activeProject}
                              subTrialLabel={subTrialLabel}
                              isSelected={selectedForBulk.has(st.ID)}
                              isMenuOpen={openCardMenu === st.ID}
                              onToggleBulk={toggleBulk}
                            onToggleMenu={toggleMenu}
                            onViewDetails={onViewDetails}
                            onEdit={onEdit}
                            onDuplicate={onDuplicate}
                            onMoveToProject={onMoveToProject}
                             onExportPdf={(trial) => checkDownload(generateComprehensivePdf, trial, { formulations: state.formulations })}
                             onExportSciPdf={(trial) => checkDownload(generateScientificReport, trial, { formulations: state.formulations })}
                             onExportPpt={(trial) => checkDownload(generatePpt, trial)}
                             onExportHtml={(trial) => checkDownload(exportHtmlReport, trial)}
                             onExportTxt={() => {}}
                             onExportCsv={(trial) => checkDownload(exportToCSV, trial)}
                             onExportJson={() => {}}
                             onShare={() => {}}
                            onAiGenerate={(trial) => generateAISummary(trial)}
                            onDelete={(id, e) => handleDeleteSubTrial(id, e)}
                            onActivateToggle={onActivateToggle}
                            onQuickRate={onQuickRate}
                            onQuickPhoto={onQuickPhoto}
                            onQuickGalleryUpload={onQuickGalleryUpload}
                            onMarkComplete={onMarkComplete}
                          />
                        )})}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 italic py-24 border-2 border-dashed rounded-3xl border-slate-100">
                        <Calendar className="w-10 h-10 text-slate-200 mb-2" />
                        No spots created yet or match current filters. Click "+ Add Sub-Trial / Spot" to begin.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="py-24 text-center bg-white border border-slate-100 rounded-3xl shadow-sm">
            <Compass className="w-16 h-16 mx-auto text-slate-200 mb-4 animate-pulse" />
            <h3 className="font-bold text-slate-700 text-lg">No Master Workspace Selected</h3>
            <p className="text-slate-400 text-sm mt-1">Select an existing large field trial workspace or create a new one to begin.</p>
          </div>
        )}
      </div>

      {/* Modal: Create/Edit Project Workspace */}
      <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title={projectForm.ID ? "Edit Master Field Study" : "New Master Field Study"}>
        <form onSubmit={handleSaveProject} className="space-y-4 font-sans text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Study Workspace Name</label>
            <input
              type="text"
              required
              placeholder="e.g. 50-Acre Soy Herbicide Master Demo"
              value={projectForm.Name}
              onChange={e => setProjectForm(p => ({ ...p, Name: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${theme.ring}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Target Crop</label>
              <input
                type="text"
                placeholder="e.g. Soybeans"
                value={projectForm.Crop}
                onChange={e => setProjectForm(p => ({ ...p, Crop: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">General Location</label>
              <input
                type="text"
                placeholder="e.g. Sector 4, Northern Farms"
                value={projectForm.Location}
                onChange={e => setProjectForm(p => ({ ...p, Location: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Target {config.targetLabel}s (comma separated)</label>
            <input
              type="text"
              placeholder={`e.g. Target ${config.targetLabel}s`}
              value={projectForm.TargetWeed}
              onChange={e => setProjectForm(p => ({ ...p, TargetWeed: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-600 font-bold mb-1">Study boundary coordinates (optional)</label>
            <textarea
              placeholder="[[lat, lon], [lat, lon]...]"
              value={projectForm.GPSBounds}
              onChange={e => setProjectForm(p => ({ ...p, GPSBounds: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16"
            />
          </div>
          <button
            type="submit"
            className={`w-full py-2 bg-emerald-700 text-white font-bold rounded-lg ${theme.hoverBg} transition`}
          >
            {projectForm.ID ? "Save Workspace Changes" : "Create Master Workspace"}
          </button>
        </form>
      </Modal>

      {/* Modal: Create / Edit Sub-Trial Spot */}
      <Modal isOpen={isSubTrialModalOpen} onClose={() => setIsSubTrialModalOpen(false)} title={editingSubTrial ? "Edit Sub-Trial Spot" : "New Sub-Trial Spot"}>
        <form onSubmit={handleSaveSubTrial} className="space-y-4 font-sans text-xs max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Treatment Formulation</label>
              <select
                value={subTrialForm.FormulationName}
                onChange={e => setSubTrialForm(p => ({ ...p, FormulationName: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none bg-white text-xs"
              >
                <option value="">-- Choose Formulation --</option>
                {state.formulations?.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Dosage rate</label>
              <input
                type="text"
                placeholder="e.g. 1.5 L/ha"
                value={subTrialForm.Dosage}
                onChange={e => setSubTrialForm(p => ({ ...p, Dosage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Plot Number</label>
              <input
                type="text"
                placeholder="e.g. 101"
                value={subTrialForm.PlotNumber}
                onChange={e => setSubTrialForm(p => ({ ...p, PlotNumber: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Timing</label>
              <select
                value={subTrialForm.ApplicationTiming}
                onChange={e => setSubTrialForm(p => ({ ...p, ApplicationTiming: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none bg-white text-xs"
              >
                <option value="">-- Choose Timing --</option>
                {activeCategory === 'herbicide' ? (
                  ['PRE', 'E-POST', 'POST', 'L-POST'].map(t => <option key={t} value={t}>{t}</option>)
                ) : (
                  config.applicationTimings.map(t => <option key={t.value} value={t.value}>{t.label}</option>)
                )}
              </select>
            </div>
          </div>

          {/* Coordinates Block */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700 text-[10px] uppercase">GPS Coordinates</span>
              <button
                type="button"
                onClick={handleGetGPS}
                className={`text-[10px] ${theme.textDark} font-bold bg-white px-2 py-0.5 rounded border flex items-center gap-0.5`}
              >
                {gpsFetching ? 'Fetching...' : 'Get GPS Point'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-500 font-bold">Latitude</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 20.5937"
                  value={subTrialForm.Lat}
                  onChange={e => setSubTrialForm(p => ({ ...p, Lat: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold">Longitude</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 78.9629"
                  value={subTrialForm.Lon}
                  onChange={e => setSubTrialForm(p => ({ ...p, Lon: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-white border rounded"
                />
              </div>
            </div>
            {gpsAccuracy !== null && (
              <div className={`mt-2 text-[10px] ${theme.textDark} font-bold ${theme.bgLight} px-2 py-1 rounded border ${theme.border}/50 flex items-center justify-between`}>
                <span>Accuracy:</span>
                <span>±{gpsAccuracy.toFixed(1)} meters</span>
              </div>
            )}
          </div>

          {/* Weather Block */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700 text-[10px] uppercase">Meteorological Parameters</span>
              <button
                type="button"
                onClick={fetchWeather}
                className={`text-[10px] ${theme.textDark} font-bold bg-white px-2 py-0.5 rounded border`}
              >
                Sync Weather API
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Temp (°C)</label>
                <input
                  type="text"
                  value={subTrialForm.Temperature}
                  onChange={e => setSubTrialForm(p => ({ ...p, Temperature: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Humidity (%)</label>
                <input
                  type="text"
                  value={subTrialForm.Humidity}
                  onChange={e => setSubTrialForm(p => ({ ...p, Humidity: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Wind (km/h)</label>
                <input
                  type="text"
                  value={subTrialForm.Windspeed}
                  onChange={e => setSubTrialForm(p => ({ ...p, Windspeed: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Precip (mm)</label>
                <input
                  type="text"
                  value={subTrialForm.Rain}
                  onChange={e => setSubTrialForm(p => ({ ...p, Rain: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          {/* Soil Parameters */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <span className="font-bold text-slate-700 text-[10px] uppercase">Soil Characteristics</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Soil pH</label>
                <input
                  type="text"
                  placeholder="e.g. 6.5"
                  value={subTrialForm.SoilPH}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilPH: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Clay (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 35"
                  value={subTrialForm.SoilClay}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilClay: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Sand (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 40"
                  value={subTrialForm.SoilSand}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilSand: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-slate-500">Organic Carbon (%)</label>
                <input
                  type="text"
                  placeholder="e.g. 1.2"
                  value={subTrialForm.SoilOC}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilOC: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-500">Soil Texture</label>
                <input
                  type="text"
                  placeholder="e.g. Clay loam"
                  value={subTrialForm.SoilTexture}
                  onChange={e => setSubTrialForm(p => ({ ...p, SoilTexture: e.target.value }))}
                  className="w-full px-2 py-1 bg-white border rounded"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-slate-600 font-bold mb-1">Target {config.targetLabel} (EPPO)</label>
              <input
                type="text"
                placeholder={`Search EPPO code or type...`}
                value={subTrialForm.WeedSpecies || ''}
                onChange={e => {
                  setSubTrialForm(p => ({ ...p, WeedSpecies: e.target.value }));
                  setEppoSearchQuery(e.target.value);
                  setShowEppoDropdown('WeedSpecies');
                }}
                onFocus={() => {
                  setEppoSearchQuery(subTrialForm.WeedSpecies || '');
                  setShowEppoDropdown('WeedSpecies');
                }}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none text-xs"
              />
              {showEppoDropdown === 'WeedSpecies' && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {EPPO_CODES.filter(item => 
                    item.type === (activeCategory === 'herbicide' ? 'weed' : activeCategory === 'fungicide' ? 'disease' : 'pest') &&
                    (item.commonName.toLowerCase().includes(eppoSearchQuery.toLowerCase()) || 
                     item.scientificName.toLowerCase().includes(eppoSearchQuery.toLowerCase()) ||
                     item.code.toLowerCase().includes(eppoSearchQuery.toLowerCase()))
                  ).map(item => (
                    <div 
                      key={item.code} 
                      onClick={() => {
                        setSubTrialForm(prev => ({...prev, WeedSpecies: `${item.commonName} (${item.scientificName}) [${item.code}]`}));
                        setShowEppoDropdown(false);
                      }}
                      className="px-3 py-2 text-xs hover:bg-slate-100 cursor-pointer flex justify-between text-slate-700"
                    >
                      <span className="font-semibold">{item.commonName}</span>
                      <span className="text-slate-400 italic text-[10px]">{item.scientificName} ({item.code})</span>
                    </div>
                  ))}
                  <div 
                    onClick={() => setShowEppoDropdown(false)}
                    className="px-3 py-1.5 text-[10px] text-center text-slate-400 bg-slate-50 border-t cursor-pointer"
                  >
                    Close Options
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Growth Stage (BBCH)</label>
              <select
                value={subTrialForm.WeedGrowthStage || ''}
                onChange={e => setSubTrialForm(p => ({ ...p, WeedGrowthStage: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none bg-white text-xs"
              >
                <option value="">-- Choose Growth Stage --</option>
                {BBCH_STAGES.map(s => (
                  <option key={s.value} value={s.label}>{s.label}</option>
                ))}
              </select>
            </div>
            {activeCategory !== 'herbicide' && config.specificFields.map(field => {
              if (field.key === config.targetField) return null;
              return (
                <div key={field.key}>
                  <label className="block text-slate-600 font-bold mb-1">{field.label}</label>
                  {field.type === 'select' ? (
                    <select
                      value={subTrialForm[field.key] || ''}
                      onChange={e => setSubTrialForm(p => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none bg-white text-xs"
                    >
                      <option value="">-- Choose {field.label} --</option>
                      {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      placeholder={field.placeholder || ''}
                      value={subTrialForm[field.key] || ''}
                      onChange={e => setSubTrialForm(p => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
            <div>
              <label className="block text-slate-600 font-bold mb-1">Spot Location Description</label>
              <input
                type="text"
                placeholder="e.g. East Boundary Fence"
                value={subTrialForm.Location || ''}
                onChange={e => setSubTrialForm(p => ({ ...p, Location: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Investigator Name</label>
            <input
              type="text"
              value={subTrialForm.InvestigatorName}
              onChange={e => setSubTrialForm(p => ({ ...p, InvestigatorName: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Notes</label>
            <textarea
              placeholder="Spot configuration notes..."
              value={subTrialForm.Notes}
              onChange={e => setSubTrialForm(p => ({ ...p, Notes: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16 text-xs"
            />
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 bg-emerald-700 text-white font-bold rounded-lg ${theme.hoverBg} transition`}
          >
            Save Spot Configuration
          </button>
        </form>
      </Modal>

      {/* Modal: Log DAA Observation Visit */}
      <Modal isOpen={isVisitModalOpen} onClose={() => setIsVisitModalOpen(false)} title={editingVisitIdx !== null ? "Edit DAA Observation log" : "Log DAA Observation log"}>
        <form onSubmit={handleSaveVisit} className="space-y-4 font-sans text-xs max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Days After Treatment (DAA)</label>
              <input
                type="number"
                required
                placeholder="e.g. 14"
                value={visitForm.daa}
                onChange={e => setVisitForm(p => ({ ...p, daa: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Assessment Date</label>
              <input
                type="date"
                required
                value={visitForm.date}
                onChange={e => setVisitForm(p => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
          </div>

          {/* Dynamic Observation Fields */}
          <div className="grid grid-cols-2 gap-4">
            {config.observationFields?.map(field => {
              if (field.key === 'weedDetails') return null;
              return (
                <div key={field.key}>
                  <label className="block text-slate-600 font-bold mb-1">{field.label}</label>
                  <input
                    type="number"
                    min={field.min !== undefined ? field.min : undefined}
                    max={field.max !== undefined ? field.max : undefined}
                    step="0.1"
                    placeholder="e.g. 10"
                    value={visitForm[field.key] ?? ''}
                    onChange={e => setVisitForm(p => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                  />
                </div>
              );
            })}
            <div>
              <label className="block text-slate-600 font-bold mb-1">Visit Weather Parameters</label>
              <button
                type="button"
                onClick={fetchVisitWeather}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 border rounded-lg font-bold"
              >
                Sync Weather API
              </button>
            </div>
          </div>

          {/* Visit Weather Preview/Input */}
          <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border">
            <div>
              <label className="text-[9px] text-slate-500">Temp (°C)</label>
              <input
                type="text"
                value={visitForm.weatherTemp}
                onChange={e => setVisitForm(p => ({ ...p, weatherTemp: e.target.value }))}
                className="w-full px-2 py-1 bg-white border rounded"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500">Hum (%)</label>
              <input
                type="text"
                value={visitForm.weatherHumidity}
                onChange={e => setVisitForm(p => ({ ...p, weatherHumidity: e.target.value }))}
                className="w-full px-2 py-1 bg-white border rounded"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500">Wind (km/h)</label>
              <input
                type="text"
                value={visitForm.weatherWind}
                onChange={e => setVisitForm(p => ({ ...p, weatherWind: e.target.value }))}
                className="w-full px-2 py-1 bg-white border rounded"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500">Rain (mm)</label>
              <input
                type="text"
                value={visitForm.weatherRain}
                onChange={e => setVisitForm(p => ({ ...p, weatherRain: e.target.value }))}
                className="w-full px-2 py-1 bg-white border rounded"
              />
            </div>
          </div>

          {/* Photo Capture Section */}
          <div className="space-y-2">
            <span className="font-bold text-slate-700 text-[10px] uppercase block">Field Spot Photo</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="flex-1 py-2.5 border rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 text-xs font-bold text-slate-700"
              >
                <Camera className={`w-4 h-4 ${theme.text}`} /> Snap from Camera
              </button>

              <label className="flex-1 py-2.5 border rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer text-center">
                <Plus className={`w-4 h-4 ${theme.text}`} /> Choose File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {visitForm.photoUrl && (
              <div className="relative rounded-xl overflow-hidden max-h-48 border bg-black">
                <img src={visitForm.photoUrl} alt="Field Observation" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setVisitForm(prev => ({ ...prev, photoUrl: '' }))}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={handleAnalyzePhoto}
                  disabled={loading}
                  className="absolute bottom-2 left-2 right-2 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Sparkles className="w-4 h-4" /> {loading ? 'Analyzing...' : (activeCategory === 'herbicide' ? 'Run AI Weed Identification' : `Run AI ${config.targetLabel} Identification`)}
                </button>
              </div>
            )}
          </div>

          {/* Weed Details list */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-slate-600 font-bold">{activeCategory === 'herbicide' ? 'Weed Observations list' : `${config.targetLabel} Observations list`}</label>
              <button
                type="button"
                onClick={() => {
                  setVisitForm(prev => ({
                    ...prev,
                    weedDetails: [...(prev.weedDetails || []), { species: '', cover: '', status: 'Active' }]
                  }));
                }}
                className={`text-[10px] ${theme.textDark} font-bold flex items-center gap-0.5`}
              >
                <Plus className="w-3.5 h-3.5" /> Add {activeCategory === 'herbicide' ? 'Weed' : config.targetLabel}
              </button>
            </div>

            <div className="space-y-2">
              {(visitForm.weedDetails || []).map((weed, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                  <input
                    type="text"
                    placeholder={activeCategory === 'herbicide' ? 'Weed species (Scientific/Common)' : `${config.targetLabel} (Scientific/Common)`}
                    value={weed.species}
                    onChange={e => {
                      const updated = [...visitForm.weedDetails];
                      updated[idx].species = e.target.value;
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="flex-1 px-2.5 py-1.5 bg-white border rounded text-xs"
                  />
                  <input
                    type="number"
                    placeholder={config.primaryMetric.unit ? `Value (${config.primaryMetric.unit})` : 'Value'}
                    value={weed.cover}
                    onChange={e => {
                      const updated = [...visitForm.weedDetails];
                      updated[idx].cover = Number(e.target.value);
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="w-16 px-2.5 py-1.5 bg-white border rounded text-xs"
                  />
                  <select
                    value={weed.status}
                    onChange={e => {
                      const updated = [...visitForm.weedDetails];
                      updated[idx].status = e.target.value;
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="w-24 px-1 py-1.5 bg-white border rounded text-[11px]"
                  >
                    <option value="Active">Active</option>
                    <option value="Slight Injury">Slight Injury</option>
                    <option value="Moderate Injury">Mod Injury</option>
                    <option value="Severe Injury">Sev Injury</option>
                    <option value="Dead/Desiccated">Dead</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = visitForm.weedDetails.filter((_, i) => i !== idx);
                      setVisitForm(prev => ({ ...prev, weedDetails: updated }));
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Notes</label>
            <textarea
              placeholder="Visit logs notes..."
              value={visitForm.notes}
              onChange={e => setVisitForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none h-16 text-xs"
            />
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 bg-emerald-700 text-white font-bold rounded-lg ${theme.hoverBg} transition`}
          >
            Save DAA Visit Log
          </button>
        </form>
      </Modal>

      {/* Hidden file input for quick action gallery uploads */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleQuickFileUpload}
        className="hidden"
      />
      <input
        type="file"
        ref={harvestFileRef}
        accept="image/*"
        onChange={handleQuickFileUpload}
        className="hidden"
      />

      {/* Camera Modal */}
      {isCameraOpen && (
        <CameraCapture
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handleQuickPhotoCapture}
        />
      )}

      {/* Cropper Modal */}
      {cropperOpen && (
        <CropperModal
          isOpen={cropperOpen}
          imageSrc={cropSource}
          onClose={() => { setCropperOpen(false); setCropSource(null); }}
          onCropComplete={handleCropComplete}
        />
      )}

      {/* Pending Photo Date Modal */}
      {pendingPhotoAnalysis && (
        <Modal isOpen={!!pendingPhotoAnalysis} onClose={() => setPendingPhotoAnalysis(null)} title="Photo Capture Date">
          <div className="space-y-4 font-sans text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Observation Date & Time</label>
              <input
                type="datetime-local"
                value={pendingPhotoAnalysis.date}
                onChange={e => setPendingPhotoAnalysis(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none"
              />
            </div>
            <button
              onClick={() => saveAndAnalyzePhoto(pendingPhotoAnalysis.dataUrl, pendingPhotoAnalysis.date, pendingPhotoAnalysis.targetTrial)}
              className={`w-full py-2 ${theme.bg} text-white font-bold rounded-lg transition`}
            >
              Analyze Photo & Save Visit
            </button>
          </div>
        </Modal>
      )}

      {/* Duplicate Formulation Modal */}
      {duplicateModal && (
        <Modal isOpen={!!duplicateModal} onClose={() => setDuplicateModal(null)} title="Duplicate Sub-Trial Spot">
          <div className="space-y-4 font-sans text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Select Formulation for New Trial Spot *</label>
              <select
                value={duplicateFormulation}
                onChange={e => setDuplicateFormulation(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value="">-- Choose Formulation --</option>
                {state.formulations?.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Date</label>
              <input
                type="datetime-local"
                value={duplicateDate}
                onChange={e => setDuplicateDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">Dosage</label>
              <input
                type="text"
                value={duplicateDosage}
                onChange={e => setDuplicateDosage(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDuplicateModal(null)} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button type="button" onClick={handleDuplicateConfirm} className="px-4 py-2 bg-emerald-700 text-white rounded-lg">Duplicate</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Floating Selection Bar for spots */}
      {selectedForBulk.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50">
          <span className={`font-bold text-sm`}><span className={`${theme.bgSecondary} px-2 py-0.5 rounded-full mr-2`}>{selectedForBulk.size}</span>Selected</span>
          <div className="h-4 w-px bg-slate-600" />
          <button
            onClick={() => {
              const sel = subTrials.filter(t => selectedForBulk.has(t.ID));
              checkDownload(exportMasterCSV, activeProject, sel);
            }}
            className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition"
          >
            <FileText className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleBulkDeleteSubTrials}
            className="flex items-center gap-1.5 text-sm hover:text-red-400 transition"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
          <button onClick={() => setSelectedForBulk(new Set())} className="ml-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pendingHarvestAiResult && (
        <Modal
          isOpen={true}
          onClose={() => setPendingHarvestAiResult(null)}
          title="AI Harvest Analysis Results"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              AI has completed the analysis. Please review the suggested values and confirm if you want to apply them:
            </p>
            
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border">
              {pendingHarvestAiResult.harvestDate && (
                <div className="col-span-2 border-b pb-1.5 mb-1">
                  <span className="font-semibold text-slate-500">Suggested Date:</span>{' '}
                  <span className="font-bold text-slate-800">{pendingHarvestAiResult.harvestDate}</span>
                </div>
              )}
              <div>
                <span className="font-semibold text-slate-500">Fruit Count:</span>{' '}
                <span className="font-bold text-slate-800">{pendingHarvestAiResult.fruitCount}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Defects/Notes:</span>{' '}
                <span className="font-bold text-slate-800 truncate block">{pendingHarvestAiResult.defects || 'None'}</span>
              </div>
              <div className="col-span-2 border-t pt-2 mt-1">
                <p className="font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Suggested Weights (Needs Confirmation)
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-emerald-50 border border-emerald-100 p-2 rounded">
                    <span className="block text-slate-500 font-semibold">Marketable Weight:</span>
                    <span className="text-emerald-700 font-bold text-sm">{pendingHarvestAiResult.marketableWeight} g</span>
                  </div>
                  <div className="bg-red-50 border border-red-100 p-2 rounded">
                    <span className="block text-slate-500 font-semibold">Unmarketable Weight:</span>
                    <span className="text-red-700 font-bold text-sm">{pendingHarvestAiResult.unmarketableWeight} g</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingHarvestAiResult(null)}
                className="flex-1 py-2 border rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setHarvestForm(prev => ({
                    ...prev,
                    harvestDate: pendingHarvestAiResult.harvestDate || prev.harvestDate || new Date().toISOString().split('T')[0],
                    actualFruitCount: pendingHarvestAiResult.fruitCount ?? prev.actualFruitCount,
                    actualMarketableWeight: pendingHarvestAiResult.marketableWeight ?? prev.actualMarketableWeight,
                    actualUnmarketableWeight: pendingHarvestAiResult.unmarketableWeight ?? prev.actualUnmarketableWeight,
                    notes: pendingHarvestAiResult.defects ? `${prev.notes ? prev.notes + ' | ' : ''}AI: ${pendingHarvestAiResult.defects}` : prev.notes
                  }));
                  setPendingHarvestAiResult(null);
                  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI values applied successfully!', type: 'success' } }));
                }}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
              >
                Accept Suggestions & Apply
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
