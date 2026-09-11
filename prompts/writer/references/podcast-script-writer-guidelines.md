# Podcast Script Writer guidelines

A podcast script writer turns visual, page-oriented material into an audio-first story. The goal is not to write an article. The goal is to design a listening experience.

## Core skills

### Writing for the ear

Use everyday speech, short sentences, clear rhythm, and words that sound natural when read aloud. Avoid long written clauses and page-like transitions.

### Audio storytelling

Use concrete details, sound, emotion, and scene-setting to help listeners imagine the story without visual support.

### Timing and pacing

Control script length and pacing. Use pauses, tone notes, transitions, and section changes to protect listener attention.

### Style control

Match the show format and audience. This show should feel curious, warm, vivid, and trustworthy.

### Research distillation

Turn research into a story a general audience can follow. Do not dump facts. Select the details that help the listener understand the one story being told.

## Script requirements

### Hook quickly

The opening must create curiosity quickly. Avoid long self-introductions. Use a surprising fact, a scene, a question, or a small mystery.

### Use clear anchors without robotic signposting

Listeners cannot skim backward, but the host should not sound like an announcer reading section labels. Use sensory bridges, direct question bridges, and everyday anchors instead of robotic signposting.

Avoid phrases such as `Here is your first clue`, `First clue`, `Now we slow down`, `Here is where`, and `Mission time`.

Prefer transitions that move through scene, sound, action, or curiosity:

- `[SFX: soft bell chime] So let's step right up to that drawing desk in nineteen fifty.`
- `[SFX: page flip] But wait a second... how can two tiny black dots and a wiggly line make you feel so much emotion?`
- `[SFX: tablet message chime] You use that same fast-pass lane every time you tap a yellow smiling emoji.`

### Leave room for voice

Write for a host speaking aloud. The script should sound human, not like a school report read into a microphone.

### Add audio cues

Mark useful SFX, BGM, pauses, pronunciation notes, and tone shifts where they help recording or production.

Use the exact director tag forms `[SFX: ...]`, `[BGM: ...]`, `[Voice: ...]`, `[Pause: ...]`, and `[Action: ...]`.

### Preprocess for TTS

Write spoken text in a form a speech engine can read naturally. Use `October second, twenty twenty-six`, not `2026-10-02`. Use `nineteen fifty`, not `1950`. Use `seven newspapers`, not `7 newspapers`. Add proper-noun pronunciation support when needed, such as `Schulz [Voice: pronounced as Shults]`.

### Make Module 3 testable

The scientific deep-dive must contain one concrete science principle, one everyday metaphor, and one 10-second physical action test. Prefer ideas a child can feel, see, draw, tap, compare, or repeat.

Example: simple drawings can act like the brain's emotional shorthand, like a visual text message. Then ask the listener to draw a smile curve in the air and flip it into a frown.

### Read aloud before finishing

The writer must read the script aloud or simulate a read-aloud pass. Fix tongue-twisters, breathless sentences, stiff phrasing, and awkward transitions before marking the transcript complete.

## SOP v3 QA checklist

Before finishing, confirm:

- zero banned signposting transitions
- no unrevised database-title strings or placeholder-like event titles
- dates, years, numbers, and difficult proper nouns are TTS-safe
- Module 3 has one concrete science principle, one everyday metaphor, and one physical action test
- at least one `[Action: ...]` or direct listener reset appears within every 3 minutes
- transcript uses `[SFX: ...]`, `[BGM: ...]`, `[Voice: ...]`, `[Pause: ...]`, and `[Action: ...]` where useful
- tone is direct, respectful, children-first, and not babyish
