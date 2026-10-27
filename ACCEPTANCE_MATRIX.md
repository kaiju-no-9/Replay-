# Acceptance Matrix

Status recorded 2026-10-27. “Passed” means covered by an automated test or manually observed in the user's local environment; it does not imply production deployment.

| Area | Requirement | Evidence | Status / remaining |
|---|---|---|---|
| Build | Local projects, isolated worktrees, runs/tasks/dispatches, agent adapters, streamed output, validation, diff and scorecard | Runtime tests and existing UI/runtime implementation | Implemented; user exercised a real OpenCode run, but its configured `claude-fable-5` model was rejected by OpenCode. Configure a supported provider/model before agent-run acceptance. |
| Build | Scorecard API and UI | `GET /api/v1/runs/:id/scorecard`; Vite/browser logs | Route is implemented. User's UI request failed because Vite reported `ECONNREFUSED 127.0.0.1:4400`; verify with runtime continuously listening before judging scorecard behavior. |
| Build | Type correctness | User-reported `pnpm typecheck` | Passed locally. |
| Build | Runtime tests | User-reported `pnpm test` | 9 files / 35 tests passed. |
| Build | Production bundle | `pnpm build` | Not run; user deferred it due runtime duration. |
| Investigate | Authenticated incident intake and persisted investigation/report retrieval | User's successful `POST` and `GET /api/v1/investigations` | Passed locally against the Kind cluster. |
| Investigate | Live, read-only Kubernetes data | Kubernetes source in the saved investigation; `kubectl auth can-i` checks | Passed locally: pod and event evidence returned; pod was Running/Ready. |
| Investigate | Read-only Kubernetes guard and evidence projection | `evaluation-security.test.ts`, connector code | Automated coverage exists; no cluster mutations were performed by the connector test. |
| Investigate | Prometheus, Loki, Tempo telemetry | Connector configuration and collection code | Implemented but not live-verified; endpoint URLs and any required token are not configured. |
| Investigate | Deterministic RCA with citations, alternatives, and uncertainty | Investigation service and persisted draft report | Passed as draft generation. It explicitly does not establish causality. |
| Investigate | Browser intake/review flow | `InvestigationPanel.tsx` | Implemented; user tested the API directly. UI-driven investigation acceptance remains to be confirmed. |
| Incident Fix | Proposal requires validated report and same-investigation evidence | `fix-workflow.test.ts`, proposal service | Covered by tests; full live UI path has not been verified. |
| Incident Fix | Approval, preflight, isolated Build handoff, candidate decisions | Fix routes/services and `FixWorkflowPanel.tsx` | Implemented; full browser-to-Build end-to-end flow remains to be verified. |
| Security / recovery | Local auth, loopback binding, telemetry URL validation, bounded responses, redaction, read-only collection | Runtime code and security tests | Implemented; broaden external-source and restart/recovery integration coverage. |
| Evaluation | Offline scenarios and evaluator | `tests/evaluation/`, `apps/runtime/src/evaluation/` | Fixtures/evaluator are offline; they do not launch a Kubernetes fault injector. |

## Remaining acceptance work

1. Restore and maintain a healthy runtime listener while the browser is open; confirm Build scorecard and diff UI requests return API responses.
2. Select a supported OpenCode `provider/model` (or another installed agent) and repeat a Build task on the buggy-code practice repository.
3. Run an investigation from the browser and inspect persisted evidence/report in the UI.
4. Configure at least one real Prometheus, Loki, or Tempo endpoint and verify query results/labels against that backend.
5. Review a meaningful incident RCA, validate it, create and approve a proposal, run preflight, launch an isolated candidate, and record a decision.
6. Run `pnpm build` when acceptable; do not count it as passed until completed.

No changes have been pushed to GitHub as part of this implementation/documentation work.
