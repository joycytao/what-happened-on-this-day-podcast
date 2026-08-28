import { describe, expect, it } from "vitest";
import { triageFeatureRequest } from "../../agents/pm-agent/feature-intake";

describe("pm agent feature intake", () => {
  it("asks for clarification instead of guessing when a new feature request is too vague", () => {
    expect(
      triageFeatureRequest({
        request: "新功能 改善音效",
        existingIssues: [],
        existingPullRequests: [],
        mainBranchSignals: []
      })
    ).toMatchObject({
      action: "needs_clarification",
      questions: expect.arrayContaining([
        "What user outcome should this feature create?"
      ])
    });
  });

  it("detects existing work across issues, prs, and main before creating new work", () => {
    expect(
      triageFeatureRequest({
        request: "新功能 Voicebox SFX support",
        existingIssues: [{ number: 9, title: "Project spike: determine Voicebox support for podcast SFX" }],
        existingPullRequests: [],
        mainBranchSignals: []
      })
    ).toMatchObject({
      action: "already_exists",
      existingWork: [{ kind: "issue", number: 9 }]
    });
  });

  it("classifies date-based podcast generation as an episode request", () => {
    expect(
      triageFeatureRequest({
        request: "新功能 開始 2026-08-24 的 podcast 生成",
        existingIssues: [],
        existingPullRequests: [],
        mainBranchSignals: []
      })
    ).toMatchObject({
      action: "create_ticket",
      workflow: "episode"
    });
  });

  it("creates a spike first when feasibility is unknown", () => {
    expect(
      triageFeatureRequest({
        request: "新功能 判斷 Voicebox 是否能產生時光機和鐘聲音效，以及如何實作",
        existingIssues: [],
        existingPullRequests: [],
        mainBranchSignals: []
      })
    ).toMatchObject({
      action: "create_spike",
      workflow: "system"
    });
  });
});
