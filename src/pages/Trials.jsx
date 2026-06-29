import React, { useState, useMemo, useRef, useEffect, useCallback, useDeferredValue } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addTrial, deleteTrial, updateTrial, uploadPhoto, apiCall, validateCategoryDataOperation } from '../services/dataLayer.js';
import {
  Plus, Trash2, Edit, Copy, ChevronRight, Activity, MapPin, Calendar,
  CheckCircle, Camera, Grid, Info, Sparkles, Search, Filter, X,
  FileText, Printer, BarChart3, Eye, CloudRain, Wind, Thermometer,
  Droplets, Image as ImageIcon, FolderPlus, FlaskConical, User, Hash, SlidersHorizontal,
  QrCode, BrainCircuit, TrendingDown, Download, RefreshCw, Leaf,
  Navigation, FolderOpen, Lock, Unlock,
  FileDown, Share2, MoreVertical, FileSpreadsheet,
  FileCode, MonitorPlay, Archive, Pencil, ScanLine, Crop, Clock, Calculator, Loader2
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { resolvePhotoSrc, getPhotoThumbnailSrc, isPhotoBroken, getDriveFileId } from '../utils/photoUtils.js';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue, calculateEfficacy } from '../utils/categoryConfig.js';
import { calculateDAA, toDateKey, formatPhotoDate, toDatetimeLocal, formatDate, formatDateTime, parseDateFromFilename } from '../utils/dateUtils.js';
import { normalizeObservation } from '../utils/categoryObservationUtils.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import CameraCapture from '../components/CameraCapture.jsx';
import CropperModal from '../components/CropperModal.jsx';
import CategoryValidationAlert, { showCategoryValidationToast } from '../components/CategoryValidationAlert.jsx';
import GridWeedCoverTool from '../components/GridWeedCoverTool.jsx';
import PhotoAnalyzerView from '../components/PhotoAnalyzerView.jsx';
import { analyzePhoto, analyzePhotosBatch, identifyWeedFromPhoto as identifyWeedFromPhotoService, getAPIKeys, generateTextWithAI, parseHarvestTextLog } from '../services/multiProviderAI.js';
import TrialCard from '../components/TrialCard.jsx';
import {
  generateComprehensivePdf,
  generateScientificReport,
  generatePpt,
  exportToCSV,
  exportMultipleTrialsToCSV,
  exportAllTrialsCSV,
  exportJson as exportJsonFile,
  exportFieldReportTxt,
  exportHtmlReport,
  exportTrialDocx,
  shareTrial as shareTrialFn,
} from '../services/trialReports.js';
import { AdvancedReportGenerator } from '../services/advancedReportGenerator.js';
import { fetchWeather, fetchSoilData } from '../services/weather.js';
import { EPPO_CODES, BBCH_STAGES, lookupEPPO } from '../utils/eppoBBCHData.js';
import { exportToARM, importARMCSV } from '../services/armExporter.js';
import { detectOutliers } from '../utils/statsUtils.js';
import AppSharingModal from '../components/AppSharingModal.jsx';
import SprayCalculatorModal from '../components/SprayCalculatorModal.jsx';
import TrialDesignGuideModal from '../components/TrialDesignGuideModal.jsx';
import QRCodeLib from 'qrcode';

const RESULT_COLORS = {
  'Excellent': 'bg-emerald-100 text-emerald-700',
  'Good': 'bg-blue-100 text-blue-700',
  'Fair': 'bg-amber-100 text-amber-700',
  'Poor': 'bg-red-100 text-red-700',
  'Control': 'bg-purple-100 text-purple-700',
};

const emptyForm = (category = 'herbicide') => {
  const catConfig = getCategoryConfig(category);
  const base = {
    Category: category,
    ProjectID: '', BlockID: '', FormulationName: '', InvestigatorName: '',
    Date: toDatetimeLocal(new Date()), Location: '', Dosage: '',
    Lat: '', Lon: '',
    Result: '', Notes: '', Conclusion: '',
    IsControl: false, IsStandardCheck: false, IsCompleted: false,
    ControlFinalized: false, FinalizationDate: '', FinalControlDuration: '',
    Temperature: '', Humidity: '', Windspeed: '', Rain: '',
    Replication: '', PlotNumber: '',
    BBCHCode: '', GPSLatitude: '', GPSLongitude: '',
    SoilPH: '', SoilClay: '', SoilSand: '', SoilOC: '', SoilTexture: '',
    YieldValue: '', YieldUnit: 't/ha', YieldNotes: '', GrainMoisture: '', ThousandGrainWeight: '', HarvestDAA: '',
    IsLive: true,
    ApplicationTiming: '',
    // Agronomic metadata
    Crop: '', Variety: '',
    PreviousCrop: '', IrrigationMethod: '', PlantPopulation: '',
  };
  // Add category-specific fields with empty defaults
  catConfig.specificFields.forEach(f => {
    if (!(f.key in base)) base[f.key] = '';
  });
  return base;
};

const fuzzyMatch = (text, query) => {
  if (!text) return false;
  text = text.toLowerCase();
  query = query.toLowerCase().trim();
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(token => {
    if (text.includes(token)) return true;
    let searchIdx = 0;
    for (let i = 0; i < token.length; i++) {
      searchIdx = text.indexOf(token[i], searchIdx);
      if (searchIdx === -1) return false;
      searchIdx++;
    }
    return true;
  });
};

export default function Trials({ onMenuClick }) {
  const { state, updateState, getAppState, dispatch } = useAppState();
  const { isViewer, user, isAdmin, isDeveloper } = useAuth();
  const canDownload = !isViewer && user?.tabPermissions?.['Allow Downloads'] !== false;

  const isOwnData = useCallback((record) => {
    if (isAdmin) return true;
    if (!record) return true;
    const ownUid = user?.uid || user?.ID || user?.id;
    return !record.CreatedBy || record.CreatedBy === ownUid;
  }, [user, isAdmin]);
  const location = useLocation();
  const navigate = useNavigate();
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);

  // ── DERIVED DATA ───────────────────────────────────────────────────
  const trials = (state.trials || []).filter(t => t.Category === activeCategory || (!t.Category && activeCategory === 'herbicide'));
  const formulations = (state.formulations || []).filter(f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide'));
  const projects = (state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide'));

  // Memoized project lookup for TrialCard and groupings
  const projectMap = useMemo(() => {
    const map = {};
    projects.forEach(p => { map[p.ID] = p; });
    return map;
  }, [projects]);

  // --- List view state ---
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  // ⚡ Bolt: Defer search value to prevent blocking the main thread during typing on large datasets
  const deferredSearch = useDeferredValue(search);
  const [filterFormulation, setFilterFormulation] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState(new Set());
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = useCallback((sectionId) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDesignGuideOpen, setIsDesignGuideOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingTrial, setSharingTrial] = useState(null);

  const handleOpenShareModal = useCallback((trial) => {
    setSharingTrial(trial);
    setIsShareModalOpen(true);
  }, []);

  const handleSaveSharing = useCallback(async (sharedWith, sharedWithEdit) => {
    if (!sharingTrial) return;
    setIsShareModalOpen(false);
    
    const updatedTrial = {
      ...sharingTrial,
      SharedWith: sharedWith,
      SharedWithEdit: sharedWithEdit
    };
    const newTrials = state.trials.map(t => t.ID === sharingTrial.ID ? updatedTrial : t);
    updateState({ trials: newTrials });

    try {
      await updateTrial(updatedTrial, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sharing permissions updated successfully', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to update sharing permissions', type: 'error' } }));
      updateState({ trials: state.trials });
    }
  }, [sharingTrial, state.trials, updateState, getAppState]);
  const [customiseReportModalOpen, setCustomiseReportModalOpen] = useState(false);
  const [reportFieldSelection, setReportFieldSelection] = useState({});
  const [pendingReportExport, setPendingReportExport] = useState(null);
  const [editingTrial, setEditingTrial] = useState(null);
  const [formData, setFormData] = useState(emptyForm(activeCategory));

  // --- Detail modal ---
  const [activeTrial, setActiveTrial] = useState(null);
  const detailTrial = activeTrial ? (trials.find(t => t.ID === activeTrial.ID) || activeTrial) : null;
  const [detailTab, setDetailTab] = useState('info');
  const [selectedPhotoForDetails, setSelectedPhotoForDetails] = useState(null);

  // --- Observation modal ---
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [editingObsIdx, setEditingObsIdx] = useState(null);
  const [quickEditObs, setQuickEditObs] = useState(null); // { obsIdx, fieldKey, label, value }
  const [obsForm, setObsForm] = useState({ daa: '', date: toDatetimeLocal(new Date()), notes: '', weedDetails: [], weatherTemp: '', weatherHumidity: '', weatherWind: '', weatherRain: '', bbchStage: '', phytotoxicityPct: '', phytotoxicityNotes: '' });

  // --- Plot & Site Data collapsible ---
  const [plotDataOpen, setPlotDataOpen] = useState(false);

  // --- Baseline warning dialog ---
  const [baselineWarningOpen, setBaselineWarningOpen] = useState(false);
  const [pendingObsSave, setPendingObsSave] = useState(null);

  // --- Application modal ---
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [editingAppIdx, setEditingAppIdx] = useState(null);
  const [appForm, setAppForm] = useState({
    code: '',
    date: toDatetimeLocal(new Date()),
    dosage: '',
    cropStage: '',
    targetStage: '',
    method: 'Foliar Spray',
    temp: '',
    humidity: '',
    windspeed: '',
    rain: 'No',
    notes: '',
    adjuvant: '',
    tankMix: '',
  });
  const [isFetchingAppWeather, setIsFetchingAppWeather] = useState(false);

  // --- Bulk Edit modal ---
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ InvestigatorName: '', Location: '', Result: '', Notes: '', Date: '', Dosage: '', Replication: '', TrialDesign: '', MainFactor: '', SubFactor: '' });

  // --- Date range filter ---
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  // --- GPS fetch ---
  const [gpsFetching, setGpsFetching] = useState(false);

  // --- Export menu ---
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  const armFileInputRef = useRef(null);

  const handleARMImportClick = () => {
    armFileInputRef.current?.click();
  };

  const handleARMImportChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const csvText = evt.target?.result;
      if (typeof csvText !== 'string') return;
      try {
        const importedTrials = importARMCSV(csvText);
        if (importedTrials.length === 0) {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No trials found in the CSV file or invalid format.', type: 'error' } }));
          return;
        }

        const updatedTrials = [...trials];
        for (const payload of importedTrials) {
          updatedTrials.push(payload);
          try {
            await addTrial(payload, getAppState);
          } catch (dbErr) {
            console.error('Failed to add trial in DB:', dbErr);
          }
        }
        updateState({ trials: updatedTrials });
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Successfully imported ${importedTrials.length} trials!`, type: 'success' } }));
      } catch (err) {
        console.error(err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to import ARM CSV: ' + err.message, type: 'error' } }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [trials, updateState, getAppState]);


  // --- Card 3-dot menus ---
  const [openCardMenu, setOpenCardMenu] = useState(null);

  // --- Photo edit modal ---
  const [photoEditModal, setPhotoEditModal] = useState(null); // { idx, label, date }

  // --- Photo date prompt (shown after crop, before AI analysis) ---
  const [pendingPhotoAnalysis, setPendingPhotoAnalysis] = useState(null); // { dataUrl, date }

  // --- AI single generation ---
  const [aiGenRunning, setAiGenRunning] = useState(false);

  // --- Duplicate modal (formulation picker) ---
  const [duplicateModal, setDuplicateModal] = useState(null); // trial to duplicate
  const [duplicateFormulation, setDuplicateFormulation] = useState('');
  const [duplicateDate, setDuplicateDate] = useState('');
  const [duplicateDosage, setDuplicateDosage] = useState('');

  // --- Quick-photo target (from card Photo button) ---
  const [quickPhotoTrial, setQuickPhotoTrial] = useState(null);

  // --- Camera & Grid ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [gridCoverPct, setGridCoverPct] = useState(0);
  const [cameraMode, setCameraMode] = useState('general');
  const fileInputRef = useRef(null);
  const harvestFileRef = useRef(null);

  // --- Cropper ---
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const quickActionTrialRef = useRef(null);
  const cropCallbackRef = useRef(null);

  // --- QR Code ---
  const qrCanvasRef = useRef(null);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [qrMode, setQrMode] = useState('offline'); // 'offline' | 'online'

  // --- AI Summary ---
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [syncingPhotos, setSyncingPhotos] = useState(false);
  const [syncingAllPhotos, setSyncingAllPhotos] = useState(false);
  const [syncHealOnly, setSyncHealOnly] = useState(true);

  // --- AI weed cover detection ---
  const [detectingCover, setDetectingCover] = useState(false);
  const [coverDetectResult, setCoverDetectResult] = useState(null);
  const obsPhotoRef = useRef(null);

  // --- Weed ID from photo ---
  const [weedIdLoading, setWeedIdLoading] = useState(false);
  const [weedIdResult, setWeedIdResult] = useState(null);
  const weedIdInputRef = useRef(null);

  // --- Photo Analyzer (bounding box overlay) ---
  const [photoAnalyzerOpen, setPhotoAnalyzerOpen] = useState(false);
  const [photoAnalyzerUrl, setPhotoAnalyzerUrl] = useState(null);
  const [photoAnalyzerResults, setPhotoAnalyzerResults] = useState([]);
  const [photoAnalyzerLoading, setPhotoAnalyzerLoading] = useState(false);

  // --- AI Batch Photo Analysis ---
  const [aiBatchRunning, setAiBatchRunning] = useState(false);
  const [aiBatchProgress, setAiBatchProgress] = useState({ current: 0, total: 0, message: '' });
  const [aiBatchModalOpen, setAiBatchModalOpen] = useState(false);

  // --- Bulk QR Card Print ---
  const [isBulkQrModalOpen, setIsBulkQrModalOpen] = useState(false);
  const [qrCardSize, setQrCardSize] = useState(
    state.settings?.cardSize === 'A4' ? 'a4' : state.settings?.cardSize === 'A6' ? 'a6' : 'id-card'
  );
  const [qrFields, setQrFields] = useState({
    formulationName: true,
    investigator: true,
    date: true,
    dosage: true,
    targetField: true,
    location: true,
    designDetails: true,
    trialId: true,
    logo: true,
  });
  const bulkQrRef = useRef(null);

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

  // --- Sprayer Calculator & Standardized Autocomplete ---
  const [isSprayCalcOpen, setIsSprayCalcOpen] = useState(false);
  const [eppoSearchQuery, setEppoSearchQuery] = useState('');
  const [showEppoDropdown, setShowEppoDropdown] = useState(false);

  const renderTargetFieldAutocomplete = (fieldKey, label, ringColor = 'focus:ring-emerald-400', eppoType = 'weed') => {
    return (
      <div className="relative">
        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{label} (EPPO)</label>
        <input 
          type="text" 
          value={formData[fieldKey] || ''} 
          onChange={e => {
            setFormData(prev => ({...prev, [fieldKey]: e.target.value}));
            setEppoSearchQuery(e.target.value);
            setShowEppoDropdown(fieldKey);
          }} 
          onFocus={() => {
            setEppoSearchQuery(formData[fieldKey] || '');
            setShowEppoDropdown(fieldKey);
          }}
          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${ringColor}`} 
          placeholder={`Search EPPO code or type...`} 
        />
        {showEppoDropdown === fieldKey && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {EPPO_CODES.filter(item => 
              item.type === eppoType && 
              (item.commonName.toLowerCase().includes(eppoSearchQuery.toLowerCase()) || 
               item.scientificName.toLowerCase().includes(eppoSearchQuery.toLowerCase()) ||
               item.code.toLowerCase().includes(eppoSearchQuery.toLowerCase()))
            ).map(item => (
              <div 
                key={item.code} 
                onClick={() => {
                  setFormData(prev => ({...prev, [fieldKey]: `${item.commonName} (${item.scientificName}) [${item.code}]`}));
                  setShowEppoDropdown(false);
                }}
                className="px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex justify-between dark:text-slate-300"
              >
                <span className="font-semibold">{item.commonName}</span>
                <span className="text-slate-400 italic text-[10px]">{item.scientificName} ({item.code})</span>
              </div>
            ))}
            <div 
              onClick={() => setShowEppoDropdown(false)}
              className="px-3 py-1.5 text-[10px] text-center text-slate-400 bg-slate-50 dark:bg-slate-800 border-t cursor-pointer"
            >
              Close Options
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- CRASH DRAFT RECOVERY ---
  const [recoveryDraft, setRecoveryDraft] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('trial_draft_recovery');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.formData) {
          setRecoveryDraft(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse recovery draft:', e);
    }
  }, []);

  const handleRestoreRecoveryDraft = () => {
    if (recoveryDraft) {
      setFormData(recoveryDraft.formData);
      setEditingTrial(recoveryDraft.editingTrial);
      setIsModalOpen(true);
      localStorage.removeItem('trial_draft_recovery');
      setRecoveryDraft(null);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Draft restored successfully!', type: 'success' } }));
    }
  };

  const handleDismissRecoveryDraft = () => {
    localStorage.removeItem('trial_draft_recovery');
    setRecoveryDraft(null);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Recovered draft discarded', type: 'info' } }));
  };

  useEffect(() => {
    if (isModalOpen && formData) {
      window.currentTrialDraft = {
        formData,
        editingTrial,
        activeCategory,
        timestamp: Date.now()
      };
    } else {
      window.currentTrialDraft = null;
    }
    return () => {
      window.currentTrialDraft = null;
    };
  }, [isModalOpen, formData, editingTrial, activeCategory]);

  // ── ROUTING EFFECT ─────────────────────────────────────────────────
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const focusId = searchParams.get('focus');
    if (focusId) {
      const trialToFocus = state.trials?.find(t => t.ID === focusId);
      if (trialToFocus) {
        setActiveTrial(trialToFocus);
        setDetailTab('info');
      }
    }

    const addNew = searchParams.get('addNew');
    const pId = searchParams.get('projectId');
    const bId = searchParams.get('blockId');
    if (addNew === 'true') {
      navigate('/trials', { replace: true });
      const initialForm = emptyForm(activeCategory);
      initialForm.ProjectID = pId || '';
      initialForm.BlockID = bId || '';
      if (pId) {
        const proj = (state.projects || []).find(p => String(p.ID) === String(pId));
        if (proj) {
          initialForm.InvestigatorName = proj.Investigator || '';
          initialForm.Location = proj.Location || '';
          initialForm.Lat = proj.Lat || '';
          initialForm.Lon = proj.Lon || '';
          initialForm.Dosage = proj.Dosage || '';
        }
      }
      if (bId) {
        const block = (state.blocks || []).find(b => String(b.ID) === String(bId));
        if (block) {
          initialForm.Replication = block.ReplicationNum || '';
        }
      }
      setFormData(initialForm);
      setEditingTrial(null);
      setIsModalOpen(true);
    }
  }, [location.search, state.trials, state.projects, state.blocks, activeCategory, navigate]);

  // Keep activeTrial in sync with the global state (e.g. after sync updates)
  useEffect(() => {
    if (activeTrial) {
      const latestTrial = state.trials?.find(t => t.ID === activeTrial.ID);
      if (latestTrial && JSON.stringify(latestTrial) !== JSON.stringify(activeTrial)) {
        setActiveTrial(latestTrial);
      }
    }
  }, [state.trials, activeTrial]);

  // Sync local selectedForBulk to global selectedTrials - with category filtering
  useEffect(() => {
    const matched = (state.trials || []).filter(t => 
      selectedForBulk.has(t.ID) && ((t.Category || 'herbicide') === activeCategory)
    );
    updateState({ selectedTrials: matched });
  }, [selectedForBulk, state.trials, updateState, activeCategory]);



  const filteredTrials = useMemo(() => {
    let list = [...trials];
    if (activeTab === 'standard') list = list.filter(t => !t.ProjectID);
    else if (activeTab === 'rcbd') list = list.filter(t => !!t.ProjectID);
    else if (activeTab === 'control') list = list.filter(t => (t.IsControl === true || t.IsControl === 'true') && !t.ProjectID);
    else if (activeTab === 'finalized') list = list.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');

    if (deferredSearch) {
      list = list.filter(t => {
        const searchParts = [
          t.FormulationName,
          t.FormulationID,
          t.InvestigatorName,
          t.Location,
          t.WeedSpecies,
          t.ID,
          t.Notes,
          t.Conclusion,
          t.Replication,
          t.PlotNumber,
          t.Date
        ].filter(Boolean).join(' ');
        return fuzzyMatch(searchParts, deferredSearch);
      });
    }
    if (filterFormulation) list = list.filter(t => t.FormulationID === filterFormulation || t.FormulationName === filterFormulation);
    if (filterResult) list = list.filter(t => (t.Result || '') === filterResult);
    if (filterProject) list = list.filter(t => t.ProjectID === filterProject);

    if (filterDateStart) list = list.filter(t => t.Date && t.Date >= filterDateStart);
    if (filterDateEnd)   list = list.filter(t => t.Date && t.Date <= filterDateEnd);
    list.sort((a, b) => {
      if (sortBy === 'date-desc') {
        const dateDiff = new Date(b.Date || 0) - new Date(a.Date || 0);
        if (dateDiff !== 0) return dateDiff;

        // For pot trials with same date, sort by replication block, then row, then column/pot number
        const aIsPot = a.TrialDesign === 'PotTrial' || a.PotLabel;
        const bIsPot = b.TrialDesign === 'PotTrial' || b.PotLabel;
        if (aIsPot && bIsPot) {
          const aRep = parseInt(a.Replication) || 0;
          const bRep = parseInt(b.Replication) || 0;
          if (aRep !== bRep) return aRep - bRep;

          const aRow = parseInt(a.PotRow) || 0;
          const bRow = parseInt(b.PotRow) || 0;
          if (aRow !== bRow) return aRow - bRow;

          const aCol = parseInt(a.PotCol) || 0;
          const bCol = parseInt(b.PotCol) || 0;
          return aCol - bCol;
        }

        // Secondary sort for same date: newest DateUpdatedAt / CreatedAt on top
        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
      }
      if (sortBy === 'date-asc') {
        const dateDiff = new Date(a.Date || 0) - new Date(b.Date || 0);
        if (dateDiff !== 0) return dateDiff;

        // For pot trials with same date, sort by replication block, then row, then column/pot number
        const aIsPot = a.TrialDesign === 'PotTrial' || a.PotLabel;
        const bIsPot = b.TrialDesign === 'PotTrial' || b.PotLabel;
        if (aIsPot && bIsPot) {
          const aRep = parseInt(a.Replication) || 0;
          const bRep = parseInt(b.Replication) || 0;
          if (aRep !== bRep) return aRep - bRep;

          const aRow = parseInt(a.PotRow) || 0;
          const bRow = parseInt(b.PotRow) || 0;
          if (aRow !== bRow) return aRow - bRow;

          const aCol = parseInt(a.PotCol) || 0;
          const bCol = parseInt(b.PotCol) || 0;
          return aCol - bCol;
        }

        // Secondary sort for same date: oldest DateUpdatedAt / CreatedAt on top
        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0);
      }
      if (sortBy === 'name') return (a.FormulationName || '').localeCompare(b.FormulationName || '');
      if (sortBy === 'obs') return (safeJsonParse(b.EfficacyDataJSON, []).length) - (safeJsonParse(a.EfficacyDataJSON, []).length);
      if (sortBy === 'shared') {
        const ownUid = user?.uid || user?.ID || user?.id;
        const aShared = !!((a.CreatedBy && a.CreatedBy !== ownUid) || (Array.isArray(a.SharedWith) && a.SharedWith.length > 0));
        const bShared = !!((b.CreatedBy && b.CreatedBy !== ownUid) || (Array.isArray(b.SharedWith) && b.SharedWith.length > 0));
        if (aShared === bShared) {
          return new Date(b.Date || 0) - new Date(a.Date || 0);
        }
        return bShared ? 1 : -1;
      }
      return 0;
    });
    return list;
  }, [trials, activeTab, deferredSearch, filterFormulation, filterResult, filterProject, sortBy, filterDateStart, filterDateEnd, user]);

  const groupedRcbdTrials = useMemo(() => {
    if (activeTab !== 'rcbd') return { groups: {}, orphaned: [] };
    const groups = {};
    const orphaned = [];
    filteredTrials.forEach(t => {
      const pid = t.ProjectID;
      if (pid && projectMap[pid]) {
        if (!groups[pid]) groups[pid] = [];
        groups[pid].push(t);
      } else {
        orphaned.push(t);
      }
    });
    return { groups, orphaned };
  }, [filteredTrials, activeTab, projectMap]);

  // ── CRUD ───────────────────────────────────────────────────────────
  const handleOpenModal = useCallback((trial = null, isDuplicate = false) => {
    setEditingTrial(isDuplicate ? null : trial);
    if (trial) {
      setFormData({
        ProjectID: trial.ProjectID || '', BlockID: trial.BlockID || '',
        FormulationName: isDuplicate ? `${trial.FormulationName} (Copy)` : (trial.FormulationName || ''),
        InvestigatorName: trial.InvestigatorName || '',
        Date: isDuplicate ? toDatetimeLocal(new Date()) : (trial.Date ? toDatetimeLocal(trial.Date) : ''),
        Location: trial.Location || '', Dosage: trial.Dosage || '',
        Lat: trial.Lat || '', Lon: trial.Lon || '',
        WeedSpecies: trial.WeedSpecies || '', Result: trial.Result || '',
        Notes: trial.Notes || '', Conclusion: trial.Conclusion || '',
        IsControl: trial.IsControl === true || trial.IsControl === 'true',
        IsStandardCheck: trial.IsStandardCheck === true || trial.IsStandardCheck === 'true',
        IsCompleted: isDuplicate ? false : (trial.IsCompleted === true || trial.IsCompleted === 'true'),
        ControlFinalized: isDuplicate ? false : (trial.ControlFinalized === true || trial.ControlFinalized === 'true'),
        FinalizationDate: isDuplicate ? '' : (trial.FinalizationDate ? toDatetimeLocal(trial.FinalizationDate) : ''),
        FinalControlDuration: isDuplicate ? '' : (trial.FinalControlDuration || ''),
        Temperature: trial.Temperature || '', Humidity: trial.Humidity || '',
        Windspeed: trial.Windspeed || '', Rain: trial.Rain || '',
        Replication: trial.Replication || '', PlotNumber: trial.PlotNumber || '',
        BBCHCode: trial.BBCHCode || '', GPSLatitude: trial.GPSLatitude || '', GPSLongitude: trial.GPSLongitude || '',
        SoilPH: trial.SoilPH || '', SoilClay: trial.SoilClay || '',
        SoilSand: trial.SoilSand || '', SoilOC: trial.SoilOC || '',
        SoilTexture: trial.SoilTexture || '',
        YieldValue: trial.YieldValue || '', YieldUnit: trial.YieldUnit || 't/ha',
        YieldNotes: trial.YieldNotes || '', GrainMoisture: trial.GrainMoisture || '',
        ThousandGrainWeight: trial.ThousandGrainWeight || '', HarvestDAA: trial.HarvestDAA || '',
        ApplicationTiming: trial.ApplicationTiming || '',
        WeedGrowthStage: trial.WeedGrowthStage || '',
        TrialDesign: trial.TrialDesign || 'RCBD',
        MainFactor: trial.MainFactor || '',
        SubFactor: trial.SubFactor || '',
        SubBlockID: trial.SubBlockID || '',
        PotRow: trial.PotRow || '',
        PotCol: trial.PotCol || '',
        PotLabel: trial.PotLabel || '',
        Crop: trial.Crop || '',
        Variety: trial.Variety || '',
        PreviousCrop: trial.PreviousCrop || '',
        IrrigationMethod: trial.IrrigationMethod || '',
        PlantPopulation: trial.PlantPopulation || '',
      });
    } else {
      setFormData({ ...emptyForm(activeCategory), InvestigatorName: state.auth?.user?.Name || state.auth?.user?.Username || '' });
    }
    setIsModalOpen(true);
  }, [state.auth?.user?.Name, state.auth?.user?.Username]);

  const fetchGpsWeather = useCallback(async () => {
    if (!navigator.geolocation) return;
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        setFormData(prev => ({ 
          ...prev, 
          Lat: lat.toFixed(8), 
          Lon: lon.toFixed(8), 
          Location: prev.Location || `${lat.toFixed(6)}, ${lon.toFixed(6)}` 
        }));
        try {
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
          const d = await r.json();
          const c = d.current;
          
          // Fetch soil data
          const soil = await fetchSoilData(lat, lon);
          
          setFormData(prev => {
            const updated = {
              ...prev,
              Lat: lat.toFixed(8),
              Lon: lon.toFixed(8),
              Location: prev.Location || `${lat.toFixed(6)}, ${lon.toFixed(6)}`
            };
            if (c) {
              updated.Temperature = c.temperature_2m ?? prev.Temperature;
              updated.Humidity = c.relative_humidity_2m ?? prev.Humidity;
              updated.Windspeed = c.wind_speed_10m ?? prev.Windspeed;
              updated.Rain = c.precipitation ?? prev.Rain;
            }
            if (soil) {
              updated.SoilPH = soil.soilPH ?? prev.SoilPH;
              updated.SoilClay = soil.soilClay ?? prev.SoilClay;
              updated.SoilSand = soil.soilSand ?? prev.SoilSand;
              updated.SoilOC = soil.soilOC ?? prev.SoilOC;
              updated.SoilTexture = soil.soilTexture ?? prev.SoilTexture;
            }
            return updated;
          });
          
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `GPS, weather & soil synced! (Accuracy: ±${accuracy.toFixed(1)}m)`, type: 'success' } }));
        } catch (error) { 
          console.error("Weather/soil sync error:", error);
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Location synced (±${accuracy.toFixed(1)}m), weather/soil fetch failed`, type: 'info' } })); 
        }
        setGpsFetching(false);
      }, 
      (err) => { 
        setGpsFetching(false); 
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `GPS Error: ${err.message}. Try moving to an open area.`, type: 'error' } })); 
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }, []);

  const handleMoveToProject = async (trial) => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot move trials.', type: 'error' } }));
      return;
    }
    if (!isOwnData(trial)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'This trial belongs to another scientist and cannot be modified.', type: 'error' } }));
      return;
    }
    const projectList = projects.map((p, i) => `${i + 1}. ${p.Name}`).join('\n');
    const choice = window.prompt(`Move trial to project:\n\n${projectList}\n\nEnter number:`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= projects.length) return;
    const updated = { ...trial, ProjectID: projects[idx].ID };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    try {
      await updateTrial({ ID: updated.ID, ProjectID: updated.ProjectID }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Moved to "${projects[idx].Name}"`, type: 'success' } }));
    } catch (e) {}
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot save or edit trials.', type: 'error' } }));
      return;
    }
    const isEdit = !!editingTrial;
    if (isEdit && !isOwnData(editingTrial)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'This trial belongs to another scientist and cannot be modified.', type: 'error' } }));
      return;
    }
    const formMatch = formulations.find(f => f.Name === formData.FormulationName);

    let dateUpdatedAt = isEdit ? editingTrial.DateUpdatedAt : new Date().toISOString();
    if (isEdit && editingTrial.Date !== formData.Date) {
      dateUpdatedAt = new Date().toISOString();
    }

    const finalFormData = { ...formData };

    // Task 58: If YieldValue is provided, persist it into EfficacyDataJSON at harvest DAA
    let baseEfficacyJSON = isEdit ? (editingTrial.EfficacyDataJSON || '[]') : '[]';
    if (finalFormData.YieldValue && !isNaN(parseFloat(finalFormData.YieldValue))) {
      const harvestDaa = finalFormData.HarvestDAA && !isNaN(parseInt(finalFormData.HarvestDAA))
        ? parseInt(finalFormData.HarvestDAA)
        : 999;
      const existingEfficacy = safeJsonParse(baseEfficacyJSON, []);
      const existingIdx = existingEfficacy.findIndex(o => Number(o.daa) === harvestDaa && o._isYieldRecord);
      const yieldRecord = {
        daa: harvestDaa,
        _isYieldRecord: true,
        yieldValue: parseFloat(finalFormData.YieldValue),
        yieldUnit: finalFormData.YieldUnit || 't/ha',
        grainMoisture: finalFormData.GrainMoisture ? parseFloat(finalFormData.GrainMoisture) : undefined,
        thousandGrainWeight: finalFormData.ThousandGrainWeight ? parseFloat(finalFormData.ThousandGrainWeight) : undefined,
        notes: finalFormData.YieldNotes || undefined,
        date: finalFormData.Date || new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        existingEfficacy[existingIdx] = { ...existingEfficacy[existingIdx], ...yieldRecord };
      } else {
        existingEfficacy.push(yieldRecord);
      }
      existingEfficacy.sort((a, b) => (a.daa || 0) - (b.daa || 0));
      baseEfficacyJSON = JSON.stringify(existingEfficacy);
    }

    // Task 58: Store structured yield details separately
    const yieldDetails = finalFormData.YieldValue ? {
      yieldValue: parseFloat(finalFormData.YieldValue),
      yieldUnit: finalFormData.YieldUnit || 't/ha',
      grainMoisture: finalFormData.GrainMoisture || undefined,
      thousandGrainWeight: finalFormData.ThousandGrainWeight || undefined,
      harvestDaa: finalFormData.HarvestDAA || 999,
      notes: finalFormData.YieldNotes || undefined,
    } : undefined;

    const payload = {
      ...(isEdit ? editingTrial : {}),
      ...finalFormData,
      FormulationID: formMatch?.ID || (isEdit ? editingTrial.FormulationID : ''),
      DateUpdatedAt: dateUpdatedAt,
      ...(yieldDetails ? { YieldDetails: JSON.stringify(yieldDetails) } : {}),
      ...(isEdit ? { EfficacyDataJSON: baseEfficacyJSON } : {
        ID: Date.now().toString(),
        EfficacyDataJSON: baseEfficacyJSON, PhotoURLs: '[]', WeedPhotosJSON: '[]',
        CreatedAt: new Date().toISOString(),
      }),
    };

    // Category validation before saving
    try {
      const operation = isEdit ? 'updateTrial' : 'addTrial';
      await validateCategoryDataOperation(operation, payload, getAppState);
    } catch (validationError) {
      if (validationError.validationError) {
        showCategoryValidationToast(validationError);
        return; // Stop the save operation
      }
      // If it's not a validation error, log it but continue
      console.warn('Validation check failed:', validationError);
    }

    const allTrials = getAppState().trials || [];
    const updatedTrials = isEdit
      ? allTrials.map(t => String(t.ID) === String(payload.ID) ? payload : t)
      : [...allTrials, payload];
    updateState({ trials: updatedTrials });
    setIsModalOpen(false);

    try {
      if (isEdit) {
        await updateTrial(payload, getAppState);
      } else {
        await addTrial(payload, getAppState);
      }
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Trial ${isEdit ? 'updated' : 'saved'}`, type: 'success' } }));
    } catch (err) {
      // Check if it's a category validation error
      if (err.validationError) {
        showCategoryValidationToast(err);
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save trial', type: 'error' } }));
      }
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot delete trials.', type: 'error' } }));
      return;
    }
    const trialToDelete = trials.find(t => t.ID === id);
    if (!isOwnData(trialToDelete)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'This trial belongs to another scientist and cannot be deleted.', type: 'error' } }));
      return;
    }
    if (!window.confirm('Delete this trial?')) return;
    updateState({ trials: trials.filter(t => t.ID !== id) });
    if (activeTrial?.ID === id) setActiveTrial(null);
    try {
      await deleteTrial({ ID: id }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete trial', type: 'error' } }));
    }
  };

  const handleFinalize = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot finalize trials.', type: 'error' } }));
      return;
    }
    if (!isOwnData(activeTrial)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'This trial belongs to another scientist and cannot be modified.', type: 'error' } }));
      return;
    }
    if (!activeTrial || !window.confirm('Finalize this trial?')) return;
    const updated = { ...activeTrial, IsCompleted: true };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, IsCompleted: true }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial finalized', type: 'success' } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to finalize', type: 'error' } }));
    }
  };

  const handleRestart = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot reactivate trials.', type: 'error' } }));
      return;
    }
    if (!isOwnData(activeTrial)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'This trial belongs to another scientist and cannot be modified.', type: 'error' } }));
      return;
    }
    if (!activeTrial || !window.confirm('Reactivate this trial?')) return;
    const updated = { ...activeTrial, IsCompleted: false };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, IsCompleted: false }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial reactivated', type: 'success' } }));
    } catch (e) {}
  };

  const handleScanHarvestPhotos = async () => {
    const photos = harvestForm.photos || [];
    if (photos.length === 0) return;
    setAiHarvestLoading(true);
    try {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI is analyzing your harvest photos...', type: 'info' } }));
      const primaryPhoto = photos[0];
      const result = await analyzePhoto(primaryPhoto, { 
        isHarvest: true, 
        category: activeCategory,
        treatment: activeTrial?.FormulationName,
        daa: 0 // Harvest photos are typically end-of-trial
      });
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

  // ── OBSERVATIONS ──────────────────────────────────────────────────
  // ── AI pixel-based weed cover detection (offline-capable) ────────────
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
          let sumExG = 0, sumNGRDI = 0;
          for (let i = 0; i < data.length; i += 4) {
            const R = data[i], G = data[i+1], B = data[i+2];
            total++;
            const rNorm = R / 255;
            const gNorm = G / 255;
            const bNorm = B / 255;
            const exg = 2 * gNorm - rNorm - bNorm;
            sumExG += exg;
            const ngrdi = (gNorm + rNorm) > 0 ? (gNorm - rNorm) / (gNorm + rNorm) : 0;
            sumNGRDI += ngrdi;

            const gli = (2*G - R - B) / (2*G + R + B + 1);
            if (gli > 0.05) { green++; }
            else {
              const max = Math.max(R,G,B), min = Math.min(R,G,B), diff = max - min;
              const h2 = max === 0 ? 0 : max === R ? 60*((G-B)/diff%6) : max === G ? 60*((B-R)/diff+2) : 60*((R-G)/diff+4);
              const s = max === 0 ? 0 : (diff/max)*100, v = max/2.55;
              if (h2 >= 20 && h2 <= 55 && s > 12 && v > 20 && v < 85) brown++;
            }
          }
          const cover = Math.round(((green + brown) / total) * 100);
          resolve({ 
            cover, 
            greenPct: Math.round((green/total)*100), 
            brownPct: Math.round((brown/total)*100), 
            exgMean: parseFloat((sumExG / total).toFixed(4)),
            ngrdiMean: parseFloat((sumNGRDI / total).toFixed(4)),
            confidence: Math.min(95, 60 + Math.round(total/2000)), 
            source: 'pixel' 
          });
        } catch(e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataUrl;
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.calculateExGIndex = async (src) => {
        return analyzeWeedCoverFromPixels(src);
      };
    }
  }, [analyzeWeedCoverFromPixels]);

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

      // Extract Drive file ID if this is a Google Drive URL
      const driveMatch = typeof imageUrl === 'string' && imageUrl.includes('drive.google.com') && imageUrl.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/);
      const driveFileId = driveMatch ? driveMatch[1] : null;

      const primaryObsField = getPrimaryObservationField(activeCategory);
      const fieldConfig = catConfig.observationFields?.find(f => f.key === primaryObsField);
      const promptText = activeCategory === 'herbicide'
        ? 'Analyze this field plot image. Estimate the percentage (0-100) of ground covered by weeds (both green and brown/burnt). Respond with ONLY a number like "45".'
        : `Analyze this field plot image for a ${catConfig.name} trial. Estimate the value of "${fieldConfig ? fieldConfig.label : primaryObsField}". Respond with ONLY a single numeric value (e.g. "25" or "4.2").`;

      if (driveFileId) {
        // Drive URL — canvas pixel analysis is CORS-blocked, use Gemini fileUri only
        const geminiKeys = getAPIKeys('gemini');
        if (!geminiKeys.length) {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Add a Gemini API key in Settings to analyse Drive photos', type: 'warning' } }));
          setDetectingCover(false);
          return null;
        }
        const fileUri = `https://drive.google.com/uc?export=download&id=${driveFileId}`;
        const models = ['gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];
        let successResult = null;
        for (const model of models) {
          for (const key of geminiKeys) {
            try {
              const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [
                  { text: promptText },
                  { fileData: { mimeType: 'image/jpeg', fileUri } }
                ]}] })
              });
              if (!resp.ok) continue;
              const d = await resp.json();
              const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              const m2 = txt.match(/[\d.]+/);
              if (m2) {
                const cover = parseFloat(m2[0]);
                successResult = { cover, confidence: 85, source: `AI (${model})`, greenPct: null, brownPct: null };
                break;
              }
            } catch (err) {
              console.warn(`Drive cover detection failed with ${model}:`, err.message);
            }
          }
          if (successResult) break;
        }
        if (successResult) {
          setCoverDetectResult(successResult);
          return successResult;
        }
        throw new Error('All Gemini models failed to return a valid numeric value from Drive file');
      }

      // Local data URL or regular remote URL — run pixel analysis first
      let dataUrl = imageUrl;
      if (typeof imageUrl === 'string' && !imageUrl.startsWith('data:')) {
        // Fetch remote URL to data URL so pixel analysis works
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
                      { text: promptText },
                      { inlineData: { mimeType, data: base64 } }
                    ]}] })
                  });
                  if (!resp.ok) continue;
                  const d = await resp.json();
                  const txt = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  const m2 = txt.match(/[\d.]+/);
                  if (m2) {
                    const cover = parseFloat(m2[0]);
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
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Cover detection failed: ' + e.message, type: 'error' } }));
      return null;
    } finally {
      setDetectingCover(false);
    }
  }, [state.settings, analyzeWeedCoverFromPixels]);

  // ── Climate risk audit ──────────────────────────────────────────────
  const getClimateRisks = useCallback((temp, wind, rain) => {
    const risks = [];
    const t = parseFloat(temp), w = parseFloat(wind), r = parseFloat(rain);
    if (isFinite(t)) {
      if (t > 30) risks.push({ type: 'warning', msg: `Heat stress risk (${t}°C > 30°C) — may reduce efficacy.` });
      if (t < 5)  {
        const cat = activeTrial?.Category || state?.activeCategory || 'herbicide';
        const msg = cat === 'herbicide' ? 'slow herbicide uptake.' :
                    cat === 'fungicide' ? 'slow fungicide absorption & disease latency.' :
                    cat === 'pesticide' ? 'reduced insect activity & pesticide contact.' :
                    cat === 'nutrition' ? 'reduced plant nutrient absorption.' :
                    cat === 'biostimulant' ? 'sluggish physiological response to biostimulants.' :
                    'slow chemical uptake.';
        risks.push({ type: 'info', msg: `Cold conditions (${t}°C) — ${msg}` });
      }
    }
    if (isFinite(w)) {
      if (w > 15) risks.push({ type: 'danger',  msg: `High wind (${w} km/h) — severe spray drift risk.` });
      else if (w > 10) risks.push({ type: 'warning', msg: `Moderate wind (${w} km/h) — use low-drift nozzles.` });
    }
    if (isFinite(r) && r > 0) risks.push({ type: 'danger', msg: `Rain (${r} mm) — wash-off risk if not rain-fast.` });
    return risks;
  }, [activeTrial?.Category, state?.activeCategory]);

  // ── Fetch weather for observation date ─────────────────────────────
  const fetchObsWeather = useCallback(async (date) => {
    if (!activeTrial?.Lat || !activeTrial?.Lon) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeTrial.Lat}&longitude=${activeTrial.Lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
      const r = await fetch(url);
      const d = await r.json();
      const c = d.current;
      if (c) {
        setObsForm(prev => ({ ...prev,
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
  }, [activeTrial]);

  // ── Detect statistical outliers ────────────────────────────────────
  const isObservationOutlier = useCallback((obs, daa) => {
    if (!detailTrial?.ProjectID || daa === undefined || daa === null) return null;
    const primaryObsField = getPrimaryObservationField(activeCategory);
    
    // Get all trials in the same project with the same treatment
    const peers = trials.filter(t => 
      t.ProjectID === detailTrial.ProjectID && 
      (t.FormulationName === detailTrial.FormulationName || t.FormulationID === detailTrial.FormulationID)
    );
    if (peers.length < 3) return null; // Outlier detection needs at least 3 values
    
    const obsValues = [];
    const obsPeerPairs = []; // keep track of which peer contributed which value
    
    peers.forEach(p => {
      const eff = validateEfficacyData(safeJsonParse(p.EfficacyDataJSON, []), activeCategory);
      const match = eff.find(o => Number(o.daa) === Number(daa));
      if (match) {
        const val = parseFloat(match[primaryObsField]);
        if (!isNaN(val)) {
          obsValues.push(val);
          obsPeerPairs.push({ trialId: p.ID, val });
        }
      }
    });
    
    if (obsValues.length < 3) return null;
    
    const outliers = detectOutliers(obsValues, 1.5);
    const currentValue = parseFloat(obs[primaryObsField]);
    
    // Check if the current value is flagged as an outlier
    const outlierMatch = outliers.find(out => {
      // Find the index in obsValues that corresponds to our current trial
      const peerIndex = obsPeerPairs.findIndex(pair => pair.trialId === detailTrial.ID && pair.val === currentValue);
      return peerIndex !== -1 && out.index === peerIndex;
    });
    
    return outlierMatch || null;
  }, [detailTrial, trials, activeCategory]);

  const identifyWeedFromPhoto = useCallback(async (imageDataUrl, openAnalyzer = false, photoIndex = null) => {
    if (openAnalyzer) {
      setPhotoAnalyzerUrl(imageDataUrl);
      setPhotoAnalyzerLoading(true);
      setPhotoAnalyzerResults([]);
      setPhotoAnalyzerOpen(true);
    }
    setWeedIdLoading(true);
    setWeedIdResult(null);

    // Try to retrieve cached bounds from targetPhoto to save tokens and load instantly
    const photos = activeTrial ? safeJsonParse(activeTrial.PhotoURLs, []).filter(p => !p.deleted) : [];
    let targetPhoto = null;
    let targetIdx = -1;

    if (photoIndex !== null && photos[photoIndex]) {
      targetPhoto = photos[photoIndex];
      targetIdx = photoIndex;
    } else {
      // Find by source
      const driveId1 = getDriveFileId(imageDataUrl);
      targetIdx = photos.findIndex(p => {
        const pSrc = typeof p === 'string' ? p : (p.fileData || p.url);
        if (pSrc === imageDataUrl) return true;
        if (driveId1 && getDriveFileId(pSrc) === driveId1) return true;
        return false;
      });
      if (targetIdx !== -1) {
        targetPhoto = photos[targetIdx];
      }
    }

    // Check if we have cached bounds on this photo
    const hasCachedBounds = targetPhoto && typeof targetPhoto === 'object' && Array.isArray(targetPhoto.bounds);

    if (hasCachedBounds) {
      setWeedIdResult(targetPhoto.bounds);
      if (openAnalyzer) {
        setPhotoAnalyzerResults(targetPhoto.bounds);
        setPhotoAnalyzerLoading(false);
      }
      setWeedIdLoading(false);
      
      // Sync with coverDetectResult to avoid contradiction
      const totalCover = targetPhoto.bounds.reduce((sum, w) => sum + (Number(w.cover) || 0), 0);
      const avgConf = Math.round((targetPhoto.bounds.reduce((sum, w) => sum + (Number(w.confidence) || 0), 0) / (targetPhoto.bounds.length || 1)) * 100);
      setCoverDetectResult({
        cover: totalCover,
        confidence: avgConf || 85,
        source: 'AI (Weed ID Sum)',
        greenPct: totalCover,
        brownPct: 0
      });
      return;
    }

    try {
      const weeds = await identifyWeedFromPhotoService(imageDataUrl, activeCategory);
      setWeedIdResult(weeds);
      if (openAnalyzer) setPhotoAnalyzerResults(weeds);
      
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

      // Save to memory (cache bounds in targetPhoto and persist)
      if (activeTrial && targetIdx !== -1) {
        const updatedPhotos = photos.map((p, idx) => {
          if (idx === targetIdx) {
            // Normalize to object format if it was a string
            if (typeof p === 'string') {
              const isDrive = p.includes('drive.google.com');
              return {
                [isDrive ? 'url' : 'fileData']: p,
                bounds: weeds
              };
            } else {
              return { ...p, bounds: weeds };
            }
          }
          return p;
        });
        const updatedTrial = { ...activeTrial, PhotoURLs: JSON.stringify(updatedPhotos) };
        updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
        setActiveTrial(updatedTrial);
        try {
          await updateTrial({ ID: updatedTrial.ID, PhotoURLs: updatedTrial.PhotoURLs }, getAppState);
        } catch (dbErr) {
          console.error('Failed to save cached bounds:', dbErr);
        }
      }
    } catch (e) {
      console.error('Weed ID failed:', e);
      const errFallback = [{ name: 'Unknown', commonName: e.message || 'No response from AI', cover: 0, growthStage: '', confidence: 0.5 }];
      setWeedIdResult(errFallback);
      if (openAnalyzer) setPhotoAnalyzerResults(errFallback);
    } finally {
      setWeedIdLoading(false);
      if (openAnalyzer) setPhotoAnalyzerLoading(false);
    }
  }, [activeCategory, activeTrial, trials, updateState, getAppState]);

  const openObsModal = (idx = null) => {
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const initialForm = {
      daa: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      weedDetails: [],
      weatherTemp: '',
      weatherHumidity: '',
      weatherWind: '',
      weatherRain: '',
      bbchStage: '',
      phytotoxicityPct: '',
      phytotoxicityNotes: ''
    };

    catConfig.observationFields?.forEach(f => {
      initialForm[f.key] = '';
    });

    if (idx !== null) {
      const obs = validateEfficacyData(safeJsonParse(activeTrial?.EfficacyDataJSON, []), activeCategory, true)[idx];
      const filledForm = { ...initialForm, ...obs };
      filledForm.daa = obs.daa ?? '';
      filledForm.date = obs.date || '';
      setObsForm(filledForm);
    } else {
      const today = new Date().toISOString().split('T')[0];
      const autoDaa = activeTrial?.Date ? calculateDAA(today, activeTrial.Date) : '';
      const newForm = { ...initialForm, date: today, daa: autoDaa };
      setObsForm(newForm);
    }
    setCoverDetectResult(null);
    setEditingObsIdx(idx);
    setIsObsModalOpen(true);
  };

  const calculateResultRating = (efficacyData, isControl = false, categoryId = 'herbicide', trial = null) => {
    if (isControl) return 'Control';
    if (!efficacyData || efficacyData.length === 0) return 'Unrated';
    const sorted = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
    const latest = sorted[sorted.length - 1];
    if (!latest) return 'Unrated';

    const primaryObsField = getPrimaryObservationField(categoryId);
    const val = parseFloat(latest[primaryObsField] ?? 0) || 0;

    let controlVal = null;
    
    // For designs like RCBD or PotTrial, match the specific block/replication control if available
    if (trial && trial.ProjectID) {
      const projectTrials = (getAppState().trials || []).filter(t => String(t.ProjectID) === String(trial.ProjectID));
      
      let controlTrial = null;
      if (trial.TrialDesign === 'PotTrial' || trial.TrialDesign === 'RCBD') {
        controlTrial = projectTrials.find(t => t.IsControl && t.Replication === trial.Replication);
      }
      if (!controlTrial) {
        controlTrial = projectTrials.find(t => t.IsControl);
      }

      if (controlTrial && controlTrial.EfficacyDataJSON) {
        const controlEff = validateEfficacyData(safeJsonParse(controlTrial.EfficacyDataJSON, []), categoryId, true);
        const targetDaa = latest.daa;
        const matchingControlObs = controlEff.find(o => Number(o.daa) === Number(targetDaa));
        if (matchingControlObs) {
          controlVal = parseFloat(matchingControlObs[primaryObsField] ?? 0) || 0;
        } else if (controlEff.length > 0) {
          const sortedControl = [...controlEff].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
          controlVal = parseFloat(sortedControl[sortedControl.length - 1]?.[primaryObsField] ?? 0) || 0;
        }
      }
    }

    if (controlVal === null || controlVal === undefined || controlVal === 0) {
      const baseline = sorted[0];
      controlVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
    }

    const efficacy = calculateEfficacy(categoryId, val, controlVal);

    if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
      if (efficacy >= 15) return 'Excellent';
      if (efficacy >= 8) return 'Good';
      if (efficacy >= 3) return 'Fair';
      return 'Poor';
    } else {
      if (efficacy >= 85) return 'Excellent';
      if (efficacy >= 70) return 'Good';
      if (efficacy >= 50) return 'Fair';
      return 'Poor';
    }
  };

  const handleSaveObs = async (e) => {
    e.preventDefault();
    if (!activeTrial) return;

    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeCategory, true);
    const primaryObsField = getPrimaryObservationField(activeCategory);

    // Check if any fields that were previously recorded in this project are missing
    const projId = activeTrial.ProjectID;
    const projectTrials = (getAppState().trials || []).filter(t => String(t.ProjectID) === String(projId));
    const previouslyRecordedFields = [];

    catConfig.observationFields?.forEach(field => {
      const hasValue = projectTrials.some(t => {
        const eff = validateEfficacyData(safeJsonParse(t.EfficacyDataJSON, []), activeCategory);
        return eff.some(obs => obs[field.key] !== undefined && obs[field.key] !== null && obs[field.key] !== '');
      });
      if (hasValue) {
        previouslyRecordedFields.push(field);
      }
    });

    const missingFields = previouslyRecordedFields.filter(field => {
      const val = obsForm[field.key];
      return val === undefined || val === null || val === '';
    });

    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(f => f.label).join(', ');
      const confirmSave = window.confirm(`You previously recorded data for the following fields in this trial, but they are currently missing:\n\n${fieldLabels}\n\nAre you sure you want to save without this data?`);
      if (!confirmSave) return;
    }

    let newObs = {
      daa: Number(obsForm.daa),
      date: obsForm.date,
      notes: obsForm.notes,
      weatherTemp: obsForm.weatherTemp,
      weatherHumidity: obsForm.weatherHumidity,
      weatherWind: obsForm.weatherWind,
      weatherRain: obsForm.weatherRain,
      bbchStage: obsForm.bbchStage || '',
      phytotoxicityPct: obsForm.phytotoxicityPct !== '' && obsForm.phytotoxicityPct != null ? Number(obsForm.phytotoxicityPct) : undefined,
      phytotoxicityNotes: obsForm.phytotoxicityNotes || undefined
    };
    // Remove undefined fields to keep records clean
    if (newObs.phytotoxicityPct === undefined) delete newObs.phytotoxicityPct;
    if (!newObs.phytotoxicityNotes) delete newObs.phytotoxicityNotes;

    catConfig.observationFields?.forEach(f => {
      const val = obsForm[f.key];
      newObs[f.key] = (val === '' || val === undefined || val === null) ? null : Number(val);
    });

    // Normalize observation to category-aware fields
    newObs = normalizeObservation(newObs, activeCategory);

    // ensure weedDetails present for herbicide
    if (primaryObsField === 'weedCover' && (!newObs.weedDetails || newObs.weedDetails.length === 0)) {
      newObs.weedDetails = [{ species: 'Total', cover: newObs.weedCover || 0, status: '', notes: obsForm.notes }];
    } else {
      newObs.weedDetails = newObs.weedDetails || obsForm.weedDetails || [];
    }

    if (editingObsIdx !== null) {
      const prevObs = efficacyData[editingObsIdx];
      catConfig.observationFields?.forEach(f => {
        if (newObs[f.key] !== prevObs[f.key]) {
          newObs[`_manual_${f.key}`] = true;
        } else if (prevObs[`_manual_${f.key}`]) {
          newObs[`_manual_${f.key}`] = true;
        }
      });
      if (prevObs.source === 'AI') {
        newObs.source = 'AI';
        newObs.verified = true;
        if (prevObs.aiConfidence) newObs.aiConfidence = prevObs.aiConfidence;
        if (prevObs.photoUrl) newObs.photoUrl = prevObs.photoUrl;
      }
      efficacyData[editingObsIdx] = newObs;
    }
    else {
      // Task 57: Baseline check — warn if first post-spray obs added with no baseline
      const daaNum = Number(obsForm.daa);
      const hasBaseline = efficacyData.some(o => Number(o.daa) === 0);
      if (daaNum > 0 && !hasBaseline && editingObsIdx === null) {
        // Store pending obs and show warning dialog instead of saving immediately
        setPendingObsSave({ newObs, efficacyData, activeTrial });
        setBaselineWarningOpen(true);
        return;
      }
      efficacyData.push(newObs);
    }
    efficacyData.sort((a, b) => a.daa - b.daa);

    const newResult = calculateResultRating(efficacyData, activeTrial.IsControl || false, activeCategory, activeTrial);

    const updated = {
      ...activeTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: newResult
    };

    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setIsObsModalOpen(false);
    try {
      await updateTrial({ ID: updated.ID, EfficacyDataJSON: updated.EfficacyDataJSON, Result: updated.Result }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Observation saved', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation', type: 'error' } }));
    }
  };

  const handleSaveQuickEdit = async (e) => {
    e.preventDefault();
    if (!activeTrial || !quickEditObs) return;
    
    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeCategory, true);
    const obs = efficacyData[quickEditObs.obsIdx];
    if (!obs) return;
    
    const val = quickEditObs.value;
    obs[quickEditObs.fieldKey] = (val === '' || val === undefined || val === null) ? null : Number(val);
    obs[`_manual_${quickEditObs.fieldKey}`] = true;
    if (obs.source === 'AI') {
      obs.verified = true;
    }
    
    // Real-time calculation of Root-to-Shoot Ratio if applicable
    if (quickEditObs.fieldKey === 'rootBiomass' || quickEditObs.fieldKey === 'shootBiomass') {
      const rb = parseFloat(obs.rootBiomass);
      const sb = parseFloat(obs.shootBiomass);
      if (!isNaN(rb) && !isNaN(sb) && sb > 0) {
        obs.rootToShootRatio = parseFloat((rb / sb).toFixed(3));
      }
    }
    
    efficacyData[quickEditObs.obsIdx] = obs;
    efficacyData.sort((a, b) => a.daa - b.daa);
    
    const newResult = calculateResultRating(efficacyData, activeTrial.IsControl || false, activeCategory, activeTrial);
    
    const updated = {
      ...activeTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: newResult
    };
    
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setQuickEditObs(null);
    
    try {
      await updateTrial({ ID: updated.ID, EfficacyDataJSON: updated.EfficacyDataJSON, Result: updated.Result }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${quickEditObs.label} saved successfully!`, type: 'success' } }));
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save parameter', type: 'error' } }));
    }
  };

  // Task 57: Helper to finalize observation save after baseline warning "Proceed"
  const finalizePendingObsSave = async () => {
    if (!pendingObsSave) return;
    const { newObs, efficacyData, activeTrial: trial } = pendingObsSave;
    efficacyData.push(newObs);
    efficacyData.sort((a, b) => a.daa - b.daa);
    const newResult = calculateResultRating(efficacyData, trial.IsControl || false, activeCategory, trial);
    const updated = {
      ...trial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: newResult
    };
    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setBaselineWarningOpen(false);
    setPendingObsSave(null);
    setIsObsModalOpen(false);
    try {
      await updateTrial({ ID: updated.ID, EfficacyDataJSON: updated.EfficacyDataJSON, Result: updated.Result }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Observation saved', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save observation', type: 'error' } }));
    }
  };

  // --- Applications Log Logic ---
  const handleOpenAppModal = (app = null, idx = null) => {
    if (app) {
      setEditingAppIdx(idx);
      setAppForm({
        code: app.code || '',
        date: app.date || toDatetimeLocal(new Date()),
        dosage: app.dosage || activeTrial.Dosage || '',
        cropStage: app.cropStage || '',
        targetStage: app.targetStage || '',
        method: app.method || 'Foliar Spray',
        temp: app.temp || '',
        humidity: app.humidity || '',
        windspeed: app.windspeed || '',
        rain: app.rain || 'No',
        notes: app.notes || '',
        adjuvant: app.adjuvant || '',
        tankMix: app.tankMix || '',
      });
    } else {
      setEditingAppIdx(null);
      // Auto-sequence application code/name: App A, App B, App C...
      const currentApps = safeJsonParse(activeTrial?.ApplicationLogJSON, []);
      const nextLetter = String.fromCharCode(65 + currentApps.length); // A, B, C...
      setAppForm({
        code: `App ${nextLetter}`,
        date: toDatetimeLocal(new Date()),
        dosage: activeTrial?.Dosage || '',
        cropStage: '',
        targetStage: '',
        method: 'Foliar Spray',
        temp: '',
        humidity: '',
        windspeed: '',
        rain: 'No',
        notes: '',
        adjuvant: '',
        tankMix: '',
      });
    }
    setIsAppModalOpen(true);
  };

  const handleSaveApp = async (e) => {
    e.preventDefault();
    if (!activeTrial) return;

    const currentApps = safeJsonParse(activeTrial.ApplicationLogJSON, []);
    const newApp = { ...appForm };

    if (editingAppIdx !== null) {
      currentApps[editingAppIdx] = newApp;
    } else {
      currentApps.push(newApp);
    }
    currentApps.sort((a, b) => new Date(a.date) - new Date(b.date));

    const updated = {
      ...activeTrial,
      ApplicationLogJSON: JSON.stringify(currentApps)
    };

    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setIsAppModalOpen(false);

    try {
      await updateTrial({ ID: updated.ID, ApplicationLogJSON: updated.ApplicationLogJSON }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Application saved', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save application', type: 'error' } }));
    }
  };

  const handleDeleteApp = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this application entry? This cannot be undone.')) return;

    const currentApps = safeJsonParse(activeTrial.ApplicationLogJSON, []);
    currentApps.splice(idx, 1);

    const updated = {
      ...activeTrial,
      ApplicationLogJSON: JSON.stringify(currentApps)
    };

    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);

    try {
      await updateTrial({ ID: updated.ID, ApplicationLogJSON: updated.ApplicationLogJSON }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Application deleted', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to delete application', type: 'error' } }));
    }
  };

  const handleFetchAppWeather = async () => {
    const lat = activeTrial.Lat;
    const lon = activeTrial.Lon;
    const dateStr = appForm.date;

    if (!lat || !lon) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial location coordinates (GPS) are missing.', type: 'warning' } }));
      return;
    }

    setIsFetchingAppWeather(true);
    try {
      const weather = await fetchWeather(lat, lon, dateStr, getAppState);
      if (weather) {
        setAppForm(prev => ({
          ...prev,
          temp: weather.temp !== undefined ? String(weather.temp) : prev.temp,
          humidity: weather.humidity !== undefined ? String(weather.humidity) : prev.humidity,
          windspeed: weather.windspeed !== undefined ? String(weather.windspeed) : prev.windspeed,
        }));
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Weather data fetched successfully!', type: 'success' } }));
      }
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to fetch weather data.', type: 'error' } }));
    } finally {
      setIsFetchingAppWeather(false);
    }
  };

  const getObservedWeedsList = (efficacyData) => {
    const species = new Set();
    const targetLabel = catConfig.targetLabel;
    efficacyData.forEach(obs => {
      (obs.weedDetails || []).forEach(wd => {
        if (wd.species && wd.species !== `No ${targetLabel.toLowerCase()}s detected` && wd.species !== 'No weeds detected') {
          species.add(wd.species);
        }
      });
    });
    return species.size > 0 ? Array.from(species).join(', ') : `No ${targetLabel.toLowerCase()}s detected`;
  };

  const handleDeleteObs = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this observation?')) return;
    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeCategory, true);
    efficacyData.splice(idx, 1);

    const resultRating = calculateResultRating(efficacyData, activeTrial?.IsControl === true || activeTrial?.IsControl === 'true', activeCategory, activeTrial);
    const observedWeeds = getObservedWeedsList(efficacyData);

    const targetField = catConfig.targetField || 'WeedSpecies';
    const updated = { 
      ...activeTrial, 
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      WeedSpecies: observedWeeds,
      [targetField]: observedWeeds,
      AISummariesJSON: '{}'
    };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setAiSummary('');
    try { 
      await updateTrial({ 
        ID: updated.ID, 
        EfficacyDataJSON: updated.EfficacyDataJSON, 
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies,
        [targetField]: updated[targetField],
        AISummariesJSON: '{}' 
      }, getAppState); 
    } catch (e) {}
  };

  // ── DETAIL TRIAL DERIVATIONS ──────────────────────────────────────
  const detailEfficacy = detailTrial ? validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []), activeCategory, true) : [];
  const detailPhotos = detailTrial ? safeJsonParse(detailTrial.PhotoURLs, []).filter(p => !p.deleted) : [];
  const detailIsCompleted = detailTrial?.IsCompleted === true || detailTrial?.IsCompleted === 'true';

  useEffect(() => {
    if (detailTrial) {
      const data = safeJsonParse(detailTrial.HarvestDataJSON, {});
      setHarvestForm({
        actualFruitCount: data.actualFruitCount ?? '',
        actualMarketableWeight: data.actualMarketableWeight ?? '',
        actualUnmarketableWeight: data.actualUnmarketableWeight ?? '',
        harvestDate: data.harvestDate ?? '',
        notes: data.notes ?? '',
        photos: data.photos ?? []
      });
    }
  }, [detailTrial]);

  // Helper for statistics
  const interpretCV = useCallback((cv) => {
    if (!isFinite(cv)) return '';
    if (cv <= 10) return 'Excellent';
    if (cv <= 20) return 'Good';
    if (cv <= 30) return 'Acceptable';
    return 'Poor';
  }, []);

  const calcStats = useCallback(async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot calculate statistics.', type: 'error' } }));
      return;
    }
    if (!detailTrial) return;
    const efficacy = validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []), activeCategory);
    if (efficacy.length < 2) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Need at least 2 observations to calculate statistics', type: 'error' } }));
      return;
    }
    const sorted = [...efficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseline = sorted[0];
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
    const wceRows = sorted.map(obs => {
      const val = parseFloat(obs[primaryObsField] ?? 0) || 0;
      const wce = Number(obs.daa) === Number(baseline?.daa) ? null : calculateEfficacy(activeCategory, val, baseVal);
      let rating = 'Baseline';
      if (wce !== null) {
        if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
          rating = wce >= 15 ? 'Excellent' : wce >= 8 ? 'Good' : wce >= 3 ? 'Fair' : 'Poor';
        } else {
          rating = wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';
        }
      }
      const targetField = catConfig.targetField || 'WeedSpecies';
      const sp = (obs.weedDetails || []).map(w => w.species).filter(Boolean).join(', ') || (detailTrial[targetField] || 'Mixed');
      return { species: sp, initialCover: baseVal.toFixed(1), finalCover: val.toFixed(1), wce: wce !== null ? parseFloat(wce.toFixed(1)) : null, controlRating: rating, daa: obs.daa };
    });

    // Run RCBD ANOVA
    const trtGroups = {};
    const repGroups = {};
    const values = [];

    efficacy.forEach(obs => {
      const val = parseFloat(obs[primaryObsField]);
      const trt = parseInt(obs.treatmentNumber || obs.treatment || 1);
      const rep = parseInt(obs.replication || obs.rep || 1);
      if (!isNaN(val)) {
        values.push(val);
        if (!trtGroups[trt]) trtGroups[trt] = [];
        trtGroups[trt].push(val);
        if (!repGroups[rep]) repGroups[rep] = [];
        repGroups[rep].push(val);
      }
    });

    const N = values.length;
    const t = Object.keys(trtGroups).length;
    const b = Object.keys(repGroups).length;

    let anovaResults = null;
    let lsdResults = null;

    if (N >= 4 && t >= 2 && b >= 2) {
      const grandMean = values.reduce((a, b) => a + b, 0) / N;
      let ssTotal = 0;
      values.forEach(y => { ssTotal += Math.pow(y - grandMean, 2); });

      let ssTreat = 0;
      Object.keys(trtGroups).forEach(trt => {
        const trtVals = trtGroups[trt];
        const trtMean = trtVals.reduce((a, b) => a + b, 0) / trtVals.length;
        ssTreat += trtVals.length * Math.pow(trtMean - grandMean, 2);
      });

      let ssBlock = 0;
      Object.keys(repGroups).forEach(rep => {
        const repVals = repGroups[rep];
        const repMean = repVals.reduce((a, b) => a + b, 0) / repVals.length;
        ssBlock += repVals.length * Math.pow(repMean - grandMean, 2);
      });

      const ssError = Math.max(0, ssTotal - ssTreat - ssBlock);
      const dfTreat = t - 1;
      const dfBlock = b - 1;
      const dfError = dfTreat * dfBlock;
      const dfTotal = N - 1;

      const msTreat = ssTreat / dfTreat;
      const msBlock = ssBlock / dfBlock;
      const msError = ssError / dfError;

      const fVal = msError > 0 ? msTreat / msError : 0;
      const fBlock = msError > 0 ? msBlock / msError : 0;

      const pVal = (msError > 0 && typeof jStat !== 'undefined') ? 1 - jStat.centralF.cdf(fVal, dfTreat, dfError) : 1;
      const pBlock = (msError > 0 && typeof jStat !== 'undefined') ? 1 - jStat.centralF.cdf(fBlock, dfBlock, dfError) : 1;

      const cVals = trtGroups[1] || [];
      const tVals = trtGroups[2] || [];
      const cMean = cVals.length ? cVals.reduce((a, b) => a + b, 0) / cVals.length : 0;
      const tMean = tVals.length ? tVals.reduce((a, b) => a + b, 0) / tVals.length : 0;

      const tValCrit = (typeof jStat !== 'undefined') ? jStat.studentt.inv(1 - (0.05 / 2), dfError) : 2.05;
      const lsd = tValCrit * Math.sqrt((2 * msError) / b);
      const sem = Math.sqrt(msError / b);
      const cv = grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0;

      const diff = Math.abs(tMean - cMean);
      let control_group = 'a';
      let treatment_group = 'a';
      if (diff > lsd) {
        if (tMean > cMean) {
          control_group = 'b';
          treatment_group = 'a';
        } else {
          control_group = 'a';
          treatment_group = 'b';
        }
      }

      anovaResults = {
        anovaTable: {
          treatment: { source: 'Treatment', df: dfTreat, ss: parseFloat(ssTreat.toFixed(2)), ms: parseFloat(msTreat.toFixed(2)), f: parseFloat(fVal.toFixed(2)), p: parseFloat(pVal.toFixed(4)), sig: pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : 'ns' },
          block: { source: 'Replications (Block)', df: dfBlock, ss: parseFloat(ssBlock.toFixed(2)), ms: parseFloat(msBlock.toFixed(2)), f: parseFloat(fBlock.toFixed(2)), p: parseFloat(pBlock.toFixed(4)), sig: pBlock < 0.01 ? '**' : pBlock < 0.05 ? '*' : 'ns' },
          error: { source: 'Error', df: dfError, ss: parseFloat(ssError.toFixed(2)), ms: parseFloat(msError.toFixed(2)), f: null, p: null, sig: '' },
          total: { source: 'Total', df: dfTotal, ss: parseFloat(ssTotal.toFixed(2)), ms: null, f: null, p: null, sig: '' }
        },
        diagnostics: {
          cv: parseFloat(cv.toFixed(2)),
          r_squared: parseFloat((1 - (ssError / (ssTotal || 1))).toFixed(4)),
          sem: parseFloat(sem.toFixed(4)),
          lsd: parseFloat(lsd.toFixed(4))
        }
      };

      lsdResults = {
        alpha: 0.05,
        lsd: parseFloat(lsd.toFixed(4)),
        groupings: [
          { name: 'Control (Trt 1)', mean: cMean, grouping: control_group },
          { name: 'Treated (Trt 2)', mean: tMean, grouping: treatment_group }
        ]
      };
    } else {
      // Fallback descriptive statistics for single-replicate / trend observations
      const wces = wceRows.map(r => r.wce).filter(v => v !== null);
      const meanWce = wces.length ? wces.reduce((s, v) => s + v, 0) / wces.length : 0;
      const nVal = wces.length;
      let stdDev = 0;
      let cv = 0;
      if (nVal > 1) {
        const squaredDiffs = wces.map(v => Math.pow(v - meanWce, 2));
        const variance = squaredDiffs.reduce((s, v) => s + v, 0) / (nVal - 1);
        stdDev = Math.sqrt(variance);
        cv = meanWce > 0 ? (stdDev / meanWce) * 100 : 0;
      }
      anovaResults = {
        isDescriptiveOnly: true,
        n: nVal,
        mean: parseFloat(meanWce.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2)),
        cv: parseFloat(cv.toFixed(2)),
        min: wces.length ? parseFloat(Math.min(...wces).toFixed(2)) : 0,
        max: wces.length ? parseFloat(Math.max(...wces).toFixed(2)) : 0,
      };
    }

    const result = {
      wce: wceRows,
      anovaResults,
      lsdResults,
      calculatedAt: new Date().toISOString()
    };
    const updated = { ...detailTrial, StatisticsJSON: JSON.stringify(result) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    try { await updateTrial({ ID: updated.ID, StatisticsJSON: updated.StatisticsJSON }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Statistics calculated', type: 'success' } }));
  }, [detailTrial, updateState, trials, getAppState, activeCategory, catConfig]);

  // Stats data parsing
  const statsData = useMemo(() => {
    const stats = detailTrial?.StatisticsJSON ? (() => { try { return JSON.parse(detailTrial.StatisticsJSON); } catch(e) { return null; } })() : null;
    const hasStats = stats && (stats.wce || stats.anovaResults);
    const renderWces = (stats?.wce || []).map(r => r.wce).filter(v => v !== null && isFinite(v));
    const renderMeanWce = renderWces.length ? renderWces.reduce((s, v) => s + v, 0) / renderWces.length : 0;
    return { stats, hasStats, renderWces, renderMeanWce };
  }, [detailTrial]);

  // ── PHOTOS ────────────────────────────────────────────────────────
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

  const saveAndAnalyzePhoto = async (dataUrl, photoDateStr, targetTrialOverride = null, photoTag = 'Whole Canopy') => {
    const targetTrial = targetTrialOverride || activeTrial;
    if (!targetTrial) return;
    setAiGenRunning(dataUrl || true);

    const photoDate = formatPhotoDate(photoDateStr || new Date().toISOString());
    const fileName = `photo_${targetTrial.ID}_${Date.now()}.jpg`;
    const tempId = `local_${Date.now()}`;

    // Build Drive folder path — same convention as HTML app:
    // Standard trial (no ProjectID): ['Ungrouped Projects', 'FormulationName (date)']
    // RCBD trial (has ProjectID):    ['ProjectName', 'FormulationName (date)']
    const project = targetTrial.ProjectID
      ? (state.projects || []).find(p => p.ID === targetTrial.ProjectID)
      : null;
    const projectName = project ? project.Name : 'Ungrouped Projects';
    const dosageSuffix = targetTrial.Dosage ? ` (${targetTrial.Dosage})` : '';
    const idSuffix = targetTrial.ID ? ` - ${String(targetTrial.ID).slice(-5)}` : '';
    const trialNameWithDate = `${targetTrial.FormulationName || 'Unknown Formulation'}${dosageSuffix} (${targetTrial.Date ? targetTrial.Date.split('T')[0] : photoDate})${idSuffix}`.trim();
    
    const rawCategory = targetTrial.Category || project?.Category || state?.activeCategory || 'herbicide';
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
      'Default User'
    ).trim() || 'Default User';

    const folderPath = [categoryName, userName, projectName, trialNameWithDate];

    // Build per-photo tag fields from observation context (Requirements 2.1, 2.2, 2.4, 2.5)
    let photoTagFields;
    if (isObsModalOpen) {
      const efficacyData = safeJsonParse(targetTrial.EfficacyDataJSON, []);
      const obsIdx = editingObsIdx != null && editingObsIdx >= 0 ? editingObsIdx : (efficacyData.length > 0 ? efficacyData.length - 1 : null);
      photoTagFields = {
        treatment: targetTrial?.FormulationName ?? null,
        daa: parseInt(obsForm?.daa) || null,
        plotNumber: targetTrial?.PlotNumber ?? null,
        observationId: obsIdx != null ? obsIdx : null,
        direction: null,
      };
    } else {
      photoTagFields = {
        treatment: null,
        daa: null,
        plotNumber: null,
        observationId: null,
        direction: null,
      };
    }

    // Optimistically add a placeholder with tempId so the photo appears immediately
    const photoEntry = { tempId, fileData: dataUrl, date: photoDate, label: cameraMode === 'weed' ? 'Weed Photo' : 'Field Observation', tag: photoTag, identifications: [], aiStatus: 'pending', ...photoTagFields };
    const photosOptimistic = [...safeJsonParse(targetTrial.PhotoURLs, []), photoEntry];
    const optimisticTrial = { ...targetTrial, PhotoURLs: JSON.stringify(photosOptimistic) };
    updateState({ trials: getAppState().trials.map(t => t.ID === optimisticTrial.ID ? optimisticTrial : t) });
    if (activeTrial?.ID === targetTrial.ID) setActiveTrial(optimisticTrial);

    // --- OFFLINE CHECK & QUEUE ---
    if (!navigator.onLine || getAppState().isOnline === false) {
      const syncItem = {
        id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: cameraMode === 'weed' ? 'weed_upload' : 'general_upload',
        status: 'pending',
        trialId: targetTrial.ID,
        timestamp: Date.now(),
        photo: {
          tempId: tempId,
          fileData: dataUrl,
          mimeType: 'image/jpeg',
          fileName: fileName,
          date: photoDate,
          label: photoEntry.label
        },
        attempts: 0
      };

      dispatch({ type: 'ADD_SYNC_ITEM', payload: syncItem });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'App is offline. Photo queued for sync.', type: 'info' } }));
      return;
    }

    // ONLINE PATH: Temporarily show in the Sync Queue UI as uploading
    const onlineSyncItem = {
      id: `sync_${tempId}`,
      action: `Upload Photo for ${targetTrial.FormulationName || 'Trial'}${dosageSuffix}`,
      status: 'uploading',
      trialId: targetTrial.ID,
      timestamp: Date.now(),
      photo: {
        tempId: tempId,
        fileName: fileName,
        label: photoEntry.label
      }
    };
    updateState({ syncQueue: [...getAppState().syncQueue, onlineSyncItem] });

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Uploading to Drive (${projectName} / ${trialNameWithDate})...`, type: 'info' } }));

    try {
      // 1. Upload photo to Google Drive via dataLayer (works in Firebase + Sheet modes)
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

      if (uploadResult?._errType) {
        // Remove the optimistic placeholder from UI since upload failed
        const rollback = safeJsonParse(targetTrial.PhotoURLs, []).filter(p => p.tempId !== tempId);
        const rolledBack = { ...targetTrial, PhotoURLs: JSON.stringify(rollback) };
        updateState({ trials: getAppState().trials.map(t => t.ID === rolledBack.ID ? rolledBack : t) });
        if (activeTrial?.ID === targetTrial.ID) setActiveTrial(rolledBack);
        const isConfig = uploadResult._errType === 'config';
        window.dispatchEvent(new CustomEvent('app:toast', { detail: {
          msg: isConfig
            ? '⚙️ Script URL not set — go to Settings and add your Apps Script URL to enable Drive photo uploads.'
            : (uploadResult.message || 'Drive upload failed'),
          type: 'error'
        }}));
        return;
      }

      const driveUrl = uploadResult?.url || uploadResult?.fileUrl || null;

      // 2. Replace placeholder with final Drive URL entry
      const currentPhotos = safeJsonParse(targetTrial.PhotoURLs, []).filter(p => p.tempId !== tempId);
      const finalEntry = driveUrl
        ? { url: driveUrl, driveId: uploadResult?.id || getDriveFileId(driveUrl), date: photoDate, label: photoEntry.label, tag: photoTag, identifications: [], aiStatus: 'pending', ...photoTagFields }
        : { ...photoEntry, tempId: undefined, aiStatus: 'pending' };
      currentPhotos.push(finalEntry);

      const updatedTrial = { ...targetTrial, PhotoURLs: JSON.stringify(currentPhotos) };
      updateState({ trials: getAppState().trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
      if (activeTrial?.ID === targetTrial.ID) setActiveTrial(updatedTrial);

      await updateTrial({ ID: updatedTrial.ID, PhotoURLs: updatedTrial.PhotoURLs }, getAppState);

      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: driveUrl ? 'Photo saved to Drive! Starting AI analysis...' : 'Photo saved locally. Starting AI analysis...', type: 'info' } }));

      const daa = calculateDAA(photoDate, targetTrial.Date);

      // Auto-fetch weather — always attempt, using stored GPS or browser location
      const fetchWeatherForPhoto = async (lat, lon) => {
        try {
          // Use historical hourly data if photoDate is in the past, otherwise current
          const today = new Date().toISOString().split('T')[0];
          let wUrl;
          if (photoDate < today) {
            wUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${photoDate}&end_date=${photoDate}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
          } else {
            wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
          }
          const wr = await fetch(wUrl);
          const wd = await wr.json();
          let temp, hum, wind, rain;
          if (photoDate < today && wd.hourly) {
            const midday = wd.hourly.time?.findIndex(t => t.includes('T12:')) ?? 6;
            const idx = midday >= 0 ? midday : 6;
            temp = wd.hourly.temperature_2m?.[idx];
            hum = wd.hourly.relative_humidity_2m?.[idx];
            wind = wd.hourly.wind_speed_10m?.[idx];
            rain = wd.hourly.precipitation?.[idx];
          } else if (wd.current) {
            temp = wd.current.temperature_2m;
            hum = wd.current.relative_humidity_2m;
            wind = wd.current.wind_speed_10m;
            rain = wd.current.precipitation;
          }
          if (temp != null) {
            setObsForm(prev => ({ ...prev,
              weatherTemp: temp ?? prev.weatherTemp,
              weatherHumidity: hum ?? prev.weatherHumidity,
              weatherWind: wind ?? prev.weatherWind,
              weatherRain: rain ?? prev.weatherRain,
            }));
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Weather (${photoDate}): ${temp}°C, wind ${wind} km/h`, type: 'info' } }));
          }
        } catch(we) { console.warn('Weather fetch failed:', we.message); }
      };

      if (targetTrial?.Lat && targetTrial?.Lon) {
        await fetchWeatherForPhoto(targetTrial.Lat, targetTrial.Lon);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => fetchWeatherForPhoto(pos.coords.latitude.toFixed(8), pos.coords.longitude.toFixed(8)),
          () => console.warn('Geolocation denied — weather not fetched'),
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        );
      }

      await updatePhotoAiStatus(targetTrial.ID, driveUrl || dataUrl, 'processing');
      const result = await analyzePhoto(dataUrl, {
        category: targetTrial.Category || activeCategory, // Ensure category context for AI analysis
        treatment: targetTrial.FormulationName,
        daa,
        rep: targetTrial.Replication || 1,
        category: targetTrial.Category || activeCategory,
        photoTag: photoTag
      }, (msg) => {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } }));
      });

      if (result.success) {
        await createObservationFromAI(targetTrial, daa, result.data, photoDate, driveUrl || dataUrl);
        await updatePhotoAiStatus(targetTrial.ID, driveUrl || dataUrl, 'completed', '', result.data);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI complete! Logged ${result.data.weeds?.length || result.data.targets?.length || 0} targets at DAA ${daa}`, type: 'success' } }));
        // Auto-run cover detection in background
        detectWeedCoverAI(dataUrl).then(coverResult => {
          if (coverResult?.cover != null) {
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Cover detected: ${coverResult.cover}% (${coverResult.source})`, type: 'info' } }));
          }
        }).catch(() => {});
      } else {
        await updatePhotoAiStatus(targetTrial.ID, driveUrl || dataUrl, 'failed', result.error || 'AI analysis skipped');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis skipped: ' + result.error, type: 'warning' } }));
      }
    } catch (e) {
      await updatePhotoAiStatus(targetTrial.ID, driveUrl || dataUrl, 'failed', e.message);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to save photo: ' + e.message, type: 'error' } }));
    } finally {
      setAiGenRunning(false);
      updateState({ syncQueue: getAppState().syncQueue.filter(item => item.id !== `sync_${tempId}`) });
    }
  };

  const promptPhotoDate = (dataUrl, targetTrial = null) => {
    setPendingPhotoAnalysis({ dataUrl, date: toDatetimeLocal(new Date()), targetTrial });
  };

  const handleCapturePhoto = (dataUrl) => {
    const targetTrial = quickActionTrialRef.current || activeTrial;
    if (!targetTrial) return;
    quickActionTrialRef.current = null;
    setIsCameraOpen(false);
    if (cameraMode === 'harvest') {
      openCropperFor(dataUrl, async (url) => {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Adding harvest photo...', type: 'info' } }));
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

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    const targetTrial = quickActionTrialRef.current || activeTrial;
    if (!file || !targetTrial) return;
    quickActionTrialRef.current = null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      e.target.value = '';
      if (cameraMode === 'harvest') {
        openCropperFor(ev.target.result, async (url) => {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Adding harvest photo...', type: 'info' } }));
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

  const handleCropExistingPhoto = (idx, currentSrc) => {
    openCropperFor(currentSrc, async (croppedUrl) => {
      const photos = safeJsonParse(activeTrial.PhotoURLs, []);
      photos[idx] = { ...photos[idx], fileData: croppedUrl, url: undefined, bounds: undefined, identifications: [] };
      const updated = { ...activeTrial, PhotoURLs: JSON.stringify(photos) };
      updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
      setActiveTrial(updated);
      try { await updateTrial({ ID: updated.ID, PhotoURLs: updated.PhotoURLs }, getAppState); } catch (e) {}
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo cropped & saved', type: 'success' } }));
    });
  };

  const handleDeletePhoto = async (idx) => {
    if (!activeTrial || !window.confirm('Delete this photo?')) return;
    const photos = safeJsonParse(activeTrial.PhotoURLs, []);
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

    // Find and delete the corresponding AI-generated observation(s) linked to this photo
    let efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeCategory, true);
    if (deletedPhoto) {
      const deletedUrl = typeof deletedPhoto === 'string' ? deletedPhoto : (deletedPhoto.fileData || deletedPhoto.url);
      if (deletedUrl) {
        efficacyData = efficacyData.filter(obs => obs.photoUrl !== deletedUrl);
      }
    }

    const resultRating = calculateResultRating(efficacyData, activeTrial?.IsControl === true || activeTrial?.IsControl === 'true', activeTrial?.Category || activeCategory, activeTrial);
    const observedWeeds = getObservedWeedsList(efficacyData);

    const targetField = catConfig.targetField || 'WeedSpecies';
    const updated = { 
      ...activeTrial, 
      PhotoURLs: JSON.stringify(photos),
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      WeedSpecies: observedWeeds,
      [targetField]: observedWeeds,
      AISummariesJSON: '{}'
    };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setAiSummary('');
    try { 
      await updateTrial({ 
        ID: updated.ID, 
        PhotoURLs: updated.PhotoURLs, 
        EfficacyDataJSON: updated.EfficacyDataJSON,
        Result: updated.Result,
        WeedSpecies: updated.WeedSpecies,
        [targetField]: updated[targetField],
        AISummariesJSON: '{}'
      }, getAppState); 
    } catch (e) {}
  };

  const handleGridResult = async (coverPct) => {
    if (!activeTrial) return;
    setIsGridOpen(false);
    setObsForm(prev => ({ ...prev, weedCover: coverPct, weedDetails: [{ species: 'Total', cover: coverPct, status: '', notes: 'Measured via grid tool' }] }));
    setEditingObsIdx(null);
    setIsObsModalOpen(true);
  };

  // ── AI PHOTO ANALYSIS ─────────────────────────────────────────────
  const createObservationFromAI = async (trial, daa, aiData, obsDate = null, photoUrl = null) => {
    const latestTrial = getAppState().trials.find(t => t.ID === trial.ID) || trial;
    const trialCat = latestTrial.Category || activeCategory;
    const catConfig = getCategoryConfig(trialCat);
    const efficacyData = validateEfficacyData(safeJsonParse(latestTrial.EfficacyDataJSON, []), trialCat, true);

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

    let cleanNotes = aiNotes.length > 0 ? deduplicateText('', aiNotes.join('. ')) : `AI-analyzed on ${formatDateTime(new Date())}`;
    let cleanEfficacy = aiData.efficacyAssessment || aiData.overallAssessment || '';

    if (Number(daa) > 0) {
      const rxDaa = new RegExp(`\\b(at|on|for|from|during)\\s+daa\\s*0\\b`, 'gi');
      const rxDay = new RegExp(`\\b(at|on|for|from|during)\\s+day\\s*0\\b`, 'gi');
      cleanNotes = cleanNotes.replace(rxDaa, `$1 DAA ${daa}`).replace(rxDay, `$1 Day ${daa}`);
      cleanEfficacy = cleanEfficacy.replace(rxDaa, `$1 DAA ${daa}`).replace(rxDay, `$1 Day ${daa}`);
      
      // Also catch direct occurrences of "DAA 0" or "Day 0"
      cleanNotes = cleanNotes.replace(/\bDAA\s*0\b/g, `DAA ${daa}`).replace(/\bDay\s*0\b/g, `Day ${daa}`);
      cleanEfficacy = cleanEfficacy.replace(/\bDAA\s*0\b/g, `DAA ${daa}`).replace(/\bDay\s*0\b/g, `Day ${daa}`);
    }

    const newObs = {
      date: obsDate || toDatetimeLocal(new Date()),
      daa: Number(daa),
      [primaryObsField]: primaryValue,
      weedCover: isHerbicide ? primaryValue : null,
      weedDetails: normalizedWeeds.length > 0 ? normalizedWeeds : [{ species: isHerbicide ? 'No weeds detected' : 'No targets detected', cover: 0, status: '', notes: aiData.notes || 'AI-analyzed', confidence: null, detectedCount: 0, incidence: 0.0 }],
      notes: cleanNotes,
      aiConfidence: aiData.confidence || 'MEDIUM',
      aiEfficacyAssessment: cleanEfficacy,
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

    const existingIdx = efficacyData.findIndex(o => Number(o.daa) === Number(daa));
    if (existingIdx >= 0) {
      const existing = efficacyData[existingIdx];
      const count = Number(existing.sampleCount || 1);
      
      const existingPrimaryValue = parseFloat(existing[primaryObsField] ?? 0) || 0;
      const mergedPrimaryValue = parseFloat(((existingPrimaryValue * count) + primaryValue) / (count + 1));
      
      const mergedObs = {
        ...existing,
        sampleCount: count + 1,
        [primaryObsField]: Number(mergedPrimaryValue.toFixed(2)),
      };
      if (primaryObsField === 'weedCover') {
        mergedObs.weedCover = Number(mergedPrimaryValue.toFixed(2));
      } else {
        mergedObs.weedCover = existing.weedCover ?? null;
      }

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

    // Calculate Result rating dynamically based on remaining severity/cover
    let resultRating = 'Unrated';
    if (efficacyData.length > 0) {
      const latestObs = [...efficacyData].sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
      const val = Number(getObservationPrimaryValue(trialCat, latestObs) ?? 0);
      
      if (trialCat === 'nutrition' || trialCat === 'biostimulant') {
        const firstObs = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0))[0];
        const baseVal = getObservationPrimaryValue(trialCat, firstObs) || 1;
        const pctImprovement = ((val / baseVal) - 1) * 100;
        if (pctImprovement >= 15) {
          resultRating = 'Excellent';
        } else if (pctImprovement >= 8) {
          resultRating = 'Good';
        } else if (pctImprovement >= 3) {
          resultRating = 'Fair';
        } else {
          resultRating = 'Poor';
        }
      } else {
        if (val <= 10) {
          resultRating = 'Excellent';
        } else if (val <= 25) {
          resultRating = 'Good';
        } else if (val <= 50) {
          resultRating = 'Fair';
        } else {
          resultRating = 'Poor';
        }
      }
    }

    const targetField = catConfig.targetField || 'WeedSpecies';
    const targetsString = normalizedWeeds.length > 0 ? normalizedWeeds.map(w => w.species).join(', ') : 'None detected';

    const updated = {
      ...latestTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      [targetField]: targetsString,
      ...(isHerbicide ? { WeedSpecies: targetsString } : {}),
      ...(Number(daa) === 0 ? {
        ApplicationTiming: latestTrial.ApplicationTiming || aiData.applicationTiming || '',
        WeedGrowthStage: latestTrial.WeedGrowthStage || aiData.overallWeedGrowthStage || ''
      } : {})
    };

    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === latestTrial.ID) setActiveTrial(updated);

    const patch = {
      ID: latestTrial.ID,
      EfficacyDataJSON: updated.EfficacyDataJSON,
      Result: updated.Result,
      [targetField]: updated[targetField],
      ...(isHerbicide ? { WeedSpecies: updated.WeedSpecies } : {}),
      ...(Number(daa) === 0 ? {
        ApplicationTiming: updated.ApplicationTiming,
        WeedGrowthStage: updated.WeedGrowthStage
      } : {})
    };

    try {
      await updateTrial(patch, getAppState);
    } catch (e) {
      console.error('Failed to save AI observation:', e);
    }
  };

  const handleSyncPhotosFromDrive = async (targetTrial = null, healOnly = syncHealOnly) => {
    const trial = targetTrial || activeTrial;
    if (!trial) return;

    try {
      setSyncingPhotos(true);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Scanning Google Drive for missing photos...', type: 'info' } }));
      
      const photoURLs = safeJsonParse(trial.PhotoURLs, []);
      const brokenPhotos = photoURLs.filter(p => isPhotoBroken(p) && !p.deleted).map(p => ({
        date: p.date || '',
        label: p.label || '',
        tag: p.tag || ''
      }));

      const projectObj = state.projects?.find(p => String(p.ID) === String(trial.ProjectID));
      const projectName = projectObj ? projectObj.Name : '';

      const result = await apiCall('listTrialPhotosFromDrive', {
        trialId: trial.ID,
        formulation: trial.FormulationName,
        date: trial.Date,
        dosage: trial.Dosage || '',
        category: trial.Category || '',
        projectId: trial.ProjectID || '',
        projectName: projectName,
        potLabel: trial.PotLabel || '',
        plotNumber: trial.PlotNumber || '',
        brokenPhotos: brokenPhotos
      }, false, getAppState);

      if (result._errType || !result.success) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to scan Drive: ${result.message || 'Unknown error'}`, type: 'error' } }));
        return;
      }

      if (!result.photos || result.photos.length === 0) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `No photos found: ${result.message || 'Check your Drive folder structure.'}`, type: 'warning' } }));
        return;
      }

      // Filter out files that might not be images
      const images = result.photos.filter(f => /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|tif|tiff)$/i.test(f.name));
      if (images.length === 0) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No image files found in Drive folder.', type: 'warning' } }));
        return;
      }

      // Sort discovered images by name or createdTime to ensure consistent chronological order
      images.sort((a, b) => {
        const nameA = String(a.name || '');
        const nameB = String(b.name || '');
        return nameA.localeCompare(nameB);
      });

      let addedCount = 0;
      let healedCount = 0;

      const normalize = (str) => {
        if (!str) return '';
        return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
      };

      // Collect indices of broken/unavailable photos to heal sequentially
      const brokenPhotoIndices = [];
      photoURLs.forEach((p, idx) => {
        if (isPhotoBroken(p) && !p.deleted) {
          brokenPhotoIndices.push(idx);
        }
      });

      images.forEach(img => {
        // Find if there is an existing entry matching this drive ID (even if broken or base64-removed)
        const existingPhoto = photoURLs.find(p => 
          p.driveId === img.id || 
          p.fileId === img.id || 
          p.driveFileId === img.id || 
          getDriveFileId(p.url || p.src) === img.id
        );

        // Smart parsing from filename
        let photoDate = parseDateFromFilename(img.name, trial.Date) || (img.createdTime ? img.createdTime.split('T')[0] : new Date().toISOString().split('T')[0]);
        let cleanLabel = img.name.replace(/\.[^/.]+$/, ""); // strip extension
        
        // Extract clean pot name/label by stripping date and times
        let strippedLabel = cleanLabel;
        strippedLabel = strippedLabel.replace(/\d{2}[-_]\d{2}[-_]\d{4}/g, '');
        strippedLabel = strippedLabel.replace(/\d{4}[-_]\d{2}[-_]\d{2}/g, '');
        strippedLabel = strippedLabel.replace(/\d{2}[:_]\d{2}\s*(AM|PM|am|pm)?/g, '');
        strippedLabel = strippedLabel.replace(/^[\s\-_]+|[\s\-_]+$/g, '');
        
        if (strippedLabel) {
          cleanLabel = strippedLabel;
        }

        const normDriveLabel = normalize(cleanLabel);
        const webViewUrl = `https://drive.google.com/uc?export=view&id=${img.id}`;

        if (existingPhoto) {
          if (existingPhoto.deleted) {
            if (!healOnly) {
              existingPhoto.deleted = false;
              existingPhoto.url = webViewUrl;
              existingPhoto.driveId = img.id;
              existingPhoto.fileName = img.name;
              existingPhoto.importedFrom = 'Drive';
              if (!existingPhoto.date && photoDate) existingPhoto.date = photoDate;
              healedCount++;
            } else {
              return; // Skip re-importing deleted photos
            }
          } else if (isPhotoBroken(existingPhoto) || !existingPhoto.url || existingPhoto.url.includes('[base64-removed]')) {
            existingPhoto.url = webViewUrl;
            existingPhoto.driveId = img.id;
            existingPhoto.fileName = img.name;
            existingPhoto.importedFrom = 'Drive';
            if (!existingPhoto.date && photoDate) existingPhoto.date = photoDate;
            healedCount++;
          }
          return; // Skip adding a duplicate
        }

        let healed = false;

        // 1. Attempt to find an unmatched broken/unavailable entry that matches this photo by label
        for (let i = 0; i < photoURLs.length; i++) {
          const p = photoURLs[i];
          if (isPhotoBroken(p) && !p.deleted) {
            const normExistingLabel = normalize(p.label);
            
            const isMatch = normExistingLabel && normDriveLabel && (
              normExistingLabel.indexOf(normDriveLabel) !== -1 ||
              normDriveLabel.indexOf(normExistingLabel) !== -1
            );

            if (isMatch) {
              p.url = webViewUrl;
              p.driveId = img.id;
              p.fileName = img.name;
              p.importedFrom = 'Drive';
              if (!p.date && photoDate) p.date = photoDate;
              healed = true;
              healedCount++;
              // Remove this index from brokenPhotoIndices so it's not reused sequentially
              const idxInBroken = brokenPhotoIndices.indexOf(i);
              if (idxInBroken !== -1) {
                brokenPhotoIndices.splice(idxInBroken, 1);
              }
              break;
            }
          }
        }

        // 2. Sequential fallback: If not healed by label, match to the first remaining broken photo sequentially
        if (!healed && brokenPhotoIndices.length > 0) {
          const targetIdx = brokenPhotoIndices.shift();
          const p = photoURLs[targetIdx];
          p.url = webViewUrl;
          p.driveId = img.id;
          p.fileName = img.name;
          p.importedFrom = 'Drive';
          if (!p.date && photoDate) p.date = photoDate;
          healed = true;
          healedCount++;
        }

        // 3. If no broken photo could be healed, append as new photo
        if (!healed) {
          if (!healOnly) {
            photoURLs.push({
              url: webViewUrl,
              fileName: img.name,
              date: photoDate,
              label: cleanLabel,
              importedFrom: 'Drive',
              driveId: img.id,
              tag: 'Field Observation',
              aiStatus: 'pending'
            });
            addedCount++;
          }
        }
      });

      if (addedCount > 0 || healedCount > 0) {
        const updatedPhotoURLs = JSON.stringify(photoURLs);
        const updatedTrial = { ...trial, PhotoURLs: updatedPhotoURLs };
        
        updateState({ trials: getAppState().trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
        if (activeTrial?.ID === updatedTrial.ID) setActiveTrial(updatedTrial);

        await updateTrial({
          ID: trial.ID,
          PhotoURLs: updatedPhotoURLs
        }, getAppState);

        let msg = '';
        if (healedCount > 0 && addedCount > 0) {
          msg = `Restored ${healedCount} unavailable photo(s) and imported ${addedCount} new photo(s) from Drive!`;
        } else if (healedCount > 0) {
          msg = `Restored ${healedCount} unavailable photo(s) from Drive!`;
        } else {
          msg = `Successfully imported ${addedCount} photo(s) from Drive!`;
        }
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'All Google Drive photos are already synced.', type: 'info' } }));
      }
    } catch (err) {
      console.error('Sync photos from Drive error:', err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Error syncing photos: ${err.message}`, type: 'error' } }));
    } finally {
      setSyncingPhotos(false);
    }
  };

  const handleSyncAllPhotosFromDrive = async (healOnly = syncHealOnly) => {
    const trialsToScan = healOnly
      ? (state.trials || []).filter(t => {
          const photos = safeJsonParse(t.PhotoURLs, []);
          return Array.isArray(photos) && photos.some(p => isPhotoBroken(p) && !p.deleted);
        })
      : (state.trials || []);

    if (trialsToScan.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: healOnly ? 'All trial photos are already synchronized and healthy!' : 'No trials found to synchronize.', type: 'info' } }));
      return;
    }

    try {
      setSyncingAllPhotos(true);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Starting batch sync for ${trialsToScan.length} trial(s)...`, type: 'info' } }));

      let totalHealed = 0;
      let totalAdded = 0;
      let processedCount = 0;

      for (const trial of trialsToScan) {
        processedCount++;
        window.dispatchEvent(new CustomEvent('app:toast', { 
          detail: { 
            msg: `Syncing photos for "${trial.FormulationName || 'Trial'}" (${processedCount}/${trialsWithBroken.length})...`, 
            type: 'info' 
          } 
        }));

        const photoURLs = safeJsonParse(trial.PhotoURLs, []);
        const brokenPhotos = photoURLs.filter(p => isPhotoBroken(p) && !p.deleted).map(p => ({
          date: p.date || '',
          label: p.label || '',
          tag: p.tag || ''
        }));

        const projectObj = state.projects?.find(p => String(p.ID) === String(trial.ProjectID));
        const projectName = projectObj ? projectObj.Name : '';

        const result = await apiCall('listTrialPhotosFromDrive', {
          trialId: trial.ID,
          formulation: trial.FormulationName,
          date: trial.Date,
          dosage: trial.Dosage || '',
          category: trial.Category || '',
          projectId: trial.ProjectID || '',
          projectName: projectName,
          potLabel: trial.PotLabel || '',
          plotNumber: trial.PlotNumber || '',
          brokenPhotos: brokenPhotos
        }, false, getAppState);

        if (result && result.success && result.photos && result.photos.length > 0) {
          const images = result.photos.filter(f => /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|tif|tiff)$/i.test(f.name));
          if (images.length > 0) {
            images.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

            const brokenPhotoIndices = [];
            photoURLs.forEach((p, idx) => {
              if (isPhotoBroken(p) && !p.deleted) {
                brokenPhotoIndices.push(idx);
              }
            });

            let localHealed = 0;
            let localAdded = 0;

            images.forEach(img => {
              const existingPhoto = photoURLs.find(p => 
                p.driveId === img.id || 
                p.fileId === img.id || 
                p.driveFileId === img.id || 
                getDriveFileId(p.url || p.src) === img.id
              );

              let photoDate = parseDateFromFilename(img.name, trial.Date) || (img.createdTime ? img.createdTime.split('T')[0] : new Date().toISOString().split('T')[0]);
              let cleanLabel = img.name.replace(/\.[^/.]+$/, "");

              let strippedLabel = cleanLabel;
              strippedLabel = strippedLabel.replace(/\d{2}[-_]\d{2}[-_]\d{4}/g, '');
              strippedLabel = strippedLabel.replace(/\d{4}[-_]\d{2}[-_]\d{2}/g, '');
              strippedLabel = strippedLabel.replace(/\d{2}[:_]\d{2}\s*(AM|PM|am|pm)?/g, '');
              strippedLabel = strippedLabel.replace(/^[\s\-_]+|[\s\-_]+$/g, '');
              
              if (strippedLabel) {
                cleanLabel = strippedLabel;
              }

              const normDriveLabel = cleanLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
              const webViewUrl = `https://drive.google.com/uc?export=view&id=${img.id}`;

              if (existingPhoto) {
                if (existingPhoto.deleted) {
                  if (!healOnly) {
                    existingPhoto.deleted = false;
                    existingPhoto.url = webViewUrl;
                    existingPhoto.driveId = img.id;
                    existingPhoto.fileName = img.name;
                    existingPhoto.importedFrom = 'Drive';
                    if (!existingPhoto.date && photoDate) existingPhoto.date = photoDate;
                    localHealed++;
                    totalHealed++;
                  } else {
                    return; // Skip re-importing deleted photos
                  }
                } else if (isPhotoBroken(existingPhoto) || !existingPhoto.url || existingPhoto.url.includes('[base64-removed]')) {
                  existingPhoto.url = webViewUrl;
                  existingPhoto.driveId = img.id;
                  existingPhoto.fileName = img.name;
                  existingPhoto.importedFrom = 'Drive';
                  if (!existingPhoto.date && photoDate) existingPhoto.date = photoDate;
                  localHealed++;
                  totalHealed++;
                }
                return;
              }

              let healed = false;
              for (let i = 0; i < photoURLs.length; i++) {
                const p = photoURLs[i];
                if (isPhotoBroken(p) && !p.deleted) {
                  const normExistingLabel = (p.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  const isMatch = normExistingLabel && normDriveLabel && (
                    normExistingLabel.indexOf(normDriveLabel) !== -1 ||
                    normDriveLabel.indexOf(normExistingLabel) !== -1
                  );

                  if (isMatch) {
                    p.url = webViewUrl;
                    p.driveId = img.id;
                    p.fileName = img.name;
                    p.importedFrom = 'Drive';
                    if (!p.date && photoDate) p.date = photoDate;
                    healed = true;
                    localHealed++;
                    totalHealed++;
                    const idxInBroken = brokenPhotoIndices.indexOf(i);
                    if (idxInBroken !== -1) {
                      brokenPhotoIndices.splice(idxInBroken, 1);
                    }
                    break;
                  }
                }
              }

              if (!healed && brokenPhotoIndices.length > 0) {
                const targetIdx = brokenPhotoIndices.shift();
                const p = photoURLs[targetIdx];
                p.url = webViewUrl;
                p.driveId = img.id;
                p.fileName = img.name;
                p.importedFrom = 'Drive';
                if (!p.date && photoDate) p.date = photoDate;
                healed = true;
                localHealed++;
                totalHealed++;
              }

              if (!healed) {
                if (!healOnly) {
                  photoURLs.push({
                    url: webViewUrl,
                    fileName: img.name,
                    date: photoDate,
                    label: cleanLabel,
                    importedFrom: 'Drive',
                    driveId: img.id,
                    tag: 'Field Observation',
                    aiStatus: 'pending'
                  });
                  localAdded++;
                  totalAdded++;
                }
              }
            });

            if (localHealed > 0 || localAdded > 0) {
              const updatedPhotoURLs = JSON.stringify(photoURLs);
              const updatedTrial = { ...trial, PhotoURLs: updatedPhotoURLs };

              updateState({ trials: getAppState().trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });

              await updateTrial({
                ID: trial.ID,
                PhotoURLs: updatedPhotoURLs
              }, getAppState);
            }
          }
        }
      }

      if (totalHealed > 0 || totalAdded > 0) {
        window.dispatchEvent(new CustomEvent('app:toast', { 
          detail: { 
            msg: `Batch sync complete! Restored ${totalHealed} photo(s) and added ${totalAdded} photo(s) across trials!`, 
            type: 'success' 
          } 
        }));
      } else {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Batch sync complete. All photo URLs are up to date.', type: 'info' } }));
      }
    } catch (err) {
      console.error('Batch sync photos error:', err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Batch sync failed: ${err.message}`, type: 'error' } }));
    } finally {
      setSyncingAllPhotos(false);
    }
  };

  const handleAnalyzeAllPhotos = async (specificTrial = null) => {
    const targetTrial = (specificTrial && specificTrial.ID) ? specificTrial : activeTrial;
    if (!targetTrial) return;

    // Scan only the photos belonging to this respective trial
    const allTrials = [targetTrial];

    // Collect all photos with their DAA calculated from photo date vs trial date
    const photosToAnalyze = [];
    const daaCoverageMap = new Map(); // trialId -> Set of DAAs

    allTrials.forEach(trial => {
      const photos = safeJsonParse(trial.PhotoURLs, []);
      const existingObs = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), trial.Category || activeCategory, true);
      const existingDAAs = new Set(existingObs.map(o => o.daa));
      daaCoverageMap.set(trial.ID, existingDAAs);

      photos.forEach((photo, idx) => {
        const src = resolvePhotoSrc(photo);
        if (!src) return;

        // Calculate DAA from photo date
        const daa = calculateDAA(photo.date, trial.Date);

        photosToAnalyze.push({
          imageData: src,
          trialId: trial.ID,
          treatment: trial.FormulationName,
          daa,
          rep: trial.Replication || 1,
          trialDate: trial.Date,
          photoDate: photo.date,
          category: trial.Category || activeCategory,
        });
      });
    });

    if (photosToAnalyze.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No photos found to analyze', type: 'warning' } }));
      return;
    }

    // Sort photos by date to process chronologically
    photosToAnalyze.sort((a, b) => new Date(a.photoDate || 0) - new Date(b.photoDate || 0));

    setAiBatchModalOpen(false);
    setAiBatchRunning(true);
    setAiBatchProgress({ current: 0, total: photosToAnalyze.length, message: `Analyzing ${photosToAnalyze.length} photos across ${allTrials.length} trials...` });

    const analyzedDAAs = new Map(); // trialId -> Set of DAAs analyzed

    await analyzePhotosBatch(
      photosToAnalyze,
      ({ current, total, trialId, imageData, message }) => {
        setAiBatchProgress({ current, total, message });
        if (trialId && imageData) {
          updatePhotoAiStatus(trialId, imageData, 'processing');
        }
      },
      async ({ trialId, daa, data, photoDate, imageData, success, error }) => {
        const trial = getAppState().trials.find(t => t.ID === trialId);
        if (trial) {
          if (success && data) {
            await createObservationFromAI(trial, daa, data, photoDate, imageData);
            await updatePhotoAiStatus(trialId, imageData, 'completed', '', data);
          } else {
            await updatePhotoAiStatus(trialId, imageData, 'failed', error || 'AI analysis skipped');
          }
          if (!analyzedDAAs.has(trialId)) analyzedDAAs.set(trialId, new Set());
          analyzedDAAs.get(trialId).add(daa);
        }
      }
    );

    // Build summary of DAA coverage
    let summaryMsg = `Complete! ${photosToAnalyze.length} photos analyzed.`;
    const coverageDetails = [];
    allTrials.forEach(trial => {
      const prevDAAs = daaCoverageMap.get(trial.ID) || new Set();
      const newDAAs = analyzedDAAs.get(trial.ID) || new Set();
      const addedCount = [...newDAAs].filter(d => !prevDAAs.has(d)).length;
      const allDAAs = new Set([...prevDAAs, ...newDAAs]);
      if (addedCount > 0) {
        coverageDetails.push(`${trial.FormulationName}: ${addedCount} new DAA observations`);
      }
    });

    setAiBatchRunning(false);
    setAiBatchProgress({ current: photosToAnalyze.length, total: photosToAnalyze.length, message: summaryMsg });

    if (coverageDetails.length > 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${summaryMsg} ${coverageDetails.join(', ')}`, type: 'success' } }));
    } else {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: summaryMsg, type: 'success' } }));
    }

    setTimeout(() => setAiBatchProgress({ current: 0, total: 0, message: '' }), 5000);
  };

  const updatePhotoAiStatus = useCallback(async (trialId, photoSrc, status, errorMsg = '', aiData = null) => {
    const currentTrials = getAppState().trials || [];
    const trial = currentTrials.find(t => t.ID === trialId);
    if (!trial) return;
    const photos = safeJsonParse(trial.PhotoURLs, []);
    const updatedPhotos = photos.map(p => {
      const src = resolvePhotoSrc(p);
      if (src === photoSrc || p.tempId === photoSrc) {
        const updated = { ...p, aiStatus: status, aiError: errorMsg };
        if (aiData) {
          updated.aiData = aiData;
        }
        return updated;
      }
      return p;
    });
    const patch = { ID: trial.ID, PhotoURLs: JSON.stringify(updatedPhotos) };
    const updatedTrial = { ...trial, ...patch };
    updateState({ trials: currentTrials.map(t => t.ID === trialId ? updatedTrial : t) });
    if (getAppState().activeTrial?.ID === trialId || activeTrial?.ID === trialId) {
      setActiveTrial(updatedTrial);
    }
    try {
      await updateTrial(patch, getAppState);
    } catch (e) {
      console.error('Failed to update photo AI status:', e);
    }
  }, [getAppState, updateState, activeTrial]);

  const handleAnalyzeSinglePhoto = async (photoSrc, photoDate) => {
    if (!activeTrial || aiGenRunning) return;
    setAiGenRunning(photoSrc || true);
    const daa = calculateDAA(photoDate, activeTrial.Date);

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Analyzing photo with AI (DAA ${daa})...`, type: 'info' } }));
    try {
      await updatePhotoAiStatus(activeTrial.ID, photoSrc, 'processing');
      const result = await analyzePhoto(photoSrc, {
        category: activeTrial.Category || activeCategory, // Ensure category context for AI analysis
        treatment: activeTrial.FormulationName,
        daa,
        rep: activeTrial.Replication || 1,
        category: activeTrial.Category || activeCategory
      }, (msg) => window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type: 'info' } })));

      if (result.success) {
        await createObservationFromAI(activeTrial, daa, result.data, photoDate, photoSrc);
        await updatePhotoAiStatus(activeTrial.ID, photoSrc, 'completed', '', result.data);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI complete! Detected ${result.data.weeds?.length || result.data.targets?.length || 0} targets at DAA ${daa}. Observation saved.`, type: 'success' } }));
      } else {
        await updatePhotoAiStatus(activeTrial.ID, photoSrc, 'failed', result.error || 'AI analysis skipped');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + (result.error || 'Unknown error'), type: 'error' } }));
      }
    } catch (e) {
      await updatePhotoAiStatus(activeTrial.ID, photoSrc, 'failed', e.message);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis error: ' + e.message, type: 'error' } }));
    } finally {
      setAiGenRunning(false);
    }
  };

  // ── AI SUMMARY GENERATION ─────────────────────────────────────────
  const generateAISummary = async (trial = activeTrial) => {
    if (!trial) return;
    const efficacyData = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), trial.Category || activeCategory);
    if (efficacyData.length < 2) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Need at least 2 observations to generate summary', type: 'warning' } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating AI trial summary...', type: 'info' } }));

    const sorted = [...efficacyData].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baseline = sorted[0];
    const latest = sorted[sorted.length - 1];
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
    const finalVal = parseFloat(latest?.[primaryObsField] ?? 0) || 0;
    const wce = calculateEfficacy(activeCategory, finalVal, baseVal);
    const metricLabel = catConfig.primaryMetric.label;
    const metricKey = catConfig.primaryMetric.key;

    // Collect all unique weed species/targets across all observations
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

    // Build summary text
    const daysTracked = latest.daa - baseline.daa;
    let controlRating = 'Poor';
    if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
      controlRating = wce >= 15 ? 'Excellent' : wce >= 8 ? 'Good' : wce >= 3 ? 'Fair' : 'Poor';
    } else {
      controlRating = wce >= 85 ? 'Excellent' : wce >= 70 ? 'Good' : wce >= 50 ? 'Fair' : 'Poor';
    }

    let summaryText = `**${catConfig.name} Trial Summary**\n`;
    summaryText += `Treatment: ${trial.FormulationName || 'Unknown'}\n`;
    summaryText += `Duration: ${daysTracked} days (DAA ${baseline.daa} to ${latest.daa})\n`;
    summaryText += `Initial ${metricLabel}: ${baseVal.toFixed(1)}${catConfig.primaryMetric.unit || ''} → Final: ${finalVal.toFixed(1)}${catConfig.primaryMetric.unit || ''}\n`;
    summaryText += `${metricLabel} (${metricKey}): ${wce.toFixed(1)}% - ${controlRating} Rating\n\n`;

    summaryText += `**Targets Observed:** ${Array.from(allSpecies).join(', ') || 'None identified'}\n`;
    summaryText += `**Status by Target:**\n`;
    Object.entries(speciesControlStatus).forEach(([sp, data]) => {
      const spEfficacy = data.initial > 0
        ? (activeCategory === 'nutrition' || activeCategory === 'biostimulant'
           ? ((data.final / data.initial - 1) * 100).toFixed(0)
           : ((1 - data.final / data.initial) * 100).toFixed(0))
        : 0;
      summaryText += `- ${sp}: ${data.initial}% → ${data.final}% (${metricKey}: ${spEfficacy}%, Status: ${data.status || 'Unknown'})\n`;
    });

    summaryText += `\n**Conclusion:** `;
    if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
      if (wce >= 15) {
        summaryText += `The treatment demonstrated excellent growth and yield enhancement with sustained improvement throughout the trial period.`;
      } else if (wce >= 8) {
        summaryText += `The treatment provided good growth enhancement with significant improvement over control.`;
      } else if (wce >= 3) {
        summaryText += `Moderate improvement observed. Consider refining rate or timing for optimization.`;
      } else {
        summaryText += `Limited improvement observed. Review application details or soil factors.`;
      }
    } else {
      if (wce >= 85) {
        summaryText += `The treatment demonstrated excellent control efficacy with sustained suppression throughout the trial period.`;
      } else if (wce >= 70) {
        summaryText += `The treatment provided good control with significant reduction in pressure. Continued monitoring recommended.`;
      } else if (wce >= 50) {
        summaryText += `Moderate control observed. Consider reapplication or tank-mix options for improved efficacy.`;
      } else {
        summaryText += `Limited control observed. Review application timing, rate, or consider alternative chemistry.`;
      }
    }

    // Update trial with AI-generated conclusion
    const updated = { ...trial, Conclusion: summaryText };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === trial.ID) setActiveTrial(updated);

    try {
      await updateTrial({ ID: trial.ID, Conclusion: summaryText }, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI summary generated and saved to Conclusions', type: 'success' } }));
    } catch (e) {
      console.error('Failed to save AI summary:', e);
    }
  };

  // ── BULK SELECT ───────────────────────────────────────────────────
  const toggleBulk = (id) => setSelectedForBulk(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearBulk = () => setSelectedForBulk(new Set());
  const navigateToCompare = () => {
    // Filter selected trials to only include those from the active category
    const categoryFilteredTrials = trials.filter(t => 
      selectedForBulk.has(t.ID) && ((t.Category || 'herbicide') === activeCategory)
    );
    
    // Show warning if some trials were filtered out due to category mismatch
    if (categoryFilteredTrials.length < selectedForBulk.size) {
      const filteredOutCount = selectedForBulk.size - categoryFilteredTrials.length;
      window.dispatchEvent(new CustomEvent('app:toast', { 
        detail: { 
          msg: `${filteredOutCount} trial(s) from other categories excluded from comparison. Only ${activeCategory} trials can be compared.`, 
          type: 'warning' 
        } 
      }));
    }
    
    updateState({ selectedTrials: categoryFilteredTrials });
    navigate('/compare');
  };
  const handleBulkDelete = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot delete trials.', type: 'error' } }));
      return;
    }
    if (!window.confirm(`Delete ${selectedForBulk.size} trial(s)?`)) return;
    const ids = Array.from(selectedForBulk);
    updateState({ trials: trials.filter(t => !ids.includes(t.ID)) });
    clearBulk();
    for (const id of ids) { try { await deleteTrial({ ID: id }, getAppState); } catch (e) {} }
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${ids.length} trial(s) deleted`, type: 'success' } }));
  };

  const handleBulkFinalize = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot finalize trials.', type: 'error' } }));
      return;
    }
    if (!window.confirm(`Finalize ${selectedForBulk.size} trial(s)?`)) return;
    const ids = Array.from(selectedForBulk);
    const today = new Date().toISOString();
    const updated = trials.map(t => ids.includes(t.ID) ? { ...t, IsCompleted: true, FinalizationDate: today } : t);
    updateState({ trials: updated });
    clearBulk();
    for (const id of ids) {
      try {
        await updateTrial({ ID: id, IsCompleted: true, FinalizationDate: today }, getAppState);
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${ids.length} trial(s) finalized`, type: 'success' } }));
  };

  // ── BULK QR CARD PRINT ────────────────────────────────────────────
  const generateBulkQrCards = () => {
    const selectedTrials = trials.filter(t => selectedForBulk.has(t.ID));
    if (selectedTrials.length === 0) return;

    const sizeConfig = {
      'id-card': { width: '85mm', height: '54mm', cols: 2, qrSize: 120, fontSize: '10px' },
      'a6': { width: '148mm', height: '105mm', cols: 1, qrSize: 180, fontSize: '12px' },
      'a4': { width: '210mm', height: '297mm', cols: 2, qrSize: 200, fontSize: '14px' },
    };
    const config = sizeConfig[qrCardSize] || sizeConfig['id-card'];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please allow popups to print QR cards', type: 'error' } }));
      return;
    }

    // Build live URLs for each trial (scannable by any phone — no app needed)
    const appBase = window.location.origin + window.location.pathname;
    const trialUrls = {};
    selectedTrials.forEach(t => {
      trialUrls[t.ID] = `${appBase}#/live/${t.ID}`;
    });

    const fmtD = (d) => formatDate(d);

    const cardsHtml = selectedTrials.map(trial => {
      const trialCat = trial.Category || 'herbicide';
      const cConf = getCategoryConfig(trialCat);
      const targetLabel = cConf.targetLabel || 'Weed Species';
      const targetValue = trial[cConf.targetField] || trial.WeedSpecies || '';
      return `
        <div class="qr-card" style="
          width: ${config.width};
          min-height: ${config.height};
          border: 2px solid #0d9488;
          border-radius: 12px;
          padding: 14px 12px;
          margin: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          page-break-inside: avoid;
          box-sizing: border-box;
        ">
          <div style="font-size: ${config.fontSize}; font-weight: 800; color: #0d9488; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">
            ${trial.FormulationName || 'Trial'}
          </div>
          <canvas id="qr-${trial.ID}" style="display:block; margin: 4px auto;"></canvas>
          <div style="font-size: calc(${config.fontSize} - 1px); color: #475569; text-align: center; line-height: 1.5; margin-top: 6px; width: 100%;">
            ${trial.InvestigatorName ? `<div><b>Inv:</b> ${trial.InvestigatorName}</div>` : ''}
            ${trial.Location ? `<div><b>Loc:</b> ${trial.Location}</div>` : ''}
            ${trial.Date ? `<div><b>Date:</b> ${fmtD(trial.Date)}</div>` : ''}
            ${trial.Dosage ? `<div><b>Dose:</b> ${trial.Dosage}</div>` : ''}
            ${targetValue ? `<div style="font-size:9px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;"><b>${targetLabel}:</b> ${targetValue}</div>` : ''}
            <div style="font-size: 8px; color: #94a3b8; margin-top: 5px; font-family: monospace;">ID: ${trial.ID.slice(-10)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Serialize trial URLs as a JSON map for the inline script
    const urlMapJson = JSON.stringify(trialUrls).replace(/<\/script>/gi, '<\\/script>');

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>QR Trial Cards</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
  <style>
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
      .qr-card { break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .controls { text-align: center; padding: 20px; background: white; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .print-btn { background: #0d9488; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; }
    .print-btn:hover { background: #0f766e; }
    .cards-container { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  </style>
</head>
<body>
  <div class="controls no-print">
    <h2 style="margin:0 0 8px;">QR Trial Cards &mdash; ${selectedTrials.length} card${selectedTrials.length > 1 ? 's' : ''}</h2>
    <p style="margin:0 0 12px; color:#64748b;">Size: ${qrCardSize.toUpperCase()} &bull; Each QR links to the live trial page</p>
    <button class="print-btn" onclick="window.print()">🖨 Print Cards</button>
  </div>
  <div class="cards-container">
    ${cardsHtml}
  </div>
  <script>
    var urlMap = ${urlMapJson};
    function generateAll() {
      var ids = Object.keys(urlMap);
      ids.forEach(function(id) {
        var canvas = document.getElementById('qr-' + id);
        if (!canvas) return;
        QRCode.toCanvas(canvas, urlMap[id], {
          width: ${config.qrSize},
          margin: 1,
          color: { dark: '#0d9488', light: '#ffffff' },
          errorCorrectionLevel: 'H'
        }, function(err) { if (err) console.error('QR error for', id, err); });
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', generateAll);
    } else {
      generateAll();
    }
  <\/script>
</body>
</html>`);
    printWindow.document.close();
  };

  // ── RESULT BADGE ──────────────────────────────────────────────────
  const sanitizePrintHtml = useCallback((value) => {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }, []);

  const getTrialCardPrintSettings = useCallback(() => {
    const sizeMap = {
      'id-card': { cardWidth: 9, cardHeight: 6, label: 'ID' },
      a6: { cardWidth: 10, cardHeight: 14, label: 'A6' },
      a4: { cardWidth: 19, cardHeight: 13, label: 'A4' },
    };
    return sizeMap[qrCardSize] || sizeMap['id-card'];
  }, [qrCardSize]);

  const buildPrintableTrialUrl = useCallback((trial) => {
    const appBase = window.location.origin + window.location.pathname;
    const settings = state.settings;
    const trialCategory = trial.Category || activeCategory || 'herbicide';
    if (settings?.firebaseEnabled && settings?.firebaseConfig?.apiKey) {
      const config = settings.firebaseConfig;
      const params = new URLSearchParams({
        apiKey: config.apiKey || '',
        authDomain: config.authDomain || '',
        projectId: config.projectId || '',
        storageBucket: config.storageBucket || '',
        messagingSenderId: config.messagingSenderId || '',
        appId: config.appId || '',
        cat: trialCategory
      }).toString();
      return `${appBase}#/live/${trial.ID}?${params}`;
    }
    return `${appBase}#/live/${trial.ID}?cat=${trialCategory}`;
  }, [state.settings, activeCategory]);

  const syncTrialToQrScript = useCallback(async (trialPatch) => {
    const scriptUrl = String(state.settings?.scriptUrl || '').trim();
    const sheetId = String(state.settings?.sheetId || '').trim();
    if (!scriptUrl || !sheetId) return;
    const result = await apiCall('updateTrialRecord', trialPatch, false, getAppState);
    if (result?._errType) {
      throw new Error(result.message || 'Google Apps Script sync failed');
    }
  }, [getAppState, state.settings?.scriptUrl, state.settings?.sheetId]);

  const generateQrCodeDataUrl = useCallback(async (dataString) => {
    try {
      return await QRCodeLib.toDataURL(dataString, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    } catch (error) {
      console.error('QR code generation failed:', error);
      return null;
    }
  }, []);

  const buildTrialCardsCss = useCallback((cardWidth, cardHeight) => `
      @page {
        size: auto;
        margin: 0mm;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
      }
      body { margin: 10mm; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; }
      .print-header {
        margin-bottom: 0.5cm;
        padding: 0.35cm 0.45cm;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #f8fafc;
      }
      .print-header h2 { margin: 0 0 0.15cm; font-size: 14pt; color: #0f172a; }
      .print-header p { margin: 0; font-size: 9pt; color: #64748b; }
      .page {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(${cardWidth}cm, 1fr));
        gap: 0.5cm;
        page-break-after: always;
      }
      .card {
        width: ${cardWidth}cm;
        height: ${cardHeight}cm;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 0px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        page-break-inside: avoid;
        overflow: hidden;
        position: relative;
        background: #ffffff;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      }
      .card-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid;
      }
      .block-theme-1 { background-color: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
      .block-theme-2 { background-color: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
      .block-theme-3 { background-color: #faf5ff; border-color: #e9d5ff; color: #6b21a8; }
      .block-theme-4 { background-color: #fff7ed; border-color: #fed7aa; color: #9a3412; }
      .block-theme-5 { background-color: #fef2f2; border-color: #fecaca; color: #991b1b; }
      .block-theme-6 { background-color: #fefce8; border-color: #fef08a; color: #854d0e; }
      
      .card-content {
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: calc(100% - 28px);
        box-sizing: border-box;
        position: relative;
      }
      .card-title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 6px;
      }
      .card-title-row h3 {
        font-size: 11pt;
        margin: 0;
        font-weight: 800;
        color: #0f172a;
        line-height: 1.25;
      }
      .logo { max-width: 2.2cm; max-height: 1cm; object-fit: contain; flex-shrink: 0; }
      .card-body { padding-right: 2.6cm; flex-grow: 1; }
      .card-body p { font-size: 8pt; margin: 3px 0; color: #475569; display: flex; align-items: center; gap: 4px; }
      .card-body p strong { color: #1e293b; font-weight: 600; }
      .card-footer {
        position: absolute;
        right: 12px;
        bottom: 10px;
        text-align: right;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      .qr-code { width: 2.2cm; height: 2.2cm; display: block; border: 1px solid #f1f5f9; border-radius: 6px; padding: 2px; background: #ffffff; }
      .trial-id { font-size: 7.5px; color: #94a3b8; margin-top: 4px; font-family: monospace; }
      .coord-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 4px;
        margin-top: 6px;
        max-width: 80%;
      }
      .coord-item {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        padding: 3px 5px;
        font-size: 7.5pt;
        color: #334155;
        line-height: 1.1;
      }
      .coord-item strong {
        color: #64748b;
        font-size: 6pt;
        text-transform: uppercase;
        display: block;
        margin-bottom: 1px;
        font-weight: 700;
      }
      .coord-item span {
        color: #1e293b;
        font-weight: 600;
      }
    `, []);

  const buildTrialCardsMarkup = useCallback(async (selectedTrials, companyLogo, fields, blocks) => {
    const cards = [];
    const emojiMap = ['🟢', '🔵', '🟣', '🟠', '🔴', '🟡'];
    
    for (const trial of selectedTrials) {
      const qrCodeUrl = await generateQrCodeDataUrl(buildPrintableTrialUrl(trial));
      const formattedDate = formatDateTime(trial.Date);
      
      const trialCat = trial.Category || 'herbicide';
      const cConf = getCategoryConfig(trialCat);
      const targetLabel = cConf.targetLabel || 'Weed Species';
      const targetValue = trial[cConf.targetField] || trial.WeedSpecies || '';

      const blockIndex = blocks && trial.BlockID ? blocks.findIndex(b => String(b.ID) === String(trial.BlockID)) : -1;
      const blockColorIdx = blockIndex !== -1 ? (blockIndex % 6) : 0;
      const blockThemeClass = `block-theme-${blockColorIdx + 1}`;
      const blockEmoji = emojiMap[blockColorIdx] || '🟢';
      
      const blockName = trial.BlockID ? (blocks?.find(b => String(b.ID) === String(trial.BlockID))?.Name || '') : '';
      const designType = trial.TrialDesign || 'RCBD';
      const designLabel = designType === 'PotTrial' ? 'Pot Trials' : designType;
      
      const bannerTitle = blockName ? `${blockEmoji} ${blockName}` : 'Trial Card';
      
      let designMarkup = '';
      if (fields.designDetails) {
        const items = [];
        if (designType === 'PotTrial') {
          if (trial.PotLabel) {
            items.push(`<strong>Pot</strong><span>${sanitizePrintHtml(trial.PotLabel)}</span>`);
          }
          let posVal = '';
          const rowVal = String(trial.PotRow || '').trim();
          const colVal = String(trial.PotCol || '').trim();
          
          let colClean = colVal.replace(/^Col\s*/i, '').replace(/^C/i, '').trim();
          if (colClean && !colClean.startsWith('C') && !isNaN(colClean)) {
            colClean = 'C' + colClean;
          }
          
          let rowClean = rowVal.replace(/^Row\s*/i, '').replace(/^R/i, '').trim();
          if (rowClean && !rowClean.startsWith('R') && !isNaN(rowClean)) {
            rowClean = 'R' + rowClean;
          }

          if (rowClean && colClean) {
            posVal = `${rowClean}${colClean}`;
          } else if (rowClean) {
            const proj = state.projects?.find(p => p.ID === trial.ProjectID);
            if (proj) {
              const potCols = parseInt(proj.PotCols) || 4;
              posVal = `${rowClean} (C1-C${potCols})`;
            } else {
              posVal = rowClean;
            }
          } else if (colClean) {
            const proj = state.projects?.find(p => p.ID === trial.ProjectID);
            if (proj) {
              const potRows = parseInt(proj.PotRows) || 9;
              const blocksCount = parseInt(proj.PotBlocks || proj.BlocksCount) || 3;
              const rowsPerBlock = Math.floor(potRows / blocksCount) || 1;
              const repNum = parseInt(trial.Replication) || 1;
              const startRow = (repNum - 1) * rowsPerBlock + 1;
              const endRow = Math.min(repNum * rowsPerBlock, potRows);
              if (blocksCount > 1) {
                posVal = `${colClean} (R${startRow}-R${endRow})`;
              } else {
                posVal = colClean;
              }
            } else {
              posVal = colClean;
            }
          }
          if (posVal) {
            items.push(`<strong>Pos</strong><span>${sanitizePrintHtml(posVal)}</span>`);
          }
        } else {
          if (blockName) items.push(`<strong>Block</strong><span>${sanitizePrintHtml(blockName)}</span>`);
          if (trial.Replication) items.push(`<strong>Rep</strong><span>${sanitizePrintHtml(trial.Replication)}</span>`);
          if (trial.PlotNumber) items.push(`<strong>Plot</strong><span>#${sanitizePrintHtml(trial.PlotNumber)}</span>`);
          if (trial.SubBlockID) items.push(`<strong>Sub-Blk</strong><span>${sanitizePrintHtml(trial.SubBlockID)}</span>`);
          if (trial.MainFactor) items.push(`<strong>Main Fac</strong><span>${sanitizePrintHtml(trial.MainFactor)}</span>`);
          if (trial.SubFactor) items.push(`<strong>Sub Fac</strong><span>${sanitizePrintHtml(trial.SubFactor)}</span>`);
        }
        
        if (items.length > 0) {
          designMarkup = `
            <div class="coord-grid">
              ${items.map(item => `<div class="coord-item">${item}</div>`).join('')}
            </div>
          `;
        }
      }

      const hasLogo = fields.logo && companyLogo && (
        companyLogo.startsWith('data:') || 
        companyLogo.startsWith('http') || 
        companyLogo.startsWith('/') || 
        companyLogo.startsWith('.')
      );

      cards.push(`
        <div class="card">
          <div class="card-banner ${blockThemeClass}">
            <span>${sanitizePrintHtml(bannerTitle)}</span>
            <span>${sanitizePrintHtml(designLabel)}</span>
          </div>
          <div class="card-content">
            <div>
              <div class="card-title-row">
                <h3>${fields.formulationName ? sanitizePrintHtml(trial.FormulationName || 'Untitled Trial') : 'Trial Card'}</h3>
                ${hasLogo ? `<img src="${companyLogo}" class="logo" alt="Logo">` : ''}
              </div>
              <div class="card-body">
                ${fields.investigator && trial.InvestigatorName ? `<p>👤 <strong>Inv:</strong> ${sanitizePrintHtml(trial.InvestigatorName)}</p>` : ''}
                ${fields.date && trial.Date ? `<p>📅 <strong>Date:</strong> ${sanitizePrintHtml(formattedDate)}</p>` : ''}
                ${fields.dosage && trial.Dosage ? `<p>🧪 <strong>Dose:</strong> ${sanitizePrintHtml(trial.Dosage)}</p>` : ''}
                ${fields.location && trial.Location ? `<p>📍 <strong>Loc:</strong> ${sanitizePrintHtml(trial.Location)}</p>` : ''}
                ${fields.targetField && targetValue ? `<p>🎯 <strong>${targetLabel}:</strong> ${sanitizePrintHtml(targetValue)}</p>` : ''}
                ${designMarkup}
              </div>
            </div>
            <div class="card-footer">
              ${qrCodeUrl ? `<img src="${qrCodeUrl}" class="qr-code" alt="QR Code">` : ''}
              ${fields.trialId ? `<div class="trial-id">ID: ${trial.ID.slice(-10)}</div>` : ''}
            </div>
          </div>
        </div>
      `);
    }
    return `<div class="page">${cards.join('')}</div>`;
  }, [buildPrintableTrialUrl, generateQrCodeDataUrl, sanitizePrintHtml]);

  const generateBulkQrCardsLegacy = useCallback(async () => {
    const selectedTrials = trials.filter(t => selectedForBulk.has(t.ID));
    if (selectedTrials.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please allow popups to print QR cards', type: 'error' } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating print layout...', type: 'info' } }));

    const firstTrial = selectedTrials[0];
    const proj = state.projects?.find(p => p.ID === firstTrial?.ProjectID);
    const titleName = proj ? proj.Name : (firstTrial?.FormulationName || 'Trials');
    const cleanTitle = titleName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Trial_Cards';
    const dateStr = new Date().toISOString().slice(0, 10);
    const documentTitle = `Trial_Cards_${cleanTitle.replace(/\s+/g, '_')}_${dateStr}`;

    const { cardWidth, cardHeight, label } = getTrialCardPrintSettings();
    const companyLogo = state.settings?.logoBase64 || '';
    const cardsMarkup = await buildTrialCardsMarkup(selectedTrials, companyLogo, qrFields, state.blocks);
    const cardsCss = buildTrialCardsCss(cardWidth, cardHeight);

    printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle}</title>
  <style>${cardsCss}</style>
</head>
<body>
  <div class="print-header no-print">
    <h2>Trial Cards</h2>
    <p>${selectedTrials.length} card${selectedTrials.length > 1 ? 's' : ''} • Size ${label}</p>
  </div>
  ${cardsMarkup}
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 500);
  }, [buildTrialCardsCss, buildTrialCardsMarkup, getTrialCardPrintSettings, selectedForBulk, state.settings?.logoBase64, trials, qrFields, state.blocks, state.projects]);

  const ResultBadge = ({ result }) => {
    if (!result) return null;
    const cls = RESULT_COLORS[result] || 'bg-slate-100 text-slate-600';
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{result}</span>;
  };

  // ── TRIAL CARD HANDLERS ───────────────────────────────────────────
  const handleToggleMenu = useCallback((id) => {
    setOpenCardMenu(v => v === id ? null : id);
  }, []);

  const handleViewDetails = useCallback((trial) => {
    setActiveTrial(trial);
    setDetailTab('info');
  }, []);

  const handleDuplicate = useCallback((trial) => {
    setDuplicateFormulation(trial.FormulationName || '');
    setDuplicateDate(toDatetimeLocal(new Date()));
    setDuplicateDosage('');
    setDuplicateModal(trial);
  }, []);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicateModal) return;
    const trial = duplicateModal;
    setDuplicateModal(null);
    const formMatch = formulations.find(f => f.Name === duplicateFormulation);
    const payload = {
      ...trial,
      ID: undefined,
      FormulationName: duplicateFormulation,
      FormulationID: formMatch ? formMatch.ID : (trial.FormulationID || ''),
      Date: duplicateDate || toDatetimeLocal(new Date()),
      Dosage: duplicateDosage.trim() !== '' ? duplicateDosage.trim() : (trial.Dosage || ''),
      IsCompleted: false, ControlFinalized: false,
      FinalizationDate: '', FinalControlDuration: '',
      PhotoURLs: '[]', WeedPhotosJSON: '[]',
      EfficacyDataJSON: '[]', StatisticsJSON: '',
      Result: '', Conclusion: '', IsLive: true,
    };
    delete payload.ID;
    try {
      const result = await addTrial(payload, getAppState);
      const newTrial = { ...payload, ID: result.ID || result.id || Date.now().toString() };
      updateState({ trials: [newTrial, ...trials] });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Duplicated as "${duplicateFormulation}"`, type: 'success' } }));
    } catch(e) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Duplicate failed', type: 'error' } }));
    }
  }, [duplicateModal, duplicateFormulation, duplicateDate, duplicateDosage, formulations, trials, getAppState, updateState]);

  const handleQuickRate = useCallback(async (trial, rating) => {
    const newRating = trial.Result === rating ? '' : rating;
    const updated = { ...trial, Result: newRating };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    try { await updateTrial({ ID: updated.ID, Result: newRating }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: newRating ? `Rated "${newRating}"` : 'Rating cleared', type: 'success' } }));
  }, [trials, getAppState, updateState]);

  const handleMarkComplete = useCallback(async (trial) => {
    if (!window.confirm(`Mark "${trial.FormulationName}" as completed? This will stop control day counting and deactivate the trial.`)) return;
    const finDate = toDatetimeLocal(new Date());
    const start = trial.Date ? new Date(trial.Date) : new Date();
    const days = Math.max(0, Math.round((new Date() - start) / 86400000));
    const finalDuration = trial.FinalControlDuration || String(days);
    const updated = { ...trial, IsCompleted: true, IsLive: false, FinalizationDate: finDate, FinalControlDuration: finalDuration };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, IsCompleted: true, IsLive: false, FinalizationDate: finDate, FinalControlDuration: finalDuration }, getAppState);
      await syncTrialToQrScript({ ID: updated.ID, IsCompleted: true, IsLive: false, FinalizationDate: finDate, FinalControlDuration: finalDuration });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Trial completed — ${finalDuration} control days recorded`, type: 'success' } }));
    } catch(e) {}
  }, [trials, activeTrial, getAppState, updateState, syncTrialToQrScript]);

  const handleRecordWeather = useCallback(async (trial) => {
    if (!window.confirm(`Do you want to fetch and record the current real-time weather data for "${trial.FormulationName || 'this trial'}"?`)) {
      return;
    }
    let lat = trial.Lat;
    let lon = trial.Lon;
    const fetchAndSave = async (targetLat, targetLon) => {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Fetching current weather data...', type: 'info' } }));
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const weather = await fetchWeather(targetLat, targetLon, todayStr, getAppState);
        if (weather) {
          const patch = {
            ID: trial.ID,
            Temperature: weather.temp !== undefined ? String(weather.temp) : (trial.Temperature || ''),
            Humidity: weather.humidity !== undefined ? String(weather.humidity) : (trial.Humidity || ''),
            Windspeed: weather.wind !== undefined ? String(weather.wind) : (trial.Windspeed || ''),
            Rain: weather.rain !== undefined ? String(weather.rain) : (trial.Rain || '')
          };
          const updated = { ...trial, ...patch };
          updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
          await updateTrial(patch, getAppState);
          await syncTrialToQrScript(patch);
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { 
              msg: `Weather updated: Temp ${weather.temp}°C, Humidity ${weather.humidity}%, Wind ${weather.wind} km/h`, 
              type: 'success' 
            } 
          }));
        } else {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to fetch weather data.', type: 'error' } }));
        }
      } catch (err) {
        console.error("Failed to update weather:", err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Error updating weather: ' + err.message, type: 'error' } }));
      }
    };
    if (lat && lon) {
      await fetchAndSave(lat, lon);
    } else if (navigator.geolocation) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No trial coordinates. Using GPS location...', type: 'info' } }));
      navigator.geolocation.getCurrentPosition(
        pos => fetchAndSave(pos.coords.latitude.toFixed(8), pos.coords.longitude.toFixed(8)),
        () => {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Geolocation denied. Cannot fetch weather.', type: 'error' } }));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial coordinates and Geolocation missing.', type: 'error' } }));
    }
  }, [trials, getAppState, updateState, syncTrialToQrScript]);

  const handleQuickPhoto = useCallback((trial) => {
    quickActionTrialRef.current = trial;
    setCameraMode('general');
    setIsCameraOpen(true);
  }, []);

  const handleQuickGalleryUpload = useCallback((trial) => {
    quickActionTrialRef.current = trial;
    setCameraMode('general');
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleActivateToggle = useCallback(async (trial) => {
    const isCurrentlyLive = String(trial.IsLive) !== 'false';
    const patch = isCurrentlyLive
      ? { IsLive: false }
      : { IsLive: true, IsCompleted: false, FinalizationDate: '', FinalControlDuration: '' };
    const updated = { ...trial, ...patch };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
    try {
      await updateTrial({ ID: updated.ID, ...patch }, getAppState);
      await syncTrialToQrScript({ ID: updated.ID, ...patch });
    } catch(e) {}
    if (!isCurrentlyLive) window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial reactivated — control days reset', type: 'success' } }));
  }, [trials, activeTrial, updateState, getAppState, syncTrialToQrScript]);

  const handleEditControlDays = useCallback(async (trial) => {
    const current = trial.FinalControlDuration || String(Math.max(0, Math.round((new Date() - new Date(trial.Date || Date.now())) / 86400000)));
    const val = window.prompt(`Edit control days for "${trial.FormulationName}":`, current);
    if (val === null || val.trim() === '') return;
    const days = parseInt(val.trim(), 10);
    if (isNaN(days) || days < 0) { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Invalid number', type: 'error' } })); return; }
    const updated = { ...trial, FinalControlDuration: String(days) };
    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
    try { await updateTrial({ ID: updated.ID, FinalControlDuration: String(days) }, getAppState); } catch(e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Control days set to ${days}`, type: 'success' } }));
  }, [trials, activeTrial, updateState, getAppState]);



  // ── TABS ──────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    all: trials.length,
    standard: trials.filter(t => !t.ProjectID).length,
    rcbd: trials.filter(t => !!t.ProjectID).length,
    control: trials.filter(t => (t.IsControl === true || t.IsControl === 'true') && !t.ProjectID).length,
    finalized: trials.filter(t => t.IsCompleted === true || t.IsCompleted === 'true').length,
  }), [trials]);

  // DAA coverage analysis for photos/observations
  const daaCoverage = useMemo(() => {
    if (!activeTrial) return { allDAAs: [], obsDAAs: [], photoDAAs: [], hasGaps: false };
    const obs = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeTrial.Category || activeCategory, true);
    const photoDAAs = activeTrial.Date 
      ? detailPhotos.map(p => p.date ? calculateDAA(p.date, activeTrial.Date) : null).filter(val => val !== null)
      : [];
    const obsDAAs = obs.map(o => o.daa).filter(d => d !== undefined && d !== null);
    const allDAAs = [...new Set([...obsDAAs, ...photoDAAs])].sort((a, b) => a - b);
    const maxDAA = allDAAs.length > 0 ? Math.max(...allDAAs) : 0;
    const hasGaps = maxDAA > 0 && allDAAs.length < maxDAA + 1;
    return { allDAAs, obsDAAs: [...new Set(obsDAAs)], photoDAAs: [...new Set(photoDAAs)], hasGaps };
  }, [activeTrial, detailPhotos]);

  // Chart data computation
  const chartDataComputed = useMemo(() => {
    const chartData = detailEfficacy.filter(o => o.daa !== undefined);
    if (chartData.length === 0) return null;
    const maxDaa = Math.max(...chartData.map(o => o.daa)) || 1;
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const maxVal = Math.max(...chartData.map(o => Number(getObservationPrimaryValue(activeCategory, o) ?? 0)), 10);
    const baseVal = Number(getObservationPrimaryValue(activeCategory, chartData[0]) ?? 0);
    const W = 340, H = 180, PX = 40, PY = 20, PB = 30;
    const cx = d => PX + (d / (maxDaa || 1)) * (W - PX - 16);
    const cy = v => PY + (1 - (v / maxVal)) * (H - PY - PB);
    const pts = chartData.map(o => `${cx(o.daa)},${cy(Number(getObservationPrimaryValue(activeCategory, o) ?? 0))}`).join(' ');
    const wcePts = baseVal > 0 ? chartData.map(o => {
      const val = Number(getObservationPrimaryValue(activeCategory, o) ?? 0);
      const eff = calculateEfficacy(activeCategory, val, baseVal);
      return `${cx(o.daa)},${cy((eff / 100) * maxVal)}`;
    }).join(' ') : null;
    const finalVal = parseFloat(chartData[chartData.length-1]?.[primaryObsField] ?? chartData[chartData.length-1]?.weedCover ?? 0);
    const lastWce = baseVal > 0 ? Math.round(calculateEfficacy(activeCategory, finalVal, baseVal)) : null;
    return { chartData, maxDaa, maxCover: maxVal, baseCover: baseVal, W, H, PX, PY, PB, cx, cy, pts, wcePts, lastWce };
  }, [detailEfficacy, activeCategory]);

  // Status class mapping for observations
  const STATUS_CLS = useMemo(() => ({
    Controlled: 'bg-emerald-100 text-emerald-800',
    Eliminated: 'bg-emerald-200 text-emerald-900',
    Suppressed: 'bg-blue-100 text-blue-800',
    'Top-kill': 'bg-teal-100 text-teal-800',
    Burndown: 'bg-orange-100 text-orange-800',
    Regrowth: 'bg-red-100 text-red-800',
    'Re-emerged': 'bg-red-200 text-red-800',
    Resistant: 'bg-rose-200 text-rose-900',
    Unaffected: 'bg-slate-200 text-slate-700',
    Emerged: 'bg-amber-100 text-amber-800',
    'Not detected': 'bg-slate-100 text-slate-500',
    Sufficient: 'bg-emerald-100 text-emerald-800',
    Deficient: 'bg-rose-100 text-rose-800',
    Marginal: 'bg-amber-100 text-amber-800',
    Vigorous: 'bg-emerald-200 text-emerald-900',
    Stressed: 'bg-orange-100 text-orange-800',
    Healthy: 'bg-emerald-100 text-emerald-800',
    Symptomatic: 'bg-yellow-100 text-yellow-800',
    'N/A': 'bg-slate-100 text-slate-400 border border-slate-200'
  }), []);

  // Pre-compute observations sorting and values
  const obsData = useMemo(() => {
    const sorted = [...detailEfficacy].sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const primaryObsField = getPrimaryObservationField(activeCategory);
    const baseCover = parseFloat(sorted[0]?.[primaryObsField] ?? sorted[0]?.weedCover ?? 0) || 0;
    return { sorted, baseCover };
  }, [detailEfficacy, activeCategory]);

  // ── QR CODE GENERATOR ─────────────────────────────────────────────
  const buildQrText = useCallback((trial, mode) => {
    if (mode === 'online') {
      return buildPrintableTrialUrl(trial);
    }
    // Offline: compact human-readable text encoding (like HTML app)
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
  }, [buildPrintableTrialUrl, state.settings]);

  const generateQR = useCallback(async (trial, mode) => {
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
  }, [qrMode, buildQrText]);

  const downloadQR = useCallback(() => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    if (!qrCanvasRef.current) return;
    const a = document.createElement('a');
    a.download = `QR_${detailTrial?.FormulationName || 'trial'}_${qrMode}.png`;
    a.href = qrCanvasRef.current.toDataURL('image/png');
    a.click();
  }, [detailTrial, qrMode, canDownload]);

  // ── AI SUMMARY GENERATOR ──────────────────────────────────────────
  const generateAiSummary = useCallback(async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot generate AI summaries.', type: 'error' } }));
      return;
    }
    if (!detailTrial) return;
    const geminiKeys = getAPIKeys('gemini');
    if (!geminiKeys.length) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No Gemini API key configured in Settings', type: 'error' } }));
      return;
    }
    setAiLoading(true);
    setAiSummary('');
    try {
      const efficacy = validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []), detailTrial.Category || activeCategory);
      const trialDate = detailTrial.Date || '';
      const getDaaVal = (o) => {
        if (o.daa !== undefined && o.daa !== null && o.daa !== '' && o.daa !== '—') {
          const parsed = Number(o.daa);
          if (!isNaN(parsed)) return parsed;
        }
        return calculateDAA(o.date, trialDate);
      };
      const sorted = [...efficacy].sort((a, b) => getDaaVal(a) - getDaaVal(b));

      const trialCat = detailTrial.Category || 'herbicide';
      const cConf = getCategoryConfig(trialCat);
      const targetLabel = cConf.targetLabel || 'Weed Species';
      const targetField = cConf.targetField || 'WeedSpecies';
      const targetValue = detailTrial[targetField] || detailTrial.WeedSpecies || 'Not specified';
      const primaryMetricKey = cConf.primaryMetric?.key || 'WCE';
      const primaryMetricLabel = cConf.primaryMetric?.label || 'Weed Control Efficiency';
      const primaryMetricUnit = cConf.primaryMetric?.unit || '%';
      const primaryField = getPrimaryObservationField(trialCat);

      // Build a rich observation timeline for the AI
      const obsLines = sorted.map(o => {
        const val = getObservationPrimaryValue(trialCat, o) ?? '?';
        const speciesLine = (o.weedDetails || []).map(w => `${w.species}: ${w.cover}%`).join(', ');
        return `  DAA ${getDaaVal(o)}: total ${cConf.observationFields?.[0]?.label || 'level'} ${val}${primaryMetricUnit}${speciesLine ? ` (${speciesLine})` : ''}${o.notes ? ` — ${o.notes}` : ''}`;
      }).join('\n');

      // Compute key metrics to feed the AI
      const baseline = sorted[0];
      const latest = sorted[sorted.length - 1];
      const baseCover = Number(getObservationPrimaryValue(trialCat, baseline) ?? 0);
      const finalCover = Number(getObservationPrimaryValue(trialCat, latest) ?? 0);
      const isPositiveMetric = (trialCat === 'nutrition' || trialCat === 'biostimulant');
      let wce = 0;
      if (isPositiveMetric) {
        wce = baseCover > 0 ? ((finalCover - baseCover) / baseCover) * 100 : 0;
      } else {
        wce = baseCover > 0 ? ((baseCover - finalCover) / baseCover) * 100 : 0;
      }
      wce = Math.max(0, wce);

      const minObs = sorted.reduce((m, o) => {
        const valO = Number(getObservationPrimaryValue(trialCat, o) ?? 0);
        const valM = Number(getObservationPrimaryValue(trialCat, m) ?? 0);
        return valO < valM ? o : m;
      }, sorted[0] ?? {});

      const controlDaysVal = detailTrial.FinalControlDuration
        ? parseInt(detailTrial.FinalControlDuration, 10)
        : (detailTrial.Date ? Math.max(0, Math.round((new Date() - new Date(detailTrial.Date)) / 86400000)) : null);

      const allSpecies = new Set();
      sorted.forEach(o => {
        (o.weedDetails || []).forEach(wd => {
          if (wd.species && wd.species.toLowerCase() !== 'total') {
            allSpecies.add(wd.species);
          }
        });
      });

      const speciesMap = {};
      allSpecies.forEach(sp => {
        speciesMap[sp] = [];
        sorted.forEach(o => {
          const match = (o.weedDetails || []).find(wd => wd.species === sp);
          if (match) {
            speciesMap[sp].push({ daa: o.daa, cover: match.cover ?? 0, status: match.status || '' });
          } else {
            speciesMap[sp].push({ daa: o.daa, cover: 0, status: 'Not detected' });
          }
        });
      });

      const speciesAnalysis = Object.entries(speciesMap).map(([sp, pts]) => {
        const spSorted = pts.sort((a, b) => a.daa - b.daa);
        const spInit = spSorted[0]?.cover ?? 0;
        const spFinal = spSorted[spSorted.length - 1]?.cover ?? 0;
        const spMin = Math.min(...spSorted.map(p => p.cover));
        const spMinDaa = spSorted.find(p => p.cover === spMin)?.daa ?? 0;
        const spWce = spInit > 0 ? Math.max(0, ((spInit - spFinal) / spInit) * 100).toFixed(1) : '0';
        const trajectory = spSorted.map(p => `DAA${p.daa}:${p.cover}%`).join(' → ');
        return `  ${sp}: ${trajectory} | WCE ${spWce}% | Best suppression ${spMin}% at DAA${spMinDaa} | Final ${spFinal}%`;
      }).join('\n') || '  No per-species data recorded.';

      const fmtTrialDate = formatDate(detailTrial.Date) || 'N/A';

      const prompt = `You are a senior agronomist/scientist writing a professional ${cConf.name} field trial narrative for an official regulatory-style report (SOP/TDS validation standard).
      
      Do NOT include any observations about photo mismatches, data anomalies, or reporting inconsistencies in the main 5 sections. Any data anomalies or discrepancies must be appended strictly at the end, separated by a custom delimiter.
      
      Do NOT include any suggestions, recommendations, comments about further monitoring, or proposals for future testing inside the main 5 sections. Keep the 5 sections strictly factual, reporting only observed data and final factual performance assessments. All recommendations, suggestions, and speculative remarks must be appended strictly at the end after the delimiter.

TRIAL DATA:
- Product: ${detailTrial.FormulationName}
- Application date: ${fmtTrialDate}, Location: ${detailTrial.Location || 'N/A'}
- Dosage: ${detailTrial.Dosage || 'N/A'}
- Target ${targetLabel}: ${targetValue}
- Control days tracked: ${controlDaysVal != null ? controlDaysVal + ' days' : 'Ongoing'}
- Trial status: ${(detailTrial.IsCompleted === true || detailTrial.IsCompleted === 'true') ? 'Completed/Finalized' : 'Ongoing'}
- Rated result: ${detailTrial.Result || 'Not yet rated'}
- Overall ${primaryMetricKey}: ${wce.toFixed(1)}% (initial ${baseCover}${primaryMetricUnit} → final ${finalCover}${primaryMetricUnit})
- Best overall suppression: ${Number(getObservationPrimaryValue(trialCat, minObs) ?? '?')}% at DAA ${minObs.daa ?? '?'}

FULL OBSERVATION TIMELINE (Days After Application → total ${targetLabel.toLowerCase()} level):
${obsLines || '  No observations recorded yet.'}

PER-SPECIES/TARGET BREAKDOWN:
${speciesAnalysis}

${cConf.name.toUpperCase()} CONTROL DURATION BENCHMARKS (use these exact thresholds):
- ≤7 days of effective suppression = Poor
- 8–17 days = Fair
- 18–27 days = Good
- 28+ days = Excellent
- "Effective suppression" means level stayed below 30% of initial level (or was maintained above 80% for positive nutrition/biostimulant metrics) before significant regrowth/decline.
- If target levels increase/decrease negatively at later DAAs after an initial response, regrowth or performance decline is occurring — note the regrowth DAA.

LANGUAGE AND TONE RULES — follow strictly:
1. Regulatory-neutral tone. Do NOT use aggressive or emotive language (avoid: "complete lack of efficacy", "product failed", "unacceptable", "benchmark for effective suppression"). Use neutral, factual phrasing: "inadequate control under the evaluated conditions", "no measurable suppression was observed", "no observable response attributable to the treatment", "indicating insufficient performance".
2. Do NOT speculate beyond observed data. Use level % data only.
3. Do NOT write "best or worst performance" comparisons — only state observed values objectively.
4. Do NOT use any markdown formatting (no **, no *, no #, no bullet dashes, no hyphens as bullets). Plain text only.
5. Section headings as plain numbered text: "1. Application & Setup" on its own line.
6. SPECIES/TARGET HEADING RULE: Each target heading must be written as "Common Name (Scientific Name)" if scientific name is available. If no common name is known, write only the scientific name.
6a. SCIENTIFIC NAME CAPITALISATION: Always format scientific names as "Genus species" — Genus is capitalised, species epithet is fully lowercase.
7. Application date must be formatted as DD-Mon-YYYY (e.g. 19-Apr-2026). Dosage units: write "mL" not "ml". Write coordinates as provided. Use "at coordinates X, Y" — never "at location X, Y".
8. Do NOT use herbicide-only terminology like "phytotoxic" or "weed control efficiency" unless this is a herbicide trial. Use generic equivalents like "treatment injury symptoms" or "${primaryMetricLabel}" respectively.
9. Write in third person. Past tense for finalized trials, present tense for ongoing.
10. Include a detailed, scientific conclusion in Section 5. If overall level dropped significantly, do NOT conclude that the treatment failed. Keep all comments about observation anomalies, data mismatch, suggestions, recommendations, or potential incorrect uploads completely out of the 5 main sections.

OUTPUT STRUCTURE — write exactly these 5 sections, nothing else:

1. Application & Setup
One sentence. Start directly with the product name (no "Product X was applied" prefix — just "[Product name] was applied…"). Include dosage (with proper units), application date (DD-Mon-YYYY), coordinates, and all target species with scientific names in parentheses.

2. Overall Efficacy Trajectory
Exactly 3 sentences. Follow this structure precisely:
- Sentence 1: "At DAA ${baseline ? getDaaVal(baseline) : 0}, total ${targetLabel.toLowerCase()} level was recorded at X%."
- Sentence 2: Dynamically describe the final level and its control interpretation based on the actual data.
- Sentence 3: Dynamically describe the presence, progression, or absence of treatment injury symptoms observed in the timeline notes.

3. Species-wise / Target Performance
For EACH target in the breakdown — write the heading, then 1-2 sentences:
- Begin each paragraph with "At DAA X,".
- State value at each observed DAA factually.
- For no-control cases use: "No measurable suppression or reduction was observed for this target."
- After ALL targets, write ONE closing summary sentence on its own line summarizing the overall control trajectory.

4. Control Duration Interpretation
Exactly 2 sentences. Follow this structure:
- Sentence 1: Dynamically describe the change or reduction in target level over the observation period based on the data.
- Sentence 2: "Treatment performance was classified as [Poor/Fair/Good/Excellent], indicating [sufficient/highly effective/moderate/insufficient] control performance under the evaluated field conditions."

5. Agronomic Conclusion & Performance Assessment
Write 3 to 4 detailed sentences providing a proper scientific conclusion:
- Sentence 1: Detail the duration of effective control and peak control percentage/level.
- Sentence 2: Detail which targets were successfully addressed.
- Sentence 3: Detail which targets re-emerged or regrew during the trial and at which DAA.
- Sentence 4: Conclude with a final factual agronomic performance assessment statement for the treatment under the evaluated conditions. Do NOT include future trial recommendations, suggestions for further evaluations, or speculative remarks.

DETAILED ANOMALIES & SUGGESTIONS (APPEND SEPARATELY):
At the very end of your response, after the 5 sections, write a delimiter line: "---ANOMALIES---"
Following this delimiter, perform:
1. Chronological and biological anomaly detection check.
2. Factual recommendations, suggestions for future trials, and comments regarding further monitoring or evaluations.
If none are present, write "None".`;

      const text = await generateTextWithAI(prompt, 'You are an agronomist generating professional trial report summaries.');
      
      let cleanNarrative = text;
      let anomalies = '';
      if (text.includes('---ANOMALIES---')) {
        const parts = text.split('---ANOMALIES---');
        cleanNarrative = parts[0].trim();
        anomalies = parts[1].trim();
      }

      setAiSummary(cleanNarrative);
      // ── Persist to Firebase so it survives refresh ──
      const obsCount = efficacy.length;
      const existing = safeJsonParse(detailTrial.AISummariesJSON, {});
      const updatedSummaries = { 
        ...existing, 
        narrative: cleanNarrative, 
        anomalies, 
        narrativeObsCount: obsCount, 
        narrativeGeneratedAt: new Date().toISOString() 
      };
      const updatedTrial = { ...detailTrial, AISummariesJSON: JSON.stringify(updatedSummaries) };
      updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
      setActiveTrial(updatedTrial);
      try { 
        await updateTrial({ ID: updatedTrial.ID, AISummariesJSON: updatedTrial.AISummariesJSON }, getAppState); 
      } catch(e) {
        console.error('Failed to save AI summary:', e);
      }
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI narrative saved!', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `AI error: ${err.message}`, type: 'error' } }));
    } finally {
      setAiLoading(false);
    }
  }, [detailTrial, state.settings, trials, updateState, getAppState]);

  // Load saved AI narrative when switching to AI tab or changing trial
  useEffect(() => {
    const saved = safeJsonParse(detailTrial?.AISummariesJSON, {});
    setAiSummary(saved.narrative || '');
    setQrGenerated(false);
    setExportMenuOpen(false);
  }, [detailTrial?.ID]);

  // Automatically correct existing stale ratings (e.g. legacy/deleted observations not matching Result field) on trial selection
  useEffect(() => {
    if (!detailTrial) return;
    const efficacy = validateEfficacyData(safeJsonParse(detailTrial.EfficacyDataJSON, []), detailTrial.Category || activeCategory, true);
    const calculated = calculateResultRating(efficacy, detailTrial?.IsControl === true || detailTrial?.IsControl === 'true', detailTrial?.Category || activeCategory, detailTrial);
    if (calculated !== detailTrial.Result) {
      const updated = { ...detailTrial, Result: calculated };
      updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
      setActiveTrial(updated);
      updateTrial({ ID: updated.ID, Result: calculated }, getAppState).catch(console.error);
    }
  }, [detailTrial?.ID, detailTrial?.EfficacyDataJSON, trials, updateState, getAppState]);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  // Close card menus on outside click
  useEffect(() => {
    if (!openCardMenu) return;
    const handler = () => setOpenCardMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openCardMenu]);

  const triggerExportWithCustomisation = useCallback((exportFn) => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    const currentProj = detailTrial ? projects.find(p => String(p.ID) === String(detailTrial.ProjectID)) : null;
    const isPotTrial = currentProj?.Design === 'PotTrial';
    const fields = isPotTrial
      ? (currentProj.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield']).map(f => ({ key: f, label: f }))
      : (getCategoryConfig(activeCategory).observationFields || []);
    const initialSelection = {};
    fields.forEach(f => {
      initialSelection[f.key] = true;
    });
    setReportFieldSelection(initialSelection);
    setPendingReportExport(() => exportFn);
    setCustomiseReportModalOpen(true);
  }, [activeCategory, canDownload, detailTrial, projects]);

  // ── EXPORT FUNCTIONS (delegated to trialReports.js service) ─────────
  const exportTxtReport     = useCallback((trial) => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    const proj = projects.find(p => p.ID === trial.ProjectID);
    exportFieldReportTxt(trial, proj?.Name || '');
  }, [projects, canDownload]);

  const exportCsv           = useCallback((trial) => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    exportToCSV(trial, activeCategory);
  }, [canDownload]);

  const exportJson          = useCallback((trial) => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    exportJsonFile(trial);
  }, [canDownload]);

  const exportHtmlSlide     = useCallback((trial) => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    const proj = projects.find(p => p.ID === trial.ProjectID);
    exportHtmlReport(trial, proj?.Name || '');
  }, [projects, canDownload]);

  const exportAllCsv        = useCallback(() => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    exportAllTrialsCSV(trials, projects, activeCategory);
  }, [trials, projects, activeCategory, canDownload]);

  const shareTrial          = useCallback((trial) => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download/Export permission is disabled for your account.', type: 'error' } }));
      return;
    }
    shareTrialFn(trial);
  }, [canDownload]);
  // Helper: check if AI narrative is stale before export
  const checkAiNarrativeBeforeExport = useCallback((trial, proceed) => {
    const saved = safeJsonParse(trial.AISummariesJSON, {});
    const currentObsCount = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), trial.Category || activeCategory).length;
    const savedObsCount = saved.narrativeObsCount ?? null;
    const hasNarrative = !!saved.narrative;
    if (!hasNarrative) {
      // No narrative at all — offer to continue without or cancel
      if (window.confirm('No AI narrative has been generated for this trial yet.\n\nClick OK to download the report without AI narrative, or Cancel to go generate one first (AI tab).')) {
        proceed();
      }
      return;
    }
    if (savedObsCount !== null && currentObsCount > savedObsCount) {
      // Stale narrative — new observations added since last generation
      const genDate = saved.narrativeGeneratedAt ? new Date(saved.narrativeGeneratedAt).toLocaleString() : 'unknown';
      if (window.confirm(`New observations have been added since the AI narrative was last generated (${genDate}, based on ${savedObsCount} observation${savedObsCount !== 1 ? 's' : ''}).\n\nCurrently there ${currentObsCount === 1 ? 'is' : 'are'} ${currentObsCount} observation${currentObsCount !== 1 ? 's' : ''}.\n\nClick OK to download with the existing narrative, or Cancel to regenerate first (AI tab).`)) {
        proceed();
      }
      return;
    }
    // Narrative is fresh — proceed directly
    proceed();
  }, []);

  // PDF variants — matching legacy buttons exactly
  const handleExportPdf          = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: false, withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportPdfNoIng     = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: false, withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportPdfWeedsIng  = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: true,  withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportPdfWeeds     = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: true,  withTimeline: false, ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportFullNoIng    = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: false, withWeeds: true,  withTimeline: true,  ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportFullIng      = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => generateComprehensivePdf(trial, { withIngredients: true,  withWeeds: true,  withTimeline: true,  ...opts, formulations: state.formulations || [] })), [state.formulations, checkAiNarrativeBeforeExport]);
  // Scientific PDF variants — pass narrative into report
  const handleExportSciPdf       = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => { const saved = safeJsonParse(trial.AISummariesJSON, {}); const aiSummary = saved.narrative || saved.cover || ''; generateScientificReport(trial, { withIngredients: false, aiSummary, ...opts, formulations: state.formulations || [] }); }), [state.formulations, checkAiNarrativeBeforeExport]);
  const handleExportSciPdfIng    = useCallback((trial, opts = {}) => checkAiNarrativeBeforeExport(trial, () => { const saved = safeJsonParse(trial.AISummariesJSON, {}); const aiSummary = saved.narrative || saved.cover || ''; generateScientificReport(trial, { withIngredients: true,  aiSummary, ...opts, formulations: state.formulations || [] }); }), [state.formulations, checkAiNarrativeBeforeExport]);
  // DOC variants
  const handleExportDocNoIng     = useCallback((trial) => exportTrialDocx(trial, { withIngredients: false, withWeeds: true,  formulations: state.formulations || [] }), [state.formulations]);
  const handleExportDocIng       = useCallback((trial) => exportTrialDocx(trial, { withIngredients: true,  withWeeds: true,  formulations: state.formulations || [] }), [state.formulations]);
  // PPT
  const handleExportPpt          = useCallback((trial) => generatePpt(trial), []);
  // Advanced Excel (11-Sheet)
  const handleExportAdvancedExcel = useCallback(async (trial) => {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating Advanced Excel Report...', type: 'info' } }));
    try {
      const generator = new AdvancedReportGenerator(trial, activeCategory);
      await generator.generateCompleteReport();
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Report generated successfully!', type: 'success' } }));
    } catch (error) {
      console.error(error);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to generate report: ${error.message}`, type: 'error' } }));
    }
  }, [activeCategory]);

  const handleAiSingleGenerate = useCallback(async (trial) => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot generate AI reports.', type: 'error' } }));
      return;
    }
    const geminiKeys = getAPIKeys('gemini');
    if (!geminiKeys.length) { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Add a Gemini API key in Settings first', type: 'error' } })); return; }
    const efficacy = validateEfficacyData(safeJsonParse(trial.EfficacyDataJSON, []), trial.Category || activeCategory);
    if (efficacy.length === 0) { window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No observations to analyze. Log observations first.', type: 'error' } })); return; }
    setAiGenRunning(true);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Generating AI efficacy report for ${trial.FormulationName}...`, type: 'info' } }));
    try {
      const trialCat = trial.Category || 'herbicide';
      const cConf = getCategoryConfig(trialCat);
      const targetLabel = cConf.targetLabel || 'Weed Species';
      const targetField = cConf.targetField || 'WeedSpecies';
      const targetValue = trial[targetField] || trial.WeedSpecies || 'Not specified';
      const primaryField = getPrimaryObservationField(trialCat);
      const primaryMetricLabel = cConf.primaryMetric?.label || 'Efficacy';
      const obsText = efficacy.map(o => {
        const val = o[primaryField] ?? o.weedCover ?? 0;
        const details = (o.weedDetails || []).map(w => `${w.species} ${w.cover}% ${w.status}`).join(', ');
        return `DAA ${o.daa}: value=${val} [${details}]`;
      }).join('; ');
      const prompt = `You are an expert agricultural scientist. Write a concise scientific narrative (3-5 paragraphs) for this ${cConf.name} efficacy trial:\n\nFormulation: ${trial.FormulationName}\nDosage: ${trial.Dosage}\nTarget ${targetLabel}: ${targetValue}\nLocation: ${trial.Location}\nDate Applied: ${trial.Date}\nResult Rating: ${trial.Result}\nObservations: ${obsText}\nWeather: Temp ${trial.Temperature}°C, Humidity ${trial.Humidity}%, Wind ${trial.Windspeed} km/h\n\nAddress: initial ${cConf.observationFields?.[0]?.label || 'level'}, response trajectory, final efficacy (${primaryMetricLabel}), and recommendation.`;
      const text = await generateTextWithAI(prompt, 'You are an agricultural researcher writing official trial narrative reports.');
      const summaries = { cover: text, generatedAt: new Date().toISOString() };
      const updated = { ...trial, AISummariesJSON: JSON.stringify(summaries) };
      updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
      if (activeTrial?.ID === updated.ID) setActiveTrial(updated);
      try { await updateTrial({ ID: updated.ID, AISummariesJSON: updated.AISummariesJSON }, getAppState); } catch(e) {}
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI report saved!', type: 'success' } }));
      setDetailTab('ai');
    } catch(err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI generation failed: ' + err.message, type: 'error' } }));
    } finally { setAiGenRunning(false); }
  }, [state.settings, trials, activeTrial, updateState, getAppState]);

  const handleSavePhotoEdit = useCallback(async () => {
    if (!activeTrial || !photoEditModal) return;
    const photos = safeJsonParse(activeTrial.PhotoURLs, []);
    const oldPhoto = photos[photoEditModal.idx];
    const oldDate = oldPhoto?.date;
    const newDate = photoEditModal.date;

    // Find sequence rank of this photo in chronological order before updating it
    const sortedOriginalPhotos = [...photos].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const rank = sortedOriginalPhotos.indexOf(oldPhoto);

    photos[photoEditModal.idx] = { ...oldPhoto, label: photoEditModal.label, date: formatPhotoDate(newDate) };

    const efficacyData = validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeTrial.Category || activeCategory, true);
    let efficacyChanged = false;

    if (oldDate && newDate && oldDate !== newDate) {
      const oldDaa = activeTrial.Date ? calculateDAA(oldDate, activeTrial.Date) : null;
      const newDaa = activeTrial.Date ? calculateDAA(newDate, activeTrial.Date) : null;

      // 1. Try matching by photoUrl
      let matched = false;
      const photoUrlToMatch = oldPhoto?.url || oldPhoto?.fileData;
      if (photoUrlToMatch) {
        efficacyData.forEach(obs => {
          if (obs.photoUrl === photoUrlToMatch) {
            obs.date = newDate;
            if (newDaa !== null) obs.daa = newDaa;
            efficacyChanged = true;
            matched = true;

            // Check if there is an existing observation with the same DAA
            const duplicateObs = efficacyData.find(o => o !== obs && Number(o.daa) === Number(newDaa));
            if (duplicateObs) {
              const confirmMerge = window.confirm(
                `An observation at DAA ${newDaa} already exists. Do you want to merge this photo's observation metrics into the existing DAA ${newDaa} observation and delete the duplicate entry?`
              );
              if (confirmMerge) {
                const count = duplicateObs.sampleCount || 1;
                const config = getCategoryConfig(activeTrial.Category || activeCategory);
                const fieldsToMerge = [
                  ...(config.observationFields || []).map(f => f.key),
                  'weedCover'
                ];
                
                fieldsToMerge.forEach(key => {
                  if (obs[key] !== undefined && obs[key] !== null && obs[key] !== '') {
                    const val1 = parseFloat(duplicateObs[key]);
                    const val2 = parseFloat(obs[key]);
                    if (!isNaN(val1) && !isNaN(val2)) {
                      duplicateObs[key] = Number((((val1 * count) + val2) / (count + 1)).toFixed(2));
                    } else if (!isNaN(val2)) {
                      duplicateObs[key] = val2;
                    }
                  }
                });
                
                const speciesMap = new Map();
                const addSpecies = (item) => {
                  if (!item || !item.species) return;
                  const existingSpec = speciesMap.get(item.species);
                  const coverVal = parseFloat(item.cover);
                  if (existingSpec) {
                    if (!isNaN(coverVal)) {
                      const specCount = existingSpec.count || 1;
                      const oldCov = parseFloat(existingSpec.cover);
                      existingSpec.cover = !isNaN(oldCov) ? Number((((oldCov * specCount) + coverVal) / (specCount + 1)).toFixed(2)) : coverVal;
                      existingSpec.count = specCount + 1;
                    }
                    if (item.status && !existingSpec.status.includes(item.status)) {
                      existingSpec.status = [existingSpec.status, item.status].filter(Boolean).join(', ');
                    }
                    if (item.notes && !existingSpec.notes.includes(item.notes)) {
                      existingSpec.notes = [existingSpec.notes, item.notes].filter(Boolean).join(' | ');
                    }
                  } else {
                    speciesMap.set(item.species, {
                      ...item,
                      cover: !isNaN(coverVal) ? coverVal : null,
                      count: 1
                    });
                  }
                };

                (duplicateObs.weedDetails || []).forEach(addSpecies);
                (obs.weedDetails || []).forEach(addSpecies);
                duplicateObs.weedDetails = Array.from(speciesMap.values()).map(({ count, ...rest }) => rest);

                if (obs.notes) {
                  duplicateObs.notes = [duplicateObs.notes, obs.notes].filter(Boolean).join(' | ');
                }

                duplicateObs.sampleCount = count + 1;
                obs._toDelete = true;
              }
            }
          }
        });

        const beforeLen = efficacyData.length;
        const filtered = efficacyData.filter(o => !o._toDelete);
        if (filtered.length !== beforeLen) {
          efficacyData.length = 0;
          efficacyData.push(...filtered);
        }
      }

      // 2. Fallback to sequence rank (index of sorted list)
      if (!matched && rank >= 0) {
        const sortedEff = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
        const obsToUpdate = sortedEff[rank];
        if (obsToUpdate) {
          const mainObs = efficacyData.find(o => o.daa === obsToUpdate.daa && o.date === obsToUpdate.date);
          if (mainObs) {
            mainObs.date = newDate;
            if (newDaa !== null) mainObs.daa = newDaa;
            efficacyChanged = true;

            // Check if there is an existing observation with the same DAA
            const duplicateObs = efficacyData.find(o => o !== mainObs && Number(o.daa) === Number(newDaa));
            if (duplicateObs) {
              const confirmMerge = window.confirm(
                `An observation at DAA ${newDaa} already exists. Do you want to merge this photo's observation metrics into the existing DAA ${newDaa} observation and delete the duplicate entry?`
              );
              if (confirmMerge) {
                const count = duplicateObs.sampleCount || 1;
                const config = getCategoryConfig(activeTrial.Category || activeCategory);
                const fieldsToMerge = [
                  ...(config.observationFields || []).map(f => f.key),
                  'weedCover'
                ];
                
                fieldsToMerge.forEach(key => {
                  if (mainObs[key] !== undefined && mainObs[key] !== null && mainObs[key] !== '') {
                    const val1 = parseFloat(duplicateObs[key]);
                    const val2 = parseFloat(mainObs[key]);
                    if (!isNaN(val1) && !isNaN(val2)) {
                      duplicateObs[key] = Number((((val1 * count) + val2) / (count + 1)).toFixed(2));
                    } else if (!isNaN(val2)) {
                      duplicateObs[key] = val2;
                    }
                  }
                });
                
                const speciesMap = new Map();
                const addSpecies = (item) => {
                  if (!item || !item.species) return;
                  const existingSpec = speciesMap.get(item.species);
                  const coverVal = parseFloat(item.cover);
                  if (existingSpec) {
                    if (!isNaN(coverVal)) {
                      const specCount = existingSpec.count || 1;
                      const oldCov = parseFloat(existingSpec.cover);
                      existingSpec.cover = !isNaN(oldCov) ? Number((((oldCov * specCount) + coverVal) / (specCount + 1)).toFixed(2)) : coverVal;
                      existingSpec.count = specCount + 1;
                    }
                    if (item.status && !existingSpec.status.includes(item.status)) {
                      existingSpec.status = [existingSpec.status, item.status].filter(Boolean).join(', ');
                    }
                    if (item.notes && !existingSpec.notes.includes(item.notes)) {
                      existingSpec.notes = [existingSpec.notes, item.notes].filter(Boolean).join(' | ');
                    }
                  } else {
                    speciesMap.set(item.species, {
                      ...item,
                      cover: !isNaN(coverVal) ? coverVal : null,
                      count: 1
                    });
                  }
                };

                (duplicateObs.weedDetails || []).forEach(addSpecies);
                (mainObs.weedDetails || []).forEach(addSpecies);
                duplicateObs.weedDetails = Array.from(speciesMap.values()).map(({ count, ...rest }) => rest);

                if (mainObs.notes) {
                  duplicateObs.notes = [duplicateObs.notes, mainObs.notes].filter(Boolean).join(' | ');
                }

                duplicateObs.sampleCount = count + 1;
                
                const obsIdx = efficacyData.indexOf(mainObs);
                if (obsIdx !== -1) {
                  efficacyData.splice(obsIdx, 1);
                }
              }
            }
          }
        }
      }
    }

    if (efficacyChanged) {
      efficacyData.sort((a, b) => a.daa - b.daa);
    }

    const updated = {
      ...activeTrial,
      PhotoURLs: JSON.stringify(photos),
      ...(efficacyChanged ? { EfficacyDataJSON: JSON.stringify(efficacyData) } : {})
    };

    updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
    setActiveTrial(updated);
    setPhotoEditModal(null);
    try {
      await updateTrial({
        ID: updated.ID,
        PhotoURLs: updated.PhotoURLs,
        ...(efficacyChanged ? { EfficacyDataJSON: updated.EfficacyDataJSON } : {})
      }, getAppState);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo updated', type: 'success' } }));
  }, [activeTrial, photoEditModal, trials, updateState, getAppState]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Trials" onMenuClick={onMenuClick} />

      {recoveryDraft && (
        <div className="bg-amber-50 border-b border-amber-200/60 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-800">
              <Activity className="w-4 h-4 text-amber-600 animate-pulse" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-800">Recovered Trial Draft Detected</p>
              <p className="text-[10px] text-slate-500">We found progress on your unsaved draft of: <span className="font-semibold text-slate-700">{recoveryDraft.formData?.FormulationName || 'Unnamed Formulation'}</span></p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleRestoreRecoveryDraft}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-semibold transition"
            >
              Restore Progress
            </button>
            <button
              onClick={handleDismissRecoveryDraft}
              className="px-2.5 py-1.5 hover:bg-slate-200/50 text-slate-500 rounded-lg text-[10px] font-medium transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── TOOLBAR ── */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-3 space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search trials..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
            <button onClick={() => setShowFilters(v => !v)} className={`p-2 rounded-lg border transition ${showFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            {!isViewer && (
              <>
                <button onClick={exportAllCsv} title="Export all trials to CSV" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition">
                  <FileDown className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleSyncAllPhotosFromDrive()} 
                  disabled={syncingAllPhotos}
                  title="Sync all broken/unavailable photos from Google Drive for all trials" 
                  className={`p-2 rounded-lg border transition ${syncingAllPhotos ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed' : 'border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'}`}
                >
                  <RefreshCw className={`w-4 h-4 ${syncingAllPhotos ? 'animate-spin' : ''}`} />
                </button>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 bg-white" title="Heal existing only: Only restore broken/unavailable photos already in the list; do not import new/deleted photos.">
                  <input 
                    type="checkbox" 
                    id="syncHealOnly"
                    checked={syncHealOnly} 
                    onChange={e => setSyncHealOnly(e.target.checked)} 
                    className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="syncHealOnly" className="text-xs select-none cursor-pointer">Heal only</label>
                </div>
                <input 
                  type="file" 
                  ref={armFileInputRef} 
                  onChange={handleARMImportChange} 
                  accept=".csv" 
                  className="hidden" 
                />
                <button onClick={handleARMImportClick} title="Import trials from ARM CSV" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition">
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button onClick={() => handleOpenModal()} className="btn-primary text-white px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
                  <Plus className="w-4 h-4" /> New Trial
                </button>
              </>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-1">
              <select value={filterFormulation} onChange={e => setFilterFormulation(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">All Formulations</option>
                {formulations.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
              </select>
              <select value={filterResult} onChange={e => setFilterResult(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">All Results</option>
                {['Excellent', 'Good', 'Fair', 'Poor', 'Control'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="name">By Formulation</option>
                <option value="obs">Most Observations</option>
                <option value="shared">Shared Status</option>
              </select>
              <div className="col-span-2 flex gap-2 items-center">
                <span className="text-xs font-semibold text-slate-500 shrink-0">From</span>
                <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <span className="text-xs font-semibold text-slate-500 shrink-0">To</span>
                <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <button onClick={() => { setSearch(''); setFilterFormulation(''); setFilterResult(''); setFilterProject(''); setFilterDateStart(''); setFilterDateEnd(''); setSortBy('date-desc'); }}
                className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100">Reset Filters</button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {[['all','All'],['standard','Standard'],['rcbd','Project-Grouped'],['control','Control'],['finalized','Finalized']].map(([k,label]) => (
              <button key={k} onClick={() => setActiveTab(k)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition
                  ${activeTab === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label} <span className="ml-1 opacity-70">({tabCounts[k]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── GRID ── */}
        <div className="p-4">
          {activeTab === 'rcbd' && (
            <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Trial Layouts & Designs</h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Understand Randomized Complete Block Design (RCBD), Completely Randomized Design (CRD), Split-Plot, and other layouts.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsDesignGuideOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto"
              >
                View Design Guide
              </button>
            </div>
          )}
          {filteredTrials.length > 0 ? (
            activeTab === 'rcbd' ? (
              <div className="space-y-6">
                {/* Global Expand/Collapse controls */}
                <div className="flex justify-end gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setCollapsedSections({})}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = {};
                      Object.keys(groupedRcbdTrials.groups).forEach(id => { allIds[id] = true; });
                      if (groupedRcbdTrials.orphaned.length > 0) allIds['orphaned-rcbd'] = true;
                      setCollapsedSections(allIds);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-700 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                  >
                    Collapse All
                  </button>
                </div>

                {/* Grouped Projects */}
                {Object.entries(groupedRcbdTrials.groups).map(([pid, trialsList]) => {
                  const proj = projectMap[pid];
                  const isCollapsed = !!collapsedSections[pid];
                  return (
                    <div key={pid} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
                      <div
                        onClick={() => toggleSection(pid)}
                        className="p-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isCollapsed ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                            <FolderOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                              {proj?.Name || 'Unknown Project'}
                              <span className="text-xs font-normal text-slate-400">({proj?.Design || 'RCBD'})</span>
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-slate-500">
                              {proj?.Investigator && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5" /> {proj.Investigator}
                                </span>
                              )}
                              {proj?.Location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" /> {proj.Location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => triggerExportWithCustomisation(async () => {
                              window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating Project-wide Advanced Excel Report...', type: 'info' } }));
                              try {
                                const generator = new AdvancedReportGenerator(trialsList, activeCategory);
                                await generator.generateCompleteReport();
                                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Project report generated successfully!', type: 'success' } }));
                              } catch (err) {
                                console.error(err);
                                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to generate project report: ${err.message}`, type: 'error' } }));
                              }
                            })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-sm"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Advanced Excel (11-Sheet)
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/projects?focus=${pid}`)}
                            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                          >
                            View Project <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <span className="bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                            {trialsList.length} {trialsList.length === 1 ? 'plot' : 'plots'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSection(pid)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            {isCollapsed ? (
                              <Plus className="w-4 h-4 text-slate-500" />
                            ) : (
                              <X className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/20">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {trialsList.map(t => (
                              <TrialCard
                                key={t.ID}
                                trial={t}
                                project={proj}
                                isSelected={selectedForBulk.has(t.ID)}
                                isMenuOpen={openCardMenu === t.ID}
                                onToggleBulk={toggleBulk}
                                onToggleMenu={handleToggleMenu}
                                onViewDetails={handleViewDetails}
                                onEdit={handleOpenModal}
                                onDuplicate={handleDuplicate}
                                onMoveToProject={handleMoveToProject}
                                onExportPdf={handleExportPdf}
                                onExportSciPdf={handleExportSciPdf}
                                onExportPpt={handleExportPpt}
                                onExportHtml={exportHtmlSlide}
                                onExportTxt={exportTxtReport}
                                onExportCsv={exportCsv}
                                onExportJson={exportJson}
                                onShare={shareTrial}
                                onAppSharing={handleOpenShareModal}
                                onAiGenerate={handleAiSingleGenerate}
                                onDelete={handleDelete}
                                onActivateToggle={handleActivateToggle}
                                onQuickRate={handleQuickRate}
                                onQuickPhoto={handleQuickPhoto}
                                onQuickGalleryUpload={handleQuickGalleryUpload}
                                onMarkComplete={handleMarkComplete}
                                onEditControlDays={handleEditControlDays}
                                onRecordWeather={handleRecordWeather}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Orphaned RCBD Trials */}
                {groupedRcbdTrials.orphaned.length > 0 && (() => {
                  const isCollapsed = !!collapsedSections['orphaned-rcbd'];
                  return (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-all duration-200">
                      <div
                        onClick={() => toggleSection('orphaned-rcbd')}
                        className="p-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isCollapsed ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                            <FolderOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800 dark:text-white">Independent / Orphaned Plots</h3>
                            <p className="text-xs text-slate-500">Plots with invalid or missing project IDs</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                          <span className="bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">
                            {groupedRcbdTrials.orphaned.length} {groupedRcbdTrials.orphaned.length === 1 ? 'plot' : 'plots'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSection('orphaned-rcbd')}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            {isCollapsed ? <Plus className="w-4 h-4 text-slate-500" /> : <X className="w-4 h-4 text-slate-500" />}
                          </button>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/20">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {groupedRcbdTrials.orphaned.map(t => (
                              <TrialCard
                                key={t.ID}
                                trial={t}
                                project={null}
                                isSelected={selectedForBulk.has(t.ID)}
                                isMenuOpen={openCardMenu === t.ID}
                                onToggleBulk={toggleBulk}
                                onToggleMenu={handleToggleMenu}
                                onViewDetails={handleViewDetails}
                                onEdit={handleOpenModal}
                                onDuplicate={handleDuplicate}
                                onMoveToProject={handleMoveToProject}
                                onExportPdf={handleExportPdf}
                                onExportSciPdf={handleExportSciPdf}
                                onExportPpt={handleExportPpt}
                                onExportHtml={exportHtmlSlide}
                                onExportTxt={exportTxtReport}
                                onExportCsv={exportCsv}
                                onExportJson={exportJson}
                                onShare={shareTrial}
                                onAppSharing={handleOpenShareModal}
                                onAiGenerate={handleAiSingleGenerate}
                                onDelete={handleDelete}
                                onActivateToggle={handleActivateToggle}
                                onQuickRate={handleQuickRate}
                                onQuickPhoto={handleQuickPhoto}
                                onQuickGalleryUpload={handleQuickGalleryUpload}
                                onMarkComplete={handleMarkComplete}
                                onEditControlDays={handleEditControlDays}
                                onRecordWeather={handleRecordWeather}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTrials.map(t => (
                  <TrialCard
                    key={t.ID}
                    trial={t}
                    project={projectMap[t.ProjectID]}
                    isSelected={selectedForBulk.has(t.ID)}
                    isMenuOpen={openCardMenu === t.ID}
                    onToggleBulk={toggleBulk}
                    onToggleMenu={handleToggleMenu}
                    onViewDetails={handleViewDetails}
                    onEdit={handleOpenModal}
                    onDuplicate={handleDuplicate}
                    onMoveToProject={handleMoveToProject}
                    onExportPdf={handleExportPdf}
                    onExportSciPdf={handleExportSciPdf}
                    onExportPpt={handleExportPpt}
                    onExportHtml={exportHtmlSlide}
                    onExportTxt={exportTxtReport}
                    onExportCsv={exportCsv}
                    onExportJson={exportJson}
                    onShare={shareTrial}
                    onAppSharing={handleOpenShareModal}
                    onAiGenerate={handleAiSingleGenerate}
                    onDelete={handleDelete}
                    onActivateToggle={handleActivateToggle}
                    onQuickRate={handleQuickRate}
                    onQuickPhoto={handleQuickPhoto}
                    onQuickGalleryUpload={handleQuickGalleryUpload}
                    onMarkComplete={handleMarkComplete}
                    onEditControlDays={handleEditControlDays}
                    onRecordWeather={handleRecordWeather}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Activity className="w-12 h-12 mb-4 opacity-30" />
              <p className="font-semibold">No trials found</p>
              <p className="text-sm mt-1">{search || filterFormulation || filterResult ? 'Try adjusting your filters' : 'Create your first trial to get started'}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── SELECTION BAR ── */}
      {selectedForBulk.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50">
          {(() => {
            const crossCategoryCount = Array.from(selectedForBulk).filter(id => {
              const trial = trials.find(t => t.ID === id);
              return trial && (trial.Category || 'herbicide') !== activeCategory;
            }).length;
            const validCount = selectedForBulk.size - crossCategoryCount;
            
            return (
              <>
                <span className="font-bold text-sm">
                  <span className="bg-emerald-500 px-2 py-0.5 rounded-full mr-2">{selectedForBulk.size}</span>
                  Selected
                  {crossCategoryCount > 0 && (
                    <span className="bg-amber-500 px-2 py-0.5 rounded-full ml-2 text-xs">
                      {crossCategoryCount} cross-category
                    </span>
                  )}
                </span>
                <div className="h-4 w-px bg-slate-600" />
                <button 
                  onClick={navigateToCompare} 
                  disabled={validCount < 2}
                  className={`flex items-center gap-1.5 text-sm transition ${
                    validCount < 2 
                      ? 'text-slate-500 cursor-not-allowed' 
                      : 'hover:text-emerald-400'
                  }`}
                  title={validCount < 2 ? `Need at least 2 ${activeCategory} trials to compare` : ''}
                >
                  <BarChart3 className="w-4 h-4" />
                  Compare {validCount > 0 && `(${validCount})`}
                </button>
              </>
            );
          })()}
          {!isViewer && <button onClick={handleBulkFinalize} className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition"><CheckCircle className="w-4 h-4" />Finalize</button>}
          {!isViewer && <button onClick={() => setIsBulkEditOpen(true)} className="flex items-center gap-1.5 text-sm hover:text-amber-400 transition"><Edit className="w-4 h-4" />Bulk Edit</button>}
          {!isViewer && <button onClick={() => setIsBulkQrModalOpen(true)} className="flex items-center gap-1.5 text-sm hover:text-blue-400 transition"><Printer className="w-4 h-4" />Print Cards</button>}
          {canDownload && <button onClick={() => { const sel = trials.filter(t => selectedForBulk.has(t.ID)); exportMultipleTrialsToCSV(sel, activeCategory); }} className="flex items-center gap-1.5 text-sm hover:text-emerald-400 transition"><FileSpreadsheet className="w-4 h-4" />Export CSV</button>}
          {!isViewer && <button onClick={handleBulkDelete} className="flex items-center gap-1.5 text-sm hover:text-red-400 transition"><Trash2 className="w-4 h-4" />Delete</button>}
          <button onClick={clearBulk} className="ml-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── BULK EDIT MODAL ── */}
      {isBulkEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Edit className="w-5 h-5 text-amber-500" />Bulk Edit <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-sm">{selectedForBulk.size} trials</span></h3>
              <button onClick={() => setIsBulkEditOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 border">Leave any field blank to keep existing values unchanged.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Investigator Name</label>
                <input type="text" value={bulkEditForm.InvestigatorName} onChange={e => setBulkEditForm(p => ({...p, InvestigatorName: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Location</label>
                <input type="text" value={bulkEditForm.Location} onChange={e => setBulkEditForm(p => ({...p, Location: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date</label>
                <input type="datetime-local" value={toDatetimeLocal(bulkEditForm.Date)} onChange={e => setBulkEditForm(p => ({...p, Date: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Dosage</label>
                <input type="text" value={bulkEditForm.Dosage} onChange={e => setBulkEditForm(p => ({...p, Dosage: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Result</label>
                <select value={bulkEditForm.Result} onChange={e => setBulkEditForm(p => ({...p, Result: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">-- No Change --</option>
                  {['Excellent','Good','Fair','Poor','Control'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Replication / Block</label>
                <input type="text" value={bulkEditForm.Replication} onChange={e => setBulkEditForm(p => ({...p, Replication: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Trial Design</label>
                <select value={bulkEditForm.TrialDesign} onChange={e => setBulkEditForm(p => ({...p, TrialDesign: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">-- No Change --</option>
                  {['RCBD', 'Split-Plot', 'Factorial', 'Lattice', 'PotTrial', 'Strip-Plot'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Main Factor / Factor A</label>
                <input type="text" value={bulkEditForm.MainFactor} onChange={e => setBulkEditForm(p => ({...p, MainFactor: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Sub Factor / Factor B</label>
                <input type="text" value={bulkEditForm.SubFactor} onChange={e => setBulkEditForm(p => ({...p, SubFactor: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Leave blank to keep existing" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Append to Notes</label>
                <textarea rows={2} value={bulkEditForm.Notes} onChange={e => setBulkEditForm(p => ({...p, Notes: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Text will be appended to existing notes" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setIsBulkEditOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={async () => {
                if (isViewer) {
                  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot modify or bulk edit trials.', type: 'error' } }));
                  return;
                }
                const updates = {};
                if (bulkEditForm.InvestigatorName.trim()) updates.InvestigatorName = bulkEditForm.InvestigatorName.trim();
                if (bulkEditForm.Location.trim()) updates.Location = bulkEditForm.Location.trim();
                if (bulkEditForm.Result) updates.Result = bulkEditForm.Result;
                if (bulkEditForm.Date) updates.Date = bulkEditForm.Date;
                if (bulkEditForm.Dosage.trim()) updates.Dosage = bulkEditForm.Dosage.trim();
                if (bulkEditForm.Replication.trim()) updates.Replication = bulkEditForm.Replication.trim();
                if (bulkEditForm.TrialDesign) updates.TrialDesign = bulkEditForm.TrialDesign;
                if (bulkEditForm.MainFactor.trim()) updates.MainFactor = bulkEditForm.MainFactor.trim();
                if (bulkEditForm.SubFactor.trim()) updates.SubFactor = bulkEditForm.SubFactor.trim();
                const ids = Array.from(selectedForBulk);
                const updated = trials.map(t => {
                  if (!ids.includes(t.ID)) return t;
                  const n = { ...t, ...updates };
                  if (bulkEditForm.Notes.trim()) n.Notes = n.Notes ? `${n.Notes}\n${bulkEditForm.Notes.trim()}` : bulkEditForm.Notes.trim();
                  return n;
                });
                updateState({ trials: updated });
                for (const t of updated.filter(t => ids.includes(t.ID))) {
                  try { await updateTrial(t, getAppState); } catch(e) {}
                }
                setBulkEditForm({ InvestigatorName: '', Location: '', Result: '', Notes: '', Date: '', Dosage: '', Replication: '', TrialDesign: '', MainFactor: '', SubFactor: '' });
                setIsBulkEditOpen(false);
                clearBulk();
                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `${ids.length} trials updated`, type: 'success' } }));
              }} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Apply to {selectedForBulk.size} Trials</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DUPLICATE MODAL ── */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Copy className="w-5 h-5 text-emerald-500" /> Duplicate Trial
              </h3>
              <button onClick={() => setDuplicateModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500">Copying from: <span className="font-semibold text-slate-700">{duplicateModal.FormulationName}</span></p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Select Formulation for New Trial *</label>
              <select
                value={duplicateFormulation}
                onChange={e => setDuplicateFormulation(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">— Select formulation —</option>
                {formulations.map(f => <option key={f.ID} value={f.Name}>{f.Name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Or type a custom name:</p>
              <input
                type="text"
                value={duplicateFormulation}
                onChange={e => setDuplicateFormulation(e.target.value)}
                placeholder="Custom formulation name..."
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Date</label>
              <input
                type="datetime-local"
                value={duplicateDate}
                onChange={e => setDuplicateDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Dosage</label>
              <input
                type="text"
                value={duplicateDosage}
                onChange={e => setDuplicateDosage(e.target.value)}
                placeholder={`Leave blank to copy (${duplicateModal.Dosage || 'N/A'})`}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2 border">Location, weed species and other settings will be copied. Photos, observations and results will be cleared.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDuplicateModal(null)} className="px-4 py-2 text-sm rounded-lg border text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleDuplicateConfirm}
                disabled={!duplicateFormulation.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Duplicate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      <TrialDesignGuideModal isOpen={isDesignGuideOpen} onClose={() => setIsDesignGuideOpen(false)} />
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTrial ? 'Edit Trial' : 'New Trial'}>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Formulation Name *</label>
              <input type="text" list="form-list" required value={formData.FormulationName} onChange={e => setFormData({...formData, FormulationName: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Select or type..." />
              <datalist id="form-list">{formulations.map(f => <option key={f.ID} value={f.Name} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Project (Layout Group)</label>
              <select value={formData.ProjectID} onChange={e => setFormData({...formData, ProjectID: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Standard Trial —</option>
                {projects.map(p => <option key={p.ID} value={p.ID}>{p.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Crop</label>
              <input type="text" value={formData.Crop || ''} onChange={e => setFormData({...formData, Crop: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Rice, Wheat, Maize" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Variety / Hybrid</label>
              <input type="text" value={formData.Variety || ''} onChange={e => setFormData({...formData, Variety: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. IR-64, DK-9133" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Trial Design Type</label>
                <button
                  type="button"
                  onClick={() => setIsDesignGuideOpen(true)}
                  className="text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1 text-[10px] font-bold"
                  title="View Design Guide"
                >
                  <Info className="w-3.5 h-3.5" /> Guide
                </button>
              </div>
              <select value={formData.TrialDesign || 'RCBD'} onChange={e => setFormData({...formData, TrialDesign: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="RCBD">RCBD (Randomized Complete Block)</option>
                <option value="CRD">CRD (Completely Randomized Design)</option>
                <option value="Split-Plot">Split-Plot Design</option>
                <option value="Lattice">Alpha-Lattice Design</option>
                <option value="Factorial">Factorial Design</option>
                <option value="PotTrial">Pot Trial (Row-Based)</option>
              </select>
            </div>
            {(formData.TrialDesign === 'Split-Plot' || formData.TrialDesign === 'Factorial') && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Main Factor / Factor A</label>
                  <input type="text" value={formData.MainFactor || ''} onChange={e => setFormData({...formData, MainFactor: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Irrigation" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sub Factor / Factor B</label>
                  <input type="text" value={formData.SubFactor || ''} onChange={e => setFormData({...formData, SubFactor: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Nitrogen Rate" />
                </div>
              </>
            )}
            {formData.TrialDesign === 'Lattice' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sub-Block ID</label>
                <input type="text" value={formData.SubBlockID || ''} onChange={e => setFormData({...formData, SubBlockID: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Block A1" />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Investigator *</label>
              <input type="text" required value={formData.InvestigatorName} onChange={e => setFormData({...formData, InvestigatorName: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Date *</label>
              <input type="datetime-local" required value={formData.Date} onChange={e => setFormData({...formData, Date: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            {activeCategory === 'herbicide' ? (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Dosage / Treatment</label>
                    <button type="button" onClick={() => setIsSprayCalcOpen(true)} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                      <Calculator size={10} /> Spray Mix Calc
                    </button>
                  </div>
                  <input type="text" value={formData.Dosage} onChange={e => setFormData({...formData, Dosage: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 1500 ml/ha" />
                </div>
                {renderTargetFieldAutocomplete('WeedSpecies', 'Target Weed Species', 'focus:ring-emerald-400', 'weed')}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Yield (t/ha)</label>
                  <input type="number" step="0.01" min="0" value={formData.YieldValue} onChange={e => setFormData({...formData, YieldValue: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 3.5" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Result</label>
                  <select value={formData.Result} onChange={e => setFormData({...formData, Result: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">— Select Result —</option>
                    {['Excellent','Good','Fair','Poor','Control'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Timing</label>
                  <select value={formData.ApplicationTiming} onChange={e => setFormData({...formData, ApplicationTiming: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">— Select Timing —</option>
                    {['PRE', 'E-POST', 'POST', 'L-POST'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Weed Growth Stage (BBCH)</label>
                  <select value={formData.WeedGrowthStage} onChange={e => setFormData({...formData, WeedGrowthStage: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">— Select Growth Stage —</option>
                    {BBCH_STAGES.map(s => <option key={s.value} value={s.label}>{s.label}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Dosage / Treatment</label>
                    <button type="button" onClick={() => setIsSprayCalcOpen(true)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                      <Calculator size={10} /> Spray Mix Calc
                    </button>
                  </div>
                  <input type="text" value={formData.Dosage} onChange={e => setFormData({...formData, Dosage: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="e.g. 1500 ml/ha" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Result</label>
                  <select value={formData.Result} onChange={e => setFormData({...formData, Result: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">— Select Result —</option>
                    {catConfig.resultRatings.map(r => <option key={r} value={r}>{r}</option>)}
                    <option value="Control">Control</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Timing</label>
                  <select value={formData.ApplicationTiming} onChange={e => setFormData({...formData, ApplicationTiming: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">— Select Timing —</option>
                    {catConfig.applicationTimings.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {catConfig.specificFields.map(field => {
                  if (field.key === 'WeedSpecies' || field.key === 'DiseaseTarget' || field.key === 'PestTarget') {
                    const eppoType = field.key === 'WeedSpecies' ? 'weed' : field.key === 'DiseaseTarget' ? 'disease' : 'pest';
                    return (
                      <div key={field.key}>
                        {renderTargetFieldAutocomplete(field.key, field.label, 'focus:ring-indigo-400', eppoType)}
                      </div>
                    );
                  }
                  if (field.key === 'CropStageAtApplication' || field.key === 'WeedGrowthStage') {
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{field.label} (BBCH)</label>
                        <select value={formData[field.key] || ''} onChange={e => setFormData({...formData, [field.key]: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                          <option value="">— Select Growth Stage —</option>
                          {BBCH_STAGES.map(s => <option key={s.value} value={s.label}>{s.label}</option>)}
                        </select>
                      </div>
                    );
                  }
                  return (
                    <div key={field.key} className="relative">
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{field.label}</label>
                      {field.type === 'select' ? (
                        <select value={formData[field.key] || ''} onChange={e => setFormData({...formData, [field.key]: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                          <option value="">— Select {field.label} —</option>
                          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={field.type} step={field.type === 'number' ? 'any' : undefined} value={formData[field.key] || ''} onChange={e => setFormData({...formData, [field.key]: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder={field.placeholder || ''} />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Weather */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1"><CloudRain className="w-3.5 h-3.5" />Weather at Application</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Temp (°C)</label>
                <input type="number" value={formData.Temperature} onChange={e => setFormData({...formData, Temperature: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Humidity (%)</label>
                <input type="number" min="0" max="100" value={formData.Humidity} onChange={e => setFormData({...formData, Humidity: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Wind (km/h)</label>
                <input type="number" value={formData.Windspeed} onChange={e => setFormData({...formData, Windspeed: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rain (mm)</label>
                <input type="number" value={formData.Rain} onChange={e => setFormData({...formData, Rain: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
          </div>

          {/* Location + GPS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Location</label>
              <input type="text" value={formData.Location} onChange={e => setFormData({...formData, Location: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Field name or coordinates" />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={fetchGpsWeather} disabled={gpsFetching}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 border border-blue-200">
                {gpsFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                {gpsFetching ? 'Fetching...' : 'Sync GPS + Weather'}
              </button>
            </div>
          </div>
          {(formData.Lat || formData.Lon) && (
            <p className="text-xs text-slate-400">GPS: {formData.Lat}, {formData.Lon}</p>
          )}

          {/* RCBD fields */}
          {formData.ProjectID && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Block</label>
                <select value={formData.BlockID} onChange={e => setFormData({...formData, BlockID: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">No Block</option>
                  {(state.blocks || []).filter(b => b.ProjectID === formData.ProjectID).map(b => <option key={b.ID} value={b.ID}>{b.Name}</option>)}
                </select>
              </div>
              {formData.TrialDesign === 'PotTrial' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Row #</label>
                    <input type="number" value={formData.PotRow || ''} onChange={e => setFormData({...formData, PotRow: parseInt(e.target.value) || null})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Col #</label>
                    <input type="number" value={formData.PotCol || ''} onChange={e => setFormData({...formData, PotCol: parseInt(e.target.value) || null})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Pot Label</label>
                    <input type="text" value={formData.PotLabel || ''} onChange={e => setFormData({...formData, PotLabel: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Row 1, Col 2" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Replication #</label>
                    <input type="number" value={formData.Replication} onChange={e => setFormData({...formData, Replication: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Plot #</label>
                    {(() => {
                      const pn = parseInt(formData.PlotNumber);
                      const projectTrialsForDup = formData.ProjectID
                        ? (state.trials || []).filter(t => t.ProjectID === formData.ProjectID && (!editingTrial || t.ID !== editingTrial.ID))
                        : [];
                      const isDuplicate = formData.PlotNumber !== '' && !isNaN(pn) && projectTrialsForDup.some(t => parseInt(t.PlotNumber) === pn);
                      return (
                        <>
                          <input type="number" min="1" value={formData.PlotNumber} onChange={e => setFormData({...formData, PlotNumber: e.target.value})} className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${isDuplicate ? 'border-amber-400 focus:ring-amber-400' : 'focus:ring-emerald-400'}`} />
                          {isDuplicate && <p className="text-xs text-amber-600 mt-0.5">Plot # already used in this project</p>}
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Plot & Site Data collapsible — Task 55 */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setPlotDataOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition text-xs font-semibold text-slate-600 uppercase"
            >
              <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400" /> Plot &amp; Site Data (optional)</span>
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${plotDataOpen ? 'rotate-90' : ''}`} />
            </button>
            {plotDataOpen && (
              <div className="p-4 space-y-3">
                {/* BBCH Code with lookup */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">BBCH Code (crop growth stage)</label>
                  <input
                    type="text"
                    value={formData.BBCHCode || ''}
                    onChange={e => setFormData({...formData, BBCHCode: e.target.value})}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="e.g. 12"
                    maxLength={3}
                  />
                  {(() => {
                    const code = (formData.BBCHCode || '').trim();
                    if (!code) return null;
                    const match = BBCH_STAGES.find(s => s.value === code || String(s.value) === code);
                    if (match) return <p className="text-xs text-emerald-700 mt-0.5 bg-emerald-50 rounded px-2 py-1">📋 {match.label}</p>;
                    const num = parseInt(code);
                    if (!isNaN(num)) {
                      const rangeMatch = BBCH_STAGES.find(s => {
                        const sv = parseInt(s.value);
                        return !isNaN(sv) && num >= sv && num < sv + 10;
                      });
                      if (rangeMatch) return <p className="text-xs text-blue-700 mt-0.5 bg-blue-50 rounded px-2 py-1">~{rangeMatch.label}</p>;
                    }
                    return <p className="text-xs text-amber-600 mt-0.5">Unknown BBCH code</p>;
                  })()}
                </div>
                {/* GPS fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">GPS Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="-90"
                      max="90"
                      value={formData.GPSLatitude || ''}
                      onChange={e => setFormData({...formData, GPSLatitude: e.target.value})}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      placeholder="-90 to 90"
                    />
                    {formData.GPSLatitude !== '' && (parseFloat(formData.GPSLatitude) < -90 || parseFloat(formData.GPSLatitude) > 90) && (
                      <p className="text-xs text-red-600 mt-0.5">Must be between -90 and 90</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">GPS Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="-180"
                      max="180"
                      value={formData.GPSLongitude || ''}
                      onChange={e => setFormData({...formData, GPSLongitude: e.target.value})}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      placeholder="-180 to 180"
                    />
                    {formData.GPSLongitude !== '' && (parseFloat(formData.GPSLongitude) < -180 || parseFloat(formData.GPSLongitude) > 180) && (
                      <p className="text-xs text-red-600 mt-0.5">Must be between -180 and 180</p>
                    )}
                  </div>
                </div>
                {/* Soil fields */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Soil pH</label>
                    <input type="number" step="0.1" min="0" max="14" value={formData.SoilPH || ''} onChange={e => setFormData({...formData, SoilPH: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    {formData.SoilPH !== '' && (parseFloat(formData.SoilPH) < 0 || parseFloat(formData.SoilPH) > 14) && (
                      <p className="text-xs text-red-600 mt-0.5">Must be 0–14</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Clay %</label>
                    <input type="number" step="1" min="0" max="100" value={formData.SoilClay || ''} onChange={e => setFormData({...formData, SoilClay: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    {formData.SoilClay !== '' && (parseFloat(formData.SoilClay) < 0 || parseFloat(formData.SoilClay) > 100) && (
                      <p className="text-xs text-red-600 mt-0.5">Must be 0–100%</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Sand %</label>
                    <input type="number" step="1" min="0" max="100" value={formData.SoilSand || ''} onChange={e => setFormData({...formData, SoilSand: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Org. Carbon %</label>
                    <input type="number" step="0.01" min="0" value={formData.SoilOC || ''} onChange={e => setFormData({...formData, SoilOC: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Texture</label>
                    <select value={formData.SoilTexture || ''} onChange={e => setFormData({...formData, SoilTexture: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                      <option value="">Any</option>
                      {['Loam','Clay','Sandy Loam','Sand','Silt','Clay Loam'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                {/* Agronomic Context */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Previous Crop</label>
                    <input type="text" value={formData.PreviousCrop || ''} onChange={e => setFormData({...formData, PreviousCrop: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Wheat, Fallow" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Irrigation Method</label>
                    <select value={formData.IrrigationMethod || ''} onChange={e => setFormData({...formData, IrrigationMethod: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                      <option value="">— None / Rainfed —</option>
                      {['Flood / Furrow','Sprinkler','Drip / Micro','Sub-surface Drip','Basin','Centre Pivot','Rainfed'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Plant Population (plants/ha)</label>
                    <input type="number" min="0" step="1000" value={formData.PlantPopulation || ''} onChange={e => setFormData({...formData, PlantPopulation: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 250000" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Yield Data Panel — Task 58 */}
          {(() => {
            const yieldVal = parseFloat(formData.YieldValue);
            const projectYieldsForOutlier = formData.ProjectID
              ? (state.trials || [])
                  .filter(t => t.ProjectID === formData.ProjectID && (!editingTrial || t.ID !== editingTrial.ID) && t.YieldValue && !isNaN(parseFloat(t.YieldValue)))
                  .map(t => parseFloat(t.YieldValue))
              : [];
            const yieldMean = projectYieldsForOutlier.length > 0 ? projectYieldsForOutlier.reduce((a, b) => a + b, 0) / projectYieldsForOutlier.length : null;
            const isOutlier = !isNaN(yieldVal) && yieldVal > 0 && yieldMean !== null && yieldVal > 20 * yieldMean;
            return (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-600 uppercase flex items-center gap-2">
                  <Leaf className="w-3.5 h-3.5 text-emerald-500" /> Yield Data (optional)
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {formData.PlotNumber !== '' && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Plot # (read-only)</label>
                      <input type="text" readOnly value={formData.PlotNumber} className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-500 cursor-default" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Yield Value</label>
                    <input type="number" step="0.001" min="0" value={formData.YieldValue || ''} onChange={e => setFormData({...formData, YieldValue: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 3.5" />
                    {isOutlier && (
                      <p className="text-xs text-amber-600 mt-0.5">⚠ Outlier: &gt;20× project mean ({yieldMean?.toFixed(2)})</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Unit</label>
                    <select value={formData.YieldUnit || 't/ha'} onChange={e => setFormData({...formData, YieldUnit: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                      {['t/ha','kg/ha','bu/ac','kg/plot'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Grain Moisture (%)</label>
                    <input type="number" step="0.1" min="0" max="100" value={formData.GrainMoisture || ''} onChange={e => setFormData({...formData, GrainMoisture: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">1000-Grain Weight (g)</label>
                    <input type="number" step="0.1" min="0" value={formData.ThousandGrainWeight || ''} onChange={e => setFormData({...formData, ThousandGrainWeight: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Harvest DAA</label>
                    <input type="number" min="0" value={formData.HarvestDAA || ''} onChange={e => setFormData({...formData, HarvestDAA: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. 999" />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Yield Notes</label>
                    <input type="text" value={formData.YieldNotes || ''} onChange={e => setFormData({...formData, YieldNotes: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Optional notes" />
                  </div>
                </div>
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <textarea rows="2" value={formData.Notes} onChange={e => setFormData({...formData, Notes: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Conclusion</label>
            <textarea rows="2" value={formData.Conclusion} onChange={e => setFormData({...formData, Conclusion: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.IsControl} onChange={e => setFormData({...formData, IsControl: e.target.checked})} className="w-4 h-4 accent-emerald-600" />
              <span className="font-medium text-slate-700">Control Plot</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.IsStandardCheck} onChange={e => setFormData({...formData, IsStandardCheck: e.target.checked})} className="w-4 h-4 accent-emerald-600" />
              <span className="font-medium text-slate-700">Standard Check</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formData.IsCompleted} onChange={e => setFormData({...formData, IsCompleted: e.target.checked})} className="w-4 h-4 accent-emerald-600" />
              <span className="font-medium text-slate-700">Mark as Completed</span>
            </label>
          </div>

          {/* Control Finalization */}
          <div className="border rounded-xl p-3 bg-orange-50 border-orange-200">
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="checkbox" checked={formData.ControlFinalized} onChange={e => setFormData({...formData, ControlFinalized: e.target.checked})} className="w-4 h-4 accent-orange-600" />
              <Lock className="w-3.5 h-3.5 text-orange-600" />
              <span className="font-semibold text-orange-700">Control Finalized</span>
            </label>
            {formData.ControlFinalized && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs text-orange-700 font-semibold mb-1">Finalization Date</label>
                  <input type="datetime-local" value={formData.FinalizationDate} onChange={e => setFormData({...formData, FinalizationDate: e.target.value})} className="w-full px-3 py-2 text-sm border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs text-orange-700 font-semibold mb-1">Final Control Duration (days)</label>
                  <input type="number" min="0" value={formData.FinalControlDuration} onChange={e => setFormData({...formData, FinalControlDuration: e.target.value})} className="w-full px-3 py-2 text-sm border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">{editingTrial ? 'Update Trial' : 'Save Trial'}</button>
          </div>
        </form>
      </Modal>

      <SprayCalculatorModal 
        isOpen={isSprayCalcOpen} 
        onClose={() => setIsSprayCalcOpen(false)} 
        onApply={(recipe) => setFormData(prev => ({ ...prev, Dosage: recipe }))} 
        initialFormulationName={formData.FormulationName}
      />

      {/* ── DETAIL PANEL ── */}
      {detailTrial && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setActiveTrial(null)} />
          <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className={`p-5 flex items-start justify-between gap-3 ${detailIsCompleted ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${detailIsCompleted ? 'bg-emerald-200 text-emerald-800' : 'bg-blue-200 text-blue-800'}`}>
                    {detailIsCompleted ? 'Finalized' : 'Active'}
                  </span>
                  {detailTrial.IsControl === true || detailTrial.IsControl === 'true' ?
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-800">Control</span> : null}
                  <ResultBadge result={detailTrial.Result} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 truncate">{detailTrial.FormulationName}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(detailTrial.Date)} · {detailTrial.Location || projects.find(p => String(p.ID) === String(detailTrial.ProjectID))?.Location || 'No location'}</p>
              </div>
              <div className="flex gap-2 shrink-0" ref={exportMenuRef}>
                {canDownload && (
                  /* Export dropdown */
                  <div className="relative">
                    <button onClick={() => setExportMenuOpen(v => !v)} title="Export" className="p-2 rounded-lg hover:bg-white/60 text-slate-600 flex items-center gap-1">
                      <FileDown className="w-4 h-4" />
                    </button>
                    {exportMenuOpen && (
                      <div className="absolute right-0 top-10 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 min-w-52 py-1">
                        <p className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase">Export This Trial</p>
                        <button onClick={() => { triggerExportWithCustomisation(() => handleExportPdf(detailTrial)); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <FileDown className="w-4 h-4 text-red-500" /> Comprehensive PDF
                        </button>
                        <button onClick={() => { triggerExportWithCustomisation(() => handleExportSciPdf(detailTrial)); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <ScanLine className="w-4 h-4 text-indigo-500" /> Scientific PDF
                        </button>
                        <button onClick={() => { handleExportPpt(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <MonitorPlay className="w-4 h-4 text-orange-500" /> PowerPoint (.pptx)
                        </button>
                        {activeCategory !== 'herbicide' && (
                          <button onClick={() => { triggerExportWithCustomisation(() => handleExportAdvancedExcel(detailTrial)); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            <FileSpreadsheet className="w-4 h-4 text-amber-500" /> Advanced Excel (11-Sheet)
                          </button>
                        )}
                        <button onClick={() => { triggerExportWithCustomisation(() => exportHtmlSlide(detailTrial)); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Archive className="w-4 h-4 text-blue-500" /> HTML Report (printable)
                        </button>
                        <button onClick={() => { triggerExportWithCustomisation(() => exportTxtReport(detailTrial)); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <FileCode className="w-4 h-4 text-slate-500" /> Field Report (.txt)
                        </button>
                        <button onClick={() => { triggerExportWithCustomisation(() => exportCsv(detailTrial)); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Observations CSV
                        </button>
                        <button onClick={() => { exportJson(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <FileDown className="w-4 h-4 text-violet-500" /> Raw JSON
                        </button>
                        <button onClick={() => { shareTrial(detailTrial); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Share2 className="w-3.5 h-3.5 text-sky-500" /> Share / Copy
                        </button>
                        <hr className="my-1 border-slate-100" />
                        <p className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase">All Trials</p>
                        <button onClick={() => { triggerExportWithCustomisation(() => exportAllCsv()); setExportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export All Trials (CSV)
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {!isViewer && (
                  <>
                    <button onClick={() => handleMoveToProject(detailTrial)} title="Move to Project" className="p-2 rounded-lg hover:bg-white/60 text-slate-600"><FolderOpen className="w-4 h-4" /></button>
                    <button onClick={() => { setActiveTrial(null); handleOpenModal(detailTrial); }} title="Edit" className="p-2 rounded-lg hover:bg-white/60 text-slate-600"><Edit className="w-4 h-4" /></button>
                  </>
                )}
                <button onClick={() => setActiveTrial(null)} className="p-2 rounded-lg hover:bg-white/60 text-slate-600"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-white overflow-x-auto">
              {[['info','Info'],['applications','Applications'],['observations','Observations'],['harvest','Harvest & Yield'],['photos','Photos'],['weather','Weather'],['chart','Chart'],['statistics','Statistics'],['qr','QR Code'],['ai','AI Summary'],['export','Export']]
                .filter(([k]) => k !== 'export' || canDownload)
                .map(([k, label]) => {
                  const harvestPhotos = safeJsonParse(detailTrial.HarvestDataJSON, {}).photos || [];
                  return (
                    <button key={k} onClick={() => setDetailTab(k)}
                      className={`px-4 py-3 text-sm font-semibold border-b-2 transition
                        ${detailTab === k ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                      {label}
                      {k === 'applications' && safeJsonParse(detailTrial.ApplicationLogJSON, []).length > 0 && <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full">{safeJsonParse(detailTrial.ApplicationLogJSON, []).length}</span>}
                      {k === 'observations' && detailEfficacy.length > 0 && <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 px-1.5 rounded-full">{detailEfficacy.length}</span>}
                      {k === 'harvest' && harvestPhotos.length > 0 && <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 rounded-full">{harvestPhotos.length}</span>}
                      {k === 'photos' && detailPhotos.length > 0 && <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">{detailPhotos.length}</span>}
                    </button>
                  );
                })}
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-24">
              {/* Applications Log Tab */}
              {detailTab === 'applications' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Treatment Applications Log</h4>
                      <p className="text-xs text-slate-500">Record sequential treatment applications made to this plot.</p>
                    </div>
                    {!detailIsCompleted && !isViewer && (
                      <button 
                        onClick={() => handleOpenAppModal(null)}
                        className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold transition shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Application
                      </button>
                    )}
                  </div>

                  {(() => {
                    const apps = safeJsonParse(detailTrial.ApplicationLogJSON, []);
                    if (apps.length === 0) {
                      return (
                        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
                          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-slate-400">No sequential applications recorded yet</p>
                          {!detailIsCompleted && !isViewer && (
                            <button 
                              onClick={() => handleOpenAppModal(null)}
                              className="mt-3 text-xs text-emerald-600 font-bold hover:underline"
                            >
                              Add the first application entry →
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {apps.map((app, idx) => (
                          <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
                              <div className="flex items-center gap-2.5">
                                <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2 py-0.5 rounded">
                                  {app.code || `App ${String.fromCharCode(65 + idx)}`}
                                </span>
                                <span className="text-xs font-semibold text-slate-500">
                                  {app.date ? formatDateTime(app.date) : 'No date'}
                                </span>
                              </div>
                              {!detailIsCompleted && !isViewer && (
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => handleOpenAppModal(app, idx)} 
                                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition" 
                                    title="Edit Application"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteApp(idx)} 
                                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition" 
                                    title="Delete Application"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
                              {app.dosage && (
                                <div className="bg-slate-50 p-2 rounded-lg">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Dosage Rate</span>
                                  <span className="font-semibold text-slate-700">{app.dosage}</span>
                                </div>
                              )}
                              {app.method && (
                                <div className="bg-slate-50 p-2 rounded-lg">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Method</span>
                                  <span className="font-semibold text-slate-700">{app.method}</span>
                                </div>
                              )}
                              {app.cropStage && (
                                <div className="bg-slate-50 p-2 rounded-lg">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Crop Stage (BBCH)</span>
                                  <span className="font-semibold text-slate-700">{app.cropStage}</span>
                                </div>
                              )}
                              {app.targetStage && (
                                <div className="bg-slate-50 p-2 rounded-lg">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Target Stage</span>
                                  <span className="font-semibold text-slate-700">{app.targetStage}</span>
                                </div>
                              )}
                              {(app.temp || app.humidity || app.windspeed) && (
                                <div className="bg-slate-50 p-2 rounded-lg col-span-2">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Weather at Application</span>
                                  <span className="font-semibold text-slate-700 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                                    {app.temp && <span>Temp: {app.temp}°C</span>}
                                    {app.humidity && <span>RH: {app.humidity}%</span>}
                                    {app.windspeed && <span>Wind: {app.windspeed} km/h</span>}
                                    <span>Rain within 2h: {app.rain || 'No'}</span>
                                  </span>
                                </div>
                              )}
                              {app.notes && (
                                <div className="col-span-full border-t pt-2 mt-1">
                                  <span className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Application Notes</span>
                                  <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{app.notes}</p>
                                </div>
                              )}
                              {(app.adjuvant || app.tankMix) && (
                                <div className="col-span-full border-t pt-2 mt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {app.adjuvant && (
                                    <div className="bg-blue-50 p-2 rounded-lg">
                                      <span className="block text-[10px] font-bold text-blue-400 uppercase">Adjuvant</span>
                                      <span className="font-semibold text-slate-700 text-xs">{app.adjuvant}</span>
                                    </div>
                                  )}
                                  {app.tankMix && (
                                    <div className="bg-purple-50 p-2 rounded-lg">
                                      <span className="block text-[10px] font-bold text-purple-400 uppercase">Tank Mix</span>
                                      <span className="font-semibold text-slate-700 text-xs">{app.tankMix}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Info Tab */}
              {detailTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const infoFields = [
                        ['Investigator', detailTrial.InvestigatorName, User],
                        ['Dosage', detailTrial.Dosage, FlaskConical],
                      ];
                      
                      if (activeCategory === 'herbicide') {
                        infoFields.push(['Weed Species', detailTrial.WeedSpecies, Activity]);
                      } else {
                        infoFields.push([catConfig.targetLabel, detailTrial[catConfig.targetField] || detailTrial.WeedSpecies || '—', Activity]);
                      }

                      if (detailTrial.TrialDesign === 'PotTrial') {
                        const proj = projects.find(p => String(p.ID) === String(detailTrial.ProjectID));
                        const potObsMode = proj?.PotObsMode || 'row-wise';
                        infoFields.push(
                          ['Project', proj?.Name || '—', FolderPlus],
                          [potObsMode === 'row-wise' ? 'Row Position' : 'Pot Position', detailTrial.PotLabel || detailTrial.PlotNumber || '—', Hash]
                        );
                      } else {
                        infoFields.push(
                          ['Project', projects.find(p => p.ID === detailTrial.ProjectID)?.Name || '—', FolderPlus],
                          ['Replication', detailTrial.Replication || '—', Hash],
                          ['Plot #', detailTrial.PlotNumber || '—', Hash]
                        );
                      }

                      if (activeCategory === 'herbicide') {
                        infoFields.push(
                          ['App Timing', detailTrial.ApplicationTiming || '—', Clock],
                          ['Growth Stage', detailTrial.WeedGrowthStage || '—', Leaf]
                        );
                      } else {
                        const timingOpt = catConfig.applicationTimings.find(t => t.value === detailTrial.ApplicationTiming);
                        infoFields.push(
                          ['App Timing', timingOpt ? timingOpt.label : (detailTrial.ApplicationTiming || '—'), Clock]
                        );
                        catConfig.specificFields.forEach(f => {
                          if (f.key !== catConfig.targetField && f.key !== 'YieldValue') {
                            let val = detailTrial[f.key];
                            if (!val || val === '—') {
                              const latestObs = detailEfficacy.slice().sort((a,b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
                              if (latestObs) {
                                const obsKey = Object.keys(latestObs).find(k => k.toLowerCase() === f.key.toLowerCase());
                                if (obsKey && latestObs[obsKey] !== undefined && latestObs[obsKey] !== null && latestObs[obsKey] !== '') {
                                  val = latestObs[obsKey];
                                }
                              }
                            }
                            infoFields.push([f.label, val || '—', Leaf]);
                          }
                        });
                      }

                      infoFields.push(
                        ['Control Days', (() => { if (detailTrial.FinalControlDuration) return `${detailTrial.FinalControlDuration}d (finalized)`; if (!detailTrial.Date) return '—'; const d = Math.max(0, Math.round((new Date() - new Date(detailTrial.Date)) / 86400000)); return `${d}d (running)`; })(), Clock]
                      );

                      if (detailTrial.YieldValue) {
                        const yieldLabel = activeCategory === 'herbicide' ? 'Yield (t/ha)' : (catConfig.specificFields.find(f => f.key === 'YieldValue')?.label || 'Yield');
                        infoFields.push([yieldLabel, detailTrial.YieldValue, Leaf]);
                      }

                      return infoFields.map(([label, val, Icon]) => (
                        <div key={label} className="bg-slate-50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 mb-1"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-xs font-bold text-slate-500 uppercase">{label}</span></div>
                          <p className="text-sm font-semibold text-slate-800">{val || '—'}</p>
                        </div>
                      ));
                    })()}
                  </div>
                  {detailTrial.Notes && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailTrial.Notes}</p>
                    </div>
                  )}
                  {detailTrial.Conclusion && (
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Conclusion</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailTrial.Conclusion}</p>
                    </div>
                  )}
                  {/* Soil data */}
                  {(detailTrial.SoilPH || detailTrial.SoilClay || detailTrial.SoilTexture) && (
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-amber-700 uppercase mb-2">Soil Data</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {[['pH', detailTrial.SoilPH], ['Clay %', detailTrial.SoilClay], ['Sand %', detailTrial.SoilSand], ['Org. C %', detailTrial.SoilOC], ['Texture', detailTrial.SoilTexture]].filter(([, v]) => v).map(([l, v]) => (
                          <div key={l}><span className="text-amber-600 font-semibold">{l}:</span> <span className="text-slate-700">{v}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* GPS */}
                  {(detailTrial.Lat || detailTrial.Lon) && (
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Navigation className="w-3 h-3" /> GPS: {detailTrial.Lat}, {detailTrial.Lon}
                    </div>
                  )}
                  {/* Control Finalization */}
                  {(detailTrial.ControlFinalized === true || detailTrial.ControlFinalized === 'true') && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-xs">
                      <Lock className="w-3.5 h-3.5 text-orange-500" />
                      <span className="font-semibold text-orange-700">Control Finalized</span>
                      {detailTrial.FinalControlDuration && <span className="text-orange-600">· {detailTrial.FinalControlDuration} days</span>}
                      {detailTrial.FinalizationDate && <span className="text-orange-500">· {formatDateTime(detailTrial.FinalizationDate)}</span>}
                    </div>
                  )}
                  {!isViewer && (
                    <div className="flex gap-2 pt-2 flex-wrap">
                      {!detailIsCompleted ? (
                        <button onClick={handleFinalize} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                          <Lock className="w-3.5 h-3.5" /> Finalize Trial
                        </button>
                      ) : (
                        <button onClick={handleRestart} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          <Unlock className="w-3.5 h-3.5" /> Reactivate
                        </button>
                      )}
                      <button onClick={() => { setActiveTrial(null); handleOpenModal(detailTrial, true); }} className="px-4 py-2 text-sm font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                        Duplicate
                      </button>
                      <button onClick={() => handleDelete(detailTrial.ID)} className="px-4 py-2 text-sm font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Observations Tab */}
              {detailTab === 'observations' && (
                (() => {
                  const { sorted, baseCover } = obsData;
                  let controlDays = null;
                  if (detailTrial.ControlFinalized === true || detailTrial.ControlFinalized === 'true') {
                    if (detailTrial.FinalControlDuration) controlDays = `${detailTrial.FinalControlDuration} days (final)`;
                    else if (detailTrial.FinalizationDate && detailTrial.Date) {
                      const d = Math.floor((new Date(detailTrial.FinalizationDate) - new Date(detailTrial.Date)) / 86400000);
                      controlDays = `${Math.max(0, d)} days (final)`;
                    } else controlDays = 'Finalized';
                  } else if (detailTrial.Date) {
                    const d = Math.floor((new Date() - new Date(detailTrial.Date)) / 86400000);
                    controlDays = `${Math.max(0, d)} days active`;
                  }
                  return (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-700">Observation Timeline</h3>
                        {controlDays && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 mt-1 inline-block">
                            ⏱ {controlDays}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {sorted.length >= 2 && !isViewer && (
                          <button onClick={() => generateAISummary()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-lg hover:from-violet-600 hover:to-purple-600 shadow-sm">
                            <Sparkles className="w-3.5 h-3.5" />Generate AI Summary
                          </button>
                        )}
                        {!isViewer && (
                          <>
                            <button onClick={() => setIsGridOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                              <Grid className="w-3.5 h-3.5" />Grid Tool
                            </button>
                            <button onClick={() => openObsModal(null)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                              <Plus className="w-3.5 h-3.5" />Log Observation
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {sorted.length > 0 ? (
                      <div className="space-y-3">
                        {sorted.map((obs, idx) => {
                          const primaryObsField = getPrimaryObservationField(activeCategory);
                          const obsField = catConfig.observationFields?.find(f => f.key === primaryObsField);
                          const obsLabel = obsField ? obsField.label.replace(/\s*\(.*?\)/, '') : 'Value';
                          const hasPct = obsField?.label.includes('%');
                          const displayUnit = hasPct ? '%' : obsField?.label.includes('kg/plot') ? ' kg' : '';
                          const obsValue = Number(getObservationPrimaryValue(activeCategory, obs) ?? 0);
                          const isBaseline = obs.daa === sorted[0]?.daa;
                          const efficacyVal = !isBaseline && baseCover > 0 ? calculateEfficacy(activeCategory, obsValue, baseCover) : null;
                          const efficacyLabel = catConfig.primaryMetric.key;
                          const efficacyUnit = catConfig.primaryMetric.unit || '';
                          const efficacyRating = efficacyVal === null ? null : (() => {
                            if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
                              if (efficacyVal >= 15) return 'Excellent';
                              if (efficacyVal >= 8) return 'Good';
                              if (efficacyVal >= 3) return 'Fair';
                              return 'Poor';
                            } else {
                              if (efficacyVal >= 85) return 'Excellent';
                              if (efficacyVal >= 70) return 'Good';
                              if (efficacyVal >= 50) return 'Fair';
                              return 'Poor';
                            }
                          })();
                          const ratingCls = efficacyRating === null ? '' : 
                            efficacyRating === 'Excellent' ? 'text-emerald-700 bg-emerald-50' : 
                            efficacyRating === 'Good' ? 'text-blue-700 bg-blue-50' : 
                            efficacyRating === 'Fair' ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                          const risks = getClimateRisks(obs.weatherTemp, obs.weatherWind, obs.weatherRain);
                          return (
                            <div key={idx} className="bg-white border rounded-xl p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="bg-slate-700 text-white font-bold px-2 py-1 rounded text-xs">DAA {obs.daa ?? 0}</span>
                                  <span className="text-xs text-slate-500">{obs.date ? formatPhotoDate(obs.date) : ''}</span>
                                  {efficacyRating && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ratingCls}`}>{efficacyRating}</span>}
                                  {(() => {
                                    const outlier = isObservationOutlier(obs, obs.daa);
                                    if (!outlier) return null;
                                    return (
                                      <span 
                                        className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold flex items-center gap-1 cursor-help animate-pulse"
                                        title={`Statistically anomalous value! Deviates significantly from the treatment average. (Z-Score: ${outlier.zScore.toFixed(2)})`}
                                      >
                                        ⚠️ Outlier (Z: {outlier.zScore.toFixed(1)})
                                      </span>
                                    );
                                  })()}
                                  {obs.source === 'AI' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">AI</span>}
                                  {obs.aiConfidence && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${obs.aiConfidence === 'HIGH' ? 'bg-emerald-100 text-emerald-700' : obs.aiConfidence === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{obs.aiConfidence}</span>}
                                  {obs.competitionLevel && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{obs.competitionLevel}</span>}
                                </div>
                                {!isViewer && (
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openObsModal(detailEfficacy.indexOf(obs) !== -1 ? detailEfficacy.indexOf(obs) : idx)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Edit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteObs(detailEfficacy.indexOf(obs) !== -1 ? detailEfficacy.indexOf(obs) : idx)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <div className="bg-slate-50 p-2 rounded-lg text-center">
                                  <p className="text-[10px] text-slate-500 font-semibold mb-0.5">{obsLabel}</p>
                                  <p className="text-base font-bold text-slate-800">{obsValue.toFixed(1)}{displayUnit}</p>
                                </div>
                                <div className={`p-2 rounded-lg text-center ${efficacyVal !== null ? ratingCls : 'bg-slate-50'}`}>
                                  <p className="text-[10px] font-semibold mb-0.5 opacity-70">{efficacyLabel} {efficacyUnit}</p>
                                  <p className="text-base font-bold">{efficacyVal !== null ? `${efficacyVal.toFixed(1)}${efficacyUnit}` : isBaseline ? 'Baseline' : '—'}</p>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-lg text-center">
                                  <p className="text-[10px] text-slate-500 font-semibold mb-0.5">
                                    {activeCategory === 'herbicide' ? 'Species Count' : 
                                     activeCategory === 'fungicide' ? 'Diseases' : 
                                     activeCategory === 'pesticide' ? 'Pests' : 
                                     activeCategory === 'nutrition' ? 'Agronomic Indicators' : 
                                     activeCategory === 'biostimulant' ? 'Biostimulants' : catConfig.targetLabel}
                                  </p>
                                  <p className="text-base font-bold text-slate-700">{(obs.weedDetails || []).filter(w => w.species && w.species !== 'Total').length || '—'}</p>
                                </div>
                              </div>

                              {/* Dynamic Category Parameters & Data Source Panel */}
                              {(() => {
                                const fieldsToShow = (catConfig.observationFields || []).filter(f => f.key !== 'weedDetails');
                                if (fieldsToShow.length === 0) return null;
                                
                                // Calculate completeness
                                const completedCount = fieldsToShow.filter(f => obs[f.key] !== undefined && obs[f.key] !== null && obs[f.key] !== '').length;
                                
                                return (
                                  <div className="mt-2 border-t pt-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase">
                                        Parameters & Completeness ({completedCount}/{fieldsToShow.length})
                                      </p>
                                      {obs.source === 'AI' && !obs.verified && (
                                        <span className="text-[9px] bg-purple-50 text-purple-600 border border-purple-200 px-1 py-0.2 rounded font-semibold animate-pulse">
                                          Unverified AI Data
                                        </span>
                                      )}
                                      {obs.source === 'AI' && obs.verified && (
                                        <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1 py-0.2 rounded font-semibold">
                                          Verified AI Data
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {fieldsToShow.map(f => {
                                        const val = obs[f.key];
                                        const hasVal = val !== undefined && val !== null && val !== '';
                                        const isAI = obs.source === 'AI' && !obs[`_manual_${f.key}`];
                                        
                                        return (
                                          <div key={f.key} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded p-1.5">
                                            <span className="text-slate-500 truncate mr-1" title={f.label}>{f.label.replace(/\s*\(.*?\)/, '')}</span>
                                            {hasVal ? (
                                              <div className="flex items-center gap-1 shrink-0">
                                                <span className="font-bold text-slate-800">{val}</span>
                                                {isAI ? (
                                                  <span className="text-[9px] px-1 bg-purple-100 text-purple-700 rounded font-bold" title="Captured by AI">AI</span>
                                                ) : (
                                                  <span className="text-[9px] px-1 bg-blue-100 text-blue-700 rounded font-bold" title="Manually Entered">Manual</span>
                                                )}
                                              </div>
                                            ) : (
                                              <button 
                                                onClick={() => setQuickEditObs({
                                                  obsIdx: detailEfficacy.indexOf(obs) !== -1 ? detailEfficacy.indexOf(obs) : idx,
                                                  fieldKey: f.key,
                                                  label: f.label,
                                                  value: val ?? ''
                                                })} 
                                                className="text-[9px] px-1 py-0.5 border border-dashed border-slate-300 text-slate-500 rounded bg-white hover:bg-slate-100 hover:text-slate-700 font-medium shrink-0 flex items-center gap-0.5"
                                                title="Click to enter parameter manually"
                                              >
                                                <span>➕ Enter</span>
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              {(obs.weedDetails || []).length > 0 && (
                                <div className="mt-2 border-t pt-2">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">
                                    {activeCategory === 'herbicide' ? 'Species Breakdown' : 
                                     activeCategory === 'fungicide' ? 'Disease Breakdown' : 
                                     activeCategory === 'pesticide' ? 'Pest Breakdown' : 
                                     activeCategory === 'nutrition' ? 'Agronomic Indicator Breakdown' : 
                                     activeCategory === 'biostimulant' ? 'Biostimulant Parameter Breakdown' : `${catConfig.targetLabel} Breakdown`}
                                  </p>
                                  <div className="space-y-1.5">
                                    {obs.weedDetails.map((wd, wIdx) => (
                                      <div key={wIdx} className="flex items-center justify-between text-xs gap-2">
                                        <span className="text-slate-600 truncate flex-1">{wd.species || 'Unknown'}</span>
                                        <div className="flex gap-1 shrink-0">
                                          {wd.growthStage && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{wd.growthStage}</span>}
                                          {wd.status && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLS[wd.status === 'Unaffected' && activeCategory !== 'herbicide' ? 'Healthy' : wd.status] || 'bg-slate-100 text-slate-600'}`}>
                                              {wd.status === 'Unaffected' && activeCategory !== 'herbicide' ? 'Healthy' : wd.status}
                                            </span>
                                          )}
                                        </div>
                                        <span className="font-bold text-slate-800 shrink-0">{wd.cover}%{wd.confidence ? ` (${wd.confidence}% Conf)` : ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Observation-level weather strip */}
                              {(obs.weatherTemp || obs.weatherWind || obs.weatherRain) && (
                                <div className="mt-2 border-t pt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
                                  {obs.weatherTemp && <span>🌡 {obs.weatherTemp}°C</span>}
                                  {obs.weatherHumidity && <span>💧 {obs.weatherHumidity}%</span>}
                                  {obs.weatherWind && <span>💨 {obs.weatherWind} km/h</span>}
                                  {obs.weatherRain && parseFloat(obs.weatherRain) > 0 && <span>🌧 {obs.weatherRain} mm</span>}
                                </div>
                              )}
                              {/* Climate risk flags */}
                              {risks.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {risks.map((risk, ri) => (
                                    <div key={ri} className={`text-[10px] px-2 py-1 rounded font-semibold flex items-center gap-1 ${
                                      risk.type === 'danger' ? 'bg-red-50 text-red-700' : risk.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                                    }`}>
                                      {risk.type === 'danger' ? '⚠' : risk.type === 'warning' ? '⚠' : 'ℹ'} {risk.msg}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {obs.notes && (() => {
                                const parts = obs.notes.split(' | ').map(p => p.trim()).filter(Boolean);
                                if (parts.length === 1) {
                                  return <p className="mt-2 text-xs text-slate-500 italic">"{parts[0]}"</p>;
                                }
                                return (
                                  <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-slate-500 pl-1">
                                    {parts.map((p, idx) => <li key={idx} className="italic">"{p}"</li>)}
                                  </ul>
                                );
                              })()}
                              {obs.validationNotes && (
                                <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg p-2 flex items-start gap-1.5 text-xs text-amber-800">
                                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] font-bold text-amber-700 uppercase mb-0.5">Data Integrity & Reconciliation Log</p>
                                    <p>{obs.validationNotes}</p>
                                  </div>
                                </div>
                              )}
                              {obs.aiEfficacyAssessment && (
                                <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-2">
                                  <p className="text-[10px] font-bold text-purple-700 uppercase mb-0.5">AI Efficacy Assessment</p>
                                  {(() => {
                                    const parts = obs.aiEfficacyAssessment.split(' | ').map(p => p.trim()).filter(Boolean);
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
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No observations yet</p>
                        <p className="text-xs mt-1">Track weed cover over time to evaluate efficacy</p>
                      </div>
                    )}
                  </div>
                  );
                })()
              )}

              {/* Photos Tab */}
              {detailTab === 'photos' && (
                <div className="space-y-4">
                  {daaCoverage.allDAAs.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">DAA Coverage Timeline</span>
                        <span className="text-[10px] text-slate-500">{daaCoverage.obsDAAs.length} obs · {daaCoverage.photoDAAs.length} photos</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {daaCoverage.allDAAs.map(daa => {
                          const hasObs = daaCoverage.obsDAAs.includes(daa);
                          const hasPhoto = daaCoverage.photoDAAs.includes(daa);
                          return (
                            <div key={daa} className={`px-2 py-1 rounded text-[10px] font-semibold ${
                              hasObs ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                              hasPhoto ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-slate-100 text-slate-500'
                            }`} title={hasObs ? 'Has observation' : 'Has photo, needs AI scan'}>
                              DAA {daa} {hasObs ? '✓' : hasPhoto ? '📷' : ''}
                            </div>
                          );
                        })}
                      </div>
                      {daaCoverage.hasGaps && (
                        <p className="text-[10px] text-amber-600 mt-2">
                          ⚠️ Missing DAAs. Click "AI Scan All" to fill gaps.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h3 className="font-semibold text-slate-700">
                      Photos ({detailPhotos.length})
                      {detailPhotos.some(isPhotoBroken) && (
                        <span className="ml-2 text-xs font-normal text-amber-600">
                          ({detailPhotos.filter(isPhotoBroken).length} unavailable)
                        </span>
                      )}
                    </h3>
                    {!isViewer && (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                          <ImageIcon className="w-3.5 h-3.5" />Upload
                        </button>
                        <button onClick={() => { setCameraMode('weed'); setIsCameraOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                          <ScanLine className="w-3.5 h-3.5" />Weed Cam
                        </button>
                        <button onClick={() => { setCameraMode('general'); setIsCameraOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          <Camera className="w-3.5 h-3.5" />Camera
                        </button>
                        <label className="flex items-center gap-1 text-xs text-slate-500 select-none cursor-pointer self-center" title="Heal existing only: Only restore broken/unavailable photos already in the list; do not import new/deleted photos.">
                          <input 
                            type="checkbox" 
                            checked={syncHealOnly} 
                            onChange={e => setSyncHealOnly(e.target.checked)} 
                            className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span>Heal only</span>
                        </label>
                        <button 
                          onClick={() => handleSyncPhotosFromDrive()} 
                          disabled={syncingPhotos}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-md disabled:opacity-50 disabled:cursor-wait"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingPhotos ? 'animate-spin' : ''}`} />
                          {syncingPhotos ? 'Syncing...' : 'Sync Drive'}
                        </button>
                        <button onClick={() => setAiBatchModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 shadow-lg">
                          <Sparkles className="w-3.5 h-3.5" />AI Scan All
                        </button>
                      </div>
                    )}
                  </div>
                  {detailPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {detailPhotos.map((photo, idx) => {
                        const rawSrc = resolvePhotoSrc(photo);
                        const src = rawSrc ? (getPhotoThumbnailSrc(photo, 400) || rawSrc) : null;
                        if (!rawSrc) {
                          return (
                            <div key={idx} className="rounded-xl overflow-hidden bg-amber-50 border border-amber-200 flex flex-col">
                              <div className="relative aspect-square flex flex-col items-center justify-center p-4 text-center">
                                <ImageIcon className="w-10 h-10 text-amber-400 mb-2" />
                                <p className="text-xs font-semibold text-amber-800">Photo unavailable</p>
                                <p className="text-[10px] text-amber-600 mt-1">Link lost after sync — delete &amp; re-upload</p>
                                {photo.date && <p className="text-[10px] text-slate-500 mt-2">{formatPhotoDate(photo.date)}</p>}
                                {photo.label && <p className="text-[10px] text-slate-500">{photo.label}</p>}
                                {photo.tag && <p className="text-[10px] font-bold text-blue-600 uppercase mt-1">{photo.tag}</p>}
                                {!isViewer && (
                                  <button onClick={() => handleDeletePhoto(idx)} title="Remove broken entry"
                                    className="mt-3 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                                    <Trash2 className="w-3 h-3" /> Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={idx} className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex flex-col">
                            <div className="relative">
                              <img
                                src={src}
                                alt={`Photo ${idx + 1}`}
                                className="w-full aspect-square object-cover bg-slate-200"
                                onError={e => { e.target.onerror = null; e.target.src = rawSrc; }}
                              />
                              {/* Status Indicators */}
                              <div className="absolute bottom-1 left-1 flex gap-1">
                                {photo.aiStatus === 'completed' && (
                                  <span className="text-[9px] font-bold bg-green-500/90 backdrop-blur text-white px-1.5 py-0.5 rounded shadow">AI OK</span>
                                )}
                                {photo.aiStatus === 'processing' && (
                                  <span className="text-[9px] font-bold bg-blue-500/90 backdrop-blur text-white px-1.5 py-0.5 rounded shadow animate-pulse">Analyzing</span>
                                )}
                                {photo.aiStatus === 'pending' && (
                                  <span className="text-[9px] font-bold bg-amber-500/90 backdrop-blur text-white px-1.5 py-0.5 rounded shadow">Pending</span>
                                )}
                                {photo.aiStatus === 'failed' && (
                                  <span className="text-[9px] font-bold bg-red-500/90 backdrop-blur text-white px-1.5 py-0.5 rounded shadow" title={photo.aiError || 'Failed'}>AI Failed</span>
                                )}
                              </div>
                              {!isViewer && (
                                <div className="absolute top-1 right-1 z-20 flex gap-1">
                                  <button
                                    onClick={() => handleAnalyzeSinglePhoto(src, photo.date)}
                                    disabled={!!aiGenRunning}
                                    title={photo.aiStatus === 'completed' ? 'Re-run AI Analysis' : aiGenRunning ? 'AI analysis running...' : 'AI Full Scan & Log'}
                                    className={`p-1.5 rounded-lg text-white shadow transition ${aiGenRunning === src ? 'bg-purple-400 cursor-wait' : 'bg-purple-600/90 hover:bg-purple-700'}`}>
                                    {aiGenRunning === src ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                  </button>
                                  <button onClick={() => handleDeletePhoto(idx)} title="Delete"
                                    className="p-1.5 bg-red-500/90 backdrop-blur rounded-lg text-white shadow">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="px-2 pt-1.5 pb-1">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <p className="text-xs font-semibold text-slate-700 truncate">{photo.label || `Photo ${idx+1}`}</p>
                                {photo.tag && (
                                  <span className="text-[8px] font-extrabold bg-slate-200 text-slate-700 px-1 py-0.5 rounded uppercase shrink-0">
                                    {photo.tag}
                                  </span>
                                )}
                              </div>
                              {photo.date && <p className="text-[10px] text-slate-400">{formatPhotoDate(photo.date)}</p>}
                            </div>
                             <div className="px-2 pb-2 flex gap-1 flex-wrap">
                              {photo.aiData && (
                                <button onClick={() => setSelectedPhotoForDetails(photo)} title="View Detailed AI Diagnostics"
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 border border-purple-200">
                                  <Sparkles className="w-3 h-3" />View AI
                                </button>
                              )}
                              <button onClick={() => identifyWeedFromPhoto(src, false, idx)} title="AI Weed ID"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100">
                                <Leaf className="w-3 h-3" />Weed ID
                              </button>
                              <button onClick={() => identifyWeedFromPhoto(src, true, idx)} title="AI Bounding Box Analysis"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100">
                                <Eye className="w-3 h-3" />Bounds
                              </button>
                              <button onClick={() => detectWeedCoverAI(src)} title="Detect Weed Cover"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100">
                                <ScanLine className="w-3 h-3" />Cover
                              </button>
                              {!isViewer && (
                                <>
                                  <button onClick={() => handleCropExistingPhoto(idx, rawSrc)} title="Crop photo"
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                                    <Crop className="w-3 h-3" />Crop
                                  </button>
                                  <button onClick={() => setPhotoEditModal({ idx, label: photo.label || '', date: toDatetimeLocal(photo.date || new Date()) })} title="Edit label/date"
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                                    <Pencil className="w-3 h-3" />Edit
                                  </button>
                                </>
                              )}
                              {canDownload && (
                              <button onClick={() => { const a = document.createElement('a'); a.href = rawSrc; a.download = photo.fileName || `photo-${idx+1}.jpg`; a.target = '_blank'; a.click(); }} title="Download"
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">
                                <Download className="w-3 h-3" />
                              </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                      <Camera className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No photos yet</p>
                      <p className="text-xs mt-1">Capture or upload field photos</p>
                    </div>
                  )}

                  {/* Weed ID / Cover Detection Results */}
                  {(weedIdLoading || weedIdResult || detectingCover || coverDetectResult) && (
                    <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
                      {/* Weed ID */}
                      {(weedIdLoading || weedIdResult) && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 uppercase mb-2 flex items-center gap-1"><Leaf className="w-3.5 h-3.5 text-emerald-600" />{activeCategory === 'herbicide' ? 'AI Weed Identification' : `AI ${catConfig.targetLabel} Identification`}</p>
                          {weedIdLoading ? (
                            <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Identifying {activeCategory === 'herbicide' ? 'weeds' : catConfig.targetLabel.toLowerCase()}...</div>
                          ) : weedIdResult && (
                            <div className="space-y-1.5">
                              {weedIdResult.map((w, i) => (
                                <div key={i} className="bg-white border rounded-lg p-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                                    {w.commonName && <p className="text-[10px] text-slate-500 italic">{w.commonName}</p>}
                                    {w.growthStage && <p className="text-[10px] text-slate-400">{w.growthStage}</p>}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-xs font-bold text-emerald-700">{w.cover}% cover</p>
                                    <p className="text-[10px] text-slate-400">{Math.round((w.confidence||0)*100)}% conf.</p>
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => {
                                if (!weedIdResult) return;
                                const species = weedIdResult.map(w => w.name).join(', ');
                                window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Species copied to clipboard', type: 'success' } }));
                                navigator.clipboard?.writeText(species);
                              }} className="text-xs text-emerald-700 underline">Copy to clipboard</button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Cover Detection */}
                      {(detectingCover || coverDetectResult) && (
                        <div>
                          <p className="text-xs font-bold text-slate-600 uppercase mb-2 flex items-center gap-1"><ScanLine className="w-3.5 h-3.5 text-violet-600" />{activeCategory === 'herbicide' ? 'Weed Cover Detection' : `${catConfig.primaryMetric.label} Detection`}</p>
                          {detectingCover ? (
                            <div className="flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Analyzing image...</div>
                          ) : coverDetectResult && (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-white border rounded-lg p-2 text-center">
                                <p className="text-[10px] text-slate-500 font-semibold">Total {activeCategory === 'herbicide' ? 'Cover' : catConfig.primaryMetric.key}</p>
                                <p className="text-base font-bold text-slate-800">{coverDetectResult.cover}%</p>
                              </div>
                              <div className="bg-emerald-50 border rounded-lg p-2 text-center">
                                <p className="text-[10px] text-emerald-600 font-semibold">Green</p>
                                <p className="text-base font-bold text-emerald-700">{coverDetectResult.greenPct}%</p>
                              </div>
                              <div className="bg-amber-50 border rounded-lg p-2 text-center">
                                <p className="text-[10px] text-amber-600 font-semibold">Brown</p>
                                <p className="text-base font-bold text-amber-700">{coverDetectResult.brownPct}%</p>
                              </div>
                              <div className="col-span-3 flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-400">Source: {coverDetectResult.source} | Confidence: {coverDetectResult.confidence}%</span>
                                <button onClick={() => setObsForm(prev => ({ ...prev, weedCover: coverDetectResult.cover }))} className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded font-semibold hover:bg-violet-200">Use value</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick weed ID input */}
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Leaf className="w-3.5 h-3.5" />Identify {activeCategory === 'herbicide' ? 'Weed' : catConfig.targetLabel} from New Photo</p>
                    <input ref={weedIdInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = ev => identifyWeedFromPhoto(ev.target.result);
                      reader.readAsDataURL(f);
                      e.target.value = '';
                    }} />
                    <button onClick={() => weedIdInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                      <Leaf className="w-3.5 h-3.5" /> Upload & Identify {activeCategory === 'herbicide' ? 'Weeds' : `${catConfig.targetLabel}s`}
                    </button>
                  </div>
                </div>
              )}

              {/* Chart Tab */}
              {detailTab === 'chart' && (chartDataComputed ? (
                <div>
                  <h3 className="font-semibold text-slate-700 mb-3">{activeCategory === 'herbicide' ? 'Weed Cover & WCE% Timeline' : `${catConfig.primaryMetric.label} & Efficacy Timeline`}</h3>
                  <div className="bg-white border rounded-xl p-3 overflow-x-auto">
                    <div className="flex gap-4 text-xs mb-2">
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-emerald-500 rounded" />{activeCategory === 'herbicide' ? 'Weed Cover %' : `${catConfig.primaryMetric.label} (${catConfig.primaryMetric.unit || '%'})`}</span>
                      {chartDataComputed.wcePts && <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-indigo-400 rounded" style={{borderTop:'2px dashed #818cf8'}} />{activeCategory === 'herbicide' ? 'WCE %' : `${catConfig.primaryMetric.key} %`}</span>}
                    </div>
                    <svg width={chartDataComputed.W} height={chartDataComputed.H} className="w-full" viewBox={`0 0 ${chartDataComputed.W} ${chartDataComputed.H}`}>
                      {[0,25,50,75,100].filter(v => v <= chartDataComputed.maxCover + 5).map(v => (
                        <g key={v}>
                          <line x1={chartDataComputed.PX} y1={chartDataComputed.cy(v)} x2={chartDataComputed.W-16} y2={chartDataComputed.cy(v)} stroke="#e2e8f0" strokeWidth="1" />
                          <text x={chartDataComputed.PX-4} y={chartDataComputed.cy(v)+4} fontSize="9" fill="#94a3b8" textAnchor="end">{v}%</text>
                        </g>
                      ))}
                      <polyline points={chartDataComputed.pts} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
                      {chartDataComputed.wcePts && <polyline points={chartDataComputed.wcePts} fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="5,3" strokeLinejoin="round" />}
                      {chartDataComputed.chartData.map((o, i) => (
                        <g key={i}>
                          <circle cx={chartDataComputed.cx(o.daa)} cy={chartDataComputed.cy(o.weedCover ?? 0)} r="4" fill="#10b981" stroke="white" strokeWidth="1.5" />
                          <text x={chartDataComputed.cx(o.daa)} y={chartDataComputed.H - 8} fontSize="9" fill="#64748b" textAnchor="middle">{o.daa}</text>
                        </g>
                      ))}
                      <line x1={chartDataComputed.PX} y1={chartDataComputed.PY} x2={chartDataComputed.PX} y2={chartDataComputed.H-chartDataComputed.PB} stroke="#cbd5e1" strokeWidth="1.5" />
                      <line x1={chartDataComputed.PX} y1={chartDataComputed.H-chartDataComputed.PB} x2={chartDataComputed.W-16} y2={chartDataComputed.H-chartDataComputed.PB} stroke="#cbd5e1" strokeWidth="1.5" />
                      <text x={chartDataComputed.W/2} y={chartDataComputed.H} fontSize="9" fill="#94a3b8" textAnchor="middle">Days After Application</text>
                    </svg>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      [activeCategory === 'herbicide' ? 'First Cover' : `Initial ${catConfig.primaryMetric.key}`, `${chartDataComputed.chartData[0]?.weedCover ?? '—'}%`,'bg-blue-50 text-blue-700'],
                      [activeCategory === 'herbicide' ? 'Last Cover' : `Final ${catConfig.primaryMetric.key}`, `${chartDataComputed.chartData[chartDataComputed.chartData.length-1]?.weedCover ?? '—'}%`,'bg-emerald-50 text-emerald-700'],
                      [`Final ${activeCategory === 'herbicide' ? 'WCE' : catConfig.primaryMetric.key}`, chartDataComputed.lastWce !== null ? `${chartDataComputed.lastWce}%` : '—','bg-indigo-50 text-indigo-700'],
                      ['Observations',chartDataComputed.chartData.length,'bg-slate-50 text-slate-700']
                    ].map(([l,v,cls]) => (
                      <div key={l} className={`rounded-lg p-2 text-center ${cls}`}><p className="text-xs font-bold opacity-70">{l}</p><p className="text-lg font-bold">{v}</p></div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <TrendingDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No observation data to chart</p>
                </div>
              ))}

              {/* Statistics Tab */}
              {detailTab === 'statistics' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700">Trial Statistics</h3>
                    <button onClick={calcStats} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                      <RefreshCw className="w-3.5 h-3.5" /> Calculate Statistics
                    </button>
                  </div>
                  {!statsData.hasStats ? (
                    <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
                      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No statistical data yet</p>
                      <p className="text-xs mt-1">Click Calculate Statistics to compute WCE and ANOVA from observations</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {statsData.stats?.wce && statsData.stats.wce.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2">Weed Control Efficiency — Per Observation</h4>
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-xs divide-y divide-slate-200">
                              <thead className="bg-slate-50"><tr>{['DAA','Species','Cover %','WCE %','Rating'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[10px]">{h}</th>)}</tr></thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {statsData.stats.wce.map((w, i) => (
                                  <tr key={i} className={w.controlRating === 'Baseline' ? 'bg-slate-50' : ''}>
                                    <td className="px-3 py-2 font-bold text-slate-600">{w.daa ?? 0}</td>
                                    <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-[100px]">{w.species}</td>
                                    <td className="px-3 py-2 text-slate-500">{w.finalCover}%</td>
                                    <td className={`px-3 py-2 font-bold ${w.wce === null ? 'text-slate-400' : w.wce >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{w.wce !== null ? `${w.wce.toFixed(1)}%` : '—'}</td>
                                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${w.controlRating === 'Baseline' ? 'bg-slate-200 text-slate-600' : w.controlRating === 'Excellent' ? 'bg-emerald-100 text-emerald-800' : w.controlRating === 'Good' ? 'bg-blue-100 text-blue-800' : w.controlRating === 'Fair' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{w.controlRating}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {statsData.stats?.anovaResults?.isDescriptiveOnly ? (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">Descriptive Statistics <span className="text-[10px] font-normal text-slate-400">Computed: {formatDateTime(statsData.stats.calculatedAt)}</span></h4>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                              <span className="font-semibold text-slate-500 block mb-0.5">Observations (N)</span>
                              <span className="text-sm font-bold text-slate-700">{statsData.stats.anovaResults.n}</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                              <span className="font-semibold text-slate-500 block mb-0.5">Mean Efficacy</span>
                              <span className="text-sm font-bold text-slate-700">{statsData.stats.anovaResults.mean}%</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                              <span className="font-semibold text-slate-500 block mb-0.5">Std Deviation (SD)</span>
                              <span className="text-sm font-bold text-slate-700">{statsData.stats.anovaResults.stdDev}</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                              <span className="font-semibold text-slate-500 block mb-0.5">Coeff of Var (CV)</span>
                              <span className="text-sm font-bold text-slate-700">{statsData.stats.anovaResults.cv}%</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                              <span className="font-semibold text-slate-500 block mb-0.5">Range (Min - Max)</span>
                              <span className="text-sm font-bold text-slate-700">{statsData.stats.anovaResults.min}% - {statsData.stats.anovaResults.max}%</span>
                            </div>
                          </div>
                          <div className="mt-3 p-3 bg-blue-50 text-blue-800 rounded-xl text-xs border border-blue-100">
                            ℹ️ This is a single-replicate trial. Descriptive statistics summarize trends over time (DAA timepoints). Replicated ANOVA/Tukey significance testing is only scientifically valid when grouping multiple trials at the Project level.
                          </div>
                        </div>
                      ) : statsData.stats?.anovaResults?.anovaTable && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">ANOVA Results <span className="text-[10px] font-normal text-slate-400">Computed: {formatDateTime(statsData.stats.calculatedAt)}</span></h4>
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-xs divide-y divide-slate-200">
                              <thead className="bg-slate-50"><tr>{['Source','DF','SS','MS','F','P > F','Sig'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[10px]">{h}</th>)}</tr></thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {[statsData.stats.anovaResults.anovaTable.treatment, statsData.stats.anovaResults.anovaTable.block, statsData.stats.anovaResults.anovaTable.error, statsData.stats.anovaResults.anovaTable.total].filter(Boolean).map((row, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-medium text-slate-700">{row.source}</td>
                                    <td className="px-3 py-2 text-slate-500">{row.df}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.ss) ? row.ss.toFixed(2) : ''}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.ms) ? row.ms.toFixed(2) : ''}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.f) ? row.f.toFixed(2) : '—'}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(row.p) ? row.p.toFixed(4) : '—'}</td>
                                    <td className="px-3 py-2 font-bold text-slate-700">{row.sig || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-slate-50 rounded-lg p-2 text-xs">
                              <span className="font-semibold text-slate-500 block">CV:</span>
                              <span className="font-bold text-slate-700">{Number.isFinite(statsData.stats.anovaResults.diagnostics?.cv) ? statsData.stats.anovaResults.diagnostics.cv.toFixed(2) : '—'}%</span>
                              {Number.isFinite(statsData.stats.anovaResults.diagnostics?.cv) && <span className={`ml-1 text-[10px] font-semibold ${ statsData.stats.anovaResults.diagnostics.cv <= 10 ? 'text-emerald-600' : statsData.stats.anovaResults.diagnostics.cv <= 20 ? 'text-blue-600' : statsData.stats.anovaResults.diagnostics.cv <= 30 ? 'text-amber-600' : 'text-red-600' }`}>({interpretCV(statsData.stats.anovaResults.diagnostics.cv)})</span>}
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2 text-xs">
                              <span className="font-semibold text-slate-500 block">R²:</span>
                              <span className="font-bold text-slate-700">{Number.isFinite(statsData.stats.anovaResults.diagnostics?.r_squared) ? statsData.stats.anovaResults.diagnostics.r_squared.toFixed(4) : '—'}</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2 text-xs">
                              <span className="font-semibold text-slate-500 block">Trial SEM:</span>
                              <span className="font-bold text-slate-700">{Number.isFinite(statsData.stats.anovaResults.diagnostics?.sem) ? statsData.stats.anovaResults.diagnostics.sem.toFixed(4) : '—'}</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2 text-xs">
                              <span className="font-semibold text-slate-500 block">LSD (p=0.05):</span>
                              <span className="font-bold text-slate-700">{Number.isFinite(statsData.stats.anovaResults.diagnostics?.lsd) ? statsData.stats.anovaResults.diagnostics.lsd.toFixed(4) : '—'}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {statsData.stats?.lsdResults?.groupings && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-2">Fisher's LSD Groupings</h4>
                          <p className="text-xs text-slate-400 mb-2">Alpha = {statsData.stats.lsdResults.alpha}, LSD = {Number.isFinite(statsData.stats.lsdResults.lsd) ? statsData.stats.lsdResults.lsd.toFixed(2) : '—'}</p>
                          <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-xs divide-y divide-slate-200">
                              <thead className="bg-slate-50"><tr>{['Treatment','Mean WCE','Group'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[10px]">{h}</th>)}</tr></thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {statsData.stats.lsdResults.groupings.map((g, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-medium text-slate-700">{g.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{Number.isFinite(g.mean) ? g.mean.toFixed(2) : '—'}%</td>
                                    <td className="px-3 py-2 font-bold text-blue-700">{g.grouping || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* QR Code Tab */}
              {detailTab === 'qr' && (() => {
                const liveUrl = buildPrintableTrialUrl(detailTrial);
                const fmtDate = (d) => formatDate(d);
                return (
                <div className="flex flex-col items-center gap-4 w-full">
                  {/* Mode picker */}
                  <div className="flex w-full rounded-xl overflow-hidden border border-slate-200">
                    {['offline','online'].map(m => (
                      <button key={m}
                        onClick={() => { setQrMode(m); setQrGenerated(false); }}
                        className={`flex-1 py-2 text-sm font-semibold capitalize transition-colors ${
                          qrMode === m ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}>
                        {m === 'offline' ? '📦 Offline QR' : '🌐 Online / Live QR'}
                      </button>
                    ))}
                  </div>

                  {/* Canvas */}
                  <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-sm">
                    <canvas ref={qrCanvasRef} className="block" />
                    {!qrGenerated && (
                      <div className="w-[220px] h-[220px] flex items-center justify-center text-slate-300 text-xs">
                        Click Generate to create QR
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button onClick={() => generateQR(detailTrial, qrMode)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700">
                      <QrCode className="w-4 h-4" /> Generate QR
                    </button>
                    {qrGenerated && canDownload && (
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
                      <p><span className="font-semibold text-slate-500">Trial ID:</span> <span className="font-mono">{detailTrial?.ID}</span></p>
                      <p><span className="font-semibold text-slate-500">Product:</span> {detailTrial?.FormulationName}</p>
                      <p><span className="font-semibold text-slate-500">Date:</span> {fmtDate(detailTrial?.Date)}</p>
                      <p><span className="font-semibold text-slate-500">Dosage:</span> {detailTrial?.Dosage || '—'}</p>
                      <p><span className="font-semibold text-slate-500">Location:</span> {detailTrial?.Location || '—'}</p>
                      <p><span className="font-semibold text-slate-500">{catConfig.targetLabel}:</span> {detailTrial?.[catConfig.targetField] || detailTrial?.WeedSpecies || '—'}</p>
                      <p><span className="font-semibold text-slate-500">Replication:</span> {detailTrial?.Replication || '—'}</p>
                      <p className="mt-2 text-slate-400">Works without internet. Scan with Plot Scanner to open this trial.</p>
                    </div>
                  ) : (() => {
                    const LIVE_FIELDS = [
                      { key: 'showFormulationName', label: 'Product Name' },
                      { key: 'showInvestigator', label: 'Investigator' },
                      { key: 'showDate', label: 'Application Date' },
                      { key: 'showDosage', label: 'Dosage' },
                      { key: 'showLocation', label: 'Location' },
                      { key: 'showWeedSpecies', label: `Target ${activeCategory === 'herbicide' ? 'Weeds' : catConfig.targetLabel}s` },
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
                    const rawLiveSettings = safeJsonParse(detailTrial?.LiveQRSettings, {});
                    const liveSettings = {
                      ...globalOnlineDefaults,
                      ...rawLiveSettings,
                      ...(Object.prototype.hasOwnProperty.call(rawLiveSettings, 'showInvestigatorName')
                        ? { showInvestigator: rawLiveSettings.showInvestigatorName }
                        : {}),
                    };

                    const handleToggleLiveField = async (fieldKey) => {
                      const updated = { ...liveSettings, [fieldKey]: !liveSettings[fieldKey] };
                      const updatedTrial = { ...detailTrial, LiveQRSettings: JSON.stringify(updated) };
                      // Optimistic UI update
                      updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
                      setActiveTrial(updatedTrial);
                      try {
                        await updateTrial({ ID: updatedTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings }, getAppState);
                        await syncTrialToQrScript({ ID: updatedTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings });
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
                                    liveSettings[key] ? 'bg-emerald-500' : 'bg-slate-300'
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

              {/* AI Summary Tab */}
              {detailTab === 'ai' && (() => {
                const savedAi = safeJsonParse(detailTrial?.AISummariesJSON, {});
                const currentObsCount = validateEfficacyData(safeJsonParse(detailTrial?.EfficacyDataJSON, []), detailTrial?.Category || activeCategory).length;
                const isStale = savedAi.narrative && savedAi.narrativeObsCount != null && currentObsCount > savedAi.narrativeObsCount;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-700 flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-violet-500" /> AI Trial Narrative</h3>
                      <button onClick={generateAiSummary} disabled={aiLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                        {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {aiLoading ? 'Generating...' : (savedAi.narrative ? 'Regenerate' : 'Generate Summary')}
                      </button>
                    </div>
                    {isStale && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-800">
                        <span className="mt-0.5">⚠</span>
                        <span><strong>{currentObsCount - (savedAi.narrativeObsCount ?? 0)} new observation{currentObsCount - (savedAi.narrativeObsCount ?? 0) !== 1 ? 's' : ''} added</strong> since this narrative was generated. Click <strong>Regenerate</strong> to update before exporting.</span>
                      </div>
                    )}
                    {savedAi.anomalies && savedAi.anomalies.trim() !== '' && savedAi.anomalies.toLowerCase().trim() !== 'none' && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800">
                        <span className="mt-0.5">⚠</span>
                        <div>
                          <strong className="block mb-1">Detected Observation Anomalies (Excluded from Official Report):</strong>
                          <span className="whitespace-pre-wrap">{savedAi.anomalies}</span>
                        </div>
                      </div>
                    )}
                    {aiSummary ? (
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {aiSummary}
                        {savedAi.narrativeGeneratedAt && (
                          <p className="mt-3 pt-2 border-t border-violet-200 text-[11px] text-violet-400">
                            Generated {new Date(savedAi.narrativeGeneratedAt).toLocaleString()} · based on {savedAi.narrativeObsCount} observation{savedAi.narrativeObsCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-xl">
                        <BrainCircuit className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No AI summary yet</p>
                        <p className="text-xs mt-1">Click Generate Summary to create an AI narrative for this trial</p>
                        {!state.settings?.apiKeys?.[0] && (
                          <p className="text-xs mt-2 text-amber-500 font-medium">⚠ Add a Gemini API key in Settings first</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Export Tab */}
              {detailTab === 'export' && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2"><FileDown className="w-4 h-4 text-slate-500" /> Export Options</h3>

                  {/* ── PDF REPORTS ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">PDF Reports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportPdf(detailTrial))} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">PDF (Ingredients)</p><p className="text-[10px] text-slate-500">With formulation ingredients</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportPdfNoIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-500 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">PDF (No Ing.)</p><p className="text-[10px] text-slate-500">Without ingredients list</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportPdfWeedsIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-rose-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">{activeCategory === 'herbicide' ? 'PDF (Weeds + Ing.)' : `PDF (${catConfig.targetLabel}s + Ing.)`}</p><p className="text-[10px] text-slate-500">{activeCategory === 'herbicide' ? 'Weed ID + ingredients' : `${catConfig.targetLabel} ID + ingredients`}</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportPdfWeeds(detailTrial))} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-rose-500 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">{activeCategory === 'herbicide' ? 'PDF (Weeds)' : `PDF (${catConfig.targetLabel}s)`}</p><p className="text-[10px] text-slate-500">{activeCategory === 'herbicide' ? 'Weed ID section only' : `${catConfig.targetLabel} ID section only`}</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportFullNoIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-700 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Full Report (No Ing.)</p><p className="text-[10px] text-slate-500">Full + timeline, no ingredients</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportFullIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition">
                      <FileDown className="w-4 h-4 text-red-800 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Full Report (w/ Ing.)</p><p className="text-[10px] text-slate-500">Full + timeline + ingredients</p></div>
                    </button>
                  </div>

                  {/* ── SCIENTIFIC PDF ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Scientific PDF</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportSciPdf(detailTrial))} className="flex items-center gap-2 p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 text-left transition">
                      <ScanLine className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Scientific Report (No Ing.)</p><p className="text-[10px] text-slate-500">AI narrative, ANOVA, WCE</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportSciPdfIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 text-left transition">
                      <ScanLine className="w-4 h-4 text-indigo-700 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Scientific Report (w/ Ing.)</p><p className="text-[10px] text-slate-500">AI + ANOVA + ingredients</p></div>
                    </button>
                  </div>

                  {/* ── WORD DOC ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Word Document (.docx)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportDocNoIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 text-left transition">
                      <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">DOC (No Ing.)</p><p className="text-[10px] text-slate-500">Word doc, no ingredients</p></div>
                    </button>
                    <button onClick={() => triggerExportWithCustomisation(() => handleExportDocIng(detailTrial))} className="flex items-center gap-2 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 text-left transition">
                      <FileText className="w-4 h-4 text-sky-700 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">DOC (w/ Ing.)</p><p className="text-[10px] text-slate-500">Word doc with ingredients</p></div>
                    </button>
                  </div>

                  {/* ── ADVANCED REPORT ── */}
                  {activeCategory !== 'herbicide' && (
                    <div className="mb-3">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1 mb-2">Advanced Reports</p>
                      <button onClick={() => triggerExportWithCustomisation(() => handleExportAdvancedExcel(detailTrial))} className="w-full flex items-center gap-2 p-2.5 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 text-left transition">
                        <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
                        <div><p className="text-xs font-semibold text-slate-800 font-bold">Export Advanced Excel (11-Sheet)</p><p className="text-[10px] text-slate-500">TOK2322C standard workbook with formulas, ANOVA, charts, weather, photos</p></div>
                      </button>
                    </div>
                  )}

                  {/* ── PRESENTATION ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Presentation</p>
                  <button onClick={() => triggerExportWithCustomisation(() => handleExportPpt(detailTrial))} className="w-full flex items-center gap-2 p-2.5 bg-orange-50 hover:bg-orange-100 rounded-xl border border-orange-200 text-left transition">
                    <MonitorPlay className="w-4 h-4 text-orange-600 shrink-0" />
                    <div><p className="text-xs font-semibold text-slate-800">Export PPT (.pptx)</p><p className="text-[10px] text-slate-500">Slide deck: title, details, WCE table, timeline, photos, conclusion</p></div>
                  </button>

                  {/* ── FIELD REPORTS ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Field Reports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => exportHtmlSlide(detailTrial)} className="flex items-center gap-2 p-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 text-left transition">
                      <Archive className="w-4 h-4 text-blue-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">HTML Report</p><p className="text-[10px] text-slate-500">Printable standalone page</p></div>
                    </button>
                    <button onClick={() => exportTxtReport(detailTrial)} className="flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border text-left transition">
                      <FileCode className="w-4 h-4 text-slate-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Field Report (.txt)</p><p className="text-[10px] text-slate-500">Plain text, all details</p></div>
                    </button>
                  </div>

                  {/* ── DATA EXPORTS ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Data Exports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => exportCsv(detailTrial)} className="flex items-center gap-2 p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 text-left transition">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Observations CSV</p><p className="text-[10px] text-slate-500">All observations + species</p></div>
                    </button>
                    <button onClick={() => exportJson(detailTrial)} className="flex items-center gap-2 p-2.5 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200 text-left transition">
                      <FileDown className="w-4 h-4 text-violet-600 shrink-0" />
                      <div><p className="text-xs font-semibold text-slate-800">Raw JSON</p><p className="text-[10px] text-slate-500">Full trial record</p></div>
                    </button>
                  </div>

                  {/* ── SHARE ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Share</p>
                  <button onClick={() => shareTrial(detailTrial)} className="w-full flex items-center gap-2 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl border border-sky-200 text-left transition">
                    <Share2 className="w-4 h-4 text-sky-600 shrink-0" />
                    <div><p className="text-xs font-semibold text-slate-800">Share / Copy Summary</p><p className="text-[10px] text-slate-500">Copy to clipboard or share via device</p></div>
                  </button>

                  {/* ── AI ── */}
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">AI Analysis</p>
                  <button onClick={() => handleAiSingleGenerate(detailTrial)} disabled={aiGenRunning} className="w-full flex items-center gap-2 p-2.5 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200 text-left transition disabled:opacity-50">
                    <div className="shrink-0">{aiGenRunning ? <RefreshCw className="w-4 h-4 text-violet-600 animate-spin" /> : <BrainCircuit className="w-4 h-4 text-violet-600" />}</div>
                    <div><p className="text-xs font-semibold text-slate-800">{aiGenRunning ? 'Generating...' : 'Generate AI Efficacy Report'}</p><p className="text-[10px] text-slate-500">Saves to AI Summary tab</p></div>
                  </button>

                  {/* ── BULK ── */}
                  <hr className="border-slate-200 my-1" />
                  <button onClick={exportAllCsv} className="w-full flex items-center gap-2 p-2.5 bg-white hover:bg-slate-50 rounded-xl border text-left transition">
                    <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0" />
                    <div><p className="text-xs font-semibold text-slate-800">Export ALL Trials (CSV)</p><p className="text-[10px] text-slate-500">{trials.length} trials — full summary</p></div>
                  </button>
                </div>
              )}

              {/* Harvest & Yield Tab */}
              {detailTab === 'harvest' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Harvest & Final Yield Log</h4>
                      <p className="text-xs text-slate-500">Record final physical harvest yields, weights, and photos.</p>
                    </div>
                    {detailTrial.EfficacyDataJSON && safeJsonParse(detailTrial.EfficacyDataJSON, []).some(o => o.fruitCount || o.marketableYield || o.unmarketableYield) && (
                      <button
                        onClick={() => {
                          const obs = safeJsonParse(detailTrial.EfficacyDataJSON, []);
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
                          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Prefilled from AI observation averages!', type: 'success' } }));
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
                  {!isViewer && !detailIsCompleted && (
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
                        disabled={isViewer || detailIsCompleted}
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
                        disabled={isViewer || detailIsCompleted}
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
                        disabled={isViewer || detailIsCompleted}
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
                        disabled={isViewer || detailIsCompleted}
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
                      disabled={isViewer || detailIsCompleted}
                      className="w-full border rounded-xl px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    ></textarea>
                  </div>

                  {/* Harvest Photo Gallery */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Harvest Photos ({(harvestForm.photos || []).length})</label>
                      {!isViewer && !detailIsCompleted && (
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
                              {!isViewer && !detailIsCompleted && (
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
                  {!isViewer && !detailIsCompleted && (
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = {
                          ...detailTrial,
                          HarvestDataJSON: JSON.stringify(harvestForm)
                        };
                        updateState({ trials: trials.map(t => t.ID === updated.ID ? updated : t) });
                        setActiveTrial(updated);
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

              {/* Weather Tab */}
              {detailTab === 'weather' && (() => {
                const risks = getClimateRisks(detailTrial.Temperature, detailTrial.Windspeed, detailTrial.Rain);
                const hasWeather = detailTrial.Temperature || detailTrial.Humidity || detailTrial.Windspeed || detailTrial.Rain;
                return (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-700">Weather at Application</h3>
                    {hasWeather ? (
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          ['Temperature', detailTrial.Temperature, '°C', Thermometer, 'text-orange-500'],
                          ['Humidity', detailTrial.Humidity, '%', Droplets, 'text-blue-500'],
                          ['Wind Speed', detailTrial.Windspeed, 'km/h', Wind, 'text-sky-500'],
                          ['Rainfall', detailTrial.Rain, 'mm', CloudRain, 'text-indigo-500'],
                        ].map(([label, val, unit, Icon, iconCls]) => (
                          <div key={label} className="bg-slate-50 rounded-xl p-4 flex items-center gap-3">
                            <div className={`p-2.5 bg-white rounded-lg shadow-sm ${iconCls}`}><Icon className="w-5 h-5" /></div>
                            <div>
                              <p className="text-xs text-slate-500 font-semibold">{label}</p>
                              <p className="text-xl font-bold text-slate-800">{val ? `${val}${unit}` : '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <CloudRain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No weather data recorded</p>
                        <p className="text-xs mt-1">Edit the trial to add weather conditions</p>
                      </div>
                    )}

                    {/* Climate Risk Audit */}
                    <div className="border rounded-xl p-4 bg-slate-50">
                      <p className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-amber-500" /> Climate Risk Audit
                      </p>
                      {risks.length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                          <span className="text-lg">&#10003;</span> No climate risk factors detected for this application.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {risks.map((risk, ri) => (
                            <div key={ri} className={`text-xs px-3 py-2 rounded-lg font-medium ${
                              risk.type === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' :
                              risk.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {risk.type === 'danger' ? '⚠️' : risk.type === 'warning' ? '⚠️' : 'ℹ️'} {risk.msg}
                            </div>
                          ))}
                        </div>
                      )}
                      {!hasWeather && (
                        <p className="text-[10px] text-slate-400 mt-2">Add application weather data to enable risk analysis.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── AI BATCH ANALYSIS MODAL ── */}
      {aiBatchModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">AI Photo Analysis</h3>
                <p className="text-xs text-slate-500">Automatically scan all trial photos</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-slate-700 mb-2">This will analyze all photos using AI vision models:</p>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                {activeCategory === 'herbicide' ? (
                  <>
                    <li>Identify weed species and cover %</li>
                    <li>Track burndown vs unaffected weeds</li>
                  </>
                ) : (
                  (catConfig.aiFeatures || []).map((feature, idx) => (
                    <li key={idx}>{feature}</li>
                  ))
                )}
                <li>Auto-create observation entries</li>
                <li>Calculates DAA from photo timestamps</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> Requires API keys (Gemini, Groq, etc.) configured in Settings. Analysis runs with 4-second delays between photos to respect rate limits.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setAiBatchModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button onClick={() => handleAnalyzeAllPhotos()} className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 shadow-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Start AI Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI BATCH PROGRESS WIDGET ── */}
      {aiBatchRunning && (
        <div className="fixed top-4 right-4 bg-white shadow-xl rounded-xl p-4 z-50 min-w-[260px] border border-purple-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
            <span className="font-bold text-slate-800 text-sm">AI Analysis</span>
            <button onClick={() => setAiBatchRunning(false)} className="ml-auto text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
          </div>
          <div className="text-xs text-slate-600 mb-2">{aiBatchProgress.message}</div>
          <div className="w-full bg-slate-200 rounded-full h-2 mb-1">
            <div
              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${aiBatchProgress.total > 0 ? (aiBatchProgress.current / aiBatchProgress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 text-right">{aiBatchProgress.current} / {aiBatchProgress.total}</div>
        </div>
      )}

      {/* ── APPLICATION LOG MODAL ── */}
      <Modal isOpen={isAppModalOpen} onClose={() => setIsAppModalOpen(false)} title={editingAppIdx !== null ? 'Edit Application Entry' : 'Log Application'}>
        <form onSubmit={handleSaveApp} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Code/Name *</label>
              <input
                type="text"
                required
                value={appForm.code}
                onChange={e => setAppForm({ ...appForm, code: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="e.g. App A"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date & Time *</label>
              <input
                type="datetime-local"
                required
                value={appForm.date}
                onChange={e => setAppForm({ ...appForm, date: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Dosage / Rate</label>
              <input
                type="text"
                value={appForm.dosage}
                onChange={e => setAppForm({ ...appForm, dosage: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="e.g. 100 mL/ha"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Method</label>
              <select
                value={appForm.method}
                onChange={e => setAppForm({ ...appForm, method: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              >
                <option value="Foliar Spray">Foliar Spray</option>
                <option value="Soil Drench">Soil Drench</option>
                <option value="Broadcast">Broadcast</option>
                <option value="Seed Treatment">Seed Treatment</option>
                <option value="Direct Injection">Direct Injection</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Crop Growth Stage (BBCH)</label>
              <input
                type="text"
                value={appForm.cropStage}
                onChange={e => setAppForm({ ...appForm, cropStage: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="e.g. BBCH 12"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Target / Weed Growth Stage</label>
              <input
                type="text"
                value={appForm.targetStage}
                onChange={e => setAppForm({ ...appForm, targetStage: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="e.g. 10 cm height"
              />
            </div>
          </div>

          {/* Tank Mix & Adjuvant */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Adjuvant</label>
              <input
                type="text"
                value={appForm.adjuvant}
                onChange={e => setAppForm({ ...appForm, adjuvant: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="e.g. Silwet 0.05%, Hasten 0.5 L/ha"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tank Mix Partners</label>
              <input
                type="text"
                value={appForm.tankMix}
                onChange={e => setAppForm({ ...appForm, tankMix: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                placeholder="e.g. Glyphosate 360g + 2,4-D 500g"
              />
            </div>
          </div>

          {/* Weather Details Box */}
          <div className="border rounded-xl p-3 bg-slate-50 space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-xs font-bold text-slate-700 uppercase">Weather Conditions at Application</span>              <button
                type="button"
                onClick={handleFetchAppWeather}
                disabled={isFetchingAppWeather}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 disabled:opacity-50"
              >
                {isFetchingAppWeather ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                  </>
                ) : (
                  <>
                    <MapPin className="w-3 h-3" /> Auto-fetch weather
                  </>
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={appForm.temp}
                  onChange={e => setAppForm({ ...appForm, temp: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded-lg bg-white"
                  placeholder="25"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Humidity (%)</label>
                <input
                  type="number"
                  value={appForm.humidity}
                  onChange={e => setAppForm({ ...appForm, humidity: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded-lg bg-white"
                  placeholder="60"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Wind (km/h)</label>
                <input
                  type="number"
                  step="0.1"
                  value={appForm.windspeed}
                  onChange={e => setAppForm({ ...appForm, windspeed: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded-lg bg-white"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Rain within 2h?</label>
                <select
                  value={appForm.rain}
                  onChange={e => setAppForm({ ...appForm, rain: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded-lg bg-white"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Application Notes / Details</label>
            <textarea
              rows="3"
              value={appForm.notes}
              onChange={e => setAppForm({ ...appForm, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              placeholder="Record any specific details such as nozzle type, pressure, soil moisture, etc."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t">
            <button
              type="button"
              onClick={() => setIsAppModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition"
            >
              Save Application Entry
            </button>
          </div>
        </form>
      </Modal>
      {/* ── PHOTO AI DATA DETAILS DIAGNOSTICS MODAL ── */}
      <Modal
        isOpen={!!selectedPhotoForDetails}
        onClose={() => setSelectedPhotoForDetails(null)}
        title="Photo AI Diagnostics"
        maxWidth="max-w-3xl"
      >
        {selectedPhotoForDetails && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Photo Image Card */}
              <div className="w-full md:w-1/3">
                <img
                  src={
                    (selectedPhotoForDetails.fileData || selectedPhotoForDetails.url || '').includes('drive.google.com') &&
                    (selectedPhotoForDetails.fileData || selectedPhotoForDetails.url || '').match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/)
                      ? `https://drive.google.com/thumbnail?id=${(selectedPhotoForDetails.fileData || selectedPhotoForDetails.url || '').match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/)[1]}&sz=w600`
                      : (selectedPhotoForDetails.fileData || selectedPhotoForDetails.url || '')
                  }
                  alt={selectedPhotoForDetails.label || 'AI Diagnostics'}
                  className="w-full aspect-square object-cover rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
                  onError={e => { e.target.onerror = null; e.target.src = selectedPhotoForDetails.fileData || selectedPhotoForDetails.url; }}
                />
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p><span className="font-semibold text-slate-600">Label:</span> {selectedPhotoForDetails.label || 'N/A'}</p>
                  <p><span className="font-semibold text-slate-600">Date Taken:</span> {formatPhotoDate(selectedPhotoForDetails.date)}</p>
                  {selectedPhotoForDetails.tag && (
                    <p><span className="font-semibold text-slate-600">View Tag:</span> <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-extrabold uppercase">{selectedPhotoForDetails.tag}</span></p>
                  )}
                </div>
              </div>

              {/* AI Analysis Details */}
              <div className="flex-grow space-y-4">
                {/* Confidence Badge */}
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-base font-bold text-slate-800">AI Assessment</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Confidence:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold shadow-sm ${
                      (selectedPhotoForDetails.aiData?.confidence || '').toUpperCase() === 'HIGH' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                      (selectedPhotoForDetails.aiData?.confidence || '').toUpperCase() === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}>
                      {selectedPhotoForDetails.aiData?.confidence || 'MEDIUM'}
                    </span>
                  </div>
                </div>

                {/* Overall Assessment */}
                {selectedPhotoForDetails.aiData?.overallAssessment && (
                  <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3.5 text-slate-700 text-sm italic">
                    {selectedPhotoForDetails.aiData.overallAssessment}
                  </div>
                )}

                {/* Estimated Metrics Checklist */}
                {selectedPhotoForDetails.aiData?.metrics && Object.keys(selectedPhotoForDetails.aiData.metrics).length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Estimated Field Parameters</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selectedPhotoForDetails.aiData.metrics).map(([key, value]) => {
                        const fieldDef = catConfig.observationFields?.find(f => f.key === key);
                        const label = fieldDef?.label || key;
                        const displayValue = value === null || value === undefined ? 'N/A' : value;
                        return (
                          <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-xs text-slate-600 font-medium">{label}</span>
                            <span className="text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded shadow-sm border">{displayValue}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detected Targets Table */}
                {(() => {
                  const targets = selectedPhotoForDetails.aiData?.targets || selectedPhotoForDetails.aiData?.weeds || [];
                  if (targets.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {activeCategory === 'herbicide' ? 'Detected Weed Species' : `Detected ${catConfig.targetLabel || 'Parameters'}`}
                      </h4>
                      <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-slate-100 text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Name / Parameter</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Value / Pct</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Status</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Confidence</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Observation Notes</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {targets.map((t, tIdx) => {
                              const name = t.name || t.species || 'Unknown';
                              const value = t.value != null ? t.value : (t.cover != null ? t.cover : '-');
                              const rawStatus = t.status || 'Healthy';
                              const status = rawStatus === 'Unaffected' && activeCategory !== 'herbicide' ? 'Healthy' : rawStatus;
                              const confidenceVal = t.confidence !== undefined && t.confidence !== null ? `${t.confidence}%` : '—';
                              const notes = t.notes || '';
                              return (
                                <tr key={tIdx}>
                                  <td className="px-3 py-2 font-medium text-slate-800">{name}</td>
                                  <td className="px-3 py-2 text-slate-600 font-bold">{value}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLS[status] || 'bg-slate-100 text-slate-600 border'}`}>
                                      {status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 font-semibold">{confidenceVal}</td>
                                  <td className="px-3 py-2 text-slate-500">{notes}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* Additional Notes */}
                {selectedPhotoForDetails.aiData?.notes && (
                  <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <span className="font-bold text-slate-600 uppercase block mb-1">Observation Notes:</span>
                    {selectedPhotoForDetails.aiData.notes}
                  </div>
                )}
              </div>
            </div>
            
            <div className="pt-4 flex justify-end gap-3 border-t">
              <button
                type="button"
                onClick={() => setSelectedPhotoForDetails(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── OBSERVATION MODAL ── */}
      <Modal isOpen={isObsModalOpen} onClose={() => setIsObsModalOpen(false)} title={editingObsIdx !== null ? 'Edit Observation' : 'Log Observation'}>
        <form onSubmit={handleSaveObs} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {/* DAA + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Days After App (DAA)</label>
              <input
                type="number"
                required
                min="0"
                value={obsForm.daa}
                onChange={e => {
                  const val = e.target.value;
                  let newDate = obsForm.date;
                  if (val !== '' && activeTrial?.Date) {
                    const parsed = toDateKey(activeTrial.Date);
                    if (parsed) {
                      const [y, m, d] = parsed.split('-').map(Number);
                      const baseDate = new Date(Date.UTC(y, m - 1, d));
                      baseDate.setUTCDate(baseDate.getUTCDate() + parseInt(val, 10));
                      const ry = baseDate.getUTCFullYear();
                      const rm = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
                      const rd = String(baseDate.getUTCDate()).padStart(2, '0');
                      newDate = `${ry}-${rm}-${rd}`;
                    }
                  }
                  setObsForm({ ...obsForm, daa: val, date: newDate });
                }}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label>
              <input
                type="datetime-local"
                required
                value={toDatetimeLocal(obsForm.date)}
                onChange={e => {
                  const val = e.target.value;
                  const computedDaa = activeTrial?.Date ? calculateDAA(val, activeTrial.Date) : obsForm.daa;
                  setObsForm({ ...obsForm, date: val, daa: computedDaa });
                }}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          {/* AI Auto-fill from Photo for Non-Herbicide Categories */}
          {activeCategory !== 'herbicide' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">✨ AI Observation Automation</span>
              <input 
                type="file" 
                accept="image/*" 
                id="ai-autofill-upload" 
                className="hidden" 
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = async ev => {
                    const dataUrl = ev.target.result;
                    setAiGenRunning(dataUrl || true);
                    try {
                      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Uploading photo & running AI...', type: 'info' } }));
                      
                      const trialDate = activeTrial?.Date ? new Date(activeTrial.Date) : new Date();
                      const pDate = obsForm.date ? new Date(obsForm.date) : new Date();
                      const daa = Math.max(0, Math.round((pDate.getTime() - trialDate.getTime()) / (1000 * 60 * 60 * 24)));
                      const photoDate = formatPhotoDate(pDate.toISOString());
                      
                      // 1. Upload photo to Google Drive (so it goes to trial's photos)
                      const fileName = `photo_${activeTrial.ID}_${Date.now()}.jpg`;
                      const project = activeTrial.ProjectID
                        ? (state.projects || []).find(p => p.ID === activeTrial.ProjectID)
                        : null;
                      const projectName = project ? project.Name : 'Ungrouped Projects';
                      const dosageSuffix = activeTrial.Dosage ? ` (${activeTrial.Dosage})` : '';
                      const idSuffix = activeTrial.ID ? ` - ${String(activeTrial.ID).slice(-5)}` : '';
                      const trialNameWithDate = `${activeTrial.FormulationName || 'Unknown Formulation'}${dosageSuffix} (${activeTrial.Date ? activeTrial.Date.split('T')[0] : photoDate})${idSuffix}`.trim();
                      
                      const rawCategory = activeTrial.Category || project?.Category || state?.activeCategory || 'herbicide';
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
                        activeTrial.InvestigatorName || 
                        'Default User'
                      ).trim() || 'Default User';

                      const folderPath = [categoryName, userName, projectName, trialNameWithDate];

                      let driveUrl = null;
                      if (navigator.onLine && getAppState().isOnline !== false) {
                        const uploadResult = await uploadPhoto({
                          trialId: activeTrial.ID,
                          fileData: dataUrl,
                          mimeType: 'image/jpeg',
                          fileName,
                          isWeed: false,
                          label: 'Field Observation',
                          date: photoDate,
                          folderPath,
                        }, getAppState);
                        driveUrl = uploadResult?.url || uploadResult?.fileUrl || null;
                      }

                      // Update the trial's PhotoURLs list
                      const currentPhotos = safeJsonParse(activeTrial.PhotoURLs, []);
                      const finalEntry = driveUrl
                        ? { url: driveUrl, date: photoDate, label: 'Field Observation', tag: 'Whole Canopy', identifications: [] }
                        : { fileData: dataUrl, date: photoDate, label: 'Field Observation', tag: 'Whole Canopy', identifications: [] };
                      currentPhotos.push(finalEntry);
                      
                      const updatedTrial = { ...activeTrial, PhotoURLs: JSON.stringify(currentPhotos) };
                      updateState({ trials: getAppState().trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
                      if (activeTrial?.ID === updatedTrial.ID) setActiveTrial(updatedTrial);
                      await updateTrial({ ID: updatedTrial.ID, PhotoURLs: updatedTrial.PhotoURLs }, getAppState);

                      // 2. Run AI analysis
                      const result = await analyzePhoto(dataUrl, {
                        category: activeTrial?.Category || activeCategory, // Ensure category context for AI analysis
                        treatment: activeTrial?.FormulationName,
                        daa: obsForm.daa || daa,
                        rep: activeTrial?.Replication || 1,
                        category: activeCategory
                      });
                      
                      if (result.success && result.data) {
                        const aiData = result.data;
                        const updatedObs = { ...obsForm, photoUrl: driveUrl || dataUrl };
                        
                        // Populate metrics
                        if (aiData.metrics && typeof aiData.metrics === 'object') {
                          Object.entries(aiData.metrics).forEach(([k, v]) => {
                            const num = parseFloat(v);
                            if (!isNaN(num)) {
                              updatedObs[k] = num;
                            }
                          });
                        }
                        
                        // Populate rootToShootRatio if applicable
                        if (updatedObs.rootBiomass && updatedObs.shootBiomass) {
                          const rb = parseFloat(updatedObs.rootBiomass);
                          const sb = parseFloat(updatedObs.shootBiomass);
                          if (sb > 0) updatedObs.rootToShootRatio = parseFloat((rb / sb).toFixed(3));
                        }
                        
                        // Populate notes and targets
                        const aiNotes = [];
                        if (aiData.overallAssessment) aiNotes.push(aiData.overallAssessment);
                        if (aiData.notes) aiNotes.push(aiData.notes);
                        updatedObs.notes = aiNotes.join(' | ') || updatedObs.notes;
                        
                        if (aiData.targets && Array.isArray(aiData.targets)) {
                          updatedObs.weedDetails = aiData.targets.map(t => ({
                            species: t.name || t.species || 'Unknown',
                            cover: typeof t.value === 'number' ? t.value : parseFloat(t.value || t.cover || 0),
                            status: t.status || '',
                            notes: t.notes || ''
                          }));
                        }
                        
                        setObsForm(updatedObs);
                        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Photo saved & AI analysis populated!', type: 'success' } }));
                      } else {
                        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI failed to analyze photo: ' + (result.error || 'unknown error'), type: 'error' } }));
                      }
                    } catch (err) {
                      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'AI analysis failed: ' + err.message, type: 'error' } }));
                    } finally {
                      setAiGenRunning(false);
                    }
                  };
                  reader.readAsDataURL(f);
                  e.target.value = '';
                }} 
              />
              <button 
                type="button" 
                onClick={() => document.getElementById('ai-autofill-upload')?.click()}
                disabled={aiGenRunning}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 font-semibold shadow-sm disabled:opacity-50"
              >
                {aiGenRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5" />}
                {aiGenRunning ? 'Analyzing Photo...' : 'Scan Photo to Auto-Fill All Fields'}
              </button>
              <p className="text-[10px] text-slate-500 text-center px-4">Upload a plot photo to let AI automatically measure disease severity, pest counts, chlorophyll index, leaf counts, or vigor ratings, and break down species.</p>
            </div>
          )}

          {/* Dynamic Observation Fields */}
          <div className="grid grid-cols-1 gap-4">
            {catConfig.observationFields?.map(field => {
              if (field.key === 'weedDetails') return null;
              const isPrimary = field.key === getPrimaryObservationField(activeCategory);
              return (
                <div key={field.key} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">{field.label}</label>
                    {isPrimary && (
                      <div className="flex items-center gap-2">
                        <input ref={obsPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = async ev => {
                            const result = await detectWeedCoverAI(ev.target.result);
                            if (result?.cover !== undefined) setObsForm(prev => ({ ...prev, [field.key]: result.cover }));
                          };
                          reader.readAsDataURL(f);
                          e.target.value = '';
                        }} />
                        <button type="button" onClick={() => obsPhotoRef.current?.click()}
                          disabled={detectingCover}
                          className="flex items-center gap-1 text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 font-semibold disabled:opacity-50">
                          {detectingCover ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ScanLine className="w-3 h-3" />}
                          {detectingCover ? `Detect from Photo` : `Detect from Photo`}
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={field.min !== undefined ? field.min : undefined}
                    max={field.max !== undefined ? field.max : undefined}
                    step="0.1"
                    value={obsForm[field.key] ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      setObsForm(prev => {
                        const next = { ...prev, [field.key]: val };
                        // Real-time calculation of Root-to-Shoot Ratio
                        if (field.key === 'rootBiomass' || field.key === 'shootBiomass') {
                          const rb = parseFloat(next.rootBiomass);
                          const sb = parseFloat(next.shootBiomass);
                          if (!isNaN(rb) && !isNaN(sb) && sb > 0) {
                            next.rootToShootRatio = parseFloat((rb / sb).toFixed(3));
                          }
                        }
                        return next;
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  {isPrimary && coverDetectResult && (
                    <div className="mt-1.5 flex items-center gap-3 text-xs bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                      <span className="text-violet-700 font-semibold">Detected: {coverDetectResult.cover}%</span>
                      <span className="text-slate-500">🟢 {coverDetectResult.greenPct}% green · 🟡 {coverDetectResult.brownPct}% brown</span>
                      <span className="text-slate-400">via {coverDetectResult.source}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Per-species weed details */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1"><Leaf className="w-3.5 h-3.5" />{activeCategory === 'herbicide' ? 'Weed Species Breakdown' : `${catConfig.targetLabel} Breakdown`}</label>
              <button type="button" onClick={() => setObsForm(prev => ({ ...prev, weedDetails: [...prev.weedDetails, { species: '', cover: '', status: '', notes: '' }] }))}
                className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-semibold hover:bg-emerald-100 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add {activeCategory === 'herbicide' ? 'Species' : catConfig.targetLabel}
              </button>
            </div>
            {obsForm.weedDetails.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No {activeCategory === 'herbicide' ? 'species' : catConfig.targetLabel.toLowerCase()} added — total {activeCategory === 'herbicide' ? 'cover' : catConfig.primaryMetric.label.toLowerCase()} only will be saved.</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {obsForm.weedDetails.map((wd, wi) => (
                  <div key={wi} className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 rounded-lg p-2">
                    <input value={wd.species} onChange={e => { const d=[...obsForm.weedDetails]; d[wi]={...d[wi],species:e.target.value}; setObsForm(p=>({...p,weedDetails:d})); }}
                      placeholder={activeCategory === 'herbicide' ? 'Species name' : `${catConfig.targetLabel} name`} className="col-span-5 px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <input type="number" min="0" max="100" value={wd.cover} onChange={e => { const d=[...obsForm.weedDetails]; d[wi]={...d[wi],cover:e.target.value}; setObsForm(p=>({...p,weedDetails:d})); }}
                      placeholder="%" className="col-span-2 px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <select value={wd.status} onChange={e => { const d=[...obsForm.weedDetails]; d[wi]={...d[wi],status:e.target.value}; setObsForm(p=>({...p,weedDetails:d})); }}
                      className="col-span-3 px-1 py-1.5 text-xs border rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                      <option value="">Status</option>
                      {(activeCategory === 'herbicide' 
                        ? ['Controlled','Burndown','Re-emerged','Resistant','Unaffected','Emerged','Not detected','Suppressed','Top-kill','Regrowth','Eliminated']
                        : ['Healthy','Symptomatic','Deficient','Stressed','Vigorous','Recovered','Not detected']
                      ).map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => { const d=[...obsForm.weedDetails]; d.splice(wi,1); setObsForm(p=>({...p,weedDetails:d})); }}
                      className="col-span-2 flex justify-center text-slate-400 hover:text-red-500 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weather conditions at observation */}
          <div className="border rounded-xl p-3 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1"><CloudRain className="w-3.5 h-3.5 text-blue-500" />Weather at Observation</p>
              {activeTrial?.Lat && activeTrial?.Lon && (
                <button type="button" onClick={() => fetchObsWeather(obsForm.date)}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-semibold hover:bg-blue-200 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Auto-fetch
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Temp (°C)</label>
                <input type="number" step="0.1" value={obsForm.weatherTemp} onChange={e => setObsForm(p=>({...p,weatherTemp:e.target.value}))} placeholder="e.g. 24" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Humidity (%)</label>
                <input type="number" min="0" max="100" value={obsForm.weatherHumidity} onChange={e => setObsForm(p=>({...p,weatherHumidity:e.target.value}))} placeholder="e.g. 65" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Wind (km/h)</label>
                <input type="number" min="0" step="0.1" value={obsForm.weatherWind} onChange={e => setObsForm(p=>({...p,weatherWind:e.target.value}))} placeholder="e.g. 8" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Rain (mm)</label>
                <input type="number" min="0" step="0.1" value={obsForm.weatherRain} onChange={e => setObsForm(p=>({...p,weatherRain:e.target.value}))} placeholder="e.g. 0" className="w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            {/* Live climate risk preview */}
            {(() => {
              const risks = getClimateRisks(obsForm.weatherTemp, obsForm.weatherWind, obsForm.weatherRain);
              if (!risks.length) return null;
              return (
                <div className="space-y-1">
                  {risks.map((r, i) => (
                    <div key={i} className={`text-[10px] px-2 py-1 rounded font-semibold flex items-center gap-1 ${
                      r.type === 'danger' ? 'bg-red-50 text-red-700' : r.type === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                    }`}>{r.type === 'danger' ? '⚠' : 'ℹ'} {r.msg}</div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Growth Stage (BBCH)</label>
            <select value={obsForm.bbchStage || ''} onChange={e => setObsForm({...obsForm, bbchStage: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-3">
              <option value="">— Select Growth Stage —</option>
              {BBCH_STAGES.map(s => <option key={s.value} value={s.label}>{s.label}</option>)}
            </select>
          </div>

          {/* Task 56: Phytotoxicity fields */}
          <div className="border border-amber-200 rounded-xl p-3 bg-amber-50 space-y-3">
            <p className="text-xs font-bold text-amber-700 uppercase flex items-center gap-1"><Leaf className="w-3.5 h-3.5" /> Crop Injury / Phytotoxicity (optional)</p>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Crop Injury / Phytotoxicity (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={obsForm.phytotoxicityPct !== '' && obsForm.phytotoxicityPct != null ? obsForm.phytotoxicityPct : 0}
                  onChange={e => setObsForm(p => ({...p, phytotoxicityPct: e.target.value}))}
                  className="flex-1 accent-amber-500"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={obsForm.phytotoxicityPct || ''}
                  onChange={e => setObsForm(p => ({...p, phytotoxicityPct: e.target.value}))}
                  className="w-16 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
                  placeholder="0"
                />
                <span className="text-xs text-amber-700 font-semibold">%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Phytotoxicity Notes</label>
              <textarea
                rows="2"
                value={obsForm.phytotoxicityNotes || ''}
                onChange={e => setObsForm(p => ({...p, phytotoxicityNotes: e.target.value}))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Describe symptoms, affected area, etc."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <textarea rows="2" value={obsForm.notes} onChange={e => setObsForm({...obsForm, notes: e.target.value})} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="pt-3 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsObsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Save Observation</button>
          </div>
        </form>
      </Modal>

      {/* ── QUICK ENTRY PARAMETER MODAL ── */}
      <Modal 
        isOpen={quickEditObs !== null} 
        onClose={() => setQuickEditObs(null)} 
        title={`Enter ${quickEditObs?.label || 'Parameter'}`}
      >
        <form onSubmit={handleSaveQuickEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Value for DAA {quickEditObs?.obsIdx !== undefined && activeTrial ? (validateEfficacyData(safeJsonParse(activeTrial.EfficacyDataJSON, []), activeCategory, true)[quickEditObs.obsIdx]?.daa ?? '0') : ''}
            </label>
            <input
              type="number"
              step="0.1"
              autoFocus
              required
              value={quickEditObs?.value ?? ''}
              onChange={e => setQuickEditObs({ ...quickEditObs, value: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="pt-3 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setQuickEditObs(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Save Parameter</button>
          </div>
        </form>
      </Modal>

      {/* ── CROPPER MODAL ── */}
      <CropperModal
        isOpen={cropperOpen}
        imageSrc={cropSource}
        onClose={() => { setCropperOpen(false); setCropSource(null); cropCallbackRef.current = null; }}
        onCropComplete={handleCropComplete}
      />

      {/* ── BASELINE WARNING DIALOG — Task 57 ── */}
      {baselineWarningOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setBaselineWarningOpen(false); setPendingObsSave(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <span className="text-amber-600 text-xl">⚠</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">No Pre-Spray Baseline Recorded</h3>
                <p className="text-sm text-slate-600 mt-1">
                  No pre-spray baseline observation (DAA = 0) has been recorded for this trial.
                  Recording a baseline is <strong>strongly recommended</strong> for accurate efficacy calculation.
                </p>
                <p className="text-sm text-slate-500 mt-2">Proceed without baseline?</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                type="button"
                onClick={() => { setBaselineWarningOpen(false); setPendingObsSave(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={finalizePendingObsSave}
                className="px-4 py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600"
              >
                Proceed Without Baseline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHOTO EDIT MODAL ── */}
      {photoEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit Photo</h3>
              <button onClick={() => setPhotoEditModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Label / Caption</label>
              <input type="text" value={photoEditModal.label} onChange={e => setPhotoEditModal(p => ({...p, label: e.target.value}))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="e.g. Pre-application, DAA 14" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Date</label>
              <input type="datetime-local" value={photoEditModal.date} onChange={e => setPhotoEditModal(p => ({...p, date: e.target.value}))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setPhotoEditModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSavePhotoEdit} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHOTO DATE PROMPT MODAL ── */}
      {pendingPhotoAnalysis && (() => {
        const targetTrialForPhoto = pendingPhotoAnalysis.targetTrial || activeTrial;
        const proj = projects.find(p => String(p.ID) === String(targetTrialForPhoto?.ProjectID));
        const isPotTrial = (targetTrialForPhoto?.TrialDesign === 'PotTrial') || (proj?.Design === 'PotTrial');
        
        const SCIENTIFIC_FOCUS_TAGS = [
          { value: 'Whole Canopy (Standard)', label: 'Whole Canopy (Standard)', hint: 'Hold the camera parallel to the ground to avoid perspective bias for ground cover.' },
          { value: 'Leaf Close-up (Top / Adaxial)', label: 'Leaf Close-up (Top / Adaxial)', hint: 'Ensure leaf is centered and in focus. Avoid casting shadows with your hand or device.' },
          { value: 'Leaf Close-up (Underside / Abaxial)', label: 'Leaf Close-up (Underside / Abaxial)', hint: 'Turn the leaf over and shield it from direct sunlight to capture spores, eggs, or mites clearly.' },
          { value: 'Leaf Close-up (New Growth)', label: 'Leaf Close-up (New Growth)', hint: 'Take a high-detail close-up of young leaves at the top of the plant to detect immobile deficiencies (Iron/Calcium).' },
          { value: 'Leaf Close-up (Old Growth)', label: 'Leaf Close-up (Old Growth)', hint: 'Take a high-detail close-up of mature leaves near the bottom of the plant to detect mobile deficiencies (Nitrogen/Potassium).' },
          { value: 'Stem / Meristem Close-up', label: 'Stem / Meristem Close-up', hint: 'Focus directly on stems, node junctions, or growing tips. Avoid hand shadows.' },
          { value: 'Fruit / Produce Close-up', label: 'Fruit / Produce Close-up', hint: 'Ensure fruits/produce are centered and in focus. Avoid extreme glare.' }
        ];

        const defaultTag = isPotTrial ? 'Plant 1 (Pot A) - Whole Canopy (Standard)' : 'Whole Canopy (Standard)';
        const currentTag = pendingPhotoAnalysis.tag || defaultTag;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" /> Photo details & setup
                </h3>
                <button onClick={() => setPendingPhotoAnalysis(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-slate-500 font-semibold">"For best results, upload photos from different representative plants within this observation unit."</p>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Date</label>
                <input type="datetime-local"
                  value={pendingPhotoAnalysis.date}
                  onChange={e => setPendingPhotoAnalysis(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Tag / Focus Type</label>
                <select
                  value={currentTag}
                  onChange={e => setPendingPhotoAnalysis(p => ({ ...p, tag: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 font-medium"
                >
                  {(() => {
                    if (!isPotTrial) {
                      return SCIENTIFIC_FOCUS_TAGS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ));
                    }
                    
                    const potObsMode = proj?.PotObsMode || targetTrialForPhoto?.PotObsMode || 'row-wise';
                    let potCount = 3;
                    if (potObsMode === 'column-wise' && proj) {
                      const blocksCount = parseInt(proj.PotBlocks) || 3;
                      potCount = Math.floor((parseInt(proj.PotRows) || 9) / blocksCount);
                    } else if (potObsMode === 'row-wise' && proj) {
                      potCount = parseInt(proj.PotCols) || 4;
                    } else if (targetTrialForPhoto?.PotLabel) {
                      const m = targetTrialForPhoto.PotLabel.match(/(\d+)\s*Pots?/i);
                      if (m) potCount = parseInt(m[1], 10);
                    }
                    
                    const options = [];
                    for (let idx = 0; idx < potCount; idx++) {
                      const potLetter = String.fromCharCode(65 + idx); // A, B, C...
                      SCIENTIFIC_FOCUS_TAGS.forEach(f => {
                        const val = `Plant ${idx + 1} (Pot ${potLetter}) - ${f.value}`;
                        options.push(
                          <option key={val} value={val}>
                            Plant {idx + 1} (Pot {potLetter}) - {f.label}
                          </option>
                        );
                      });
                    }
                    return options;
                  })()}
                </select>
              </div>

              {(() => {
                const matchingFocus = SCIENTIFIC_FOCUS_TAGS.find(f => currentTag.includes(f.value));
                if (matchingFocus) {
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                      <div className="font-bold text-blue-600 flex items-center gap-1">📸 Camera Capture Guide:</div>
                      <div>{matchingFocus.hint}</div>
                    </div>
                  );
                }
                return null;
              })()}

              {targetTrialForPhoto?.Date && pendingPhotoAnalysis.date ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">
                  DAA: <strong>{Math.max(0, Math.round((new Date(pendingPhotoAnalysis.date) - new Date(targetTrialForPhoto.Date)) / 86400000))}</strong> days after application
                  {targetTrialForPhoto?.Lat && targetTrialForPhoto?.Lon && <span className="ml-2 text-emerald-600">• Weather will be auto-fetched</span>}
                </div>
              ) : null}

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button onClick={() => setPendingPhotoAnalysis(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button
                  onClick={() => {
                    const { dataUrl, date, targetTrial, tag } = pendingPhotoAnalysis;
                    setPendingPhotoAnalysis(null);
                    saveAndAnalyzePhoto(dataUrl, date, targetTrial, tag || defaultTag);
                  }}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> Analyse Photo
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── BULK QR CARD PRINT MODAL ── */}
      {isBulkQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                Print QR Cards
                <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-sm">{selectedForBulk.size} trials</span>
              </h3>
              <button onClick={() => setIsBulkQrModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Card Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'id-card', label: 'ID Card', desc: '85×54mm' },
                    { value: 'a6', label: 'A6', desc: '148×105mm' },
                    { value: 'a4', label: 'A4', desc: '210×297mm' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setQrCardSize(opt.value)}
                      className={`p-3 rounded-lg border text-left transition ${qrCardSize === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}
                    >
                      <div className="font-semibold text-sm text-slate-700">{opt.label}</div>
                      <div className="text-xs text-slate-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <label className="block text-xs font-semibold text-slate-600 uppercase">Include Parameters</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'formulationName', label: 'Formulation Name' },
                    { key: 'investigator', label: 'Investigator' },
                    { key: 'date', label: 'Trial Date' },
                    { key: 'dosage', label: 'Dosage' },
                    { key: 'targetField', label: 'Target Value' },
                    { key: 'location', label: 'Location' },
                    { key: 'designDetails', label: 'Layout (Block/Plot/Pot)' },
                    { key: 'trialId', label: 'Trial ID' },
                    { key: 'logo', label: 'Company Logo' },
                  ].map(field => (
                    <label key={field.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-emerald-700">
                      <input
                        type="checkbox"
                        checked={qrFields[field.key]}
                        onChange={(e) => setQrFields(prev => ({ ...prev, [field.key]: e.target.checked }))}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">
                  Make sure to allow popups for this site. QR codes will open in a new window ready for printing.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                onClick={() => setIsBulkQrModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => { generateBulkQrCardsLegacy(); setIsBulkQrModalOpen(false); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Generate & Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CAMERA ── */}
      {isCameraOpen && (() => {
        const currentTrial = quickActionTrialRef.current || activeTrial;
        const liveSettings = currentTrial ? safeJsonParse(currentTrial.LiveQRSettings, {}) : {};
        const initialAspect = liveSettings.cameraAspectRatio || '3:4';
        return (
          <CameraCapture
            onCapture={handleCapturePhoto}
            onClose={() => setIsCameraOpen(false)}
            initialAspectRatio={initialAspect}
            onAspectChange={async (ratio) => {
              if (currentTrial) {
                const updatedSettings = { ...safeJsonParse(currentTrial.LiveQRSettings, {}), cameraAspectRatio: ratio };
                const updatedTrial = { ...currentTrial, LiveQRSettings: JSON.stringify(updatedSettings) };
                
                // Optimistic UI update
                updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
                if (activeTrial && activeTrial.ID === currentTrial.ID) {
                  setActiveTrial(updatedTrial);
                }
                
                try {
                  await updateTrial({ ID: currentTrial.ID, LiveQRSettings: updatedTrial.LiveQRSettings }, getAppState);
                } catch (e) {
                  console.warn("Failed to sync aspect ratio to Firebase", e);
                }
              }
            }}
          />
        );
      })()}

      {/* ── GRID WEED COVER TOOL ── */}
      {isGridOpen && (() => {
        const photos = safeJsonParse(activeTrial?.PhotoURLs, []);
        const lastPhoto = photos.length ? photos[photos.length - 1] : null;
        const imgUrl = lastPhoto?.url || lastPhoto?.fileData || null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <Grid className="w-4 h-4 text-blue-600" /> Grid {activeCategory === 'herbicide' ? 'Weed Cover' : catConfig.primaryMetric.label} Tool
                </h2>
                <button onClick={() => setIsGridOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 flex-1">
                {!imgUrl && (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                    No photo found for this trial. Upload a photo first, then use the Grid Tool to measure {activeCategory === 'herbicide' ? 'weed cover' : catConfig.primaryMetric.label.toLowerCase()}.
                  </p>
                )}
                <GridWeedCoverTool
                  imageUrl={imgUrl}
                  onUpdate={(data) => setGridCoverPct(data.cover ?? 0)}
                />
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
                <button onClick={() => setIsGridOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  onClick={() => { handleGridResult(gridCoverPct); setGridCoverPct(0); }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Confirm Cover ({gridCoverPct}%)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Photo Analyzer – AI bounding box overlay */}
      {/* ── Customise Report Columns Modal ── */}
      <Modal isOpen={customiseReportModalOpen} onClose={() => setCustomiseReportModalOpen(false)} title="Customise Report Columns">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Select the observation variables/columns you want to include in the generated report:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {(() => {
              const currentProj = detailTrial ? projects.find(p => String(p.ID) === String(detailTrial.ProjectID)) : null;
              const isPotTrial = currentProj?.Design === 'PotTrial';
              const fields = isPotTrial
                ? (currentProj.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield']).map(f => ({ key: f, label: f }))
                : (getCategoryConfig(activeCategory).observationFields || []);
              return fields.map(f => (
                <label key={f.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={reportFieldSelection[f.key] !== false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReportFieldSelection(prev => ({ ...prev, [f.key]: checked }));
                    }}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm font-medium text-slate-700">{f.label}</span>
                </label>
              ));
            })()}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              onClick={() => setCustomiseReportModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pendingReportExport) {
                  const currentProj = detailTrial ? projects.find(p => String(p.ID) === String(detailTrial.ProjectID)) : null;
                  const isPotTrial = currentProj?.Design === 'PotTrial';
                  const key = isPotTrial ? (currentProj.Category || activeCategory) : activeCategory;
                  if (!window.activeReportFields) window.activeReportFields = {};
                  window.activeReportFields[key] = reportFieldSelection;
                  pendingReportExport();
                }
                setCustomiseReportModalOpen(false);
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
            >
              Generate Report
            </button>
          </div>
        </div>
      </Modal>

      <PhotoAnalyzerView
        isOpen={photoAnalyzerOpen}
        onClose={() => { setPhotoAnalyzerOpen(false); setPhotoAnalyzerResults([]); setPhotoAnalyzerUrl(null); }}
        imageUrl={photoAnalyzerUrl}
        loading={photoAnalyzerLoading}
        results={photoAnalyzerResults}
        onApplyValue={(val) => {
          const primaryField = getPrimaryObservationField(activeCategory);
          setObsForm(prev => ({ ...prev, [primaryField]: val }));
        }}
        onSave={async (updatedBounds) => {
          setPhotoAnalyzerResults(updatedBounds);
          setWeedIdResult(updatedBounds);
          
          if (!activeTrial) return;
          const photos = safeJsonParse(activeTrial.PhotoURLs, []);
          const targetIdx = photos.findIndex(p => {
            const pSrc = typeof p === 'string' ? p : (p.fileData || p.url);
            return pSrc === photoAnalyzerUrl;
          });
          
          if (targetIdx !== -1) {
            const updatedPhotos = photos.map((p, idx) => {
              if (idx === targetIdx) {
                if (typeof p === 'string') {
                  const isDrive = p.includes('drive.google.com');
                  return {
                    [isDrive ? 'url' : 'fileData']: p,
                    bounds: updatedBounds
                  };
                } else {
                  return { ...p, bounds: updatedBounds };
                }
              }
              return p;
            });
            const updatedTrial = { ...activeTrial, PhotoURLs: JSON.stringify(updatedPhotos) };
            updateState({ trials: trials.map(t => t.ID === updatedTrial.ID ? updatedTrial : t) });
            setActiveTrial(updatedTrial);
            try {
              await updateTrial({ ID: updatedTrial.ID, PhotoURLs: updatedTrial.PhotoURLs }, getAppState);
            } catch (dbErr) {
              console.error('Failed to save cached bounds:', dbErr);
            }
          }
        }}
        activeCategory={activeCategory}
      />

      <AppSharingModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        initialSharedWith={sharingTrial?.SharedWith || []}
        initialSharedWithEdit={sharingTrial?.SharedWithEdit || []}
        onSave={handleSaveSharing}
      />

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
                <div className="col-span-2 border--1.5 mb-1">
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

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      <input ref={harvestFileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
    </div>
  );
}
