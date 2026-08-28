import { describe, expect, it } from "vitest";
import { runEpisodePipeline } from "../../agents/pm-agent";
import { writeTranscriptArtifact, writeTranscriptQualityReport } from "../../agents/writer-agent";
import type { Transcript } from "../../src/contracts";

type EpisodeIssueDraft = { title: string; body: string; labels: string[] };

describe("pm dry run", () => {
  it("blocks producer handoff when writer transcript fails the podcast script standard", async () => {
    let producerCallCount = 0;

    await expect(runEpisodePipeline(
      {
        brief: {
          date: "2026-08-21",
          workingTitle: "Writer Quality Gate"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => ({
          issueNumber: 21,
          title: draft.title,
          body: draft.body,
          labels: draft.labels
        }),
        runWriterAgent: async (_dossier, options) => {
          const transcript: Transcript = {
            opening: "Good morning. Today we talk about a computer.",
            segments: [
              {
                heading: "A short note",
                body: "Windows 95 had a Start button."
              }
            ],
            closing: "That is the story.",
            estimatedDurationMin: 5,
            ttsNotes: []
          };

          if (options?.runDir) {
            await writeTranscriptArtifact(transcript, options.runDir);
            await writeTranscriptQualityReport(transcript, options.runDir);
          }

          return transcript;
        },
        runProducerAgent: async () => {
          producerCallCount += 1;

          throw new Error("Producer should not run with a failed writer quality report.");
        }
      }
    )).rejects.toThrow("Writer transcript quality gate failed");

    expect(producerCallCount).toBe(0);
  });

  it("blocks producer handoff when writer transcript artifact is missing", async () => {
    let producerCallCount = 0;

    await expect(runEpisodePipeline(
      {
        brief: {
          date: "2026-08-20",
          workingTitle: "Writer Artifact Gate"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => ({
          issueNumber: 20,
          title: draft.title,
          body: draft.body,
          labels: draft.labels
        }),
        runWriterAgent: async () => ({
          opening: "A test opening for the writer artifact gate.",
          segments: [
            {
              heading: "A test segment",
              body: "A test body for the writer artifact gate."
            }
          ],
          closing: "A test closing for the writer artifact gate.",
          estimatedDurationMin: 5,
          ttsNotes: []
        }),
        runProducerAgent: async () => {
          producerCallCount += 1;

          throw new Error("Producer should not run without transcript.json.");
        }
      }
    )).rejects.toThrow("Writer transcript artifact is incomplete");

    expect(producerCallCount).toBe(0);
  });

  it("blocks dry-run audio before review", async () => {
    await expect(runEpisodePipeline(
      {
        brief: {
          date: "2026-08-19",
          workingTitle: "A Museum Opens"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => ({
          issueNumber: 19,
          title: draft.title,
          body: draft.body,
          labels: draft.labels
        }),
        runWriterAgent: writePassingTranscript
      }
    )).rejects.toThrow("Episode audio is not reviewable");
  });

  it("creates an episode issue before passing the request downstream and does not review dry-run audio", async () => {
    const createdIssueDrafts: Array<{ title: string; body: string; labels: string[] }> = [];
    const contextUpdates: Array<{ currentStage?: string; outputRunPath?: string }> = [];
    const uploadedResearchPackages: Array<{ issueNumber: number; runDir: string }> = [];

    await expect(runEpisodePipeline(
      {
        brief: {
          date: "2026-08-24",
          workingTitle: "daily episode"
        }
      },
      {
        createEpisodeIssue: async (draft: EpisodeIssueDraft) => {
          createdIssueDrafts.push(draft);

          return {
            issueNumber: 24,
            title: draft.title,
            body: draft.body.replace("episode_slug: 2026-08-24-daily-episode", "episode_slug: 2026-08-24-created-on-github"),
            labels: draft.labels
          };
        },
        updateEpisodeIssueContext: async (issue, updates) => {
          contextUpdates.push(updates);
          return issue;
        },
        uploadResearchPackage: async ({ issue, runDir }) => {
          uploadedResearchPackages.push({ issueNumber: issue.issueNumber, runDir });
        }
      }
    )).rejects.toThrow("Writer transcript quality gate failed");

    expect(createdIssueDrafts[0]).toMatchObject({
      title: "Episode: August 24, 2026 - daily episode",
      labels: ["type:episode", "status:ready"]
    });
    expect(contextUpdates).toEqual([
      {
        currentStage: "researching",
        outputRunPath: "runs/2026-08-24-created-on-github"
      },
      {
        currentStage: "writing",
        outputRunPath: "runs/2026-08-24-created-on-github"
      }
    ]);
    expect(contextUpdates.some((update) => update.currentStage === "review")).toBe(false);
    expect(uploadedResearchPackages).toEqual([
      {
        issueNumber: 24,
        runDir: expect.stringContaining("runs/2026-08-24-created-on-github")
      }
    ]);
  });
});

async function writePassingTranscript(_dossier: unknown, options?: { runDir?: string }) {
  const transcript = buildPassingTranscript();

  if (options?.runDir) {
    await writeTranscriptArtifact(transcript, options.runDir);
    await writeTranscriptQualityReport(transcript, options.runDir);
  }

  return transcript;
}

function buildPassingTranscript(): Transcript {
  return {
    opening: "[SFX: time machine hum, 2s]\nReady for a mystery you can test with your own eyes?",
    segments: [
      {
        heading: "Time Machine Hook",
        body: "[BGM: curious pulse, under narration]\nYou press the glowing button. Your time machine lands outside a busy computer store. You hear a question: why are people waiting at midnight for a box of software?"
      },
      {
        heading: "Narrative Drama",
        body: "[SFX: crowd murmur]\nYou follow the line. Your mission is simple: find out why this launch matters. People want computers to feel less confusing and more friendly."
      },
      {
        heading: "Scientific Deep-Dive",
        body: "[SFX: soft click]\nThink of an interface like your school hallway signs. You do not need to know every room by memory. You follow clues, buttons, and labels."
      },
      {
        heading: "Modern World Twist",
        body: "[BGM: bright discovery]\nNow check your tablet or laptop. You still use menus, icons, and shortcuts. What happens when your favorite app hides a button?"
      },
      {
        heading: "Outro & Mission",
        body: "[Action: point to the nearest screen]\nYour mission: notice three buttons today and ask what each one helps you do. You are now the detective of your own screen."
      }
    ],
    closing: "[SFX: soft bell chime]\nYou made it back. Keep your curiosity switched on, because tomorrow your time machine opens again.",
    estimatedDurationMin: 5,
    ttsNotes: ["Pronunciation: Windows ninety-five", "Warm pace", "Pause after each module"]
  };
}
