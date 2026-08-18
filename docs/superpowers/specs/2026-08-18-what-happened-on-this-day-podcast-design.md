# What Happened On This Day Podcast Design

## Summary

This repository hosts a dedicated production team for a daily "What Happened On This Day" podcast. The show is an English-language, single-story deep dive for children first and adults second. Each episode should run for 10-15 minutes, never exceed 15 minutes, and turn one date-linked historical subject into a complete story with a clear beginning, middle, and end.

The repository does not contain the global Studio Chef orchestrator. Studio Chef lives above this repository and can activate this team when the user starts or continues the project. Inside this repository, a PM agent coordinates episode execution from intake through review.

## Goals

- Produce one daily podcast episode per run from a GitHub issue.
- Run an end-to-end dry run from issue intake to research dossier, transcript, and audio artifact.
- Keep agent handoffs explicit through stable contracts and saved artifacts.
- Support future expansion to monthly batching without redesigning the daily flow.

## Non-Goals

- Full production automation with autonomous scheduling in v1.
- Voice cloning in the first proof of concept.
- Multi-voice character performances in the first proof of concept.
- Publishing, distribution, analytics, or audience delivery workflows.

## Show Format

- Language: English
- Format: Single-story deep dive
- Duration target: 10-15 minutes
- Duration hard ceiling: 15 minutes
- Audience: Children-safe, adult-friendly
- Focus type: Balanced across person, event, or object depending on story quality
- Structure:
  - Fixed opening greeting shared by every episode
  - Story setup with date context
  - Main narrative with rising stakes or curiosity
  - Resolution
  - Closing that connects the story to the modern world

The writing system should preserve one reusable opening and one reusable closing pattern, while leaving room for episode-specific detail in the body.

## System Boundaries

### External orchestration

Studio Chef is responsible for initiating or coordinating this project from outside the repository. Studio Chef may decide when to trigger this team, but it should not own the internals of daily episode execution.

### Repository-internal orchestration

The repository contains a PM agent that acts as the internal project coordinator. The PM agent reads episode issues, prepares run metadata, calls the execution agents in order, and updates state.

## Agent Topology

### PM agent

Responsibilities:

- Create `Episode` issues from an upstream brief when instructed by the user or Studio Chef
- Pick up `Episode` issues that are ready to run
- Parse issue metadata into an episode request
- Create a run directory and standardized run manifest
- Dispatch research, writing, and production in sequence
- Save artifacts after each stage
- Update GitHub issue state and summarize progress
- Mark failures as blocked with enough information to retry

The PM agent is the only repository-internal agent that should manage workflow state. Other agents are artifact producers, not project coordinators.

### Research agent

Responsibilities:

- Discover candidate historical subjects for the requested date
- Score candidates across person, event, and object angles
- Filter unsafe or unsuitable candidates
- Select the best story angle for the day
- Produce a research dossier with sources, timeline, and modern relevance

### Writer agent

Responsibilities:

- Convert the research dossier into a podcast transcript
- Follow show format rules and children-safe tone
- Preserve a fixed opening greeting
- Build a clear narrative arc with beginning, middle, and end
- End by connecting the topic to present-day life or development

### Producer agent

Responsibilities:

- Convert the approved transcript into an audio render
- Use Voicebox as the production engine
- Apply a configured stock voice or preset voice, not voice cloning
- Save render metadata for debugging and reruns

## Episode Workflow

The first proof of concept targets one complete dry run per episode:

1. Studio Chef or the user provides an upstream brief for a new daily episode, or an existing GitHub `Episode` issue is already in ready state.
2. PM agent creates a new `Episode` issue from the brief or picks up the existing ready issue.
3. PM agent parses the issue into an episode request.
4. PM agent invokes research agent.
5. Research agent outputs a research dossier.
6. PM agent invokes writer agent with the dossier.
7. Writer agent outputs transcript artifacts.
8. PM agent invokes producer agent with transcript and voice configuration.
9. Producer agent outputs audio artifacts.
10. PM agent marks the issue as `review`.
11. A human reviews the result before the issue moves to `done`.

The first proof of concept should stop at review-ready output. Human review is required before completion.

## GitHub Workflow

### Issue taxonomy

The repository uses a minimal taxonomy in v1:

- `Episode`
- `Project`

`Episode` issues are part of the automated episode workflow and are either created or picked up by the PM agent.

`Project` issues represent team-building or system-building work such as schema design, prompt tuning, or Voicebox integration. They are not part of the daily episode pipeline and should be initiated manually by the user or Studio Chef.

### Episode lifecycle

Recommended labels:

- `type:episode`
- `status:ready`
- `status:researching`
- `status:writing`
- `status:producing`
- `status:review`
- `status:done`
- `status:blocked`

### Episode issue fields

Every `Episode` issue should include structured metadata for:

- `date`
- `episode_slug`
- `language`
- `audience`
- `duration_target_min`
- `duration_max_min`
- `selected_angle`
- `entity_type`
- `current_stage`
- `output_run_path`

The PM agent should accept partial metadata and fill reasonable defaults when allowed by project rules, but it must write back final resolved metadata into the run artifacts.

When an upstream brief does not yet have a corresponding issue, the PM agent should create the `Episode` issue first, populate the initial metadata it can infer, and mark any unresolved fields explicitly for later resolution.

## Research Strategy

### Source model

Research uses a hybrid model:

- Wikipedia can be used for candidate discovery and initial timeline building
- At least 1-2 stronger supporting sources should be used for confirmation where available
- Saved dossier output must keep source attribution explicit

### Candidate selection

The research agent should evaluate multiple candidates for the date and choose one based on:

- Story quality
- Clarity for children
- Room for a 10-15 minute narrative
- Modern relevance
- Suitability for a person, event, or object lens

### Safety and editorial filtering

The podcast may mention difficult historical topics, including war, when they are necessary to explain history. However, the system should avoid:

- Graphic violence
- Gore
- Sensational suffering
- Hate-inciting framing
- Frightening detail beyond the audience target

The guiding editorial posture is educational, calm, and age-aware. Difficult subjects should be contextualized rather than dramatized.

### Research dossier contract

The research agent should produce a dossier with at least:

- Episode date
- Chosen subject
- Entity type: `person`, `event`, or `object`
- Chosen angle
- One-sentence episode thesis
- Short timeline
- Key story beats
- Why this matters today
- Source list
- Safety notes

## Writing Strategy

### Narrative requirements

The writer agent must produce a transcript that:

- Opens with a fixed greeting
- Introduces the date and subject clearly
- Builds curiosity early
- Explains context in child-friendly English
- Develops a beginning, middle, and end
- Closes by connecting the story to the present day

### Fixed opening

The opening should be standardized across episodes and sourced from shared configuration rather than embedded separately in every transcript body. The transcript contract should reserve a distinct opening section so the team can revise the shared greeting in one place without rewriting episode-specific narrative content.

### Transcript contract

The writer agent should output:

- `transcript.md` for readable editorial review
- `transcript.json` for machine-readable downstream use

The structured transcript should include:

- Opening
- Segment list
- Closing
- Estimated duration
- TTS or pacing notes

## Production Strategy

### Engine

The first proof of concept uses Voicebox as the TTS engine.

### Voice configuration

- No voice cloning in v1
- Use a stock or preset narrator voice
- Keep configuration externalized so voice selection can change without code edits

### Producer output

The producer agent should output:

- Primary audio file such as `mp3` or `wav`
- Render metadata
- Failure notes if rendering does not succeed

### Long transcript handling

The system should assume long-form narration and preserve chunking compatibility, since Voicebox supports long text generation workflows.

## Repository Structure

```text
what-happened-on-this-day-podcast/
  agents/
    pm-agent/
    research-agent/
    writer-agent/
    producer-agent/
  contracts/
    episode-request.schema.json
    research-dossier.schema.json
    transcript.schema.json
    audio-job.schema.json
  prompts/
    research/
    writer/
    producer/
  configs/
    editorial-policy.md
    source-policy.md
    show-format.json
    voicebox.json
  runs/
  tests/
  docs/
    superpowers/
      specs/
```

This structure separates orchestration, contracts, prompts, policy, and run artifacts so each can evolve independently.

## Run Artifacts

Each PM-run episode should create a dedicated run directory. A run directory should contain:

- Resolved request metadata
- Research dossier
- Transcript artifacts
- Producer job configuration
- Audio outputs
- Logs or failure summaries

The system should prefer artifact persistence over implicit in-memory state so every episode run is debuggable and reviewable.

## Failure Handling

If any stage fails:

- PM agent marks the issue `status:blocked`
- PM agent writes a concise failure summary
- The most recent successful artifact remains saved
- Later reruns should be able to resume from the latest valid stage where feasible

The proof of concept does not need a full queue or job recovery engine, but it should preserve enough state for manual rerun decisions.

## Future Expansion

The architecture should support later additions without breaking the daily flow:

- Monthly batch generation
- Calendar- or Drive-based scheduling
- Stronger source validation
- Human review checkpoints before production
- Publishing workflows
- Studio Chef multi-project orchestration

## Decisions Captured

- Separate top-level Studio Chef from repository-internal PM agent
- Keep v1 taxonomy minimal with `Episode` and `Project`
- Let PM agent create or pick up only `Episode`
- Use hybrid research sourcing
- Use balanced person/event/object candidate selection
- Use English for the first proof of concept
- Use a single-story deep-dive format
- Require human review before marking an episode done
- Use Voicebox without voice cloning in v1
