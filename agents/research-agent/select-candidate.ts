export type Candidate = {
  subject: string;
  entityType: "person" | "event" | "object";
  angle: string;
  thesis: string;
  timeline: string[];
  storyBeats: string[];
  modernRelevance: string;
  sources: Array<{
    title: string;
    url: string;
    sourceType: "wikipedia" | "official" | "reference" | "archive" | "news";
  }>;
  safetyNotes: string[];
};

export function selectBestCandidate(candidates: Candidate[]) {
  const [first] = candidates;

  if (!first) {
    throw new Error("At least one candidate is required");
  }

  return first;
}
