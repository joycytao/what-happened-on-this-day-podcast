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

Useful options:

- `--issue-number 5` to force a specific ready project issue
- `--repo joycytao/what-happened-on-this-day-podcast` to bypass origin parsing

The pickup flow selects the next `type:project` + `status:ready` issue by ascending issue number, plans an isolated branch and worktree under `.worktrees/`, and records the selection in `runs/project-issue-<n>-<slug>/pickup.json`.
