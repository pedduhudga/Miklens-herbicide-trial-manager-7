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
  user,
  filterOwner,
  registeredUsers = []
}) {
  return useMemo(() => {
    let list = [...trials];
    
    // Tab filters
    if (activeTab === 'standard') list = list.filter(t => !t.ProjectID);
    else if (activeTab === 'rcbd') list = list.filter(t => !!t.ProjectID);
    else if (activeTab === 'control') list = list.filter(t => (t.IsControl === true || t.IsControl === 'true') && !t.ProjectID);
    else if (activeTab === 'finalized') list = list.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');

    // Owner / Scientist filters
    if (filterOwner && filterOwner !== 'all') {
      const ownUid = user?.uid || user?.ID || user?.id;
      if (filterOwner === 'mine') {
        list = list.filter(t => t.CreatedBy === ownUid || t.AuthorID === ownUid || (!t.CreatedBy && !t.AuthorID));
      } else if (filterOwner === 'others') {
        list = list.filter(t => (t.CreatedBy && t.CreatedBy !== ownUid) || (t.AuthorID && t.AuthorID !== ownUid));
      } else {
        const targetLower = filterOwner.toLowerCase().trim();
        const emailPrefix = targetLower.split('@')[0].split('.')[0];
        
        const targetUserDoc = (registeredUsers || []).find(u => {
          const uEmail = (u.Username || u.username || u.email || '').toLowerCase().trim();
          return uEmail === targetLower || u.id === filterOwner || u.uid === filterOwner || u.ID === filterOwner;
        });

        const userUids = new Set([filterOwner, targetLower]);
        if (targetUserDoc) {
          [targetUserDoc.id, targetUserDoc.uid, targetUserDoc.ID].forEach(id => id && userUids.add(id));
          if (Array.isArray(targetUserDoc.previousUids)) {
            targetUserDoc.previousUids.forEach(p => p && userUids.add(p));
          }
        }

        const nameVariations = new Set([targetLower]);
        if (targetUserDoc?.Name) nameVariations.add(targetUserDoc.Name.toLowerCase().trim());
        if (targetUserDoc?.displayName) nameVariations.add(targetUserDoc.displayName.toLowerCase().trim());
        if (emailPrefix) nameVariations.add(emailPrefix);

        list = list.filter(t => {
          if (t.CreatedBy && userUids.has(t.CreatedBy)) return true;
          if (t.AuthorID && userUids.has(t.AuthorID)) return true;
          if (t.AuthorEmail && (t.AuthorEmail.toLowerCase().trim() === targetLower || userUids.has(t.AuthorEmail))) return true;

          const invLower = (t.InvestigatorName || '').toLowerCase().trim();
          if (!invLower) return false;
          if (invLower === targetLower) return true;
          if (nameVariations.has(invLower)) return true;

          // Partial prefix matching (e.g. "sandeep" matches "Sandeep K", "sandeep k")
          if (emailPrefix && emailPrefix.length >= 3) {
            const firstWord = invLower.split(/\s+/)[0];
            if (firstWord === emailPrefix || invLower.includes(emailPrefix) || emailPrefix.includes(firstWord)) {
              return true;
            }
          }
          return false;
        });
      }
    }

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
    user,
    filterOwner
  ]);
}
