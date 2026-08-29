import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AudioJob, Transcript } from "../../src/contracts";
import { extractProductionCues } from "./sfx-cues.js";
import { resolveProductionCues, type ResolvedProductionCue } from "./sfx-resolver.js";
import { synthesizeLocalSfx } from "./sfx-synth.js";

const voiceboxConfigSchema = z.object({
  engine: z.literal("voicebox"),
  mode: z.enum(["dry-run", "production"]).default("dry-run"),
  baseUrl: z.string().url().optional(),
  endpoint: z.enum(["speak", "generate"]).default("speak"),
  clientId: z.string().min(1).default("what-happened-on-this-day-producer"),
  ttsEngine: z.string().min(1).default("qwen_custom_voice"),
  modelSize: z.string().min(1).default("1.7B"),
  voicePreset: z.string().min(1).optional(),
  voiceProfile: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  seed: z.number().int().optional(),
  instruct: z.string().min(1).optional(),
  language: z.literal("en").default("en"),
  outputFormat: z.literal("mp3").default("mp3"),
  enableVoiceCloning: z.boolean().default(false),
  maxChunkChars: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(120000),
  pollIntervalMs: z.number().int().positive().default(1000)
}).superRefine((config, context) => {
  if (config.mode === "production" && !config.baseUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["baseUrl"],
      message: "baseUrl is required for production Voicebox renders."
    });
  }

  if (config.mode === "production" && config.endpoint === "speak" && !resolveVoiceProfile(config)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["voiceProfile"],
      message: "voiceProfile is required for production Voicebox speak renders."
    });
  }

  if (config.mode === "production" && config.endpoint === "generate" && !config.profileId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["profileId"],
      message: "profileId is required for production Voicebox generate renders."
    });
  }
});

export type VoiceboxConfig = z.infer<typeof voiceboxConfigSchema>;

export type VoiceboxRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

type VoiceboxRenderOptions = {
  config?: VoiceboxConfig;
  fetch?: typeof fetch;
  sleep?: (durationMs: number) => Promise<void>;
};

type VoiceboxRenderJob = Pick<AudioJob, "voicePreset" | "outputAudioPath" | "transcript"> &
  Partial<Pick<AudioJob, "sourceTranscriptPath">>;

type VoiceboxResponsePayload = {
  generation_id?: string;
  generationId?: string;
  id?: string;
  poll_url?: string;
  pollUrl?: string;
  status_url?: string;
  statusUrl?: string;
  audio_path?: string;
  audioPath?: string;
  output_path?: string;
  outputPath?: string;
  audio_url?: string;
  audioUrl?: string;
  download_url?: string;
  downloadUrl?: string;
  url?: string;
  audio_base64?: string;
  audioBase64?: string;
  status?: string;
  error?: string;
};

const productionCuePattern = /\[(?:SFX|BGM|PAUSE|Voice|Action):?\s*[^\]]+\]/gi;

export function validateVoiceboxConfig(input: unknown): VoiceboxConfig {
  return voiceboxConfigSchema.parse(input);
}

export function prepareNarrationText(transcript: Pick<Transcript, "opening" | "segments" | "closing">) {
  return [transcript.opening, ...transcript.segments.map((segment: Transcript["segments"][number]) => segment.body), transcript.closing]
    .map((part) => part.replace(productionCuePattern, ""))
    .map((part) =>
      part
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean)
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function buildVoiceboxRequest(config: VoiceboxConfig, narrationText: string): VoiceboxRequest {
  const baseUrl = requiredBaseUrl(config);
  const endpointPath = config.endpoint === "generate" ? "generate" : "speak";
  const headers = {
    "Content-Type": "application/json",
    "X-Voicebox-Client-Id": config.clientId
  };

  if (config.endpoint === "generate") {
    return {
      url: new URL(endpointPath, `${baseUrl}/`).toString(),
      headers,
      body: {
        profile_id: config.profileId,
        text: narrationText,
        language: config.language,
        seed: config.seed,
        model_size: config.modelSize,
        instruct: config.instruct,
        engine: config.ttsEngine,
        max_chunk_chars: config.maxChunkChars
      }
    };
  }

  return {
    url: new URL(endpointPath, `${baseUrl}/`).toString(),
    headers,
    body: {
      text: narrationText,
      profile: resolveVoiceProfile(config),
      engine: config.ttsEngine,
      personality: false,
      language: config.language
    }
  };
}

export async function renderWithVoicebox(
  job: VoiceboxRenderJob,
  options: VoiceboxRenderOptions = {}
) {
  const config = options.config ?? validateVoiceboxConfig({
    engine: "voicebox",
    mode: "dry-run",
    voicePreset: job.voicePreset,
    outputFormat: "mp3",
    enableVoiceCloning: false
  });
  const outputDir = path.dirname(job.outputAudioPath);
  const metadataPath = path.join(outputDir, "render-metadata.json");
  const sfxManifestPath = path.join(outputDir, "sfx-manifest.json");
  const cues: ResolvedProductionCue[] = resolveProductionCues(extractProductionCues(job.transcript));
  const renderedCueArtifacts = cues.filter(isLocalSynthesisCue);
  const unresolvedCueCount = cues.filter((cue: ResolvedProductionCue) => cue.status === "unresolved").length;
  const narrationText = prepareNarrationText(job.transcript);

  await fs.mkdir(outputDir, { recursive: true });
  await writeLocalSfxArtifacts(outputDir, renderedCueArtifacts);
  await writeSfxManifest(sfxManifestPath, cues, unresolvedCueCount);

  if (config.mode === "production") {
    return renderProductionVoicebox({
      config,
      job,
      narrationText,
      metadataPath,
      sfxManifestPath,
      cues,
      renderedCueArtifacts,
      unresolvedCueCount,
      fetchImpl: options.fetch ?? fetch,
      sleep: options.sleep ?? defaultSleep
    });
  }

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
        sourceTranscriptPath: job.sourceTranscriptPath,
        segmentCount: job.transcript.segments.length,
        voicebox: {
          status: "dry-run",
          mode: "dry-run",
          endpoint: null,
          ttsEngine: null,
          voiceProfile: resolveVoiceProfile(config),
          narrationText,
          fallbackStatus: "stub-audio"
        },
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

  return {
    audioPath: job.outputAudioPath,
    metadataPath,
    sfxManifestPath
  };
}

async function renderProductionVoicebox(input: {
  config: VoiceboxConfig;
  job: VoiceboxRenderJob;
  narrationText: string;
  metadataPath: string;
  sfxManifestPath: string;
  cues: ResolvedProductionCue[];
  renderedCueArtifacts: Array<ResolvedProductionCue & { audioArtifact: string }>;
  unresolvedCueCount: number;
  fetchImpl: typeof fetch;
  sleep: (durationMs: number) => Promise<void>;
}) {
  const startedAt = new Date().toISOString();
  const request = buildVoiceboxRequest(input.config, input.narrationText);

  try {
    const initialPayload = await postVoiceboxRequest(request, input.fetchImpl);
    const finalPayload = await resolveFinalVoiceboxPayload(initialPayload, input.config, input.fetchImpl, input.sleep);
    const audioBytes = await readVoiceboxAudio(finalPayload, input.config, input.fetchImpl);

    await fs.writeFile(input.job.outputAudioPath, audioBytes);
    await writeRenderMetadata(input.metadataPath, {
      job: input.job,
      config: input.config,
      request,
      narrationText: input.narrationText,
      status: "succeeded",
      startedAt,
      sourcePayload: finalPayload,
      cues: input.cues,
      renderedCueArtifacts: input.renderedCueArtifacts,
      unresolvedCueCount: input.unresolvedCueCount,
      sourceAudioPath: findAudioPath(finalPayload)
    });

    return {
      audioPath: input.job.outputAudioPath,
      metadataPath: input.metadataPath,
      sfxManifestPath: input.sfxManifestPath
    };
  } catch (error) {
    await writeRenderMetadata(input.metadataPath, {
      job: input.job,
      config: input.config,
      request,
      narrationText: input.narrationText,
      status: "failed",
      startedAt,
      error: error instanceof Error ? error.message : String(error),
      cues: input.cues,
      renderedCueArtifacts: input.renderedCueArtifacts,
      unresolvedCueCount: input.unresolvedCueCount
    });

    throw new Error(`Voicebox REST request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function postVoiceboxRequest(request: VoiceboxRequest, fetchImpl: typeof fetch): Promise<VoiceboxResponsePayload> {
  const response = await fetchImpl(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(removeUndefinedValues(request.body))
  });

  return parseVoiceboxResponse(response);
}

async function parseVoiceboxResponse(response: Response): Promise<VoiceboxResponsePayload> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload: VoiceboxResponsePayload = contentType.includes("application/json")
    ? ((await response.json()) as VoiceboxResponsePayload)
    : { audioBase64: encodeBase64(new Uint8Array(await response.arrayBuffer())) };

  if (!response.ok) {
    throw new Error(payload.error ?? `Voicebox returned HTTP ${response.status}`);
  }

  return payload;
}

async function resolveFinalVoiceboxPayload(
  payload: VoiceboxResponsePayload,
  config: VoiceboxConfig,
  fetchImpl: typeof fetch,
  sleep: (durationMs: number) => Promise<void>
): Promise<VoiceboxResponsePayload> {
  let currentPayload = payload;
  const deadline = Date.now() + config.timeoutMs;

  while (isPendingPayload(currentPayload)) {
    const pollUrl = resolvePollUrl(currentPayload, config);
    if (!pollUrl) return currentPayload;
    if (Date.now() >= deadline) {
      throw new Error(`Voicebox generation timed out after ${config.timeoutMs}ms`);
    }

    await sleep(config.pollIntervalMs);
    currentPayload = await parseVoiceboxResponse(await fetchImpl(pollUrl, { method: "GET" }));
  }

  if (currentPayload.status && /fail|error/i.test(currentPayload.status)) {
    throw new Error(currentPayload.error ?? `Voicebox generation failed with status ${currentPayload.status}`);
  }

  return currentPayload;
}

async function readVoiceboxAudio(
  payload: VoiceboxResponsePayload,
  config: VoiceboxConfig,
  fetchImpl: typeof fetch
): Promise<Uint8Array> {
  const audioPath = findAudioPath(payload);
  if (audioPath) {
    return fs.readFile(audioPath);
  }

  const audioBase64 = payload.audio_base64 ?? payload.audioBase64;
  if (audioBase64) {
    return decodeBase64(audioBase64);
  }

  const audioUrl = findAudioUrl(payload, config);
  if (audioUrl) {
    const response = await fetchImpl(audioUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Voicebox audio download returned HTTP ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  throw new Error("Voicebox response did not include an audio path, audio URL, or base64 audio payload.");
}

async function writeSfxManifest(
  sfxManifestPath: string,
  cues: ResolvedProductionCue[],
  unresolvedCueCount: number
) {
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
}

async function writeRenderMetadata(
  metadataPath: string,
  input: {
    job: VoiceboxRenderJob;
    config: VoiceboxConfig;
    request: VoiceboxRequest;
    narrationText: string;
    status: "succeeded" | "failed";
    startedAt: string;
    sourcePayload?: VoiceboxResponsePayload;
    error?: string;
    cues: ResolvedProductionCue[];
    renderedCueArtifacts: Array<ResolvedProductionCue & { audioArtifact: string }>;
    unresolvedCueCount: number;
    sourceAudioPath?: string;
  }
) {
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        engine: "voicebox",
        voicePreset: input.job.voicePreset,
        sourceTranscriptPath: input.job.sourceTranscriptPath,
        segmentCount: input.job.transcript.segments.length,
        voicebox: {
          status: input.status,
          mode: input.config.mode,
          endpoint: input.config.endpoint,
          baseUrl: input.config.baseUrl,
          clientId: input.config.clientId,
          ttsEngine: input.config.ttsEngine,
          modelSize: input.config.modelSize,
          voiceProfile: resolveVoiceProfile(input.config),
          profileId: input.config.profileId,
          seed: input.config.seed,
          instruct: input.config.instruct,
          language: input.config.language,
          generationId: input.sourcePayload ? findGenerationId(input.sourcePayload) : undefined,
          sourceAudioPath: input.sourceAudioPath,
          outputAudioPath: input.job.outputAudioPath,
          narrationText: input.narrationText,
          fallbackStatus: input.status === "succeeded" ? "none" : "voicebox-unavailable",
          error: input.error,
          startedAt: input.startedAt
        },
        voiceboxRequest: {
          url: input.request.url,
          headers: input.request.headers,
          body: removeUndefinedValues(input.request.body)
        },
        mixer: {
          strategy: "voicebox-narration-source-with-deterministic-sfx-manifest",
          finalAudioPath: input.job.outputAudioPath,
          narrationRole: "voicebox-speech-generation",
          cueTrackCount: input.cues.length,
          renderedCueArtifactCount: input.renderedCueArtifacts.length,
          unresolvedCueCount: input.unresolvedCueCount
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function requiredBaseUrl(config: VoiceboxConfig) {
  if (!config.baseUrl) throw new Error("baseUrl is required for production Voicebox renders.");

  return config.baseUrl.replace(/\/+$/, "");
}

function resolveVoiceProfile(config: Pick<VoiceboxConfig, "voiceProfile" | "voicePreset">) {
  return config.voiceProfile ?? config.voicePreset;
}

function resolvePollUrl(payload: VoiceboxResponsePayload, config: VoiceboxConfig) {
  const pollUrl = payload.poll_url ?? payload.pollUrl ?? payload.status_url ?? payload.statusUrl;
  if (!pollUrl) return null;

  return new URL(pollUrl, `${requiredBaseUrl(config)}/`).toString();
}

function isPendingPayload(payload: VoiceboxResponsePayload) {
  return Boolean(resolvePendingStatus(payload.status));
}

function resolvePendingStatus(status: string | undefined) {
  if (!status) return null;

  return /pending|queued|running|processing|started/i.test(status) ? status : null;
}

function findAudioPath(payload: VoiceboxResponsePayload) {
  return payload.audio_path ?? payload.audioPath ?? payload.output_path ?? payload.outputPath;
}

function findAudioUrl(payload: VoiceboxResponsePayload, config: VoiceboxConfig) {
  const audioUrl = payload.audio_url ?? payload.audioUrl ?? payload.download_url ?? payload.downloadUrl ?? payload.url;
  if (!audioUrl) return null;

  return new URL(audioUrl, `${requiredBaseUrl(config)}/`).toString();
}

function findGenerationId(payload: VoiceboxResponsePayload) {
  return payload.generation_id ?? payload.generationId ?? payload.id;
}

function removeUndefinedValues(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function defaultSleep(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
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
