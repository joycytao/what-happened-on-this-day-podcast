import { z } from "zod";

export const episodeRequestSchema = z.object({
  date: z.string(),
  episodeSlug: z.string(),
  language: z.literal("en"),
  audience: z.literal("children-first-adult-friendly"),
  durationTargetMin: z.number().min(10).max(15),
  durationMaxMin: z.literal(15),
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
  estimatedDurationMin: z.number().min(10).max(15),
  ttsNotes: z.array(z.string())
});

export const audioJobSchema = z.object({
  voicePreset: z.string(),
  sourceTranscriptPath: z.string(),
  outputAudioPath: z.string(),
  transcript: transcriptSchema
});

export type EpisodeRequest = z.infer<typeof episodeRequestSchema>;
export type ResearchDossier = z.infer<typeof researchDossierSchema>;
export type ResearchReferences = z.infer<typeof researchReferencesSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type AudioJob = z.infer<typeof audioJobSchema>;
