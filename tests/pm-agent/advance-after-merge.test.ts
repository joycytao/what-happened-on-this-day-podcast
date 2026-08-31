import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { advanceEpisodeAfterMerge } from "../../agents/pm-agent";
import { evaluateTranscriptQuality } from "../../agents/writer-agent";
import { serializeTranscriptMarkdown, type Transcript } from "../../src/contracts";
import type { EpisodeIssue, EpisodeIssueContextUpdates, EpisodeAgentLabel } from "../../agents/pm-agent/github-issue";

describe("pm advance-after-merge gates", () => {
  it("advances merged research artifacts to writer and comments the passed gate", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pm-advance-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const updates: Array<EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }> = [];
    const comments: Array<{ issueNumber: number; body: string }> = [];

    await writeResearchArtifacts(runDir);

    const result = await advanceEpisodeAfterMerge(
      {
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot,
        issue: episodeIssue(["status:researching", "agent:research", "claim:research-agent"])
      },
      {
        updateEpisodeIssueStage: async (_issue, update) => {
          updates.push(update);
          return episodeIssue(["status:writing", "agent:writer"]);
        },
        commentOnIssue: async (comment) => {
          comments.push(comment);
        }
      }
    );

    expect(result).toEqual({
      issueNumber: 24,
      currentStage: "writing",
      activeAgentLabel: "agent:writer"
    });
    expect(updates).toEqual([
      {
        currentStage: "writing",
        outputRunPath: "runs/2026-08-24-august-24-2026",
        nextAgentLabel: "agent:writer"
      }
    ]);
    expect(comments[0]?.body).toContain("## PM gate passed");
    expect(comments[0]?.body).toContain("Gate: research artifacts");
    expect(comments[0]?.body).toContain("Next status: status:writing");
    expect(comments[0]?.body).toContain("Next agent: agent:writer");
  });

  it("advances merged writer artifacts to producer and comments the passed gate", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pm-advance-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const updates: Array<EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }> = [];
    const comments: Array<{ issueNumber: number; body: string }> = [];

    await writeWriterArtifacts(runDir);

    const result = await advanceEpisodeAfterMerge(
      {
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot,
        issue: episodeIssue(["status:writing", "agent:writer", "claim:writer-agent"])
      },
      {
        updateEpisodeIssueStage: async (_issue, update) => {
          updates.push(update);
          return episodeIssue(["status:producing", "agent:producer"]);
        },
        commentOnIssue: async (comment) => {
          comments.push(comment);
        }
      }
    );

    expect(result).toEqual({
      issueNumber: 24,
      currentStage: "producing",
      activeAgentLabel: "agent:producer"
    });
    expect(updates[0]).toMatchObject({
      currentStage: "producing",
      nextAgentLabel: "agent:producer"
    });
    expect(comments[0]?.body).toContain("Gate: writer artifacts");
    expect(comments[0]?.body).toContain("Next status: status:producing");
  });

  it("advances merged producer artifacts to review and removes active agent routing", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pm-advance-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const updates: Array<EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }> = [];
    const comments: Array<{ issueNumber: number; body: string }> = [];

    await writeReviewableAudio(runDir);

    const result = await advanceEpisodeAfterMerge(
      {
        repo: "joycytao/what-happened-on-this-day-podcast",
        repoRoot,
        issue: episodeIssue(["status:producing", "agent:producer", "claim:producer-agent"])
      },
      {
        updateEpisodeIssueStage: async (_issue, update) => {
          updates.push(update);
          return episodeIssue(["status:review"]);
        },
        commentOnIssue: async (comment) => {
          comments.push(comment);
        }
      }
    );

    expect(result).toEqual({
      issueNumber: 24,
      currentStage: "review",
      activeAgentLabel: undefined
    });
    expect(updates).toEqual([
      {
        currentStage: "review",
        outputRunPath: "runs/2026-08-24-august-24-2026"
      }
    ]);
    expect(comments[0]?.body).toContain("Gate: producer audio");
    expect(comments[0]?.body).toContain("Next status: status:review");
    expect(comments[0]?.body).not.toContain("Next agent: agent:producer");
  });

  it("refuses to advance from PR URL alone and comments the failed gate", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pm-advance-"));
    const comments: Array<{ issueNumber: number; body: string }> = [];
    const updates: Array<EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }> = [];

    await expect(
      advanceEpisodeAfterMerge(
        {
          repo: "joycytao/what-happened-on-this-day-podcast",
          repoRoot,
          issue: {
            ...episodeIssue(["status:writing", "agent:writer"], [
              "PR: https://github.com/joycytao/what-happened-on-this-day-podcast/pull/51"
            ])
          }
        },
        {
          updateEpisodeIssueStage: async (_issue, update) => {
            updates.push(update);
            return episodeIssue(["status:producing", "agent:producer"]);
          },
          commentOnIssue: async (comment) => {
            comments.push(comment);
          }
        }
      )
    ).rejects.toThrow(/Writer transcript artifact is incomplete/);

    expect(updates).toEqual([]);
    expect(comments[0]?.body).toContain("## PM gate failed");
    expect(comments[0]?.body).toContain("Gate: writer artifacts");
    expect(comments[0]?.body).toContain("transcript.md");
  });

  it("blocks the issue when merged producer audio is a dry-run artifact", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pm-advance-"));
    const runDir = path.join(repoRoot, "runs", "2026-08-24-august-24-2026");
    const comments: Array<{ issueNumber: number; body: string }> = [];
    const updates: Array<EpisodeIssueContextUpdates & { nextAgentLabel?: EpisodeAgentLabel }> = [];

    await writeDryRunAudio(runDir);

    await expect(
      advanceEpisodeAfterMerge(
        {
          repo: "joycytao/what-happened-on-this-day-podcast",
          repoRoot,
          issue: episodeIssue(["status:producing", "agent:producer", "claim:producer-agent"])
        },
        {
          updateEpisodeIssueStage: async (_issue, update) => {
            updates.push(update);
            return episodeIssue(["status:blocked", "agent:producer"]);
          },
          commentOnIssue: async (comment) => {
            comments.push(comment);
          }
        }
      )
    ).rejects.toThrow(/Episode audio is not reviewable/);

    expect(updates).toEqual([
      {
        currentStage: "blocked",
        outputRunPath: "runs/2026-08-24-august-24-2026",
        nextAgentLabel: "agent:producer"
      }
    ]);
    expect(comments[0]?.body).toContain("## PM gate failed");
    expect(comments[0]?.body).toContain("Gate: producer audio");
    expect(comments[0]?.body).toContain("Next status: status:blocked");
    expect(comments[0]?.body).not.toContain("Next status: status:review");
  });
});

async function writeResearchArtifacts(runDir: string) {
  await fs.mkdir(path.join(runDir, "references"), { recursive: true });
  await fs.writeFile(path.join(runDir, "research-dossier.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(runDir, "references", "research-references.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(runDir, "references", "README.md"), "# References\n", "utf8");
}

async function writeWriterArtifacts(runDir: string) {
  const transcript = passingTranscript();

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "transcript.md"), serializeTranscriptMarkdown(transcript), "utf8");
  await fs.writeFile(path.join(runDir, "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(runDir, "transcript-quality-report.json"),
    `${JSON.stringify(evaluateTranscriptQuality(transcript), null, 2)}\n`,
    "utf8"
  );
}

async function writeReviewableAudio(runDir: string) {
  const audioDir = path.join(runDir, "audio");

  await fs.mkdir(audioDir, { recursive: true });
  await fs.writeFile(path.join(audioDir, "final.mp3"), new TextEncoder().encode("ID3production mp3 bytes"));
  await fs.writeFile(
    path.join(audioDir, "render-metadata.json"),
    `${JSON.stringify({ voicebox: { mode: "production", status: "succeeded" } }, null, 2)}\n`,
    "utf8"
  );
}

async function writeDryRunAudio(runDir: string) {
  const audioDir = path.join(runDir, "audio");

  await fs.mkdir(audioDir, { recursive: true });
  await fs.writeFile(path.join(audioDir, "final.mp3"), "MIXED_AUDIO_STUB", "utf8");
  await fs.writeFile(
    path.join(audioDir, "render-metadata.json"),
    `${JSON.stringify({ voicebox: { mode: "dry-run", status: "succeeded" } }, null, 2)}\n`,
    "utf8"
  );
}

function episodeIssue(labels: string[], extraBodyLines: string[] = []): EpisodeIssue {
  return {
    issueNumber: 24,
    title: "Episode: August 24, 2026",
    body: [
      "date: 2026-08-24",
      "episode_slug: 2026-08-24-august-24-2026",
      "language: en",
      "audience: children-first-adult-friendly",
      "duration_target_min: 5",
      "duration_max_min: 8",
      "current_stage: writing",
      "output_run_path: runs/2026-08-24-august-24-2026",
      ...extraBodyLines
    ].join("\n"),
    labels,
    state: "OPEN"
  };
}

function passingTranscript(): Transcript {
  return {
    opening: [
      "Good morning, time traveler. [SFX: time machine hum, 2s]",
      "You are stepping into a day when computers began to feel friendlier for your family."
    ].join("\n"),
    segments: [
      {
        heading: "Time Machine Hook",
        body: "You see a glowing Start button. [Action: tap your desk twice] What would you click first? [SFX: soft click]"
      },
      {
        heading: "Narrative Drama",
        body: "You wait outside a store with other curious families. Your eyes spot boxes of Windows 95. [BGM: curious light pulse]"
      },
      {
        heading: "Scientific Deep-Dive",
        body: "You learn that an interface is like a school hallway for your computer. It helps you find rooms, tools, and files. [SFX: clock tick]"
      },
      {
        heading: "Modern World Twist",
        body: "Your tablet and laptop still use ideas like buttons and menus. Can you find one on your screen right now? [Action: point to a menu]"
      },
      {
        heading: "Outro & Mission",
        body: "You return home with a mission: ask your grown-up what their first computer looked like. [SFX: soft bell chime]"
      }
    ],
    closing: "You made it back to today, and your next click has a history. You can notice design choices everywhere now.",
    estimatedDurationMin: 5,
    ttsNotes: ["Pronunciation: Microsoft as MY-kroh-soft; Windows 95 as Windows ninety-five."]
  };
}
