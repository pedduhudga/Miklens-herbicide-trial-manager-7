import React, { memo } from 'react';
import { Calendar, ChevronRight, Search, Sparkles } from 'lucide-react';
import TrialCard from '../TrialCard.jsx';

const TrialTimelineView = memo(function TrialTimelineView({
  groupedTimelineTrials,
  collapsedSections,
  toggleSection,
  projectMap,
  selectedForBulk,
  isTrialPendingSync,
  openCardMenu,
  onToggleBulk,
  onToggleMenu,
  onViewDetails,
  onEdit,
  onDuplicate,
  onMoveToProject,
  onExportPdf,
  onExportSciPdf,
  onExportInstitutionalDossier,
  onExportPpt,
  onExportHtml,
  onExportTxt,
  onExportCsv,
  onExportJson,
  onShare,
  onAppSharing,
  onAiGenerate,
  onDelete,
  onActivateToggle,
  onQuickRate,
  onQuickPhoto,
  onQuickGalleryUpload,
  onMarkComplete,
  onEditControlDays,
  onRecordWeather,
  onQuickPeekFormulation,
}) {
  if (!groupedTimelineTrials || groupedTimelineTrials.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        No trials found matching the current timeline criteria.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedTimelineTrials.map(group => {
        const isCollapsed = !group.isSearchGroup && !!collapsedSections[group.key];
        return (
          <div key={group.key} className="space-y-3">
            {/* Clean relative Date / Search Header: never collides with sticky search bar or focus chips */}
            <div 
              onClick={() => !group.isSearchGroup && toggleSection(group.key)}
              className={`flex items-center justify-between relative z-0 bg-white dark:bg-slate-900 py-3 px-4 border-l-4 ${
                group.isSearchGroup ? 'border-l-purple-500 bg-purple-50/30' : 'border-l-emerald-500'
              } border border-slate-200/80 rounded-xl ${group.isSearchGroup ? '' : 'cursor-pointer hover:bg-emerald-50/40'} transition-all select-none shadow-xs`}
            >
              <div className="flex items-center gap-3">
                {!group.isSearchGroup && (
                  <ChevronRight className={`w-4 h-4 text-emerald-600 transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`} />
                )}
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg ${group.isSearchGroup ? 'bg-purple-600' : 'bg-emerald-500'} text-white flex items-center justify-center shadow-sm shrink-0`}>
                    {group.isSearchGroup ? <Search className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                  </div>
                  <h3 className={`font-extrabold ${group.isSearchGroup ? 'text-purple-950 dark:text-purple-100' : 'text-emerald-950 dark:text-emerald-100'} text-sm md:text-base tracking-tight`}>
                    {group.key}
                  </h3>
                </div>
                <span className={`${group.isSearchGroup ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'} text-xs font-extrabold px-2.5 py-0.5 rounded-full border`}>
                  {group.trials.length} {group.trials.length === 1 ? 'trial' : 'trials'}
                </span>
              </div>
            </div>

            {/* Trial Cards Grid */}
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-1">
              {group.trials.map(t => (
                <TrialCard
                  key={t.ID}
                  trial={t}
                  project={projectMap[t.ProjectID]}
                  isSelected={selectedForBulk.has(t.ID)}
                  isPendingSync={isTrialPendingSync(t)}
                  isMenuOpen={openCardMenu === t.ID}
                  onToggleBulk={onToggleBulk}
                  onToggleMenu={onToggleMenu}
                  onViewDetails={onViewDetails}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onMoveToProject={onMoveToProject}
                  onExportPdf={onExportPdf}
                  onExportSciPdf={onExportSciPdf}
                  onExportInstitutionalDossier={onExportInstitutionalDossier}
                  onExportPpt={onExportPpt}
                  onExportHtml={onExportHtml}
                  onExportTxt={onExportTxt}
                  onExportCsv={onExportCsv}
                  onExportJson={onExportJson}
                  onShare={onShare}
                  onAppSharing={onAppSharing}
                  onAiGenerate={onAiGenerate}
                  onDelete={onDelete}
                  onActivateToggle={onActivateToggle}
                  onQuickRate={onQuickRate}
                  onQuickPhoto={onQuickPhoto}
                  onQuickGalleryUpload={onQuickGalleryUpload}
                  onMarkComplete={onMarkComplete}
                  onEditControlDays={onEditControlDays}
                  onRecordWeather={onRecordWeather}
                  onQuickPeekFormulation={onQuickPeekFormulation}
                />
              ))}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
});

export default TrialTimelineView;
