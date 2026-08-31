import path from "node:path";
import fs from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Transcript } from "../../src/contracts";
import { parseTranscriptMarkdown } from "../../src/contracts";
import { parseCliArgs } from "../../src/lib/cli";
import { loadJsonConfig } from "../../src/lib/content-assets";
import { renderWithVoicebox, validateVoiceboxConfig } from "./voicebox-adapter";
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
import {
  assertReviewableEpisodeAudio,
  assertWriterTranscriptArtifact,
  assertWriterTranscriptQuality
} from "../pm-agent";

const execFileAsync = promisify(execFileCallback);

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

type ProducerRenderResult = {
  audioPath: string;
  metadataPath: string;
  sfxManifestPath: string;
};

type ProducerPickupResult =
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

export async function runProducerAgent(transcript: Transcript, outputDir: string) {
  const voicebox = validateVoiceboxConfig(await loadJsonConfig("voicebox"));

  return renderWithVoicebox({
    voicePreset: voicebox.voiceProfile ?? voicebox.voicePreset ?? "story-narrator-01",
    outputAudioPath: path.join(outputDir, "final.mp3"),
    transcript
  }, {
    config: voicebox
  });
}

export async function runProducerAgentFromTranscriptMarkdown(transcriptPath: string, outputDir: string) {
  const transcript = parseTranscriptMarkdown(await fs.readFile(transcriptPath, "utf8"));
  const voicebox = validateVoiceboxConfig(await loadJsonConfig("voicebox"));

  return renderWithVoicebox({
    voicePreset: voicebox.voiceProfile ?? voicebox.voicePreset ?? "story-narrator-01",
    sourceTranscriptPath: transcriptPath,
    outputAudioPath: path.join(outputDir, "final.mp3"),
    transcript
  }, {
    config: voicebox
  });
}

export async function runProducerAgentPickup(input: {
  repo: string;
  repoRoot: string;
  issueNumber?: number;
  loadIssues?: () => Promise<IssueQueueIssue[]>;
  loadIssue?: (issueNumber: number) => Promise<EpisodeIssue>;
  execFile?: ExecFileFn;
  renderAudio?: (input: {
    transcriptPath: string;
    outputDir: string;
    runDir: string;
  }) => Promise<ProducerRenderResult>;
  openPullRequest?: (input: {
    issue: IssueQueueIssue;
    runDir: string;
    repo: string;
    repoRoot: string;
  }) => Promise<string>;
  commentOnIssue?: (input: { issueNumber: number; body: string }) => Promise<void>;
}): Promise<ProducerPickupResult> {
  const issues = await (input.loadIssues ??
    (() => loadOpenIssueQueueIssues({ repo: input.repo, execFile: input.execFile })))();
  const issue = selectProducerIssue(issues, input.issueNumber);

  if (!issue) {
    return {
      status: "noop",
      reason: "No issue was found for agent:producer."
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
  const transcript = await assertWriterTranscriptArtifact(runDir);

  await assertWriterTranscriptQuality(runDir, transcript);

  const claimedIssue = await claimIssueForAgent({
    repo: input.repo,
    issue,
    role: "producer",
    execFile,
    reloadIssue: async () => episodeIssueToQueueIssue(await loadIssue(issue.number))
  });
  const outputDir = path.join(runDir, "audio");
  const result = await (input.renderAudio ?? defaultRenderAudio)({
    transcriptPath: path.join(runDir, "transcript.md"),
    outputDir,
    runDir
  });

  await assertReviewableEpisodeAudio(result);

  const artifactPaths = [
    path.join(runDir, "audio", "final.mp3"),
    path.join(runDir, "audio", "render-metadata.json"),
    path.join(runDir, "audio", "sfx-manifest.json")
  ];
  const prUrl = await (input.openPullRequest ?? openProducerPullRequest)({
    issue,
    runDir,
    repo: input.repo,
    repoRoot: input.repoRoot
  });

  await (input.commentOnIssue ?? defaultCommentOnIssue(input.repo))({
    issueNumber: issue.number,
    body: buildProducerPickupComment({
      prUrl,
      runDir,
      artifactPaths
    })
  });

  return {
    status: "completed",
    issue: claimedIssue,
    runDir,
    prUrl,
    artifactPaths
  };
}

export async function runProducerAgentCli(
  argv: string[],
  dependencies: Partial<Parameters<typeof runProducerAgentPickup>[0]> = {}
) {
  const { command, options } = parseCliArgs(argv);

  if (command !== "pickup") {
    return null;
  }

  if (typeof options.repo !== "string") {
    throw new Error("The pickup command requires --repo.");
  }

  return runProducerAgentPickup({
    ...dependencies,
    repo: options.repo,
    repoRoot: dependencies.repoRoot ?? process.cwd(),
    issueNumber: typeof options["issue-number"] === "string" ? Number(options["issue-number"]) : undefined
  });
}

function selectProducerIssue(issues: IssueQueueIssue[], issueNumber?: number) {
  try {
    return selectIssueForAgent(issues, {
      role: "producer",
      allowedStatuses: ["status:producing"],
      issueNumber
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No issue was found for agent:producer")) {
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

async function defaultRenderAudio(input: {
  transcriptPath: string;
  outputDir: string;
}) {
  return runProducerAgentFromTranscriptMarkdown(input.transcriptPath, input.outputDir);
}

async function openProducerPullRequest(input: {
  issue: IssueQueueIssue;
  runDir: string;
  repo: string;
  repoRoot: string;
}) {
  const headRef = (await execFileText("git", ["branch", "--show-current"], { cwd: input.repoRoot })).trim();

  await execFileText("git", ["add", path.relative(input.repoRoot, path.join(input.runDir, "audio"))], {
    cwd: input.repoRoot
  });
  await execFileText("git", ["commit", "-m", `producer: add audio artifacts for issue ${input.issue.number}`], {
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
      `Issue #${input.issue.number}: add producer audio artifacts`,
      "--body",
      buildProducerPullRequestBody(input.issue)
    ],
    { cwd: input.repoRoot }
  );
}

function buildProducerPullRequestBody(issue: IssueQueueIssue) {
  return [
    "## Summary",
    `- add producer audio artifacts for issue #${issue.number}`,
    "- include final.mp3, render metadata, and SFX manifest",
    "",
    `Refs #${issue.number}`
  ].join("\n");
}

function buildProducerPickupComment(input: {
  prUrl: string;
  runDir: string;
  artifactPaths: string[];
}) {
  return [
    "## Producer-agent pickup complete",
    "",
    `PR: ${input.prUrl.trim()}`,
    `Run directory: \`${input.runDir}\``,
    "",
    "Artifacts:",
    ...input.artifactPaths.map((artifactPath) => `- \`${artifactPath}\``)
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
  await runProducerAgentCli(process.argv);
}
