import React, { useState, useMemo } from 'react';
import { 
  X, ExternalLink, Calendar, MapPin, User, CheckCircle2, 
  Activity, ArrowRight, Sparkles, Image as ImageIcon,
  Clock, ShieldAlert, Award, FileText, ChevronRight, Eye,
  RefreshCw, ZoomIn, Download
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { validateEfficacyData } from '../utils/analysisUtils.js';
import { 
  resolvePhotoSrc, 
  getPhotoThumbnailSrc, 
  getDriveFileId, 
  getCorsSafePhotoUrl 
} from '../utils/photoUtils.js';

/**
 * Resilient Thumbnail Image Component with Multi-Tier Fallback
 * Seamlessly resolves Google Drive CDN thumbnails, alternative endpoints,
 * and handles referrer restrictions to guarantee visibility.
 */
function PlotThumbnailImage({
  photo,
  className = "w-full h-full object-cover",
  alt = "Field Plot Photo",
  onClick,
  showZoomBadge = true
}) {
  const [loadStage, setLoadStage] = useState(0);
  const driveId = photo?.driveId || getDriveFileId(photo?.rawItem || photo?.src);

  const getSourceForStage = (stage) => {
    if (stage === 0) {
      return photo?.thumbSrc || getPhotoThumbnailSrc(photo?.rawItem, 400) || resolvePhotoSrc(photo?.rawItem, 400) || photo?.src;
    }
    if (stage === 1 && driveId) {
      return `https://drive.google.com/thumbnail?id=${driveId}&sz=w600`;
    }
    if (stage === 2 && driveId) {
      return `https://images.weserv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=view&id=${driveId}`)}&w=480&output=jpg`;
    }
    if (stage === 3) {
      const raw = photo?.rawItem;
      return typeof raw === 'string' ? raw : (raw?.url || raw?.src || raw?.fileData || photo?.fullSrc);
    }
    return null;
  };

  const currentSrc = getSourceForStage(loadStage);

  const handleError = () => {
    if (loadStage < 3 && (driveId || loadStage < 2)) {
      setLoadStage(prev => prev + 1);
    } else {
      setLoadStage(4); // Marked as failed
    }
  };

  if (loadStage === 4 || !currentSrc) {
    return (
      <div 
        onClick={onClick}
        className="w-full h-full bg-slate-900 text-slate-300 flex flex-col items-center justify-center p-3 text-center cursor-pointer hover:bg-slate-800 transition"
      >
        <ImageIcon className="w-6 h-6 text-emerald-400 mb-1 opacity-70" />
        <span className="text-[10px] font-bold text-slate-200 truncate max-w-full">
          {photo?.label || 'Plot Photo'}
        </span>
        {driveId ? (
          <a
            href={`https://drive.google.com/file/d/${driveId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 text-[9px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30"
          >
            <span>Drive Link</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ) : (
          <span className="text-[9px] text-slate-400">Photo logged</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group overflow-hidden" onClick={onClick}>
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        loading="lazy"
        onError={handleError}
      />
      {showZoomBadge && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="p-1.5 rounded-full bg-black/70 text-white backdrop-blur-xs shadow-md transform scale-90 group-hover:scale-100 transition-transform">
            <Eye className="w-4 h-4" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrialQuickPeekModal({
  isOpen,
  onClose,
  trial,
  activeCategory = 'herbicide',
  onOpenFullTrial
}) {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'observations' | 'photos'
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const config = getCategoryConfig(activeCategory);

  const observations = useMemo(() => {
    if (!trial) return [];
    const raw = safeJsonParse(trial.EfficacyDataJSON, []);
    return validateEfficacyData(raw, trial.Category || activeCategory, true);
  }, [trial, activeCategory]);

  /**
   * Comprehensive Photo Aggregation:
   * Aggregates photos from PhotoURLs, WeedPhotosJSON, and individual observation milestone logs.
   * Resolves Google Drive thumbnails and CDN addresses with deduplication.
   */
  const photos = useMemo(() => {
    if (!trial) return [];

    const list = [];
    const seenSignatures = new Set();

    const addPhoto = (item, defaultType = 'plot', defaultLabel = 'Plot Photo', defaultDaa = null, defaultDate = '') => {
      if (!item || item.deleted) return;
      
      const driveId = getDriveFileId(item);
      const rawUrl = typeof item === 'string' 
        ? item.trim() 
        : (item.url || item.src || item.fileUrl || item.fileData || item.dataUrl || item.photoUrl || '').trim();
      
      if (!driveId && !rawUrl) return;
      if (rawUrl === '[base64-removed]' || rawUrl.includes('[base64-removed]')) return;

      const sig = driveId 
        ? `drive_${driveId}` 
        : rawUrl.startsWith('data:') 
          ? `data_${rawUrl.slice(0, 40)}` 
          : rawUrl.toLowerCase().replace(/(&sz=w\d+)|(&w=\d+)/g, '');
          
      if (seenSignatures.has(sig)) return;
      seenSignatures.add(sig);

      const thumbSrc = getPhotoThumbnailSrc(item, 400) 
        || resolvePhotoSrc(item, 400) 
        || (typeof item === 'string' ? item : (item.url || item.src || item.fileData || item.dataUrl));
      
      const fullSrc = resolvePhotoSrc(item, 1600) || resolvePhotoSrc(item) || thumbSrc;

      const date = (typeof item === 'object' && item.date) ? item.date : (defaultDate || trial.Date || '');
      const daa = (typeof item === 'object' && item.daa !== undefined && item.daa !== null) ? item.daa : defaultDaa;
      const weedCover = (typeof item === 'object' && item.weedCover !== undefined && item.weedCover !== null) ? item.weedCover : null;
      const label = typeof item === 'object' ? (item.label || item.name || item.tag || defaultLabel) : defaultLabel;

      list.push({
        id: (typeof item === 'object' && item.id) || `p_${list.length}`,
        src: thumbSrc,
        thumbSrc,
        fullSrc,
        driveId,
        date,
        daa,
        weedCover,
        label,
        sourceType: defaultType,
        rawItem: item
      });
    };

    // 1. Ingest trial.PhotoURLs
    const parsedPhotos = safeJsonParse(trial.PhotoURLs, []);
    const photoArray = Array.isArray(parsedPhotos) ? parsedPhotos : (Array.isArray(trial.PhotoURLs) ? trial.PhotoURLs : []);
    photoArray.forEach((p, idx) => {
      addPhoto(p, 'plot', `Field Plot Photo ${idx + 1}`, null, trial.Date);
    });

    // 2. Ingest trial.WeedPhotosJSON (Target weed baseline photos)
    const parsedWeed = safeJsonParse(trial.WeedPhotosJSON, []);
    const weedArray = Array.isArray(parsedWeed) ? parsedWeed : (Array.isArray(trial.WeedPhotosJSON) ? trial.WeedPhotosJSON : []);
    weedArray.forEach((wp, idx) => {
      addPhoto(wp, 'weed', `Target Weed Baseline Photo ${idx + 1}`, 0, trial.Date);
    });

    // 3. Ingest observation photos from trial.EfficacyDataJSON or observations
    if (Array.isArray(observations)) {
      observations.forEach((obs) => {
        const obsDaa = obs.daa !== undefined ? obs.daa : obs.day;
        const obsDate = obs.date || '';

        if (obs.photoUrl) {
          addPhoto(obs.photoUrl, 'observation', `DAA ${obsDaa ?? '?'} Obs Photo`, obsDaa, obsDate);
        }
        if (Array.isArray(obs.photos)) {
          obs.photos.forEach((op, opIdx) => {
            addPhoto(op, 'observation', `DAA ${obsDaa ?? '?'} Photo ${opIdx + 1}`, obsDaa, obsDate);
          });
        }
      });
    }

    // Sort chronologically by DAA if available
    return list.sort((a, b) => {
      const daaA = a.daa !== null && a.daa !== undefined ? Number(a.daa) : 999;
      const daaB = b.daa !== null && b.daa !== undefined ? Number(b.daa) : 999;
      if (daaA !== daaB) return daaA - daaB;
      if (a.date && b.date) return new Date(a.date) - new Date(b.date);
      return 0;
    });
  }, [trial, observations]);

  // Primary Hero Photo for the Summary Tab
  const heroPhoto = useMemo(() => {
    if (photos.length === 0) return null;
    // Prefer the photo with the latest DAA milestone (final control snapshot) or the primary plot photo
    const sortedByLatestDaa = [...photos].sort((a, b) => {
      const daaA = a.daa !== null && a.daa !== undefined ? Number(a.daa) : -1;
      const daaB = b.daa !== null && b.daa !== undefined ? Number(b.daa) : -1;
      return daaB - daaA;
    });
    return sortedByLatestDaa[0];
  }, [photos]);

  const controlDays = useMemo(() => {
    if (!trial) return null;
    const days = trial.FinalControlDuration ?? trial.ControlDuration ?? trial.ControlDays;
    if (days !== undefined && days !== null && days !== '') {
      return `${days}d${trial.ControlFinalized || trial.IsCompleted ? ' (finalized)' : ''}`;
    }
    return null;
  }, [trial]);

  const finalEfficacy = useMemo(() => {
    if (!trial) return null;
    if (trial.FinalEfficacy !== undefined && trial.FinalEfficacy !== null && !isNaN(Number(trial.FinalEfficacy))) {
      return Number(trial.FinalEfficacy);
    }
    if (observations.length > 0) {
      const last = observations[observations.length - 1];
      const eff = last.controlPct ?? last.wce ?? last.efficacy;
      if (eff !== undefined && !isNaN(Number(eff))) return Number(eff);
    }
    return null;
  }, [trial, observations]);

  if (!isOpen || !trial) return null;

  const resultColor = 
    trial.Result === 'Excellent' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    trial.Result === 'Good' ? 'bg-teal-100 text-teal-800 border-teal-300' :
    trial.Result === 'Moderate' ? 'bg-amber-100 text-amber-800 border-amber-300' :
    'bg-rose-100 text-rose-800 border-rose-300';

  const isCompleted = trial.IsCompleted || trial.ControlFinalized || trial.Status === 'Completed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white shrink-0 flex items-start justify-between gap-3 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              }`}>
                {isCompleted ? 'Finalized' : 'Active Plot'}
              </span>
              {trial.Result && (
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${resultColor}`}>
                  {trial.Result}
                </span>
              )}
              {controlDays && (
                <span className="text-[10px] font-mono font-bold bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/10">
                  ⏳ {controlDays}
                </span>
              )}
            </div>

            <h3 className="font-extrabold text-base sm:text-lg text-white truncate">
              {trial.FormulationName || 'Trial Plot'}
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5 truncate">
              {trial.Dosage ? `Dosage: ${trial.Dosage}` : 'Standard Dosage'}
              {trial.Date ? ` • ${new Date(trial.Date).toLocaleDateString()}` : ''}
              {trial.TrialID ? ` • ID: ${trial.TrialID}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenFullTrial && onOpenFullTrial(trial.ID || trial.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
              title="Open full workspace in Trials page"
            >
              <span>Full View</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close and return to chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 shrink-0 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'summary' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Summary & Target</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('observations')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'observations' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Observations ({observations.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('photos')}
            className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'photos' 
                ? 'border-emerald-600 text-emerald-800' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photos ({photos.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar text-xs">
          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: SUMMARY
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'summary' && (
            <div className="space-y-3.5">
              {/* Highlight Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/80">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block">Final Control</span>
                  <span className="text-base font-black text-emerald-950 font-mono">
                    {finalEfficacy !== null ? `${finalEfficacy}%` : 'Recorded'}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200/80">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase block">Longevity</span>
                  <span className="text-base font-black text-indigo-950 font-mono">
                    {controlDays || 'In Progress'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Observations</span>
                  <span className="text-base font-black text-slate-800 font-mono">
                    {observations.length} logs
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Field Photos</span>
                  <span className="text-base font-black text-slate-800 font-mono">
                    {photos.length} captured
                  </span>
                </div>
              </div>

              {/* ─── Hero Plot Photo Thumbnail Card (Always Visible on Open!) ─── */}
              {heroPhoto ? (
                <div className="p-3.5 bg-gradient-to-r from-slate-900 to-slate-850 rounded-xl border border-slate-800 text-white space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Field Plot Photo Preview
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono font-bold">
                        {heroPhoto.daa !== null && heroPhoto.daa !== undefined ? `DAA ${heroPhoto.daa}` : 'Latest Plot Photo'}
                      </span>
                    </div>
                    {photos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('photos')}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer transition"
                      >
                        <span>View all {photos.length} photos</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    {/* Featured Large Thumbnail */}
                    <div 
                      className="sm:col-span-5 relative rounded-lg overflow-hidden border border-white/10 bg-slate-950 aspect-video sm:aspect-4/3 cursor-pointer shadow-md group"
                      onClick={() => setSelectedPhoto(heroPhoto)}
                    >
                      <PlotThumbnailImage 
                        photo={heroPhoto}
                        alt={heroPhoto.label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-mono bg-black/60 backdrop-blur-xs px-2 py-1 rounded text-white pointer-events-none">
                        <span className="truncate pr-1">{heroPhoto.label || 'Plot Snapshot'}</span>
                        {heroPhoto.weedCover !== null && heroPhoto.weedCover !== undefined && (
                          <span className="text-emerald-400 font-bold shrink-0">Weed: {heroPhoto.weedCover}%</span>
                        )}
                      </div>
                    </div>

                    {/* Progression Strip & Action Buttons */}
                    <div className="sm:col-span-7 flex flex-col justify-between h-full space-y-2.5">
                      <div className="space-y-1">
                        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                          Plot inspection record {heroPhoto.date ? `recorded on ${new Date(heroPhoto.date).toLocaleDateString()}` : ''}.
                          {heroPhoto.weedCover !== null ? ` Visual weed cover measured at ${heroPhoto.weedCover}%.` : ''}
                        </p>
                      </div>

                      {/* Multi-Photo Mini Thumbnail Progression Strip */}
                      {photos.length > 1 && (
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">
                            DAA Progression Thumbnails ({photos.length})
                          </span>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {photos.map((p, pIdx) => (
                              <div
                                key={p.id || pIdx}
                                onClick={() => setSelectedPhoto(p)}
                                className={`w-14 h-14 rounded-lg overflow-hidden border shrink-0 cursor-pointer transition shadow-2xs relative group ${
                                  p.id === heroPhoto.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-white/20 hover:border-emerald-400'
                                }`}
                                title={`${p.label || 'Photo'} ${p.daa !== null ? `(DAA ${p.daa})` : ''}`}
                              >
                                <PlotThumbnailImage 
                                  photo={p}
                                  showZoomBadge={false}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                />
                                {p.daa !== null && p.daa !== undefined && (
                                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-[8px] font-mono font-bold text-center py-0.5 pointer-events-none">
                                    D{p.daa}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(heroPhoto)}
                          className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>Enlarge Thumbnail</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('photos')}
                          className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>Gallery ({photos.length})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-300 flex items-center justify-between gap-3 text-slate-500">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-700 text-xs truncate">No Plot Photos Attached</p>
                      <p className="text-[10px] text-slate-400 truncate">Photos can be synchronized from Google Drive or uploaded in the Trials workspace.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenFullTrial && onOpenFullTrial(trial.ID || trial.id)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg font-bold text-[10px] shrink-0 cursor-pointer transition shadow-2xs"
                  >
                    Upload in Full View ↗
                  </button>
                </div>
              )}

              {/* Target Weeds / Species */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Target Weed Species / Target
                </span>
                <p className="font-bold text-slate-800 text-xs leading-relaxed">
                  {trial.WeedSpecies || trial.Target || trial.WeedTarget || trial.TargetSpecs || 'General weed vegetation'}
                </p>
                {trial.Crop && (
                  <p className="text-[11px] text-slate-600">
                    Host / Adjacent Crop: <strong>{trial.Crop}</strong>
                  </p>
                )}
              </div>

              {/* Operational Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5">
                  <User className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Lead Investigator</span>
                    <span className="font-bold text-slate-800 text-xs">{trial.InvestigatorName || trial.Investigator || 'Pavan (Lead)'}</span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Field Coordinates / Location</span>
                    <span className="font-bold text-slate-800 text-xs truncate block">
                      {trial.Location || (trial.Latitude && trial.Longitude ? `${trial.Latitude}, ${trial.Longitude}` : 'Bengaluru Field Station')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Field Observations / Notes */}
              {trial.Notes && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-amber-950">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                    Field Investigator Notes
                  </span>
                  <p className="italic text-xs leading-relaxed">"{trial.Notes}"</p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: OBSERVATIONS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'observations' && (
            <div className="space-y-2.5">
              {observations.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-xs">No observation milestones logged yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {observations.map((obs, idx) => {
                    const eff = obs.controlPct ?? obs.wce ?? obs.efficacy;
                    const daa = obs.daa !== undefined ? obs.daa : obs.day;
                    
                    // Match any photo recorded for this observation milestone
                    const matchingPhoto = photos.find(p => 
                      (p.daa !== null && p.daa !== undefined && daa !== undefined && String(p.daa) === String(daa)) ||
                      (obs.date && p.date && obs.date.split('T')[0] === p.date.split('T')[0])
                    );

                    return (
                      <div key={idx} className="p-3 hover:bg-slate-50 transition flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Milestone Thumbnail or DAA Pill */}
                          {matchingPhoto ? (
                            <div 
                              onClick={() => setSelectedPhoto(matchingPhoto)}
                              className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-400/80 shadow-2xs shrink-0 cursor-pointer relative group"
                              title={`Click to view DAA ${daa} milestone photo`}
                            >
                              <PlotThumbnailImage 
                                photo={matchingPhoto}
                                showZoomBadge={false}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-emerald-950/80 text-[8px] font-mono font-bold text-emerald-300 text-center py-0.5">
                                D{daa}
                              </span>
                            </div>
                          ) : (
                            <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 font-mono font-black text-xs flex items-center justify-center shrink-0">
                              {daa !== undefined ? `D${daa}` : `#${idx + 1}`}
                            </span>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-xs">
                                {obs.date ? new Date(obs.date).toLocaleDateString() : `Observation ${idx + 1}`}
                              </span>
                              {obs.weedCover !== undefined && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Weed Cover: {obs.weedCover}%
                                </span>
                              )}
                            </div>
                            {obs.notes && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 italic">
                                "{obs.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {eff !== undefined ? (
                            <span className={`font-mono font-black text-sm ${
                              Number(eff) >= 85 ? 'text-emerald-700' : Number(eff) >= 60 ? 'text-teal-700' : 'text-amber-700'
                            }`}>
                              {eff}% Control
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">Recorded</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: PHOTOS (RESOLVED THUMBNAIL GALLERY)
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'photos' && (
            <div className="space-y-3">
              {photos.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-xs">No field photos uploaded for this plot.</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Upload photos in the full workspace or sync from Google Drive.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {photos.map((p, idx) => (
                    <div 
                      key={p.id || idx} 
                      className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-square flex flex-col justify-end shadow-2xs cursor-pointer hover:border-emerald-500/80 transition-all"
                      onClick={() => setSelectedPhoto(p)}
                    >
                      <PlotThumbnailImage 
                        photo={p}
                        alt={p.label || `Plot DAA Photo ${idx + 1}`}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="relative p-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white text-[10px] pointer-events-none">
                        <div className="flex items-center justify-between font-mono font-bold">
                          <span className="truncate pr-1">
                            {p.date ? new Date(p.date).toLocaleDateString() : (p.label || `Photo ${idx + 1}`)}
                          </span>
                          {p.daa !== null && p.daa !== undefined && (
                            <span className="bg-emerald-500/30 text-emerald-300 px-1.5 py-0.2 rounded font-mono text-[9px] shrink-0">
                              DAA {p.daa}
                            </span>
                          )}
                        </div>
                        {p.weedCover !== null && p.weedCover !== undefined && (
                          <div className="text-emerald-300 font-semibold text-[9px]">
                            Weed: {p.weedCover}%
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* High-Resolution Photo Zoom Lightbox */}
              {selectedPhoto && (
                <div 
                  className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md p-4 flex flex-col items-center justify-center animate-fade-in"
                  onClick={() => setSelectedPhoto(null)}
                >
                  <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                    <img 
                      src={selectedPhoto.fullSrc || selectedPhoto.thumbSrc || selectedPhoto.src} 
                      alt={selectedPhoto.label || "Expanded field photo"} 
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      className="max-w-full max-h-[75vh] rounded-xl shadow-2xl object-contain border border-white/10"
                      onError={(e) => {
                        if (selectedPhoto.driveId) {
                          e.target.onerror = null;
                          e.target.src = `https://drive.google.com/thumbnail?id=${selectedPhoto.driveId}&sz=w1600`;
                        }
                      }}
                    />

                    {/* Lightbox Caption & Action Toolbar */}
                    <div className="mt-3 w-full flex items-center justify-between text-white text-xs bg-slate-900/90 px-4 py-2.5 rounded-xl border border-white/10 backdrop-blur-md gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-emerald-400 truncate">{selectedPhoto.label || 'Plot Photo'}</span>
                        {selectedPhoto.daa !== null && selectedPhoto.daa !== undefined && (
                          <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                            DAA {selectedPhoto.daa}
                          </span>
                        )}
                        {selectedPhoto.weedCover !== null && selectedPhoto.weedCover !== undefined && (
                          <span className="text-emerald-300 font-mono text-[10px] shrink-0">
                            {selectedPhoto.weedCover}% Weed
                          </span>
                        )}
                        {selectedPhoto.date && (
                          <span className="text-slate-400 font-mono text-[10px] hidden sm:inline shrink-0">
                            {new Date(selectedPhoto.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {selectedPhoto.driveId && (
                          <a
                            href={`https://drive.google.com/file/d/${selectedPhoto.driveId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white font-semibold text-[11px] flex items-center gap-1 transition"
                          >
                            <span>Open in Drive</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button 
                          onClick={() => setSelectedPhoto(null)} 
                          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200/80 shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 font-bold transition shadow-2xs active:scale-95 cursor-pointer text-xs"
          >
            ⬅ Return to AI Chat
          </button>

          <button
            type="button"
            onClick={() => onOpenFullTrial && onOpenFullTrial(trial.ID || trial.id)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black transition shadow-md shadow-emerald-600/20 active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <span>Open Full Workspace in Trials</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
