import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { episodeRequestSchema } from "../../src/contracts";

const execFileAsync = promisify(execFile);

export type EpisodeBrief = {
  date: string;
  workingTitle?: string;
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

export function buildEpisodeIssueDraft(brief: EpisodeBrief): EpisodeIssueDraft {
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
      "- duration_target_min: 12",
      "- duration_max_min: 15",
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
    labels: ["type:episode", "status:ready"]
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

export function selectEpisodeIssueForPickup(issues: EpisodeIssue[], options: { issueNumber?: number } = {}) {
  const readyEpisodeIssues = issues.filter((issue) => {
    if (issue.state && issue.state !== "OPEN") return false;

    const labels = new Set(issue.labels.map(normalizeLabel));
    return labels.has("type:episode") && labels.has("status:ready");
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
    "open",
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
  const fields = Object.fromEntries(
    issue.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const normalizedLine = line.replace(/^-\s*/, "");
        const [key, ...rest] = normalizedLine.split(":");
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

function replaceIssueField(body: string, field: string, value: string) {
  const fieldPattern = new RegExp(`^- ${field}:.*$`, "m");

  if (fieldPattern.test(body)) {
    return body.replace(fieldPattern, `- ${field}: ${value}`);
  }

  return `${body.trimEnd()}\n- ${field}: ${value}\n`;
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/:\s+/g, ":").trim();
}
