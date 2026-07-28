/**
 * Shared helpers to calculate test statistics from results JSON.
 *
 * Keeps upload/import paths aligned and supports legacy status variants.
 */

function emptyStats() {
  return { total: 0, passed: 0, failed: 0, intended: 0, skipped: 0 };
}

function classifyTest(test, stats) {
  const status = String(test.status || '').toLowerCase().trim();
  if (!status) return;

  stats.total += 1;

  const errorType = String(test.errorType || '').toLowerCase();
  const isIntended = (
    status === 'intended' ||
    status === 'intended deviation' ||
    status === 'failed: intended' ||
    errorType.includes('intended') ||
    test.intended === true
  );

  if (status === 'passed' || status === 'pass') {
    stats.passed += 1;
  } else if (status === 'skipped' || status === 'skip' || status === 'not tested') {
    stats.skipped += 1;
  } else if (status === 'failed' || status === 'fail' || status === 'failed: intended' || status === 'intended' || status === 'intended deviation') {
    if (isIntended) {
      stats.intended += 1;
    } else {
      stats.failed += 1;
    }
  }
}

export function calculateTestStats(resultsJson) {
  const stats = emptyStats();

  if (resultsJson && 'version' in resultsJson) {
    for (const suite of Object.values(resultsJson.suites ?? {})) {
      for (const test of Object.values(suite.tests ?? {})) {
        if (test && typeof test === 'object' && !Array.isArray(test)) classifyTest(test, stats);
      }
    }
  } else {
    for (const [key, test] of Object.entries(resultsJson || {})) {
      if (key === 'info' || !test || typeof test !== 'object' || Array.isArray(test)) continue;
      classifyTest(test, stats);
    }
  }

  return stats;
}

export function calculateSuiteStats(resultsJson) {
  const suiteMap = {};

  if (resultsJson && 'version' in resultsJson) {
    for (const [suiteKey, suite] of Object.entries(resultsJson.suites ?? {})) {
      const stats = emptyStats();
      for (const test of Object.values(suite.tests ?? {})) {
        if (test && typeof test === 'object' && !Array.isArray(test)) classifyTest(test, stats);
      }
      suiteMap[suiteKey] = stats;
    }
  } else {
    const stats = emptyStats();
    for (const [key, test] of Object.entries(resultsJson || {})) {
      if (key === 'info' || !test || typeof test !== 'object' || Array.isArray(test)) continue;
      classifyTest(test, stats);
    }
    suiteMap['sparql11'] = stats;
  }

  const suiteSortComparator = (a, b) => {
    const rank = k => k === 'sparql11' ? 0 : k === 'sparql10' ? 1 : 2;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  };
  return Object.entries(suiteMap)
    .sort(([a], [b]) => suiteSortComparator(a, b))
    .map(([suite, s]) => ({ suite, total: s.total, passed: s.passed, failed: s.failed, intended: s.intended }));
}
