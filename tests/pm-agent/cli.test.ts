import { describe, expect, it } from "vitest";
import { loadOpenPullRequestFeedback, runPmAgentCli } from "../../agents/pm-agent";

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
      runPmAgentCli(["node", "pm-agent", "block-episode"], {
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast"
      })
    ).rejects.toThrow("The block-episode command requires --issue-number.");
  });

  it("runs advance-after-merge as a scheduler command without an explicit issue number", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const advancedIssues: number[] = [];

    const result = await runPmAgentCli(
      [
        "node",
        "pm-agent",
        "advance-after-merge",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        loadEpisodeIssues: async () => [
          {
            issueNumber: 24,
            title: "Episode: August 24, 2026",
            body: "date: 2026-08-24\nepisode_slug: 2026-08-24-august-24-2026\ncurrent_stage: writing",
            labels: ["status:writing", "agent:writer"],
            state: "OPEN" as const
          },
          {
            issueNumber: 25,
            title: "Episode: August 25, 2026",
            body: "date: 2026-08-25\nepisode_slug: 2026-08-25-august-25-2026\ncurrent_stage: ready",
            labels: ["status:ready", "agent:research"],
            state: "OPEN" as const
          }
        ],
        loadOpenPullRequestFeedback: async () => [],
        advanceEpisodeAfterMerge: async ({ issue }: { issue: { issueNumber: number } }) => {
          advancedIssues.push(issue.issueNumber);
          return {
            issueNumber: issue.issueNumber,
            currentStage: "producing" as const,
            activeAgentLabel: "agent:producer" as const
          };
        },
        logger: {
          info(message: string, meta?: Record<string, unknown>) {
            logs.push({ message, meta });
          },
          warn() {},
          error() {}
        }
      }
    );

    expect(result).toMatchObject({
      status: "completed",
      results: [
        {
          issueNumber: 24,
          currentStage: "producing",
          activeAgentLabel: "agent:producer"
        }
      ]
    });
    expect(advancedIssues).toEqual([24]);
    expect(logs[0]).toMatchObject({
      message: "Advanced episode issue after merge",
      meta: {
        issueNumber: 24,
        limit: 1
      }
    });
  });

  it("supports --limit for scheduled advance-after-merge", async () => {
    const advancedIssues: number[] = [];

    const result = await runPmAgentCli(
      [
        "node",
        "pm-agent",
        "advance-after-merge",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast",
        "--limit",
        "2"
      ],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        loadEpisodeIssues: async () => [
          {
            issueNumber: 24,
            title: "Episode: August 24, 2026",
            body: "date: 2026-08-24\nepisode_slug: 2026-08-24-august-24-2026\ncurrent_stage: writing",
            labels: ["status:writing", "agent:writer"],
            state: "OPEN" as const
          },
          {
            issueNumber: 25,
            title: "Episode: August 25, 2026",
            body: "date: 2026-08-25\nepisode_slug: 2026-08-25-august-25-2026\ncurrent_stage: producing",
            labels: ["status:producing", "agent:producer"],
            state: "OPEN" as const
          }
        ],
        loadOpenPullRequestFeedback: async () => [],
        advanceEpisodeAfterMerge: async ({ issue }: { issue: { issueNumber: number } }) => {
          advancedIssues.push(issue.issueNumber);
          return {
            issueNumber: issue.issueNumber,
            currentStage: "review" as const,
            activeAgentLabel: undefined
          };
        },
        logger: {
          info() {},
          warn() {},
          error() {}
        }
      }
    );

    expect(result).toMatchObject({
      status: "completed",
      results: [
        { issueNumber: 24 },
        { issueNumber: 25 }
      ]
    });
    expect(advancedIssues).toEqual([24, 25]);
  });

  it("surfaces pending open PR feedback while still advancing eligible issues", async () => {
    const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const advancedIssues: number[] = [];

    const result = await runPmAgentCli(
      [
        "node",
        "pm-agent",
        "advance-after-merge",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        loadEpisodeIssues: async () => [
          {
            issueNumber: 24,
            title: "Episode: August 24, 2026",
            body: "date: 2026-08-24\nepisode_slug: 2026-08-24-august-24-2026\ncurrent_stage: writing",
            labels: ["status:writing", "agent:writer"],
            state: "OPEN" as const
          }
        ],
        loadOpenPullRequestFeedback: async () => [
          {
            pullRequestNumber: 82,
            pullRequestTitle: "Issue #51: add October 1 research package",
            pullRequestUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82",
            commentUrl:
              "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-1",
            author: "joycytao",
            body: "平價汽車！ 福特 T 型車上市 (1908)",
            createdAt: "2026-09-04T18:35:50Z"
          }
        ],
        advanceEpisodeAfterMerge: async ({ issue }: { issue: { issueNumber: number } }) => {
          advancedIssues.push(issue.issueNumber);
          return {
            issueNumber: issue.issueNumber,
            currentStage: "producing" as const,
            activeAgentLabel: "agent:producer" as const
          };
        },
        logger: {
          info() {},
          warn(message: string, meta?: Record<string, unknown>) {
            warnings.push({ message, meta });
          },
          error() {}
        }
      }
    );

    expect(result).toMatchObject({
      status: "completed",
      results: [
        {
          issueNumber: 24,
          currentStage: "producing",
          activeAgentLabel: "agent:producer"
        }
      ],
      feedback: [
        {
          pullRequestNumber: 82,
          body: "平價汽車！ 福特 T 型車上市 (1908)"
        }
      ]
    });
    expect(advancedIssues).toEqual([24]);
    expect(warnings[0]).toMatchObject({
      message: "Open pull request feedback requires review",
      meta: {
        repo: "joycytao/what-happened-on-this-day-podcast",
        feedbackCount: 1,
        firstPullRequestNumber: 82
      }
    });
  });

  it("exits advance-after-merge cleanly when no active merged issue exists", async () => {
    const result = await runPmAgentCli(
      [
        "node",
        "pm-agent",
        "advance-after-merge",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        loadEpisodeIssues: async () => [
          {
            issueNumber: 24,
            title: "Episode: August 24, 2026",
            body: "date: 2026-08-24\nepisode_slug: 2026-08-24-august-24-2026\ncurrent_stage: review",
            labels: ["status:review"],
            state: "OPEN" as const
          }
        ],
        loadOpenPullRequestFeedback: async () => [],
        logger: {
          info() {},
          warn() {},
          error() {}
        }
      }
    );

    expect(result).toEqual({
      status: "noop",
      reason: "No episode issue was eligible for advance-after-merge."
    });
  });

  it("surfaces pending open PR feedback during scheduled advance-after-merge", async () => {
    const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];

    const result = await runPmAgentCli(
      [
        "node",
        "pm-agent",
        "advance-after-merge",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast"
      ],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        loadEpisodeIssues: async () => [],
        loadOpenPullRequestFeedback: async () => [
          {
            pullRequestNumber: 82,
            pullRequestTitle: "Issue #51: add October 1 research package",
            pullRequestUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82",
            commentUrl:
              "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-1",
            author: "joycytao",
            body: "平價汽車！ 福特 T 型車上市 (1908)",
            createdAt: "2026-09-04T18:35:50Z"
          }
        ],
        logger: {
          info() {},
          warn(message: string, meta?: Record<string, unknown>) {
            warnings.push({ message, meta });
          },
          error() {}
        }
      }
    );

    expect(result).toEqual({
      status: "pending_pr_feedback",
      reason: "Open pull request feedback requires review before the scheduler can report no work.",
      feedback: [
        {
          pullRequestNumber: 82,
          pullRequestTitle: "Issue #51: add October 1 research package",
          pullRequestUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82",
          commentUrl:
            "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-1",
          author: "joycytao",
          body: "平價汽車！ 福特 T 型車上市 (1908)",
          createdAt: "2026-09-04T18:35:50Z"
        }
      ]
    });
    expect(warnings[0]).toMatchObject({
      message: "Open pull request feedback requires review",
      meta: {
        repo: "joycytao/what-happened-on-this-day-podcast",
        feedbackCount: 1,
        firstPullRequestNumber: 82
      }
    });
  });

  it("ignores PR comments before the latest feedback-addressed marker", async () => {
    const feedback = await loadOpenPullRequestFeedback({
      repo: "joycytao/what-happened-on-this-day-podcast",
      execFile: async () =>
        JSON.stringify([
          {
            number: 82,
            title: "Issue #51: add October 1 research package",
            url: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82",
            comments: [
              {
                author: { login: "joycytao" },
                body: "平價汽車！ 福特 T 型車上市 (1908)",
                createdAt: "2026-09-04T18:35:50Z",
                url: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-1"
              },
              {
                author: { login: "joycytao" },
                body: "Read and addressed the PR comment.",
                createdAt: "2026-09-04T20:40:14Z",
                url: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-2"
              },
              {
                author: { login: "joycytao" },
                body: "再確認一下售價換算。",
                createdAt: "2026-09-04T20:45:14Z",
                url: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-3"
              }
            ]
          }
        ])
    });

    expect(feedback).toEqual([
      {
        pullRequestNumber: 82,
        pullRequestTitle: "Issue #51: add October 1 research package",
        pullRequestUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82",
        commentUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/82#issuecomment-3",
        author: "joycytao",
        body: "再確認一下售價換算。",
        createdAt: "2026-09-04T20:45:14Z"
      }
    ]);
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
          info(message: string, meta?: Record<string, unknown>) {
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
