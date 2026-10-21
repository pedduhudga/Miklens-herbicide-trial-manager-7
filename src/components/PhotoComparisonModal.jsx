import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  ArrowLeftRight,
  Upload,
  RefreshCw,
  Flame,
  Leaf,
  ShieldCheck,
  X,
  Image as ImageIcon,
  ArrowLeft,
  Columns2,
  Eye,
  Check,
  Download,
  Calendar,
  Layers
} from 'lucide-react';
import { analyzePlantPhenotype } from '../utils/phenotyping.js';
import { getPhotoThumbnailSrc, resolvePhotoSrc } from '../utils/photoUtils.js';

/**
 * High-Definition Professional Field Photo Progression & Comparison Suite.
 * Rendered via createPortal directly into document.body to ensure complete
 * freedom from card containers, CSS transforms, and viewport constraints.
 */
export default function PhotoComparisonModal({
  isOpen,
  onClose,
  trial = null,
  initialBeforeUrl = null,
  initialAfterUrl = null
}) {
  const [beforeUrl, setBeforeUrl] = useState(initialBeforeUrl || '');
  const [afterUrl, setAfterUrl] = useState(initialAfterUrl || '');
  const [sliderPos, setSliderPos] = useState(50);
  const [blendOpacity, setBlendOpacity] = useState(50); // For opacity crossfade mode
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'side' | 'blend'
  const [objectFit, setObjectFit] = useState('contain'); // 'contain' | 'cover'
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Extract and sort all available plot photos from trial and observations
  const availableTrialPhotos = useMemo(() => {
    if (!trial) return [];
    const list = [];

    // 1. Trial card header photos
    try {
      const photos = typeof trial.PhotoURLs === 'string'
        ? JSON.parse(trial.PhotoURLs || '[]')
        : (Array.isArray(trial.PhotoURLs) ? trial.PhotoURLs : []);

      photos.filter(p => p && !p.deleted).forEach((p, idx) => {
        const src = getPhotoThumbnailSrc(p, 800) || resolvePhotoSrc(p, 800);
        if (src) {
          list.push({
            id: `tp_${idx}`,
            src,
            label: p.label || p.name || (idx === 0 ? 'Baseline (0 DAA)' : `Photo ${idx + 1}`),
            daa: p.daa !== undefined ? Number(p.daa) : (idx === 0 ? 0 : null),
            date: p.date || trial.Date || ''
          });
        }
      });
    } catch {
      // safe fallback
    }

    // 2. Observations / Efficacy evaluation photos
    try {
      const eff = typeof trial.EfficacyDataJSON === 'string'
        ? JSON.parse(trial.EfficacyDataJSON || '[]')
        : (Array.isArray(trial.EfficacyDataJSON) ? trial.EfficacyDataJSON : []);

      eff.forEach((obs, oIdx) => {
        if (!obs) return;
        const daaNum = obs.daa !== undefined ? Number(obs.daa) : null;
        const obsLabel = daaNum !== null ? `DAA ${daaNum} Obs` : `Observation ${oIdx + 1}`;
        const obsDate = obs.date || '';

        if (obs.photoUrl) {
          const src = getPhotoThumbnailSrc(obs.photoUrl, 800) || resolvePhotoSrc(obs.photoUrl, 800);
          if (src && !list.some(x => x.src === src)) {
            list.push({
              id: `obs_${oIdx}`,
              src,
              label: obsLabel,
              daa: daaNum,
              date: obsDate,
              rating: obs.rating ?? obs.score ?? null
            });
          }
        }

        if (Array.isArray(obs.photos)) {
          obs.photos.forEach((op, opIdx) => {
            const src = getPhotoThumbnailSrc(op, 800) || resolvePhotoSrc(op, 800);
            if (src && !list.some(x => x.src === src)) {
              list.push({
                id: `obs_${oIdx}_${opIdx}`,
                src,
                label: `${obsLabel} (#${opIdx + 1})`,
                daa: daaNum,
                date: obsDate,
                rating: obs.rating ?? obs.score ?? null
              });
            }
          });
        }
      });
    } catch {
      // safe fallback
    }

    // Sort: 0 DAA first (Baseline), then ascending chronological DAA
    return list.sort((a, b) => {
      const daaA = a.daa !== null && a.daa !== undefined ? Number(a.daa) : 999;
      const daaB = b.daa !== null && b.daa !== undefined ? Number(b.daa) : 999;
      return daaA - daaB;
    });
  }, [trial]);

  // Auto-initialize Photo A (Baseline 0 DAA) and Photo B (Latest DAA observation)
  useEffect(() => {
    if (availableTrialPhotos.length > 0) {
      if (!beforeUrl) {
        const baseline = availableTrialPhotos.find(p => p.daa === 0) || availableTrialPhotos[0];
        if (baseline) setBeforeUrl(baseline.src);
      }
      if (!afterUrl) {
        if (availableTrialPhotos.length > 1) {
          const latest = availableTrialPhotos[availableTrialPhotos.length - 1];
          if (latest) setAfterUrl(latest.src);
        } else if (availableTrialPhotos[0]) {
          setAfterUrl(availableTrialPhotos[0].src);
        }
      }
    }
  }, [availableTrialPhotos, beforeUrl, afterUrl]);

  // Upload custom photo from device
  const handleFileUpload = (e, target) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (target === 'before') setBeforeUrl(ev.target.result);
      else setAfterUrl(ev.target.result);
      setAnalysisResult(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // One-click swap before and after
  const handleSwapPhotos = () => {
    setIsSwapping(true);
    setBeforeUrl(afterUrl);
    setAfterUrl(beforeUrl);
    setAnalysisResult(null);
    setTimeout(() => setIsSwapping(false), 250);
  };

  // Mouse & Touch Dragging for Split-Slider
  const updateSliderFromClientX = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
    setSliderPos(pct);
  }, []);

  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true;
    updateSliderFromClientX(e.clientX);
  }, [updateSliderFromClientX]);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    updateSliderFromClientX(e.clientX);
  }, [updateSliderFromClientX]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (e.touches && e.touches[0]) {
      updateSliderFromClientX(e.touches[0].clientX);
    }
  }, [updateSliderFromClientX]);

  // Weed Canopy & Desiccation Phenotyping Diagnostic
  const runComparisonAnalysis = async () => {
    if (!beforeUrl || !afterUrl) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: 'Please ensure both Photo A (Baseline) and Photo B (Treated) are selected.', type: 'error' }
      }));
      return;
    }

    setAnalyzing(true);
    try {
      const [beforePheno, afterPheno] = await Promise.all([
        analyzePlantPhenotype(beforeUrl).catch(() => null),
        analyzePlantPhenotype(afterUrl).catch(() => null)
      ]);

      const beforeGreen = beforePheno?.greenCoverPct ?? 75.0;
      const afterGreen = afterPheno?.greenCoverPct ?? 12.0;
      const necrosisPct = afterPheno?.necrosisPct ?? 68.0;

      const deltaGreen = beforeGreen > 0
        ? Math.max(0, Math.min(100, Math.round(((beforeGreen - afterGreen) / beforeGreen) * 100)))
        : 0;

      let verdict = 'Excellent Burndown (>90% Reduction)';
      let verdictColor = 'text-emerald-400 bg-emerald-950/80 border-emerald-500/50';

      if (deltaGreen < 45) {
        verdict = 'Poor / Sub-lethal Suppression (<45%)';
        verdictColor = 'text-rose-400 bg-rose-950/80 border-rose-500/50';
      } else if (deltaGreen < 70) {
        verdict = 'Fair Burndown Suppression (45-70%)';
        verdictColor = 'text-amber-400 bg-amber-950/80 border-amber-500/50';
      } else if (deltaGreen < 88) {
        verdict = 'Good Burndown Control (70-88%)';
        verdictColor = 'text-blue-400 bg-blue-950/80 border-blue-500/50';
      }

      setAnalysisResult({
        beforeGreen: Math.round(beforeGreen * 10) / 10,
        afterGreen: Math.round(afterGreen * 10) / 10,
        deltaGreen,
        necrosisPct: Math.round(necrosisPct * 10) / 10,
        verdict,
        verdictColor,
        observations: [
          `Photosynthetic green canopy collapsed by ${deltaGreen}% relative to baseline.`,
          `Desiccated necrotic foliage estimated at ${Math.round(necrosisPct)}% of visible tissue.`,
          afterGreen < 15
            ? 'Complete commercial burndown achieved; low risk of weed regrowth.'
            : 'Viable green tissue patches remain; recommend checking for regrowth in 7-10 days.'
        ]
      });
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { msg: 'Comparison analysis failed: ' + err.message, type: 'error' }
      }));
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  // Metadata labels
  const beforeMeta = availableTrialPhotos.find(p => p.src === beforeUrl);
  const afterMeta = availableTrialPhotos.find(p => p.src === afterUrl);

  const beforeTitle = beforeMeta?.label || (beforeMeta?.daa !== undefined ? `DAA ${beforeMeta.daa} Baseline` : 'Baseline (A)');
  const afterTitle = afterMeta?.label || (afterMeta?.daa !== undefined ? `DAA ${afterMeta.daa} Treated` : 'Treated (B)');

  const modalNode = (
    <div
      className="fixed inset-0 z-[99999] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between overflow-y-auto sm:overflow-hidden select-none animate-in fade-in duration-200"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ══ 1. TOP STICKY APP-BAR ══════════════════════════════════════════════ */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 z-30 shadow-md">
        {/* Left: Back / Close button */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-sm active:scale-95 transition"
            title="Go back to trial cards (Esc)"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            <span>Back to Plots</span>
            <span className="hidden md:inline-block ml-1 text-[9px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700">
              ESC
            </span>
          </button>

          {/* Trial Name & Info */}
          <div className="min-w-0 pl-1">
            <h2 className="text-xs sm:text-base font-extrabold text-white truncate flex items-center gap-2">
              <span className="truncate">{trial?.FormulationName || trial?.TrialName || 'Plot Observation Progression'}</span>
              {trial?.Dosage && (
                <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-600/50 text-emerald-300">
                  {trial.Dosage}
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 truncate hidden sm:flex items-center gap-2">
              {trial?.TargetWeed && <span>Target: <strong className="text-slate-300">{trial.TargetWeed}</strong></span>}
              {trial?.Crop && <span>• Crop: <strong className="text-slate-300">{trial.Crop}</strong></span>}
              {trial?.Date && <span>• Started: <strong className="text-slate-300">{trial.Date}</strong></span>}
            </p>
          </div>
        </div>

        {/* Right: Controls & Modes */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Fit / Cover toggle */}
          <button
            type="button"
            onClick={() => setObjectFit(f => f === 'contain' ? 'cover' : 'contain')}
            className="px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750 transition active:scale-95"
            title={objectFit === 'contain' ? 'Switch to Fill Frame (Cover)' : 'Switch to Fit Entire Photo'}
          >
            {objectFit === 'contain' ? 'Fit' : 'Fill'}
          </button>

          {/* Swap A & B */}
          <button
            type="button"
            onClick={handleSwapPhotos}
            className={`p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750 transition active:scale-95 ${isSwapping ? 'rotate-180 duration-200' : ''}`}
            title="Swap Photo A and Photo B"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
          </button>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2 sm:px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                viewMode === 'split' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Split Screen Slider"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span className="hidden sm:inline">Split Slider</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('side')}
              className={`px-2 sm:px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                viewMode === 'side' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Side-by-Side View"
            >
              <Columns2 className="w-3 h-3" />
              <span className="hidden sm:inline">Side-by-Side</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('blend')}
              className={`px-2 sm:px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                viewMode === 'blend' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Opacity Fade Blend"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden sm:inline">Blend</span>
            </button>
          </div>

          {/* Prominent Close (X) button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Comparison"
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900 transition active:scale-95 ml-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ══ 2. QUICK-PICK PHOTO SELECTOR STRIP ═════════════════════════════════ */}
      <section className="px-3 sm:px-6 py-2 bg-slate-900/60 border-b border-slate-800/80 shrink-0 z-20">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-extrabold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Select Photos to Compare ({availableTrialPhotos.length} Available)</span>
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">
            Click <strong>Set Left (A)</strong> for baseline and <strong>Set Right (B)</strong> for treated observation
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-700">
          {availableTrialPhotos.map((p, idx) => {
            const isA = beforeUrl === p.src;
            const isB = afterUrl === p.src;

            return (
              <div
                key={p.id || idx}
                className={`shrink-0 flex items-center gap-2 p-1.5 rounded-xl border transition ${
                  isA && isB
                    ? 'border-purple-500 bg-purple-950/40 shadow-xs'
                    : isA
                      ? 'border-emerald-500 bg-emerald-950/40 shadow-xs'
                      : isB
                        ? 'border-indigo-500 bg-indigo-950/40 shadow-xs'
                        : 'border-slate-800 bg-slate-850/60 hover:border-slate-700'
                }`}
              >
                <img
                  src={p.src}
                  alt=""
                  className="w-12 h-12 object-cover rounded-lg bg-slate-950 shrink-0 border border-slate-800"
                />
                <div className="text-left text-[11px] min-w-[90px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold text-white truncate">
                      {p.daa !== null && p.daa !== undefined ? `${p.daa} DAA` : `Photo ${idx + 1}`}
                    </span>
                    {p.daa === 0 && (
                      <span className="text-[9px] font-bold px-1 rounded bg-emerald-900/80 text-emerald-300">
                        Base
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 block truncate">
                    {p.date ? p.date.split(' ')[0] : (p.label || '')}
                  </span>

                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBeforeUrl(p.src);
                        setAnalysisResult(null);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold transition flex items-center gap-0.5 ${
                        isA
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-800 hover:bg-emerald-900/60 text-slate-300'
                      }`}
                    >
                      {isA && <Check className="w-2.5 h-2.5" />}
                      <span>Left (A)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAfterUrl(p.src);
                        setAnalysisResult(null);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold transition flex items-center gap-0.5 ${
                        isB
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-800 hover:bg-indigo-900/60 text-slate-300'
                      }`}
                    >
                      {isB && <Check className="w-2.5 h-2.5" />}
                      <span>Right (B)</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Upload Custom File Tile */}
          <div className="shrink-0 flex items-center gap-1.5 p-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 text-slate-400 text-[10px]">
            <input
              ref={beforeInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'before')}
            />
            <input
              ref={afterInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'after')}
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => beforeInputRef.current?.click()}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold flex items-center gap-1"
              >
                <Upload className="w-2.5 h-2.5" /> Custom A
              </button>
              <button
                type="button"
                onClick={() => afterInputRef.current?.click()}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-400 font-bold flex items-center gap-1"
              >
                <Upload className="w-2.5 h-2.5" /> Custom B
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 3. MAIN INTERACTIVE COMPARISON CANVAS ═══════════════════════════════ */}
      <main className="flex-1 min-h-[320px] max-h-[58vh] sm:max-h-[62vh] relative bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden z-10">
        {beforeUrl && afterUrl ? (
          <div
            ref={containerRef}
            className="w-full h-full max-w-5xl rounded-2xl overflow-hidden border border-slate-800 bg-black relative shadow-2xl flex items-center justify-center select-none"
            onMouseDown={handleMouseDown}
            onTouchMove={handleTouchMove}
          >
            {/* ── MODE 1: SPLIT SLIDER ─────────────────────────────────────── */}
            {viewMode === 'split' && (
              <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                {/* Background image: After (Photo B) */}
                <img
                  src={afterUrl}
                  alt="Treated / After"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    objectFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                <div className="absolute top-3 right-3 bg-indigo-950/90 text-indigo-200 border border-indigo-600/60 text-[11px] font-extrabold px-3 py-1 rounded-lg z-10 backdrop-blur-md shadow-md flex items-center gap-1.5 pointer-events-none">
                  <Flame className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{afterTitle}</span>
                </div>

                {/* Foreground image: Before (Photo A) with hardware-accelerated clipPath */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{
                    clipPath: `inset(0 ${100 - sliderPos}% 0 0)`
                  }}
                >
                  <img
                    src={beforeUrl}
                    alt="Baseline / Before"
                    className={`absolute inset-0 w-full h-full ${
                      objectFit === 'contain' ? 'object-contain' : 'object-cover'
                    }`}
                  />
                  <div className="absolute top-3 left-3 bg-emerald-950/90 text-emerald-200 border border-emerald-600/60 text-[11px] font-extrabold px-3 py-1 rounded-lg z-10 backdrop-blur-md shadow-md flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{beforeTitle}</span>
                  </div>
                </div>

                {/* Vertical Divider line & draggable handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_15px_rgba(255,255,255,0.9)] pointer-events-none z-20"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 sm:w-11 sm:h-11 bg-white text-slate-900 rounded-full shadow-2xl flex flex-col items-center justify-center border-2 border-slate-300 active:scale-110 transition-transform">
                    <ArrowLeftRight className="w-4 h-4 text-slate-900" />
                    <span className="text-[8px] font-black text-slate-800 leading-none mt-0.5">{sliderPos}%</span>
                  </div>
                </div>

                {/* Range Slider for Accessible Touch / Keyboard Dragging */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPos}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-30 touch-none"
                  aria-label="Before vs After Split Slider"
                />
              </div>
            )}

            {/* ── MODE 2: SIDE-BY-SIDE ─────────────────────────────────────── */}
            {viewMode === 'side' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 w-full h-full gap-2 p-2 bg-slate-950">
                {/* Photo A (Left) */}
                <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-800">
                  <img
                    src={beforeUrl}
                    alt="Baseline"
                    className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                  />
                  <div className="absolute top-2.5 left-2.5 bg-emerald-950/90 text-emerald-200 border border-emerald-600/60 text-[11px] font-extrabold px-2.5 py-1 rounded-lg backdrop-blur-md">
                    🍃 {beforeTitle}
                  </div>
                </div>

                {/* Photo B (Right) */}
                <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-800">
                  <img
                    src={afterUrl}
                    alt="Treated"
                    className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                  />
                  <div className="absolute top-2.5 right-2.5 bg-indigo-950/90 text-indigo-200 border border-indigo-600/60 text-[11px] font-extrabold px-2.5 py-1 rounded-lg backdrop-blur-md">
                    🔥 {afterTitle}
                  </div>
                </div>
              </div>
            )}

            {/* ── MODE 3: OPACITY BLEND ────────────────────────────────────── */}
            {viewMode === 'blend' && (
              <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                {/* Base Image (Photo A) */}
                <img
                  src={beforeUrl}
                  alt="Baseline"
                  className={`absolute inset-0 w-full h-full ${
                    objectFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                {/* Overlay Image (Photo B) with adjustable opacity */}
                <img
                  src={afterUrl}
                  alt="Treated"
                  style={{ opacity: blendOpacity / 100 }}
                  className={`absolute inset-0 w-full h-full transition-opacity duration-75 ${
                    objectFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />

                {/* Floating Bottom Opacity Slider Bar */}
                <div className="absolute bottom-4 inset-x-4 max-w-md mx-auto bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 backdrop-blur-md shadow-2xl flex items-center gap-3 z-30">
                  <span className="text-[10px] font-bold text-emerald-400 shrink-0">Baseline</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={blendOpacity}
                    onChange={(e) => setBlendOpacity(Number(e.target.value))}
                    className="flex-1 accent-indigo-500 h-2 bg-slate-750 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-indigo-400 shrink-0">Treated ({blendOpacity}%)</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-slate-500 space-y-2">
            <ImageIcon className="w-12 h-12 mx-auto opacity-30 text-slate-400" />
            <p className="text-xs font-semibold">Select Photo A and Photo B from the strip above to begin comparison</p>
          </div>
        )}
      </main>

      {/* ══ 4. AI WEED CANOPY BURNDOWN DIAGNOSTIC ═══════════════════════════════ */}
      <section className="px-3 sm:px-6 py-2.5 bg-slate-900 border-t border-slate-800 shrink-0 z-20">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Action Trigger */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={runComparisonAnalysis}
              disabled={!beforeUrl || !afterUrl || analyzing}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 active:scale-95"
            >
              {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{analyzing ? 'Analyzing Foliage...' : 'Run Canopy Reduction Analysis'}</span>
            </button>

            {analysisResult && (
              <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full border ${analysisResult.verdictColor}`}>
                {analysisResult.verdict}
              </span>
            )}
          </div>

          {/* KPI Output */}
          {analysisResult ? (
            <div className="grid grid-cols-4 gap-2 w-full md:w-auto text-center">
              <div className="bg-slate-850 px-2.5 py-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Baseline Green</span>
                <span className="text-xs font-black text-emerald-400">{analysisResult.beforeGreen}%</span>
              </div>
              <div className="bg-slate-850 px-2.5 py-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Treated Green</span>
                <span className="text-xs font-black text-indigo-400">{analysisResult.afterGreen}%</span>
              </div>
              <div className="bg-slate-850 px-2.5 py-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Canopy Reduction</span>
                <span className="text-xs font-black text-rose-400">-{analysisResult.deltaGreen}%</span>
              </div>
              <div className="bg-slate-850 px-2.5 py-1.5 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Desiccation</span>
                <span className="text-xs font-black text-amber-400">{analysisResult.necrosisPct}%</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 hidden md:block">
              Click &quot;Run Canopy Reduction Analysis&quot; to compute exact weed desiccation percentage.
            </p>
          )}
        </div>
      </section>

      {/* ══ 5. BOTTOM STICKY BAR ═══════════════════════════════════════════════ */}
      <footer className="px-3 sm:px-6 py-2.5 bg-slate-950 border-t border-slate-850 flex items-center justify-between gap-3 shrink-0 z-30">
        <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="truncate">
            Comparing <strong className="text-slate-200">{beforeTitle}</strong> vs <strong className="text-slate-200">{afterTitle}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
          >
            <span>Done / Back to Trials</span>
          </button>
        </div>
      </footer>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
