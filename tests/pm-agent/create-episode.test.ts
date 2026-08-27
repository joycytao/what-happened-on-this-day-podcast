import { describe, expect, it } from "vitest";
import {
  buildEpisodeIssueDraft,
  createEpisodeIssueFromDate,
  resolveEpisodeDateInput
} from "../../agents/pm-agent/github-issue";
import { runPmAgentCli } from "../../agents/pm-agent";

describe("pm agent episode creation", () => {
  it("accepts a date as the minimum episode input", () => {
    expect(resolveEpisodeDateInput({ date: "2026-08-24" })).toMatchObject({
      date: "2026-08-24",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 5,
      durationMaxMin: 8,
      currentStage: "ready"
    });
  });

  it("generates a valid episode issue title and body from the date", () => {
    const draft = buildEpisodeIssueDraft({
      date: "2026-08-24",
      language: "en",
      audience: "children-first-adult-friendly",
      durationTargetMin: 5,
      durationMaxMin: 8,
      currentStage: "ready"
    });

    expect(draft.title).toBe("Episode: August 24, 2026");
    expect(draft.labels).toEqual(["type:episode", "status:ready"]);
    expect(draft.body).toContain("date: 2026-08-24");
    expect(draft.body).toContain("episode_slug: 2026-08-24-august-24-2026");
    expect(draft.body).toContain("language: en");
    expect(draft.body).toContain("current_stage: ready");
  });

  it("creates a GitHub episode issue from a date with project defaults", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    const result = await createEpisodeIssueFromDate({
      repo: "joycytao/what-happened-on-this-day-podcast",
      input: {
        date: "2026-08-24"
      },
      execFile: async (file, args) => {
        calls.push({ file, args });
        return JSON.stringify({
          number: 42,
          url: "https://github.com/joycytao/what-happened-on-this-day-podcast/issues/42"
        });
      }
    });

    expect(calls[0]).toMatchObject({
      file: "gh"
    });
    expect(calls[0]?.args).toContain("issue");
    expect(calls[0]?.args).toContain("create");
    expect(calls[0]?.args).toContain("--label");
    expect(calls[0]?.args).toContain("type:episode");
    expect(calls[0]?.args).toContain("status:ready");
    expect(result.issueNumber).toBe(42);
    expect(result.url).toBe(
      "https://github.com/joycytao/what-happened-on-this-day-podcast/issues/42"
    );
  });

  it("creates an issue body that the existing PM intake logic can consume without edits", async () => {
    const result = await createEpisodeIssueFromDate({
      repo: "joycytao/what-happened-on-this-day-podcast",
      input: {
        date: "2026-08-24"
      },
      execFile: async () =>
        JSON.stringify({
          number: 42,
          url: "https://github.com/joycytao/what-happened-on-this-day-podcast/issues/42"
        })
    });

    expect(result.request).toMatchObject({
      date: "2026-08-24",
      episodeSlug: "2026-08-24-august-24-2026",
      language: "en",
      currentStage: "ready"
    });
  });

  it("runs the create-episode-from-date cli command", async () => {
    const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];

    const result = await runPmAgentCli(
      ["node", "pm-agent", "create-episode-from-date", "--date", "2026-08-24"],
      {
        repoRoot: "/tmp/podcast-repo",
        resolveWorkspaceRoot: async () => "/tmp/podcast-repo",
        resolveRepo: async () => "joycytao/what-happened-on-this-day-podcast",
        createEpisodeIssueFromDate: async () => ({
          issueNumber: 42,
          url: "https://github.com/joycytao/what-happened-on-this-day-podcast/issues/42",
          title: "Episode: August 24, 2026",
          body: "date: 2026-08-24",
          labels: ["type:episode", "status:ready"],
          request: {
            date: "2026-08-24",
            episodeSlug: "2026-08-24-august-24-2026",
            language: "en",
            audience: "children-first-adult-friendly",
            durationTargetMin: 5,
            durationMaxMin: 8,
            currentStage: "ready"
          }
        }),
        logger: {
          info(message, meta) {
            logs.push({ message, meta });
          },
          warn() {},
          error() {}
        }
      }
    );

    expect(result?.issueNumber).toBe(42);
    expect(logs[0]).toMatchObject({
      message: "Created episode issue from date",
      meta: {
        issueNumber: 42,
        date: "2026-08-24"
      }
    });
  });
});
