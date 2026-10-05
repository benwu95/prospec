import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';
import { premiseProposal, verifiedPremise } from '../helpers/premise.js';
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
let cwd: string;
const cli = (args: string[]) => runCliInProcess(args, { cwd });
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'prospec-premise-'));
  await fs.writeFile(path.join(cwd, '.prospec.yaml'), 'project:\n  name: test\nagents: [codex]\n');
});
afterEach(async () => { await fs.rm(cwd, { recursive: true, force: true }); });
describe('CLI sourced premise workflow', () => {
  it('scaffolds pending, refuses direct planning, then resumes after evidence and baseline', async () => {
    expect((await cli(['change', 'story', 'sourced'])).exitCode).toBe(0);
    const dir = path.join(cwd, '.prospec/changes/sourced');
    const proposal = path.join(dir, 'proposal.md');
    const before = await fs.readFile(path.join(dir, 'metadata.yaml'), 'utf8');
    expect(before).toContain('premise_version: 1');
    const pending = await cli(['validate', 'proposal', 'sourced', '--json']);
    expect(pending.exitCode).toBe(1);
    expect(JSON.parse(pending.stdout)).toMatchObject({ ok: false, facts: { state: 'blocked', premise: { verification: { status: 'pending' } } } });
    expect((await cli(['status'])).stdout).toContain('prospec-explore');
    expect((await cli(['change', 'plan', '--change', 'sourced'])).exitCode).toBe(1);
    expect(await fs.readFile(path.join(dir, 'metadata.yaml'), 'utf8')).toBe(before);
    await fs.writeFile(proposal, premiseProposal() + '\n## User Stories\n\n### US-1: Retain source [P1]\n\n**Acceptance Scenarios:**\n\n- WHEN a story is verified, THEN the original source remains recorded.\n');
    expect((await cli(['change', 'story', 'sourced', '--freeze-scenarios'])).exitCode).toBe(0);
    const ready = await cli(['validate', 'proposal', 'sourced', '--json']);
    expect(ready.exitCode).toBe(0);
    expect(JSON.parse(ready.stdout).facts.premise.source).toBe('ai-proposed');
    expect((await cli(['change', 'plan', '--change', 'sourced'])).exitCode).toBe(0);
  });
  it('reports reproduction gaps and explains structural limits in text and help', async () => {
    await cli(['change', 'story', 'bug']);
    await cli(['change', 'scale', 'full', '--change', 'bug']);
    await fs.writeFile(path.join(cwd, '.prospec/changes/bug/proposal.md'), premiseProposal({ ...verifiedPremise, evidence: { kind: 'reproduction', ref: 'trace', result: 'Confirmed' } }));
    const invalid = await cli(['validate', 'proposal', 'bug']);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stdout).toContain('evidence.steps');
    expect(invalid.stdout).toContain('Structural validation only');
    expect((await cli(['validate', '--help'])).stdout).toContain('proposal');
  });
});
