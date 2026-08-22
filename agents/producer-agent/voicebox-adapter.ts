import fs from "node:fs/promises";
import path from "node:path";
import type { AudioJob } from "../../src/contracts";
import { extractProductionCues } from "./sfx-cues";

export async function renderWithVoicebox(job: Pick<AudioJob, "voicePreset" | "outputAudioPath" | "transcript">) {
  const outputDir = path.dirname(job.outputAudioPath);
  const metadataPath = path.join(outputDir, "render-metadata.json");
  const sfxManifestPath = path.join(outputDir, "sfx-manifest.json");
  const cues = extractProductionCues(job.transcript);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(job.outputAudioPath, "VOICEBOX_STUB_AUDIO\n", "utf8");
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        engine: "voicebox",
        voicePreset: job.voicePreset,
        segmentCount: job.transcript.segments.length
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await fs.writeFile(
    sfxManifestPath,
    `${JSON.stringify(
      {
        strategy: "voicebox-narration-with-external-sfx",
        voiceboxRole: "speech-generation",
        cueCount: cues.length,
        cues
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    audioPath: job.outputAudioPath,
    metadataPath,
    sfxManifestPath
  };
}
