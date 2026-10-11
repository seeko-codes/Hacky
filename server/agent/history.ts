// The agent chat thread: one per user per event, stored in agent_messages as
// AI SDK UIMessages. Parts are stored exactly as the SDK returns them (tool
// parts carry Gemini's thought signatures in callProviderMetadata).
import type { UIMessage } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentMessages } from "../db/schema.js";

/** Messages loaded for the model and for the web app. */
export const THREAD_LIMIT = 30;

/** The newest messages of the thread, oldest first. */
export async function loadThread(userId: string, eventId: string, limit = THREAD_LIMIT): Promise<UIMessage[]> {
  const rows = await db
    .select({ id: agentMessages.id, role: agentMessages.role, parts: agentMessages.parts })
    .from(agentMessages)
    .where(and(eq(agentMessages.userId, userId), eq(agentMessages.eventId, eventId)))
    .orderBy(desc(agentMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: (row.parts as UIMessage["parts"]).map(upgradePart),
  }));
}

/**
 * Brings parts saved under an older contract up to date, so they still validate and the
 * model keeps them: ask_with_options questions get an empty `say`, and people in tool
 * outputs get `photoUrl: null`.
 */
export function upgradePart(part: UIMessage["parts"][number]): UIMessage["parts"][number] {
  const p = part as { type: string; input?: Record<string, unknown>; output?: unknown };
  if (!p.type.startsWith("tool-")) return part;
  let next = part as typeof p;
  if (p.type === "tool-ask_with_options" && p.input && typeof p.input.say !== "string") {
    next = { ...next, input: { ...p.input, say: "" } };
  }
  if (p.output !== undefined) next = { ...next, output: withPhotoUrl(p.output) };
  return next as UIMessage["parts"][number];
}

export function withPhotoUrl(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withPhotoUrl);
  if (!value || typeof value !== "object") return value;
  const obj: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withPhotoUrl(v)]));
  if ("userId" in obj && "handle" in obj && !("photoUrl" in obj)) obj.photoUrl = null;
  return obj;
}

/**
 * Upserts one message by id. createdAt is set only on insert, so a continued
 * assistant message keeps its place in the thread.
 */
export async function saveMessage(userId: string, eventId: string, message: UIMessage, createdAt: Date): Promise<void> {
  await db
    .insert(agentMessages)
    .values({ userId, id: message.id, eventId, role: message.role, parts: message.parts, createdAt })
    .onConflictDoUpdate({
      target: [agentMessages.userId, agentMessages.id],
      set: { role: message.role, parts: message.parts },
      setWhere: eq(agentMessages.eventId, eventId),
    });
}
