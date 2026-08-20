import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { EpisodeRequest } from "../../src/contracts";
import { episodeRequestSchema } from "../../src/contracts";

const execFilePromise = promisify(execFileCallback);

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

type EpisodeDateInput = {
  date: string;
  language?: "en";
  audience?: "children-first-adult-friendly";
  durationTargetMin?: number;
  durationMaxMin?: 15;
  currentStage?: EpisodeRequest["currentStage"];
};

export function resolveEpisodeDateInput(input: EpisodeDateInput): EpisodeRequest {
  const titleSlug = slugifyEpisodeTitle(formatEpisodeTitleDate(input.date));

  return episodeRequestSchema.parse({
    date: input.date,
    episodeSlug: `${input.date}-${titleSlug}`,
    language: input.language ?? "en",
    audience: input.audience ?? "children-first-adult-friendly",
    durationTargetMin: input.durationTargetMin ?? 12,
    durationMaxMin: input.durationMaxMin ?? 15,
    currentStage: input.currentStage ?? "ready"
  });
}

export function buildEpisodeIssueDraft(input: EpisodeRequest | EpisodeDateInput) {
  const request = "episodeSlug" in input ? input : resolveEpisodeDateInput(input);

  return {
    title: `Episode: ${formatEpisodeTitleDate(request.date)}`,
    body: [
      `date: ${request.date}`,
      `episode_slug: ${request.episodeSlug}`,
      `language: ${request.language}`,
      `audience: ${request.audience}`,
      `duration_target_min: ${request.durationTargetMin}`,
      `duration_max_min: ${request.durationMaxMin}`,
      `current_stage: ${request.currentStage}`
    ].join("\n"),
    labels: ["type:episode", "status:ready"] as const
  };
}

export async function createEpisodeIssueFromDate(input: {
  repo: string;
  repoRoot?: string;
  input: EpisodeDateInput;
  execFile?: ExecFileFn;
}) {
  const request = resolveEpisodeDateInput(input.input);
  const draft = buildEpisodeIssueDraft(request);
  const output = await (input.execFile ?? execFileText)(
    "gh",
    [
      "issue",
      "create",
      "--repo",
      input.repo,
      "--title",
      draft.title,
      "--body",
      draft.body,
      "--label",
      draft.labels[0],
      "--label",
      draft.labels[1]
    ],
    input.repoRoot ? { cwd: input.repoRoot } : undefined
  );

  const parsed = parseCreatedIssueOutput(output);

  return {
    issueNumber: parsed.issueNumber,
    url: parsed.url,
    title: draft.title,
    body: draft.body,
    labels: [...draft.labels],
    request
  };
}

export function resolveEpisodeRequest(issue: {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
}) {
  const fields = Object.fromEntries(
    issue.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const [key, ...rest] = line.split(":");
        return [key.trim(), rest.join(":").trim()];
      })
  );

  return episodeRequestSchema.parse({
    date: fields.date,
    episodeSlug: fields.episode_slug,
    language: fields.language ?? "en",
    audience: fields.audience ?? "children-first-adult-friendly",
    durationTargetMin: Number(fields.duration_target_min ?? 12),
    durationMaxMin: 15,
    selectedAngle: fields.selected_angle || undefined,
    entityType: fields.entity_type || undefined,
    currentStage: fields.current_stage ?? "ready"
  });
}

function formatEpisodeTitleDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return `${monthNames[month - 1]} ${day}, ${year}`;
}

function slugifyEpisodeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseCreatedIssueOutput(output: string) {
  const trimmed = output.trim();

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as { number: number; url: string };
    return {
      issueNumber: parsed.number,
      url: parsed.url
    };
  }

  const match = trimmed.match(/\/issues\/(\d+)\/?$/);

  if (!match) {
    throw new Error(`Could not parse created issue output: ${output}`);
  }

  return {
    issueNumber: Number(match[1]),
    url: trimmed
  };
}

async function execFileText(file: string, args: string[], options?: { cwd?: string }) {
  const result = await execFilePromise(file, args, options);
  return result.stdout.trim();
}
