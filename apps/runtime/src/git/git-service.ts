import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const DEFAULT_GIT_TIMEOUT_MS = 60_000;
const STATUS_GIT_TIMEOUT_MS = 60_000;

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RepoInfo {
  root: string;
  currentBranch: string;
  headSha: string;
  remotes: Array<{ name: string; url: string }>;
  isClean: boolean;
  changedFilesCount: number;
}

export class GitService {
  /**
   * Execute git command with argument array and shell: false.
   */
  async runGit(
    args: string[],
    cwd: string,
    timeoutMs = DEFAULT_GIT_TIMEOUT_MS
  ): Promise<GitExecResult> {
    if (!fs.existsSync(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }

    const gitEnv: NodeJS.ProcessEnv = {
      ...(process.env as Record<string, string>),
      GIT_TERMINAL_PROMPT: '0',
      LANG: 'C',
    };
    if (args[0] === 'status') {
      gitEnv.GIT_OPTIONAL_LOCKS = '0';
    } else {
      delete gitEnv.GIT_OPTIONAL_LOCKS;
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: gitEnv,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        forceKillTimer = setTimeout(() => proc.kill('SIGKILL'), 2_000);
      }, timeoutMs);

      proc.stdout.on('data', (chunk) => {
        if (stdout.length < 2 * 1024 * 1024) {
          stdout += chunk.toString();
        }
      });

      proc.stderr.on('data', (chunk) => {
        if (stderr.length < 512 * 1024) {
          stderr += chunk.toString();
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        reject(err);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (killed) {
          return reject(new Error(`Git command timed out after ${timeoutMs}ms: git ${args.join(' ')}`));
        }
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? -1,
        });
      });
    });
  }

  async getRepoRoot(candidatePath: string): Promise<string> {
    const canonical = fs.realpathSync(path.resolve(candidatePath));
    const stat = fs.statSync(canonical);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${candidatePath}`);
    }

    const { stdout, exitCode, stderr } = await this.runGit(['rev-parse', '--show-toplevel'], canonical);
    if (exitCode !== 0) {
      throw new Error(`Not a git repository: ${candidatePath} (${stderr})`);
    }

    return fs.realpathSync(stdout.trim());
  }

  async getRepoInfo(repoRoot: string): Promise<RepoInfo> {
    const root = await this.getRepoRoot(repoRoot);

    const branchRes = await this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    const currentBranch = branchRes.exitCode === 0 ? branchRes.stdout : 'HEAD';

    const headRes = await this.runGit(['rev-parse', 'HEAD'], root);
    const headSha = headRes.exitCode === 0 ? headRes.stdout : '';

    const statusRes = await this.runGit(
      ['status', '--porcelain', '--ignore-submodules=dirty'],
      root,
      STATUS_GIT_TIMEOUT_MS
    );
    const statusLines = statusRes.stdout.split('\n').filter((l) => l.trim().length > 0);
    const isClean = statusLines.length === 0;

    const remoteRes = await this.runGit(['remote', '-v'], root);
    const remotes: Array<{ name: string; url: string }> = [];
    if (remoteRes.exitCode === 0) {
      const lines = remoteRes.stdout.split('\n');
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2 && line.includes('(fetch)')) {
          remotes.push({ name: parts[0], url: parts[1] });
        }
      }
    }

    return {
      root,
      currentBranch,
      headSha,
      remotes,
      isClean,
      changedFilesCount: statusLines.length,
    };
  }

  async getStatus(workingDir: string): Promise<{ isClean: boolean; changedFiles: string[] }> {
    const res = await this.runGit(
      ['status', '--porcelain', '--ignore-submodules=dirty'],
      workingDir,
      STATUS_GIT_TIMEOUT_MS
    );
    if (res.exitCode !== 0) {
      throw new Error(`Failed to check git status in ${workingDir}: ${res.stderr}`);
    }
    const lines = res.stdout.split('\n').filter((l) => l.trim().length > 0);
    return {
      isClean: lines.length === 0,
      changedFiles: lines,
    };
  }

  async getHeadSha(workingDir: string): Promise<string | null> {
    const res = await this.runGit(['rev-parse', 'HEAD'], workingDir);
    return res.exitCode === 0 ? res.stdout : null;
  }
}

export const gitService = new GitService();
