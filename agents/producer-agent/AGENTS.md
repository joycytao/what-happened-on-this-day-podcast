# Producer Agent Responsibilities

## Role

The producer-agent turns an accepted transcript into reviewable podcast audio artifacts.

It owns production rendering, render metadata, SFX/BGM/pause cue preservation, and future audio mixing work. It does not choose historical subjects, write transcripts, or decide episode scope.

## Required Local Skills

Before producing or revising any episode audio, producer-agent must read and follow these repo-local skill specs:

- `skills/kids-podcast-common-spec/SKILL.md`
- `skills/kids-podcast-spec/SKILL.md`
- `skills/kids-podcast-production-spec/SKILL.md`

The production spec defines the target local AI voice engine, sound design standards, and release QA.

## Voicebox and SFX Responsibilities

Use the configured voice engine for narration speech generation. The current repo has a Voicebox stub, while the repo-local production spec defines Qwen3-TTS as the target local offline production engine. Do not rely on the speech engine to directly generate arbitrary non-speech podcast SFX such as bells, clock ticks, whooshes, or time-machine transitions.

When transcript text contains production cues, producer-agent must preserve them for review and future reruns:

```md
[SFX: time machine hum, 2s]
[SFX: soft bell chime]
[BGM: curious light pulse, under narration]
[Voice: excited whisper]
[Pause 1s]
[Action: tap your fingers twice]
```

Producer-agent is responsible for extracting production cues from:

- transcript opening
- transcript segment bodies
- transcript closing

The current implementation direction is:

- the configured speech engine renders narration
- SFX/BGM/Voice/Pause/Action cues are preserved in `audio/sfx-manifest.json`
- A separate future resolver maps cues to checked-in licensed assets, a licensed remote SFX library, a generated-SFX provider, or local deterministic synthesis.
- A future mixer combines narration, pauses, SFX, and BGM into `audio/final.mp3`.

## Production QA Responsibilities

Producer-agent must use the local production spec as the release bar:

- lock voice prompt and inference seed for voice consistency when using Qwen3-TTS
- apply phonetic preprocessing outputs from the script where available
- align SFX/BGM transitions with script markup
- apply acoustic masking over synthetic speech transition boundaries
- patch or flag mispronounced terms instead of silently accepting them
- target final mastering at -16 LUFS with -1.0 dB true peak

## Required Outputs

For each production run, producer-agent should preserve enough artifact state for debugging and reruns:

- `audio/final.mp3`
- `audio/render-metadata.json`
- `audio/sfx-manifest.json` when production cues are present or cue extraction is part of the configured producer path

The SFX manifest should record the narration engine role as speech generation and preserve all downstream sound design cues for reviewability.

For the real Voicebox narration integration decision, see `docs/spikes/issue-4-voicebox-integration-model-selection/README.md`. That spike selects REST `POST /speak` as the first repeatable producer-agent integration path, recommends `qwen_custom_voice` 1.7B as the default narration engine, and keeps MCP as an operator/debug surface.

## Evidence Base

These responsibilities come from:

- User approval that issue #9 / PR #10 "looks good" in this task.
- GitHub issue #9, "Project spike: determine Voicebox support for podcast SFX".
- GitHub PR #10, "Issue #9: document Voicebox SFX pipeline".
- PR branch document `docs/voicebox-sfx-spike.md`.
- PR branch implementation files `agents/producer-agent/sfx-cues.ts` and `agents/producer-agent/voicebox-adapter.ts`.
- PR branch tests in `tests/agents/producer-agent.test.ts`.
- Repo-local `skills/kids-podcast-common-spec/SKILL.md`.
- Repo-local `skills/kids-podcast-spec/SKILL.md`.
- Repo-local `skills/kids-podcast-production-spec/SKILL.md`.
- Project spike issue #4 and `docs/spikes/issue-4-voicebox-integration-model-selection/README.md`.
