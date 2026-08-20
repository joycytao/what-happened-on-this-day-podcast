import path from "node:path";
import { pathToFileURL } from "node:url";
import { runResearchAgent } from "../research-agent";
import { runWriterAgent } from "../writer-agent";
import { runProducerAgent } from "../producer-agent";
import { resolveEpisodeRequest } from "./github-issue";
import {
  completeProjectIssue,
  loadReadyProjectIssues,
  prepareProjectWorkspace,
  resolveGitHubRepoSlug,
  resolveWorkspaceRepoRoot,
  runProjectIssuePickup,
  type ProjectQueueIssue
} from "./project-pickup";
import { createRunManifest } from "./run-manifest";
import { parseCliArgs } from "../../src/lib/cli";
import { createLogger } from "../../src/lib/logger";

export { resolveEpisodeRequest, createRunManifest };

export async function runEpisodePipeline(input: {
  issueNumber?: number;
  brief?: { date: string; workingTitle: string };
}) {
  const date = input.brief?.date ?? "2026-08-19";
  const workingTitle = input.brief?.workingTitle ?? "daily episode";
  const episodeSlug = `${date}-${workingTitle.toLowerCase().replace(/\s+/g, "-")}`;

  const request = {
    date,
    episodeSlug,
    language: "en" as const,
    audience: "children-first-adult-friendly" as const,
    durationTargetMin: 12,
    durationMaxMin: 15 as const,
    currentStage: "ready" as const
  };

  const { runDir } = await createRunManifest(request);
  const dossier = await runResearchAgent({ ...request, currentStage: "researching" });
  const transcript = await runWriterAgent(dossier);
  await runProducerAgent(transcript, `${runDir}/audio`);

  return {
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
    prepareWorkspace?: Parameters<typeof runProjectIssuePickup>[0]["prepareWorkspace"];
    completeProjectIssue?: typeof completeProjectIssue;
  } = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (!["pickup-project-issue", "complete-project-issue"].includes(command)) {
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
