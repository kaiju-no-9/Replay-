import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export interface BinaryResolution {
  found: boolean;
  path: string | null;
  error?: string;
}

/**
 * Locate a binary on the host PATH using system `which` (macOS/Linux) or `where` (Windows).
 */
export async function findBinary(binaryName: string): Promise<BinaryResolution> {
  const isWindows = process.platform === 'win32';
  const lookupCmd = isWindows ? 'where.exe' : 'which';

  try {
    const { stdout } = await execFileAsync(lookupCmd, [binaryName], {
      timeout: 3000,
      windowsHide: true,
    });
    const resolvedPath = stdout.trim().split('\n')[0]?.trim();
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      return { found: true, path: resolvedPath };
    }
    return { found: false, path: null, error: `Executable '${binaryName}' not found on PATH` };
  } catch (err: any) {
    return {
      found: false,
      path: null,
      error: err.message || `Executable '${binaryName}' not found`,
    };
  }
}

/**
 * Execute `<binary> <versionFlag>` with a timeout and parse the version output.
 */
export async function getBinaryVersion(
  binaryPath: string,
  versionArgs: string[] = ['--version']
): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, versionArgs, {
      timeout: 4000,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
    const output = (stdout || stderr).trim();
    const match = output.match(/(\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.]+)?)/);
    return match ? match[1] : output.split('\n')[0] || null;
  } catch {
    return null;
  }
}
