import { describe, expect, it } from "vitest";
import { runResearchAgent } from "../../agents/research-agent";

describe("research agent", () => {
  it("returns a balanced, children-safe dossier", async () => {
    const dossier = await runResearchAgent({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 12,
      durationMaxMin: 15,
      currentStage: "researching"
    });

    expect(dossier.entityType).toMatch(/person|event|object/);
    expect(dossier.sources.length).toBeGreaterThanOrEqual(1);
    expect(dossier.modernRelevance.length).toBeGreaterThan(10);
  });
});
