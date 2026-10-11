// The little markup Hacky's replies may use, parsed without React so node can test it:
// **bold**, and lines starting with "- ", "* " or "• " as a bulleted list. Everything else
// shows as typed (React escapes it), so model text can never inject HTML.

const BULLET = /^\s*[-*•]\s+(.+)$/;

// Plain runs and list runs, in order. A text run keeps its inner line breaks but not the
// ones next to a list, since the list starts on its own line anyway.
export function textBlocks(text) {
  const blocks = [];
  for (const line of String(text).split('\n')) {
    const item = line.match(BULLET)?.[1].trim();
    const last = blocks.at(-1);
    if (item) {
      if (last?.type === 'list') last.items.push(item);
      else blocks.push({ type: 'list', items: [item] });
    } else if (last?.type === 'text') last.text += `\n${line}`;
    else blocks.push({ type: 'text', text: line });
  }
  return blocks
    .map((block) => (block.type === 'text' ? { ...block, text: block.text.replace(/^\n+|\n+$/g, '') } : block))
    .filter((block) => block.type === 'list' || block.text.trim());
}

// "a **b** c" -> [{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }]
export function boldRuns(text) {
  return String(text)
    .split(/(\*\*[^*\n]+\*\*)/)
    .filter(Boolean)
    .map((piece) => (/^\*\*[^*\n]+\*\*$/.test(piece) ? { text: piece.slice(2, -2), bold: true } : { text: piece }));
}

// Keep structured event picks, but display them in the order the explanation names them.
// The model sometimes rearranges its bullets after calling show_events. Never add a name
// from prose; unmatched picks retain their relative order after the named ones.
export function orderedEventNames(names, explanation = '') {
  const text = explanation.toLowerCase();
  const position = name => {
    const at = text.indexOf(name.toLowerCase());
    return at < 0 ? Infinity : at;
  };
  return [...names].sort((a, b) => position(a) - position(b));
}
