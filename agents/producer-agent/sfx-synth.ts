import type { ResolvedProductionCue, SynthesisKind } from "./sfx-resolver.js";

const sampleRate = 8000;

export function synthesizeLocalSfx(cue: ResolvedProductionCue): Uint8Array {
  if (cue.status !== "resolved" || cue.sourceStrategy !== "local-synthesis" || !cue.synthesisKind) {
    throw new Error(`Cue ${cue.id} is not a local synthesis cue`);
  }

  return wavFromSamples(buildSamples(cue.synthesisKind, cue.durationSeconds ?? 1));
}

function buildSamples(kind: SynthesisKind, durationSeconds: number): Int16Array {
  const sampleCount = Math.max(1, Math.round(durationSeconds * sampleRate));
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const progress = index / sampleCount;
    samples[index] = floatToPcm(sample(kind, t, progress));
  }

  return samples;
}

function sample(kind: SynthesisKind, t: number, progress: number): number {
  switch (kind) {
    case "bell":
      return envelope(progress, 7) * (0.65 * sine(880, t) + 0.25 * sine(1320, t));
    case "clock-tick":
      return progress < 0.08 ? envelope(progress / 0.08, 18) * deterministicNoise(t) : 0;
    case "time-machine-hum":
      return 0.35 * (0.6 + 0.4 * sine(2, t)) * (sine(110, t) + 0.35 * sine(220, t));
    case "whoosh":
      return envelope(progress, 2) * deterministicNoise(t + progress) * (0.25 + progress * 0.65);
  }

  return 0;
}

function sine(frequency: number, t: number): number {
  return Math.sin(2 * Math.PI * frequency * t);
}

function envelope(progress: number, decay: number): number {
  return Math.exp(-decay * progress);
}

function deterministicNoise(seed: number): number {
  return Math.sin(seed * 127.1 + Math.sin(seed * 31.7) * 43758.5453);
}

function floatToPcm(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));

  return Math.round(clamped * 32767);
}

function wavFromSamples(samples: Int16Array): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  writeAscii(buffer, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(buffer, 8, "WAVE");
  writeAscii(buffer, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(buffer, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }

  return buffer;
}

function writeAscii(buffer: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    buffer[offset + index] = value.charCodeAt(index);
  }
}
