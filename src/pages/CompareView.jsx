import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import { extractTestRows, getFullTestData } from '../utils/extractRows';
import { normalizeDisplayValue, suiteSortComparator } from '../utils/displayMappings';
import CompareTestDetails from '../components/CompareTestDetails';
import CommitShaLink from '../components/CommitShaLink';
import RunStatsDisplay from '../components/RunStatsDisplay';
import { formatDbDate } from '../utils/formatDate';

export default function CompareView() {
  const { id1, id2 } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backPath = location.state?.from || '/';
  const [searchParams, setSearchParams] = useSearchParams();
  const [run1, setRun1] = useState(null);
  const [run2, setRun2] = useState(null);
  const [run1IsLatest, setRun1IsLatest] = useState(false);
  const [run2IsLatest, setRun2IsLatest] = useState(false);
  const [comparisonData, setComparisonData] = useState([]);
  const [run1Stats, setRun1Stats] = useState(null);
  const [run2Stats, setRun2Stats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  
  // Filter states using Sets for multi-select
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    suite: new Set(),
    group: new Set(),
    type: new Set(),
    status1: new Set(),
    status2: new Set(),
    errorType1: new Set(),
    changeType: new Set(),
  });
  const [sortConfig, setSortConfig] = useState({ key: 'testName', direction: 'asc' });

  // Load runs when IDs change
  useEffect(() => {
    let cancelled = false;
    
    const loadRuns = async () => {
      setLoading(true);
      setError(null);
      setComparisonData([]);
      setSelectedTest(null);

      try {
        const [res1, res2] = await Promise.all([
          fetch(API_ENDPOINTS.runById(id1)),
          fetch(API_ENDPOINTS.runById(id2))
        ]);

        if (!res1.ok || !res2.ok) {
          throw new Error('Failed to load one or both runs');
        }

        const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
        
        if (!cancelled) {
          setRun1(data1);
          setRun2(data2);
          
          // Check if each run is the latest for its PR
          checkIfLatest(data1, setRun1IsLatest);
          checkIfLatest(data2, setRun2IsLatest);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load runs');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRuns();
    
    return () => {
      cancelled = true;
    };
  }, [id1, id2]);

  // Helper to check if a run is the latest for its PR
  const checkIfLatest = async (run, setIsLatest) => {
    const repoName = String(run?.repo_full_name || '').toLowerCase();
    const source = run?.workflow_run_id
      ? 'ci'
      : repoName.startsWith('manual/') || repoName.startsWith('local/')
      ? 'manual'
      : 'unknown';

    if (!run || !run.pr_number) {
      // For non-PR runs, check if it's the latest for its branch
      if (run && (run.head_ref || run.ref_name)) {
        try {
          const res = await fetch(API_ENDPOINTS.search(run.head_ref || run.ref_name, { source }));
          if (res.ok) {
            const data = await res.json();
            // Check if this run is the first (most recent) for this branch
            if (data.results && data.results.length > 0 && data.results[0].id === run.id) {
              setIsLatest(true);
              return;
            }
          }
        } catch (err) {
          console.error('Failed to check if run is latest:', err);
        }
      }
      setIsLatest(false);
      return;
    }
    
    try {
      // Search for runs with same PR number
      const res = await fetch(API_ENDPOINTS.search(String(run.pr_number), { source }));
      if (res.ok) {
        const data = await res.json();
        // Results are sorted by created_at DESC, so first one is latest
        if (data.results && data.results.length > 0 && data.results[0].id === run.id) {
          setIsLatest(true);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to check if run is latest:', err);
    }
    setIsLatest(false);
  };

  // Process comparison when runs are loaded
  useEffect(() => {
    if (!run1 || !run2 || !run1.results_json || !run2.results_json) {
      return;
    }
    
    let cancelled = false;
    setProcessing(true);
    
    // Defer heavy processing
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      
      try {
        const tests1 = extractTestRows(run1.results_json);
        const tests2 = extractTestRows(run2.results_json);

        const computeRunStats = (tests) => {
          const suites = [...new Set(tests.map(t => t.suite))].sort(suiteSortComparator);
          return {
            intended: tests.filter(t => t.status === 'Intended deviation').length,
            suiteStats: suites.map(suite => ({
              suite,
              total:    tests.filter(t => t.suite === suite).length,
              passed:   tests.filter(t => t.suite === suite && t.status === 'Passed').length,
              failed:   tests.filter(t => t.suite === suite && t.status === 'Failed').length,
              intended: tests.filter(t => t.suite === suite && t.status === 'Intended deviation').length,
            })),
          };
        };

        // Use suite:testName as key to avoid collisions when suites share test names
        const map1 = new Map(tests1.map(t => [`${t.suite}:${t.testName}`, t]));
        const map2 = new Map(tests2.map(t => [`${t.suite}:${t.testName}`, t]));
        const allKeys = new Set([...map1.keys(), ...map2.keys()]);

        const rows = [];
        for (const key of allKeys) {
          const test1 = map1.get(key); // run1 = newer/current (left side)
          const test2 = map2.get(key); // run2 = older/previous (right side)
          const testName = test1?.testName ?? test2?.testName ?? key;

          let changeType = 'unchanged';
          let statusChange = '';

          if (!test2 && test1) {
            // New test: prev. Not Tested -> now Passed/Failed/etc
            changeType = 'new';
            statusChange = `New test`;
          } else if (test2 && !test1) {
            // Removed: prev. Any -> now Not Tested
            changeType = 'removed';
            statusChange = `Removed`;
          } else if (test1 && test2) {
            const status1 = test1.status || ''; // current/now
            const status2 = test2.status || ''; // previous/old

            if (status1 === status2) {
              changeType = 'unchanged';
              statusChange = 'No change';
            } else {
              // prev. Passed/Intended deviation -> now Failed = Regression
              if ((status2 === 'Passed' || status2 === 'Intended deviation') && status1 === 'Failed') {
                changeType = 'regression';
                statusChange = `Regression`;
              }
              // prev. Failed -> now Passed/Intended deviation = Fixed
              else if (status2 === 'Failed' && (status1 === 'Passed' || status1 === 'Intended deviation')) {
                changeType = 'fixed';
                statusChange = `Fixed`;
              }
              // Any other change
              else {
                changeType = 'changed';
                statusChange = `Changed`;
              }
            }
          }

          rows.push({
            testName,
            suite: test2?.suite || test1?.suite || '',
            group: test2?.group || test1?.group || '',
            type: test2?.type || test1?.type || '',
            status1: test1?.status || 'N/A',
            status2: test2?.status || 'N/A',
            errorType1: test1?.errorType || '',
            errorType2: test2?.errorType || '',
            changeType,
            statusChange,
            test1Data: test1,
            test2Data: test2,
          });
        }

        if (!cancelled) {
          setComparisonData(rows);
          setRun1Stats(computeRunStats(tests1));
          setRun2Stats(computeRunStats(tests2));
          setProcessing(false);
        }
      } catch (err) {
        console.error('Error computing comparison:', err);
        if (!cancelled) {
          setComparisonData([]);
          setProcessing(false);
        }
      }
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [run1, run2]);

  // Dynamic filtering: compute available options for each filter based on OTHER active filters
  const getAvailableOptions = (filterKey) => {
    // Get data filtered by all filters EXCEPT the current one
    const dataForThisFilter = comparisonData.filter(row => {
      // Search filter
      if (searchQuery && !row.testName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Apply all other filters
      for (const [key, filterSet] of Object.entries(filters)) {
        if (key !== filterKey && filterSet.size > 0) {
          if (!filterSet.has(row[key])) return false;
        }
      }
      
      return true;
    });

    // Extract unique values for this filter from the filtered data
    const availableValues = new Set();
    dataForThisFilter.forEach(row => {
      const value = row[filterKey];
      if (value && value !== '' && value !== 'N/A') availableValues.add(value);
    });

    return availableValues;
  };

  // Get all possible options for a filter (not just available ones)
  const getAllOptions = (filterKey) => {
    const allValues = new Set();
    comparisonData.forEach(row => {
      const value = row[filterKey];
      if (value && value !== '' && value !== 'N/A') allValues.add(value);
    });

    return Array.from(allValues).sort();
  };

  const filteredData = comparisonData
    .filter(row => {
      // Search filter
      if (searchQuery && !row.testName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Apply all filters
      for (const [key, filterSet] of Object.entries(filters)) {
        if (filterSet.size > 0) {
          if (!filterSet.has(row[key])) return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      
      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Auto-open test detail panel when URL contains ?test= params (e.g. from a shared link)
  useEffect(() => {
    if (!run1?.results_json || !run2?.results_json || selectedTest) return;
    const testName = searchParams.get('test');
    const suite = searchParams.get('suite');
    if (!testName) return;
    const test1Raw = getFullTestData(run1.results_json, suite, testName);
    const test2Raw = getFullTestData(run2.results_json, suite, testName);
    if (test1Raw || test2Raw) {
      setSelectedTest({
        test1: test1Raw ? { ...test1Raw, testName } : null,
        test2: test2Raw ? { ...test2Raw, testName } : null,
        testName,
        suite,
      });
    }
  }, [run1, run2]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterToggle = (filterKey, value) => {
    setFilters(prev => {
      const newSet = new Set(prev[filterKey]);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      return { ...prev, [filterKey]: newSet };
    });
  };

  const handleRowClick = (row) => {
    const test1Raw = run1?.results_json
      ? getFullTestData(run1.results_json, row.suite, row.testName)
      : null;
    const test2Raw = run2?.results_json
      ? getFullTestData(run2.results_json, row.suite, row.testName)
      : null;
    setSelectedTest({
      test1: test1Raw ? { ...test1Raw, testName: row.testName } : null,
      test2: test2Raw ? { ...test2Raw, testName: row.testName } : null,
      testName: row.testName,
      suite: row.suite,
    });
    setSearchParams({ test: row.testName, suite: row.suite ?? '' }, { replace: true });
  };

  const distinctSuites = new Set(comparisonData.map(r => r.suite));
  const showSuiteFilter = distinctSuites.size > 1;

  // Stats for display
  const stats = {
    total: comparisonData.length,
    regression: comparisonData.filter(r => r.changeType === 'regression').length,
    fixed: comparisonData.filter(r => r.changeType === 'fixed').length,
    new: comparisonData.filter(r => r.changeType === 'new').length,
    removed: comparisonData.filter(r => r.changeType === 'removed').length,
    changed: comparisonData.filter(r => r.changeType === 'changed').length,
    unchanged: comparisonData.filter(r => r.changeType === 'unchanged').length,
  };

  // Per-suite breakdown of comparison stats
  const comparisonSuiteStats = [...distinctSuites].sort(suiteSortComparator).map(suite => ({
    suite,
    total:     comparisonData.filter(r => r.suite === suite).length,
    regression:comparisonData.filter(r => r.suite === suite && r.changeType === 'regression').length,
    fixed:     comparisonData.filter(r => r.suite === suite && r.changeType === 'fixed').length,
    new:       comparisonData.filter(r => r.suite === suite && r.changeType === 'new').length,
    removed:   comparisonData.filter(r => r.suite === suite && r.changeType === 'removed').length,
    unchanged: comparisonData.filter(r => r.suite === suite && r.changeType === 'unchanged').length,
  }));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-gray-600">Loading comparison...</div>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-gray-600">Processing comparison data...</div>
          <div className="text-sm text-gray-500 mt-2">This may take a few seconds</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">Error: {error}</div>
          <Link to={backPath} className="text-blue-600 hover:underline">
            ← Back to Search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
        {/* Back Link */}
        <div className="mb-6">
          <Link to={backPath} className="px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 inline-block">
            ← Back to Search
          </Link>
        </div>

        {/* Run Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <RunInfoCard
            run={run1}
            computedStats={run1Stats}
            runNumber={1}
            onClick={() => navigate(`/run/${id1}`, { state: { from: backPath } })}
            isLatest={run1IsLatest}
          />
          <RunInfoCard
            run={run2}
            computedStats={run2Stats}
            runNumber={2}
            onClick={() => navigate(`/run/${id2}`, { state: { from: backPath } })}
            isLatest={run2IsLatest}
          />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap justify-center gap-4 mb-6">
          {stats.regression > 0 && <StatCard label="Regressions" value={stats.regression} color="red" description="Passed/Intended → Failed" suiteStats={comparisonSuiteStats} suiteValueFn={s => s.regression} />}
          {stats.fixed > 0 && <StatCard label="Fixed" value={stats.fixed} color="green" description="Failed → Passed/Intended" suiteStats={comparisonSuiteStats} suiteValueFn={s => s.fixed} />}
          {stats.new > 0 && <StatCard label="New Tests" value={stats.new} color="purple" description="Not Tested → Any" suiteStats={comparisonSuiteStats} suiteValueFn={s => s.new} />}
          {stats.removed > 0 && <StatCard label="Removed" value={stats.removed} color="gray" description="Any → Not Tested" suiteStats={comparisonSuiteStats} suiteValueFn={s => s.removed} />}
          {stats.unchanged > 0 && <StatCard label="Unchanged" value={stats.unchanged} color="gray" suiteStats={comparisonSuiteStats} suiteValueFn={s => s.unchanged} />}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          {/* Filter Header - Collapsible */}
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
              <span className="text-sm text-gray-600">
                ({filteredData.length} of {comparisonData.length} tests)
              </span>
            </div>
            <button
              className="text-gray-500 hover:text-gray-700 transition-transform"
              style={{ transform: filtersExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-label={filtersExpanded ? 'Collapse filters' : 'Expand filters'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Filter Content - Collapsible */}
          {filtersExpanded && (
            <div className="px-4 pb-4 border-t border-gray-200">
              {/* Search */}
              <div className="mt-4 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Tests
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by test name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Filter Rows - Column name on left, checkboxes on right */}
              <div className="space-y-4">
                {showSuiteFilter && (
                  <FilterRow
                    label="Suite"
                    filterKey="suite"
                    selectedValues={filters.suite}
                    allOptions={getAllOptions('suite')}
                    availableOptions={getAvailableOptions('suite')}
                    onChange={handleFilterToggle}
                    displayValue={(v) => normalizeDisplayValue('suite', v)}
                  />
                )}

                <FilterRow
                  label="Group"
                  filterKey="group"
                  selectedValues={filters.group}
                  allOptions={getAllOptions('group')}
                  availableOptions={getAvailableOptions('group')}
                  onChange={handleFilterToggle}
                />

                <FilterRow
                  label="Type"
                  filterKey="type"
                  selectedValues={filters.type}
                  allOptions={getAllOptions('type')}
                  availableOptions={getAvailableOptions('type')}
                  onChange={handleFilterToggle}
                />

                <FilterRow
                  label="Status (Newer)"
                  filterKey="status1"
                  selectedValues={filters.status1}
                  allOptions={getAllOptions('status1')}
                  availableOptions={getAvailableOptions('status1')}
                  onChange={handleFilterToggle}
                />

                <FilterRow
                  label="Status (Baseline)"
                  filterKey="status2"
                  selectedValues={filters.status2}
                  allOptions={getAllOptions('status2')}
                  availableOptions={getAvailableOptions('status2')}
                  onChange={handleFilterToggle}
                />

                <FilterRow
                  label="Change Type"
                  filterKey="changeType"
                  selectedValues={filters.changeType}
                  allOptions={getAllOptions('changeType')}
                  availableOptions={getAvailableOptions('changeType')}
                  onChange={handleFilterToggle}
                />

                <FilterRow
                  label="Error Type (Newer)"
                  filterKey="errorType1"
                  selectedValues={filters.errorType1}
                  allOptions={getAllOptions('errorType1')}
                  availableOptions={getAvailableOptions('errorType1')}
                  onChange={handleFilterToggle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <TableHeader label="Test Name" sortKey="testName" sortConfig={sortConfig} onSort={handleSort} />
                  {showSuiteFilter && (
                    <TableHeader label="Suite" sortKey="suite" sortConfig={sortConfig} onSort={handleSort} />
                  )}
                  <TableHeader label="Group" sortKey="group" sortConfig={sortConfig} onSort={handleSort} />
                  <TableHeader label="Type" sortKey="type" sortConfig={sortConfig} onSort={handleSort} />
                  <TableHeader label="Status (Newer)" sortKey="status1" sortConfig={sortConfig} onSort={handleSort} />
                  <TableHeader label="Status (Baseline)" sortKey="status2" sortConfig={sortConfig} onSort={handleSort} />
                  <TableHeader label="Error Type (Newer)" sortKey="errorType1" sortConfig={sortConfig} onSort={handleSort} />
                  <TableHeader label="Change" sortKey="changeType" sortConfig={sortConfig} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredData.map((row, idx) => (
                  <tr
                    key={`${row.suite}:${row.testName}`}
                    onClick={() => handleRowClick(row)}
                    className={`transition-colors cursor-pointer ${
                      selectedTest?.suite === row.suite && selectedTest?.testName === row.testName ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <td
                      className="px-4 py-3 text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
                    >{row.testName}</td>
                    {showSuiteFilter && (
                      <td
                        className="px-4 py-3 text-sm text-gray-600"
                      >{normalizeDisplayValue('suite', row.suite)}</td>
                    )}
                    <td
                      className="px-4 py-3 text-sm text-gray-600"
                    >{row.group}</td>
                    <td
                      className="px-4 py-3 text-sm text-gray-600"
                    >{row.type}</td>
                    <td
                      className="px-4 py-3"
                    >
                      <StatusBadge status={row.status1} />
                    </td>
                    <td
                      className="px-4 py-3"
                    >
                      <StatusBadge status={row.status2} />
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-gray-600"
                    >{row.errorType1 || '-'}</td>
                    <td
                      className="px-4 py-3"
                    >
                      <ChangeBadge changeType={row.changeType} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Test Details */}
        {selectedTest && (
          <CompareTestDetails 
            test1={selectedTest.test1} 
            test2={selectedTest.test2}
            run1Label={run1?.run_title || `Run ${id1.substring(0, 8)}`}
            run2Label={run2?.run_title || `Run ${id2.substring(0, 8)}`}
            onClose={() => {
              setSelectedTest(null);
              setSearchParams({}, { replace: true });
            }}
          />
        )}
    </div>
  );
}

// Helper Components
function RunInfoCard({ run, computedStats = null, onClick, isLatest, runNumber }) {
  if (!run) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-5 border-2 border-gray-200">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  const passRate = run.total > 0
    ? ((run.passed / run.total) * 100).toFixed(1)
    : '0.0';
  const repoName = String(run.repo_full_name || '').toLowerCase();
  const showEngineMetadata = repoName.startsWith('manual/') || repoName.startsWith('local/');
  const intendedCount = computedStats?.intended ?? run.intended ?? 0;
  const suiteStats = computedStats?.suiteStats ?? [];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm p-5 border-2 border-blue-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Header with Title, Commit SHA, PR Badge, Branch, Date, Pass Rate and Click Indicator */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${runNumber === 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {runNumber === 1 ? 'Newer' : 'Baseline'}
          </span>
          <h3 className="text-base font-semibold text-gray-900">
            {run.run_title || `Run #${run.id}`}
          </h3>
          {showEngineMetadata && (
            <>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                {run.engine_name || 'unknown-engine'}
              </span>
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                {run.engine_version || 'unknown'}
              </span>
            </>
          )}
          <CommitShaLink
            repoFullName={run.repo_full_name}
            commitSha={run.commit_sha}
            stopPropagation={true}
            linkClassName="text-xs text-blue-700 hover:text-blue-900 hover:underline font-mono bg-gray-100 px-2 py-1 rounded"
            codeClassName="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded"
          />
          {(run.head_ref || run.ref_name) && (
            <span className="text-xs text-gray-500">
              on <span className="font-medium">{run.head_ref || run.ref_name}</span>
            </span>
          )}
          {run.pr_number && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
              PR #{run.pr_number}
            </span>
          )}
          {isLatest && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
              Latest
            </span>
          )}
          <span className="text-xs text-gray-600">
            {formatDbDate(run.created_at, {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          <span className={`text-sm font-semibold ${
            parseFloat(passRate) >= 80
              ? 'text-green-600'
              : parseFloat(passRate) >= 50
              ? 'text-yellow-600'
              : 'text-red-600'
          }`}>
            {passRate}%
          </span>
        </div>
        <span className="text-blue-600 text-xl">→</span>
      </div>

      {/* Test Statistics */}
      <div className="pt-3 border-t border-gray-200">
        <RunStatsDisplay
          variant="compact-grid"
          stats={{ total: run.total, passed: run.passed, failed: run.failed, intended: intendedCount }}
          suiteStats={suiteStats}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, color, description, suiteStats = [], suiteValueFn }) {
  const colorClasses = {
    gray:   'bg-gray-100 text-gray-800',
    green:  'bg-green-100 text-green-800',
    red:    'bg-red-100 text-red-800',
    orange: 'bg-orange-100 text-orange-800',
    purple: 'bg-purple-100 text-purple-800',
    yellow: 'bg-yellow-100 text-yellow-800',
  };
  const dividerClasses = {
    gray:   'border-gray-300',
    green:  'border-green-300',
    red:    'border-red-300',
    orange: 'border-orange-300',
    purple: 'border-purple-300',
    yellow: 'border-yellow-300',
  };

  return (
    <div className={`rounded-xl p-4 min-w-[9rem] ${colorClasses[color]}`}>
      <div className="flex justify-between items-baseline gap-4">
        <span className="text-sm font-medium whitespace-nowrap">{label}</span>
        <span className="text-2xl font-bold">{value}</span>
      </div>
      {description && (
        <div className="text-xs opacity-75 mt-0.5">{description}</div>
      )}
      {suiteStats.length > 0 && suiteValueFn && (
        <div className={`border-t ${dividerClasses[color]} mt-2 pt-2 space-y-1`}>
          {suiteStats.map(s => (
            <div key={s.suite} className="flex justify-between text-xs">
              <span className="opacity-70">{normalizeDisplayValue('suite', s.suite)}</span>
              <span className="font-semibold">{suiteValueFn(s)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableHeader({ label, sortKey, sortConfig, onSort }) {
  const isSorted = sortConfig.key === sortKey;
  
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
    >
      <div className="flex items-center gap-2">
        {label}
        {isSorted && (
          <span className="text-blue-600">
            {sortConfig.direction === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );
}

function StatusBadge({ status }) {  const isPassed = status === 'Passed';
  const isFailed = status === 'Failed';
  
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
      isPassed
        ? 'bg-green-100 text-green-800'
        : isFailed
        ? 'bg-red-100 text-red-800'
        : status === 'N/A'
        ? 'bg-gray-100 text-gray-600'
        : 'bg-yellow-100 text-yellow-800'
    }`}>
      {status}
    </span>
  );
}

function ChangeBadge({ changeType }) {
  const styles = {
    unchanged: 'bg-gray-100 text-gray-700',
    fixed: 'bg-green-100 text-green-800',
    regression: 'bg-red-100 text-red-800',
    new: 'bg-purple-100 text-purple-800',
    removed: 'bg-gray-200 text-gray-600',
    changed: 'bg-yellow-100 text-yellow-800'
  };
  
  const labels = {
    unchanged: 'Unchanged',
    fixed: 'Fixed',
    regression: 'Regression',
    new: 'New Test',
    removed: 'Removed',
    changed: 'Changed'
  };
  
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${styles[changeType] || styles.unchanged}`}>
      {labels[changeType] || changeType}
    </span>
  );
}

// Filter Row Component - Column name on left, checkboxes on right
function FilterRow({ label, filterKey, selectedValues, allOptions, availableOptions, onChange, displayValue }) {
  const hasOptions = allOptions.length > 0;
  
  return (
    <div className="flex items-start gap-4 py-2 border-b border-gray-100 last:border-b-0">
      {/* Column name on the left */}
      <div className="w-48 flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium text-gray-900">
            {label}
          </label>
          {/* Select All / Clear buttons */}
          {hasOptions && selectedValues.size === 0 && (
            <button
              type="button"
              onClick={() => {
                allOptions
                  .filter(opt => availableOptions.has(opt))
                  .forEach(opt => onChange(filterKey, opt));
              }}
              disabled={availableOptions.size === 0}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Select All
            </button>
          )}
          {hasOptions && selectedValues.size > 0 && (
            <button
              type="button"
              onClick={() => {
                allOptions.forEach(opt => {
                  if (selectedValues.has(opt)) onChange(filterKey, opt);
                });
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          )}
        </div>
        {selectedValues.size > 0 && (
          <span className="block text-xs text-blue-600 font-medium mt-1">
            {selectedValues.size} selected
          </span>
        )}
      </div>
      
      {/* Checkboxes on the right */}
      <div className="flex-1">
        {hasOptions ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {/* Checkbox list - show all options, disable unavailable ones */}
            {allOptions.map(option => {
              const isAvailable = availableOptions.has(option);
              const isSelected = selectedValues.has(option);
              
              return (
                <label
                  key={option}
                  className={`flex items-center cursor-pointer ${
                    !isAvailable && !isSelected 
                      ? 'opacity-40 cursor-not-allowed' 
                      : 'hover:text-blue-600'
                  }`}
                  title={!isAvailable && !isSelected ? 'Not available with current filters' : ''}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onChange(filterKey, option)}
                    disabled={!isAvailable && !isSelected}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className={`ml-2 text-sm ${
                    !isAvailable && !isSelected ? 'text-gray-400' : 'text-gray-700'
                  }`}>
                    {displayValue ? displayValue(option) : option}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No options available</p>
        )}
      </div>
    </div>
  );
}
