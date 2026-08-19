import { describe, expect, it } from "vitest";
import { resolveEpisodeRequest } from "../../agents/pm-agent/github-issue";
import { createRunManifest } from "../../agents/pm-agent/run-manifest";

describe("pm agent intake", () => {
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
