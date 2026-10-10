import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";

// The whole API. Vercel serves it under /api (see api/index.ts and vercel.json).
export const app = new Hono().basePath("/api");

app.get("/health", async (c) => {
  const result = await db.execute<{ now: string }>(sql`select now() as now`);
  return c.json({ ok: true, databaseTime: result.rows[0]?.now ?? null });
});

export type AppType = typeof app;
