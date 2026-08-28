import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runResearchAgent } from "../research-agent";
import { evaluateTranscriptQuality, runWriterAgent } from "../writer-agent";
import { runProducerAgent } from "../producer-agent";
import {
  buildEpisodeIssueDraft,
  createEpisodeIssue,
  createEpisodeIssueFromDate,
  loadReadyEpisodeIssues,
  resolveEpisodeRequest,
  selectEpisodeIssueForPickup,
  updateEpisodeIssueContextOnGitHub,
  uploadResearchPackageToGitHubIssue,
  type EpisodeIssue,
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
import { transcriptSchema, type Transcript } from "../../src/contracts";

export { resolveEpisodeRequest, createRunManifest };

type ProducerResult = Awaited<ReturnType<typeof runProducerAgent>>;
type WriterAgent = (dossier: Awaited<ReturnType<typeof runResearchAgent>>, options?: { runDir?: string }) => Promise<Transcript>;
type ProducerAgent = typeof runProducerAgent;

export async function assertWriterTranscriptArtifact(runDir: string) {
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
  uploadResearchPackage?: (input: { issue: EpisodeIssue; runDir: string }) => Promise<void>;
  runWriterAgent?: WriterAgent;
  runProducerAgent?: ProducerAgent;
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
  let currentIssue = await updateEpisodeIssueContext(issue, {
    currentStage: "researching",
    outputRunPath
  });
  const dossier = await runResearchAgent({ ...request, currentStage: "researching" }, { runDir });
  await (dependencies.uploadResearchPackage ??
    ((input) =>
      dependencies.repo
        ? uploadResearchPackageToGitHubIssue({ ...input, repo: dependencies.repo }).then(() => undefined)
        : Promise.resolve()))({ issue: currentIssue, runDir });
  currentIssue = await updateEpisodeIssueContext(currentIssue, {
    currentStage: "writing",
    outputRunPath
  });
  const transcript = await (dependencies.runWriterAgent ?? runWriterAgent)(dossier, { runDir });
  const transcriptArtifact = await assertWriterTranscriptArtifact(runDir);
  await assertWriterTranscriptQuality(runDir, transcriptArtifact);
  const producerResult = await (dependencies.runProducerAgent ?? runProducerAgent)(transcriptArtifact, `${runDir}/audio`);
  await assertReviewableEpisodeAudio(producerResult);
  currentIssue = await updateEpisodeIssueContext(currentIssue, {
    currentStage: "review",
    outputRunPath
  });

  return {
    issueNumber: currentIssue.issueNumber,
    runDir,
    finalStage: "review" as const
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
    loadFeatureIntakeContext?: () => Promise<Omit<FeatureIntakeInput, "request">>;
  } = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (![
    "create-episode",
    "create-episode-from-date",
    "pickup-episode",
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
      issueType: "issueType" in decision ? decision.issueType : undefined
    });

    return decision;
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
