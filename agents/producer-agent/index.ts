import path from "node:path";
import type { Transcript } from "../../src/contracts";
import { loadJsonConfig } from "../../src/lib/content-assets";
import { renderWithVoicebox } from "./voicebox-adapter";

export async function runProducerAgent(transcript: Transcript, outputDir: string) {
  const voicebox = await loadJsonConfig<{ voicePreset: string }>("voicebox");

  return renderWithVoicebox({
    voicePreset: voicebox.voicePreset,
    outputAudioPath: path.join(outputDir, "final.mp3"),
    transcript
  });
}
