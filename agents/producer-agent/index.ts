import path from "node:path";
import type { Transcript } from "../../src/contracts";
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
