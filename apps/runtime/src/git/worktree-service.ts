import path from 'node:path';
import fs from 'node:fs';
import { GitService, gitService } from './git-service.js';

export interface CreateWorktreeOptions {
  projectRoot: string;
  baseCommit: string;
  runId: string;
  agentId: string;
  attemptNumber: number;
}

export interface WorktreeDetail {
  path: string;
  branch: string;
  headSha: string;
  isLocked: boolean;
}

export interface WorktreeDiffResult {
  statSummary: string;
  diffContent: string;
  isTruncated: boolean;
  totalAdditions: number;
  totalDeletions: number;
  changedFiles: Array<{ path: string; status: 'M' | 'A' | 'D' | 'R' | '?' }>;
}

export class WorktreeService {
  constructor(private git: GitService = gitService) {}

  /**
   * Create an isolated Git worktree and dedicated branch for an agent dispatch.
   * Names are generated internally; never derived from untrusted user text.
   */
  async createWorktree(opts: CreateWorktreeOptions): Promise<{ worktreePath: string; branchName: string }> {
    const root = await this.git.getRepoRoot(opts.projectRoot);

    // Reject path traversal attempts outright before any name generation
    for (const component of [opts.runId, opts.agentId]) {
      if (component.includes('..') || component.includes('/') || component.includes('\\') || component.includes('\0')) {
        throw new Error(`Path traversal detected in worktree identifier: ${component}`);
      }
    }

    // Sanitize components: only allow safe chars in generated names
    const safeRun = opts.runId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8);
    const safeAgent = opts.agentId.replace(/[^a-zA-Z0-9-]/g, '');
    const attempt = Math.max(1, Math.floor(opts.attemptNumber));

    if (!safeRun || !safeAgent) {
      throw new Error('Invalid run or agent identifier for worktree naming');
    }

    const branchName = `relay/${safeRun}/${safeAgent}-${attempt}`;
    const worktreesBase = path.join(root, '.relay', 'worktrees');
    const worktreePath = path.resolve(worktreesBase, safeRun, `${safeAgent}-${attempt}`);

    // Verify target path stays inside project boundary
    if (!worktreePath.startsWith(root + path.sep)) {
      throw new Error(`Target worktree path escapes project root: ${worktreePath}`);
    }

    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory already exists: ${worktreePath}`);
    }

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    const addRes = await this.git.runGit(
      ['worktree', 'add', '-b', branchName, worktreePath, opts.baseCommit],
      root
    );

    if (addRes.exitCode !== 0) {
      throw new Error(`Failed to create git worktree: ${addRes.stderr}`);
    }

    // Ensure .relay is gitignored in the main repo so worktrees don't pollute status
    const gitignorePath = path.join(root, '.gitignore');
    try {
      const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
      if (!existing.split('\n').some((l) => l.trim() === '.relay/')) {
        fs.appendFileSync(gitignorePath, `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}.relay/\n`);
      }
    } catch {
      // Non-fatal
    }

    return {
      worktreePath: fs.realpathSync(worktreePath),
      branchName,
    };
  }

  async listWorktrees(projectRoot: string): Promise<WorktreeDetail[]> {
    const root = await this.git.getRepoRoot(projectRoot);
    const res = await this.git.runGit(['worktree', 'list', '--porcelain'], root);
    if (res.exitCode !== 0) {
      throw new Error(`Failed to list worktrees: ${res.stderr}`);
    }

    const items: WorktreeDetail[] = [];
    const entries = res.stdout.split('\n\n');

    for (const entry of entries) {
      if (!entry.trim()) continue;
      const lines = entry.split('\n');
      let wtPath = '';
      let headSha = '';
      let branch = '';
      let isLocked = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) wtPath = line.substring(9).trim();
        else if (line.startsWith('HEAD ')) headSha = line.substring(5).trim();
        else if (line.startsWith('branch ')) branch = line.substring(7).trim();
        else if (line.startsWith('locked')) isLocked = true;
      }

      if (wtPath) {
        items.push({
          path: wtPath,
          branch: branch.replace(/^refs\/heads\//, ''),
          headSha,
          isLocked,
        });
      }
    }

    return items;
  }

  /**
   * Compute diff and stats comparing worktree HEAD + working tree against base commit.
   * Includes uncommitted changes (diff against base with working tree state).
   */
  async getWorktreeDiff(worktreePath: string, baseCommit = 'HEAD'): Promise<WorktreeDiffResult> {
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path not found: ${worktreePath}`);
    }

    const statRes = await this.git.runGit(['diff', '--stat', baseCommit], worktreePath);

    // Changed files vs base (covers committed work) + untracked/modified working tree files
    const changedFiles: Array<{ path: string; status: 'M' | 'A' | 'D' | 'R' | '?' }> = [];
    const seen = new Set<string>();

    const nameStatusRes = await this.git.runGit(['diff', '--name-status', baseCommit], worktreePath);
    for (const line of nameStatusRes.stdout.split('\n')) {
      if (!line.trim()) continue;
      const [flag, ...rest] = line.split('\t');
      const filePath = rest[rest.length - 1]?.trim();
      if (!filePath) continue;
      const status = flag.startsWith('M')
        ? 'M'
        : flag.startsWith('A')
          ? 'A'
          : flag.startsWith('D')
            ? 'D'
            : flag.startsWith('R')
              ? 'R'
              : '?';
      changedFiles.push({ path: filePath, status });
      seen.add(filePath);
    }

    const statusRes = await this.git.runGit(
      ['status', '--porcelain', '--ignore-submodules=dirty'],
      worktreePath
    );
    for (const line of statusRes.stdout.split('\n')) {
      if (!line.trim()) continue;
      const flag = line.substring(0, 2).trim();
      const filePath = line.substring(3).trim();
      if (seen.has(filePath)) continue;
      const status = flag.includes('M')
        ? 'M'
        : flag.includes('A')
          ? 'A'
          : flag.includes('D')
            ? 'D'
            : flag.includes('R')
              ? 'R'
              : '?';
      changedFiles.push({ path: filePath, status });
      seen.add(filePath);
    }

    const MAX_DIFF_BYTES = 500 * 1024;
    const diffRes = await this.git.runGit(['diff', baseCommit], worktreePath);
    let diffContent = diffRes.stdout;
    let isTruncated = false;

    if (diffContent.length > MAX_DIFF_BYTES) {
      diffContent =
        diffContent.substring(0, MAX_DIFF_BYTES) +
        '\n\n[... Diff truncated: size exceeded 500 KB limit ...]';
      isTruncated = true;
    }

    const numstatRes = await this.git.runGit(['diff', '--numstat', baseCommit], worktreePath);
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const line of numstatRes.stdout.split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const add = parseInt(parts[0], 10);
        const del = parseInt(parts[1], 10);
        if (!isNaN(add)) totalAdditions += add;
        if (!isNaN(del)) totalDeletions += del;
      }
    }

    return {
      statSummary: statRes.stdout,
      diffContent,
      isTruncated,
      totalAdditions,
      totalDeletions,
      changedFiles,
    };
  }

  /**
   * Guarded worktree cleanup. Refuses if uncommitted changes exist unless force=true.
   */
  async cleanupWorktree(
    projectRoot: string,
    worktreePath: string,
    force = false
  ): Promise<{ removed: boolean; message: string }> {
    const root = await this.git.getRepoRoot(projectRoot);

    if (!fs.existsSync(worktreePath)) {
      await this.git.runGit(['worktree', 'prune'], root);
      return { removed: true, message: 'Worktree folder was already gone; pruned references.' };
    }

    const status = await this.git.getStatus(worktreePath);
    if (!status.isClean && !force) {
      throw new Error(
        `Worktree has ${status.changedFiles.length} uncommitted change(s). Cleanup refused unless force confirmation is provided.`
      );
    }

    const removeArgs = ['worktree', 'remove', worktreePath];
    if (force) removeArgs.push('--force');

    const removeRes = await this.git.runGit(removeArgs, root);
    if (removeRes.exitCode !== 0) {
      throw new Error(`Failed to remove worktree: ${removeRes.stderr}`);
    }

    return { removed: true, message: 'Worktree removed successfully.' };
  }
}

export const worktreeService = new WorktreeService();
