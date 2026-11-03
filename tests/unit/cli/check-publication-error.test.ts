import { Command } from 'commander';
import { afterEach, expect, it, vi } from 'vitest';
import { registerCheckCommand } from '../../../src/cli/commands/check.js';
import { MetadataWriteError, PrerequisiteError } from '../../../src/types/errors.js';

const failure = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('../../../src/services/check.service.js', () => ({ execute: async () => { throw failure.error; } }));
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

it.each([false, true])('reports actual check publication failure in json=%s mode with exit 1', async (json) => {
  failure.error = new MetadataWriteError({ metadataPath: '/change/metadata.yaml', claimPath: '/change/.metadata.yaml.write-claim', metadata_published: true }, new Error('cleanup failed'));
  let out = '';
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { out += String(chunk); return true; });
  const program = new Command();
  registerCheckCommand(program);
  await program.parseAsync(['node', 'prospec', 'check', '--record-tests', ...(json ? ['--json'] : [])]);
  expect(process.exitCode).toBe(1);
  if (json) expect(JSON.parse(out).error.publication.metadata.metadata_published).toBe(true);
  else expect(out).toContain('"metadata_published":true');
});

it('preserves the existing human output for unrelated check errors with --json', async () => {
  failure.error = new PrerequisiteError('legacy refusal', 'repair metadata');
  let out = '';
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { out += String(chunk); return true; });
  const program = new Command();
  registerCheckCommand(program);
  await program.parseAsync(['node', 'prospec', 'check', '--json']);
  expect(out).toContain('legacy refusal');
  expect(() => JSON.parse(out)).toThrow();
  expect(process.exitCode).toBe(1);
});
