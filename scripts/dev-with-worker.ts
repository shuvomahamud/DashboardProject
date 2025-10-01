/**
 * Development script that runs both Next.js dev server and import worker
 *
 * This starts both processes concurrently so you don't need separate terminals.
 *
 * Usage: npm run dev:all
 */

import { spawn } from 'child_process';

const processes: any[] = [];

function startProcess(name: string, command: string, args: string[]) {
  console.log(`\n🚀 Starting ${name}...`);

  const proc = spawn(command, args, {
    shell: true,
    stdio: 'inherit',
    env: process.env
  });

  proc.on('exit', (code) => {
    console.log(`\n❌ ${name} exited with code ${code}`);
    // Kill all processes if one dies
    processes.forEach(p => p.kill());
    process.exit(code || 0);
  });

  processes.push(proc);
  return proc;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Development Mode with Import Worker');
console.log('═══════════════════════════════════════════════════════════════');
console.log('\nStarting both Next.js dev server and import worker...\n');
console.log('Press Ctrl+C to stop both processes\n');

// Start Next.js dev server
startProcess('Next.js Dev Server', 'npm', ['run', 'dev']);

// Wait a bit for dev server to start, then start worker
setTimeout(() => {
  startProcess('Import Worker', 'npm', ['run', 'worker:import']);
}, 3000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Shutting down...');
  processes.forEach(p => p.kill());
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⏹️  Shutting down...');
  processes.forEach(p => p.kill());
  process.exit(0);
});
