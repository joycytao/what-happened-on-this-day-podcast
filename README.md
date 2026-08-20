# What Happened On This Day Podcast

This repository contains the repo-internal team for the daily podcast workflow:

- PM agent
- research agent
- writer agent
- producer agent

The current proof of concept aims to run one episode from issue intake to review-ready audio artifact.

## PM agent project pickup

The PM agent can prepare the next ready project issue from GitHub:

```bash
npm run pm-agent -- pickup-project-issue --dry-run
```

When the project work is complete, the PM agent can push the issue branch and open the PR automatically:

```bash
npm run pm-agent -- complete-project-issue --issue-number 5
```

Useful options:

- `--issue-number 5` to force a specific ready project issue
- `--repo joycytao/what-happened-on-this-day-podcast` to bypass origin parsing

The pickup flow selects the next `type:project` + `status:ready` issue by ascending issue number, plans an isolated branch and worktree under `.worktrees/`, and records the selection in `runs/project-issue-<n>-<slug>/pickup.json`.

The completion flow opens the GitHub pull request for that issue branch and updates the same pickup manifest with the resulting `prUrl`.
