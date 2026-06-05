"use client";

import { useState } from "react";
import ChatBox from "@/components/ChatBox";
import ResultsTable from "@/components/ResultsTable";
import QueryHistory from "@/components/QueryHistory";
import type { AskResponse, HistoryEntry, Role } from "@/lib/types";

export default function Page() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role>("HR_ADMIN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [askedQuery, setAskedQuery] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  async function onSubmit() {
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setAskedQuery(q);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, role }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status}).`);
        return;
      }

      const response = data as AskResponse;
      setResult(response);
      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          query: q,
          role,
          response,
          at: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  function onSelectHistory(entry: HistoryEntry) {
    setQuery(entry.query);
    setRole(entry.role);
    setResult(entry.response);
    setAskedQuery(entry.query);
    setError(null);
  }

  return (
    <main className="container">
      <h1>Ask HR — Pilot</h1>
      <p className="subtitle">
        Natural-language HR queries answered through safe, predefined query
        functions. Claude never writes or runs SQL.
      </p>

      <ChatBox
        query={query}
        setQuery={setQuery}
        role={role}
        setRole={setRole}
        loading={loading}
        onSubmit={onSubmit}
      />

      {error && (
        <div className="panel">
          <p className="section-title">Error</p>
          <p className="error">{error}</p>
        </div>
      )}

      {result && (
        <div className="panel">
          <p className="section-title">Answer</p>
          {askedQuery && (
            <p className="note" style={{ marginTop: -4 }}>
              Q: {askedQuery}
            </p>
          )}
          <p className="answer">{result.answer}</p>

          {result.confidence && (
            <div className="confidence">⚠ {result.confidence}</div>
          )}

          <div className="badges">
            {result.toolsUsed.map((t, i) => (
              <span
                key={i}
                className={`badge ${t.allowed ? "ok" : "denied"}`}
                title={t.note || ""}
              >
                {t.allowed ? "✓" : "✕"} {t.tool}
                {t.allowed ? ` (${t.recordCount})` : ""}
              </span>
            ))}
            {result.toolsUsed.length === 0 && (
              <span className="badge">no tools used</span>
            )}
          </div>

          {result.sourceLabels.length > 0 && (
            <p className="note" style={{ marginTop: 10 }}>
              Sources: {result.sourceLabels.join(" · ")}
            </p>
          )}
        </div>
      )}

      {result && <ResultsTable records={result.sources} />}

      <QueryHistory
        history={history}
        onSelect={onSelectHistory}
        onClear={() => setHistory([])}
      />
    </main>
  );
}
