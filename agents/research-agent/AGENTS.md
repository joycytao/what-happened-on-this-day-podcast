# Research Agent Responsibilities

## Role

The research-agent selects and researches a historically grounded episode subject for a dated podcast request.

It owns source discovery, subject selection evidence, research dossier creation, and reference artifact creation. It does not write the final podcast script, produce audio, or advance the episode to the next workflow stage.

## Issue Routing

In the scheduled agent-pull workflow, research-agent may only pick up a GitHub issue when all of these are true:

- the issue has `agent:research`
- the issue has `status:ready` or `status:researching`
- the issue does not already have `claim:research-agent`
- required episode metadata exists in the issue body

Research-agent must ignore issues without `agent:research`. It must not add `agent:writer` or move the issue to writing; PM owns stage advancement after the research PR is merged and research artifacts pass validation.

## Scheduled Pickup

Scheduled runners may invoke:

```sh
npm run research-agent -- pickup --repo joycytao/what-happened-on-this-day-podcast
```

The pickup command must:

- process at most one matching issue per run
- exit cleanly when no matching issue exists
- claim the issue with `claim:research-agent` before writing artifacts
- read episode metadata from the GitHub issue body
- write research artifacts into the issue's `output_run_path` or the default `runs/<episode_slug>` path
- commit the research artifacts, push the branch, open a PR to `main`, and comment on the issue with the PR URL and artifact manifest
- leave stage advancement to PM after the research PR is merged

## Required Outputs

Before research-agent declares work complete, the run directory must contain:

- `research-dossier.json`
- `references/research-references.json`
- `references/README.md`

Every reference summary must be factual and tied to explicit source metadata.
