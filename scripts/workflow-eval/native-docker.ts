import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { boundedProcess } from './process.js';

/**
 * What the DOCKER CLI needs from the host, and nothing the measured model sees:
 * a non-default daemon (Colima, rootless, a remote context) is unreachable without
 * these, and forwarding them to the executor instead would be backwards.
 */
export const DOCKER_ENV_KEYS = ['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY'] as const;
export const dockerEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const key of DOCKER_ENV_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
};

export const ContainerPathSchema = z.string().regex(/^\/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+$/)
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'));
/** Explicit immutable target; never install CLIs, change permissions or mount host data here. */
export const DockerTargetSchema = z.strictObject({
  command: z.string().refine(isAbsolute), container: z.string().regex(/^[a-f0-9]{64}$/),
  image: z.string().regex(/^sha256:[a-f0-9]{64}$/), uid: z.number().int().positive().safe(), cwd: ContainerPathSchema,
});
export type DockerTarget = z.infer<typeof DockerTargetSchema>;
const emptyList = z.array(z.unknown()).length(0);
const emptyMap = z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length === 0);
const inspectionSchema = z.array(z.object({
  Id: z.string(), Image: z.string(), State: z.object({ Running: z.literal(true), Paused: z.literal(false) }),
  Mounts: emptyList,
  HostConfig: z.object({ Privileged: z.literal(false), PortBindings: emptyMap.nullable(),
    CapAdd: emptyList.nullable(), Devices: emptyList, NetworkMode: z.enum(['bridge', 'default', 'none']),
    PidMode: z.literal(''), IpcMode: z.literal('private'), UTSMode: z.literal(''),
    SecurityOpt: z.array(z.string()).refine((values) => values.includes('no-new-privileges') && !values.some((v) => v.includes('unconfined'))),
    Memory: z.number().positive(), NanoCpus: z.number().positive(), PidsLimit: z.number().positive(),
  }),
})).length(1);

// https://docs.docker.com/reference/cli/docker/inspect/
export async function inspectDockerTarget(input: unknown, env: NodeJS.ProcessEnv) {
  const target = DockerTargetSchema.parse(input);
  const result = await boundedProcess({ command: target.command, args: ['inspect', '--type', 'container', target.container],
    // The caller's docker allowlist passes through unchanged: narrowing it back to PATH
    // here left `inspect` unable to reach a non-default daemon that `exec` could reach.
    input: '', timeoutMs: 10000, maxBytes: 100000, env });
  if (result.exitCode !== 0) throw new Error('Docker inspection failed');
  const inspected = inspectionSchema.parse(JSON.parse(result.output))[0]!;
  if (inspected.Id !== target.container || inspected.Image !== target.image) throw new Error('Docker identity changed');
  // Return a selected summary, never persist Docker Config.Env or credential-bearing fields.
  return { target, isolation: { mounts: inspected.Mounts, network: inspected.HostConfig.NetworkMode,
    memory: inspected.HostConfig.Memory, cpus: inspected.HostConfig.NanoCpus, pids: inspected.HostConfig.PidsLimit } };
}

// https://docs.docker.com/reference/cli/docker/container/exec/
export function dockerInvocation(target: DockerTarget, command: string, args: string[], timeoutMs: number) {
  ContainerPathSchema.parse(command);
  if (timeoutMs <= 5000) throw new Error('Docker timeout requires kill grace');
  return { command: target.command,
    args: ['exec', '-i', '--user', String(target.uid), '--env', 'DISABLE_AUTOUPDATER=1', '--workdir', target.cwd, target.container,
      'timeout', '--signal=TERM', '--kill-after=5s', `${(timeoutMs - 5000) / 1000}s`, command, ...args] };
}
