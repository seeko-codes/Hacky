// Shared pieces for the route files: the Hono env, the contract's error shape,
// Zod request parsing, and the signed-in user.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { ErrorCode } from "../../shared/contract.js";
import type { auth } from "../auth.js";

type AuthSession = typeof auth.$Infer.Session;

export type AppEnv = {
  Variables: {
    user: AuthSession["user"] | null;
    session: AuthSession["session"] | null;
  };
};

export type AppContext = Context<AppEnv>;

// Throw one of these from a route; app.onError turns it into ApiError JSON.
export class ApiFail extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: z.infer<typeof ErrorCode>,
    message: string,
  ) {
    super(message);
  }
}

export const fail = {
  unauthorized: () => new ApiFail(401, "unauthorized", "Sign in first."),
  forbidden: (message = "You don't have access to this.") => new ApiFail(403, "forbidden", message),
  notFound: (message = "Not found.") => new ApiFail(404, "not_found", message),
  invalid: (message: string) => new ApiFail(400, "invalid", message),
};

export function requireUser(c: AppContext) {
  const user = c.get("user");
  if (!user) throw fail.unauthorized();
  return user;
}

export async function readJson<T extends z.ZodType>(c: AppContext, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw fail.invalid("The body must be JSON.");
  }
  return parse(schema, raw);
}

export function readParams<T extends z.ZodType>(c: AppContext, schema: T): z.infer<T> {
  return parse(schema, c.req.param());
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw fail.invalid(z.prettifyError(result.error));
  return result.data;
}

export const iso = (date: Date | null) => (date ? date.toISOString() : null);
