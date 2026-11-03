import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execute as check } from '../../src/services/check.service.js';
import { execute as verify } from '../../src/services/verify-record.service.js';
import { readChangeMetadata } from '../../src/lib/change-metadata.js';
import { gitIn } from '../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../helpers/private-tmpdir.js';

vi.setConfig({ testTimeout: 60_000 });
const temp = usePrivateTmpdir('backfill-fail-retention');

function fixture(exitCode: number) {
  const cwd = mkdtempSync(path.join(temp, 'project-'));
  const put = (relative: string, content: string) => {
    const target = path.join(cwd, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  put('.prospec.yaml', `version: 2.10.0
project:
  name: fixture
tech_stack:
  language: javascript
  test_command: node -e process.exit(${exitCode})
paths:
  base_dir: prospec
agents: []
`);
  put('prospec/CONSTITUTION.md', `# Constitution

## Principles

### [MUST] Legacy layering

**Description**: Existing code is layered.

### [MUST] Artifact integrity

**Description**: Current artifacts contain no invented intent.
`);
  put('.prospec/changes/probe/metadata.yaml', 'name: probe\ncreated_at: 2026-11-03T00:00:00.000Z\nstatus: implemented\nscale: backfill\n');
  put('.prospec/changes/probe/backfill-draft.md', '**Feature:** fixture\n**Story:** US-1\n');
  put('.prospec/changes/probe/proposal.md', '# Document observable code behavior\n');
  put('src/legacy.js', 'export const answer = 42;\n');
  gitIn(cwd, 'init', '--quiet');
  gitIn(cwd, 'add', '.');
  return { cwd, put, metadataPath: path.join(cwd, '.prospec/changes/probe/metadata.yaml') };
}

describe('proven-backfill failure retention with real project-test and verification writers', () => {
  it.each([
    { exitCode: 1, artifact: 'PASS', expectedGrade: 'C' },
    { exitCode: 0, artifact: 'FAIL', expectedGrade: 'C' },
    { exitCode: 0, artifact: 'PASS', expectedGrade: 'A' },
  ] as const)('grades real exit $exitCode / artifact $artifact as $expectedGrade while retaining existing debt', async ({ exitCode, artifact, expectedGrade }) => {
    const { cwd, put, metadataPath } = fixture(exitCode);
    if (artifact === 'FAIL') {
      put('.prospec/changes/probe/proposal.md', '# Unsupported intent\nAll purchases automatically retry payments; src/legacy.js contains no such behavior.\n');
    }
    const recorded = await check({ cwd, change: 'probe', recordTests: true });
    expect(recorded).toMatchObject({ kind: 'record-tests', recorded: true, exitCode });
    const before = readChangeMetadata(metadataPath, 'probe').metadata;
    expect(before.test_attempt).toMatchObject({ outcome: exitCode === 0 ? 'passed' : 'failed', exit_code: exitCode });
    put('judgments.json', JSON.stringify([
      { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'in-session' },
      { name: 'constitution', result: artifact, graded_by: 'in-session', constitution_rules: [
        { name: 'Legacy layering', result: 'FAIL', applicability: 'pre-existing-code',
          statement: 'src/legacy.js is unchanged; all newly created artifacts comply with layering.' },
        { name: 'Artifact integrity', result: artifact, statement: artifact === 'FAIL'
          ? 'Current proposal invents intent unsupported by src/legacy.js.' : 'Current proposal records observable behavior.' },
      ] },
      { name: 'design', result: 'not-applicable', graded_by: 'in-session' },
    ]));
    const result = await verify({ cwd, change: 'probe', dimensionsPath: path.join(cwd, 'judgments.json'), warnings: [] });
    expect(result.grade).toBe(expectedGrade);
    expect(result.statusAdvanced).toBe(expectedGrade === 'A');
    expect(result.dimensions.find((dimension) => dimension.name === 'tests')?.result).toBe(exitCode === 0 ? 'PASS' : 'FAIL');
    expect(result.excludedFromGrade).toEqual([]);
    const after = readChangeMetadata(metadataPath, 'probe').metadata;
    expect(after.status).toBe(expectedGrade === 'A' ? 'verified' : 'implemented');
    expect(after.test_attempt).toEqual(before.test_attempt);
    expect(after.test_provenance).toEqual(before.test_provenance);
    const evidence = readFileSync(path.join(cwd, '.prospec/changes/probe/verify.md'), 'utf8');
    expect(evidence).toContain('"applicability": "pre-existing-code"');
    expect(evidence).toContain('"result": "FAIL"');
    expect(result.dimensions.find((dimension) => dimension.name === 'delta-spec-compliance')?.result).toBe('not-adjudicated');
    expect(evidence).toContain('empty requirement set');
  });
});
