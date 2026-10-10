// Demo reset (DEMO_MODE=true only). Keeps users, sessions, profiles, event
// memberships, member profiles, teams and embeddings, so demo devices stay
// signed in. Clears app data (requests, blocks, conversations, messages, help
// requests, agent chat history) and puts demo_you back at the start of intake.
//
//   npm run seed:reset

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db/index.js";
import {
  agentMessages,
  blocks,
  connections,
  conversationMembers,
  conversations,
  embeddings,
  eventMembers,
  events,
  helpRequests,
  memberProfiles,
  messages,
} from "../server/db/schema.js";
import { readPeople, userIdFor } from "./people-schema.js";

const DEMO_HANDLE = "demo_you";

async function main() {
  if (process.env.DEMO_MODE !== "true") {
    console.error("Refusing to reset: DEMO_MODE is not \"true\".");
    process.exit(1);
  }

  const demo = readPeople().people.find((p) => p.handle === DEMO_HANDLE);
  if (!demo) throw new Error(`${DEMO_HANDLE} is missing from seed/people.json`);
  const demoId = userIdFor(DEMO_HANDLE);

  const eventRows = await db
    .select({ id: events.id, slug: events.slug })
    .from(events)
    .where(inArray(events.slug, demo.memberships.map((m) => m.event)));
  const eventId = new Map(eventRows.map((e) => [e.slug, e.id]));

  const restoreDemo = demo.memberships.flatMap((m) => {
    const id = eventId.get(m.event);
    if (!id) throw new Error(`Event ${m.event} is not loaded; run npm run seed:load first`);
    return [
      db
        .update(eventMembers)
        .set({ availability: m.availability, looking: m.looking })
        .where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, demoId))),
      db
        .update(memberProfiles)
        .set(m.intake)
        .where(and(eq(memberProfiles.eventId, id), eq(memberProfiles.userId, demoId))),
      // An incomplete profile has no embedding until the intake finishes.
      db
        .delete(embeddings)
        .where(and(eq(embeddings.eventId, id), eq(embeddings.ownerKind, "member"), eq(embeddings.ownerId, demoId))),
    ];
  });

  // One transaction. Children first, though the foreign keys cascade anyway.
  const results = await db.batch([
    db.delete(messages),
    db.delete(conversationMembers),
    db.delete(conversations),
    db.delete(helpRequests),
    db.delete(connections),
    db.delete(blocks),
    db.delete(agentMessages),
    ...restoreDemo,
  ]);

  const labels = ["messages", "conversation_members", "conversations", "help_requests", "connections", "blocks", "agent_messages"];
  const counts = labels.map((label, i) => `${label} ${(results[i] as { rowCount?: number }).rowCount ?? "?"}`);
  console.log(`Cleared: ${counts.join(", ")}`);
  console.log(`Reset ${DEMO_HANDLE} to an incomplete intake in ${demo.memberships.map((m) => m.event).join(", ")}.`);
}

await main();
