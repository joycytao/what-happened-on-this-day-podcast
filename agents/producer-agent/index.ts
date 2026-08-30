import path from "node:path";
import fs from "node:fs/promises";
import type { Transcript } from "../../src/contracts";
import { parseTranscriptMarkdown } from "../../src/contracts";
import { loadJsonConfig } from "../../src/lib/content-assets";
import { renderWithVoicebox, validateVoiceboxConfig } from "./voicebox-adapter";

export async function runProducerAgent(transcript: Transcript, outputDir: string) {
  const voicebox = validateVoiceboxConfig(await loadJsonConfig("voicebox"));

  return renderWithVoicebox({
    voicePreset: voicebox.voiceProfile ?? voicebox.voicePreset ?? "story-narrator-01",
    outputAudioPath: path.join(outputDir, "final.mp3"),
    transcript
  }, {
    config: voicebox
  });
}

export async function runProducerAgentFromTranscriptMarkdown(transcriptPath: string, outputDir: string) {
  const transcript = parseTranscriptMarkdown(await fs.readFile(transcriptPath, "utf8"));
  const voicebox = validateVoiceboxConfig(await loadJsonConfig("voicebox"));

  return renderWithVoicebox({
    voicePreset: voicebox.voiceProfile ?? voicebox.voicePreset ?? "story-narrator-01",
    sourceTranscriptPath: transcriptPath,
    outputAudioPath: path.join(outputDir, "final.mp3"),
    transcript
  }, {
    config: voicebox
  });
}
