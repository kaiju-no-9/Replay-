# Relay — Live Demonstration Script (15 Steps)

A scripted 5-minute walkthrough of the "Race to Green" workflow, using the deterministic demo fixture (no API keys required).

---

### Step 1: Prepare the demo repo
```bash
./scripts/prepare-demo.sh
```
This creates `data/demo-project` — a git repo containing a buggy `calculateDiscount()` whose tests fail.

### Step 2: Start Relay in demo mode
```bash
RELAY_DEMO_MODE=true pnpm dev
```
Verify both processes start cleanly: runtime on `127.0.0.1:4400`, web on `localhost:5173`.

### Step 3: Copy the runtime token
The runtime prints `Runtime Auth Token: <hex>` in its console output. Copy it.

### Step 4: Open the cockpit
Navigate to **http://localhost:5173** and paste the token into the connection gate.

### Step 5: Verify connection
The sidebar indicator turns green: **Runtime v0.1.0**.

### Step 6: Inspect agent probes
Open **Agents** in the sidebar:
- Real CLIs (Codex, Claude, OpenCode, Antigravity) show their true probe status.
- **Demo Winner (fixture)** and **Demo Loser (fixture)** appear as installed — clearly labelled as deterministic fixtures.
- Point out the capability matrix: fixtures support one-shot tasks only; input is disabled with a reason.

### Step 7: Register the demo repository
In **Workspace**, register: `data/demo-project` (full path shown by the prepare script).
Relay detects branch `main` and the base commit.

### Step 8: Create the validation profile (first time only)
If you passed the token to `prepare-demo.sh`, the **Node Test Suite** profile already exists (`node test.js`, 30s timeout). Otherwise create it via the API.

### Step 9: Compose the task
Enter the prompt:
```
Fix the percentage discount formula in index.js so test.js assertions pass.
```

### Step 10: Select agents and profile
Select **Demo Winner** and **Demo Loser**, choose the **Node Test Suite** validation profile, keep concurrency at 3.

### Step 11: Launch "Race to Green"
Click **Launch Race to Green**. Relay immediately:
- creates two isolated worktrees from the same base commit,
- spawns both agents concurrently,
- opens the **Live Run** view.

### Step 12: Supervise concurrent sessions
Click between the agent tabs:
- each streams its own terminal output from its own worktree,
- statuses transition `starting → running → succeeded` independently,
- the run timeline records each transition.

### Step 13: Review the scorecard
When both finish, open **Scorecard**:
- **Demo Winner**: `Validated` — process exit 0 AND `node test.js` passed.
- **Demo Loser**: `Needs Review` — process exit 0 but tests FAILED.
- Point at the loser's untrusted self-report: *"Task complete! All tests pass."* — Relay's evidence layer caught the lie.

### Step 14: Inspect diffs and keep the winner
- Click **View Diff** on the winner: green additions show the correct formula.
- Click **View Diff** on the loser: it just returns the original price.
- Back on the scorecard, click **Keep Candidate** on the winner. Its card gets a purple selection ring. Emphasize: **no merge happened** — selection only records your choice.

### Step 15: Refresh the browser
Hit `Cmd+R`. The URL carries `?run=<id>`; the run, scorecard, selection, and terminal evidence reload from SQLite — nothing was lost.

---

## Presenter Notes

- If judging time is short, skip steps 6–8 (do them before the session).
- To reset: `rm -rf data/ && ./scripts/prepare-demo.sh` and restart.
- With real CLIs installed (Codex, Claude, etc.), the same 15 steps work unchanged — select real agents instead of fixtures.
