import { useMemo } from 'react';
import { safeJsonParse } from '../utils/helpers.js';
import { getTrialCalculatedEfficacy } from '../utils/formulationTrialUtils.js';
import { calculateEffectiveControlDays } from '../utils/trialLifecycle.js';
import { parseCustomDate } from '../utils/dateUtils.js';

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
  registeredUsers = [],
  activeCategory = 'herbicide'
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

    // Helper to safely extract timestamp from any date string
    const getTimeFromDate = (d) => {
      if (!d) return 0;
      const parsed = parseCustomDate(d);
      if (parsed && !isNaN(parsed.getTime())) return parsed.getTime();
      const std = new Date(d);
      return isNaN(std.getTime()) ? 0 : std.getTime();
    };

    // Helper to extract control days from trial (strictly matching TrialCard logic)
    const getTrialControlDays = (t) => {
      const effDays = calculateEffectiveControlDays(t);
      if (effDays > 0) return effDays;
      if (t.FinalControlDuration && !isNaN(parseInt(t.FinalControlDuration, 10))) {
        const parsed = parseInt(t.FinalControlDuration, 10);
        if (parsed > 0) return parsed;
      }
      return 0;
    };

    // Sort order mapping
    list.sort((a, b) => {
      if (sortBy === 'best') {
        const effA = getTrialCalculatedEfficacy(a, activeCategory) ?? 0;
        const effB = getTrialCalculatedEfficacy(b, activeCategory) ?? 0;
        const daysA = getTrialControlDays(a);
        const daysB = getTrialControlDays(b);
        const scoreA = effA * 0.5 + Math.min(100, (daysA / 30) * 100) * 0.5;
        const scoreB = effB * 0.5 + Math.min(100, (daysB / 30) * 100) * 0.5;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return getTimeFromDate(b.Date) - getTimeFromDate(a.Date);
      }
      if (sortBy === 'kill-rate') {
        const effA = getTrialCalculatedEfficacy(a, activeCategory) ?? -1;
        const effB = getTrialCalculatedEfficacy(b, activeCategory) ?? -1;
        if (effB !== effA) return effB - effA;
        const daysA = getTrialControlDays(a);
        const daysB = getTrialControlDays(b);
        if (daysB !== daysA) return daysB - daysA;
        return getTimeFromDate(b.Date) - getTimeFromDate(a.Date);
      }
      if (sortBy === 'control-days') {
        const daysA = getTrialControlDays(a);
        const daysB = getTrialControlDays(b);
        if (daysB !== daysA) return daysB - daysA;
        const effA = getTrialCalculatedEfficacy(a, activeCategory) ?? -1;
        const effB = getTrialCalculatedEfficacy(b, activeCategory) ?? -1;
        if (effB !== effA) return effB - effA;
        return getTimeFromDate(b.Date) - getTimeFromDate(a.Date);
      }
      if (sortBy === 'date-desc') {
        const dateDiff = getTimeFromDate(b.Date) - getTimeFromDate(a.Date);
        if (dateDiff !== 0) return dateDiff;

        const potSort = comparePots(a, b);
        if (potSort !== 0) return potSort;

        const aTime = new Date(a.DateUpdatedAt || a.CreatedAt || a._createdAt?.toDate?.() || 0).getTime();
        const bTime = new Date(b.DateUpdatedAt || b.CreatedAt || b._createdAt?.toDate?.() || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
      }
      if (sortBy === 'date-asc') {
        const dateDiff = getTimeFromDate(a.Date) - getTimeFromDate(b.Date);
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
        return getTimeFromDate(b.Date) - getTimeFromDate(a.Date);
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
    filterOwner,
    activeCategory
  ]);
}
