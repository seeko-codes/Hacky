import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run `npx neon@latest env pull`.");

// Neon's HTTP driver: each query is one HTTPS request, so it works on
// networks that block Postgres ports and needs no connection pool.
export const db = drizzle(neon(url), { schema });
