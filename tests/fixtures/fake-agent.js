#!/usr/bin/env node

/**
 * Fake Agent CLI Fixture
 * Emulates interactive autonomous agent CLI behavior:
 * - Emits ANSI banners
 * - Reads commands from stdin
 * - Emulates delayed progress output
 * - Handles 'complete' -> exits 0
 * - Handles 'fail' -> exits 1
 * - Times out after 30s of inactivity -> exits 124
 */

const readline = require('readline');

console.log('\x1b[32m=== Relay Fake Agent CLI v1.0.0 ===\x1b[0m');
console.log('Ready to receive instructions. Type "complete" or "fail".');

let idleTimer = setTimeout(() => {
  console.log('\x1b[31m[ERROR] Fake agent timed out after 30s waiting for input.\x1b[0m');
  process.exit(124);
}, 30000);

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log('\x1b[31m[TIMEOUT] Idle timeout.\x1b[0m');
    process.exit(124);
  }, 30000);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  resetIdleTimer();
  const cmd = line.trim();

  if (cmd === 'complete') {
    console.log('\x1b[34m[INFO] Executing task...\x1b[0m');
    setTimeout(() => {
      console.log('\x1b[32m[SUCCESS] Task finished successfully. Changes written.\x1b[0m');
      process.exit(0);
    }, 200);
  } else if (cmd === 'fail') {
    console.log('\x1b[31m[ERROR] Synthetic failure requested by caller.\x1b[0m');
    process.exit(1);
  } else if (cmd.startsWith('work')) {
    console.log(`\x1b[33m[PROGRESS] Working on step: ${cmd}\x1b[0m`);
  } else {
    console.log(`\x1b[90m[ECHO] Received: ${cmd}\x1b[0m`);
  }
});

process.on('SIGTERM', () => {
  console.log('\x1b[33m[AGENT] Received SIGTERM, cleaning up gracefully...\x1b[0m');
  process.exit(0);
});
