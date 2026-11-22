import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations";

export type Db = DatabaseSync;

/** Open a database file (or ":memory:") and bring its schema up to date. */
export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null };
  const current = row.v ?? 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      m.after?.(db);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(m.version);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

const globalForDb = globalThis as unknown as { __barkatDb?: Db };

/** The process-wide database in the data directory. */
export function getDb(): Db {
  if (!globalForDb.__barkatDb) {
    const dir = process.env.BARKAT_DATA_DIR || path.join(process.cwd(), "data");
    globalForDb.__barkatDb = openDb(path.join(dir, "barkat.db"));
  }
  return globalForDb.__barkatDb;
}
