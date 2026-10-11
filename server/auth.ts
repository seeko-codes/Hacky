// Better Auth: cookie sessions stored in Neon (user/session/account/verification
// in server/db/schema.ts). Mounted at /api/auth/* by server/app.ts.
//
// There is no public sign-up and no password sign-in. People arrive from the
// hackathon portal (launch ticket, later) or, with DEMO_MODE=true, from the
// demo portal, which signs in through the server-only demoSignIn endpoint below.
import { networkInterfaces } from "node:os";
import { randomInt } from "node:crypto";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/index.js";
import { account, profiles, session, user, verification } from "./db/schema.js";

export const isDemoMode = () => process.env.DEMO_MODE === "true";

// Local dev runs the web app on Vite (port 5173), which proxies /api here. This machine's
// network addresses count too, so a phone on the same Wi-Fi can open the dev app.
const lanOrigins = process.env.VERCEL
  ? []
  : Object.values(networkInterfaces())
      .flat()
      .filter((a) => a && !a.internal && !a.address.startsWith("fe80"))
      .map((a) => (a!.family === "IPv6" ? `http://[${a!.address}]:5173` : `http://${a!.address}:5173`));
const devOrigins = ["http://127.0.0.1:5173", "http://localhost:5173", ...lanOrigins];
const vercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`);
const baseURL =
  process.env.BETTER_AUTH_URL ?? (vercelOrigins[0] ? vercelOrigins[0] : undefined);

// ---------------------------------------------------------------------------
// Profiles: every user gets one, with a unique handle derived from the name.
// ---------------------------------------------------------------------------

function handleBase(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24)
    .replace(/_+$/, "");
  return base.length >= 3 ? base : `${base ? `${base}_` : ""}hacker`;
}

// Creates the profiles row if it's missing. Safe to call more than once.
export async function ensureProfile(owner: { id: string; name: string }): Promise<void> {
  const name = Array.from(owner.name.trim()).slice(0, 80).join("") || "Hacker";
  const base = handleBase(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const handle = attempt === 0 ? base : `${base}_${randomInt(10, 100_000)}`;
    const inserted = await db
      .insert(profiles)
      .values({ userId: owner.id, handle, name })
      .onConflictDoNothing()
      .returning({ userId: profiles.userId });
    if (inserted.length > 0) return;
    // The conflict was either this user's row (already exists) or the handle.
    const [existing] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.userId, owner.id))
      .limit(1);
    if (existing) return;
  }
  throw new Error("Could not pick a unique handle");
}

// ---------------------------------------------------------------------------
// Demo sign-in (DEMO_MODE=true only). Server-only: never routed over HTTP;
// POST /api/demo/sign-in calls it through auth.api.demoSignIn.
// ---------------------------------------------------------------------------

const demoPlugin = () =>
  ({
    id: "hacky-demo",
    endpoints: {
      demoSignIn: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ userId: z.string().min(1).max(64) }) },
        async (ctx) => {
          if (!isDemoMode()) throw new APIError("NOT_FOUND", { message: "Not found." });
          const [demo] = await db
            .select({ userId: profiles.userId })
            .from(profiles)
            .where(and(eq(profiles.userId, ctx.body.userId), eq(profiles.isDemo, true)))
            .limit(1);
          const found = demo && (await ctx.context.internalAdapter.findUserById(demo.userId));
          if (!found) throw new APIError("NOT_FOUND", { message: "No demo person with that id." });

          // One browser holds one person: end the session it had before.
          try {
            const previous = await getSessionFromCtx(ctx);
            if (previous) await ctx.context.internalAdapter.deleteSession(previous.session.token);
          } catch {
            // A stale or invalid cookie is fine; the new session replaces it.
          }

          const created = await ctx.context.internalAdapter.createSession(found.id);
          if (!created) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Couldn't start a session." });
          }
          await setSessionCookie(ctx, { session: created, user: found });
          return ctx.json({ userId: found.id });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const auth = betterAuth({
  appName: "Hacky",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  // neon-http has no interactive transactions; the adapter's default
  // (transaction: false) runs multi-step writes one after another.
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  trustedOrigins: [...devOrigins, ...vercelOrigins, ...(baseURL ? [baseURL] : [])],
  emailAndPassword: { enabled: false },
  disabledPaths: ["/sign-up/email", "/sign-in/email", "/update-user", "/change-email"],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Signed copy of the session in a short-lived cookie, so most requests
    // skip the session lookup.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: { cookiePrefix: "hacky" },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await ensureProfile(created);
        },
      },
    },
  },
  plugins: [demoPlugin()],
  telemetry: { enabled: false },
});
