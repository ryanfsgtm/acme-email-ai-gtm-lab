# Implementation Plan

## Objective

Build a public-safe workshop repository backed by one isolated hosted Attio workspace per student and a large deterministic ACME Email corpus. A coding agent must construct a reliable, inspectable analysis system against a real authenticated CRM API rather than attempt an unsupported one-shot summary.

## Architectural decisions

### Use hosted Attio; do not operate classroom infrastructure

Students create free Attio workspaces and scoped single-workspace API tokens. Attio supplies authentication, Companies, People, Deals, Notes, pagination, and a real logged-in CRM. The workshop repository owns only deterministic seed data, reviewable import tooling, analysis code, and validation. There is no local CRM or fallback provider.

### Canonical seed corpus plus live CRM representation

The authored corpus remains the deterministic provenance for importing each isolated workspace. Companies and People use stable unique domains and emails. Deals carry stable ACME opportunity markers. Transcripts are attached to Company records as Notes with stable call IDs and checksums embedded in their bodies. During the exercise, Attio is the requested system of record and students must demonstrate API coverage rather than claim corpus-wide analysis from a local sample.

### Public-safe history from the first commit

The hidden truth ledger and answer evaluator must never be committed here. They live in ignored instructor storage and will move to a permanently private companion repository. Public evaluation can measure coverage, citations, schemas, and reproducibility without revealing semantic answers.

## Work graph

### Phase 1: Foundation

- Verify Attio object and permission requirements.
- Define deterministic public world configuration.
- Generate accounts, contacts, opportunities, transcript files, and a checksum manifest.
- Add inventory and validation commands.

This phase unblocks every later task because it establishes stable IDs, scale, and reproducibility.

### Phase 2: Private truth model

- Define each hidden gem with population, prevalence, time window, speaker roles, expected evidence, business effect, confounders, and counterexamples.
- Validate that gems do not contradict one another or create unrealistic aggregate outcomes.
- Create deterministic scenario assignments from truth-ledger rules.

This remains outside the public repository. It blocks transcript generation because dialogue must encode causal scenarios rather than arbitrary keywords.

### Phase 3: Scenario and transcript generation

- Generate call scenario plans from account, opportunity, persona, and hidden-event state.
- Produce varied multi-speaker transcripts with indirect language, interruptions, seller-led topics, ambiguity, and transcription noise.
- Preserve private provenance from each evidence span to its truth-ledger rule.
- Verify corpus scale, distribution, duplicate rate, vocabulary diversity, and scenario coverage.

### Phase 4: Attio export and seeding

- Export Companies, People, and Deals into Attio-ready CSV artifacts.
- Represent transcripts as Notes attached to Companies so the free plan is sufficient.
- Implement idempotent API-based seeding with bounded concurrency and retry logging.
- Implement reconciliation and reset commands.
- Require explicit `--apply`; otherwise print a mutation plan.

### Phase 5: Student analysis substrate

- Commit the naive prompt and a deliberately weak baseline report.
- Define schemas for observations, evidence spans, batch checkpoints, failures, and aggregate claims.
- Leave bounded implementation gaps suitable for a 45-minute coding-agent exercise.
- Add CLI help, agent instructions, and recovery guidance.

### Phase 6: Private reference system

- Inventory every source.
- Normalize speakers and CRM metadata.
- Chunk transcripts without losing stable coordinates.
- Extract structured, cited observations.
- Validate schema and citation spans.
- Persist resumable JSONL intermediates.
- Aggregate by theme, segment, persona, stage, time, ARR, and outcome.
- Preserve minority signals and counterexamples.
- Generate a report whose claims link to source calls and Twenty records.

### Phase 7: Evaluation

- Public checks: coverage, citation validity, schema validity, failure visibility, determinism, and incremental reruns.
- Private checks: hidden-gem recall, unsupported-claim rate, speaker attribution, segmentation accuracy, temporal detection, and false-correlation avoidance.
- Compare naive and systematic approaches using the same full Attio corpus.

### Phase 8: Classroom reliability

- Test Attio signup, token creation, seeding, and reset on macOS and Windows/WSL.
- Rehearse with Codex and Cursor.
- Measure generation, CRM seeding, and analysis duration.
- Prepare a pre-class setup deadline and workspace verification checklist.
- Create checkpoint tags and a facilitator runbook.

## Completion criteria

- A clean clone can generate and validate the full corpus deterministically.
- A fresh Attio workspace receives idempotent seeded records only after an approved plan.
- No hidden answer exists anywhere in public Git history.
- The naive baseline demonstrably lacks coverage and evidence guarantees.
- The reference system processes every manifest entry or explicitly reports failures.
- Every published analytical claim has traceable source evidence.
- The exercise can be completed with coding-agent and CLI interaction while Attio provides visible CRM verification.
