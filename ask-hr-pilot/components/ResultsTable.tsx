"use client";

/**
 * Renders source records returned by the safe queries as a simple table.
 * Columns are derived from the union of keys across the records.
 */
export default function ResultsTable({
  records,
}: {
  records: Record<string, unknown>[];
}) {
  if (!records || records.length === 0) return null;

  // Build a stable column order: `_tool` first (provenance), then the rest.
  const keys: string[] = [];
  for (const rec of records) {
    for (const k of Object.keys(rec)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  keys.sort((a, b) => (a === "_tool" ? -1 : b === "_tool" ? 1 : 0));

  const format = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="panel">
      <p className="section-title">Source records ({records.length})</p>
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => (
            <tr key={idx}>
              {keys.map((k) => (
                <td key={k}>{format(rec[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
