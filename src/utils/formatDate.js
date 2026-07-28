// Parse a DB timestamp. SQLite datetime('now') gives "YYYY-MM-DD HH:MM:SS"
// (UTC, but timezone-naive) which JS otherwise parses as local time.
export function parseDbDate(value) {
  if (!value) return null;
  let s = String(value);
  // Already ISO with T and a zone (Z or +hh:mm / -hh:mm) → parse as-is.
  const hasZone = /[Tt].*(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(s);
  if (!hasZone) {
    s = s.replace(' ', 'T') + 'Z'; // treat naive value as UTC
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Format a DB timestamp in the viewer's local timezone.
export function formatDbDate(value, options) {
  const d = parseDbDate(value);
  return d ? d.toLocaleString('en-GB', options) : '';
}
