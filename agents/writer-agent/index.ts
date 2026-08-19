import type { ResearchDossier } from "../../src/contracts";
import { buildTranscript } from "./build-transcript";

export async function runWriterAgent(dossier: ResearchDossier) {
  return buildTranscript(dossier);
}
