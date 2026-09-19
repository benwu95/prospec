import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execute as status } from '../../src/services/status.service.js';

describe('status service integration — read-only purity over 10 consecutive runs (T18, REQ-SERVICES-070)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'status-integration-'));
    mkdirSync(path.join(root, '.prospec', 'changes', 'add-auth'), { recursive: true });
    mkdirSync(path.join(root, 'prospec', 'ai-knowledge'), { recursive: true });

    writeFileSync(
      path.join(root, '.prospec.yaml'),
      'project:\n  name: test-proj\nworkflow:\n  max_station_retries: 3\n',
    );

    const initialMetadata = [
      'name: add-auth',
      'created_at: 2026-01-01T00:00:00.000Z',
      'status: verified',
      'scale: standard',
      'quality_log:',
      '  - skill: prospec-verify',
      '    date: 2026-01-02T00:00:00.000Z',
      '    result: PASS',
      '    warnings: []',
      '    grade: A',
      '  - skill: prospec-verify',
      '    date: 2026-01-03T00:00:00.000Z',
      '    result: FAIL',
      '    warnings: []',
      '    grade: C',
      '  - skill: prospec-verify',
      '    date: 2026-01-04T00:00:00.000Z',
      '    result: FAIL',
      '    warnings: []',
      '    grade: C',
      '  - skill: prospec-verify',
      '    date: 2026-01-05T00:00:00.000Z',
      '    result: FAIL',
      '    warnings: []',
      '    grade: C',
      '',
    ].join('\n');

    writeFileSync(
      path.join(root, '.prospec', 'changes', 'add-auth', 'metadata.yaml'),
      initialMetadata,
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs status 10 consecutive times and leaves metadata.yaml byte-identical', async () => {
    const metadataPath = path.join(root, '.prospec', 'changes', 'add-auth', 'metadata.yaml');
    const baselineBytes = readFileSync(metadataPath);

    for (let i = 0; i < 10; i++) {
      const report = await status({ cwd: root });
      expect(report.clean).toBe(false);
      expect(report.changes.length).toBe(1);
      expect(report.changes[0]?.code).toBe('ESCALATE_TO_HUMAN');
      expect(report.changes[0]?.next).toBeNull();

      const currentBytes = readFileSync(metadataPath);
      expect(currentBytes.equals(baselineBytes)).toBe(true);
    }
  });
});
