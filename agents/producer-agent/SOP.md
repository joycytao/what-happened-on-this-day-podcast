# Producer Agent SOP

## Purpose

This SOP defines how producer-agent should handle narration, production cues, and SFX artifacts after the Voicebox SFX spike.

## Standard Procedure

1. Receive an accepted transcript from writer-agent through the PM workflow.
2. Read and follow the repo-local kids podcast specs:

   - `skills/kids-podcast-common-spec/SKILL.md`
   - `skills/kids-podcast-spec/SKILL.md`
   - `skills/kids-podcast-production-spec/SKILL.md`

3. Treat the configured speech engine as the narration engine. Voicebox supports two explicit modes:

   - `dry-run`: writes clearly marked stub output for local pipeline tests only.
   - `production`: calls the local Voicebox HTTP API and fails clearly if Voicebox is unavailable.

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

## Real Voicebox Render Preflight

Before running `configs/voicebox.json` with `"mode": "production"`, verify:

- Voicebox desktop app is installed and running on the same machine.
- The configured `baseUrl` is reachable, normally `http://127.0.0.1:17493`.
- The configured `voiceProfile` exists for `POST /speak`, or `profileId` exists for `POST /generate`.
- The configured `ttsEngine`, `modelSize`, `seed`, `instruct`, and `language` match the intended render.
- First-use model downloads have already been warmed up when a scheduled render cannot wait.

The producer must not silently replace a failed production render with stub audio. A failed real render should leave render metadata with endpoint, engine, profile, seed, fallback/error status, and the failure reason.

## Real Voicebox Render Procedure

1. Load and validate `configs/voicebox.json`.
2. Build narration text from the transcript by removing production markup before sending text to Voicebox:

   ```md
   [SFX: ...]
   [BGM: ...]
   [Voice: ...]
   [Pause ...]
   [Action: ...]
   ```

3. Preserve extracted cues in `audio/sfx-manifest.json`.
4. For `endpoint: "speak"`, call `POST /speak` with narration `text`, `profile`, `engine`, `personality: false`, and `language`.
5. For `endpoint: "generate"`, call `POST /generate` only when `profileId` is configured, including `profile_id`, `text`, `language`, `seed`, `model_size`, `instruct`, `engine`, and `max_chunk_chars` when available.
6. Poll or retrieve generated audio according to the Voicebox response.
7. Persist the returned narration audio to the run directory.
8. Write `audio/render-metadata.json` with endpoint, client id, engine id, model size, profile, seed, generation id, source audio path, output audio path, status, and any error/fallback status.

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

The real Voicebox integration spike in `docs/spikes/issue-4-voicebox-integration-model-selection/README.md` adds the current implementation direction:

- use REST `POST /speak` as the first repeatable producer-agent integration surface
- use `qwen_custom_voice` 1.7B as the default narration engine
- use `qwen_custom_voice` 0.6B, `chatterbox_turbo`, or `kokoro` as explicit fallback engines depending on preview speed, expressive tags, or low-footprint needs
- keep MCP for operator/debug workflows instead of making it mandatory for batch episode artifact generation

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
- Project spike issue #4 and `docs/spikes/issue-4-voicebox-integration-model-selection/README.md`.
