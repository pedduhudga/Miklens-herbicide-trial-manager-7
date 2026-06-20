import React, { useState, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import { FileBox, Download, LayoutTemplate, GripVertical, Plus, Trash2, ChevronRight, ShieldAlert } from 'lucide-react';
import { exportScientificReportAsDOC, exportTrialCardsPDF } from '../utils/exportUtils.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { AdvancedReportGenerator } from '../services/advancedReportGenerator.js';

export default function Reports({ onMenuClick }) {
  const { state } = useAppState();
  const { isViewer, user } = useAuth();
  const canDownload = !isViewer && user?.tabPermissions?.['Allow Downloads'] !== false;
  const activeCategory = state.activeCategory || 'herbicide';
  const config = getCategoryConfig(activeCategory);

  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTrialIds, setSelectedTrialIds] = useState([]);
  const [selectedTrialId, setSelectedTrialId] = useState('');

  // Custom Template Builder State
  const [availableBlocks, setAvailableBlocks] = useState([]);

  const [templateBlocks, setTemplateBlocks] = useState([
    { id: 'block-exec-summary', label: 'Executive Summary (AI Narrative)', type: 'text' },
    { id: 'block-table-means', label: 'Treatment Means & ANOVA Table', type: 'table' },
  ]);

  useEffect(() => {
    setAvailableBlocks([
      { id: 'block-exec-summary', label: 'Executive Summary (AI Narrative)', type: 'text' },
      { id: 'block-trial-design', label: 'Trial Design & Methodology', type: 'text' },
      { id: 'block-chart-wce', label: `${config.primaryMetric.label} (${config.primaryMetric.key}) Timeline Chart`, type: 'chart' },
      { id: 'block-chart-performance', label: 'Final Performance Bar Chart', type: 'chart' },
      { id: 'block-table-means', label: 'Treatment Means & ANOVA Table', type: 'table' },
      { id: 'block-env-suitability', label: 'Environmental Suitability Index', type: 'mixed' },
      { id: 'block-chart-dose', label: 'Dose-Response Scatter Plot', type: 'chart' },
      { id: 'block-photos', label: 'Trial Photo Grid', type: 'image' },
    ]);
  }, [activeCategory, config.primaryMetric.label, config.primaryMetric.key]);

  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dragSource, setDragSource] = useState(null);

  const handleDragStart = (e, block, source) => {
    setDraggedBlock(block);
    setDragSource(source);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetSource, targetIndex = null) => {
    e.preventDefault();
    if (!draggedBlock) return;

    if (dragSource === 'available' && targetSource === 'template') {
      const newAvailable = availableBlocks.filter(b => b.id !== draggedBlock.id);
      const newTemplate = [...templateBlocks];
      if (targetIndex !== null) {
        newTemplate.splice(targetIndex, 0, draggedBlock);
      } else {
        newTemplate.push(draggedBlock);
      }
      setAvailableBlocks(newAvailable);
      setTemplateBlocks(newTemplate);
    }
    else if (dragSource === 'template' && targetSource === 'available') {
      const newTemplate = templateBlocks.filter(b => b.id !== draggedBlock.id);
      const newAvailable = [...availableBlocks, draggedBlock];
      setTemplateBlocks(newTemplate);
      setAvailableBlocks(newAvailable);
    }
    else if (dragSource === 'template' && targetSource === 'template' && targetIndex !== null) {
      const draggedIndex = templateBlocks.findIndex(b => b.id === draggedBlock.id);
      if (draggedIndex === targetIndex) return;

      const newTemplate = [...templateBlocks];
      newTemplate.splice(draggedIndex, 1);
      newTemplate.splice(targetIndex, 0, draggedBlock);
      setTemplateBlocks(newTemplate);
    }

    setDraggedBlock(null);
    setDragSource(null);
  };

  const moveBlock = (block, from, to) => {
    if (from === 'available' && to === 'template') {
      setAvailableBlocks(availableBlocks.filter(b => b.id !== block.id));
      setTemplateBlocks([...templateBlocks, block]);
    } else if (from === 'template' && to === 'available') {
      setTemplateBlocks(templateBlocks.filter(b => b.id !== block.id));
      setAvailableBlocks([...availableBlocks, block]);
    }
  };

  const handleProjectSelect = (e) => {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);
    setSelectedTrialId('');
    // Auto-select trials for this project
    const projectTrials = (state.trials || []).filter(t => t.ProjectID === projectId);
    setSelectedTrialIds(projectTrials.map(t => t.ID));
  };

  const handleGenerateScientificReport = async () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    if (!selectedTrialId) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select a trial first.', type: 'warning' } }));
      return;
    }
    const trial = (state.trials || []).find(t => t.ID === selectedTrialId);
    if (!trial) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial data not found.', type: 'error' } }));
      return;
    }
    await exportScientificReportAsDOC({ trialId: selectedTrialId }, state, { templateConfig: ['block-exec-summary', 'block-trial-design', 'block-table-means', 'block-env-suitability'] });
  };

  const handleGenerateTrialCards = async () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    if (!selectedProjectId) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select a project first.', type: 'warning' } }));
      return;
    }
    const projectTrials = (state.trials || []).filter(t => t.ProjectID === selectedProjectId);
    if (projectTrials.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No trials found for the selected project.', type: 'warning' } }));
      return;
    }
    const project = (state.projects || []).find(p => p.ID === selectedProjectId);
    await exportTrialCardsPDF(projectTrials, project);
  };

  const handleGenerateAdvancedExcel = async () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    if (!selectedTrialId) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select a trial first.', type: 'warning' } }));
      return;
    }
    const trial = (state.trials || []).find(t => t.ID === selectedTrialId);
    if (!trial) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Trial data not found.', type: 'error' } }));
      return;
    }

    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating Advanced Excel Report...', type: 'info' } }));
    
    try {
      const generator = new AdvancedReportGenerator(trial, activeCategory);
      await generator.generateCompleteReport();
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Report generated successfully!', type: 'success' } }));
    } catch (error) {
      console.error(error);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Failed to generate report: ${error.message}`, type: 'error' } }));
    }
  };

  const handleGenerateCustom = async () => {
     if (!canDownload) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
        return;
     }
     if (templateBlocks.length === 0) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please add at least one block to your template.', type: 'warning' } }));
        return;
     }
     if (!selectedProjectId && selectedTrialIds.length === 0) {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select a project or trials to report on.', type: 'warning' } }));
        return;
     }

     window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating Custom Report...', type: 'info' } }));

     try {
       const templateConfig = templateBlocks.map(b => b.id);
       console.log("Generating report with blocks:", templateConfig, "for Project ID:", selectedProjectId);
       await exportScientificReportAsDOC({ projectId: selectedProjectId, trials: selectedTrialIds }, state, { templateConfig });
       window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Custom Report Generated Successfully!', type: 'success' } }));
     } catch(e) {
       console.error("Custom Report Error:", e);
       window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Error generating report.', type: 'error' } }));
     }
  };

  const handleGenerateARM = async () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    if (!selectedProjectId) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Please select a project first.', type: 'warning' } }));
      return;
    }
    const projectTrials = (state.trials || []).filter(t => t.ProjectID === selectedProjectId);
    if (projectTrials.length === 0) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'No trials found for the selected project.', type: 'warning' } }));
      return;
    }
    const project = (state.projects || []).find(p => p.ID === selectedProjectId);
    
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Generating ARM exchange file...', type: 'info' } }));
    
    try {
      const { exportToARM } = await import('../services/armExporter.js');
      const blob = exportToARM(projectTrials, activeCategory, project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ARM_Export_${project?.Name || 'Project'}_${activeCategory}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'ARM file exported successfully!', type: 'success' } }));
    } catch (error) {
      console.error(error);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to generate ARM file.', type: 'error' } }));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Reports & Cards" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
        {!showBuilder ? (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Export Hub</h2>
              <p className="text-slate-600">
                Generate printable trial cards, standard regulatory reports, or create a custom layout.
              </p>
            </div>

            {/* Target Data Selector */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-wider text-slate-500">Select Target Data</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Project</label>
                  <select
                     value={selectedProjectId}
                     onChange={handleProjectSelect}
                     className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500"
                  >
                     <option value="">-- Select a Project --</option>
                     {(state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide')).map(p => (
                        <option key={p.ID} value={p.ID}>{p.Name}</option>
                     ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Trial</label>
                  <select
                     value={selectedTrialId}
                     onChange={(e) => setSelectedTrialId(e.target.value)}
                     className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500"
                     disabled={!selectedProjectId}
                  >
                     <option value="">-- Select a Trial --</option>
                     {(state.trials || []).filter(t => t.ProjectID === selectedProjectId).map(t => (
                        <option key={t.ID} value={t.ID}>{t.FormulationName || t.ID} ({t.Date || 'No Date'})</option>
                     ))}
                  </select>
                </div>
              </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

               <div 
                 onClick={canDownload ? handleGenerateScientificReport : null}
                 className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full ${canDownload ? 'hover:shadow-md cursor-pointer group' : 'opacity-65'}`}
               >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${canDownload ? 'bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform' : 'bg-slate-100 text-slate-400'}`}>
                     <FileBox className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-3">Scientific Report (DOCX)</h3>
                  <p className="text-sm text-slate-500 mb-6 flex-grow">Export detailed, standard format per-trial reports containing full efficacy charts, environmental data, and standardized AI narratives.</p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (canDownload) handleGenerateScientificReport(); }}
                    disabled={!canDownload}
                    className={`w-full py-3 font-semibold rounded-xl flex items-center justify-center gap-2 transition ${canDownload ? 'bg-slate-50 text-blue-700 hover:bg-blue-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                  >
                    {canDownload ? 'Select Trials' : 'Disabled'} <Download className="w-4 h-4" />
                  </button>
               </div>

               <div 
                 onClick={canDownload ? handleGenerateTrialCards : null}
                 className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full ${canDownload ? 'hover:shadow-md cursor-pointer group' : 'opacity-65'}`}
               >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${canDownload ? 'bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform' : 'bg-slate-100 text-slate-400'}`}>
                     <FileBox className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-3">Printable Trial Cards (PDF)</h3>
                  <p className="text-sm text-slate-500 mb-6 flex-grow">Generate layout-optimized, physical field cards containing plot layouts and scannable QR codes for your stakes.</p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (canDownload) handleGenerateTrialCards(); }}
                    disabled={!canDownload}
                    className={`w-full py-3 font-semibold rounded-xl flex items-center justify-center gap-2 transition ${canDownload ? 'bg-slate-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                  >
                    {canDownload ? 'Generate Cards' : 'Disabled'} <Download className="w-4 h-4" />
                  </button>
               </div>

               <div 
                 onClick={canDownload ? handleGenerateAdvancedExcel : null}
                 className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full ${canDownload ? 'hover:shadow-md cursor-pointer group hover:border-amber-400' : 'opacity-65'}`}
               >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${canDownload ? 'bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform' : 'bg-slate-100 text-slate-400'}`}>
                     <FileBox className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-3">Advanced Excel (11-Sheet)</h3>
                  <p className="text-sm text-slate-500 mb-6 flex-grow">Generate a complete multi-sheet agricultural Excel workbook matching TOK2322C, including ANOVA, statistics, and embedded charts.</p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (canDownload) handleGenerateAdvancedExcel(); }}
                    className={`w-full py-3 font-semibold rounded-xl flex items-center justify-center gap-2 transition ${canDownload ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    disabled={!selectedTrialId || !canDownload}
                  >
                    {canDownload ? 'Export Workbook' : 'Disabled'} <Download className="w-4 h-4" />
                  </button>
               </div>

               <div 
                 onClick={canDownload ? handleGenerateARM : null}
                 className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full ${canDownload ? 'hover:shadow-md cursor-pointer group hover:border-purple-400' : 'opacity-65'}`}
               >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${canDownload ? 'bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform' : 'bg-slate-100 text-slate-400'}`}>
                     <FileBox className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-3">ARM Exchange Data (CSV)</h3>
                  <p className="text-sm text-slate-500 mb-6 flex-grow">Export trial coordinates, blocks, treatments, and observation logs in the standard Agricultural Research Manager exchange layout.</p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (canDownload) handleGenerateARM(); }}
                    disabled={!canDownload}
                    className={`w-full py-3 font-semibold rounded-xl flex items-center justify-center gap-2 transition ${canDownload ? 'bg-slate-50 text-purple-700 hover:bg-purple-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                  >
                    {canDownload ? 'Export ARM File' : 'Disabled'} <Download className="w-4 h-4" />
                  </button>
               </div>

               <div
                 onClick={() => {
                   if (isViewer) {
                     window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot customize report builder templates.', type: 'error' } }));
                     return;
                   }
                   setShowBuilder(true);
                 }}
                 className={`rounded-2xl shadow-md p-6 transition-all cursor-pointer group flex flex-col h-full ${isViewer ? 'bg-slate-200 border border-slate-300 text-slate-500 opacity-70' : 'bg-gradient-to-br from-purple-600 to-indigo-700 border border-purple-800 text-white hover:shadow-lg'}`}
               >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${isViewer ? 'bg-slate-300 text-slate-500' : 'bg-white/20 group-hover:scale-110 transition-transform'}`}>
                     {isViewer ? <ShieldAlert className="w-7 h-7" /> : <LayoutTemplate className="w-7 h-7" />}
                   </div>
                  <h3 className="font-bold text-lg mb-3">Custom Report Builder</h3>
                  <p className={`text-sm mb-6 flex-grow ${isViewer ? 'text-slate-500' : 'text-purple-100'}`}>
                    {isViewer ? 'Custom templates are disabled for Viewers to prevent modifications to reporting configurations.' : 'Drag and drop specific charts, tables, and narrative blocks to build a tailored regulatory or scientific export template.'}
                  </p>
                  <button 
                    disabled={isViewer}
                    className={`w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition ${isViewer ? 'bg-slate-350 text-slate-400 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    {isViewer ? 'Locked' : 'Open Builder'} <ChevronRight className="w-4 h-4" />
                  </button>
               </div>

             </div>
          </>
        ) : (
          <div className="flex flex-col h-full min-h-[700px]">
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
               <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                     <LayoutTemplate className="w-6 h-6 text-purple-600" /> Custom Report Builder
                  </h2>

                  {/* Scope Selection */}
                  <div className="mt-3 flex items-center gap-4">
                     <label className="text-sm font-semibold text-slate-700">Select Project:</label>
                     <select
                        value={selectedProjectId}
                        onChange={handleProjectSelect}
                        className="p-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 min-w-[200px]"
                     >
                        <option value="">-- Choose a Project --</option>
                        {(state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide')).map(p => (
                           <option key={p.ID} value={p.ID}>{p.Name}</option>
                        ))}
                     </select>
                  </div>
               </div>

               <div className="flex flex-col items-end gap-3">
                 <div className="flex gap-3">
                   <button
                     onClick={() => setShowBuilder(false)}
                     className="px-5 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 transition"
                   >
                     Back to Hub
                   </button>
                   <button
                     onClick={handleGenerateCustom}
                     disabled={!selectedProjectId}
                     className="px-6 py-2 bg-purple-600 text-white font-bold rounded-xl shadow-md hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     <Download className="w-4 h-4" /> Export Custom Report
                   </button>
                 </div>
               </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-0">
               {/* Available Blocks Column */}
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                  <div className="p-4 border-b bg-slate-50">
                     <h3 className="font-bold text-slate-700">Available Content Blocks</h3>
                  </div>
                  <div
                    className="flex-1 p-4 overflow-y-auto bg-slate-50/50"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'available')}
                  >
                     <div className="space-y-3 min-h-[100px]">
                       {availableBlocks.map(block => (
                         <div
                           key={block.id}
                           draggable
                           onDragStart={(e) => handleDragStart(e, block, 'available')}
                           className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between cursor-move hover:border-purple-300 hover:shadow-md transition-all group"
                         >
                           <div className="flex items-center gap-3">
                             <GripVertical className="w-5 h-5 text-slate-300 group-hover:text-purple-400" />
                             <span className="font-semibold text-slate-700 text-sm">{block.label}</span>
                           </div>
                           <button
                             onClick={() => moveBlock(block, 'available', 'template')}
                             className="text-purple-600 bg-purple-50 p-1.5 rounded-lg hover:bg-purple-100"
                             title="Add to Template"
                           >
                             <Plus className="w-4 h-4" />
                           </button>
                         </div>
                       ))}
                       {availableBlocks.length === 0 && (
                         <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                            All blocks added to template.
                         </div>
                       )}
                     </div>
                  </div>
               </div>

               {/* Template Column */}
               <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                  <div className="p-4 border-b bg-purple-50 flex justify-between items-center">
                     <h3 className="font-bold text-purple-900">Your Document Layout</h3>
                     <span className="text-xs font-semibold text-purple-600 bg-white px-2 py-1 rounded-md shadow-sm">{templateBlocks.length} Blocks</span>
                  </div>
                  <div
                    className="flex-1 p-4 overflow-y-auto bg-slate-50 relative"
                    onDragOver={handleDragOver}
                    onDrop={(e) => {
                       if (e.target === e.currentTarget) {
                         handleDrop(e, 'template');
                       }
                    }}
                  >
                     <div className="space-y-3 min-h-full pb-10">
                       {templateBlocks.map((block, index) => (
                         <div
                           key={block.id}
                           draggable
                           onDragStart={(e) => handleDragStart(e, block, 'template')}
                           onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                           onDrop={(e) => { e.stopPropagation(); handleDrop(e, 'template', index); }}
                           className="bg-white p-4 rounded-xl border-2 border-purple-100 shadow-sm flex items-center justify-between cursor-move hover:border-purple-400 transition-all relative group"
                         >
                           <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-purple-400 to-indigo-500 rounded-l-xl"></div>
                           <div className="flex items-center gap-3 ml-2">
                             <GripVertical className="w-5 h-5 text-slate-300 group-hover:text-purple-500" />
                             <div>
                               <span className="font-bold text-slate-800 text-sm block">{block.label}</span>
                               <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Order: {index + 1}</span>
                             </div>
                           </div>
                           <button
                             onClick={() => moveBlock(block, 'template', 'available')}
                             className="text-red-500 bg-red-50 p-1.5 rounded-lg hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                             title="Remove from Template"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </div>
                       ))}

                       {templateBlocks.length === 0 && (
                         <div className="absolute inset-0 m-4 border-2 border-dashed border-purple-200 rounded-xl bg-purple-50/50 flex flex-col items-center justify-center text-purple-400 z-0">
                            <LayoutTemplate className="w-12 h-12 mb-3 opacity-50" />
                            <p className="font-semibold">Drag blocks here</p>
                            <p className="text-sm mt-1 opacity-75">to construct your report</p>
                         </div>
                       )}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

