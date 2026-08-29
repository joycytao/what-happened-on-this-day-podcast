import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateTranscriptQuality, runWriterAgent, runWriterAgentFromRunDir } from "../../agents/writer-agent";
import type { Transcript } from "../../src/contracts";

describe("writer agent", () => {
  it("turns a dossier into a complete five-module podcast script", async () => {
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

    expect(transcript.opening).toContain("[SFX:");
    expect(transcript.segments.map((segment) => segment.heading)).toEqual([
      "Time Machine Hook",
      "Narrative Drama",
      "Scientific Deep-Dive",
      "Modern World Twist",
      "Outro & Mission"
    ]);
    expect(transcript.estimatedDurationMin).toBeGreaterThanOrEqual(5);
    expect(transcript.estimatedDurationMin).toBeLessThanOrEqual(8);
    expect(evaluateTranscriptQuality(transcript).status).toBe("pass");
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
    expect(transcriptMarkdown).toContain("## Time Machine Hook");
    expect(transcriptMarkdown).toContain("## Scientific Deep-Dive");
    expect(transcriptMarkdown).toContain("## Closing");
    expect(transcript.opening).toContain("Good morning");
    expect(qualityReport).toMatchObject({
      status: "pass",
      checks: {
        five_module_structure: {
          status: "pass"
        }
      }
    });
  });

  it("can consume research-dossier.json from a run directory", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-from-run-dir-"));
    await fs.writeFile(
      path.join(runDir, "research-dossier.json"),
      `${JSON.stringify({
        episodeDate: "2026-08-24",
        chosenSubject: "The launch of Windows 95",
        entityType: "event",
        chosenAngle: "How a software launch helped make personal computers feel easier for everyday families",
        episodeThesis: "A computer interface can change how people learn, work, and explore at home.",
        timeline: [
          "August 24, 1995: Microsoft launches Windows 95",
          "1995: Windows 95 introduces the Start button, taskbar, desktop shortcuts, and plug and play support",
          "First five weeks after launch: Microsoft reports 7 million copies sold"
        ],
        storyBeats: [
          "Families and computer stores wait for a midnight software launch",
          "A new Start button and taskbar make computers feel more approachable",
          "The launch shows how software can change daily habits"
        ],
        modernRelevance: "Modern phones, tablets, and laptops still depend on interface choices that help people find apps, files, and settings.",
        sources: [
          {
            title: "Microsoft Stories: Launch of Windows 95",
            url: "https://news.microsoft.com/announcement/launch-of-windows-95/",
            sourceType: "official"
          }
        ],
        safetyNotes: []
      }, null, 2)}\n`,
      "utf8"
    );

    const transcript = await runWriterAgentFromRunDir(runDir);
    const qualityReport = JSON.parse(await fs.readFile(path.join(runDir, "transcript-quality-report.json"), "utf8"));

    expect(transcript.segments).toHaveLength(5);
    expect(transcript.segments[0].body).toContain("Windows 95");
    expect(qualityReport.status).toBe("pass");
    await expect(fs.readFile(path.join(runDir, "transcript.md"), "utf8")).resolves.toContain(
      "## Modern World Twist"
    );
  });

  it("keeps the old three-segment short draft failing deterministic quality checks", () => {
    const shortDraft: Transcript = {
      opening: "Good morning to everyone on the way to school.",
      segments: [
        { heading: "A big idea begins", body: "A short setup." },
        { heading: "The turning point", body: "A short middle." },
        { heading: "Why it still matters", body: "A short ending." }
      ],
      closing: "That is why this still matters.",
      estimatedDurationMin: 5,
      ttsNotes: ["Warm pace"]
    };

    const report = evaluateTranscriptQuality(shortDraft);

    expect(report.status).toBe("fail");
    expect(report.checks.five_module_structure.status).toBe("fail");
    expect(report.checks.sfx_or_bgm_density.status).toBe("fail");
  });
});
