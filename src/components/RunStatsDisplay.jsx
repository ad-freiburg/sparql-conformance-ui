import { normalizeDisplayValue } from '../utils/displayMappings';

export default function RunStatsDisplay({ stats, suiteStats = [], variant = 'inline' }) {
  const hasSuites = suiteStats.length > 0;

  if (variant === 'cards') {
    const cards = [
      { label: 'Total Tests',        value: stats.total,    suiteValue: s => s.total,    bg: 'bg-gray-100',   text: 'text-gray-800',  divider: 'border-gray-300',  sub: 'text-gray-600' },
      { label: 'Passed',             value: stats.passed,   suiteValue: s => s.passed,   bg: 'bg-green-100',  text: 'text-green-800', divider: 'border-green-300', sub: 'text-green-700' },
      { label: 'Intended Deviation', value: stats.intended, suiteValue: s => s.intended, bg: 'bg-yellow-100', text: 'text-yellow-800',divider: 'border-yellow-300',sub: 'text-yellow-700' },
      { label: 'Failed',             value: stats.failed,   suiteValue: s => s.failed,   bg: 'bg-red-100',    text: 'text-red-800',   divider: 'border-red-300',   sub: 'text-red-700' },
    ];

    return (
      <div className="grid grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className={`rounded-lg p-4 ${card.bg} ${card.text}`}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-medium">{card.label}</span>
              <span className="text-2xl font-bold">{card.value}</span>
            </div>
            {hasSuites && (
              <div className={`border-t ${card.divider} pt-2 space-y-1`}>
                {suiteStats.map(s => (
                  <div key={s.suite} className="flex justify-between text-xs">
                    <span className="opacity-70">{normalizeDisplayValue('suite', s.suite)}</span>
                    <span className={`font-semibold ${card.sub}`}>{card.suiteValue(s)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'compact-grid') {
    const cols = [
      { label: 'Total',    value: stats.total,    suiteValue: s => s.total,    color: 'text-gray-900',   subColor: 'text-gray-600' },
      { label: 'Passed',   value: stats.passed,   suiteValue: s => s.passed,   color: 'text-green-600',  subColor: 'text-green-600' },
      { label: 'Intended', value: stats.intended, suiteValue: s => s.intended, color: 'text-yellow-600', subColor: 'text-yellow-600' },
      { label: 'Failed',   value: stats.failed,   suiteValue: s => s.failed,   color: 'text-red-600',    subColor: 'text-red-600' },
    ];

    return (
      <div className="grid grid-cols-4 gap-2">
        {cols.map(col => (
          <div key={col.label}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-gray-600">{col.label}</span>
              <span className={`text-lg font-bold ${col.color}`}>{col.value}</span>
            </div>
            {hasSuites && (
              <div className="space-y-0.5">
                {suiteStats.map(s => (
                  <div key={s.suite} className="flex justify-between text-xs">
                    <span className="text-gray-400">{normalizeDisplayValue('suite', s.suite)}</span>
                    <span className={`font-medium ${col.subColor}`}>{col.suiteValue(s)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // inline variant — run list pages
  const passRate = stats.total > 0
    ? ((stats.passed / stats.total) * 100).toFixed(1)
    : '0.0';

  const passRateColor = parseFloat(passRate) >= 80
    ? 'text-green-600'
    : parseFloat(passRate) >= 50
    ? 'text-yellow-600'
    : 'text-red-600';

  if (!hasSuites) {
    return (
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="text-gray-600"><span className="font-semibold text-green-600">{stats.passed}</span> passed</span>
        <span className="text-gray-600"><span className="font-semibold text-red-600">{stats.failed}</span> failed</span>
        <span className="text-gray-600"><span className="font-semibold text-yellow-600">{stats.intended}</span> intended</span>
        <span className="text-gray-600"><span className="font-semibold">{stats.total}</span> total</span>
        <span className={`font-semibold ${passRateColor}`}>{passRate}% pass rate</span>
      </div>
    );
  }

  return (
    <table className="text-xs border-separate border-spacing-x-3 border-spacing-y-0">
      <tbody>
        <tr className="text-sm">
          <td className="font-medium text-gray-500 pr-1">All</td>
          <td className="text-gray-600"><span className="font-semibold text-green-600">{stats.passed}</span> passed</td>
          <td className="text-gray-600"><span className="font-semibold text-red-600">{stats.failed}</span> failed</td>
          <td className="text-gray-600"><span className="font-semibold text-yellow-600">{stats.intended}</span> intended</td>
          <td className="text-gray-600"><span className="font-semibold">{stats.total}</span> total</td>
          <td className={`font-semibold ${passRateColor}`}>{passRate}% pass rate</td>
        </tr>
        {suiteStats.map(s => (
          <tr key={s.suite} className="text-xs text-gray-500">
            <td className="font-medium text-gray-600">{normalizeDisplayValue('suite', s.suite)}</td>
            <td><span className="font-semibold text-green-600">{s.passed}</span> passed</td>
            <td><span className="font-semibold text-red-600">{s.failed}</span> failed</td>
            <td><span className="font-semibold text-yellow-600">{s.intended}</span> intended</td>
            <td><span className="font-semibold text-gray-700">{s.total}</span> total</td>
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
