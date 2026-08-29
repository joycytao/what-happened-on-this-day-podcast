import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertWriterTranscriptArtifact,
  assertWriterTranscriptQuality
} from "../../agents/pm-agent";
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
});
