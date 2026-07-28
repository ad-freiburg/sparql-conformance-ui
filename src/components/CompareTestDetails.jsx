import { useState, useEffect, useRef } from 'react';
import { getOverviewEntries, getAllEntries } from '../utils/testDetailsHelpers';
import { StatusBadge, CloseButton, TabsAndToggles } from './TestDetailsUI';
import FieldValueRenderer from './FieldValueRenderer';

/**
 * Displays comprehensive test information for two test runs side by side for comparison
 * Toggle modes for showing/hiding matching text and intended differences
 */
export default function CompareTestDetails({ test1, test2, onClose, run1Label = "Run 1", run2Label = "Run 2" }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [toggleMatching, setToggleMatching] = useState(false);
  const [toggleIntended, setToggleIntended] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset tab and scroll the panel into view when test changes
  useEffect(() => {
    setActiveTab('overview');
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [test1?.testName, test2?.testName]);

  if (!test1 && !test2) return null;

  const testName = test1?.testName || test2?.testName;

  const entries1 = activeTab === 'overview' ? getOverviewEntries(test1) : getAllEntries(test1);
  const entries2 = activeTab === 'overview' ? getOverviewEntries(test2) : getAllEntries(test2);

  // Get unique labels from both entry sets
  const allLabels = new Set([
    ...entries1.map(e => e.label),
    ...entries2.map(e => e.label)
  ]);

  return (
    <div ref={containerRef} className="bg-white rounded-xl shadow-lg border border-gray-200 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-gray-50">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{testName}</h2>
          <div className="flex gap-3 mt-2">
            {/* Test1 Status */}
            {test1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">{run1Label}:</span>
                <StatusBadge status={test1.status} errorType={test1.errorType} />
              </div>
            )}
            {/* Separator */}
            {test1 && test2 && <span className="text-gray-400">|</span>}
            {/* Test2 Status */}
            {test2 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">{run2Label}:</span>
                <StatusBadge status={test2.status} errorType={test2.errorType} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <CloseButton onClick={onClose} />
        </div>
      </div>

      {/* Tabs and Toggles */}
      <TabsAndToggles
        activeTab={activeTab}
        onTabChange={setActiveTab}
        toggleMatching={toggleMatching}
        toggleIntended={toggleIntended}
        onToggleMatching={setToggleMatching}
        onToggleIntended={setToggleIntended}
      />

      {/* Content - Side by Side */}
      <div className="p-6 max-h-[80vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-6">
          {/* Run 1 Column */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">
              {run1Label}
            </h3>
            <div className="space-y-6">
              {Array.from(allLabels).map((label) => {
                const entry = entries1.find(e => e.label === label);
                
                return (
                  <div key={label} className="border-b pb-4 last:border-b-0">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{label}</h4>
                    <FieldValueRenderer
                      entry={entry}
                      test={test1}
                      toggleMatching={toggleMatching}
                      toggleIntended={toggleIntended}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Run 2 Column */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b-2 border-green-500">
              {run2Label}
            </h3>
            <div className="space-y-6">
              {Array.from(allLabels).map((label) => {
                const entry = entries2.find(e => e.label === label);
                
                return (
                  <div key={label} className="border-b pb-4 last:border-b-0">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{label}</h4>
                    <FieldValueRenderer
                      entry={entry}
                      test={test2}
                      toggleMatching={toggleMatching}
                      toggleIntended={toggleIntended}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
