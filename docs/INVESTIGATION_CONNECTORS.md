# Read-only investigation connectors

The runtime exposes authenticated `POST /api/v1/investigations`, `GET /api/v1/investigations/:id`, and `POST /api/v1/investigations/:id/reports/:reportId/validate` endpoints. The browser has an **Investigate** intake/review surface and an **Incident Fix** proposal and approval surface. Incident intake runs a fixed, read-only collection window (up to 30 minutes) for the supplied service. It does not accept arbitrary shell commands, queries, URLs, Kubernetes verbs, namespaces, or resource names from the browser.

## Runtime configuration

- `RELAY_KUBERNETES_CONTEXT` optionally pins the local kubeconfig context. If omitted, `kubectl` uses its normal current context.
- `KUBECTL_PATH` optionally selects the local `kubectl` executable.
- `RELAY_PROMETHEUS_URL`, `RELAY_LOKI_URL`, and `RELAY_TEMPO_URL` configure telemetry base URLs.
- `RELAY_TELEMETRY_BEARER_TOKEN` optionally authenticates the telemetry GET requests.

The telemetry URLs are server configuration, not request input; this avoids a browser-controlled SSRF target. Only HTTP(S) base URLs without embedded credentials, query strings, or fragments are accepted. Responses have a 15 second timeout and a 1 MB cap. Configure these sources only on a trusted local runtime. For example, export the endpoint variables in the same shell that starts the runtime; do not place tokens in browser forms or commit them:

```sh
RELAY_KUBERNETES_CONTEXT=kind-local \
RELAY_PROMETHEUS_URL=http://127.0.0.1:9090 \
pnpm dev:runtime
```

Add `RELAY_LOKI_URL`, `RELAY_TEMPO_URL`, and `RELAY_TELEMETRY_BEARER_TOKEN` only when those services are available and require authentication. Restart the runtime after changing environment variables.

## Collection behavior and limits

Kubernetes collection calls `kubectl get pods,deployments,events --all-namespaces -o json` with a 15 second timeout. The guard rejects non-GET/HEAD methods. Persisted Kubernetes evidence contains only selected metadata, status, container image/restart/state, and bounded event message fields; it excludes pod specs, environment variables, annotations, and Secret resources. The command requires a local kubeconfig with read access. Check the context and permissions before starting the runtime:

```sh
kubectl config current-context
kubectl auth can-i list pods --all-namespaces
kubectl auth can-i list deployments --all-namespaces
kubectl auth can-i list events --all-namespaces
```

Prometheus uses `/api/v1/query_range` with an `up{service="..."}` expression. Loki uses `/loki/api/v1/query_range` with a service label selector. Tempo uses `/api/search` for the service and time range. Label names and backend query conventions vary between organizations; this first version assumes a `service` label for Prometheus/Loki and Tempo's standard service resource attribute. The connector records source failures as partial/failed investigation results rather than inventing evidence.

RCA generation is a deterministic evidence summary with competing hypotheses, confidence values, citations, and explicit uncertainty. It is a draft, not an automated causal determination. A reviewer must validate the cited report revision before the fix-proposal endpoint will accept it. Investigation data is untrusted when passed into the Build workflow. A healthy system pod is a connector smoke test, not a meaningful root-cause demonstration.

## Manual API smoke test

Start the runtime with `RELAY_KUBERNETES_CONTEXT` set and keep it running. Use a `service` value matching a real `app` or `app.kubernetes.io/name` pod label. Replace the bearer token locally with the token printed at runtime startup:

```sh
curl -sS -X POST http://127.0.0.1:4400/api/v1/investigations \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_RUNTIME_TOKEN' \
  -d '{
    "title": "Local Kubernetes connector check",
    "summary": "Check current pod and deployment health for this service.",
    "severity": "sev3",
    "service": "YOUR_SERVICE_LABEL",
    "startsAt": "2026-10-27T00:00:00.000Z"
  }'
```

Expected: HTTP 201, Kubernetes source `ok`, and an investigation/report in SQLite. If no telemetry endpoints are set, those sources are `unavailable`, the report lists the missing signals in its uncertainty, and the investigation status is `partial`. Fetch the persisted result with `GET /api/v1/investigations/:id`.

## Current verification and remaining work

The user manually verified a live Kind context with read permissions and successfully created and fetched an investigation: Kubernetes evidence included a Running `kindnet` pod and events; Prometheus, Loki, and Tempo were unavailable because no URLs were configured. The user also reported that workspace typecheck and all 35 runtime tests passed. A full build was not run. The UI Build scorecard request later showed Vite `ECONNREFUSED` to the runtime port, which is a runtime connectivity failure and does not establish whether the scorecard route itself works in that session.

Still to verify against this installation: at least one real Prometheus/Loki/Tempo endpoint and its label conventions; UI-driven investigation/review; the full reviewed RCA → proposal → approval → Build launch path; telemetry timeout/malformed/oversized response handling; and browser/runtime recovery when the runtime is stopped or restarted.
