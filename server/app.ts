import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ApiError, ErrorCode } from "../shared/contract.js";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { demoRoutes } from "./routes/demo.js";
import { eventRoutes } from "./routes/events.js";
import { ApiFail, type AppEnv } from "./routes/http.js";
import { meRoutes } from "./routes/me.js";

// The whole API. Vercel serves it under /api (see api/index.ts and vercel.json).
// Routes and their Zod schemas are listed in shared/contract.ts.
export const app = new Hono<AppEnv>().basePath("/api");

const codeForStatus: Record<number, z.infer<typeof ErrorCode>> = {
  400: "invalid",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  429: "rate_limited",
};

// Every error leaves as the contract's ApiError shape.
app.onError((err, c) => {
  if (err instanceof ApiFail) {
    return c.json<ApiError>({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof APIError || err instanceof HTTPException) {
    const status = err instanceof APIError ? err.statusCode : err.status;
    const code = codeForStatus[status];
    if (code) return c.json<ApiError>({ error: { code, message: err.message } }, status as 400);
  }
  console.error(err);
  return c.json<ApiError>({ error: { code: "internal", message: "Something went wrong." } }, 500);
});

app.notFound((c) => c.json<ApiError>({ error: { code: "not_found", message: "No such route." } }, 404));

// Better Auth's own routes (get-session, sign-out, ...).
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

// Reads the session cookie for every other route. Routes that need a user call
// requireUser(c). Refreshed session cookies are passed back to the browser.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/")) return next();
  const { headers, response } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  c.set("user", response?.user ?? null);
  c.set("session", response?.session ?? null);
  for (const cookie of headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
  await next();
});

app.get("/health", async (c) => {
  const result = await db.execute<{ now: string }>(sql`select now() as now`);
  return c.json({ ok: true, databaseTime: result.rows[0]?.now ?? null });
});

app.route("/", meRoutes);
app.route("/", eventRoutes);
app.route("/", demoRoutes);

export type AppType = typeof app;
