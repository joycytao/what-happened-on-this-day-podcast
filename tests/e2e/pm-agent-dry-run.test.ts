import { describe, expect, it } from "vitest";
import { runEpisodePipeline } from "../../agents/pm-agent";

type EpisodeIssueDraft = { title: string; body: string; labels: string[] };

describe("pm dry run", () => {
  it("blocks producer handoff when writer transcript artifact is missing", async () => {
    let producerCallCount = 0;

    await expect(runEpisodePipeline(
      {
        brief: {
          date: "2026-08-20",
          workingTitle: "Writer Artifact Gate"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => ({
          issueNumber: 20,
          title: draft.title,
          body: draft.body,
          labels: draft.labels
        }),
        runWriterAgent: async () => ({
          opening: "A test opening for the writer artifact gate.",
          segments: [
            {
              heading: "A test segment",
              body: "A test body for the writer artifact gate."
            }
          ],
          closing: "A test closing for the writer artifact gate.",
          estimatedDurationMin: 5,
          ttsNotes: []
        }),
        runProducerAgent: async () => {
          producerCallCount += 1;

          throw new Error("Producer should not run without transcript.json.");
        }
      }
    )).rejects.toThrow("Writer transcript artifact is incomplete");

    expect(producerCallCount).toBe(0);
  });

  it("blocks dry-run audio before review", async () => {
    await expect(runEpisodePipeline(
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
    )).rejects.toThrow("Episode audio is not reviewable");
  });

  it("creates an episode issue before passing the request downstream and does not review dry-run audio", async () => {
    const createdIssueDrafts: Array<{ title: string; body: string; labels: string[] }> = [];
    const contextUpdates: Array<{ currentStage?: string; outputRunPath?: string }> = [];
    const uploadedResearchPackages: Array<{ issueNumber: number; runDir: string }> = [];

    await expect(runEpisodePipeline(
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
    )).rejects.toThrow("Episode audio is not reviewable");

    expect(createdIssueDrafts[0]).toMatchObject({
      title: "Episode: August 24, 2026 - daily episode",
      labels: ["type:episode", "status:ready"]
    });
    expect(contextUpdates).toEqual([
      {
        currentStage: "researching",
        outputRunPath: "runs/2026-08-24-created-on-github"
      },
      {
        currentStage: "writing",
        outputRunPath: "runs/2026-08-24-created-on-github"
      }
    ]);
    expect(contextUpdates.some((update) => update.currentStage === "review")).toBe(false);
    expect(uploadedResearchPackages).toEqual([
      {
        issueNumber: 24,
        runDir: expect.stringContaining("runs/2026-08-24-created-on-github")
      }
    ]);
  });
});
