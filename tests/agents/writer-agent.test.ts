import { describe, expect, it } from "vitest";
import { runWriterAgent } from "../../agents/writer-agent";

describe("writer agent", () => {
  it("turns a dossier into a structured transcript", async () => {
    const transcript = await runWriterAgent({
      episodeDate: "2026-08-18",
      chosenSubject: "A museum opens",
      entityType: "object",
      chosenAngle: "How a museum made history easier to touch",
      episodeThesis: "Public places for curiosity can change a whole city.",
      timeline: ["1890: planning", "1900: building", "1902: opening"],
      storyBeats: ["A city needed a learning place", "People built it together", "Families finally entered"],
      modernRelevance: "Children still learn from museums today.",
      sources: [{ title: "Archive", url: "https://example.com/archive", sourceType: "official" }],
      safetyNotes: []
    });

    expect(transcript.opening.length).toBeGreaterThan(20);
    expect(transcript.segments.length).toBeGreaterThanOrEqual(3);
    expect(transcript.estimatedDurationMin).toBeLessThanOrEqual(15);
  });
});
