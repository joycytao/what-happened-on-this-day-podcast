import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runWriterAgent } from "../../agents/writer-agent";

describe("writer agent", () => {
  it("turns a dossier into a structured transcript", async () => {
    const transcript = await runWriterAgent({
      episodeDate: "2026-08-18",
      chosenSubject: "A museum opens",
      entityType: "object",
      chosenAngle: "How a museum made history easier to touch",
      episodeThesis: "Public places for curiosity can change a whole city.",
      timeline: ["1890: planning", "1900: building", "1902: opening"],
      storyBeats: ["A city needed a learning place", "People built it together", "Families finally entered"],
      modernRelevance: "Children still learn from museums today.",
      sources: [{ title: "Archive", url: "https://example.com/archive", sourceType: "official" }],
      safetyNotes: []
    });

    expect(transcript.opening.length).toBeGreaterThan(20);
    expect(transcript.segments.length).toBeGreaterThanOrEqual(3);
    expect(transcript.estimatedDurationMin).toBeGreaterThanOrEqual(5);
    expect(transcript.estimatedDurationMin).toBeLessThanOrEqual(8);
  });

  it("writes required writer artifacts when given a run directory", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-artifacts-"));

    await runWriterAgent({
      episodeDate: "2026-08-18",
      chosenSubject: "A museum opens",
      entityType: "object",
      chosenAngle: "How a museum made history easier to touch",
      episodeThesis: "Public places for curiosity can change a whole city.",
      timeline: ["1890: planning", "1900: building", "1902: opening"],
      storyBeats: ["A city needed a learning place", "People built it together", "Families finally entered"],
      modernRelevance: "Children still learn from museums today.",
      sources: [{ title: "Archive", url: "https://example.com/archive", sourceType: "official" }],
      safetyNotes: []
    }, { runDir });

    const transcriptMarkdown = await fs.readFile(path.join(runDir, "transcript.md"), "utf8");
    const transcript = JSON.parse(await fs.readFile(path.join(runDir, "transcript.json"), "utf8"));
    const qualityReport = JSON.parse(await fs.readFile(path.join(runDir, "transcript-quality-report.json"), "utf8"));

    expect(transcriptMarkdown).toContain("# Transcript");
    expect(transcriptMarkdown).toContain("## Opening");
    expect(transcriptMarkdown).toContain("## Closing");
    expect(transcript.opening).toContain("Good morning");
    expect(qualityReport).toMatchObject({
      status: "fail",
      checks: {
        five_module_structure: {
          status: "fail"
        }
      }
    });
  });
});
