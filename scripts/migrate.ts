import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../src/server/database";
loadEnvConfig(process.cwd());
const db = await getDatabase();
await db.query("SELECT 1");
console.log(`Schema ready (${db.mode}). No credentials are printed.`);
await db.close();
