import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execFileSync } from 'node:child_process';
import { execute } from '../../../src/services/validate.service.js';
import { readConfig } from '../../../src/lib/config.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/config.js', () => ({
  readConfig: vi.fn().mockResolvedValue({ project: { name: 'demo' } }),
  resolveBasePaths: vi.fn().mockReturnValue({
    baseDir: '/repo/prospec',
    knowledgePath: '/repo/prospec/ai-knowledge',
    constitutionPath: '/repo/prospec/CONSTITUTION.md',
    specsPath: '/repo/prospec/specs',
  }),
}));

// git spawn is environment-bound; pin the trust-zone probe deterministically.
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockImplementation(() => {
    return globalThis.__validateGitPorcelain ?? '';
  }),
}));

declare global {
   
  var __validateGitPorcelain: string | undefined;
}

beforeEach(() => {
  vol.reset();
  globalThis.__validateGitPorcelain = undefined;
});

const CWD = '/repo';
const CHANGE_DIR = '/repo/.prospec/changes/promote-widget';

describe('validate slug', () => {
  it('passes a safe slug and fails traversal, exit semantics left to the CLI', async () => {
    expect((await execute({ kind: 'slug', target: 'user-profile', cwd: CWD })).ok).toBe(true);
    const bad = await execute({ kind: 'slug', target: 'a/../b', cwd: CWD });
    expect(bad.ok).toBe(false);
    expect(bad.findings[0]!.level).toBe('FAIL');
  });

  it('requires the name argument', async () => {
    await expect(execute({ kind: 'slug', cwd: CWD })).rejects.toThrow(PrerequisiteError);
  });
});

describe('validate promote-scaffold', () => {
  function seedScaffold(over: { plan?: boolean; metadata?: string } = {}): void {
    const files: Record<string, string> = {
      [`${CHANGE_DIR}/backfill-draft.md`]: '**Feature:** widget\n**Story:** US-1\n',
      [`${CHANGE_DIR}/proposal.md`]: '# p\n',
      [`${CHANGE_DIR}/metadata.yaml`]:
        over.metadata ??
        `name: promote-widget
created_at: 2026-07-30T00:00:00.000Z
status: implemented
scale: backfill
related_modules:
  - services
`,
    };
    if (over.plan) files[`${CHANGE_DIR}/plan.md`] = '# plan\n';
    vol.fromJSON(files);
  }

  it('passes a correct scaffold with a clean trust zone — no findings', async () => {
    seedScaffold();
    const result = await execute({ kind: 'promote-scaffold', change: 'promote-widget', cwd: CWD });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('fails when plan.md exists (no hollow planning artifacts)', async () => {
    seedScaffold({ plan: true });
    const result = await execute({ kind: 'promote-scaffold', change: 'promote-widget', cwd: CWD });
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.message).join(' ')).toContain('plan.md');
  });

  it('reports the feature-map coverage gap as INFO on a backfill draft', async () => {
    vol.fromJSON({
      [`${CHANGE_DIR}/backfill-draft.md`]: '**Feature:** widget\n**Story:** US-1\n',
      [`${CHANGE_DIR}/metadata.yaml`]: 'name: promote-widget\n',
      '/repo/prospec/ai-knowledge/feature-map.yaml':
        'features:\n  - feature: widget\n    modules: [services]\n    status: active\n  - feature: uncovered\n    modules: [lib]\n    status: active\n',
      '/repo/prospec/specs/features/widget.md': '---\nfeature: widget\n---\n',
    });
    const result = await execute({ kind: 'backfill-draft', change: 'promote-widget', cwd: CWD });
    const info = result.findings.filter((f) => f.level === 'INFO').map((f) => f.message).join(' ');
    expect(info).toContain('coverage scoping');
    expect(info).toContain('uncovered');
    expect(info).not.toContain('widget,');
  });

  it('surfaces a malformed feature-map as an INFO reason instead of throwing', async () => {
    vol.fromJSON({
      [`${CHANGE_DIR}/backfill-draft.md`]: '**Feature:** widget\n**Story:** US-1\n',
      [`${CHANGE_DIR}/metadata.yaml`]: 'name: promote-widget\n',
      '/repo/prospec/ai-knowledge/feature-map.yaml': 'features: "not a list"\n',
    });
    const result = await execute({ kind: 'backfill-draft', change: 'promote-widget', cwd: CWD });
    expect(result.ok).toBe(true);
    const info = result.findings.filter((f) => f.level === 'INFO').map((f) => f.message).join(' ');
    expect(info).toContain('coverage scoping unavailable');
  });

  it('fails when the trust zone has uncommitted changes', async () => {
    seedScaffold();
    globalThis.__validateGitPorcelain = ' M prospec/specs/features/widget.md\n';
    const result = await execute({ kind: 'promote-scaffold', change: 'promote-widget', cwd: CWD });
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.message).join(' ')).toContain('trust-zone');
  });

  it('reports a git failure as an unverified trust zone naming the reason — never a silent PASS', async () => {
    seedScaffold();
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('index.lock held by another process');
    });
    const result = await execute({ kind: 'promote-scaffold', change: 'promote-widget', cwd: CWD });
    expect(result.findings).not.toEqual([]);
    const messages = result.findings.map((f) => f.message).join(' ');
    expect(messages).toContain('could not be verified');
    expect(messages).toContain('index.lock held by another process');
  });

  it('reports an unreadable config as an unverified trust zone — never a silent PASS', async () => {
    seedScaffold();
    vi.mocked(readConfig).mockRejectedValueOnce(new Error('config exploded'));
    const result = await execute({ kind: 'promote-scaffold', change: 'promote-widget', cwd: CWD });
    const messages = result.findings.map((f) => f.message).join(' ');
    expect(messages).toContain('could not be verified');
    expect(messages).toContain('config exploded');
  });

  it('treats unreadable metadata as a FAIL finding, not a crash', async () => {
    seedScaffold({ metadata: 'status: [unclosed\n' });
    const result = await execute({ kind: 'promote-scaffold', change: 'promote-widget', cwd: CWD });
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.message).join(' ')).toContain('metadata.yaml');
  });
});

describe('validate backfill-draft / design-spec', () => {
  it('reports structural facts for a draft via the change default path', async () => {
    vol.fromJSON({
      [`${CHANGE_DIR}/backfill-draft.md`]:
        '**Feature:** widget\n**Story:** US-1\nSo that [NEEDS CLARIFICATION: why].\n',
      [`${CHANGE_DIR}/metadata.yaml`]: 'name: promote-widget\n',
    });
    const result = await execute({ kind: 'backfill-draft', change: 'promote-widget', cwd: CWD });
    expect(result.ok).toBe(true);
    expect(result.facts).toMatchObject({ featureHeaderCount: 1, storyHeaderCount: 1 });
    // no ratio verdict — raw facts only
    expect(result.findings.some((f) => /50%|abort/.test(f.message))).toBe(false);
  });

  it('fails a design spec with a missing section or remaining NC marker', async () => {
    vol.fromJSON({
      '/repo/spec.md': '## Visual Identity\n## Components\n[NEEDS CLARIFICATION: x]\n',
    });
    const result = await execute({ kind: 'design-spec', target: 'spec.md', cwd: CWD });
    expect(result.ok).toBe(false);
    const messages = result.findings.map((f) => f.message).join(' ');
    expect(messages).toContain('Responsive Strategy');
    expect(messages).toContain('[NEEDS CLARIFICATION]');
  });

  it('errors clearly when the target file is missing', async () => {
    vol.fromJSON({ [`${CHANGE_DIR}/metadata.yaml`]: 'name: promote-widget\n' });
    await expect(
      execute({ kind: 'design-spec', change: 'promote-widget', cwd: CWD }),
    ).rejects.toThrow(/target not found/);
  });
});
