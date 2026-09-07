import { z } from 'zod';
import { assertOwnedFixture } from './fixtures.js';
import { ContainerPathSchema, DockerTargetSchema, dockerEnv, inspectDockerTarget } from './native-docker.js';
import { NATIVE_FILES_SCRIPT, parseNativeFiles } from './native-files.js';
import { boundedProcess } from './process.js';
import { DockerClaudeScopeSchema } from './native.js';

export const DockerCaptureSchema = z.strictObject({ target: DockerTargetSchema, node: ContainerPathSchema,
  runtime: ContainerPathSchema.refine((path) => path.endsWith('.mjs')), cli: ContainerPathSchema,
  claude_write_directory: ContainerPathSchema.optional() }).refine((c) => !c.claude_write_directory ||
    DockerClaudeScopeSchema.safeParse({ cwd: c.target.cwd, node: c.node, runtime: c.runtime, writeDirectory: c.claude_write_directory }).success,
  'Require one approved change directory');

/** Controller-only fixture preparation and observation; never a model tool or permission writer. */
export class DockerCapture {
  readonly config: z.infer<typeof DockerCaptureSchema>;
  constructor(input: unknown) { this.config = DockerCaptureSchema.parse(input); }
  get claudeScope() {
    const c = this.config;
    return c.claude_write_directory ? { cwd: c.target.cwd, node: c.node, runtime: c.runtime, writeDirectory: c.claude_write_directory } : undefined;
  }
  private async docker(args: string[], maxBytes = 16_000_000): Promise<string> {
    const result = await boundedProcess({ command: this.config.target.command, args, input: '',
      timeoutMs: 30000, maxBytes, env: dockerEnv() });
    if (result.exitCode !== 0) throw new Error('Docker controller command failed');
    return result.output;
  }
  private exec(args: string[], cwd = this.config.target.cwd) {
    const target = this.config.target;
    return this.docker(['exec', '-i', '--user', String(target.uid), '--workdir', cwd, target.container, ...args]);
  }
  async preflight(expectedRuntime: string, expectedVersion: string) {
    const identity = await inspectDockerTarget(this.config.target, dockerEnv());
    if (await this.runtimeHash() !== expectedRuntime) throw new Error('Docker runtime changed');
    const version = await this.exec(['env', 'DISABLE_AUTOUPDATER=1', this.config.cli, '--version'], '/');
    if (version.trim() !== expectedVersion) throw new Error('Docker native CLI version changed');
    return identity;
  }
  async runtimeHash() {
    const raw = await this.exec([this.config.node, '-e',
      "const fs=require('fs'),c=require('crypto');console.log(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'));", this.config.runtime], '/');
    return z.string().regex(/^[a-f0-9]{64}$/).parse(raw.trim());
  }
  async deploy(localCwd: string) {
    assertOwnedFixture(localCwd);
    const { target, node } = this.config;
    // Refuse an existing target and symlinked parent. No recursive mkdir or overwrite.
    await this.exec([node, '-e', "const fs=require('fs'),p=require('path'),root=process.argv[1];if(fs.realpathSync(p.dirname(root))!==p.dirname(root))throw Error('Symlinked parent');fs.mkdirSync(root,{mode:0o700});", target.cwd], '/');
    await this.docker(['cp', `${localCwd}/.`, `${target.container}:${target.cwd}`]);
    // docker cp creates root-owned files; normalize only this freshly created owned fixture.
    await this.docker(['exec', '--user', '0', target.container, 'chown', '-R', `${target.uid}:${target.uid}`, target.cwd]);
  }
  async files() { return parseNativeFiles(await this.exec([this.config.node, '-e', NATIVE_FILES_SCRIPT, '10000000'])); }
  async status() {
    try { return { output: await this.exec([this.config.node, this.config.runtime, 'status']), error: null }; }
    catch { return { output: null, error: 'Container source CLI status unavailable' }; }
  }
}
