import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function GridWeedCoverTool({ imageUrl, initialSelected = [], initialGridSize = 10, onUpdate }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [gridSize, setGridSize] = useState(initialGridSize);
  const [selectedCells, setSelectedCells] = useState(new Set(initialSelected));
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(null); // 'select' or 'deselect'
  const imgObjectRef = useRef(null);

  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [exgBaseline, setExgBaseline] = useState(null); // { cover, greenCells, totalCells }

  // Load Image and initialize canvas
  useEffect(() => {
    if (!imageUrl || !canvasRef.current || !containerRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;

      const maxWidth = container.clientWidth || 300;
      const maxHeight = window.innerHeight * 0.5 || 400;

      let targetWidth = img.width;
      let targetHeight = img.height;

      if (targetWidth > maxWidth) {
        targetHeight = (targetHeight / targetWidth) * maxWidth;
        targetWidth = maxWidth;
      }
      if (targetHeight > maxHeight) {
        targetWidth = (targetWidth / targetHeight) * maxHeight;
        targetHeight = maxHeight;
      }

      setCanvasDimensions({ width: targetWidth, height: targetHeight });
      imgObjectRef.current = img;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw loop
  useEffect(() => {
    if (!canvasRef.current || !imgObjectRef.current || canvasDimensions.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvasDimensions;

    canvas.width = width;
    canvas.height = height;

    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    // Clear and draw image
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(imgObjectRef.current, 0, 0, width, height);

    // Draw Grid Lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += cellWidth) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += cellHeight) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw Selected Cells
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Red overlay for weeds
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 2;

    selectedCells.forEach(cellIndex => {
      const col = cellIndex % gridSize;
      const row = Math.floor(cellIndex / gridSize);
      const x = col * cellWidth;
      const y = row * cellHeight;
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.strokeRect(x, y, cellWidth, cellHeight);
    });

  }, [canvasDimensions, gridSize, selectedCells]);

  // Report changes up
  useEffect(() => {
    const totalCells = gridSize * gridSize;
    const percentage = Math.round((selectedCells.size / totalCells) * 100);
    onUpdate({ cover: percentage, cells: Array.from(selectedCells), size: gridSize });
  }, [selectedCells, gridSize]); // eslint-disable-line

  // ── ExG (Excess Green Index) Auto-Detect ───────────────────────────
  const computeExGBaseline = useCallback(() => {
    if (!imgObjectRef.current || canvasDimensions.width === 0) return;
    setAutoDetecting(true);

    // Use a setTimeout so the UI can render the loading indicator first
    setTimeout(() => {
      try {
        const img = imgObjectRef.current;
        const { width, height } = canvasDimensions;

        // Create an off-screen canvas to sample pixels
        const offCanvas = document.createElement('canvas');
        offCanvas.width = width;
        offCanvas.height = height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(img, 0, 0, width, height);

        const cellWidth = width / gridSize;
        const cellHeight = height / gridSize;
        const greenThreshold = 0; // ExG > 0 means green dominance
        const greenRatioRequired = 0.25; // ≥25% of cell pixels must be green

        const newSelected = new Set();

        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            const cx = Math.floor(col * cellWidth);
            const cy = Math.floor(row * cellHeight);
            const cw = Math.ceil(cellWidth);
            const ch = Math.ceil(cellHeight);

            // Clamp to canvas bounds
            const safeW = Math.min(cw, width - cx);
            const safeH = Math.min(ch, height - cy);
            if (safeW <= 0 || safeH <= 0) continue;

            const imageData = offCtx.getImageData(cx, cy, safeW, safeH);
            const data = imageData.data;
            const pixelCount = safeW * safeH;
            let greenPixels = 0;

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              // Excess Green Index: ExG = 2*G - R - B
              const exg = 2 * g - r - b;
              if (exg > greenThreshold) {
                greenPixels++;
              }
            }

            if (greenPixels / pixelCount >= greenRatioRequired) {
              newSelected.add(row * gridSize + col);
            }
          }
        }

        setSelectedCells(newSelected);
        const totalCells = gridSize * gridSize;
        const coverPct = Math.round((newSelected.size / totalCells) * 100);
        setExgBaseline({ cover: coverPct, greenCells: newSelected.size, totalCells });
      } catch (err) {
        console.error('ExG auto-detect failed:', err);
      } finally {
        setAutoDetecting(false);
      }
    }, 50);
  }, [canvasDimensions, gridSize]);

  // Interaction handlers
  const getCellIndexFromEvent = (e) => {
    if (!canvasRef.current || canvasDimensions.width === 0) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const cellWidth = canvasDimensions.width / gridSize;
    const cellHeight = canvasDimensions.height / gridSize;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
      return row * gridSize + col;
    }
    return null;
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const cellIndex = getCellIndexFromEvent(e);
    if (cellIndex === null) return;

    setIsDrawing(true);
    const isCurrentlySelected = selectedCells.has(cellIndex);
    const newDrawMode = isCurrentlySelected ? 'deselect' : 'select';
    setDrawMode(newDrawMode);

    toggleCell(cellIndex, newDrawMode);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const cellIndex = getCellIndexFromEvent(e);
    if (cellIndex !== null) {
      toggleCell(cellIndex, drawMode);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setDrawMode(null);
  };

  const toggleCell = (index, mode) => {
    setSelectedCells(prev => {
      const newSet = new Set(prev);
      if (mode === 'select') {
        newSet.add(index);
      } else {
        newSet.delete(index);
      }
      return newSet;
    });
  };

  const autoFill = (percentage) => {
    const totalCells = gridSize * gridSize;
    const targetSelected = Math.floor((percentage / 100) * totalCells);
    const newSet = new Set();

    // Fill from bottom up, clustering slightly to simulate actual field growth
    let count = 0;
    while (count < targetSelected && count < totalCells) {
       // Highly simplistic cluster algorithm (prefer bottom half and middle)
       let row = Math.floor(Math.random() * (gridSize / 2)) + Math.floor(gridSize / 2);
       let col = Math.floor(Math.random() * gridSize);

       // Sometime pick anywhere to make it organic
       if (Math.random() > 0.7) {
         row = Math.floor(Math.random() * gridSize);
       }

       // Ensure bounded
       row = Math.min(Math.max(0, row), gridSize - 1);
       const idx = row * gridSize + col;

       if (!newSet.has(idx)) {
         newSet.add(idx);
         count++;
       }
    }
    setSelectedCells(newSet);
  };

  const handleGridSizeChange = (e) => {
    setGridSize(Number(e.target.value));
    setSelectedCells(new Set()); // Reset selections on size change to avoid bad mapping
    setExgBaseline(null);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700">Grid Detail:</label>
          <select
            value={gridSize}
            onChange={handleGridSizeChange}
            className="px-3 py-1 border rounded-lg focus:ring-emerald-500 outline-none text-sm"
          >
            <option value="4">4x4 (Rough)</option>
            <option value="6">6x6</option>
            <option value="10">10x10 (Standard)</option>
            <option value="20">20x20 (Fine)</option>
          </select>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={computeExGBaseline}
            disabled={autoDetecting || !imageUrl}
            className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {autoDetecting ? (
              <><span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin inline-block"></span> Detecting...</>
            ) : (
              <>🌿 ExG Auto-Detect</>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setSelectedCells(new Set()); setExgBaseline(null); }}
            className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100"
          >
            Clear Grid
          </button>
        </div>
      </div>

      {/* ExG Baseline result banner */}
      {exgBaseline && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-700">ExG Auto-Detect Baseline</span>
            <span className="text-xs text-emerald-600 ml-2">
              {exgBaseline.greenCells}/{exgBaseline.totalCells} cells ({exgBaseline.cover}% green canopy)
            </span>
          </div>
          <span className="text-[10px] text-slate-400 italic">Adjust manually as needed</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full flex justify-center bg-black/5 rounded-xl overflow-hidden touch-none select-none cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          // Touch events as fallback if PointerEvents fail
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          onTouchCancel={handlePointerUp}
          className="shadow-md rounded block max-w-full"
        />
      </div>

      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center">
        <div>
           <span className="text-sm font-semibold text-emerald-800 block">Calculated Coverage</span>
           <span className="text-xs text-emerald-600">{selectedCells.size} of {gridSize * gridSize} cells</span>
        </div>
        <span className="font-bold text-emerald-700 text-2xl">
          {Math.round((selectedCells.size / (gridSize * gridSize)) * 100)}%
        </span>
      </div>
    </div>
  );
}
