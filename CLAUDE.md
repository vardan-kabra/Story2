# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Where the project lives

The working code is the **`ask-hr-pilot/`** Next.js app. The repo root only also
contains unrelated placeholder files (`chapter1.txt`, `chapter2.txt`, a stub
`README.md`). Run every command below from inside `ask-hr-pilot/`:

```bash
cd ask-hr-pilot
```

## Commands

```bash
npm install            # install deps (no native build — SQLite is sql.js/WASM)
cp .env.example .env.local   # then set ANTHROPIC_API_KEY in .env.local
npm run seed           # (re)build data/ask-hr.db from data/seed.sql — run after editing seed.sql
npm run dev            # dev server at http://localhost:3000
npm run build          # production build
npm start              # serve the production build
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
```

**Environment** (read from `.env.local`, never hardcoded):
`ANTHROPIC_API_KEY` (required), `ASK_HR_MODEL` (default `claude-opus-4-8`),
`ASK_HR_DB_PATH` (default `./data/ask-hr.db`).

**Testing:** there is no test framework wired up. Verification is done via
`npm run typecheck` + `npm run build`, plus throwaway `npx tsx` scripts that
import `lib/` and run queries against the seeded DB. The repeatable pattern for
an ad-hoc check (used during development) is:

```bash
# write a temp .ts that calls ensureDb() then the functions, then:
npx tsx scratch.ts && rm scratch.ts
```

Anything touching `lib/db.ts` or `lib/safeQueries.ts` must call
`await ensureDb()` before `getDb()` / any query function.

## Core invariant (the whole point of the app)

**Claude never generates or executes SQL.** It is only given a menu of
allow-listed *tools* (name + description + JSON schema). It selects a tool and
arguments; the backend validates permissions and runs the corresponding
hand-written, parameterised query. The tool set is the only door to the data —
widening what's answerable means adding a safe function, not letting the model
near the database.

## Architecture (request flow)

`app/api/ask/route.ts` (Node runtime, `force-dynamic`) builds a `Principal`
from the request body and calls `askHr()` in `lib/anthropic.ts`, which runs the
agent loop:

1. `ensureDb()` (must precede any query), then `client.messages.create` with
   `model = claude-opus-4-8`, `thinking: { type: "adaptive" }`, the full tool
   list (`toolDefinitions()`), and a scope-aware system prompt.
2. While `stop_reason === "tool_use"`, for each `tool_use` block:
   - **Authorize** (two layers, both server-side — see below). Denied calls are
     returned to Claude as `tool_result` errors, not silently dropped.
   - For `CAMPUS_HEAD`, `shouldForceCampus()` rewrites any `campus` argument to
     their own campus before execution.
   - Run `spec.execute(input)` (the safe query), then `scopeRecords()` filters
     the rows to what the principal may see.
   - **Only the scoped rows are fed back to Claude** and collected as `sources`.
3. When Claude stops calling tools, its text is the `answer`. The response also
   returns `toolsUsed`, `sources`, `sourceLabels`, and a `confidence` note.

The frontend (`app/page.tsx`, a client component) posts
`{ query, role, campus, employeeName }` and renders the answer, tool badges,
the source-records table, and query history.

## Two-layer access control

This is the part that requires reading several files together:

- **`lib/auth.ts`** — coarse role gate. `Role` is `HR_ADMIN | CAMPUS_HEAD |
  EMPLOYEE`. `hasAccess(role, requiredRoles)` enforces the `requiredRoles` set
  on a tool (used for the two elevated tools).
- **`lib/access.ts`** — the `Principal` (role + `campus` for CAMPUS_HEAD +
  `employeeName` for EMPLOYEE) and the scoping logic:
  - `authorizeTool()` — runs **before** a query. EMPLOYEE is restricted to an
    allow-list (`EMPLOYEE_ALLOWED`); CAMPUS_HEAD must have a campus set.
  - `scopeRecords()` — runs **after** a query. HR_ADMIN sees all; CAMPUS_HEAD
    keeps only rows whose `campus` matches theirs (rows with no `campus` field,
    e.g. policies, are kept); EMPLOYEE keeps only rows whose subject is
    themselves (subject field per tool is in `SUBJECT_KEY`).
  - `CAMPUS_INPUT_TOOLS` / `shouldForceCampus()` — which tools get their campus
    argument forced.

For scoping to work, **records must carry the field scoping filters on**.
Employee-ish queries in `lib/safeQueries.ts` select `campus` (campus code) so
CAMPUS_HEAD filtering applies. The `Principal` is currently supplied by the
client for demo purposes — real auth/campus/identity would come from the
Nucleus session. Integration points are marked `NUCLEUS ERP INTEGRATION POINT`
in `auth.ts`, `access.ts`, and `route.ts`.

## Adding a new safe query (the common change)

1. **`lib/safeQueries.ts`** — implement the function. Use **parameterised** SQL
   only (never interpolate input). Return a `QueryResult`
   (`{ records, source, note? }`). If the data should be campus-filterable,
   include a `campus` column in the records.
2. **`lib/tools.ts`** — add an entry to `TOOLS`: a `definition` (name +
   description + `input_schema`), an `execute` that adapts the tool input to the
   safe function, and optional `requiredRoles` (use `ELEVATED` for org-wide
   data).
3. **`lib/access.ts`** — if EMPLOYEE should be able to call it, add it to
   `EMPLOYEE_ALLOWED` and give it a `SUBJECT_KEY`. If it takes a campus
   argument, add it to `CAMPUS_INPUT_TOOLS`.

## Data layer specifics

- **`lib/db.ts`** uses **sql.js** (SQLite compiled to WASM — chosen over
  `better-sqlite3` to avoid native compilation, especially on Windows). The DB
  file is loaded into memory and never written back, so the app's view is
  effectively read-only.
- `ensureDb()` is async (caches an init promise); `getDb()` is the synchronous
  accessor used by the query functions and throws if `ensureDb()` hasn't run.
- `locateWasm()` resolves `sql-wasm.wasm` via `process.cwd()/node_modules/...`
  first because `require.resolve("sql.js")` is rewritten by the Next.js bundler
  and returns a bad path at runtime. `sql.js` is in `serverExternalPackages`
  (`next.config.mjs`) so it is not bundled.
- HR policies are a JSON knowledge base (`data/hrPolicies.json`), retrieved by
  keyword/title scoring in `lib/policies.ts`; every policy carries a `source`
  citation that answers must cite.

## Gotchas

- `getClient()` throws if `ANTHROPIC_API_KEY` is unset — this happens *before*
  DB init, so a missing-key request never exercises the WASM path.
- Model id is exactly `claude-opus-4-8` with **adaptive thinking only**
  (`thinking: { type: "adaptive" }`); do not add `budget_tokens` or sampling
  params (they 400 on this model). Requires `@anthropic-ai/sdk` ≥ 0.100.
- After editing `data/seed.sql`, you must re-run `npm run seed`.
- The full assistant turn (`response.content`, including thinking + tool_use
  blocks) is pushed back into `messages` each loop iteration — keep it intact.

## Possible future features

A backlog of enhancements that fit the architecture:

- **`getCampuses()` discovery tool** — so "across all campuses" questions fan
  out over *every* campus instead of only the ones named in the prompt
  (currently a real completeness gap; Claude can miss campuses it wasn't told
  about, e.g. FHQ).
- **Audit logging** — persist every query, chosen tool, principal, and returned
  record ids (a stated Nucleus production requirement).
- **Real authentication / Nucleus session** — replace the client-supplied
  `Principal` with an authenticated identity + role + campus; map safe queries
  to approved ERP endpoints/read replicas instead of local SQLite.
- **More safe queries** — attendance, joining-document status, salary
  (HR_ADMIN-only + field-level redaction), team/org-chart traversal.
- **Streaming responses** — stream the final answer token-by-token (SDK
  `messages.stream` / `.finalMessage()`) for better UX on longer answers.
- **Multi-turn conversation** — keep prior turns so follow-ups ("and Ramesh?")
  work; currently each request is independent.
- **Pagination / large result handling** — cap and page big tables, and
  summarise rather than dumping all rows to the model.
- **Automated tests** — unit tests for `safeQueries`/`access` scoping and an
  integration test for the `/api/ask` tool loop.
- **Rate limiting & cost controls** on `/api/ask`.
- **Policy KB upgrades** — source policies from approved, versioned documents;
  optionally embeddings-based retrieval instead of keyword scoring.
