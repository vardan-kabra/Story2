import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH =
  process.env.ASK_HR_DB_PATH || path.join(process.cwd(), "data", "ask-hr.db");

let db: Database.Database | null = null;

/**
 * Returns a singleton, READ-ONLY connection to the sample HR database.
 *
 * The connection is intentionally read-only: the safe query layer should never
 * be able to mutate ERP-like data, and Claude never gets to run SQL at all.
 */
export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Database not found at ${DB_PATH}. Run "npm run seed" to create it.`,
    );
  }

  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return db;
}
