import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import CommitShaLink from '../components/CommitShaLink';
import RunStatsDisplay from '../components/RunStatsDisplay';
import { formatDbDate } from '../utils/formatDate';

export default function ManualEngineRunsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRuns, setSelectedRuns] = useState([]);

  useEffect(() => {
    loadManualRuns();
  }, []);

  const loadManualRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_ENDPOINTS.runs({ source: 'manual', limit: 100 }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRuns(data.results || []);
    } catch (err) {
      setError(err.message || 'Failed to load manual runs');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRun = (run) => {
    const isSelected = selectedRuns.some((r) => r.id === run.id);

    if (isSelected) {
      setSelectedRuns(selectedRuns.filter((r) => r.id !== run.id));
      return;
    }

    if (selectedRuns.length >= 2) {
      setSelectedRuns([selectedRuns[1], run]);
      return;
    }

    setSelectedRuns([...selectedRuns, run]);
  };

  const handleOpen = () => {
    if (selectedRuns.length === 1) {
      navigate(`/run/${selectedRuns[0].id}`, { state: { from: location.pathname } });
    } else if (selectedRuns.length === 2) {
      navigate(`/compare/${selectedRuns[0].id}/${selectedRuns[1].id}`, { state: { from: location.pathname } });
    }
  };

  return (
    <div className="max-w-[800px] mx-auto py-8 px-4 pb-20">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Standard Conformance Results
            </h1>
            <p className="text-gray-600">
              Manually uploaded engine results are listed here.
            </p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Back to Main Search
          </Link>
        </div>


        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            Error: {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Manual Engine Runs ({runs.length})
            </h2>
          </div>

          {loading && (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          )}

          {!loading && runs.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No manual runs found. Upload using curl and x-api-key.
            </div>
          )}

          {!loading && runs.length > 0 && (
            <div className="divide-y divide-gray-200">
              {runs.map((run) => {
                const isSelected = selectedRuns.some((r) => r.id === run.id);

                return (
                  <div
                    key={run.id}
                    onClick={() => handleSelectRun(run)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {run.run_title || `Run #${run.id}`}
                          </h3>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                            {run.engine_name || 'unknown-engine'}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                            {run.engine_version || 'unknown'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mb-2">
                          <CommitShaLink
                            repoFullName={run.repo_full_name}
                            commitSha={run.commit_sha}
                            stopPropagation={true}
                            linkClassName="text-sm text-blue-700 hover:text-blue-900 hover:underline font-mono"
                            codeClassName="text-sm text-gray-600 font-mono"
                          />
                          <span className="text-sm text-gray-500">
                            {run.repo_full_name}
                          </span>
                        </div>

                        <RunStatsDisplay
                          variant="inline"
                          stats={{ total: run.total, passed: run.passed, failed: run.failed, intended: run.intended || 0 }}
                          suiteStats={run.suite_stats ?? []}
                        />
                      </div>

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
                onClick={handleOpen}
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
