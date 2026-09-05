import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { DbSession } from "./database";

export async function applyMigrations(tx: DbSession) {
  await tx.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  const folder = path.join(process.cwd(), "db/migrations");
  for (const name of (await readdir(folder))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    const sql = await readFile(path.join(folder, name), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const existing = await tx.query<{ sha256: string }>(
      "SELECT sha256 FROM schema_migrations WHERE name=$1",
      [name],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].sha256 !== hash)
        throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await tx.query(sql);
    await tx.query("INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)", [
      name,
      hash,
    ]);
  }
}
