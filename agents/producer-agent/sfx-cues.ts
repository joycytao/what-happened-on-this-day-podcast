import type { Transcript } from "../../src/contracts";

export type ProductionCue = {
  id: string;
  type: "sfx" | "bgm" | "pause";
  description: string;
  durationSeconds: number | null;
  placement: string;
  sourceText: string;
};

const cuePattern = /\[(SFX|BGM|PAUSE):\s*([^\]]+)\]/gi;
const durationPattern = /(?:^|,\s*)(\d+(?:\.\d+)?)\s*s(?:ec|econds?)?\b/i;

export function extractProductionCues(transcript: Transcript): ProductionCue[] {
  const cueSources = [
    { placement: "opening", text: transcript.opening },
    ...transcript.segments.map((segment: Transcript["segments"][number]) => ({
      placement: `segment: ${segment.heading}`,
      text: segment.body
    })),
    { placement: "closing", text: transcript.closing }
  ];

  let cueIndex = 0;
  const cues: ProductionCue[] = [];

  for (const { placement, text } of cueSources) {
    cuePattern.lastIndex = 0;
    let match: RegExpExecArray | null = cuePattern.exec(text);

    while (match) {
      cueIndex += 1;

      const type = normalizeCueType(match[1]);
      const rawInstruction = match[2].trim();

      cues.push({
        id: `cue-${cueIndex}`,
        type,
        description: describeCue(type, rawInstruction),
        durationSeconds: parseDuration(rawInstruction),
        placement,
        sourceText: match[0]
      });

      match = cuePattern.exec(text);
    }
  }

  return cues;
}

function normalizeCueType(type: string): ProductionCue["type"] {
  return type.toLowerCase() as ProductionCue["type"];
}

function describeCue(type: ProductionCue["type"], instruction: string) {
  if (type === "pause") return "pause";

  return instruction
    .split(",")[0]
    .trim()
    .replace(durationPattern, "")
    .trim();
}

function parseDuration(instruction: string) {
  const durationMatch = instruction.match(durationPattern);
  return durationMatch ? Number(durationMatch[1]) : null;
}
