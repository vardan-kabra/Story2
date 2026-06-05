import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const DB_PATH =
  process.env.ASK_HR_DB_PATH || path.join(process.cwd(), "data", "ask-hr.db");

/**
 * Minimal query adapter exposing the subset of the better-sqlite3 API the safe
 * query layer uses (`prepare().all()` / `prepare().get()`), backed by sql.js.
 *
 * sql.js is a pure WASM build of SQLite — no native compilation, so it installs
 * cleanly on any OS/Node version. The database file is loaded into memory and
 * never written back here, so the app's view of the data is effectively
 * read-only (Claude never gets to run SQL at all).
 */
export interface Stmt {
  all: (...params: unknown[]) => Record<string, unknown>[];
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
}

export interface DbAdapter {
  prepare: (sql: string) => Stmt;
}

let adapter: DbAdapter | null = null;
let initPromise: Promise<DbAdapter> | null = null;

function wrap(db: SqlJsDatabase): DbAdapter {
  return {
    prepare(sql: string): Stmt {
      return {
        all(...params: unknown[]): Record<string, unknown>[] {
          const stmt = db.prepare(sql);
          try {
            if (params.length) stmt.bind(params as never[]);
            const rows: Record<string, unknown>[] = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        get(...params: unknown[]): Record<string, unknown> | undefined {
          const stmt = db.prepare(sql);
          try {
            if (params.length) stmt.bind(params as never[]);
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.free();
          }
        },
      };
    },
  };
}

/**
 * Initialises the database once and caches it. Call this before issuing any
 * query (the safe query functions stay synchronous via `getDb()`).
 */
export async function ensureDb(): Promise<DbAdapter> {
  if (adapter) return adapter;
  if (!initPromise) {
    initPromise = (async () => {
      if (!fs.existsSync(DB_PATH)) {
        throw new Error(
          `Database not found at ${DB_PATH}. Run "npm run seed" to create it.`,
        );
      }
      const sqlJsDist = path.dirname(require.resolve("sql.js"));
      const wasmBinary = fs.readFileSync(path.join(sqlJsDist, "sql-wasm.wasm"));
      const SQL = await initSqlJs({ wasmBinary: wasmBinary as unknown as ArrayBuffer });
      const fileBuffer = fs.readFileSync(DB_PATH);
      adapter = wrap(new SQL.Database(fileBuffer));
      return adapter;
    })();
  }
  return initPromise;
}

/** Returns the initialised adapter (throws if `ensureDb()` hasn't run yet). */
export function getDb(): DbAdapter {
  if (!adapter) {
    throw new Error("Database not initialised. Call ensureDb() before querying.");
  }
  return adapter;
}
