# Hacky chat

How the agent chat works and how the web app talks to it. Built on AI SDK 7: `ai` 7.0.x, `@ai-sdk/react` 4.0.x, `@ai-sdk/google` 4.0.x. Most examples online are for AI SDK 4–6 and use old names (`toUIMessageStreamResponse`, `stepCountIs`, `system`, `addToolResult`). Use the names in this file.

## End to end

1. Each user has one chat thread per event, stored in `agent_messages` as AI SDK `UIMessage`s (`id`, `role`, `parts`).
2. The web app loads the thread, then `useChat` posts only the newest message to `POST /api/chat`.
3. The server checks the Better Auth session and event membership, loads the stored thread, adds the new message, and runs `streamText` with Gemini (`server/agent/model.ts`), the tools, and a 5-step limit.
4. The reply streams back as a UI message stream: `text` parts, plus one `tool-<name>` part per tool call whose `state` changes until its `output` is ready. When it ends, the server upserts the user and assistant messages by `id`.
5. Intake questions: the model calls `ask_with_options` (input `{ say, question, options }`; `say` is the short line answering what they just said, shown above the question). It has no server `execute`, so the stream stops there. The UI shows chips, the tapped chip (or typed text) becomes the tool output `{ answer }` via `addToolOutput`, and `useChat` posts again by itself. The server continues the same assistant message (same `id`). If a new message arrives while a question is still open (another tab), the server closes it as `{ answer, skipped: true }`; show no answer bubble for those.
6. Tool outputs render as cards chosen by tool name (shapes in `shared/contract.ts`). The agent never sends, accepts or claims anything. Card buttons call the normal `/api` routes.

## API

`POST /api/chat` takes JSON `{ eventSlug, message }`. `message` is the last `UIMessage` in the chat: a new user message, or the assistant message that now carries an `ask_with_options` answer. The server never takes history or identity from the client. It reads only the new user text, or the answer to the pending question. The response is a `text/event-stream` (header `x-vercel-ai-ui-message-stream: v1`). Let `useChat` parse it; don't parse it yourself. Returns 401 with no session and 403 if the user isn't in the event.

History: `GET /api/events/<slug>/chat` returns `{ messages: UIMessage[] }`, oldest first. Both routes are defined in `shared/contract.ts`.

## Client (Vite + React, JS)

```jsx
import { memo, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';

const CARDS = { search_people: PeopleCards, get_profile: PersonCard, draft_intro: DraftCard,
  draft_help_request: HelpRequestCard, my_status: StatusCard, show_events: EventCards }; // name → your component

// Auto-send only after a question was answered (the stock helper alone loops after server tools).
function answeredAsk({ messages }) {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return false;
  const step = last.parts.slice(last.parts.findLastIndex((p) => p.type === 'step-start') + 1);
  return step.some((p) => p.type === 'tool-ask_with_options' && p.state === 'output-available')
    && lastAssistantMessageIsCompleteWithToolCalls({ messages });
}

// Mount only after history has loaded: `messages` is read once, when the chat is created.
export function HackyChat({ eventSlug, initialMessages }) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: { eventSlug },
    prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, message: messages.at(-1) } }),
  }), [eventSlug]);
  const { messages, sendMessage, addToolOutput, status, error, clearError } = useChat({
    id: `hacky-${eventSlug}`, messages: initialMessages, transport,
    sendAutomaticallyWhen: answeredAsk, throttle: 50,
  });
  const [input, setInput] = useState('');
  const ready = status === 'ready' || status === 'error';
  const pending = messages.at(-1)?.parts.find(
    (p) => p.type === 'tool-ask_with_options' && p.state === 'input-available');

  // While a question is pending, typed text answers it.
  const answer = (text) => {
    if (!ready || !text.trim()) return;
    clearError();
    if (pending) addToolOutput({ tool: 'ask_with_options', toolCallId: pending.toolCallId, output: { answer: text } });
    else sendMessage({ text });
  };

  return (
    <div>
      {messages.map((m, i) => (
        <Message key={m.id} message={m} onAnswer={ready && i === messages.length - 1 ? answer : null} />
      ))}
      {status === 'submitted' && <TypingDots />}
      {error && <p>Hacky is busy. Try again in a few seconds.</p>}
      <form onSubmit={(e) => { e.preventDefault(); answer(input); setInput(''); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={!ready}>Send</button>
      </form>
    </div>
  );
}

const Message = memo(function Message({ message, onAnswer }) {
  return message.parts.map((part, i) => {
    if (part.type === 'text') return <p key={i} className={message.role}>{part.text}</p>;
    if (!part.type.startsWith('tool-')) return null; // step-start, reasoning, ...
    const name = part.type.slice('tool-'.length);
    if (name === 'ask_with_options') return <Chips key={i} part={part} onAnswer={onAnswer} />;
    if (part.state === 'output-error') return <p key={i}>Couldn't load that. Try again.</p>;
    if (part.state !== 'output-available') return <CardSkeleton key={i} />;
    const Card = CARDS[name];
    return Card ? <Card key={i} data={part.output} /> : null; // unknown tool: render nothing
  });
});

function Chips({ part, onAnswer }) {
  if (part.state === 'input-streaming') return null; // input is still partial
  const { question, options } = part.input;
  return (
    <div>
      <p className="assistant">{question}</p>
      {part.state === 'output-available'
        ? <p className="user">{typeof part.output === 'string' ? part.output : part.output.answer}</p>
        : options.map((o) => <button key={o} disabled={!onAnswer} onClick={() => onAnswer(o)}>{o}</button>)}
    </div>
  );
}
```

Tool part states: `input-streaming` → `input-available` → `output-available` or `output-error`. The approval states (`approval-requested`, `approval-responded`, `output-denied`) exist but Hacky doesn't use approvals. Use `part.input` for the tool input, `part.output` for the result and `part.errorText` for the masked error.

## Gotchas

- **Same origin.** `/api` is on the app's own domain (Vite proxies it in dev), so the Better Auth cookie is sent with the default `credentials: 'same-origin'`. Never hardcode `http://localhost:8787`.
- **Streaming.** `status` goes `submitted` (show typing dots immediately) → `streaming` → `ready`. The presentation layer shows complete bubbles in sequence; a finished first paragraph can appear while the suggestion is still streaming. Only send when ready. Memoize message rows; `throttle` caps re-renders.
- **Pending questions.** Typed replies and answer chips use `addToolOutput` as shown. A new starting point (Find hackers, Find a mentor, Contact team or the dashboard’s Join a team) uses `start()` / `sendMessage`: the server closes the old question as skipped before calling the model. Hacky may ask a different question for the new request; it must not repeat the skipped question.
- **Free Gemini tier.** It's rate-limited per minute. A 429 or a mid-stream failure shows up as `error`. Keep the user's draft and let them retry. Never start chat requests from effects or loops.
- **Never render raw tool JSON.** No `JSON.stringify(part.output)`, no input dumps. Errors get one friendly line.
- **The server owns history.** Don't edit or reorder `messages` locally, and don't call `regenerate`.
- **Dependency.** The web app imports from `ai` (`DefaultChatTransport`, `lastAssistantMessageIsCompleteWithToolCalls`), but `ai` is only a transitive dependency of `@ai-sdk/react`. Add `ai` at the same version to `react/package.json`.

## Conversational replies and pacing

General questions go to the model, including tools, companies and project advice. Only explicit schedule/reminder controls stay local. The [server instructions](../server/agent/prompts.ts) ask for a brief explanation in the person's language, followed when useful by a project step or verified event recommendation, using the current message, history and saved profile. General knowledge may explain a tool; attendance, sponsors, times, rooms and prizes must be grounded in the event guide. Missing event details don't prevent general help.

[presentation.js](../react/src/hacky/presentation.js) makes display-only copies: an `ask_with_options` lead-in and its question become separate bubbles; an explanation and suggestion separated by a blank line become two bubbles. Lists and code blocks stay intact. These copies never enter the API payload or saved history. Sponsor cards can follow the model's explanation, but the UI doesn't invent a generic follow-up question.

Timing values live in [reveal.js](../react/src/hacky/reveal.js). The initial minimum counts time already spent waiting for the model, gaps are capped per reply, and history and reduced-motion mode add no artificial wait. This is an app pacing choice, not a measured ChatGPT or Apple Messages interval. [Apple's responsiveness guidance](https://developer.apple.com/documentation/xcode/improving-app-responsiveness) concerns prompt interaction feedback and avoiding main-thread hangs. [OpenAI's latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization) recommends streaming/chunking and visible loading states; it doesn't prescribe a fixed delay between chat bubbles. Hacky applies those principles with immediate typing feedback and early display of a complete first paragraph.

## Server shape (for agents in `server/`)

```ts
import { convertToModelMessages, createIdGenerator, createUIMessageStreamResponse,
  isStepCount, streamText, toUIMessageStream, validateUIMessages } from "ai";
import { chatModel } from "./agent/model.js";

// inside app.post("/chat", ...) after auth, membership and Zod-parsing the body:
const tools = buildTools({ userId, eventId }); // closures: the model never picks whose data
const messages = await validateUIMessages({ messages: mergeNewest(history, body.message), tools });
const result = streamText({
  model: chatModel,
  instructions,                                 // `system` is deprecated in v7
  messages: await convertToModelMessages(messages, { tools }),
  tools,
  stopWhen: isStepCount(5),
  prepareStep: ({ stepNumber }) => (stepNumber === 4 ? { toolChoice: "none" } : {}), // last step must talk
});
result.consumeStream(); // no await: finishes and saves even if the tab closes
return createUIMessageStreamResponse({
  stream: toUIMessageStream({
    stream: result.stream,
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }), // without it, ids are ""
    onEnd: ({ responseMessage }) => saveMessages(userId, eventId, [messages.at(-1)!, responseMessage]),
    onError: () => "Hacky hit a snag. Try again in a few seconds.", // never leak raw errors
  }),
});
```

Store `parts` exactly as you get them. Tool parts carry `callProviderMetadata`, which holds Gemini's thought signatures.

## Event guides

The agent answers questions about the event itself (schedule, venue, food, parking, Wi-Fi, prizes, tracks, rules, sponsors) only from that event's guide: one markdown file per event at `server/agent/event-guides/<slug>.md`, named by `events.slug`. To add one, write the facts there in plain markdown, including the links to the official hacker's guide and Discord (the agent points there for anything the guide doesn't cover); no code change is needed, and `vercel.json` (`includeFiles`) ships the folder with the function. `eventGuide` in `server/agent/prompts.ts` reads the file once, keeps it in memory and rereads it only when it changes. `buildInstructions` puts it in every mode right after the common rules and before the person's profile, so Gemini's implicit cache can reuse that prefix. An event with no file (like `demo-hacks`) still works: the agent says it doesn't have the event details. Every word is sent with every model call, so keep guides tight. `npm run test:prompts` checks the loader and the prompt.
