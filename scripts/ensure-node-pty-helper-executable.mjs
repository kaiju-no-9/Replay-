import { access, chmod, stat } from 'node:fs/promises';
import path from 'node:path';

if (process.platform === 'darwin') {
  const helperPath = path.resolve(
    'apps/runtime/node_modules/node-pty/prebuilds',
    `darwin-${process.arch}`,
    'spawn-helper',
  );

  try {
    await access(helperPath);
    const helperStat = await stat(helperPath);

    if ((helperStat.mode & 0o111) === 0) {
      await chmod(helperPath, helperStat.mode | 0o755);
      console.log('Made the node-pty spawn helper executable.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}
