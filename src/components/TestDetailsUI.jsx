/**
 * Shared UI components for TestDetails panels
 */

import { normalizeDisplayValue } from '../utils/displayMappings';

export function StatusBadge({ status, errorType }) {
  const displayStatus = normalizeDisplayValue('status', status);
  const displayErrorType = normalizeDisplayValue('errorType', errorType);
  
  return (
    <div className="flex gap-3">
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
        displayStatus === 'Passed' ? 'bg-green-100 text-green-800' :
        displayStatus === 'Failed' ? 'bg-red-100 text-red-800' :
        'bg-gray-100 text-gray-800'
      }`}>
        {displayStatus}
      </span>
      {displayErrorType && (
        <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
          {displayErrorType}
        </span>
      )}
    </div>
  );
}

export function CloseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-gray-400 hover:text-gray-600 transition-colors"
      aria-label="Close test details"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

export function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 font-medium transition-colors ${
        active
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );
}

export function ToggleSwitches({ 
  toggleMatching, 
  toggleIntended, 
  onToggleMatching, 
  onToggleIntended 
}) {
  return (
    <div className="flex gap-4 pb-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={toggleMatching}
          onChange={(e) => onToggleMatching(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Toggle Matching</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={toggleIntended}
          onChange={(e) => onToggleIntended(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Toggle Intended</span>
      </label>
    </div>
  );
}

export function TabsAndToggles({ 
  activeTab, 
  onTabChange,
  toggleMatching, 
  toggleIntended, 
  onToggleMatching, 
  onToggleIntended 
}) {
  return (
    <div className="flex items-center justify-between px-6 pt-4 border-b">
      <div className="flex gap-1">
        <TabButton 
          label="Overview" 
          active={activeTab === 'overview'} 
          onClick={() => onTabChange('overview')} 
        />
        <TabButton 
          label="Details" 
          active={activeTab === 'details'} 
          onClick={() => onTabChange('details')} 
        />
      </div>
      <ToggleSwitches
        toggleMatching={toggleMatching}
        toggleIntended={toggleIntended}
        onToggleMatching={onToggleMatching}
        onToggleIntended={onToggleIntended}
      />
    </div>
  );
}
