import { defineConfig } from "drizzle-kit";

// Local env comes from `neon link` / `neon env pull`.
try {
  process.loadEnvFile(".env.local");
} catch {
  // On CI or Vercel the variables are already set.
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run `npx neon@latest env pull`.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
