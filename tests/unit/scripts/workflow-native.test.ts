import { describe, expect, it, vi } from 'vitest';
import { nativeArguments, observeNativeTrace, runNativeCli } from '../../../scripts/workflow-eval/native.js';
import { RequestQuota } from '../../../scripts/workflow-eval/executor.js';
import { boundedProcess, ProcessFailure } from '../../../scripts/workflow-eval/process.js';

vi.setConfig({ testTimeout: 90_000 });

describe('native subscription CLI transport', () => {
  it('limits Docker Claude session writes to the approved change directory', () => {
    const scope = { cwd: '/home/evaluator/workflow-quick-13', node: '/opt/prospec-eval/node/bin/node',
      runtime: '/opt/prospec-eval/workflow-runtime.mjs', writeDirectory: '/home/evaluator/workflow-quick-13/.prospec/changes/x' };
    const args = nativeArguments('claude', 'fable', 'task', 300000, undefined, scope);
    const settings = JSON.parse(args[args.indexOf('--settings') + 1]!);
    expect(settings.permissions.allow).toContain(`Read(/${scope.cwd}/**)`);
    expect(settings.permissions.allow).toContain(`Write(/${scope.writeDirectory}/**)`);
    expect(settings.permissions.allow).not.toContain(`Write(/${scope.cwd}/**)`);
    expect(settings.permissions.allow).toContain(`Bash(${scope.node} ${scope.runtime} *)`);
    expect(settings.permissions.allow).toContain('Bash(git ls-files)');
    // The fixture's own declared test command, and nothing else executable.
    expect(settings.permissions.allow).toContain('Bash(node suite.cjs)');
    expect(settings.permissions.allow).toContain(`Bash(${scope.node} ${scope.cwd}/suite.cjs)`);
    expect(settings.permissions.allow).not.toContain('Bash(node *)');
    expect(settings.permissions.allow).not.toContain('Bash(git *)');
    expect(() => nativeArguments('agy', 'flash', 'task', 300000, undefined, scope)).toThrow();
    for (const writeDirectory of [scope.cwd, '/home/evaluator/other/.prospec/changes/x', `${scope.cwd}/.prospec/changes/../x`]) {
      expect(() => nativeArguments('claude', 'fable', 'task', 300000, undefined, { ...scope, writeDirectory })).toThrow();
    }
  });
  it('adds approved session-only permissions for the exact fixture and frozen runtime', () => {
    const args = nativeArguments('claude', 'claude-fable-5-1', 'task', 300000,
      { cwd: '/private/tmp/fixture-one', runtime: '/private/tmp/frozen.mjs' });
    const settings = JSON.parse(args[args.indexOf('--settings') + 1]!);
    expect(settings.permissions.allow).toContain('Write(//private/tmp/fixture-one/**)');
    expect(settings.permissions.allow).toContain('Edit(//private/tmp/fixture-one/**)');
    expect(settings.permissions.allow).toContain(`Bash(${JSON.stringify(process.execPath)} "/private/tmp/frozen.mjs" *)`);
    expect(settings.permissions.allow).toContain('Bash(git status --short)');
    expect(settings.permissions.allow).not.toContain('Bash');
    expect(settings.permissions.allow).not.toContain('Write');
    expect(settings.permissions.deny).toContain('Edit(//private/tmp/fixture-one/.git/**)');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(args).not.toContain('--permission-mode');
    expect(nativeArguments('agy', 'flash', 'task', 1000, { cwd: '/private/tmp/fixture-one', runtime: '/private/tmp/frozen.mjs' })).not.toContain('--settings');
    expect(() => nativeArguments('claude', 'fable', 'task', 1000, { cwd: '/private/tmp/*', runtime: '/tmp/runtime.mjs' })).toThrow(/path/i);
  });
  it('uses direct print mode without tool-free agents or permission bypasses', () => {
    expect(nativeArguments('agy', 'gemini-3.8-flash-high', 'task', 300000)).toEqual([
      '--model', 'gemini-3.8-flash-high', '--output-format', 'stream-json', '--new-project', '--print-timeout', '300s', '-p', 'task',
    ]);
    expect(nativeArguments('claude', 'claude-fable-5-1', 'task', 300000)).toEqual([
      '--model', 'claude-fable-5-1', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '-p', 'task',
    ]);
  });
  it('retains raw events and uses only final usage, without turning SUCCESS into PASS', () => {
    const raw = [
      { event: 'init', init: { model: 'gemini-3.8-flash-high', tools: ['run_command'] } },
      { event: 'step_update', step_update: { usage: { input_tokens: 100, output_tokens: 20 } } },
      { event: 'result', result: { status: 'SUCCESS', response: 'PASS', usage: { input_tokens: 100, output_tokens: 20, thinking_tokens: 15 } } },
    ].map((v) => JSON.stringify(v)).join('\n');
    const observed = observeNativeTrace('agy', raw);
    expect(observed.records).toHaveLength(3);
    expect(observed.usage).toEqual({ input_tokens: 100, output_tokens: 20, thinking_tokens: 15 });
    expect(observed.terminal_success).toBe(true);
    expect(observed.workflow_verdict).toBe('unassessed');
    expect(observed.complete_tool_visibility).toBe(false);
  });
  it('preserves malformed/truncated traces, and refuses duplicate or absent terminal results', () => {
    expect(observeNativeTrace('agy', '{"event":"init"}\n{truncated').parse_errors).toEqual([2]);
    expect(observeNativeTrace('agy', '').terminal_success).toBe(false);
    const terminal = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 2 } });
    expect(observeNativeTrace('claude', terminal).terminal_success).toBe(true);
    expect(observeNativeTrace('claude', terminal + '\n' + terminal).terminal_success).toBe(false);
    expect(observeNativeTrace('claude', terminal + '\nnull').terminal_success).toBe(false);
    expect(observeNativeTrace('agy', '{"event":"result","result":{"status":"ERROR"}}').terminal_success).toBe(false);
  });
  it('retains bounded stdout and stderr on a killed process', async () => {
    let failure: unknown;
    try {
      await boundedProcess({ command: process.execPath, args: ['-e', "process.stdout.write('trace');process.stderr.write('diagnostic');setInterval(()=>{},1000)"],
        // The retention assertion requires the real child to have started. Match the
        // other real transport tests' startup allowance under full-suite coverage.
        input: '', timeoutMs: 10000, maxBytes: 100 });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ProcessFailure);
    expect(failure).toMatchObject({ output: 'trace', stderr: 'diagnostic', message: 'Process timeout' });
  });
  it('consumes quota before launch, retains failures, and never retries', async () => {
    const quota = new RequestQuota(3, 2);
    const opts = { cli: 'agy' as const, command: '/nonexistent/agy', model: 'gemini-3.8-flash-high', prompt: 'task',
      cwd: '/private/tmp', timeoutMs: 1000, maxBytes: 100, env: {}, quota };
    const result = await runNativeCli(opts);
    expect(result.failure).toMatch(/unavailable/i);
    expect(result.exit_code).toBeNull();
    expect(result.requests_consumed).toBe(3);
    expect(result.observation.workflow_verdict).toBe('unassessed');
    await expect(runNativeCli(opts)).rejects.toThrow(/limit/i);
  });
});
