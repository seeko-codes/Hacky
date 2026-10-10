// The text we embed for a member or a team. The seed loader uses it, and the
// server can reuse it so live re-embeds match seeded ones. It covers what a
// person or team offers; skills someone wants from others are left out so a
// frontend dev who wants a backend dev doesn't look like a backend dev.

type List = readonly string[] | null | undefined;
type Text = string | null | undefined;

export type MemberTextInput = {
  skills?: List;
  interests?: List;
  track?: Text;
  idea?: Text;
  summary?: Text;
  motivations?: List;
};

export type TeamTextInput = {
  name: string;
  idea?: Text;
  track?: Text;
  wantedSkills?: List;
};

export function memberProfileText(p: MemberTextInput): string {
  return lines([
    ["Skills", list(p.skills)],
    ["Interests", list(p.interests)],
    ["Track", p.track],
    ["Idea", p.idea],
    ["Summary", p.summary],
    ["Motivations", list(p.motivations)],
  ]);
}

export function teamProfileText(t: TeamTextInput): string {
  return lines([
    ["Team", t.name],
    ["Track", t.track],
    ["Idea", t.idea],
    ["Looking for", list(t.wantedSkills)],
  ]);
}

function list(values: List): string {
  return (values ?? []).map((v) => v.trim()).filter(Boolean).join(", ");
}

function lines(fields: [label: string, value: Text][]): string {
  return fields
    .map(([label, value]) => [label, value?.trim()] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}
