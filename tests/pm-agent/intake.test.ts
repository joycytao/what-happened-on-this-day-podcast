import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertResearchPackageArtifacts,
  buildEpisodeIssueDraft,
  buildEpisodeIssueContextBody,
  buildResearchPackageIssueComment,
  resolveEpisodeRequest
} from "../../agents/pm-agent/github-issue";
import { createRunManifest } from "../../agents/pm-agent/run-manifest";

describe("pm agent intake", () => {
  it("builds a ready episode issue draft from a date brief", () => {
    expect(
      buildEpisodeIssueDraft({
        date: "2026-08-24",
        workingTitle: "daily episode"
      })
    ).toEqual({
      title: "Episode: August 24, 2026 - daily episode",
      body: [
        "## Episode Request",
        "",
        "- date: 2026-08-24",
        "- episode_slug: 2026-08-24-daily-episode",
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
    });
  });

  it("updates episode issue context when a run starts", () => {
    const originalBody = buildEpisodeIssueDraft({
      date: "2026-08-24",
      workingTitle: "daily episode"
    }).body;

    expect(
      buildEpisodeIssueContextBody(originalBody, {
        currentStage: "researching",
        outputRunPath: "runs/2026-08-24-daily-episode"
      })
    ).toContain("- current_stage: researching\n- output_run_path: runs/2026-08-24-daily-episode");
  });

  it("builds a research package issue comment only when all required files exist", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-research-package-"));
    await fs.mkdir(path.join(runDir, "references"), { recursive: true });
    await fs.writeFile(path.join(runDir, "research-dossier.json"), "{\"ok\":true}\n", "utf8");
    await fs.writeFile(path.join(runDir, "references", "research-references.json"), "{\"items\":[]}\n", "utf8");
    await fs.writeFile(path.join(runDir, "references", "README.md"), "# References\n", "utf8");

    await expect(assertResearchPackageArtifacts(runDir)).resolves.toEqual([
      path.join(runDir, "research-dossier.json"),
      path.join(runDir, "references", "research-references.json"),
      path.join(runDir, "references", "README.md")
    ]);
    await expect(buildResearchPackageIssueComment(runDir)).resolves.toContain("## Research package");
  });

  it("blocks status updates when the research package is incomplete", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-research-package-missing-"));
    await fs.writeFile(path.join(runDir, "research-dossier.json"), "{\"ok\":true}\n", "utf8");

    await expect(assertResearchPackageArtifacts(runDir)).rejects.toThrow(
      "Research package is incomplete"
    );
  });

  it("creates an episode request from issue metadata", () => {
    expect(
      resolveEpisodeRequest({
        issueNumber: 14,
        title: "Episode: August 18 - A Museum Opens",
        body: [
          "date: 2026-08-18",
          "episode_slug: 2026-08-18-a-museum-opens",
          "language: en",
          "audience: children-first-adult-friendly",
          "duration_target_min: 12",
          "duration_max_min: 15",
          "current_stage: ready"
        ].join("\n"),
        labels: ["type:episode", "status:ready"]
      })
    ).toMatchObject({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      currentStage: "ready"
    });
  });

  it("creates a run manifest on disk", async () => {
    const result = await createRunManifest({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 12,
      durationMaxMin: 15,
      currentStage: "ready"
    });

    expect(result.runDir).toContain("runs/2026-08-18-a-museum-opens");
    expect(result.manifestPath).toContain("episode-request.json");
  });
});
