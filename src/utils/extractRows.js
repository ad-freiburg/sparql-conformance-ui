import { normalizeDisplayValue } from './displayMappings';

function resolveStatus(rawStatus, rawErrorType, rawIntended) {
  const statusLower = String(rawStatus ?? '').toLowerCase().trim();
  const errorTypeLower = String(rawErrorType ?? '').toLowerCase();
  const isIntended =
    statusLower === 'intended' ||
    statusLower === 'failed: intended' ||
    errorTypeLower.includes('intended') ||
    rawIntended === true;
  if (isIntended) return 'Intended deviation';
  return normalizeDisplayValue('status', String(rawStatus ?? ''));
}

export function extractTestRows(raw) {
  if ("version" in raw) {
    // v2 multi-suite format
    const rows = [];
    for (const [suiteKey, suite] of Object.entries(raw.suites ?? {})) {
      for (const [key, value] of Object.entries(suite.tests ?? {})) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        rows.push({
          testName: key,
          suite: suiteKey,
          group: normalizeDisplayValue('group', String(value.group ?? "")),
          type: normalizeDisplayValue('type', String(value.typeName ?? value.type ?? "")),
          status: resolveStatus(value.status, value.errorType, value.intended),
          errorType: normalizeDisplayValue('errorType', String(value.errorType ?? "")),
        });
      }
    }
    return rows;
  }

  // v1 single-suite (legacy)
  const rows = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (key.toLowerCase() === "info") continue;
    rows.push({
      testName: key,
      suite: "sparql11",
      group: normalizeDisplayValue('group', String(value.group ?? "")),
      type: normalizeDisplayValue('type', String(value.typeName ?? value.type ?? "")),
      status: resolveStatus(value.status, value.errorType, value.intended),
      errorType: normalizeDisplayValue('errorType', String(value.errorType ?? "")),
    });
  }
  return rows;
}

export function getFullTestData(resultsJson, suite, testName) {
  if ("version" in resultsJson) {
    return resultsJson.suites?.[suite]?.tests?.[testName];
  }
  return resultsJson[testName];
}
