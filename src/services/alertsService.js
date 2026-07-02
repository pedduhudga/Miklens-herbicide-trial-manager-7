/**
 * Smart Alerts Service
 * Detects regrowth patterns, efficacy decline, and generates rescue treatment recommendations
 */

import { safeJsonParse } from '../utils/helpers.js';
import { calculateDAA } from '../utils/dateUtils.js';
import { getObservationPrimaryValue } from '../utils/categoryConfig.js';

// Alert types and severity
export const ALERT_TYPES = {
  REGROWTH_DETECTED: 'regrowth',
  EFFICACY_DECLINE: 'efficacy_decline',
  RESCUE_RECOMMENDED: 'rescue_recommended',
  OBSERVATION_DUE: 'observation_due',
  WEATHER_RISK: 'weather_risk',
  TRIAL_INCOMPLETE: 'trial_incomplete',
  CONTROL_CHECK: 'control_check',
  INDUSTRY_NONCOMPLIANCE: 'industry_noncompliance',
};

export const ALERT_SEVERITY = {
  CRITICAL: { level: 4, label: 'Critical', color: 'red' },
  HIGH: { level: 3, label: 'High', color: 'orange' },
  MEDIUM: { level: 2, label: 'Medium', color: 'amber' },
  LOW: { level: 1, label: 'Low', color: 'blue' }
};

/**
 * Detect regrowth pattern in efficacy data
 * Returns true if weed cover increases after initial control
 */
export function detectRegrowthPattern(efficacyData, threshold = 10, category = 'herbicide') {
  if (!Array.isArray(efficacyData) || efficacyData.length < 2) return false;
  
  // Sort by DAA
  const sorted = [...efficacyData].sort((a, b) => {
    const daaA = a.daa || a.daysAfterApplication || 0;
    const daaB = b.daa || b.daysAfterApplication || 0;
    return daaA - daaB;
  });
  
  // Find minimum cover (best control)
  let minCover = 100;
  let minCoverIndex = -1;
  
  sorted.forEach((obs, i) => {
    const cover = getObservationPrimaryValue(category, obs) ?? obs.totalWeedCover ?? obs.cover ?? 100 - (obs.controlPct || obs.wce || 0);
    if (cover < minCover) {
      minCover = cover;
      minCoverIndex = i;
    }
  });
  
  // Check if cover increased significantly after best control
  if (minCoverIndex >= 0 && minCoverIndex < sorted.length - 1) {
    const lastObs = sorted[sorted.length - 1];
    const lastCover = getObservationPrimaryValue(category, lastObs) ?? lastObs.totalWeedCover ?? lastObs.cover ?? 100 - (lastObs.controlPct || lastObs.wce || 0);
    
    // If cover increased by more than threshold after best control
    if (lastCover > minCover + threshold) {
      return {
        detected: true,
        minCover,
        currentCover: lastCover,
        increase: lastCover - minCover,
        daysSinceMin: (lastObs.daa || lastObs.daysAfterApplication || 0) - 
                      (sorted[minCoverIndex].daa || sorted[minCoverIndex].daysAfterApplication || 0)
      };
    }
  }
  
  return { detected: false };
}

/**
 * Detect efficacy decline over time
 * Returns true if control percentage is decreasing
 */
export function detectEfficacyDecline(efficacyData, declineThreshold = 15) {
  if (!Array.isArray(efficacyData) || efficacyData.length < 2) return false;
  
  // Sort by DAA
  const sorted = [...efficacyData].sort((a, b) => {
    const daaA = a.daa || a.daysAfterApplication || 0;
    const daaB = b.daa || b.daysAfterApplication || 0;
    return daaA - daaB;
  });
  
  // Check for declining trend
  const firstObs = sorted[0];
  const lastObs = sorted[sorted.length - 1];
  
  const firstControl = firstObs.controlPct || firstObs.wce || 0;
  const lastControl = lastObs.controlPct || lastObs.wce || 0;
  
  const decline = firstControl - lastControl;
  
  if (decline > declineThreshold) {
    return {
      detected: true,
      initialControl: firstControl,
      currentControl: lastControl,
      decline,
      daysElapsed: (lastObs.daa || 0) - (firstObs.daa || 0)
    };
  }
  
  return { detected: false };
}

/**
 * Check if rescue treatment is recommended
 */
export function checkRescueRecommended(trial, projectTrials = []) {
  const efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
  if (efficacyData.length === 0) return false;
  
  const regrowth = detectRegrowthPattern(efficacyData);
  const decline = detectEfficacyDecline(efficacyData);
  const category = trial.Category || 'herbicide';
  
  // Find control trial for comparison
  const controlTrial = projectTrials.find(t => 
    t.IsControl === true || t.IsControl === 'true'
  );
  
  const controlEfficacy = controlTrial ? 
    safeJsonParse(controlTrial.EfficacyDataJSON, []) : [];
  
  // Get latest efficacy
  const latestEfficacy = efficacyData[efficacyData.length - 1];
  const controlPct = latestEfficacy.controlPct || latestEfficacy.wce || 0;
  
  // Rescue recommended if:
  // 1. Regrowth detected with >20% increase, OR
  // 2. Control efficacy dropped below 60%, OR
  // 3. Significant efficacy decline (>25%) AND last observation >21 DAA
  
  if (regrowth.detected && regrowth.increase > 20) {
    let reason = 'Significant weed regrowth detected';
    if (category === 'fungicide') reason = 'Significant disease progression detected';
    else if (category === 'pesticide') reason = 'Significant pest population resurgence detected';
    else if (category === 'nutrition' || category === 'biostimulant') reason = 'Significant decline in growth metrics';

    return {
      recommended: true,
      reason,
      severity: ALERT_SEVERITY.HIGH,
      details: regrowth,
      recommendedWindow: '7-14 days post-initial application'
    };
  }
  
  if (controlPct < 60) {
    return {
      recommended: true,
      reason: 'Control efficacy below acceptable threshold (60%)',
      severity: ALERT_SEVERITY.CRITICAL,
      details: { controlPct },
      recommendedWindow: 'Immediate - within 48 hours'
    };
  }
  
  if (decline.detected && decline.decline > 25) {
    const lastObs = efficacyData[efficacyData.length - 1];
    const lastDAA = lastObs.daa || lastObs.daysAfterApplication || 0;
    
    if (lastDAA > 21) {
      return {
        recommended: true,
        reason: 'Significant efficacy decline over time',
        severity: ALERT_SEVERITY.HIGH,
        details: decline,
        recommendedWindow: 'Consider follow-up application'
      };
    }
  }
  
  return { recommended: false };
}

/**
 * Check if observation is due
 */
export function checkObservationDue(trial) {
  const efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
  const lastObs = efficacyData[efficacyData.length - 1];
  
  if (!lastObs) {
    // No observations yet - check if trial date is set
    if (trial.Date) {
      const daysSinceApplication = calculateDAA(trial.Date, new Date().toISOString());
      if (daysSinceApplication >= 7) {
        return {
          due: true,
          overdue: daysSinceApplication > 14,
          daysSinceApplication,
          recommendedDAA: 7,
          severity: daysSinceApplication > 14 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM
        };
      }
    }
    return { due: false };
  }
  
  const lastDAA = lastObs.daa || lastObs.daysAfterApplication || 0;
  const trialDate = trial.Date;
  
  if (!trialDate) return { due: false };
  
  const daysSinceApplication = calculateDAA(trialDate, new Date().toISOString());
  const currentDAA = Math.max(daysSinceApplication, lastDAA);
  
  // Standard observation schedule: 7, 14, 21, 28 DAA
  const standardSchedule = [7, 14, 21, 28, 35, 42];
  const nextDueDAA = standardSchedule.find(daa => daa > lastDAA);
  
  if (nextDueDAA && currentDAA >= nextDueDAA) {
    const daysOverdue = currentDAA - nextDueDAA;
    return {
      due: true,
      overdue: daysOverdue > 3,
      lastDAA,
      currentDAA,
      recommendedDAA: nextDueDAA,
      daysOverdue,
      severity: daysOverdue > 7 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM
    };
  }
  
  return { due: false };
}

/**
 * Validate against industry safety standards
 */
export function checkIndustryStandards(trial) {
  const alerts = [];
  const temp = parseFloat(trial.Temperature);
  const wind = parseFloat(trial.Windspeed);

  if (!isNaN(wind) && wind > 15) {
    alerts.push({
      reason: 'Wind speed exceeds 15 km/h, indicating severe drift risk non-compliance.',
      severity: ALERT_SEVERITY.CRITICAL,
      details: { windSpeed: wind }
    });
  }
  if (!isNaN(temp) && temp > 30) {
    alerts.push({
      reason: 'Temperature exceeds 30°C, indicating high volatility non-compliance.',
      severity: ALERT_SEVERITY.HIGH,
      details: { temperature: temp }
    });
  }
  return alerts;
}

/**
 * Generate all alerts for a trial
 */
export function generateTrialAlerts(trial, projectTrials = []) {
  const alerts = [];
  const efficacyData = safeJsonParse(trial.EfficacyDataJSON, []);
  const category = trial.Category || 'herbicide';
  
  // 1. Check for regrowth
  const regrowth = detectRegrowthPattern(efficacyData);
  if (regrowth.detected) {
    let title = 'Weed Regrowth Detected';
    let message = `Weed cover increased by ${regrowth.increase.toFixed(1)}% after initial control`;
    if (category === 'fungicide') {
      title = 'Disease Outbreak Detected';
      message = `Disease severity increased by ${regrowth.increase.toFixed(1)}% after initial control`;
    } else if (category === 'pesticide') {
      title = 'Pest Population Regrowth';
      message = `Pest count increased by ${regrowth.increase.toFixed(1)}% after initial control`;
    } else if (category === 'nutrition' || category === 'biostimulant') {
      title = 'Decline in Growth Performance';
      message = `Metric value declined by ${regrowth.increase.toFixed(1)}% after maximum performance`;
    }

    alerts.push({
      id: `${trial.ID}-regrowth`,
      type: ALERT_TYPES.REGROWTH_DETECTED,
      severity: regrowth.increase > 20 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM,
      title,
      message,
      trialId: trial.ID,
      trialName: trial.FormulationName,
      details: regrowth,
      timestamp: new Date().toISOString(),
      actionable: true,
      actionLabel: 'Add Observation'
    });
  }
  
  // 2. Check for efficacy decline
  const decline = detectEfficacyDecline(efficacyData);
  if (decline.detected && decline.decline > 20) {
    alerts.push({
      id: `${trial.ID}-decline`,
      type: ALERT_TYPES.EFFICACY_DECLINE,
      severity: ALERT_SEVERITY.MEDIUM,
      title: 'Efficacy Declining',
      message: `Control efficacy decreased by ${decline.decline.toFixed(1)}% over ${decline.daysElapsed} days`,
      trialId: trial.ID,
      trialName: trial.FormulationName,
      details: decline,
      timestamp: new Date().toISOString(),
      actionable: true,
      actionLabel: 'View Trend'
    });
  }
  
  // 3. Check for rescue recommendation
  const rescue = checkRescueRecommended(trial, projectTrials);
  if (rescue.recommended) {
    alerts.push({
      id: `${trial.ID}-rescue`,
      type: ALERT_TYPES.RESCUE_RECOMMENDED,
      severity: rescue.severity,
      title: 'Rescue Treatment Recommended',
      message: rescue.reason,
      trialId: trial.ID,
      trialName: trial.FormulationName,
      details: rescue,
      timestamp: new Date().toISOString(),
      actionable: true,
      actionLabel: 'Plan Rescue'
    });
  }
  
  // 4. Check if observation is due
  const obsDue = checkObservationDue(trial);
  if (obsDue.due) {
    alerts.push({
      id: `${trial.ID}-observation`,
      type: ALERT_TYPES.OBSERVATION_DUE,
      severity: obsDue.severity,
      title: obsDue.overdue ? 'Observation Overdue' : 'Observation Due',
      message: obsDue.overdue 
        ? `Observation ${obsDue.daysOverdue} days overdue (target: ${obsDue.recommendedDAA} DAA)`
        : `Observation recommended at ${obsDue.recommendedDAA} DAA`,
      trialId: trial.ID,
      trialName: trial.FormulationName,
      details: obsDue,
      timestamp: new Date().toISOString(),
      actionable: true,
      actionLabel: 'Record Observation'
    });
  }
  
  // 5. Check against industry standards
  const standardAlerts = checkIndustryStandards(trial);
  standardAlerts.forEach((stdAlert, index) => {
    alerts.push({
      id: `${trial.ID}-industry-standard-${index}`,
      type: ALERT_TYPES.INDUSTRY_NONCOMPLIANCE,
      severity: stdAlert.severity,
      title: 'Industry Safety Standard Flag',
      message: stdAlert.reason,
      trialId: trial.ID,
      trialName: trial.FormulationName,
      details: stdAlert.details,
      timestamp: new Date().toISOString(),
      actionable: false
    });
  });

  return alerts;
}

/**
 * Helper to compute average efficacy parameters for a set of replicate trials of a treatment
 */
function getTreatmentAverageEfficacy(trtTrials) {
  const obsByDAA = {};
  
  trtTrials.forEach(t => {
    const efficacyData = safeJsonParse(t.EfficacyDataJSON, []);
    efficacyData.forEach(obs => {
      const daa = obs.daa || obs.daysAfterApplication || 0;
      if (!obsByDAA[daa]) {
        obsByDAA[daa] = [];
      }
      obsByDAA[daa].push(obs);
    });
  });
  
  const avgEfficacy = Object.entries(obsByDAA).map(([daaStr, observations]) => {
    const daa = parseInt(daaStr);
    const count = observations.length;
    
    const sum = {};
    const keys = [
      'controlPct', 'weedCover', 'diseaseSeverity', 'diseaseIncidence', 
      'greenLeafArea', 'plantHealthScore', 'pestCount', 'damageRating', 
      'percentMortality', 'feedingDamagePct', 'yield', 'yieldKgPlot'
    ];
    
    keys.forEach(k => { sum[k] = 0; });
    
    observations.forEach(obs => {
      keys.forEach(k => {
        const val = obs[k] ?? (k === 'controlPct' ? obs.wce : null);
        if (val !== null && !isNaN(val)) {
          sum[k] += parseFloat(val);
        }
      });
    });
    
    const avgObs = { daa };
    keys.forEach(k => {
      avgObs[k] = count > 0 ? sum[k] / count : 0;
    });
    
    return avgObs;
  });
  
  return avgEfficacy.sort((a, b) => a.daa - b.daa);
}

export function checkStagnationAndAnomalies(trial, activeCategory) {
  const alerts = [];
  const observations = safeJsonParse(trial.EfficacyDataJSON, []);
  
  // 1. Check Stagnation
  const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';
  if (!isCompleted && trial.Date) {
    const startDate = new Date(trial.Date);
    const today = new Date();
    const elapsedDays = Math.round((today - startDate) / 86400000);
    
    // Check if trial was started more than 14 days ago
    if (elapsedDays > 14) {
      const postBaselineObs = observations.filter(obs => {
        const daa = obs.daa ?? obs.day ?? obs.DAA ?? 0;
        return daa > 0;
      });
      
      if (postBaselineObs.length === 0) {
        alerts.push({
          id: `${trial.ID}-stagnant`,
          type: 'stagnant',
          severity: ALERT_SEVERITY.HIGH,
          title: 'Trial Stagnation Flag',
          message: `Active trial has no observations recorded for ${elapsedDays} days since start date.`,
          trialId: trial.ID,
          trialName: trial.FormulationName || 'Unknown Formulation',
          timestamp: new Date().toISOString(),
          actionable: true,
          actionLabel: 'Record Observation'
        });
      }
    }
  }
  
  // 2. Check Outliers/Anomalies in Observations
  observations.forEach((obs, idx) => {
    const daa = obs.daa ?? obs.day ?? obs.DAA ?? 0;
    
    // Check efficacy bounds (typically controlPct, wce, etc.)
    const control = obs.controlPct ?? obs.control ?? obs.efficacy ?? null;
    if (control !== null && (control > 100 || control < -100)) {
      alerts.push({
        id: `${trial.ID}-anomaly-efficacy-${idx}`,
        type: 'anomaly',
        severity: ALERT_SEVERITY.HIGH,
        title: 'Data Anomaly: Invalid Efficacy Value',
        message: `Observation at DAA ${daa} has an out-of-bounds efficacy value of ${control}%.`,
        trialId: trial.ID,
        trialName: trial.FormulationName || 'Unknown Formulation',
        timestamp: new Date().toISOString(),
        actionable: true,
        actionLabel: 'Edit Observation'
      });
    }
    
    // Check crop injury bounds
    const injury = obs.cropInjury ?? obs.injury ?? obs.injuryPct ?? null;
    if (injury !== null && (injury > 100 || injury < 0)) {
      alerts.push({
        id: `${trial.ID}-anomaly-injury-${idx}`,
        type: 'anomaly',
        severity: ALERT_SEVERITY.HIGH,
        title: 'Data Anomaly: Invalid Injury Value',
        message: `Observation at DAA ${daa} has an out-of-bounds crop injury value of ${injury}%.`,
        trialId: trial.ID,
        trialName: trial.FormulationName || 'Unknown Formulation',
        timestamp: new Date().toISOString(),
        actionable: true,
        actionLabel: 'Edit Observation'
      });
    }
  });

  return alerts;
}

/**
 * Generate all alerts for all projects/trials, aggregated at treatment level and filtered by active category
 */
export function generateAllAlerts(state) {
  const alerts = [];
  const { trials = [], projects = [] } = state;
  
  if (!trials || trials.length === 0) return [];
  
  const activeCategory = state.activeCategory || 'herbicide';
  
  // 1. Filter trials by the active category
  const categoryTrials = trials.filter(t => t.Category === activeCategory || (!t.Category && activeCategory === 'herbicide'));
  
  // 1b. Check for stagnant trials and data anomalies on individual trials
  categoryTrials.forEach(t => {
    const individualAlerts = checkStagnationAndAnomalies(t, activeCategory);
    alerts.push(...individualAlerts);
  });
  
  // 2. Group trials by ProjectID
  const trialsByProject = {};
  categoryTrials.forEach(t => {
    const pid = t.ProjectID || 'no-project';
    if (!trialsByProject[pid]) trialsByProject[pid] = [];
    trialsByProject[pid].push(t);
  });
  
  // 3. For each project, aggregate trials by formulation (Treatment level)
  Object.entries(trialsByProject).forEach(([projectId, projTrials]) => {
    const trialsByTrt = {};
    projTrials.forEach(t => {
      const trt = t.FormulationName || 'Untreated Control';
      if (!trialsByTrt[trt]) trialsByTrt[trt] = [];
      trialsByTrt[trt].push(t);
    });
    
    const virtualTrials = [];
    Object.entries(trialsByTrt).forEach(([trtName, trtTrials]) => {
      if (trtTrials.length === 0) return;
      
      const avgEfficacy = getTreatmentAverageEfficacy(trtTrials);
      const isControl = trtTrials.some(t => 
        t.IsControl === true || 
        t.IsControl === 'true' || 
        t.FormulationName?.toLowerCase().includes('control') || 
        t.FormulationName?.toLowerCase().includes('untreated')
      );
      
      const repTrial = trtTrials[0];
      
      virtualTrials.push({
        ID: repTrial.ID,
        FormulationName: trtName,
        ProjectID: projectId,
        Category: activeCategory,
        Date: repTrial.Date,
        Temperature: repTrial.Temperature,
        Windspeed: repTrial.Windspeed,
        EfficacyDataJSON: JSON.stringify(avgEfficacy),
        IsControl: isControl,
        replicateCount: trtTrials.length
      });
    });
    
    // Generate alerts for each virtual aggregated trial
    virtualTrials.forEach(vTrial => {
      const trialAlerts = generateTrialAlerts(vTrial, virtualTrials);
      
      trialAlerts.forEach(alert => {
        if (alert.message && vTrial.replicateCount > 1) {
          alert.message = `${alert.message} (Avg of ${vTrial.replicateCount} replicates)`;
        }
      });
      
      alerts.push(...trialAlerts);
    });
  });
  
  // Sort by severity (critical first) then timestamp
  alerts.sort((a, b) => {
    const severityDiff = b.severity.level - a.severity.level;
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  
  return alerts;
}

/**
 * Get alert counts by severity
 */
export function getAlertCounts(alerts) {
  return {
    total: alerts.length,
    critical: alerts.filter(a => a.severity.level === 4).length,
    high: alerts.filter(a => a.severity.level === 3).length,
    medium: alerts.filter(a => a.severity.level === 2).length,
    low: alerts.filter(a => a.severity.level === 1).length
  };
}

// Window exports
if (typeof window !== 'undefined') {
  window.detectRegrowthPattern = detectRegrowthPattern;
  window.detectEfficacyDecline = detectEfficacyDecline;
  window.checkRescueRecommended = checkRescueRecommended;
  window.generateTrialAlerts = generateTrialAlerts;
  window.generateAllAlerts = generateAllAlerts;
}

export default {
  detectRegrowthPattern,
  detectEfficacyDecline,
  checkRescueRecommended,
  checkObservationDue,
  generateTrialAlerts,
  generateAllAlerts,
  getAlertCounts,
  ALERT_TYPES,
  ALERT_SEVERITY
};
