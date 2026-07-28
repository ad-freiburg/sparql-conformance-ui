/**
 * Display value mappings for normalizing test data.
 * 
 * This is the backend equivalent of src/utils/displayMappings.js
 * Note: Keep these mappings in sync with the frontend version.
 */

const mappings = {
  status: {
    'Pass': 'Passed',
    'Fail': 'Failed',
    'Failed: Intended': 'Intended deviation',
    // Add more mappings as needed
  },
  errorType: {
    'Known, intended behaviour that does not comply with SPARQL standard': 'Intended deviation from SPARQL standard',
  },
};

/**
 * Canonical status values used in comparison logic.
 * All status values should be normalized to one of these before comparison.
 */
export const CANONICAL_STATUSES = {
  PASSED: 'Passed',
  FAILED: 'Failed',
  INTENDED: 'Intended deviation',
  NOT_TESTED: 'NOT TESTED',
};

/**
 * Normalize a display value using the mappings.
 * Returns the mapped value if found, otherwise the original value.
 * 
 * @param {string} field - The field name (status, errorType, etc.)
 * @param {string} value - The raw value from the JSON
 * @returns {string} The normalized value
 */
function normalizeValue(field, value) {
  if (value == null) return value;
  const strValue = String(value);
  const fieldMappings = mappings[field];
  if (!fieldMappings) return strValue;
  return fieldMappings[strValue] ?? strValue;
}

/**
 * Normalize a status value specifically.
 * Convenience function for the most common use case.
 * 
 * @param {string} status - The raw status value
 * @returns {string} The normalized status value
 */
export function normalizeStatus(status) {
  return normalizeValue('status', status);
}

