import React from 'react';
import {
  Search, X, SlidersHorizontal, Grid, Calendar, FileDown,
  RefreshCw, FolderPlus, Plus, Columns3
} from 'lucide-react';

export default function TrialFiltersBar({
  search,
  setSearch,
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
  tabCounts = {}
}) {
  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 px-4 py-3 space-y-3">
      <div className="flex gap-2 items-center">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trials..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Owner dropdown */}
        <div className="w-44 md:w-56">
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white font-medium text-slate-700 cursor-pointer shadow-sm"
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

        {/* Toggle filters drawer */}
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={`p-2 rounded-lg border transition ${showFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}
          title="Toggle Filter Options"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* View Mode Toggle: Grid, Timeline, Kanban */}
        <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50 gap-0.5">
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

        {/* Action Buttons for non-viewers */}
        {!isViewer && (
          <>
            <button
              type="button"
              onClick={exportAllCsv}
              title="Export all trials to CSV"
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition"
            >
              <FileDown className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => handleSyncAllPhotosFromDrive()}
              disabled={syncingAllPhotos}
              title="Sync all broken/unavailable photos from Google Drive for all trials"
              className={`p-2 rounded-lg border transition ${syncingAllPhotos ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed' : 'border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'}`}
            >
              <RefreshCw className={`w-4 h-4 ${syncingAllPhotos ? 'animate-spin' : ''}`} />
            </button>

            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 bg-white"
              title="Heal existing only: Only restore broken/unavailable photos already in the list; do not import new/deleted photos."
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
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition"
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="btn-primary text-white px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> New Trial
            </button>
          </>
        )}
      </div>

      {/* Filter Drawer */}
      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-1">
          <select
            value={filterFormulation}
            onChange={e => setFilterFormulation(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Formulations</option>
            {formulations.map(f => (
              <option key={f.ID} value={f.Name}>{f.Name}</option>
            ))}
          </select>

          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.ID} value={p.ID}>{p.Name}</option>
            ))}
          </select>

          <select
            value={filterResult}
            onChange={e => setFilterResult(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Results</option>
            {['Excellent', 'Good', 'Fair', 'Poor', 'Control'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name">By Formulation</option>
            <option value="obs">Most Observations</option>
            <option value="shared">Shared Status</option>
          </select>

          <div className="col-span-2 flex gap-2 items-center">
            <span className="text-xs font-semibold text-slate-500 shrink-0">From</span>
            <input
              type="date"
              value={filterDateStart}
              onChange={e => setFilterDateStart(e.target.value)}
              className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-xs font-semibold text-slate-500 shrink-0">To</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={e => setFilterDateEnd(e.target.value)}
              className="flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100 transition"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {[
          ['all', 'All'],
          ['standard', 'Standard'],
          ['rcbd', 'Project-Grouped'],
          ['control', 'Control'],
          ['finalized', 'Finalized']
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveTab(k)}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              activeTab === k
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label} <span className="ml-1 opacity-70">({tabCounts[k] || 0})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
