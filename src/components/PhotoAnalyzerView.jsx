import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Sliders, Copy, Check, Leaf } from 'lucide-react';

export default function PhotoAnalyzerView({
  isOpen,
  onClose,
  imageUrl,
  loading,
  results = [],
  onApplyValue,
  activeCategory = 'herbicide'
}) {
  const [opacity, setOpacity] = useState(0.4);
  const [minConfidence, setMinConfidence] = useState(0.4);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [copied, setCopied] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  // Dynamic category UI labels
  const getCategoryLabels = () => {
    switch (activeCategory) {
      case 'fungicide':
        return {
          title: 'Pathogen AI Analyzer',
          subtitle: 'Fungal Disease Bounding & Severity',
          entitiesLabel: 'Detected Pathogens',
          applyLabel: 'Use Total Severity',
          noResults: 'No pathogen symptoms detected.'
        };
      case 'pesticide':
      case 'insecticide':
        return {
          title: 'Pest AI Analyzer',
          subtitle: 'Insect Pest & Damage Bounding',
          entitiesLabel: 'Detected Pests / Damage',
          applyLabel: 'Use Total Damage',
          noResults: 'No insect pests or damage detected.'
        };
      case 'nutrition':
        return {
          title: 'Nutritional Stress Analyzer',
          subtitle: 'Deficiency & Chlorosis Bounding',
          entitiesLabel: 'Deficiency Symptoms',
          applyLabel: 'Use Total Severity',
          noResults: 'No nutritional stress detected.'
        };
      case 'biostimulant':
        return {
          title: 'Vigor AI Analyzer',
          subtitle: 'Canopy & Vigor Indicator Bounding',
          entitiesLabel: 'Vigor Indicators',
          applyLabel: 'Use Total Vigor',
          noResults: 'No vigor indicators detected.'
        };
      default:
        return {
          title: 'Photo AI Analyzer',
          subtitle: 'Object Bounding & Percentages',
          entitiesLabel: 'Detected Weeds',
          applyLabel: 'Use Total Cover',
          noResults: 'No weeds detected.'
        };
    }
  };

  const labels = getCategoryLabels();

  // Filter results by confidence threshold
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter(item => {
      const conf = typeof item.confidence === 'number' ? item.confidence : parseFloat(item.confidence ?? 1.0);
      return conf >= minConfidence;
    });
  }, [results, minConfidence]);

  // Redraw when filteredResults, opacity, highlightedIndex, or image loading changes
  useEffect(() => {
    if (!isOpen || !imgLoaded || !canvasRef.current || !imgRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;

    // Match canvas dimensions to the displayed image size
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!filteredResults || filteredResults.length === 0) return;

    filteredResults.forEach((item, index) => {
      if (!item.box_2d || !Array.isArray(item.box_2d) || item.box_2d.length !== 4) return;

      const [ymin, xmin, ymax, xmax] = item.box_2d;

      // Coordinates are in normalized 0-1000 scale
      const x = (xmin / 1000) * canvas.width;
      const y = (ymin / 1000) * canvas.height;
      const width = ((xmax - xmin) / 1000) * canvas.width;
      const height = ((ymax - ymin) / 1000) * canvas.height;

      const isHighlighted = highlightedIndex === index;
      
      // Select different colors based on index or names
      const hue = (index * 137.5) % 360; 
      const strokeColor = `hsla(${hue}, 85%, 50%, 0.95)`;
      const fillColor = isHighlighted 
        ? `hsla(${hue}, 85%, 50%, ${Math.min(1, opacity + 0.35)})` 
        : `hsla(${hue}, 85%, 50%, ${opacity})`;

      ctx.save();

      // Draw bounding box
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHighlighted ? 3 : 2;
      
      // Shadow for professional look
      if (isHighlighted) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
      }

      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.fill();
      ctx.stroke();

      // Draw label background
      const label = `${item.name} (${item.cover || item.value || 0}%)`;
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(label).width;
      const padding = 4;
      
      ctx.fillStyle = isHighlighted ? '#1e293b' : 'rgba(15, 23, 42, 0.85)';
      ctx.shadowBlur = 0; // disable shadow for text bg
      ctx.beginPath();
      // Draw label above box if space permits, otherwise inside
      const labelY = y > 20 ? y - 18 : y + 2;
      ctx.rect(x, labelY, textWidth + padding * 2, 16);
      ctx.fill();

      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + padding, labelY + 12);

      ctx.restore();
    });
  }, [isOpen, imgLoaded, filteredResults, opacity, highlightedIndex]);

  // Handle window resizing
  useEffect(() => {
    const handleResize = () => {
      // Trigger redraw by toggling image load status slightly or direct redraw
      if (imgRef.current && imgRef.current.complete) {
        setImgLoaded(false);
        setTimeout(() => setImgLoaded(true), 50);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!filteredResults.length) return;
    const text = filteredResults.map(w => `${w.name} (${w.commonName || ''}): ${w.cover || w.value || 0}% cover/value, ${w.growthStage || ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
        
        {/* Main image & canvas viewport */}
        <div className="flex-1 bg-slate-950 flex items-center justify-center relative min-h-[300px] md:min-h-0">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Running AI Computer Vision Analysis...</p>
            </div>
          ) : (
            <div className="relative inline-block max-w-full max-h-[70vh] p-2">
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Trial Analyzer"
                className="max-w-full max-h-[65vh] object-contain rounded"
                onLoad={() => setImgLoaded(true)}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-2 left-2 pointer-events-none"
              />
            </div>
          )}
        </div>

        {/* Sidebar panels */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-100 flex flex-col justify-between bg-slate-50/50">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                <Leaf className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">{labels.title}</h3>
                <p className="text-[10px] text-slate-400">{labels.subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredResults && filteredResults.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>{labels.entitiesLabel}</span>
                  <span>Hover/Tap to highlight</span>
                </div>
                {filteredResults.map((item, idx) => (
                  <div
                    key={idx}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseLeave={() => setHighlightedIndex(null)}
                    onClick={() => setHighlightedIndex(idx === highlightedIndex ? null : idx)}
                    className={`p-3 bg-white border rounded-xl cursor-pointer transition-all duration-200 shadow-sm ${
                      highlightedIndex === idx
                        ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                        : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: `hsl(${(idx * 137.5) % 360}, 85%, 50%)` }}></span>
                        <strong className="text-xs font-bold text-slate-800 align-middle truncate">{item.name}</strong>
                        {item.commonName && <p className="text-[10px] text-slate-500 italic mt-0.5 ml-4">{item.commonName}</p>}
                        {item.growthStage && <p className="text-[10px] text-slate-400 mt-0.5 ml-4">Stage: {item.growthStage}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-emerald-700">{item.cover || item.value || 0}%</p>
                        {item.confidence && (
                          <p className="text-[9px] text-slate-400">{(item.confidence * 100).toFixed(0)}% conf.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xs">{labels.noResults}</p>
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="p-4 border-t border-slate-100 bg-white space-y-4">
            
            {/* Opacity & Confidence sliders */}
            {results && results.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1"><Sliders className="w-3.5 h-3.5" /> Overlay Opacity</span>
                    <span>{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={opacity * 100}
                    onChange={e => setOpacity(parseFloat(e.target.value) / 100)}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1"><Sliders className="w-3.5 h-3.5" /> Min Confidence Threshold</span>
                    <span>{Math.round(minConfidence * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={minConfidence * 100}
                    onChange={e => setMinConfidence(parseFloat(e.target.value) / 100)}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                disabled={loading || !filteredResults.length}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Info
              </button>

              {onApplyValue && results && results.length > 0 && (
                <button
                  onClick={() => {
                    const totalVal = filteredResults.reduce((acc, curr) => acc + (curr.cover || curr.value || 0), 0);
                    onApplyValue(Math.min(100, totalVal));
                  }}
                  className="flex-1 py-2 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow transition"
                >
                  {labels.applyLabel} ({Math.min(100, filteredResults.reduce((acc, curr) => acc + (curr.cover || curr.value || 0), 0))}%)
                </button>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
