/**
 * Shared utilities for TestDetails and CompareTestDetails components
 * Extracts common logic for determining which test fields to display
 */

/**
 * Keys that represent result fields which should respond to toggle controls
 */
export const RESULT_FIELD_KEYS = new Set([
  'expectedResult',
  'expectedHtml',
  'queryResult',
  'gotHtml'
]);

/**
 * Check if a field key represents a result field that should respond to toggles
 * @param {string} key - The field key
 * @returns {boolean}
 */
export function isResultField(key) {
  return RESULT_FIELD_KEYS.has(key);
}

/**
 * Get overview entries based on test type and error type
 * @param {Object} test - The test object
 * @returns {Array} Array of entry objects with label, value, key, and isHtml properties
 */
export function getOverviewEntries(test) {
  if (!test) return [];

  const entries = [{
    label: "Comment",
    value: test.comment,
    key: "comment",
    isHtml: false
  }];

  const typeName = test.typeName || test.type;

  if (typeName === "QueryEvaluationTest" || typeName === "CSVResultFormatTest" || typeName === "UpdateEvaluationTest") {
    let queryResult, expectedResult, resultsAreHtml;

    const showExpectedAndResult = test.status !== "Failed"
      || test.errorType === "RESULTS NOT THE SAME" || test.errorType === "QUERY RESULT FORMAT ERROR"
      || test.errorType === "Results differ" || test.errorType === "Result format error"
    if (showExpectedAndResult) {
      // Prefer HTML diff view; fall back to raw files when HTML is not available
      if (test.gotHtml || test.expectedHtml) {
        queryResult = test.gotHtml;
        expectedResult = test.expectedHtml;
        resultsAreHtml = true;
      } else {
        queryResult = test.queryLog;
        expectedResult = test.resultFile;
        resultsAreHtml = false;
      }
    } else {
      queryResult = test.queryLog;
      expectedResult = test.resultFile;
      resultsAreHtml = false;
    }

    entries.push({
      label: "Index File",
      value: test.graphFile,
      key: "graphFile",
      isHtml: false
    });
    entries.push({
      label: "Query File",
      value: test.queryFile,
      key: "queryFile",
      isHtml: false
    });
    entries.push({
      label: "Expected Result",
      value: expectedResult,
      key: "expectedResult",
      isHtml: resultsAreHtml
    });
    entries.push({
      label: "Query Result",
      value: queryResult,
      key: "queryResult",
      isHtml: resultsAreHtml
    });
  } else if (typeName === "PositiveSyntaxTest11" || typeName === "NegativeSyntaxTest11" || 
             typeName === "PositiveUpdateSyntaxTest11" || typeName === "NegativeUpdateSyntaxTest11") {
    entries.push({
      label: "Query File",
      value: test.queryFile,
      key: "queryFile",
      isHtml: false
    });
    entries.push({
      label: "Query Result",
      value: test.queryLog,
      key: "queryLog",
      isHtml: false
    });
  } else if (typeName === "ProtocolTest" || typeName === "GraphStoreProtocolTest") {
    entries.splice(0, 1); // Remove comment for protocol tests
    entries.push({
      label: "Protocol",
      value: test.protocol,
      key: "protocol",
      isHtml: false
    });
    entries.push({
      label: "Response",
      value: test.response,
      key: "response",
      isHtml: false
    });
    entries.push({
      label: "Protocol sent",
      value: test.protocolSent,
      key: "protocolSent",
      isHtml: false
    });
    entries.push({
      label: "Response Extracted",
      value: test.responseExtracted,
      key: "responseExtracted",
      isHtml: false
    });
    entries.push({
      label: "Not Matching",
      value: test.notMatching,
      key: "notMatching",
      isHtml: false
    });
  }

  // Add error-specific entries
  if (test.errorType === "INDEX BUILD ERROR") {
    entries.push({
      label: "Index Build Log",
      value: test.indexLog,
      key: "indexLog",
      isHtml: false
    });
  }
  if (test.errorType === "SERVER ERROR") {
    entries.push({
      label: "Server Status",
      value: test.serverStatus,
      key: "serverStatus",
      isHtml: false
    });
    entries.push({
      label: "Server Log",
      value: test.serverLog,
      key: "serverLog",
      isHtml: false
    });
  }

  return entries;
}

/**
 * Get all entries for Details tab
 * @param {Object} test - The test object
 * @returns {Array} Array of entry objects with label, value, key, and isHtml properties
 */
export function getAllEntries(test) {
  if (!test) return [];

  return [
    {
      label: "Index File",
      value: test.graphFile,
      key: "graphFile",
      isHtml: false
    },
    {
      label: "Index Build Log",
      value: test.indexLog,
      key: "indexLog",
      isHtml: false
    },
    {
      label: "Query File",
      value: test.queryFile,
      key: "queryFile",
      isHtml: false
    },
    {
      label: "Query Sent",
      value: test.querySent,
      key: "querySent",
      isHtml: false
    },
    {
      label: "Query Log",
      value: test.queryLog,
      key: "queryLog",
      isHtml: false
    },
    {
      label: "Server Status",
      value: test.serverStatus,
      key: "serverStatus",
      isHtml: false
    },
    {
      label: "Server Log",
      value: test.serverLog,
      key: "serverLog",
      isHtml: false
    },
    {
      label: "Expected Query Result",
      value: test.expectedHtml,
      key: "expectedHtml",
      isHtml: true
    },
    {
      label: "Query Result",
      value: test.gotHtml,
      key: "gotHtml",
      isHtml: true
    },
    {
      label: "Query Filename",
      value: test.query,
      key: "query",
      isHtml: false
    },
    {
      label: "Index Filename",
      value: test.graph,
      key: "graph",
      isHtml: false
    },
    {
      label: "Result Filename",
      value: test.result,
      key: "result",
      isHtml: false
    },
    {
      label: "Result File",
      value: test.resultFile,
      key: "resultFile",
      isHtml: false
    },
    {
      label: "Test Type",
      value: test.type,
      key: "type",
      isHtml: false
    },
    {
      label: "Test Feature",
      value: test.feature,
      key: "feature",
      isHtml: false
    },
    {
      label: "Approval",
      value: test.approval,
      key: "approval",
      isHtml: false
    },
    {
      label: "Approved by",
      value: test.approvedBy,
      key: "approvedBy",
      isHtml: false
    },
    {
      label: "Config",
      value: test.config,
      key: "config",
      isHtml: false
    }
  ];
}

/**
 * Get the red-only HTML content for a result field
 * @param {Object} test - The test object
 * @param {string} key - The field key
 * @returns {string|null} The red-only HTML content or null
 */
export function getRedHtmlContent(test, key) {
  if (!test) return null;
  
  if (key === 'expectedResult' || key === 'expectedHtml') {
    return test.expectedHtmlRed || null;
  }
  if (key === 'queryResult' || key === 'gotHtml') {
    return test.gotHtmlRed || null;
  }
  return null;
}
