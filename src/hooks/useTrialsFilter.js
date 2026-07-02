import { useMemo } from 'react';
import { safeJsonParse } from '../utils/helpers.js';

const fuzzyMatch = (text, query) => {
  if (!text) return false;
  text = text.toLowerCase();
  query = query.toLowerCase().trim();
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(token => {
    if (text.includes(token)) return true;
    let searchIdx = 0;
    for (let i = 0; i < token.length; i++) {
      searchIdx = text.indexOf(token[i], searchIdx);
      if (searchIdx === -1) return false;
      searchIdx++;
    }
    return true;
  });
};

export function useTrialsFilter(trials, {
  activeTab,
  deferredSearch,
  filterFormulation,
  filterResult,
  filterProject,
  filterDateStart,
  filterDateEnd,
  sortBy,
  user
}) {
  return useMemo(() => {
    let list = [...trials];
    
    // Tab filters
    if (activeTab === 'standard') list = list.filter(t => !t.ProjectID);
    else if (activeTab === 'rcbd') list = list.filter(t => !!t.ProjectID);
    else if (activeTab === 'control') list = list.filter(t => (t.IsControl === true || t.IsControl === 'true') && !t.ProjectID);
    else if (activeTab === 'finalized') list = list.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');

    // Fuzzy search
    if (deferredSearch) {
      list = list.filter(t => {
        const searchParts = [
          t.FormulationName,
          t.FormulationID,
          t.InvestigatorName,
          t.Location,
          t.WeedSpecies,
          t.ID,
          t.Notes,
          t.Conclusion,
          t.Replication,
          t.PlotNumber,
          t.Date
        ].filter(Boolean).join(' ');
        return fuzzyMatch(searchParts, deferredSearch);
      });
    }

    // Dropdown filters
    if (filterFormulation) list = list.filter(t => t.FormulationID === filterFormulation || t.FormulationName === filterFormulation);
    if (filterResult) list = list.filter(t => (t.Result || '') === filterResult);
    if (filterProject) list = list.filter(t => t.ProjectID === filterProject);

    // Date range filters
    if (filterDateStart) list = list.filter(t => t.Date && t.Date >= filterDateStart);
    if (filterDateEnd)   list = list.filter(t => t.Date && t.Date <= filterDateEnd);

    // Pot Trial Comparison helper
    const comparePots = (x, y) => {
      const xIsPot = x.TrialDesign === 'PotTrial' || x.PotLabel;
      const yIsPot = y.TrialDesign === 'PotTrial' || y.PotLabel;
      if (xIsPot && yIsPot) {
        const xRep = parseInt(x.Replication) || 0;
        const yRep = parseInt(y.Replication) || 0;
        if (xRep !== yRep) return xRep - yRep;

        const xRow = parseInt(x.PotRow) || 0;
        const yRow = parseInt(y.PotRow) || 0;
        if (xRow !== yRow) return xRow - yRow;

        const xCol = parseInt(x.PotCol) || 0;
        const yCol = parseInt(y.PotCol) || 0;
        return xCol - yCol;
      }
      return 0;
    };

    // Sort order mapping
    list.sort((a, b) => {
      if (sortBy === 'date-desc') {
        const dateDiff = new Date(b.Date || 0) - new Date(a.Date || 0);
        if (dateDiff !== 0) return dateDiff;

        const potSort = comparePots(a, b);
        if (potSort !== 0) return potSort;

        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
      }
      if (sortBy === 'date-asc') {
        const dateDiff = new Date(a.Date || 0) - new Date(b.Date || 0);
        if (dateDiff !== 0) return dateDiff;

        const potSort = comparePots(a, b);
        if (potSort !== 0) return potSort;

        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0);
      }
      if (sortBy === 'name') return (a.FormulationName || '').localeCompare(b.FormulationName || '');
      if (sortBy === 'obs') return (safeJsonParse(b.EfficacyDataJSON, []).length) - (safeJsonParse(a.EfficacyDataJSON, []).length);
      if (sortBy === 'shared') {
        const ownUid = user?.uid || user?.ID || user?.id;
        const aShared = a.AuthorID && a.AuthorID !== ownUid;
        const bShared = b.AuthorID && b.AuthorID !== ownUid;
        if (aShared && !bShared) return 1;
        if (!aShared && bShared) return -1;
        return new Date(b.Date || 0) - new Date(a.Date || 0);
      }
      return 0;
    });

    return list;
  }, [
    trials,
    activeTab,
    deferredSearch,
    filterFormulation,
    filterResult,
    filterProject,
    filterDateStart,
    filterDateEnd,
    sortBy,
    user
  ]);
}
