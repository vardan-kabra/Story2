"use client";

import type { Role } from "@/lib/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "HR_ADMIN", label: "HR_ADMIN (full access)" },
  { value: "CAMPUS_HEAD", label: "CAMPUS_HEAD (campus-wide views)" },
  { value: "EMPLOYEE", label: "EMPLOYEE (limited access)" },
];

const EXAMPLES = [
  "How many casual leaves does Priya have left?",
  "Who is the reporting manager for Ramesh?",
  "Show me all employees from FWGS whose joining date is after April 2025.",
  "What is the maternity leave policy?",
  "Which HR requests are pending for more than 7 days?",
  "Summarize the leave status of all teachers at FSK.",
  "Which employees report to Ankita?",
  "What documents are needed for reimbursement?",
];

export default function ChatBox({
  query,
  setQuery,
  role,
  setRole,
  loading,
  onSubmit,
}: {
  query: string;
  setQuery: (v: string) => void;
  role: Role;
  setRole: (r: Role) => void;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="panel">
      <div className="row">
        <div className="grow">
          <label htmlFor="query">Ask a question</label>
          <textarea
            id="query"
            rows={3}
            placeholder="e.g. How many casual leaves does Priya have left?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
            }}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="role">Acting as role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={onSubmit} disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <span className="spinner" />
              Asking…
            </>
          ) : (
            "Ask HR"
          )}
        </button>
        <span className="note">Tip: press ⌘/Ctrl + Enter to submit.</span>
      </div>

      <div style={{ marginTop: 16 }}>
        <p className="section-title">Try an example</p>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="example"
              disabled={loading}
              onClick={() => setQuery(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
