import { z } from "zod";

export const episodeRequestSchema = z.object({
  date: z.string(),
  episodeSlug: z.string(),
  language: z.literal("en"),
  audience: z.literal("children-first-adult-friendly"),
  durationTargetMin: z.number().min(5).max(8),
  durationMaxMin: z.literal(8),
  selectedAngle: z.string().optional(),
  entityType: z.enum(["person", "event", "object"]).optional(),
  currentStage: z.enum(["ready", "researching", "writing", "producing", "review", "done", "blocked"])
});

export const researchDossierSchema = z.object({
  episodeDate: z.string(),
  chosenSubject: z.string(),
  entityType: z.enum(["person", "event", "object"]),
  chosenAngle: z.string(),
  episodeThesis: z.string(),
  timeline: z.array(z.string()).min(3),
  storyBeats: z.array(z.string()).min(3),
  modernRelevance: z.string(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      sourceType: z.enum(["wikipedia", "official", "reference", "archive", "news"])
    })
  ).min(1),
  safetyNotes: z.array(z.string())
});

export const researchSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  sourceType: z.enum(["wikipedia", "official", "reference", "archive", "news"])
});

export const researchReferencesSchema = z.object({
  episodeDate: z.string(),
  chosenSubject: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      summary: z.string().min(1),
      source: researchSourceSchema
    })
  ).min(1)
});

export const transcriptSchema = z.object({
  opening: z.string(),
  segments: z.array(
    z.object({
      heading: z.string(),
      body: z.string()
    })
  ).min(1),
  closing: z.string(),
  estimatedDurationMin: z.number().min(5).max(8),
  ttsNotes: z.array(z.string())
});

export const writerArtifactPaths = [
  "transcript.md",
  "transcript.json",
  "transcript-quality-report.json"
] as const;

export const writerArtifactContractSchema = z.object({
  requiredArtifacts: z.tuple([
    z.literal("transcript.md"),
    z.literal("transcript.json"),
    z.literal("transcript-quality-report.json")
  ]),
  canonicalArtifact: z.literal("transcript.md"),
  machineReadableArtifact: z.literal("transcript.json"),
  qualityReportArtifact: z.literal("transcript-quality-report.json")
});

export const audioJobSchema = z.object({
  voicePreset: z.string(),
  sourceTranscriptPath: z.string(),
  outputAudioPath: z.string(),
  transcript: transcriptSchema
});

type MarkdownSection = {
  heading: string;
  body: string;
};

const transcriptMarkdownHeadingPattern = /^##\s+(.+?)\s*$/gm;
const transcriptMarkdownDurationPattern = /^Estimated duration:\s*(\d+(?:\.\d+)?)\s*minutes?\s*$/im;

export function serializeTranscriptMarkdown(transcript: Transcript) {
  const lines = [
    "# Transcript",
    "",
    `Estimated duration: ${transcript.estimatedDurationMin} minutes`,
    "",
    "## Opening",
    "",
    transcript.opening.trim(),
    ""
  ];

  for (const segment of transcript.segments) {
    lines.push(`## ${segment.heading}`, "", segment.body.trim(), "");
  }

  lines.push("## Closing", "", transcript.closing.trim(), "", "## TTS Notes", "");

  for (const note of transcript.ttsNotes) {
    lines.push(`- ${note}`);
  }

  lines.push("");

  return lines.join("\n");
}

export function parseTranscriptMarkdown(markdown: string) {
  const durationMatch = markdown.match(transcriptMarkdownDurationPattern);

  if (!durationMatch) {
    throw new Error("Transcript markdown is missing estimated duration");
  }

  const sections = parseTranscriptMarkdownSections(markdown);
  const opening = requiredTranscriptMarkdownSection(sections, "Opening");
  const closing = requiredTranscriptMarkdownSection(sections, "Closing");
  const ttsNotesSection = requiredTranscriptMarkdownSection(sections, "TTS Notes");
  const segments = sections
    .filter((section) => !["opening", "closing", "tts notes"].includes(normalizeTranscriptMarkdownHeading(section.heading)))
    .map((section) => ({
      heading: section.heading,
      body: section.body.trim()
    }));

  try {
    return transcriptSchema.parse({
      opening: opening.body.trim(),
      segments,
      closing: closing.body.trim(),
      estimatedDurationMin: Number(durationMatch[1]),
      ttsNotes: parseTranscriptMarkdownListItems(ttsNotesSection.body)
    });
  } catch (error) {
    throw new Error(
      `Transcript markdown failed schema validation${error instanceof Error ? `: ${error.message}` : ""}`
    );
  }
}

export type EpisodeRequest = z.infer<typeof episodeRequestSchema>;
export type ResearchDossier = z.infer<typeof researchDossierSchema>;
export type ResearchReferences = z.infer<typeof researchReferencesSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type WriterArtifactContract = z.infer<typeof writerArtifactContractSchema>;
export type AudioJob = z.infer<typeof audioJobSchema>;

function parseTranscriptMarkdownSections(markdown: string) {
  const matches = [...markdown.matchAll(transcriptMarkdownHeadingPattern)];

  return matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = nextMatch?.index ?? markdown.length;

    return {
      heading: match[1].trim(),
      body: markdown.slice(bodyStart, bodyEnd).trim()
    } satisfies MarkdownSection;
  });
}

function requiredTranscriptMarkdownSection(sections: MarkdownSection[], heading: string) {
  const section = sections.find(
    (candidate) => normalizeTranscriptMarkdownHeading(candidate.heading) === normalizeTranscriptMarkdownHeading(heading)
  );

  if (!section) {
    throw new Error(`Transcript markdown is missing required section: ${heading}`);
  }

  return section;
}

function parseTranscriptMarkdownListItems(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function normalizeTranscriptMarkdownHeading(heading: string) {
  return heading.trim().toLowerCase();
}
