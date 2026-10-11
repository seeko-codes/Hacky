import { data } from '../event-data.js';

// Only explicit local UI commands bypass the agent. Questions, including brand names,
// belong to the LLM so it can explain them using the person's profile and conversation.
export function isLocalCommand(text) {
  return /^(?:show (?:me )?(?:the )?(?:full )?(?:event )?schedule|browse (?:the )?(?:event )?schedule|show my reminders|my reminders|pause reminders|reminder settings|saved sessions)[.!?]*$/i.test(text.trim());
}

// A complete first paragraph can appear while the next one is still streaming.
// Keep the remainder together, and never split a code block or a list into bubbles.
export function textBubbles(part) {
  const text = part.text || '';
  const split = text.search(/\r?\n\s*\r?\n/);
  if (split < 0 || /```|~~~|^\s*(?:[-*+] |\d+[.)] )/m.test(text.slice(0, split))) return [part];
  return [
    { ...part, text: text.slice(0, split), state: 'done' },
    { ...part, text: text.slice(split).trimStart() },
  ];
}

// Presentation-only parts: never sent to the server or written into chat history.
// Splitting the tool's lead-in lets the existing reveal timer give each bubble its turn.
export function displayMessages(messages, { active = false, eventSlug } = {}) {
  let request = '';
  return messages.map((message, index) => {
    if (message.role === 'user') {
      request = message.parts.filter(p => p.type === 'text').map(p => p.text).join(' ');
      return message;
    }
    if (message.role !== 'assistant') return message;
    const parts = message.parts.flatMap(part => {
      if (part.type === 'text') return textBubbles(part);
      if (part.type !== 'tool-ask_with_options' || part.state === 'input-streaming' || !part.input?.say?.trim()) return [part];
      return [{ type: 'text', text: part.input.say, state: 'done' }, { ...part, input: { ...part.input, say: '' } }];
    });
    const finished = !(active && index === messages.length - 1);
    const text = parts.filter(p => p.type === 'text').map(p => p.text).join(' ');
    const asking = parts.some(p => p.type === 'tool-ask_with_options');
    const aboutSponsors = /\bsponsors?\b|patrocinador/i.test(request);
    if (finished && eventSlug === 'knighthacks-ix' && aboutSponsors && text.trim() && !asking) {
      // Keep the whole guide available, even when the answer only names one sponsor.
      // The rendered directory derives highlights from the current saved profile.
      parts.push({ type: 'sponsor-directory', sponsors: data.sponsors });
    }
    return { ...message, parts };
  });
}
