import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessManager } from '../src/sessions/process-manager.js';
import { ScrollbackBuffer } from '../src/sessions/scrollback-buffer.js';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Phase 2 ProcessManager Integration', () => {
  let processManager: ProcessManager;
  const fixturePath = path.resolve(__dirname, '../../../tests/fixtures/fake-agent.js');

  beforeEach(() => {
    processManager = new ProcessManager();
  });

  it('spawns fake-agent, receives output banner, and completes with exit code 0', async () => {
    const sessionId = uuidv4();
    const dispatchId = uuidv4();
    let accumulatedOutput = '';

    const readyPromise = new Promise<void>((resolve) => {
      processManager.on('output', (evt) => {
        if (evt.sessionId !== sessionId) return;
        accumulatedOutput += evt.data;
        if (accumulatedOutput.includes('Relay Fake Agent CLI')) resolve();
      });
    });
    const exitPromise = new Promise<{ exitCode: number | null }>((resolve) => {
      processManager.on('exit', (evt) => {
        if (evt.sessionId === sessionId) resolve(evt);
      });
    });

    processManager.spawn({
      sessionId,
      dispatchId,
      executable: 'node',
      args: [fixturePath],
      cwd: process.cwd(),
    });

    await readyPromise;
    expect(accumulatedOutput).toContain('Relay Fake Agent CLI');

    processManager.sendInput(sessionId, 'complete\n');

    const exitResult = await exitPromise;
    expect(exitResult.exitCode).toBe(0);
    expect(accumulatedOutput).toContain('Task finished successfully');
  });

  it('handles synthetic failure input by exiting with code 1', async () => {
    const sessionId = uuidv4();
    const dispatchId = uuidv4();

    const readyPromise = new Promise<void>((resolve) => {
      processManager.on('output', (evt) => {
        if (evt.sessionId === sessionId && evt.data.includes('Ready to receive instructions')) resolve();
      });
    });
    const exitPromise = new Promise<{ exitCode: number | null }>((resolve) => {
      processManager.on('exit', (evt) => {
        if (evt.sessionId === sessionId) resolve(evt);
      });
    });

    processManager.spawn({
      sessionId,
      dispatchId,
      executable: 'node',
      args: [fixturePath],
      cwd: process.cwd(),
    });

    await readyPromise;
    processManager.sendInput(sessionId, 'fail\n');

    const exitResult = await exitPromise;
    expect(exitResult.exitCode).toBe(1);
  });

  it('stops a running process cleanly using graceful SIGTERM', async () => {
    const sessionId = uuidv4();
    const dispatchId = uuidv4();

    const readyPromise = new Promise<void>((resolve) => {
      processManager.on('output', (evt) => {
        if (evt.sessionId === sessionId && evt.data.includes('Ready to receive instructions')) resolve();
      });
    });

    processManager.spawn({
      sessionId,
      dispatchId,
      executable: 'node',
      args: [fixturePath],
      cwd: process.cwd(),
    });

    await readyPromise;
    await processManager.stop(sessionId, 2000);

    const session = processManager.getSession(sessionId);
    expect(session?.status).toBe('exited');
  });

  it('bounds scrollback buffer without exceeding maximum byte limits', () => {
    const buffer = new ScrollbackBuffer(100); // 100-byte cap

    buffer.append('A'.repeat(60));
    expect(buffer.getByteCount()).toBe(60);

    buffer.append('B'.repeat(60));
    expect(buffer.getByteCount()).toBeLessThanOrEqual(100);
    expect(buffer.getSnapshot()).toContain('B');
  });
});
