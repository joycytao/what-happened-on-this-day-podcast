import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertWriterTranscriptArtifact,
  assertWriterTranscriptQuality
} from "../../agents/pm-agent";
import { evaluateTranscriptQuality } from "../../agents/writer-agent";
import { serializeTranscriptMarkdown } from "../../src/contracts";
import type { Transcript } from "../../src/contracts";

const stubTranscript: Transcript = {
  opening: "Good morning to everyone on the way to school.",
  segments: [
    {
      heading: "The beginning",
      body: "A city wanted a new place to learn."
    }
  ],
  closing: "That is why this story still matters today.",
  estimatedDurationMin: 5,
  ttsNotes: ["Warm pacing"]
};

describe("pm writer artifact gate", () => {
  it("blocks producer handoff when transcript.md is missing", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-writer-gate-"));
    await fs.writeFile(path.join(runDir, "transcript.json"), `${JSON.stringify(stubTranscript)}\n`, "utf8");

    await expect(assertWriterTranscriptArtifact(runDir)).rejects.toThrow("transcript.md");
  });

  it("blocks producer handoff when transcript-quality-report.json is missing", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-writer-gate-"));
    await fs.writeFile(path.join(runDir, "transcript.md"), "# Transcript\n", "utf8");
    await fs.writeFile(path.join(runDir, "transcript.json"), `${JSON.stringify(stubTranscript)}\n`, "utf8");

    await expect(assertWriterTranscriptArtifact(runDir)).rejects.toThrow(
      "transcript-quality-report.json"
    );
  });

  it("blocks producer handoff when a stub transcript claims a passing quality report", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-writer-gate-"));
    await fs.writeFile(path.join(runDir, "transcript.md"), "# Transcript\n", "utf8");
    await fs.writeFile(path.join(runDir, "transcript.json"), `${JSON.stringify(stubTranscript)}\n`, "utf8");
    await fs.writeFile(
      path.join(runDir, "transcript-quality-report.json"),
      `${JSON.stringify({ status: "pass", checks: {} })}\n`,
      "utf8"
    );

    const transcript = await assertWriterTranscriptArtifact(runDir);

    await expect(assertWriterTranscriptQuality(runDir, transcript)).rejects.toThrow(
      "five_module_structure"
    );
  });

  it("blocks producer handoff when merged writer artifacts fail SOP v3 checks", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-writer-gate-"));
    const roboticTranscript: Transcript = {
      opening: "[SFX: time machine hum] [BGM: curious pulse] [Voice: announcer] Here is your first clue about 2026-10-02.",
      segments: [
        {
          heading: "Time Machine Hook",
          body: "First clue: you see a desk. What do you notice? [Action: point to your desk]"
        },
        {
          heading: "Narrative Drama",
          body: "The story happened in 1950 and 7 newspapers saw it."
        },
        {
          heading: "Scientific Deep-Dive",
          body: "[Pause 1s] Now we slow down and investigate the hidden machinery."
        },
        {
          heading: "Modern World Twist",
          body: "Here is where this connects to your world."
        },
        {
          heading: "Outro & Mission",
          body: "Mission time. You can tell someone about it."
        }
      ],
      closing: "You made it back to today.",
      estimatedDurationMin: 5,
      ttsNotes: ["Pronunciation: read names clearly."]
    };

    await fs.writeFile(path.join(runDir, "transcript.md"), serializeTranscriptMarkdown(roboticTranscript), "utf8");
    await fs.writeFile(path.join(runDir, "transcript.json"), `${JSON.stringify(roboticTranscript)}\n`, "utf8");
    await fs.writeFile(
      path.join(runDir, "transcript-quality-report.json"),
      `${JSON.stringify(evaluateTranscriptQuality(roboticTranscript), null, 2)}\n`,
      "utf8"
    );

    const transcript = await assertWriterTranscriptArtifact(runDir);

    await expect(assertWriterTranscriptQuality(runDir, transcript)).rejects.toThrow(
      "sop_v3_no_banned_signposting"
    );
  });
});
