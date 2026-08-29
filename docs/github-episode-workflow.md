# GitHub Episode Workflow

## Purpose

This document defines how GitHub issues are used as the control plane for the `what-happened-on-this-day-podcast` episode workflow.

GitHub issues track workflow state. Run artifacts track durable outputs. Pull requests move artifacts into `main`.

## Core Model

The workflow does not use `type:project` or `type:episode` labels as execution requirements.

Automated routing is controlled by `agent:*` labels:

- `agent:research`
- `agent:writer`
- `agent:producer`

Workflow state is controlled by `status:*` labels:

- `status:ready`
- `status:researching`
- `status:writing`
- `status:producing`
- `status:review`
- `status:done`
- `status:blocked`

Claim locks are controlled by `claim:*` labels:

- `claim:research-agent`
- `claim:writer-agent`
- `claim:producer-agent`

Project, refactor, spike, documentation, prompt, and tooling issues must not receive episode `agent:*` labels unless the issue is specifically about implementing that agent workflow capability.

## Label Rules

- Active episode workflow issues must have exactly one `status:*` label.
- Active episode workflow issues must have at most one active `agent:*` label.
- Scheduled role agents must ignore issues without their matching `agent:*` label.
- Scheduled role agents must ignore issues with `status:blocked`.
- A `claim:*` label means that role has already claimed the issue.
- PM is the only actor that advances an episode from one role label to the next role label.
- PM must clean stale `status:*`, `agent:*`, and `claim:*` labels during controlled stage updates.

## Status Labels

### `status:ready`

Meaning:

- the issue has enough metadata for the next owner to begin
- for a new episode issue, the next owner is `research-agent`

Used when:

- PM creates a dated episode issue
- PM or a human unblocks an issue and makes it ready again

### `status:researching`

Meaning:

- the research stage is active
- research artifacts have not yet been accepted by PM on `main`

Used when:

- `research-agent` has claimed or is working on the issue
- PM needs to show that research is the current stage

### `status:writing`

Meaning:

- research artifacts have been accepted
- writer work is ready or active

Used when:

- PM has validated merged research artifacts
- PM has routed the issue to `agent:writer`

### `status:producing`

Meaning:

- writer artifacts have been accepted
- producer work is ready or active

Used when:

- PM has validated merged writer artifacts
- PM has routed the issue to `agent:producer`

### `status:review`

Meaning:

- production artifacts have been accepted
- the episode is waiting for human review

Used when:

- PM has validated production render metadata
- PM has validated that `audio/final.mp3` is real audio/mpeg

### `status:done`

Meaning:

- the episode has passed human review
- no further work is required

### `status:blocked`

Meaning:

- the issue cannot continue automatically

Common reasons:

- missing metadata
- unclear requirements
- weak or unsafe research result
- transcript quality failure
- Voicebox or producer failure

When this label is used, the responsible agent or PM must leave an issue comment with the failed gate, missing information or artifact, and next required action.

## Episode Defaults

When only a date is provided, PM should populate at least:

- `date`
- `episode_slug`
- `language: en`
- `audience: children-first-adult-friendly`
- `duration_target_min: 5`
- `duration_max_min: 8`
- `current_stage: ready`
- `selected_angle:` blank until research decides
- `entity_type:` blank until research decides
- `output_run_path:` blank until the run directory is created

Default project rules:

- format is `single-story deep dive`
- target duration is `5-8 minutes`
- hard ceiling is `8 minutes`
- language is `English`
- audience is `children-first, adult-friendly`
- the story can focus on a `person`, `event`, or `object`
- research should use a hybrid source model
- the transcript should use a shared opening greeting
- the episode should close by connecting the story to the modern world
- Voicebox is the audio engine
- voice cloning is disabled in v1

## Episode Issue Template Shape

Recommended title:

```text
Episode: August 19, 2026 - <working title or placeholder>
```

Recommended body:

```md
## Episode Request

- date: 2026-08-19
- episode_slug: 2026-08-19
- language: en
- audience: children-first-adult-friendly
- duration_target_min: 5
- duration_max_min: 8
- selected_angle:
- entity_type:
- current_stage: ready
- output_run_path:

## Overrides

- none

## Required Tasks

- [ ] Resolve episode request metadata
- [ ] Create run directory and episode-request.json
- [ ] Research date-linked candidates, choose one subject, and create sourced references
- [ ] Write transcript from accepted research dossier
- [ ] Run Humanizer review on transcript and revise AI-sounding passages
- [ ] Produce audio artifact and render metadata
- [ ] Prepare episode for human review
```

Recommended labels:

- `status:ready`
- `agent:research`

## Ownership Model

### PM Agent

PM owns intake and gates:

- creates episode issues
- writes default metadata and required tasks
- creates or validates run metadata when applicable
- validates merged artifacts on `main`
- updates issue context fields
- advances `status:*` and `agent:*` labels after successful gates
- blocks issues with clear failure comments when gates fail

PM must not run research, writer, or producer as part of the normal episode workflow.

### Research-Agent

Research-agent owns research work:

- picks issues with `agent:research`
- claims with `claim:research-agent`
- creates a branch and worktree
- writes research artifacts
- opens a PR
- comments on the issue with PR URL and artifact manifest

Research-agent must not add `agent:writer` or advance the stage.

Scheduled command:

```sh
npm run research-agent -- pickup --repo joycytao/what-happened-on-this-day-podcast
```

### Writer-Agent

Writer-agent owns script writing:

- picks issues with `agent:writer`
- claims with `claim:writer-agent`
- reads research artifacts from `main`
- writes transcript artifacts
- opens a PR
- comments on the issue with PR URL, quality summary, and artifact manifest

Writer-agent must not add `agent:producer` or advance the stage.

### Producer-Agent

Producer-agent owns audio production:

- picks issues with `agent:producer`
- claims with `claim:producer-agent`
- reads writer artifacts from `main`
- renders audio artifacts
- opens a PR
- comments on the issue with PR URL and artifact manifest

Producer-agent must not move the issue to `status:review`.

### Human Reviewer

The human reviewer reviews the final result at `status:review` and decides whether to move to `status:done` or reroute work.

## Status Transition Workflow

### Default happy path

1. Input arrives with a date such as `2026-08-19`.
2. PM creates one GitHub issue.
3. PM applies episode defaults and required tasks.
4. PM applies `status:ready` and `agent:research`.
5. Research-agent scheduled pickup claims the issue.
6. Research-agent writes research artifacts on a branch.
7. Research-agent opens a PR and comments on the issue.
8. After the research PR is merged, PM validates research artifacts on `main`.
9. PM sets `status:writing` and `agent:writer`.
10. Writer-agent scheduled pickup claims the issue.
11. Writer-agent writes transcript artifacts on a branch.
12. Writer-agent opens a PR and comments on the issue.
13. After the writer PR is merged, PM validates transcript artifacts on `main`.
14. PM sets `status:producing` and `agent:producer`.
15. Producer-agent scheduled pickup claims the issue.
16. Producer-agent writes audio artifacts on a branch.
17. Producer-agent opens a PR and comments on the issue.
18. After the producer PR is merged, PM validates audio artifacts on `main`.
19. PM sets `status:review` and removes active `agent:*`.
20. A human reviews the output.
21. If approved, the issue moves to `status:done`.

### Blocked path

If any stage fails:

1. The responsible actor preserves the latest valid artifact when one exists.
2. The issue receives or keeps `status:blocked`.
3. The responsible actor records a failure summary in an issue comment.
4. If the blocker is missing implementation detail, create a dependency issue and link it from the blocked issue.
5. PM or a human decides whether to retry, revise inputs, or close the issue.

## Artifact Handoff Model

The PM agent does not assign work by creating sub-issues for research, writing, or producing.

It assigns work through labels and merged artifacts:

- `status:ready` + `agent:research`
  - research-agent consumes episode metadata
  - research-agent produces `research-dossier.json`
  - research-agent produces `references/research-references.json`
  - research-agent produces `references/README.md`
  - research-agent opens a PR
- `status:writing` + `agent:writer`
  - writer-agent consumes merged research artifacts
  - writer-agent produces `transcript.md`
  - writer-agent produces `transcript.json`
  - writer-agent produces `transcript-quality-report.json`
  - writer-agent opens a PR
- `status:producing` + `agent:producer`
  - producer-agent consumes merged writer artifacts
  - producer-agent produces `audio/final.mp3`
  - producer-agent produces `audio/render-metadata.json`
  - producer-agent produces `audio/sfx-manifest.json`
  - producer-agent opens a PR

Downstream work must not depend on unmerged branch artifacts or in-memory objects from PM.

## Practical Expectations

Normal daily operation:

- a date is provided
- PM creates one episode issue with `status:ready` and `agent:research`
- scheduled role agents work only when their `agent:*` label appears
- each role agent opens a PR for its artifacts
- PM advances labels only after merged artifacts pass gates
- a human performs the final review decision

This keeps the issue as the control record while artifacts live in versioned run folders.
