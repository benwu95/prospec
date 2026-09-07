import { spawn } from 'node:child_process';

export interface ProcessOptions {
  command: string; args: string[]; input: string; timeoutMs: number; maxBytes: number;
  cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal;
}
export class ProcessFailure extends Error {
  constructor(message: string, readonly output: string, readonly stderr: string, readonly exitCode: number | null) {
    super(message);
    this.name = 'ProcessFailure';
  }
}
/** For trusted transports and fixed CLI commands, not arbitrary model-authored executables. */
export async function boundedProcess(options: ProcessOptions): Promise<{ output: string; stderr: string; exitCode: number | null }> {
  if (process.platform === 'win32') throw new Error('Process-group termination unavailable on this platform');
  if (options.signal?.aborted) throw new Error('Process aborted');
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || !Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) throw new Error('Invalid process limits');
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, { shell: false, detached: true, cwd: options.cwd,
      env: options.env ?? { PATH: process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe'] });
    let bytes = 0;
    const output: Buffer[] = [];
    const diagnostics: Buffer[] = [];
    let failure: Error | undefined;
    const terminate = () => {
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
      }
    };
    const stop = (message: string) => { failure ??= new Error(message); terminate(); };
    const timer = setTimeout(() => stop('Process timeout'), options.timeoutMs);
    const abort = () => stop('Process aborted');
    options.signal?.addEventListener('abort', abort, { once: true });
    const consume = (chunk: Buffer, stdout: boolean) => {
      const remaining = Math.max(0, options.maxBytes - bytes);
      (stdout ? output : diagnostics).push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > options.maxBytes) { stop('Process output bytes exceeded'); return; }
    };
    child.stdout.on('data', (chunk: Buffer) => consume(chunk, true));
    child.stderr.on('data', (chunk: Buffer) => consume(chunk, false));
    child.stdin.on('error', () => stop('Process input transport failed'));
    child.on('error', () => { failure ??= new Error('Process unavailable'); });
    child.on('exit', terminate);
    child.on('close', (exitCode) => {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort); terminate();
      const result = { output: Buffer.concat(output).toString('utf8'), stderr: Buffer.concat(diagnostics).toString('utf8'), exitCode: child.pid ? exitCode : null };
      if (failure) reject(new ProcessFailure(failure.message, result.output, result.stderr, result.exitCode));
      else resolve(result);
    });
    child.stdin.end(options.input);
    if (options.signal?.aborted) abort();
  });
}
