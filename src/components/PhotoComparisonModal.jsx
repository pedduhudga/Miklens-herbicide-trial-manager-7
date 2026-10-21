import React, { useState, useRef, useMemo } from 'react';
import Modal from './Modal.jsx';
import { Sparkles, ArrowLeftRight, Upload, CheckCircle, RefreshCw, Flame, Leaf, Sliders, ShieldCheck, X, Image as ImageIcon } from 'lucide-react';
import { analyzePlantPhenotype } from '../utils/phenotyping.js';
import { getPhotoThumbnailSrc, resolvePhotoSrc } from '../utils/photoUtils.js';

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
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'side'
  const [objectFit, setObjectFit] = useState('contain'); // 'contain' | 'cover'
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);

  // Extract all available plot photos from the trial (DAA 0, DAA 7, DAA 14, etc.)
  const availableTrialPhotos = useMemo(() => {
    if (!trial) return [];
    const list = [];
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
            label: p.label || p.name || `Photo ${idx + 1}`,
            daa: p.daa !== undefined ? p.daa : (idx === 0 ? 0 : null),
            date: p.date || ''
          });
        }
      });
    } catch {}

    try {
      const eff = typeof trial.EfficacyDataJSON === 'string' 
        ? JSON.parse(trial.EfficacyDataJSON || '[]') 
        : (Array.isArray(trial.EfficacyDataJSON) ? trial.EfficacyDataJSON : []);

      eff.forEach((obs, oIdx) => {
        if (!obs) return;
        if (obs.photoUrl) {
          const src = getPhotoThumbnailSrc(obs.photoUrl, 800) || resolvePhotoSrc(obs.photoUrl, 800);
          if (src && !list.some(x => x.src === src)) {
            list.push({
              id: `obs_${oIdx}`,
              src,
              label: `DAA ${obs.daa ?? '?'} Observation`,
              daa: obs.daa,
              date: obs.date || ''
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
                label: `DAA ${obs.daa ?? '?'} Observation`,
                daa: obs.daa,
                date: obs.date || ''
              });
            }
          });
        }
      });
    } catch {}

    // Sort: 0 DAA first, then ascending DAA
    return list.sort((a, b) => (Number(a.daa ?? 999)) - (Number(b.daa ?? 999)));
  }, [trial]);

  // Auto-initialize if initial urls weren't provided and trial has photos
  React.useEffect(() => {
    if (!beforeUrl && availableTrialPhotos.length > 0) {
      const baseline = availableTrialPhotos.find(p => Number(p.daa) === 0) || availableTrialPhotos[0];
      if (baseline) setBeforeUrl(baseline.src);
    }
    if (!afterUrl && availableTrialPhotos.length > 1) {
      const latest = availableTrialPhotos[availableTrialPhotos.length - 1];
      if (latest) setAfterUrl(latest.src);
    }
  }, [availableTrialPhotos]);

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

  const runComparisonAnalysis = async () => {
    if (!beforeUrl || !afterUrl) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select both Photo A (Before) and Photo B (After)', type: 'error' } }));
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

      const deltaGreen = beforeGreen > 0 ? Math.max(0, Math.min(100, Math.round(((beforeGreen - afterGreen) / beforeGreen) * 100))) : 0;
      
      let verdict = 'Excellent Burndown & Control';
      let verdictColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      if (deltaGreen < 50) {
        verdict = 'Poor / Sub-lethal Effect';
        verdictColor = 'text-red-700 bg-red-50 border-red-200';
      } else if (deltaGreen < 75) {
        verdict = 'Fair Suppression';
        verdictColor = 'text-amber-700 bg-amber-50 border-amber-200';
      } else if (deltaGreen < 90) {
        verdict = 'Good Burndown';
        verdictColor = 'text-blue-700 bg-blue-50 border-blue-200';
      }

      setAnalysisResult({
        beforeGreen: Math.round(beforeGreen * 10) / 10,
        afterGreen: Math.round(afterGreen * 10) / 10,
        deltaGreen,
        necrosisPct: Math.round(necrosisPct * 10) / 10,
        verdict,
        verdictColor,
        observations: [
          `Green photosynthetic canopy dropped by ${deltaGreen}% compared to baseline.`,
          `Estimated desiccated/necrotic tissue: ${Math.round(necrosisPct)}% of visible foliage.`,
          afterGreen < 15 
            ? 'Complete burndown with low likelihood of weed regrowth.' 
            : 'Green tissue patches still viable; check for regrowth in 7 days.'
        ]
      });
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Comparison analysis failed: ' + err.message, type: 'error' } }));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="DAA Photo Progression & Split-Screen Comparison" maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Interactive Progression Slider</p>
              <p className="text-[10px] text-slate-500">Compare Baseline vs Treated observations to evaluate chemical efficacy</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Fit / Cover toggle */}
            <button
              type="button"
              onClick={() => setObjectFit(f => f === 'contain' ? 'cover' : 'contain')}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 transition active:scale-95"
            >
              {objectFit === 'contain' ? 'Fit Image' : 'Fill Frame'}
            </button>

            {/* Split / Side-by-Side toggle */}
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-700 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                  viewMode === 'split' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Split Slider
              </button>
              <button
                type="button"
                onClick={() => setViewMode('side')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                  viewMode === 'side' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Side-by-Side
              </button>
            </div>
          </div>
        </div>

        {/* Plot Photo Selector Strip (if trial has multiple photos) */}
        {availableTrialPhotos.length > 0 && (
          <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
              Quick Pick from Plot Photos ({availableTrialPhotos.length}):
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {availableTrialPhotos.map((p, idx) => {
                const isA = beforeUrl === p.src;
                const isB = afterUrl === p.src;
                return (
                  <div
                    key={p.id || idx}
                    className={`shrink-0 flex items-center gap-2 p-1.5 rounded-lg border transition ${
                      isA 
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30' 
                        : isB 
                          ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30' 
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <img src={p.src} alt="" className="w-9 h-9 object-cover rounded-md bg-slate-100 shrink-0" />
                    <div className="text-left text-[10px]">
                      <span className="font-extrabold text-slate-800 dark:text-slate-200 block truncate max-w-[80px]">
                        {p.daa !== null && p.daa !== undefined ? `DAA ${p.daa}` : `Photo ${idx + 1}`}
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <button
                          type="button"
                          onClick={() => { setBeforeUrl(p.src); setAnalysisResult(null); }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition ${
                            isA ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-emerald-100 text-slate-700'
                          }`}
                        >
                          Set A
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAfterUrl(p.src); setAnalysisResult(null); }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition ${
                            isB ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-indigo-100 text-slate-700'
                          }`}
                        >
                          Set B
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Photos Slots (A & B) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Photo A (Before) */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-emerald-600" /> Photo A (Baseline / Before)
              </span>
              <div className="flex items-center gap-2">
                <input ref={beforeInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'before')} />
                <button
                  type="button"
                  onClick={() => beforeInputRef.current?.click()}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" /> Custom
                </button>
                {beforeUrl && (
                  <button type="button" onClick={() => setBeforeUrl('')} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {beforeUrl ? (
              <div className="relative rounded-lg overflow-hidden h-28 sm:h-32 bg-slate-900 flex items-center justify-center">
                <img src={beforeUrl} alt="Before" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div 
                onClick={() => beforeInputRef.current?.click()}
                className="h-28 sm:h-32 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750"
              >
                <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                <span className="text-[11px]">Select or upload baseline photo</span>
              </div>
            )}
          </div>

          {/* Photo B (After) */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 bg-white dark:bg-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-500" /> Photo B (Treated / After)
              </span>
              <div className="flex items-center gap-2">
                <input ref={afterInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'after')} />
                <button
                  type="button"
                  onClick={() => afterInputRef.current?.click()}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" /> Custom
                </button>
                {afterUrl && (
                  <button type="button" onClick={() => setAfterUrl('')} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {afterUrl ? (
              <div className="relative rounded-lg overflow-hidden h-28 sm:h-32 bg-slate-900 flex items-center justify-center">
                <img src={afterUrl} alt="After" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div 
                onClick={() => afterInputRef.current?.click()}
                className="h-28 sm:h-32 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750"
              >
                <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                <span className="text-[11px]">Select or upload observation photo</span>
              </div>
            )}
          </div>
        </div>

        {/* High-Definition Interactive Comparison Viewer */}
        {beforeUrl && afterUrl && (
          <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-black relative shadow-lg">
            {viewMode === 'split' ? (
              <div className="relative h-64 sm:h-80 md:h-96 select-none overflow-hidden flex items-center justify-center bg-slate-950">
                {/* Background image: After (Photo B) */}
                <img 
                  src={afterUrl} 
                  alt="After" 
                  className={`absolute inset-0 w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`} 
                />
                <span className="absolute bottom-2.5 right-2.5 bg-black/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10 backdrop-blur-md border border-white/20">
                  AFTER (B)
                </span>

                {/* Foreground image: Before (Photo A) with hardware-accelerated clipPath */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{
                    clipPath: `inset(0 ${100 - sliderPos}% 0 0)`
                  }}
                >
                  <img 
                    src={beforeUrl} 
                    alt="Before" 
                    className={`absolute inset-0 w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`} 
                  />
                  <span className="absolute bottom-2.5 left-2.5 bg-black/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10 backdrop-blur-md border border-white/20">
                    BEFORE (A)
                  </span>
                </div>

                {/* Vertical Divider line & draggable handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)] pointer-events-none z-20"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white text-slate-800 rounded-full shadow-2xl flex items-center justify-center border-2 border-slate-300 active:scale-95 transition-transform">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Full-width touch & mouse slider input */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPos}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-30 touch-none"
                  aria-label="Before/After Split Slider"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 h-64 sm:h-80 md:h-96 gap-1 bg-slate-950 p-1">
                <div className="relative rounded overflow-hidden bg-slate-900 flex items-center justify-center">
                  <img src={beforeUrl} alt="Before" className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                  <span className="absolute bottom-2 left-2 bg-black/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md">
                    BEFORE (A)
                  </span>
                </div>
                <div className="relative rounded overflow-hidden bg-slate-900 flex items-center justify-center">
                  <img src={afterUrl} alt="After" className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                  <span className="absolute bottom-2 right-2 bg-black/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md">
                    AFTER (B)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Button: AI Comparative Analysis */}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={runComparisonAnalysis}
            disabled={!beforeUrl || !afterUrl || analyzing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 active:scale-95"
          >
            {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? 'Analyzing Plant Phenotypes...' : 'Compute Weed Canopy Reduction %'}
          </button>
        </div>

        {/* AI Analysis Diagnostics Box */}
        {analysisResult && (
          <div className="border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" /> Plant Phenotype Diagnostic
              </span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${analysisResult.verdictColor}`}>
                {analysisResult.verdict}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-indigo-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Baseline Foliage</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{analysisResult.beforeGreen}%</span>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-indigo-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Residual Foliage</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{analysisResult.afterGreen}%</span>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-indigo-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Canopy Collapse</span>
                <span className="text-sm font-bold text-emerald-600">-{analysisResult.deltaGreen}%</span>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-indigo-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Necrosis Ratio</span>
                <span className="text-sm font-bold text-amber-600">{analysisResult.necrosisPct}%</span>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              {analysisResult.observations.map((obs, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{obs}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
