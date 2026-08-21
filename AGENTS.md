# AGENTS.md

This file gives project-level operating instructions for AI agents working in this repository.

## Project Mission

This repository builds and runs the internal team for the daily `What Happened On This Day` podcast.

The show is an English-language, single-story historical deep dive for children first and adults second. Each episode should be safe for a young audience, historically grounded, and end by connecting the historical story to the modern world.

## Repository Team

The repo has four internal agent roles:

- `pm-agent`: owns workflow control, GitHub issues, run manifests, context updates, and stage transitions
- `research-agent`: discovers and selects date-linked historical subjects and creates research dossiers
- `writer-agent`: turns accepted research dossiers into transcripts
- `producer-agent`: turns transcripts into audio artifacts and render metadata

Do not collapse these roles into one agent. The PM agent coordinates; it does not do research, write the transcript, or produce audio itself.

## PM Agent Operating Model

The PM agent is issue-first.

When a user provides a date for an episode, the PM agent must create or use a GitHub `type:episode` issue before downstream work starts. Raw date briefs should not be passed directly to research, writing, or production.

### New Feature Intake

When the user says something like `新功能 xxxx`, PM agent must treat it as product/workflow intake, not as an implementation command.

The PM agent must:

- understand the requested outcome using first principles
- organize the response using pyramid principle: answer first, then reasoning, then evidence/tasks
- ask clarifying questions when required information is missing
- never guess missing requirements
- inspect existing GitHub issues
- inspect existing pull requests
- inspect main-branch signals before creating new work
- decide whether the work already exists
- decide whether the request is `type:episode` or `type:project`
- create a spike ticket first when feasibility is unknown

Use:

```bash
npm run pm-agent -- triage-feature --request "新功能 ..."
```

Decision outcomes:

- `needs_clarification`: PM agent must ask questions and stop
- `already_exists`: PM agent must point to existing issue, PR, or main-branch work and stop
- `create_ticket`: PM agent has enough information to create a normal ticket
- `create_spike`: PM agent needs feasibility discovery before implementation

Only dated podcast generation requests should become `type:episode`. System, workflow, integration, prompt, producer, tooling, and feasibility work should become `type:project`.

### Create Episode Ticket

Use:

```bash
npm run pm-agent -- create-episode --date 2026-08-24 --working-title "daily episode"
```

The ticket must include:

- episode metadata
- project defaults
- `type:episode`
- `status:ready`
- blank context fields such as `selected_angle`, `entity_type`, and `output_run_path`
- a required task checklist

Required tasks:

- Resolve episode request metadata
- Create run directory and `episode-request.json`
- Research date-linked candidates, choose one subject, and create sourced references
- Write transcript from accepted research dossier
- Run Humanizer review on transcript and revise AI-sounding passages
- Produce audio artifact and render metadata
- Prepare episode for human review

## Research Reference Gate

Before `research-agent` declares research complete, it must create sourced reference artifacts in the episode run directory.

Required research outputs:

- `research-dossier.json`
- `references/research-references.json`
- `references/README.md`

The PM agent must package these three files into the GitHub episode issue before it updates the issue past `status:researching`. In the current implementation, the package is uploaded as a GitHub issue comment with the three files embedded in collapsible sections.

Every reference summary must be factual and tied to an explicit source with:

- source title
- source URL
- source type

Do not include unsourced claims in reference summaries. If a claim cannot be sourced, omit it or record it as an open question outside the final reference summary.

## Transcript Humanizer Gate

The writer-agent writes a podcast script, not an article. It must strictly follow:

- `prompts/writer/references/podcast-script-writer-guidelines.md`
- `prompts/writer/references/student-podcast-script-guidelines.md`

The script must be audio-first, age-appropriate for roughly 7-15 year-old listeners, and designed for spoken delivery with hooks, short sentences, clear anchors, SFX/BGM cues, tone notes, pauses, and read-aloud revision.

Before any agent finishes transcript work, it must run the Humanizer Skill and inspect the transcript for AI-writing patterns.

This gate applies especially to `writer-agent`, because transcript writing is its responsibility. If another agent produces or rewrites transcript prose, the same rule applies.

The finishing loop is:

- run the Humanizer Skill on the transcript
- inspect for AI-writing patterns, including inflated significance, vague attribution, formulaic rhythm, rule-of-three structure, generic conclusions, em dash overuse, and promotional language
- if a passage still sounds AI-generated, list the passage and the reason it failed
- revise the problem passage
- repeat until no AI-writing problems remain

Transcript work is not complete until this loop passes.

### Pick Up Episode Ticket

Use:

```bash
npm run pm-agent -- pickup-episode
```

Useful options:

- `--issue-number 8`
- `--repo joycytao/what-happened-on-this-day-podcast`

Pickup rules:

- Select an open issue with `type:episode` and `status:ready`
- Resolve the episode request from the issue body
- Create the run directory
- Write `episode-request.json`
- Update issue context when workflow state changes
- Upload the complete research package to the GitHub issue before moving to writing
- Dispatch research, writing, and production in order
- Move the issue to `status:review` when the automated run is complete

At minimum, context updates should maintain:

- `current_stage`
- `output_run_path`

## GitHub Issue Types

Use `type:episode` for one podcast episode.

Use `type:project` for system-building work, such as:

- repo scaffolding
- PM agent orchestration
- contract or schema design
- prompt improvements
- Voicebox integration

The PM agent should not automatically process `type:project` issues as daily episodes.

## Artifact Rules

Run artifacts live under `runs/`.

Episode runs should create a directory named after the resolved `episode_slug`, containing at least:

- `episode-request.json`
- audio output
- render metadata

As the implementation matures, research and transcript artifacts should also be persisted there.

## Current Implementation Notes

The current producer uses a Voicebox stub. `audio/final.mp3` may be placeholder content until real Voicebox rendering is integrated.

The current TypeScript test command is the primary verification path:

```bash
npm test
```

`npm run build` currently exposes existing project-level TypeScript configuration issues, including missing Node type declarations and NodeNext import-extension requirements. Do not treat those build failures as proof that the PM workflow tests failed.

## Important Docs

Read these before changing workflow behavior:

- `agents/pm-agent/AGENTS.md`
- `agents/pm-agent/SOP.md`
- `docs/github-episode-workflow.md`
- `docs/superpowers/specs/2026-08-18-what-happened-on-this-day-podcast-design.md`

## Guardrails

- Do not bypass GitHub episode issues for date-based episode work.
- Do not create separate GitHub sub-issues for research, writing, or production.
- Do not make the PM agent choose the final subject, write the transcript, or produce audio.
- Keep workflow state explicit in issue metadata and run artifacts.
- Add or update tests when changing PM agent behavior.
