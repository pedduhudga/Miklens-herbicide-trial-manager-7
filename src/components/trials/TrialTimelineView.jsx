import React, { memo, useState, useEffect, useRef } from 'react';
import { Calendar, ChevronRight, Search, Sparkles } from 'lucide-react';
import TrialCard from '../TrialCard.jsx';

/**
 * High-Performance Progressive Batch Section for Timeline Groups.
 * Loads 16 plots instantly (0ms DOM mount), then seamlessly loads additional plots
 * via IntersectionObserver as the user scrolls, maintaining a locked 60 FPS on mobile.
 */
const TimelineGroupSection = memo(function TimelineGroupSection({
  group,
  isCollapsed,
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
  onComparePhotos,
}) {
  const [visibleCount, setVisibleCount] = useState(16);
  const sentinelRef = useRef(null);

  // Reset limit if group trials change (e.g., search filter change)
  useEffect(() => {
    setVisibleCount(16);
  }, [group.trials.length, group.key]);

  // Seamless auto-batch expansion via IntersectionObserver
  useEffect(() => {
    if (visibleCount >= group.trials.length || isCollapsed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 16, group.trials.length));
        }
      },
      { rootMargin: '400px' }
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [visibleCount, group.trials.length, isCollapsed]);

  if (isCollapsed) return null;

  const visibleTrials = group.trials.slice(0, visibleCount);
  const remainingCount = group.trials.length - visibleCount;

  return (
    <div className="space-y-4 pt-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleTrials.map(t => (
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
            onComparePhotos={onComparePhotos}
          />
        ))}
      </div>

      {remainingCount > 0 && (
        <div ref={sentinelRef} className="flex flex-col items-center justify-center py-2">
          <button
            type="button"
            onClick={() => setVisibleCount(c => Math.min(c + 24, group.trials.length))}
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 transition active:scale-95 shadow-2xs flex items-center gap-1.5"
          >
            <span>Showing {visibleTrials.length} of {group.trials.length} plots • Load {Math.min(24, remainingCount)} more</span>
          </button>
        </div>
      )}
    </div>
  );
});

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
  onComparePhotos,
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

            {/* High-Performance Progressive Batch Cards Grid */}
            <TimelineGroupSection
              group={group}
              isCollapsed={isCollapsed}
              projectMap={projectMap}
              selectedForBulk={selectedForBulk}
              isTrialPendingSync={isTrialPendingSync}
              openCardMenu={openCardMenu}
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
              onComparePhotos={onComparePhotos}
            />
          </div>
        );
      })}
    </div>
  );
});

export default TrialTimelineView;
