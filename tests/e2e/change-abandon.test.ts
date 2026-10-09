import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProgram } from '../../src/cli/program.js';
import { gitIn, imageOf } from '../helpers/git-fixture.js';
import { premiseProposal } from '../helpers/premise.js';
import { captureGitState } from '../../src/lib/repo-state.js';
import { formatChangeStoryOutput } from '../../src/cli/formatters/change-story-output.js';
import { handleError } from '../../src/cli/formatters/error-output.js';
import { readChangeMetadata } from '../../src/lib/change-metadata.js';
import { AbandonError } from '../../src/types/errors.js';
vi.setConfig({ testTimeout: 30_000 });
let root: string;
let cwd: string;
let stdout: string;
let stderr: string;
beforeEach(() => {
  cwd = process.cwd(); root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abandon-cli-')));
  fs.writeFileSync(path.join(root, '.prospec.yaml'), 'project:\n  name: test\nworkflow:\n  pause_at: []\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.prospec/\n'); fs.writeFileSync(path.join(root, 'work'), 'base');
  gitIn(root, 'init', '-q', '-b', 'main'); gitIn(root, 'add', '.'); gitIn(root, 'commit', '-qm', 'base');
  fs.mkdirSync(path.join(root, '.prospec/changes/old'), { recursive: true });
  fs.writeFileSync(path.join(root, '.prospec/changes/old/metadata.yaml'), 'name: old\ncreated_at: 2026-10-05\nstatus: plan\nissue: "#333"\n');
  fs.writeFileSync(path.join(root, '.prospec/changes/old/proposal.md'), premiseProposal());
  process.chdir(root); stdout = ''; stderr = ''; process.exitCode = 0;
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => { stdout += String(s); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => { stderr += String(s); return true; });
  vi.spyOn(console, 'log').mockImplementation((...args) => { stdout += args.join(' ') + '\n'; });
});
afterEach(() => { process.chdir(cwd); process.exitCode = 0; vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const run = async (...args: string[]) => { stdout = ''; stderr = ''; await createProgram().parseAsync(['node', 'prospec', ...args]); return stdout; };
it('preserves work through abandon, reports clean history and gates the same-issue retry', async () => {
  fs.writeFileSync(path.join(root, 'work'), 'staged'); gitIn(root, 'add', 'work'); fs.writeFileSync(path.join(root, 'work'), 'base');
  fs.writeFileSync(path.join(root, 'untracked'), 'retained');
  const git = captureGitState(root);
  const result = JSON.parse(await run('change', 'abandon', 'old', '--reason', 'Disproved', '--overturned', 'problem', '--overturned', 'evidence.kind', '--json'));
  expect(result.archiveDir).toBe(path.join(root, '.prospec/abandoned', `${new Date().toISOString().slice(0, 10)}-old`));
  const manifest = JSON.parse(fs.readFileSync(path.join(result.preservationDir, 'manifest.json'), 'utf8'));
  expect(result.preservedFileCount).toBe(manifest.entries.length);
  expect(result.preservedFileCount).toBe(2);
  expect(fs.readFileSync(path.join(root, 'untracked'), 'utf8')).toBe('retained');
  expect(result.projectRoot).toBe(root); expect(captureGitState(root)).toEqual(git);
  expect(fs.readFileSync(path.join(root, 'work'), 'utf8')).toBe('base');
  expect(JSON.parse(await run('status', '--json'))).toMatchObject({ clean: true, changes: [], abandoned: [{ reason: 'Disproved' }] });
  expect(await run('change', 'story', 'retry', '--issue', '#333')).toContain('Disproved');
  await run('change', 'plan', '--change', 'retry');
  expect(process.exitCode).toBe(1); expect(stderr).toMatch(/Premise|retry_difference/);
});
it('requires a reason and leaves the source in place', async () => {
  await expect(run('change', 'abandon', 'old')).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' });
  expect(fs.existsSync(path.join(root, '.prospec/changes/old/metadata.yaml'))).toBe(true);
});
it('renders sanitized human output with project scope and a local tracker summary', async () => {
  const text = await run('change', 'abandon', 'old', '--reason', 'Disproved\u001b[2J');
  expect(text).toContain('Abandoned artifacts:'); expect(text).toContain('.prospec/abandoned/'); expect(text).not.toContain('Archive:');
  expect(text).toContain('Preserved files: 0');
  expect(text).toContain('Work tree was not restored');
  expect(text).toMatch(/Inspect.*preservation.*decide.*restore.*version control/i);
  expect(text).not.toMatch(/git (reset|clean|checkout)|reverse.*unstaged/i);
  expect(text).toContain(root); expect(text).toContain('#333'); expect(text).toContain('Tracker summary'); expect(text).not.toContain('\u001b[2J');
});
it('sanitizes prior reasons and exposes the retry handoff in story output', () => {
  formatChangeStoryOutput({ changeName: 'retry', changeDir: '', createdFiles: [], dryRun: false, relatedModules: [], priorAttempts: [{ archive: '2026-10-05-old', digest: 'a'.repeat(64), name: 'old', reason: 'reason\u001b[2J', at: 'today', manifest: 'preservation/manifest.json' }] });
  expect(stdout).toContain('retry_difference'); expect(stdout).not.toContain('\u001b[2J');
});
it('keeps typed partial failure details in JSON and sanitizes human directory diagnostics', () => {
  const details = { phase: 'moving' as const, sourceDir: 'source', archiveDir: 'archive', preservationDir: 'preservation', moved: ['x\u001b[2J'], pending: ['metadata.yaml'], sourceEntries: ['metadata.yaml'], archiveEntries: ['x\u001b[2J'] };
  const error = new AbandonError(details, new Error('disk full'));
  handleError(error, false, true);
  expect(JSON.parse(stderr).error).toMatchObject({ code: 'ABANDON_INCOMPLETE', details });
  stderr = ''; handleError(error);
  expect(stderr).toContain('abandoned destination'); expect(stderr).toContain('pending'); expect(stderr).not.toContain('\u001b[2J');
});

it('keeps quiet success silent', async () => {
  expect(await run('--quiet', 'change', 'abandon', 'old', '--reason', 'Disproved')).toBe('');
  expect(stderr).toBe(''); expect(process.exitCode).toBe(0);
});
it('links three real same-name story attempts to immutable same-issue history', async () => {
  const prior = new Map<string, ReturnType<typeof imageOf>>();
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await run('change', 'story', 'old', '--issue', '#333');
      const { metadata } = readChangeMetadata(path.join(root, '.prospec/changes/old/metadata.yaml'), 'old');
      expect(metadata.retry_of?.map(link => link.archive).sort()).toEqual([...prior.keys()].map(dir => path.basename(dir)).sort());
    }
    const result = JSON.parse(await run('change', 'abandon', 'old', '--reason', `Attempt ${attempt}`, '--json'));
    for (const [dir, bytes] of prior) expect(imageOf(dir)).toEqual(bytes);
    prior.set(result.archiveDir, imageOf(result.archiveDir));
    const history = JSON.parse(await run('status', '--json')).abandoned;
    expect(history).toHaveLength(attempt);
    expect(history.map((entry: { archive: string }) => entry.archive).sort()).toEqual([...prior.keys()].map(dir => path.basename(dir)).sort());
    const human = await run('status');
    for (let index = 1; index <= attempt; index++) expect(human).toContain(`Attempt ${index}`);
  }
});
