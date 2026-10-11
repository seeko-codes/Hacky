// Generates fictional hackathon people with Gemini structured output and
// writes seed/people.json (committed, so every demo run uses the same data).
// Skips if the file exists unless run with --force.
//
//   npm run seed:generate [-- --force]
//   npm run seed:generate -- --append   (adds the expansion batches once)
//
// Slots below fix each person's event, role, track, experience, goal and team
// so the mix is controlled; Gemini fills in names, skills, ideas and bios.
// --append keeps every person and team already in people.json untouched and
// adds the expansion batches after them; it skips if their teams are there.

import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CHAT_MODEL_ID, chatModel } from "../server/agent/model.js";
import { Motivation, type Availability, type Experience, type HackGoal, type Intake } from "../shared/contract.js";
import { heroPeople, heroTeams } from "./heroes.js";
import {
  DEMO_HACKS,
  HACKY_COLORS,
  HACKY_FLAIRS,
  HACKY_LOOKS,
  HACKY_MOVES,
  KNIGHTHACKS,
  PEOPLE_PATH,
  readPeople,
  SeedData,
  teamIdFor,
  type SeedEvent,
  type SeedPerson,
  type SeedTeam,
} from "./people-schema.js";
import { geminiCalls, withRetry } from "./retry.js";

const events: SeedEvent[] = [
  {
    slug: KNIGHTHACKS,
    name: "Knight Hacks IX",
    tracks: ["AI", "Health", "Sustainability", "Fintech", "Games"],
    theme: {},
    startsAt: null,
    endsAt: null,
  },
  {
    slug: DEMO_HACKS,
    name: "Demo Hacks",
    tracks: ["Education", "Climate", "Developer Tools", "Social Impact"],
    theme: {},
    startsAt: null,
    endsAt: null,
  },
];

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

type HackerSlot = {
  id: string;
  role: "hacker";
  track: string | null; // null: open to any track
  experience: Experience;
  goal: HackGoal;
  looking: boolean;
  wantsExperienced?: boolean;
  web3?: boolean; // the only slots allowed to mention blockchain topics
  name?: string; // fixed fictional name; Gemini picks one otherwise
  focus: string;
};
type StaffSlot = {
  id: string;
  role: "mentor" | "sponsor";
  availability: Availability;
  web3?: boolean;
  name?: string;
  focus: string;
};
type Slot = HackerSlot | StaffSlot;
type TeamSlot = {
  key: string;
  track: string;
  owner: string; // slot id
  members: string[]; // slot ids, owner excluded
  maxSize: number;
  wantedSkills: string[];
  hint: string;
};
type Batch = { event: SeedEvent; slots: Slot[]; teams: TeamSlot[]; extraRules: string[] };

const h = (
  id: string,
  track: string | null,
  experience: Experience,
  goal: HackGoal,
  focus: string,
  opts: { looking?: boolean; wantsExperienced?: boolean; web3?: boolean; name?: string } = {},
): HackerSlot => ({ id, role: "hacker", track, experience, goal, focus, looking: opts.looking ?? true, wantsExperienced: opts.wantsExperienced, web3: opts.web3, name: opts.name });
const mentor = (id: string, focus: string, opts: { web3?: boolean; name?: string } = {}): StaffSlot => ({ id, role: "mentor", availability: "available", focus, web3: opts.web3, name: opts.name });

// Knight Hacks: 22 generated hackers + 8 hand-written = 30 (9 beginners).
// Team members other than the owner are not looking.
const knightHacks: Batch = {
  event: events[0]!,
  slots: [
    h("kh01", "AI", "advanced", "win", "ML engineer building LLM agents with retrieval (Python, vector databases)"),
    h("kh02", "AI", "advanced", "ship", "data scientist (pandas, scikit-learn, SQL, notebooks)", { looking: false }),
    h("kh03", "AI", "intermediate", "win", "full-stack web dev who builds AI-powered apps (Next.js, TypeScript, OpenAI-style APIs)"),
    h("kh04", "AI", "intermediate", "learn", "iOS developer (Swift, SwiftUI) curious about on-device ML"),
    h("kh05", "AI", "intermediate", "ship", "frontend dev (Vue, Tailwind) who wants to ship an AI product"),
    h("kh06", "AI", "beginner", "learn", "CS freshman who knows basic Python and wants to try AI APIs", { wantsExperienced: true }),
    h("kh07", "AI", "beginner", "learn", "math major learning Python and Jupyter notebooks"),
    h("kh08", "Health", "intermediate", "win", "mobile dev (React Native, Expo) who likes fitness and habit apps"),
    h("kh09", "Health", "beginner", "learn", "nursing student who learned Figma and some HTML and wants to build tools for patients", { wantsExperienced: true }),
    h("kh10", "Sustainability", "advanced", "win", "embedded and IoT engineer (C, Arduino, Raspberry Pi, sensors)"),
    h("kh11", "Sustainability", "intermediate", "ship", "data visualization dev (D3.js, Python, maps and GIS)", { looking: false }),
    h("kh12", "Sustainability", "intermediate", "learn", "backend dev (Go, Postgres) who cares about climate data"),
    h("kh13", "Sustainability", "beginner", "learn", "environmental science student who knows R and spreadsheets", { wantsExperienced: true }),
    h("kh14", "Sustainability", "beginner", "ship", "first-timer who knows HTML, CSS and a bit of JavaScript"),
    h("kh15", "Fintech", "advanced", "win", "backend engineer from a payments internship (Java, Spring Boot, Kafka)"),
    h("kh16", "Fintech", "intermediate", "win", "full-stack dev (Django, React) into personal finance", { looking: false }),
    h("kh17", "Fintech", "intermediate", "ship", "quant-curious data person (Python, statistics, SQL)"),
    h("kh18", "Fintech", "beginner", "learn", "business and finance student who pitches well and uses no-code tools", { wantsExperienced: true }),
    h("kh19", "Games", "advanced", "win", "game developer (Unity, C#, shaders)"),
    h("kh20", "Games", "intermediate", "ship", "pixel artist and Godot developer", { looking: false }),
    h("kh21", "Games", "beginner", "learn", "beginner who knows Scratch and some JavaScript and loves games"),
    h("kh22", "Games", "beginner", "learn", "music producer learning web audio and JavaScript", { wantsExperienced: true }),
    { id: "khm1", role: "mentor", availability: "available", focus: "ML and AI research engineer (PyTorch, LLMs, computer vision)" },
    { id: "khm2", role: "mentor", availability: "available", focus: "frontend and design systems engineer (React, CSS, accessibility)" },
    { id: "khm3", role: "mentor", availability: "available", focus: "mobile engineer (iOS, Android, Flutter)" },
    { id: "khm4", role: "mentor", availability: "available", focus: "cloud and DevOps engineer (AWS, Docker, CI/CD)" },
    { id: "khm5", role: "mentor", availability: "available", focus: "data engineer (SQL, Spark, data pipelines)" },
    { id: "khs1", role: "sponsor", availability: "available", focus: "developer advocate at a fictional cloud database startup" },
    { id: "khs2", role: "sponsor", availability: "available", focus: "university recruiter at a fictional fintech company" },
  ],
  teams: [
    { key: "copilot_team", track: "AI", owner: "kh01", members: ["kh02"], maxSize: 4, wantedSkills: ["backend", "APIs", "Docker"], hint: "an AI assistant that needs a backend to serve its model" },
    { key: "greengrid_team", track: "Sustainability", owner: "kh10", members: ["kh11"], maxSize: 3, wantedSkills: ["mobile", "Flutter", "app development"], hint: "sensor hardware plus a map, needs a phone app" },
    { key: "ledger_team", track: "Fintech", owner: "kh15", members: ["kh16"], maxSize: 4, wantedSkills: ["UI design", "Figma", "mobile"], hint: "a student budgeting product that needs a designer" },
    { key: "pixel_team", track: "Games", owner: "kh19", members: ["kh20"], maxSize: 3, wantedSkills: ["sound design", "music", "JavaScript"], hint: "a small game that needs music and sound" },
  ],
  extraRules: [
    "Only people in the Health track may list health, medical or wellness interests.",
    "Only kh12 and kh15 may be backend-focused; nobody else lists the tag \"backend\".",
  ],
};

// Demo Hacks: 10 generated hackers + demo_you, 2 mentors, one open team.
const demoHacks: Batch = {
  event: events[1]!,
  slots: [
    h("dh01", "Developer Tools", "advanced", "win", "developer tools engineer (Rust, TypeScript, CLIs)"),
    h("dh02", "Education", "intermediate", "ship", "full-stack dev (SvelteKit, Firebase)"),
    h("dh03", "Climate", "intermediate", "learn", "data analyst (Python, SQL, Tableau)"),
    h("dh04", "Social Impact", "beginner", "learn", "first-year student who knows HTML and CSS", { wantsExperienced: true }),
    h("dh05", "Education", "intermediate", "win", "Android developer (Kotlin, Jetpack Compose)"),
    h("dh06", "Climate", "advanced", "ship", "backend developer (Python, Django, Postgres)"),
    h("dh07", "Developer Tools", "beginner", "learn", "beginner who knows Java from class"),
    h("dh08", "Social Impact", "intermediate", "ship", "UX designer (Figma, user research)"),
    h("dh09", "Education", "beginner", "learn", "teacher's aide learning JavaScript", { wantsExperienced: true }),
    h("dh10", "Developer Tools", "intermediate", "win", "ML engineer (Python, Hugging Face-style transformers)"),
    { id: "dhm1", role: "mentor", availability: "available", focus: "full-stack web engineer (React, Node.js, databases)" },
    { id: "dhm2", role: "mentor", availability: "available", focus: "product and pitching coach, former startup founder" },
  ],
  teams: [
    { key: "patchwork_team", track: "Developer Tools", owner: "dh01", members: [], maxSize: 3, wantedSkills: ["frontend", "React", "docs"], hint: "a developer tool that needs a web UI and docs" },
  ],
  extraRules: [],
};

// ---------------------------------------------------------------------------
// Expansion (--append): about 130 more people so most searches a judge tries
// find strong matches. 106 Knight Hacks hackers + 12 mentors, 11 Demo Hacks
// hackers + 1 mentor, 8 open teams. Every area has a verified mentor.
//
// The rules keep the hero match cases in seed/match-cases.json stable: the
// cases score skill coverage, goal and track, so no new Health-track hacker
// covers backend, ML or design (maya_backend, kai_ml, ivy_health), no new
// beginner or "win" hacker has both backend and ML skills, and no new Health
// team wants what demo_you already has (pulse_team). Mentors never list auth
// skills (leo_auth).
// ---------------------------------------------------------------------------

const expansionRules = [
  "Only Health-track people may list health, medical or wellness interests.",
  "Health-track hackers never list backend, API, SQL or database, machine learning (ML, PyTorch, computer vision, NLP) or design (Figma, UX, UI design) skill tags; teammates cover those.",
  "No hacker lists both a backend or database skill (backend, APIs, SQL, Postgres, MySQL, Node.js, Express, Django, Flask, FastAPI, full-stack) and a machine learning skill (ML, PyTorch, TensorFlow, scikit-learn, computer vision, NLP, deep learning).",
  "When a focus lists skills, use those as the skill tags (you may add one closely related tag). Do not add tags the rules above forbid.",
  "When a focus says the person speaks other languages, say so in the bio and summary and add each non-English language as a skill tag (like \"Spanish\").",
];

const knightHacksMore: Batch[] = [
  {
    event: events[0]!,
    slots: [
      h("x01", "AI", "advanced", "win", "LLM engineer who fine-tunes and evaluates open-weight language models; skills Python, PyTorch, Hugging Face, LoRA, LLMs, ML", { name: "Yusuf Adeyemi" }),
      h("x02", "AI", "intermediate", "ship", "speech recognition and audio ML; skills Python, speech-to-text, NLP, PyTorch, ML", { name: "Lena Hartmann", looking: false }),
      h("x03", "AI", "intermediate", "ship", "builds RAG chatbots; skills Python, LangChain, vector databases, embeddings, prompt engineering", { name: "Omar Haddad" }),
      h("x04", "AI", "intermediate", "learn", "builds AI agents with tool calling in TypeScript; skills TypeScript, Next.js, LLM agents, prompt engineering, frontend", { name: "Bianca Moretti" }),
      h("x05", "AI", "beginner", "learn", "sophomore who has called LLM APIs from small Python scripts; skills Python, prompt engineering, Git", { name: "Ezra Goldfarb", wantsExperienced: true }),
      h("x06", "AI", "advanced", "win", "reinforcement learning for robot simulation; skills Python, PyTorch, reinforcement learning, Gymnasium, ML", { name: "Ruth Kincaid" }),
      h("x07", "AI", "intermediate", "win", "NLP for low-resource languages, speaks Spanish and English; skills Python, spaCy, NLP, Hugging Face, Spanish", { name: "Valentina Ochoa" }),
      h("x08", "AI", "beginner", "learn", "linguistics major learning NLP, speaks Mandarin and English; skills Python, NLTK, Mandarin", { name: "Xiaowen Zhou" }),
      h("x09", "AI", "intermediate", "ship", "AI product prototyper; skills Python, Streamlit, LLMs, prompt engineering, product", { name: "Theo Lindgren" }),
      h("x10", "AI", "advanced", "ship", "MLOps and infrastructure engineer; skills Docker, Kubernetes, MLflow, Python, CI/CD, DevOps", { name: "Grace Achterberg" }),
      h("x11", "AI", "intermediate", "win", "tests and red-teams LLM apps; skills Python, LLM evals, prompt engineering, data labeling", { name: "Imani Calloway" }),
      h("x12", "AI", "beginner", "ship", "coding bootcamp grad; skills JavaScript, React, LLM APIs", { name: "Diego Paredes" }),
      mentor("m01", "applied AI engineer for LLM apps, NLP and data science; skills LLMs, RAG, NLP, LangChain, Python, pandas, data science, prompt engineering", { name: "Shira Kaplan" }),
    ],
    teams: [
      { key: "lecture_team", track: "AI", owner: "x01", members: ["x02"], maxSize: 4, wantedSkills: ["frontend", "React", "accessibility"], hint: "an AI that turns lecture recordings into study plans and needs an accessible web UI" },
    ],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x13", "AI", "advanced", "win", "computer vision engineer; skills OpenCV, PyTorch, YOLO, computer vision, Python", { name: "Astrid Bergqvist" }),
      h("x14", "AI", "intermediate", "ship", "computer vision for drones and robots; skills OpenCV, ROS, Python, C++, computer vision", { name: "Tomasz Wierzbicki" }),
      h("x15", "Sustainability", "intermediate", "win", "satellite imagery for wildfire and crop monitoring; skills Python, PyTorch, GIS, remote sensing, computer vision", { name: "Celeste Arnaud" }),
      h("x16", "AI", "beginner", "learn", "finished an online deep learning course and wants to try image classification; skills Python, NumPy, Jupyter", { name: "Malik Ferguson", wantsExperienced: true }),
      h("x17", "Games", "intermediate", "ship", "hand-tracking and gesture controls for games; skills Python, OpenCV, MediaPipe, Unity", { name: "Ines Carvalho" }),
      h("x18", "Fintech", "advanced", "win", "data scientist for fraud and anomaly detection; skills Python, pandas, scikit-learn, XGBoost, ML", { name: "Farhan Qureshi" }),
      h("x19", "Fintech", "intermediate", "ship", "analytics engineer; skills SQL, dbt, Python, Tableau, data", { name: "Gwen Halvorsen" }),
      h("x20", "Sustainability", "intermediate", "learn", "climate data analyst, speaks Portuguese and English; skills R, ggplot2, Python, pandas, data, Portuguese", { name: "Thiago Albuquerque" }),
      h("x21", "AI", "beginner", "learn", "statistics major; skills R, Excel, statistics, data", { name: "Nora Kristiansen", wantsExperienced: true }),
      h("x22", "Games", "intermediate", "win", "player analytics for games; skills Python, SQL, Tableau, data", { name: "Jae-won Seo" }),
      h("x23", "Sustainability", "advanced", "ship", "geospatial data scientist; skills Python, GeoPandas, PostGIS, scikit-learn, data", { name: "Kenji Matsuda" }),
    ],
    teams: [
      { key: "signs_team", track: "AI", owner: "x13", members: [], maxSize: 3, wantedSkills: ["mobile", "iOS", "Swift"], hint: "a phone app that translates sign language with the camera" },
    ],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x24", "AI", "intermediate", "win", "frontend React dev; skills React, TypeScript, Tailwind CSS, Next.js, frontend", { name: "Owen Castellano" }),
      h("x25", "Fintech", "advanced", "win", "frontend engineer who builds dashboards; skills React, TypeScript, Redux, D3.js, data visualization, frontend", { name: "Priya Raman" }),
      h("x26", "Games", "beginner", "learn", "wants to make browser games; skills HTML, CSS, JavaScript", { name: "Felix Okoro" }),
      h("x27", "Sustainability", "intermediate", "ship", "Svelte developer who builds web maps; skills Svelte, JavaScript, CSS, web maps, frontend", { name: "Hazel Whitcombe" }),
      h("x28", null, "intermediate", "learn", "Angular developer from an internship, speaks Hindi and English; skills Angular, TypeScript, RxJS, frontend, Hindi", { name: "Arjun Mehta" }),
      h("x29", "AI", "beginner", "learn", "self-taught web developer; skills React, JavaScript, CSS", { name: "Daisy Fontaine", wantsExperienced: true }),
      h("x30", "Health", "intermediate", "win", "frontend dev who builds accessible patient-facing web apps; skills React, TypeScript, accessibility, WCAG, frontend", { name: "Desmond Clarke" }),
      h("x31", "AI", "intermediate", "win", "accessibility-focused frontend dev building an AI alt-text tool; skills React, JavaScript, ARIA, screen readers, accessibility", { name: "Sofia Ibarra" }),
      h("x32", "Games", "intermediate", "ship", "UI designer for games; skills Figma, UI design, prototyping, game UI, design", { name: "Gemma Novak" }),
      h("x33", "Fintech", "intermediate", "win", "product designer; skills Figma, UX design, user research, design systems, design", { name: "Laila Rahimi" }),
      h("x34", "Sustainability", "beginner", "learn", "graphic design student new to UX; skills Figma, Illustrator, design", { name: "Wren Halloway" }),
      h("x35", "AI", "advanced", "ship", "UX researcher and designer for AI products; skills Figma, user research, UX design, prototyping, design", { name: "Zainab Oyelaran" }),
      h("x36", "Fintech", "intermediate", "ship", "motion and brand designer who also writes CSS; skills Figma, After Effects, CSS, design", { name: "Damon Kuznetsov" }),
      h("x37", null, "intermediate", "win", "product designer, speaks Korean and English; skills Figma, UX design, design systems, design, Korean", { name: "Min-seo Park" }),
      mentor("m03", "product designer and accessibility specialist; skills Figma, UX design, UI design, design systems, accessibility, WCAG, user research", { name: "Margot Ellison" }),
    ],
    teams: [],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x38", "Fintech", "advanced", "win", "Go backend engineer; skills Go, gRPC, Postgres, Redis, backend", { name: "Bruno Castillo" }),
      h("x39", "AI", "intermediate", "ship", "Rust backend developer; skills Rust, Tokio, Postgres, WebAssembly, backend", { name: "Callum Reid" }),
      h("x40", "Sustainability", "intermediate", "win", "Python backend developer, speaks Spanish and English; skills Python, FastAPI, Postgres, Docker, backend, Spanish", { name: "Andres Villalobos" }),
      h("x41", "Games", "intermediate", "ship", "realtime multiplayer backend; skills Node.js, WebSockets, Redis, TypeScript, backend", { name: "Jonah Feldman" }),
      h("x42", "Fintech", "intermediate", "learn", "Java backend developer, speaks Vietnamese and English; skills Java, Spring Boot, MySQL, backend, Vietnamese", { name: "Linh Tran" }),
      h("x43", "AI", "beginner", "learn", "knows Express basics from a class; skills JavaScript, Node.js, Express", { name: "Kofi Mensah", wantsExperienced: true }),
      h("x44", "Sustainability", "beginner", "ship", "built one Flask app; skills Python, Flask, SQLite", { name: "Petra Novotna" }),
      h("x45", "Fintech", "advanced", "win", "database engineer; skills Postgres, SQL, query tuning, Redis, data modeling, backend", { name: "Rahul Iyer" }),
      h("x46", "AI", "intermediate", "ship", "search and databases; skills MongoDB, Elasticsearch, vector search, Node.js, backend", { name: "Selin Aydin" }),
      h("x47", "Games", "intermediate", "learn", "data modeling student; skills SQL, Postgres, database design, data", { name: "Hugo Lambert" }),
      h("x48", "Sustainability", "advanced", "ship", "cloud engineer; skills AWS, Terraform, Docker, Kubernetes, CI/CD, DevOps", { name: "Ayesha Mirza" }),
      h("x49", "AI", "intermediate", "win", "DevOps and serverless; skills Docker, GitHub Actions, serverless, Linux, DevOps", { name: "Tobias Engel" }),
      h("x50", "Fintech", "beginner", "learn", "studying for a cloud certification; skills AWS, Linux, Bash", { name: "Danielle Osei", wantsExperienced: true }),
      h("x51", "Fintech", "advanced", "win", "application security engineer; skills OAuth, JWT, auth, security, Node.js, penetration testing", { name: "Vera Sokolova" }),
      h("x52", "AI", "intermediate", "ship", "CTF player; skills Python, reverse engineering, cryptography, CTF, security", { name: "Dmitri Volkov" }),
      h("x53", "Fintech", "beginner", "learn", "getting into cybersecurity through CTFs; skills Linux, Python, Wireshark, security", { name: "Jasper Quinlan", wantsExperienced: true }),
      h("x54", "Sustainability", "intermediate", "learn", "identity and sign-in flows; skills OAuth, passwordless login, auth, TypeScript, security", { name: "Roya Farahani" }),
      mentor("m04", "backend and databases engineer who also writes Rust; skills backend, APIs, Go, Rust, Java, Node.js, Python, Postgres", { name: "Hector Salgado" }),
    ],
    teams: [],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x55", "Health", "intermediate", "win", "iOS developer; skills Swift, SwiftUI, HealthKit, mobile", { name: "Kendall Price" }),
      h("x56", "Fintech", "intermediate", "ship", "Android developer, speaks Arabic and English; skills Kotlin, Jetpack Compose, Android, mobile, Arabic", { name: "Youssef Nasser" }),
      h("x57", "Sustainability", "intermediate", "win", "Flutter developer; skills Flutter, Dart, Firebase, mobile", { name: "Isla McAllister" }),
      h("x58", "Games", "beginner", "learn", "React Native beginner; skills JavaScript, React Native, Expo", { name: "Casey Moreno" }),
      h("x59", "AI", "advanced", "win", "iOS developer who ships on-device ML; skills Swift, SwiftUI, Core ML, ML, mobile", { name: "Jordan Ellis" }),
      h("x60", "Health", "beginner", "learn", "nursing student learning Flutter; skills Flutter, Dart", { name: "Taylor Brennan", wantsExperienced: true }),
      h("x61", "Fintech", "advanced", "ship", "cross-platform mobile lead; skills React Native, TypeScript, Expo, mobile", { name: "Avery Kwan" }),
      h("x62", "Games", "advanced", "win", "Unreal Engine VR developer; skills Unreal Engine, C++, Blueprints, VR, game dev", { name: "Logan Mercer" }),
      h("x63", "Games", "intermediate", "ship", "3D artist; skills Blender, Substance Painter, 3D modeling", { name: "Skyler Okada", looking: false }),
      h("x64", "Games", "intermediate", "learn", "Godot developer, speaks Portuguese and English; skills Godot, GDScript, pixel art, game dev, Portuguese", { name: "Rafael Monteiro" }),
      h("x65", "Games", "beginner", "learn", "game design student; skills Unity, C#, game design", { name: "Riley Donovan", wantsExperienced: true }),
      h("x66", "Games", "intermediate", "win", "Unity multiplayer developer; skills Unity, C#, netcode, game dev", { name: "Dakota Hale" }),
      h("x67", "AI", "intermediate", "ship", "augmented reality developer; skills Unity, ARKit, ARCore, C#, AR", { name: "Reese Kaur" }),
      h("x68", "Health", "intermediate", "win", "VR developer for physical therapy exercises; skills Unity, C#, VR, AR", { name: "Quinn Alvarez" }),
      h("x69", "Health", "beginner", "learn", "kinesiology student; skills biomechanics, Excel, research", { name: "Hayden Mbatha", looking: false }),
      h("x70", "Sustainability", "intermediate", "ship", "WebXR developer; skills Three.js, WebXR, JavaScript, 3D, VR", { name: "Cameron Szabo" }),
      h("x71", "Games", "beginner", "ship", "Blender hobbyist; skills Blender, 3D modeling", { name: "Frankie Doyle" }),
      mentor("m05", "game developer and XR engineer; skills Unity, Unreal Engine, Godot, C#, C++, VR, AR, game dev", { name: "Bastian Kruger" }),
    ],
    teams: [
      { key: "rhythm_team", track: "Games", owner: "x62", members: ["x63"], maxSize: 4, wantedSkills: ["sound design", "music production", "audio"], hint: "a VR rhythm game that needs music and sound" },
      { key: "rehab_team", track: "Health", owner: "x68", members: ["x69"], maxSize: 4, wantedSkills: ["computer vision", "ML", "Python"], hint: "VR physical therapy exercises that need pose tracking to count reps" },
    ],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x72", "Sustainability", "advanced", "win", "ESP32 and LoRa sensor networks; skills ESP32, C++, LoRa, MQTT, hardware", { name: "Magnus Eriksen" }),
      h("x73", "AI", "intermediate", "win", "robotics, speaks Japanese and English; skills ROS 2, Python, C++, Raspberry Pi, robotics, Japanese", { name: "Haruto Ishikawa" }),
      h("x74", "Health", "intermediate", "ship", "biomedical engineering student; skills Arduino, MATLAB, signal processing, sensors, hardware", { name: "Neha Kulkarni" }),
      h("x75", "Games", "intermediate", "ship", "builds custom game controllers; skills Arduino, C++, 3D printing, hardware", { name: "Zack Whitfield" }),
      h("x76", "Sustainability", "beginner", "learn", "Raspberry Pi beginner; skills Raspberry Pi, Python", { name: "Tessa Marlowe", wantsExperienced: true }),
      h("x77", "Sustainability", "intermediate", "learn", "embedded Rust on microcontrollers; skills Rust, embedded, STM32, hardware", { name: "Bjorn Aasen" }),
      h("x78", "AI", "advanced", "ship", "FPGA and TinyML engineer; skills C, FPGA, Verilog, TinyML, embedded", { name: "Orion Blackwood" }),
      h("x79", "Health", "beginner", "learn", "electrical engineering freshman; skills Arduino, C", { name: "Lucy Adair" }),
      h("x80", "Sustainability", "intermediate", "win", "energy and grid data; skills Python, energy modeling, pandas, data", { name: "Darius Farrokh" }),
      h("x81", "Sustainability", "advanced", "ship", "carbon accounting data; skills Python, SQL, carbon accounting, data", { name: "Freya Lund" }),
      h("x82", "Sustainability", "beginner", "learn", "environmental studies student; skills Excel, GIS, QGIS", { name: "Chiara Benedetti", wantsExperienced: true }),
      h("x83", "Games", "intermediate", "win", "music producer and audio programmer; skills Ableton Live, Web Audio API, JavaScript, sound design, audio", { name: "Malcolm Ashby" }),
      h("x84", "AI", "advanced", "win", "audio ML for music generation; skills Python, PyTorch, DSP, audio, ML", { name: "Aria Song" }),
      h("x85", "Health", "intermediate", "ship", "music therapy iOS app; skills Swift, AVFoundation, audio, mobile", { name: "Juniper Hayes" }),
      h("x86", "Games", "beginner", "learn", "guitarist learning to write audio plugins; skills C++, JUCE, audio", { name: "Nate Gorski" }),
      mentor("m06", "hardware, embedded and robotics engineer; skills Arduino, ESP32, Raspberry Pi, embedded C, robotics, ROS, PCB design, hardware", { name: "Huy Pham" }),
      mentor("m07", "audio and music tech engineer; skills DSP, Web Audio API, JUCE, C++, audio, music production, sound design", { name: "Corinne Lavoie" }),
      mentor("m08", "climate tech data engineer, speaks French and English; skills GIS, Python, energy data, climate modeling, PostGIS, data, French", { name: "Amelie Girard" }),
    ],
    teams: [
      { key: "irrigation_team", track: "Sustainability", owner: "x72", members: [], maxSize: 3, wantedSkills: ["backend", "Postgres", "data visualization"], hint: "soil sensors that need a backend and a dashboard to save farm water" },
    ],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x87", "Fintech", "advanced", "win", "Solidity developer; skills Solidity, Ethereum, Hardhat, smart contracts, TypeScript, web3", { name: "Kwame Ofori", web3: true }),
      h("x88", "Fintech", "intermediate", "ship", "smart contract auditor in training; skills Solidity, Foundry, testing, web3", { name: "Tabitha Crane", looking: false, web3: true }),
      h("x89", "Fintech", "beginner", "learn", "curious about blockchain; skills JavaScript, Solidity", { name: "Brendan Wu", web3: true }),
      h("x90", "Sustainability", "intermediate", "win", "tracks carbon credits on-chain; skills Solidity, Python, blockchain, web3", { name: "Aaliyah Grant", web3: true }),
      h("x91", "Fintech", "intermediate", "win", "payments backend; skills payments APIs, Node.js, TypeScript, Postgres, backend", { name: "Dario Esposito" }),
      h("x92", "Fintech", "beginner", "ship", "wants to build a budgeting app; skills JavaScript, React, Chart.js", { name: "Phoebe Lanning" }),
      h("x93", "Fintech", "intermediate", "learn", "finance major who codes, speaks Spanish and English; skills Python, Excel, financial modeling, Spanish", { name: "Joaquin Herrera" }),
      h("x94", "Fintech", "advanced", "ship", "product manager who runs the pitch; skills product management, pitching, user interviews, product", { name: "Serena Okwu" }),
      h("x95", "AI", "intermediate", "win", "product lead and storyteller; skills pitching, product, market research, storytelling", { name: "Rhys Pemberton" }),
      h("x96", "Health", "intermediate", "win", "pre-med student who leads product and pitches; skills product, pitching, user interviews, healthcare operations", { name: "Leah Abramowitz" }),
      h("x97", "Games", "beginner", "learn", "business student who wants to practice pitching; skills pitching, Canva, marketing", { name: "Tyler Brandt" }),
      h("x98", "AI", "intermediate", "ship", "edtech developer building quiz and flashcard apps; skills React, Firebase, TypeScript, edtech", { name: "Ravi Bhatt" }),
      h("x99", "AI", "beginner", "learn", "education major who teaches kids to code, speaks Haitian Creole and English; skills Scratch, Python, teaching, Haitian Creole", { name: "Nadege Pierre-Louis" }),
      h("x100", "AI", "advanced", "win", "builds AI tutors; skills Python, LLMs, LangChain, prompt engineering, edtech", { name: "Evan Mwangi" }),
      mentor("m09", "blockchain engineer who reviews smart contracts; skills Solidity, Ethereum, smart contracts, Hardhat, Foundry, web3, TypeScript", { name: "Lukas Brandvold", web3: true }),
      mentor("m10", "fintech engineer, speaks Spanish and English; skills payments, fraud detection, Java, Kafka, Python, fintech, Spanish", { name: "Lucia Navarro" }),
      mentor("m11", "product and pitching coach; skills product management, pitching, storytelling, user research, product, Figma", { name: "Gordon Pryce" }),
      mentor("m12", "edtech engineer and former teacher; skills edtech, learning design, React, Python, curriculum design, LMS", { name: "Claire Whitmore" }),
    ],
    teams: [
      { key: "donate_team", track: "Fintech", owner: "x87", members: ["x88"], maxSize: 4, wantedSkills: ["frontend", "React", "UI design"], hint: "transparent student micro-donations tracked on-chain, needs a friendly web app" },
    ],
    extraRules: expansionRules,
  },
  {
    event: events[0]!,
    slots: [
      h("x101", "Health", "intermediate", "win", "public health data analyst; skills R, Tableau, epidemiology, data", { name: "Simone Adebayo" }),
      h("x102", "Health", "beginner", "learn", "pre-med student who knows some web basics, speaks Spanish and English; skills HTML, CSS, JavaScript, Spanish", { name: "Catalina Restrepo", wantsExperienced: true }),
      h("x103", "Health", "advanced", "ship", "wearables and Bluetooth engineer; skills Bluetooth LE, Kotlin, Android, wearables, mobile", { name: "Brandon Holt" }),
      h("x104", "Health", "intermediate", "win", "React Native developer who likes health apps; skills React Native, TypeScript, Expo, mobile", { name: "Megan Castro" }),
      h("x105", "Health", "beginner", "ship", "nursing informatics student; skills Excel, Tableau, clinical workflows", { name: "Rachel Ostrowski" }),
      h("x106", "Health", "intermediate", "learn", "Flutter developer building peer support apps, speaks French and English; skills Flutter, Dart, mobile, French", { name: "Etienne Laurent" }),
      mentor("m13", "digital health engineer; skills FHIR, HL7, HIPAA compliance, health data, React Native, Python", { name: "Patrice Ndiaye" }),
    ],
    teams: [],
    extraRules: expansionRules,
  },
];

const demoHacksMore: Batch = {
  event: events[1]!,
  slots: [
    h("d01", "Education", "intermediate", "win", "edtech full-stack developer, speaks Spanish and English; skills Next.js, TypeScript, Postgres, full-stack, Spanish", { name: "Gabriela Fuentes" }),
    h("d02", "Education", "beginner", "learn", "education student; skills HTML, CSS, Canva", { name: "Sophie Albrecht", wantsExperienced: true }),
    h("d03", "Climate", "intermediate", "ship", "climate data visualization; skills Python, D3.js, pandas, data", { name: "Eli Morgenstern" }),
    h("d04", "Climate", "advanced", "win", "air quality sensors; skills ESP32, C++, MQTT, hardware", { name: "Takeshi Mori" }),
    h("d05", "Developer Tools", "advanced", "ship", "builds CLIs and developer tools; skills Go, CLI, Docker, backend", { name: "Viktor Hansen" }),
    h("d06", "Developer Tools", "intermediate", "win", "writes code editor extensions; skills TypeScript, Node.js, editor extensions", { name: "Joy Zhao" }),
    h("d07", "Developer Tools", "beginner", "learn", "learning Rust; skills Rust, Git", { name: "Arlo Pennington" }),
    h("d08", "Social Impact", "intermediate", "win", "accessibility developer; skills React, ARIA, screen readers, accessibility, frontend", { name: "Ximena Robles" }),
    h("d09", "Social Impact", "intermediate", "ship", "community organizer who handles data, speaks Tagalog and English; skills Airtable, Excel, product, Tagalog", { name: "Maricel Dizon", looking: false }),
    h("d10", "Social Impact", "beginner", "learn", "first hackathon, speaks Arabic and English; skills Python, HTML, Arabic", { name: "Hamza Khalil" }),
    h("d11", "Education", "advanced", "win", "security engineer who builds safe-browsing tools for schools; skills security, Python, browser extensions, auth", { name: "Gideon Lindahl" }),
    mentor("dm1", "AI and ML engineer; skills Python, PyTorch, LLMs, ML, Hugging Face, data science", { name: "Aiden Mukherjee" }),
  ],
  teams: [
    { key: "esl_team", track: "Education", owner: "d01", members: [], maxSize: 3, wantedSkills: ["ML", "speech recognition", "Python"], hint: "a pronunciation coach for English learners" },
    { key: "transit_team", track: "Social Impact", owner: "d08", members: ["d09"], maxSize: 4, wantedSkills: ["mobile", "Flutter", "design"], hint: "an accessible bus and transit app for riders with disabilities" },
  ],
  extraRules: expansionRules,
};

// ---------------------------------------------------------------------------
// Gemini output (kept simple: Gemini supports a subset of JSON Schema)
// ---------------------------------------------------------------------------

const GenPerson = z.object({
  slot: z.string().describe("The slot id this person fills, copied exactly"),
  name: z.string().describe("Fictional full name"),
  handle: z.string().describe("Lowercase letters, digits and underscores, 3-20 characters"),
  bio: z.string().describe("First person, 1-2 casual sentences, under 200 characters"),
  skills: z.array(z.string()).describe("Short skill tags"),
  skillsWanted: z.array(z.string()).describe("Skills they want from teammates; empty for mentors and sponsors"),
  interests: z.array(z.string()).describe("2-4 short lowercase topics"),
  idea: z.string().describe("One-sentence project idea, or an empty string if open to ideas"),
  summary: z.string().describe("Third person, 1-2 sentences, under 300 characters"),
  motivations: z.array(Motivation).describe("1-3 reasons they came"),
});
type GenPerson = z.infer<typeof GenPerson>;

const GenTeam = z.object({
  key: z.string().describe("The team key, copied exactly"),
  name: z.string().describe("Catchy team name, 1-2 words"),
  idea: z.string().describe("One sentence describing what the team is building"),
});

const GenBatch = z.object({ people: z.array(GenPerson), teams: z.array(GenTeam) });
type GenBatch = z.infer<typeof GenBatch>;

const BANNED = /blockchain|web3|crypto(?!graph)|\bnfts?\b|quantum|haskell|cobol/i;
// Slots marked web3 may talk about blockchain, but nothing else on the list.
const BANNED_WEB3 = /\bnfts?\b|quantum|haskell|cobol/i;
const bannedFor = (slot: Slot) => (slot.web3 ? BANNED_WEB3 : BANNED);

function prompt(batch: Batch, taken: SeedPerson[]): string {
  const slotLines = batch.slots.map((slot) => {
    const team = batch.teams.find((t) => t.owner === slot.id || t.members.includes(slot.id));
    const teamNote = team ? (team.owner === slot.id ? `owns team ${team.key}` : `member of team ${team.key}`) : undefined;
    return JSON.stringify(
      slot.role === "hacker"
        ? { slot: slot.id, ...(slot.name ? { name: slot.name } : {}), role: "hacker", track: slot.track ?? "any (open to every track)", experience: slot.experience, goal: slot.goal, focus: slot.focus, ...(slot.wantsExperienced ? { wantsExperiencedTeammate: true } : {}), ...(slot.web3 ? { web3: true } : {}), ...(teamNote ? { team: teamNote } : {}) }
        : { slot: slot.id, ...(slot.name ? { name: slot.name } : {}), role: slot.role, focus: slot.focus, ...(slot.web3 ? { web3: true } : {}) },
    );
  });
  const teamLines = batch.teams.map((t) =>
    JSON.stringify({ key: t.key, track: t.track, owner: t.owner, members: t.members, wantedSkills: t.wantedSkills, hint: t.hint }),
  );
  const topicRule = batch.slots.some((s) => s.web3)
    ? "Only slots marked web3 may mention blockchain, web3, Ethereum, Solidity or smart contracts. Nobody mentions crypto trading, NFTs, quantum computing, Haskell or COBOL."
    : "Never mention blockchain, web3, crypto, NFTs, quantum computing, Haskell or COBOL.";

  return `You write realistic, varied, fictional attendees for Hacky, a demo app that matches hackathon attendees with teammates and mentors.

Event: ${batch.event.name}, a 36-hour student hackathon. Tracks: ${batch.event.tracks.join(", ")}.

Write exactly one person per slot below and copy each slot id into "slot". Follow each slot's role, track, experience, goal and focus closely.

Rules for everyone:
- Everyone is fictional. Never use real people, real companies, real startups or real school names. Invented company and product names must not resemble real ones, and handles never contain company or product names.
- Names: realistic first and last names from many different backgrounds, with no titles like "Dr.". No two people share a first name or a last name. When a slot has a name, use exactly that name.
- handle: lowercase, 3-20 characters, letters, digits and underscores only, based on the person's name plus a short hint (like "priya_builds"). All handles unique.
- bio: first person, 1-2 casual sentences, under 200 characters. No links, no emoji, no hashtags.
- skills: hackers 3-7 tags (beginners 2-4). Use common spellings like "React", "TypeScript", "Node.js", "Python", "Postgres", "Figma", "Unity", "C#". Include one broad role tag that fits, from: frontend, backend, full-stack, ML, data, design, mobile, hardware, game dev, DevOps, product, security, AR/VR, audio.
- skillsWanted: hackers 1-3 tags for what they need from teammates, preferring the broad role tags. Mentors and sponsors: empty.
- interests: 2-4 short lowercase topics that fit their track (like "climate tech", "personal finance", "indie games").
- idea: hackers write one specific sentence that fits their track, or "" if they are open to ideas (most beginners are). Team owners and members use their team's idea. Mentors and sponsors: "".
- summary: third person, 1-2 sentences, under 300 characters: experience level, main skills, track and what they are looking for. It is used for search.
- motivations: 1-3 of build, learn, meet, career, compete, fun, consistent with their goal. Mentors usually meet or fun; sponsors career or meet.
- ${topicRule}
- Mentors are industry engineers volunteering for the weekend: their bio says what they can help with, skills are 4-8 tags of their expertise, and none of them lists authentication, OAuth, login or security skills.
- Sponsors represent an invented company: skills are the technologies their company uses, and the summary says what they are recruiting for.
- These people already exist. Do not reuse any of their first names, last names or handles: ${taken.map((p) => `${p.name} (${p.handle})`).join(", ")}.
${batch.extraRules.map((r) => `- ${r}`).join("\n")}

Slots:
${slotLines.join("\n")}

Teams: for each team below, write a catchy 1-2 word name and a one-sentence idea that fits its hint and track. Its owner and members are slots above; their skills should not already cover the team's wanted skills.
${teamLines.join("\n")}`;
}

async function generateBatch(batch: Batch, taken: SeedPerson[]): Promise<GenBatch> {
  return withRetry(`generate ${batch.event.slug}`, "generate", async () => {
    const { output } = await generateText({
      model: chatModel,
      output: Output.object({ schema: GenBatch, name: "hackathon_people" }),
      prompt: prompt(batch, taken),
      maxRetries: 0, // withRetry paces retries for the free tier
    });
    const slotIds = new Set(output.people.map((p) => p.slot));
    const missing = batch.slots.filter((s) => !slotIds.has(s.id)).map((s) => s.id);
    const missingTeams = batch.teams.filter((t) => !output.teams.some((g) => g.key === t.key)).map((t) => t.key);
    if (missing.length || missingTeams.length || output.people.length !== batch.slots.length) {
      throw new Error(`Incomplete output: missing slots [${missing}] teams [${missingTeams}], got ${output.people.length} people`);
    }
    return output;
  });
}

// ---------------------------------------------------------------------------
// Turning Gemini output into seed rows
// ---------------------------------------------------------------------------

const warnings: string[] = [];

function hash(text: string): number {
  return createHash("sha256").update(text).digest().readUInt32BE(0);
}

function pick<T>(options: readonly T[], seed: number): T {
  return options[seed % options.length]!;
}

function cleanTags(tags: string[], max: number, drop?: RegExp, banned: RegExp = BANNED): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key) || banned.test(tag) || drop?.test(tag)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, max);
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2))}…`;
}

function uniqueHandle(raw: string, name: string, taken: Set<string>): string {
  const ascii = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let base = ascii(raw).replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 26);
  if (base.length < 3) base = ascii(name).replace(/[^a-z0-9]+/g, "_").slice(0, 26);
  if (base.length < 3) base = `hacker_${base}`;
  let handle = base;
  for (let n = 2; taken.has(handle); n++) handle = `${base}_${n}`;
  taken.add(handle);
  return handle;
}

function toSeed(batch: Batch, gen: GenBatch, taken: Set<string>): { people: SeedPerson[]; teams: SeedTeam[] } {
  const bySlot = new Map<string, SeedPerson>();

  for (const slot of batch.slots) {
    const g = gen.people.find((p) => p.slot === slot.id)!;
    const name = slot.name ?? clip(g.name, 80);
    if (slot.name && g.name.trim() !== slot.name) warnings.push(`${slot.id}: Gemini wrote ${g.name} instead of ${slot.name}`);
    const handle = uniqueHandle(g.handle, name, taken);
    const seed = hash(handle);
    const staff = slot.role !== "hacker";
    const banned = bannedFor(slot);
    const skills = cleanTags(g.skills, staff ? 8 : slot.experience === "beginner" ? 5 : 8, staff ? /auth|oauth|security|login|jwt|sso/i : undefined, banned);
    const intake: Intake = {
      skills,
      skillsWanted: staff ? [] : cleanTags(g.skillsWanted, 4, undefined, banned),
      experience: staff ? "advanced" : slot.experience,
      wantsExperienced: staff ? false : (slot.wantsExperienced ?? false),
      goal: staff ? null : slot.goal,
      track: staff ? null : slot.track,
      interests: cleanTags(g.interests, 5, undefined, banned),
      idea: staff || !g.idea.trim() ? null : clip(g.idea, 300),
      motivations: [...new Set(g.motivations)].slice(0, 3),
      summary: clip(g.summary, 400),
      complete: true,
    };
    for (const [field, value] of Object.entries({ bio: g.bio, idea: g.idea, summary: g.summary })) {
      if (banned.test(value)) warnings.push(`${handle}.${field} mentions a banned topic: ${value}`);
    }
    if (batch.event.slug === KNIGHTHACKS && !staff && slot.track !== "Health" && intake.interests.some((i) => /health|medical|wellness/i.test(i))) {
      warnings.push(`${handle} (${slot.track}) lists health interests: ${intake.interests.join(", ")}`);
    }

    bySlot.set(slot.id, {
      handle,
      name,
      bio: clip(g.bio, 280),
      links: seed % 3 === 0 ? { website: `https://example.com/${handle}` } : {},
      hackyStyle: {
        look: pick(HACKY_LOOKS, seed),
        color: pick(HACKY_COLORS, seed >>> 4),
        flair: pick(HACKY_FLAIRS, seed >>> 8),
        move: pick(HACKY_MOVES, seed >>> 12),
      },
      memberships: [
        {
          event: batch.event.slug,
          role: slot.role,
          verified: staff,
          availability: staff ? slot.availability : "available",
          looking: staff ? false : slot.looking,
          intake,
        },
      ],
    });
  }

  const teams: SeedTeam[] = batch.teams.map((t) => {
    const g = gen.teams.find((x) => x.key === t.key)!;
    return {
      id: teamIdFor(batch.event.slug, t.key),
      key: t.key,
      event: batch.event.slug,
      name: clip(g.name, 80),
      owner: bySlot.get(t.owner)!.handle,
      members: t.members.map((m) => bySlot.get(m)!.handle),
      idea: clip(g.idea, 300),
      track: t.track,
      wantedSkills: t.wantedSkills,
      maxSize: t.maxSize,
    };
  });

  return { people: [...bySlot.values()], teams };
}

// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--append")) return append();
  const force = process.argv.includes("--force");
  if (existsSync(PEOPLE_PATH) && !force) {
    console.log("seed/people.json already exists; rerun with --force to regenerate.");
    return;
  }

  const taken = new Set(heroPeople.map((p) => p.handle));
  const people: SeedPerson[] = [...heroPeople];
  const teams: SeedTeam[] = [...heroTeams];

  for (const batch of [knightHacks, demoHacks]) {
    console.log(`Generating ${batch.slots.length} people for ${batch.event.slug}…`);
    const seeded = toSeed(batch, await generateBatch(batch, people), taken);
    people.push(...seeded.people);
    teams.push(...seeded.teams);
  }

  const data = SeedData.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    model: CHAT_MODEL_ID,
    events,
    people,
    teams,
  });

  for (const [label, part] of [["first", 0], ["last", -1]] as const) {
    const names = data.people.map((p) => p.name.split(" ").at(part)!);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) warnings.push(`Repeated ${label} names: ${[...new Set(dupes)].join(", ")}`);
  }

  writeFileSync(PEOPLE_PATH, `${JSON.stringify(data, null, 2)}\n`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`Wrote ${data.people.length} people and ${data.teams.length} teams to seed/people.json`);
  console.log(`Gemini generate calls: ${geminiCalls.generate}`);
}

/** Adds the expansion batches after everyone already in people.json, leaving them untouched. */
async function append() {
  const existing = readPeople();
  const batches = [...knightHacksMore, demoHacksMore];
  const keys = new Set(existing.teams.map((t) => t.key));
  if (batches.some((b) => b.teams.some((t) => keys.has(t.key)))) {
    console.log("The expansion is already in seed/people.json; nothing to append.");
    return;
  }

  const taken = new Set(existing.people.map((p) => p.handle));
  const people: SeedPerson[] = [...existing.people];
  const teams: SeedTeam[] = [...existing.teams];
  const added: SeedPerson[] = [];
  // One batch at a time, so each prompt sees every name already used.
  for (const [i, batch] of batches.entries()) {
    console.log(`Generating ${batch.slots.length} people for ${batch.event.slug} (batch ${i + 1}/${batches.length})…`);
    const seeded = toSeed(batch, await generateBatch(batch, people), taken);
    people.push(...seeded.people);
    added.push(...seeded.people);
    teams.push(...seeded.teams);
  }

  const data = SeedData.parse({
    ...existing,
    generatedAt: new Date().toISOString(),
    model: existing.model.includes(CHAT_MODEL_ID) ? existing.model : `${existing.model} + ${CHAT_MODEL_ID}`,
    people,
    teams,
  });

  for (const [label, part] of [["first", 0], ["last", -1]] as const) {
    const name = (p: SeedPerson) => p.name.split(" ").at(part)!;
    const before = new Set(existing.people.map(name));
    const seen = new Set<string>();
    const dupes = added.map(name).filter((n) => before.has(n) || seen.has(n) || !seen.add(n));
    if (dupes.length) warnings.push(`New people repeat ${label} names: ${[...new Set(dupes)].join(", ")}`);
  }

  writeFileSync(PEOPLE_PATH, `${JSON.stringify(data, null, 2)}\n`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`Appended ${added.length} people and ${data.teams.length - existing.teams.length} teams; seed/people.json now has ${data.people.length} people.`);
  console.log(`Gemini generate calls: ${geminiCalls.generate}`);
}

await main();
