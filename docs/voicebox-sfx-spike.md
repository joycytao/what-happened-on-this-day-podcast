# Voicebox SFX Spike

## Decision

Use Voicebox for narration speech generation. Do not rely on Voicebox to directly generate arbitrary non-speech podcast SFX such as bells, clock ticks, whooshes, or time-machine transitions.

The producer pipeline should preserve transcript cues in `audio/sfx-manifest.json`, then resolve those cues through a separate SFX source or synthesis/mixing layer.

## Evidence

- The Voicebox API this project should target is the `docs.voicebox.sh` speech-generation service. Its `POST /generate` contract is text plus `profile_id`, returning generated speech metadata and an audio path: https://docs.voicebox.sh/api-reference/generation/generate_speech_generate_post
- The developer generation flow describes a TTS backend abstraction, voice prompts, inference, post-processing, and persisted generation versions. It does not describe prompt-based non-speech SFX generation: https://docs.voicebox.sh/developer/tts-generation
- Voicebox currently documents paralinguistic tags such as `[laugh]`, `[sigh]`, and `[gasp]` as Chatterbox Turbo-specific speech-expression behavior, while other engines may read those tags literally: https://docs.voicebox.sh/overview/quick-start
- Voicebox's generating-speech guide lists SSML support as "Coming Soon", so the production pipeline should not depend on SSML or audio tags for cue transport yet: https://docs.voicebox.sh/overview/generating-speech
- The Voicebox effects pipeline is post-processing for generated audio versions, not a replacement for an SFX asset generator: https://docs.voicebox.sh/developer/effects-pipeline
- The Python `voicebox` package includes effects such as glitch, ring modulation, normalization, vocoder, and Pedalboard wrappers. That can inform local audio processing, but it is not the same API currently referenced by this repo's Voicebox integration: https://voicebox.readthedocs.io/en/stable/voicebox.effects.html

## Recommended Architecture

1. Writer-agent includes production cues in the transcript body:

   ```md
   [SFX: time machine hum, 2s]
   [SFX: soft bell chime]
   [BGM: curious light pulse, under narration]
   [PAUSE: 1s]
   ```

2. Producer-agent extracts `[SFX:]`, `[BGM:]`, and `[PAUSE:]` cues from the transcript.
3. Voicebox renders the narration track.
4. A separate resolver maps SFX/BGM cues to one of:
   - checked-in licensed SFX assets
   - a remote licensed SFX library
   - a generated-SFX provider
   - local synthesis for simple bells, clocks, risers, whooshes, and transitions
5. The final mixer combines narration, pauses, SFX, and BGM into `audio/final.mp3`.
6. Producer-agent writes `audio/sfx-manifest.json` for reviewability and reruns.

## Current Implementation

The repo still uses the Voicebox stub for `audio/final.mp3`, but it now writes an SFX manifest alongside render metadata.

Example manifest shape:

```json
{
  "strategy": "voicebox-narration-with-external-sfx",
  "voiceboxRole": "speech-generation",
  "cueCount": 2,
  "cues": [
    {
      "id": "cue-1",
      "type": "sfx",
      "description": "time machine hum",
      "durationSeconds": 2,
      "placement": "opening",
      "sourceText": "[SFX: time machine hum, 2s]"
    }
  ]
}
```

## Next Project Issue

Build the first SFX resolver behind the manifest. Start with local deterministic synthesis for `bell`, `clock tick`, `whoosh`, and `time machine hum`, then add a mixer that renders narration plus cue audio into one final MP3.
