# Producer Agent SOP

## Purpose

This SOP defines how producer-agent should handle narration, production cues, and SFX artifacts after the Voicebox SFX spike.

## Standard Procedure

1. Receive an accepted transcript from writer-agent through the PM workflow.
2. Read and follow the repo-local kids podcast specs:

   - `skills/kids-podcast-common-spec/SKILL.md`
   - `skills/kids-podcast-spec/SKILL.md`
   - `skills/kids-podcast-production-spec/SKILL.md`

3. Treat the configured speech engine as the narration engine. The current repo has a Voicebox stub; the production target spec is Qwen3-TTS.
4. Scan the transcript opening, segment bodies, and closing for production cues in these forms:

   ```md
   [SFX: description, optional duration]
   [BGM: description, optional placement note]
   [Voice: emotion or speed]
   [Pause duration]
   [Action: physical prompt]
   ```

5. Preserve extracted cues in `audio/sfx-manifest.json`.
6. Preserve render metadata in `audio/render-metadata.json`.
7. Produce or preserve the final audio path as `audio/final.mp3`.
8. Check production QA from the local production spec.
9. Report cue count, cue types, mastering status, voice engine status, and any unresolved cue requirements in the production result or handoff notes.

## Cue Parsing Rules

Producer-agent should preserve:

- cue type, including `sfx`, `bgm`, `voice`, `pause`, or `action`
- description
- duration in seconds when provided
- placement, such as `opening`, `segment: <heading>`, or `closing`
- original source text

For pause cues, the description should remain `pause`.

For SFX/BGM/Voice/Action cues, the description should be the cue instruction before duration or placement notes.

## Current SFX Decision

Voicebox should not be treated as the direct source of arbitrary non-speech SFX. The spike outcome is:

- Voicebox: narration speech generation
- Separate SFX path: asset library, generated-SFX provider, remote licensed library, or local synthesis/mixing layer
- Producer manifest: durable cue handoff for reviewability and reruns

The repo-local production spec adds the forward production target:

- Qwen3-TTS local AI voice generation
- locked voice prompt and seed
- acoustic masking for synthetic speech boundaries
- EQ/high-cut cleanup
- final export normalized to -16 LUFS with -1.0 dB true peak

## Completion Criteria

Producer-agent work is complete only when:

- narration render artifacts are present
- render metadata is present
- SFX/BGM/pause cues from the transcript are preserved in `audio/sfx-manifest.json`
- unresolved SFX generation or mixing work is explicitly reported instead of silently ignored
- voice engine, seed/voice prompt, pronunciation patching, and loudness status are either completed or explicitly marked as unavailable in the current stub/prototype path

## Evidence Base

This SOP is based on:

- User approval that issue #9 / PR #10 "looks good" in this task.
- GitHub issue #9 acceptance criteria requiring documented SFX feasibility, producer architecture, and tests for cue parsing plus `sfx-manifest.json`.
- GitHub PR #10 files and summary.
- PR branch `docs/voicebox-sfx-spike.md`, which says to use Voicebox for narration and a separate SFX source or synthesis/mixing layer.
- Repo-local `skills/kids-podcast-common-spec/SKILL.md`.
- Repo-local `skills/kids-podcast-spec/SKILL.md`.
- Repo-local `skills/kids-podcast-production-spec/SKILL.md`.
