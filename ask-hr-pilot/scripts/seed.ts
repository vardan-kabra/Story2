/**
 * Seeds the local SQLite database from data/seed.sql.
 *
 * Usage: npm run seed
 *
 * This (re)creates ./data/ask-hr.db with the sample HR dataset. The app opens
 * the database in read-only mode, so this script is the only writer.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DB_PATH = process.env.ASK_HR_DB_PATH || path.join(ROOT, "data", "ask-hr.db");
const SQL_PATH = path.join(ROOT, "data", "seed.sql");

function main() {
  if (!fs.existsSync(SQL_PATH)) {
    console.error(`Could not find seed SQL at ${SQL_PATH}`);
    process.exit(1);
  }

  // Start fresh so re-running the seed is deterministic.
  for (const suffix of ["", "-shm", "-wal"]) {
    const f = DB_PATH + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }

  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(sql);

  const counts = {
    campuses: (db.prepare("SELECT COUNT(*) AS n FROM campuses").get() as { n: number }).n,
    employees: (db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number }).n,
    leave_balances: (db.prepare("SELECT COUNT(*) AS n FROM leave_balances").get() as { n: number }).n,
    hr_requests: (db.prepare("SELECT COUNT(*) AS n FROM hr_requests").get() as { n: number }).n,
  };

  db.close();

  console.log(`Seeded database at ${DB_PATH}`);
  console.table(counts);
}

main();
