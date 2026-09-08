import React, { memo } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
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
    <div className="space-y-8">
      {groupedTimelineTrials.map(group => (
        <div key={group.key} className="space-y-4">
          {/* Sticky Date Header with glassmorphism & shadow */}
          <div 
            onClick={() => toggleSection(group.key)}
            className="flex items-center justify-between sticky top-[108px] z-10 bg-white/95 dark:bg-slate-900/95 py-3 px-4 backdrop-blur-md border-l-4 border-l-emerald-500 border border-slate-200/80 rounded-xl cursor-pointer hover:bg-emerald-50/40 transition-all select-none shadow-sm"
          >
            <div className="flex items-center gap-3">
              <ChevronRight className={`w-4 h-4 text-emerald-600 transition-transform duration-200 ${!collapsedSections[group.key] ? 'rotate-90' : ''}`} />
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-emerald-950 dark:text-emerald-100 text-sm md:text-base tracking-tight">
                  {group.key}
                </h3>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                {group.trials.length} {group.trials.length === 1 ? 'trial' : 'trials'}
              </span>
            </div>
          </div>

          {/* Trial Cards Grid */}
          {!collapsedSections[group.key] && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-2">
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
      ))}
    </div>
  );
});

export default TrialTimelineView;
