// The Hacky agent chat for one event: stored history plus useChat (docs/chat.md).
//
//   const chat = useHackyChat(slug);
//   chat.answer('Find me a backend teammate');
//
// answer() sends a new message, or answers the pending ask_with_options question.
import { useEffect, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { api } from '../api.js';

export const isPendingAsk = (part) => part.type === 'tool-ask_with_options' && part.state === 'input-available';

// Auto-send only after a question was answered (the stock helper alone loops after server tools).
export function answeredAsk({ messages }) {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return false;
  const step = last.parts.slice(last.parts.findLastIndex((p) => p.type === 'step-start') + 1);
  return step.some((p) => p.type === 'tool-ask_with_options' && p.state === 'output-available')
    && lastAssistantMessageIsCompleteWithToolCalls({ messages });
}

const textOf = (message) => message.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim();

// The thread without its last user message, when that message got no reply and has the same text.
export function dropUnansweredTurn(messages, text) {
  const i = messages.findLastIndex((m) => m.role === 'user');
  if (i === -1 || textOf(messages[i]) !== text.trim()) return messages;
  const answered = messages.slice(i + 1).some((m) => m.parts.some((p) => p.type !== 'step-start'));
  return answered ? messages : messages.slice(0, i);
}

// Posts only the newest message; the server loads the rest of the thread itself.
export const chatTransport = (slug) => new DefaultChatTransport({
  api: '/api/chat',
  body: { eventSlug: slug },
  prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, message: messages.at(-1) } }),
});

export function useHackyChat(slug) {
  const [history, setHistory] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/api/events/${slug}/chat`, { signal: controller.signal })
      .then((data) => setHistory({ slug, messages: Array.isArray(data?.messages) ? data.messages : [] }))
      .catch((error) => { if (error.name !== 'AbortError') setHistory({ slug, failed: true }); });
    return () => controller.abort();
  }, [slug, attempt]);
  const loaded = history?.slug === slug && !history.failed ? history : null;

  const transport = useMemo(() => chatTransport(slug), [slug]);
  // useChat reads `messages` only when it creates a chat, and it creates one per id.
  // The id is set once history has loaded, so the real chat starts from that history.
  const { messages, setMessages, sendMessage, addToolOutput, status, error, clearError } = useChat({
    id: loaded ? `hacky-${slug}` : undefined,
    messages: loaded?.messages,
    transport,
    sendAutomaticallyWhen: answeredAsk,
    throttle: 50,
  });

  const ready = Boolean(loaded) && (status === 'ready' || status === 'error');
  const last = messages.at(-1);
  const pending = last?.role === 'assistant' ? last.parts.find(isPendingAsk) : undefined;

  // While a question is pending, text answers it. Never sendMessage over an open question.
  const answer = (text) => {
    if (!ready || !text.trim()) return false;
    // Resending the text of an unanswered message (after an error or a reload) replaces
    // that turn; the server reuses the stored message the same way.
    if (!pending) {
      const kept = dropUnansweredTurn(messages, text);
      if (kept !== messages) setMessages(kept);
    }
    clearError();
    if (pending) addToolOutput({ tool: 'ask_with_options', toolCallId: pending.toolCallId, output: { answer: text.trim().slice(0, 500) } });
    else sendMessage({ text });
    return true;
  };

  return {
    loaded: Boolean(loaded),
    failed: Boolean(history?.slug === slug && history.failed),
    retry: () => { setHistory(null); setAttempt((n) => n + 1); },
    historyCount: loaded ? loaded.messages.length : null,
    messages,
    status,
    error,
    ready,
    pending,
    answer,
  };
}
