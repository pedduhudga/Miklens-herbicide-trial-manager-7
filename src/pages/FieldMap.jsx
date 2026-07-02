import React, { useEffect, useRef, useState } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import L from 'leaflet';
import { X, Calendar, MapPin, Target, ChevronRight } from 'lucide-react';

const RESULT_COLORS = {
  Excellent: '#22c55e',
  Good:      '#3b82f6',
  Fair:      '#f59e0b',
  Poor:      '#ef4444',
  '':        '#94a3b8',
};

export default function FieldMap({ onMenuClick }) {
  const { state } = useAppState();
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [colorMode, setColorMode] = useState('result');
  const [selectedTrial, setSelectedTrial] = useState(null);

  useEffect(() => {
    if (!containerRef.current || typeof L === 'undefined') return;

    const geoTrials = (state.trials || []).filter(t => {
      const lat = parseFloat(t.Lat);
      const lon = parseFloat(t.Lon);
      return isFinite(lat) && isFinite(lon) && lat !== 0 && lon !== 0;
    });

    // Destroy previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    if (geoTrials.length === 0) return;

    const avgLat = geoTrials.reduce((s, t) => s + parseFloat(t.Lat), 0) / geoTrials.length;
    const avgLon = geoTrials.reduce((s, t) => s + parseFloat(t.Lon), 0) / geoTrials.length;

    const map = L.map(containerRef.current).setView([avgLat, avgLon], 12);
    mapRef.current = map;

    const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps',
    });
    const googleStandard = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps',
    });
    googleHybrid.addTo(map);
    L.control.layers({ 'Satellite': googleHybrid, 'Map': googleStandard }).addTo(map);

    geoTrials.forEach(trial => {
      const lat = parseFloat(trial.Lat);
      const lon = parseFloat(trial.Lon);
      const color = RESULT_COLORS[trial.Result || ''] || RESULT_COLORS[''];

      const circle = L.circleMarker([lat, lon], {
        radius: 12,
        fillColor: color,
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);

      circle.on('click', () => {
        setSelectedTrial(trial);
      });

      circle.bindPopup(`
        <div style="min-width:180px;font-family:sans-serif;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${trial.FormulationName || 'Unknown'}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${trial.Date ? new Date(trial.Date).toLocaleDateString() : ''} · ${trial.Location || ''}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
            <span style="color:#64748b;">Result:</span><span style="font-weight:600;">${trial.Result || 'N/A'}</span>
            <span style="color:#64748b;">Dosage:</span><span>${trial.Dosage || 'N/A'}</span>
          </div>
          <div style="margin-top:8px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank"
               style="color:#3b82f6;font-weight:600;font-size:11px;text-decoration:none;display:block;margin-bottom:4px;">
              &#9654; Get Directions (Google Maps)
            </a>
          </div>
        </div>
      `);
    });

    const bounds = L.latLngBounds(geoTrials.map(t => [parseFloat(t.Lat), parseFloat(t.Lon)]));
    map.fitBounds(bounds.pad(0.1));

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [state.trials, colorMode]);

  const geoTrials = (state.trials || []).filter(t => {
    const lat = parseFloat(t.Lat);
    const lon = parseFloat(t.Lon);
    return isFinite(lat) && isFinite(lon) && lat !== 0 && lon !== 0;
  });
  const geoTrialsCount = geoTrials.length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Field Map" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        <div className="mb-4 flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 gap-3">
          <div>
            <h3 className="font-bold text-slate-800">Geospatial Distribution</h3>
            <p className="text-sm text-slate-500">
              {geoTrialsCount} of {(state.trials || []).length} trials have GPS data.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Color by Result:
              <div className="flex items-center gap-1">
                {Object.entries(RESULT_COLORS).filter(([k]) => k).map(([result, color]) => (
                  <span key={result} className="flex items-center gap-1 text-xs text-slate-600">
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
                    {result}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden relative flex flex-row" style={{ minHeight: '400px' }}>
          {geoTrialsCount > 0 ? (
            <div ref={containerRef} className="flex-grow h-full" style={{ zIndex: 10 }} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
              <p className="font-semibold text-lg">No GPS-tagged trials found.</p>
              <p className="text-sm">Add GPS coordinates when creating trials to see them on the map.</p>
            </div>
          )}

          {/* Sidebar Drawer */}
          {selectedTrial && (
            <div className="w-80 border-l border-slate-200 bg-white flex flex-col z-20 shadow-xl animate-in slide-in-from-right duration-200">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Trial Preview</span>
                <button onClick={() => setSelectedTrial(null)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{selectedTrial.FormulationName || 'Unknown Formulation'}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-slate-600 bg-slate-100">
                      {selectedTrial.Result || 'Unrated'}
                    </span>
                    {selectedTrial.Dosage && (
                      <span className="text-xs text-slate-500 font-medium">{selectedTrial.Dosage}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{selectedTrial.Location || 'No location details'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selectedTrial.Date ? new Date(selectedTrial.Date).toLocaleDateString() : 'No date'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">Target: {selectedTrial.WeedSpecies || selectedTrial.PestSpecies || selectedTrial.Target || 'N/A'}</span>
                  </div>
                </div>

                {selectedTrial.EfficacyDataJSON && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-2">Efficacy Timeline</span>
                    {(() => {
                      try {
                        const obs = JSON.parse(selectedTrial.EfficacyDataJSON || '[]');
                        if (obs.length === 0) return <p className="text-xs text-slate-400">No observations recorded yet</p>;
                        return (
                          <div className="space-y-1">
                            {obs.slice(-3).map((o, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-slate-50">
                                <span className="font-medium text-slate-600">DAA {o.daa ?? o.day ?? 0}</span>
                                <span className="font-bold text-slate-800">{o.controlPct ?? o.wce ?? o.efficacy ?? o.value ?? 0}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => {
                    navigate('/trials');
                    window.dispatchEvent(
                      new CustomEvent('app:openTrial', { detail: { id: selectedTrial.ID } }),
                    );
                  }}
                  className="w-full flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2 rounded-xl text-sm font-bold shadow-md transition-all"
                >
                  View Full Details <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
