import { describe, expect, it } from "vitest";
import { runEpisodePipeline } from "../../agents/pm-agent";

type EpisodeIssueDraft = { title: string; body: string; labels: string[] };

describe("pm gatekeeper episode initialization", () => {
  it("creates an episode issue and initializes research without running downstream agents", async () => {
    const createdIssueDrafts: EpisodeIssueDraft[] = [];
    const contextUpdates: Array<{ currentStage?: string; outputRunPath?: string }> = [];

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
            body: draft.body.replace(
              "episode_slug: 2026-08-24-daily-episode",
              "episode_slug: 2026-08-24-created-on-github"
            ),
            labels: draft.labels
          };
        },
        updateEpisodeIssueContext: async (issue, updates) => {
          contextUpdates.push(updates);
          return {
            ...issue,
            labels: ["status:researching", "agent:research"]
          };
        }
      }
    );

    expect(createdIssueDrafts).toEqual([
      expect.objectContaining({
        title: "Episode: August 24, 2026 - daily episode",
        labels: ["status:ready", "agent:research"]
      })
    ]);
    expect(contextUpdates).toEqual([
      {
        currentStage: "researching",
        outputRunPath: "runs/2026-08-24-created-on-github"
      }
    ]);
    expect(result).toMatchObject({
      issueNumber: 24,
      finalStage: "researching"
    });
  });
});
