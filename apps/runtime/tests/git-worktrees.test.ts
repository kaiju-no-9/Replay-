import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitService } from '../src/git/git-service.js';
import { WorktreeService } from '../src/git/worktree-service.js';

describe('Git & Worktree Service Integration', () => {
  let tempDir: string;
  let repoRoot: string;
  let baseCommitSha: string;
  let git: GitService;
  let worktreeService: WorktreeService;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-repo-'));
    repoRoot = path.join(tempDir, 'sample-repo');
    fs.mkdirSync(repoRoot);

    execFileSync('git', ['init', '-b', 'main'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.name', 'Relay Tester'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.email', 'test@relay.local'], { cwd: repoRoot });

    fs.writeFileSync(path.join(repoRoot, 'index.ts'), 'export const greeting = "hello";\n');
    execFileSync('git', ['add', '.'], { cwd: repoRoot });
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoRoot });

    baseCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim();

    git = new GitService();
    worktreeService = new WorktreeService(git);
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('verifies repo root and reads repository status', async () => {
    const info = await git.getRepoInfo(repoRoot);
    expect(info.isClean).toBe(true);
    expect(info.currentBranch).toBe('main');
    expect(info.headSha).toBe(baseCommitSha);
  });

  it('creates two distinct worktrees from the same base commit', async () => {
    const runId = 'test-run-12345678';
    const wtA = await worktreeService.createWorktree({
      projectRoot: repoRoot,
      baseCommit: baseCommitSha,
      runId,
      agentId: 'codex',
      attemptNumber: 1,
    });

    const wtB = await worktreeService.createWorktree({
      projectRoot: repoRoot,
      baseCommit: baseCommitSha,
      runId,
      agentId: 'claude',
      attemptNumber: 1,
    });

    expect(wtA.worktreePath).not.toBe(wtB.worktreePath);
    expect(wtA.branchName).not.toBe(wtB.branchName);
    expect(fs.existsSync(wtA.worktreePath)).toBe(true);
    expect(fs.existsSync(wtB.worktreePath)).toBe(true);
  });

  it('guarantees complete isolation between worktrees', async () => {
    const list = await worktreeService.listWorktrees(repoRoot);
    const wtCodex = list.find((w) => w.branch.includes('codex'));
    const wtClaude = list.find((w) => w.branch.includes('claude'));

    expect(wtCodex).toBeDefined();
    expect(wtClaude).toBeDefined();

    fs.appendFileSync(path.join(wtCodex!.path, 'index.ts'), '// modified by codex\n');

    const claudeContent = fs.readFileSync(path.join(wtClaude!.path, 'index.ts'), 'utf-8');
    expect(claudeContent).not.toContain('modified by codex');

    const diff = await worktreeService.getWorktreeDiff(wtCodex!.path, baseCommitSha);
    expect(diff.changedFiles.length).toBeGreaterThan(0);
    expect(diff.diffContent).toContain('// modified by codex');
  });

  it('refuses to delete a dirty worktree unless force=true', async () => {
    const list = await worktreeService.listWorktrees(repoRoot);
    const wtCodex = list.find((w) => w.branch.includes('codex'))!;

    await expect(worktreeService.cleanupWorktree(repoRoot, wtCodex.path, false)).rejects.toThrow(
      /uncommitted change/i
    );

    const result = await worktreeService.cleanupWorktree(repoRoot, wtCodex.path, true);
    expect(result.removed).toBe(true);
    expect(fs.existsSync(wtCodex.path)).toBe(false);
  });

  it('rejects path traversal attempts outside project boundaries', async () => {
    await expect(
      worktreeService.createWorktree({
        projectRoot: repoRoot,
        baseCommit: baseCommitSha,
        runId: '../../etc/passwd',
        agentId: 'malicious',
        attemptNumber: 1,
      })
    ).rejects.toThrow();
  });
});
