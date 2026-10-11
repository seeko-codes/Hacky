// Mentor help (rules in server/social/help.ts):
//   POST /api/events/:slug/help-requests   "Request help" (hackers)
//   GET  /api/events/:slug/help-queue      open queue sorted by fit (verified mentors) + mine
//   POST /api/help-requests/:id/claim      verified mentor, not offline; 409 if already claimed
//   POST /api/help-requests/:id/resolve    the hacker or the claiming mentor; idempotent
import { Hono } from "hono";
import { z } from "zod";
import {
  HelpRequestDraft,
  Slug,
  Uuid,
  type HelpQueue,
  type HelpRequestResult,
} from "../../shared/contract.js";
import {
  claimHelpRequest,
  createHelpRequest,
  loadHelpQueue,
  resolveHelpRequest,
} from "../social/help.js";
import { readJson, readParams, requireUser, type AppEnv } from "./http.js";

const SlugParams = z.object({ slug: Slug });
const IdParams = z.object({ id: Uuid });

export const helpRoutes = new Hono<AppEnv>()
  .post("/events/:slug/help-requests", async (c) => {
    const user = requireUser(c);
    const { slug } = readParams(c, SlugParams);
    const draft = await readJson(c, HelpRequestDraft);
    const helpRequest = await createHelpRequest(slug, user.id, draft);
    return c.json<HelpRequestResult>({ helpRequest });
  })

  .get("/events/:slug/help-queue", async (c) => {
    const user = requireUser(c);
    const { slug } = readParams(c, SlugParams);
    return c.json<HelpQueue>(await loadHelpQueue(slug, user.id));
  })

  .post("/help-requests/:id/claim", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    return c.json<HelpRequestResult>({ helpRequest: await claimHelpRequest(id, user.id) });
  })

  .post("/help-requests/:id/resolve", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    return c.json<HelpRequestResult>({ helpRequest: await resolveHelpRequest(id, user.id) });
  });
