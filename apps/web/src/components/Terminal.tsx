import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { wsUrl } from '../lib/api';
import { useConnectionStore } from '../stores/connection-store';

interface TerminalProps {
  dispatchId: string;
  onExit?: (exitCode: number | null) => void;
}

/**
 * xterm.js terminal bound to the runtime WS gateway. The PTY lives in the
 * runtime — unmounting this component never kills the process.
 */
export const Terminal: React.FC<TerminalProps> = ({ dispatchId, onExit }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const token = useConnectionStore((s) => s.token);

  useEffect(() => {
    if (!containerRef.current || !token) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#090d16',
        foreground: '#f8fafc',
        cursor: '#38bdf8',
        selectionBackground: '#334155',
      },
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    const ws = new WebSocket(wsUrl(token));

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe_terminal', dispatchId }));
      ws.send(
        JSON.stringify({ type: 'terminal.resize', dispatchId, cols: term.cols, rows: term.rows })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.dispatchId !== dispatchId) return;

        if (msg.type === 'terminal.snapshot') {
          term.reset();
          if (msg.data) term.write(msg.data);
        } else if (msg.type === 'terminal.output') {
          term.write(msg.data);
        } else if (msg.type === 'terminal.exit') {
          term.write(`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
          onExit?.(msg.exitCode);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    const onDataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal.input', dispatchId, data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'terminal.resize',
              dispatchId,
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      } catch {
        // Unmounted
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      ws.close();
      term.dispose();
    };
  }, [dispatchId, token]);

  if (!token) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-slate-500 bg-[#090d16] rounded-lg">
        Enter the runtime token to attach to this session.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[300px] bg-[#090d16] rounded-lg p-2 overflow-hidden"
    />
  );
};
