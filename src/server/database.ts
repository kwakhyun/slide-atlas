import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

export interface DbSession {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends DbSession {
  transaction<T>(callback: (tx: DbSession) => Promise<T>): Promise<T>;
  mode: "postgres" | "embedded" | "ephemeral";
  close(): Promise<void>;
}
const runtime = globalThis as unknown as { atlasDb?: Promise<Database> };

export async function initializeDatabase(
  options: { url?: string; dataDir?: string; memory?: boolean } = {},
): Promise<Database> {
  const migration = await readFile(
    path.join(process.cwd(), "db/migrations/001_initial.sql"),
    "utf8",
  );
  if (options.url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(options.url, {
      max: 4,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const wrap = (client: typeof sql): DbSession => ({
      async query<T>(query: string, params: unknown[] = []) {
        const rows = await client.unsafe(query, params as never[]);
        return { rows: Array.from(rows) as T[] };
      },
    });
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(72819340)`;
      await tx.unsafe(migration);
    });
    return {
      ...wrap(sql),
      mode: "postgres",
      async transaction<T>(
        callback: (tx: DbSession) => Promise<T>,
      ): Promise<T> {
        return (await sql.begin((tx) =>
          callback(wrap(tx as unknown as typeof sql)),
        )) as T;
      },
      close: () => sql.end(),
    };
  }
  const { PGlite: PGliteEngine } = await import("@electric-sql/pglite");
  const dataDir =
    options.dataDir ?? path.join(process.cwd(), ".data/slide-atlas");
  if (!options.memory) await mkdir(path.dirname(dataDir), { recursive: true });
  const engine: PGlite = new PGliteEngine(options.memory ? undefined : dataDir);
  await engine.exec(migration);
  return {
    mode: options.memory ? "ephemeral" : "embedded",
    query: (sql, params = []) => engine.query(sql, params),
    transaction: (callback) => engine.transaction((tx) => callback(tx)),
    close: () => engine.close(),
  };
}
export function getDatabase(): Promise<Database> {
  if (!runtime.atlasDb)
    runtime.atlasDb = initializeDatabase({
      url: process.env.DATABASE_URL || undefined,
      memory: !!process.env.VERCEL,
    }).catch((error) => {
      runtime.atlasDb = undefined;
      throw error;
    });
  return runtime.atlasDb;
}
