import fs from "node:fs/promises";
import path from "node:path";
import type { AudioJob } from "../../src/contracts";

export async function renderWithVoicebox(job: Pick<AudioJob, "voicePreset" | "outputAudioPath" | "transcript">) {
  const outputDir = path.dirname(job.outputAudioPath);
  const metadataPath = path.join(outputDir, "render-metadata.json");

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

  return {
    audioPath: job.outputAudioPath,
    metadataPath
  };
}
