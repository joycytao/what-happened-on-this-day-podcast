import type { ProductionCue } from "./sfx-cues.js";

export type SynthesisKind = "bell" | "clock-tick" | "time-machine-hum" | "whoosh";

export type ResolvedProductionCue = ProductionCue & {
  status: "resolved" | "unresolved";
  sourceStrategy: "local-synthesis" | "silence" | "unsupported-cue";
  synthesisKind: SynthesisKind | null;
  fallbackStatus: "none" | "needs-sfx-library-or-provider";
  audioArtifact: string | null;
};

type SfxPreset = {
  kind: SynthesisKind;
  defaultDurationSeconds: number;
};

const sfxPresets: Array<{ pattern: RegExp; preset: SfxPreset }> = [
  { pattern: /\b(time\s*machine|machine\s*hum|hum)\b/i, preset: { kind: "time-machine-hum", defaultDurationSeconds: 2 } },
  { pattern: /\b(clock|tick|ticking)\b/i, preset: { kind: "clock-tick", defaultDurationSeconds: 0.6 } },
  { pattern: /\b(whoosh|swoosh|riser|sweep)\b/i, preset: { kind: "whoosh", defaultDurationSeconds: 1 } },
  { pattern: /\b(bell|chime|ding)\b/i, preset: { kind: "bell", defaultDurationSeconds: 1.2 } }
];

export function resolveProductionCues(cues: ProductionCue[]): ResolvedProductionCue[] {
  return cues.map(resolveProductionCue);
}

function resolveProductionCue(cue: ProductionCue): ResolvedProductionCue {
  if (cue.type === "pause") {
    return {
      ...cue,
      durationSeconds: cue.durationSeconds ?? 1,
      status: "resolved",
      sourceStrategy: "silence",
      synthesisKind: null,
      fallbackStatus: "none",
      audioArtifact: null
    };
  }

  if (cue.type === "sfx") {
    const preset = matchPreset(cue.description);

    if (preset) {
      const durationSeconds = cue.durationSeconds ?? preset.defaultDurationSeconds;

      return {
        ...cue,
        durationSeconds,
        status: "resolved",
        sourceStrategy: "local-synthesis",
        synthesisKind: preset.kind,
        fallbackStatus: "none",
        audioArtifact: `sfx/${cue.id}-${preset.kind}.wav`
      };
    }
  }

  return {
    ...cue,
    status: "unresolved",
    sourceStrategy: "unsupported-cue",
    synthesisKind: null,
    fallbackStatus: "needs-sfx-library-or-provider",
    audioArtifact: null
  };
}

function matchPreset(description: string): SfxPreset | null {
  const normalizedDescription = description.trim().toLowerCase();
  const match = sfxPresets.find(({ pattern }) => pattern.test(normalizedDescription));

  return match?.preset ?? null;
}
