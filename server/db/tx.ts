import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";

// Interactive transactions (read, decide, write) need Neon's WebSocket driver;
// the HTTP driver in ./index.ts can't hold a transaction open. Node 22+ has a
// global WebSocket, so no extra package is needed.
//
//   const conversation = await withTransaction(async (tx) => { ... });
//
// A new pool per call keeps it safe in serverless functions; it's closed after.
export type Tx = Parameters<Parameters<NeonDatabase<typeof schema>["transaction"]>[0]>[0];

export async function withTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `npx neon@latest env pull`.");
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema });
    return await db.transaction(work);
  } finally {
    await pool.end();
  }
}
