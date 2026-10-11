// Hand-written hero users for the demo story. The match test cases depend on
// these exact handles and traits, so change them only together with
// seed/match-cases.json.

import type { Intake } from "../shared/contract.js";
import { DEMO_HACKS, KNIGHTHACKS, teamIdFor, type SeedPerson, type SeedTeam } from "./people-schema.js";

const blank: Intake = {
  skills: [],
  skillsWanted: [],
  experience: null,
  wantsExperienced: false,
  goal: null,
  track: null,
  interests: [],
  idea: null,
  motivations: [],
  summary: null,
  complete: true,
};

const site = (handle: string) => ({ website: `https://example.com/${handle}` });

// What the hackathon shared at launch. The live intake fills in the rest:
// skillsWanted [backend, ML], goal win, track Health.
export const demoYouStartingIntake: Intake = {
  ...blank,
  skills: ["React", "TypeScript", "CSS", "frontend", "UI"],
  experience: "intermediate",
  complete: false,
};

const pulseIdea =
  "A web app that turns wearable heart-rate data into simple daily stress check-ins for students, with tips and a nudge toward campus counseling.";

export const heroPeople: SeedPerson[] = [
  {
    handle: "demo_you",
    name: "Alex Rivera",
    bio: "Frontend dev who turns rough ideas into fast, friendly UIs. Here to build something people actually use.",
    links: site("demo_you"),
    hackyStyle: { look: "knit", color: "original", flair: "stars", move: "bounce" },
    memberships: [
      { event: KNIGHTHACKS, role: "hacker", verified: false, availability: "available", looking: true, intake: demoYouStartingIntake },
      { event: DEMO_HACKS, role: "hacker", verified: false, availability: "available", looking: true, intake: demoYouStartingIntake },
    ],
  },
  {
    handle: "maya_backend",
    name: "Maya Okafor",
    bio: "Backend engineer who loves clean APIs and boring, reliable databases. Last summer I built appointment services for a small clinic.",
    links: site("maya_backend"),
    hackyStyle: { look: "knit", color: "mint", flair: "stars", move: "bounce" },
    photoUrl: "/assets/people/iris.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: true,
        intake: {
          ...blank,
          skills: ["backend", "Node.js", "Postgres", "APIs", "Python", "Express", "Docker"],
          skillsWanted: ["frontend", "UI"],
          experience: "advanced",
          goal: "win",
          track: "Health",
          interests: ["health tech", "digital health", "data privacy"],
          idea: "A symptom check-in app that tells students when to visit campus health, built on a privacy-first API.",
          summary:
            "Advanced backend developer (Node.js, Postgres, Python, REST APIs) into health tech. Wants to win the Health track and needs a frontend teammate.",
          motivations: ["build", "compete"],
        },
      },
    ],
  },
  {
    handle: "sam_offgrid",
    name: "Sam Whitaker",
    bio: "Backend and infrastructure nerd. Already locked in with my crew this weekend, but always up to talk Go and Postgres.",
    links: {},
    hackyStyle: { look: "knit", color: "original", flair: "none", move: "idle" },
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: false,
        intake: {
          ...blank,
          skills: ["backend", "Go", "Node.js", "Postgres", "APIs", "Python", "Redis", "Kubernetes"],
          skillsWanted: [],
          experience: "advanced",
          goal: "win",
          track: "Health",
          interests: ["health tech", "infrastructure", "distributed systems"],
          idea: "A real-time bed availability API for hospitals.",
          summary:
            "Advanced backend engineer (Go, Node.js, Postgres, APIs) interested in health tech. Already has a team and is not looking.",
          motivations: ["compete", "build"],
        },
      },
    ],
  },
  {
    handle: "ivy_health",
    name: "Ivy Nakamura",
    bio: "Product designer on a mission to make health apps less scary. Figma is my happy place.",
    links: site("ivy_health"),
    hackyStyle: { look: "knit", color: "rose", flair: "hearts", move: "dance" },
    photoUrl: "/assets/people/ren.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: true,
        intake: {
          ...blank,
          skills: ["design", "UX design", "UI design", "Figma", "user research", "prototyping"],
          skillsWanted: ["frontend", "developers"],
          experience: "intermediate",
          goal: "win",
          track: "Health",
          interests: ["health tech", "digital health", "accessibility", "mental health"],
          idea: "A calm, accessible medication reminder app for older adults.",
          summary:
            "Intermediate UX and UI designer (Figma, user research, prototyping) passionate about health tech and accessibility. Wants developers to bring her designs to life.",
          motivations: ["build", "meet"],
        },
      },
    ],
  },
  {
    handle: "noah_newbie",
    name: "Noah Bennett",
    bio: "First hackathon! I know some Python and HTML and I'm here to learn from people who have done this before.",
    links: {},
    hackyStyle: { look: "knit", color: "sunset", flair: "stars", move: "bounce" },
    photoUrl: "/assets/people/mika.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: true,
        intake: {
          ...blank,
          skills: ["Python", "HTML", "CSS"],
          skillsWanted: ["backend", "ML"],
          experience: "beginner",
          wantsExperienced: true,
          goal: "learn",
          track: "AI",
          interests: ["AI", "chatbots", "video games"],
          idea: null,
          summary:
            "Beginner at his first hackathon who knows basic Python, HTML and CSS. Wants an experienced teammate and to learn by building an AI project.",
          motivations: ["learn", "meet", "fun"],
        },
      },
    ],
  },
  {
    handle: "kai_ml",
    name: "Kai Nguyen",
    bio: "ML engineer who trains models on medical images for fun. Looking for builders who want to ship something real in 36 hours.",
    links: site("kai_ml"),
    hackyStyle: { look: "knit", color: "ice", flair: "none", move: "hype" },
    photoUrl: "/assets/people/noah.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: true,
        intake: {
          ...blank,
          skills: ["ML", "machine learning", "Python", "PyTorch", "computer vision", "data science"],
          skillsWanted: ["frontend", "backend"],
          experience: "advanced",
          goal: "win",
          track: "Health",
          interests: ["health tech", "medical imaging", "AI"],
          idea: "Skin-spot triage from a phone photo, with a clear threshold for when to see a doctor.",
          summary:
            "Advanced ML engineer (Python, PyTorch, computer vision) focused on medical imaging and health tech. Wants to win the Health track.",
          motivations: ["build", "compete"],
        },
      },
    ],
  },
  {
    handle: "rina_owner",
    name: "Rina Patel",
    bio: "Pre-med turned product person. I keep teams focused, run the user interviews and give the pitch.",
    links: site("rina_owner"),
    hackyStyle: { look: "knit", color: "sunset", flair: "hearts", move: "bounce" },
    photoUrl: "/assets/people/aya.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: true,
        intake: {
          ...blank,
          skills: ["product", "product management", "pitching", "data analysis", "SQL"],
          skillsWanted: ["React", "frontend", "UI"],
          experience: "intermediate",
          goal: "win",
          track: "Health",
          interests: ["health tech", "mental health", "student wellness"],
          idea: pulseIdea,
          summary:
            "Intermediate product lead and pitcher with data analysis skills, building Pulse for the Health track. Needs a frontend developer.",
          motivations: ["build", "compete", "career"],
        },
      },
    ],
  },
  {
    handle: "jules_wearables",
    name: "Jules Moreau",
    bio: "Hardware tinkerer. If it has a sensor, I want to wire it up.",
    links: {},
    hackyStyle: { look: "knit", color: "mint", flair: "none", move: "dance" },
    photoUrl: "/assets/people/jules.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "hacker",
        verified: false,
        availability: "available",
        looking: false,
        intake: {
          ...blank,
          skills: ["hardware", "Arduino", "embedded C", "Bluetooth LE", "wearables"],
          skillsWanted: ["frontend"],
          experience: "intermediate",
          goal: "win",
          track: "Health",
          interests: ["wearables", "sensors", "student wellness"],
          idea: pulseIdea,
          summary:
            "Intermediate hardware developer (Arduino, embedded C, Bluetooth LE) wiring up the wearable heart-rate sensor for team Pulse.",
          motivations: ["build", "fun"],
        },
      },
    ],
  },
  {
    handle: "leo_auth",
    name: "Leo Martins",
    bio: "Security engineer who has debugged more OAuth redirects than I can count. Bring me your auth bugs.",
    links: site("leo_auth"),
    hackyStyle: { look: "knit", color: "berry", flair: "stars", move: "idle" },
    photoUrl: "/assets/people/kai.webp",
    memberships: [
      {
        event: KNIGHTHACKS,
        role: "mentor",
        verified: true,
        availability: "available",
        looking: false,
        intake: {
          ...blank,
          skills: ["auth", "security", "OAuth", "Postgres", "JWT", "Node.js"],
          experience: "advanced",
          interests: ["identity", "web security", "databases"],
          summary:
            "Verified mentor for authentication and security: OAuth flows, sessions, JWTs and Postgres. Available to help teams debug sign-in problems.",
          motivations: ["meet"],
        },
      },
    ],
  },
];

export const heroTeams: SeedTeam[] = [
  {
    id: teamIdFor(KNIGHTHACKS, "pulse_team"),
    key: "pulse_team",
    event: KNIGHTHACKS,
    name: "Pulse",
    owner: "rina_owner",
    members: ["jules_wearables"],
    idea: pulseIdea,
    track: "Health",
    wantedSkills: ["React", "frontend", "UI"],
    maxSize: 3,
  },
];
