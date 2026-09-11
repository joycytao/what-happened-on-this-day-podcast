# Transcript SOP v3: Natural TTS Rewrite Standard

This reference is the writer-agent source of truth for turning raw AI drafts, database-template output, or unpolished scripts into broadcast-ready children's science podcast scripts.

## Scope

- Use this standard for formal episode transcripts before writer artifacts are opened as a PR.
- Default optimized length is 3.5-5 minutes and 700-900 words unless PM explicitly requests the older 5-8 minute long-form mode.
- Keep the five-module Time Machine Adventure structure unless PM explicitly narrows the format.

## Core Principles

### 1. Remove Robotic Transitions And Template Residue

Do not use announcer-style signposting or database-title residue. Story should push story forward, and questions should pull the listener into the next idea.

Banned transition patterns include:

- `Here is your first clue`
- `First clue`
- `Now we slow down`
- `Here is where`
- `Mission time`

Replace them with natural bridges:

- Sensory bridge: use sound, image, or movement to push the scene forward.
- Direct question bridge: ask a question a real listener might wonder.
- Everyday anchor: connect the idea to something the listener already does.

Examples:

- Instead of `Here is your first clue`, write `[SFX: soft bell chime] So let's step right up to that drawing desk in nineteen fifty.`
- Instead of `Now we slow down`, write `[SFX: page flip] But wait a second... how can two tiny black dots and a wiggly line make you feel so much emotion?`
- Instead of `Here is where nineteen fifty connects directly to your world today`, write `[SFX: tablet message chime] You use that same fast-pass lane every time you tap a yellow smiling emoji.`
- Instead of `Mission time`, write `So next time you choose an emoji, stop for a second and look at those lines.`

### 2. Rebuild Module 3 Around Concrete Science

Module 3 must include:

- one concrete science principle
- one everyday metaphor
- one 10-second physical action test

Prefer child-testable science such as visual psychology, pattern recognition, sound waves, friction, light, heat, memory, maps, or cause and effect. Do not use detached metaphors that do not help the listener test the idea.

For visual psychology episodes, a strong metaphor is: simple drawings are the brain's emotional shorthand, like a visual text message.

Example action test:

`[Action: draw a smile curve in the air, then flip it into a frown]`

### 3. Preprocess Text For TTS

Before finishing, rewrite spoken text so Qwen3-TTS and similar engines do not stumble over dates, numbers, or names.

- ISO dates: write `October second, twenty twenty-six`, not `2026-10-02`.
- Years: write `nineteen fifty`, not `1950`, unless a machine-readable artifact needs digits.
- Arabic numerals in spoken text: write `seven newspapers`, not `7 newspapers`.
- Proper nouns: add pronunciation support when needed, such as `Schulz [Voice: pronounced as Shults]`.

### 4. Use The Five Director Tags

Use only these director tags in transcript prose:

```md
[SFX: description]
[BGM: mood or placement]
[Voice: tone or speed]
[Pause: duration]
[Action: physical prompt]
```

Keep cues specific enough for producer-agent to preserve or resolve. For example:

- Good: `[SFX: time machine engine rev, low pitch]`
- Good: `[SFX: soft bell chime]`
- Good: `[BGM: curious pulse, under narration]`
- Good: `[Voice: excited whisper]`
- Good: `[Pause: 1s]`
- Good: `[Action: tap your fingers twice]`

Avoid vague cues such as `[SFX: something cool]`, `[MUSIC: nice music]`, or `[SOUND: dramatic]`.

### 5. Keep The Host Eye-Level

The host persona is a cool science explorer. The voice is energetic, peer-like, curious, and direct to `you`.

Do not use:

- lecturing or scolding
- babyish wording
- fake cheer
- abstract importance claims without concrete stakes

## QA Checklist

Before opening a writer PR, confirm:

- zero banned signposting transitions
- no unrevised database-title strings or placeholder-like event titles
- dates, years, numbers, and difficult proper nouns are TTS-safe
- Module 3 has one concrete science principle, one everyday metaphor, and one physical action test
- at least one `[Action: ...]` or direct listener reset appears within every 3 minutes
- transcript uses `[SFX: ...]`, `[BGM: ...]`, `[Voice: ...]`, `[Pause: ...]`, and `[Action: ...]` where useful
- tone is direct, respectful, children-first, and not babyish
