import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runProducerAgent } from "../../agents/producer-agent";
import { extractProductionCues } from "../../agents/producer-agent/sfx-cues";

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
      strategy: "voicebox-narration-with-external-sfx",
      voiceboxRole: "speech-generation",
      cueCount: 2,
      cues: [
        { type: "sfx", description: "time machine hum", durationSeconds: 2 },
        { type: "sfx", description: "soft bell chime", durationSeconds: null }
      ]
    });
  });
});
