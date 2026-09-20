import { computeAcceptanceDigest } from '../../../src/types/change.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { execute } from '../../../src/services/verify-context.service.js';
import { VerificationContextSchema } from '../../../src/types/station.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

describe('verify-context service (REQ-SERVICES-115, REQ-TESTS-123)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-vcs-test-'));
    setupRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupRepo() {
    execFileSync('git', ['init', '-q', tmpDir], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpDir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpDir, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' });

    fs.writeFileSync(
      path.join(tmpDir, '.prospec.yaml'),
      'project:\n  name: test\nbase_dir: prospec\nartifact_language: en\ntech_stack:\n  language: typescript\n  package_manager: pnpm\n  test_command: pnpm test\n',
    );
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const a = 1;\n');

    execFileSync('git', ['-C', tmpDir, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpDir, 'commit', '-qm', 'init'], { stdio: 'ignore' });
  }

  const sampleProposal = `# Proposal
## User Stories
### US-1: Test Story
**Acceptance Scenarios:**
- WHEN input, THEN output.
`;

  const sampleDelta = `# Delta
## ADDED
### REQ-CORE-001: First req
**Feature:** core
**Story:** US-1
**Description:** First
**Spec:**
Spec text.
- WHEN a, THEN b
`;

  function setupChange(
    changeName: string = 'test-change',
    options: {
      scale?: string;
      status?: string;
      frozenBaseline?: boolean;
    } = {},
  ) {
    const changeDir = path.join(tmpDir, '.prospec', 'changes', changeName);
    fs.mkdirSync(changeDir, { recursive: true });

    let metadataContent = `name: ${changeName}\ncreated_at: 2026-09-20T10:00:00.000Z\nstatus: ${options.status ?? 'implemented'}\n`;
    if (options.scale) {
      metadataContent += `scale: ${options.scale}\n`;
    }
    if (options.frozenBaseline) {
      metadataContent += `acceptance:\n  version: 1\n  current_revision: 1\n  revisions:\n    - revision: 1\n      digest: ${computeAcceptanceDigest([{ id: 'US-1-1', text: 'WHEN input, THEN output.' }])}\n      captured_at: 2026-09-20T10:00:00.000Z\n      captured_status: story\n      origin: story\n      reason: initial freeze\n      scenarios:\n        - id: US-1-1\n          story_id: US-1\n          text: WHEN input, THEN output.\n          source: .prospec/changes/${changeName}/proposal.md:5\n`;
    }
    fs.writeFileSync(path.join(changeDir, 'metadata.yaml'), metadataContent);
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), sampleProposal);
    if (options.scale !== 'quick') {
      fs.writeFileSync(path.join(changeDir, 'delta-spec.md'), sampleDelta);
    }
  }

  it('projects deterministic verify-context.json and does not modify metadata.yaml or status', async () => {
    setupChange('test-change', { frozenBaseline: true });
    const metadataBefore = fs.readFileSync(
      path.join(tmpDir, '.prospec', 'changes', 'test-change', 'metadata.yaml'),
      'utf8',
    );

    const result = await execute({
      change: 'test-change',
      cwd: tmpDir,
    });

    expect(result.changeName).toBe('test-change');
    expect(result.contextPath).toBe('.prospec/changes/test-change/verify-context.json');
    expect(result.contextId).toMatch(/^[0-9a-f]{64}$/);

    const contextFile = path.join(tmpDir, '.prospec', 'changes', 'test-change', 'verify-context.json');
    expect(fs.existsSync(contextFile)).toBe(true);

    const contextRaw = fs.readFileSync(contextFile, 'utf8');
    const parsed = JSON.parse(contextRaw);
    const validated = VerificationContextSchema.safeParse(parsed);
    expect(validated.success).toBe(true);
    expect(parsed.context_id).toBe(result.contextId);
    expect(parsed.change_name).toBe('test-change');
    expect(parsed.scale).toBe('standard');
    expect(parsed.baseline.status).toBe('frozen');
    expect(parsed.spec.req_ids).toEqual(['REQ-CORE-001']);

    // Assert metadata.yaml is completely unmodified byte-for-byte
    const metadataAfter = fs.readFileSync(
      path.join(tmpDir, '.prospec', 'changes', 'test-change', 'metadata.yaml'),
      'utf8',
    );
    expect(metadataAfter).toBe(metadataBefore);
  });

  it('projects verify-context for quick scale changes without delta-spec', async () => {
    setupChange('quick-change', { scale: 'quick', frozenBaseline: true });

    const result = await execute({
      change: 'quick-change',
      cwd: tmpDir,
    });

    expect(result.changeName).toBe('quick-change');
    const contextFile = path.join(tmpDir, '.prospec', 'changes', 'quick-change', 'verify-context.json');
    const parsed = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
    expect(parsed.scale).toBe('quick');
    expect(parsed.spec.req_ids).toEqual([]);
  });

  it('refuses when change directory does not exist', async () => {
    await expect(
      execute({
        change: 'non-existent',
        cwd: tmpDir,
      }),
    ).rejects.toThrow(PrerequisiteError);
  });
});
