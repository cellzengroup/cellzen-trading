import React, { useState, useMemo } from 'react';

export default function DataTable({ columns, data, searchable = true, searchPlaceholder = 'Search...' }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const filtered = useMemo(() => {
    if (!search) return data;
    const term = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? col.accessor(row) : row[col.key];
        return val && String(val).toLowerCase().includes(term);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      const aVal = col?.accessor ? col.accessor(a) : a[sortKey];
      const bVal = col?.accessor ? col.accessor(b) : b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div>
      {searchable && (
        <div className="mb-4">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
          />
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-[1.2rem] shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    col.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span>{sortDir === 'asc' ? ' ^' : ' v'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  No data found
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-gray-50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {col.render ? col.render(row) : (col.accessor ? col.accessor(row) : row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
