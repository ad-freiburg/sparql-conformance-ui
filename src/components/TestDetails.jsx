import { useState, useEffect, useRef } from 'react';
import { getOverviewEntries, getAllEntries } from '../utils/testDetailsHelpers';
import { StatusBadge, CloseButton, TabsAndToggles } from './TestDetailsUI';
import FieldValueRenderer from './FieldValueRenderer';

/**
 * Displays comprehensive test information below the table with Overview and Details tabs
 * Supports toggle modes for showing/hiding matching text and intended differences
 */
export default function TestDetails({ test, onClose }) {
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
  }, [test?.testName]);

  if (!test) return null;

  const entries = activeTab === 'overview' 
    ? getOverviewEntries(test) 
    : getAllEntries(test);

  return (
    <div ref={containerRef} className="bg-white rounded-xl shadow-lg border border-gray-200 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-gray-50">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{test.testName}</h2>
          <div className="mt-2">
            <StatusBadge status={test.status} errorType={test.errorType} />
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

      {/* Content */}
      <div className="p-6 max-h-[80vh] overflow-y-auto">
        <div className="space-y-6">
          {entries.map((entry, index) => {
            // Skip if no value
            if (!entry.value && entry.value !== 0 && entry.value !== false) {
              return null;
            }

            return (
              <div key={`${entry.key}-${index}`} className="border-b pb-4 last:border-b-0">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{entry.label}</h3>
                <FieldValueRenderer
                  entry={entry}
                  test={test}
                  toggleMatching={toggleMatching}
                  toggleIntended={toggleIntended}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
