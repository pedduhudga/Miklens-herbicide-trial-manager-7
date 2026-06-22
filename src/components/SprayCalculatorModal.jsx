// src/components/SprayCalculatorModal.jsx
import React, { useState, useEffect } from 'react';
import { X, Calculator, FlaskConical, Droplets, Grid, AlertCircle } from 'lucide-react';

export default function SprayCalculatorModal({ isOpen, onClose, onApply, initialFormulationName = '' }) {
  const [formulationName, setFormulationName] = useState(initialFormulationName);
  const [appRate, setAppRate] = useState(1.5); // L/ha or kg/ha
  const [appRateUnit, setAppRateUnit] = useState('L/ha'); // L/ha or kg/ha
  const [carrierVolume, setCarrierVolume] = useState(200); // L/ha
  const [plotLength, setPlotLength] = useState(10); // meters
  const [plotWidth, setPlotWidth] = useState(2); // meters
  const [numReplicates, setNumReplicates] = useState(4); // default 4 replicates
  const [plotAreaManual, setPlotAreaManual] = useState(''); // manual plot area override
  const [tankSize, setTankSize] = useState(5); // Liters (backpack sprayer default)
  const [safetyFactor, setSafetyFactor] = useState(20); // % extra volume for priming lines

  // Calculated outputs
  const [calculatedArea, setCalculatedArea] = useState(0); // m^2
  const [totalSprayVolume, setTotalSprayVolume] = useState(0); // Liters
  const [numTanks, setNumTanks] = useState(0);
  const [totalProductRequired, setTotalProductRequired] = useState(0); // mL or g
  const [productPerTank, setProductPerTank] = useState(0); // mL or g

  useEffect(() => {
    setFormulationName(initialFormulationName);
  }, [initialFormulationName]);

  useEffect(() => {
    // 1. Calculate Plot Area (m^2)
    const area = plotAreaManual !== '' && !isNaN(parseFloat(plotAreaManual)) 
      ? parseFloat(plotAreaManual)
      : plotLength * plotWidth * numReplicates;
    setCalculatedArea(area);

    // 2. Calculate Total Spray Volume Needed (L)
    // Carrier volume (L/ha) * Area (m^2) / 10,000 m^2/ha
    const baseVolume = (carrierVolume * area) / 10000;
    const finalVolume = baseVolume * (1 + safetyFactor / 100);
    setTotalSprayVolume(parseFloat(finalVolume.toFixed(3)));

    // 3. Number of Tanks
    const tanks = finalVolume / tankSize;
    setNumTanks(parseFloat(tanks.toFixed(2)));

    // 4. Total Product Required (g or mL)
    // App rate (L/ha or kg/ha) * Area (m^2) / 10,000 m^2/ha. Convert L/kg to mL/g (* 1000)
    const totalProd = ((appRate * area) / 10000) * 1000 * (1 + safetyFactor / 100);
    setTotalProductRequired(parseFloat(totalProd.toFixed(2)));

    // 5. Product Per Tank (g or mL per tank)
    const prodPerTank = (totalProd / finalVolume) * tankSize;
    setProductPerTank(parseFloat(prodPerTank.toFixed(2)));
  }, [appRate, carrierVolume, plotLength, plotWidth, numReplicates, plotAreaManual, tankSize, safetyFactor]);

  if (!isOpen) return null;

  const handleApply = () => {
    const dosageString = `${appRate} ${appRateUnit} (Spray Carrier: ${carrierVolume} L/ha, Mix: ${productPerTank} ${appRateUnit === 'L/ha' ? 'mL' : 'g'} product per ${tankSize}L tank)`;
    onApply(dosageString);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-xl">
              <Calculator size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Agronomic Sprayer & Mixing Calculator</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Calculate backpack mixing recipes and carrier volumes</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Inputs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Treatment Information */}
            <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FlaskConical size={14} /> Product & Rate
              </h4>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Formulation / Treatment Name</label>
                <input 
                  type="text" 
                  value={formulationName} 
                  onChange={(e) => setFormulationName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                  placeholder="e.g. Glyphosate 480"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Application Rate</label>
                  <input 
                    type="number" 
                    value={appRate} 
                    onChange={(e) => setAppRate(parseFloat(e.target.value) || 0)}
                    step="0.01"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Unit</label>
                  <select 
                    value={appRateUnit} 
                    onChange={(e) => setAppRateUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="L/ha">L/ha</option>
                    <option value="kg/ha">kg/ha</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Spray Carrier Volume (L/ha)</label>
                <input 
                  type="number" 
                  value={carrierVolume} 
                  onChange={(e) => setCarrierVolume(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Plot Dimensions & Sprayer Setup */}
            <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Grid size={14} /> Plot Area & Sprayer Setup
              </h4>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Length (m)</label>
                  <input 
                    type="number" 
                    value={plotLength} 
                    onChange={(e) => setPlotLength(parseFloat(e.target.value) || 0)}
                    disabled={plotAreaManual !== ''}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Width (m)</label>
                  <input 
                    type="number" 
                    value={plotWidth} 
                    onChange={(e) => setPlotWidth(parseFloat(e.target.value) || 0)}
                    disabled={plotAreaManual !== ''}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Reps</label>
                  <input 
                    type="number" 
                    value={numReplicates} 
                    onChange={(e) => setNumReplicates(parseInt(e.target.value) || 0)}
                    disabled={plotAreaManual !== ''}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Or Enter Manual Plot Area (m²)</label>
                <input 
                  type="number" 
                  value={plotAreaManual} 
                  onChange={(e) => setPlotAreaManual(e.target.value)}
                  placeholder="Use dimensions above"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tank Capacity (L)</label>
                  <input 
                    type="number" 
                    value={tankSize} 
                    onChange={(e) => setTankSize(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Safety Margin (%)</label>
                  <input 
                    type="number" 
                    value={safetyFactor} 
                    onChange={(e) => setSafetyFactor(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Results Summary Box */}
          <div className="p-5 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-4">
            <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
              <Droplets size={16} /> Sprayer Mix Recipe
            </h4>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-white dark:bg-slate-900/60 rounded-xl shadow-sm">
                <span className="block text-[10px] uppercase font-bold text-slate-500">Treated Area</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-white">{calculatedArea} m²</span>
              </div>
              
              <div className="p-3 bg-white dark:bg-slate-900/60 rounded-xl shadow-sm">
                <span className="block text-[10px] uppercase font-bold text-slate-500">Total Liquid</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-white">{totalSprayVolume} L</span>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900/60 rounded-xl shadow-sm">
                <span className="block text-[10px] uppercase font-bold text-slate-500">Total Product</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-white">{totalProductRequired} {appRateUnit === 'L/ha' ? 'mL' : 'g'}</span>
              </div>

              <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-sm">
                <span className="block text-[10px] uppercase font-bold text-emerald-100">Recipe per Tank</span>
                <span className="text-md font-black">{productPerTank} {appRateUnit === 'L/ha' ? 'mL' : 'g'}</span>
                <span className="block text-[9px] text-emerald-100">per {tankSize}L water</span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 p-3 rounded-lg">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>
                To treat {calculatedArea} m² (including a {safetyFactor}% safety factor), mix <strong>{totalProductRequired} {appRateUnit === 'L/ha' ? 'mL' : 'g'}</strong> of {formulationName || 'product'} in <strong>{totalSprayVolume} L</strong> of water. This equates to <strong>{productPerTank} {appRateUnit === 'L/ha' ? 'mL' : 'g'} per {tankSize}L backpack tank</strong> ({numTanks} tanks total).
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 dark:border-slate-800">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleApply}
            className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all"
          >
            Apply Recipe to Dosage
          </button>
        </div>

      </div>
    </div>
  );
}
