import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Sliders, Copy, Check, Leaf } from 'lucide-react';

export default function PhotoAnalyzerView({
  isOpen,
  onClose,
  imageUrl,
  loading,
  results = [],
  onApplyValue,
  activeCategory = 'herbicide',
  onSave
}) {
  const [opacity, setOpacity] = useState(0.4);
  const [minConfidence, setMinConfidence] = useState(0.4);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [copied, setCopied] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const [localResults, setLocalResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [dragMode, setDragMode] = useState(null); // 'move' | 'resize' | 'draw' | null
  const [resizeCorner, setResizeCorner] = useState(null); // 'tl' | 'tr' | 'bl' | 'br' | null
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedBoxOriginal, setDraggedBoxOriginal] = useState(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingRect, setDrawingRect] = useState(null);
  const [editModalData, setEditModalData] = useState(null); // { index, name, cover }

  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  // Sync results when they are fetched or modified from outside
  useEffect(() => {
    if (results) {
      setLocalResults(results);
    }
  }, [results]);

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
    if (!localResults) return [];
    return localResults.filter(item => {
      const conf = typeof item.confidence === 'number' ? item.confidence : parseFloat(item.confidence ?? 1.0);
      return conf >= minConfidence;
    });
  }, [localResults, minConfidence]);

  // Coordinate Conversion Helpers
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleSize = 8;

  const getHitTest = (mouseX, mouseY) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;

    // Check corners of selected box first (so resize handles take precedence)
    if (selectedIndex !== null) {
      const item = filteredResults[selectedIndex];
      if (item && item.box_2d) {
        const [ymin, xmin, ymax, xmax] = item.box_2d;
        const x = (xmin / 1000) * canvas.width;
        const y = (ymin / 1000) * canvas.height;
        const w = ((xmax - xmin) / 1000) * canvas.width;
        const h = ((ymax - ymin) / 1000) * canvas.height;

        const corners = {
          tl: { x, y },
          tr: { x: x + w, y },
          bl: { x, y: y + h },
          br: { x: x + w, y: y + h }
        };

        for (const [corner, pt] of Object.entries(corners)) {
          if (Math.abs(mouseX - pt.x) <= handleSize && Math.abs(mouseY - pt.y) <= handleSize) {
            return { type: 'resize', corner, index: selectedIndex };
          }
        }
      }
    }

    // Check if mouse is inside any box (reverse order for topmost first)
    for (let i = filteredResults.length - 1; i >= 0; i--) {
      const item = filteredResults[i];
      if (!item.box_2d) continue;
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      const x = (xmin / 1000) * canvas.width;
      const y = (ymin / 1000) * canvas.height;
      const w = ((xmax - xmin) / 1000) * canvas.width;
      const h = ((ymax - ymin) / 1000) * canvas.height;

      if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h) {
        return { type: 'move', index: i };
      }
    }

    return null;
  };

  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e);

    if (isDrawingMode) {
      setDragMode('draw');
      setDragStart(coords);
      setDrawingRect({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
      return;
    }

    const hit = getHitTest(coords.x, coords.y);
    if (hit) {
      setSelectedIndex(hit.index);
      setHighlightedIndex(hit.index);
      setDragMode(hit.type);
      setDragStart(coords);

      const item = filteredResults[hit.index];
      setDraggedBoxOriginal([...item.box_2d]);
      if (hit.type === 'resize') {
        setResizeCorner(hit.corner);
      }
    } else {
      setSelectedIndex(null);
    }
  };

  const handleMouseMove = (e) => {
    const coords = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!dragMode) {
      if (isDrawingMode) {
        canvas.style.cursor = 'crosshair';
      } else {
        const hit = getHitTest(coords.x, coords.y);
        if (hit) {
          if (hit.type === 'resize') {
            canvas.style.cursor = (hit.corner === 'tl' || hit.corner === 'br') ? 'nwse-resize' : 'nesw-resize';
          } else {
            canvas.style.cursor = 'move';
          }
        } else {
          canvas.style.cursor = 'default';
        }
      }
      return;
    }

    if (dragMode === 'draw') {
      setDrawingRect(prev => ({ ...prev, x2: coords.x, y2: coords.y }));
      return;
    }

    if (selectedIndex === null || !draggedBoxOriginal) return;

    const dx = ((coords.x - dragStart.x) / canvas.width) * 1000;
    const dy = ((coords.y - dragStart.y) / canvas.height) * 1000;

    let [ymin, xmin, ymax, xmax] = draggedBoxOriginal;

    const updateLocalBox = (index, newBox2d) => {
      setLocalResults(prev => prev.map((item, idx) => {
        const filteredItem = filteredResults[index];
        if (item === filteredItem) {
          return { ...item, box_2d: newBox2d };
        }
        return item;
      }));
    };

    if (dragMode === 'move') {
      let nextXmin = Math.max(0, Math.min(1000, xmin + dx));
      let nextYmin = Math.max(0, Math.min(1000, ymin + dy));
      let nextXmax = Math.max(0, Math.min(1000, xmax + dx));
      let nextYmax = Math.max(0, Math.min(1000, ymax + dy));

      const w = xmax - xmin;
      const h = ymax - ymin;
      if (nextXmin === 0) nextXmax = w;
      if (nextXmax === 1000) nextXmin = 1000 - w;
      if (nextYmin === 0) nextYmax = h;
      if (nextYmax === 1000) nextYmin = 1000 - h;

      updateLocalBox(selectedIndex, [nextYmin, nextXmin, nextYmax, nextXmax]);
    } else if (dragMode === 'resize') {
      if (resizeCorner === 'tl') {
        xmin = Math.max(0, Math.min(xmax - 10, xmin + dx));
        ymin = Math.max(0, Math.min(ymax - 10, ymin + dy));
      } else if (resizeCorner === 'tr') {
        xmax = Math.max(xmin + 10, Math.min(1000, xmax + dx));
        ymin = Math.max(0, Math.min(ymax - 10, ymin + dy));
      } else if (resizeCorner === 'bl') {
        xmin = Math.max(0, Math.min(xmax - 10, xmin + dx));
        ymax = Math.max(ymin + 10, Math.min(1000, ymax + dy));
      } else if (resizeCorner === 'br') {
        xmax = Math.max(xmin + 10, Math.min(1000, xmax + dx));
        ymax = Math.max(ymin + 10, Math.min(1000, ymax + dy));
      }
      updateLocalBox(selectedIndex, [ymin, xmin, ymax, xmax]);
    }
  };

  const handleMouseUp = () => {
    let updatedResults = localResults;
    if (dragMode === 'draw' && drawingRect) {
      const canvas = canvasRef.current;
      if (canvas) {
        const xmin = Math.min(drawingRect.x1, drawingRect.x2);
        const xmax = Math.max(drawingRect.x1, drawingRect.x2);
        const ymin = Math.min(drawingRect.y1, drawingRect.y2);
        const ymax = Math.max(drawingRect.y1, drawingRect.y2);

        const w = xmax - xmin;
        const h = ymax - ymin;

        if (w > 10 && h > 10) {
          const normXmin = (xmin / canvas.width) * 1000;
          const normXmax = (xmax / canvas.width) * 1000;
          const normYmin = (ymin / canvas.height) * 1000;
          const normYmax = (ymax / canvas.height) * 1000;

          const newBox = {
            name: activeCategory === 'herbicide' ? 'Weed' : 'Symptom',
            cover: 5,
            confidence: 1.0,
            box_2d: [normYmin, normXmin, normYmax, normXmax]
          };

          updatedResults = [...localResults, newBox];
          setLocalResults(updatedResults);
          setSelectedIndex(updatedResults.length - 1);

          setEditModalData({
            index: updatedResults.length - 1,
            name: newBox.name,
            cover: newBox.cover
          });
        }
      }
      setDrawingRect(null);
      setIsDrawingMode(false);
    }

    setDragMode(null);
    setResizeCorner(null);
    setDraggedBoxOriginal(null);

    if (onSave) {
      onSave(updatedResults);
    }
  };

  const handleDoubleClick = (e) => {
    const coords = getCanvasCoords(e);
    const hit = getHitTest(coords.x, coords.y);
    if (hit && hit.type === 'move') {
      const item = filteredResults[hit.index];
      const actualIndex = localResults.findIndex(r => r === item);
      if (actualIndex !== -1) {
        setEditModalData({
          index: actualIndex,
          name: item.name,
          cover: item.cover || item.value || 0
        });
      }
    }
  };

  // Keyboard deletion support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!editModalData && selectedIndex !== null) {
          const item = filteredResults[selectedIndex];
          const actualIndex = localResults.findIndex(r => r === item);
          if (actualIndex !== -1) {
            const updated = localResults.filter((_, idx) => idx !== actualIndex);
            setLocalResults(updated);
            setSelectedIndex(null);
            if (onSave) onSave(updated);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, localResults, filteredResults, editModalData, onSave]);

  // Redraw canvas
  useEffect(() => {
    if (!isOpen || !imgLoaded || !canvasRef.current || !imgRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (filteredResults.length === 0 && !drawingRect) return;

    filteredResults.forEach((item, index) => {
      if (!item.box_2d || !Array.isArray(item.box_2d) || item.box_2d.length !== 4) return;

      const [ymin, xmin, ymax, xmax] = item.box_2d;

      const x = (xmin / 1000) * canvas.width;
      const y = (ymin / 1000) * canvas.height;
      const width = ((xmax - xmin) / 1000) * canvas.width;
      const height = ((ymax - ymin) / 1000) * canvas.height;

      const isHighlighted = highlightedIndex === index || selectedIndex === index;

      const hue = (index * 137.5) % 360;
      const strokeColor = `hsla(${hue}, 85%, 50%, 0.95)`;
      const fillColor = isHighlighted
        ? `hsla(${hue}, 85%, 50%, ${Math.min(1, opacity + 0.35)})`
        : `hsla(${hue}, 85%, 50%, ${opacity})`;

      ctx.save();

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHighlighted ? 3 : 2;

      if (isHighlighted) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
      }

      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.fill();
      ctx.stroke();

      // Draw corner handles if selected
      if (selectedIndex === index) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;

        const corners = [
          { cx: x, cy: y },
          { cx: x + width, cy: y },
          { cx: x, cy: y + height },
          { cx: x + width, cy: y + height }
        ];

        corners.forEach(pt => {
          ctx.beginPath();
          ctx.rect(pt.cx - 4, pt.cy - 4, 8, 8);
          ctx.fill();
          ctx.stroke();
        });
      }

      // Draw label background
      const label = `${item.name} (${item.cover || item.value || 0}%)`;
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(label).width;
      const padding = 4;

      ctx.fillStyle = isHighlighted ? '#1e293b' : 'rgba(15, 23, 42, 0.85)';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      const labelY = y > 20 ? y - 18 : y + 2;
      ctx.rect(x, labelY, textWidth + padding * 2, 16);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + padding, labelY + 12);

      ctx.restore();
    });

    // Draw active drawing dashed rectangle
    if (dragMode === 'draw' && drawingRect) {
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        drawingRect.x1,
        drawingRect.y1,
        drawingRect.x2 - drawingRect.x1,
        drawingRect.y2 - drawingRect.y1
      );
      ctx.restore();
    }
  }, [isOpen, imgLoaded, filteredResults, opacity, highlightedIndex, selectedIndex, dragMode, drawingRect]);

  // Handle window resizing
  useEffect(() => {
    const handleResize = () => {
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
                className="max-w-full max-h-[65vh] object-contain rounded select-none"
                onLoad={() => setImgLoaded(true)}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-2 left-2"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
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
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>{labels.entitiesLabel}</span>
                  <button
                    onClick={() => setIsDrawingMode(!isDrawingMode)}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition ${isDrawingMode ? 'bg-emerald-600 text-white animate-pulse' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                  >
                    {isDrawingMode ? 'Drawing...' : '+ Add Box'}
                  </button>
                </div>

                {isDrawingMode && (
                  <div className="p-2 bg-emerald-50 text-emerald-800 text-[10px] rounded-lg border border-emerald-100 mb-2">
                    Click and drag anywhere on the image to draw a new bounding box.
                  </div>
                )}

                {filteredResults.length > 0 ? (
                  filteredResults.map((item, idx) => (
                    <div
                      key={idx}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onMouseLeave={() => setHighlightedIndex(null)}
                      onClick={() => setSelectedIndex(idx === selectedIndex ? null : idx)}
                      onDoubleClick={() => {
                        const actualIndex = localResults.findIndex(r => r === item);
                        if (actualIndex !== -1) {
                          setEditModalData({
                            index: actualIndex,
                            name: item.name,
                            cover: item.cover || item.value || 0
                          });
                        }
                      }}
                      className={`p-3 bg-white border rounded-xl cursor-pointer transition-all duration-200 shadow-sm ${
                        selectedIndex === idx
                          ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                          : highlightedIndex === idx
                          ? 'border-slate-300 bg-slate-50'
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
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-xs">{labels.noResults}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="p-4 border-t border-slate-100 bg-white space-y-4">

            {/* Opacity & Confidence sliders */}
            {localResults && localResults.length > 0 && (
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

              {onApplyValue && localResults && localResults.length > 0 && (
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

      {/* Edit Box Modal */}
      {editModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-100 animate-scale-up">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-slate-800 text-sm">Edit Observation Area</h4>
              <button onClick={() => setEditModalData(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Name / Label</label>
                <input
                  type="text"
                  value={editModalData.name}
                  onChange={e => setEditModalData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Cover / Value (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editModalData.cover}
                  onChange={e => setEditModalData(prev => ({ ...prev, cover: parseInt(e.target.value) || 0 }))}
                  className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  const updated = localResults.filter((_, idx) => idx !== editModalData.index);
                  setLocalResults(updated);
                  setSelectedIndex(null);
                  setEditModalData(null);
                  if (onSave) onSave(updated);
                }}
                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition mr-auto"
              >
                Delete
              </button>
              <button
                onClick={() => setEditModalData(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updated = localResults.map((item, idx) => {
                    if (idx === editModalData.index) {
                      return { ...item, name: editModalData.name, cover: editModalData.cover, value: editModalData.cover };
                    }
                    return item;
                  });
                  setLocalResults(updated);
                  setEditModalData(null);
                  if (onSave) onSave(updated);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
