import { describe, expect, it } from "vitest";
import {
  audioJobSchema,
  episodeRequestSchema,
  researchDossierSchema,
  researchReferencesSchema,
  transcriptSchema
} from "../../src/contracts";

describe("shared podcast contracts", () => {
  it("accepts a valid episode request", () => {
    expect(() =>
      episodeRequestSchema.parse({
        date: "2026-08-18",
        episodeSlug: "2026-08-18-first-story",
        language: "en",
        audience: "children-first-adult-friendly",
        durationTargetMin: 12,
        durationMaxMin: 15,
        currentStage: "ready"
      })
    ).not.toThrow();
  });

  it("accepts a valid research dossier", () => {
    expect(() =>
      researchDossierSchema.parse({
        episodeDate: "2026-08-18",
        chosenSubject: "The opening of a landmark museum",
        entityType: "object",
        chosenAngle: "How a museum changed the way families learn",
        episodeThesis: "A place built for curiosity can reshape a city.",
        timeline: ["1890: planning begins", "1902: doors open", "2026: families still visit"],
        storyBeats: ["A need emerges", "A public dream grows", "The opening changes access"],
        modernRelevance: "Museums still shape how children meet history today.",
        sources: [{ title: "Museum archive", url: "https://example.com/archive", sourceType: "official" }],
        safetyNotes: []
      })
    ).not.toThrow();
  });

  it("accepts valid sourced research references", () => {
    expect(() =>
      researchReferencesSchema.parse({
        episodeDate: "2026-08-18",
        chosenSubject: "The opening of a landmark museum",
        items: [
          {
            id: "ref-1",
            summary: "The museum archive supports the planning and opening timeline.",
            source: {
              title: "Museum archive",
              url: "https://example.com/archive",
              sourceType: "official"
            }
          }
        ]
      })
    ).not.toThrow();
  });

  it("accepts a valid transcript and producer job", () => {
    const transcript = transcriptSchema.parse({
      opening: "Good morning to everyone on the way to school.",
      segments: [
        { heading: "The beginning", body: "A city wanted a new place to learn." }
      ],
      closing: "That is why this story still matters today.",
      estimatedDurationMin: 12,
      ttsNotes: ["Warm pacing", "Pause after opening"]
    });

    expect(
      audioJobSchema.parse({
        voicePreset: "story-narrator-01",
        sourceTranscriptPath: "runs/2026-08-18-first-story/transcript.json",
        outputAudioPath: "runs/2026-08-18-first-story/audio/final.mp3",
        transcript
      })
    ).toMatchObject({ voicePreset: "story-narrator-01" });
  });
});
