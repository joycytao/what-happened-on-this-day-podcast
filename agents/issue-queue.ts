import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCallback);

export type IssueQueueAgentRole = "research" | "writer" | "producer";

export type IssueQueueIssue = {
  number: number;
  title: string;
  labels: string[];
  state: "OPEN" | "CLOSED";
};

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

export function selectIssueForAgent(
  issues: IssueQueueIssue[],
  options: {
    role: IssueQueueAgentRole;
    allowedStatuses?: string[];
    issueNumber?: number;
  }
) {
  const agentLabel = agentLabelForRole(options.role);
  const allowedStatuses = options.allowedStatuses?.map(normalizeLabel);
  const candidates = issues.filter((issue) => {
    if (issue.state !== "OPEN") return false;

    const labels = new Set(issue.labels.map(normalizeLabel));
    if (!labels.has(agentLabel)) return false;
    if (labels.has("status:blocked")) return false;
    if (hasClaimLabel(issue)) return false;

    if (allowedStatuses && !allowedStatuses.some((status) => labels.has(status))) {
      return false;
    }

    validateIssueQueueLabels(issue);
    return true;
  });

  if (typeof options.issueNumber === "number") {
    const selected = candidates.find((issue) => issue.number === options.issueNumber);

    if (!selected) {
      throw new Error(`No issue was found for ${agentLabel} with issue number #${options.issueNumber}.`);
    }

    return selected;
  }

  const [selected] = [...candidates].sort((left, right) => left.number - right.number);

  if (!selected) {
    throw new Error(`No issue was found for ${agentLabel}.`);
  }

  return selected;
}

export function validateIssueQueueLabels(issue: IssueQueueIssue) {
  const statusLabels = labelsWithPrefix(issue, "status:");
  const agentLabels = labelsWithPrefix(issue, "agent:");

  if (statusLabels.length !== 1) {
    throw new Error(
      `Issue #${issue.number} must have exactly one status:* label; found ${statusLabels.length}.`
    );
  }

  if (agentLabels.length > 1) {
    throw new Error(
      `Issue #${issue.number} must have at most one active agent:* label; found ${agentLabels.length}.`
    );
  }
}

export async function claimIssueForAgent(input: {
  repo: string;
  issue: IssueQueueIssue;
  role: IssueQueueAgentRole;
  execFile?: ExecFileFn;
  reloadIssue: () => Promise<IssueQueueIssue>;
}) {
  validateIssueQueueLabels(input.issue);

  if (hasClaimLabel(input.issue)) {
    throw new Error(`Issue #${input.issue.number} already has a claim:* label.`);
  }

  const claimLabel = claimLabelForRole(input.role);
  const execFile = input.execFile ?? execFileText;

  await execFile("gh", [
    "issue",
    "edit",
    String(input.issue.number),
    "--repo",
    input.repo,
    "--add-label",
    claimLabel
  ]);

  const claimedIssue = await input.reloadIssue();
  const labels = new Set(claimedIssue.labels.map(normalizeLabel));

  if (!labels.has(claimLabel)) {
    throw new Error(
      `Claim label ${claimLabel} was not present after re-reading issue #${input.issue.number}.`
    );
  }

  return claimedIssue;
}

export async function loadOpenIssueQueueIssues(input: {
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

export function buildStatusLabelUpdateArgs(issue: IssueQueueIssue, nextStatusLabel: string) {
  const normalizedNextStatus = normalizeLabel(nextStatusLabel);
  const args = removeLabelsArgs(labelsWithPrefix(issue, "status:"));

  args.push("--add-label", normalizedNextStatus);

  return args;
}

export function buildAgentLabelUpdateArgs(issue: IssueQueueIssue, nextAgentLabel?: string) {
  const normalizedNextAgent = nextAgentLabel ? normalizeLabel(nextAgentLabel) : undefined;
  const args = removeLabelsArgs(labelsWithPrefix(issue, "agent:"));

  if (normalizedNextAgent) {
    args.push("--add-label", normalizedNextAgent);
  }

  return args;
}

export function buildClaimLabelCleanupArgs(issue: IssueQueueIssue) {
  return removeLabelsArgs(labelsWithPrefix(issue, "claim:"));
}

export function agentLabelForRole(role: IssueQueueAgentRole) {
  return `agent:${role}` as const;
}

export function claimLabelForRole(role: IssueQueueAgentRole) {
  return `claim:${role}-agent` as const;
}

export function normalizeLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s*:\s*/g, ":");
}

function labelsWithPrefix(issue: IssueQueueIssue, prefix: string) {
  const normalizedPrefix = normalizeLabel(prefix);
  return issue.labels.filter((label) => normalizeLabel(label).startsWith(normalizedPrefix));
}

function hasClaimLabel(issue: IssueQueueIssue) {
  return labelsWithPrefix(issue, "claim:").length > 0;
}

function removeLabelsArgs(labels: string[]) {
  return labels.flatMap((label) => ["--remove-label", label]);
}

async function execFileText(file: string, args: string[], options?: { cwd?: string }) {
  const { stdout } = await execFileAsync(file, args, {
    cwd: options?.cwd,
    encoding: "utf8"
  });

  return stdout;
}
