import fs from "node:fs/promises";
import path from "node:path";
import type { EpisodeRequest } from "../../src/contracts";
import { resolveRepoPaths } from "../../src/lib/fs-paths";

export async function createRunManifest(request: EpisodeRequest) {
  const { runsDir } = resolveRepoPaths();
  const runDir = path.join(runsDir, request.episodeSlug);
  const manifestPath = path.join(runDir, "episode-request.json");

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

  return { runDir, manifestPath };
}
