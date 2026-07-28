import { useMemo } from "react";

export default function MultiSelect({
  label,
  values = [],               
  selected = new Set(),       
  onChange,
  itemToString = (v) => String(v ?? ""),
  countsByValue = {},         // { [valueString]: number }
}) {
  const { unique, filtered } = useMemo(() => {
    const uniq = Array.from(new Set(values.map(itemToString))).sort((a, b) => a.localeCompare(b));
    return {
      unique: uniq,
      filtered: uniq,
    };
  }, [values, itemToString]);

  return (
    <fieldset className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm
                         dark:border-gray-800 dark:bg-gray-900">
      <legend className="px-1 text-sm font-medium">{label}</legend>

      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange?.(new Set(unique.filter((v) => (countsByValue[v] ?? 0) > 0)))}
          className="rounded-xl border px-3 py-2 text-sm
                     border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onChange?.(new Set())}
          className="rounded-xl border px-3 py-2 text-sm
                     border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Clear all
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 p-2
                      dark:border-gray-800">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-sm text-gray-500">No matches.</div>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {filtered.map((v) => {
              const id = `${label}-${v}`;
              const checked = selected.has(v);
              const count = countsByValue[v] ?? 0;
              const disabled = count === 0;
              return (
                <li key={v} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1">
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      aria-disabled={disabled}
                      title={disabled ? "No rows match this option with current filters" : undefined}
                      onChange={() => {
                        const next = new Set(selected);
                        checked ? next.delete(v) : next.add(v);
                        onChange?.(next);
                      }}
                      className="h-4 w-4 accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <label
                      htmlFor={id}
                      className={`text-sm ${disabled ? "text-gray-400" : ""}`}
                    >
                      {v || <span className="italic text-gray-500">(empty)</span>}
                    </label>
                  </div>
                  <span
                    className={`text-[11px] tabular-nums rounded-md px-1.5 py-0.5
                                ${disabled ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                                            : "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
                    aria-label={`Count: ${count}`}
                  >
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
