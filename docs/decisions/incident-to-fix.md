# ADR 001: Incident-to-Verified-Fix Architecture & Domain Boundaries

## Status

Accepted

## Context

Relay provides a local Build workflow and an Investigate workflow. The runtime accepts incidents, collects bounded read-only Kubernetes evidence and optional telemetry, persists source results, and drafts an RCA with citations, alternatives, and uncertainty. The fix bridge connects a reviewed and validated report to Build without conflating diagnosis with code execution. Telemetry backends remain optional runtime integrations and must be validated against the deployment's query conventions.

## Decisions

### 1. Lifecycle separation

Investigation/RCA, proposal, fix workflow, and Build run/dispatch are separate lifecycles connected by identifiers. Investigation and evidence records live in the runtime's SQLite store. Fix workflows link to canonical project/run/task records; report and evidence references are checked against the originating investigation before a proposal is created.

### 2. FixProposal is the reviewed bridge

A proposal is derived from a persisted, validated RCA report and same-investigation evidence IDs. Proposal revisions are immutable. The service never launches processes or creates worktrees.

### 3. Human approval is mandatory

Only an approved proposal revision can pass preflight. The user then submits a separate launch request with project, agents, validation profile, and idempotency key.

### 4. Read-only investigation and isolated Build execution

Investigation connectors are read-only: Kubernetes collection uses GET requests through local `kubectl`; Prometheus, Loki, and Tempo use bounded HTTP GET requests against trusted runtime-configured URLs. Build agents reuse the existing coordinator and isolated worktrees; cluster credentials are not passed to them.

### 5. Reuse Build orchestration

Fix workflows call the existing `RunCoordinator.createRun()` and reuse its adapters, ProcessManager, WorktreeService, and ValidationService.

### 6. Append-only decisions

Candidate decisions are append-only SQLite records. Selection does not merge or deploy. Failed validation requires a recorded override reason.

### 7. Evaluator isolation

Evaluation ground truth belongs under `tests/evaluation/ground-truth/`, outside runtime and browser imports. Evaluation runs only after the evaluated record exists.

## Consequences

The UI supports incident intake, source/evidence review, RCA draft review, report validation, proposal review, approval, preflight, Build launch, and candidate decision. Missing telemetry produces explicit unavailable source records and can leave the investigation partial. RCA remains a deterministic evidence summary rather than an automated causal finding; human review is required before proposal generation.
