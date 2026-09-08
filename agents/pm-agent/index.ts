import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { evaluateTranscriptQuality } from "../writer-agent";
import {
  buildEpisodeIssueDraft,
  assertResearchPackageArtifacts,
  commentOnEpisodeIssue,
  createEpisodeIssue,
  createEpisodeIssueFromDate,
  loadEpisodeIssueFromGitHub,
  loadReadyEpisodeIssues,
  parseEpisodeIssueFields,
  resolveEpisodeRequest,
  selectEpisodeIssueForPickup,
  updateEpisodeIssueContextOnGitHub,
  updateEpisodeIssueStageOnGitHub,
  type EpisodeIssue,
  type EpisodeAgentLabel,
  type EpisodeIssueContextUpdates,
  type EpisodeIssueDraft
} from "./github-issue";
import {
  completeProjectIssue,
  loadReadyProjectIssues,
  prepareProjectWorkspace,
  resolveGitHubRepoSlug,
  resolveWorkspaceRepoRoot,
  runProjectIssuePickup,
  type ProjectQueueIssue
} from "./project-pickup";
import { triageFeatureRequest, type FeatureIntakeInput } from "./feature-intake";
import { createRunManifest } from "./run-manifest";
import { parseCliArgs } from "../../src/lib/cli";
import { createLogger } from "../../src/lib/logger";
import { transcriptSchema, writerArtifactPaths, type Transcript } from "../../src/contracts";

export { resolveEpisodeRequest, createRunManifest };

const execFileAsync = promisify(execFileCallback);

type ProducerResult = {
  audioPath: string;
  metadataPath: string;
};

export type PendingPullRequestFeedback = {
  pullRequestNumber: number;
  pullRequestTitle: string;
  pullRequestUrl: string;
  commentUrl: string;
  author: string;
  body: string;
  createdAt: string;
};

export async function assertWriterTranscriptArtifact(runDir: string) {
  const missingArtifacts = [];

  for (const artifactPath of writerArtifactPaths) {
    const absolutePath = path.join(runDir, artifactPath);

    try {
      const stat = await fs.stat(absolutePath);

      if (!stat.isFile()) {
        missingArtifacts.push(artifactPath);
      }
    } catch {
      missingArtifacts.push(artifactPath);
    }
  }

  if (missingArtifacts.length > 0) {
    throw new Error(
      `Writer transcript artifact is incomplete: missing ${missingArtifacts.join(", ")} in ${runDir}`
    );
  }

  const transcriptPath = path.join(runDir, "transcript.json");
  try {
    return transcriptSchema.parse(JSON.parse(await fs.readFile(transcriptPath, "utf8")));
  } catch (error) {
    throw new Error(
      `Writer transcript artifact is incomplete: ${transcriptPath}${
        error instanceof Error ? ` (${error.message})` : ""
      }`
    );
  }
}

export async function assertWriterTranscriptQuality(runDir: string, transcript: Transcript) {
  const reportPath = path.join(runDir, "transcript-quality-report.json");
  const failures: string[] = [];

  try {
    const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
      status?: string;
      checks?: Record<string, { status?: string }>;
    };

    if (report.status !== "pass") {
      failures.push(`report.status is ${report.status ?? "missing"}`);
    }

    for (const [checkName, check] of Object.entries(report.checks ?? {})) {
      if (check.status !== "pass") {
        failures.push(`${checkName} is ${check.status ?? "missing"}`);
      }
    }
  } catch (error) {
    throw new Error(
      `Writer transcript quality gate failed: ${reportPath}${
        error instanceof Error ? ` (${error.message})` : ""
      }`
    );
  }

  const computedReport = evaluateTranscriptQuality(transcript);

  if (computedReport.status !== "pass") {
    failures.push(
      ...Object.entries(computedReport.checks)
        .filter(([, check]) => check.status !== "pass")
        .map(([checkName, check]) => `${checkName} expected ${check.expected}, actual ${check.actual}`)
    );
  }

  if (failures.length > 0) {
    throw new Error(`Writer transcript quality gate failed: ${failures.join("; ")}`);
  }

  return reportPath;
}

export async function assertReviewableEpisodeAudio(result: ProducerResult) {
  const metadata = JSON.parse(await fs.readFile(result.metadataPath, "utf8")) as {
    voicebox?: {
      status?: string;
      mode?: string;
    };
  };
  const audioHeader = await readAudioHeader(result.audioPath);
  const failures: string[] = [];

  if (metadata.voicebox?.mode !== "production") {
    failures.push(`voicebox.mode is ${metadata.voicebox?.mode ?? "missing"}`);
  }

  if (metadata.voicebox?.status !== "succeeded") {
    failures.push(`voicebox.status is ${metadata.voicebox?.status ?? "missing"}`);
  }

  if (!isMp3Header(audioHeader)) {
    failures.push("audio/final.mp3 is not audio/mpeg");
  }

  if (failures.length > 0) {
    throw new Error(`Episode audio is not reviewable: ${failures.join("; ")}`);
  }
}

export async function runEpisodePipeline(input: {
  issueNumber?: number;
  issue?: EpisodeIssue;
  brief?: { date: string; workingTitle: string };
}, dependencies: {
  createEpisodeIssue?: (draft: EpisodeIssueDraft) => Promise<EpisodeIssue>;
  updateEpisodeIssueContext?: (issue: EpisodeIssue, updates: EpisodeIssueContextUpdates) => Promise<EpisodeIssue>;
  repo?: string;
} = {}) {
  const issue =
    input.issue ??
    (await (dependencies.createEpisodeIssue ?? ((draft) => createEpisodeIssue(draft, { repo: dependencies.repo })))(
      buildEpisodeIssueDraft(input.brief ?? { date: "2026-08-19", workingTitle: "daily episode" })
    ));
  const request = resolveEpisodeRequest(issue);

  const { runDir } = await createRunManifest(request);
  const outputRunPath = path.relative(process.cwd(), runDir);
  const updateEpisodeIssueContext = dependencies.updateEpisodeIssueContext ?? (async (nextIssue: EpisodeIssue) => nextIssue);
  const currentIssue = await updateEpisodeIssueContext(issue, {
    currentStage: "researching",
    outputRunPath
  });

  return {
    issueNumber: currentIssue.issueNumber,
    runDir,
    finalStage: "researching" as const
  };
}

async function readAudioHeader(audioPath: string) {
  const file = await fs.open(audioPath, "r");

  try {
    const buffer = Buffer.alloc(10);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function isMp3Header(header: Uint8Array) {
  const hasId3Tag = header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
  const hasMpegFrameSync = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;

  return hasId3Tag || hasMpegFrameSync;
}

export async function runPmAgentCli(
  argv: string[],
  dependencies: {
    repoRoot?: string;
    logger?: {
      info: (message: string, meta?: Record<string, unknown>) => void;
      warn: (message: string, meta?: Record<string, unknown>) => void;
      error: (message: string, meta?: Record<string, unknown>) => void;
    };
    resolveWorkspaceRoot?: () => Promise<string>;
    resolveRepo?: () => Promise<string>;
    loadIssues?: () => Promise<ProjectQueueIssue[]>;
    loadEpisodeIssues?: () => Promise<EpisodeIssue[]>;
    prepareWorkspace?: Parameters<typeof runProjectIssuePickup>[0]["prepareWorkspace"];
    completeProjectIssue?: typeof completeProjectIssue;
    createEpisodeIssue?: (draft: EpisodeIssueDraft) => Promise<EpisodeIssue>;
    createEpisodeIssueFromDate?: typeof createEpisodeIssueFromDate;
    updateEpisodeIssueContext?: (issue: EpisodeIssue, updates: EpisodeIssueContextUpdates) => Promise<EpisodeIssue>;
    runEpisodePipeline?: typeof runEpisodePipeline;
    loadEpisodeIssue?: (issueNumber: number) => Promise<EpisodeIssue>;
    auditEpisode?: typeof auditEpisode;
    advanceEpisodeAfterMerge?: typeof advanceEpisodeAfterMerge;
    blockEpisode?: typeof blockEpisode;
    loadOpenPullRequestFeedback?: (input: { repo: string }) => Promise<PendingPullRequestFeedback[]>;
    loadFeatureIntakeContext?: () => Promise<Omit<FeatureIntakeInput, "request">>;
  } = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (![
    "create-episode",
    "create-episode-from-date",
    "pickup-episode",
    "audit-episode",
    "advance-after-merge",
    "block-episode",
    "pickup-project-issue",
    "complete-project-issue",
    "triage-feature"
  ].includes(command)) {
    return null;
  }

  const workingDirectory = dependencies.repoRoot ?? process.cwd();
  const repoRoot = await (dependencies.resolveWorkspaceRoot ??
    (() => resolveWorkspaceRepoRoot({ repoRoot: workingDirectory })))();
  const logger = dependencies.logger ?? createLogger("pm-agent");
  const dryRun = options["dry-run"] === true;
  const issueNumber =
    typeof options["issue-number"] === "string" ? Number(options["issue-number"]) : undefined;
  const limit = parseLimitOption(options.limit);
  const repo =
    typeof options.repo === "string"
      ? options.repo
      : await (dependencies.resolveRepo ?? (() => resolveGitHubRepoSlug({ repoRoot })))();

  if (command === "triage-feature") {
    if (typeof options.request !== "string") {
      throw new Error("The triage-feature command requires --request.");
    }

    const context = await (dependencies.loadFeatureIntakeContext ??
      (() => loadFeatureIntakeContext({ repo, repoRoot })))();
    const decision = triageFeatureRequest({
      request: options.request,
      ...context
    });

    logger.info("Triaged feature request", {
      repo,
      action: decision.action,
      workflow: "workflow" in decision ? decision.workflow : undefined
    });

    return decision;
  }

  if (["audit-episode", "advance-after-merge", "block-episode"].includes(command)) {
    if (typeof issueNumber !== "number" || Number.isNaN(issueNumber)) {
      if (command === "advance-after-merge") {
        const issues = selectEpisodeIssuesForScheduledAdvance(
          await (dependencies.loadEpisodeIssues ?? (() => loadReadyEpisodeIssues({ repo })))(),
          { limit }
        );
        const feedback = await (dependencies.loadOpenPullRequestFeedback ?? loadOpenPullRequestFeedback)({
          repo
        });

        if (feedback.length > 0) {
          logger.warn("Open pull request feedback requires review", {
            repo,
            feedbackCount: feedback.length,
            firstPullRequestNumber: feedback[0]?.pullRequestNumber
          });
        }

        if (issues.length === 0) {
          if (feedback.length > 0) {
            return {
              status: "pending_pr_feedback" as const,
              reason: "Open pull request feedback requires review before the scheduler can report no work.",
              feedback
            };
          }

          return {
            status: "noop" as const,
            reason: "No episode issue was eligible for advance-after-merge."
          };
        }

        const results = [];
        for (const issue of issues) {
          const result = await (dependencies.advanceEpisodeAfterMerge ?? advanceEpisodeAfterMerge)({
            repo,
            repoRoot,
            issue
          });

          logger.info("Advanced episode issue after merge", {
            repo,
            issueNumber: issue.issueNumber,
            currentStage: result.currentStage,
            activeAgentLabel: result.activeAgentLabel,
            limit
          });
          results.push(result);
        }

        return {
          status: "completed" as const,
          results,
          ...(feedback.length > 0 ? { feedback } : {})
        };
      }

      throw new Error(`The ${command} command requires --issue-number.`);
    }

    const loadIssue =
      dependencies.loadEpisodeIssue ??
      ((nextIssueNumber: number) => loadEpisodeIssueFromGitHub({ repo, issueNumber: nextIssueNumber }));

    if (command === "audit-episode") {
      const result = await (dependencies.auditEpisode ?? auditEpisode)({
        repoRoot,
        issue: await loadIssue(issueNumber)
      });

      logger.info("Audited episode issue", {
        repo,
        issueNumber,
        currentStage: result.currentStage,
        activeAgentLabel: result.activeAgentLabel
      });

      return result;
    }

    if (command === "advance-after-merge") {
      const result = await (dependencies.advanceEpisodeAfterMerge ?? advanceEpisodeAfterMerge)({
        repo,
        repoRoot,
        issue: await loadIssue(issueNumber)
      });

      logger.info("Advanced episode issue after merge", {
        repo,
        issueNumber,
        currentStage: result.currentStage,
        activeAgentLabel: result.activeAgentLabel,
        limit: 1
      });

      return result;
    }

    if (typeof options.reason !== "string") {
      throw new Error("The block-episode command requires --reason.");
    }

    const result = await (dependencies.blockEpisode ?? blockEpisode)({
      repo,
      issue: await loadIssue(issueNumber),
      reason: options.reason
    });

    logger.info("Blocked episode issue", {
      repo,
      issueNumber,
      reason: options.reason
    });

    return result;
  }

  if (command === "create-episode-from-date") {
    const date = typeof options.date === "string" ? options.date : undefined;

    if (!date) {
      throw new Error("The create-episode-from-date command requires --date.");
    }

    const result = await (dependencies.createEpisodeIssueFromDate ?? createEpisodeIssueFromDate)({
      repo,
      repoRoot,
      input: {
        date
      }
    });

    logger.info("Created episode issue from date", {
      repo,
      date,
      issueNumber: result.issueNumber,
      issueUrl: result.url
    });

    return result;
  }

  if (command === "create-episode") {
    if (typeof options.date !== "string") {
      throw new Error("The create-episode command requires --date.");
    }

    const issue = await (dependencies.createEpisodeIssue ??
      ((draft) => createEpisodeIssue(draft, { repo })))(
      buildEpisodeIssueDraft({
        date: options.date,
        workingTitle: typeof options["working-title"] === "string" ? options["working-title"] : undefined
      })
    );

    logger.info("Created episode issue", {
      repo,
      issueNumber: issue.issueNumber,
      title: issue.title
    });

    return issue;
  }

  if (command === "pickup-episode") {
    const issues = await (dependencies.loadEpisodeIssues ?? (() => loadReadyEpisodeIssues({ repo })))();
    const issue = selectEpisodeIssueForPickup(issues, { issueNumber });
    const result = await (dependencies.runEpisodePipeline ?? runEpisodePipeline)(
      { issue },
      {
        repo,
        updateEpisodeIssueContext:
          dependencies.updateEpisodeIssueContext ??
          ((nextIssue, updates) => updateEpisodeIssueContextOnGitHub(nextIssue, updates, { repo }))
      }
    );

    logger.info("Picked up episode issue", {
      repo,
      issueNumber: issue.issueNumber,
      runDir: result.runDir,
      finalStage: result.finalStage
    });

    return result;
  }

  if (command === "complete-project-issue") {
    if (typeof issueNumber !== "number" || Number.isNaN(issueNumber)) {
      throw new Error("The complete-project-issue command requires --issue-number.");
    }

    const result = await (dependencies.completeProjectIssue ?? completeProjectIssue)({
      repoRoot,
      repo,
      issueNumber,
      loadIssues: dependencies.loadIssues ?? (() => loadReadyProjectIssues({ repo }))
    });

    logger.info("Completed project issue workflow", {
      repo,
      issueNumber: result.issue.number,
      branchName: result.branchName,
      worktreePath: result.worktreePath,
      manifestPath: result.manifestPath,
      prUrl: result.prUrl
    });

    return result;
  }

  const result = await runProjectIssuePickup({
    repoRoot,
    issueNumber,
    loadIssues: dependencies.loadIssues ?? (() => loadReadyProjectIssues({ repo })),
    prepareWorkspace:
      dependencies.prepareWorkspace ??
      ((plan) =>
        prepareProjectWorkspace(plan, {
          dryRun
        }))
  });

  logger.info("Prepared project issue pickup", {
    repo,
    dryRun,
    issueNumber: result.issue.number,
    branchName: result.branchName,
    worktreePath: result.worktreePath,
    manifestPath: result.manifestPath
  });

  return result;
}

function selectEpisodeIssuesForScheduledAdvance(
  issues: EpisodeIssue[],
  options: { limit: number }
) {
  return [...issues]
    .filter((issue) => {
      const labels = new Set(issue.labels.map(normalizeLabelForScheduler));
      if (labels.has("status:blocked")) return false;

      return (
        (labels.has("agent:research") &&
          (labels.has("status:researching") || labels.has("claim:research-agent"))) ||
        (labels.has("agent:writer") && labels.has("status:writing")) ||
        (labels.has("agent:producer") && labels.has("status:producing"))
      );
    })
    .sort((left, right) => left.issueNumber - right.issueNumber)
    .slice(0, options.limit);
}

function parseLimitOption(value: string | boolean | undefined) {
  if (value === undefined || value === false) return 1;
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  return limit;
}

function normalizeLabelForScheduler(label: string) {
  return label.trim().toLowerCase().replace(/\s*:\s*/g, ":");
}

export async function loadOpenPullRequestFeedback(input: {
  repo: string;
  execFile?: (file: string, args: string[]) => Promise<string>;
}): Promise<PendingPullRequestFeedback[]> {
  const output = await (input.execFile ?? execFileText)("gh", [
    "pr",
    "list",
    "--repo",
    input.repo,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,url,comments"
  ]);
  const pullRequests = JSON.parse(output) as Array<{
    number: number;
    title: string;
    url: string;
    comments?: Array<{
      author?: { login?: string };
      body?: string;
      createdAt?: string;
      url?: string;
    }>;
  }>;

  return pullRequests.flatMap((pullRequest) => pendingFeedbackForPullRequest(pullRequest));
}

function pendingFeedbackForPullRequest(pullRequest: {
  number: number;
  title: string;
  url: string;
  comments?: Array<{
    author?: { login?: string };
    body?: string;
    createdAt?: string;
    url?: string;
  }>;
}): PendingPullRequestFeedback[] {
  const comments = [...(pullRequest.comments ?? [])].sort((left, right) =>
    String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? ""))
  );
  let lastAddressedIndex = -1;

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    if (isFeedbackAddressedComment(comments[index]?.body ?? "")) {
      lastAddressedIndex = index;
      break;
    }
  }

  return comments
    .slice(lastAddressedIndex + 1)
    .filter((comment) => !isFeedbackAddressedComment(comment.body ?? ""))
    .filter((comment) => Boolean(comment.body?.trim()) && Boolean(comment.url) && Boolean(comment.createdAt))
    .map((comment) => ({
      pullRequestNumber: pullRequest.number,
      pullRequestTitle: pullRequest.title,
      pullRequestUrl: pullRequest.url,
      commentUrl: comment.url!,
      author: comment.author?.login ?? "unknown",
      body: comment.body!.trim(),
      createdAt: comment.createdAt!
    }));
}

function isFeedbackAddressedComment(body: string) {
  return /pm-agent:feedback-addressed|read and addressed|feedback addressed/i.test(body);
}

async function execFileText(file: string, args: string[]) {
  const result = await execFileAsync(file, args, {
    encoding: "utf8"
  });
  return result.stdout.trim();
}

export async function auditEpisode(input: { repoRoot: string; issue: EpisodeIssue }) {
  const fields = parseEpisodeIssueFields(input.issue.body);
  const request = resolveEpisodeRequest(input.issue);
  const outputRunPath = fields.output_run_path || path.join("runs", request.episodeSlug);

  return {
    issueNumber: input.issue.issueNumber,
    title: input.issue.title,
    currentStage: request.currentStage,
    activeAgentLabel: activeAgentLabel(input.issue),
    outputRunPath,
    runDir: path.join(input.repoRoot, outputRunPath)
  };
}

export async function advanceEpisodeAfterMerge(input: {
  repo: string;
  repoRoot: string;
  issue: EpisodeIssue;
}, dependencies: {
  updateEpisodeIssueStage?: (
    issue: EpisodeIssue,
    updates: EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }
  ) => Promise<EpisodeIssue>;
  commentOnIssue?: (input: { issueNumber: number; body: string }) => Promise<void>;
} = {}) {
  const audit = await auditEpisode({ repoRoot: input.repoRoot, issue: input.issue });
  const updateEpisodeIssueStage =
    dependencies.updateEpisodeIssueStage ??
    ((issue: EpisodeIssue, updates: EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }) =>
      updateEpisodeIssueStageOnGitHub(issue, updates, { repo: input.repo }));
  const commentOnIssue =
    dependencies.commentOnIssue ??
    ((comment: { issueNumber: number; body: string }) =>
      commentOnEpisodeIssue({
        repo: input.repo,
        issueNumber: comment.issueNumber,
        body: comment.body
      }));

  if (audit.activeAgentLabel === "agent:research") {
    const updates = {
      currentStage: "writing" as const,
      outputRunPath: audit.outputRunPath,
      nextAgentLabel: "agent:writer" as const
    };

    await runPmGate(
      {
        issue: input.issue,
        gateName: "research artifacts",
        nextStatusLabel: "status:writing",
        nextAgentLabel: "agent:writer",
        validate: () => assertResearchPackageArtifacts(audit.runDir),
        update: () => updateEpisodeIssueStage(input.issue, updates),
        commentOnIssue
      }
    );

    return {
      issueNumber: input.issue.issueNumber,
      currentStage: "writing" as const,
      activeAgentLabel: "agent:writer" as const
    };
  }

  if (audit.activeAgentLabel === "agent:writer") {
    const updates = {
      currentStage: "producing" as const,
      outputRunPath: audit.outputRunPath,
      nextAgentLabel: "agent:producer" as const
    };

    await runPmGate(
      {
        issue: input.issue,
        gateName: "writer artifacts",
        nextStatusLabel: "status:producing",
        nextAgentLabel: "agent:producer",
        validate: async () => {
          const transcript = await assertWriterTranscriptArtifact(audit.runDir);
          await assertWriterTranscriptQuality(audit.runDir, transcript);
        },
        update: () => updateEpisodeIssueStage(input.issue, updates),
        commentOnIssue
      }
    );

    return {
      issueNumber: input.issue.issueNumber,
      currentStage: "producing" as const,
      activeAgentLabel: "agent:producer" as const
    };
  }

  if (audit.activeAgentLabel === "agent:producer") {
    const updates = {
      currentStage: "review" as const,
      outputRunPath: audit.outputRunPath
    };

    await runPmGate(
      {
        issue: input.issue,
        gateName: "producer audio",
        nextStatusLabel: "status:review",
        failureStatusLabel: "status:blocked",
        validate: () =>
          assertReviewableEpisodeAudio({
            audioPath: path.join(audit.runDir, "audio", "final.mp3"),
            metadataPath: path.join(audit.runDir, "audio", "render-metadata.json")
          }),
        update: () => updateEpisodeIssueStage(input.issue, updates),
        updateFailure: () =>
          updateEpisodeIssueStage(input.issue, {
            currentStage: "blocked",
            outputRunPath: audit.outputRunPath,
            nextAgentLabel: "agent:producer"
          }),
        commentOnIssue
      }
    );

    return {
      issueNumber: input.issue.issueNumber,
      currentStage: "review" as const,
      activeAgentLabel: undefined
    };
  }

  throw new Error(`Issue #${input.issue.issueNumber} has no active episode agent label to advance.`);
}

async function runPmGate(input: {
  issue: EpisodeIssue;
  gateName: string;
  nextStatusLabel: string;
  nextAgentLabel?: EpisodeAgentLabel;
  failureStatusLabel?: string;
  validate: () => Promise<unknown>;
  update: () => Promise<EpisodeIssue>;
  updateFailure?: () => Promise<EpisodeIssue>;
  commentOnIssue: (input: { issueNumber: number; body: string }) => Promise<void>;
}) {
  try {
    await input.validate();
  } catch (error) {
    if (input.updateFailure) {
      await input.updateFailure();
    }

    await input.commentOnIssue({
      issueNumber: input.issue.issueNumber,
      body: buildPmGateFailedComment({
        gateName: input.gateName,
        reason: error instanceof Error ? error.message : String(error),
        nextStatusLabel: input.failureStatusLabel
      })
    });
    throw error;
  }

  const issue = await input.update();

  await input.commentOnIssue({
    issueNumber: input.issue.issueNumber,
    body: buildPmGatePassedComment({
      gateName: input.gateName,
      nextStatusLabel: input.nextStatusLabel,
      nextAgentLabel: input.nextAgentLabel
    })
  });

  return issue;
}

function buildPmGatePassedComment(input: {
  gateName: string;
  nextStatusLabel: string;
  nextAgentLabel?: EpisodeAgentLabel;
}) {
  return [
    "## PM gate passed",
    "",
    `Gate: ${input.gateName}`,
    `Next status: ${input.nextStatusLabel}`,
    ...(input.nextAgentLabel ? [`Next agent: ${input.nextAgentLabel}`] : [])
  ].join("\n");
}

function buildPmGateFailedComment(input: {
  gateName: string;
  reason: string;
  nextStatusLabel?: string;
}) {
  return [
    "## PM gate failed",
    "",
    `Gate: ${input.gateName}`,
    `Reason: ${input.reason}`,
    ...(input.nextStatusLabel ? [`Next status: ${input.nextStatusLabel}`] : []),
    "Next action: fix the missing or invalid merged artifact, then rerun PM advance-after-merge."
  ].join("\n");
}

export async function blockEpisode(input: {
  repo: string;
  issue: EpisodeIssue;
  reason: string;
}) {
  const issue = await updateEpisodeIssueStageOnGitHub(
    input.issue,
    {
      currentStage: "blocked"
    },
    { repo: input.repo }
  );
  await commentOnEpisodeIssue({
    repo: input.repo,
    issueNumber: input.issue.issueNumber,
    body: `## PM blocked episode\n\nReason: ${input.reason}`
  });

  return {
    issueNumber: issue.issueNumber,
    currentStage: "blocked" as const,
    reason: input.reason
  };
}

function activeAgentLabel(issue: EpisodeIssue) {
  return issue.labels.find((label) => /^agent:(research|writer|producer)$/i.test(label));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runPmAgentCli(process.argv);
}

async function loadFeatureIntakeContext(input: { repo: string; repoRoot: string }): Promise<Omit<FeatureIntakeInput, "request">> {
  const [{ execFile }] = await Promise.all([import("node:child_process")]);
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const [issuesOutput, pullRequestsOutput, trackedFilesOutput] = await Promise.all([
    execFileAsync("gh", [
      "issue",
      "list",
      "--repo",
      input.repo,
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title"
    ]).then((result) => result.stdout),
    execFileAsync("gh", [
      "pr",
      "list",
      "--repo",
      input.repo,
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title"
    ]).then((result) => result.stdout),
    execFileAsync("git", ["ls-files"], { cwd: input.repoRoot }).then((result) => result.stdout)
  ]);

  return {
    existingIssues: JSON.parse(issuesOutput) as Array<{ number: number; title: string }>,
    existingPullRequests: JSON.parse(pullRequestsOutput) as Array<{ number: number; title: string }>,
    mainBranchSignals: trackedFilesOutput
      .split("\n")
      .filter(Boolean)
      .map((filePath) => ({
        path: filePath,
        summary: filePath
      }))
  };
}
