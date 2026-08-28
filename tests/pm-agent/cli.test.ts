import { describe, expect, it } from "vitest";
import { runPmAgentCli } from "../../agents/pm-agent";

type EpisodeIssueDraft = { title: string; body: string; labels: string[] };

describe("pm agent cli", () => {
  it("runs the project pickup command with repo resolution and dry-run", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];

    const result = await runPmAgentCli(
      [
        "node",
        "pm-agent",
        "pickup-project-issue",
        "--issue-number",
        "7",
        "--dry-run"
      ],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        logger: {
          info(message, meta) {
            logs.push({ message, meta });
          },
          warn() {},
          error() {}
        },
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
        loadIssues: async () => [
          {
            number: 4,
            title: "First ready work",
            labels: ["type:project", "status:ready"],
            state: "OPEN" as const
          },
          {
            number: 7,
            title: "Explicitly requested work",
            labels: ["type:project", "status:ready"],
            state: "OPEN" as const
          }
        ],
        prepareWorkspace: async () => {}
      }
    );

    expect(result?.issue.number).toBe(7);
    expect(logs[0]).toMatchObject({
      message: "Prepared project issue pickup",
      meta: {
        repo: "joycytao/what-happened-on-this-day-podcast",
        dryRun: true
      }
    });
  });

  it("uses the canonical repo root before planning the worktree path", async () => {
    const result = await runPmAgentCli(["node", "pm-agent", "pickup-project-issue", "--dry-run"], {
      repoRoot: "/tmp/podcast-repo/.worktrees/current-task",
      resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
      resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
      loadIssues: async () => [
        {
          number: 5,
          title: "Build daily automated PM-agent issue pickup workflow",
          labels: ["type: project", "status:ready"],
          state: "OPEN" as const
        }
      ],
      prepareWorkspace: async () => {},
      logger: {
        info() {},
        warn() {},
        error() {}
      }
    });

    expect(result?.worktreePath).toBe(
      "/tmp/podcast-repo/.worktrees/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow"
    );
  });

  it("runs the project completion command and reports the created pull request URL", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];

    const result = await runPmAgentCli(
      ["node", "pm-agent", "complete-project-issue", "--issue-number", "5"],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
        loadIssues: async () => [
          {
            number: 5,
            title: "Build daily automated PM-agent issue pickup workflow",
            labels: ["type:project", "status:ready"],
            state: "OPEN" as const
          }
        ],
        completeProjectIssue: async () => ({
          issue: {
            number: 5,
            title: "Build daily automated PM-agent issue pickup workflow",
            labels: ["type:project", "status:ready"],
            state: "OPEN" as const
          },
          branchName: "agent/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow",
          worktreePath:
            "/tmp/podcast-repo/.worktrees/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow",
          manifestPath:
            "/tmp/podcast-repo/runs/project-issue-5-build-daily-automated-pm-agent-issue-pickup-workflow/pickup.json",
          prUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99"
        }),
        logger: {
          info(message, meta) {
            logs.push({ message, meta });
          },
          warn() {},
          error() {}
        }
      }
    );

    expect(result?.prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99");
    expect(logs[0]).toMatchObject({
      message: "Completed project issue workflow",
      meta: {
        repo: "joycytao/what-happened-on-this-day-podcast",
        issueNumber: 5,
        prUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99"
      }
    });
  });

  it("creates an episode issue from a date without running downstream agents", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const createdIssueDrafts: Array<{ title: string; body: string; labels: string[] }> = [];

    const result = await runPmAgentCli(
      ["node", "pm-agent", "create-episode", "--date", "2026-08-24", "--working-title", "daily episode"],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => {
          createdIssueDrafts.push(draft);

          return {
            issueNumber: 24,
            title: draft.title,
            body: draft.body,
            labels: draft.labels
          };
        },
        logger: {
          info(message, meta) {
            logs.push({ message, meta });
          },
          warn() {},
          error() {}
        }
      }
    );

    expect(createdIssueDrafts).toHaveLength(1);
    expect(createdIssueDrafts[0]).toMatchObject({
      title: "Episode: August 24, 2026 - daily episode",
      labels: ["status:ready", "agent:research"]
    });
    expect(result).toMatchObject({
      issueNumber: 24,
      title: "Episode: August 24, 2026 - daily episode"
    });
    expect(logs[0]).toMatchObject({
      message: "Created episode issue",
      meta: {
        repo: "joycytao/what-happened-on-this-day-podcast",
        issueNumber: 24
      }
    });
  });

  it("picks up a ready episode issue and initializes research without downstream execution", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const initializedIssues: Array<{ issueNumber: number; title: string }> = [];

    const result = await runPmAgentCli(["node", "pm-agent", "pickup-episode", "--issue-number", "24"], {
      repoRoot: "/tmp/podcast-repo",
      resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
      resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
      loadEpisodeIssues: async () => [
        {
          issueNumber: 23,
          title: "Episode: August 23, 2026 - daily episode",
          body: "date: 2026-08-23\nepisode_slug: 2026-08-23-daily-episode",
          labels: ["status:review"],
          state: "OPEN" as const
        },
        {
          issueNumber: 24,
          title: "Episode: August 24, 2026 - daily episode",
          body: "date: 2026-08-24\nepisode_slug: 2026-08-24-daily-episode",
          labels: ["status:ready", "agent:research"],
          state: "OPEN" as const
        }
      ],
      runEpisodePipeline: async ({ issue }) => {
        if (!issue) throw new Error("Expected pickup to pass an issue.");
        initializedIssues.push({ issueNumber: issue.issueNumber, title: issue.title });

        return {
          issueNumber: issue.issueNumber,
          runDir: "/tmp/podcast-repo/runs/2026-08-24-daily-episode",
          finalStage: "researching" as const
        };
      },
      logger: {
        info(message, meta) {
          logs.push({ message, meta });
        },
        warn() {},
        error() {}
      }
    });

    expect(initializedIssues).toEqual([
      {
        issueNumber: 24,
        title: "Episode: August 24, 2026 - daily episode"
      }
    ]);
    expect(result).toMatchObject({
      issueNumber: 24,
      finalStage: "researching"
    });
    expect(logs[0]).toMatchObject({
      message: "Picked up episode issue",
      meta: {
        issueNumber: 24,
        finalStage: "researching"
      }
    });
  });

  it("accepts PM gatekeeper command names", async () => {
    await expect(
      runPmAgentCli(["node", "pm-agent", "audit-episode"], {
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast"
      })
    ).rejects.toThrow("The audit-episode command requires --issue-number.");

    await expect(
      runPmAgentCli(["node", "pm-agent", "advance-after-merge"], {
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast"
      })
    ).rejects.toThrow("The advance-after-merge command requires --issue-number.");

    await expect(
      runPmAgentCli(["node", "pm-agent", "block-episode"], {
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast"
      })
    ).rejects.toThrow("The block-episode command requires --issue-number.");
  });

  it("triages a new feature request before creating work", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];

    const result = await runPmAgentCli(
      ["node", "pm-agent", "triage-feature", "--request", "新功能 判斷 Voicebox 是否能產生時光機和鐘聲音效，以及如何實作"],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
        loadFeatureIntakeContext: async () => ({
          existingIssues: [],
          existingPullRequests: [],
          mainBranchSignals: []
        }),
        logger: {
          info(message, meta) {
            logs.push({ message, meta });
          },
          warn() {},
          error() {}
        }
      }
    );

    expect(result).toMatchObject({
      action: "create_spike",
      workflow: "system"
    });
    expect(logs[0]).toMatchObject({
      message: "Triaged feature request",
      meta: {
        action: "create_spike",
        workflow: "system"
      }
    });
  });
});
