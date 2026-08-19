import type { EpisodeRequest } from "../../src/contracts";
import { researchDossierSchema } from "../../src/contracts";
import { selectBestCandidate } from "./select-candidate";

export async function runResearchAgent(request: EpisodeRequest) {
  const candidate = selectBestCandidate([
    {
      subject: "A museum opening that changed public learning",
      entityType: "object" as const,
      angle: "How a new public museum turned history into a place families could visit",
      thesis: "A building for curiosity can change how a city learns.",
      timeline: [
        "1888: civic leaders propose the museum",
        "1898: construction begins",
        "1902: the museum opens"
      ],
      storyBeats: [
        "A city imagines a new learning space",
        "Builders and supporters make it real",
        "Families walk through the doors and history feels closer"
      ],
      modernRelevance: "Museums still help children connect objects, stories, and ideas today.",
      sources: [
        { title: "Wikipedia candidate page", url: "https://example.com/wiki", sourceType: "wikipedia" as const },
        { title: "Museum official history", url: "https://example.com/official", sourceType: "official" as const }
      ],
      safetyNotes: []
    }
  ]);

  return researchDossierSchema.parse({
    episodeDate: request.date,
    chosenSubject: candidate.subject,
    entityType: candidate.entityType,
    chosenAngle: candidate.angle,
    episodeThesis: candidate.thesis,
    timeline: candidate.timeline,
    storyBeats: candidate.storyBeats,
    modernRelevance: candidate.modernRelevance,
    sources: candidate.sources,
    safetyNotes: candidate.safetyNotes
  });
}
