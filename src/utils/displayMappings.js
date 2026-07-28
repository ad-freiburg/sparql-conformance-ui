/**
 * Display value mappings for normalizing data.
 * 
 * Maps old/variant values to canonical display values.*
 * Note: Keep in sync with server/displayMappings.js!
 */

const mappings = {
  status: {
    'Pass': 'Passed',
    'Fail': 'Failed',
    'Failed: Intended': 'Intended deviation',
    'Intended': 'Intended deviation',
  },
  group: {
    // Example: 'old-group-name': 'new-group-name',
  },
  type: {
    // Example: 'OldTypeName': 'NewTypeName',
  },
  errorType: {
    'Known, intended behaviour that does not comply with SPARQL standard': 'Intended deviation from SPARQL standard',
    'RESULTS NOT THE SAME': 'Results differ',
  },
  suite: {
    'sparql11': 'SPARQL 1.1',
    'sparql10': 'SPARQL 1.0',
  },
};

/**
 * Normalize a display value using the mappings.
 * Returns the mapped value if found, otherwise the original value.
 * 
 * @param {string} field - The field name (status, group, type, errorType)
 * @param {string} value - The raw value from the JSON
 * @returns {string} The normalized display value
 */
export function suiteSortComparator(a, b) {
  const rank = k => k === 'sparql11' ? 0 : k === 'sparql10' ? 1 : 2;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

export function normalizeDisplayValue(field, value) {
  const fieldMappings = mappings[field];
  if (!fieldMappings) return value;
  const mapped = fieldMappings[value];
  if (mapped !== undefined) return mapped;
  if (field === 'suite') {
    return value.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return value;
}
