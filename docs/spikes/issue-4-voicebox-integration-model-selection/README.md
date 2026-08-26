# Issue #4 Voicebox Integration and Model Selection Spike

## Outcome

Use Voicebox as the local narration renderer through its HTTP API first, with MCP kept as an operator/debug surface rather than the producer-agent's primary integration path.

The first production adapter should call `POST /speak` for named-profile narration jobs when a running local Voicebox desktop app is available. If `/speak` cannot satisfy a batch artifact workflow, fall back to `POST /generate` with a resolved `profile_id`. Do not route non-speech SFX through Voicebox; keep the issue #9 SFX decision in place and let the producer SFX resolver/mixer own sound effects, background music, pauses, and final mastering.

Default narration engine: `qwen_custom_voice` using the 1.7B model size and a preset or locked profile.

Fallback engines:

- `qwen_custom_voice` with the 0.6B model size for faster local prototyping or low-memory environments.
- `chatterbox_turbo` when expressive paralinguistic tags such as `[laugh]`, `[sigh]`, or `[gasp]` are required for a specific clip.
- `kokoro` when the operator needs the smallest local runtime footprint and accepts less delivery control.

## Evidence Checked

- Issue #4 asks for the producer-agent integration surface, local environment assumptions, seven-engine evaluation, one default engine, fallback engine selection, and follow-up implementation work.
- The PM handoff comment on issue #4 requires a durable spike reference under `docs/` and says the spike must include outcome, evidence, source links, recommendation, and follow-up actionable criteria.
- `configs/voicebox.json` currently only stores `engine`, `voicePreset`, `outputFormat`, and `enableVoiceCloning`, so the repo does not yet model Voicebox endpoint, host, engine id, model size, profile id/name, instruct text, or seed.
- `agents/producer-agent/voicebox-adapter.ts` currently writes `VOICEBOX_STUB_AUDIO` and render metadata, so no real Voicebox request path exists yet.
- `skills/kids-podcast-production-spec/SKILL.md` sets the target local voice engine as Qwen3-TTS, requires a locked voice prompt and seed, and sets the production target at -16 LUFS with -1.0 dB true peak.
- `docs/voicebox-sfx-spike.md` already decided that Voicebox should generate narration only and that SFX/BGM should be resolved and mixed separately.

## Source Links And Reference Notes

- Voicebox MCP server docs: https://docs.voicebox.sh/overview/mcp-server
  - Voicebox exposes a built-in MCP server at `/mcp` over Streamable HTTP.
  - MCP has `voicebox.speak`, `voicebox.transcribe`, `voicebox.list_captures`, and `voicebox.list_profiles`.
  - `voicebox.speak` accepts `text`, optional `profile`, optional `engine`, optional `personality`, and optional `language`; it returns a generation id and poll URL.
  - `POST /speak` is documented as the non-MCP REST wrapper around the same speaking path, with the same body fields as the MCP tool.
  - Voicebox must be running locally; the backend only listens while the desktop app is open.
- Voicebox TTS generation docs: https://docs.voicebox.sh/developer/tts-generation
  - Voicebox ships seven engines behind one `TTSBackend` protocol: Qwen3-TTS, Qwen CustomVoice, LuxTTS, Chatterbox Multilingual, Chatterbox Turbo, TADA, and Kokoro.
  - Engine ids are `qwen`, `qwen_custom_voice`, `luxtts`, `chatterbox`, `chatterbox_turbo`, `tada`, and `kokoro`.
  - `POST /generate` accepts generation settings including `profile_id`, `text`, `language`, `seed`, `model_size`, `instruct`, `engine`, and `max_chunk_chars`.
  - Long text is chunked at sentence boundaries using `max_chunk_chars`, generated in sequence, and crossfaded by the service layer.
  - Only Qwen CustomVoice fully supports natural-language delivery control through `instruct`; Qwen Base drops instruct text and other engines ignore it.
- Voicebox model-management docs: https://docs.voicebox.sh/developer/model-management
  - Qwen CustomVoice has 1.7B and 0.6B variants, with approximate VRAM needs of 6 GB and 2 GB respectively.
  - Kokoro is the smallest documented TTS option at about 150 MB VRAM.
  - Chatterbox Turbo is English-only and about 1.5 GB VRAM.
  - Models download from HuggingFace Hub on first use and cache locally.
  - Preset voice profiles are seeded for Kokoro and Qwen CustomVoice after model download.
- Voicebox quick-start docs: https://docs.voicebox.sh/overview/quick-start
  - Voicebox requires the app to be installed and launched before generation.
  - Voice profiles can be created by uploading or recording clean speech.
  - Paralinguistic tags such as `[laugh]`, `[sigh]`, and `[gasp]` only work with Chatterbox Turbo; several other engines read those tags literally.
- Voicebox development setup docs: https://docs.voicebox.sh/developer/setup
  - Local development setup is `just setup`, then `just dev`.
  - `just dev` starts the Python backend and desktop app.
  - Voicebox prerequisites include Bun, Python 3.11+, Rust, and Just.

## Seven-Engine Evaluation

| Engine | Voicebox id | Fit for this repo | Decision |
| --- | --- | --- | --- |
| Qwen3-TTS | `qwen` | Aligned with the repo-local Qwen3 production target, but Voicebox docs say Qwen Base drops `instruct` text. | Do not use as v1 default when delivery-control prompts are needed. Keep as an implementation-compatible family member. |
| Qwen CustomVoice | `qwen_custom_voice` | Best match for single-speaker English narration because it supports preset profiles, model sizes, seed, and natural-language delivery control through `instruct`. | Use as default. Start with 1.7B for review-quality renders and 0.6B for fast local prototyping. |
| LuxTTS | `luxtts` | English-only and smaller than Qwen, but no documented `instruct` support in Voicebox. | Do not choose for v1 default; keep as possible future quality/speed comparison. |
| Chatterbox Multilingual | `chatterbox` | Useful language coverage, but this repo is English single-speaker v1 and it has higher footprint than Chatterbox Turbo. | Do not choose for v1 default. |
| Chatterbox Turbo | `chatterbox_turbo` | English-only, lower footprint than Qwen 1.7B, and documented support for expressive paralinguistic tags. | Use as expressive fallback for clips that need supported tags. |
| TADA | `tada` | English or multilingual variants exist, but documented VRAM is higher and no repo requirement needs it today. | Do not choose for v1 default. |
| Kokoro | `kokoro` | Smallest documented footprint and supports preset profiles, but less evidence for the delivery-control needs of the kid-focused host. | Use as lowest-footprint fallback. |

## Recommended Producer Integration

1. Extend `configs/voicebox.json` with explicit real-render settings:

   ```json
   {
     "engine": "voicebox",
     "baseUrl": "http://127.0.0.1:17493",
     "endpoint": "speak",
     "ttsEngine": "qwen_custom_voice",
     "modelSize": "1.7B",
     "voiceProfile": "story-narrator-01",
     "seed": 4262026,
     "instruct": "warm, energetic, curious time-traveling science detective",
     "language": "en",
     "outputFormat": "mp3",
     "enableVoiceCloning": false
   }
   ```

2. Implement `renderWithVoicebox` as a real adapter with a stub fallback mode:

   - Strip or segment production cues before sending narration text to Voicebox.
   - Keep `audio/sfx-manifest.json` as the cue handoff for SFX/BGM/pause/action items.
   - For local desktop operation, call `POST /speak` with `text`, `profile`, `engine`, `personality: false`, and `language`.
   - Consume the returned generation response and persist the generated audio artifact in the run directory as the narration source.
   - If the operator/debug path uses MCP `voicebox.speak`, poll the returned status URL before copying or downloading audio.
   - Let the separate mixer path create `audio/final.mp3`.
   - Record endpoint, engine id, model size, profile, seed, generation id, audio path, and fallback status in `audio/render-metadata.json`.

3. Use MCP only when the operator wants agent-driven interactive speech or debugging:

   - `voicebox.list_profiles` verifies configured profile availability.
   - `voicebox.speak` can test end-to-end local generation.
   - MCP should not be required for the producer-agent's repeatable batch artifact path because repo code can call the REST endpoint directly and persist metadata without adding an MCP client dependency.

## Local Environment Assumptions

- Voicebox is installed and launched on the same machine as the producer-agent run.
- The local backend is reachable at `http://127.0.0.1:17493`.
- The configured voice profile exists before production starts.
- First use may download models from HuggingFace Hub and cache them locally; operators should pre-warm the default model before a scheduled render.
- Full review-quality renders should target `qwen_custom_voice` 1.7B only when the machine has enough available memory for the documented approximate footprint.
- Fast previews can use `qwen_custom_voice` 0.6B or `kokoro`.
- Voice cloning remains disabled for v1 unless a later issue changes the product requirement.
- The adapter must fail with an explicit unavailable status when Voicebox is not running; it must not silently replace a failed real render with production-looking audio.

## Follow-Up Implementation Issue Proposal

Title: `Implement real Voicebox narration adapter`

Labels: `type: project`, `status: ready`

Acceptance criteria:

- [ ] Extend `configs/voicebox.json` with `baseUrl`, `endpoint`, `ttsEngine`, `modelSize`, `voiceProfile`, `seed`, `instruct`, `language`, and explicit `mode` or fallback behavior.
- [ ] Update producer-agent config loading with schema validation for the new Voicebox fields.
- [ ] Add narration text preparation that removes SFX/BGM/pause/action cues from the text sent to Voicebox while preserving those cues in `audio/sfx-manifest.json`.
- [ ] Implement a real REST client for `POST /speak`, with `POST /generate` support only when a profile id is configured.
- [ ] Poll generation status or retrieve the generated audio path according to the Voicebox response, then persist the narration artifact in the run directory.
- [ ] Write `audio/render-metadata.json` with endpoint, engine id, model size, profile, seed, generation id, source audio path, and explicit error/fallback status.
- [ ] Keep the existing stub path available only as a named dry-run mode; production mode must fail clearly if Voicebox is unavailable.
- [ ] Add tests for config validation, narration cue stripping, request body construction, Voicebox unavailable failure, and render metadata shape.
- [ ] Update producer-agent SOP with the real-render procedure and preflight checklist.

## Acceptance Criteria Coverage

- Integration surface documented: `POST /speak` first; `POST /generate` only when a profile id batch path is required; MCP for debugging/operator use.
- Local environment assumptions documented: local launched Voicebox app, loopback backend, profile availability, model downloads/cache, memory constraints, pre-warming.
- REST versus MCP decision documented: REST is the repeatable producer path; MCP remains interactive/debug tooling.
- All seven engines captured in the evaluation table.
- Default engine recommended: `qwen_custom_voice` 1.7B.
- Fallback engines recommended: `qwen_custom_voice` 0.6B, `chatterbox_turbo`, and `kokoro`.
- Follow-up implementation work recorded as issue-ready acceptance criteria.
