import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import { extractTestRows, getFullTestData } from '../utils/extractRows';
import { normalizeDisplayValue, suiteSortComparator } from '../utils/displayMappings';
import TestDetails from '../components/TestDetails';
import CommitShaLink from '../components/CommitShaLink';
import RunStatsDisplay from '../components/RunStatsDisplay';
import { formatDbDate } from '../utils/formatDate';

export default function SingleRunView() {
  const { id } = useParams();
  const location = useLocation();
  const backPath = location.state?.from || '/';
  const [searchParams, setSearchParams] = useSearchParams();
  const [run, setRun] = useState(null);
  const [testData, setTestData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [latestMaster, setLatestMaster] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  
  // Filter states, using Sets for multi-select
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    suite: new Set(),
    group: new Set(),
    type: new Set(),
    status: new Set(),
    errorType: new Set(),
  });
  const [sortConfig, setSortConfig] = useState({ key: 'testName', direction: 'asc' });

  // Load run data
  useEffect(() => {
    let cancelled = false;
    
    const loadRun = async () => {
      setLoading(true);
      setError(null);
      setTestData([]);
      setSelectedTest(null);
      setLatestMaster(null);

      try {
        const res = await fetch(API_ENDPOINTS.runById(id));
        if (!res.ok) {
          throw new Error('Failed to load run');
        }

        const data = await res.json();
        if (!cancelled) {
          setRun(data);
          // Load latest master for this repo
          loadLatestMaster(data.repo_full_name);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load run');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRun();
    
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Load latest master commit for comparison
  const loadLatestMaster = async (repo) => {
    if (!repo) return;
    
    try {
      const res = await fetch(API_ENDPOINTS.latestMaster(repo));
      if (!res.ok) return;
      const data = await res.json();
      if (data.dbRun) {
        setLatestMaster(data.dbRun);
      }
    } catch (err) {
      console.error('Failed to load latest master:', err);
    }
  };

  // Process test data when run is loaded
  useEffect(() => {
    if (!run || !run.results_json) {
      return;
    }
    
    let cancelled = false;
    setProcessing(true);
    
    // Defer heavy processing
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      
      try {
        const rows = extractTestRows(run.results_json);
        if (!cancelled) {
          setTestData(rows);
          setProcessing(false);
        }
      } catch (err) {
        console.error('Error extracting test rows:', err);
        if (!cancelled) {
          setTestData([]);
          setProcessing(false);
        }
      }
    }, 10);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [run]);

  // Auto-open test detail panel when URL contains ?test= params (e.g. from a shared link)
  useEffect(() => {
    if (!run?.results_json || selectedTest) return;
    const testName = searchParams.get('test');
    const suite = searchParams.get('suite');
    if (!testName) return;
    const fullTestData = getFullTestData(run.results_json, suite, testName);
    if (fullTestData) {
      setSelectedTest({ ...fullTestData, testName, suite });
    }
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic filtering: compute available options for each filter based on OTHER active filters
  const getAvailableOptions = (filterKey) => {
    // Get data filtered by all filters EXCEPT the current one
    const dataForThisFilter = testData.filter(row => {
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
      let value = row[filterKey];
      if (value && value !== '' && value !== 'N/A') availableValues.add(value);
    });

    return availableValues;
  };

  // Get all possible options for a filter (not just available ones)
  const getAllOptions = (filterKey) => {
    const allValues = new Set();
    testData.forEach(row => {
      let value = row[filterKey];
      if (value && value !== '' && value !== 'N/A') allValues.add(value);
    });

    return Array.from(allValues).sort();
  };

  // Filter and sort data
  const filteredData = testData
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
    const fullTestData = run?.results_json
      ? getFullTestData(run.results_json, row.suite, row.testName)
      : null;
    if (fullTestData) {
      setSelectedTest({ ...fullTestData, testName: row.testName, suite: row.suite });
      setSearchParams({ test: row.testName, suite: row.suite ?? '' }, { replace: true });
    }
  };

  const distinctSuites = new Set(testData.map(r => r.suite));
  const showSuiteFilter = distinctSuites.size > 1;

  // Stats - values are already normalized via extractTestRows (see displayMappings.js)
  const stats = {
    total: testData.length,
    passed: testData.filter(t => t.status === 'Passed').length,
    failed: testData.filter(t => t.status === 'Failed').length,
    intended: testData.filter(t => t.status === 'Intended deviation').length,
  };

  const suiteStats = [...distinctSuites].sort(suiteSortComparator).map(suite => ({
    suite,
    total:    testData.filter(t => t.suite === suite).length,
    passed:   testData.filter(t => t.suite === suite && t.status === 'Passed').length,
    failed:   testData.filter(t => t.suite === suite && t.status === 'Failed').length,
    intended: testData.filter(t => t.suite === suite && t.status === 'Intended deviation').length,
  }));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-gray-600">Loading run data...</div>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-gray-600">Processing test data...</div>
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
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Link to={backPath} className="px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 hover:bg-gray-100">
              ← Back to Search
            </Link>
            {latestMaster && latestMaster.id !== parseInt(id) && (
              <Link 
                to={`/compare/${id}/${latestMaster.id}`}
                state={{ from: backPath }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Compare to Latest Master
              </Link>
            )}
          </div>
        </div>

        {/* Run Info Card */}
        <div className="mb-6">
          <RunInfoCard singleRunView={true} run={run} />
        </div>

        {/* Stats */}
        <div className="mb-6">
          <RunStatsDisplay variant="cards" stats={stats} suiteStats={suiteStats} />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          {/* Filter Header - Always Visible */}
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
              <span className="text-sm text-gray-600">
                ({filteredData.length} of {testData.length} tests)
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

          {/* Filter Content - Foldable */}
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
                  label="Status"
                  filterKey="status"
                  selectedValues={filters.status}
                  allOptions={getAllOptions('status')}
                  availableOptions={getAvailableOptions('status')}
                  onChange={handleFilterToggle}
                />

                <FilterRow
                  label="Error Type"
                  filterKey="errorType"
                  selectedValues={filters.errorType}
                  allOptions={getAllOptions('errorType')}
                  availableOptions={getAvailableOptions('errorType')}
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
                  <TableHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />
                  <TableHeader label="Error Type" sortKey="errorType" sortConfig={sortConfig} onSort={handleSort} />
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
                      <StatusBadge status={row.status} />
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-gray-600"
                    >{row.errorType || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Test Details */}
        {selectedTest && (
          <TestDetails
            test={selectedTest}
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

function StatusBadge({ status }) {
  // Status is already normalized via extractTestRows
  const isPassed = status === 'Passed';
  const isFailed = status === 'Failed';
  
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
      isPassed
        ? 'bg-green-100 text-green-800'
        : isFailed
        ? 'bg-red-100 text-red-800'
        : 'bg-yellow-100 text-yellow-800'
    }`}>
      {status}
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

function RunInfoCard({ run, singleRunView = false }) {
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

  const className = singleRunView ? "" : "mb-3";

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border-2 border-blue-200">
      {/* Header with Title, Commit SHA, PR Badge, Date, and Pass Rate */}
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
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
          linkClassName="text-xs text-blue-700 hover:text-blue-900 hover:underline font-mono bg-gray-100 px-2 py-1 rounded"
          codeClassName="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded"
        />
        {run.pr_number && (
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
            PR #{run.pr_number}
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

      {/* Test Statistics */}
      {singleRunView === false && (
        <div className="pt-3 border-t border-gray-200">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-gray-900">{run.total}</div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-600">{run.passed}</div>
              <div className="text-xs text-gray-600">Passed</div>
            </div>
            <div>
              <div className="text-lg font-bold text-yellow-600">{run.intended || 0}</div>
              <div className="text-xs text-gray-600">Intended</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">{run.failed}</div>
              <div className="text-xs text-gray-600">Failed</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
