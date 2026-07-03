import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import CommitShaLink from '../components/CommitShaLink';
import RunStatsDisplay from '../components/RunStatsDisplay';
import { formatDbDate } from '../utils/formatDate';

export default function SearchPage() {
  const [appMode, setAppMode] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRuns, setSelectedRuns] = useState([]);
  const [allRuns, setAllRuns] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [latestMasterRepo, setLatestMasterRepo] = useState(null);
  const [latestMasterStatus, setLatestMasterStatus] = useState(null);
  
  const navigate = useNavigate();
  const location = useLocation();

  const getDefaultSourceFilter = useCallback(
    (mode = appMode) => (mode === 'private' ? null : 'ci'),
    [appMode]
  );

  const loadRecentRuns = useCallback(async (modeOverride = appMode) => {
    setLoadingAll(true);
    try {
      const source = getDefaultSourceFilter(modeOverride);
      const filters = { limit: 20 };
      if (source) filters.source = source;

      const res = await fetch(API_ENDPOINTS.runs(filters));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllRuns(data.results || []);
    } catch (err) {
      console.error('Failed to load recent runs:', err);
    } finally {
      setLoadingAll(false);
    }
  }, [appMode, getDefaultSourceFilter]);

  const loadAppModeAndRuns = useCallback(async () => {
    let detectedMode = null;
    try {
      const healthRes = await fetch(API_ENDPOINTS.health);
      if (healthRes.ok) {
        const health = await healthRes.json();
        detectedMode = health.mode || null;
        setAppMode(detectedMode);
      }
    } catch {
      // Ignore health errors and continue with default behavior.
    } finally {
      loadRecentRuns(detectedMode);
    }
  }, [loadRecentRuns]);

  // Load recent runs on mount
  useEffect(() => {
    loadAppModeAndRuns();
  }, [loadAppModeAndRuns]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const source = getDefaultSourceFilter();
      const filters = source ? { source } : {};
      const res = await fetch(API_ENDPOINTS.search(query.trim(), filters));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err.message || 'Failed to search');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRun = (run) => {
    const isSelected = selectedRuns.find(r => r.id === run.id);

    if (isSelected) {
      setSelectedRuns(selectedRuns.filter(r => r.id !== run.id));
      return;
    }

    if (selectedRuns.length >= 2) {
      setSelectedRuns([selectedRuns[1], run]);
      return;
    }

    setSelectedRuns([...selectedRuns, run]);
  };

  const handleViewSelected = () => {
    if (selectedRuns.length === 1) {
      navigate(`/run/${selectedRuns[0].id}`, { state: { from: location.pathname } });
    } else if (selectedRuns.length === 2) {
      navigate(`/compare/${selectedRuns[0].id}/${selectedRuns[1].id}`, { state: { from: location.pathname } });
    }
  };

  const displayResults = hasSearched ? results : allRuns;
  const isMainlineRef = (refName) => {
    const ref = String(refName || '').toLowerCase();
    return ref === 'main' || ref === 'master' || ref === 'refs/heads/main' || ref === 'refs/heads/master';
  };

  // Compute which runs are the latest for each PR
  // (Results are sorted by created_at DESC, so first occurrence per PR is latest)
  const latestRunIdPerPR = new Set();
  const seenPRs = new Set();
  displayResults.forEach(run => {
    if (run.pr_number && !seenPRs.has(run.pr_number)) {
      seenPRs.add(run.pr_number);
      latestRunIdPerPR.add(run.id);
    }
  });

  const latestMainlineRun = displayResults.find(
    (run) => !run.pr_number && isMainlineRef(run.ref_name)
  );
  const latestMainlineRunId = latestMainlineRun?.id ?? null;

  useEffect(() => {
    if (appMode === 'private') {
      setLatestMasterRepo(null);
      setLatestMasterStatus(null);
      return;
    }

    const targetRepo = latestMainlineRun?.repo_full_name || displayResults[0]?.repo_full_name || null;
    if (!targetRepo) {
      setLatestMasterRepo(null);
      setLatestMasterStatus(null);
      return;
    }

    let cancelled = false;

    const loadLatestMasterStatus = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.latestMaster(targetRepo));
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setLatestMasterRepo(targetRepo);
        setLatestMasterStatus({
          isUpToDate: data?.isUpToDate ?? null,
          githubCommit: data?.githubCommit || null,
          dbRun: data?.dbRun || null,
          message: data?.message || null
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load latest master status:', err);
          setLatestMasterRepo(targetRepo);
          setLatestMasterStatus(null);
        }
      }
    };

    loadLatestMasterStatus();

    return () => {
      cancelled = true;
    };
  }, [appMode, latestMainlineRun, displayResults]);

  return (
    <div className="max-w-[800px] mx-auto py-8 px-4 pb-20">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Test Suite Results
          </h1>
          <div className="mt-3">
            <Link
              to="/manual-engines"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium"
            >
              Compare standard conformance of other engines
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter PR, commit SHA, title, or branch..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            {query.trim() && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setHasSearched(false);
                }}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            Error: {error}
          </div>
        )}

        {latestMasterStatus?.isUpToDate === false && (
          <div className="mb-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900">
            <div className="font-medium">Database is behind latest GitHub main/master commit{latestMasterRepo ? ` for ${latestMasterRepo}` : ''}.</div>
            <div className="text-sm mt-1">
              DB: <span className="font-mono">{latestMasterStatus.dbRun?.commit_sha?.substring(0, 8) || 'n/a'}</span>
              {' '}• GitHub: <span className="font-mono">{latestMasterStatus.githubCommit?.sha?.substring(0, 8) || 'n/a'}</span>
            </div>
          </div>
        )}


        {/* Results */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {hasSearched 
                ? `Search Results (${displayResults.length})` 
                : `Recent Runs (${displayResults.length})`}
            </h2>
          </div>

          {(loading || loadingAll) && (
            <div className="p-8 text-center text-gray-500">
              Loading...
            </div>
          )}

          {!loading && !loadingAll && displayResults.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              {hasSearched ? 'No results found' : 'No runs available'}
            </div>
          )}

          {!loading && !loadingAll && displayResults.length > 0 && (
            <div className="divide-y divide-gray-200">
              {displayResults.map((run) => {
                const isSelected = selectedRuns.find(r => r.id === run.id);

                return (
                  <div
                    key={run.id}
                    onClick={() => handleSelectRun(run)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-blue-50 border-l-4 border-l-blue-600' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Run title (commit message title or PR title). Fallback to short commit SHA */}
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {run.run_title ? run.run_title : `Run #${run.id}`}
                          </h3>
                          {run.pr_number && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                              PR #{run.pr_number}
                            </span>
                          )}
                          {run.pr_number && latestRunIdPerPR.has(run.id) && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                              Latest
                            </span>
                          )}
                          {!run.pr_number && latestMainlineRunId === run.id && (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                              Latest master/main
                            </span>
                          )}
                        </div>

                        {/* Commit SHA and Ref */}
                        <div className="flex items-center gap-3 mb-2">
                          <CommitShaLink
                            repoFullName={run.repo_full_name}
                            commitSha={run.commit_sha}
                            stopPropagation={true}
                            linkClassName="text-sm text-blue-700 hover:text-blue-900 hover:underline font-mono"
                            codeClassName="text-sm text-gray-600 font-mono"
                          />
                          {(run.head_ref || run.ref_name) && (
                            <span className="text-sm text-gray-500">
                              <span className="text-gray-400">on</span>{' '}
                              <span className="font-medium">{run.head_ref || run.ref_name}</span>
                            </span>
                          )}
                        </div>

                        {/* Stats */}
                        <RunStatsDisplay
                          variant="inline"
                          stats={{ total: run.total, passed: run.passed, failed: run.failed, intended: run.intended || 0 }}
                          suiteStats={run.suite_stats ?? []}
                        />
                      </div>

                      {/* Date and Selection Indicator */}
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <span className="text-xs text-gray-500">
                          {formatDbDate(run.created_at)}
                        </span>
                        {isSelected && (
                          <div className="flex items-center gap-1 text-blue-600 text-sm font-medium">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Selected
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {selectedRuns.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-blue-600 text-white shadow-lg">
          <div className="max-w-[800px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <span className="font-medium shrink-0">
                {selectedRuns.length} run{selectedRuns.length !== 1 ? 's' : ''} selected
              </span>
              <span className="text-blue-200 text-sm truncate">
                {selectedRuns[0] && (
                  <>
                    <span className="font-semibold text-white">newer:</span>{' '}
                    {selectedRuns[0].run_title || `Run #${selectedRuns[0].id}`}
                  </>
                )}
                {selectedRuns[1] && (
                  <>
                    {' '}<span className="opacity-60">vs</span>{' '}
                    <span className="font-semibold text-white">baseline:</span>{' '}
                    {selectedRuns[1].run_title || `Run #${selectedRuns[1].id}`}
                  </>
                )}
                {selectedRuns.length === 1 && (
                  <span className="opacity-60 ml-2">— select another to compare</span>
                )}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setSelectedRuns([])}
                className="px-4 py-2 text-blue-100 hover:bg-blue-500 rounded-lg font-medium"
              >
                Clear
              </button>
              <button
                onClick={handleViewSelected}
                className="px-4 py-2 bg-white text-blue-700 rounded-lg hover:bg-blue-50 font-medium"
              >
                {selectedRuns.length === 1 ? 'View Run' : 'Compare Runs →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
