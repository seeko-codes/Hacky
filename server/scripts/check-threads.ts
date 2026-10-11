// npm run check:threads
// Read-only. Loads every saved agent chat thread (every user and event with rows in
// agent_messages) through loadThread, so parts saved under an older contract are
// upgraded first, then validates each message against the tools' schemas the way
// POST /api/chat does. A message that fails here is one the chat route drops from
// the model's memory. Prints one line per thread, then the first issue of each
// invalid message (never the stored value). Exits 1 if anything is invalid.
//
// Run it after changing tool or card schemas in shared/contract.ts.

import { safeValidateUIMessages, type UIMessage } from "ai";
import { asc, count, eq } from "drizzle-orm";
import { toIntake, type ChatContext } from "../agent/data.js";
import { loadThread } from "../agent/history.js";
import { buildTools } from "../agent/tools.js";
import { db } from "../db/index.js";
import { agentMessages, events, profiles } from "../db/schema.js";

/** High enough to load every stored message of a thread. */
const ALL_MESSAGES = 1_000_000;

type Issue = { tool: string; path: string; message: string };

async function main() {
  const threads = await db
    .select({
      userId: agentMessages.userId,
      eventId: agentMessages.eventId,
      handle: profiles.handle,
      slug: events.slug,
      eventName: events.name,
      tracks: events.tracks,
      stored: count(),
    })
    .from(agentMessages)
    .innerJoin(profiles, eq(profiles.userId, agentMessages.userId))
    .innerJoin(events, eq(events.id, agentMessages.eventId))
    .groupBy(agentMessages.userId, agentMessages.eventId, profiles.handle, events.slug, events.name, events.tracks)
    .orderBy(asc(profiles.handle), asc(events.slug));

  let totalMessages = 0;
  let totalInvalid = 0;
  let threadsWithInvalid = 0;

  for (const t of threads) {
    // The schemas don't depend on the context; this only satisfies buildTools. Nothing executes.
    const ctx: ChatContext = {
      userId: t.userId,
      eventId: t.eventId,
      event: { slug: t.slug, name: t.eventName, tracks: t.tracks },
      me: { name: t.handle, handle: t.handle, role: "hacker" },
      intake: toIntake(undefined),
    };
    const tools = buildTools(ctx);
    const messages = await loadThread(t.userId, t.eventId, ALL_MESSAGES);

    const invalid: { id: string; issue: Issue }[] = [];
    for (const message of messages) {
      const result = await safeValidateUIMessages<UIMessage>({ messages: [message], tools });
      if (!result.success) invalid.push({ id: message.id, issue: describe(result.error, message) });
    }

    totalMessages += messages.length;
    totalInvalid += invalid.length;
    if (invalid.length > 0) threadsWithInvalid += 1;

    const loadedNote = messages.length === t.stored ? "" : ` (${t.stored} stored)`;
    console.log(`@${t.handle}  ${t.slug}  ${messages.length} messages${loadedNote}  ${invalid.length} invalid`);
    for (const { id, issue } of invalid) {
      console.log(`  ${id}  ${issue.tool}  ${issue.path}: ${issue.message}`);
    }
  }

  console.log(
    `\n${threads.length} threads, ${totalMessages} messages: ${totalInvalid} invalid` +
      (totalInvalid > 0 ? ` in ${threadsWithInvalid} threads.` : "."),
  );
  process.exit(totalInvalid > 0 ? 1 : 0);
}

/**
 * The first issue of a validation error: the tool, where in the message, and what's wrong.
 * Never reads error.message, which for a TypeValidationError embeds the whole stored value.
 */
function describe(error: unknown, message: UIMessage): Issue {
  const e = error as { name?: unknown; cause?: unknown; issues?: unknown; context?: { field?: string; entityName?: string } };
  // TypeValidationError context.field is like "messages[0].parts[3].output"; we validate one message at a time.
  const field = e.context?.field?.replace(/^messages\[\d+\]\.?/, "") ?? "";
  const issues = firstIssues(e);
  const first = issues?.[0];

  let path = field;
  let text: string;
  if (first) {
    const segments = first.path ?? [];
    // Structural errors (no field) carry the message index first.
    const rest = !field && typeof segments[0] === "number" ? segments.slice(1) : segments;
    path = joinPath(field, rest);
    text = typeof first.message === "string" ? first.message : "invalid";
  } else if (typeof e.cause === "string") {
    text = e.cause;
  } else {
    text = typeof e.name === "string" ? e.name : "validation failed";
  }

  const partIndex = /^parts\[(\d+)\]/.exec(path)?.[1];
  const partType = partIndex === undefined ? undefined : message.parts[Number(partIndex)]?.type;
  const tool =
    e.context?.entityName ??
    (partType?.startsWith("tool-") ? partType.slice(5) : partType) ??
    "-";

  return { tool, path: path || "(message)", message: oneLine(text) };
}

type RawIssue = { path?: (PropertyKey | { key: PropertyKey })[]; message?: unknown };

/** Zod (and Standard Schema) issues, on the error or its cause. */
function firstIssues(error: { cause?: unknown; issues?: unknown }): RawIssue[] | undefined {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 4; depth++) {
    const issues = (current as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) return issues as RawIssue[];
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function joinPath(base: string, segments: (PropertyKey | { key: PropertyKey })[]): string {
  let out = base;
  for (const raw of segments) {
    const key = typeof raw === "object" && raw !== null ? raw.key : raw;
    if (typeof key === "number") out += `[${key}]`;
    else out += out ? `.${String(key)}` : String(key);
  }
  return out;
}

/** Issue messages are schema text, but keep them to one short line. */
function oneLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

main().catch((error: unknown) => {
  // Name and first line only: never dump config or connection details.
  const e = error as { name?: unknown; message?: unknown };
  const firstLine = typeof e.message === "string" ? e.message.split("\n")[0] : "";
  console.error(`check:threads failed: ${typeof e.name === "string" ? e.name : "Error"}${firstLine ? `: ${oneLine(firstLine)}` : ""}`);
  process.exit(2);
});
