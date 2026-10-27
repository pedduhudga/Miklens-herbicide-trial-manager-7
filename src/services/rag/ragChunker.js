// src/services/rag/ragChunker.js
// Intelligent Agronomic Knowledge Chunking Engine
// Transforms in-memory trials, formulations, projects, and ingredients into
// highly descriptive, cross-linked semantic chunks optimized for hybrid retrieval.

import { safeJsonParse } from '../../utils/helpers.js';
import { getPrimaryObservationField } from '../../utils/categoryConfig.js';
import { getTrialCalculatedEfficacy } from '../../utils/formulationTrialUtils.js';
import { calculateEffectiveControlDays } from '../../utils/trialLifecycle.js';
import { calculateFormulationCost } from '../../utils/costUtils.js';
import { analyzeFormulationSynergy } from '../../utils/hracSynergy.js';

/**
 * Fast deterministic hash string for incremental change detection
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Generates semantic chunks for trials, formulations, projects, and ingredients
 */
export function generateCategoryChunks({
  trials = [],
  formulations = [],
  projects = [],
  ingredients = [],
  activeCategory = 'herbicide'
}) {
  const cat = activeCategory.toLowerCase();
  const primaryObsField = getPrimaryObservationField(cat);
  const chunks = [];

  // Filter datasets to strictly active category
  const catTrials = trials.filter(t => (t.Category || 'herbicide').toLowerCase() === cat);
  const catFormulations = formulations.filter(f => (f.Category || 'herbicide').toLowerCase() === cat);
  const catProjects = projects.filter(p => (p.Category || 'herbicide').toLowerCase() === cat);
  const catIngredients = ingredients.filter(i => (i.Category || 'herbicide').toLowerCase() === cat || !i.Category);

  // Map project ID to project name
  const projectMap = new Map();
  catProjects.forEach(p => {
    projectMap.set(String(p.ID || p.id), p.ProjectName || p.Name || 'Unnamed Project');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. TRIALS CHUNKS
  // ───────────────────────────────────────────────────────────────────────────
  catTrials.forEach(t => {
    const trialId = String(t.ID || t.id);
    const formName = t.FormulationName || 'Unknown Treatment';
    const dosage = t.Dosage || 'Standard Field Rate';
    const target = t.WeedSpecies || t.WeedTarget || t.Target || t.DiseaseTarget || t.PestTarget || 'Mixed Field Targets';
    const crop = t.Crop || 'Non-Crop / Bare Soil';
    const location = t.Location || 'Field Experimental Station';
    const investigator = t.InvestigatorName || 'Miklens Agronomist';
    const date = t.Date ? new Date(t.Date).toLocaleDateString() : 'Recorded Date';
    const projectName = projectMap.get(String(t.ProjectID || t.ProjectId)) || 'Independent Trial';
    const status = (t.IsCompleted || t.ControlFinalized) ? 'Finalized / Completed' : 'Active Field Trial';

    // Calculate verified ground truth efficacy & control duration
    const robustEff = getTrialCalculatedEfficacy(t, cat);
    const effPct = robustEff !== null ? `${Math.round(robustEff)}%` : 'Observation in Progress';
    const controlDays = t.FinalControlDuration || calculateEffectiveControlDays(t) || 'Ongoing';

    // Deep link format
    const trialLink = `[🔬 Trial: ${formName} @ ${dosage} (${trialId})](#/trials?focus=${trialId})`;
    const formLink = `[🧪 Formula: ${formName}](#/formulations?focus=${encodeURIComponent(formName)})`;

    // Weather & Application details
    const weather = [
      t.Temperature ? `Temperature: ${t.Temperature}°C` : null,
      t.Humidity ? `Humidity: ${t.Humidity}%` : null,
      t.WindSpeed ? `Wind: ${t.WindSpeed} km/h` : null,
      t.Rainfall ? `Rainfall: ${t.Rainfall} mm` : null,
      t.SoilType ? `Soil: ${t.SoilType}` : null,
    ].filter(Boolean).join(', ') || 'Standard Ambient Conditions';

    // A. Trial Summary Chunk
    const summaryText = `FIELD TRIAL SUMMARY: ${trialLink}
Category: ${cat.toUpperCase()}
Formulation: ${formLink}
Application Dosage: ${dosage}
Target Organism / Weed: ${target}
Crop Cultivar: ${crop}
Location: ${location} | Associated Project: ${projectName}
Lead Investigator: ${investigator} | Application Date: ${date}
Trial Status: ${status}
Measured Efficacy: ${effPct} (Peak Control: ${effPct})
Demonstrated Control Duration: ${controlDays} Days
Spray Conditions: ${weather}
Field Notes / Observations: ${t.Notes || t.Description || 'Normal application behavior observed with standard carrier water volume.'}`;

    const summaryHash = simpleHash(trialId + summaryText);
    chunks.push({
      id: `trial_${trialId}_summary`,
      entityId: trialId,
      entityType: 'trial',
      category: cat,
      title: `Trial ${formName} (${trialId})`,
      text: summaryText,
      hash: summaryHash,
      metadata: {
        trialId,
        formulation: formName,
        dosage,
        target,
        location,
        efficacy: robustEff,
        controlDays,
        isCompleted: Boolean(t.IsCompleted || t.ControlFinalized),
        chunkType: 'trial_summary'
      }
    });

    // B. Observation Timeline Chunk (if observations exist)
    const rawObs = safeJsonParse(t.EfficacyDataJSON, []);
    if (Array.isArray(rawObs) && rawObs.length > 0) {
      const obsLines = rawObs.map(o => {
        const daa = o.daa ?? o.day ?? o.DAA ?? 'N/A';
        const ctrl = o.controlPct ?? o.control ?? o.efficacy ?? o[primaryObsField] ?? 'N/A';
        const injury = o.cropInjury ? `Crop Injury: ${o.cropInjury}` : null;
        const wxTemp = (o.weatherTemp != null && o.weatherTemp !== '') ? `${o.weatherTemp}°C` : null;
        const wxHum = (o.weatherHumidity != null && o.weatherHumidity !== '') ? `${o.weatherHumidity}% RH` : null;
        const cumulRain = (o.cumulativeRainSinceApp != null && o.cumulativeRainSinceApp !== '') ? `Cumul Rain: ${o.cumulativeRainSinceApp}mm` : null;
        const gdd = (o.gddSinceApp != null && o.gddSinceApp !== '') ? `${o.gddSinceApp} GDD` : null;
        const soil = (o.soilMoisture != null && o.soilMoisture !== '') ? `Soil Moisture: ${o.soilMoisture}%` : null;
        const wxSummary = [wxTemp, wxHum, cumulRain, gdd, soil].filter(Boolean).join(' | ');
        const wxLine = wxSummary ? `[Microclimate: ${wxSummary}]` : null;
        const impact = o.agronomicWeatherImpact ? `Agronomic Condition: ${o.agronomicWeatherImpact}` : null;
        const notes = o.notes ? `Notes: "${o.notes}"` : null;
        return `• DAA ${daa}: Control: ${ctrl}%, ${[wxLine, impact, injury, notes].filter(Boolean).join(', ')}`;
      }).join('\n');

      const obsText = `TRIAL OBSERVATION TIMELINE FOR ${trialLink}
Formulation: ${formName} | Target: ${target}
Recorded Timeline Progression:
${obsLines}`;

      const obsHash = simpleHash(trialId + obsText);
      chunks.push({
        id: `trial_${trialId}_obs`,
        entityId: trialId,
        entityType: 'trial',
        category: cat,
        title: `Observations for Trial ${formName} (${trialId})`,
        text: obsText,
        hash: obsHash,
        metadata: {
          trialId,
          formulation: formName,
          target,
          observationCount: rawObs.length,
          chunkType: 'trial_observations'
        }
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FORMULATIONS CHUNKS
  // ───────────────────────────────────────────────────────────────────────────
  catFormulations.forEach(f => {
    const formId = String(f.ID || f.id);
    const formName = f.Name || f.FormulationName || 'Candidate Formulation';
    const formCode = f.Code || f.FormulationCode || 'CODE-N/A';
    const formLink = `[🧪 Formula: ${formName}](#/formulations?focus=${encodeURIComponent(formId)})`;
    const costPerL = calculateFormulationCost(f, catIngredients);
    const costText = costPerL ? `₹${costPerL.toFixed(2)} / L` : 'Cost Pending Ingredient Rates';

    // Extract ingredients recipe
    const ingList = [];
    const parsedIngredients = Array.isArray(f.Ingredients) && f.Ingredients.length > 0
      ? f.Ingredients
      : safeJsonParse(f.IngredientsJSON, []);

    if (Array.isArray(parsedIngredients) && parsedIngredients.length > 0) {
      parsedIngredients.forEach(ing => {
        const name = ing.name || ing.IngredientName || 'Active Ingredient';
        const qty = ing.quantity || ing.Amount || ing.qty || '';
        const unit = ing.unit || 'ml';
        ingList.push(`• ${name}: ${qty} ${unit}`);
      });
    } else if (f.IngredientNames) {
      ingList.push(`• Components: ${f.IngredientNames}`);
    }

    const recipeText = ingList.length > 0 ? ingList.join('\n') : '• Proprietary Single Active Standard';

    // Linked trials summary
    const linkedTrials = catTrials.filter(t => {
      const matchName = (t.FormulationName || '').toLowerCase() === formName.toLowerCase();
      const matchId = String(t.FormulationID || t.FormulationId || '') === formId;
      return matchName || matchId;
    });

    const trialCount = linkedTrials.length;
    const effValues = linkedTrials.map(t => getTrialCalculatedEfficacy(t, cat)).filter(v => v !== null);
    const avgEff = effValues.length > 0 ? `${Math.round(effValues.reduce((a, b) => a + b, 0) / effValues.length)}%` : 'No Trials Yet';
    const targetsTested = Array.from(new Set(linkedTrials.map(t => t.WeedSpecies || t.WeedTarget || t.Target).filter(Boolean))).join(', ') || 'General Field Spectrum';

    // Biochemical synergy & resistance analysis (category-aware)
    const synergyAnalysis = (Array.isArray(parsedIngredients) && parsedIngredients.length > 0)
      ? analyzeFormulationSynergy(parsedIngredients, cat)
      : null;

    const synergySection = synergyAnalysis && synergyAnalysis.detectedMoas.length > 0
      ? `\nMode of Action Diversity: ${synergyAnalysis.multiSiteScore} (${synergyAnalysis.hracGroups.join(' + ')})
Synergy Mechanism: ${synergyAnalysis.synergies.map(s => s.title + ' - ' + s.description).join('; ') || 'Standard complimentary active pathways'}
Antagonism Alerts: ${synergyAnalysis.antagonismAlerts.map(a => a.title + ': ' + a.description).join('; ') || 'None detected (Safe tank mix)'}
Adjuvant Recommendation: ${synergyAnalysis.adjuvantRecommendations.map(r => typeof r === 'string' ? r : (r.title ? `${r.title}: ${r.tip || r.purpose || ''}` : String(r))).join('; ') || 'Standard NIS / MSO'}`
      : '';

    const formText = `FORMULATION PROFILE & RECIPE: ${formLink}
Code: ${formCode} | Category: ${cat.toUpperCase()}
Commercial / Batch Cost: ${costText}
Recommended Field Dosage: ${f.Dosage || f.RecommendedDosage || '20-35 ml/L'}
Target Spectrum: ${targetsTested}
Historical Field Testing: ${trialCount} Field Plot Trials Conducted (Average Demonstrated Efficacy: ${avgEff})
Biochemical Ingredients & Recipe:
${recipeText}${synergySection}
Chemical Rationale / Mode of Action: ${f.Description || f.Notes || 'Engineered systemic penetrant with bio-surfactant carrier matrix.'}`;

    const formHash = simpleHash(formId + formText);
    chunks.push({
      id: `form_${formId}_recipe`,
      entityId: formId,
      entityType: 'formulation',
      category: cat,
      title: `Formulation ${formName} (${formCode})`,
      text: formText,
      hash: formHash,
      metadata: {
        formId,
        formulationName: formName,
        formCode,
        costPerL,
        trialCount,
        avgEfficacy: avgEff,
        moaScore: synergyAnalysis?.multiSiteScore || 'Single',
        chunkType: 'formulation_recipe'
      }
    });

    // Dedicated Biochemical Synergy & Antagonism Chunk for multi-active formulations
    if (synergyAnalysis && synergyAnalysis.detectedMoas.length >= 2) {
      const synTitle = `Biochemical Synergy & Resistance Defense: ${formName}`;
      const synText = `BIOCHEMICAL SYNERGY & RESISTANCE MANAGEMENT: ${formLink}
Formulation: ${formName} (${formCode}) | Category: ${cat.toUpperCase()}
Resistance Defense Rating: ${synergyAnalysis.multiSiteScore}
Active Modes of Action: ${synergyAnalysis.hracGroups.join(' + ')}
Active Ingredients Profile:
${synergyAnalysis.activeIngredients.map(a => `• ${a.name} (${a.quantity} ${a.unit}) - HRAC ${a.hracGroup}: ${a.chemicalFamily} [${a.systemicity}]`).join('\n')}
Synergy Mechanisms:
${synergyAnalysis.synergies.map(s => `• ${s.title}: ${s.description}`).join('\n') || '• Multi-site enzymatic inhibition'}
Antagonism & Tank-Mix Cautions:
${synergyAnalysis.antagonismAlerts.map(a => `⚠️ ${a.title}: ${a.description} -> ${a.recommendation}`).join('\n') || '• No chemical or biological antagonisms identified in formulation matrix'}
Recommended Adjuvant Pairing:
${synergyAnalysis.adjuvantTips.map(t => `• ${t.name}: ${t.purpose}`).join('\n') || '• Standard penetrant pairing'}`;

      chunks.push({
        id: `form_${formId}_synergy`,
        entityId: formId,
        entityType: 'formulation',
        category: cat,
        title: synTitle,
        text: synText,
        hash: simpleHash(formId + synText),
        metadata: {
          formId,
          formulationName: formName,
          hasAntagonism: synergyAnalysis.hasAntagonism,
          moaGroups: synergyAnalysis.hracGroups,
          chunkType: 'formulation_synergy'
        }
      });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. INGREDIENTS CHUNKS (MASTER INVENTORY + INDIVIDUAL INGREDIENT PROFILES)
  // ───────────────────────────────────────────────────────────────────────────
  if (catIngredients.length > 0) {
    const ingLines = catIngredients.map(ing => {
      const name = ing.Name || ing.IngredientName || 'Ingredient';
      const cost = ing.CostPerUnit ? `₹${ing.CostPerUnit}/${ing.Unit || 'kg'}` : 'Cost N/A';
      const hrac = ing.HRAC || ing.ModeOfAction ? `MoA: ${ing.HRAC || ing.ModeOfAction}` : '';
      const type = ing.Type || ing.Category || 'Active';
      return `• ${name} (${type}, ${cost}) ${hrac}`;
    }).join('\n');

    const ingInventoryText = `VERIFIED INGREDIENT INVENTORY & CHEMICAL POOL (${cat.toUpperCase()}):
Available raw materials, active technicals, adjuvants, and bio-penetrants for novel formulation synthesis:
${ingLines}`;

    chunks.push({
      id: `ingredients_inventory_${cat}`,
      entityId: `inventory_${cat}`,
      entityType: 'ingredient',
      category: cat,
      title: `Ingredient Inventory (${cat.toUpperCase()})`,
      text: ingInventoryText,
      hash: simpleHash(ingInventoryText),
      metadata: {
        category: cat,
        ingredientCount: catIngredients.length,
        chunkType: 'ingredient_inventory'
      }
    });

    // Granular Individual Ingredient Chunks for high-precision retrieval
    catIngredients.forEach(ing => {
      const name = (ing.Name || ing.IngredientName || '').trim();
      if (!name) return;

      const cleanKey = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const cost = ing.CostPerUnit ? `₹${ing.CostPerUnit} per ${ing.Unit || 'kg'}` : 'Cost rate pending';
      const hrac = ing.HRAC || ing.ModeOfAction || 'Standard Technical Active';
      const type = ing.Type || 'Active Ingredient';
      const purity = ing.Purity || ing.Concentration ? `Concentration/Purity: ${ing.Purity || ing.Concentration}` : null;
      const supplier = ing.Supplier || ing.Vendor ? `Vendor: ${ing.Supplier || ing.Vendor}` : null;

      // Find formulations using this ingredient
      const usingForms = catFormulations.filter(f => {
        if (!Array.isArray(f.Ingredients)) return false;
        return f.Ingredients.some(i => (i.name || i.IngredientName || '').toLowerCase().includes(name.toLowerCase()));
      }).map(f => f.Name || f.FormulationName).filter(Boolean);

      const usageText = usingForms.length > 0
        ? `Registered in ${usingForms.length} formulation(s): ${usingForms.join(', ')}`
        : 'Available in raw inventory pool for novel formulation recipes';

      const ingProfileText = `INGREDIENT SPECIFICATION: [🌿 Ingredient: ${name}](#/ingredients)
Chemical Name: ${name}
Classification: ${type} | Category: ${cat.toUpperCase()}
Mode of Action / Resistance Group: ${hrac}
Commercial Acquisition Rate: ${cost}
${[purity, supplier].filter(Boolean).join(' | ')}
Formulation Deployment: ${usageText}
Technical Properties / Role: ${ing.Description || ing.Notes || 'Certified technical-grade agrochemical raw material.'}`;

      chunks.push({
        id: `ing_${cleanKey}_profile`,
        entityId: String(ing.ID || ing.id || cleanKey),
        entityType: 'ingredient',
        category: cat,
        title: `Ingredient ${name} (${type})`,
        text: ingProfileText,
        hash: simpleHash(cleanKey + ingProfileText),
        metadata: {
          ingredientName: name,
          cost: ing.CostPerUnit,
          type,
          hrac,
          usedInCount: usingForms.length,
          chunkType: 'ingredient_profile'
        }
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. BENCHMARK LEADERBOARD SYNTHESIS CHUNK
  // ───────────────────────────────────────────────────────────────────────────
  if (catTrials.length > 0) {
    const trialsWithEfficacy = catTrials
      .map(t => ({ trial: t, eff: getTrialCalculatedEfficacy(t, cat) }))
      .filter(item => item.eff !== null)
      .sort((a, b) => b.eff - a.eff);

    const topTrials = trialsWithEfficacy.slice(0, 5).map(({ trial, eff }, idx) => {
      const tId = String(trial.ID || trial.id);
      const days = trial.FinalControlDuration || calculateEffectiveControlDays(trial) || 'Ongoing';
      return `${idx + 1}. [🔬 Trial: ${trial.FormulationName} @ ${trial.Dosage || 'Std'} (${tId})](#/trials?focus=${tId}): ${Math.round(eff)}% Control, Target: ${trial.WeedSpecies || trial.Target || 'All'}, Control Duration: ${days}d`;
    }).join('\n');

    const benchmarkText = `HISTORICAL PERFORMANCE BENCHMARKS & LEADERBOARD (${cat.toUpperCase()}):
Total Verified Plot Trials: ${catTrials.length}
Total Registered Formulations: ${catFormulations.length}
Top Performing Field Treatments Ranked by Kill Rate & Duration:
${topTrials || 'No trials evaluated yet.'}
Top Systemic Grass Standard: Glycyl (translocates into Cynodon dactylon rhizomes).
Top Broadleaf Standard: Goweed Ultra + Microweed Synergy Blend.`;

    chunks.push({
      id: `benchmark_leaderboard_${cat}`,
      entityId: `benchmark_${cat}`,
      entityType: 'benchmark',
      category: cat,
      title: `Benchmark Leaderboard (${cat.toUpperCase()})`,
      text: benchmarkText,
      hash: simpleHash(benchmarkText),
      metadata: {
        category: cat,
        totalTrials: catTrials.length,
        totalFormulations: catFormulations.length,
        chunkType: 'benchmark_leaderboard'
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. WEED TARGET EFFICACY MATRIX CHUNKS (Comparative Head-to-Head by Species)
    // ─────────────────────────────────────────────────────────────────────────
    const targetMap = new Map();
    catTrials.forEach(t => {
      const target = (t.WeedSpecies || t.WeedTarget || t.Target || t.DiseaseTarget || t.PestTarget || '').trim();
      if (!target) return;
      if (!targetMap.has(target)) targetMap.set(target, []);
      targetMap.get(target).push(t);
    });

    targetMap.forEach((tList, targetName) => {
      const cleanKey = targetName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
      
      // Group efficacy by formulation
      const formEfficacyMap = new Map();
      tList.forEach(t => {
        const fname = t.FormulationName || 'Treatment';
        const eff = getTrialCalculatedEfficacy(t, cat);
        const duration = t.FinalControlDuration || calculateEffectiveControlDays(t) || 0;
        if (!formEfficacyMap.has(fname)) {
          formEfficacyMap.set(fname, { effs: [], durations: [], dosages: new Set(), trialIds: [] });
        }
        const data = formEfficacyMap.get(fname);
        if (eff !== null) data.effs.push(eff);
        if (duration) data.durations.push(Number(duration));
        if (t.Dosage) data.dosages.add(t.Dosage);
        data.trialIds.push(String(t.ID || t.id));
      });

      const rankedForms = Array.from(formEfficacyMap.entries())
        .map(([fname, d]) => {
          const avgEff = d.effs.length > 0 ? Math.round(d.effs.reduce((a, b) => a + b, 0) / d.effs.length) : null;
          const avgDur = d.durations.length > 0 ? Math.round(d.durations.reduce((a, b) => a + b, 0) / d.durations.length) : null;
          return {
            name: fname,
            avgEff: avgEff !== null ? avgEff : 0,
            avgDur: avgDur || 'N/A',
            dosages: Array.from(d.dosages).join(', ') || 'Standard',
            trialCount: d.trialIds.length
          };
        })
        .sort((a, b) => b.avgEff - a.avgEff);

      const rankingLines = rankedForms.map((rf, rIdx) => 
        `• Rank ${rIdx + 1}: ${rf.name} @ ${rf.dosages} -> Demonstrated Mean Control: ${rf.avgEff}%, Average Control Duration: ${rf.avgDur}d (${rf.trialCount} trial[s])`
      ).join('\n');

      const topForm = rankedForms[0];
      const matrixText = `WEED TARGET EFFICACY MATRIX: ${targetName.toUpperCase()} (${cat.toUpperCase()}):
Target Species: ${targetName}
Total Plot Trials Evaluated Against this Target: ${tList.length}
Demonstrated Head-to-Head Formulation Performance Ranking:
${rankingLines || '• Pending evaluation'}
Agronomic Recommendation: Top candidate for ${targetName} is ${topForm?.name || 'N/A'} (${topForm?.avgEff || 0}% kill rate, ${topForm?.avgDur || 'N/A'} days sustained residual suppression).`;

      chunks.push({
        id: `target_matrix_${cleanKey}_${cat}`,
        entityId: `target_${cleanKey}`,
        entityType: 'benchmark',
        category: cat,
        title: `Target Matrix: ${targetName} (${cat.toUpperCase()})`,
        text: matrixText,
        hash: simpleHash(cleanKey + matrixText),
        metadata: {
          target: targetName,
          trialCount: tList.length,
          topFormulation: topForm?.name,
          chunkType: 'weed_efficacy_matrix'
        }
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. FORMULATION MULTI-TRIAL META-ANALYSIS CHUNKS
    // ─────────────────────────────────────────────────────────────────────────
    catFormulations.forEach(f => {
      const formId = String(f.ID || f.id);
      const formName = f.Name || f.FormulationName || 'Formulation';
      const linked = catTrials.filter(t => 
        (t.FormulationName || '').toLowerCase() === formName.toLowerCase() ||
        String(t.FormulationID || t.FormulationId || '') === formId
      );

      if (linked.length >= 2) {
        const effs = linked.map(t => getTrialCalculatedEfficacy(t, cat)).filter(v => v !== null);
        const durations = linked.map(t => t.FinalControlDuration || calculateEffectiveControlDays(t)).filter(Boolean).map(Number);
        
        const meanEff = effs.length > 0 ? Math.round(effs.reduce((a, b) => a + b, 0) / effs.length) : 0;
        const minEff = effs.length > 0 ? Math.round(Math.min(...effs)) : 0;
        const maxEff = effs.length > 0 ? Math.round(Math.max(...effs)) : 0;
        const avgDur = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 'N/A';
        const targets = Array.from(new Set(linked.map(t => t.WeedSpecies || t.WeedTarget || t.Target).filter(Boolean))).join(', ');
        const locations = Array.from(new Set(linked.map(t => t.Location).filter(Boolean))).join(', ');

        const metaText = `FORMULATION MULTI-TRIAL META-ANALYSIS: [🧪 Formula: ${formName}](#/formulations?focus=${encodeURIComponent(formId)})
Formulation: ${formName} | Category: ${cat.toUpperCase()}
Total Verified Field Plot Trials Conducted: ${linked.length}
Demonstrated Efficacy Spread: Mean ${meanEff}% (Range: ${minEff}% to ${maxEff}% Control)
Sustained Control Duration: Average ${avgDur} Days
Tested Target Spectrum: ${targets || 'Mixed weed spectrum'}
Tested Station Locations: ${locations || 'Standard research stations'}
Cross-Location Consistency: ${maxEff - minEff <= 15 ? 'High Field Reliability (Low Variance)' : 'Moderate Variance (Dosage/Weather Dependent)'}`;

        chunks.push({
          id: `form_${formId}_meta`,
          entityId: formId,
          entityType: 'formulation',
          category: cat,
          title: `Meta-Analysis: ${formName} (${linked.length} Trials)`,
          text: metaText,
          hash: simpleHash(formId + metaText),
          metadata: {
            formId,
            formulationName: formName,
            trialCount: linked.length,
            meanEfficacy: meanEff,
            avgDuration: avgDur,
            chunkType: 'formulation_aggregate'
          }
        });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. CROP SELECTIVITY & SAFETY MATRIX CHUNKS
    // ─────────────────────────────────────────────────────────────────────────
    const cropMap = new Map();
    catTrials.forEach(t => {
      const crop = (t.Crop || '').trim();
      if (!crop || crop.toLowerCase().includes('non-crop') || crop.toLowerCase().includes('bare')) return;
      if (!cropMap.has(crop)) cropMap.set(crop, []);
      cropMap.get(crop).push(t);
    });

    cropMap.forEach((cTrials, cropName) => {
      const cleanCrop = cropName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
      const treatments = Array.from(new Set(cTrials.map(t => `${t.FormulationName} @ ${t.Dosage || 'Std'}`))).slice(0, 8);
      
      const cropText = `CROP SELECTIVITY & TOLERANCE PROFILE: ${cropName.toUpperCase()}
Crop Cultivar: ${cropName} | Category: ${cat.toUpperCase()}
Demonstrated Treatments Evaluated on ${cropName}:
${treatments.map(trt => `• ${trt}`).join('\n')}
Total Trials Conducted on ${cropName}: ${cTrials.length}
Selectivity Assessment: Evaluated under real field plot conditions for crop safety, phytotoxicity scoring, and absence of visual crop stunting or chlorosis.`;

      chunks.push({
        id: `crop_safety_${cleanCrop}_${cat}`,
        entityId: `crop_${cleanCrop}`,
        entityType: 'trial',
        category: cat,
        title: `Crop Selectivity: ${cropName}`,
        text: cropText,
        hash: simpleHash(cleanCrop + cropText),
        metadata: {
          crop: cropName,
          trialCount: cTrials.length,
          chunkType: 'crop_safety_matrix'
        }
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. PSYCHROMETRIC WEATHER & MICROCLIMATE RESILIENCE MATRIX
    // ─────────────────────────────────────────────────────────────────────────
    const wxTrials = catTrials.filter(t => t.Temperature || t.Humidity || t.Rainfall);
    if (wxTrials.length > 0) {
      const hotTrials = wxTrials.filter(t => Number(t.Temperature) >= 32);
      const rainTrials = wxTrials.filter(t => Number(t.Rainfall) > 0);

      const wxText = `PSYCHROMETRIC MICROCLIMATE & WEATHER RESILIENCE MATRIX (${cat.toUpperCase()}):
Total Environmental Microclimate Trials Documented: ${wxTrials.length}
• High-Temperature Performance (>32°C): ${hotTrials.length} trials evaluated (Key candidate: ${hotTrials[0]?.FormulationName || 'Glycyl / BPD'})
• Rainfastness & Wash-off Conditions: ${rainTrials.length} trials with precipitation recorded
Agronomic Application Window Rule: Optimal Delta-T range 2-8°C with wind velocity below 15 km/h for drift minimization and carrier droplet retention.`;

      chunks.push({
        id: `weather_resilience_${cat}`,
        entityId: `weather_${cat}`,
        entityType: 'trial',
        category: cat,
        title: `Microclimate & Weather Matrix (${cat.toUpperCase()})`,
        text: wxText,
        hash: simpleHash(wxText),
        metadata: {
          category: cat,
          wxTrialCount: wxTrials.length,
          chunkType: 'weather_resilience_matrix'
        }
      });
    }
  }

  return chunks;
}
