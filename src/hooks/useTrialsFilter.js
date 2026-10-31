import { useMemo } from 'react';
import { safeJsonParse } from '../utils/helpers.js';
import { getTrialCalculatedEfficacy } from '../utils/formulationTrialUtils.js';
import { calculateEffectiveControlDays } from '../utils/trialLifecycle.js';
import { parseCustomDate } from '../utils/dateUtils.js';

// Ultra-fast Levenshtein distance for fuzzy typo tolerance
function getLevenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 99;

  const d = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[a.length][b.length];
}

/**
 * Calculates an advanced search relevance score for an agronomy trial.
 * Returns 0 if trial does not strictly match all query tokens.
 */
function scoreTrialSearch(trial, query) {
  if (!query || !query.trim()) return 0;
  const rawQuery = query.toLowerCase().trim();
  const tokens = rawQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  const trialName = String(trial.TrialName || '').toLowerCase().trim();
  const formName = String(trial.FormulationName || '').toLowerCase().trim();
  const formId = String(trial.FormulationID || '').toLowerCase().trim();
  const projName = String(trial.ProjectName || '').toLowerCase().trim();
  const target = String(trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.CropTarget || trial.Target || '').toLowerCase().trim();
  const crop = String(trial.Crop || trial.CropCrop || '').toLowerCase().trim();
  const variety = String(trial.Variety || '').toLowerCase().trim();
  const inv = String(trial.InvestigatorName || '').toLowerCase().trim();
  const loc = String(trial.Location || '').toLowerCase().trim();
  const notes = String(trial.Notes || '').toLowerCase().trim();
  const conclusion = String(trial.Conclusion || '').toLowerCase().trim();
  const trialId = String(trial.ID || '').toLowerCase().trim();
  const repStr = trial.Replication !== undefined && trial.Replication !== null ? String(trial.Replication).trim() : '';
  const plotStr = trial.PlotNumber !== undefined && trial.PlotNumber !== null ? String(trial.PlotNumber).trim() : '';
  const dosage = String(trial.Dosage || '').toLowerCase().trim();

  let score = 0;

  // Exact phrase match bonus
  if (trialName === rawQuery) {
    score += 5000;
  } else if (trialName.startsWith(rawQuery)) {
    score += 3000;
  } else if (trialName.includes(rawQuery)) {
    score += 2000;
  } else if (formName === rawQuery) {
    score += 2500;
  } else if (formName.includes(rawQuery)) {
    score += 1800;
  } else if (projName.includes(rawQuery)) {
    score += 1200;
  } else if (target.includes(rawQuery)) {
    score += 1000;
  }

  const tokenize = (s) => s.split(/[\s,;.()\-_/]+/).filter(Boolean);
  const trialWords = tokenize(trialName);
  const formWords = tokenize(formName);
  const projWords = tokenize(projName);
  const targetWords = tokenize(target);
  const otherWords = [...tokenize(crop), ...tokenize(variety), ...tokenize(inv), ...tokenize(loc)];

  // Conjunction: EVERY token must be matched in the trial
  for (const token of tokens) {
    let tokenScore = 0;
    const isNum = /^\d+$/.test(token);

    if (isNum) {
      if (trialWords.includes(token)) {
        tokenScore += 500;
      } else if (formWords.includes(token)) {
        tokenScore += 400;
      } else if (repStr === token || `rep ${token}`.includes(token)) {
        tokenScore += 300;
      } else if (plotStr === token || `plot ${token}`.includes(token)) {
        tokenScore += 300;
      } else if (trialId === token || trialId.endsWith(`_${token}`) || trialId.endsWith(`-${token}`)) {
        tokenScore += 200;
      } else if (dosage.split(/[\s,;/]+/).includes(token)) {
        tokenScore += 150;
      } else {
        return 0; // Number not matched as discrete entity
      }
    } else {
      if (trialWords.includes(token)) {
        tokenScore += 600;
      } else if (formWords.includes(token)) {
        tokenScore += 500;
      } else if (trialWords.some(w => w.startsWith(token))) {
        tokenScore += 350;
      } else if (formWords.some(w => w.startsWith(token))) {
        tokenScore += 300;
      } else if (projWords.includes(token) || projWords.some(w => w.startsWith(token))) {
        tokenScore += 250;
      } else if (targetWords.includes(token) || targetWords.some(w => w.startsWith(token))) {
        tokenScore += 250;
      } else if (otherWords.includes(token) || otherWords.some(w => w.startsWith(token))) {
        tokenScore += 150;
      } else if (trialName.includes(token)) {
        tokenScore += 200;
      } else if (formName.includes(token)) {
        tokenScore += 180;
      } else if (target.includes(token)) {
        tokenScore += 120;
      } else if (notes.includes(token) || conclusion.includes(token)) {
        tokenScore += 50;
      } else {
        const maxDist = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
        if (maxDist > 0) {
          const allKeyWords = [...trialWords, ...formWords, ...targetWords, ...projWords];
          const hasFuzzy = allKeyWords.some(w => getLevenshteinDistance(w, token) <= maxDist);
          if (hasFuzzy) {
            tokenScore += 100;
          }
        }
      }

      if (tokenScore === 0) {
        return 0; // Text token not matched
      }
    }

    score += tokenScore;
  }

  return score;
}

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
  activeCategory = 'herbicide',
  performanceFilter = 'all'
}) {
  return useMemo(() => {
    let list = [...trials];
    
    // Tab filters
    if (activeTab === 'active') {
      list = list.filter(t => !(t.IsCompleted === true || t.IsCompleted === 'true' || t.ControlFinalized === true || t.ControlFinalized === 'true'));
    } else if (activeTab === 'standard') {
      list = list.filter(t => !t.ProjectID);
    } else if (activeTab === 'rcbd') {
      list = list.filter(t => !!t.ProjectID);
    } else if (activeTab === 'control') {
      list = list.filter(t => (t.IsControl === true || t.IsControl === 'true') && !t.ProjectID);
    } else if (activeTab === 'finalized') {
      list = list.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');
    }

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

    // Advanced Relevance-Scored Search
    if (deferredSearch && deferredSearch.trim()) {
      list = list.reduce((acc, t) => {
        const score = scoreTrialSearch(t, deferredSearch);
        if (score > 0) {
          acc.push({ ...t, _searchScore: score });
        }
        return acc;
      }, []);
    }

    // Dropdown filters
    if (filterFormulation) list = list.filter(t => t.FormulationID === filterFormulation || t.FormulationName === filterFormulation);
    if (filterResult) list = list.filter(t => (t.Result || '') === filterResult);
    if (filterProject) list = list.filter(t => t.ProjectID === filterProject);

    // Date range filters
    if (filterDateStart) list = list.filter(t => t.Date && t.Date >= filterDateStart);
    if (filterDateEnd)   list = list.filter(t => t.Date && t.Date <= filterDateEnd);

    // Helper to extract control days / monitoring duration from trial (strictly matching TrialCard logic)
    const getTrialControlDays = (t) => {
      if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
        if (t.FinalControlDuration && !isNaN(parseInt(t.FinalControlDuration, 10))) {
          return parseInt(t.FinalControlDuration, 10);
        }
        if (t.Date) {
          return Math.max(0, Math.round((new Date() - new Date(t.Date)) / 86400000));
        }
        return 0;
      }
      const effDays = calculateEffectiveControlDays(t);
      if (effDays > 0) return effDays;
      if (t.FinalControlDuration && !isNaN(parseInt(t.FinalControlDuration, 10))) {
        const parsed = parseInt(t.FinalControlDuration, 10);
        if (parsed > 0) return parsed;
      }
      return 0;
    };

    // Quick Performance Filter Chips
    if (performanceFilter === 'high-kill') {
      const minThreshold = (activeCategory === 'nutrition' || activeCategory === 'biostimulant') ? 15 : 70;
      list = list.filter(t => {
        const eff = getTrialCalculatedEfficacy(t, activeCategory);
        return eff !== null && eff !== undefined && eff >= minThreshold;
      });
    } else if (performanceFilter === 'long-control') {
      list = list.filter(t => getTrialControlDays(t) >= 15);
    } else if (performanceFilter === 'needs-obs') {
      const now = Date.now();
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      list = list.filter(t => {
        const isFinalized = t.IsCompleted === true || t.IsCompleted === 'true' || t.ControlFinalized === true || t.ControlFinalized === 'true';
        if (isFinalized) return false;
        const rawObs = safeJsonParse(t.EfficacyDataJSON || t.observations, []);
        const obs = Array.isArray(rawObs) ? rawObs : [];
        if (obs.length === 0) return true;
        let lastTime = 0;
        obs.forEach(o => {
          const d = o.date || o.ObservationDate || o.timestamp;
          if (d) {
            const parsed = parseCustomDate(d) || new Date(d);
            if (!isNaN(parsed.getTime()) && parsed.getTime() > lastTime) {
              lastTime = parsed.getTime();
            }
          }
        });
        if (lastTime === 0) return true;
        return (now - lastTime) >= SEVEN_DAYS_MS;
      });
    } else if (performanceFilter === 'has-photos') {
      list = list.filter(t => {
        const p1 = safeJsonParse(t.PhotoURLs, []);
        const p2 = safeJsonParse(t.WeedPhotosJSON, []);
        const photos = [...(Array.isArray(p1) ? p1 : []), ...(Array.isArray(p2) ? p2 : [])];
        return photos.some(p => p && !p.deleted && (p.url || p.dataUrl || p.driveId || p.thumbnailUrl || (typeof p === 'string' && p.length > 0)));
      });
    }

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

    // Sort order mapping
    list.sort((a, b) => {
      // When searching, trials with the highest relevance score appear first
      if (deferredSearch && deferredSearch.trim()) {
        const scoreDiff = (b._searchScore || 0) - (a._searchScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
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
    registeredUsers,
    activeCategory,
    performanceFilter
  ]);
}
