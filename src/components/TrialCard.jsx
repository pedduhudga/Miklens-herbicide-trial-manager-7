import React, { memo, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, FlaskConical, Activity, Image as ImageIcon, ChevronLeft, ChevronRight, Edit, MoreVertical, Eye, Copy, FolderOpen, FileDown, ScanLine, MonitorPlay, Archive, FileCode, FileSpreadsheet, Share2, BrainCircuit, Trash2, Camera, CheckCircle, Clock, Pencil, CloudSun, Sparkles, Maximize2, Minimize2, X, ShieldCheck, FileText } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { formatDateTime } from '../utils/dateUtils.js';
import { calculateEffectiveControlDays } from '../utils/trialLifecycle.js';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue } from '../utils/categoryConfig.js';
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

function ResultBadge({ result }) {
  const style = RESULT_COLORS[result] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style}`}>
      {result || 'Unrated'}
    </span>
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

  // Auto-advance photos gently (every 4 seconds) if multiple photos exist and user isn't hovering
  useEffect(() => {
    if (allCardPhotos.length <= 1 || isCarouselHovered) return;
    const interval = setInterval(() => {
      setActivePhotoIdx(prev => (prev + 1) % allCardPhotos.length);
    }, 4000);
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

  // Control days calculation (Scientific WCE >= 70% Effective Duration)
  const controlDays = useMemo(() => {
    const calc = calculateEffectiveControlDays(trial);
    if (calc > 0) return calc;
    if (trial.FinalControlDuration) return parseInt(trial.FinalControlDuration, 10);
    return calc;
  }, [trial, efficacyData]);

  const categoryId = project?.Category || trial?.Category || 'herbicide';

  const latestObs = useMemo(() => {
    if (!efficacyData || efficacyData.length === 0) return null;
    return efficacyData.slice().sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
  }, [efficacyData]);

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

  const resultBorderClass = RESULT_BORDER_COLORS[trial.Result || ''] || RESULT_BORDER_COLORS[''];

  return (
    <div
      id={`trial-card-${trial.ID}`}
      onClick={handleCardClick}
      className={`cv-auto bg-white rounded-xl shadow-sm relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] touch-manipulation cursor-pointer flex flex-col
        ${resultBorderClass}
        ${isHighlighted ? 'ring-4 ring-amber-400 border-amber-500 shadow-xl animate-pulse scale-[1.01] z-10' : isSelected ? 'border-2 border-emerald-500 ring-2 ring-emerald-100' : 'border border-slate-100 hover:border-emerald-300'}`}
    >
      {/* Checkbox */}
      {!isViewer && !isShared && (
        <div className={`absolute top-3 left-3 w-5 h-5 rounded border-2 flex items-center justify-center transition ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
          {isSelected && (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}

      {/* Shared Badge */}
      {isShared && (
        <div className="absolute top-3 left-3 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
          <Share2 className="w-3 h-3" /> Shared by {trial.InvestigatorName || 'Scientist'}{isSharedEdit ? ' (Edit Access)' : ''}
        </div>
      )}

      {/* Block Badge for RCBD Pot Trial */}
      {blockInfo && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl ${blockInfo.colors.bg} border-b ${blockInfo.colors.border}`}>
          <span className="text-sm leading-none">{blockInfo.colors.emoji}</span>
          <span className={`text-[11px] font-extrabold uppercase tracking-wide ${blockInfo.colors.text}`}>
            Block {blockInfo.blockNum}
          </span>
          {trial.PotLabel && (
            <span className={`ml-auto text-[10px] font-semibold ${blockInfo.colors.text} opacity-70`}>
              Pot: {trial.PotLabel} {posVal && posVal !== trial.PotLabel ? ` | Pos: ${posVal}` : ''}
            </span>
          )}
        </div>
      )}



      <div className={`p-4 ${blockInfo ? 'pt-3' : 'pt-10'} flex-1 flex flex-col`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 truncate" title={blockInfo ? `Block ${blockInfo.blockNum} - ${trial.FormulationName}` : trial.FormulationName}>
              {subTrialLabel && (
                <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md mr-1.5 align-middle shadow-sm">
                  {subTrialLabel}
                </span>
              )}
              {blockInfo && (
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md mr-1.5 align-middle shadow-sm ${blockInfo.colors.bg} ${blockInfo.colors.text} border ${blockInfo.colors.border}`}>
                  B{blockInfo.blockNum}
                </span>
              )}
              <span className="align-middle">{trial.TrialName || trial.FormulationName || 'Untitled'}</span>
            </h3>
            {trial.FormulationName && (
              <p className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1 mt-0.5">
                Product:
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onQuickPeekFormulation) {
                      onQuickPeekFormulation(trial.FormulationID, trial.FormulationName);
                    }
                  }}
                  className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-0.5 group cursor-pointer"
                  title="Quick peek formulation recipe and performance"
                >
                  <span>{trial.FormulationName}</span>
                  <Eye className="w-3 h-3 text-emerald-500 opacity-60 group-hover:opacity-100 transition" />
                </button>
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {isPendingSync && (
                <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 animate-pulse" title="Offline changes queued, pending sync">
                  <Clock className="w-2.5 h-2.5 text-amber-500" /> Pending Sync
                </span>
              )}
              {trial.IsControl && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Control</span>}
              {trial.IsStandardCheck && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Standard</span>}
              {trial.IsCompleted && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Finalized</span>}
              {/* Task 57: Baseline indicator */}
              {efficacyData.length > 0 && hasBaseline && (
                <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5" title="Pre-spray baseline recorded"><CheckCircle className="w-2.5 h-2.5" /> Baseline</span>
              )}
              {hasBeenShared && (
                <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5" title={`Shared with ${trial.SharedWith.length} user(s)`}>
                  <Share2 className="w-2.5 h-2.5" /> Shared ({trial.SharedWith.length})
                </span>
              )}
              {trial.TrialDesign && trial.TrialDesign !== 'RCBD' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">{trial.TrialDesign}</span>}
              {project && <span className="text-xs text-emerald-600 font-medium truncate block">{project.Name}</span>}
            </div>
          </div>
          <div className="flex gap-1 shrink-0" onClick={stopPropagation}>
            {isEditable && (
              <>
                <button onClick={handleRecordWeather} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded" title="Record Real-time Weather Info">
                  <CloudSun className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleEdit} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                  <Edit className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {/* 3-dot menu */}
            <div className="relative">
              <button
                onClick={handleMenuClick}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="More actions">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 min-w-48 py-1 max-h-72 overflow-y-auto" onClick={stopPropagation}>
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
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">Institutional Dossier (PDF)</span>
                            </span>
                            <span className="text-[9px] bg-emerald-200/80 text-emerald-800 px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0">15p</span>
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
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-slate-500">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/90 text-emerald-950 border border-emerald-200 font-bold text-[11px] shadow-xs">
            <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>{formatDateTime(trial.Date) || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{trial.Dosage || '—'}</span></div>
          {trial.WeedSpecies && <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{trial.WeedSpecies}</span></div>}
          {trial.TrialDesign === 'Split-Plot' && (trial.MainFactor || trial.SubFactor) && (
            <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-1 pl-1.5 font-medium space-y-0.5">
              <div>Main Factor: <span className="font-bold text-slate-700">{trial.MainFactor || 'N/A'}</span></div>
              <div>Sub Factor: <span className="font-bold text-slate-700">{trial.SubFactor || 'N/A'}</span></div>
            </div>
          )}
          {trial.TrialDesign === 'Factorial' && (trial.MainFactor || trial.SubFactor) && (
            <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-1 pl-1.5 font-medium space-y-0.5">
              <div>Factor A: <span className="font-bold text-slate-700">{trial.MainFactor || 'N/A'}</span></div>
              <div>Factor B: <span className="font-bold text-slate-700">{trial.SubFactor || 'N/A'}</span></div>
            </div>
          )}
          {trial.TrialDesign === 'Lattice' && trial.SubBlockID && (
            <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-1 pl-1.5 font-medium">
              <div>Sub-Block: <span className="font-bold text-slate-700">{trial.SubBlockID}</span></div>
            </div>
          )}
          {controlDays !== null && controlDays >= 0 && (
            <div className="flex items-center gap-1.5" onClick={stopPropagation}>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className={isCompleted ? 'text-emerald-600 font-semibold' : 'text-blue-600 font-semibold'}>
                {controlDays}d control{isCompleted ? ' (finalized)' : ''}
              </span>
              {isEditable && (
                <button onClick={handleEditControlDays} title="Edit control days" className="text-slate-300 hover:text-slate-600 transition">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick Rating */}
        {isEditable && (
          <div className="mt-2 flex items-center gap-1" onClick={stopPropagation}>
            <span className="text-[10px] text-slate-400 mr-0.5">Rate:</span>
            {[['Excellent','bg-emerald-500'],['Good','bg-blue-500'],['Fair','bg-amber-500'],['Poor','bg-red-500']].map(([r, col]) => (
              <button key={r} onClick={e => handleQuickRate(e, r)}
                title={trial.Result === r ? `${r} — tap to clear` : r}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition ${
                  trial.Result === r
                    ? `${col} text-white ring-2 ring-offset-1 ring-current`
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}>
                {r[0]}
              </button>
            ))}
            {trial.Result && (
              <button onClick={e => handleQuickRate(e, trial.Result)} title="Clear rating"
                className="text-[9px] text-slate-400 hover:text-red-500 ml-0.5 transition">
                ×
              </button>
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <ResultBadge result={trial.Result} />
          {photos.length > 0 && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex items-center gap-1"><ImageIcon className="w-3 h-3" />{photos.length}</span>}
          {efficacyData.length > 0 && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{efficacyData.length} obs</span>}
          {trial.YieldValue && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold">{trial.YieldValue} t/ha</span>}
        </div>

        {/* ══ JIO-MART STYLE IN-CARD PHOTO CAROUSEL ═══════════════════════ */}
        {allCardPhotos.length > 0 && (
          <div
            className="mt-2 relative rounded-lg overflow-hidden bg-slate-900/10 border border-slate-100 group select-none cursor-pointer touch-pan-y"
            style={{ height: '115px', touchAction: 'pan-y' }}
            onClick={(e) => {
              stopPropagation(e);
              if (touchCoordsRef.current.isSwipe) {
                touchCoordsRef.current.isSwipe = false;
                return;
              }
              setLightboxPhoto(allCardPhotos[activePhotoIdx % allCardPhotos.length]);
            }}
            onMouseEnter={() => setIsCarouselHovered(true)}
            onMouseLeave={() => setIsCarouselHovered(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Active Image */}
            {(() => {
              const currentPhoto = allCardPhotos[activePhotoIdx % allCardPhotos.length];
              const resolvedSrc = currentPhoto?.src || getPhotoThumbnailSrc(currentPhoto?.rawItem, 320) || resolvePhotoSrc(currentPhoto?.rawItem, 320);
              return resolvedSrc ? (
                <>
                  {/* Blurred Backdrop Ambience for Uncropped 'contain' mode */}
                  {photoFitMode === 'contain' && (
                    <img
                      src={resolvedSrc}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-xs opacity-35 scale-110 pointer-events-none"
                    />
                  )}
                  <img
                    src={resolvedSrc}
                    alt={currentPhoto?.label || 'Trial photo'}
                    className={`relative z-1 w-full h-full ${photoFitMode === 'contain' ? 'object-contain' : 'object-cover'} transition-all duration-300 group-hover:scale-[1.02]`}
                    loading="lazy"
                    onError={(e) => {
                      const driveId = getDriveFileId(resolvedSrc) || getDriveFileId(currentPhoto?.rawItem);
                      if (driveId && !e.currentTarget.dataset.fallbackTried) {
                        e.currentTarget.dataset.fallbackTried = '1';
                        e.currentTarget.src = `https://drive.google.com/uc?export=view&id=${driveId}`;
                      } else if (driveId && e.currentTarget.dataset.fallbackTried === '1') {
                        e.currentTarget.dataset.fallbackTried = '2';
                        e.currentTarget.src = `https://drive.google.com/uc?export=download&id=${driveId}`;
                      }
                    }}
                  />
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
                  <ImageIcon className="w-4 h-4 mb-0.5 opacity-50" />
                  <span className="text-[9px]">Photo available</span>
                </div>
              );
            })()}

            {/* Top Overlay Bar: DAA Tag, Fit/Fill Toggle, Expand Fullscreen, Photo Counter */}
            <div className="absolute top-1 left-1 right-1 flex items-center justify-between z-10 pointer-events-none">
              <div>
                {allCardPhotos[activePhotoIdx % allCardPhotos.length]?.daa !== null &&
                allCardPhotos[activePhotoIdx % allCardPhotos.length]?.daa !== undefined ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-600/90 text-white backdrop-blur-xs shadow-xs">
                    DAA {allCardPhotos[activePhotoIdx % allCardPhotos.length].daa}
                  </span>
                ) : <span />}
              </div>

              <div className="flex items-center gap-1">
                {/* Fit / Fill Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoFitMode(m => m === 'contain' ? 'cover' : 'contain');
                  }}
                  className="pointer-events-auto px-1.5 py-0.5 rounded bg-black/60 hover:bg-black/80 text-white text-[9px] font-semibold backdrop-blur-xs transition shadow-xs flex items-center gap-0.5"
                  title={photoFitMode === 'contain' ? 'Currently: Full Uncropped photo. Click to Fill frame.' : 'Currently: Fill frame. Click to view Full Uncropped photo.'}
                >
                  {photoFitMode === 'contain' ? 'Full' : 'Fill'}
                </button>

                {/* Lightbox / Zoom full photo button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxPhoto(allCardPhotos[activePhotoIdx % allCardPhotos.length]);
                  }}
                  className="pointer-events-auto w-5 h-5 rounded bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs transition shadow-xs"
                  title="Expand to Fullscreen Photo Lightbox"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>

                {/* Photo Counter Badge */}
                {allCardPhotos.length > 1 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-xs shadow-xs">
                    {(activePhotoIdx % allCardPhotos.length) + 1}/{allCardPhotos.length}
                  </span>
                )}
              </div>
            </div>

            {/* Left / Right Carousel Arrow Buttons */}
            {allCardPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md flex items-center justify-center opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10 active:scale-95"
                  title="Previous photo"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md flex items-center justify-center opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10 active:scale-95"
                  title="Next photo"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>

                {/* Dot Indicators */}
                <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-1 z-10 pointer-events-none">
                  {allCardPhotos.slice(0, 6).map((_, dotIdx) => (
                    <span
                      key={dotIdx}
                      className={`h-1.5 rounded-full transition-all ${
                        dotIdx === (activePhotoIdx % allCardPhotos.length)
                          ? 'w-3 bg-white shadow-xs'
                          : 'w-1.5 bg-white/60'
                      }`}
                    />
                  ))}
                  {allCardPhotos.length > 6 && (
                    <span className="text-[8px] text-white/90 font-bold ml-0.5">+</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between" onClick={stopPropagation}>
          <div className="flex items-center gap-1.5">
            {isCompleted ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">FINALIZED</span>
            ) : (
              <>
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-slate-400'}`} />
                <span className={`text-[10px] font-bold ${isLive ? 'text-green-700' : 'text-slate-500'}`}>
                  {isLive ? 'LIVE' : 'INACTIVE'}
                </span>
              </>
            )}
          </div>
          {isEditable && !isCompleted && (
            <div className="flex items-center gap-1">
              <button onClick={handleMarkComplete}
                title="Mark as Completed"
                className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-0.5 transition">
                <CheckCircle className="w-3 h-3" /> Done
              </button>
              <button
                onClick={handleActivateToggle}
                className={`text-[10px] font-bold px-2 py-0.5 rounded border transition ${
                  isLive
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                }`}>
                {isLive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t px-3 py-2 flex items-center justify-between" onClick={stopPropagation}>
        {isEditable && (
          <div className="flex gap-1">
            <button onClick={handleQuickPhoto}
              title="Add Photo"
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition">
              <Camera className="w-3.5 h-3.5" /> Photo
            </button>
            <button onClick={handleQuickGalleryUpload}
              title="Upload from Gallery"
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition">
              <ImageIcon className="w-3.5 h-3.5" /> Gallery
            </button>
          </div>
        )}
        <button onClick={() => onViewDetails(trial)}
          className={`text-xs text-emerald-600 font-semibold flex items-center gap-1 hover:underline ${isViewer || isShared ? 'w-full justify-center' : ''}`}>
          View Details <ChevronRight className="w-3.5 h-3.5" />
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
