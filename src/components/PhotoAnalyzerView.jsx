import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Sliders, Copy, Check, Leaf, Activity, Sparkles, SlidersHorizontal, Eye, Flame, RefreshCw, ArrowLeftRight, Clock, Image as ImageIcon, Split } from 'lucide-react';
import { analyzePlantPhenotype, comparePhenotypeProgression } from '../utils/phenotyping.js';

export default function PhotoAnalyzerView({
  isOpen,
  onClose,
  imageUrl,
  loading,
  results = [],
  onApplyValue,
  activeCategory = 'herbicide',
  onSave,
  allPhotos = []
}) {
  const [opacity, setOpacity] = useState(0.4);
  const [minConfidence, setMinConfidence] = useState(0.4);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [copied, setCopied] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // --- Pixel Phenotyping State ---
  const [activeAnalysisMode, setActiveAnalysisMode] = useState('boxes'); // 'boxes' | 'phenotype' | 'progression'
  const [phenotypeResult, setPhenotypeResult] = useState(null);
  const [phenotypeLoading, setPhenotypeLoading] = useState(false);
  const [showPhenotypeMask, setShowPhenotypeMask] = useState(true);

  // --- Temporal Progression State ---
  const candidatePhotos = useMemo(() => {
    const list = Array.isArray(allPhotos) ? allPhotos : [];
    return list.map(p => {
      if (typeof p === 'string') return { url: p, name: 'Observation Photo', daa: null, date: '' };
      return {
        url: p.fileData || p.url || p.dataUrl || p.driveId || '',
        name: p.fileName || p.name || p.label || 'Observation Photo',
        daa: p.daa !== undefined ? p.daa : (p.day !== undefined ? p.day : null),
        date: p.date || p.timestamp || ''
      };
    }).filter(p => p.url && p.url !== imageUrl);
  }, [allPhotos, imageUrl]);

  const [baselinePhotoUrl, setBaselinePhotoUrl] = useState('');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [progressionResult, setProgressionResult] = useState(null);
  const [progressionLoading, setProgressionLoading] = useState(false);
  const splitContainerRef = useRef(null);

  // Set default baseline photo when candidatePhotos change
  useEffect(() => {
    if (candidatePhotos.length > 0 && !baselinePhotoUrl) {
      const zeroDaa = candidatePhotos.find(p => p.daa === 0 || String(p.daa) === '0');
      setBaselinePhotoUrl(zeroDaa ? zeroDaa.url : candidatePhotos[0].url);
    }
  }, [candidatePhotos, baselinePhotoUrl]);

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

  // Autonomous Phenotyping runner
  const runPhenotyping = useCallback(async () => {
    if (!imgRef.current) return;
    setPhenotypeLoading(true);
    try {
      const res = await analyzePlantPhenotype(imgRef.current, { generateHeatmap: true });
      setPhenotypeResult(res);
    } catch (err) {
      console.warn('[PhotoAnalyzerView] Phenotyping error:', err);
    } finally {
      setPhenotypeLoading(false);
    }
  }, []);

  // Temporal Progression runner
  const runProgressionComparison = useCallback(async (customBaseline) => {
    const targetBaseline = customBaseline || baselinePhotoUrl;
    if (!imageUrl || !targetBaseline) return;
    setProgressionLoading(true);
    try {
      const res = await comparePhenotypeProgression(targetBaseline, imageUrl, {
        daysBetween: 7,
        generateHeatmaps: false
      });
      setProgressionResult(res);
    } catch (err) {
      console.warn('[PhotoAnalyzerView] Progression analysis error:', err);
    } finally {
      setProgressionLoading(false);
    }
  }, [imageUrl, baselinePhotoUrl]);

  useEffect(() => {
    if (activeAnalysisMode === 'phenotype' && !phenotypeResult && !phenotypeLoading && imgLoaded) {
      runPhenotyping();
    } else if (activeAnalysisMode === 'progression' && baselinePhotoUrl && !progressionResult && !progressionLoading) {
      runProgressionComparison();
    }
  }, [activeAnalysisMode, phenotypeResult, phenotypeLoading, imgLoaded, runPhenotyping, baselinePhotoUrl, progressionResult, progressionLoading, runProgressionComparison]);

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

    // If viewing autonomous phenotype mask, draw heatmap image
    if (activeAnalysisMode === 'phenotype') {
      if (showPhenotypeMask && phenotypeResult?.heatmapDataUrl) {
        const maskImg = new Image();
        maskImg.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.globalAlpha = Math.min(0.85, opacity + 0.2);
          ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        };
        maskImg.src = phenotypeResult.heatmapDataUrl;
      }
      return;
    }

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
  }, [isOpen, imgLoaded, filteredResults, opacity, highlightedIndex, selectedIndex, dragMode, drawingRect, activeAnalysisMode, showPhenotypeMask, phenotypeResult]);

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
          ) : activeAnalysisMode === 'progression' && baselinePhotoUrl ? (
            <div
              ref={splitContainerRef}
              onMouseMove={(e) => {
                if (!isDraggingSlider || !splitContainerRef.current) return;
                const rect = splitContainerRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
                setSliderPosition(Math.round(pct));
              }}
              onTouchMove={(e) => {
                if (!isDraggingSlider || !splitContainerRef.current) return;
                const rect = splitContainerRef.current.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
                setSliderPosition(Math.round(pct));
              }}
              onMouseUp={() => setIsDraggingSlider(false)}
              onTouchEnd={() => setIsDraggingSlider(false)}
              onMouseLeave={() => setIsDraggingSlider(false)}
              className="relative inline-block max-w-full max-h-[70vh] p-2 select-none overflow-hidden"
            >
              {/* Current Observation Photo (Base layer) */}
              <img
                src={imageUrl}
                alt="Current Observation"
                className="max-w-full max-h-[65vh] object-contain rounded select-none block pointer-events-none"
              />

              {/* Baseline Photo (Clipped Overlay layer) */}
              <div
                className="absolute inset-2 overflow-hidden pointer-events-none rounded"
                style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
              >
                <img
                  src={baselinePhotoUrl}
                  alt="Baseline Observation"
                  className="max-w-full max-h-[65vh] object-contain select-none block"
                />
              </div>

              {/* Draggable Vertical Divider Handle */}
              <div
                className="absolute top-2 bottom-2 w-1 bg-white shadow-xl flex items-center justify-center cursor-ew-resize z-30"
                style={{ left: `calc(${sliderPosition}% + 4px)` }}
                onMouseDown={() => setIsDraggingSlider(true)}
                onTouchStart={() => setIsDraggingSlider(true)}
              >
                <div className="w-8 h-8 rounded-full bg-white shadow-2xl border-2 border-blue-600 flex items-center justify-center text-blue-800 text-xs font-black select-none active:scale-110 transition-transform">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
              </div>

              {/* Floating badges for Baseline vs Current */}
              <div className="absolute top-4 left-4 z-20 px-2.5 py-1 bg-slate-900/80 text-white rounded-lg text-[10px] font-bold backdrop-blur-xs shadow">
                0 DAA Baseline
              </div>
              <div className="absolute top-4 right-4 z-20 px-2.5 py-1 bg-blue-900/80 text-white rounded-lg text-[10px] font-bold backdrop-blur-xs shadow">
                Current Observation
              </div>
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

          {/* Analysis Mode Switcher */}
          <div className="p-2 border-b border-slate-100 bg-white flex gap-1">
            <button
              type="button"
              onClick={() => setActiveAnalysisMode('boxes')}
              className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                activeAnalysisMode === 'boxes'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Leaf className="w-3.5 h-3.5" />
              <span>Boxes</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveAnalysisMode('phenotype');
                if (!phenotypeResult && !phenotypeLoading) runPhenotyping();
              }}
              className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                activeAnalysisMode === 'phenotype'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Phenotype</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveAnalysisMode('progression');
                if (!progressionResult && !progressionLoading && baselinePhotoUrl) runProgressionComparison();
              }}
              className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                activeAnalysisMode === 'progression'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Progression</span>
            </button>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeAnalysisMode === 'progression' ? (
              <div className="space-y-3.5">
                {/* Baseline selector */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>Baseline (0 DAA) Photo</span>
                    <Clock className="w-3 h-3 text-blue-600" />
                  </label>
                  {candidatePhotos.length > 0 ? (
                    <select
                      value={baselinePhotoUrl}
                      onChange={(e) => {
                        setBaselinePhotoUrl(e.target.value);
                        setProgressionResult(null);
                        runProgressionComparison(e.target.value);
                      }}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {candidatePhotos.map((p, idx) => (
                        <option key={idx} value={p.url}>
                          {p.daa !== null ? `${p.daa} DAA - ` : ''}{p.name} {p.date ? `(${p.date})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      Trial has one photo. Add or select another observation photo to compare progression.
                    </p>
                  )}
                </div>

                {/* KPI Progression Card */}
                {progressionLoading ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                    <span className="text-xs font-medium">Computing Canopy Delta & Desiccation...</span>
                  </div>
                ) : progressionResult ? (
                  <div className="space-y-3">
                    <div className="bg-gradient-to-br from-blue-900 to-slate-900 text-white p-3.5 rounded-xl border border-blue-800/40 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-300 flex items-center gap-1">
                          <ArrowLeftRight className="w-3 h-3 text-blue-400" /> Knockdown Rate
                        </span>
                        <span className="text-[10px] font-mono text-blue-300">Baseline-Adjusted</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-black text-white">
                          {progressionResult.knockdownRate}%
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                          Weed Suppression
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                        <div className="text-[10px] font-bold uppercase text-emerald-700">Canopy Loss</div>
                        <div className="text-base font-black text-slate-800 mt-0.5">
                          {progressionResult.deltaGreenPct > 0 ? `-${progressionResult.deltaGreenPct}%` : '0%'}
                        </div>
                        <div className="text-[10px] text-slate-400">Live foliage reduction</div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-amber-100 shadow-2xs">
                        <div className="text-[10px] font-bold uppercase text-amber-700">Necrosis Gain</div>
                        <div className="text-base font-black text-slate-800 mt-0.5">
                          +{progressionResult.deltaNecrosisPct}%
                        </div>
                        <div className="text-[10px] text-slate-400">Tissue burn progression</div>
                      </div>
                    </div>

                    {progressionResult.desiccationVelocity && (
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 text-xs flex justify-between items-center">
                        <span className="text-slate-500 font-semibold">Desiccation Velocity:</span>
                        <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {progressionResult.desiccationVelocity}% / day
                        </span>
                      </div>
                    )}

                    {/* Quick Swipe Presets */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 space-y-1.5">
                      <div className="flex justify-between text-[11px] font-bold text-slate-600">
                        <span>Swipe Split Position</span>
                        <span className="font-mono text-blue-700">{sliderPosition}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderPosition}
                        onChange={(e) => setSliderPosition(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between gap-1 pt-1">
                        <button type="button" onClick={() => setSliderPosition(25)} className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600">25%</button>
                        <button type="button" onClick={() => setSliderPosition(50)} className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 hover:bg-blue-200 rounded text-blue-700">50%</button>
                        <button type="button" onClick={() => setSliderPosition(75)} className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600">75%</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => runProgressionComparison()}
                    disabled={!baselinePhotoUrl}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2"
                  >
                    <ArrowLeftRight className="w-4 h-4" /> Compare Canopy Progression
                  </button>
                )}
              </div>
            ) : activeAnalysisMode === 'phenotype' ? (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-purple-900 to-slate-900 text-white p-3.5 rounded-xl border border-purple-800/40 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-purple-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-400" /> Autonomous Index
                    </span>
                    <span className="text-[10px] font-mono text-purple-300">ExG (2G-R-B)</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-black text-white">
                      {phenotypeResult ? `${phenotypeResult.estimatedWeedControlPct}%` : '—'}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Estimated Weed Kill
                    </span>
                  </div>
                </div>

                {phenotypeLoading ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <RefreshCw className="w-6 h-6 text-purple-600 animate-spin" />
                    <span className="text-xs font-medium">Scanning Foliage Pixels (ExG & Necrosis)...</span>
                  </div>
                ) : phenotypeResult ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                        <div className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Green Canopy
                        </div>
                        <div className="text-lg font-black text-slate-800 mt-0.5">{phenotypeResult.greenCanopyPct}%</div>
                        <div className="text-[10px] text-slate-400">Healthy live foliage</div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-amber-100 shadow-2xs">
                        <div className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          Necrosis / Burn
                        </div>
                        <div className="text-lg font-black text-slate-800 mt-0.5">{phenotypeResult.necrosisPct}%</div>
                        <div className="text-[10px] text-slate-400">Desiccated foliage</div>
                      </div>
                    </div>

                    {/* Breakdown bar */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1.5">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700">
                        <span>Canopy Composition</span>
                        <span className="font-mono text-slate-500">{phenotypeResult.totalFoliagePixels?.toLocaleString?.() || phenotypeResult.totalFoliagePixels} px</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        <div style={{ width: `${phenotypeResult.necrosisPct}%` }} className="bg-amber-500 h-full" title="Desiccated" />
                        <div style={{ width: `${phenotypeResult.greenCanopyPct}%` }} className="bg-emerald-500 h-full" title="Green Foliage" />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />Necrotic {phenotypeResult.necrosisPct}%</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Green {phenotypeResult.greenCanopyPct}%</span>
                      </div>
                    </div>

                    {/* Heatmap overlay toggle */}
                    <label className="flex items-center justify-between p-2.5 bg-purple-50/50 border border-purple-100 rounded-xl cursor-pointer hover:bg-purple-50 transition">
                      <span className="text-xs font-semibold text-purple-900 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-purple-600" />
                        Overlay Phenotype Heatmap
                      </span>
                      <input
                        type="checkbox"
                        checked={showPhenotypeMask}
                        onChange={e => setShowPhenotypeMask(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={runPhenotyping}
                      className="w-full py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1 hover:bg-slate-100 rounded-lg transition"
                    >
                      <RefreshCw className="w-3 h-3" /> Re-scan Pixels
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={runPhenotyping}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Start Autonomous Phenotype Scan
                  </button>
                )}
              </div>
            ) : loading ? (
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

              {activeAnalysisMode === 'progression' ? (
                <button
                  type="button"
                  disabled={!progressionResult}
                  onClick={() => {
                    if (progressionResult && progressionResult.knockdownRate !== undefined && onApplyValue) {
                      onApplyValue(progressionResult.knockdownRate);
                      onClose();
                    }
                  }}
                  className="flex-1 py-2 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow transition"
                >
                  Apply Knockdown ({progressionResult ? progressionResult.knockdownRate : 0}%)
                </button>
              ) : activeAnalysisMode === 'phenotype' ? (
                <button
                  type="button"
                  disabled={!phenotypeResult}
                  onClick={() => {
                    const killVal = phenotypeResult?.estimatedWeedControlPct ?? phenotypeResult?.calculatedDesiccationRate;
                    if (killVal !== undefined && killVal !== null && onApplyValue) {
                      onApplyValue(killVal);
                      onClose();
                    }
                  }}
                  className="flex-1 py-2 px-3 text-xs font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl shadow transition"
                >
                  Apply Phenotype Kill ({phenotypeResult ? (phenotypeResult.estimatedWeedControlPct ?? phenotypeResult.calculatedDesiccationRate ?? 0) : 0}%)
                </button>
              ) : (
                onApplyValue && localResults && localResults.length > 0 && (
                  <button
                    onClick={() => {
                      const totalVal = filteredResults.reduce((acc, curr) => acc + (curr.cover || curr.value || 0), 0);
                      onApplyValue(Math.min(100, totalVal));
                    }}
                    className="flex-1 py-2 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow transition"
                  >
                    {labels.applyLabel} ({Math.min(100, filteredResults.reduce((acc, curr) => acc + (curr.cover || curr.value || 0), 0))}%)
                  </button>
                )
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
