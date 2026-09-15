import { z } from 'zod';
import { isAbsolute } from 'node:path';
import { RequestQuota } from './executor.js';
import { boundedProcess, ProcessFailure } from './process.js';
import { ContainerPathSchema, DockerTargetSchema, dockerInvocation, dockerEnv, inspectDockerTarget, type DockerTarget } from './native-docker.js';

export const DockerClaudeScopeSchema = z.strictObject({ cwd: ContainerPathSchema, node: ContainerPathSchema,
  runtime: ContainerPathSchema, writeDirectory: ContainerPathSchema }).refine((s) =>
  s.writeDirectory.startsWith(`${s.cwd}/.prospec/changes/`) &&
  /^[a-zA-Z0-9_-]+$/.test(s.writeDirectory.slice(`${s.cwd}/.prospec/changes/`.length)), 'Require one approved change directory');
type DockerClaudeScope = z.infer<typeof DockerClaudeScopeSchema>;

// The adapter registry, not a policy cap: each CLI needs its own argv shape and
// stream-json parsing, so a third executor means a third adapter, not a config key.
export const NativeCliSchema = z.enum(['claude', 'agy']);
type NativeCli = z.infer<typeof NativeCliSchema>;
// AGY 1.1.27 readiness: ArtifactMetadata rejects ordinary project paths.
// Tool parameters: https://antigravity.google/docs/hooks
export const AGY_FILE_GUIDANCE = `\n\nAGY file operations:
- Prospec documents and verifier JSON are ordinary project files, not Antigravity UI Artifacts.
- For write_to_file, set IsArtifact=false and omit ArtifactMetadata; use native editing tools for existing files.
- Do not create scratch or test files to probe permissions. Respect the configured write scope; this guidance grants no permissions.
- If ordinary-file creation is unavailable, report the tool error and stop; do not work around it with shell writes.
- Share these file-operation constraints with delegated workers; never fabricate their receipts.`;
// AGY readiness: a denied command is fatal in headless mode, not a recoverable refusal.
export const AGY_COMMAND_GUIDANCE = `\n\nAGY container limits:
- Only the frozen prospec CLI command named above and the read-only \`git status\` and \`git ls-files\` are approved shell commands.
- Read only files inside the project root; the frozen CLI bundle and anything outside that root are denied.
- Any denied tool call ends this headless session immediately; there is no second attempt and no alternative route.
- Inspect the project with the native file tools instead of shell listing, reading or searching.
- This guidance mirrors the approved rules; it grants no permissions and must not be worked around.`;
// Claude readiness: a scoped session denies unlisted commands; run 13 spent its budget cycling interpreters.
// Session settings: https://code.claude.com/docs/en/settings
export const CLAUDE_TOOL_GUIDANCE = `\n\nClaude session tools:
- This session runs on a narrow session allow list; only its listed reads, writes and frozen CLI commands are approved. This guidance grants no permissions.
- Open and check JSON or Markdown with the Read tool, including files a delegated worker wrote; do not parse them with python, node -e, perl, jq or other shell interpreters.
- When a tool call is denied, report the denial and stop that approach; do not retry the same step through another interpreter, shell or path.
- Share these tool constraints with delegated workers and read their written output back yourself; never fabricate their receipts.`;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Keep the ordinary native tool environment. Never add billing or permission bypass flags. */
export function nativeArguments(cli: NativeCli, model: string, prompt: string, timeoutMs: number,
  scope?: { cwd: string; runtime: string }, dockerScope?: DockerClaudeScope): string[] {
  const permissions: string[] = [];
  if (dockerScope) {
    if (cli !== 'claude' || scope) throw new Error('Docker session permissions require Claude and no host scope');
    const s = DockerClaudeScopeSchema.parse(dockerScope);
    const git = ['status', 'status --short', 'status --porcelain', 'ls-files'];
    const allow = [`Read(/${s.cwd}/**)`, ...['Edit', 'Write'].map((tool) => `${tool}(/${s.writeDirectory}/**)`),
      `Bash(${s.node} ${s.runtime} *)`, `Bash(${JSON.stringify(s.node)} ${JSON.stringify(s.runtime)} *)`,
      // A scenario whose oracle expects a test run needs the fixture's own declared command.
      'Bash(node suite.cjs)', `Bash(${s.node} suite.cjs)`, `Bash(${s.node} ${s.cwd}/suite.cjs)`,
      ...git.flatMap((args) => [`Bash(git ${args})`, `Bash(git -C ${s.cwd} ${args})`, `Bash(git -C ${JSON.stringify(s.cwd)} ${args})`])];
    permissions.push('--settings', JSON.stringify({ permissions: { allow } }));
  }
  if (cli === 'claude' && scope) {
    for (const path of [scope.cwd, scope.runtime, process.execPath]) {
      if (!isAbsolute(path) || path === '/' || /[\s*?[\](){}!$;|&<>`"'\\]/.test(path)) throw new Error('Unsupported scoped permission path');
    }
    const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(scope.runtime)}`;
    const git = ['status --short', 'status --porcelain', 'diff', 'diff --stat', 'diff --name-only', 'log --oneline -5', 'log --oneline --stat -3'];
    const allow = [
      ...['Read', 'Edit', 'Write'].map((tool) => `${tool}(/${scope.cwd}/**)`),
      `Bash(${command} *)`, `Bash(${process.execPath} ${scope.runtime} *)`,
      `Bash(${process.execPath} ${scope.cwd}/suite.cjs)`, `Bash(node suite.cjs)`,
      ...git.flatMap((args) => [`Bash(git ${args})`, `Bash(git -C ${scope.cwd} ${args})`, `Bash(git -C ${JSON.stringify(scope.cwd)} ${args})`]),
    ];
    const deny = ['.git', '.agents', '.claude'].flatMap((path) =>
      ['Edit', 'Write'].map((tool) => `${tool}(/${scope.cwd}/${path}/**)`));
    permissions.push('--settings', JSON.stringify({ permissions: { allow, deny } }));
  }
  return ['--model', model, '--output-format', 'stream-json',
    // A fresh AGY project avoids sharing default-cli-project across fixtures.
    // This is project association, not an OS sandbox or an ambient-context guarantee.
    ...(cli === 'claude' ? ['--verbose', '--no-session-persistence'] : ['--new-project', '--print-timeout', `${Math.ceil(timeoutMs / 1000)}s`]), ...permissions, '-p', prompt];
}

/** Transport observations, deliberately not gateway events or an automated workflow verdict. */
export function observeNativeTrace(cli: NativeCli, raw: string) {
  const records: Record<string, unknown>[] = [];
  const parseErrors: number[] = [];
  for (const [index, line] of raw.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const record = object(JSON.parse(line));
      if (!record) throw new Error('Expected object');
      records.push(record);
    } catch { parseErrors.push(index + 1); }
  }
  const results = records.filter((r) => cli === 'agy' ? r.event === 'result' : r.type === 'result');
  const final = results.length === 1 ? (cli === 'agy' ? object(results[0]!.result) : results[0]!) : null;
  return { records, parse_errors: parseErrors,
    terminal_success: parseErrors.length === 0 && final !== null &&
      (cli === 'agy' ? final.status === 'SUCCESS' : final.subtype === 'success' && final.is_error === false),
    // Preserve provider fields: thinking/cache semantics differ; never add step and final totals.
    usage: final ? object(final.usage) : null,
    workflow_verdict: 'unassessed' as const, complete_tool_visibility: false as const };
}

export async function runNativeCli(options: {
  cli: NativeCli; command: string; model: string; prompt: string; cwd: string;
  timeoutMs: number; maxBytes: number; env: NodeJS.ProcessEnv; quota: RequestQuota;
  beforeLaunch?: (consumed: number) => Promise<void>;
  scope?: { cwd: string; runtime: string };
  docker?: DockerTarget;
  dockerScope?: DockerClaudeScope;
}) {
  NativeCliSchema.parse(options.cli);
  z.string().min(1).parse(options.model);
  for (const limit of [options.timeoutMs, options.maxBytes]) z.number().int().positive().safe().parse(limit);
  // Host permission paths cannot be reused as container permission paths.
  if (options.docker && options.scope) throw new Error('Docker cannot use host scoped permissions');
  if (options.dockerScope && (!options.docker || options.dockerScope.cwd !== options.docker.cwd)) {
    throw new Error('Docker session permission root must match transport');
  }
  const args = nativeArguments(options.cli, options.model, options.prompt, options.timeoutMs, options.scope, options.dockerScope);
  const invocation = options.docker
    ? dockerInvocation(DockerTargetSchema.parse(options.docker), options.command, args, options.timeoutMs)
    : { command: options.command, args };
  const docker = options.docker ? await inspectDockerTarget(options.docker, dockerEnv()) : undefined;
  const request = options.quota.reserve();
  // Persist the nonrefundable reservation before spawning, including crash/interruption cases.
  await options.beforeLaunch?.(options.quota.requestsConsumed);
  const started = Date.now();
  let output = ''; let stderr = ''; let exitCode: number | null = null; let failure: string | null = null;
  try {
    const result = await boundedProcess({ ...invocation, input: '',
      // In Docker mode the spawned process is the docker CLI, so it gets the docker
      // settings; the measured executor's own environment lives inside the container.
      cwd: options.cwd, env: docker ? dockerEnv() : options.env, timeoutMs: options.timeoutMs, maxBytes: options.maxBytes });
    ({ output, stderr, exitCode } = result);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Native process failed';
    if (error instanceof ProcessFailure) ({ output, stderr, exitCode } = error);
  } finally { options.quota.settle(request, null); }
  return { stdout: output, stderr, exit_code: exitCode, failure, duration_ms: Date.now() - started,
    requests_consumed: options.quota.requestsConsumed, committed_usd: null,
    remote_cancellation: 'unverified', ...(docker ? { docker } : {}), observation: observeNativeTrace(options.cli, output) };
}
