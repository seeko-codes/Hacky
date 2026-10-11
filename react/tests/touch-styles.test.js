import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// On an iPhone a tapped control keeps :hover until the next tap somewhere else, and focus that
// script moves (a dialog handing focus back) can draw a ring. Either makes a button look stuck or
// selected, so these check every stylesheet the app loads.
const files = [
  ...readdirSync(new URL('../public/app/', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => `public/app/${f}`),
  'public/event-demo/dashboard.css',
  'src/Onboarding.css',
  'src/session.css',
  'src/social/social.css',
  'src/hacky/hacky-chat.css',
];
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// Style rules with the at-rules around them: { selector, body, within: ['@media (hover:hover)', …] }.
function rules(css) {
  const out = [], open = [];
  let text = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      open.push(text.trim());
      text = '';
    } else if (ch === '}') {
      const selector = open.pop();
      if (selector && !selector.startsWith('@')) out.push({ selector, body: text.trim(), within: [...open] });
      text = '';
    } else if (ch === ';' && !open.length) text = ''; // @import
    else text += ch;
  }
  return out;
}
const all = files.flatMap((file) => rules(read(file)).map((rule) => ({ ...rule, file })));
const declarations = (body) => body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(':').map((s) => s.trim()));
const where = (rule) => `${rule.file}: ${rule.selector}`;

test('the stylesheets parse into rules', () => {
  assert.ok(all.length > 300);
  assert.ok(all.some((rule) => rule.selector.includes(':hover') && rule.within.some((at) => /hover\s*:\s*hover/.test(at))));
});

test('hover styles apply only where a pointer can hover', () => {
  for (const rule of all.filter((r) => r.selector.includes(':hover'))) {
    const guarded = rule.within.some((at) => /\(\s*hover\s*:\s*(hover|none)\s*\)/.test(at));
    // A rule that only takes a look away (background:transparent) can't stick.
    const reset = declarations(rule.body).every(([, value]) => /^(transparent|none|inherit|initial|unset)$/.test(value));
    assert.ok(guarded || reset, `${where(rule)} needs @media (hover:hover)`);
  }
});

test('focus styles use :focus-visible; plain :focus only hides a heading outline', () => {
  for (const rule of all.filter((r) => /:focus(?![-\w])/.test(r.selector))) {
    assert.doesNotMatch(rule.selector, /\b(button|a|summary|input|select|textarea)\b/, where(rule));
    assert.deepEqual(declarations(rule.body), [['outline', 'none']], where(rule));
  }
});

test('after a tap, focus moved by script draws no ring, and keyboard rings stay', () => {
  const primitives = rules(read('public/app/hacky-primitives.css'));
  assert.ok(primitives.some((r) => r.selector.startsWith('button:focus-visible') && /outline:\s*2px solid/.test(r.body)), 'keyboard ring');
  assert.ok(primitives.some((r) => r.selector.startsWith(':root[data-input=pointer]') && /:focus-visible/.test(r.selector) && /outline:\s*none/.test(r.body)), 'no ring after a tap');
  // Focus looks other than the outline (a background, a color) are keyboard-only too.
  for (const rule of all.filter((r) => r.selector.includes(':focus-visible'))) {
    const looks = declarations(rule.body).filter(([prop]) => !/^(outline|outline-offset|outline-color|border-radius)$/.test(prop));
    if (looks.length) assert.match(rule.selector, /:root:not\(\[data-input=pointer\]\)/, where(rule));
  }
});

test('a dialog showing a disabled button has no selectable text, so a long press on it selects nothing', () => {
  const app = rules(read('public/app/hacky.css'));
  assert.ok(app.some((r) => r.selector === 'dialog:has(button:disabled)' && /(^|;)\s*user-select:\s*none/.test(r.body)));
  assert.ok(app.some((r) => r.selector.startsWith('dialog:has(button:disabled) :is(textarea,input)') && /user-select:\s*text/.test(r.body)), 'fields stay selectable');
});

test('disabled buttons keep their disabled look under a hover', () => {
  for (const rule of all.filter((r) => r.selector.includes(':hover') && /\b(hk-button|profile-message|send|custom-save|hc-chip)\b/.test(r.selector))) {
    for (const part of rule.selector.split(',').filter((s) => s.includes(':hover') && /\b(hk-button|profile-message|send|custom-save|hc-chip)\b/.test(s))) {
      assert.match(part, /:not\(:disabled\)/, `${rule.file}: ${part.trim()}`);
    }
  }
});
