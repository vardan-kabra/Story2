/**
 * Seeds the local SQLite database from data/seed.sql.
 *
 * Usage: npm run seed
 *
 * Uses sql.js (pure WASM SQLite — no native build) to execute the schema +
 * sample data and write data/ask-hr.db. The app opens that file read-only.
 */
import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const ROOT = process.cwd();
const DB_PATH = process.env.ASK_HR_DB_PATH || path.join(ROOT, "data", "ask-hr.db");
const SQL_PATH = path.join(ROOT, "data", "seed.sql");

async function main() {
  if (!fs.existsSync(SQL_PATH)) {
    console.error(`Could not find seed SQL at ${SQL_PATH}`);
    process.exit(1);
  }

  // Start fresh so re-running the seed is deterministic.
  for (const suffix of ["", "-shm", "-wal"]) {
    const f = DB_PATH + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }

  const seedSql = fs.readFileSync(SQL_PATH, "utf8");

  const sqlJsDist = path.dirname(require.resolve("sql.js"));
  const wasmBinary = fs.readFileSync(path.join(sqlJsDist, "sql-wasm.wasm"));
  const SQL = await initSqlJs({ wasmBinary: wasmBinary as unknown as ArrayBuffer });

  const db = new SQL.Database();
  db.run(seedSql);

  const count = (table: string): number => {
    const stmt = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`);
    stmt.step();
    const n = (stmt.getAsObject() as { n: number }).n;
    stmt.free();
    return n;
  };

  const counts = {
    campuses: count("campuses"),
    employees: count("employees"),
    leave_balances: count("leave_balances"),
    hr_requests: count("hr_requests"),
  };

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`Seeded database at ${DB_PATH}`);
  console.table(counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
