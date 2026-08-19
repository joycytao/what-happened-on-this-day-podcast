## Summary

Build the first foundation for the `what-happened-on-this-day-podcast` team so the repo can support an end-to-end dry run:

`Episode issue -> research dossier -> transcript -> audio -> review`

This issue tracks the podcast POC system setup work, not a single episode.

## Goals

- Set up the repo as a TypeScript agent workspace
- Define shared contracts, configs, and prompts
- Build the PM agent intake and run-manifest flow
- Build the research and writer agents
- Build the producer agent with a Voicebox-based dry run
- Reach a review-ready end-to-end pipeline

## Scope

This issue is for foundation work only.

In scope:
- repo scaffold
- contracts
- configs
- prompts
- PM agent orchestration
- research/writer/producer agent stubs or fixture-mode implementations
- end-to-end dry run

Out of scope:
- production publishing
- monthly batch generation
- voice cloning
- full autonomous scheduling
- multi-voice performances

## Tasks

- [ ] Scaffold repo and TypeScript workspace
- [ ] Define contracts, config, and prompts
- [ ] Build PM agent intake and run flow
- [ ] Build research and writer agents
- [ ] Build producer agent and end-to-end dry run

## Working Rules

- This repo-level system is coordinated internally by the `PM agent`
- `Studio Chef` remains the higher-level orchestrator outside this repo
- `PM agent` can create or pick up `Episode` issues, but this project issue is not part of the daily episode pipeline
- Human review is required before an episode is considered done

## Done When

This issue is done when:
- all 5 foundation tasks are complete
- the repo can run one POC dry run from intake to review-ready audio artifact
- the system is ready for `Episode` issues to become the main production unit
