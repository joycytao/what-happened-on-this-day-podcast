# GitHub Episode Workflow

## Purpose

This document defines how GitHub issues are used in the `what-happened-on-this-day-podcast` repository, what each label means, what project defaults the PM agent should apply automatically, and how a single `Episode` issue moves through the full workflow.

This is an operations document. It does not replace the system design spec. It explains how the team should behave day to day.

## Core Model

The repository uses GitHub issues in two ways:

- `type:project`
- `type:episode`

A `Project` issue tracks system-building work such as scaffolding, contracts, prompts, or integrations.

An `Episode` issue tracks one single podcast episode from intake through review. One episode should have one main issue. Research, writing, and production do not become separate GitHub issues.

## Label Taxonomy

### Type labels

#### `type:project`

Use this label when the issue is about building or improving the system itself.

Examples:

- repo scaffold
- contract schema design
- PM agent orchestration work
- Voicebox integration
- prompt or config improvements

Rules:

- A `type:project` issue is not part of the daily episode pipeline
- The PM agent should not automatically process `type:project` issues
- A `type:project` issue may have no status label

#### `type:episode`

Use this label when the issue represents one daily podcast episode.

Examples:

- `Episode: August 19, 2026 - A Museum Opens`
- `Episode: August 20, 2026 - The First Radio Broadcast`

Rules:

- One `type:episode` issue represents one episode
- The PM agent may create or pick up a `type:episode` issue
- A `type:episode` issue should have exactly one `status:*` label at a time

### Status labels

Status labels are primarily for `type:episode` issues.

#### `status:ready`

Meaning:

- the episode has enough metadata to begin
- the PM agent can start execution

Used when:

- a new episode issue is created from a date
- an existing episode issue is waiting to be processed

#### `status:researching`

Meaning:

- the PM agent has started the episode
- the research stage is active

Used when:

- the episode request has been resolved
- the PM agent has dispatched or is dispatching work to the research agent

#### `status:writing`

Meaning:

- research is complete
- the writer stage is active

Used when:

- the research dossier has been accepted
- the PM agent has dispatched or is dispatching work to the writer agent

#### `status:producing`

Meaning:

- transcript generation is complete
- audio rendering is active

Used when:

- the transcript has been accepted
- the PM agent has dispatched or is dispatching work to the producer agent

#### `status:review`

Meaning:

- the full automated pipeline has completed
- the episode is waiting for human review

Used when:

- research artifacts exist
- transcript artifacts exist
- audio artifacts exist

#### `status:done`

Meaning:

- the episode has passed human review
- no further work is required for this issue

#### `status:blocked`

Meaning:

- the episode cannot continue automatically

Common reasons:

- missing metadata
- weak or unsafe research result
- transcript quality failure
- Voicebox or producer failure

When this label is used, the PM agent should leave a short explanation in the issue or run artifacts.

## Label Rules

- Every issue should have exactly one `type:*` label
- A `type:episode` issue should have at most one `status:*` label
- A `type:project` issue does not need a `status:*` label
- The PM agent should only auto-process `type:episode` issues

## Project Defaults

Project defaults are the repository-level rules that the PM agent should automatically apply when creating a new `type:episode` issue.

This means the PM agent does not need a full manual brief for every episode. In the default case, a date alone is enough to start.

### Required input

Minimum required input for a default episode:

- `date`

Example:

```yaml
date: 2026-08-19
```

### Optional overrides

Overrides are optional. They are only needed when the user or Studio Chef wants to influence the episode.

Examples:

```yaml
date: 2026-08-19
preferred_angle: person
avoid_topics:
  - war
tone_note: gentler bedtime energy
```

### Default fields the PM agent should fill automatically

When only a date is provided, the PM agent should populate at least:

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

### Default project rules the PM agent should assume

These rules come from the project spec and should be treated as defaults unless explicitly overridden:

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

An episode issue should be lightweight. The issue is a control record, not the final artifact store.

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

- `type:episode`
- `status:ready`

## Ownership Model

### Who creates a `type:episode` issue

Preferred path:

- the PM agent creates the issue after receiving a date

Allowed alternate path:

- a human creates the issue manually
- the PM agent later picks it up

### Who processes each stage

- `PM agent`
  - creates or picks up the issue
  - resolves metadata
  - creates the run directory
  - defines the required task checklist on newly created episode issues
  - updates issue context when new workflow state is known
  - updates labels and state
  - dispatches the next stage

- `research-agent`
  - receives the episode request from the PM agent
  - returns a research dossier

- `writer-agent`
  - receives the research dossier from the PM agent
  - returns transcript artifacts

- `producer-agent`
  - receives the transcript from the PM agent
  - returns audio artifacts and render metadata

- `human reviewer`
  - reviews the final result at `status:review`
  - decides whether to move to `status:done` or reroute work

## Status Transition Workflow

### Default happy path

1. Input arrives with a date such as `2026-08-19`
2. PM agent creates a `type:episode` issue
3. PM agent applies project defaults and writes the required task checklist
4. Issue receives `status:ready`
5. PM agent picks up the ready issue
6. PM agent resolves the episode request from the issue body
7. PM agent creates a run directory and `episode-request.json`
8. PM agent updates issue context, including `current_stage` and `output_run_path`
9. Issue moves to `status:researching`
10. PM agent dispatches the research agent
11. Research dossier is saved
12. Reference artifacts are saved under `references/`
13. PM agent packages `research-dossier.json`, `references/research-references.json`, and `references/README.md` onto the GitHub issue
14. Issue moves to `status:writing`
15. PM agent dispatches the writer agent
16. Transcript artifacts are saved
17. Issue moves to `status:producing`
18. PM agent dispatches the producer agent
19. Audio artifacts are saved
20. Issue moves to `status:review`
21. A human reviews the output
22. If approved, the issue moves to `status:done`

### Blocked path

If any stage fails:

1. PM agent preserves the latest valid artifact
2. PM agent updates the issue to `status:blocked`
3. PM agent records a short failure summary
4. A human decides whether to retry, revise inputs, or close the issue

## Artifact Handoff Model

The PM agent does not assign work by creating sub-issues for research, writing, or producing.

Instead, it assigns work through artifacts and stage transitions:

- `status:ready`
  - PM agent creates `episode-request.json`
- `status:researching`
  - research agent consumes `episode-request.json`
  - research agent produces `research-dossier.json`
  - research agent produces `references/research-references.json`
  - research agent produces `references/README.md`
  - PM agent packages those three files onto the GitHub issue before any later status update
- `status:writing`
  - writer agent consumes `research-dossier.json`
  - writer agent produces `transcript.md` and `transcript.json`
- `status:producing`
  - producer agent consumes `transcript.json`
  - producer agent produces audio output and render metadata

This keeps one GitHub issue as the episode control record while run artifacts live on disk.

## Practical Expectations

Once the foundation project is complete, the normal expectation for daily operation should be:

- a date is provided
- the PM agent creates one `type:episode` issue
- the PM agent fills project defaults automatically
- the PM agent moves the issue from `status:ready` to `status:review`
- a human performs the final decision

In other words, the episode workflow should not require a custom detailed brief every day. The project-level defaults are the standing brief.
