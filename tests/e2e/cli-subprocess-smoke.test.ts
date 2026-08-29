/**
 * Real-subprocess smoke tests — the few behaviors the in-process suite cannot
 * prove because they live outside the JS module boundary:
 *   - the shebang + executable bit on the compiled entry and the bundled bin,
 *   - a non-zero exit code propagating to the REAL process (not just
 *     `process.exitCode` set in-process),
 *   - non-TTY color suppression (`setup-color.ts`, which only runs at the real
 *     entry point), and
 *   - the `mcp serve` stdio server actually starting and speaking JSON-RPC.
 *
 * Everything else runs in-process (`cli-*.test.ts` via `helpers/run-cli.ts`).
 * Like the sibling e2e files this spawns the compiled CLI, so it requires a
 * prior `pnpm build`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

// Cold subprocess spawns under the parallel suite can exceed a tight default
// (PB-010); give this file the same generous headroom as the other spawn-bound
// e2e files.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const execFileAsync = promisify(execFile);
const NODE = process.execPath;
const REPO_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.resolve(REPO_ROOT, 'dist/cli/index.js');
const BIN_PATH = path.resolve(REPO_ROOT, 'dist/cli-bundle.js');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-e2e-smoke-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('CLI subprocess smoke', () => {
  it('compiled entry carries a node shebang and prints the version as a real process', async () => {
    const firstLine = (await fs.promises.readFile(CLI_PATH, 'utf-8')).split('\n', 1)[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
    const { stdout } = await execFileAsync(NODE, [CLI_PATH, '--version'], { cwd: tmpDir });
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('the bundled bin is executable and runs standalone', async () => {
    const stat = await fs.promises.stat(BIN_PATH);
    expect(stat.mode & 0o111).not.toBe(0);
    const { stdout } = await execFileAsync(NODE, [BIN_PATH, '--version'], { cwd: tmpDir });
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('propagates a non-zero exit code to the real process (ConfigNotFound)', async () => {
    await expect(
      execFileAsync(NODE, [CLI_PATH, 'check'], {
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1' },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it('suppresses ANSI color on a non-TTY stream even when CI is set (setup-color.ts)', async () => {
    const env = { ...process.env };
    delete env.NO_COLOR;
    delete env.FORCE_COLOR;
    env.CI = '1';
    // `check` in a config-less dir errors with a red ✗ — unless setup-color
    // forced NO_COLOR first (picocolors otherwise emits color under CI).
    const result = (await execFileAsync(NODE, [CLI_PATH, 'check'], { cwd: tmpDir, env }).catch(
      (e: unknown) => e,
    )) as { stderr?: string };
    const stderr = result.stderr ?? '';
    expect(stderr).toContain('.prospec.yaml');
    expect(stderr).not.toContain('\u001b'); // no ANSI escape sequences
  });

  it('starts the mcp stdio server and answers a JSON-RPC initialize', async () => {
    await fs.promises.writeFile(path.join(tmpDir, '.prospec.yaml'), 'project:\n  name: smoke\n');
    const child = spawn(NODE, [CLI_PATH, 'mcp', 'serve'], {
      cwd: tmpDir,
      env: { ...process.env, NO_COLOR: '1' },
    });
    try {
      const response = await new Promise<string>((resolve, reject) => {
        let out = '';
        const timer = setTimeout(
          () => reject(new Error(`no JSON-RPC response; stdout=${JSON.stringify(out)}`)),
          15000,
        );
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
          if (out.includes('"jsonrpc":"2.0"')) {
            clearTimeout(timer);
            resolve(out);
          }
        });
        child.on('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`mcp serve exited early with code=${String(code)}`));
        });
        const init = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'smoke', version: '0' },
          },
        });
        child.stdin.write(init + '\n');
      });
      expect(response).toContain('"jsonrpc":"2.0"');
    } finally {
      child.kill('SIGKILL');
    }
  });
});
