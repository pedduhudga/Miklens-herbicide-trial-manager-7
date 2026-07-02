import React, { useEffect, useRef, memo } from 'react';
import Chart from 'chart.js/auto';
import { Download } from 'lucide-react';

function ChartCard({ id, title, description, config, height = "300px" }) {
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    try {
      chartRef.current = new Chart(canvasRef.current, config);
    } catch (e) {
      console.error(`Failed to create chart ${id}:`, e);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [config, id]);

  const handleExport = () => {
    try {
      if (chartRef.current) {
        const url = chartRef.current.toBase64Image();
        const link = document.createElement('a');
        link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_chart.png`;
        link.href = url;
        link.click();
      } else if (canvasRef.current) {
        const url = canvasRef.current.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_chart.png`;
        link.href = url;
        link.click();
      }
    } catch (err) {
      console.error('Failed to export chart:', err);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-5 dashboard-card">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <button 
          onClick={handleExport}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition shrink-0"
          title="Export as PNG"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
      <div style={{ height, position: 'relative', width: '100%' }}>
        <canvas id={id} ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

// Custom comparison to handle config object deeply
function areEqual(prevProps, nextProps) {
  return prevProps.id === nextProps.id &&
         prevProps.title === nextProps.title &&
         prevProps.description === nextProps.description &&
         prevProps.height === nextProps.height &&
         JSON.stringify(prevProps.config) === JSON.stringify(nextProps.config);
}

export default memo(ChartCard, areEqual);
