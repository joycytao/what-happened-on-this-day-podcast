import {
  buildStatusLabelUpdateArgs,
  type IssueQueueIssue
} from "./issue-queue.js";

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

export async function recordAgentFailure(input: {
  repo: string;
  issue: IssueQueueIssue;
  agentName: string;
  gateName: string;
  reason: string;
  nextStatusLabel: string;
  execFile: ExecFileFn;
  updateStatus?: boolean;
}) {
  if (input.updateStatus) {
    await input.execFile("gh", [
      "issue",
      "edit",
      String(input.issue.number),
      "--repo",
      input.repo,
      ...buildStatusLabelUpdateArgs(input.issue, input.nextStatusLabel)
    ]);
  }

  await input.execFile("gh", [
    "issue",
    "comment",
    String(input.issue.number),
    "--repo",
    input.repo,
    "--body",
    buildAgentFailureComment({
      agentName: input.agentName,
      gateName: input.gateName,
      reason: input.reason,
      nextStatusLabel: input.nextStatusLabel
    })
  ]);
}

function buildAgentFailureComment(input: {
  agentName: string;
  gateName: string;
  reason: string;
  nextStatusLabel: string;
}) {
  return [
    "## Agent failure",
    "",
    `Responsible agent: ${input.agentName}`,
    `Failed gate: ${input.gateName}`,
    `Reason: ${input.reason}`,
    `Next status: ${input.nextStatusLabel}`,
    "Next action: fix the failed gate output, then rerun the scheduled pickup or PM gate."
  ].join("\n");
}
