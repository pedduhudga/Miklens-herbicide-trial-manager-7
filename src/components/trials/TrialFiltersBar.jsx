import React from 'react';
import {
  Search, X, SlidersHorizontal, Grid, Calendar, FileDown,
  RefreshCw, FolderPlus, Plus, Columns3, Mic, Sparkles, Clock, Camera, AlertTriangle, CheckCircle2
} from 'lucide-react';

export default function TrialFiltersBar({
  search,
  setSearch,
  onOpenVoiceScout,
  filterOwner,
  setFilterOwner,
  ownerOptions = [],
  showFilters,
  setShowFilters,
  isTimelineView,
  setIsTimelineView,
  viewMode = isTimelineView ? 'timeline' : 'grid',
  setViewMode,
  isViewer,
  exportAllCsv,
  handleSyncAllPhotosFromDrive,
  syncingAllPhotos,
  syncHealOnly,
  setSyncHealOnly,
  armFileInputRef,
  handleARMImportChange,
  handleARMImportClick,
  handleOpenModal,
  filterFormulation,
  setFilterFormulation,
  formulations = [],
  filterProject,
  setFilterProject,
  projects = [],
  filterResult,
  setFilterResult,
  sortBy,
  setSortBy,
  filterDateStart,
  setFilterDateStart,
  filterDateEnd,
  setFilterDateEnd,
  onResetFilters,
  activeTab,
  setActiveTab,
  tabCounts = {},
  performanceFilter = 'all',
  setPerformanceFilter,
  performanceCounts = {}
}) {
  const renderUtilityActions = (containerClass = '') => {
    if (isViewer) return null;
    return (
      <div className={`items-center gap-1 sm:gap-1.5 shrink-0 ${containerClass}`}>
        {/* Folder icon: ARM CSV Import */}
        <input
          type="file"
          ref={armFileInputRef}
          onChange={handleARMImportChange}
          accept=".csv"
          className="hidden"
        />
        <button
          type="button"
          onClick={handleARMImportClick}
          title="Import trials from ARM CSV"
          className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition shrink-0 active:scale-95"
        >
          <FolderPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Sync photos from Google Drive */}
        <button
          type="button"
          onClick={() => handleSyncAllPhotosFromDrive()}
          disabled={syncingAllPhotos}
          title="Sync broken/unavailable photos from Google Drive"
          className={`p-1.5 sm:p-2 rounded-lg border transition shrink-0 active:scale-95 ${syncingAllPhotos ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed' : 'border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${syncingAllPhotos ? 'animate-spin' : ''}`} />
        </button>

        {/* Heal only checkbox */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 bg-white shrink-0"
          title="Heal existing only: Only restore broken/unavailable photos already in the list"
        >
          <input
            type="checkbox"
            id="syncHealOnly"
            checked={syncHealOnly}
            onChange={e => setSyncHealOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <label htmlFor="syncHealOnly" className="text-xs select-none cursor-pointer">Heal only</label>
        </div>

        {/* Export all to CSV */}
        <button
          type="button"
          onClick={exportAllCsv}
          title="Export all trials to CSV"
          className="p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition shrink-0 active:scale-95"
        >
          <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="sticky top-0 z-20 bg-white/98 backdrop-blur border-b border-slate-200/90 shadow-2xs px-3 sm:px-4 py-2.5 sm:py-3 space-y-2 sm:space-y-2.5 w-full max-w-full overflow-hidden">
      {/* ── ROW 1: Search, Filter Toggle, Voice Scout & New Trial ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0">
        {/* Search input */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trials..."
            className="w-full pl-9 pr-7 sm:pr-8 py-1.5 sm:py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Owner dropdown (visible in Row 1 on large screens) */}
        <div className="hidden lg:block w-48 xl:w-56 shrink-0">
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium text-slate-700 cursor-pointer shadow-xs truncate"
          >
            <option value="all">All Trials</option>
            <option value="mine">My Trials Only</option>
            <option value="others">Shared / Employee Trials</option>
            {ownerOptions.length > 0 && (
              <optgroup label="Filter by Scientist">
                {ownerOptions.map(owner => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* View Mode Toggle: Grid, Timeline, Kanban (visible in Row 1 on lg+ screens) */}
        <div className="hidden lg:flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50 gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (setViewMode) setViewMode('grid');
              if (setIsTimelineView) setIsTimelineView(false);
              try { localStorage.setItem('trialViewMode', 'grid'); localStorage.setItem('isTimelineView', 'false'); } catch (e) {}
            }}
            title="Grid View"
            className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (setViewMode) setViewMode('timeline');
              if (setIsTimelineView) setIsTimelineView(true);
              try { localStorage.setItem('trialViewMode', 'timeline'); localStorage.setItem('isTimelineView', 'true'); } catch (e) {}
            }}
            title="Timeline View"
            className={`p-1.5 rounded-md transition ${viewMode === 'timeline' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (setViewMode) setViewMode('kanban');
              if (setIsTimelineView) setIsTimelineView(false);
              try { localStorage.setItem('trialViewMode', 'kanban'); } catch (e) {}
            }}
            title="Kanban Board View"
            className={`p-1.5 rounded-md transition ${viewMode === 'kanban' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Columns3 className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle filters drawer */}
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={`p-1.5 sm:p-2 rounded-lg border transition shrink-0 ${showFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          title="Toggle Filter Options"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Voice Scout (Mike Icon) */}
        {onOpenVoiceScout && (
          <button
            type="button"
            onClick={onOpenVoiceScout}
            title="AI Voice Field Scout: Dictate notes, DAA, weed control % hands-free"
            className="p-1.5 sm:px-3 sm:py-2 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition shadow-2xs shrink-0 group active:scale-95"
          >
            <Mic className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform animate-pulse" />
            <span className="hidden sm:inline">Voice Scout</span>
          </button>
        )}

        {/* New Trial button */}
        {!isViewer && (
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="btn-primary text-white px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 shadow-sm active:scale-95"
            title="Create New Trial"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Trial</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {/* ── ROW 2: Mobile / Tablet Owner dropdown, View Switcher, and Tablet Utility Actions ── */}
      <div className="flex lg:hidden items-center justify-between gap-1.5 sm:gap-2 w-full min-w-0">
        {/* Owner dropdown (on mobile and screens < lg) */}
        <div className="flex-1 min-w-[110px] max-w-[190px]">
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium text-slate-700 cursor-pointer shadow-xs truncate"
          >
            <option value="all">All Trials</option>
            <option value="mine">My Trials</option>
            <option value="others">Shared / Others</option>
            {ownerOptions.length > 0 && (
              <optgroup label="Filter by Scientist">
                {ownerOptions.map(owner => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* View Mode Switcher for screens < lg */}
        <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50 gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (setViewMode) setViewMode('grid');
              if (setIsTimelineView) setIsTimelineView(false);
              try { localStorage.setItem('trialViewMode', 'grid'); localStorage.setItem('isTimelineView', 'false'); } catch (e) {}
            }}
            title="Grid View"
            className={`p-1 sm:p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (setViewMode) setViewMode('timeline');
              if (setIsTimelineView) setIsTimelineView(true);
              try { localStorage.setItem('trialViewMode', 'timeline'); localStorage.setItem('isTimelineView', 'true'); } catch (e) {}
            }}
            title="Timeline View"
            className={`p-1 sm:p-1.5 rounded-md transition ${viewMode === 'timeline' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (setViewMode) setViewMode('kanban');
              if (setIsTimelineView) setIsTimelineView(false);
              try { localStorage.setItem('trialViewMode', 'kanban'); } catch (e) {}
            }}
            title="Kanban Board View"
            className={`p-1 sm:p-1.5 rounded-md transition ${viewMode === 'kanban' ? 'bg-white shadow-xs text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Columns3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Tablet Utility action buttons */}
        {renderUtilityActions('hidden sm:flex lg:hidden ml-auto')}
      </div>

      {/* Filter Drawer */}
      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 pb-1 border-t border-slate-100 animate-slide-down">
          <select
            value={filterFormulation}
            onChange={e => setFilterFormulation(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#154734]/30"
          >
            <option value="">All Formulations</option>
            {formulations.map(f => (
              <option key={f.ID} value={f.Name}>{f.Name}</option>
            ))}
          </select>

          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#154734]/30"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.ID} value={p.ID}>{p.Name}</option>
            ))}
          </select>

          <select
            value={filterResult}
            onChange={e => setFilterResult(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#154734]/30"
          >
            <option value="">All Results</option>
            {['Excellent', 'Good', 'Fair', 'Poor', 'Control'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs sm:text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#154734]/30 font-medium"
          >
            <option value="best">🏆 Best (High Kill & Long Residual)</option>
            <option value="kill-rate">⚡ Highest Kill Rate / Efficacy</option>
            <option value="control-days">⏳ Longest Control Days</option>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name">By Formulation</option>
            <option value="obs">Most Observations</option>
            <option value="shared">Shared Status</option>
          </select>

          <div className="col-span-2 flex gap-1.5 items-center">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">From</span>
            <input
              type="date"
              value={filterDateStart}
              onChange={e => setFilterDateStart(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#154734]/30"
            />
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">To</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={e => setFilterDateEnd(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#154734]/30"
            />
          </div>

          {/* Mobile utility buttons in drawer */}
          <div className="col-span-2 sm:hidden flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleARMImportClick}
                className="px-2 py-1 rounded-md text-[11px] font-medium border border-slate-200 text-slate-700 bg-slate-50 flex items-center gap-1"
              >
                <FolderPlus className="w-3 h-3 text-slate-500" /> ARM CSV
              </button>
              <button
                type="button"
                onClick={() => handleSyncAllPhotosFromDrive()}
                disabled={syncingAllPhotos}
                className="px-2 py-1 rounded-md text-[11px] font-medium border border-slate-200 text-slate-700 bg-slate-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 text-slate-500 ${syncingAllPhotos ? 'animate-spin' : ''}`} /> Sync Drive
              </button>
              <button
                type="button"
                onClick={exportAllCsv}
                className="px-2 py-1 rounded-md text-[11px] font-medium border border-slate-200 text-slate-700 bg-slate-50 flex items-center gap-1"
              >
                <FileDown className="w-3 h-3 text-slate-500" /> Export
              </button>
            </div>
            <button
              type="button"
              onClick={onResetFilters}
              className="text-[11px] text-red-600 font-semibold bg-red-50 rounded-lg px-2.5 py-1 hover:bg-red-100 transition"
            >
              Reset
            </button>
          </div>

          <button
            type="button"
            onClick={onResetFilters}
            className="hidden sm:block text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100 transition"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Tabs & Desktop Utility Actions */}
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 -mx-1 px-1 touch-pan-x flex-1 min-w-0">
          <div className="flex gap-1.5 items-center shrink-0">
            {[
              ['all', 'All Plots'],
              ['active', 'Active / Live'],
              ['standard', 'Standard'],
              ['rcbd', 'Project-Grouped'],
              ['control', 'Control'],
              ['finalized', 'Finalized']
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setActiveTab(k)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 active:scale-95 touch-manipulation ${
                  activeTab === k
                    ? 'bg-[#154734] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === k ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tabCounts[k] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Utility Actions integrated alongside tabs */}
        {renderUtilityActions('hidden lg:flex shrink-0 ml-auto')}
      </div>

      {/* Quick Agronomic Performance Filter Chips */}
      {setPerformanceFilter && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 -mx-1 px-1 text-xs touch-pan-x">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#154734]" /> Focus:
          </span>
          <button
            type="button"
            onClick={() => setPerformanceFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 text-xs active:scale-95 touch-manipulation ${
              performanceFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>All</span>
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('high-kill')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 text-xs active:scale-95 touch-manipulation ${
              performanceFilter === 'high-kill'
                ? 'bg-[#154734] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-[#154734]'
            }`}
          >
            <span>⚡ High Kill (≥70%)</span>
            {performanceCounts?.highKill !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                performanceFilter === 'high-kill' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-[#154734]'
              }`}>
                {performanceCounts.highKill}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('long-control')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 text-xs active:scale-95 touch-manipulation ${
              performanceFilter === 'long-control'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            <span>⏳ Long Residual (≥15d)</span>
            {performanceCounts?.longControl !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                performanceFilter === 'long-control' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
              }`}>
                {performanceCounts.longControl}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('needs-obs')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 text-xs active:scale-95 touch-manipulation ${
              performanceFilter === 'needs-obs'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
            }`}
          >
            <span>⚠️ Needs Obs (&gt;7d)</span>
            {performanceCounts?.needsObs !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                performanceFilter === 'needs-obs' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
              }`}>
                {performanceCounts.needsObs}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPerformanceFilter('has-photos')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 text-xs active:scale-95 touch-manipulation ${
              performanceFilter === 'has-photos'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
            }`}
          >
            <span>📸 With Photos</span>
            {performanceCounts?.hasPhotos !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                performanceFilter === 'has-photos' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
              }`}>
                {performanceCounts.hasPhotos}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
