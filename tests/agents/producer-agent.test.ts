import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProducerAgent } from "../../agents/producer-agent";
import { extractProductionCues } from "../../agents/producer-agent/sfx-cues";
import { resolveProductionCues } from "../../agents/producer-agent/sfx-resolver.js";

describe("producer agent", () => {
  it("creates audio metadata from a transcript", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));

    const result = await runProducerAgent(
      {
        opening: "Good morning to everyone on the way to school.",
        segments: [{ heading: "The beginning", body: "A city dreamed of a new museum." }],
        closing: "That dream still matters today.",
        estimatedDurationMin: 12,
        ttsNotes: ["Warm pace"]
      },
      outputDir
    );

    expect(result.audioPath).toContain("final.mp3");
    expect(result.metadataPath).toContain("render-metadata.json");
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
      estimatedDurationMin: 12,
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

  it("writes an SFX manifest next to rendered audio", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "producer-agent-"));

    const result = await runProducerAgent(
      {
        opening: "Good morning. [SFX: time machine hum, 2s]",
        segments: [{ heading: "The beginning", body: "A clock ticks. [SFX: soft bell chime]" }],
        closing: "That dream still matters today.",
        estimatedDurationMin: 12,
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
        estimatedDurationMin: 12,
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
      estimatedDurationMin: 12,
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
      estimatedDurationMin: 12,
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
});
