import React, { memo, useState, useMemo } from 'react';
import {
  ClipboardList, Activity, FlaskConical, CheckCircle, Archive,
  MapPin, Calendar, Camera, Eye, Edit, Star, ShieldCheck
} from 'lucide-react';
import { safeJsonParse } from '../../utils/helpers.js';

const KANBAN_COLUMNS = [
  { id: 'planned', label: 'Planned', icon: ClipboardList, border: 'border-sky-200', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 'ongoing', label: 'Ongoing', icon: Activity, border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'evaluated', label: 'Evaluated', icon: FlaskConical, border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'completed', label: 'Completed', icon: CheckCircle, border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'archived', label: 'Archived', icon: Archive, border: 'border-slate-200', badge: 'bg-slate-200 text-slate-700 border-slate-300' },
];

export function getTrialKanbanStage(trial) {
  if (trial.Status === 'Archived' || trial.IsArchived) return 'archived';
  if (trial.IsCompleted || trial.Status === 'Completed') return 'completed';
  
  const obs = safeJsonParse(trial.EfficacyDataJSON || trial.observations, []);
  const hasObservations = Array.isArray(obs) && obs.length > 0;
  const hasRating = !!trial.Result && trial.Result !== 'Control';

  if (hasRating || (hasObservations && obs.length >= 2)) return 'evaluated';
  if (hasObservations || trial.IsLive) return 'ongoing';
  return 'planned';
}

const RESULT_BADGES = {
  'Excellent': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Good': 'bg-blue-100 text-blue-800 border-blue-300',
  'Fair': 'bg-amber-100 text-amber-800 border-amber-300',
  'Poor': 'bg-red-100 text-red-800 border-red-300',
  'Control': 'bg-purple-100 text-purple-800 border-purple-300',
};

const KanbanCard = memo(function KanbanCard({
  trial,
  project,
  onViewDetails,
  onEdit,
  onQuickPhoto,
  onQuickRate,
  onDragStart
}) {
  const obs = safeJsonParse(trial.EfficacyDataJSON || trial.observations, []);
  const photos = safeJsonParse(trial.PhotoURLs, []);
  const target = trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.NutrientTarget || trial.Target || '';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, trial)}
      className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-700 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 
          onClick={() => onViewDetails(trial)}
          className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 transition-colors line-clamp-1 cursor-pointer"
        >
          {trial.FormulationName || 'Unnamed Trial'}
        </h4>
        {trial.Result && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${RESULT_BADGES[trial.Result] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {trial.Result}
          </span>
        )}
      </div>

      {/* Meta tags */}
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
        {project && (
          <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 truncate">
            📁 {project.Name}
          </div>
        )}
        {(trial.Crop || target) && (
          <div className="truncate">
            <span className="font-medium text-slate-700 dark:text-slate-300">{trial.Crop}</span>
            {trial.Crop && target ? ' · ' : ''}
            <span>{target}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5">
          {trial.Location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              {trial.Location}
            </span>
          )}
          {trial.Date && (
            <span className="flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3 text-slate-400" />
              {new Date(trial.Date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Footer Status Indicators & Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
          <span>{obs.length} {obs.length === 1 ? 'obs' : 'obs'}</span>
          <span>·</span>
          <span>{photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span>
        </div>

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {onQuickPhoto && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickPhoto(trial); }}
              title="Add Field Photo"
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-emerald-600 transition"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(trial); }}
              title="Edit Trial"
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 transition"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewDetails(trial); }}
            title="View Details"
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-emerald-600 transition"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

const TrialKanbanBoard = memo(function TrialKanbanBoard({
  trials = [],
  projectMap = {},
  onViewDetails,
  onEdit,
  onQuickPhoto,
  onQuickRate,
  onStageChange
}) {
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // Group trials by their stage
  const columnsData = useMemo(() => {
    const map = {
      planned: [],
      ongoing: [],
      evaluated: [],
      completed: [],
      archived: [],
    };
    trials.forEach(t => {
      const stage = getTrialKanbanStage(t);
      if (map[stage]) {
        map[stage].push(t);
      } else {
        map.planned.push(t);
      }
    });
    return map;
  }, [trials]);

  const handleDragStart = (e, trial) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ trialId: trial.ID }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = (e, columnId) => {
    if (dragOverColumn === columnId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    try {
      const rawData = e.dataTransfer.getData('text/plain');
      if (!rawData) return;
      const { trialId } = JSON.parse(rawData);
      const trial = trials.find(t => t.ID === trialId);
      if (trial && onStageChange) {
        onStageChange(trial, targetColumnId);
      }
    } catch (err) {
      console.error('Error during kanban drop:', err);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map(col => {
        const IconComponent = col.icon;
        const colTrials = columnsData[col.id] || [];
        const isTargeted = dragOverColumn === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={(e) => handleDragLeave(e, col.id)}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`flex flex-col rounded-2xl border transition-colors bg-slate-50/70 dark:bg-slate-900/40 p-3 min-h-[450px] ${
              isTargeted ? 'border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50/30' : col.border
            }`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <IconComponent className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  {col.label}
                </h3>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${col.badge}`}>
                {colTrials.length}
              </span>
            </div>

            {/* Column Body Cards */}
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
              {colTrials.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400 text-center p-4">
                  <span>No trials in {col.label.toLowerCase()}</span>
                  <span className="text-[10px] mt-1 text-slate-300">Drag trials here</span>
                </div>
              ) : (
                colTrials.map(trial => (
                  <KanbanCard
                    key={trial.ID}
                    trial={trial}
                    project={projectMap[trial.ProjectID]}
                    onViewDetails={onViewDetails}
                    onEdit={onEdit}
                    onQuickPhoto={onQuickPhoto}
                    onQuickRate={onQuickRate}
                    onDragStart={handleDragStart}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default TrialKanbanBoard;
