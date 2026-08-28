import fs from "node:fs/promises";
import path from "node:path";
import type { ResearchDossier } from "../../src/contracts";
import { buildTranscript } from "./build-transcript";
import type { Transcript } from "../../src/contracts";

export async function runWriterAgent(dossier: ResearchDossier, options: { runDir?: string } = {}) {
  const transcript = buildTranscript(dossier);

  if (options.runDir) {
    await writeTranscriptArtifact(transcript, options.runDir);
  }

  return transcript;
}

export async function writeTranscriptArtifact(transcript: Transcript, runDir: string) {
  const transcriptPath = path.join(runDir, "transcript.json");

  await fs.writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`, "utf8");

  return transcriptPath;
}
