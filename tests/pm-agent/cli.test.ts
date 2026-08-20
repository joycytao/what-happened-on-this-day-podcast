import { describe, expect, it } from "vitest";
import { runPmAgentCli } from "../../agents/pm-agent";

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
});
