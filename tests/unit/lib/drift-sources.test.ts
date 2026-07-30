import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  collectFeatureMapGovernance,
  collectGitTimestamps,
  collectImportEdges,
  collectKnowledgeSize,
  collectMarkdownLinks,
  collectMcpReadmeCounts,
  collectMetadataCompleteness,
  collectReqDefinitions,
  collectReqReferences,
  collectConstitutionRules,
  collectQualityLedger,
  collectReviewProvenance,
  collectTaskStates,
  collectTestProvenance,
  computeChangeDigest,
  moduleAttributor,
} from '../../../src/lib/drift-sources.js';
import { DRIFT_REPORT_FILENAME } from '../../../src/types/drift-report.js';
import { ESCAPED_DEFECT_REPORT_FILENAME } from '../../../src/types/escaped-defect.js';
import type { KnowledgeSizeBudget } from '../../../src/types/config.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

// drift-sources uses fast-glob + git, so tests run on real temp dirs
// (same approach as scanner.test.ts — memfs is not visible to fast-glob).

// Each test here spawns real `git` (and, in the record paths, the project's test
// command) against a temp repo — 1-2s per test idle, several times that under full
// parallel-suite contention. vitest's 5s default then times out load-dependently,
// which is intolerable for THIS change specifically: `--record-tests` stamps the
// suite's exit code into `test_provenance`, so a flaky suite makes the
// `test-provenance` verdict non-deterministic. Same precedent as tests/e2e/cli.test.ts.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'drift-sources-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): void {
  const abs = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const MODULE_MAP: ModuleMap = {
  modules: [
    { name: 'cli', paths: ['src/cli'], keywords: [], relationships: { depends_on: ['services', 'types'] } },
    { name: 'services', paths: ['src/services'], keywords: [], relationships: { depends_on: ['types'] } },
    { name: 'types', paths: ['src/types'], keywords: [], relationships: { depends_on: [] } },
  ],
};

describe('collectKnowledgeSize (REQ-LIB-027)', () => {
  const BUDGET: KnowledgeSizeBudget = { l1_per_file: 1500, l2_per_module: 400, readme_max_lines: 100 };
  const baseDir = () => path.join(tmpDir, 'prospec');
  const knowledgePath = () => path.join(tmpDir, 'prospec', 'ai-knowledge');

  it('measures index.md + core conventions as L1 and module READMEs as L2, with repo-relative paths', () => {
    write('prospec/index.md', 'A'.repeat(40)); // 40 chars → 10 tokens, 1 line
    write('prospec/ai-knowledge/_conventions.md', 'B'.repeat(20)); // 5 tokens
    write('prospec/ai-knowledge/modules/lib/README.md', 'line1\nline2\n'); // 12 chars → 3 tokens, 2 lines
    write('prospec/ai-knowledge/modules/types/README.md', 'C'.repeat(8)); // 2 tokens

    const src = collectKnowledgeSize(tmpDir, baseDir(), knowledgePath(), BUDGET);
    expect(src.available).toBe(true);
    expect(src.budget).toEqual(BUDGET);

    const byPath = new Map(src.items.map((i) => [i.source_path, i]));
    expect(byPath.get('prospec/index.md')).toMatchObject({ kind: 'l1', tokens: 10, lines: 1 });
    expect(byPath.get('prospec/ai-knowledge/_conventions.md')).toMatchObject({ kind: 'l1', tokens: 5 });
    expect(byPath.get('prospec/ai-knowledge/modules/lib/README.md')).toMatchObject({ kind: 'l2', tokens: 3, lines: 2 });
    expect(byPath.get('prospec/ai-knowledge/modules/types/README.md')).toMatchObject({ kind: 'l2' });
    // absent core conventions are simply not measured (their absence is knowledge-health's concern)
    expect(byPath.has('prospec/ai-knowledge/_glossary.md')).toBe(false);
    expect([...byPath.keys()].every((p) => p.startsWith('prospec/'))).toBe(true);
  });

  it('skips (never PASS) when the knowledge base is absent', () => {
    const src = collectKnowledgeSize(tmpDir, baseDir(), knowledgePath(), BUDGET);
    expect(src.available).toBe(false);
    expect(src.reason).toContain('source unavailable');
    expect(src.items).toHaveLength(0);
  });
});

describe('collectReqDefinitions', () => {
  it('indexes REQ ids from headings, including deprecated ~~REQ~~ ones', () => {
    write('specs/features/auth.md', '#### REQ-AUTH-001: Login\n\n#### ~~REQ-AUTH-002: Legacy~~\n');
    write('specs/features/_archived-old.md', '#### REQ-OLD-001: Gone\n');
    const r = collectReqDefinitions(path.join(tmpDir, 'specs/features'));
    expect(r.available).toBe(true);
    expect(r.ids).toEqual(['REQ-AUTH-001', 'REQ-AUTH-002']);
  });

  it('reports unavailable when the features dir is missing or empty', () => {
    const missing = collectReqDefinitions(path.join(tmpDir, 'nope'));
    expect(missing.available).toBe(false);
    expect(missing.reason).toContain('source unavailable');

    mkdirSync(path.join(tmpDir, 'empty'));
    const empty = collectReqDefinitions(path.join(tmpDir, 'empty'));
    expect(empty.available).toBe(false);
  });

  it('does not index inline (non-heading) REQ mentions as definitions', () => {
    write('specs/features/a.md', 'body mentions REQ-AUTH-009 inline\n#### REQ-AUTH-001: Real\n');
    const r = collectReqDefinitions(path.join(tmpDir, 'specs/features'));
    expect(r.ids).toEqual(['REQ-AUTH-001']);
  });
});

describe('collectReqReferences', () => {
  it('collects every REQ mention with file and line, skipping _archived dirs', () => {
    write('specs/features/a.md', 'see REQ-AUTH-001 and REQ-X-009\n');
    write('specs/_archived-history/old.md', 'REQ-GONE-001\n');
    write('knowledge/modules/lib/README.md', 'line1\nimplements REQ-AUTH-001\n');
    const refs = collectReqReferences(
      [path.join(tmpDir, 'specs'), path.join(tmpDir, 'knowledge')],
      tmpDir,
    );
    const ids = refs.map((r) => r.id).sort();
    expect(ids).toEqual(['REQ-AUTH-001', 'REQ-AUTH-001', 'REQ-X-009']);
    const readmeRef = refs.find((r) => r.source_path.endsWith('README.md'));
    expect(readmeRef?.line).toBe(2);
    expect(refs.some((r) => r.id === 'REQ-GONE-001')).toBe(false);
  });

  it('ignores ids without an uppercase module segment (e.g. REQ-005)', () => {
    write('specs/a.md', 'shorthand REQ-005 is not a real id\n');
    const refs = collectReqReferences([path.join(tmpDir, 'specs')], tmpDir);
    expect(refs).toEqual([]);
  });

  it('skips REQ mentions inside fenced code blocks but keeps line numbers', () => {
    write('specs/a.md', '```markdown\nexample REQ-FAKE-001\n```\nreal REQ-REAL-001\n');
    const refs = collectReqReferences([path.join(tmpDir, 'specs')], tmpDir);
    expect(refs).toEqual([
      { id: 'REQ-REAL-001', source_path: path.join('specs', 'a.md'), line: 4 },
    ]);
  });

  it('excludes flat _archived*.md files from reference scanning (both sides of the check)', () => {
    write('specs/features/_archived-old.md', '#### REQ-OLD-001: Gone\nsee REQ-OLD-001\n');
    write('specs/features/live.md', 'see REQ-LIVE-001\n');
    const refs = collectReqReferences([path.join(tmpDir, 'specs')], tmpDir);
    expect(refs.map((r) => r.id)).toEqual(['REQ-LIVE-001']);
  });
});

describe('collectMarkdownLinks', () => {
  it('resolves relative links against the source file and reports existence', () => {
    write('docs/guide.md', '[ok](./other.md) [broken](missing.md#sec)\n');
    write('docs/other.md', 'x');
    const { available, links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(available).toBe(true);
    expect(links).toHaveLength(2);
    const ok = links.find((l) => l.raw_target === './other.md');
    const broken = links.find((l) => l.raw_target === 'missing.md#sec');
    expect(ok?.exists).toBe(true);
    expect(broken?.exists).toBe(false);
    expect(broken?.resolved_path).toBe(path.join('docs', 'missing.md'));
  });

  it('skips links inside fenced code blocks (illustrative examples)', () => {
    write('docs/conv.md', 'intro\n```markdown\n- [Example](./does-not-exist.md)\n```\n[real](./real.md)\n');
    write('docs/real.md', 'x');
    const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(links).toHaveLength(1);
    expect(links[0]?.raw_target).toBe('./real.md');
    expect(links[0]?.line).toBe(5);
  });

  it('honours CommonMark fence-length close rules — a 4-backtick fence wrapping ``` does not leak', () => {
    write(
      'docs/nested.md',
      ['````markdown', '```', '[leaky](./nope.md) REQ-FAKE-001', '```', '````', '[real](./real.md)'].join('\n'),
    );
    write('docs/real.md', 'x');
    const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(links.map((l) => l.raw_target)).toEqual(['./real.md']);
    const refs = collectReqReferences([path.join(tmpDir, 'docs')], tmpDir);
    expect(refs).toEqual([]);
  });

  it('does not let an info-string fence line close an open block', () => {
    write('docs/info.md', ['```', '```js', '[leaky](./nope.md)', '```', '[real](./real.md)'].join('\n'));
    write('docs/real.md', 'x');
    const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(links.map((l) => l.raw_target)).toEqual(['./real.md']);
  });

  it('skips external, anchor, absolute, placeholder and glob targets', () => {
    write(
      'docs/links.md',
      '[a](https://x.dev) [b](#anchor) [c](/abs/path.md) [d](modules/{name}/README.md) [e](src/**/*.ts) [f](mailto:x@y.z)\n',
    );
    const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(links).toEqual([]);
  });

  it('reports unavailable when no markdown root exists (FR-007)', () => {
    const r = collectMarkdownLinks([path.join(tmpDir, 'specs'), path.join(tmpDir, 'knowledge')], tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('source unavailable');
  });

  it('handles parenthesised and percent-encoded targets without false brokens', () => {
    write('docs/a.md', '[v2](design%20(v2).md) [spaced](<my file.md>) [enc](my%20file.md)\n');
    write('docs/design (v2).md', 'x');
    write('docs/my file.md', 'x');
    const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(links).toHaveLength(3);
    expect(links.every((l) => l.exists)).toBe(true);
  });

  it('never probes outside the repo root — traversal links are not checked (no existence oracle)', () => {
    write('docs/a.md', '[esc](../../../../etc/hosts) [in](./b.md)\n');
    write('docs/b.md', 'x');
    const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
    expect(links.map((l) => l.raw_target)).toEqual(['./b.md']);
  });

  it('does not leak existence of a symlink whose real target escapes the repo', () => {
    const outsideDir = mkdtempSync(path.join(os.tmpdir(), 'drift-outside-'));
    try {
      const secret = path.join(outsideDir, 'secret.txt');
      writeFileSync(secret, 'classified');
      mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
      // lexically inside cwd (docs/link.md) but physically points outside
      symlinkSync(secret, path.join(tmpDir, 'docs', 'link.md'));
      write('docs/a.md', '[probe](./link.md) [inside](./real.md)\n');
      write('docs/real.md', 'x');
      const { links } = collectMarkdownLinks([path.join(tmpDir, 'docs')], tmpDir);
      const probe = links.find((l) => l.raw_target === './link.md');
      const inside = links.find((l) => l.raw_target === './real.md');
      // the escaping symlink is recorded but its outside target must read false
      expect(probe?.exists).toBe(false);
      // a genuine in-repo file still reports true (containment, not blanket-false)
      expect(inside?.exists).toBe(true);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe('collectImportEdges', () => {
  it('collects cross-module edges including multi-line and side-effect imports', () => {
    write('src/services/a.ts', "import type { X } from '../types/x.js';\n");
    write('src/cli/b.ts', "import {\n  helper,\n} from '../services/a.js';\nimport '../types/side-effect.js';\n");
    const { available, edges } = collectImportEdges(tmpDir, MODULE_MAP);
    expect(available).toBe(true);
    const asPairs = edges.map((e) => `${e.from_module}->${e.to_module}`).sort();
    expect(asPairs).toEqual(['cli->services', 'cli->types', 'services->types']);
    const multiline = edges.find((e) => e.specifier === '../services/a.js');
    expect(multiline?.line).toBe(3);
  });

  it('ignores package imports, same-module imports and string constants', () => {
    write('src/types/x.ts', "import { z } from 'zod';\nimport { y } from './y.js';\nexport const P = './services/fake.js';\n");
    write('src/types/y.ts', '');
    const { edges } = collectImportEdges(tmpDir, MODULE_MAP);
    expect(edges).toEqual([]);
  });

  it('skips files outside any module-map path', () => {
    write('scripts/tool.ts', "import { x } from '../src/services/a.js';\n");
    write('src/services/a.ts', '');
    const { edges } = collectImportEdges(tmpDir, MODULE_MAP);
    expect(edges).toEqual([]);
  });

  it('reports unavailable when none of the module paths exist on disk (FR-007)', () => {
    const r = collectImportEdges(tmpDir, MODULE_MAP);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('source unavailable');
  });

  it('reports skipped (not a vacuous PASS) for a non-JS/TS project whose module paths exist but hold no JS/TS source', () => {
    // The dirs exist and contain source — but Python, not JS/TS. import-direction
    // is JS/TS-only, so it must degrade to skipped, never report available/PASS
    // (which would falsely claim the dependency direction was verified).
    write('src/services/main.py', 'from ..cli.app import x\n');
    write('src/cli/app.py', 'pass\n');
    const r = collectImportEdges(tmpDir, MODULE_MAP);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('JavaScript/TypeScript');
    expect(r.edges).toEqual([]);
  });

  it('ignores imports inside block comments (commented-out code is not an edge)', () => {
    write(
      'src/types/x.ts',
      "/*\nimport { bad } from '../services/a.js';\n*/\nimport { ok } from './y.js';\n",
    );
    write('src/types/y.ts', '');
    write('src/services/a.ts', '');
    const { edges } = collectImportEdges(tmpDir, MODULE_MAP);
    expect(edges).toEqual([]);
  });

  it('ignores import-like text inside template literals', () => {
    write(
      'src/services/gen.ts',
      "const tpl = `\nimport { fake } from '../types/x.js';\n`;\nimport { real } from '../types/y.js';\n",
    );
    write('src/types/x.ts', '');
    write('src/types/y.ts', '');
    const { edges } = collectImportEdges(tmpDir, MODULE_MAP);
    // the real import edges to types; the template-literal 'import' is blanked
    expect(edges.some((e) => e.specifier === '../types/y.js')).toBe(true);
    expect(edges.some((e) => e.specifier === '../types/x.js')).toBe(false);
  });

  it('scans domain-glob module paths instead of skipping them (import-direction stays live)', () => {
    const DOMAIN_MAP: ModuleMap = {
      modules: [
        { name: 'auth', paths: ['**/auth/**'], keywords: [], relationships: { depends_on: [] } },
        { name: 'billing', paths: ['**/billing/**'], keywords: [], relationships: { depends_on: [] } },
      ],
    };
    write('src/features/auth/login.ts', "import { rate } from '../billing/rate.js';\n");
    write('src/features/billing/rate.ts', '');
    const { available, edges } = collectImportEdges(tmpDir, DOMAIN_MAP);
    // before the fix existsSync('<cwd>/**/auth/**') was always false → source
    // reported unavailable and the whole import-direction check was skipped
    expect(available).toBe(true);
    expect(edges.map((e) => `${e.from_module}->${e.to_module}`)).toContain('auth->billing');
  });

  it('scans a single-file module path entry (file entries no longer expand to <file>/**)', () => {
    const FILE_MAP: ModuleMap = {
      modules: [
        { name: 'entry', paths: ['src/lib/entry.ts'], keywords: [], relationships: { depends_on: [] } },
        { name: 'types', paths: ['src/types'], keywords: [], relationships: { depends_on: [] } },
      ],
    };
    write('src/lib/entry.ts', "import { X } from '../types/x.js';\n");
    write('src/types/x.ts', '');
    const { available, edges } = collectImportEdges(tmpDir, FILE_MAP);
    // Before the fix importScanPattern turned 'src/lib/entry.ts' into
    // 'src/lib/entry.ts/**/*.ext' → 0 files → this edge was silently missed and
    // a file-only module reported unavailable (skipped).
    expect(available).toBe(true);
    expect(edges.map((e) => `${e.from_module}->${e.to_module}`)).toContain('entry->types');
  });

  it('does not scan a non-source file path entry (no spurious edge from its text)', () => {
    const DOC_MAP: ModuleMap = {
      modules: [
        { name: 'alpha', paths: ['src/alpha/notes.md'], keywords: [], relationships: { depends_on: [] } },
        { name: 'beta', paths: ['src/beta'], keywords: [], relationships: { depends_on: [] } },
      ],
    };
    // A non-source file must not be import-scanned at all. The bare import line
    // resolves to src/beta/x — a real cross-module target — so pre-fix (which read
    // the .md verbatim) emitted a spurious alpha->beta. (Unfenced on purpose: a
    // ```ts fence is already blanked by the template-literal stripper.)
    write('src/alpha/notes.md', "Usage example:\nimport { x } from '../beta/x.js';\n");
    write('src/beta/x.ts', '');
    const { edges } = collectImportEdges(tmpDir, DOC_MAP);
    expect(edges.map((e) => `${e.from_module}->${e.to_module}`)).not.toContain('alpha->beta');
  });

  it('honors the explicit dir-glob form (`src/x/**`) so existing glob paths keep working', () => {
    const GLOB_MAP: ModuleMap = {
      modules: [
        { name: 'services', paths: ['src/services/**'], keywords: [], relationships: { depends_on: ['types'] } },
        { name: 'types', paths: ['src/types/**'], keywords: [], relationships: { depends_on: [] } },
      ],
    };
    write('src/services/a.ts', "import { X } from '../types/x.js';\n");
    write('src/types/x.ts', '');
    const { available, edges } = collectImportEdges(tmpDir, GLOB_MAP);
    expect(available).toBe(true);
    expect(edges.map((e) => `${e.from_module}->${e.to_module}`)).toContain('services->types');
  });
});

describe('collectGitTimestamps', () => {
  it('reports unavailable outside a git work tree', () => {
    const r = collectGitTimestamps(tmpDir, MODULE_MAP, 'knowledge');
    expect(r.available).toBe(false);
    expect(r.reason).toContain('not a git repository');
  });

  it('returns per-module commit timestamps inside a git repo', () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/types/x.ts', 'export const a = 1;\n');
    write('knowledge/modules/types/README.md', '# types\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');

    const r = collectGitTimestamps(tmpDir, MODULE_MAP, 'knowledge');
    expect(r.available).toBe(true);
    const types = r.modules.find((m) => m.name === 'types');
    expect(types?.readme_exists).toBe(true);
    expect(types?.last_src_commit).toBeTruthy();
    expect(types?.last_readme_commit).toBeTruthy();
    const services = r.modules.find((m) => m.name === 'services');
    expect(services?.readme_exists).toBe(false);
    expect(services?.last_readme_commit).toBeNull();
    expect(services?.last_src_commit).toBeNull();
  });

  it('degrades a shallow clone to unavailable instead of fabricating staleness (REQ-LIB-015)', () => {
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
    const originDir = path.join(tmpDir, 'origin');
    mkdirSync(originDir, { recursive: true });
    git(originDir, 'init', '-q');
    git(originDir, 'config', 'user.email', 'test@test.dev');
    git(originDir, 'config', 'user.name', 'test');
    writeFileSync(path.join(originDir, 'a.txt'), '1');
    git(originDir, 'add', '.');
    git(originDir, 'commit', '-q', '-m', 'one');
    writeFileSync(path.join(originDir, 'b.txt'), '2');
    git(originDir, 'add', '.');
    git(originDir, 'commit', '-q', '-m', 'two');

    const cloneDir = path.join(tmpDir, 'shallow');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${originDir}`, cloneDir], {
      stdio: 'pipe',
    });
    const r = collectGitTimestamps(cloneDir, MODULE_MAP, 'knowledge');
    expect(r.available).toBe(false);
    expect(r.reason).toContain('shallow');
    // A real `git clone` is the heaviest op in the suite (it completes, it does not
    // hang) — covered by this file's timeout, declared once at the top.
  });
});

describe('collectTaskStates', () => {
  it('reports unavailable when .prospec/changes is missing', () => {
    const r = collectTaskStates(tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('source unavailable');
  });

  it('parses checkbox state and the frozen kind markers', () => {
    write(
      '.prospec/changes/my-change/tasks.md',
      [
        '- [x] T1 implement schema ~10 lines',
        '- [ ] T2 [P] build collector ~20 lines',
        '- [ ] T3 [M] run agent sync ~5 lines',
        '- [x] T4 [P] [V] mutation-verify ~5 lines',
        'not a task line',
      ].join('\n'),
    );
    const r = collectTaskStates(tmpDir);
    expect(r.available).toBe(true);
    expect(r.changes).toHaveLength(1);
    const tasks = r.changes[0]!.tasks;
    expect(tasks.map((t) => [t.checked, t.kind])).toEqual([
      [true, 'code'],
      [false, 'code'],
      [false, 'manual'],
      [true, 'verification'],
    ]);
    expect(tasks[1]?.line).toBe(2);
  });
});

describe('computeChangeDigest', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
  const initRepo = () => {
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/lib/x.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  };

  it('returns null outside a git work tree', () => {
    expect(computeChangeDigest(tmpDir)).toBeNull();
  });

  it('is stable for an unchanged tree but changes when tracked code changes', () => {
    initRepo();
    const d0 = computeChangeDigest(tmpDir);
    expect(d0).toBeTruthy();
    expect(computeChangeDigest(tmpDir)).toBe(d0);
    write('src/lib/x.ts', 'export const a = 2;\n'); // uncommitted code edit
    expect(computeChangeDigest(tmpDir)).not.toBe(d0);
  });

  it('folds in untracked code files', () => {
    initRepo();
    const d0 = computeChangeDigest(tmpDir);
    write('src/lib/new.ts', 'export const b = 3;\n');
    expect(computeChangeDigest(tmpDir)).not.toBe(d0);
  });

  it('ignores workflow-owned + generated files so --record-review / status / agent-sync never self-trip', () => {
    initRepo();
    const d0 = computeChangeDigest(tmpDir);
    write('.prospec/changes/c1/metadata.yaml', 'status: implemented\n');
    write('.claude/skills/prospec-x/SKILL.md', 'generated\n');
    write('.agents/skills/prospec-x/SKILL.md', 'generated\n');
    write('pnpm-lock.yaml', 'lockfile\n');
    expect(computeChangeDigest(tmpDir)).toBe(d0);
  });

  // Derived from the filename CONSTANTS, not hand-listed: the hand-enumerated
  // version of this guard silently stopped covering the artifact set when a new
  // report was added, which is exactly how the self-trip hole reopened.
  it.each([DRIFT_REPORT_FILENAME, ESCAPED_DEFECT_REPORT_FILENAME])(
    'never self-trips on the check-written report %s',
    (reportFile) => {
      initRepo();
      const d0 = computeChangeDigest(tmpDir);
      write(reportFile, '{"generated_at":"now"}\n');
      expect(computeChangeDigest(tmpDir)).toBe(d0);
    },
  );

  it('returns null (honest skip) rather than a constant when the diff cannot be captured', () => {
    initRepo();
    // A capture failure must never collapse into a fixed digest — that would
    // certify stale code as current for every provenance gate at once.
    const outsideRepo = mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'));
    try {
      expect(computeChangeDigest(outsideRepo)).toBeNull();
    } finally {
      rmSync(outsideRepo, { recursive: true, force: true });
    }
  });

  // The test above never reaches the capture-failure branch — a dir outside any
  // repo exits at the isGitWorkTree guard, so reverting the fail-closed fix back
  // to `?? ''` kept the whole suite green (issue #103). An unborn-HEAD repo IS a
  // work tree, but `git diff HEAD` fails on real git — this is that branch.
  it('returns null via the capture-failure branch on an unborn-HEAD repo', () => {
    git('init', '-q');
    write('src/lib/x.ts', 'export const a = 1;\n'); // a constant digest would hash this
    expect(computeChangeDigest(tmpDir)).toBeNull();
  });

  it('flips when first-party code OUTSIDE src/tests changes (e.g. scripts/) — no fail-open', () => {
    initRepo();
    write('scripts/counts/x.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'add script');
    const d0 = computeChangeDigest(tmpDir);
    write('scripts/counts/x.ts', 'export const a = 2;\n'); // edited after "review"
    expect(computeChangeDigest(tmpDir)).not.toBe(d0);
  });

  it('flips when reviewed docs change (fails closed — docs are part of the reviewed diff)', () => {
    initRepo();
    write('prospec/ai-knowledge/_playbook.md', '# doc v1\n');
    git('add', '.');
    git('commit', '-q', '-m', 'add doc');
    const d0 = computeChangeDigest(tmpDir);
    write('prospec/ai-knowledge/_playbook.md', '# doc v2\n');
    expect(computeChangeDigest(tmpDir)).not.toBe(d0);
  });
});

describe('collectReviewProvenance', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
  const initRepo = () => {
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/lib/x.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  };

  it('reports unavailable outside a git work tree', () => {
    const r = collectReviewProvenance(tmpDir, computeChangeDigest(tmpDir));
    expect(r.available).toBe(false);
    expect(r.reason).toContain('not a git repository');
  });

  it('reports unavailable when .prospec/changes is missing', () => {
    initRepo();
    const r = collectReviewProvenance(tmpDir, computeChangeDigest(tmpDir));
    expect(r.available).toBe(false);
    expect(r.reason).toContain('.prospec/changes');
  });

  it('reads status/scale and the recorded digest per change, with one current digest', () => {
    initRepo();
    write(
      '.prospec/changes/c1/metadata.yaml',
      'name: c1\nstatus: implemented\nscale: standard\nreview_provenance:\n  digest: ABC\n  date: "2026-07-04"\n',
    );
    write('.prospec/changes/c2/metadata.yaml', 'name: c2\nstatus: tasks\nscale: full\n');
    const r = collectReviewProvenance(tmpDir, computeChangeDigest(tmpDir));
    expect(r.available).toBe(true);
    expect(r.current_digest).toBeTruthy();
    expect(r.changes.find((c) => c.name === 'c1')).toMatchObject({
      status: 'implemented',
      scale: 'standard',
      recorded_digest: 'ABC',
    });
    expect(r.changes.find((c) => c.name === 'c2')).toMatchObject({
      status: 'tasks',
      recorded_digest: null,
    });
  });

  it('reports whether backfill-draft.md proves a backfill (drives the exemption)', () => {
    initRepo();
    write('.prospec/changes/proven/metadata.yaml', 'name: proven\nstatus: implemented\nscale: backfill\n');
    write('.prospec/changes/proven/backfill-draft.md', '# draft\n');
    write('.prospec/changes/claimed/metadata.yaml', 'name: claimed\nstatus: implemented\nscale: backfill\n');
    const r = collectReviewProvenance(tmpDir, computeChangeDigest(tmpDir));
    expect(r.changes.find((c) => c.name === 'proven')).toMatchObject({ backfill_draft_present: true });
    expect(r.changes.find((c) => c.name === 'claimed')).toMatchObject({ backfill_draft_present: false });
  });
});

describe('collectMetadataCompleteness', () => {
  it('reports unavailable when .prospec/changes is missing', () => {
    const r = collectMetadataCompleteness(tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('.prospec/changes');
  });

  it('reports a complete in-progress change with no missing fields or grade need', () => {
    write(
      '.prospec/changes/c1/metadata.yaml',
      'name: c1\ncreated_at: "2026-07-05"\nstatus: implemented\nscale: full\n',
    );
    const r = collectMetadataCompleteness(tmpDir);
    expect(r.available).toBe(true);
    expect(r.changes.find((c) => c.name === 'c1')).toMatchObject({
      status: 'implemented',
      missing_fields: [],
      missing_verify_grade: false,
    });
  });

  it('flags the required fields absent from a stub metadata (name/created_at)', () => {
    write('.prospec/changes/c2/metadata.yaml', 'status: implemented\nscale: quick\n');
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c2');
    expect(c?.missing_fields).toEqual(['name', 'created_at']);
  });

  it('flags a verified change with no /prospec-verify S/A grade in quality_log', () => {
    write(
      '.prospec/changes/c3/metadata.yaml',
      'name: c3\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-review\n    date: "2026-07-05"\n    result: PASS\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c3');
    expect(c?.missing_fields).toEqual([]);
    expect(c?.missing_verify_grade).toBe(true);
  });

  it('accepts a verified change carrying an S/A verify grade', () => {
    write(
      '.prospec/changes/c4/metadata.yaml',
      'name: c4\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: A\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c4');
    expect(c?.missing_verify_grade).toBe(false);
  });

  // Same trim rule as readGateResults: these rows come off raw YAML (no schema),
  // and an exact match on `"A "` would FAIL a genuinely verified change —
  // a wrong FAIL-class verdict from whitespace (#103 review, PB-007 sweep).
  it('accepts an S/A grade carrying stray whitespace (trimmed like every quality_log consumer)', () => {
    write(
      '.prospec/changes/c4w/metadata.yaml',
      'name: c4w\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: "A "\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c4w');
    expect(c?.missing_verify_grade).toBe(false);
  });

  it('treats unparseable metadata as fully incomplete (never silently skipped)', () => {
    write('.prospec/changes/c5/metadata.yaml', ':\n  - not: [valid\n');
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c5');
    expect(c?.missing_fields).toEqual(['name', 'created_at', 'status', 'scale']);
  });

  it('treats empty / comment-only / null metadata as fully incomplete, never a crash', () => {
    // parseYaml returns null (does NOT throw) for these — a truncated/blank file
    // must be reported fully-incomplete, not dereference null and abort the run.
    write('.prospec/changes/c6/metadata.yaml', '');
    write('.prospec/changes/c7/metadata.yaml', '# just a comment\n');
    write('.prospec/changes/c8/metadata.yaml', 'null\n');
    const r = collectMetadataCompleteness(tmpDir);
    expect(r.available).toBe(true);
    for (const name of ['c6', 'c7', 'c8']) {
      expect(r.changes.find((x) => x.name === name)?.missing_fields).toEqual([
        'name',
        'created_at',
        'status',
        'scale',
      ]);
    }
  });

  it('flags a present-but-empty required field (not only an absent one)', () => {
    write(
      '.prospec/changes/c9/metadata.yaml',
      'name: ""\ncreated_at: "   "\nstatus: implemented\nscale: full\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c9');
    expect(c?.missing_fields).toEqual(['name', 'created_at']);
  });

  it('a verified change with a non-S/A verify grade still lacks the grade (S/A clause pinned)', () => {
    write(
      '.prospec/changes/c10/metadata.yaml',
      'name: c10\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: B\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c10');
    expect(c?.missing_verify_grade).toBe(true);
  });

  it('only a prospec-verify entry satisfies the grade — a review entry graded A does not (skill clause pinned)', () => {
    write(
      '.prospec/changes/c11/metadata.yaml',
      'name: c11\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-review\n    date: "2026-07-05"\n    result: A\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c11');
    expect(c?.missing_verify_grade).toBe(true);
  });

  it('accepts a verified change graded via the structured grade field (result stays PASS)', () => {
    write(
      '.prospec/changes/c12/metadata.yaml',
      'name: c12\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c12');
    expect(c?.missing_verify_grade).toBe(false);
  });

  it('a structured grade of B does not satisfy the S/A gate', () => {
    write(
      '.prospec/changes/c13/metadata.yaml',
      'name: c13\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: WARN\n    grade: B\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c13');
    expect(c?.missing_verify_grade).toBe(true);
  });

  it('still accepts the legacy shape where the grade lived in result (pre-#61 back-compat)', () => {
    // c4 above already exercises result: A; this pins the fallback stays alive
    // alongside the new grade field so archived metadata never regresses.
    write(
      '.prospec/changes/c14/metadata.yaml',
      'name: c14\ncreated_at: "2026-07-05"\nstatus: archived\nscale: standard\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: S\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c14');
    expect(c?.missing_verify_grade).toBe(false);
  });
});

describe('moduleAttributor', () => {
  it('attributes by longest path prefix and returns null outside all modules', () => {
    const attribute = moduleAttributor({
      modules: [
        { name: 'a', paths: ['src'], keywords: [] },
        { name: 'b', paths: ['src/deep'], keywords: [] },
      ],
    });
    expect(attribute('src/file.ts')).toBe('a');
    expect(attribute('src/deep/file.ts')).toBe('b');
    expect(attribute('other/file.ts')).toBeNull();
  });

  it('attributes a domain glob path by directory segment', () => {
    const attribute = moduleAttributor({
      modules: [{ name: 'auth', paths: ['**/auth/**'], keywords: [] }],
    });
    expect(attribute('src/features/auth/login.ts')).toBe('auth');
    expect(attribute('src/features/billing/rate.ts')).toBeNull();
  });

  it('still lets a literal prefix outrank a glob for the same file', () => {
    const attribute = moduleAttributor({
      modules: [
        { name: 'glob', paths: ['**/services/**'], keywords: [] },
        { name: 'literal', paths: ['src/services'], keywords: [] },
      ],
    });
    expect(attribute('src/services/a.ts')).toBe('literal');
  });
});

describe('collectFeatureMapGovernance', () => {
  const KMAP: ModuleMap = {
    modules: [
      { name: 'lib', paths: ['src/lib'], keywords: [] },
      { name: 'types', paths: ['src/types'], keywords: [] },
    ],
  };
  const featuresDir = () => path.join(tmpDir, 'prospec/specs/features');
  const knowledgePath = () => path.join(tmpDir, 'prospec/ai-knowledge');
  const writeMap = (yaml: string) => write('prospec/ai-knowledge/feature-map.yaml', yaml);

  it('reports unavailable when feature-map.yaml is absent (optional index → checks skip)', () => {
    write('prospec/specs/features/alpha.md', '#### REQ-LIB-001: X\n');
    const r = collectFeatureMapGovernance(featuresDir(), knowledgePath(), tmpDir, KMAP);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('feature-map.yaml not present');
    expect(r.specs).toEqual([]);
  });

  it('groups active REQ headings by feature slug and exposes module names (deprecated excluded)', () => {
    writeMap('features:\n  - feature: alpha\n    modules: [lib, types]\n    req_prefixes: [DOM]\n    status: active\n');
    write('prospec/specs/features/alpha.md', '#### REQ-LIB-001: A\n\n#### REQ-DOM-002: B\n\n#### ~~REQ-OLD-003: gone~~\n');
    const r = collectFeatureMapGovernance(featuresDir(), knowledgePath(), tmpDir, KMAP);
    expect(r.available).toBe(true);
    expect(r.moduleNames).toEqual(['lib', 'types']);
    const alpha = r.specs.find((s) => s.feature === 'alpha');
    // deprecated ~~REQ-OLD-003~~ is excluded — governance reads the live spec surface
    expect(alpha?.reqs.map((q) => q.prefix)).toEqual(['LIB', 'DOM']);
    expect(alpha?.reqs[0]).toMatchObject({ id: 'REQ-LIB-001', prefix: 'LIB', line: 1 });
    expect(r.featureMap.features[0]?.feature).toBe('alpha');
  });

  it('fails loud on a present-but-invalid feature-map (never half-parsed governance)', () => {
    writeMap('features:\n  - feature: alpha\n    status: bogus\n');
    write('prospec/specs/features/alpha.md', '#### REQ-LIB-001: A\n');
    expect(() => collectFeatureMapGovernance(featuresDir(), knowledgePath(), tmpDir, KMAP)).toThrow();
  });

  it('drops feature-map entries whose slug is not a safe resource name', () => {
    writeMap(
      'features:\n  - feature: "../evil"\n    modules: [lib]\n    status: active\n' +
        '  - feature: alpha\n    modules: [lib]\n    status: active\n',
    );
    write('prospec/specs/features/alpha.md', '#### REQ-LIB-001: A\n');
    const r = collectFeatureMapGovernance(featuresDir(), knowledgePath(), tmpDir, KMAP);
    expect(r.featureMap.features.map((f) => f.feature)).toEqual(['alpha']);
  });
});

describe('collectMcpReadmeCounts', () => {
  const SMAP: ModuleMap = { modules: [{ name: 'services', paths: ['src/services'], keywords: [] }] };
  const knowledgePath = () => path.join(tmpDir, 'prospec/ai-knowledge');
  const writeReadme = (body: string) =>
    write('prospec/ai-knowledge/modules/services/README.md', body);

  it('matches a declared resources+tools count against the named source file', () => {
    writeReadme(
      '# services\n\n| `src/services/mcp.service.ts` | registers 2 resources + 1 tools (per-request) |\n',
    );
    write(
      'src/services/mcp.service.ts',
      'export function build(s) {\n  s.registerResource("a");\n  s.registerResource("b");\n  s.registerTool("t1");\n}\n',
    );
    const r = collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP);
    expect(r.available).toBe(true);
    expect(r.claims).toEqual([
      {
        module: 'services',
        readme_path: 'prospec/ai-knowledge/modules/services/README.md',
        line: 3,
        noun: 'resources',
        source_path: 'src/services/mcp.service.ts',
        claimed: 2,
        actual: 2,
      },
      {
        module: 'services',
        readme_path: 'prospec/ai-knowledge/modules/services/README.md',
        line: 3,
        noun: 'tools',
        source_path: 'src/services/mcp.service.ts',
        claimed: 1,
        actual: 1,
      },
    ]);
  });

  it('surfaces a drifted count as claimed≠actual (e.g. README 6, code 8)', () => {
    writeReadme('| `src/services/mcp.service.ts` | registers 6 resources |\n');
    write(
      'src/services/mcp.service.ts',
      Array.from({ length: 8 }, (_, i) => `s.registerResource("r${i}");`).join('\n'),
    );
    const r = collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP);
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]).toMatchObject({ noun: 'resources', claimed: 6, actual: 8 });
  });

  it('does not count a commented-out call', () => {
    writeReadme('| `src/services/mcp.service.ts` | registers 1 resources |\n');
    write(
      'src/services/mcp.service.ts',
      's.registerResource("real");\n// s.registerResource("commented");\n/* s.registerResource("block"); */\n',
    );
    const r = collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP);
    expect(r.claims[0]).toMatchObject({ claimed: 1, actual: 1 });
  });

  it('produces no claim when the README has no count prose', () => {
    writeReadme('# services\n\n| `src/services/mcp.service.ts` | the MCP server |\n');
    write('src/services/mcp.service.ts', 's.registerResource("a");\n');
    expect(collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP).claims).toEqual([]);
  });

  it('produces no claim when the named source file is absent (file-paths owns broken links)', () => {
    writeReadme('| `src/services/mcp.service.ts` | registers 3 resources |\n');
    expect(collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP).claims).toEqual([]);
  });

  it('skips a module whose README is absent', () => {
    write('src/services/mcp.service.ts', 's.registerResource("a");\n');
    expect(collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP).claims).toEqual([]);
  });

  it('counts calls correctly when a string literal contains // or a register token (string-aware)', () => {
    writeReadme('| `src/services/mcp.service.ts` | registers 2 resources |\n');
    write(
      'src/services/mcp.service.ts',
      's.registerResource("spec://a"); s.registerResource("b");\n' +
        'const u = "x // registerResource(";\n',
    );
    // the `//` inside "spec://a" must not truncate the line (both calls count);
    // the register token embedded in a string must not count
    expect(collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP).claims[0]).toMatchObject({
      claimed: 2,
      actual: 2,
    });
  });

  it('ignores a count claim inside a fenced code block (illustrative, not live)', () => {
    writeReadme(
      '# services\n\n```\n| `src/services/mcp.service.ts` | registers 99 resources |\n```\n\n' +
        '| `src/services/mcp.service.ts` | registers 1 resources |\n',
    );
    write('src/services/mcp.service.ts', 's.registerResource("a");\n');
    const r = collectMcpReadmeCounts(tmpDir, knowledgePath(), SMAP);
    // only the live (non-fenced) claim is parsed; the fenced "99" is ignored
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]).toMatchObject({ claimed: 1, actual: 1 });
  });
});

describe('collectTestProvenance (REQ-LIB-033)', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
  const initRepo = () => {
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/lib/x.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  };

  it('reports unavailable outside a git work tree', () => {
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir));
    expect(r.available).toBe(false);
    expect(r.reason).toContain('not a git repository');
    expect(r.current_digest).toBeNull();
  });

  it('reports unavailable when .prospec/changes is missing', () => {
    initRepo();
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir));
    expect(r.available).toBe(false);
    expect(r.reason).toContain('.prospec/changes');
  });

  it('reads the recorded command, exit code and digest per change', () => {
    initRepo();
    write(
      '.prospec/changes/c1/metadata.yaml',
      'name: c1\nstatus: implemented\nscale: standard\ntest_provenance:\n' +
        '  command: pnpm test\n  exit_code: 0\n  digest: ABC\n  date: "2026-07-28"\n',
    );
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir));
    expect(r.available).toBe(true);
    expect(r.current_digest).toBeTruthy();
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({
      name: 'c1',
      status: 'implemented',
      scale: 'standard',
      recorded_digest: 'ABC',
      recorded_exit_code: 0,
      recorded_command: 'pnpm test',
    });
  });

  it('reports a change with no test_provenance as never recorded', () => {
    initRepo();
    write('.prospec/changes/c2/metadata.yaml', 'name: c2\nstatus: implemented\nscale: standard\n');
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir));
    expect(r.changes[0]).toMatchObject({ recorded_digest: null, recorded_exit_code: null, recorded_command: '' });
  });

  // Wiring proof for the Windows shim path: unresolvability is a fact about THIS
  // machine, not about the recorded runs — the source stays available (changes are
  // enumerated so recorded failures survive) and the reason lands in the dedicated
  // field for the evaluator's honest skip. #103 must-fix 1: the old early-return
  // (available: false, changes: []) suppressed recorded non-zero exits.
  it('keeps enumerating when the test command is a Windows shim (platform-injected)', () => {
    initRepo();
    write('.prospec/changes/c1/metadata.yaml', 'name: c1\nstatus: implemented\nscale: standard\n');
    const winProbe = {
      platform: 'win32',
      pathDirs: ['C:\\tools\\bin'],
      cwd: null,
      exists: (c: string) => c === 'C:\\tools\\bin\\pnpm.cmd',
    };
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir), winProbe);
    expect(r.available).toBe(true);
    expect(r.command_unavailable_reason).toContain('Windows shim');
    expect(r.command_unavailable_reason).toContain('tech_stack.test_command');
    expect(r.changes).toHaveLength(1);
  });

  it('enumerates recorded facts when no test command is configured at all', () => {
    initRepo();
    write(
      '.prospec/changes/c1/metadata.yaml',
      'name: c1\nstatus: implemented\nscale: standard\ntest_provenance:\n' +
        '  command: pnpm test\n  exit_code: 1\n  digest: ABC\n  date: "2026-07-28"\n',
    );
    const r = collectTestProvenance(tmpDir, null, computeChangeDigest(tmpDir));
    expect(r.available).toBe(true);
    expect(r.command_unavailable_reason).toContain('no test command configured');
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ recorded_exit_code: 1 });
  });

  it('stays available with no unavailability reason when the command is spawnable', () => {
    initRepo();
    write('.prospec/changes/c1/metadata.yaml', 'name: c1\nstatus: implemented\nscale: standard\n');
    const posixProbe = {
      platform: 'linux',
      pathDirs: ['/usr/bin'],
      cwd: null,
      exists: () => false,
    };
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir), posixProbe);
    expect(r.available).toBe(true);
    expect(r.command_unavailable_reason).toBeNull();
    expect(r.changes).toHaveLength(1);
  });

  it('skips a change whose metadata is unparseable rather than fabricating a record', () => {
    initRepo();
    write('.prospec/changes/bad/metadata.yaml', 'name: [unclosed\n');
    const r = collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir));
    expect(r.available).toBe(true);
    expect(r.changes).toHaveLength(0);
  });
});

describe('collectConstitutionRules (REQ-LIB-032)', () => {
  it('reports unavailable with the path when the Constitution is missing', () => {
    const r = collectConstitutionRules(path.join(tmpDir, 'prospec/CONSTITUTION.md'), tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('not found');
    expect(r.source_path).toBe('prospec/CONSTITUTION.md');
    expect(r.rules).toEqual([]);
  });

  it('reports unavailable (distinct reason) when the file declares no principles', () => {
    write('prospec/CONSTITUTION.md', '# C\n\n## Constraints\n\n- [x] nothing\n');
    const r = collectConstitutionRules(path.join(tmpDir, 'prospec/CONSTITUTION.md'), tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('declares no principles');
  });

  it('returns the parsed inventory with a repo-relative source path', () => {
    write(
      'prospec/CONSTITUTION.md',
      '# C\n\n## Principles\n\n### [MUST] A\n\n**Verify**: x.\n\n### B\n\nprose\n',
    );
    const r = collectConstitutionRules(path.join(tmpDir, 'prospec/CONSTITUTION.md'), tmpDir);
    expect(r.available).toBe(true);
    expect(r.source_path).toBe('prospec/CONSTITUTION.md');
    expect(r.rules.map((x) => [x.name, x.severity])).toEqual([['A', 'MUST'], ['B', null]]);
  });
});

describe('collectQualityLedger (REQ-LIB-034)', () => {
  it('reports unavailable when neither ledger directory exists', () => {
    const r = collectQualityLedger(tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toContain('.prospec/archive');
    expect(r.archive_available).toBe(false);
  });

  it('collects both ledgers, keeping the dated archive dir alongside the canonical name', () => {
    write(
      '.prospec/changes/live/metadata.yaml',
      'name: live\nstatus: implemented\nintroduced_by: old-change\n',
    );
    write(
      '.prospec/archive/2026-07-05-old-change/metadata.yaml',
      'name: old-change\nstatus: archived\nquality_log:\n' +
        '  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n',
    );
    const r = collectQualityLedger(tmpDir);
    expect(r.available).toBe(true);
    expect(r.archive_available).toBe(true);
    expect(r.changes).toEqual([
      {
        name: 'live',
        dir: 'live',
        ledger: 'changes',
        status: 'implemented',
        introduced_by: 'old-change',
        gate_results: [],
      },
      {
        name: 'old-change',
        dir: '2026-07-05-old-change',
        ledger: 'archive',
        status: 'archived',
        introduced_by: null,
        gate_results: [{ skill: 'prospec-verify', result: 'PASS' }],
      },
    ]);
  });

  it('falls back to the directory name when metadata declares no name', () => {
    write('.prospec/changes/nameless/metadata.yaml', 'status: tasks\n');
    const r = collectQualityLedger(tmpDir);
    expect(r.changes[0]).toMatchObject({ name: 'nameless', dir: 'nameless' });
  });

  it('flags an absent archive ledger instead of silently reporting a partial sample', () => {
    write('.prospec/changes/live/metadata.yaml', 'name: live\nstatus: tasks\n');
    const r = collectQualityLedger(tmpDir);
    expect(r.available).toBe(true);
    expect(r.archive_available).toBe(false);
  });

  it('drops malformed quality_log entries rather than inventing a gate record', () => {
    write(
      '.prospec/changes/c/metadata.yaml',
      'name: c\nstatus: tasks\nquality_log:\n  - skill: prospec-plan\n    result: PASS\n  - date: "2026-07-01"\n  - null\n',
    );
    const r = collectQualityLedger(tmpDir);
    expect(r.changes[0]?.gate_results).toEqual([{ skill: 'prospec-plan', result: 'PASS' }]);
  });

  // `skill` was already trimmed; `result` was not — a `'PASS '` record neither
  // entered the gate's denominator nor gates_passed, silently vanishing from the
  // escape stats (issue #103).
  it('trims result the same way it trims skill', () => {
    write(
      '.prospec/changes/c/metadata.yaml',
      'name: c\nstatus: tasks\nquality_log:\n  - skill: prospec-plan\n    result: "PASS "\n',
    );
    const r = collectQualityLedger(tmpDir);
    expect(r.changes[0]?.gate_results).toEqual([{ skill: 'prospec-plan', result: 'PASS' }]);
  });
});
