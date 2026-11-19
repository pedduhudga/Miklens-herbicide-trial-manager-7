import React, { useState, useMemo, useCallback } from 'react';
import Modal from '../Modal.jsx';
import {
  AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, Filter,
  RefreshCw, Save, ArrowRight, Eye, Info, Check, HelpCircle,
  Activity, XCircle, ChevronDown, ChevronRight, Search, FileEdit,
  TrendingDown, Sprout, CornerDownRight, CheckCheck, Loader2
} from 'lucide-react';
import { scanProjectDataHealth } from '../../utils/dataQualityDoctor.js';

export default function ProjectDataHealthModal({
  isOpen,
  onClose,
  project,
  trialsList = [],
  catConfig = {},
  onSaveCorrection,
  onBatchConfirmZeros,
  currentUserName = 'Agronomist'
}) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'anomalies' | 'scale' | 'missing' | 'resolved'
  const [selectedDate, setSelectedDate] = useState('all');
  const [selectedMetric, setSelectedMetric] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingValues, setEditingValues] = useState({});
  const [savingIssueId, setSavingIssueId] = useState(null);
  const [successIssueIds, setSuccessIssueIds] = useState(new Set());
  const [scanTick, setScanTick] = useState(0);

  // Compute live data health report
  const healthReport = useMemo(() => {
    // re-runs when trialsList or scanTick changes
    return scanProjectDataHealth(trialsList, project, catConfig);
  }, [trialsList, project, catConfig, scanTick]);

  // Combine and filter issues
  const allIssues = useMemo(() => {
    const list = [
      ...healthReport.anomalies,
      ...healthReport.scaleInconsistencies,
      ...healthReport.missingObservations
    ];
    return list;
  }, [healthReport]);

  const filteredIssues = useMemo(() => {
    let items = [];
    if (activeTab === 'all') items = allIssues;
    else if (activeTab === 'anomalies') items = healthReport.anomalies;
    else if (activeTab === 'scale') items = healthReport.scaleInconsistencies;
    else if (activeTab === 'missing') items = healthReport.missingObservations;
    else if (activeTab === 'resolved') items = healthReport.resolvedIssues;

    return items.filter(item => {
      // Date filter
      if (selectedDate !== 'all' && item.date !== selectedDate) return false;
      // Metric filter
      if (selectedMetric !== 'all' && item.metricKey !== selectedMetric) return false;
      // Search query (plot or treatment)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const plotMatch = String(item.plot || '').toLowerCase().includes(q);
        const trtMatch = String(item.treatment || '').toLowerCase().includes(q);
        const metricMatch = String(item.metricLabel || '').toLowerCase().includes(q);
        if (!plotMatch && !trtMatch && !metricMatch) return false;
      }
      return true;
    });
  }, [activeTab, allIssues, healthReport, selectedDate, selectedMetric, searchQuery]);

  // Handle single value change in form state
  const handleValueChange = (issueId, key, value) => {
    setEditingValues(prev => ({
      ...prev,
      [issueId]: {
        ...(prev[issueId] || {}),
        [key]: value
      }
    }));
  };

  // Execute correction save
  const handleSave = async (issue, action = 'correct_value') => {
    const state = editingValues[issue.id] || {};
    const valToSave = action === 'confirm_true_zero' ? 0 : (state.value !== undefined ? state.value : issue.currentValue);
    const auditReason = state.reason || (
      action === 'confirm_true_zero'
        ? 'Confirmed genuine true zero / seedling mortality'
        : issue.type === 'scale_inconsistency'
          ? 'Standardized growth stage scale'
          : issue.type === 'missing_data'
            ? 'Entered missing field observation'
            : 'Field observation corrected from notebook'
    );

    setSavingIssueId(issue.id);
    try {
      if (onSaveCorrection) {
        await onSaveCorrection({
          trialId: issue.trialId,
          date: issue.date,
          metricKey: issue.metricKey,
          newValue: valToSave,
          action,
          auditReason,
          author: currentUserName
        });
      }
      setSuccessIssueIds(prev => new Set([...prev, issue.id]));
      setScanTick(t => t + 1);
    } catch (err) {
      console.error('Failed to apply data correction:', err);
      alert('Error saving correction: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingIssueId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col h-full max-h-[85vh]">
        {/* Modal Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              healthReport.healthScore >= 95 ? 'bg-emerald-100 text-emerald-700' :
              healthReport.healthScore >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}>
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-800">Trial Data Quality & Correction Doctor</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  healthReport.healthScore >= 95 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  healthReport.healthScore >= 80 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {healthReport.healthScore}% Quality Score
                </span>
                <span className="text-xs text-slate-500 font-medium">· {project?.Name || 'Trial'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically detects outliers, scale mismatches, dead seedlings vs typos, and missing plot measurements. Correct or fill data with instant audit logs.
              </p>
            </div>
          </div>

          <button
            onClick={() => setScanTick(t => t + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition shadow-xs"
            title="Re-scan all plot observations"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-scan Data
          </button>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-4">
          <button
            onClick={() => setActiveTab('all')}
            className={`p-3 rounded-xl border text-left transition ${
              activeTab === 'all'
                ? 'bg-slate-800 border-slate-800 text-white shadow-sm'
                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Total Issues</div>
            <div className="text-2xl font-black mt-0.5">{healthReport.totalIssuesCount}</div>
            <div className="text-[10px] mt-0.5 opacity-70">Requiring review</div>
          </button>

          <button
            onClick={() => setActiveTab('anomalies')}
            className={`p-3 rounded-xl border text-left transition ${
              activeTab === 'anomalies'
                ? 'bg-red-600 border-red-600 text-white shadow-sm'
                : 'bg-red-50/60 border-red-200 hover:bg-red-50 text-red-900'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Outliers / Zeros</div>
            <div className="text-2xl font-black mt-0.5">{healthReport.anomalies.length}</div>
            <div className="text-[10px] mt-0.5 opacity-70">Z-score / height 0</div>
          </button>

          <button
            onClick={() => setActiveTab('scale')}
            className={`p-3 rounded-xl border text-left transition ${
              activeTab === 'scale'
                ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                : 'bg-amber-50/60 border-amber-200 hover:bg-amber-50 text-amber-900'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Scale Mismatches</div>
            <div className="text-2xl font-black mt-0.5">{healthReport.scaleInconsistencies.length}</div>
            <div className="text-[10px] mt-0.5 opacity-70">BBCH vs Ordinal</div>
          </button>

          <button
            onClick={() => setActiveTab('missing')}
            className={`p-3 rounded-xl border text-left transition ${
              activeTab === 'missing'
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-blue-50/60 border-blue-200 hover:bg-blue-50 text-blue-900'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Missing Data</div>
            <div className="text-2xl font-black mt-0.5">{healthReport.missingObservations.length}</div>
            <div className="text-[10px] mt-0.5 opacity-70">Unrecorded cells</div>
          </button>

          <button
            onClick={() => setActiveTab('resolved')}
            className={`p-3 rounded-xl border text-left transition ${
              activeTab === 'resolved'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                : 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50 text-emerald-900'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Resolved / Verified</div>
            <div className="text-2xl font-black mt-0.5">{healthReport.resolvedIssues.length}</div>
            <div className="text-[10px] mt-0.5 opacity-70">Audit confirmed</div>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search plot #, treatment..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>

            {/* Date filter dropdown */}
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Dates ({healthReport.uniqueDates.length})</option>
              {healthReport.uniqueDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {/* Metric filter dropdown */}
            <select
              value={selectedMetric}
              onChange={e => setSelectedMetric(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Parameters ({healthReport.fields.length})</option>
              {healthReport.fields.map(f => (
                <option key={f.key} value={f.key}>{f.label || f.key}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{filteredIssues.length}</span> item(s)
          </div>
        </div>

        {/* Issue Cards Scrollable List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
          {filteredIssues.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-50/60 rounded-2xl border border-slate-200/80 my-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                {activeTab === 'resolved'
                  ? 'No audit-verified resolutions logged yet'
                  : 'No issues found matching current filters!'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {activeTab === 'resolved'
                  ? 'When you confirm seedling mortality or correct anomalous observations, they will appear here with complete audit documentation.'
                  : 'All plot observations for this filter are consistent, complete, and mathematically validated for regulatory reporting.'}
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const state = editingValues[issue.id] || {};
              const isSaving = savingIssueId === issue.id;
              const isJustSaved = successIssueIds.has(issue.id);
              const isZeroVal = issue.currentValue === 0 || issue.currentValue === '0';

              return (
                <div
                  key={issue.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isJustSaved ? 'bg-emerald-50/60 border-emerald-300' :
                    issue.severity === 'high' ? 'bg-white border-red-200 hover:border-red-300 shadow-xs' :
                    issue.type === 'scale_inconsistency' ? 'bg-white border-amber-200 hover:border-amber-300 shadow-xs' :
                    issue.type === 'missing_data' ? 'bg-white border-blue-200 hover:border-blue-300 shadow-xs' :
                    'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  {/* Card Header & Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-xs font-black bg-slate-900 text-white">
                        Plot {issue.plot}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
                        Rep {issue.rep}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        issue.isControl ? 'bg-amber-100 text-amber-800' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      }`}>
                        {issue.treatment}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                        {issue.date} {issue.daa !== null ? `(DAA ${issue.daa})` : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {issue.metricLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {issue.severity === 'high' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700">
                          High Severity Outlier
                        </span>
                      )}
                      {issue.type === 'scale_inconsistency' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                          Scale Mismatch
                        </span>
                      )}
                      {issue.type === 'missing_data' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800">
                          Missing Observation
                        </span>
                      )}
                      {isJustSaved && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white animate-bounce">
                          <Check className="w-3 h-3" /> Updated
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Diagnostic Explanation */}
                  <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mb-3 flex items-start gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{issue.explanation}</p>
                      {issue.median !== undefined && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Dataset Median: <span className="font-bold text-slate-700">{issue.median} {issue.unit}</span> · Current Value: <span className="font-bold text-red-600">{issue.currentValue ?? 'Missing'}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Interactive Correction Controls */}
                  <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/90 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <FileEdit className="w-3.5 h-3.5 text-emerald-600" />
                        Interactive Data Correction:
                      </span>
                      {issue.suggestedValues && issue.suggestedValues.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-slate-500">Quick Standardize:</span>
                          {issue.suggestedValues.map(s => (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => {
                                handleValueChange(issue.id, 'value', s.value);
                                handleValueChange(issue.id, 'reason', `Standardized to ${s.label}`);
                              }}
                              className="px-2 py-0.5 rounded text-[11px] font-bold bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-slate-700 transition"
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {issue.median !== undefined && (
                        <button
                          type="button"
                          onClick={() => {
                            handleValueChange(issue.id, 'value', issue.median);
                            handleValueChange(issue.id, 'reason', `Adjusted to benchmark median (${issue.median} ${issue.unit})`);
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-bold bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-slate-700 transition"
                        >
                          Use Median ({issue.median} {issue.unit})
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      {/* Value Input */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Corrected / Entered Value ({issue.unit || 'Score'})
                        </label>
                        <input
                          type={issue.unit ? 'number' : 'text'}
                          step="any"
                          value={state.value !== undefined ? state.value : (issue.currentValue ?? '')}
                          onChange={e => handleValueChange(issue.id, 'value', e.target.value)}
                          placeholder={issue.currentValue !== null ? String(issue.currentValue) : 'Enter measurement...'}
                          className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 bg-white"
                        />
                      </div>

                      {/* Audit Reason Input */}
                      <div className="sm:col-span-8">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Agronomist Audit Reason (Recorded in Scientific Log)
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={state.reason || ''}
                            onChange={e => handleValueChange(issue.id, 'reason', e.target.value)}
                            placeholder={
                              isZeroVal
                                ? 'e.g. Typo corrected from notebook OR confirmed dead seedling'
                                : issue.type === 'scale_inconsistency'
                                  ? 'e.g. Standardized BBCH code to ordinal stage'
                                  : 'e.g. Corrected field sheet typographical error'
                            }
                            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 bg-white"
                          />

                          {/* Quick Save Button */}
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSave(issue, 'correct_value')}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition disabled:opacity-50 shrink-0"
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Specific Action Buttons for Zeros and Mortality */}
                    {isZeroVal && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                        <span className="text-[11px] text-slate-600">
                          Is this 0 cm due to a dead seedling or damping off?
                        </span>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSave(issue, 'confirm_true_zero')}
                          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-md text-xs font-bold transition shadow-xs"
                          title="Confirm this zero as legitimate plant mortality without deleting or flagging as an anomaly"
                        >
                          <Sprout className="w-3.5 h-3.5" />
                          Confirm Seedling Mortality (True 0 cm)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 mt-auto">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>All saves instantly synchronize to IndexedDB, Firebase, ANOVA calculations, and report generators.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition"
          >
            Done / Close Doctor
          </button>
        </div>
      </div>
    </Modal>
  );
}
