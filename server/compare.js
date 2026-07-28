/**
 * Compares two test suite runs and identifies changes in test statuses.
 * Used to determine if a PR introduces regressions.
 */

import { normalizeStatus, CANONICAL_STATUSES } from './displayMappings.js';

const { PASSED, FAILED, INTENDED, NOT_TESTED } = CANONICAL_STATUSES;

/**
 * Helper to match status transitions
 * @param {string} testName - Name of the test
 * @param {string} newStatus - New status string (already normalized)
 * @param {string} oldStatusKey - Short key for old status (p, f, i, n)
 * @param {Object} results - Results object to update
 */
function matchStatus(testName, newStatus, oldStatusKey, results) {
  switch (newStatus) {
    case PASSED:
      results[`${oldStatusKey}ToP`].push(testName);
      break;
    case INTENDED:
      results[`${oldStatusKey}ToI`].push(testName);
      break;
    case FAILED:
      results[`${oldStatusKey}ToF`].push(testName);
      break;
    case NOT_TESTED:
      results[`${oldStatusKey}ToN`].push(testName);
      break;
  }
}

/**
 * Compare two test suite runs
 * 
 * @param {Object} latestResult - Current/new test results JSON
 * @param {Object} olderResult - Previous/baseline test results JSON (e.g., master)
 * @returns {Object} Comparison results with changes categorized
 */
export function compareTestRuns(latestResult, olderResult) {
  latestResult = latestResult || {};
  olderResult = olderResult || {};

  const allKeys = new Set([...Object.keys(latestResult), ...Object.keys(olderResult)]);

  // Initialize results structure
  // olderResult to latestResult. Example pToF: olderResult: Passed to latestResult: Failed
  const results = {
    isMergeable: false,
    hasChanges: false,
    // Status transitions
    pToF: [],  // Passed -> Failed
    pToI: [],  // Passed -> Intended
    pToN: [],  // Passed -> Not Tested
    fToP: [],  // Failed -> Passed
    fToI: [],  // Failed -> Intended
    fToN: [],  // Failed -> Not Tested
    iToP: [],  // Intended -> Passed
    iToF: [],  // Intended -> Failed
    iToN: [],  // Intended -> Not Tested
    nToP: [],  // Not Tested -> Passed
    nToF: [],  // Not Tested -> Failed
    nToI: [],  // Not Tested -> Intended
    // Added/removed tests
    addedN: [],
    addedI: [],
    addedF: [],
    addedP: [],
    deleted: [],
    // Status counts for latest result
    n: 0,  // Not Tested count
    p: 0,  // Passed count
    i: 0,  // Intended count
    f: 0   // Failed count
  };

  for (const key of allKeys) {
    if (key === 'info') continue;

    const latestStatus = latestResult[key]?.status ? normalizeStatus(latestResult[key].status) : null;
    const olderStatus = olderResult[key]?.status ? normalizeStatus(olderResult[key].status) : null;

    if (latestStatus) {
      switch (latestStatus) {
        case PASSED:
          results.p += 1;
          break;
        case INTENDED:
          results.i += 1;
          break;
        case FAILED:
          results.f += 1;
          break;
        case NOT_TESTED:
          results.n += 1;
          break;
      }
    }

    if (latestStatus && olderStatus) {
      if (latestStatus !== olderStatus) {
        results.hasChanges = true;
        
        switch (olderStatus) {
          case PASSED:
            matchStatus(key, latestStatus, 'p', results);
            break;
          case INTENDED:
            matchStatus(key, latestStatus, 'i', results);
            break;
          case FAILED:
            matchStatus(key, latestStatus, 'f', results);
            break;
          case NOT_TESTED:
            matchStatus(key, latestStatus, 'n', results);
            break;
        }
      }
    } else if (latestStatus) {
      results.hasChanges = true;
      
      switch (latestStatus) {
        case PASSED:
          results.addedP.push(key);
          break;
        case INTENDED:
          results.addedI.push(key);
          break;
        case FAILED:
          results.addedF.push(key);
          break;
        case NOT_TESTED:
          results.addedN.push(key);
          break;
      }
    } else if (olderStatus) {
      results.hasChanges = true;
      results.deleted.push(key);
    }
  }

  if (results.pToF.length === 0 && results.iToF.length === 0) {
    results.isMergeable = true;
  }

  results.total = results.p + results.f + results.i + results.n;
  results.regressionCount = results.pToF.length + results.iToF.length;

  return results;
}

export default { compareTestRuns };
