import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// Identifies the app code in saved performance captures. The preview mirror records its source commit.
function sourceCommit(): string {
  try {
    if (existsSync('UPSTREAM.json')) return String(JSON.parse(readFileSync('UPSTREAM.json', 'utf8')).commit).slice(0, 12);
    const run = (command: string) => execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    // Tracked or untracked source changes mean the build is not exactly this commit.
    const dirty = run('git status --porcelain -- . ":(exclude)dist"') !== '';
    return run('git rev-parse --short=12 HEAD') + (dirty ? '-dirty' : '');
  } catch { return 'unknown'; }
}

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify({ commit: sourceCommit(), builtAt: new Date().toISOString() }) },
});
