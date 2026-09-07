import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { boundedProcess } from '../../../scripts/workflow-eval/process.js';

vi.setConfig({ testTimeout: 90_000 });
describe('bounded process groups', () => {
  it('preserves UTF-8 across chunks and bounds stderr as well as stdout', async () => {
    const result = await boundedProcess({ command: process.execPath, args: ['-e', "const b=Buffer.from('繁體');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),5)"],
      input: '', timeoutMs: 10000, maxBytes: 100 });
    expect(result.output).toBe('繁體');
    await expect(boundedProcess({ command: process.execPath, args: ['-e', "process.stderr.write('x'.repeat(1000))"],
      input: '', timeoutMs: 10000, maxBytes: 10 })).rejects.toThrow(/bytes/i);
  });
  it('kills a cancelled child and its same-group descendant after confirmed startup', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-process-'));
    const pidFile = join(cwd, 'pid');
    const code = `const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)']);require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);`;
    const controller = new AbortController();
    try {
      const outcome = expect(boundedProcess({ command: process.execPath, args: ['-e', code], input: '', timeoutMs: 10000, maxBytes: 1000, signal: controller.signal })).rejects.toThrow(/abort/i);
      const deadline = Date.now() + 5000;
      let pid = NaN;
      while (Date.now() < deadline && !Number.isInteger(pid)) {
        try { pid = Number(await readFile(pidFile, 'utf8')); } catch { await new Promise((resolve) => setTimeout(resolve, 20)); }
      }
      controller.abort();
      await outcome;
      expect(Number.isInteger(pid)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally { controller.abort(); await rm(cwd, { recursive: true, force: true }); }
  }, 15000);
  it('rejects cancellation and missing executables without hanging', async () => {
    await expect(boundedProcess({ command: '/nonexistent/workflow-adapter', args: [], input: '', timeoutMs: 100, maxBytes: 100 })).rejects.toThrow(/unavailable/i);
    const controller = new AbortController();
    controller.abort();
    await expect(boundedProcess({ command: process.execPath, args: [], input: '', timeoutMs: 100, maxBytes: 100, signal: controller.signal })).rejects.toThrow(/abort/i);
  });
});
