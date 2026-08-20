import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectIssuePickupPlan,
  buildProjectIssuePullRequest,
  completeProjectIssue,
  loadReadyProjectIssues,
  openProjectIssuePullRequest,
  parseGitHubRepoSlug,
  prepareProjectWorkspace,
  runProjectIssuePickup,
  selectProjectIssueForPickup,
  updateProjectIssuePickupManifest,
  writeProjectIssuePickupManifest,
  type ProjectQueueIssue
} from "../../agents/pm-agent/project-pickup";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe("pm agent project pickup", () => {
  it("selects the next ready project issue by ascending issue number", () => {
    const selected = selectProjectIssueForPickup([
      issue({
        number: 9,
        title: "Project: later ready work",
        labels: ["type:project", "status:ready"]
      }),
      issue({
        number: 4,
        title: "Project: first ready work",
        labels: ["type:project", "status:ready"]
      }),
      issue({
        number: 2,
        title: "Episode: not in this queue",
        labels: ["type:episode", "status:ready"]
      }),
      issue({
        number: 3,
        title: "Project: blocked work",
        labels: ["type:project", "status:blocked"]
      })
    ]);

    expect(selected.number).toBe(4);
    expect(selected.title).toBe("Project: first ready work");
  });

  it("honors an explicit issue override when the issue exists", () => {
    const selected = selectProjectIssueForPickup(
      [
        issue({
          number: 4,
          title: "Project: first ready work",
          labels: ["type:project", "status:ready"]
        }),
        issue({
          number: 7,
          title: "Project: explicitly requested work",
          labels: ["type:project", "status:ready"]
        })
      ],
      { issueNumber: 7 }
    );

    expect(selected.number).toBe(7);
  });

  it("accepts GitHub labels with a space after the colon", () => {
    const selected = selectProjectIssueForPickup([
      issue({
        number: 5,
        title: "Project: spaced label style",
        labels: ["type: project", "status:ready"]
      })
    ]);

    expect(selected.number).toBe(5);
  });

  it("builds the branch and worktree plan from the selected issue", () => {
    const plan = buildProjectIssuePickupPlan({
      repoRoot: "/tmp/podcast-repo",
      issue: issue({
        number: 5,
        title: "Build daily automated PM-agent issue pickup workflow",
        labels: ["type:project", "status:ready"]
      })
    });

    expect(plan.branchName).toBe(
      "agent/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow"
    );
    expect(plan.worktreePath).toBe(
      "/tmp/podcast-repo/.worktrees/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow"
    );
    expect(plan.baseBranch).toBe("main");
  });

  it("writes pickup metadata to disk for later audit", async () => {
    const repoRoot = await createTempRepoRoot();
    const plan = buildProjectIssuePickupPlan({
      repoRoot,
      issue: issue({
        number: 5,
        title: "Build daily automated PM-agent issue pickup workflow",
        labels: ["type:project", "status:ready"]
      })
    });

    const manifest = await writeProjectIssuePickupManifest(plan);
    const saved = JSON.parse(await fs.readFile(manifest.manifestPath, "utf8"));

    expect(manifest.manifestPath).toContain(
      "runs/project-issue-5-build-daily-automated-pm-agent-issue-pickup-workflow/pickup.json"
    );
    expect(saved.branchName).toBe(plan.branchName);
    expect(saved.worktreePath).toBe(plan.worktreePath);
    expect(saved.issue.number).toBe(5);
  });

  it("runs the project pickup flow with an explicit override", async () => {
    const repoRoot = await createTempRepoRoot();
    const prepared: string[] = [];
    const result = await runProjectIssuePickup({
      repoRoot,
      issueNumber: 7,
      loadIssues: async () => [
        issue({
          number: 4,
          title: "First ready work",
          labels: ["type:project", "status:ready"]
        }),
        issue({
          number: 7,
          title: "Explicitly requested work",
          labels: ["type:project", "status:ready"]
        })
      ],
      prepareWorkspace: async (plan) => {
        prepared.push(plan.branchName);
      }
    });

    expect(prepared).toEqual(["agent/issue-7-explicitly-requested-work"]);
    expect(result.issue.number).toBe(7);
    expect(result.manifestPath).toContain("runs/project-issue-7-explicitly-requested-work");
  });

  it("parses the GitHub repo slug from common remote URL formats", () => {
    expect(parseGitHubRepoSlug("https://github.com/joycytao/what-happened-on-this-day-podcast.git")).toBe(
      "joycytao/what-happened-on-this-day-podcast"
    );
    expect(parseGitHubRepoSlug("git@github.com:joycytao/what-happened-on-this-day-podcast.git")).toBe(
      "joycytao/what-happened-on-this-day-podcast"
    );
  });

  it("skips git side effects in dry-run mode when preparing the workspace", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    await prepareProjectWorkspace(
      buildProjectIssuePickupPlan({
        repoRoot: "/tmp/podcast-repo",
        issue: issue({
          number: 5,
          title: "Build daily automated PM-agent issue pickup workflow",
          labels: ["type:project", "status:ready"]
        })
      }),
      {
        dryRun: true,
        execFile: async (file, args) => {
          calls.push({ file, args });
          return "";
        }
      }
    );

    expect(calls).toEqual([]);
  });

  it("loads open GitHub issues without depending on exact label spelling in the query", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    const issues = await loadReadyProjectIssues({
      repo: "joycytao/what-happened-on-this-day-podcast",
      execFile: async (file, args) => {
        calls.push({ file, args });
        return JSON.stringify([
          {
            number: 5,
            title: "Build daily automated PM-agent issue pickup workflow",
            state: "OPEN",
            labels: [{ name: "type: project" }, { name: "status:ready" }]
          }
        ]);
      }
    });

    expect(calls[0]?.args).not.toContain("--label");
    expect(issues[0]?.labels).toEqual(["type: project", "status:ready"]);
  });

  it("builds a pull request title and body for the selected project issue", () => {
    const pullRequest = buildProjectIssuePullRequest({
      plan: buildProjectIssuePickupPlan({
        repoRoot: "/tmp/podcast-repo",
        issue: issue({
          number: 5,
          title: "Build daily automated PM-agent issue pickup workflow",
          labels: ["type:project", "status:ready"]
        })
      })
    });

    expect(pullRequest.title).toBe("Issue #5: Build daily automated PM-agent issue pickup workflow");
    expect(pullRequest.body).toContain("Closes #5");
    expect(pullRequest.body).toContain("agent/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow");
  });

  it("opens a pull request from the project issue branch", async () => {
    const calls: Array<{ file: string; args: string[]; cwd?: string }> = [];
    const prUrl = await openProjectIssuePullRequest({
      repoRoot: "/tmp/podcast-repo",
      repo: "joycytao/what-happened-on-this-day-podcast",
      plan: buildProjectIssuePickupPlan({
        repoRoot: "/tmp/podcast-repo",
        issue: issue({
          number: 5,
          title: "Build daily automated PM-agent issue pickup workflow",
          labels: ["type:project", "status:ready"]
        })
      }),
      execFile: async (file, args, options) => {
        calls.push({ file, args, cwd: options?.cwd });
        return file === "gh" ? "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99" : "";
      }
    });

    expect(calls[0]).toMatchObject({
      file: "git",
      args: ["push", "-u", "origin", "agent/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow"],
      cwd: "/tmp/podcast-repo"
    });
    expect(calls[1]?.file).toBe("gh");
    expect(calls[1]?.args).toContain("--head");
    expect(calls[1]?.args).toContain("agent/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow");
    expect(prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99");
  });

  it("updates pickup metadata with the created pull request URL", async () => {
    const repoRoot = await createTempRepoRoot();
    const plan = buildProjectIssuePickupPlan({
      repoRoot,
      issue: issue({
        number: 5,
        title: "Build daily automated PM-agent issue pickup workflow",
        labels: ["type:project", "status:ready"]
      })
    });
    const manifest = await writeProjectIssuePickupManifest(plan);

    await updateProjectIssuePickupManifest(manifest.manifestPath, {
      prUrl: "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99"
    });

    const saved = JSON.parse(await fs.readFile(manifest.manifestPath, "utf8"));
    expect(saved.prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99");
  });

  it("completes the project issue flow by opening a pull request and recording the URL", async () => {
    const repoRoot = await createTempRepoRoot();
    const result = await completeProjectIssue({
      repoRoot,
      repo: "joycytao/what-happened-on-this-day-podcast",
      issueNumber: 5,
      loadIssues: async () => [
        issue({
          number: 5,
          title: "Build daily automated PM-agent issue pickup workflow",
          labels: ["type:project", "status:ready"]
        })
      ],
      openPullRequest: async () =>
        "https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99"
    });

    const saved = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
    expect(result.prUrl).toBe("https://github.com/joycytao/what-happened-on-this-day-podcast/pull/99");
    expect(saved.prUrl).toBe(result.prUrl);
    expect(saved.branchName).toBe("agent/issue-5-build-daily-automated-pm-agent-issue-pickup-workflow");
  });
});

function issue(input: {
  number: number;
  title: string;
  labels: string[];
  state?: "OPEN" | "CLOSED";
}): ProjectQueueIssue {
  return {
    state: "OPEN",
    ...input
  };
}

async function createTempRepoRoot() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-project-pickup-"));
  tempDirs.push(repoRoot);
  await fs.mkdir(path.join(repoRoot, "runs"), { recursive: true });
  return repoRoot;
}
