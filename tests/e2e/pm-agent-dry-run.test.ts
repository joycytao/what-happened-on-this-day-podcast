import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runEpisodePipeline } from "../../agents/pm-agent";

type EpisodeIssueDraft = { title: string; body: string; labels: string[] };

describe("pm dry run", () => {
  it("runs the full pm dry run to review", async () => {
    const result = await runEpisodePipeline(
      {
        brief: {
          date: "2026-08-19",
          workingTitle: "A Museum Opens"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => ({
          issueNumber: 19,
          title: draft.title,
          body: draft.body,
          labels: draft.labels
        })
      }
    );

    expect(result.runDir).toContain("runs/");
    expect(result.finalStage).toBe("review");
    await expect(fs.access(path.join(result.runDir, "research-dossier.json"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(result.runDir, "references", "research-references.json"))).resolves.toBeUndefined();
  });

  it("creates an episode issue before passing the request downstream", async () => {
    const createdIssueDrafts: Array<{ title: string; body: string; labels: string[] }> = [];
    const contextUpdates: Array<{ currentStage?: string; outputRunPath?: string }> = [];
    const uploadedResearchPackages: Array<{ issueNumber: number; runDir: string }> = [];

    const result = await runEpisodePipeline(
      {
        brief: {
          date: "2026-08-24",
          workingTitle: "daily episode"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => {
          createdIssueDrafts.push(draft);

          return {
            issueNumber: 24,
            title: draft.title,
            body: draft.body.replace("episode_slug: 2026-08-24-daily-episode", "episode_slug: 2026-08-24-created-on-github"),
            labels: draft.labels
          };
        },
        updateEpisodeIssueContext: async (issue, updates) => {
          contextUpdates.push(updates);
          return issue;
        },
        uploadResearchPackage: async ({ issue, runDir }) => {
          uploadedResearchPackages.push({ issueNumber: issue.issueNumber, runDir });
        }
      }
    );

    expect(createdIssueDrafts[0]).toMatchObject({
      title: "Episode: August 24, 2026 - daily episode",
      labels: ["type:episode", "status:ready"]
    });
    expect(result.runDir).toContain("runs/2026-08-24-created-on-github");
    expect(result.issueNumber).toBe(24);
    expect(result.finalStage).toBe("review");
    expect(contextUpdates).toEqual([
      {
        currentStage: "researching",
        outputRunPath: "runs/2026-08-24-created-on-github"
      },
      {
        currentStage: "writing",
        outputRunPath: "runs/2026-08-24-created-on-github"
      },
      {
        currentStage: "review",
        outputRunPath: "runs/2026-08-24-created-on-github"
      }
    ]);
    expect(uploadedResearchPackages).toEqual([
      {
        issueNumber: 24,
        runDir: result.runDir
      }
    ]);
  });
});
