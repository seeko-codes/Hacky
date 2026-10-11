// When Hacky opens on its welcome ("Hey, I'm Hacky. What brings you here?", Onboarding.jsx).
// No React, so node can test it.
//
// The entry link /index.html?onboarding=1 (docs/frontend.md) always opens it. App removes the
// param once read, so a refresh or in-app navigation doesn't open it again. Without the link it
// opens on its own only once, for someone genuinely new to this event, and the browser remembers
// that (welcomedKey), so Skip and refresh never bring it back. Skip saves nothing on the server.

export const isWelcomeEntry = (search) => new URLSearchParams(search).get('onboarding') === '1';

// Nothing saved for this event yet: no goals, idea, skills, interests, track or weekend goal.
export const isNewIntake = (intake) => !intake?.motivations?.length && intake?.idea == null
  && !intake?.skills?.length && !intake?.interests?.length && intake?.track == null && intake?.goal == null;

// localStorage key: this person already saw the welcome for this event in this browser.
export const welcomedKey = (userId, slug) => `hacky-welcomed:${userId}:${slug}`;

// welcomed: what welcomedKey holds. Someone who came for something specific (a start request,
// or the event schedule at #events) goes straight there.
export function opensWelcome({ search, hash = '', intake, welcomed }) {
  if (isWelcomeEntry(search)) return true;
  if (welcomed || hash === '#events' || new URLSearchParams(search).has('start')) return false;
  return isNewIntake(intake);
}
