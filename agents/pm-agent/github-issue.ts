import { episodeRequestSchema } from "../../src/contracts";

export function resolveEpisodeRequest(issue: {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
}) {
  const fields = Object.fromEntries(
    issue.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(":"))
      .map((line) => {
        const [key, ...rest] = line.split(":");
        return [key.trim(), rest.join(":").trim()];
      })
  );

  return episodeRequestSchema.parse({
    date: fields.date,
    episodeSlug: fields.episode_slug,
    language: fields.language ?? "en",
    audience: fields.audience ?? "children-first-adult-friendly",
    durationTargetMin: Number(fields.duration_target_min ?? 12),
    durationMaxMin: 15,
    selectedAngle: fields.selected_angle || undefined,
    entityType: fields.entity_type || undefined,
    currentStage: fields.current_stage ?? "ready"
  });
}
