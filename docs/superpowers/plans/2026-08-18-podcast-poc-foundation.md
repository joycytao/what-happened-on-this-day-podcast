# Podcast POC Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end proof-of-concept for the What Happened On This Day podcast team so a PM agent can create or pick up an Episode issue, run research, writing, and Voicebox production, and leave a review-ready run artifact.

**Architecture:** The repository will use a small TypeScript CLI workspace with four agent entrypoints under `agents/`, JSON schemas in `contracts/`, shared config and prompts under `configs/` and `prompts/`, and persistent run directories under `runs/`. The PM agent will orchestrate artifact handoff through file-based contracts instead of sub-issues or GitHub assignee mechanics, making each stage inspectable and rerunnable.

**Tech Stack:** Node.js 22+, TypeScript, Vitest, Zod, GitHub CLI, Voicebox HTTP or MCP adapter

**Spec:** `/Users/jtao/Documents/Projects/6pm/projects/what-happened-on-this-day-podcast/docs/superpowers/specs/2026-08-18-what-happened-on-this-day-podcast-design.md`

## Global Constraints

- Language: English
- Format: Single-story deep dive
- Duration target: 10-15 minutes
- Duration hard ceiling: 15 minutes
- Audience: Children-safe, adult-friendly
- Focus type: Balanced across person, event, or object depending on story quality
- Human review is required before completion
- The repository does not contain the global Studio Chef orchestrator
- The PM agent is the only repository-internal agent that should manage workflow state
- `Episode` issues are part of the automated episode workflow and are either created or picked up by the PM agent
- `Project` issues are not part of the daily episode pipeline and should be initiated manually by the user or Studio Chef
- Research uses a hybrid model with Wikipedia for candidate discovery and 1-2 stronger supporting sources where available
- The first proof of concept uses Voicebox as the TTS engine
- No voice cloning in v1

---

### Task 1: Scaffold the TypeScript agent workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `README.md`
- Create: `src/lib/fs-paths.ts`
- Create: `src/lib/logger.ts`
- Create: `src/lib/cli.ts`
- Create: `tests/smoke/repo-structure.test.ts`

**Interfaces:**
- Consumes: repository root path
- Produces: `resolveRepoPaths(root?: string): { repoRoot: string; agentsDir: string; contractsDir: string; configsDir: string; promptsDir: string; runsDir: string }`
- Produces: `createLogger(scope: string): { info(message: string, meta?: Record<string, unknown>): void; warn(message: string, meta?: Record<string, unknown>): void; error(message: string, meta?: Record<string, unknown>): void }`
- Produces: `parseCliArgs(argv: string[]): { command: string; options: Record<string, string | boolean> }`

- [ ] **Step 1: Write the failing smoke test for required repo helpers**

```ts
import { describe, expect, it } from "vitest";
import { resolveRepoPaths } from "../../src/lib/fs-paths";
import { createLogger } from "../../src/lib/logger";
import { parseCliArgs } from "../../src/lib/cli";

describe("repo foundation", () => {
  it("resolves the canonical workspace directories", () => {
    const paths = resolveRepoPaths("/tmp/podcast-repo");

    expect(paths.repoRoot).toBe("/tmp/podcast-repo");
    expect(paths.agentsDir).toBe("/tmp/podcast-repo/agents");
    expect(paths.contractsDir).toBe("/tmp/podcast-repo/contracts");
    expect(paths.configsDir).toBe("/tmp/podcast-repo/configs");
    expect(paths.promptsDir).toBe("/tmp/podcast-repo/prompts");
    expect(paths.runsDir).toBe("/tmp/podcast-repo/runs");
  });

  it("creates a scoped logger with standard methods", () => {
    const logger = createLogger("pm-agent");

    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("parses a command name and string options", () => {
    expect(
      parseCliArgs([
        "node",
        "pm-agent",
        "pickup-episode",
        "--issue-number",
        "14",
        "--dry-run"
      ])
    ).toEqual({
      command: "pickup-episode",
      options: {
        "issue-number": "14",
        "dry-run": true
      }
    });
  });
});
```

- [ ] **Step 2: Run the smoke test to verify the helpers do not exist yet**

Run: `npm test -- tests/smoke/repo-structure.test.ts`
Expected: FAIL with module resolution errors for `src/lib/fs-paths`, `src/lib/logger`, and `src/lib/cli`

- [ ] **Step 3: Add the minimal Node/TypeScript workspace and helper implementations**

```json
{
  "name": "what-happened-on-this-day-podcast",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "pm-agent": "node --loader tsx ./agents/pm-agent/index.ts"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

```ts
// src/lib/fs-paths.ts
import path from "node:path";

export function resolveRepoPaths(root = process.cwd()) {
  return {
    repoRoot: root,
    agentsDir: path.join(root, "agents"),
    contractsDir: path.join(root, "contracts"),
    configsDir: path.join(root, "configs"),
    promptsDir: path.join(root, "prompts"),
    runsDir: path.join(root, "runs")
  };
}
```

```ts
// src/lib/logger.ts
export function createLogger(scope: string) {
  function emit(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    console[level](`[${scope}] ${message}${payload}`);
  }

  return {
    info(message: string, meta?: Record<string, unknown>) {
      emit("info", message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      emit("warn", message, meta);
    },
    error(message: string, meta?: Record<string, unknown>) {
      emit("error", message, meta);
    }
  };
}
```

```ts
// src/lib/cli.ts
export function parseCliArgs(argv: string[]) {
  const [, , command = "", ...rest] = argv;
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = rest[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}
```

- [ ] **Step 4: Run the smoke test to verify the workspace foundation passes**

Run: `npm test -- tests/smoke/repo-structure.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the workspace scaffold**

```bash
git add package.json tsconfig.json vitest.config.ts README.md src/lib/fs-paths.ts src/lib/logger.ts src/lib/cli.ts tests/smoke/repo-structure.test.ts
git commit -m "chore: scaffold typescript agent workspace"
```

### Task 2: Define shared contracts and repository config

**Files:**
- Create: `contracts/episode-request.schema.json`
- Create: `contracts/research-dossier.schema.json`
- Create: `contracts/transcript.schema.json`
- Create: `contracts/audio-job.schema.json`
- Create: `src/contracts/index.ts`
- Create: `src/lib/content-assets.ts`
- Create: `configs/show-format.json`
- Create: `configs/voicebox.json`
- Create: `configs/editorial-policy.md`
- Create: `configs/source-policy.md`
- Create: `prompts/research/system.md`
- Create: `prompts/writer/system.md`
- Create: `prompts/producer/system.md`
- Test: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `resolveRepoPaths`
- Produces: `episodeRequestSchema`
- Produces: `researchDossierSchema`
- Produces: `transcriptSchema`
- Produces: `audioJobSchema`
- Produces: `loadPrompt(name: "research" | "writer" | "producer"): Promise<string>`
- Produces: `loadJsonConfig<T>(name: "show-format" | "voicebox"): Promise<T>`

- [ ] **Step 1: Write the failing contract validation test**

```ts
import { describe, expect, it } from "vitest";
import {
  audioJobSchema,
  episodeRequestSchema,
  researchDossierSchema,
  transcriptSchema
} from "../../src/contracts";

describe("shared podcast contracts", () => {
  it("accepts a valid episode request", () => {
    expect(() =>
      episodeRequestSchema.parse({
        date: "2026-08-18",
        episodeSlug: "2026-08-18-first-story",
        language: "en",
        audience: "children-first-adult-friendly",
        durationTargetMin: 12,
        durationMaxMin: 15,
        currentStage: "ready"
      })
    ).not.toThrow();
  });

  it("accepts a valid research dossier", () => {
    expect(() =>
      researchDossierSchema.parse({
        episodeDate: "2026-08-18",
        chosenSubject: "The opening of a landmark museum",
        entityType: "object",
        chosenAngle: "How a museum changed the way families learn",
        episodeThesis: "A place built for curiosity can reshape a city.",
        timeline: ["1890: planning begins", "1902: doors open"],
        storyBeats: ["A need emerges", "A public dream grows", "The opening changes access"],
        modernRelevance: "Museums still shape how children meet history today.",
        sources: [{ title: "Museum archive", url: "https://example.com/archive", sourceType: "official" }],
        safetyNotes: []
      })
    ).not.toThrow();
  });

  it("accepts a valid transcript and producer job", () => {
    const transcript = transcriptSchema.parse({
      opening: "Good morning to everyone on the way to school.",
      segments: [
        { heading: "The beginning", body: "A city wanted a new place to learn." }
      ],
      closing: "That is why this story still matters today.",
      estimatedDurationMin: 12,
      ttsNotes: ["Warm pacing", "Pause after opening"]
    });

    expect(
      audioJobSchema.parse({
        voicePreset: "story-narrator-01",
        sourceTranscriptPath: "runs/2026-08-18-first-story/transcript.json",
        outputAudioPath: "runs/2026-08-18-first-story/audio/final.mp3",
        transcript
      })
    ).toMatchObject({ voicePreset: "story-narrator-01" });
  });
});
```

- [ ] **Step 2: Run the contract test to verify schemas are missing**

Run: `npm test -- tests/contracts/contracts.test.ts`
Expected: FAIL with module resolution errors for `src/contracts`

- [ ] **Step 3: Implement the schemas and baseline config assets**

```ts
// src/contracts/index.ts
import { z } from "zod";

export const episodeRequestSchema = z.object({
  date: z.string(),
  episodeSlug: z.string(),
  language: z.literal("en"),
  audience: z.literal("children-first-adult-friendly"),
  durationTargetMin: z.number().min(10).max(15),
  durationMaxMin: z.literal(15),
  selectedAngle: z.string().optional(),
  entityType: z.enum(["person", "event", "object"]).optional(),
  currentStage: z.enum(["ready", "researching", "writing", "producing", "review", "done", "blocked"])
});

export const researchDossierSchema = z.object({
  episodeDate: z.string(),
  chosenSubject: z.string(),
  entityType: z.enum(["person", "event", "object"]),
  chosenAngle: z.string(),
  episodeThesis: z.string(),
  timeline: z.array(z.string()).min(3),
  storyBeats: z.array(z.string()).min(3),
  modernRelevance: z.string(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      sourceType: z.enum(["wikipedia", "official", "reference", "archive", "news"])
    })
  ).min(1),
  safetyNotes: z.array(z.string())
});

export const transcriptSchema = z.object({
  opening: z.string(),
  segments: z.array(
    z.object({
      heading: z.string(),
      body: z.string()
    })
  ).min(1),
  closing: z.string(),
  estimatedDurationMin: z.number().min(10).max(15),
  ttsNotes: z.array(z.string())
});

export const audioJobSchema = z.object({
  voicePreset: z.string(),
  sourceTranscriptPath: z.string(),
  outputAudioPath: z.string(),
  transcript: transcriptSchema
});
```

```ts
// src/lib/content-assets.ts
import fs from "node:fs/promises";
import path from "node:path";
import { resolveRepoPaths } from "./fs-paths";

export async function loadPrompt(name: "research" | "writer" | "producer") {
  const { promptsDir } = resolveRepoPaths();
  return fs.readFile(path.join(promptsDir, name, "system.md"), "utf8");
}

export async function loadJsonConfig<T>(name: "show-format" | "voicebox") {
  const { configsDir } = resolveRepoPaths();
  const content = await fs.readFile(path.join(configsDir, `${name}.json`), "utf8");
  return JSON.parse(content) as T;
}
```

```json
// configs/show-format.json
{
  "language": "en",
  "format": "single-story-deep-dive",
  "durationTargetMin": 12,
  "durationMaxMin": 15,
  "audience": "children-first-adult-friendly",
  "openingStyle": "fixed-shared-greeting",
  "closingStyle": "modern-relevance"
}
```

```json
// configs/voicebox.json
{
  "engine": "voicebox",
  "voicePreset": "story-narrator-01",
  "outputFormat": "mp3",
  "enableVoiceCloning": false
}
```

- [ ] **Step 4: Run the contract tests to verify the schemas pass**

Run: `npm test -- tests/contracts/contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the shared contracts and configs**

```bash
git add contracts src/contracts/index.ts src/lib/content-assets.ts configs/show-format.json configs/voicebox.json configs/editorial-policy.md configs/source-policy.md prompts/research/system.md prompts/writer/system.md prompts/producer/system.md tests/contracts/contracts.test.ts
git commit -m "feat: add podcast contracts and shared config"
```

### Task 3: Build PM agent intake and run-directory orchestration

**Files:**
- Create: `agents/pm-agent/index.ts`
- Create: `agents/pm-agent/github-issue.ts`
- Create: `agents/pm-agent/run-manifest.ts`
- Create: `tests/pm-agent/intake.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `episodeRequestSchema`
- Consumes: `parseCliArgs(argv: string[]): { command: string; options: Record<string, string | boolean> }`
- Produces: `createEpisodeIssueFromBrief(brief: { date: string; workingTitle: string; issueBody?: string }): Promise<{ issueNumber: number; title: string }>`
- Produces: `loadEpisodeIssue(issueNumber: number): Promise<{ issueNumber: number; title: string; body: string; labels: string[] }>`
- Produces: `resolveEpisodeRequest(issue: { issueNumber: number; title: string; body: string; labels: string[] }): EpisodeRequest`
- Produces: `createRunManifest(request: EpisodeRequest): Promise<{ runDir: string; manifestPath: string }>`

- [ ] **Step 1: Write the failing PM intake test**

```ts
import { describe, expect, it } from "vitest";
import { resolveEpisodeRequest } from "../../agents/pm-agent/github-issue";
import { createRunManifest } from "../../agents/pm-agent/run-manifest";

describe("pm agent intake", () => {
  it("creates an episode request from issue metadata", () => {
    expect(
      resolveEpisodeRequest({
        issueNumber: 14,
        title: "Episode: August 18 - A Museum Opens",
        body: [
          "date: 2026-08-18",
          "episode_slug: 2026-08-18-a-museum-opens",
          "language: en",
          "audience: children-first-adult-friendly",
          "duration_target_min: 12",
          "duration_max_min: 15",
          "current_stage: ready"
        ].join("\n"),
        labels: ["type:episode", "status:ready"]
      })
    ).toMatchObject({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      currentStage: "ready"
    });
  });

  it("creates a run manifest on disk", async () => {
    const result = await createRunManifest({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 12,
      durationMaxMin: 15,
      currentStage: "ready"
    });

    expect(result.runDir).toContain("runs/2026-08-18-a-museum-opens");
    expect(result.manifestPath).toContain("episode-request.json");
  });
});
```

- [ ] **Step 2: Run the PM intake test to verify intake code is missing**

Run: `npm test -- tests/pm-agent/intake.test.ts`
Expected: FAIL with module resolution errors for `agents/pm-agent/github-issue` and `agents/pm-agent/run-manifest`

- [ ] **Step 3: Implement PM intake, issue parsing, and run manifest creation**

```ts
// agents/pm-agent/github-issue.ts
import { episodeRequestSchema } from "../../src/contracts";

export function resolveEpisodeRequest(issue: {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
}) {
  const fields = Object.fromEntries(
    issue.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const [key, ...rest] = line.split(":");
        return [key.trim(), rest.join(":").trim()];
      })
  );

  return episodeRequestSchema.parse({
    date: fields.date,
    episodeSlug: fields.episode_slug,
    language: fields.language ?? "en",
    audience: fields.audience ?? "children-first-adult-friendly",
    durationTargetMin: Number(fields.duration_target_min ?? 12),
    durationMaxMin: 15,
    selectedAngle: fields.selected_angle || undefined,
    entityType: fields.entity_type || undefined,
    currentStage: fields.current_stage ?? "ready"
  });
}
```

```ts
// agents/pm-agent/run-manifest.ts
import fs from "node:fs/promises";
import path from "node:path";
import { resolveRepoPaths } from "../../src/lib/fs-paths";

export async function createRunManifest(request: {
  date: string;
  episodeSlug: string;
  language: "en";
  audience: "children-first-adult-friendly";
  durationTargetMin: number;
  durationMaxMin: 15;
  currentStage: "ready" | "researching" | "writing" | "producing" | "review" | "done" | "blocked";
}) {
  const { runsDir } = resolveRepoPaths();
  const runDir = path.join(runsDir, request.episodeSlug);
  const manifestPath = path.join(runDir, "episode-request.json");

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

  return { runDir, manifestPath };
}
```

- [ ] **Step 4: Run the PM intake tests to verify manifest creation passes**

Run: `npm test -- tests/pm-agent/intake.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the PM intake foundation**

```bash
git add agents/pm-agent/index.ts agents/pm-agent/github-issue.ts agents/pm-agent/run-manifest.ts tests/pm-agent/intake.test.ts package.json
git commit -m "feat: add pm agent intake and run manifests"
```

### Task 4: Build the research and writing agents with deterministic fixture mode

**Files:**
- Create: `agents/research-agent/index.ts`
- Create: `agents/research-agent/select-candidate.ts`
- Create: `agents/writer-agent/index.ts`
- Create: `agents/writer-agent/build-transcript.ts`
- Create: `tests/agents/research-agent.test.ts`
- Create: `tests/agents/writer-agent.test.ts`

**Interfaces:**
- Consumes: `EpisodeRequest`
- Consumes: `researchDossierSchema`
- Produces: `runResearchAgent(request: EpisodeRequest): Promise<ResearchDossier>`
- Produces: `selectBestCandidate(candidates: Candidate[]): Candidate`
- Produces: `runWriterAgent(dossier: ResearchDossier): Promise<Transcript>`
- Produces: `buildTranscript(dossier: ResearchDossier): Transcript`

- [ ] **Step 1: Write the failing research and writer tests**

```ts
import { describe, expect, it } from "vitest";
import { runResearchAgent } from "../../agents/research-agent";
import { runWriterAgent } from "../../agents/writer-agent";

describe("research and writer agents", () => {
  it("returns a balanced, children-safe dossier", async () => {
    const dossier = await runResearchAgent({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 12,
      durationMaxMin: 15,
      currentStage: "researching"
    });

    expect(dossier.entityType).toMatch(/person|event|object/);
    expect(dossier.sources.length).toBeGreaterThanOrEqual(1);
    expect(dossier.modernRelevance.length).toBeGreaterThan(10);
  });

  it("turns a dossier into a structured transcript", async () => {
    const transcript = await runWriterAgent({
      episodeDate: "2026-08-18",
      chosenSubject: "A museum opens",
      entityType: "object",
      chosenAngle: "How a museum made history easier to touch",
      episodeThesis: "Public places for curiosity can change a whole city.",
      timeline: ["1890: planning", "1900: building", "1902: opening"],
      storyBeats: ["A city needed a learning place", "People built it together", "Families finally entered"],
      modernRelevance: "Children still learn from museums today.",
      sources: [{ title: "Archive", url: "https://example.com/archive", sourceType: "official" }],
      safetyNotes: []
    });

    expect(transcript.opening.length).toBeGreaterThan(20);
    expect(transcript.segments.length).toBeGreaterThanOrEqual(3);
    expect(transcript.estimatedDurationMin).toBeLessThanOrEqual(15);
  });
});
```

- [ ] **Step 2: Run the agent tests to verify the agent modules are missing**

Run: `npm test -- tests/agents/research-agent.test.ts tests/agents/writer-agent.test.ts`
Expected: FAIL with module resolution errors for `agents/research-agent` and `agents/writer-agent`

- [ ] **Step 3: Implement deterministic fixture-mode research and transcript generation**

```ts
// agents/research-agent/index.ts
import { researchDossierSchema } from "../../src/contracts";

export async function runResearchAgent(request: {
  date: string;
  episodeSlug: string;
  language: "en";
  audience: "children-first-adult-friendly";
  durationTargetMin: number;
  durationMaxMin: 15;
  currentStage: string;
}) {
  return researchDossierSchema.parse({
    episodeDate: request.date,
    chosenSubject: "A museum opening that changed public learning",
    entityType: "object",
    chosenAngle: "How a new public museum turned history into a place families could visit",
    episodeThesis: "A building for curiosity can change how a city learns.",
    timeline: ["1888: civic leaders propose the museum", "1898: construction begins", "1902: the museum opens"],
    storyBeats: ["A city imagines a new learning space", "Builders and supporters make it real", "Families walk through the doors and history feels closer"],
    modernRelevance: "Museums still help children connect objects, stories, and ideas today.",
    sources: [
      { title: "Wikipedia candidate page", url: "https://example.com/wiki", sourceType: "wikipedia" },
      { title: "Museum official history", url: "https://example.com/official", sourceType: "official" }
    ],
    safetyNotes: []
  });
}
```

```ts
// agents/writer-agent/build-transcript.ts
import { transcriptSchema } from "../../src/contracts";

export function buildTranscript(dossier: {
  chosenSubject: string;
  chosenAngle: string;
  storyBeats: string[];
  modernRelevance: string;
}) {
  return transcriptSchema.parse({
    opening: "Good morning to everyone eating breakfast, getting ready for school, or settling in for a story.",
    segments: [
      {
        heading: "A big idea begins",
        body: `Today's story is about ${dossier.chosenSubject}. It began with a simple question: ${dossier.chosenAngle}`
      },
      {
        heading: "The turning point",
        body: dossier.storyBeats[1]
      },
      {
        heading: "Why it still matters",
        body: dossier.modernRelevance
      }
    ],
    closing: `And that is how this story still reaches us today: ${dossier.modernRelevance}`,
    estimatedDurationMin: 12,
    ttsNotes: ["Warm pace", "Gentle pause after opening", "Lift energy in the turning point"]
  });
}
```

- [ ] **Step 4: Run the agent tests to verify the fixture-mode chain passes**

Run: `npm test -- tests/agents/research-agent.test.ts tests/agents/writer-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the research and writer agents**

```bash
git add agents/research-agent/index.ts agents/research-agent/select-candidate.ts agents/writer-agent/index.ts agents/writer-agent/build-transcript.ts tests/agents/research-agent.test.ts tests/agents/writer-agent.test.ts
git commit -m "feat: add research and writer agent fixtures"
```

### Task 5: Build the Voicebox producer adapter and end-to-end PM dry run

**Files:**
- Create: `agents/producer-agent/index.ts`
- Create: `agents/producer-agent/voicebox-adapter.ts`
- Create: `tests/agents/producer-agent.test.ts`
- Create: `tests/e2e/pm-agent-dry-run.test.ts`
- Modify: `agents/pm-agent/index.ts`

**Interfaces:**
- Consumes: `Transcript`
- Consumes: `audioJobSchema`
- Produces: `renderWithVoicebox(job: AudioJob): Promise<{ audioPath: string; metadataPath: string }>`
- Produces: `runProducerAgent(transcript: Transcript, outputDir: string): Promise<{ audioPath: string; metadataPath: string }>`
- Produces: `runEpisodePipeline(input: { issueNumber?: number; brief?: { date: string; workingTitle: string } }): Promise<{ runDir: string; finalStage: "review" | "blocked" }>`

- [ ] **Step 1: Write the failing producer and end-to-end tests**

```ts
import { describe, expect, it } from "vitest";
import { runProducerAgent } from "../../agents/producer-agent";
import { runEpisodePipeline } from "../../agents/pm-agent";

describe("producer and pm dry run", () => {
  it("creates audio metadata from a transcript", async () => {
    const result = await runProducerAgent(
      {
        opening: "Good morning to everyone on the way to school.",
        segments: [{ heading: "The beginning", body: "A city dreamed of a new museum." }],
        closing: "That dream still matters today.",
        estimatedDurationMin: 12,
        ttsNotes: ["Warm pace"]
      },
      "runs/test-audio"
    );

    expect(result.audioPath).toContain("final.mp3");
    expect(result.metadataPath).toContain("render-metadata.json");
  });

  it("runs the full pm dry run to review", async () => {
    const result = await runEpisodePipeline({
      brief: {
        date: "2026-08-18",
        workingTitle: "A Museum Opens"
      }
    });

    expect(result.runDir).toContain("runs/");
    expect(result.finalStage).toBe("review");
  });
});
```

- [ ] **Step 2: Run the producer and end-to-end tests to verify the final stage is missing**

Run: `npm test -- tests/agents/producer-agent.test.ts tests/e2e/pm-agent-dry-run.test.ts`
Expected: FAIL with module resolution errors for `agents/producer-agent` and missing `runEpisodePipeline`

- [ ] **Step 3: Implement the Voicebox adapter stub and PM dry run orchestration**

```ts
// agents/producer-agent/voicebox-adapter.ts
import fs from "node:fs/promises";
import path from "node:path";

export async function renderWithVoicebox(job: {
  voicePreset: string;
  outputAudioPath: string;
  transcript: { opening: string; segments: Array<{ heading: string; body: string }>; closing: string };
}) {
  const outputDir = path.dirname(job.outputAudioPath);
  const metadataPath = path.join(outputDir, "render-metadata.json");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(job.outputAudioPath, "VOICEBOX_STUB_AUDIO\n", "utf8");
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        engine: "voicebox",
        voicePreset: job.voicePreset,
        segmentCount: job.transcript.segments.length
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    audioPath: job.outputAudioPath,
    metadataPath
  };
}
```

```ts
// agents/pm-agent/index.ts
import { createRunManifest } from "./run-manifest";
import { runResearchAgent } from "../research-agent";
import { runWriterAgent } from "../writer-agent";
import { runProducerAgent } from "../producer-agent";

export async function runEpisodePipeline(input: {
  issueNumber?: number;
  brief?: { date: string; workingTitle: string };
}) {
  const request = {
    date: input.brief?.date ?? "2026-08-18",
    episodeSlug: `${input.brief?.date ?? "2026-08-18"}-${(input.brief?.workingTitle ?? "daily-episode").toLowerCase().replace(/\s+/g, "-")}`,
    language: "en" as const,
    audience: "children-first-adult-friendly" as const,
    durationTargetMin: 12,
    durationMaxMin: 15 as const,
    currentStage: "ready" as const
  };

  const { runDir } = await createRunManifest(request);
  const dossier = await runResearchAgent({ ...request, currentStage: "researching" });
  const transcript = await runWriterAgent(dossier);
  await runProducerAgent(transcript, `${runDir}/audio`);

  return {
    runDir,
    finalStage: "review" as const
  };
}
```

- [ ] **Step 4: Run the producer and end-to-end tests to verify the dry run reaches review**

Run: `npm test -- tests/agents/producer-agent.test.ts tests/e2e/pm-agent-dry-run.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the producer and end-to-end dry run**

```bash
git add agents/producer-agent/index.ts agents/producer-agent/voicebox-adapter.ts agents/pm-agent/index.ts tests/agents/producer-agent.test.ts tests/e2e/pm-agent-dry-run.test.ts
git commit -m "feat: add voicebox producer dry run pipeline"
```
