import { people } from "./people.js";

export const initialHistories = {
  team: [
    {
      sender: "Kai",
      text: "Who's finding our fourth? We could use someone who can own the full stack.",
    },
    {
      sender: "Lena",
      text: "I’m on the interface. Let’s find someone excited about the idea.",
    },
  ],
};
export function recommendPeople(text, plan) {
  const q = text.toLowerCase();
  let ids = [];
  if (/mentor|security|secure|ctf|appsec|cyber/.test(q))
    ids = ["aya", "noah", "iris", "theo"];
  else if (/design|figma|ui|ux|frontend|front-end/.test(q) && !/full/.test(q))
    ids = ["jules"];
  else if (/find people|meet people|network|anyone|everyone/.test(q))
    ids = ["mika", "aya", "jules", "ren"];
  else if (
    /full.?stack|backend|back.end|react|node|python|team|build|anime|ghibli/.test(
      q,
    )
  )
    ids = ["mika", "ren", "jules", "kai"];
  const actions = {
    "Career opportunities": "grow your career",
    "Compete for prizes": "compete for prizes",
  };
  const choices = plan?.choices || [];
  const context = choices.length
    ? "You’re here to " +
      choices
        .slice(0, 2)
        .map((x) => actions[x] || x.toLowerCase())
        .join(" and ") +
      "."
    : "Here are a few places to start.";
  return {
    ids,
    text: ids.length
      ? context +
        " I’d start with " +
        (ids.length === 1 ? "this person" : "these " + ids.length + " people") +
        " for " +
        ids.map((id) => people[id].specialty).join(", ") +
        "."
      : "Who or what are you looking for?",
  };
}
export function connectionReason(id, query = "") {
  return /anime|ghibli/.test(query.toLowerCase()) &&
    ["mika", "ren"].includes(id)
    ? "A shared interest in anime, alongside experience building full-stack projects."
    : people[id].reason;
}
