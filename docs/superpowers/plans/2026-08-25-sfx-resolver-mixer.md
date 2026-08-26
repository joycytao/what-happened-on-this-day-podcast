# SFX Resolver Mixer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first deterministic SFX resolver and mixer metadata path for producer-agent cue output.

**Architecture:** Keep Voicebox responsible for narration only. Resolve extracted `[SFX:]`, `[BGM:]`, and `[PAUSE:]` cues into reviewable manifest entries with deterministic local synthesis where supported, explicit unresolved fallback entries where unsupported, and mixer metadata that describes narration, pauses, cue tracks, and final output.

**Tech Stack:** TypeScript, Vitest, Node.js filesystem APIs.

**Spec:** GitHub issue #12 and `docs/voicebox-sfx-spike.md`.

## Global Constraints

- Implement the smallest complete unit that satisfies issue #12.
- Preserve `audio/final.mp3`, `audio/render-metadata.json`, and `audio/sfx-manifest.json`.
- Resolve bell, clock tick, whoosh, and time machine hum without using Voicebox for non-speech generation.
- Represent unresolved cues explicitly in `audio/sfx-manifest.json`.
- Reference issue #9, PR #10, and `docs/voicebox-sfx-spike.md` in the implementation PR.

---

### Task 1: Resolver Behavior

**Files:**
- Create: `agents/producer-agent/sfx-resolver.ts`
- Modify: `tests/agents/producer-agent.test.ts`

**Interfaces:**
- Consumes: `ProductionCue` from `agents/producer-agent/sfx-cues.ts`
- Produces: `resolveProductionCues(cues: ProductionCue[]): ResolvedProductionCue[]`

- [ ] **Step 1: Write failing tests**

Add tests asserting that bell, clock tick, whoosh, and time machine hum cues resolve to local deterministic synthesis, BGM resolves to explicit background metadata, pause resolves to silence, and unknown SFX resolves to `unresolved`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/agents/producer-agent.test.ts`
Expected: FAIL because `sfx-resolver.ts` is missing.

- [ ] **Step 3: Implement resolver**

Create `sfx-resolver.ts` with literal pattern matching on normalized descriptions, default durations, and explicit unresolved fallback status.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/agents/producer-agent.test.ts`
Expected: PASS.

### Task 2: Producer Manifest And Mixer Metadata

**Files:**
- Modify: `agents/producer-agent/voicebox-adapter.ts`
- Modify: `tests/agents/producer-agent.test.ts`

**Interfaces:**
- Consumes: `resolveProductionCues`
- Produces: manifest entries with `status`, `sourceStrategy`, `audioArtifact`, and timing fields; metadata with `mixer` details.

- [ ] **Step 1: Write failing tests**

Add a producer-agent test that reads `render-metadata.json` and `sfx-manifest.json`, then asserts final output paths, cue resolution status, fallback status, and mixer metadata.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/agents/producer-agent.test.ts`
Expected: FAIL because the adapter still writes cue-only manifest entries.

- [ ] **Step 3: Implement producer wiring**

Call `resolveProductionCues`, write resolved cue entries, and include deterministic mixer metadata while keeping `final.mp3` as the generated artifact path.

- [ ] **Step 4: Run focused and full verification**

Run: `npm test -- tests/agents/producer-agent.test.ts`, then `npm test`.
Expected: PASS.
