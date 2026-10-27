# Investigate-to-Fix Runbook

This runbook covers the implemented flow from a local incident investigation to a reviewable Build candidate. All steps are local. Relay does not merge or deploy a candidate automatically.

## Prerequisites

- Node.js 22, pnpm, Git, and the repository dependencies installed.
- A reachable local Kubernetes context and a read-only kubeconfig identity for pods, deployments, and events.
- At least one installed/authenticated coding-agent CLI for the Build handoff.
- Optional: Prometheus, Loki, and/or Tempo endpoints configured on the runtime. Without them, their sources show as unavailable and the investigation is partial.
- A registered Git project and, if desired, a validation profile.

## Start Relay

Start both services with the intended Kubernetes context:

```sh
RELAY_KUBERNETES_CONTEXT=kind-local pnpm dev
```

Keep the terminal open, open `http://localhost:5173`, and connect with the runtime token printed at startup. If the runtime stops, browser API requests and scorecard/diff requests will fail until it listens again on `127.0.0.1:4400`.

For split terminals, start the runtime and web app separately:

```sh
RELAY_KUBERNETES_CONTEXT=kind-local pnpm dev:runtime
```

```sh
pnpm dev:web
```

## Investigate and review

1. In **Investigate**, submit an incident with a service identifier that matches a real `app` or `app.kubernetes.io/name` Kubernetes label.
2. Check source statuses. Confirm Kubernetes evidence corresponds to the selected service and incident window. For telemetry sources, check for real observations rather than only an `ok` status.
3. Read the bounded source evidence, the report's citations, competing hypotheses, and uncertainty.
4. Treat the RCA as a draft correlation summary. Validate only after a human review confirms its evidence is appropriate. Do not validate the Kind `kindnet` connectivity smoke test as a real root-cause finding: its pod was healthy.

## Create and execute a fix proposal

1. From a reviewed, validated report, use **Create fix proposal** or open **Incident Fix** and supply the investigation and report IDs.
2. Review the generated proposal and evidence references, then explicitly approve the proposal revision.
3. Select a registered project, installed agent, and optional validation profile. Run preflight and review every result.
4. Launch the approved fix. Relay creates an isolated worktree and uses the existing Build coordinator.
5. Review agent output, changed files, diff, and validation scorecard. Record candidate selection/rejection. A failed validation requires an explicit override reason to select the candidate.

## Limits

- Kubernetes access is read-only. The connector requests pods, deployments, and events, and persists only bounded selected fields; it does not pass kubeconfig credentials to Build agents.
- Telemetry source URLs and optional bearer auth are runtime environment configuration. See [`docs/INVESTIGATION_CONNECTORS.md`](docs/INVESTIGATION_CONNECTORS.md).
- Missing or failed evidence is disclosed; the RCA must not be treated as verified causality.
- `tests/evaluation/` contains offline evaluation fixtures. They do not deploy workloads or inject faults into a cluster.
- A UI message such as `ECONNREFUSED 127.0.0.1:4400` means the local runtime is unavailable. Restore the runtime before diagnosing a scorecard, diff, or investigation route.
