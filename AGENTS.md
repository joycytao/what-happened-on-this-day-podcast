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

The PM agent is issue-first and gatekeeper-owned.

When a user provides a date for an episode, the PM agent must create or use a GitHub issue before episode work starts. Raw date briefs should not be passed directly to research, writing, or production.

Episode workflow routing is controlled by `agent:*` labels, not `type:*` labels. The PM agent creates episode issues with `status:ready` and `agent:research`. Scheduled role agents must ignore issues unless the issue has their matching role label.

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
- decide whether the request is episode production work, system work, or feasibility discovery
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

Only dated podcast generation requests should enter the episode agent workflow. System, workflow, integration, prompt, producer, tooling, and feasibility work should stay outside episode agent routing unless their issue explicitly implements that workflow capability.

### Create Episode Ticket

Use:

```bash
npm run pm-agent -- create-episode --date 2026-08-24 --working-title "daily episode"
```

The ticket must include:

- episode metadata
- project defaults
- `status:ready`
- `agent:research`
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

Current implementation note:

The legacy PM pickup command may still exist while the workflow is being refactored. The target operating model is that PM does not directly run downstream agents. PM creates the issue, validates artifacts after PR merges, and advances labels.

Role agent pickup rules:

- `research-agent` may only pick issues with `agent:research`
- `writer-agent` may only pick issues with `agent:writer`
- `producer-agent` may only pick issues with `agent:producer`
- issues without a matching `agent:*` label must be ignored by scheduled role agents
- blocked issues must not be picked up until PM or a human relabels them

PM gatekeeper rules:

- Resolve the episode request from the issue body
- Create the run directory
- Write `episode-request.json`
- Update issue context when workflow state changes
- Upload the complete research package to the GitHub issue before moving to writing
- Advance to the next `agent:*` label only after the required artifacts exist and pass validation
- Move the issue to `status:review` when the automated run is complete

At minimum, context updates should maintain:

- `current_stage`
- `output_run_path`

## GitHub Issue Routing

Do not use `type:project` or `type:episode` as workflow requirements.

Use `agent:*` labels only when an issue should be picked up by a scheduled episode role agent:

- `agent:research`
- `agent:writer`
- `agent:producer`

Project, refactor, spike, and documentation issues should not receive episode `agent:*` labels unless the issue is specifically about implementing that agent workflow capability.

Every active episode workflow issue must have exactly one `status:*` label and at most one active `agent:*` label.

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

## Weekly Workflow Retrospective

Weekly workflow improvements must use the accessible Codex task records from
the preceding week across the relevant projects. For every proposed skill or
rule, cite a specific request, correction, artifact, failed check, review
comment, or repeated implementation pattern, then give one concrete next
action that can become an Issue or acceptance criterion. If the records do not
support a conclusion, state that evidence is insufficient.

When updating this file or a related automation, make incremental changes tied
to that evidence. Preserve the PM/research/writer/producer boundaries and the
existing artifact gates. Report separately: observed evidence, recommended
skills and next actions, file or automation changes, verification performed,
and unresolved limitations.
