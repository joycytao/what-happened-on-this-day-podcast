import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { ResearchDossier } from "../../src/contracts";
import { researchDossierSchema, serializeTranscriptMarkdown } from "../../src/contracts";
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
import { recordAgentFailure } from "../failure-routing.js";
import { buildTranscript } from "./build-transcript";
import type { Transcript } from "../../src/contracts";

const execFileAsync = promisify(execFileCallback);

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

type WriterPickupResult =
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

export type TranscriptQualityCheck = {
  status: "pass" | "fail";
  actual: number | boolean;
  expected: string;
};

export type TranscriptQualityReport = {
  status: "pass" | "fail";
  checks: Record<string, TranscriptQualityCheck>;
};

export async function runWriterAgent(dossier: ResearchDossier, options: { runDir?: string } = {}) {
  const transcript = buildTranscript(dossier);

  if (options.runDir) {
    await writeTranscriptMarkdownArtifact(transcript, options.runDir);
    await writeTranscriptArtifact(transcript, options.runDir);
    await writeTranscriptQualityReport(transcript, options.runDir);
  }

  return transcript;
}

export async function runWriterAgentFromRunDir(runDir: string) {
  const dossierPath = path.join(runDir, "research-dossier.json");
  const dossier = researchDossierSchema.parse(JSON.parse(await fs.readFile(dossierPath, "utf8")));

  return runWriterAgent(dossier, { runDir });
}

export async function runWriterAgentPickup(input: {
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
}): Promise<WriterPickupResult> {
  const issues = await (input.loadIssues ??
    (() => loadOpenIssueQueueIssues({ repo: input.repo, execFile: input.execFile })))();
  const issue = selectWriterIssue(issues, input.issueNumber);

  if (!issue) {
    return {
      status: "noop",
      reason: "No issue was found for agent:writer."
    };
  }

  const execFile = input.execFile ?? execFileText;
  const loadIssue =
    input.loadIssue ??
    ((issueNumber: number) =>
      loadEpisodeIssueFromGitHub({ repo: input.repo, issueNumber, execFile }));
  const episodeIssue = await loadIssue(issue.number);
  const request = resolveEpisodeRequest(episodeIssue);
  const fields = parseEpisodeIssueFields(episodeIssue.body);
  const runDir = path.join(input.repoRoot, fields.output_run_path || path.join("runs", request.episodeSlug));

  await assertResearchDossierArtifact(runDir);

  const claimedIssue = await claimIssueForAgent({
    repo: input.repo,
    issue,
    role: "writer",
    execFile,
    reloadIssue: async () => episodeIssueToQueueIssue(await loadIssue(issue.number))
  });

  try {
    await runWriterAgentFromRunDir(runDir);

    const artifactPaths = [
      path.join(runDir, "transcript.md"),
      path.join(runDir, "transcript.json"),
      path.join(runDir, "transcript-quality-report.json")
    ];
    const qualityReport = JSON.parse(await fs.readFile(path.join(runDir, "transcript-quality-report.json"), "utf8")) as {
      status?: string;
    };
    const prUrl = await (input.openPullRequest ?? openWriterPullRequest)({
      issue,
      runDir,
      repo: input.repo,
      repoRoot: input.repoRoot
    });

    await (input.commentOnIssue ?? defaultCommentOnIssue(input.repo))({
      issueNumber: issue.number,
      body: buildWriterPickupComment({
        prUrl,
        runDir,
        qualityStatus: qualityReport.status ?? "unknown",
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
  } catch (error) {
    await recordAgentFailure({
      repo: input.repo,
      issue: claimedIssue,
      agentName: "writer-agent",
      gateName: "writer artifacts",
      reason: error instanceof Error ? error.message : String(error),
      nextStatusLabel: "status:writing",
      execFile
    });

    throw error;
  }
}

export async function runWriterAgentCli(
  argv: string[],
  dependencies: Partial<Parameters<typeof runWriterAgentPickup>[0]> = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (command !== "pickup") {
    return null;
  }

  if (typeof options.repo !== "string") {
    throw new Error("The pickup command requires --repo.");
  }

  const limit = parseLimitOption(options.limit);
  const pickupInput = {
    ...dependencies,
    repo: options.repo,
    repoRoot: dependencies.repoRoot ?? process.cwd(),
    issueNumber: typeof options["issue-number"] === "string" ? Number(options["issue-number"]) : undefined
  };

  if (limit > 1 && typeof pickupInput.issueNumber !== "number") {
    return runWriterAgentScheduledPickup({
      ...pickupInput,
      limit
    });
  }

  return runWriterAgentPickup({
    ...pickupInput
  });
}

async function runWriterAgentScheduledPickup(input: Parameters<typeof runWriterAgentPickup>[0] & {
  limit: number;
}): Promise<
  | {
      status: "completed";
      results: WriterPickupResult[];
    }
  | {
      status: "noop";
      reason: string;
    }
> {
  const processedIssueNumbers = new Set<number>();
  const results: WriterPickupResult[] = [];
  const loadIssues =
    input.loadIssues ??
    (() => loadOpenIssueQueueIssues({ repo: input.repo, execFile: input.execFile }));

  for (let index = 0; index < input.limit; index += 1) {
    const result = await runWriterAgentPickup({
      ...input,
      loadIssues: async () =>
        (await loadIssues()).filter((issue: IssueQueueIssue) => !processedIssueNumbers.has(issue.number))
    });

    if (result.status === "noop") {
      break;
    }

    processedIssueNumbers.add(result.issue.number);
    results.push(result);
  }

  if (results.length === 0) {
    return {
      status: "noop",
      reason: "No issue was found for agent:writer."
    };
  }

  return {
    status: "completed",
    results
  };
}

function parseLimitOption(value: string | boolean | undefined) {
  if (value === undefined || value === false) return 1;
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  return limit;
}

export async function writeTranscriptArtifact(transcript: Transcript, runDir: string) {
  const transcriptPath = path.join(runDir, "transcript.json");

  await fs.writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`, "utf8");

  return transcriptPath;
}

async function assertResearchDossierArtifact(runDir: string) {
  const dossierPath = path.join(runDir, "research-dossier.json");

  try {
    researchDossierSchema.parse(JSON.parse(await fs.readFile(dossierPath, "utf8")));
  } catch (error) {
    throw new Error(
      `Writer pickup requires merged research artifact: ${dossierPath}${
        error instanceof Error ? ` (${error.message})` : ""
      }`
    );
  }
}

export async function writeTranscriptMarkdownArtifact(transcript: Transcript, runDir: string) {
  const transcriptPath = path.join(runDir, "transcript.md");

  await fs.writeFile(transcriptPath, serializeTranscriptMarkdown(transcript), "utf8");

  return transcriptPath;
}

export async function writeTranscriptQualityReport(transcript: Transcript, runDir: string) {
  const reportPath = path.join(runDir, "transcript-quality-report.json");
  const report = evaluateTranscriptQuality(transcript);

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return reportPath;
}

export function evaluateTranscriptQuality(transcript: Transcript): TranscriptQualityReport {
  const scriptText = [transcript.opening, ...transcript.segments.map((segment: Transcript["segments"][number]) => segment.body), transcript.closing].join("\n");
  const sfxOrBgmCueCount = countMatches(scriptText, /\[(?:SFX|BGM):[^\]]+\]/gi);
  const attentionResetCount = countMatches(scriptText, /\[Action:[^\]]+\]/gi) + countMatches(scriptText, /\?/g);
  const secondPersonCount = countMatches(scriptText, /\b(?:you|your)\b/gi);
  const requiredCueCount = Math.ceil(transcript.estimatedDurationMin);
  const requiredAttentionResetCount = Math.max(2, Math.ceil(transcript.estimatedDurationMin / 3));
  const checks: Record<string, TranscriptQualityCheck> = {
    duration_5_to_8_min: buildCheck(
      transcript.estimatedDurationMin >= 5 && transcript.estimatedDurationMin <= 8,
      transcript.estimatedDurationMin,
      "estimatedDurationMin is between 5 and 8"
    ),
    five_module_structure: buildCheck(
      hasFiveModuleStructure(transcript),
      transcript.segments.length,
      "five Time Machine Adventure modules are present"
    ),
    sfx_or_bgm_density: buildCheck(
      sfxOrBgmCueCount >= requiredCueCount,
      sfxOrBgmCueCount,
      `at least ${requiredCueCount} [SFX] or [BGM] cues for ${transcript.estimatedDurationMin} minutes`
    ),
    attention_resets: buildCheck(
      attentionResetCount >= requiredAttentionResetCount,
      attentionResetCount,
      `at least ${requiredAttentionResetCount} [Action] prompts or direct questions`
    ),
    direct_second_person_address: buildCheck(
      secondPersonCount >= 10,
      secondPersonCount,
      "at least 10 uses of you/your"
    ),
    pronunciation_notes: buildCheck(
      transcript.ttsNotes.some((note: string) => /pronunciation|phonetic/i.test(note)),
      transcript.ttsNotes.length,
      "ttsNotes include pronunciation or phonetic support"
    )
  };

  return {
    status: Object.values(checks).every((check) => check.status === "pass") ? "pass" : "fail",
    checks
  };
}

function buildCheck(passed: boolean, actual: number | boolean, expected: string): TranscriptQualityCheck {
  return {
    status: passed ? "pass" : "fail",
    actual,
    expected
  };
}

function hasFiveModuleStructure(transcript: Transcript) {
  const headings = transcript.segments.map((segment) => segment.heading.toLowerCase());
  const requiredModules = [
    "time machine hook",
    "narrative drama",
    "scientific deep-dive",
    "modern world twist",
    "outro & mission"
  ];

  return requiredModules.every((requiredModule) => headings.some((heading) => heading.includes(requiredModule)));
}

function countMatches(input: string, pattern: RegExp) {
  return input.match(pattern)?.length ?? 0;
}

function selectWriterIssue(issues: IssueQueueIssue[], issueNumber?: number) {
  try {
    return selectIssueForAgent(issues, {
      role: "writer",
      allowedStatuses: ["status:writing"],
      issueNumber
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No issue was found for agent:writer")) {
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

async function openWriterPullRequest(input: {
  issue: IssueQueueIssue;
  runDir: string;
  repo: string;
  repoRoot: string;
}) {
  const headRef = (await execFileText("git", ["branch", "--show-current"], { cwd: input.repoRoot })).trim();

  await execFileText("git", ["add", path.relative(input.repoRoot, input.runDir)], { cwd: input.repoRoot });
  await execFileText("git", ["commit", "-m", `writer: add transcript artifacts for issue ${input.issue.number}`], {
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
      `Issue #${input.issue.number}: add writer transcript artifacts`,
      "--body",
      buildWriterPullRequestBody(input.issue)
    ],
    { cwd: input.repoRoot }
  );
}

function buildWriterPullRequestBody(issue: IssueQueueIssue) {
  return [
    "## Summary",
    `- add writer transcript artifacts for issue #${issue.number}`,
    "- include canonical transcript.md, derived transcript.json, and quality report",
    "",
    `Refs #${issue.number}`
  ].join("\n");
}

function buildWriterPickupComment(input: {
  prUrl: string;
  runDir: string;
  qualityStatus: string;
  artifactPaths: string[];
}) {
  return [
    "## Writer-agent pickup complete",
    "",
    `PR: ${input.prUrl.trim()}`,
    `Run directory: \`${input.runDir}\``,
    `Quality: ${input.qualityStatus}`,
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
  await runWriterAgentCli(process.argv);
}
