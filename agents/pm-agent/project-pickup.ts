import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { resolveRepoPaths } from "../../src/lib/fs-paths";

const execFilePromise = promisify(execFileCallback);

export type ProjectQueueIssue = {
  number: number;
  title: string;
  labels: string[];
  state: "OPEN" | "CLOSED";
};

export type ProjectIssuePickupPlan = {
  issue: ProjectQueueIssue;
  baseBranch: string;
  branchName: string;
  worktreePath: string;
  manifestDir: string;
};

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

export function selectProjectIssueForPickup(
  issues: ProjectQueueIssue[],
  options: { issueNumber?: number } = {}
) {
  const readyProjectIssues = issues.filter((issue) => {
    if (issue.state !== "OPEN") return false;

    const labels = new Set(issue.labels.map(normalizeLabel));
    return labels.has("type:project") && labels.has("status:ready");
  });

  if (typeof options.issueNumber === "number") {
    const selected = readyProjectIssues.find((issue) => issue.number === options.issueNumber);

    if (!selected) {
      throw new Error(`Ready project issue #${options.issueNumber} was not found.`);
    }

    return selected;
  }

  const [selected] = [...readyProjectIssues].sort((left, right) => left.number - right.number);

  if (!selected) {
    throw new Error("No ready project issues were found.");
  }

  return selected;
}

export function buildProjectIssuePickupPlan(input: {
  repoRoot: string;
  issue: ProjectQueueIssue;
  baseBranch?: string;
}) {
  const slug = issueSlug(input.issue);

  return {
    issue: input.issue,
    baseBranch: input.baseBranch ?? "main",
    branchName: `agent/issue-${input.issue.number}-${slug}`,
    worktreePath: path.join(input.repoRoot, ".worktrees", `issue-${input.issue.number}-${slug}`),
    manifestDir: path.join(
      resolveRepoPaths(input.repoRoot).runsDir,
      `project-issue-${input.issue.number}-${slug}`
    )
  } satisfies ProjectIssuePickupPlan;
}

export async function writeProjectIssuePickupManifest(plan: ProjectIssuePickupPlan) {
  await fs.mkdir(plan.manifestDir, { recursive: true });
  const manifestPath = path.join(plan.manifestDir, "pickup.json");

  await fs.writeFile(manifestPath, `${JSON.stringify(buildPickupManifestDocument(plan), null, 2)}\n`, "utf8");

  return { manifestPath };
}

export async function runProjectIssuePickup(input: {
  repoRoot: string;
  issueNumber?: number;
  loadIssues: () => Promise<ProjectQueueIssue[]>;
  prepareWorkspace?: (plan: ProjectIssuePickupPlan) => Promise<void>;
}) {
  const issues = await input.loadIssues();
  const issue = selectProjectIssueForPickup(issues, { issueNumber: input.issueNumber });
  const plan = buildProjectIssuePickupPlan({ repoRoot: input.repoRoot, issue });

  if (input.prepareWorkspace) {
    await input.prepareWorkspace(plan);
  }

  const { manifestPath } = await writeProjectIssuePickupManifest(plan);

  return {
    issue,
    branchName: plan.branchName,
    worktreePath: plan.worktreePath,
    manifestPath
  };
}

export function buildProjectIssuePullRequest(input: { plan: ProjectIssuePickupPlan }) {
  return {
    title: `Issue #${input.plan.issue.number}: ${input.plan.issue.title}`,
    body: [
      "## Summary",
      `- complete project issue #${input.plan.issue.number}`,
      `- work delivered from branch \`${input.plan.branchName}\``,
      "",
      `Closes #${input.plan.issue.number}`
    ].join("\n")
  };
}

export function parseGitHubRepoSlug(remoteUrl: string) {
  const normalized = remoteUrl.trim();
  const httpsMatch = normalized.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);

  if (!httpsMatch) {
    throw new Error(`Could not parse GitHub repo slug from remote URL: ${remoteUrl}`);
  }

  return httpsMatch[1];
}

export async function resolveGitHubRepoSlug(input: {
  repoRoot: string;
  execFile?: ExecFileFn;
}) {
  const remoteUrl = await (input.execFile ?? execFileText)("git", ["remote", "get-url", "origin"], {
    cwd: input.repoRoot
  });

  return parseGitHubRepoSlug(remoteUrl);
}

export async function resolveWorkspaceRepoRoot(input: {
  repoRoot: string;
  execFile?: ExecFileFn;
}) {
  const gitCommonDir = await (input.execFile ?? execFileText)(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      cwd: input.repoRoot
    }
  );

  return path.dirname(gitCommonDir);
}

export async function loadReadyProjectIssues(input: {
  repo: string;
  execFile?: ExecFileFn;
}) {
  const output = await (input.execFile ?? execFileText)("gh", [
    "issue",
    "list",
    "--repo",
    input.repo,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,state,labels"
  ]);

  const parsed = JSON.parse(output) as Array<{
    number: number;
    title: string;
    state: "OPEN" | "CLOSED";
    labels: Array<{ name: string }>;
  }>;

  return parsed.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map((label) => label.name)
  }));
}

export async function openProjectIssuePullRequest(input: {
  repoRoot: string;
  repo: string;
  plan: ProjectIssuePickupPlan;
  execFile?: ExecFileFn;
}) {
  const execFile = input.execFile ?? execFileText;
  const pullRequest = buildProjectIssuePullRequest({ plan: input.plan });

  await execFile("git", ["push", "-u", "origin", input.plan.branchName], {
    cwd: input.repoRoot
  });

  return execFile(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      input.repo,
      "--base",
      input.plan.baseBranch,
      "--head",
      input.plan.branchName,
      "--title",
      pullRequest.title,
      "--body",
      pullRequest.body
    ],
    { cwd: input.repoRoot }
  );
}

export async function updateProjectIssuePickupManifest(
  manifestPath: string,
  updates: {
    prUrl?: string;
  }
) {
  const saved = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        ...saved,
        ...updates
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function completeProjectIssue(input: {
  repoRoot: string;
  repo: string;
  issueNumber: number;
  loadIssues: () => Promise<ProjectQueueIssue[]>;
  openPullRequest?: (plan: ProjectIssuePickupPlan) => Promise<string>;
}) {
  const issues = await input.loadIssues();
  const issue = selectProjectIssueForPickup(issues, { issueNumber: input.issueNumber });
  const plan = buildProjectIssuePickupPlan({ repoRoot: input.repoRoot, issue });
  const { manifestPath } = await writeProjectIssuePickupManifest(plan);
  const prUrl = await (input.openPullRequest ??
    ((nextPlan) =>
      openProjectIssuePullRequest({
        repoRoot: input.repoRoot,
        repo: input.repo,
        plan: nextPlan
      })))(plan);

  await updateProjectIssuePickupManifest(manifestPath, { prUrl });

  return {
    issue,
    branchName: plan.branchName,
    worktreePath: plan.worktreePath,
    manifestPath,
    prUrl
  };
}

export async function prepareProjectWorkspace(
  plan: ProjectIssuePickupPlan,
  input: {
    dryRun?: boolean;
    execFile?: ExecFileFn;
  } = {}
) {
  if (input.dryRun) {
    return;
  }

  const execFile = input.execFile ?? execFileText;

  await fs.mkdir(path.dirname(plan.worktreePath), { recursive: true });
  await execFile("git", ["fetch", "origin"], { cwd: path.dirname(path.dirname(plan.worktreePath)) });
  await execFile(
    "git",
    ["worktree", "add", plan.worktreePath, "-b", plan.branchName, `origin/${plan.baseBranch}`],
    { cwd: path.dirname(path.dirname(plan.worktreePath)) }
  );
}

function issueSlug(issue: ProjectQueueIssue) {
  return issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/:\s+/g, ":").trim();
}

async function execFileText(file: string, args: string[], options?: { cwd?: string }) {
  const result = await execFilePromise(file, args, options);
  return result.stdout.trim();
}

function buildPickupManifestDocument(plan: ProjectIssuePickupPlan) {
  return {
    issue: plan.issue,
    baseBranch: plan.baseBranch,
    branchName: plan.branchName,
    worktreePath: plan.worktreePath
  };
}
