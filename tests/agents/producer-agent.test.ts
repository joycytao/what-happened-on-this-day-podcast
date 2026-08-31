import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  runProducerAgent,
  runProducerAgentCli,
  runProducerAgentFromTranscriptMarkdown,
  runProducerAgentPickup
} from "../../agents/producer-agent";
import { evaluateTranscriptQuality } from "../../agents/writer-agent";
import { extractProductionCues } from "../../agents/producer-agent/sfx-cues";
import { resolveProductionCues } from "../../agents/producer-agent/sfx-resolver.js";
import {
  buildVoiceboxRequest,
  prepareNarrationText,
  renderWithVoicebox,
  validateVoiceboxConfig,
  type VoiceboxConfig
} from "../../agents/producer-agent/voicebox-adapter.js";
import { serializeTranscriptMarkdown, type Transcript } from "../../src/contracts";

describe("producer agent", () => {
  it("creates audio metadata from a transcript", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));

    const result = await runProducerAgent(
      {
        opening: "Good morning to everyone on the way to school.",
        segments: [{ heading: "The beginning", body: "A city dreamed of a new museum." }],
        closing: "That dream still matters today.",
        estimatedDurationMin: 5,
        ttsNotes: ["Warm pace"]
      },
      outputDir
    );

    expect(result.audioPath).toContain("final.mp3");
    expect(result.metadataPath).toContain("render-metadata.json");
  });

  it("renders from canonical transcript.md and records the source path", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-markdown-"));
    const transcriptPath = path.join(outputDir, "transcript.md");

    await fs.writeFile(
      transcriptPath,
      [
        "# Transcript",
        "",
        "Estimated duration: 5 minutes",
        "",
        "## Opening",
        "",
        "[SFX: time machine hum, 2s]",
        "Welcome to the launch.",
        "",
        "## Time Machine Hook",
        "",
        "You press the glowing button. [Action: tap your fingers twice]",
        "",
        "## Closing",
        "",
        "Back to today. [SFX: soft bell chime]",
        "",
        "## TTS Notes",
        "",
        "- Pronunciation: launch",
        ""
      ].join("\n"),
      "utf8"
    );

    const result = await runProducerAgentFromTranscriptMarkdown(transcriptPath, outputDir);
    const metadata = JSON.parse(await fs.readFile(result.metadataPath, "utf8"));
    const manifest = JSON.parse(await fs.readFile(result.sfxManifestPath, "utf8"));
    const finalAudio = await fs.readFile(result.audioPath, "utf8");

    expect(metadata.sourceTranscriptPath).toBe(transcriptPath);
    expect(metadata.voicebox.narrationText).toBe(
      "Welcome to the launch.\n\nYou press the glowing button.\n\nBack to today."
    );
    expect(manifest).toMatchObject({
      cueCount: 3,
      cues: [
        { type: "sfx", description: "time machine hum" },
        { type: "action", description: "tap your fingers twice" },
        { type: "sfx", description: "soft bell chime" }
      ]
    });
    expect(finalAudio).toContain("MIXED_AUDIO_STUB");
  });

  it("extracts timed SFX, BGM, and pause cues from transcript text", () => {
    const cues = extractProductionCues({
      opening: "Good morning. [SFX: time machine hum, 2s]",
      segments: [
        {
          heading: "The clock starts",
          body: "The room gets quiet. [BGM: curious light pulse, under narration]\n[PAUSE: 1s]"
        },
        {
          heading: "A bright chime",
          body: "Then the bell rings. [SFX: soft bell chime]"
        }
      ],
      closing: "Tomorrow, we listen again.",
      estimatedDurationMin: 5,
      ttsNotes: ["Warm pace"]
    });

    expect(cues).toEqual([
      {
        id: "cue-1",
        type: "sfx",
        description: "time machine hum",
        durationSeconds: 2,
        placement: "opening",
        sourceText: "[SFX: time machine hum, 2s]"
      },
      {
        id: "cue-2",
        type: "bgm",
        description: "curious light pulse",
        durationSeconds: null,
        placement: "segment: The clock starts",
        sourceText: "[BGM: curious light pulse, under narration]"
      },
      {
        id: "cue-3",
        type: "pause",
        description: "pause",
        durationSeconds: 1,
        placement: "segment: The clock starts",
        sourceText: "[PAUSE: 1s]"
      },
      {
        id: "cue-4",
        type: "sfx",
        description: "soft bell chime",
        durationSeconds: null,
        placement: "segment: A bright chime",
        sourceText: "[SFX: soft bell chime]"
      }
    ]);
  });

  it("preserves voice and action cues for producer review", () => {
    const cues = extractProductionCues({
      opening: "[Voice: bright whisper]\nOpen the door.",
      segments: [
        {
          heading: "Try it",
          body: "Now move your hand. [Action: point to the nearest screen]"
        }
      ],
      closing: "Back to today.",
      estimatedDurationMin: 5,
      ttsNotes: []
    });

    expect(cues).toEqual([
      {
        id: "cue-1",
        type: "voice",
        description: "bright whisper",
        durationSeconds: null,
        placement: "opening",
        sourceText: "[Voice: bright whisper]"
      },
      {
        id: "cue-2",
        type: "action",
        description: "point to the nearest screen",
        durationSeconds: null,
        placement: "segment: Try it",
        sourceText: "[Action: point to the nearest screen]"
      }
    ]);
  });

  it("writes an SFX manifest next to rendered audio", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));

    const result = await runProducerAgent(
      {
        opening: "Good morning. [SFX: time machine hum, 2s]",
        segments: [{ heading: "The beginning", body: "A clock ticks. [SFX: soft bell chime]" }],
        closing: "That dream still matters today.",
        estimatedDurationMin: 5,
        ttsNotes: ["Warm pace"]
      },
      outputDir
    );

    expect(result.sfxManifestPath).toContain("sfx-manifest.json");
    const manifest = JSON.parse(await fs.readFile(result.sfxManifestPath, "utf8"));

    expect(manifest).toMatchObject({
      strategy: "voicebox-narration-with-deterministic-sfx-mix",
      voiceboxRole: "speech-generation",
      cueCount: 2,
      resolvedCueCount: 2,
      unresolvedCueCount: 0,
      cues: [
        { type: "sfx", description: "time machine hum", status: "resolved", durationSeconds: 2 },
        { type: "sfx", description: "soft bell chime", status: "resolved", durationSeconds: 1.2 }
      ]
    });
  });

  it("writes resolved cue artifacts and mixer metadata for final audio", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));

    const result = await runProducerAgent(
      {
        opening: "Good morning. [SFX: time machine hum, 2s]",
        segments: [
          {
            heading: "A clock starts",
            body: "Listen closely. [SFX: clock tick]\n[PAUSE: 1s]\n[SFX: mystery sparkle]"
          }
        ],
        closing: "Back to today.",
        estimatedDurationMin: 5,
        ttsNotes: ["Warm pace"]
      },
      outputDir
    );

    const manifest = JSON.parse(await fs.readFile(result.sfxManifestPath, "utf8"));
    const metadata = JSON.parse(await fs.readFile(result.metadataPath, "utf8"));
    const finalAudio = await fs.readFile(result.audioPath, "utf8");
    const humArtifact = await fs.readFile(path.join(outputDir, "sfx/cue-1-time-machine-hum.wav"));
    const tickArtifact = await fs.readFile(path.join(outputDir, "sfx/cue-2-clock-tick.wav"));

    expect(finalAudio).toContain("MIXED_AUDIO_STUB");
    expect(humArtifact.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(tickArtifact.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(manifest).toMatchObject({
      strategy: "voicebox-narration-with-deterministic-sfx-mix",
      voiceboxRole: "speech-generation",
      cueCount: 4,
      resolvedCueCount: 3,
      unresolvedCueCount: 1,
      cues: [
        {
          id: "cue-1",
          status: "resolved",
          sourceStrategy: "local-synthesis",
          synthesisKind: "time-machine-hum",
          audioArtifact: "sfx/cue-1-time-machine-hum.wav"
        },
        {
          id: "cue-2",
          status: "resolved",
          sourceStrategy: "local-synthesis",
          synthesisKind: "clock-tick",
          audioArtifact: "sfx/cue-2-clock-tick.wav"
        },
        {
          id: "cue-3",
          status: "resolved",
          sourceStrategy: "silence",
          audioArtifact: null
        },
        {
          id: "cue-4",
          status: "unresolved",
          sourceStrategy: "unsupported-cue",
          fallbackStatus: "needs-sfx-library-or-provider",
          audioArtifact: null
        }
      ]
    });
    expect(metadata).toMatchObject({
      engine: "voicebox",
      mixer: {
        strategy: "deterministic-local-sfx-stub-mix",
        finalAudioPath: result.audioPath,
        narrationRole: "voicebox-speech-generation",
        cueTrackCount: 4,
        renderedCueArtifactCount: 2,
        unresolvedCueCount: 1
      }
    });
  });

  it("resolves supported SFX cues with deterministic local synthesis", () => {
    const cues = extractProductionCues({
      opening: "[SFX: time machine hum, 2s]",
      segments: [
        { heading: "Clock", body: "[SFX: clock tick]\n[SFX: whoosh, 1.5s]" },
        { heading: "Bell", body: "[SFX: soft bell chime]" }
      ],
      closing: "Done.",
      estimatedDurationMin: 5,
      ttsNotes: []
    });

    expect(resolveProductionCues(cues)).toEqual([
      expect.objectContaining({
        id: "cue-1",
        description: "time machine hum",
        status: "resolved",
        sourceStrategy: "local-synthesis",
        synthesisKind: "time-machine-hum",
        durationSeconds: 2,
        audioArtifact: "sfx/cue-1-time-machine-hum.wav"
      }),
      expect.objectContaining({
        id: "cue-2",
        description: "clock tick",
        status: "resolved",
        sourceStrategy: "local-synthesis",
        synthesisKind: "clock-tick",
        durationSeconds: 0.6,
        audioArtifact: "sfx/cue-2-clock-tick.wav"
      }),
      expect.objectContaining({
        id: "cue-3",
        description: "whoosh",
        status: "resolved",
        sourceStrategy: "local-synthesis",
        synthesisKind: "whoosh",
        durationSeconds: 1.5,
        audioArtifact: "sfx/cue-3-whoosh.wav"
      }),
      expect.objectContaining({
        id: "cue-4",
        description: "soft bell chime",
        status: "resolved",
        sourceStrategy: "local-synthesis",
        synthesisKind: "bell",
        durationSeconds: 1.2,
        audioArtifact: "sfx/cue-4-bell.wav"
      })
    ]);
  });

  it("keeps pauses and unsupported cues explicit in the resolved cue plan", () => {
    const cues = extractProductionCues({
      opening: "[BGM: curious light pulse, under narration]",
      segments: [{ heading: "Mystery", body: "[PAUSE: 1s]\n[SFX: dragon roar, 3s]" }],
      closing: "Done.",
      estimatedDurationMin: 5,
      ttsNotes: []
    });

    expect(resolveProductionCues(cues)).toEqual([
      expect.objectContaining({
        id: "cue-1",
        type: "bgm",
        status: "unresolved",
        sourceStrategy: "unsupported-cue",
        fallbackStatus: "needs-sfx-library-or-provider",
        audioArtifact: null
      }),
      expect.objectContaining({
        id: "cue-2",
        type: "pause",
        status: "resolved",
        sourceStrategy: "silence",
        durationSeconds: 1,
        audioArtifact: null
      }),
      expect.objectContaining({
        id: "cue-3",
        type: "sfx",
        description: "dragon roar",
        status: "unresolved",
        sourceStrategy: "unsupported-cue",
        fallbackStatus: "needs-sfx-library-or-provider",
        durationSeconds: 3,
        audioArtifact: null
      })
    ]);
  });

  it("validates real Voicebox render configuration", () => {
    const config = validateVoiceboxConfig({
      engine: "voicebox",
      mode: "production",
      baseUrl: "http://127.0.0.1:17493",
      endpoint: "speak",
      ttsEngine: "qwen_custom_voice",
      modelSize: "1.7B",
      voiceProfile: "story-narrator-01",
      seed: 4262026,
      instruct: "warm, energetic narrator",
      language: "en",
      outputFormat: "mp3",
      enableVoiceCloning: false
    });

    expect(config).toMatchObject({
      mode: "production",
      endpoint: "speak",
      ttsEngine: "qwen_custom_voice",
      modelSize: "1.7B",
      voiceProfile: "story-narrator-01"
    });

    expect(() =>
      validateVoiceboxConfig({
        engine: "voicebox",
        mode: "production",
        endpoint: "speak",
        ttsEngine: "qwen_custom_voice",
        voiceProfile: "story-narrator-01",
        language: "en"
      })
    ).toThrow(/baseUrl/);
  });

  it("prepares narration text without production cues", () => {
    const narrationText = prepareNarrationText({
      opening: "[BGM: curious bed]\n[Voice: whisper]\nWelcome to the launch. [PAUSE: 1s]",
      segments: [
        {
          heading: "Start",
          body: "Click the button. [SFX: soft click]\n[Action: point to the screen]"
        }
      ],
      closing: "Back to today. [SFX: time machine powers down]"
    });

    expect(narrationText).toBe("Welcome to the launch.\n\nClick the button.\n\nBack to today.");
  });

  it("builds Voicebox speak and generate REST requests", () => {
    const speakConfig: VoiceboxConfig = validateVoiceboxConfig({
      engine: "voicebox",
      mode: "production",
      baseUrl: "http://127.0.0.1:17493",
      endpoint: "speak",
      clientId: "what-happened-producer",
      ttsEngine: "qwen_custom_voice",
      modelSize: "1.7B",
      voiceProfile: "story-narrator-01",
      seed: 4262026,
      instruct: "warm, energetic narrator",
      language: "en",
      outputFormat: "mp3",
      enableVoiceCloning: false
    });

    expect(buildVoiceboxRequest(speakConfig, "Hello there.")).toEqual({
      url: "http://127.0.0.1:17493/speak",
      headers: {
        "Content-Type": "application/json",
        "X-Voicebox-Client-Id": "what-happened-producer"
      },
      body: {
        text: "Hello there.",
        profile: "story-narrator-01",
        engine: "qwen_custom_voice",
        personality: false,
        language: "en"
      }
    });

    const generateConfig: VoiceboxConfig = validateVoiceboxConfig({
      ...speakConfig,
      endpoint: "generate",
      profileId: "profile-123",
      maxChunkChars: 800
    });

    expect(buildVoiceboxRequest(generateConfig, "Hello there.")).toMatchObject({
      url: "http://127.0.0.1:17493/generate",
      body: {
        profile_id: "profile-123",
        text: "Hello there.",
        language: "en",
        seed: 4262026,
        model_size: "1.7B",
        instruct: "warm, energetic narrator",
        engine: "qwen_custom_voice",
        max_chunk_chars: 800
      }
    });
  });

  it("fails clearly when production Voicebox is unavailable", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));

    await expect(
      renderWithVoicebox(
        {
          voicePreset: "story-narrator-01",
          outputAudioPath: path.join(outputDir, "final.mp3"),
          transcript: {
            opening: "Hello. [SFX: bell]",
            segments: [{ heading: "Start", body: "The story begins." }],
            closing: "Goodbye.",
            estimatedDurationMin: 5,
            ttsNotes: []
          }
        },
        {
          config: validateVoiceboxConfig({
            engine: "voicebox",
            mode: "production",
            baseUrl: "http://127.0.0.1:17493",
            endpoint: "speak",
            ttsEngine: "qwen_custom_voice",
            modelSize: "1.7B",
            voiceProfile: "story-narrator-01",
            seed: 4262026,
            instruct: "warm, energetic narrator",
            language: "en",
            outputFormat: "mp3",
            enableVoiceCloning: false
          }),
          fetch: async () => {
            throw new TypeError("fetch failed");
          }
        }
      )
    ).rejects.toThrow(/Voicebox REST request failed/);

    await expect(fs.stat(path.join(outputDir, "final.mp3"))).rejects.toThrow();
    const metadata = JSON.parse(await fs.readFile(path.join(outputDir, "render-metadata.json"), "utf8"));
    expect(metadata.voicebox.status).toBe("failed");
    expect(metadata.voicebox.error).toContain("fetch failed");
  });

  it("persists real Voicebox audio bytes and render metadata", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));
    const sourceAudioPath = path.join(outputDir, "voicebox-source.mp3");
    const audioBytes = new TextEncoder().encode("ID3real mp3 bytes");
    await fs.writeFile(sourceAudioPath, audioBytes);

    const result = await renderWithVoicebox(
      {
        voicePreset: "story-narrator-01",
        outputAudioPath: path.join(outputDir, "final.mp3"),
        transcript: {
          opening: "[Voice: bright]\nHello. [SFX: bell]",
          segments: [{ heading: "Start", body: "The story begins. [PAUSE: 1s]" }],
          closing: "Goodbye.",
          estimatedDurationMin: 5,
          ttsNotes: []
        }
      },
      {
        config: validateVoiceboxConfig({
          engine: "voicebox",
          mode: "production",
          baseUrl: "http://127.0.0.1:17493",
          endpoint: "speak",
          clientId: "what-happened-producer",
          ttsEngine: "qwen_custom_voice",
          modelSize: "1.7B",
          voiceProfile: "story-narrator-01",
          seed: 4262026,
          instruct: "warm, energetic narrator",
          language: "en",
          outputFormat: "mp3",
          enableVoiceCloning: false
        }),
        fetch: async () =>
          new Response(
            JSON.stringify({
              generation_id: "gen-123",
              audio_path: sourceAudioPath
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      }
    );

    await expect(fs.readFile(result.audioPath).then((bytes: Uint8Array) => Array.from(bytes))).resolves.toEqual(
      Array.from(audioBytes)
    );
    const metadata = JSON.parse(await fs.readFile(result.metadataPath, "utf8"));

    expect(metadata.voicebox).toMatchObject({
      status: "succeeded",
      endpoint: "speak",
      baseUrl: "http://127.0.0.1:17493",
      clientId: "what-happened-producer",
      ttsEngine: "qwen_custom_voice",
      modelSize: "1.7B",
      voiceProfile: "story-narrator-01",
      seed: 4262026,
      instruct: "warm, energetic narrator",
      generationId: "gen-123",
      sourceAudioPath
    });
    expect(metadata.voicebox.narrationText).toBe("Hello.\n\nThe story begins.\n\nGoodbye.");
  });

  it("picks up a producer-routed issue and opens a PR without marking review", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-pickup-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const calls: Array<{ file: string; args: string[] }> = [];
    const comments: Array<{ issueNumber: number; body: string }> = [];

    await writePassingWriterArtifacts(runDir);

    const result = await runProducerAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot,
      loadIssues: async () => [
        {
          number: 24,
          title: "Episode: August 24, 2026",
          state: "OPEN" as const,
          labels: ["status:producing", "agent:producer"]
        }
      ],
      loadIssue: async () => ({
        issueNumber: 24,
        title: "Episode: August 24, 2026",
        body: episodeIssueBody(),
        labels: ["status:producing", "agent:producer", "claim:producer-agent"],
        state: "OPEN" as const
      }),
      execFile: async (file, args) => {
        calls.push({ file, args });
        return "";
      },
      renderAudio: async ({ outputDir }) => {
        await fs.mkdir(outputDir, { recursive: true });
        const audioPath = path.join(outputDir, "final.mp3");
        const metadataPath = path.join(outputDir, "render-metadata.json");
        const sfxManifestPath = path.join(outputDir, "sfx-manifest.json");

        await fs.writeFile(audioPath, new TextEncoder().encode("ID3producer mp3 bytes"));
        await fs.writeFile(
          metadataPath,
          `${JSON.stringify({ voicebox: { mode: "production", status: "succeeded" } }, null, 2)}\n`,
          "utf8"
        );
        await fs.writeFile(
          sfxManifestPath,
          `${JSON.stringify({ cueCount: 2, cues: [] }, null, 2)}\n`,
          "utf8"
        );

        return { audioPath, metadataPath, sfxManifestPath };
      },
      openPullRequest: async () => "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/52",
      commentOnIssue: async (comment) => {
        comments.push(comment);
      }
    });

    expect(result.status).toBe("completed");
    expect(result.issue?.number).toBe(24);
    expect(result.runDir).toBe(runDir);
    expect(result.prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/52");
    expect(result.artifactPaths).toEqual([
      path.join(runDir, "audio", "final.mp3"),
      path.join(runDir, "audio", "render-metadata.json"),
      path.join(runDir, "audio", "sfx-manifest.json")
    ]);
    expect(calls).toEqual([
      {
        file: "gh",
        args: [
          "issue",
          "edit",
          "24",
          "--repo",
          "joycytao/what-happened-on-this-day-podcast",
          "--add-label",
          "claim:producer-agent"
        ]
      }
    ]);
    expect(calls.flatMap((call) => call.args)).not.toContain("status:review");
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("PR: https://github.com/joycytao/what-happened-on-this-day-podcast/pull/52");
    expect(comments[0]?.body).toContain("audio/final.mp3");
    expect(comments[0]?.body).toContain("audio/render-metadata.json");
    expect(comments[0]?.body).toContain("audio/sfx-manifest.json");
  });

  it("blocks producer pickup before claiming when transcript.md is missing", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-pickup-"));
    const calls: Array<{ file: string; args: string[] }> = [];

    await fs.mkdir(path.join(repoRoot, "runs", "2026-08-24-august-24-2026"), { recursive: true });

    await expect(
      runProducerAgentPickup({
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot,
        loadIssues: async () => [
          {
            number: 24,
            title: "Episode: August 24, 2026",
            state: "OPEN" as const,
            labels: ["status:producing", "agent:producer"]
          }
        ],
        loadIssue: async () => ({
          issueNumber: 24,
          title: "Episode: August 24, 2026",
          body: episodeIssueBody(),
          labels: ["status:producing", "agent:producer", "claim:producer-agent"],
          state: "OPEN" as const
        }),
        execFile: async (file, args) => {
          calls.push({ file, args });
          return "";
        }
      })
    ).rejects.toThrow(/transcript\.md/);
    expect(calls).toEqual([]);
  });

  it("blocks producer completion when rendered audio is not reviewable", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-pickup-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");

    await writePassingWriterArtifacts(runDir);

    await expect(
      runProducerAgentPickup({
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot,
        loadIssues: async () => [
          {
            number: 24,
            title: "Episode: August 24, 2026",
            state: "OPEN" as const,
            labels: ["status:producing", "agent:producer"]
          }
        ],
        loadIssue: async () => ({
          issueNumber: 24,
          title: "Episode: August 24, 2026",
          body: episodeIssueBody(),
          labels: ["status:producing", "agent:producer", "claim:producer-agent"],
          state: "OPEN" as const
        }),
        execFile: async () => "",
        renderAudio: async ({ outputDir }) => {
          await fs.mkdir(outputDir, { recursive: true });
          const audioPath = path.join(outputDir, "final.mp3");
          const metadataPath = path.join(outputDir, "render-metadata.json");
          const sfxManifestPath = path.join(outputDir, "sfx-manifest.json");

          await fs.writeFile(audioPath, "MIXED_AUDIO_STUB", "utf8");
          await fs.writeFile(
            metadataPath,
            `${JSON.stringify({ voicebox: { mode: "dry-run", status: "succeeded" } }, null, 2)}\n`,
            "utf8"
          );
          await fs.writeFile(sfxManifestPath, `${JSON.stringify({ cueCount: 0 }, null, 2)}\n`, "utf8");

          return { audioPath, metadataPath, sfxManifestPath };
        }
      })
    ).rejects.toThrow(/Episode audio is not reviewable/);
  });

  it("exits cleanly when no producer-routed issue exists", async () => {
    const result = await runProducerAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-pickup-")),
      loadIssues: async () => [
        {
          number: 25,
          title: "Writer work",
          state: "OPEN" as const,
          labels: ["status:writing", "agent:writer"]
        }
      ]
    });

    expect(result).toEqual({
      status: "noop",
      reason: "No issue was found for agent:producer."
    });
  });

  it("exposes a pickup CLI command for scheduled producer runners", async () => {
    const result = await runProducerAgentCli(
      [
        "node",
        "producer-agent",
        "pickup",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-pickup-")),
        loadIssues: async () => []
      }
    );

    expect(result).toEqual({
      status: "noop",
      reason: "No issue was found for agent:producer."
    });
  });

  it("requires --repo for the producer pickup CLI command", async () => {
    await expect(runProducerAgentCli(["node", "producer-agent", "pickup"])).rejects.toThrow(
      "The pickup command requires --repo."
    );
  });
});

async function writePassingWriterArtifacts(runDir: string) {
  const transcript = passingTranscript();

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "transcript.md"), serializeTranscriptMarkdown(transcript), "utf8");
  await fs.writeFile(path.join(runDir, "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(runDir, "transcript-quality-report.json"),
    `${JSON.stringify(evaluateTranscriptQuality(transcript), null, 2)}\n`,
    "utf8"
  );
}

function episodeIssueBody() {
  return [
    "date: 2026-08-24",
    "episode_slug: 2026-08-24-august-24-2026",
    "language: en",
    "audience: children-first-adult-friendly",
    "duration_target_min: 5",
    "duration_max_min: 8",
    "current_stage: producing",
    "output_run_path: runs/2026-08-24-august-24-2026"
  ].join("\n");
}

function passingTranscript(): Transcript {
  return {
    opening: [
      "Good morning, time traveler. [SFX: time machine hum, 2s]",
      "You are stepping into a day when computers began to feel friendlier for your family."
    ].join("\n"),
    segments: [
      {
        heading: "Time Machine Hook",
        body: "You see a glowing Start button. [Action: tap your desk twice] What would you click first? [SFX: soft click]"
      },
      {
        heading: "Narrative Drama",
        body: "You wait outside a store with other curious families. Your eyes spot boxes of Windows 95. [BGM: curious light pulse]"
      },
      {
        heading: "Scientific Deep-Dive",
        body: "You learn that an interface is like a school hallway for your computer. It helps you find rooms, tools, and files. [SFX: clock tick]"
      },
      {
        heading: "Modern World Twist",
        body: "Your tablet and laptop still use ideas like buttons and menus. Can you find one on your screen right now? [Action: point to a menu]"
      },
      {
        heading: "Outro & Mission",
        body: "You return home with a mission: ask your grown-up what their first computer looked like. [SFX: soft bell chime]"
      }
    ],
    closing: "You made it back to today, and your next click has a history. You can notice design choices everywhere now.",
    estimatedDurationMin: 5,
    ttsNotes: ["Pronunciation: Microsoft as MY-kroh-soft; Windows 95 as Windows ninety-five."]
  };
}
