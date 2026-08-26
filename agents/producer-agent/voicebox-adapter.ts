import fs from "node:fs/promises";
import path from "node:path";
import type { AudioJob } from "../../src/contracts";
import { extractProductionCues } from "./sfx-cues.js";
import { resolveProductionCues, type ResolvedProductionCue } from "./sfx-resolver.js";
import { synthesizeLocalSfx } from "./sfx-synth.js";

export async function renderWithVoicebox(job: Pick<AudioJob, "voicePreset" | "outputAudioPath" | "transcript">) {
  const outputDir = path.dirname(job.outputAudioPath);
  const metadataPath = path.join(outputDir, "render-metadata.json");
  const sfxManifestPath = path.join(outputDir, "sfx-manifest.json");
  const cues: ResolvedProductionCue[] = resolveProductionCues(extractProductionCues(job.transcript));
  const renderedCueArtifacts = cues.filter(isLocalSynthesisCue);
  const unresolvedCueCount = cues.filter((cue: ResolvedProductionCue) => cue.status === "unresolved").length;

  await fs.mkdir(outputDir, { recursive: true });
  await writeLocalSfxArtifacts(outputDir, renderedCueArtifacts);
  await fs.writeFile(
    job.outputAudioPath,
    `MIXED_AUDIO_STUB\n${JSON.stringify(
      {
        narration: "VOICEBOX_STUB_AUDIO",
        cues: cues.map((cue: ResolvedProductionCue) => ({
          id: cue.id,
          status: cue.status,
          sourceStrategy: cue.sourceStrategy,
          audioArtifact: cue.audioArtifact
        }))
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        engine: "voicebox",
        voicePreset: job.voicePreset,
        segmentCount: job.transcript.segments.length,
        mixer: {
          strategy: "deterministic-local-sfx-stub-mix",
          finalAudioPath: job.outputAudioPath,
          narrationRole: "voicebox-speech-generation",
          cueTrackCount: cues.length,
          renderedCueArtifactCount: renderedCueArtifacts.length,
          unresolvedCueCount
        }
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
        strategy: "voicebox-narration-with-deterministic-sfx-mix",
        voiceboxRole: "speech-generation",
        cueCount: cues.length,
        resolvedCueCount: cues.length - unresolvedCueCount,
        unresolvedCueCount,
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

function isLocalSynthesisCue(cue: ResolvedProductionCue): cue is ResolvedProductionCue & { audioArtifact: string } {
  return cue.status === "resolved" && cue.sourceStrategy === "local-synthesis" && cue.audioArtifact !== null;
}

async function writeLocalSfxArtifacts(outputDir: string, cues: Array<ResolvedProductionCue & { audioArtifact: string }>) {
  await Promise.all(
    cues.map(async (cue) => {
      await fs.mkdir(path.join(outputDir, path.dirname(cue.audioArtifact)), { recursive: true });
      await fs.writeFile(path.join(outputDir, cue.audioArtifact), synthesizeLocalSfx(cue));
    })
  );
}
