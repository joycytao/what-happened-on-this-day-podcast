import { describe, expect, it } from "vitest";
import {
  buildAgentLabelUpdateArgs,
  buildClaimLabelCleanupArgs,
  buildStatusLabelUpdateArgs,
  claimIssueForAgent,
  loadOpenIssueQueueIssues,
  selectIssueForAgent,
  validateIssueQueueLabels,
  type IssueQueueIssue
} from "../../agents/issue-queue";

describe("shared issue queue utilities", () => {
  it("selects open issues by agent label without requiring type labels", () => {
    const selected = selectIssueForAgent(
      [
        issue({
          number: 28,
          title: "ordinary ready implementation",
          labels: ["status:ready"]
        }),
        issue({
          number: 26,
          title: "research-ready episode",
          labels: ["status:ready", "agent:research"]
        }),
        issue({
          number: 25,
          title: "closed research issue",
          labels: ["status:ready", "agent:research"],
          state: "CLOSED"
        })
      ],
      { role: "research", allowedStatuses: ["status:ready"] }
    );

    expect(selected.number).toBe(26);
  });

  it("ignores issues without the matching agent label", () => {
    expect(() =>
      selectIssueForAgent(
        [
          issue({
            number: 26,
            title: "writer work",
            labels: ["status:writing", "agent:writer"]
          })
        ],
        { role: "research", allowedStatuses: ["status:ready", "status:researching"] }
      )
    ).toThrow("No issue was found for agent:research");
  });

  it("blocks duplicate pickup when any claim label already exists", () => {
    expect(() =>
      selectIssueForAgent(
        [
          issue({
            number: 26,
            title: "claimed research issue",
            labels: ["status:ready", "agent:research", "claim:research-agent"]
          })
        ],
        { role: "research", allowedStatuses: ["status:ready"] }
      )
    ).toThrow("No issue was found for agent:research");
  });

  it("does not pick up blocked issues for scheduled role agents", () => {
    expect(() =>
      selectIssueForAgent(
        [
          issue({
            number: 26,
            title: "blocked research issue",
            labels: ["status:blocked", "agent:research"]
          })
        ],
        { role: "research", allowedStatuses: ["status:ready", "status:researching"] }
      )
    ).toThrow("No issue was found for agent:research");
  });

  it("fails validation when an issue has multiple status labels", () => {
    expect(() =>
      validateIssueQueueLabels(
        issue({
          number: 26,
          title: "conflicting status",
          labels: ["status:ready", "status:blocked", "agent:research"]
        })
      )
    ).toThrow("Issue #26 must have exactly one status:* label");
  });

  it("fails validation when an issue has multiple active agent labels", () => {
    expect(() =>
      validateIssueQueueLabels(
        issue({
          number: 26,
          title: "conflicting agent route",
          labels: ["status:ready", "agent:research", "agent:writer"]
        })
      )
    ).toThrow("Issue #26 must have at most one active agent:* label");
  });

  it("builds PM-controlled status cleanup args with exactly one next status", () => {
    const args = buildStatusLabelUpdateArgs(
      issue({
        number: 26,
        title: "conflicting status",
        labels: ["status:ready", "status:blocked", "agent:research"]
      }),
      "status:writing"
    );

    expect(args).toEqual([
      "--remove-label",
      "status:ready",
      "--remove-label",
      "status:blocked",
      "--add-label",
      "status:writing"
    ]);
  });

  it("re-adds the next status when cleaning a duplicate status set that already contains it", () => {
    const args = buildStatusLabelUpdateArgs(
      issue({
        number: 26,
        title: "conflicting status",
        labels: ["status:ready", "status:blocked", "agent:research"]
      }),
      "status:ready"
    );

    expect(args).toEqual([
      "--remove-label",
      "status:ready",
      "--remove-label",
      "status:blocked",
      "--add-label",
      "status:ready"
    ]);
  });

  it("builds PM-controlled agent cleanup args with one next active agent", () => {
    const args = buildAgentLabelUpdateArgs(
      issue({
        number: 26,
        title: "conflicting agent route",
        labels: ["status:writing", "agent:research", "agent:producer"]
      }),
      "agent:writer"
    );

    expect(args).toEqual([
      "--remove-label",
      "agent:research",
      "--remove-label",
      "agent:producer",
      "--add-label",
      "agent:writer"
    ]);
  });

  it("re-adds the next agent when cleaning a duplicate agent set that already contains it", () => {
    const args = buildAgentLabelUpdateArgs(
      issue({
        number: 26,
        title: "conflicting agent route",
        labels: ["status:writing", "agent:research", "agent:writer"]
      }),
      "agent:writer"
    );

    expect(args).toEqual([
      "--remove-label",
      "agent:research",
      "--remove-label",
      "agent:writer",
      "--add-label",
      "agent:writer"
    ]);
  });

  it("builds claim cleanup args for stale claim labels", () => {
    const args = buildClaimLabelCleanupArgs(
      issue({
        number: 26,
        title: "claimed issue",
        labels: ["status:writing", "agent:writer", "claim:research-agent", "claim:writer-agent"]
      })
    );

    expect(args).toEqual([
      "--remove-label",
      "claim:research-agent",
      "--remove-label",
      "claim:writer-agent"
    ]);
  });

  it("claims an issue and re-reads it before returning", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    const claimed = await claimIssueForAgent({
      repo: "joycytao/what-happened-on-this-day-podcast",
      issue: issue({
        number: 26,
        title: "research work",
        labels: ["status:ready", "agent:research"]
      }),
      role: "research",
      execFile: async (file, args) => {
        calls.push({ file, args });
        return "";
      },
      reloadIssue: async () =>
        issue({
          number: 26,
          title: "research work",
          labels: ["status:ready", "agent:research", "claim:research-agent"]
        })
    });

    expect(calls).toEqual([
      {
        file: "gh",
        args: [
          "issue",
          "edit",
          "26",
          "--repo",
          "joycytao/what-happened-on-this-day-podcast",
          "--add-label",
          "claim:research-agent"
        ]
      }
    ]);
    expect(claimed.labels).toContain("claim:research-agent");
  });

  it("loads open issues without adding type label filters to the GitHub query", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];

    const issues = await loadOpenIssueQueueIssues({
      repo: "joycytao/what-happened-on-this-day-podcast",
      execFile: async (file, args) => {
        calls.push({ file, args });
        return JSON.stringify([
          {
            number: 26,
            title: "research-ready episode",
            state: "OPEN",
            labels: [{ name: "status:ready" }, { name: "agent:research" }]
          }
        ]);
      }
    });

    expect(calls[0]).toMatchObject({
      file: "gh",
      args: [
        "issue",
        "list",
        "--repo",
        "joycytao/what-happened-on-this-day-podcast",
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,title,state,labels"
      ]
    });
    expect(calls[0]?.args).not.toContain("--label");
    expect(issues).toEqual([
      {
        number: 26,
        title: "research-ready episode",
        state: "OPEN",
        labels: ["status:ready", "agent:research"]
      }
    ]);
  });

  it("fails claim when the re-read issue does not contain the claim label", async () => {
    await expect(
      claimIssueForAgent({
        repo: "joycytao/what-happened-on-this-day-podcast",
        issue: issue({
          number: 26,
          title: "research work",
          labels: ["status:ready", "agent:research"]
        }),
        role: "research",
        execFile: async () => "",
        reloadIssue: async () =>
          issue({
            number: 26,
            title: "research work",
            labels: ["status:ready", "agent:research"]
          })
      })
    ).rejects.toThrow("Claim label claim:research-agent was not present after re-reading issue #26");
  });
});

function issue(input: {
  number: number;
  title: string;
  labels: string[];
  state?: "OPEN" | "CLOSED";
}): IssueQueueIssue {
  return {
    state: "OPEN",
    ...input
  };
}
