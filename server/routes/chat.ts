// POST /api/chat and GET /api/events/:slug/chat (agent chat). See docs/chat.md.
//
// The client sends only its newest UIMessage. The server loads the thread
// itself and takes from the client only the new user text, or the answer to
// the pending ask_with_options question. Identity comes from the session.
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  type StopCondition,
  isToolUIPart,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  TypeValidationError,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { askWithOptions, ChatBody, Slug, type ApiError, type ChatHistory } from "../../shared/contract.js";
import { loadChatContext, type ChatContext } from "../agent/data.js";
import { loadThread, saveMessage } from "../agent/history.js";
import { chatModel } from "../agent/model.js";
import { buildInstructions } from "../agent/prompts.js";
import { buildTools, ToolFail, type HackyTools } from "../agent/tools.js";
import { mentorAreas } from "../matching/index.js";
import { fail, readJson, readParams, requireUser, type AppEnv } from "./http.js";

const SlugParams = z.object({ slug: Slug });
const MAX_STEPS = 5;

// A finished intro draft ends the reply: the card says it all, so no follow-up text.
// A failed draft doesn't count, so the model can still recover.
const draftReady: StopCondition<HackyTools> = ({ steps }) =>
  steps.at(-1)?.toolResults.some((result) => result.toolName === "draft_intro") ?? false;
const MAX_USER_TEXT = 2000;
const RATE_LIMITED_TEXT = "Hacky is getting a lot of questions right now. Try again in a few seconds.";
const SNAG_TEXT = "Hacky hit a snag. Try again in a few seconds.";

const messageId = createIdGenerator({ prefix: "msg", size: 16 });

// What we read from the client's newest message. Everything else is ignored.
const ClientPart = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  toolCallId: z.string().optional(),
  state: z.string().optional(),
  output: z.unknown().optional(),
});
const ClientMessage = z.looseObject({
  id: z.string().max(200).optional(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(ClientPart).max(200),
});

async function requireChatContext(slug: string, userId: string): Promise<ChatContext> {
  const result = await loadChatContext(slug, userId);
  if (!result.found) throw fail.notFound("No event with that slug.");
  if (!result.member) throw fail.forbidden("You're not a member of this event.");
  return result.ctx;
}

type ToolPart = { type: string; toolCallId: string; state: string; output?: unknown };
const isPendingAsk = (part: UIMessage["parts"][number]): part is UIMessage["parts"][number] & ToolPart =>
  part.type === "tool-ask_with_options" && (part as ToolPart).state === "input-available";

const SKIPPED = { answer: "(no answer: they sent a new message instead)", skipped: true };

const textOf = (message: { parts: readonly { type: string; text?: unknown }[] }) =>
  message.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n")
    .trim();

/**
 * Builds the thread for this turn: stored history plus the new user message,
 * or the stored assistant message with the client's answer to its pending
 * question. `incoming` is the message to persist before streaming.
 */
function mergeNewest(
  history: UIMessage[],
  raw: unknown,
): { messages: UIMessage[]; incoming: UIMessage; continuation: boolean; closed?: UIMessage } {
  const parsed = ClientMessage.safeParse(raw);
  if (!parsed.success) throw fail.invalid("message must be a UIMessage.");
  const client = parsed.data;

  if (client.role === "user") {
    const text = textOf(client);
    if (!text) throw fail.invalid("Type a message first.");
    if (text.length > MAX_USER_TEXT) throw fail.invalid(`Messages can be up to ${MAX_USER_TEXT} characters.`);
    // A retry after a failed reply: reuse the unanswered message instead of storing it twice.
    const last = history.at(-1);
    if (last?.role === "user" && textOf(last) === text) return { messages: history, incoming: last, continuation: false };
    // The id is ours, not the client's, so a client can't overwrite stored messages.
    const incoming: UIMessage = { id: messageId(), role: "user", parts: [{ type: "text", text }] };
    // A new message while a question is still open (say, from a tab that missed the question):
    // close it as skipped, so the model answers the new message instead of asking again.
    if (last?.role === "assistant" && last.parts.some(isPendingAsk)) {
      const closed: UIMessage = {
        ...last,
        parts: last.parts.map((part) =>
          isPendingAsk(part) ? ({ ...part, state: "output-available", output: SKIPPED } as UIMessage["parts"][number]) : part,
        ),
      };
      return { messages: [...history.slice(0, -1), closed, incoming], incoming, continuation: false, closed };
    }
    return { messages: [...history, incoming], incoming, continuation: false };
  }

  // An answer: only the newest stored message can have a pending question.
  const last = history.at(-1);
  if (!last || last.role !== "assistant" || last.id !== client.id || !last.parts.some(isPendingAsk)) {
    throw fail.invalid("That question isn't open anymore. Send a new message instead.");
  }
  let answered = 0;
  const parts = last.parts.map((part) => {
    if (!isPendingAsk(part)) return part;
    const sent = client.parts.find(
      (p) => p.type === part.type && p.toolCallId === part.toolCallId && p.state === "output-available",
    );
    if (!sent) return part;
    // docs/chat.md's client sends the answer as a string; the contract shape is { answer }.
    const output = askWithOptions.output.safeParse(typeof sent.output === "string" ? { answer: sent.output } : sent.output);
    if (!output.success) throw fail.invalid("Answers must be 1-500 characters.");
    answered += 1;
    return { ...part, state: "output-available", output: output.data } as UIMessage["parts"][number];
  });
  if (answered === 0) throw fail.invalid("No answer to the open question.");
  const incoming: UIMessage = { ...last, parts };
  return { messages: [...history.slice(0, -1), incoming], incoming, continuation: true };
}

type Part = UIMessage["parts"][number];

const clip = (text: string, max = 160) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * "path: message" for the first issue of a failed validation. Never includes the
 * value: TypeValidationError's own message embeds it as JSON (a whole card).
 */
function firstIssue(error: unknown): string {
  let where = "";
  let current = error;
  for (let depth = 0; depth < 6 && current != null; depth++) {
    if (TypeValidationError.isInstance(current)) {
      // context.field is like "messages[0].parts[0].output": keep "output" (or "input").
      where ||= current.context?.field?.split(".").at(-1) ?? "";
      current = current.cause;
      continue;
    }
    const issues = Array.isArray(current) ? current : (current as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const issue = issues[0] as { path?: readonly unknown[]; message?: unknown };
      let path = (issue.path ?? []).map((s) => String(s && typeof s === "object" && "key" in s ? s.key : s));
      // Message-shape issues start at messages[0] (and parts[0]): make them relative.
      if (!where && path[0] === "0") path = path[1] === "parts" && /^\d+$/.test(path[2] ?? "") ? path.slice(3) : path.slice(1);
      return `${[where, ...path].filter(Boolean).join(".") || "(root)"}: ${clip(String(issue.message ?? "invalid"))}`;
    }
    const text = typeof current === "string" ? current : current instanceof Error ? current.message : "invalid";
    return `${where || "(root)"}: ${clip(text)}`;
  }
  return `${where || "(root)"}: invalid`;
}

const partLabel = (part: Part) =>
  part.type === "dynamic-tool"
    ? `tool=${(part as { toolName?: string }).toolName}`
    : part.type.startsWith("tool-")
      ? `tool=${part.type.slice("tool-".length)}`
      : `part=${part.type}`;

/** Worth sending to the model: some text, or a tool call. */
const isUseful = (part: Part) => (part.type === "text" && part.text.trim() !== "") || isToolUIPart(part);

/**
 * A stored message that failed validation, minus its invalid parts (say, a tool
 * output saved before a contract change). Null when nothing useful is left.
 */
async function salvageMessage(message: UIMessage, tools: HackyTools): Promise<UIMessage | null> {
  // Id, role and metadata first, with a placeholder part: if they fail, no part can help.
  const shell = await safeValidateUIMessages<UIMessage>({ messages: [{ ...message, parts: [{ type: "text", text: "" }] }], tools });
  if (!shell.success) {
    console.warn(`[chat] dropped stored message msg=${message.id} at ${firstIssue(shell.error)}`);
    return null;
  }
  const parts: Part[] = [];
  for (const part of Array.isArray(message.parts) ? message.parts : []) {
    const one = await safeValidateUIMessages<UIMessage>({ messages: [{ ...message, parts: [part] }], tools });
    if (one.success) parts.push(...one.data[0]!.parts);
    else console.warn(`[chat] dropped stored part msg=${message.id} ${partLabel(part)} at ${firstIssue(one.error)}`);
  }
  if (!parts.some(isUseful)) {
    console.warn(`[chat] dropped stored message msg=${message.id}: no valid text or tool parts left`);
    return null;
  }
  return { ...shell.data[0]!, parts };
}

/**
 * Validates the thread against the tools. A stored message that no longer
 * validates keeps its valid parts; only invalid parts are dropped, and the whole
 * message only when nothing useful is left. The message with `strictId` (the
 * incoming one) is never trimmed: it validates whole or is dropped.
 */
export async function validateThread(messages: UIMessage[], tools: HackyTools, strictId?: string): Promise<UIMessage[]> {
  const all = await safeValidateUIMessages<UIMessage>({ messages, tools });
  if (all.success) return all.data;
  const kept: UIMessage[] = [];
  for (const message of messages) {
    const one = await safeValidateUIMessages<UIMessage>({ messages: [message], tools });
    if (one.success) {
      kept.push(...one.data);
    } else if (message.id === strictId) {
      console.warn(`[chat] rejected incoming message msg=${message.id} at ${firstIssue(one.error)}`);
    } else {
      const salvaged = await salvageMessage(message, tools);
      if (salvaged) kept.push(salvaged);
    }
  }
  return kept;
}

/** The model's window starts at a user message. */
function fromFirstUser(messages: UIMessage[]): UIMessage[] {
  const start = messages.findIndex((m) => m.role === "user");
  return start === -1 ? [] : messages.slice(start);
}

const hasContent = (message: UIMessage) => message.parts.some((p) => p.type !== "step-start");

/** 429s from Gemini, possibly wrapped in a RetryError or a cause. */
function isRateLimited(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;
  const e = error as { statusCode?: unknown; message?: unknown; lastError?: unknown; cause?: unknown; errors?: unknown };
  if (e.statusCode === 429) return true;
  if (typeof e.message === "string" && /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(e.message)) return true;
  if (Array.isArray(e.errors) && e.errors.some((x) => isRateLimited(x, depth + 1))) return true;
  return isRateLimited(e.lastError, depth + 1) || isRateLimited(e.cause, depth + 1);
}

async function drain(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  try {
    while (!(await reader.read()).done) {
      /* keep reading so onEnd runs even if the browser left */
    }
  } catch {
    /* the response side reports errors */
  }
}

export const chatRoutes = new Hono<AppEnv>()
  .get("/events/:slug/chat", async (c) => {
    const user = requireUser(c);
    const { slug } = readParams(c, SlugParams);
    const ctx = await requireChatContext(slug, user.id);
    const messages = await loadThread(user.id, ctx.eventId);
    return c.json<ChatHistory>({ messages });
  })

  .post("/chat", async (c) => {
    const user = requireUser(c);
    const body = await readJson(c, ChatBody);
    if (body.trigger === "regenerate-message") throw fail.invalid("Regenerate isn't supported. Send a new message.");
    const ctx = await requireChatContext(body.eventSlug, user.id);
    const { userId, eventId } = ctx;

    // Mentor areas feed the "what do you need a mentor for?" chips; hackers only, once per request.
    const [history, areas] = await Promise.all([
      loadThread(userId, eventId),
      ctx.me.role === "hacker"
        ? mentorAreas(eventId, userId).catch((error) => {
            console.error("[chat] loading mentor areas failed", error);
            return undefined;
          })
        : undefined,
    ]);
    if (areas) ctx.mentorAreas = areas;
    const { messages: merged, incoming, continuation, closed } = mergeNewest(history, body.message);
    const tools = buildTools(ctx);
    const skipped = (closed?.parts ?? []).flatMap((part) => {
      const p = part as { type: string; input?: { question?: string }; output?: { skipped?: boolean } };
      return p.type === "tool-ask_with_options" && p.output?.skipped && p.input?.question ? [p.input.question] : [];
    });
    const messages = await validateThread(merged, tools, incoming.id);
    if (messages.at(-1)?.id !== incoming.id) throw fail.invalid("message must be a UIMessage.");

    // Saved now so the person's message survives a failed or abandoned reply.
    if (closed) await saveMessage(userId, eventId, closed, new Date());
    await saveMessage(userId, eventId, incoming, new Date());

    let rateLimited = false;
    const result = streamText({
      model: chatModel,
      instructions: buildInstructions(ctx, skipped),
      messages: await convertToModelMessages(fromFirstUser(messages), { tools, ignoreIncompleteToolCalls: true }),
      tools,
      // Right after a skipped question, no new question: reply to what they said instead.
      ...(skipped.length > 0
        ? { activeTools: (Object.keys(tools) as (keyof HackyTools)[]).filter((name) => name !== "ask_with_options") }
        : {}),
      maxRetries: 1, // free tier: don't burn the per-minute quota on retries
      stopWhen: [isStepCount(MAX_STEPS), draftReady],
      // Rebuilt every step: update_profile can complete the intake mid-turn. The last step must talk.
      prepareStep: ({ stepNumber }) => ({
        instructions: buildInstructions(ctx, skipped),
        ...(stepNumber === MAX_STEPS - 1 ? { toolChoice: "none" as const } : {}),
      }),
    });
    result.consumeStream(); // no await: finishes and saves even if the tab closes

    const stream = toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      generateMessageId: messageId,
      onEnd: async ({ responseMessage }) => {
        try {
          if (continuation || hasContent(responseMessage)) {
            await saveMessage(userId, eventId, responseMessage, new Date());
          }
        } catch (error) {
          console.error("[chat] saving the reply failed", error);
        }
      },
      onError: (error) => {
        if (error instanceof ToolFail) return error.message;
        if (isRateLimited(error)) {
          rateLimited = true;
          return RATE_LIMITED_TEXT;
        }
        console.error("[chat] stream error", error);
        return SNAG_TEXT;
      },
    });

    // Wait for the first real chunk, so a 429 before any output is a proper 429.
    const reader = stream.getReader();
    const head: UIMessageChunk[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      head.push(value);
      if (value.type !== "start" && value.type !== "start-step") break;
    }
    if (rateLimited && head.some((chunk) => chunk.type === "error")) {
      void reader.cancel().catch(() => {});
      return c.json<ApiError>({ error: { code: "rate_limited", message: RATE_LIMITED_TEXT } }, 429);
    }

    const replay = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of head) controller.enqueue(chunk);
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return createUIMessageStreamResponse({
      stream: replay,
      consumeSseStream: ({ stream: copy }) => void drain(copy),
    });
  });
