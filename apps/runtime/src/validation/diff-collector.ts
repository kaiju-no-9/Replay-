import { spawn } from 'node:child_process';
import type { DiffStatSummary } from './types.js';

export class DiffCollector {
  /**
   * Collect diff stats between the worktree state and the base commit SHA.
   * Compares base → working tree (includes uncommitted changes).
   */
  async collectDiff(worktreePath: string, baseCommit: string): Promise<DiffStatSummary> {
    let numstatOutput = '';
    try {
      numstatOutput = await this.runGit(worktreePath, ['diff', '--numstat', baseCommit]);
    } catch {
      // Fall back to empty diff if git fails (broken worktree state)
      return { filesChanged: 0, additions: 0, deletions: 0, changedFiles: [] };
    }

    const changedFiles: DiffStatSummary['changedFiles'] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    const lines = numstatOutput.split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const adds = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const dels = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        const filePath = parts[2];

        totalAdditions += adds;
        totalDeletions += dels;

        changedFiles.push({
          path: filePath,
          additions: adds,
          deletions: dels,
          status: 'modified',
        });
      }
    }

    return {
      filesChanged: changedFiles.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      changedFiles,
    };
  }

  private runGit(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`git ${args.join(' ')} failed (code ${code}): ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }
}
