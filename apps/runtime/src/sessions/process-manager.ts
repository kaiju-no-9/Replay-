import pty from 'node-pty';
import { EventEmitter } from 'node:events';
import { ProcessSession, ProcessSpawnConfig, SessionExitEvent, SessionOutputEvent } from './types.js';
import { ScrollbackBuffer } from './scrollback-buffer.js';

/**
 * Owns PTY processes independent of any browser connection. A browser
 * disconnect never kills the underlying process.
 */
export class ProcessManager extends EventEmitter {
  private sessions = new Map<string, ProcessSession>();
  private dispatchToSession = new Map<string, string>();

  spawn(config: ProcessSpawnConfig): ProcessSession {
    if (this.sessions.has(config.sessionId)) {
      throw new Error(`Session with ID ${config.sessionId} already exists`);
    }

    const scrollbackBuffer = new ScrollbackBuffer(1024 * 1024); // 1MB cap

    const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(KUBECONFIG|KUBERNETES_.*|AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|PROFILE)|GOOGLE_APPLICATION_CREDENTIALS|AZURE_(CLIENT_SECRET|CLIENT_ID|TENANT_ID))$/i.test(key))) as Record<string, string>;
    const cleanEnv: Record<string, string> = {
      ...inheritedEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...(config.env || {}),
    };

    // Spawn native PTY — executable + args array, never a shell string
    const ptyProcess = pty.spawn(config.executable, config.args, {
      name: 'xterm-256color',
      cols: config.cols || 80,
      rows: config.rows || 24,
      cwd: config.cwd,
      env: cleanEnv,
    });

    const session: ProcessSession = {
      sessionId: config.sessionId,
      dispatchId: config.dispatchId,
      pty: ptyProcess,
      pid: ptyProcess.pid,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      scrollbackBuffer,
    };

    this.sessions.set(config.sessionId, session);
    this.dispatchToSession.set(config.dispatchId, config.sessionId);

    ptyProcess.onData((data: string) => {
      session.scrollbackBuffer.append(data);
      const event: SessionOutputEvent = {
        sessionId: session.sessionId,
        dispatchId: session.dispatchId,
        data,
      };
      this.emit('output', event);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      session.status = 'exited';
      session.finishedAt = new Date().toISOString();
      session.exitCode = exitCode;
      session.signal = signal ? String(signal) : null;

      if (session.stopTimeoutTimer) {
        clearTimeout(session.stopTimeoutTimer);
        session.stopTimeoutTimer = undefined;
      }

      const event: SessionExitEvent = {
        sessionId: session.sessionId,
        dispatchId: session.dispatchId,
        exitCode,
        signal: signal ? String(signal) : null,
      };
      this.emit('exit', event);
    });

    return session;
  }

  sendInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') {
      throw new Error(`Cannot send input: session ${sessionId} is not running`);
    }
    session.pty.write(data);
  }

  async stop(sessionId: string, timeoutMs = 5000): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'exited') {
      return;
    }

    session.status = 'stopping';

    return new Promise((resolve) => {
      try {
        session.pty.kill('SIGTERM');
      } catch {
        // Process may already be terminating
      }

      session.stopTimeoutTimer = setTimeout(() => {
        if (session.status !== 'exited') {
          try {
            session.pty.kill('SIGKILL');
          } catch {
            // Raced with natural exit
          }
        }
        resolve();
      }, timeoutMs);

      const onExit = (evt: SessionExitEvent) => {
        if (evt.sessionId === sessionId) {
          this.removeListener('exit', onExit);
          if (session.stopTimeoutTimer) {
            clearTimeout(session.stopTimeoutTimer);
          }
          resolve();
        }
      };
      this.on('exit', onExit);
    });
  }

  async terminateAll(gracePeriodMs = 5000): Promise<void> {
    const active = Array.from(this.sessions.values()).filter((s) => s.status !== 'exited');
    await Promise.all(active.map((s) => this.stop(s.sessionId, gracePeriodMs).catch(() => {})));
  }

  getActivePids(): number[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.status !== 'exited')
      .map((s) => s.pid);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'running') {
      session.pty.resize(cols, rows);
    }
  }

  getSession(sessionId: string): ProcessSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByDispatchId(dispatchId: string): ProcessSession | undefined {
    const sessionId = this.dispatchToSession.get(dispatchId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  getOutputSnapshot(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session ? session.scrollbackBuffer.getSnapshot() : null;
  }

  listSessions(): Array<{ sessionId: string; dispatchId: string; status: string; pid: number }> {
    return Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      dispatchId: s.dispatchId,
      status: s.status,
      pid: s.pid,
    }));
  }
}
