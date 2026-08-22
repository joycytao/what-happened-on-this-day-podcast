type ExistingIssue = {
  number: number;
  title: string;
};

type ExistingPullRequest = {
  number: number;
  title: string;
};

type MainBranchSignal = {
  path: string;
  summary: string;
};

export type FeatureIntakeInput = {
  request: string;
  existingIssues: ExistingIssue[];
  existingPullRequests: ExistingPullRequest[];
  mainBranchSignals: MainBranchSignal[];
};

export type FeatureIntakeDecision =
  | {
      action: "needs_clarification";
      questions: string[];
      reasoning: string[];
    }
  | {
      action: "already_exists";
      existingWork: Array<{ kind: "issue" | "pull_request" | "main"; number?: number; path?: string }>;
      reasoning: string[];
    }
  | {
      action: "create_ticket" | "create_spike";
      issueType: "type:project" | "type:episode";
      reasoning: string[];
    };

export function triageFeatureRequest(input: FeatureIntakeInput): FeatureIntakeDecision {
  const normalizedRequest = normalizeText(input.request);
  const existingWork = findExistingWork(normalizedRequest, input);

  if (existingWork.length > 0) {
    return {
      action: "already_exists",
      existingWork,
      reasoning: [
        "PM agent checked existing issues, pull requests, and main-branch signals before creating new work.",
        "Matching existing work was found, so creating another ticket would duplicate work."
      ]
    };
  }

  if (isVagueFeatureRequest(normalizedRequest)) {
    return {
      action: "needs_clarification",
      questions: [
        "What user outcome should this feature create?",
        "Who is the user or agent affected by this feature?",
        "What observable behavior would prove the feature is complete?"
      ],
      reasoning: [
        "The request does not contain enough outcome, user, or acceptance information.",
        "PM agent must not guess missing requirements."
      ]
    };
  }

  if (isEpisodeRequest(normalizedRequest)) {
    return {
      action: "create_ticket",
      issueType: "type:episode",
      reasoning: [
        "The request is for generating a dated podcast episode.",
        "Episode production work belongs in a type:episode issue."
      ]
    };
  }

  if (needsSpike(normalizedRequest)) {
    return {
      action: "create_spike",
      issueType: "type:project",
      reasoning: [
        "The request contains unknown technical feasibility or asks whether an implementation is possible.",
        "PM agent should create a spike ticket before committing to implementation."
      ]
    };
  }

  return {
    action: "create_ticket",
    issueType: "type:project",
    reasoning: [
      "The request changes the product or system rather than producing one dated episode.",
      "PM agent has enough information to create a project ticket."
    ]
  };
}

function findExistingWork(normalizedRequest: string, input: FeatureIntakeInput) {
  const requestTokens = tokenSet(normalizedRequest);
  const existingWork: Array<{ kind: "issue" | "pull_request" | "main"; number?: number; path?: string }> = [];

  for (const issue of input.existingIssues) {
    if (hasMeaningfulOverlap(requestTokens, tokenSet(issue.title))) {
      existingWork.push({ kind: "issue", number: issue.number });
    }
  }

  for (const pullRequest of input.existingPullRequests) {
    if (hasMeaningfulOverlap(requestTokens, tokenSet(pullRequest.title))) {
      existingWork.push({ kind: "pull_request", number: pullRequest.number });
    }
  }

  for (const signal of input.mainBranchSignals) {
    if (hasMeaningfulOverlap(requestTokens, tokenSet(`${signal.path} ${signal.summary}`))) {
      existingWork.push({ kind: "main", path: signal.path });
    }
  }

  return existingWork;
}

function isVagueFeatureRequest(request: string) {
  const tokens = tokenSet(request);
  const hasOutcome = ["生成", "create", "support", "產生", "判斷", "determine", "實作"].some((token) => tokens.has(token));
  const hasSpecificObject = tokens.size >= 4;

  return !hasOutcome || !hasSpecificObject;
}

function isEpisodeRequest(request: string) {
  return /podcast/.test(request) && /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/.test(request);
}

function needsSpike(request: string) {
  return /是否|能不能|可以嗎|possible|impossible|feasibility|spike|判斷|如何實作/.test(request);
}

function hasMeaningfulOverlap(left: Set<string>, right: Set<string>) {
  const overlapping = [...left].filter((token) => right.has(token));
  return overlapping.length >= 2;
}

function tokenSet(text: string) {
  return new Set(
    normalizeText(text)
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((token) => token.length > 1)
      .filter((token) => !["新功能", "feature", "project", "type", "status"].includes(token))
  );
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/voice box/g, "voicebox").trim();
}
