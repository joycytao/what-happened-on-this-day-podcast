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
   - `prompts/writer/references/transcript-sop-v3-natural-tts.md`

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
   [Pause: duration]
   [Action: physical prompt]
   ```

8. Default to the optimized short format: 3.5-5 minutes and 700-900 words, unless PM explicitly requests the older 5-8 minute long-form mode.
9. Remove robotic signposting such as `Here is your first clue`, `First clue`, `Now we slow down`, `Here is where`, and `Mission time`.
10. Replace signposting with sensory bridges, direct question bridges, or everyday anchors.
11. Add at least one everyday metaphor in the science module.
12. Make Module 3 concrete: one science principle, one everyday metaphor, and one 10-second physical action test.
13. Add listener attention resets at least every 3 minutes.
14. Add `[SFX]` or `[BGM]` transitions every 45-60 seconds.
15. Preprocess dates, years, numbers, and proper nouns for TTS.
16. Add phonetic or pronunciation guidance for proper nouns and technical terms.
17. Read aloud or simulate a read-aloud pass.
18. Run the Humanizer review loop required by project instructions.
19. Revise until the transcript passes the read-aloud and Humanizer gates.

## Transcript SOP v3 Natural Rewrite Rules

Writer-agent must follow `prompts/writer/references/transcript-sop-v3-natural-tts.md` before opening a transcript PR.

Use these rules especially when a draft comes from AI generation or database-template output:

- clean unrevised event-title strings into natural spoken sentences
- rewrite hard section announcements into scene, sound, action, or question bridges
- write dates as spoken words, such as `October second, twenty twenty-six`
- write years as spoken words, such as `nineteen fifty`
- write Arabic numerals as words in spoken script text, such as `seven newspapers`
- add pronunciation support for difficult names, such as `Schulz [Voice: pronounced as Shults]`
- keep the host voice as a cool science explorer speaking directly and respectfully to `you`

## Cue Writing Rules

Use cues when they help the listener understand scene, time, motion, mood, or pacing.

Prefer specific cue descriptions:

- Good: `[SFX: soft bell chime]`
- Good: `[SFX: time machine hum, 2s]`
- Good: `[BGM: curious light pulse, under narration]`
- Good: `[Voice: excited whisper]`
- Good: `[Pause: 1s]`
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
