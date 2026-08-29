import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { EpisodeRequest } from "../../src/contracts";
import { researchDossierSchema, researchReferencesSchema, type ResearchDossier } from "../../src/contracts";
import { parseCliArgs } from "../../src/lib/cli";
import {
  claimIssueForAgent,
  loadOpenIssueQueueIssues,
  selectIssueForAgent,
  type IssueQueueIssue
} from "../issue-queue";
import {
  commentOnEpisodeIssue,
  loadEpisodeIssueFromGitHub,
  parseEpisodeIssueFields,
  resolveEpisodeRequest,
  type EpisodeIssue
} from "../pm-agent/github-issue";
import { selectBestCandidate } from "./select-candidate";

const execFileAsync = promisify(execFileCallback);

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

type ResearchPickupResult =
  | {
      status: "completed";
      issue: IssueQueueIssue;
      runDir: string;
      prUrl: string;
      artifactPaths: string[];
    }
  | {
      status: "noop";
      reason: string;
    };

export async function runResearchAgent(request: EpisodeRequest, options: { runDir?: string } = {}) {
  const candidate = selectBestCandidate([
    {
      subject: "The launch of Windows 95",
      entityType: "event" as const,
      angle: "How a software launch helped make personal computers feel easier for everyday families",
      thesis: "A computer interface can change how people learn, work, and explore at home.",
      timeline: [
        "August 24, 1995: Microsoft launches Windows 95",
        "1995: Windows 95 introduces the Start button, taskbar, desktop shortcuts, and plug and play support",
        "First five weeks after launch: Microsoft reports 7 million copies sold"
      ],
      storyBeats: [
        "Families and computer stores wait for a midnight software launch",
        "A new Start button and taskbar make computers feel more approachable",
        "The launch shows how software can change daily habits"
      ],
      modernRelevance: "Modern phones, tablets, and laptops still depend on interface choices that help people find apps, files, and settings.",
      sources: [
        {
          title: "Microsoft Stories: Launch of Windows 95",
          url: "https://news.microsoft.com/announcement/launch-of-windows-95/",
          sourceType: "official" as const
        },
        {
          title: "Computer History Museum: August 24, Microsoft Ships Windows 95",
          url: "https://www.computerhistory.org/tdih/august/24/",
          sourceType: "archive" as const
        }
      ],
      safetyNotes: []
    }
  ]);

  const dossier = researchDossierSchema.parse({
    episodeDate: request.date,
    chosenSubject: candidate.subject,
    entityType: candidate.entityType,
    chosenAngle: candidate.angle,
    episodeThesis: candidate.thesis,
    timeline: candidate.timeline,
    storyBeats: candidate.storyBeats,
    modernRelevance: candidate.modernRelevance,
    sources: candidate.sources,
    safetyNotes: candidate.safetyNotes
  });

  if (options.runDir) {
    await persistResearchArtifacts(dossier, options.runDir);
  }

  return dossier;
}

export async function runResearchAgentPickup(input: {
  repo: string;
  repoRoot: string;
  issueNumber?: number;
  loadIssues?: () => Promise<IssueQueueIssue[]>;
  loadIssue?: (issueNumber: number) => Promise<EpisodeIssue>;
  execFile?: ExecFileFn;
  openPullRequest?: (input: {
    issue: IssueQueueIssue;
    runDir: string;
    repo: string;
    repoRoot: string;
  }) => Promise<string>;
  commentOnIssue?: (input: { issueNumber: number; body: string }) => Promise<void>;
}): Promise<ResearchPickupResult> {
  const issues = await (input.loadIssues ??
    (() => loadOpenIssueQueueIssues({ repo: input.repo, execFile: input.execFile })))();
  const issue = selectResearchIssue(issues, input.issueNumber);

  if (!issue) {
    return {
      status: "noop",
      reason: "No issue was found for agent:research."
    };
  }

  const execFile = input.execFile ?? execFileText;
  const loadIssue =
    input.loadIssue ??
    ((issueNumber: number) =>
      loadEpisodeIssueFromGitHub({ repo: input.repo, issueNumber, execFile }));

  const claimedIssue = await claimIssueForAgent({
    repo: input.repo,
    issue,
    role: "research",
    execFile,
    reloadIssue: async () => episodeIssueToQueueIssue(await loadIssue(issue.number))
  });
  const episodeIssue = await loadIssue(claimedIssue.number);
  const request = resolveEpisodeRequest(episodeIssue);
  const fields = parseEpisodeIssueFields(episodeIssue.body);
  const runDir = path.join(input.repoRoot, fields.output_run_path || path.join("runs", request.episodeSlug));

  await runResearchAgent(request, { runDir });

  const artifactPaths = [
    path.join(runDir, "research-dossier.json"),
    path.join(runDir, "references", "research-references.json"),
    path.join(runDir, "references", "README.md")
  ];
  const prUrl = await (input.openPullRequest ?? openResearchPullRequest)({
    issue,
    runDir,
    repo: input.repo,
    repoRoot: input.repoRoot
  });

  await (input.commentOnIssue ?? defaultCommentOnIssue(input.repo))({
    issueNumber: issue.number,
    body: buildResearchPickupComment({
      prUrl,
      runDir,
      artifactPaths
    })
  });

  return {
    status: "completed",
    issue,
    runDir,
    prUrl,
    artifactPaths
  };
}

export async function runResearchAgentCli(
  argv: string[],
  dependencies: Partial<Parameters<typeof runResearchAgentPickup>[0]> = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (command !== "pickup") {
    return null;
  }

  if (typeof options.repo !== "string") {
    throw new Error("The pickup command requires --repo.");
  }

  return runResearchAgentPickup({
    ...dependencies,
    repo: options.repo,
    repoRoot: dependencies.repoRoot ?? process.cwd(),
    issueNumber: typeof options["issue-number"] === "string" ? Number(options["issue-number"]) : undefined,
  });
}

async function persistResearchArtifacts(dossier: ResearchDossier, runDir: string) {
  const referencesDir = path.join(runDir, "references");
  const references = buildResearchReferences(dossier);

  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "research-dossier.json"), `${JSON.stringify(dossier, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(referencesDir, "research-references.json"),
    `${JSON.stringify(references, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(referencesDir, "README.md"), buildReferenceReadme(references), "utf8");
}

function buildResearchReferences(dossier: ResearchDossier) {
  return researchReferencesSchema.parse({
    episodeDate: dossier.episodeDate,
    chosenSubject: dossier.chosenSubject,
    items: dossier.sources.map((source: ResearchDossier["sources"][number], index: number) => ({
      id: `ref-${index + 1}`,
      summary: buildSourceBackedSummary(dossier, source.title, source.url),
      source
    }))
  });
}

function buildSourceBackedSummary(dossier: ResearchDossier, sourceTitle: string, sourceUrl: string) {
  if (sourceTitle === "Microsoft Stories: Launch of Windows 95") {
    return [
      `${sourceTitle} (${sourceUrl}) states that Windows 95 launched on August 24, 1995.`,
      "The source says the launch included midnight store openings and lines of customers worldwide.",
      "It also describes user-facing features such as the Start button, taskbar, Recycle Bin, desktop shortcuts, long file names, and plug and play support.",
      "Microsoft reports in this source that Windows 95 sold 7 million copies in its first five weeks."
    ].join(" ");
  }

  if (sourceTitle === "Computer History Museum: August 24, Microsoft Ships Windows 95") {
    return [
      `${sourceTitle} (${sourceUrl}) identifies August 24, 1995 as the date Microsoft shipped Windows 95.`,
      "The source describes the launch campaign as unusually large for computing history and says sales exceeded predictions.",
      "It connects the Windows 95 launch to the broader history of personal computing."
    ].join(" ");
  }

  return [
    `${sourceTitle} (${sourceUrl}) is cited for the research dossier on ${dossier.chosenSubject}.`,
    `The reference supports the selected angle: ${dossier.chosenAngle}.`,
    `Facts from this source must be checked against the source before they are used in narration.`
  ].join(" ");
}

function buildReferenceReadme(references: ReturnType<typeof buildResearchReferences>) {
  return `${[
    "# Research references",
    "",
    `Episode date: ${references.episodeDate}`,
    `Chosen subject: ${references.chosenSubject}`,
    "",
    ...references.items.flatMap((item: ReturnType<typeof buildResearchReferences>["items"][number]) => [
      `## ${item.id}`,
      "",
      item.summary,
      "",
      `Source: ${item.source.title}`,
      `URL: ${item.source.url}`,
      `Source type: ${item.source.sourceType}`,
      ""
    ])
  ].join("\n").trim()}\n`;
}

function selectResearchIssue(issues: IssueQueueIssue[], issueNumber?: number) {
  try {
    return selectIssueForAgent(issues, {
      role: "research",
      allowedStatuses: ["status:ready", "status:researching"],
      issueNumber
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No issue was found for agent:research")) {
      return undefined;
    }

    throw error;
  }
}

function episodeIssueToQueueIssue(issue: EpisodeIssue): IssueQueueIssue {
  return {
    number: issue.issueNumber,
    title: issue.title,
    state: issue.state ?? "OPEN",
    labels: issue.labels
  };
}

async function openResearchPullRequest(input: {
  issue: IssueQueueIssue;
  runDir: string;
  repo: string;
  repoRoot: string;
}) {
  const headRef = (await execFileText("git", ["branch", "--show-current"], { cwd: input.repoRoot })).trim();

  await execFileText("git", ["add", path.relative(input.repoRoot, input.runDir)], { cwd: input.repoRoot });
  await execFileText("git", ["commit", "-m", `research: add artifacts for issue ${input.issue.number}`], {
    cwd: input.repoRoot
  });
  await execFileText("git", ["push", "-u", "origin", headRef], { cwd: input.repoRoot });

  return execFileText(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      input.repo,
      "--base",
      "main",
      "--head",
      headRef,
      "--title",
      `Issue #${input.issue.number}: add research artifacts`,
      "--body",
      buildResearchPullRequestBody(input.issue)
    ],
    { cwd: input.repoRoot }
  );
}

function buildResearchPullRequestBody(issue: IssueQueueIssue) {
  return [
    "## Summary",
    `- add research artifacts for issue #${issue.number}`,
    "- include sourced dossier and references package",
    "",
    `Refs #${issue.number}`
  ].join("\n");
}

function buildResearchPickupComment(input: {
  prUrl: string;
  runDir: string;
  artifactPaths: string[];
}) {
  return [
    "## Research-agent pickup complete",
    "",
    `PR: ${input.prUrl.trim()}`,
    `Run directory: \`${input.runDir}\``,
    "",
    "Artifacts:",
    ...input.artifactPaths.map((artifactPath: string) => `- \`${artifactPath}\``)
  ].join("\n");
}

function defaultCommentOnIssue(repo: string) {
  return async (input: { issueNumber: number; body: string }) => {
    await commentOnEpisodeIssue({
      repo,
      issueNumber: input.issueNumber,
      body: input.body
    });
  };
}

async function execFileText(file: string, args: string[], options?: { cwd?: string }) {
  const { stdout } = await execFileAsync(file, args, {
    cwd: options?.cwd,
    encoding: "utf8"
  });

  return stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runResearchAgentCli(process.argv);
}
