import React, { memo, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, FlaskConical, Activity, Image as ImageIcon, ChevronLeft, ChevronRight, Edit, MoreVertical, Eye, Copy, FolderOpen, FileDown, ScanLine, MonitorPlay, Archive, FileCode, FileSpreadsheet, Share2, BrainCircuit, Trash2, Camera, CheckCircle, Clock, Pencil, CloudSun, Sparkles, Maximize2, Minimize2, X, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { formatDateTime } from '../utils/dateUtils.js';
import { calculateEffectiveControlDays, getDetailedControlDaysInfo } from '../utils/trialLifecycle.js';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue, getEWRSScale, getRatingFromEfficacy } from '../utils/categoryConfig.js';
import { canonicalizeWeedSpecies, getWeedBiology, getWeedEPPOCode } from '../utils/weedUtils.js';
import { useAuth } from '../hooks/useAuth.js';
import { resolvePhotoSrc, getPhotoThumbnailSrc, getDriveFileId } from '../utils/photoUtils.js';
import PhotoComparisonModal from './PhotoComparisonModal.jsx';

const RESULT_COLORS = {
  'Excellent': 'bg-emerald-100 text-emerald-700',
  'Good': 'bg-blue-100 text-blue-700',
  'Fair': 'bg-amber-100 text-amber-700',
  'Poor': 'bg-red-100 text-red-700',
  'Control': 'bg-purple-100 text-purple-700',
};

const BLOCK_COLORS = [
  { emoji: '🟢', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  { emoji: '🔵', bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', ring: 'ring-blue-200' },
  { emoji: '🟣', bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', ring: 'ring-purple-200' },
  { emoji: '🟠', bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', ring: 'ring-orange-200' },
  { emoji: '🔴', bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', ring: 'ring-red-200' },
  { emoji: '🟡', bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', ring: 'ring-yellow-200' },
];

const RESULT_BORDER_COLORS = {
  'Excellent': 'border-l-4 border-emerald-500',
  'Good': 'border-l-4 border-blue-500',
  'Fair': 'border-l-4 border-amber-500',
  'Poor': 'border-l-4 border-red-500',
  '': 'border-l-4 border-slate-200',
};

function ResultBadge({ result, ewrs, autoRating, onApplySuggested, isEditable }) {
  const style = RESULT_COLORS[result] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style}`}>
        {result || 'Unrated'}
      </span>
      {ewrs && (
        <span 
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs ${ewrs.badgeColor}`}
          title={`EWRS Rating Scale (1-9): ${ewrs.label}`}
        >
          {ewrs.shortLabel}
        </span>
      )}
      {!result && autoRating && (
        <span 
          className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 cursor-pointer hover:bg-indigo-100 transition"
          title={`Scientific auto-recommendation: ${autoRating}. ${isEditable ? 'Click to apply.' : ''}`}
          onClick={isEditable && onApplySuggested ? (e) => { e.stopPropagation(); onApplySuggested(autoRating); } : undefined}
        >
          <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
          Auto: {autoRating}
        </span>
      )}
    </div>
  );
}

const TrialCard = memo(function TrialCard({
  trial,
  project,
  subTrialLabel,
  isSelected,
  isHighlighted,
  isMenuOpen,
  onToggleBulk,
  onToggleMenu,
  onViewDetails,
  onEdit,
  onDuplicate,
  onMoveToProject,
  onExportPdf,
  onExportSciPdf,
  onExportInstitutionalDossier,
  onExportPpt,
  onExportHtml,
  onExportTxt,
  onExportCsv,
  onExportJson,
  onShare,
  onAppSharing,
  onAiGenerate,
  onDelete,
  onActivateToggle,
  onQuickRate,
  onQuickPhoto,
  onQuickGalleryUpload,
  onMarkComplete,
  onEditControlDays,
  onRecordWeather,
  onQuickPeekFormulation,
  isPendingSync,
}) {
  const handleRecordWeather = useCallback((e) => {
    e.stopPropagation();
    onRecordWeather && onRecordWeather(trial);
  }, [onRecordWeather, trial]);
  const { isViewer, user, isAdmin } = useAuth();
  const ownUid = user?.uid || user?.ID || user?.id;
  const isOwnData = isAdmin || !trial.CreatedBy || trial.CreatedBy === ownUid;
  const isShared = !!(trial.CreatedBy && trial.CreatedBy !== ownUid);
  const efficacyData = useMemo(() => {
    const parsed = safeJsonParse(trial.EfficacyDataJSON, []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(obs => {
      if (!obs || typeof obs !== 'object') return false;
      const daa = parseFloat(obs.daa);
      return !isNaN(daa) && daa >= 0;
    });
  }, [trial.EfficacyDataJSON]);
  // Task 57: Baseline indicator
  const hasBaseline = useMemo(() => {
    return efficacyData.some(o => Number(o.daa) === 0);
  }, [efficacyData]);
  const isSharedEdit = Array.isArray(trial.SharedWithEdit) && trial.SharedWithEdit.includes(ownUid);
  const hasBeenShared = !isShared && Array.isArray(trial.SharedWith) && trial.SharedWith.length > 0;
  const isEditable = !isViewer && (isOwnData || isSharedEdit);
  const canDownloadTrial = !isViewer && isOwnData && user?.tabPermissions?.['Allow Downloads'] !== false;
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);

  const photos = useMemo(() => {
    const parsed = safeJsonParse(trial.PhotoURLs, []);
    return Array.isArray(parsed) ? parsed.filter(p => !p.deleted) : [];
  }, [trial.PhotoURLs]);

  // Aggregate trial photos and observation photos for seamless in-card carousel
  const allCardPhotos = useMemo(() => {
    const list = [];
    photos.forEach((p, idx) => {
      const src = getPhotoThumbnailSrc(p, 600) || resolvePhotoSrc(p) || (typeof p === 'string' ? p : (p.url || p.fileData || p.dataUrl));
      if (src) {
        list.push({
          id: p.id || p.tempId || `tp_${idx}`,
          src,
          rawItem: p,
          label: p.label || p.name || 'Trial Photo',
          daa: p.daa !== undefined ? p.daa : null,
          date: p.date || ''
        });
      }
    });

    if (Array.isArray(efficacyData)) {
      efficacyData.forEach((obs, oIdx) => {
        if (obs.photoUrl) {
          const u = getPhotoThumbnailSrc(obs.photoUrl, 600) || resolvePhotoSrc(obs.photoUrl) || obs.photoUrl;
          if (u && !list.some(x => x.src === u)) {
            list.push({
              id: `obs_${oIdx}`,
              src: u,
              rawItem: obs.photoUrl,
              label: `DAA ${obs.daa ?? '?'} Obs Photo`,
              daa: obs.daa,
              date: obs.date || ''
            });
          }
        }
        if (Array.isArray(obs.photos)) {
          obs.photos.forEach((op, opIdx) => {
            const u = getPhotoThumbnailSrc(op, 600) || resolvePhotoSrc(op) || (typeof op === 'string' ? op : (op.url || op.fileData || op.dataUrl));
            if (u && !list.some(x => x.src === u)) {
              list.push({
                id: `obs_${oIdx}_${opIdx}`,
                src: u,
                rawItem: op,
                label: `DAA ${obs.daa ?? '?'} Obs Photo`,
                daa: obs.daa,
                date: obs.date || ''
              });
            }
          });
        }
      });
    }
    return list;
  }, [photos, efficacyData]);

  // Gentle auto-preview ONLY when actively hovering over this card's photo gallery
  useEffect(() => {
    if (allCardPhotos.length <= 1 || !isCarouselHovered) return;
    const interval = setInterval(() => {
      setActivePhotoIdx(prev => (prev + 1) % allCardPhotos.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [allCardPhotos.length, isCarouselHovered]);

  const handlePrevPhoto = useCallback((e) => {
    e.stopPropagation();
    setActivePhotoIdx(prev => (prev > 0 ? prev - 1 : allCardPhotos.length - 1));
  }, [allCardPhotos.length]);

  const handleNextPhoto = useCallback((e) => {
    e.stopPropagation();
    setActivePhotoIdx(prev => (prev + 1) % allCardPhotos.length);
  }, [allCardPhotos.length]);

  const touchCoordsRef = useRef({ startX: 0, startY: 0, startTime: 0, isSwipe: false });

  const handleTouchStart = useCallback((e) => {
    if (e.touches && e.touches[0]) {
      touchCoordsRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTime: Date.now(),
        isSwipe: false
      };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!e.touches || !e.touches[0]) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchCoordsRef.current.startX;
    const dy = currentY - touchCoordsRef.current.startY;

    // If horizontal movement dominates over vertical by > 8px, lock horizontal swipe
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      touchCoordsRef.current.isSwipe = true;
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = touchCoordsRef.current.startX - endX;
    const diffY = touchCoordsRef.current.startY - endY;
    const elapsed = Date.now() - touchCoordsRef.current.startTime;

    const isHorizontal = Math.abs(diffX) > Math.abs(diffY);
    const isSwiped = Math.abs(diffX) > 25 || (Math.abs(diffX) > 15 && elapsed < 350);

    if (isHorizontal && isSwiped) {
      touchCoordsRef.current.isSwipe = true;
      if (diffX > 0) {
        // Swipe Left -> Next Photo
        setActivePhotoIdx(prev => (prev + 1) % allCardPhotos.length);
      } else {
        // Swipe Right -> Prev Photo
        setActivePhotoIdx(prev => (prev > 0 ? prev - 1 : allCardPhotos.length - 1));
      }
    }
  }, [allCardPhotos.length]);

  const [showPhotoComparison, setShowPhotoComparison] = useState(false);
  const [photoFitMode, setPhotoFitMode] = useState('contain'); // 'contain' (Full Photo uncropped) | 'cover' (Fill)
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const isLive = String(trial.IsLive) !== 'false';
  const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';

  // Block badge info for RCBD Pot Trials
  const blockInfo = useMemo(() => {
    if (trial.TrialDesign !== 'PotTrial' || !trial.Replication) return null;
    const blockNum = parseInt(trial.Replication, 10);
    if (isNaN(blockNum) || blockNum < 1) return null;
    const colorIdx = (blockNum - 1) % BLOCK_COLORS.length;
    const colors = BLOCK_COLORS[colorIdx];
    // Calculate represented pots from project data
    let potsPerColumn = null;
    if (project && project.PotObsMode === 'column-wise' && project.PotRows && project.PotBlocks) {
      const rows = parseInt(project.PotRows, 10) || 9;
      const blocks = parseInt(project.PotBlocks, 10) || 3;
      potsPerColumn = Math.floor(rows / blocks);
    } else if (trial.PotLabel && trial.PotLabel.includes('Pots')) {
      // Fallback: parse from PotLabel like "Col 1 (3 Pots)"
      const m = trial.PotLabel.match(/(\d+)\s*Pots?/i);
      if (m) potsPerColumn = parseInt(m[1], 10);
    }
    return { blockNum, colors, potsPerColumn, isColumnWise: project?.PotObsMode === 'column-wise' || (trial.PotRow === null && trial.PotCol != null) };
  }, [trial.TrialDesign, trial.Replication, trial.PotLabel, trial.PotRow, trial.PotCol, project]);

  const posVal = useMemo(() => {
    if (trial.TrialDesign !== 'PotTrial') return '';
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
      return `${rowClean}${colClean}`;
    } else if (rowClean) {
      if (project) {
        const potCols = parseInt(project.PotCols) || 4;
        return `${rowClean} (C1-C${potCols})`;
      }
      return rowClean;
    } else if (colClean) {
      if (project) {
        const potRows = parseInt(project.PotRows) || 9;
        const blocksCount = parseInt(project.PotBlocks || project.BlocksCount || (project.ReplicationsJSON ? JSON.parse(project.ReplicationsJSON).length : 3)) || 3;
        const rowsPerBlock = Math.floor(potRows / blocksCount) || 1;
        const repNum = parseInt(trial.Replication) || 1;
        const startRow = (repNum - 1) * rowsPerBlock + 1;
        const endRow = Math.min(repNum * rowsPerBlock, potRows);
        if (blocksCount > 1) {
          return `${colClean} (R${startRow}-R${endRow})`;
        }
        return colClean;
      }
      return colClean;
    }
    return '';
  }, [trial.PotRow, trial.PotCol, trial.TrialDesign, trial.Replication, project]);

  // Control days calculation (Scientific EPPO/EWRS Linear Interpolation & Sustained Threshold)
  const controlDaysInfo = useMemo(() => {
    return getDetailedControlDaysInfo(trial);
  }, [trial, efficacyData]);

  const controlDays = useMemo(() => {
    if (controlDaysInfo?.effectiveDays > 0) return controlDaysInfo.effectiveDays;
    if (trial.FinalControlDuration) return parseInt(trial.FinalControlDuration, 10);
    return controlDaysInfo?.effectiveDays ?? 0;
  }, [controlDaysInfo, trial.FinalControlDuration]);

  const categoryId = project?.Category || trial?.Category || 'herbicide';

  const latestObs = useMemo(() => {
    if (!efficacyData || efficacyData.length === 0) return null;
    return efficacyData.slice().sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
  }, [efficacyData]);

  // EWRS Rating and suggested grade based on scientific efficacy
  const efficacyMetrics = useMemo(() => {
    if (!latestObs) return { primaryVal: null, ewrs: null, autoRating: null };
    const primaryVal = getObservationPrimaryValue(categoryId, latestObs);
    const ewrs = (primaryVal !== undefined && primaryVal !== null && !isNaN(primaryVal))
      ? getEWRSScale(primaryVal)
      : null;
    const autoRating = (primaryVal !== undefined && primaryVal !== null && !isNaN(primaryVal))
      ? getRatingFromEfficacy(categoryId, primaryVal)
      : null;
    return { primaryVal, ewrs, autoRating };
  }, [latestObs, categoryId]);

  // Advanced botanical weed taxonomy parsing
  const weedSpeciesList = useMemo(() => {
    if (!trial.WeedSpecies) return [];
    return String(trial.WeedSpecies)
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(raw => {
        const canonical = canonicalizeWeedSpecies(raw);
        const bio = getWeedBiology(canonical);
        return {
          raw,
          canonical,
          type: bio.type,
          lifecycle: bio.lifecycle,
          isPerennial: bio.isPerennial,
          regrowthRisk: bio.regrowthRisk,
          eppoCode: bio.eppoCode || getWeedEPPOCode(canonical)
        };
      });
  }, [trial.WeedSpecies]);

  const latestObsDetails = useMemo(() => {
    if (!latestObs) return null;
    const config = getCategoryConfig(categoryId);
    const primaryField = getPrimaryObservationField(categoryId);
    const primaryVal = getObservationPrimaryValue(categoryId, latestObs);

    const parts = [];
    if (primaryVal !== undefined && primaryVal !== null) {
      parts.push({
        label: config.primaryMetric?.label || 'Efficacy',
        value: `${primaryVal}${config.primaryMetric?.unit || ''}`
      });
    }

    let count = 0;
    (config.observationFields || []).forEach(f => {
      if (f.key !== primaryField && f.key !== 'weedDetails' && count < 2) {
        const val = latestObs[f.key];
        if (val !== undefined && val !== null && val !== '') {
          parts.push({ label: f.label, value: val });
          count++;
        }
      }
    });

    return {
      daa: latestObs.daa,
      date: latestObs.date,
      parts
    };
  }, [latestObs, categoryId]);

  const handleCardClick = useCallback(() => {
    if (isViewer) {
      onViewDetails(trial);
      return;
    }
    onToggleBulk(trial.ID);
  }, [onToggleBulk, trial, isViewer, onViewDetails]);

  const handleMenuClick = useCallback((e) => {
    e.stopPropagation();
    onToggleMenu(trial.ID);
  }, [onToggleMenu, trial.ID]);

  const handleViewDetails = useCallback(() => {
    onViewDetails(trial);
    onToggleMenu(null);
  }, [onViewDetails, trial, onToggleMenu]);

  const handleEdit = useCallback((e) => {
    e.stopPropagation();
    onEdit(trial, false);
  }, [onEdit, trial]);

  const handleDuplicate = useCallback(() => {
    onDuplicate(trial);
    onToggleMenu(null);
  }, [onDuplicate, trial, onToggleMenu]);

  const handleMove = useCallback(() => {
    onMoveToProject(trial);
    onToggleMenu(null);
  }, [onMoveToProject, trial, onToggleMenu]);

  const handleExportPdf = useCallback(() => {
    onExportPdf(trial);
    onToggleMenu(null);
  }, [onExportPdf, trial, onToggleMenu]);

  const handleExportInstitutionalPdf = useCallback(() => {
    onExportInstitutionalDossier && onExportInstitutionalDossier(trial, 'pdf');
    onToggleMenu(null);
  }, [onExportInstitutionalDossier, trial, onToggleMenu]);

  const handleExportInstitutionalDocx = useCallback(() => {
    onExportInstitutionalDossier && onExportInstitutionalDossier(trial, 'docx');
    onToggleMenu(null);
  }, [onExportInstitutionalDossier, trial, onToggleMenu]);

  const handleExportSciPdf = useCallback(() => {
    onExportSciPdf(trial);
    onToggleMenu(null);
  }, [onExportSciPdf, trial, onToggleMenu]);

  const handleExportPpt = useCallback(() => {
    onExportPpt(trial);
    onToggleMenu(null);
  }, [onExportPpt, trial, onToggleMenu]);

  const handleExportHtml = useCallback(() => {
    onExportHtml(trial);
    onToggleMenu(null);
  }, [onExportHtml, trial, onToggleMenu]);

  const handleExportTxt = useCallback(() => {
    onExportTxt(trial);
    onToggleMenu(null);
  }, [onExportTxt, trial, onToggleMenu]);

  const handleExportCsv = useCallback(() => {
    onExportCsv(trial);
    onToggleMenu(null);
  }, [onExportCsv, trial, onToggleMenu]);

  const handleExportJson = useCallback(() => {
    onExportJson(trial);
    onToggleMenu(null);
  }, [onExportJson, trial, onToggleMenu]);

  const handleShare = useCallback(() => {
    onShare(trial);
    onToggleMenu(null);
  }, [onShare, trial, onToggleMenu]);

  const handleAppSharing = useCallback(() => {
    onAppSharing(trial);
    onToggleMenu(null);
  }, [onAppSharing, trial, onToggleMenu]);

  const handleAiGenerate = useCallback(() => {
    onAiGenerate(trial);
    onToggleMenu(null);
  }, [onAiGenerate, trial, onToggleMenu]);

  const handleDelete = useCallback((e) => {
    onDelete(trial.ID, e);
    onToggleMenu(null);
  }, [onDelete, trial.ID, onToggleMenu]);

  const handleActivateToggle = useCallback(() => {
    onActivateToggle(trial);
  }, [onActivateToggle, trial]);

  const handleQuickRate = useCallback((e, rating) => {
    e.stopPropagation();
    onQuickRate && onQuickRate(trial, rating);
  }, [onQuickRate, trial]);

  const handleQuickPhoto = useCallback((e) => {
    e.stopPropagation();
    onQuickPhoto && onQuickPhoto(trial);
  }, [onQuickPhoto, trial]);

  const handleQuickGalleryUpload = useCallback((e) => {
    e.stopPropagation();
    onQuickGalleryUpload && onQuickGalleryUpload(trial);
  }, [onQuickGalleryUpload, trial]);

  const handleMarkComplete = useCallback((e) => {
    e.stopPropagation();
    onMarkComplete && onMarkComplete(trial);
  }, [onMarkComplete, trial]);

  const handleEditControlDays = useCallback((e) => {
    e.stopPropagation();
    onEditControlDays && onEditControlDays(trial);
  }, [onEditControlDays, trial]);

  const stopPropagation = useCallback((e) => e.stopPropagation(), []);

  const topAccent = trial.Result === 'Excellent' ? 'from-[#154734] to-emerald-500' :
    trial.Result === 'Good' ? 'from-blue-600 to-teal-500' :
    trial.Result === 'Fair' ? 'from-amber-500 to-amber-400' :
    trial.Result === 'Poor' ? 'from-rose-500 to-red-400' :
    trial.IsControl ? 'from-purple-600 to-indigo-500' : 'from-slate-300 to-slate-200';

  return (
    <div
      id={`trial-card-${trial.ID}`}
      onClick={handleCardClick}
      className={`cv-auto bg-white rounded-2xl shadow-xs relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] touch-manipulation cursor-pointer flex flex-col justify-between overflow-hidden border ${
        isHighlighted
          ? 'ring-4 ring-amber-400 border-amber-500 shadow-xl scale-[1.01] z-10'
          : isSelected
          ? 'border-[#154734] ring-2 ring-[#154734]/20 shadow-md'
          : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      {/* Top Accent Gradient Line */}
      <div className={`h-1 w-full bg-gradient-to-r ${topAccent}`} />

      {/* Main Content Area */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-2.5">
        <div>
          {/* Header Row: Checkbox / Block Pill, Status Dot, Title, and Action Icons */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {/* Checkbox (Bulk Select Mode) */}
              {!isViewer && !isShared && (
                <div 
                  className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition ${
                    isSelected ? 'bg-[#154734] border-[#154734]' : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBulk(trial.ID);
                  }}
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Status Indicator Dot */}
                  <span 
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isCompleted ? 'bg-slate-400' : isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                    }`} 
                    title={isCompleted ? 'Finalized' : isLive ? 'Live Field Trial' : 'Inactive'} 
                  />

                  {/* Subtrial or Block Tag */}
                  {subTrialLabel && (
                    <span className="bg-[#154734] text-white text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0">
                      {subTrialLabel}
                    </span>
                  )}
                  {blockInfo && (
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded shrink-0 ${blockInfo.colors.bg} ${blockInfo.colors.text} border ${blockInfo.colors.border}`}>
                      B{blockInfo.blockNum}
                    </span>
                  )}

                  {/* Trial Name */}
                  <h3 className="font-bold text-sm sm:text-base text-slate-800 tracking-tight truncate">
                    {trial.TrialName || trial.FormulationName || 'Field Plot'}
                  </h3>
                </div>

                {/* Subtitle: Product Peek & Project */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 truncate">
                  {trial.FormulationName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onQuickPeekFormulation) {
                          onQuickPeekFormulation(trial.FormulationID, trial.FormulationName);
                        }
                      }}
                      className="text-[#154734] font-semibold hover:underline inline-flex items-center gap-0.5 truncate"
                      title="Quick peek formulation recipe"
                    >
                      <span className="truncate">{trial.FormulationName}</span>
                      <Eye className="w-3 h-3 text-[#154734] opacity-70 shrink-0" />
                    </button>
                  )}
                  {project && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500 text-[11px] truncate">{project.Name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Top Right Quick Actions */}
            <div className="flex items-center gap-0.5 shrink-0" onClick={stopPropagation}>
              {isEditable && (
                <>
                  <button 
                    onClick={handleRecordWeather} 
                    className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" 
                    title="Record Weather Info"
                  >
                    <CloudSun className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={handleEdit} 
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" 
                    title="Edit Trial"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* 3-Dot Overflow Menu */}
              <div className="relative">
                <button
                  onClick={handleMenuClick}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {isMenuOpen && (
                  <div 
                    className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-xl border border-slate-200 min-w-48 py-1 max-h-72 overflow-y-auto" 
                    onClick={stopPropagation}
                  >
                    <button onClick={handleViewDetails} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                      <Eye className="w-3.5 h-3.5 text-slate-500" /> View Details
                    </button>
                    {isEditable && (
                      <button onClick={handleDuplicate} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        <Copy className="w-3.5 h-3.5 text-emerald-500" /> Duplicate
                      </button>
                    )}
                    {isEditable && (
                      <button onClick={handleMove} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        <FolderOpen className="w-3.5 h-3.5 text-blue-500" /> Move to Project
                      </button>
                    )}
                    {canDownloadTrial && (
                      <>
                        <hr className="my-1 border-slate-100" />
                        {onExportInstitutionalDossier && (
                          <>
                            <button
                              onClick={handleExportInstitutionalPdf}
                              className="w-full flex items-center justify-between px-3 py-2 text-xs text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100 font-semibold transition"
                              title="15-Page Miklens Bio Institutional Regulatory Dossier (PDF)"
                            >
                              <span className="flex items-center gap-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-[#154734] shrink-0" />
                                <span className="truncate">Institutional Dossier (PDF)</span>
                              </span>
                              <span className="text-[9px] bg-emerald-200/80 text-[#154734] px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0">15p</span>
                            </button>
                            <button
                              onClick={handleExportInstitutionalDocx}
                              className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                              title="15-Page Miklens Bio Institutional Regulatory Dossier (Word DOCX)"
                            >
                              <span className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                <span className="truncate">Institutional Dossier (DOCX)</span>
                              </span>
                              <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold uppercase shrink-0">DOCX</span>
                            </button>
                          </>
                        )}
                        <button onClick={handleExportPdf} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <FileDown className="w-3.5 h-3.5 text-red-500" /> Comprehensive PDF
                        </button>
                        <button onClick={handleExportSciPdf} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <ScanLine className="w-3.5 h-3.5 text-indigo-500" /> Scientific PDF
                        </button>
                        <button onClick={handleExportPpt} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <MonitorPlay className="w-3.5 h-3.5 text-orange-500" /> PowerPoint (.pptx)
                        </button>
                        <button onClick={handleExportHtml} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <Archive className="w-3.5 h-3.5 text-blue-500" /> HTML Report
                        </button>
                        <button onClick={handleExportTxt} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <FileCode className="w-3.5 h-3.5 text-slate-500" /> Field Report (.txt)
                        </button>
                        <button onClick={handleExportCsv} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Export CSV
                        </button>
                        <button onClick={handleExportJson} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                          <FileDown className="w-3.5 h-3.5 text-violet-500" /> Export JSON
                        </button>
                      </>
                    )}
                    <button onClick={handleShare} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                      <Share2 className="w-3.5 h-3.5 text-sky-500" /> Share / Copy
                    </button>
                    {isAdmin && (
                      <button onClick={handleAppSharing} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                        <Share2 className="w-3.5 h-3.5 text-indigo-500" /> App Sharing (In-App)
                      </button>
                    )}
                    <hr className="my-1 border-slate-100" />
                    <button onClick={handleAiGenerate} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-violet-50">
                      <BrainCircuit className="w-3.5 h-3.5 text-violet-500" /> Generate AI Report
                    </button>
                    <button
                      onClick={(e) => {
                        stopPropagation(e);
                        setShowPhotoComparison(true);
                        onToggleMenu && onToggleMenu(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-700 hover:bg-indigo-50 font-medium"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> AI Photo Comparison
                    </button>
                    {!isViewer && isOwnData && (
                      <>
                        <hr className="my-1 border-slate-100" />
                        <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" /> Delete Plot
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Target Weeds & Botanical Species (Streamlined) */}
          {weedSpeciesList.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2 text-xs">
              <span className="text-[11px] font-semibold text-slate-500">Target:</span>
              {weedSpeciesList.slice(0, 2).map((w, idx) => (
                <span 
                  key={idx} 
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                >
                  <span className="italic">{w.canonical}</span>
                  <span className="text-[9px] text-slate-400">({w.type})</span>
                </span>
              ))}
              {weedSpeciesList.length > 2 && (
                <span className="text-[10px] text-slate-400 font-semibold">+{weedSpeciesList.length - 2} more</span>
              )}
            </div>
          )}

          {/* Unified Key Metric Capsule Row */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
            {/* Efficacy & Rating */}
            <ResultBadge 
              result={trial.Result} 
              ewrs={efficacyMetrics.ewrs}
              autoRating={efficacyMetrics.autoRating}
              onApplySuggested={(suggested) => handleQuickRate(null, suggested)}
              isEditable={isEditable}
            />

            {/* Scientific Control Days */}
            {controlDays !== null && controlDays >= 0 && (
              <span 
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 inline-flex items-center gap-1"
                title={controlDaysInfo?.reason || `${controlDays} days sustained control`}
              >
                <span>⏳ {controlDays}d Residual</span>
                {controlDaysInfo?.status === 'breakdown_regrowth' && (
                  <span className="text-[9px] font-bold text-rose-600">Breakdown @ {controlDaysInfo.breakdownDaa}d</span>
                )}
              </span>
            )}

            {/* Observations count */}
            {efficacyData.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80">
                {efficacyData.length} Obs
              </span>
            )}

            {/* Photos count */}
            {photos.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 inline-flex items-center gap-1">
                <ImageIcon className="w-2.5 h-2.5" /> {photos.length}
              </span>
            )}

            {/* Offline sync indicator */}
            {isPendingSync && (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 animate-pulse">
                <Clock className="w-2.5 h-2.5 text-amber-500" /> Queued
              </span>
            )}
          </div>
        </div>

        {/* Compact Photo Preview Banner (Tap opens Lightbox) */}
        {allCardPhotos.length > 0 && (
          <div
            className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-200/80 group select-none cursor-pointer h-28 sm:h-32 w-full mt-1"
            onClick={(e) => {
              stopPropagation(e);
              setLightboxPhoto(allCardPhotos[activePhotoIdx % allCardPhotos.length]);
            }}
          >
            <img
              src={allCardPhotos[activePhotoIdx % allCardPhotos.length]?.src}
              alt="Plot photo"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            {/* Top DAA tag & Photo count overlay */}
            <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
              {allCardPhotos[activePhotoIdx % allCardPhotos.length]?.daa !== null ? (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-[#154734]/90 text-white backdrop-blur-xs shadow-xs">
                  DAA {allCardPhotos[activePhotoIdx % allCardPhotos.length].daa}
                </span>
              ) : <span />}

              <div className="flex items-center gap-1">
                {allCardPhotos.length > 1 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-xs">
                    {(activePhotoIdx % allCardPhotos.length) + 1}/{allCardPhotos.length}
                  </span>
                )}
                <span className="p-1 rounded-md bg-black/60 text-white backdrop-blur-xs">
                  <Maximize2 className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>

            {/* Quick Carousel Prev / Next Controls if multiple photos */}
            {allCardPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-80 hover:opacity-100 transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-80 hover:opacity-100 transition"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sleek Mobile-Friendly 3-Action Bottom Bar */}
      <div 
        className="px-3 py-2 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-1.5 text-xs" 
        onClick={stopPropagation}
      >
        <div className="flex items-center gap-1">
          {isEditable && (
            <>
              {/* Quick Rate Trigger */}
              <button
                type="button"
                onClick={(e) => handleQuickRate(e, trial.Result === 'Excellent' ? 'Good' : 'Excellent')}
                className="px-2 py-1 rounded-lg font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-[#154734] hover:border-emerald-200 transition active:scale-95 touch-manipulation flex items-center gap-1 text-[11px]"
                title="Log / cycle efficacy score"
              >
                <Sparkles className="w-3 h-3 text-[#154734]" />
                <span>Rate</span>
              </button>

              {/* Quick Photo Upload Trigger */}
              <button
                type="button"
                onClick={handleQuickPhoto}
                className="px-2 py-1 rounded-lg font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition active:scale-95 touch-manipulation flex items-center gap-1 text-[11px]"
                title="Take or attach field photo"
              >
                <Camera className="w-3 h-3 text-blue-600" />
                <span>Photo</span>
              </button>
            </>
          )}
        </div>

        {/* View Details Link */}
        <button
          type="button"
          onClick={() => onViewDetails(trial)}
          className="text-xs font-bold text-[#154734] hover:text-[#0e3525] flex items-center gap-0.5 active:scale-95 transition touch-manipulation"
        >
          <span>View Details</span>
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>

      {showPhotoComparison && (
        <PhotoComparisonModal
          isOpen={showPhotoComparison}
          onClose={() => setShowPhotoComparison(false)}
          trial={trial}
          initialBeforeUrl={allCardPhotos.find(p => p.daa === 0 || p.daa === '0')?.src || (allCardPhotos[0]?.src || null)}
          initialAfterUrl={allCardPhotos.length > 1 ? allCardPhotos[allCardPhotos.length - 1]?.src : null}
        />
      )}

      {/* ══ FULLSCREEN PHOTO LIGHTBOX MODAL ═══════════════════════ */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxPhoto(null);
          }}
        >
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-20" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-sm sm:text-base">{trial.FormulationName || 'Trial Photo'}</span>
              {lightboxPhoto.daa !== null && lightboxPhoto.daa !== undefined && (
                <span className="px-2.5 py-0.5 bg-emerald-600 rounded-full text-xs font-bold text-white shadow">
                  DAA {lightboxPhoto.daa}
                </span>
              )}
              {lightboxPhoto.date && (
                <span className="text-xs text-white/70 hidden sm:inline">{lightboxPhoto.date}</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-white/80 bg-white/10 px-2.5 py-1 rounded-full">
                {(activePhotoIdx % allCardPhotos.length) + 1} / {allCardPhotos.length}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxPhoto(null);
                }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition shadow"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Photo View (100% Uncropped Full Resolution) */}
          <div
            className="relative max-w-5xl max-h-[82vh] w-full h-full flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={resolvePhotoSrc(lightboxPhoto?.rawItem, 1600) || lightboxPhoto?.src}
              alt={lightboxPhoto?.label || 'Full trial photo'}
              className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-xl shadow-2xl transition-transform allow-pinch-zoom"
              onError={(e) => {
                const driveId = getDriveFileId(lightboxPhoto?.src) || getDriveFileId(lightboxPhoto?.rawItem);
                if (driveId && !e.currentTarget.dataset.fallbackTried) {
                  e.currentTarget.dataset.fallbackTried = '1';
                  e.currentTarget.src = `https://drive.google.com/uc?export=view&id=${driveId}`;
                } else if (driveId && e.currentTarget.dataset.fallbackTried === '1') {
                  e.currentTarget.dataset.fallbackTried = '2';
                  e.currentTarget.src = `https://drive.google.com/uc?export=download&id=${driveId}`;
                }
              }}
            />

            {/* Left Nav Arrow */}
            {allCardPhotos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextIdx = activePhotoIdx > 0 ? activePhotoIdx - 1 : allCardPhotos.length - 1;
                  setActivePhotoIdx(nextIdx);
                  setLightboxPhoto(allCardPhotos[nextIdx]);
                }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition shadow-lg z-10"
                title="Previous photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Right Nav Arrow */}
            {allCardPhotos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextIdx = (activePhotoIdx + 1) % allCardPhotos.length;
                  setActivePhotoIdx(nextIdx);
                  setLightboxPhoto(allCardPhotos[nextIdx]);
                }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition shadow-lg z-10"
                title="Next photo"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Bottom Caption */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center text-center text-xs text-white/70 pointer-events-none">
            <span>{lightboxPhoto.label || 'Trial observation photo'} — tap anywhere outside or press Close</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default TrialCard;
