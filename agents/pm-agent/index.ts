import path from "node:path";
import { pathToFileURL } from "node:url";
import { runResearchAgent } from "../research-agent";
import { runWriterAgent } from "../writer-agent";
import { runProducerAgent } from "../producer-agent";
import {
  buildEpisodeIssueDraft,
  createEpisodeIssue,
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

export { resolveEpisodeRequest, createRunManifest };

export async function runEpisodePipeline(input: {
  issueNumber?: number;
  issue?: EpisodeIssue;
  brief?: { date: string; workingTitle: string };
}, dependencies: {
  createEpisodeIssue?: (draft: EpisodeIssueDraft) => Promise<EpisodeIssue>;
  updateEpisodeIssueContext?: (issue: EpisodeIssue, updates: EpisodeIssueContextUpdates) => Promise<EpisodeIssue>;
  uploadResearchPackage?: (input: { issue: EpisodeIssue; runDir: string }) => Promise<void>;
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
  const transcript = await runWriterAgent(dossier);
  await runProducerAgent(transcript, `${runDir}/audio`);
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
    updateEpisodeIssueContext?: (issue: EpisodeIssue, updates: EpisodeIssueContextUpdates) => Promise<EpisodeIssue>;
    runEpisodePipeline?: typeof runEpisodePipeline;
    loadFeatureIntakeContext?: () => Promise<Omit<FeatureIntakeInput, "request">>;
  } = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (!["create-episode", "pickup-episode", "pickup-project-issue", "complete-project-issue", "triage-feature"].includes(command)) {
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
