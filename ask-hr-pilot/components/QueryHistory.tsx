"use client";

import type { HistoryEntry } from "@/lib/types";

export default function QueryHistory({
  history,
  onSelect,
  onClear,
}: {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <div className="panel">
        <p className="section-title">Query history</p>
        <p className="note">No queries yet — ask something above.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="section-title" style={{ margin: 0 }}>
          Query history ({history.length})
        </p>
        <button className="secondary" onClick={onClear}>
          Clear
        </button>
      </div>
      <div style={{ marginTop: 10 }}>
        {history.map((entry) => (
          <div
            key={entry.id}
            className="history-item"
            onClick={() => onSelect(entry)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(entry);
            }}
          >
            <div className="history-q">{entry.query}</div>
            <div className="history-meta">
              {entry.role} · {new Date(entry.at).toLocaleTimeString()}
              {entry.response.toolsUsed.length > 0 &&
                ` · ${entry.response.toolsUsed.map((t) => t.tool).join(", ")}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
