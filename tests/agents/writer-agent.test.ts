import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  evaluateTranscriptQuality,
  runWriterAgent,
  runWriterAgentCli,
  runWriterAgentFromRunDir,
  runWriterAgentPickup
} from "../../agents/writer-agent";
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

  it("picks up a writer-routed issue without requiring type labels", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-pickup-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const calls: Array<{ file: string; args: string[] }> = [];
    const comments: Array<{ issueNumber: number; body: string }> = [];

    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "research-dossier.json"), windows95DossierJson(), "utf8");

    const result = await runWriterAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot,
      loadIssues: async () => [
        {
          number: 24,
          title: "Episode: August 24, 2026",
          state: "OPEN" as const,
          labels: ["status:writing", "agent:writer"]
        }
      ],
      loadIssue: async () => ({
        issueNumber: 24,
        title: "Episode: August 24, 2026",
        body: [
          "date: 2026-08-24",
          "episode_slug: 2026-08-24-august-24-2026",
          "language: en",
          "audience: children-first-adult-friendly",
          "duration_target_min: 5",
          "duration_max_min: 8",
          "current_stage: writing",
          "output_run_path: runs/2026-08-24-august-24-2026"
        ].join("\n"),
        labels: ["status:writing", "agent:writer", "claim:writer-agent"],
        state: "OPEN" as const
      }),
      execFile: async (file, args) => {
        calls.push({ file, args });
        return "";
      },
      openPullRequest: async () => "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/51",
      commentOnIssue: async (comment) => {
        comments.push(comment);
      }
    });

    expect(result.status).toBe("completed");
    expect(result.issue?.number).toBe(24);
    expect(result.runDir).toBe(runDir);
    expect(result.prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/51");
    expect(result.artifactPaths).toEqual([
      path.join(runDir, "transcript.md"),
      path.join(runDir, "transcript.json"),
      path.join(runDir, "transcript-quality-report.json")
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
          "claim:writer-agent"
        ]
      }
    ]);
    await expect(fs.readFile(path.join(runDir, "transcript.md"), "utf8")).resolves.toContain(
      "## Time Machine Hook"
    );
    await expect(fs.readFile(path.join(runDir, "transcript.json"), "utf8")).resolves.toContain(
      "The launch of Windows 95"
    );
    await expect(
      fs.readFile(path.join(runDir, "transcript-quality-report.json"), "utf8")
    ).resolves.toContain('"status": "pass"');
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toContain("PR: https://github.com/joycytao/what-happened-on-this-day-podcast/pull/51");
    expect(comments[0]?.body).toContain("Quality: pass");
    expect(comments[0]?.body).toContain("transcript-quality-report.json");
  });

  it("blocks pickup clearly when merged research artifacts are missing", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    await expect(
      runWriterAgentPickup({
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-pickup-")),
        loadIssues: async () => [
          {
            number: 24,
            title: "Episode: August 24, 2026",
            state: "OPEN" as const,
            labels: ["status:writing", "agent:writer"]
          }
        ],
        loadIssue: async () => ({
          issueNumber: 24,
          title: "Episode: August 24, 2026",
          body: [
            "date: 2026-08-24",
            "episode_slug: 2026-08-24-august-24-2026",
            "language: en",
            "audience: children-first-adult-friendly",
            "duration_target_min: 5",
            "duration_max_min: 8",
            "current_stage: writing",
            "output_run_path: runs/2026-08-24-august-24-2026"
          ].join("\n"),
          labels: ["status:writing", "agent:writer", "claim:writer-agent"],
          state: "OPEN" as const
        }),
        execFile: async (file, args) => {
          calls.push({ file, args });
          return "";
        }
      })
    ).rejects.toThrow(/research-dossier\.json/);
    expect(calls).toEqual([]);
  });

  it("exits cleanly when no writer-routed issue exists", async () => {
    const result = await runWriterAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-pickup-")),
      loadIssues: async () => [
        {
          number: 25,
          title: "Research work",
          state: "OPEN" as const,
          labels: ["status:ready", "agent:research"]
        }
      ]
    });

    expect(result).toEqual({
      status: "noop",
      reason: "No issue was found for agent:writer."
    });
  });

  it("does not advance the issue to producer after opening a writer PR", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-pickup-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const labelUpdates: string[][] = [];

    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "research-dossier.json"), windows95DossierJson(), "utf8");

    await runWriterAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot,
      loadIssues: async () => [
        {
          number: 24,
          title: "Episode: August 24, 2026",
          state: "OPEN" as const,
          labels: ["status:writing", "agent:writer"]
        }
      ],
      loadIssue: async () => ({
        issueNumber: 24,
        title: "Episode: August 24, 2026",
        body: [
          "date: 2026-08-24",
          "episode_slug: 2026-08-24-august-24-2026",
          "language: en",
          "audience: children-first-adult-friendly",
          "duration_target_min: 5",
          "duration_max_min: 8",
          "current_stage: writing",
          "output_run_path: runs/2026-08-24-august-24-2026"
        ].join("\n"),
        labels: ["status:writing", "agent:writer", "claim:writer-agent"],
        state: "OPEN" as const
      }),
      execFile: async (_file, args) => {
        labelUpdates.push(args);
        return "";
      },
      openPullRequest: async () => "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/51",
      commentOnIssue: async () => {}
    });

    expect(labelUpdates.flat()).not.toContain("agent:producer");
    expect(labelUpdates.flat()).not.toContain("status:producing");
  });

  it("records a retryable writer failure without changing status:writing", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-pickup-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const calls: Array<{ file: string; args: string[] }> = [];

    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "research-dossier.json"), windows95DossierJson(), "utf8");

    await expect(
      runWriterAgentPickup({
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot,
        loadIssues: async () => [
          {
            number: 24,
            title: "Episode: August 24, 2026",
            state: "OPEN" as const,
            labels: ["status:writing", "agent:writer"]
          }
        ],
        loadIssue: async () => ({
          issueNumber: 24,
          title: "Episode: August 24, 2026",
          body: [
            "date: 2026-08-24",
            "episode_slug: 2026-08-24-august-24-2026",
            "language: en",
            "audience: children-first-adult-friendly",
            "duration_target_min: 5",
            "duration_max_min: 8",
            "current_stage: writing",
            "output_run_path: runs/2026-08-24-august-24-2026"
          ].join("\n"),
          labels: ["status:writing", "agent:writer", "claim:writer-agent"],
          state: "OPEN" as const
        }),
        execFile: async (file, args) => {
          calls.push({ file, args });
          return "";
        },
        openPullRequest: async () => {
          throw new Error("git push failed");
        }
      })
    ).rejects.toThrow("git push failed");

    expect(calls[0]?.args).toContain("claim:writer-agent");
    expect(calls[1]?.file).toBe("gh");
    expect(calls[1]?.args.slice(0, 5)).toEqual([
      "issue",
      "comment",
      "24",
      "--repo",
      "joycytao/what-happened-on-this-day-podcast"
    ]);
    expect(calls[1]?.args.join("\n")).toContain("## Agent failure");
    expect(calls[1]?.args.join("\n")).toContain("Responsible agent: writer-agent");
    expect(calls[1]?.args.join("\n")).toContain("Next status: status:writing");
    expect(calls.flatMap((call) => call.args)).not.toContain("status:blocked");
  });

  it("exposes a pickup CLI command for scheduled runners", async () => {
    const result = await runWriterAgentCli(
      [
        "node",
        "writer-agent",
        "pickup",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "writer-agent-pickup-")),
        loadIssues: async () => []
      }
    );

    expect(result).toEqual({
      status: "noop",
      reason: "No issue was found for agent:writer."
    });
  });

  it("requires --repo for the pickup CLI command", async () => {
    await expect(runWriterAgentCli(["node", "writer-agent", "pickup"])).rejects.toThrow(
      "The pickup command requires --repo."
    );
  });
});

function windows95DossierJson() {
  return `${JSON.stringify({
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
  }, null, 2)}\n`;
}
