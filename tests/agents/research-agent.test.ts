import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runResearchAgent, runResearchAgentCli, runResearchAgentPickup } from "../../agents/research-agent";

describe("research agent", () => {
  it("returns a balanced, children-safe dossier", async () => {
    const dossier = await runResearchAgent({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 5,
      durationMaxMin: 8,
      currentStage: "researching"
    });

    expect(dossier.entityType).toMatch(/person|event|object/);
    expect(dossier.sources.length).toBeGreaterThanOrEqual(1);
    expect(dossier.modernRelevance.length).toBeGreaterThan(10);
  });

  it("persists a sourced reference folder before completing research", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-research-agent-"));

    await runResearchAgent(
      {
        date: "2026-08-18",
        episodeSlug: "2026-08-18-a-museum-opens",
        language: "en",
        audience: "children-first-adult-friendly",
        durationTargetMin: 5,
        durationMaxMin: 8,
        currentStage: "researching"
      },
      { runDir }
    );

    const dossier = JSON.parse(await fs.readFile(path.join(runDir, "research-dossier.json"), "utf8"));
    const references = JSON.parse(await fs.readFile(path.join(runDir, "references", "research-references.json"), "utf8"));
    const referenceSummary = await fs.readFile(path.join(runDir, "references", "README.md"), "utf8");

    expect(dossier.chosenSubject).toBeTruthy();
    expect(references.items.length).toBeGreaterThanOrEqual(1);
    expect(references.items[0]).toMatchObject({
      summary: expect.any(String),
      source: {
        title: expect.any(String),
        url: expect.stringMatching(/^https?:\/\//),
        sourceType: expect.any(String)
      }
    });
    expect(referenceSummary).toContain("Source:");
  });

  it("picks up a research-routed issue without requiring type labels", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "research-agent-pickup-"));
    const calls: Array<{ file: string; args: string[] }> = [];

    const result = await runResearchAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot,
      loadIssues: async () => [
        {
          number: 24,
          title: "Episode: August 24, 2026",
          state: "OPEN" as const,
          labels: ["status:ready", "agent:research"]
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
          "current_stage: ready",
          "output_run_path: runs/2026-08-24-august-24-2026"
        ].join("\n"),
        labels: ["status:ready", "agent:research", "claim:research-agent"],
        state: "OPEN" as const
      }),
      execFile: async (file, args) => {
        calls.push({ file, args });
        return "";
      },
      openPullRequest: async () => "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/50",
      commentOnIssue: async () => {}
    });

    expect(result.status).toBe("completed");
    expect(result.issue?.number).toBe(24);
    expect(result.runDir).toBe(path.join(repoRoot, "runs", "2026-08-24-august-24-2026"));
    expect(result.prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/50");
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
          "claim:research-agent"
        ]
      }
    ]);
    await expect(fs.readFile(path.join(result.runDir!, "research-dossier.json"), "utf8")).resolves.toContain(
      "Windows 95"
    );
    await expect(
      fs.readFile(path.join(result.runDir!, "references", "research-references.json"), "utf8")
    ).resolves.toContain("Microsoft Stories");
    await expect(fs.readFile(path.join(result.runDir!, "references", "README.md"), "utf8")).resolves.toContain(
      "Source:"
    );
  });

  it("exits cleanly when no research-routed issue exists", async () => {
    const result = await runResearchAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "research-agent-pickup-")),
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
      reason: "No issue was found for agent:research."
    });
  });

  it("does not advance the issue to writer after opening a research PR", async () => {
    const labelUpdates: string[][] = [];

    await runResearchAgentPickup({
      repo: "joycytao/what-happened-on-this-day-podcast",
      repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "research-agent-pickup-")),
      loadIssues: async () => [
        {
          number: 24,
          title: "Episode: August 24, 2026",
          state: "OPEN" as const,
          labels: ["status:ready", "agent:research"]
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
          "current_stage: ready"
        ].join("\n"),
        labels: ["status:ready", "agent:research", "claim:research-agent"],
        state: "OPEN" as const
      }),
      execFile: async (_file, args) => {
        labelUpdates.push(args);
        return "";
      },
      openPullRequest: async () => "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/50",
      commentOnIssue: async () => {}
    });

    expect(labelUpdates.flat()).not.toContain("agent:writer");
    expect(labelUpdates.flat()).not.toContain("status:writing");
  });

  it("exposes a pickup CLI command for scheduled runners", async () => {
    const result = await runResearchAgentCli(
      [
        "node",
        "research-agent",
        "pickup",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: await fs.mkdtemp(path.join(os.tmpdir(), "research-agent-pickup-")),
        loadIssues: async () => []
      }
    );

    expect(result).toEqual({
      status: "noop",
      reason: "No issue was found for agent:research."
    });
  });

  it("requires --repo for the pickup CLI command", async () => {
    await expect(runResearchAgentCli(["node", "research-agent", "pickup"])).rejects.toThrow(
      "The pickup command requires --repo."
    );
  });
});
