import { runResearchAgent } from "../research-agent";
import { runWriterAgent } from "../writer-agent";
import { runProducerAgent } from "../producer-agent";
import { resolveEpisodeRequest } from "./github-issue";
import { createRunManifest } from "./run-manifest";

export { resolveEpisodeRequest, createRunManifest };

export async function runEpisodePipeline(input: {
  issueNumber?: number;
  brief?: { date: string; workingTitle: string };
}) {
  const date = input.brief?.date ?? "2026-08-19";
  const workingTitle = input.brief?.workingTitle ?? "daily episode";
  const episodeSlug = `${date}-${workingTitle.toLowerCase().replace(/\s+/g, "-")}`;

  const request = {
    date,
    episodeSlug,
    language: "en" as const,
    audience: "children-first-adult-friendly" as const,
    durationTargetMin: 12,
    durationMaxMin: 15 as const,
    currentStage: "ready" as const
  };

  const { runDir } = await createRunManifest(request);
  const dossier = await runResearchAgent({ ...request, currentStage: "researching" });
  const transcript = await runWriterAgent(dossier);
  await runProducerAgent(transcript, `${runDir}/audio`);

  return {
    runDir,
    finalStage: "review" as const
  };
}
