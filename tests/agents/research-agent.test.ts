import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runResearchAgent } from "../../agents/research-agent";

describe("research agent", () => {
  it("returns a balanced, children-safe dossier", async () => {
    const dossier = await runResearchAgent({
      date: "2026-08-18",
      episodeSlug: "2026-08-18-a-museum-opens",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 5,
      durationMaxMin: 8,
      currentStage: "researching"
    });

    expect(dossier.entityType).toMatch(/person|event|object/);
    expect(dossier.sources.length).toBeGreaterThanOrEqual(1);
    expect(dossier.modernRelevance.length).toBeGreaterThan(10);
  });

  it("persists a sourced reference folder before completing research", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "podcast-research-agent-"));

    await runResearchAgent(
      {
        date: "2026-08-18",
        episodeSlug: "2026-08-18-a-museum-opens",
        language: "en",
        audience: "children-first-adult-friendly",
        durationTargetMin: 5,
        durationMaxMin: 8,
        currentStage: "researching"
      },
      { runDir }
    );

    const dossier = JSON.parse(await fs.readFile(path.join(runDir, "research-dossier.json"), "utf8"));
    const references = JSON.parse(await fs.readFile(path.join(runDir, "references", "research-references.json"), "utf8"));
    const referenceSummary = await fs.readFile(path.join(runDir, "references", "README.md"), "utf8");

    expect(dossier.chosenSubject).toBeTruthy();
    expect(references.items.length).toBeGreaterThanOrEqual(1);
    expect(references.items[0]).toMatchObject({
      summary: expect.any(String),
      source: {
        title: expect.any(String),
        url: expect.stringMatching(/^https?:\/\//),
        sourceType: expect.any(String)
      }
    });
    expect(referenceSummary).toContain("Source:");
  });
});
