import type { ResearchDossier } from "../../src/contracts";
import { transcriptSchema } from "../../src/contracts";

export function buildTranscript(dossier: Pick<ResearchDossier, "chosenSubject" | "chosenAngle" | "storyBeats" | "modernRelevance">) {
  return transcriptSchema.parse({
    opening: "Good morning to everyone eating breakfast, getting ready for school, or settling in for a story.",
    segments: [
      {
        heading: "A big idea begins",
        body: `Today's story is about ${dossier.chosenSubject}. It began with a simple question: ${dossier.chosenAngle}`
      },
      {
        heading: "The turning point",
        body: dossier.storyBeats[1]
      },
      {
        heading: "Why it still matters",
        body: dossier.modernRelevance
      }
    ],
    closing: `And that is how this story still reaches us today: ${dossier.modernRelevance}`,
    estimatedDurationMin: 12,
    ttsNotes: ["Warm pace", "Gentle pause after opening", "Lift energy in the turning point"]
  });
}
