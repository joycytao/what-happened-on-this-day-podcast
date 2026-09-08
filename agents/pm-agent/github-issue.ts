import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { EpisodeRequest } from "../../src/contracts";
import { episodeRequestSchema } from "../../src/contracts";

const execFileAsync = promisify(execFileCallback);

type ExecFileFn = (
  file: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<string>;

export type EpisodeBrief = {
  date: string;
  workingTitle?: string;
};

type EpisodeDateInput = {
  date: string;
  language?: "en";
  audience?: "children-first-adult-friendly";
  durationTargetMin?: number;
  durationMaxMin?: 8;
  currentStage?: EpisodeRequest["currentStage"];
};

export type EpisodeIssueDraft = {
  title: string;
  body: string;
  labels: string[];
};

export type EpisodeIssue = {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
  state?: "OPEN" | "CLOSED";
};

export type EpisodeIssueContextUpdates = {
  currentStage?: "ready" | "researching" | "writing" | "producing" | "review" | "done" | "blocked";
  outputRunPath?: string;
};

export type EpisodeAgentLabel = "agent:research" | "agent:writer" | "agent:producer";

export function resolveEpisodeDateInput(input: EpisodeDateInput): EpisodeRequest {
  const titleSlug = slugifyEpisodeTitle(formatEpisodeTitleDate(input.date));

  return episodeRequestSchema.parse({
    date: input.date,
    episodeSlug: `${input.date}-${titleSlug}`,
    language: input.language ?? "en",
    audience: input.audience ?? "children-first-adult-friendly",
    durationTargetMin: input.durationTargetMin ?? 5,
    durationMaxMin: input.durationMaxMin ?? 8,
    currentStage: input.currentStage ?? "ready"
  });
}

export function buildEpisodeIssueDraft(input: EpisodeBrief | EpisodeRequest | EpisodeDateInput): EpisodeIssueDraft {
  if ("workingTitle" in input) {
    return buildBriefEpisodeIssueDraft(input);
  }

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
    labels: ["status:ready", "agent:research"]
  };
}

function buildBriefEpisodeIssueDraft(brief: EpisodeBrief): EpisodeIssueDraft {
  const workingTitle = brief.workingTitle ?? "daily episode";
  const episodeSlug = `${brief.date}-${workingTitle.toLowerCase().replace(/\s+/g, "-")}`;
  const titleDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${brief.date}T00:00:00.000Z`));

  return {
    title: `Episode: ${titleDate} - ${workingTitle}`,
    body: [
      "## Episode Request",
      "",
      `- date: ${brief.date}`,
      `- episode_slug: ${episodeSlug}`,
      "- language: en",
      "- audience: children-first-adult-friendly",
      "- duration_target_min: 5",
      "- duration_max_min: 8",
      "- selected_angle:",
      "- entity_type:",
      "- current_stage: ready",
      "- output_run_path:",
      "",
      "## Overrides",
      "",
      "- none",
      "",
      "## Required Tasks",
      "",
      "- [ ] Resolve episode request metadata",
      "- [ ] Create run directory and episode-request.json",
      "- [ ] Research date-linked candidates, choose one subject, and create sourced references",
      "- [ ] Write transcript from accepted research dossier",
      "- [ ] Run Humanizer review on transcript and revise AI-sounding passages",
      "- [ ] Produce audio artifact and render metadata",
      "- [ ] Prepare episode for human review"
    ].join("\n"),
    labels: ["status:ready", "agent:research"]
  };
}

export async function createEpisodeIssue(draft: EpisodeIssueDraft, options: { repo?: string } = {}): Promise<EpisodeIssue> {
  const args = ["issue", "create", "--title", draft.title, "--body", draft.body];

  if (options.repo) {
    args.push("--repo", options.repo);
  }

  for (const label of draft.labels) {
    args.push("--label", label);
  }

  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf8"
  });
  const issueUrl = stdout.trim();
  const issueNumber = Number(issueUrl.match(/\/issues\/(\d+)$/)?.[1]);

  if (!Number.isInteger(issueNumber)) {
    throw new Error(`Could not parse created GitHub issue number from: ${issueUrl}`);
  }

  return {
    issueNumber,
    title: draft.title,
    body: draft.body,
    labels: draft.labels
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
      ...draft.labels.flatMap((label) => ["--label", label])
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

export function selectEpisodeIssueForPickup(issues: EpisodeIssue[], options: { issueNumber?: number } = {}) {
  const readyEpisodeIssues = issues.filter((issue) => {
    if (issue.state && issue.state !== "OPEN") return false;

    const labels = new Set(issue.labels.map(normalizeLabel));
    return labels.has("status:ready") && labels.has("agent:research");
  });

  if (typeof options.issueNumber === "number") {
    const selected = readyEpisodeIssues.find((issue) => issue.issueNumber === options.issueNumber);

    if (!selected) {
      throw new Error(`Ready episode issue #${options.issueNumber} was not found.`);
    }

    return selected;
  }

  const [selected] = [...readyEpisodeIssues].sort((left, right) => left.issueNumber - right.issueNumber);

  if (!selected) {
    throw new Error("No ready episode issues were found.");
  }

  return selected;
}

export async function loadReadyEpisodeIssues(input: { repo: string }): Promise<EpisodeIssue[]> {
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "list",
    "--repo",
    input.repo,
    "--state",
    "all",
    "--limit",
    "100",
    "--json",
    "number,title,body,state,labels"
  ], {
    encoding: "utf8"
  });

  const parsed = JSON.parse(stdout) as Array<{
    number: number;
    title: string;
    body: string;
    state: "OPEN" | "CLOSED";
    labels: Array<{ name: string }>;
  }>;

  return parsed.map((issue) => ({
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((label) => label.name)
  }));
}

export async function loadEpisodeIssueFromGitHub(input: {
  repo: string;
  issueNumber: number;
  execFile?: ExecFileFn;
}): Promise<EpisodeIssue> {
  const output = await (input.execFile ?? execFileText)("gh", [
    "issue",
    "view",
    String(input.issueNumber),
    "--repo",
    input.repo,
    "--json",
    "number,title,body,state,labels"
  ]);
  const parsed = JSON.parse(output) as {
    number: number;
    title: string;
    body: string;
    state: "OPEN" | "CLOSED";
    labels: Array<{ name: string }>;
  };

  return {
    issueNumber: parsed.number,
    title: parsed.title,
    body: parsed.body,
    state: parsed.state,
    labels: parsed.labels.map((label) => label.name)
  };
}

export function buildEpisodeIssueContextBody(body: string, updates: EpisodeIssueContextUpdates) {
  let nextBody = body;

  if (updates.currentStage) {
    nextBody = replaceIssueField(nextBody, "current_stage", updates.currentStage);
  }

  if (updates.outputRunPath) {
    nextBody = replaceIssueField(nextBody, "output_run_path", updates.outputRunPath);
  }

  return nextBody;
}

export async function updateEpisodeIssueContextOnGitHub(
  issue: EpisodeIssue,
  updates: EpisodeIssueContextUpdates,
  options: { repo: string }
) {
  const body = buildEpisodeIssueContextBody(issue.body, updates);
  const args = [
    "issue",
    "edit",
    String(issue.issueNumber),
    "--repo",
    options.repo,
    "--body",
    body
  ];
  const nextStatusLabel = updates.currentStage ? `status:${updates.currentStage}` : undefined;
  const previousStatusLabels = issue.labels.filter((label) => normalizeLabel(label).startsWith("status:"));

  for (const label of previousStatusLabels) {
    if (nextStatusLabel && normalizeLabel(label) === nextStatusLabel) continue;

    args.push("--remove-label", label);
  }

  if (nextStatusLabel && !previousStatusLabels.some((label) => normalizeLabel(label) === nextStatusLabel)) {
    args.push("--add-label", nextStatusLabel);
  }

  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf8"
  });
  const nextLabels = [
    ...issue.labels.filter((label) => !normalizeLabel(label).startsWith("status:")),
    ...(nextStatusLabel ? [nextStatusLabel] : previousStatusLabels)
  ];

  return {
    ...issue,
    body,
    labels: nextLabels,
    issueUrl: stdout.trim()
  };
}

export async function updateEpisodeIssueStageOnGitHub(
  issue: EpisodeIssue,
  updates: EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel },
  options: { repo: string; execFile?: ExecFileFn }
) {
  const body = buildEpisodeIssueContextBody(issue.body, updates);
  const nextStatusLabel = updates.currentStage ? `status:${updates.currentStage}` : undefined;
  const args = [
    "issue",
    "edit",
    String(issue.issueNumber),
    "--repo",
    options.repo,
    "--body",
    body
  ];

  for (const label of issue.labels) {
    const normalized = normalizeLabel(label);

    if (normalized.startsWith("status:") || normalized.startsWith("agent:") || normalized.startsWith("claim:")) {
      args.push("--remove-label", label);
    }
  }

  if (nextStatusLabel) {
    args.push("--add-label", nextStatusLabel);
  }

  if (updates.nextAgentLabel) {
    args.push("--add-label", updates.nextAgentLabel);
  }

  const execFile = options.execFile ?? execFileText;

  if (issue.state === "CLOSED") {
    await execFile("gh", [
      "issue",
      "reopen",
      String(issue.issueNumber),
      "--repo",
      options.repo
    ]);
  }

  const output = await execFile("gh", args);
  const nextLabels = [
    ...issue.labels.filter((label) => {
      const normalized = normalizeLabel(label);
      return !normalized.startsWith("status:") && !normalized.startsWith("agent:") && !normalized.startsWith("claim:");
    }),
    ...(nextStatusLabel ? [nextStatusLabel] : []),
    ...(updates.nextAgentLabel ? [updates.nextAgentLabel] : [])
  ];

  return {
    ...issue,
    body,
    state: "OPEN",
    labels: nextLabels,
    issueUrl: output.trim()
  };
}

export async function commentOnEpisodeIssue(input: {
  repo: string;
  issueNumber: number;
  body: string;
  execFile?: ExecFileFn;
}) {
  return (input.execFile ?? execFileText)("gh", [
    "issue",
    "comment",
    String(input.issueNumber),
    "--repo",
    input.repo,
    "--body",
    input.body
  ]);
}

export async function assertResearchPackageArtifacts(runDir: string) {
  const requiredPaths = [
    path.join(runDir, "research-dossier.json"),
    path.join(runDir, "references", "research-references.json"),
    path.join(runDir, "references", "README.md")
  ];
  const missing: string[] = [];

  for (const requiredPath of requiredPaths) {
    try {
      await fs.access(requiredPath);
    } catch {
      missing.push(requiredPath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Research package is incomplete. Missing: ${missing.join(", ")}`);
  }

  return requiredPaths;
}

export async function buildResearchPackageIssueComment(runDir: string) {
  const [dossierPath, referencesJsonPath, referencesReadmePath] = await assertResearchPackageArtifacts(runDir);
  const [dossier, referencesJson, referencesReadme] = await Promise.all([
    fs.readFile(dossierPath, "utf8"),
    fs.readFile(referencesJsonPath, "utf8"),
    fs.readFile(referencesReadmePath, "utf8")
  ]);

  return [
    "## Research package",
    "",
    "The research agent completed its required artifact package.",
    "",
    "Included files:",
    "",
    "- `research-dossier.json`",
    "- `references/research-references.json`",
    "- `references/README.md`",
    "",
    "<details>",
    "<summary>research-dossier.json</summary>",
    "",
    "```json",
    dossier.trim(),
    "```",
    "",
    "</details>",
    "",
    "<details>",
    "<summary>references/research-references.json</summary>",
    "",
    "```json",
    referencesJson.trim(),
    "```",
    "",
    "</details>",
    "",
    "<details>",
    "<summary>references/README.md</summary>",
    "",
    "```md",
    referencesReadme.trim(),
    "```",
    "",
    "</details>"
  ].join("\n");
}

export async function uploadResearchPackageToGitHubIssue(input: {
  issue: EpisodeIssue;
  runDir: string;
  repo: string;
}) {
  const body = await buildResearchPackageIssueComment(input.runDir);
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "comment",
    String(input.issue.issueNumber),
    "--repo",
    input.repo,
    "--body",
    body
  ], {
    encoding: "utf8"
  });

  return stdout.trim();
}

export function resolveEpisodeRequest(issue: EpisodeIssue) {
  const fields = parseEpisodeIssueFields(issue.body);

  return episodeRequestSchema.parse({
    date: fields.date,
    episodeSlug: fields.episode_slug,
    language: fields.language ?? "en",
    audience: fields.audience ?? "children-first-adult-friendly",
    durationTargetMin: Number(fields.duration_target_min ?? 5),
    durationMaxMin: 8,
    selectedAngle: fields.selected_angle || undefined,
    entityType: fields.entity_type || undefined,
    currentStage: fields.current_stage ?? "ready"
  });
}

export function parseEpisodeIssueFields(body: string) {
  return Object.fromEntries(
    body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const normalizedLine = line.replace(/^-\s*/, "");
        const [key, ...rest] = normalizedLine.split(":");
        return [key.trim(), rest.join(":").trim()];
      })
  );
}

function replaceIssueField(body: string, field: string, value: string) {
  const fieldPattern = new RegExp(`^(-\\s+)?${field}:.*$`, "m");
  const existingPrefix = body.match(fieldPattern)?.[1] ?? "";

  if (fieldPattern.test(body)) {
    return body.replace(fieldPattern, `${existingPrefix}${field}: ${value}`);
  }

  const inferredPrefix = /^-\s+\w+:/m.test(body) ? "- " : "";
  return `${body.trimEnd()}\n${inferredPrefix}${field}: ${value}\n`;
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/:\s+/g, ":").trim();
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
  const result = await execFileAsync(file, args, options);
  return result.stdout.trim();
}
