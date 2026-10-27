# Implementation Status and Remaining Gaps

Status recorded 2026-10-27. This report reflects code present in the repository and test results reported by the user; it does not claim production readiness.

## Shipped implementation

### Build

- Local React/Vite UI and Fastify runtime with authenticated HTTP/WebSocket APIs.
- Local project registration, agent adapters, isolated Git worktrees, run/task/dispatch lifecycle, terminal output, validation, diffs, and scorecards.
- SQLite persistence and recovery handling.
- User-reported manual validation: `pnpm typecheck` passed; `pnpm test` passed all 9 runtime test files / 35 tests.
- User exercised an OpenCode Build run, but OpenCode rejected the configured `claude-fable-5` model. Configure an enabled `provider/model` before treating agent execution acceptance as passed.
- User later saw Vite `ECONNREFUSED 127.0.0.1:4400` for scorecard, diff, and WebSocket requests. This establishes the runtime was unreachable at that time; the scorecard route's behavior under a healthy runtime still needs browser verification.
- `pnpm build` has not been run in this acceptance pass.

### Investigate / RCA

- Authenticated incident intake, persisted investigation/source/evidence data, GET retrieval, and report validation route.
- Read-only Kubernetes collection of pods, deployments, and events; bounded/redacted evidence projection and read-only verb guard.
- Optional Prometheus, Loki, and Tempo range/search connectors with bounded HTTP response handling and optional bearer auth.
- Deterministic RCA draft with citations, alternative hypotheses, confidence, and explicit uncertainty.
- User manually verified a live `kind-local` context: authorization checks returned yes; a POST created an investigation; Kubernetes evidence contained a Running/Ready `kindnet` pod and events; a GET retrieved the persisted investigation.
- That investigation status was `partial` because no telemetry URLs were configured. The `kindnet` result is a connector smoke test, not an actual incident or verified cause.

### Incident Fix

- Persisted proposal, workflow, and decision lifecycle; proposal creation validates report status and same-investigation evidence references.
- Explicit approval/preflight gates; launches reuse the existing Build coordinator and isolated worktrees.
- Candidate decisions are append-only; selecting a candidate does not merge or deploy.
- Browser investigation/review and Incident Fix surfaces are implemented. The full UI-driven investigate → validate → proposal → approval → Build candidate path has not yet been confirmed end to end.

## Remaining work, ordered

1. **Restore reliable local runtime connectivity:** keep runtime listening on `127.0.0.1:4400` while web UI is open; then verify scorecard, diff, and WebSocket requests from the browser.
2. **Complete Build smoke test:** configure a supported model/provider for OpenCode or use another installed CLI; run a targeted task against `/Users/nishchaykumar/Desktop/--practice-challenge-buggy-code`; inspect the resulting diff and scorecard. Do not push to GitHub.
3. **Complete UI investigation smoke test:** submit an incident from the UI, review returned source evidence/RCA, and confirm the persisted record in the UI.
4. **Verify real telemetry:** configure at least one real Prometheus, Loki, or Tempo endpoint and validate its labels/query format, auth, and time window. All three connectors currently lack user-configured endpoints.
5. **Complete reviewed handoff:** use a meaningful investigated incident, review/validate the report, create and approve a proposal, run preflight, launch a candidate, and record a decision.
6. **Broaden integration verification:** source timeout, malformed and oversized telemetry responses, auth failures, report citations, runtime restart/recovery, and full browser/API lifecycle.
7. **Run production bundle build:** `pnpm build` remains unverified because the user deferred the long-running build.

## Verification commands

```sh
pnpm typecheck
pnpm test
pnpm build
```

The first two are reported passed by the user for this working tree. Build remains pending. Do not treat offline scenarios under `tests/evaluation/` as a live Kubernetes fault-injection test.
