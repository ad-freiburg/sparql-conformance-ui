/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useState } from "react";
import MultiSelect from "./Filter";

/** -----------------------------
 * Hook: useFacetedTable
 *  - owns query, sort, filters
 *  - computes counts and filtered rows
 * ------------------------------*/
export function useFacetedTable(data, columns) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: columns[0]?.key ?? "", dir: "asc" });
  const [filterState, setFilterState] = useState({}); // { [colKey]: Set<string> }

  // Unique values per filterable column
  const uniqueByCol = useMemo(() => {
    const map = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      const vals = data.map((row) => String(row[col.key] ?? ""));
      map[col.key] = Array.from(new Set(vals));
    }
    return map;
  }, [data, columns]);

  // Init filters to "all selected"
  useEffect(() => {
    const init = {};
    for (const key of Object.keys(uniqueByCol)) init[key] = new Set(uniqueByCol[key]);
    setFilterState(init);
  }, [uniqueByCol]);

  // Helper to test row with all filters + search
  const rowMatches = useCallback((row, ignoreKey = null) => {
    for (const [key, set] of Object.entries(filterState)) {
      if (key === ignoreKey) continue;
      if (!(set instanceof Set)) continue;
      const v = String(row[key] ?? "");
      if (!set.has(v)) return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q));
  }, [filterState, query, columns]);

  // Facet counts per column, considering other filters + search
  const countsByColumn = useMemo(() => {
    const counts = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      const key = col.key;
      const map = Object.fromEntries((uniqueByCol[key] ?? []).map((v) => [v, 0]));
      for (const row of data) {
        if (!rowMatches(row, key)) continue;
        const v = String(row[key] ?? "");
        if (map[v] !== undefined) map[v] += 1;
      }
      counts[key] = map;
    }
    return counts;
  }, [data, columns, uniqueByCol, rowMatches]);

  // Final filtered + sorted rows
  const filtered = useMemo(() => {
    const rows = data.filter((row) => rowMatches(row));
    rows.sort((a, b) => {
      const av = String(a[sort.key] ?? "").toLowerCase();
      const bv = String(b[sort.key] ?? "").toLowerCase();
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, sort, rowMatches]);

  const toggleSort = (key) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  return {
    // state
    query, setQuery,
    sort, setSort,
    filterState, setFilterState,
    // derived
    uniqueByCol,
    countsByColumn,
    filtered,
    // actions
    toggleSort,
  };
}

export function FilterPanel({ columns, table }) {
  const {
    query, setQuery,
    filterState, setFilterState,
    countsByColumn,
      uniqueByCol,
  } = table;

  return (
    <aside className="w-[640px] shrink-0 border-r bg-gray-50 dark:bg-gray-900/40 p-4 md:p-5">
      <h2 className="text-lg font-semibold mb-4">Filters</h2>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium">Search</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any column…"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none
                     placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500
                     dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <div className="space-y-3">
        {columns
          .filter((c) => c.filterable)
          .map((c) => (
            <MultiSelect
              key={c.key}
              label={`Filter by ${c.label}`}
              values={uniqueByCol[c.key] ?? []}
              selected={filterState[c.key] ?? new Set()}
              countsByValue={countsByColumn[c.key] ?? {}}
              onChange={(nextSet) =>
                setFilterState((prev) => ({ ...prev, [c.key]: nextSet }))
              }
              itemToString={(v) => String(v ?? "")}
            />
          ))}
      </div>
    </aside>
  );
}

export function DataTableView({ columns, table, totalCount }) {
  const { filtered, sort, toggleSort } = table;

  return (
    <div className="flex-1 min-w-0 min-h-0 p-4 md:p-6">
      <div aria-live="polite" className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Showing {filtered.length} of {totalCount}
      </div>

      <div className="overflow-auto min-w-0 max-h-[1200px] rounded-2xl border border-gray-200 bg-white shadow-sm
                      dark:border-gray-800 dark:bg-gray-900">
        <table className="text-left text-sm">
          <thead className=" sticky top-0 bg-gray-50 dark:bg-gray-800/60">
            <tr>
              {columns.map((h) => {
                const active = sort.key === h.key;
                const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
                return (
                  <th key={h.key} scope="col" aria-sort={ariaSort}
                      className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">
                    <button onClick={() => toggleSort(h.key)} className="inline-flex items-center gap-1">
                      <span>{h.label}</span>
                      <svg aria-hidden viewBox="0 0 20 20"
                           className={`h-4 w-4 transition ${active ? "opacity-100" : "opacity-30"}`}>
                        <path
                          d="M7 8l3-3 3 3M7 12l3 3 3-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={sort.dir === "asc" ? "" : "rotate-180"}
                        />
                      </svg>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className={i % 2 ? "bg-gray-100 " : ""}>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
