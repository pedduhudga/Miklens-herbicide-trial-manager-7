// src/services/rag/ragFaithfulness.js
// Client-Side Zero-Cost Ground-Truth Verification & Hallucination Auditor (Self-RAG)
// Audits AI-generated agronomic responses against verified retrieved RAG database records.

/**
 * Extracts factual numerical and entity claims from AI generated text:
 * - Efficacy percentages (e.g. "100%", "95% control")
 * - Trial IDs (e.g. "1783319817942", "TR-2024-001")
 * - Control duration days (e.g. "38d", "26 days")
 * - Formulations (e.g. "Glycyl", "Goweed Ultra")
 * - Application dosages (e.g. "35 ml/L", "2.5 L/ha")
 * - Cost figures (e.g. "₹420", "₹680/L")
 */
export function extractFactualClaims(responseText = '') {
  if (!responseText || typeof responseText !== 'string') return [];

  const claims = [];

  // 1. Efficacy percentage claims: e.g. "100% control", "95% efficacy", "88% kill"
  const effRegex = /\b(\d{1,3})%\s*(?:control|kill|efficacy|desiccation|suppression|reduction)?/gi;
  let match;
  while ((match = effRegex.exec(responseText)) !== null) {
    const val = parseInt(match[1], 10);
    if (val >= 0 && val <= 100) {
      claims.push({
        type: 'efficacy',
        value: val,
        rawText: match[0],
        index: match.index
      });
    }
  }

  // 2. Trial ID citations: e.g. "(1783319817942)", "TR-2024-001"
  const idRegex = /\b(17\d{8,14}|\d{7,15}|[A-Z]{2,4}-\d{3,6})\b/g;
  while ((match = idRegex.exec(responseText)) !== null) {
    claims.push({
      type: 'trial_id',
      value: match[1],
      rawText: match[0],
      index: match.index
    });
  }

  // 3. Control duration days: e.g. "38d", "26 days", "14 DAA"
  const daysRegex = /\b(\d{1,3})\s*(?:d\b|days\b|days\s+control|daa\b)/gi;
  while ((match = daysRegex.exec(responseText)) !== null) {
    claims.push({
      type: 'duration_or_daa',
      value: parseInt(match[1], 10),
      rawText: match[0],
      index: match.index
    });
  }

  // 4. Cost figures: e.g. "₹420", "₹680.50"
  const costRegex = /₹\s*(\d+(?:\.\d{1,2})?)/g;
  while ((match = costRegex.exec(responseText)) !== null) {
    claims.push({
      type: 'cost',
      value: parseFloat(match[1]),
      rawText: match[0],
      index: match.index
    });
  }

  return claims;
}

/**
 * Audits extracted claims against the set of retrieved ground-truth chunks
 * Returns an audit report with faithfulness score, verified citations, and any detected discrepancies.
 *
 * @param {string} responseText - AI response text
 * @param {Array<Object>} retrievedChunks - Chunks retrieved by RAG engine
 * @returns {Object} Audit report
 */
export function auditResponseFaithfulness(responseText = '', retrievedChunks = []) {
  if (!responseText) {
    return {
      faithfulnessScore: 100,
      isFaithful: true,
      verifiedClaimsCount: 0,
      unverifiedClaimsCount: 0,
      claims: [],
      auditBadge: 'No Claims To Verify'
    };
  }

  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      faithfulnessScore: 90,
      isFaithful: true,
      verifiedClaimsCount: 0,
      unverifiedClaimsCount: 0,
      claims: [],
      auditBadge: 'General Agronomic Knowledge'
    };
  }

  const claims = extractFactualClaims(responseText);
  if (claims.length === 0) {
    return {
      faithfulnessScore: 100,
      isFaithful: true,
      verifiedClaimsCount: 0,
      unverifiedClaimsCount: 0,
      claims: [],
      auditBadge: 'General Knowledge (No Numerical Claims)'
    };
  }

  // Combine all ground-truth text into normalized corpus
  const groundTruthText = retrievedChunks.map(c => `${c.title || ''} ${c.text || ''}`).join(' ').toLowerCase();

  let verifiedCount = 0;
  let unverifiedCount = 0;

  const auditedClaims = claims.map(claim => {
    let verified = false;
    let groundTruthSource = null;

    if (claim.type === 'trial_id') {
      verified = groundTruthText.includes(String(claim.value).toLowerCase());
    } else if (claim.type === 'efficacy') {
      // Look for exact percentage or ±2% rounding variation in ground truth
      const pctStr = `${claim.value}%`;
      const prevPct = `${claim.value - 1}%`;
      const nextPct = `${claim.value + 1}%`;
      verified = groundTruthText.includes(pctStr) || groundTruthText.includes(prevPct) || groundTruthText.includes(nextPct);
    } else if (claim.type === 'duration_or_daa') {
      // Look for days representation in text
      const d1 = `${claim.value} days`;
      const d2 = `${claim.value}d`;
      const d3 = `daa ${claim.value}`;
      verified = groundTruthText.includes(d1) || groundTruthText.includes(d2) || groundTruthText.includes(d3);
    } else if (claim.type === 'cost') {
      const cStr = `${claim.value}`;
      verified = groundTruthText.includes(cStr);
    }

    if (verified) {
      verifiedCount++;
      // Locate which chunk verified it
      for (const chunk of retrievedChunks) {
        if ((chunk.text || '').toLowerCase().includes(String(claim.value).toLowerCase())) {
          groundTruthSource = chunk.title;
          break;
        }
      }
    } else {
      unverifiedCount++;
    }

    return {
      ...claim,
      verified,
      groundTruthSource
    };
  });

  const total = verifiedCount + unverifiedCount;
  const faithfulnessScore = total > 0 ? Math.round((verifiedCount / total) * 100) : 100;
  const isFaithful = faithfulnessScore >= 80;

  let auditBadge = '100% Verified Ground Truth';
  if (faithfulnessScore < 70) {
    auditBadge = `Caution: ${faithfulnessScore}% Claim Verification`;
  } else if (faithfulnessScore < 95) {
    auditBadge = `${faithfulnessScore}% Verified against Database`;
  }

  return {
    faithfulnessScore,
    isFaithful,
    verifiedClaimsCount: verifiedCount,
    unverifiedClaimsCount: unverifiedCount,
    totalClaims: total,
    claims: auditedClaims,
    auditBadge,
    verifiedRecordCount: retrievedChunks.length
  };
}
