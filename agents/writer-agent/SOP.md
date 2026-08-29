# Writer Agent SOP

## Purpose

This SOP defines how writer-agent should prepare podcast scripts for producer-agent after the Voicebox SFX spike.

## Standard Procedure

1. Read the accepted research dossier.
2. Read and follow the repo-local kids podcast specs:

   - `skills/kids-podcast-common-spec/SKILL.md`
   - `skills/kids-podcast-spec/SKILL.md`
   - `skills/kids-podcast-scriptwriter-spec/SKILL.md`

3. Read and follow the writer reference prompts:

   - `prompts/writer/references/podcast-script-writer-guidelines.md`
   - `prompts/writer/references/student-podcast-script-guidelines.md`

4. Write an English podcast script for the ear, not a page-oriented article.
5. Use the five-module Time Machine Adventure structure:

   - Module 1: Time Machine Hook
   - Module 2: Narrative Drama
   - Module 3: Scientific Deep-Dive
   - Module 4: Modern World Twist
   - Module 5: Outro & Mission

6. Add production cues where sound, music, voice, action, or silence improves the episode.
7. Use producer-readable cue formats:

   ```md
   [SFX: description, optional duration]
   [BGM: description, optional placement note]
   [Voice: emotion or speed]
   [Pause duration]
   [Action: physical prompt]
   ```

8. Keep the target length at 5-8 minutes unless PM gives a narrower constraint.
9. Add at least one everyday metaphor in the science module.
10. Add listener attention resets at least every 3 minutes.
11. Add `[SFX]` or `[BGM]` transitions every 45-60 seconds.
12. Add phonetic or pronunciation guidance for proper nouns and technical terms.
13. Read aloud or simulate a read-aloud pass.
14. Run the Humanizer review loop required by project instructions.
15. Revise until the transcript passes the read-aloud and Humanizer gates.

## Cue Writing Rules

Use cues when they help the listener understand scene, time, motion, mood, or pacing.

Prefer specific cue descriptions:

- Good: `[SFX: soft bell chime]`
- Good: `[SFX: time machine hum, 2s]`
- Good: `[BGM: curious light pulse, under narration]`
- Good: `[Voice: excited whisper]`
- Good: `[Pause 1s]`
- Good: `[Action: tap your fingers twice]`

Avoid vague cues that producer-agent cannot resolve:

- Avoid: `[SFX: something cool]`
- Avoid: `[MUSIC: nice music]`
- Avoid: `[SOUND: dramatic]`

Do not use cues to hide unclear writing. If the listener needs context, write the context in spoken language and use the cue to support it.

## Handoff To Producer-Agent

The final transcript should make cues easy for producer-agent to extract from the opening, segment bodies, and closing.

Writer-agent must write these required handoff artifacts before opening a PR:

- `transcript.md`
- `transcript.json`
- `transcript-quality-report.json`

`transcript.md` is the canonical human-readable script. `transcript.json` must be derived from or consistent with the markdown script. `transcript-quality-report.json` records writer self-check results, but PM still recomputes deterministic checks before advancing the issue.

Writer-agent does not resolve SFX assets or mix audio. It hands off clear cue text; producer-agent preserves those cues in `audio/sfx-manifest.json` and owns production resolution.

## Evidence Base

This SOP is based on:

- User approval that issue #9 / PR #10 "looks good" in this task.
- GitHub issue #9 cue examples and proposed implementation path.
- GitHub PR #10 producer cue extraction and `sfx-manifest.json` output.
- Existing writer prompt and reference guidelines requiring SFX, BGM, pause, tone, pronunciation cues, and read-aloud revision.
- Repo-local `skills/kids-podcast-common-spec/SKILL.md`.
- Repo-local `skills/kids-podcast-spec/SKILL.md`.
- Repo-local `skills/kids-podcast-scriptwriter-spec/SKILL.md`.
