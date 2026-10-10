// Vercel Function entry. vercel.json rewrites every /api/* request here, and
// the Hono app routes it.
import { handle } from "hono/vercel";
import { app } from "../server/app.js";

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
