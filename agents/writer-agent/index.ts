import fs from "node:fs/promises";
import path from "node:path";
import type { ResearchDossier } from "../../src/contracts";
import { serializeTranscriptMarkdown } from "../../src/contracts";
import { buildTranscript } from "./build-transcript";
import type { Transcript } from "../../src/contracts";

export type TranscriptQualityCheck = {
  status: "pass" | "fail";
  actual: number | boolean;
  expected: string;
};

export type TranscriptQualityReport = {
  status: "pass" | "fail";
  checks: Record<string, TranscriptQualityCheck>;
};

export async function runWriterAgent(dossier: ResearchDossier, options: { runDir?: string } = {}) {
  const transcript = buildTranscript(dossier);

  if (options.runDir) {
    await writeTranscriptMarkdownArtifact(transcript, options.runDir);
    await writeTranscriptArtifact(transcript, options.runDir);
    await writeTranscriptQualityReport(transcript, options.runDir);
  }

  return transcript;
}

export async function writeTranscriptArtifact(transcript: Transcript, runDir: string) {
  const transcriptPath = path.join(runDir, "transcript.json");

  await fs.writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`, "utf8");

  return transcriptPath;
}

export async function writeTranscriptMarkdownArtifact(transcript: Transcript, runDir: string) {
  const transcriptPath = path.join(runDir, "transcript.md");

  await fs.writeFile(transcriptPath, serializeTranscriptMarkdown(transcript), "utf8");

  return transcriptPath;
}

export async function writeTranscriptQualityReport(transcript: Transcript, runDir: string) {
  const reportPath = path.join(runDir, "transcript-quality-report.json");
  const report = evaluateTranscriptQuality(transcript);

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return reportPath;
}

export function evaluateTranscriptQuality(transcript: Transcript): TranscriptQualityReport {
  const scriptText = [transcript.opening, ...transcript.segments.map((segment: Transcript["segments"][number]) => segment.body), transcript.closing].join("\n");
  const sfxOrBgmCueCount = countMatches(scriptText, /\[(?:SFX|BGM):[^\]]+\]/gi);
  const attentionResetCount = countMatches(scriptText, /\[Action:[^\]]+\]/gi) + countMatches(scriptText, /\?/g);
  const secondPersonCount = countMatches(scriptText, /\b(?:you|your)\b/gi);
  const requiredCueCount = Math.ceil(transcript.estimatedDurationMin);
  const requiredAttentionResetCount = Math.max(2, Math.ceil(transcript.estimatedDurationMin / 3));
  const checks: Record<string, TranscriptQualityCheck> = {
    duration_5_to_8_min: buildCheck(
      transcript.estimatedDurationMin >= 5 && transcript.estimatedDurationMin <= 8,
      transcript.estimatedDurationMin,
      "estimatedDurationMin is between 5 and 8"
    ),
    five_module_structure: buildCheck(
      hasFiveModuleStructure(transcript),
      transcript.segments.length,
      "five Time Machine Adventure modules are present"
    ),
    sfx_or_bgm_density: buildCheck(
      sfxOrBgmCueCount >= requiredCueCount,
      sfxOrBgmCueCount,
      `at least ${requiredCueCount} [SFX] or [BGM] cues for ${transcript.estimatedDurationMin} minutes`
    ),
    attention_resets: buildCheck(
      attentionResetCount >= requiredAttentionResetCount,
      attentionResetCount,
      `at least ${requiredAttentionResetCount} [Action] prompts or direct questions`
    ),
    direct_second_person_address: buildCheck(
      secondPersonCount >= 10,
      secondPersonCount,
      "at least 10 uses of you/your"
    ),
    pronunciation_notes: buildCheck(
      transcript.ttsNotes.some((note: string) => /pronunciation|phonetic/i.test(note)),
      transcript.ttsNotes.length,
      "ttsNotes include pronunciation or phonetic support"
    )
  };

  return {
    status: Object.values(checks).every((check) => check.status === "pass") ? "pass" : "fail",
    checks
  };
}

function buildCheck(passed: boolean, actual: number | boolean, expected: string): TranscriptQualityCheck {
  return {
    status: passed ? "pass" : "fail",
    actual,
    expected
  };
}

function hasFiveModuleStructure(transcript: Transcript) {
  const headings = transcript.segments.map((segment) => segment.heading.toLowerCase());
  const requiredModules = [
    "time machine hook",
    "narrative drama",
    "scientific deep-dive",
    "modern world twist",
    "outro & mission"
  ];

  return requiredModules.every((requiredModule) => headings.some((heading) => heading.includes(requiredModule)));
}

function countMatches(input: string, pattern: RegExp) {
  return input.match(pattern)?.length ?? 0;
}
