import { isMixedWeedPlaceholder, canonicalizeWeedSpecies, normalizeLifecycleSafeStatus, upsertCoverCorrectionNote } from './weedUtils.js';
import { safeJsonParse, extractMetricValue, formatSignificance, getPlotAreaHectares } from './helpers.js';
import { getPrimaryObservationField, getObservationPrimaryValue, getCategoryConfig } from './categoryConfig.js';
import { normalizeObservation } from './categoryObservationUtils.js';
import jStat from 'jstat';
import { apiCall } from '../services/db.js';
import {
  performANOVA, performTwoWayANOVA, detectOutliers,
  performSNKTest, performBonferroniTest, performBartlettsTest,
  calculateResidualsDiagnostics as statsCalculateResidualsDiagnostics
} from './statsUtils.js';

export { performBartlettsTest as calculateBartlettsTest };



export function validateEfficacyData (efficacy, categoryId = 'herbicide', includeAI = false) {
                if (!Array.isArray(efficacy)) {
                    console.warn('EfficacyDataJSON is not an array');
                    return [];
                }

                const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                const toNum = (v) => {
                    if (v === null || v === undefined) return null;
                    const n = typeof v === 'number' ? v : parseFloat(v);
                    return isFinite(n) ? n : null;
                };

                const dataToValidate = includeAI ? efficacy : efficacy.filter(o => o && o.source !== 'AI');

                if (categoryId !== 'herbicide') {
                    const normalized = [];
                    dataToValidate.forEach(rawObs => {
                        if (!rawObs || typeof rawObs !== 'object') return;
                        const obs = normalizeObservation(rawObs, categoryId);
                        const daa = toNum(obs.daa);
                        if (daa === null || daa < 0) return;
                        obs.daa = daa;
                        
                        // Validate and clamp category-specific numeric fields
                        const config = getCategoryConfig(categoryId);
                        config.observationFields?.forEach(f => {
                            if (f.type === 'number' && obs[f.key] !== undefined && obs[f.key] !== null && obs[f.key] !== '') {
                                const val = toNum(obs[f.key]);
                                obs[f.key] = val !== null ? clamp(val, f.min ?? 0, f.max ?? 999999) : null;
                            }
                        });

                        if (obs.isBaseline !== undefined && obs.isBaseline !== null && obs.isBaseline !== '') {
                            obs.isBaseline = String(obs.isBaseline).toLowerCase() === 'true';
                        }
                        normalized.push(obs);
                    });
                    return normalized.sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
                }

                const deriveTotalCoverFromDetails = (details) => {
                    if (!Array.isArray(details) || details.length === 0) return null;
                    const covers = details
                        .filter(w => {
                            const species = String(w?.species || w?.name || w?.weed || w?.weedSpecies || '').trim();
                            if (!species) return false;
                            if (species.toLowerCase() === 'total') return false;
                            if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(species)) return false;
                            return true;
                        })
                        .map(w => toNum(w?.cover))
                        .filter(v => v !== null)
                        .map(v => clamp(v, 0, 100));
                    if (!covers.length) return null;
                    const additive = covers.reduce((s, v) => s + v, 0);
                    if (additive <= 100) return clamp(additive, 0, 100);
                    const unionProb = 1 - covers.reduce((p, v) => p * (1 - (v / 100)), 1);
                    return clamp(unionProb * 100, 0, 100);
                };
                const isRegrowthSignal = (text) => /re-emerg|regrowth|re-grow|resistant/i.test(String(text || ''));
                const addWarning = (obs, message) => {
                    const current = String(obs.validationNotes || '').trim();
                    if (!current) {
                        obs.validationNotes = message;
                        return;
                    }
                    const existing = current.split(/\s*;\s*/).map(v => v.trim().toLowerCase()).filter(Boolean);
                    if (existing.includes(String(message || '').trim().toLowerCase())) return;
                    obs.validationNotes = `${current}; ${message}`;
                };

                const normalized = [];

                dataToValidate.forEach(rawObs => {
                    if (!rawObs || typeof rawObs !== 'object') return;

                    // Normalize observation for category (adds primary field where possible)
                    const obs = normalizeObservation(rawObs, categoryId);
                    const daa = toNum(obs.daa);
                    if (daa === null || daa < 0) return;
                    obs.daa = daa;

                    if (obs.phyto !== undefined) delete obs.phyto;
                    if (obs.phi !== undefined) delete obs.phi;

                    if (obs.controlPct !== undefined && obs.controlPct !== null && obs.controlPct !== '') {
                        const cp = toNum(obs.controlPct);
                        if (cp === null) delete obs.controlPct;
                        else obs.controlPct = clamp(cp, 0, 100);
                    } else if (obs.control !== undefined && obs.control !== null && obs.control !== '') {
                        const cp = toNum(obs.control);
                        if (cp !== null) obs.controlPct = clamp(cp, 0, 100);
                    }

                    if (obs.isBaseline !== undefined && obs.isBaseline !== null && obs.isBaseline !== '') {
                        obs.isBaseline = String(obs.isBaseline).toLowerCase() === 'true';
                    }

                    if (typeof obs.weedDetails === 'string') {
                        try {
                            const parsed = JSON.parse(obs.weedDetails);
                            obs.weedDetails = parsed;
                        } catch (e) { }
                    }

                    if (Array.isArray(obs.weedDetails)) {
                        const cleaned = [];
                        obs.weedDetails.forEach(w => {
                            if (!w || typeof w !== 'object') return;
                            const species = String(w.species || w.name || w.weed || w.weedSpecies || w.label || '').trim();
                            const coverRaw = (w.cover !== undefined) ? w.cover : (w.coverPct !== undefined ? w.coverPct : (w.percentCover !== undefined ? w.percentCover : (w.weedCover !== undefined ? w.weedCover : undefined)));
                            const coverNum = toNum(coverRaw);
                            const cover = coverNum === null ? null : clamp(coverNum, 0, 100);
                            const status = String(w.status || w.Status || w.weedStatus || '').trim();
                            const notes = String(w.notes || w.note || '').trim();
                            if (!species && cover === null && !status && !notes) return;
                            cleaned.push({ ...w, species: canonicalizeWeedSpecies(species || 'Unknown'), cover, status, notes });
                        });
                        obs.weedDetails = cleaned;
                    }

                    if (!obs.weedDetails || obs.weedDetails.length === 0) {
                        const legacyCoverCandidates = [
                            obs.cover,
                            obs.weedCover,
                            obs.weed_cover,
                            obs.coverPct,
                            obs.percentCover,
                            obs.totalCover,
                            obs.weedCoverTotal
                        ];
                        const firstFound = legacyCoverCandidates.find(v => v !== undefined && v !== null && v !== '');
                        const c = toNum(firstFound);
                        if (c !== null) {
                            const status = String(obs.weedStatus || obs.status || '').trim();
                            const notes = String(obs.notes || '').trim();
                            obs.weedDetails = [{ species: 'Total', cover: clamp(c, 0, 100), status, notes }];
                        }
                    }

                    if (obs.weedCover !== undefined && obs.weedCover !== null && obs.weedCover !== '') {
                        const wc = toNum(obs.weedCover);
                        if (wc === null) {
                            delete obs.weedCover;
                        } else {
                            obs.weedCover = clamp(wc, 0, 100);
                        }
                    }

                    if ((obs.weedCover === undefined || obs.weedCover === null || obs.weedCover === '') && Array.isArray(obs.weedDetails) && obs.weedDetails.length > 0) {
                        const derivedCover = deriveTotalCoverFromDetails(obs.weedDetails);
                        if (derivedCover !== null && derivedCover !== undefined) {
                            obs.weedCover = derivedCover;
                            if (!obs.weedCoverMode) obs.weedCoverMode = 'auto';
                        }
                    }

                    normalized.push(obs);
                });

                // Cross-observation integrity: normalize duplicates, enforce early temporal consistency,
                // and keep observation total cover aligned with species covers.
                const ordered = normalized.slice().sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
                const baselineDaa = ordered.length > 0 ? (parseFloat(ordered[0].daa) || 0) : 0;

                // 1. Gather all unique species observed in any DAA (excluding 'Total')
                const allObservedSpecies = new Set();
                ordered.forEach(obs => {
                    if (Array.isArray(obs.weedDetails)) {
                        obs.weedDetails.forEach(wd => {
                            const sp = String(wd.species || wd.name || wd.weed || '').trim();
                            if (sp && sp.toLowerCase() !== 'total' && !(isMixedWeedPlaceholder && isMixedWeedPlaceholder(sp))) {
                                allObservedSpecies.add(sp);
                            }
                        });
                    }
                });

                // 2. Align species list across all observations to ensure they are represented at baseline
                // and correctly transitioned to 0% [Controlled/Dead] in later stages if missing
                ordered.forEach(obs => {
                    const isBaselineObs = (parseFloat(obs.daa) || 0) === baselineDaa;
                    if (!Array.isArray(obs.weedDetails)) {
                        obs.weedDetails = [];
                    }
                    allObservedSpecies.forEach(sp => {
                        const hasSp = obs.weedDetails.some(wd => String(wd.species || '').trim().toLowerCase() === sp.toLowerCase());
                        if (!hasSp) {
                            if (isBaselineObs) {
                                // Add to baseline with 0% cover so redistribution logic can assign initial cover if it was present later
                                obs.weedDetails.push({
                                    species: sp,
                                    cover: 0,
                                    status: 'Unaffected',
                                    notes: 'Auto-added for baseline tracking'
                                });
                            } else {
                                // Add to later observations with 0% cover and controlled status since it is no longer detected/present
                                obs.weedDetails.push({
                                    species: sp,
                                    cover: 0,
                                    status: categoryId === 'herbicide' ? 'Dead/Desiccated' : 'Controlled',
                                    notes: 'Auto-controlled (not detected)'
                                });
                            }
                        }
                    });
                });

                const lastSeenBySpecies = new Map();

                // Global baseline DAA authority across duplicate baseline observations.
                let daa0BestRealSpeciesSum = 0;
                ordered.forEach(obs => {
                    if ((parseFloat(obs?.daa) || 0) !== baselineDaa) return;
                    const realSum = (Array.isArray(obs?.weedDetails) ? obs.weedDetails : []).reduce((sum, w) => {
                        const sp = String(w?.species || '').trim().toLowerCase();
                        if (!sp || sp === 'total') return sum;
                        if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(sp)) return sum;
                        return sum + (toNum(w?.cover) || 0);
                    }, 0);
                    if (realSum > daa0BestRealSpeciesSum) daa0BestRealSpeciesSum = realSum;
                });
                daa0BestRealSpeciesSum = clamp(daa0BestRealSpeciesSum, 0, 100);

                ordered.forEach(obs => {
                    if (!Array.isArray(obs.weedDetails) || obs.weedDetails.length === 0) return;

                    const merged = new Map();
                    obs.weedDetails.forEach(w => {
                        const key = canonicalizeWeedSpecies(w.species || 'Unknown');
                        const cover = toNum(w.cover);
                        const current = merged.get(key);
                        if (!current) {
                            merged.set(key, { ...w, species: key, cover });
                            return;
                        }
                        const currentCover = toNum(current.cover);
                        const nextCover = cover;
                        if (nextCover !== null && (currentCover === null || nextCover > currentCover)) {
                            current.cover = nextCover;
                                if (w.status) current.status = w.status;
                                if (w.notes) current.notes = w.notes;
                        }
                        // When covers are equal: prefer the real (non-autoInjected) entry's
                        // properties so original AI observation notes are not lost.
                        if (!w.autoInjected && current.autoInjected) {
                            current.autoInjected = false;
                            const wNotes = String(w.notes || '');
                            const isAutoNote = /^(auto-repaired:|auto-added:|auto-tracking:)/i.test(wNotes);
                            if (!isAutoNote && wNotes.trim()) current.notes = wNotes;
                        }
                        if (!current.status && w.status) current.status = w.status;
                        if (!current.notes && w.notes) current.notes = w.notes;
                    });

                    obs.weedDetails = Array.from(merged.values()).map(w => ({
                        ...w,
                        cover: w.cover === null ? null : clamp(w.cover, 0, 100)
                    }));

                    const isBaselineObs = (parseFloat(obs.daa) || 0) === baselineDaa;
                    if (!isBaselineObs) {
                        obs.weedDetails = obs.weedDetails.filter(w => !isMixedWeedPlaceholder(String(w.species || '')));
                    } else {
                        const hasRealBaselineSpecies = obs.weedDetails.some(w => {
                            const species = String(w.species || '').trim();
                            if (!species || species.toLowerCase() === 'total') return false;
                            if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(species)) return false;
                            return (toNum(w.cover) || 0) > 0.1;
                        });
                        if (hasRealBaselineSpecies) {
                            obs.weedDetails = obs.weedDetails.filter(w => !isMixedWeedPlaceholder(String(w.species || '')));
                        } else {
                            const mixedRows = obs.weedDetails.filter(w => isMixedWeedPlaceholder(String(w.species || '')));
                            if (mixedRows.length > 1) {
                                let kept = false;
                                obs.weedDetails = obs.weedDetails.filter(w => {
                                    if (!isMixedWeedPlaceholder(String(w.species || ''))) return true;
                                    if (kept) return false;
                                    kept = true;
                                    return true;
                                });
                            }
                        }
                    }

                    obs.weedDetails.forEach(w => {
                        if (w.cover === null || w.species === 'Total') return;
                        const prev = lastSeenBySpecies.get(w.species);
                        // Baseline DAA = baseline (before spray) - never zero its cover.
                        // Early-window spike suppression only applies to DAAs after the baseline up to baselineDaa + 3.
                        const daaVal = parseFloat(obs.daa) || 0;
                        const earlyWindow = daaVal > baselineDaa && daaVal <= baselineDaa + 3;
                            const combinedSignals = `${w.status || ''} ${w.notes || ''} ${obs.notes || ''}`;
                            const allowIncrease = isRegrowthSignal(combinedSignals) || /\[cover corrected:|redistributed from total/i.test(combinedSignals);

                        if (!prev && earlyWindow && w.cover > 3 && !allowIncrease) {
                            w.cover = 0;
                            addWarning(obs, `${w.species}: removed early new-appearance spike at DAA ${obs.daa}.`);
                        } else if (prev && earlyWindow && w.cover > (prev.cover + 5) && !allowIncrease) {
                            w.cover = prev.cover;
                            addWarning(obs, `${w.species}: capped unrealistic DAA ${obs.daa} increase to previous cover.`);
                        }

                        // Baseline DAA integrity: if total>0 but species are all 0, restore or synthesize baseline.
                        const isBaselineDaa = (parseFloat(obs.daa) || 0) === baselineDaa;
                        if (isBaselineDaa) {
                            const speciesRows = (obs.weedDetails || []).filter(x => {
                                const s = String(x.species || '').trim().toLowerCase();
                                return s && s !== 'total';
                            });
                            const baselineTotal = Math.max(
                                toNum(obs.weedCover) || 0,
                                ...(obs.weedDetails || [])
                                    .filter(x => String(x.species || '').trim().toLowerCase() === 'total')
                                    .map(x => toNum(x.cover) || 0)
                            );
                            let speciesSum = speciesRows.reduce((s, x) => s + (toNum(x.cover) || 0), 0);

                            if (baselineTotal > 0 && speciesSum <= 0.1) {
                                // a) Restore baseline from parsed "Cover corrected" note, when available.
                                speciesRows.forEach(x => {
                                    const c = toNum(x.cover) || 0;
                                    if (c > 0) return;
                                    const m = String(x.notes || '').match(/Cover\s*corrected:\s*(\d+(?:\.\d+)?)%/i);
                                    if (!m) return;
                                    const corrected = clamp(toNum(m[1]) || 0, 0, 100);
                                    if (corrected > 0) x.cover = corrected;
                                });
                                speciesSum = speciesRows.reduce((s, x) => s + (toNum(x.cover) || 0), 0);

                                // b) Prefer dominant species only when explicitly supported by notes;
                                // otherwise use neutral mixed placeholder baseline.
                                if (speciesSum <= 0.1) {
                                    const dominantRx = /across most of the plot|most of the plot|across the plot|throughout the plot|dominant|extensive|dense|thick|mat|carpet|abundant|widespread|majority|grassy vegetation|grass/i;
                                    const targetCover = Math.round(clamp(baselineTotal, 0, 100) * 10) / 10;
                                    const preferred = speciesRows.find(x => dominantRx.test(String(x.notes || '')));
                                    if (preferred) {
                                        preferred.cover = targetCover;
                                        preferred.status = 'Unaffected';
                                        preferred.notes = upsertCoverCorrectionNote(preferred.notes, `${targetCover}% redistributed from total ${targetCover}% baseline`);
                                    } else {
                                        const mixed = (obs.weedDetails || []).find(x => isMixedWeedPlaceholder(String(x.species || '')));
                                        if (mixed) {
                                            mixed.cover = targetCover;
                                            mixed.status = 'Baseline reference';
                                            mixed.notes = 'Auto-baseline: mixed weed baseline synthesized from DAA ' + baselineDaa + ' total cover.';
                                        } else {
                                            obs.weedDetails.push({
                                                species: 'Mixed weed population',
                                                cover: targetCover,
                                                status: 'Baseline reference',
                                                notes: 'Auto-baseline: mixed weed baseline synthesized from DAA ' + baselineDaa + ' total cover.'
                                            });
                                        }
                                    }
                                }
                            }
                            
                            // c) Smart redistribution for target species with 0% cover at baseline that are mentioned in notes or present later
                            if (baselineTotal > 10) {
                                const zeroCoverSpecies = speciesRows.filter(x => (toNum(x.cover) || 0) <= 0.1);
                                const combinedNotes = String(obs.notes || '').toLowerCase();
                                const noteWords = combinedNotes.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
                                const toRedistribute = [];
                                
                                zeroCoverSpecies.forEach(x => {
                                    const spLower = String(x.species || '').trim().toLowerCase();
                                    const cleanWords = spLower
                                        .replace(/[^a-z0-9\s]/g, ' ')
                                        .split(/\s+/)
                                        .filter(w => w.length > 3 && w !== 'weed' && w !== 'weeds' && w !== 'population' && w !== 'unidentified');
                                    
                                    const isMentioned = cleanWords.some(sw => {
                                        return noteWords.some(nw => sw.includes(nw) || nw.includes(sw));
                                    });
                                    
                                    const isPresentLater = ordered.some(o => {
                                        if ((parseFloat(o.daa) || 0) <= baselineDaa) return false;
                                        const match = (o.weedDetails || []).find(wd => String(wd.species || '').trim().toLowerCase() === spLower);
                                        return match && String(match.status || '').toLowerCase() !== 'not detected';
                                    });
                                    if (isMentioned || isPresentLater) {
                                        toRedistribute.push(x);
                                    }
                                });
                                
                                if (toRedistribute.length > 0) {
                                    const dominant = speciesRows.reduce((prev, curr) => (toNum(curr.cover) || 0) > (toNum(prev.cover) || 0) ? curr : prev, speciesRows[0]);
                                    if (dominant && (toNum(dominant.cover) || 0) > 20) {
                                        const share = 10;
                                        toRedistribute.forEach(x => {
                                            const domCover = toNum(dominant.cover) || 0;
                                            if (domCover >= share + 10) {
                                                x.cover = share;
                                                x.status = 'Unaffected';
                                                x.notes = `Auto-reconciled: assigned ${share}% baseline cover from notes/history.`;
                                                dominant.cover = domCover - share;
                                                dominant.notes = upsertCoverCorrectionNote(dominant.notes, `${share}% redistributed to ${x.species}`);
                                            }
                                        });
                                    }
                                }
                            }
                        }

                        const prevCover = prev ? prev.cover : null;
                        w.status = normalizeLifecycleSafeStatus(w.species, w.status, `${w.notes || ''} ${obs.notes || ''}`, prevCover, w.cover);

                        // Baseline DAA cannot have post-treatment injury statuses.
                        if ((parseFloat(obs.daa) || 0) === baselineDaa) {
                            if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(String(w.species || ''))) {
                                w.status = 'Baseline reference';
                            } else {
                                w.status = (toNum(w.cover) || 0) > 0.1 ? 'Unaffected' : 'Not detected';
                            }
                        }

                        lastSeenBySpecies.set(w.species, {
                            cover: toNum(w.cover) === null ? 0 : clamp(toNum(w.cover), 0, 100),
                            daa: parseFloat(obs.daa) || 0
                        });
                    });

                    const derivedCover = deriveTotalCoverFromDetails(obs.weedDetails);
                    if (derivedCover !== null && derivedCover !== undefined) {
                        const daaVal = parseFloat(obs.daa) || 0;
                        const realSpeciesSum = (obs.weedDetails || []).reduce((sum, w) => {
                            const sp = String(w?.species || '').trim();
                            if (!sp || sp.toLowerCase() === 'total') return sum;
                            if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(sp)) return sum;
                            return sum + (toNum(w?.cover) || 0);
                        }, 0);
                        const existing = toNum(obs.weedCover);
                        let correctedCover = derivedCover;
                        if (daaVal === baselineDaa && realSpeciesSum > 0.1) {
                            correctedCover = clamp(realSpeciesSum, 0, 100);
                        } else if (existing !== null && existing > 0 && realSpeciesSum <= 0.1) {
                            // Do not collapse valid observed total cover to zero when species rows are incomplete.
                            correctedCover = clamp(existing, 0, 100);
                        }
                        if (existing === null || Math.abs(existing - correctedCover) > 0.1 || daaVal === baselineDaa) {
                            obs.weedCover = correctedCover;
                            obs.weedCoverMode = 'reconciled';
                        }

                        // Keep Total detail in sync with reconciled observation total.
                        if (Array.isArray(obs.weedDetails)) {
                            const totalRows = obs.weedDetails.filter(w => String(w?.species || '').trim().toLowerCase() === 'total');
                            totalRows.forEach(t => { t.cover = obs.weedCover; });

                            // Strict baseline DAA mixed-placeholder rule:
                            // if real species are present, mixed placeholder must not carry non-zero cover.
                            if (daaVal === baselineDaa) {
                                const hasRealPositive = obs.weedDetails.some(w => {
                                    const sp = String(w?.species || '').trim();
                                    if (!sp || sp.toLowerCase() === 'total') return false;
                                    if (isMixedWeedPlaceholder && isMixedWeedPlaceholder(sp)) return false;
                                    return (toNum(w?.cover) || 0) > 0.1;
                                });

                                if (hasRealPositive) {
                                    obs.weedDetails = obs.weedDetails.filter(w => !isMixedWeedPlaceholder(String(w?.species || '')));
                                } else {
                                    let keptMixed = false;
                                    obs.weedDetails = obs.weedDetails.filter(w => {
                                        const isMixed = isMixedWeedPlaceholder(String(w?.species || ''));
                                        if (!isMixed) return true;
                                        if (keptMixed) return false;
                                        keptMixed = true;
                                        return true;
                                    }).map(w => {
                                        if (!isMixedWeedPlaceholder(String(w?.species || ''))) return w;
                                        return {
                                            ...w,
                                            cover: clamp(toNum(obs.weedCover) || 0, 0, 100),
                                            status: 'Baseline reference'
                                        };
                                    });
                                }
                            }
                        }
                    }

                    // Final authoritative baseline DAA reconciliation (last writer wins):
                    // if real species exist, baseline/total must equal their sum and mixed placeholder is removed.
                    if ((parseFloat(obs.daa) || 0) === baselineDaa && Array.isArray(obs.weedDetails)) {
                        const realSpeciesRows = obs.weedDetails.filter(w => {
                            const sp = String(w?.species || '').trim().toLowerCase();
                            return sp && sp !== 'total' && !(isMixedWeedPlaceholder && isMixedWeedPlaceholder(sp));
                        });
                        const realSpeciesSum = clamp(realSpeciesRows.reduce((sum, w) => sum + (toNum(w?.cover) || 0), 0), 0, 100);
                        const authoritativeDaa0Sum = daa0BestRealSpeciesSum > 0.1 ? daa0BestRealSpeciesSum : realSpeciesSum;

                        // Baseline DAA is pre-spray by definition.
                        obs.controlPct = 0;
                        if (obs.control !== undefined) obs.control = 0;
                        obs.isBaseline = true;

                        if (authoritativeDaa0Sum > 0.1) {
                            obs.weedCover = authoritativeDaa0Sum;
                            obs.weedCoverMode = 'reconciled';
                            obs.weedDetails = obs.weedDetails.filter(w => !isMixedWeedPlaceholder(String(w?.species || '')));
                            (obs.weedDetails || []).forEach(w => {
                                const sp = String(w?.species || '').trim().toLowerCase();
                                if (!sp || sp === 'total') return;
                                const c = toNum(w?.cover) || 0;
                                w.status = c > 0.1 ? 'Unaffected' : 'Not detected';
                            });
                        } else {
                            const baselineTotal = clamp(toNum(obs.weedCover) || 0, 0, 100);
                            obs.weedCover = baselineTotal;
                            obs.weedCoverMode = 'reconciled';
                            let keptMixed = false;
                            obs.weedDetails = obs.weedDetails.filter(w => {
                                const isMixed = isMixedWeedPlaceholder(String(w?.species || ''));
                                if (!isMixed) return true;
                                if (keptMixed) return false;
                                keptMixed = true;
                                return true;
                            }).map(w => {
                                if (!isMixedWeedPlaceholder(String(w?.species || ''))) return w;
                                return { ...w, cover: baselineTotal, status: 'Baseline reference' };
                            });
                            if (!obs.weedDetails.some(w => isMixedWeedPlaceholder(String(w?.species || '')))) {
                                obs.weedDetails.push({
                                    species: 'Mixed weed population',
                                    cover: baselineTotal,
                                    status: 'Baseline reference',
                                    notes: 'Auto-baseline: mixed weed baseline synthesized from DAA ' + baselineDaa + ' total cover.'
                                });
                            }
                        }

                        const totalRows = obs.weedDetails.filter(w => String(w?.species || '').trim().toLowerCase() === 'total');
                        totalRows.forEach(t => { t.cover = obs.weedCover; });
                    }
                });

                return normalized;
            };

// ── Tukey HSD Q-tables (Studentized Range Distribution) ─────────────────────
const Q_TABLE_05 = {
  1: [17.97, 26.98, 32.82, 37.08, 40.41, 43.12, 45.40, 47.36, 49.07, 50.59, 51.96, 53.20, 54.33, 55.36, 56.32, 57.22, 58.04, 58.83, 59.56],
  2: [6.08, 8.33, 9.80, 10.88, 11.74, 12.44, 13.03, 13.54, 13.99, 14.39, 14.75, 15.08, 15.38, 15.65, 15.91, 16.14, 16.37, 16.57, 16.77],
  3: [4.50, 5.91, 6.82, 7.50, 8.04, 8.48, 8.85, 9.18, 9.46, 9.72, 9.95, 10.15, 10.35, 10.52, 10.69, 10.84, 10.98, 11.11, 11.24],
  4: [3.93, 5.04, 5.76, 6.29, 6.71, 7.05, 7.35, 7.60, 7.83, 8.03, 8.21, 8.37, 8.52, 8.66, 8.79, 8.91, 9.03, 9.13, 9.23],
  5: [3.64, 4.60, 5.22, 5.67, 6.03, 6.33, 6.58, 6.80, 6.99, 7.17, 7.32, 7.47, 7.60, 7.72, 7.83, 7.93, 8.03, 8.12, 8.21],
  6: [3.46, 4.34, 4.90, 5.30, 5.63, 5.90, 6.12, 6.32, 6.49, 6.65, 6.79, 6.92, 7.03, 7.14, 7.24, 7.34, 7.43, 7.51, 7.59],
  7: [3.34, 4.16, 4.68, 5.06, 5.36, 5.61, 5.82, 6.00, 6.16, 6.30, 6.43, 6.55, 6.66, 6.76, 6.85, 6.94, 7.02, 7.10, 7.17],
  8: [3.26, 4.04, 4.53, 4.89, 5.17, 5.40, 5.60, 5.77, 5.92, 6.05, 6.18, 6.29, 6.39, 6.48, 6.57, 6.65, 6.73, 6.80, 6.87],
  9: [3.20, 3.95, 4.41, 4.76, 5.02, 5.24, 5.43, 5.59, 5.74, 5.87, 5.98, 6.09, 6.19, 6.28, 6.36, 6.44, 6.51, 6.58, 6.64],
  10: [3.15, 3.88, 4.33, 4.65, 4.91, 5.12, 5.30, 5.46, 5.60, 5.72, 5.83, 5.93, 6.03, 6.11, 6.19, 6.27, 6.34, 6.40, 6.47],
  11: [3.11, 3.82, 4.26, 4.57, 4.82, 5.03, 5.20, 5.35, 5.49, 5.61, 5.71, 5.81, 5.90, 5.98, 6.06, 6.13, 6.20, 6.27, 6.33],
  12: [3.08, 3.77, 4.20, 4.51, 4.75, 4.95, 5.12, 5.27, 5.39, 5.51, 5.61, 5.71, 5.80, 5.88, 5.95, 6.02, 6.09, 6.15, 6.21],
  13: [3.06, 3.73, 4.15, 4.45, 4.69, 4.88, 5.05, 5.19, 5.32, 5.43, 5.53, 5.63, 5.71, 5.79, 5.86, 5.93, 5.99, 6.05, 6.11],
  14: [3.03, 3.70, 4.11, 4.41, 4.64, 4.83, 4.99, 5.13, 5.25, 5.36, 5.46, 5.55, 5.64, 5.71, 5.79, 5.85, 5.91, 5.97, 6.03],
  15: [3.01, 3.67, 4.08, 4.37, 4.59, 4.78, 4.94, 5.08, 5.20, 5.31, 5.40, 5.49, 5.57, 5.65, 5.72, 5.78, 5.85, 5.90, 5.96],
  16: [3.00, 3.65, 4.05, 4.33, 4.56, 4.74, 4.90, 5.03, 5.15, 5.26, 5.35, 5.44, 5.52, 5.59, 5.66, 5.73, 5.79, 5.84, 5.90],
  17: [2.98, 3.63, 4.02, 4.30, 4.52, 4.70, 4.86, 4.99, 5.11, 5.21, 5.31, 5.39, 5.47, 5.54, 5.61, 5.67, 5.73, 5.79, 5.84],
  18: [2.97, 3.61, 4.00, 4.28, 4.49, 4.67, 4.82, 4.96, 5.07, 5.17, 5.27, 5.35, 5.43, 5.50, 5.57, 5.63, 5.69, 5.74, 5.79],
  19: [2.96, 3.59, 3.98, 4.25, 4.47, 4.65, 4.79, 4.92, 5.04, 5.14, 5.23, 5.31, 5.39, 5.46, 5.53, 5.59, 5.65, 5.70, 5.75],
  20: [2.95, 3.58, 3.96, 4.23, 4.45, 4.62, 4.77, 4.90, 5.01, 5.11, 5.20, 5.28, 5.36, 5.43, 5.49, 5.55, 5.61, 5.67, 5.71],
  24: [2.92, 3.53, 3.90, 4.17, 4.37, 4.54, 4.68, 4.81, 4.92, 5.01, 5.10, 5.18, 5.25, 5.32, 5.38, 5.44, 5.49, 5.55, 5.59],
  30: [2.89, 3.49, 3.85, 4.10, 4.30, 4.46, 4.60, 4.72, 4.82, 4.92, 5.00, 5.08, 5.15, 5.21, 5.27, 5.33, 5.38, 5.43, 5.47],
  40: [2.86, 3.44, 3.79, 4.04, 4.23, 4.39, 4.52, 4.63, 4.73, 4.82, 4.90, 4.98, 5.04, 5.11, 5.16, 5.22, 5.27, 5.31, 5.36],
  60: [2.83, 3.40, 3.74, 3.98, 4.16, 4.31, 4.44, 4.55, 4.65, 4.73, 4.81, 4.88, 4.94, 5.00, 5.06, 5.11, 5.15, 5.20, 5.24],
  120: [2.80, 3.36, 3.68, 3.92, 4.10, 4.24, 4.36, 4.47, 4.56, 4.64, 4.71, 4.78, 4.84, 4.90, 4.95, 5.00, 5.04, 5.09, 5.13],
  "inf": [2.77, 3.31, 3.63, 3.86, 4.03, 4.17, 4.29, 4.39, 4.47, 4.55, 4.62, 4.68, 4.74, 4.80, 4.85, 4.89, 4.94, 4.98, 5.01]
};

const Q_TABLE_01 = {
  1: [90.03, 135.0, 164.3, 185.6, 202.2, 215.8, 227.2, 237.0, 245.6, 253.2, 260.1, 266.2, 271.8, 277.0, 281.7, 286.1, 290.2, 294.1, 297.7],
  2: [14.04, 19.02, 22.29, 24.72, 26.63, 28.20, 29.53, 30.68, 31.69, 32.59, 33.40, 34.13, 34.81, 35.43, 36.00, 36.53, 37.03, 37.50, 37.95],
  3: [8.26, 10.62, 12.17, 13.33, 14.24, 15.00, 15.64, 16.20, 16.69, 17.13, 17.53, 17.89, 18.22, 18.52, 18.81, 19.07, 19.32, 19.55, 19.77],
  4: [6.51, 8.12, 9.17, 9.96, 10.58, 11.10, 11.55, 11.93, 12.27, 12.57, 12.84, 13.09, 13.32, 13.53, 13.73, 13.91, 14.08, 14.24, 14.40],
  5: [5.70, 6.98, 7.80, 8.42, 8.91, 9.32, 9.67, 9.97, 10.24, 10.48, 10.70, 10.89, 11.08, 11.24, 11.40, 11.55, 11.68, 11.81, 11.93],
  6: [5.24, 6.33, 7.03, 7.56, 7.97, 8.32, 8.61, 8.87, 9.10, 9.30, 9.48, 9.65, 9.81, 9.95, 10.08, 10.21, 10.32, 10.43, 10.54],
  7: [4.95, 5.92, 6.54, 7.01, 7.37, 7.68, 7.94, 8.17, 8.37, 8.55, 8.71, 8.86, 9.00, 9.12, 9.24, 9.35, 9.46, 9.55, 9.65],
  8: [4.75, 5.64, 6.20, 6.62, 6.96, 7.24, 7.47, 7.68, 7.86, 8.03, 8.18, 8.31, 8.44, 8.55, 8.66, 8.76, 8.85, 8.94, 9.03],
  9: [4.60, 5.43, 5.96, 6.35, 6.66, 6.91, 7.13, 7.33, 7.49, 7.65, 7.78, 7.91, 8.03, 8.13, 8.23, 8.33, 8.41, 8.49, 8.57],
  10: [4.48, 5.27, 5.77, 6.14, 6.43, 6.67, 6.87, 7.05, 7.21, 7.36, 7.48, 7.60, 7.71, 7.81, 7.91, 7.99, 8.08, 8.15, 8.23],
  11: [4.39, 5.15, 5.62, 5.97, 6.25, 6.48, 6.67, 6.84, 6.99, 7.13, 7.25, 7.36, 7.46, 7.56, 7.65, 7.73, 7.81, 7.88, 7.95],
  12: [4.32, 5.05, 5.50, 5.84, 6.10, 6.32, 6.51, 6.67, 6.81, 6.94, 7.06, 7.17, 7.26, 7.36, 7.44, 7.52, 7.59, 7.66, 7.73],
  13: [4.26, 4.96, 5.40, 5.73, 5.98, 6.19, 6.37, 6.53, 6.67, 6.79, 6.90, 7.01, 7.10, 7.19, 7.27, 7.35, 7.42, 7.48, 7.55],
  14: [4.21, 4.89, 5.32, 5.63, 5.88, 6.08, 6.26, 6.41, 6.54, 6.66, 6.77, 6.87, 6.96, 7.05, 7.13, 7.20, 7.27, 7.33, 7.39],
  15: [4.17, 4.84, 5.25, 5.56, 5.80, 5.99, 6.16, 6.31, 6.44, 6.55, 6.66, 6.76, 6.84, 6.93, 7.00, 7.07, 7.14, 7.20, 7.26],
  16: [4.13, 4.79, 5.19, 5.49, 5.72, 5.92, 6.08, 6.22, 6.35, 6.46, 6.56, 6.66, 6.74, 6.82, 6.90, 6.97, 7.03, 7.09, 7.15],
  17: [4.10, 4.74, 5.14, 5.43, 5.66, 5.85, 6.01, 6.15, 6.27, 6.38, 6.48, 6.57, 6.66, 6.73, 6.81, 6.87, 6.94, 7.00, 7.05],
  18: [4.07, 4.70, 5.09, 5.38, 5.60, 5.79, 5.94, 6.08, 6.20, 6.31, 6.41, 6.50, 6.58, 6.65, 6.73, 6.79, 6.85, 6.91, 6.97],
  19: [4.05, 4.67, 5.05, 5.33, 5.55, 5.73, 5.89, 6.02, 6.14, 6.25, 6.34, 6.43, 6.51, 6.58, 6.65, 6.72, 6.78, 6.83, 6.89],
  20: [4.02, 4.64, 5.01, 5.29, 5.51, 5.69, 5.84, 5.97, 6.09, 6.19, 6.28, 6.37, 6.45, 6.52, 6.59, 6.65, 6.71, 6.77, 6.82],
  24: [3.96, 4.55, 4.91, 5.17, 5.37, 5.54, 5.69, 5.81, 5.92, 6.02, 6.11, 6.19, 6.26, 6.33, 6.39, 6.45, 6.51, 6.56, 6.61],
  30: [3.89, 4.45, 4.80, 5.05, 5.24, 5.40, 5.54, 5.65, 5.76, 5.85, 5.93, 6.01, 6.08, 6.14, 6.20, 6.26, 6.31, 6.36, 6.41],
  40: [3.82, 4.37, 4.70, 4.93, 5.11, 5.26, 5.39, 5.50, 5.60, 5.69, 5.76, 5.83, 5.90, 5.96, 6.02, 6.07, 6.12, 6.16, 6.21],
  60: [3.76, 4.28, 4.59, 4.82, 4.99, 5.13, 5.25, 5.36, 5.45, 5.53, 5.60, 5.67, 5.73, 5.78, 5.84, 5.89, 5.93, 5.97, 6.02],
  120: [3.70, 4.20, 4.50, 4.71, 4.87, 5.01, 5.12, 5.21, 5.30, 5.37, 5.44, 5.50, 5.56, 5.61, 5.66, 5.71, 5.75, 5.79, 5.83],
  "inf": [3.64, 4.12, 4.40, 4.60, 4.76, 4.88, 4.99, 5.08, 5.16, 5.23, 5.29, 5.35, 5.40, 5.45, 5.49, 5.54, 5.57, 5.61, 5.65]
};

/**
 * Returns the critical value q(alpha, k, df) from the Studentized Range Distribution.
 * Supports alpha=0.05 and alpha=0.01 with interpolation.
 */
export function getStudentizedRangeCritical(alpha, k, df) {
  const useTable = (alpha <= 0.01) ? Q_TABLE_01 : Q_TABLE_05;
  
  // Clamp k to table range (2 to 20)
  const kIndex = Math.min(Math.max(Math.round(k), 2), 20) - 2;
  
  // Find df entries for interpolation
  const dfKeys = Object.keys(useTable).map(key => key === "inf" ? Infinity : parseInt(key));
  dfKeys.sort((a, b) => a - b);
  
  let lowerDf = 1;
  let upperDf = Infinity;
  
  for (let i = 0; i < dfKeys.length; i++) {
    if (dfKeys[i] <= df) {
      lowerDf = dfKeys[i];
    }
    if (dfKeys[i] >= df) {
      upperDf = dfKeys[i];
      break;
    }
  }
  
  const lowerKey = lowerDf === Infinity ? "inf" : lowerDf;
  const upperKey = upperDf === Infinity ? "inf" : upperDf;
  
  const lowerVal = useTable[lowerKey][kIndex];
  const upperVal = useTable[upperKey][kIndex];
  
  if (lowerDf === upperDf) return lowerVal;
  if (upperDf === Infinity) return lowerVal;
  
  // Linear interpolation
  const weight = (df - lowerDf) / (upperDf - lowerDf);
  return lowerVal + weight * (upperVal - lowerVal);
}

// Make available globally for the AnalysisEngine
if (typeof window !== 'undefined') {
  window.getStudentizedRangeCritical = getStudentizedRangeCritical;
}

export class AnalysisEngine {
                constructor(projectId, state, getAppState = null) {
                    this.projectId = projectId;
                    this.state = state; // Global state reference
                    this.getAppState = getAppState; // Function to retrieve live app state for apiCall
                    this.trials = state.trials.filter(t => String(t.ProjectID) === String(projectId));
                    this.blocks = state.blocks.filter(b => String(b.ProjectID) === String(projectId));
                    this.project = (state.projects || []).find(p => String(p.ID) === String(projectId));
                    this.category = this.project?.Category || state.activeCategory || 'herbicide';

                    // Identify treatments (Formulations)
                    this.treatments = [...new Set(this.trials.map(t => t.FormulationName))];

                    // Identify UTC (Untreated Control)
                    this.utcName = this.treatments.find(t =>
                        t.toLowerCase().includes('control') ||
                        t.toLowerCase().includes('untreated') ||
                        t.toLowerCase().includes('check')
                    );
                }

                /**
                 * Fetch optimized analysis data from backend
                 */
                async fetchBackendData() {
                    if (!this.getAppState || !this.getAppState()?.settings?.scriptUrl) {
                        // No getAppState or scriptUrl configured — skip backend, use local data silently
                        return null;
                    }
                    try {
                        const fetchPromise = apiCall('getProjectAnalysisData', { projectId: this.projectId }, false, this.getAppState);
                        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ _timeout: true }), 800));
                        
                        const result = await Promise.race([fetchPromise, timeoutPromise]);
                        if (result && result._timeout) {
                            console.warn('[AnalysisEngine] Backend fetch timed out (800ms limit), falling back to local data');
                            return null;
                        }

                        if (result && result.success) {
                            this.backendData = result;
                            return result;
                        }
                    } catch (e) {
                        console.warn('[AnalysisEngine] Backend fetch failed, falling back to local:', e.message || e);
                        return null;
                    }
                }

                getReplications(treatmentName) {
                    if (this.backendData && this.backendData.dataMatrix && this.backendData.dataMatrix[treatmentName]) {
                        return this.backendData.dataMatrix[treatmentName];
                    }
                    return this.trials.filter(t => t.FormulationName === treatmentName);
                }

                getObservationValue(trial, metric, species = null, daa = null) {
                    const primaryField = getPrimaryObservationField(this.category);

                    if (trial && trial.trialId) {
                        if (metric === 'yield') {
                            const v = parseFloat(trial.yield || trial.yieldValue || trial.yieldKgPlot || trial.Yield || trial.YieldValue || 0);
                            return Number.isFinite(v) ? v : null;
                        }
                        if (metric === 'audpc') {
                            return Number.isFinite(parseFloat(trial.audpc || trial.AUDPC || 0)) ? parseFloat(trial.audpc || trial.AUDPC || 0) : null;
                        }
                        if (metric === 'cover' || metric === primaryField) {
                            const v = parseFloat(trial.cover || trial[primaryField] || trial.diseaseSeverity || trial.pestCount || trial.plantHeight || 0);
                            return Number.isFinite(v) ? v : null;
                        }
                        const value = trial[metric] ?? trial[metric === 'yield' ? 'yieldKgPlot' : metric];
                        const numeric = parseFloat(value);
                        return Number.isFinite(numeric) ? numeric : null;
                    }

                    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
                    if (!Array.isArray(efficacy) || efficacy.length === 0) return null;

                    const obs = daa !== null
                        ? (efficacy.find(e => Number(e.daa) === Number(daa) || Number(e.daysAfterApplication) === Number(daa)) || efficacy[efficacy.length - 1])
                        : efficacy.slice().sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
                    if (!obs) return null;

                    if (metric === 'yield') {
                        const yVal = parseFloat(trial.Yield || trial.YieldValue || obs.yield || obs.yieldKgPlot || obs.yieldValue || 0);
                        return Number.isFinite(yVal) ? yVal : null;
                    }

                    if (metric === 'audpc') {
                        const sortedObs = [...efficacy].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
                        let audpcVal = 0;
                        for (let i = 0; i < sortedObs.length - 1; i++) {
                            const y1 = parseFloat(getObservationPrimaryValue(this.category, sortedObs[i]) ?? 0);
                            const y2 = parseFloat(getObservationPrimaryValue(this.category, sortedObs[i + 1]) ?? 0);
                            const t1 = parseFloat(sortedObs[i].daa || 0);
                            const t2 = parseFloat(sortedObs[i + 1].daa || 0);
                            audpcVal += ((y1 + y2) / 2) * (t2 - t1);
                        }
                        return Number.isFinite(audpcVal) ? audpcVal : null;
                    }

                    if (metric === 'rootToShootRatio') {
                        const root = parseFloat(obs.rootBiomass ?? 0);
                        const shoot = parseFloat(obs.shootBiomass ?? 0);
                        return shoot > 0 ? root / shoot : null;
                    }

                    if (metric === 'nue') {
                        const plotSize = trial.plotSize || trial.PlotSize || this.project?.plotSize || this.project?.PlotSize;
                        const areaHa = getPlotAreaHectares(plotSize);
                        
                        const getYieldInKgHa = (t, o) => {
                            const rawYield = parseFloat(t.Yield || t.YieldValue || o?.yield || o?.yieldKgPlot || o?.yieldValue || 0);
                            const isPlotYield = t.yieldKgPlot !== undefined || o?.yieldKgPlot !== undefined || (t.Yield && String(t.Yield).toLowerCase().includes('plot')) || (o?.yield && String(o?.yield).toLowerCase().includes('plot'));
                            if (isPlotYield && areaHa > 0) {
                                return rawYield / areaHa;
                            }
                            return rawYield;
                        };

                        const yieldVal = getYieldInKgHa(trial, obs);
                        const rate = parseFloat(trial.Dosage || 1);
                        if (rate <= 0) return null;
                        const utcReps = this.getReplications(this.utcName || '');
                        const utcYields = utcReps.map(ur => {
                            const eff = safeJsonParse(ur.EfficacyDataJSON, []);
                            const lastObs = eff.length ? eff[eff.length - 1] : null;
                            const y = getYieldInKgHa(ur, lastObs);
                            return Number.isFinite(y) ? y : null;
                        }).filter(v => v !== null);
                        const utcMeanYield = utcYields.length ? utcYields.reduce((a, b) => a + b, 0) / utcYields.length : 0;
                        return Number.isFinite(utcMeanYield) ? (yieldVal - utcMeanYield) / rate : null;
                    }

                    if (metric === 'cover' || metric === primaryField) {
                        if (this.category === 'herbicide') {
                            if (species) {
                                const canonicalSpecies = canonicalizeWeedSpecies(species);
                                const d = (obs.weedDetails || []).find(w => canonicalizeWeedSpecies(w.species) === canonicalSpecies);
                                const val = d ? parseFloat(d.cover) : NaN;
                                return Number.isFinite(val) ? val : null;
                            }
                            const totalCover = (obs.weedDetails || []).reduce((sum, w) => {
                                const v = parseFloat(w.cover);
                                return sum + (Number.isFinite(v) ? v : 0);
                            }, 0);
                            return Number.isFinite(totalCover) ? totalCover : null;
                        }
                        const raw = getObservationPrimaryValue(this.category, obs) ?? 0;
                        const numeric = parseFloat(raw);
                        return Number.isFinite(numeric) ? numeric : null;
                    }

                    const rawVal = obs[metric] ?? 0;
                    const numeric = parseFloat(rawVal);
                    return Number.isFinite(numeric) ? numeric : null;
                }

                 // Get aggregated data for a specific metric
                getData(metric, species = null, daa = null) {
                    const data = {};
                    this.trials.forEach(trial => {
                        const trt = trial.FormulationName || 'Unknown';
                        const value = this.getObservationValue(trial, metric, species, daa);
                        if (value === null || value === undefined || !Number.isFinite(value)) return;

                        if (!data[trt]) {
                            data[trt] = { values: [], trials: [], trialIds: [] };
                        }

                        data[trt].values.push(value);
                        data[trt].trials.push(trial);
                        data[trt].trialIds.push(String(trial.ID ?? trial.id ?? trial.trialId ?? `${trt}-${data[trt].values.length}`));
                    });
                    return data;
                }

                // Main Analysis Method
                async analyze(metric, species = null, daa = null, options = {}) {
                    if (!this.trials || this.trials.length === 0) {
                        return {
                            means: {},
                            efficacy: {},
                            anova: {
                                ssTreat: 0, ssBlock: 0, ssError: 0, ssTotal: 0,
                                dfTreat: 0, dfBlock: 0, dfError: 0, dfTotal: 0,
                                msTreat: 0, msBlock: 0, msError: 0,
                                fVal: 0, pVal: 1, grandMean: 0, cv: 0
                            },
                            postHoc: { letters: {}, method: 'lsd', value: 0 },
                            grouping: [],
                            raw: {},
                            balance: { isBalanced: true, counts: {} },
                            timestamp: new Date().toISOString(),
                            metric: metric
                        };
                    }

                    // Try to use backend data first
                    await this.fetchBackendData();

                    const dataMap = this.getData(metric, species, daa);
                    const treatments = Object.keys(dataMap).filter(trt => dataMap[trt].values.length > 0);
                    const anovaData = treatments.map(t => dataMap[t].values);

                    if (treatments.length === 0) {
                        return {
                            means: {},
                            efficacy: {},
                            anova: {
                                ssTreat: 0, ssBlock: 0, ssError: 0, ssTotal: 0,
                                dfTreat: 0, dfBlock: 0, dfError: 0, dfTotal: 0,
                                msTreat: 0, msBlock: 0, msError: 0,
                                fVal: 0, pVal: 1, grandMean: 0, cv: 0
                            },
                            postHoc: { letters: {}, method: 'lsd', value: 0 },
                            grouping: [],
                            raw: {},
                            balance: { isBalanced: true, counts: {} },
                            timestamp: new Date().toISOString(),
                            metric: metric
                        };
                    }

                    const means = {};
                    treatments.forEach(t => {
                        means[t] = jStat.mean(dataMap[t].values);
                    });

                    const isPotTrial = this.project?.Design === 'PotTrial' || this.trials[0]?.TrialDesign === 'PotTrial';
                    const isTwoWay = !isPotTrial && (this.trials[0]?.TrialDesign === 'Factorial' || this.trials[0]?.TrialDesign === 'Split-Plot' || this.project?.TrialDesign === 'Factorial' || this.project?.TrialDesign === 'Split-Plot');

                    const blockIds = new Set(this.trials.map(t => t.BlockID || t.Replication || '').filter(Boolean));
                    const designOverride = /CRD/i.test(this.project?.Design || this.trials[0]?.TrialDesign || '') ? 'CRD' : 'RCBD';
                    const effectiveDesign = (!isPotTrial && !isTwoWay && blockIds.size < 2) ? 'CRD' : designOverride;

                    let anovaResults;
                    let potLayout = 'stripe';
                    if (isPotTrial) {
                        potLayout = this.project?.PotLayout || this.trials[0]?.PotLayout || 'stripe';
                        if (potLayout === 'rcbd-pot') {
                            anovaResults = performANOVA(this.trials, { metric, species, daa, design: 'RCBD' });
                        } else {
                            anovaResults = performANOVA(this.trials, { metric, species, daa, design: 'CRD' });
                        }
                    } else if (isTwoWay) {
                        anovaResults = performTwoWayANOVA(this.trials, {
                            metric,
                            species,
                            daa,
                            mainFactorName: this.project?.MainFactor || this.trials.find(t => t.MainFactor)?.MainFactor || 'Factor A',
                            subFactorName: this.project?.SubFactor || this.trials.find(t => t.SubFactor)?.SubFactor || 'Factor B'
                        });
                        if (anovaResults.error) {
                            anovaResults = performANOVA(this.trials, { metric, species, daa, design: effectiveDesign });
                        }
                    } else {
                        anovaResults = performANOVA(this.trials, { metric, species, daa, design: effectiveDesign });
                    }

                    if (anovaResults.error && !isTwoWay) {
                        anovaResults = this.calculateANOVA(anovaData);
                    }

                    // Detect outliers for each treatment
                    const outliers = {};
                    treatments.forEach(trt => {
                        const entry = dataMap[trt];
                        if (!entry) return;
                        const repsWithValues = entry.trials.map((r, idx) => ({
                            trialId: String(r.ID ?? r.id ?? r.trialId ?? `${trt}-${idx}`),
                            value: entry.values[idx]
                        })).filter(r => r.trialId && r.value !== undefined && !isNaN(r.value));

                        const values = repsWithValues.map(r => r.value);
                        if (values.length >= 3) {
                            const detected = detectOutliers(values);
                            detected.forEach(out => {
                                const trId = repsWithValues[out.index].trialId;
                                outliers[trId] = {
                                    value: out.value,
                                    zScore: out.zScore,
                                    modifiedZScore: out.modifiedZScore
                                };
                            });
                        }
                    });

                    const efficacy = {};
                    const primaryField = getPrimaryObservationField(this.category);
                    if (this.utcName && means[this.utcName] > 0) {
                        // Check if Henderson-Tilton can be calculated for pesticide trials
                        let canUseHendersonTilton = false;
                        let utcBaseMean = 0;
                        const trtBaseMeans = {};

                        if ((this.category === 'pesticide' || this.category === 'herbicide' || this.category === 'fungicide') && (metric === 'cover' || metric === primaryField)) {
                            // Find 0 DAA or earliest baseline values
                            const utcReps = this.getReplications(this.utcName);
                            const utcBaseVals = utcReps.map(ur => {
                                const eff = safeJsonParse(ur.EfficacyDataJSON, []);
                                const baseObs = eff.find(e => parseFloat(e.daa) === 0);
                                return baseObs ? parseFloat(baseObs[primaryField] ?? baseObs.pestCount ?? baseObs.weedCover ?? baseObs.diseaseSeverity ?? 0) : null;
                            }).filter(v => v !== null);

                            if (utcBaseVals.length > 0) {
                                utcBaseMean = utcBaseVals.reduce((a, b) => a + b, 0) / utcBaseVals.length;
                                if (utcBaseMean > 0) {
                                    treatments.forEach(trt => {
                                        const trtReps = this.getReplications(trt);
                                        const trtBaseVals = trtReps.map(tr => {
                                            const eff = safeJsonParse(tr.EfficacyDataJSON, []);
                                            const baseObs = eff.find(e => parseFloat(e.daa) === 0);
                                            return baseObs ? parseFloat(baseObs[primaryField] ?? baseObs.pestCount ?? baseObs.weedCover ?? baseObs.diseaseSeverity ?? 0) : null;
                                        }).filter(v => v !== null);
                                        if (trtBaseVals.length > 0) {
                                            trtBaseMeans[trt] = trtBaseVals.reduce((a, b) => a + b, 0) / trtBaseVals.length;
                                        }
                                    });
                                    canUseHendersonTilton = Object.keys(trtBaseMeans).length === treatments.length;
                                }
                            }
                        }

                        treatments.forEach(t => {
                            if (metric === 'cover' || metric === primaryField || metric === 'audpc') {
                                if (this.category === 'nutrition' || this.category === 'biostimulant' || metric === 'nue') {
                                    efficacy[t] = ((means[t] - means[this.utcName]) / means[this.utcName]) * 100;
                                } else if (canUseHendersonTilton && trtBaseMeans[t] > 0) {
                                    // Henderson-Tilton: (1 - (Ta * Cb) / (Tb * Ca)) * 100
                                    const Ta = means[t];
                                    const Tb = trtBaseMeans[t];
                                    const Ca = means[this.utcName];
                                    const Cb = utcBaseMean;
                                    efficacy[t] = (1 - (Ta * Cb) / (Tb * Ca)) * 100;
                                } else {
                                    efficacy[t] = ((means[this.utcName] - means[t]) / means[this.utcName]) * 100;
                                }
                            } else {
                                efficacy[t] = 0;
                            }
                        });
                    }

                    // Build counts per treatment for robust LSD in unbalanced cases
                    const counts = {};
                    treatments.forEach(tName => {
                        const entry = dataMap[tName];
                        counts[tName] = entry?.values?.filter(v => !isNaN(v)).length || 1;
                    });
                    const postHocMethod = (options.postHoc === 'tukey') ? 'tukey' : ((options.postHoc === 'duncan') ? 'duncan' : 'lsd');
                    const alpha = (typeof options.alpha === 'number' && isFinite(options.alpha)) ? options.alpha : 0.05;
                    const postHoc = this.getLetterGrouping(means, anovaResults.msError, anovaResults.dfError, counts, { method: postHocMethod, alpha });

                    // Route SNK and Bonferroni post-hoc tests
                    if (options.postHoc === 'snk') {
                        const snkResult = performSNKTest(this.trials, { ...options, metric, species, daa, anova: anovaResults });
                        const ar = {
                            means, efficacy, anova: anovaResults,
                            postHoc: { ...snkResult, method: 'snk' },
                            snkResults: snkResult,
                            bartlett: calculateBartlettsTestLegacy(anovaData),
                            normality: calculateResidualsDiagnostics(this.trials, dataMap, means, anovaResults),
                            grouping: (snkResult.groups ? Object.entries(snkResult.groups).map(([name, g]) => ({ name, mean: means[name], grouping: g })) : []).sort((a, b) => b.mean - a.mean),
                            raw: dataMap,
                            balance: { isBalanced: (new Set(Object.values(counts))).size === 1, counts },
                            outliers, timestamp: new Date().toISOString(), metric
                        };
                        ar.residualDiagnostics = statsCalculateResidualsDiagnostics(ar);
                        return ar;
                    }

                    if (options.postHoc === 'bonferroni') {
                        const bonferroniResult = performBonferroniTest(this.trials, { ...options, metric, species, daa, anova: anovaResults });
                        const ar = {
                            means, efficacy, anova: anovaResults,
                            postHoc: { ...bonferroniResult, method: 'bonferroni' },
                            bonferroniResults: bonferroniResult,
                            bartlett: calculateBartlettsTestLegacy(anovaData),
                            normality: calculateResidualsDiagnostics(this.trials, dataMap, means, anovaResults),
                            grouping: (bonferroniResult.groups ? Object.entries(bonferroniResult.groups).map(([name, g]) => ({ name, mean: means[name], grouping: g })) : []).sort((a, b) => b.mean - a.mean),
                            raw: dataMap,
                            balance: { isBalanced: (new Set(Object.values(counts))).size === 1, counts },
                            outliers, timestamp: new Date().toISOString(), metric
                        };
                        ar.residualDiagnostics = statsCalculateResidualsDiagnostics(ar);
                        return ar;
                    }

                    const formattedGrouping = treatments.map(t => ({
                         name: t,
                         mean: means[t],
                         grouping: postHoc.letters[t] || '-'
                    })).sort((a, b) => b.mean - a.mean);

                    const bartlettResult = calculateBartlettsTestLegacy(anovaData);
                    const normalityResult = calculateResidualsDiagnostics(this.trials, dataMap, means, anovaResults);
                    const repsCount = this.trials.length / (treatments.length || 1);
                    const blockingEff = (isPotTrial && potLayout !== 'rcbd-pot') ? 1.0 : calculateBlockingEfficiency(anovaResults, repsCount);

                    const potObsMode = this.project?.PotObsMode || 'row-wise';
                    const potStripeDir = this.project?.PotStripeDirection || 'Horizontal Rows';
                    const potRows = this.project?.PotRows || 9;
                    const potCols = this.project?.PotCols || 4;
                    const potIdFormat = this.project?.PotIdentifierFormat || 'row-col';

                    let analysisNotes = '';
                    if (isPotTrial) {
                        const allocationStr = treatments.map(name => `  ${name} = ${counts[name]} ${potObsMode === 'row-wise' ? 'rows' : 'pots'}`).join('\n');
                        if (potLayout === 'rcbd-pot') {
                            const potBlocks = this.project?.PotBlocks || this.blocks?.length || 3;
                            analysisNotes = `Design: Pot Trial (RCBD Pot Trial)\nReplications: ${potBlocks} Blocks\nExperimental Unit: Pot\nRows: ${potRows}\nColumns: ${potCols}\nObservation Mode: Plant-Wise\nPot Identifier Format: ${potIdFormat === 'sequential' ? 'Sequential (P001)' : 'Row-Column (R1C1)'}\nAnalysis Method: RCBD ANOVA\nTreatment Allocation:\n${allocationStr}`;
                        } else {
                            analysisNotes = `Design: Pot Trial (${potLayout === 'stripe' ? 'Stripe Layout' : potLayout === 'randomized-row' ? 'Randomized Row Layout' : 'Balanced Pot Randomization'})\nExperimental Unit: ${potObsMode === 'row-wise' ? 'Row' : 'Pot'}\nStripe Direction: ${potStripeDir}\nRows: ${potRows}\nColumns: ${potCols}\nObservation Mode: ${potObsMode === 'row-wise' ? 'Row-Wise' : 'Plant-Wise'}\nPot Identifier Format: ${potIdFormat === 'sequential' ? 'Sequential (P001)' : 'Row-Column (R1C1)'}\nAnalysis Method: CRD-style comparison\nTreatment Allocation:\n${allocationStr}`;
                        }
                    } else {
                        analysisNotes = `Design: ${this.project?.Design || 'RCBD'}\nExperimental Unit: Plot\nReplications: ${this.blocks.length}\nTreatments: ${treatments.length}\nAnalysis Method: ${isTwoWay ? 'Two-way RCBD ANOVA' : 'One-way RCBD ANOVA'}`;
                    }

                    const results = {
                        means,
                        efficacy,
                        anova: anovaResults,
                        postHoc: postHoc,
                        bartlett: bartlettResult,
                        normality: normalityResult,
                        blockingEfficiency: blockingEff,
                        analysisNotes: analysisNotes,
                        lsdResults: postHoc.method === 'lsd' ? { ...postHoc, groupings: formattedGrouping } : null,
                        tukeyResults: postHoc.method === 'tukey' ? { ...postHoc, groupings: formattedGrouping } : null,
                        duncanResults: postHoc.method === 'duncan' ? { ...postHoc, groupings: formattedGrouping } : null,
                        grouping: formattedGrouping,
                        raw: dataMap,
                        balance: {
                            isBalanced: (new Set(Object.values(counts))).size === 1,
                            counts: counts
                        },
                        outliers,
                        timestamp: new Date().toISOString(),
                        metric: metric
                    };

                    results.residualDiagnostics = statsCalculateResidualsDiagnostics(results);

                    // PERSIST RESULTS TO BACKEND (Asynchronously in background to keep UI fast!)
                    if (options.persist !== false && this.getAppState && this.getAppState()?.settings?.scriptUrl) {
                        Promise.resolve().then(async () => {
                            try {
                                await apiCall('saveAnalysisResults', {
                                    projectId: this.projectId,
                                    results: results
                                }, false, this.getAppState);
                                await apiCall('logAnalysisRun', {
                                    projectId: this.projectId,
                                    metric: metric,
                                    fValue: anovaResults.fVal,
                                    pValue: anovaResults.pVal,
                                    significance: formatSignificance(anovaResults.pVal).symbol,
                                    results: results
                                }, false, this.getAppState);
                                console.log('[AnalysisEngine] Results persisted to sheet');
                            } catch (e) {
                                console.warn('[AnalysisEngine] Failed to persist results:', e.message || e);
                            }
                        }).catch(e => console.warn('[AnalysisEngine] Async persistence error:', e.message || e));
                    }

                    return results;
                }

                calculateANOVA(groups) {
                    // groups is array of arrays: [[r1, r2, ...], [r1, r2, ...]]
                    // Handle both balanced and unbalanced RCBD
                    if (!groups || groups.length === 0 || groups.every(g => g.length === 0)) {
                        return {
                            ssTreat: 0, ssBlock: 0, ssError: 0, ssTotal: 0,
                            dfTreat: 0, dfBlock: 0, dfError: 0, dfTotal: 0,
                            msTreat: 0, msBlock: 0, msError: 0,
                            fVal: 0, pVal: 1, grandMean: 0, cv: 0
                        };
                    }

                    const t = groups.length;
                    const lens = groups.map(g => g.length);
                    const isBalanced = lens.length > 0 && lens.every(l => l === lens[0]);

                    if (isBalanced) {
                        const r = lens[0] || 0;
                        const N = t * r;
                        if (N === 0) {
                            return {
                                ssTreat: 0, ssBlock: 0, ssError: 0, ssTotal: 0,
                                dfTreat: 0, dfBlock: 0, dfError: 0, dfTotal: 0,
                                msTreat: 0, msBlock: 0, msError: 0,
                                fVal: 0, pVal: 1, grandMean: 0, cv: 0
                            };
                        }
                        const flat = groups.flat();
                        const grandTotal = flat.reduce((a, b) => a + b, 0);
                        const grandMean = grandTotal / N;
                        const CF = (grandTotal * grandTotal) / N;

                        // SS Total
                        const ssTotal = flat.reduce((acc, val) => acc + (val * val), 0) - CF;

                        // SS Treatments
                        let ssTreat = 0;
                        groups.forEach(g => {
                            const trTotal = g.reduce((a, b) => a + b, 0);
                            ssTreat += (trTotal * trTotal) / (r || 1);
                        });
                        ssTreat -= CF;

                        // SS Blocks (Rows)
                        let ssBlock = 0;
                        for (let j = 0; j < r; j++) {
                            let blTotal = 0;
                            for (let i = 0; i < t; i++) blTotal += groups[i][j] || 0;
                            ssBlock += (blTotal * blTotal) / (t || 1);
                        }
                        ssBlock -= CF;

                        // SS Error
                        const ssError = Math.max(0, ssTotal - ssTreat - ssBlock);

                        // DF
                        const dfTreat = Math.max(0, t - 1);
                        const dfBlock = Math.max(0, r - 1);
                        const dfError = dfTreat * dfBlock;
                        const dfTotal = Math.max(0, N - 1);

                        // MS
                        const msTreat = dfTreat > 0 ? ssTreat / dfTreat : 0;
                        const msBlock = dfBlock > 0 ? ssBlock / dfBlock : 0;
                        const msError = dfError > 0 ? ssError / dfError : 0;

                        // F & P
                        const fVal = msError > 0 ? msTreat / msError : 0;
                        const pVal = (msError > 0 && typeof jStat !== 'undefined') ? 1 - jStat.centralF.cdf(fVal, dfTreat, dfError) : 1;

                        return {
                            ssTreat, ssBlock, ssError, ssTotal,
                            dfTreat, dfBlock, dfError, dfTotal,
                            msTreat, msBlock, msError,
                            fVal, pVal, grandMean,
                            cv: grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0
                        };
                    }

                    // Unbalanced Design - Type III Sum of Squares (GLM Solver)
                    const dataPoints = [];
                    for (let i = 0; i < t; i++) {
                        for (let j = 0; j < groups[i].length; j++) {
                            const val = groups[i][j];
                            if (val !== undefined && val !== null && !isNaN(val)) {
                                dataPoints.push({ trtIdx: i, blockIdx: j, val: val });
                            }
                        }
                    }

                    const N = dataPoints.length;
                    const b = Math.max(...lens) || 1;
                    const flatVals = dataPoints.map(d => d.val);
                    const grandMean = flatVals.reduce((a, b) => a + b, 0) / (N || 1);

                    if (N < 4 || t < 2 || b < 2) {
                        return {
                            ssTreat: 0, ssBlock: 0, ssError: 0, ssTotal: 0,
                            dfTreat: 0, dfBlock: 0, dfError: 0, dfTotal: 0,
                            msTreat: 0, msBlock: 0, msError: 0,
                            fVal: 0, pVal: 1, grandMean: grandMean || 0, cv: 0
                        };
                    }

                    const solveSystem = (A, B) => {
                        const n = A.length;
                        const M = Array.from({ length: n }, (_, i) => {
                            const r = new Array(n + 1);
                            for (let j = 0; j < n; j++) r[j] = A[i][j];
                            r[n] = B[i];
                            return r;
                        });
                        for (let i = 0; i < n; i++) {
                            let maxEl = Math.abs(M[i][i]);
                            let maxRow = i;
                            for (let k = i + 1; k < n; k++) {
                                if (Math.abs(M[k][i]) > maxEl) {
                                    maxEl = Math.abs(M[k][i]);
                                    maxRow = k;
                                }
                            }
                            const tmp = M[maxRow]; M[maxRow] = M[i]; M[i] = tmp;
                            for (let k = i + 1; k < n; k++) {
                                if (Math.abs(M[i][i]) < 1e-12) return null;
                                const c = -M[k][i] / M[i][i];
                                for (let j = i; j <= n; j++) {
                                    M[k][j] = i === j ? 0 : M[k][j] + c * M[i][j];
                                }
                            }
                        }
                        const x = new Array(n).fill(0);
                        for (let i = n - 1; i >= 0; i--) {
                            if (Math.abs(M[i][i]) < 1e-12) return null;
                            x[i] = M[i][n] / M[i][i];
                            for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
                        }
                        return x;
                    };

                    const fit = (X_mat) => {
                        const p = X_mat[0].length;
                        const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
                        const XtY = new Array(p).fill(0);
                        for (let i = 0; i < p; i++) {
                            for (let j = 0; j < p; j++) {
                                let sum = 0;
                                for (let k = 0; k < N; k++) sum += X_mat[k][i] * X_mat[k][j];
                                XtX[i][j] = sum;
                            }
                            let sumY = 0;
                            for (let k = 0; k < N; k++) sumY += X_mat[k][i] * flatVals[k];
                            XtY[i] = sumY;
                        }
                        const beta = solveSystem(XtX, XtY);
                        if (!beta) return null;
                        let ssErr = 0;
                        for (let k = 0; k < N; k++) {
                            let pred = 0;
                            for (let j = 0; j < p; j++) pred += X_mat[k][j] * beta[j];
                            ssErr += Math.pow(flatVals[k] - pred, 2);
                        }
                        return ssErr;
                    };

                    const getRow = (tIdx, bIdx, excludeTerm = '') => {
                        const row = [1];
                        if (excludeTerm !== 'trt') {
                            if (tIdx < t - 1) {
                                for (let i = 0; i < t - 1; i++) row.push(i === tIdx ? 1 : 0);
                            } else {
                                for (let i = 0; i < t - 1; i++) row.push(-1);
                            }
                        }
                        if (excludeTerm !== 'blk') {
                            if (bIdx < b - 1) {
                                for (let i = 0; i < b - 1; i++) row.push(i === bIdx ? 1 : 0);
                            } else {
                                for (let i = 0; i < b - 1; i++) row.push(-1);
                            }
                        }
                        return row;
                    };

                    const X_full = dataPoints.map(d => getRow(d.trtIdx, d.blockIdx));
                    const X_no_trt = dataPoints.map(d => getRow(d.trtIdx, d.blockIdx, 'trt'));
                    const X_no_blk = dataPoints.map(d => getRow(d.trtIdx, d.blockIdx, 'blk'));

                    const ssError = fit(X_full) ?? 0;
                    const ssError_no_trt = fit(X_no_trt) ?? ssError;
                    const ssError_no_blk = fit(X_no_blk) ?? ssError;

                    const ssTreat = Math.max(0, ssError_no_trt - ssError);
                    const ssBlock = Math.max(0, ssError_no_blk - ssError);

                    let ssTotal = 0;
                    flatVals.forEach(v => { ssTotal += Math.pow(v - grandMean, 2); });

                    const dfTreat = Math.max(0, t - 1);
                    const dfBlock = Math.max(0, b - 1);
                    const dfError = Math.max(1, N - t - b + 1);
                    const dfTotal = Math.max(0, N - 1);

                    const msTreat = dfTreat > 0 ? ssTreat / dfTreat : 0;
                    const msBlock = dfBlock > 0 ? ssBlock / dfBlock : 0;
                    const msError = dfError > 0 ? ssError / dfError : 0;

                    const fVal = msError > 0 ? msTreat / msError : 0;
                    const pVal = (msError > 0 && typeof jStat !== 'undefined') ? 1 - jStat.centralF.cdf(fVal, dfTreat, dfError) : 1;

                    return {
                        ssTreat, ssBlock, ssError, ssTotal,
                        dfTreat, dfBlock, dfError, dfTotal,
                        msTreat, msBlock, msError,
                        fVal, pVal, grandMean,
                        cv: grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0,
                        isTypeIII: true
                    };
                }

                getLetterGrouping(meansObj, mse, dfError, countsOrReps, options = {}) {
                    const method = options.method === 'tukey' ? 'tukey' : (options.method === 'duncan' ? 'duncan' : 'lsd');
                    const alpha = (typeof options.alpha === 'number' && isFinite(options.alpha)) ? options.alpha : 0.05;
                    const tVal = (typeof jStat !== 'undefined') ? jStat.studentt.inv(1 - (alpha / 2), dfError) : 2.05;

                    const trNames = Object.keys(meansObj);
                    const k = trNames.length;
                    const treatmentStats = trNames.map(name => ({ treatmentId: name, mean: meansObj[name] }));

                    const counts = {};
                    if (typeof countsOrReps === 'number') {
                        trNames.forEach(n => counts[n] = Math.max(1, countsOrReps));
                    } else if (countsOrReps && typeof countsOrReps === 'object') {
                        trNames.forEach(n => counts[n] = Math.max(1, countsOrReps[n] || 1));
                    } else {
                        trNames.forEach(n => counts[n] = 1);
                    }

                    const minN = Math.max(1, Math.min(...Object.values(counts)));

                    if (method === 'duncan') {
                        const duncanTable = {
                            5: [3.64, 3.74, 3.79, 3.83, 3.85, 3.86, 3.87, 3.88, 3.89],
                            10: [3.15, 3.30, 3.37, 3.43, 3.46, 3.47, 3.48, 3.49, 3.50],
                            15: [3.01, 3.16, 3.25, 3.31, 3.35, 3.37, 3.39, 3.40, 3.41],
                            20: [2.95, 3.10, 3.18, 3.25, 3.29, 3.32, 3.34, 3.35, 3.36],
                            30: [2.89, 3.04, 3.12, 3.18, 3.22, 3.25, 3.27, 3.28, 3.29],
                            60: [2.83, 2.98, 3.06, 3.12, 3.16, 3.19, 3.21, 3.22, 3.23],
                            "inf": [2.77, 2.92, 3.00, 3.06, 3.10, 3.13, 3.15, 3.17, 3.18]
                        };
                        const dfKey = dfError >= 120 ? "inf" : (dfError >= 60 ? 60 : (dfError >= 30 ? 30 : (dfError >= 20 ? 20 : (dfError >= 15 ? 15 : (dfError >= 10 ? 10 : 5)))));
                        const dfEntry = duncanTable[dfKey] || duncanTable["inf"];

                        const sortedTrts = [...treatmentStats].sort((a, b) => b.mean - a.mean);
                        const sigPairs = new Set();
                        for (let i = 0; i < k; i++) {
                            for (let j = i + 1; j < k; j++) {
                                const step = j - i + 1;
                                const pIndex = Math.min(Math.max(step, 2), 10) - 2;
                                const qVal = dfEntry[pIndex] || 3.0;
                                const ni = counts[sortedTrts[i].treatmentId] || 1;
                                const nj = counts[sortedTrts[j].treatmentId] || 1;
                                const dsd = qVal * Math.sqrt(mse * 0.5 * (1 / ni + 1 / nj));
                                if (Math.abs(sortedTrts[i].mean - sortedTrts[j].mean) > dsd) {
                                    sigPairs.add(`${sortedTrts[i].treatmentId}_${sortedTrts[j].treatmentId}`);
                                    sigPairs.add(`${sortedTrts[j].treatmentId}_${sortedTrts[i].treatmentId}`);
                                }
                            }
                        }

                        const isNonSignificant = (a, b) => !sigPairs.has(`${a.treatmentId}_${b.treatmentId}`);
                        assignCLDByComparator(treatmentStats, isNonSignificant);

                        const letters = {};
                        treatmentStats.forEach(ts => { letters[ts.treatmentId] = ts.rank; });
                        return { method: 'duncan', alpha, letters };
                    }

                    if (method === 'tukey') {
                        // Proper studentized range critical value from q-table
                        const qCrit = (typeof getStudentizedRangeCritical === 'function')
                            ? getStudentizedRangeCritical(alpha, k, dfError)
                            : 3.80; // Improved fallback for k around 4-5

                        const hsdRef = qCrit * Math.sqrt(mse / minN);
                        const isNonSignificant = (a, b) => {
                            const ni = counts[a.treatmentId] || 1;
                            const nj = counts[b.treatmentId] || 1;
                            const hsd_ij = qCrit * Math.sqrt(mse * 0.5 * (1 / ni + 1 / nj));
                            return Math.abs(a.mean - b.mean) <= hsd_ij;
                        };
                        assignCLDByComparator(treatmentStats, isNonSignificant);

                        const letters = {};
                        treatmentStats.forEach(ts => { letters[ts.treatmentId] = ts.rank; });
                        return { method: 'tukey', alpha, qCrit, hsd: hsdRef, value: hsdRef, letters };
                    }

                    const lsdRef = tVal * Math.sqrt((2 * mse) / minN);
                    const isNonSignificant = (a, b) => {
                        const ni = counts[a.treatmentId] || 1;
                        const nj = counts[b.treatmentId] || 1;
                        const lsd_ij = tVal * Math.sqrt(mse * (1 / ni + 1 / nj));
                        return Math.abs(a.mean - b.mean) <= lsd_ij;
                    };
                    assignCLDByComparator(treatmentStats, isNonSignificant);

                    const letters = {};
                    treatmentStats.forEach(ts => { letters[ts.treatmentId] = ts.rank; });
                    return { method: 'lsd', alpha, lsd: lsdRef, value: lsdRef, letters };
                }

                /**
                 * Batch analysis: runs analyze() for each paramKey and returns a map of results.
                 * Errors per parameter are caught and stored as { error: string } without throwing.
                 *
                 * @param {string[]} paramKeys - List of observation parameter keys to analyze
                 * @param {object}   options   - Forwarded to analyze(); supports .daa, .postHoc ('lsd'|'tukey'|'duncan'), .alpha, etc.
                 * @returns {Promise<{ [paramKey]: AnalysisResult | { error: string } }>}
                 */
                async analyzeAllParameters(paramKeys, options = {}) {
                    const results = {};
                    for (const key of paramKeys) {
                        try {
                            const result = await this.analyze(key, null, options.daa, options);
                            // Normalize postHoc.letters so callers always find letters under that key
                            if (result && result.postHoc && !result.postHoc.letters) {
                                result.postHoc.letters = result.postHoc.groups || result.postHoc.cld || {};
                            }
                            results[key] = result;
                        } catch (e) {
                            results[key] = { error: e.message || String(e) };
                        }
                    }
                    return results;
                }
            }

            function assignCLDByComparator(treatmentStats, isNonSignificant) {
                const sorted = [...treatmentStats].sort((a, b) => b.mean - a.mean);
                const n = sorted.length;
                const cliques = [];
                for (let i = 0; i < n; i++) {
                    const clique = [i];
                    for (let j = 0; j < n; j++) {
                        if (i === j) continue;
                        if (clique.every(idx => isNonSignificant(sorted[idx], sorted[j]))) clique.push(j);
                    }
                    clique.sort((a, b) => a - b);
                    if (!cliques.some(c => c.join(',') === clique.join(','))) {
                        if (!cliques.some(c => clique.every(idx => c.includes(idx)))) {
                            for (let k = cliques.length - 1; k >= 0; k--) {
                                if (cliques[k].every(idx => clique.includes(idx))) cliques.splice(k, 1);
                            }
                            cliques.push(clique);
                        }
                    }
                }
                cliques.sort((a, b) => a[0] - b[0]);
                const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
                sorted.forEach(ts => ts.rank = '');
                cliques.forEach((c, i) => {
                    const l = letters[i % 26];
                    c.forEach(idx => sorted[idx].rank += l);
                });
                treatmentStats.forEach(ts => {
                    const m = sorted.find(s => s.treatmentId === ts.treatmentId);
                    if (m) ts.rank = m.rank.split('').sort().join('');
                });
            }

export function calculateBartlettsTestLegacy(groups) {
  const k = groups.length;
  if (k < 2) return null;

  const validGroups = groups.map(g => g.filter(v => v !== undefined && !isNaN(v) && v !== null));
  
  if (validGroups.some(g => g.length < 2)) {
    return { error: 'Replications too low (n < 2) for variance check' };
  }

  const ns = validGroups.map(g => g.length);
  const N = ns.reduce((a, b) => a + b, 0);
  const vars = validGroups.map(g => {
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    const sqDiff = g.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
    return sqDiff / (g.length - 1);
  });

  const correctedVars = vars.map(v => v === 0 ? 0.0001 : v);
  const dfPooled = N - k;
  if (dfPooled <= 0) return null;

  let pooledVarNum = 0;
  for (let i = 0; i < k; i++) {
    pooledVarNum += (ns[i] - 1) * correctedVars[i];
  }
  const pooledVar = pooledVarNum / dfPooled;
  if (pooledVar <= 0) return null;

  let sumTerm = 0;
  for (let i = 0; i < k; i++) {
    sumTerm += (ns[i] - 1) * Math.log(correctedVars[i]);
  }
  const B = (dfPooled * Math.log(pooledVar) - sumTerm);

  let sumInv = 0;
  for (let i = 0; i < k; i++) {
    sumInv += 1 / (ns[i] - 1);
  }
  const C = 1 + (1 / (3 * (k - 1))) * (sumInv - (1 / dfPooled));

  const chiSq = B / C;
  const df = k - 1;

  let pVal = 1;
  if (typeof jStat !== 'undefined' && jStat.chisquare) {
    pVal = 1 - jStat.chisquare.cdf(chiSq, df);
  } else {
    pVal = chiSq > 3.84 ? 0.05 : 0.5; 
  }

  return {
    chiSq: parseFloat(chiSq.toFixed(4)),
    df,
    pVal: parseFloat(pVal.toFixed(5)),
    homogeneous: pVal >= 0.05
  };
}

export function calculateResidualsDiagnostics(trials, dataMap, trMeans, anovaResults) {
  const blocks = [...new Set(trials.map(t => t.BlockID).filter(Boolean))];
  const grandMean = anovaResults.grandMean || 0;

  const trialValueMap = new Map();
  Object.keys(dataMap).forEach(name => {
    const entry = dataMap[name];
    if (!entry || !Array.isArray(entry.trialIds) || !Array.isArray(entry.values)) return;
    entry.trialIds.forEach((trialId, idx) => {
      if (trialId !== undefined && entry.values[idx] !== undefined) {
        trialValueMap.set(String(trialId), entry.values[idx]);
      }
    });
  });

  const blSums = {};
  const blCounts = {};
  trials.forEach(t => {
    if (!t.BlockID || !t.FormulationName) return;
    const trialKey = String(t.ID ?? t.id ?? t.trialId ?? '');
    if (!trialKey) return;
    const val = trialValueMap.get(trialKey);
    if (val !== undefined && !isNaN(val)) {
      blSums[t.BlockID] = (blSums[t.BlockID] || 0) + val;
      blCounts[t.BlockID] = (blCounts[t.BlockID] || 0) + 1;
    }
  });

  const blMeans = {};
  blocks.forEach(bId => {
    blMeans[bId] = blCounts[bId] ? blSums[bId] / blCounts[bId] : grandMean;
  });

  const residuals = [];
  trials.forEach(t => {
    if (!t.FormulationName) return;
    const trialKey = String(t.ID ?? t.id ?? t.trialId ?? '');
    if (!trialKey) return;
    const val = trialValueMap.get(trialKey);
    if (val !== undefined && !isNaN(val)) {
      const trMean = trMeans[t.FormulationName] || grandMean;
      const blMean = t.BlockID ? (blMeans[t.BlockID] ?? grandMean) : grandMean;
      const res = val - trMean - blMean + grandMean;
      residuals.push(res);
    }
  });

  const N = residuals.length;
  if (N < 3) return { skewness: 0, kurtosis: 0, normal: true, status: 'N/A' };

  const mean = residuals.reduce((a, b) => a + b, 0) / N;
  const variance = residuals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (N - 1);
  const std = Math.sqrt(variance);

  if (std === 0) return { skewness: 0, kurtosis: 0, normal: true, status: 'Symmetric' };

  const skewness = (residuals.reduce((acc, val) => acc + Math.pow(val - mean, 3), 0) / N) / Math.pow(std, 3);
  const kurtosis = (residuals.reduce((acc, val) => acc + Math.pow(val - mean, 4), 0) / N) / Math.pow(std, 4) - 3;

  return {
    skewness: parseFloat(skewness.toFixed(4)),
    kurtosis: parseFloat(kurtosis.toFixed(4)),
    normal: Math.abs(skewness) <= 1.0,
    status: Math.abs(skewness) <= 0.5 ? 'Excellent (Symmetric)' : Math.abs(skewness) <= 1.0 ? 'Acceptable' : 'Highly Skewed',
    residuals
  };
}

export function calculateBlockingEfficiency(anovaResults, r) {
  const msBlock = anovaResults.msBlock || anovaResults.ssBlock / (anovaResults.dfBlock || 1);
  const msError = anovaResults.msError || anovaResults.ssError / (anovaResults.dfError || 1);
  if (!msBlock || !msError || !r || r <= 1) return 1.0;

  const re = (msBlock + (r - 1) * msError) / (r * msError);
  return parseFloat(re.toFixed(3));
}

export function calculateCRD_ANOVA(groups) {
  if (!groups || groups.length === 0 || groups.every(g => g.length === 0)) {
    return {
      ssTreat: 0, ssError: 0, ssTotal: 0,
      dfTreat: 0, dfError: 0, dfTotal: 0,
      msTreat: 0, msError: 0,
      fVal: 0, pVal: 1, grandMean: 0, cv: 0
    };
  }

  const t = groups.length;
  const flat = groups.map(g => g.filter(v => v !== undefined && !isNaN(v) && v !== null)).flat();
  const N = flat.length;
  if (N === 0) {
    return {
      ssTreat: 0, ssError: 0, ssTotal: 0,
      dfTreat: 0, dfError: 0, dfTotal: 0,
      msTreat: 0, msError: 0,
      fVal: 0, pVal: 1, grandMean: 0, cv: 0
    };
  }

  const grandTotal = flat.reduce((a, b) => a + b, 0);
  const grandMean = grandTotal / N;
  const CF = (grandTotal * grandTotal) / N;

  const ssTotal = flat.reduce((acc, val) => acc + Math.pow(val - grandMean, 2), 0);

  let ssTreat = 0;
  groups.forEach(g => {
    const validVals = g.filter(v => v !== undefined && !isNaN(v) && v !== null);
    const trTotal = validVals.reduce((a, b) => a + b, 0);
    const r_i = validVals.length;
    if (r_i > 0) {
      ssTreat += (trTotal * trTotal) / r_i;
    }
  });
  ssTreat = Math.max(0, ssTreat - CF);

  const ssError = Math.max(0, ssTotal - ssTreat);

  const dfTreat = Math.max(0, t - 1);
  const dfError = Math.max(0, N - t);
  const dfTotal = Math.max(0, N - 1);

  const msTreat = dfTreat > 0 ? ssTreat / dfTreat : 0;
  const msError = dfError > 0 ? ssError / dfError : 0;

  const fVal = msError > 0 ? msTreat / msError : 0;
  const pVal = (msError > 0 && typeof jStat !== 'undefined') ? 1 - jStat.centralF.cdf(fVal, dfTreat, dfError) : 1;

  return {
    ssTreat, ssError, ssTotal,
    dfTreat, dfError, dfTotal,
    msTreat, msError,
    fVal, pVal, grandMean,
    cv: grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0
  };
}