import { describe, expect, it } from "vitest";
import { runProducerAgent } from "../../agents/producer-agent";

describe("producer agent", () => {
  it("creates audio metadata from a transcript", async () => {
    const result = await runProducerAgent(
      {
        opening: "Good morning to everyone on the way to school.",
        segments: [{ heading: "The beginning", body: "A city dreamed of a new museum." }],
        closing: "That dream still matters today.",
        estimatedDurationMin: 12,
        ttsNotes: ["Warm pace"]
      },
      "runs/test-audio"
    );

    expect(result.audioPath).toContain("final.mp3");
    expect(result.metadataPath).toContain("render-metadata.json");
  });
});
