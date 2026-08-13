import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, chmodSync } from 'node:fs';
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
  collectSpecCounters,
  collectReqReferences,
  collectArtifactLanguage,
  collectConstitutionRules,
  scriptGapReason,
  scriptPatternFor,
  collectQualityLedger,
  collectDeltaSpecProvenance,
  collectReviewProvenance,
  collectTaskStates,
  collectTestProvenance,
  computeChangeDigest,
  computeDeltaSpecDigest,
  collectBudgetOverrides,
  moduleAttributor,
  collectCanonicalDocDrift,
} from '../../../src/lib/drift-sources.js';
import { evaluateKnowledgeHealth, evaluateReqReferences } from '../../../src/lib/drift-checker.js';
import { BUNDLED_TEMPLATES_SOURCE } from '../../../src/lib/generated-artifacts.js';
import { DRIFT_REPORT_FILENAME } from '../../../src/types/drift-report.js';
import { ESCAPED_DEFECT_REPORT_FILENAME } from '../../../src/types/escaped-defect.js';
import type { KnowledgeSizeBudget, ProspecConfig } from '../../../src/types/config.js';
import type { ModuleMap } from '../../../src/types/module-map.js';
import { buildInitDocContexts, renderInitDoc } from '../../../src/lib/init-docs.js';
import { CANONICAL_INIT_DOCS } from '../../../src/types/conventions.js';

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
  const BUDGET: KnowledgeSizeBudget = {
    l1_per_file: 1500,
    l2_per_module: 400,
    readme_max_lines: 100,
    spec_per_file: 800,
    demand_knowledge_per_file: 900,
    skill_per_file: 700,
    reference_per_file: 600,
    headroom: 1.0,
  };
  const baseDir = () => path.join(tmpDir, 'prospec');
  const knowledgePath = () => path.join(tmpDir, 'prospec', 'ai-knowledge');
  const collect = (additionalCore: string[] = []) =>
    collectKnowledgeSize(tmpDir, baseDir(), knowledgePath(), BUDGET, additionalCore);

  it('measures index.md + core conventions as L1 and module READMEs as L2, with repo-relative paths', () => {
    write('prospec/index.md', 'A'.repeat(40)); // 40 chars → 10 tokens, 1 line
    write('prospec/ai-knowledge/_conventions.md', 'B'.repeat(20)); // 5 tokens
    write('prospec/ai-knowledge/modules/lib/README.md', 'line1\nline2\n'); // 12 chars → 3 tokens, 2 lines
    write('prospec/ai-knowledge/modules/types/README.md', 'C'.repeat(8)); // 2 tokens

    const src = collect();
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
    const src = collect();
    expect(src.available).toBe(false);
    expect(src.reason).toContain('source unavailable');
    expect(src.items).toHaveLength(0);
  });

  it('measures each extracted sub-module sibling as L2, on the same budget as the README', () => {
    write('prospec/index.md', 'A'.repeat(40));
    write('prospec/ai-knowledge/modules/templates/README.md', 'B'.repeat(40)); // 10 tokens
    write('prospec/ai-knowledge/modules/templates/skill-authoring.md', 'C'.repeat(2000)); // 500 tokens > 400

    const src = collect();
    const byPath = new Map(src.items.map((i) => [i.source_path, i]));
    expect(byPath.get('prospec/ai-knowledge/modules/templates/README.md')).toMatchObject({
      kind: 'l2',
      tokens: 10,
    });
    expect(byPath.get('prospec/ai-knowledge/modules/templates/skill-authoring.md')).toMatchObject({
      kind: 'l2',
      tokens: 500,
    });
  });

  it('emits nothing extra for a module directory holding only a README', () => {
    write('prospec/ai-knowledge/modules/lib/README.md', 'line1\nline2\n');

    const src = collect();
    expect(src.items.filter((i) => i.kind === 'l2')).toEqual([
      {
        source_path: 'prospec/ai-knowledge/modules/lib/README.md',
        kind: 'l2',
        tokens: 3,
        lines: 2,
      },
    ]);
  });

  it('still measures a README that is a symlink inside the knowledge base (containment is the reader\'s job)', () => {
    write('prospec/ai-knowledge/_shared-readme.md', 'D'.repeat(2000)); // 500 tokens > 400
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/lib'), { recursive: true });
    symlinkSync(
      path.join('..', '..', '_shared-readme.md'),
      path.join(tmpDir, 'prospec/ai-knowledge/modules/lib/README.md'),
    );

    const src = collect();
    expect(src.items.filter((i) => i.kind === 'l2')).toEqual([
      {
        source_path: 'prospec/ai-knowledge/modules/lib/README.md',
        kind: 'l2',
        tokens: 500,
        lines: 1,
      },
    ]);
  });

  // Honest scope: on APFS/NTFS `readdirSync` already returns these names in order,
  // so this catches an ACTIVE reordering (a `.reverse()`, a different comparator) —
  // not the bare removal of `.sort()`, which only a hash-ordered filesystem would expose.
  it('emits a module\'s files in lexicographic order (README before its sub-modules)', () => {
    write('prospec/ai-knowledge/modules/templates/skill-authoring.md', 'A'.repeat(8));
    write('prospec/ai-knowledge/modules/templates/zz-last.md', 'B'.repeat(8));
    write('prospec/ai-knowledge/modules/templates/README.md', 'C'.repeat(8));

    const src = collect();
    expect(src.items.filter((i) => i.kind === 'l2').map((i) => i.source_path)).toEqual([
      'prospec/ai-knowledge/modules/templates/README.md',
      'prospec/ai-knowledge/modules/templates/skill-authoring.md',
      'prospec/ai-knowledge/modules/templates/zz-last.md',
    ]);
  });

  it('skips subdirectories, non-markdown entries and unsafe names without erroring', () => {
    write('prospec/ai-knowledge/modules/lib/README.md', 'X'.repeat(8));
    write('prospec/ai-knowledge/modules/lib/diagrams/flow.md', 'Y'.repeat(8)); // nested dir
    write('prospec/ai-knowledge/modules/lib/notes.txt', 'Z'.repeat(8)); // not markdown
    write('prospec/ai-knowledge/modules/lib/.draft.md', 'W'.repeat(8)); // rejected by isSafeResourceName

    const src = collect();
    const l2Paths = src.items.filter((i) => i.kind === 'l2').map((i) => i.source_path);
    expect(l2Paths).toEqual(['prospec/ai-knowledge/modules/lib/README.md']);
  });

  it('reads a knowledge file that passes containment but cannot be read as absent, and keeps going', () => {
    write('prospec/ai-knowledge/modules/types/README.md', 'B'.repeat(8));
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/_shared'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/lib'), { recursive: true });
    // realpath stays INSIDE the tree, so containment passes and the read itself
    // fails (EISDIR) — the one shape that used to abort the whole check run
    symlinkSync(
      path.join('..', '..', '_shared'),
      path.join(tmpDir, 'prospec/ai-knowledge/modules/lib/README.md'),
    );

    const src = collect();
    expect(src.available).toBe(true);
    expect(src.items.filter((i) => i.kind === 'l2').map((i) => i.source_path)).toEqual([
      'prospec/ai-knowledge/modules/types/README.md',
    ]);
  });

  it('reads an L1 convention that cannot be read as absent (the readContainedFile path)', () => {
    // L1 goes through drift-sources' own readContainedFile, not readModuleReadme —
    // the delegating path needs its own behavioural case, not just a source-text guard.
    write('prospec/index.md', 'A'.repeat(40));
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/_conventions.md'), { recursive: true });

    const src = collect();
    expect(src.available).toBe(true);
    expect(src.items.map((i) => i.source_path)).toEqual(['prospec/index.md']);
  });

  it('still refuses a knowledge file whose realpath escapes the tree', () => {
    write('outside/secret.md', 'S'.repeat(40));
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/lib'), { recursive: true });
    symlinkSync(
      path.join('..', '..', '..', '..', 'outside', 'secret.md'),
      path.join(tmpDir, 'prospec/ai-knowledge/modules/lib/README.md'),
    );

    const src = collect();
    expect(src.items.filter((i) => i.kind === 'l2')).toEqual([]);
  });

  it('skips a DIRECTORY named like a knowledge file instead of dying on it', () => {
    // The directory guard stops this before any reader is consulted; the reader's
    // own "unreadable → absent" rule is the second line of defence, pinned by the
    // contained-read cases above.
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/lib/README.md'), { recursive: true });
    write('prospec/ai-knowledge/modules/lib/api-surface.md', 'Y'.repeat(8));

    const src = collect();
    expect(src.items.filter((i) => i.kind === 'l2').map((i) => i.source_path)).toEqual([
      'prospec/ai-knowledge/modules/lib/api-surface.md',
    ]);
  });

  const pathsOf = (src: ReturnType<typeof collectKnowledgeSize>, kind: string): string[] =>
    src.items.filter((i) => i.kind === kind).map((i) => i.source_path);

  it('measures product.md and every Feature Spec as `spec`', () => {
    write('prospec/ai-knowledge/_conventions.md', 'A'.repeat(8));
    write('prospec/specs/product.md', 'P'.repeat(40)); // 10 tokens
    write('prospec/specs/features/sdd-workflow.md', 'S'.repeat(4000)); // 1000 tokens > 800
    write('prospec/specs/features/design-phase.md', 'D'.repeat(8));

    const src = collect();
    expect(pathsOf(src, 'spec')).toEqual([
      'prospec/specs/product.md',
      'prospec/specs/features/design-phase.md',
      'prospec/specs/features/sdd-workflow.md',
    ]);
    expect(src.items.find((i) => i.source_path === 'prospec/specs/features/sdd-workflow.md')).toMatchObject({
      kind: 'spec',
      tokens: 1000,
    });
  });

  // Without recursion, slicing an over-budget spec into `features/{feature}/` would
  // move it OUT of the budget's sight — the same way measuring only READMEs once
  // let a sub-module extraction escape the L2 budget.
  it('recurses into a sliced Feature Spec directory, grading each slice as `spec`', () => {
    write('prospec/ai-knowledge/_conventions.md', 'A'.repeat(8));
    write('prospec/specs/features/sdd-workflow.md', 'R'.repeat(8)); // routing stub
    write('prospec/specs/features/sdd-workflow/stations.md', 'X'.repeat(4000)); // 1000 tokens
    write('prospec/specs/features/sdd-workflow/gates.md', 'Y'.repeat(8));

    const src = collect();
    expect(pathsOf(src, 'spec')).toEqual([
      'prospec/specs/features/sdd-workflow.md',
      'prospec/specs/features/sdd-workflow/gates.md',
      'prospec/specs/features/sdd-workflow/stations.md',
    ]);
  });

  it('never errors when specs/ is absent', () => {
    write('prospec/ai-knowledge/_conventions.md', 'A'.repeat(8));
    const src = collect();
    expect(src.available).toBe(true);
    expect(pathsOf(src, 'spec')).toEqual([]);
  });

  // The spec walk reuses the file's ONE markdown walker, so it inherits that
  // walker's exclusions: `ARCHIVED_EXCLUDES` for archived artifacts (flat file AND
  // directory form) and fast-glob's `dot: false` for hidden ones. Each exclusion
  // gets its own fixture — asserting on one would pass with the other deleted.
  it('excludes archived and hidden artifacts from the spec walk', () => {
    write('prospec/ai-knowledge/_conventions.md', 'A'.repeat(8));
    write('prospec/specs/features/live.md', 'L'.repeat(8));
    write('prospec/specs/features/_archived-old.md', 'O'.repeat(8));
    write('prospec/specs/features/_archived-2025/superseded.md', 'S'.repeat(8));
    write('prospec/specs/features/.draft.md', 'D'.repeat(8));

    expect(pathsOf(collect(), 'spec')).toEqual([
      'prospec/specs/features/live.md',
    ]);
  });

  it('measures every load-on-demand convention as `demand-knowledge`, never as an L1 core convention', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8)); // core → L1
    write('prospec/ai-knowledge/_lessons-ledger.md', 'L'.repeat(4000)); // 1000 tokens > 900
    write('prospec/ai-knowledge/_playbook.md', 'P'.repeat(8));
    // _module-readme-conventions.md deliberately absent — a partial set is normal

    const src = collect();
    expect(pathsOf(src, 'demand-knowledge')).toEqual([
      'prospec/ai-knowledge/_lessons-ledger.md',
      'prospec/ai-knowledge/_playbook.md',
    ]);
    expect(pathsOf(src, 'l1')).not.toContain('prospec/ai-knowledge/_lessons-ledger.md');
  });

  // index.md lists an `additional_core_conventions` entry under "Core Conventions
  // (L1)". Splitting without that list here would grade it as load-on-demand — a
  // 10,000-token budget on a file its own index.md declares at 1,800 — and the L1
  // arm would never see it either, so the budget it declares could never fire.
  it('grades an additional_core_convention as l1, exactly as index.md declares it', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('prospec/ai-knowledge/_team-style.md', 'T'.repeat(8000)); // 2000 tokens
    write('prospec/ai-knowledge/_playbook.md', 'P'.repeat(8));

    const promoted = collect(['_team-style.md']);
    expect(pathsOf(promoted, 'l1')).toContain('prospec/ai-knowledge/_team-style.md');
    expect(pathsOf(promoted, 'demand-knowledge')).toEqual(['prospec/ai-knowledge/_playbook.md']);

    const notPromoted = collect();
    expect(pathsOf(notPromoted, 'l1')).not.toContain('prospec/ai-knowledge/_team-style.md');
    expect(pathsOf(notPromoted, 'demand-knowledge')).toEqual([
      'prospec/ai-knowledge/_playbook.md',
      'prospec/ai-knowledge/_team-style.md',
    ]);
  });

  // A hand-written file list here would have measured nothing for a project that
  // names its own governance file — index.md would list it as load-on-demand and
  // the budget would be blind to it. The set is derived, so this holds.
  it('measures a project-specific load-on-demand convention it was never told about', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('prospec/ai-knowledge/_house-review-rules.md', 'H'.repeat(4000)); // 1000 tokens > 900
    write('prospec/ai-knowledge/raw-scan.md', 'R'.repeat(4000)); // not `_*.md` — a scan artifact
    write('prospec/ai-knowledge/_index.md', 'I'.repeat(4000)); // legacy index, excluded by contract

    const src = collect();
    expect(pathsOf(src, 'demand-knowledge')).toEqual([
      'prospec/ai-knowledge/_house-review-rules.md',
    ]);
  });

  // The authoring gate is the whole point of US-2: a project that only CONSUMES
  // generated skills cannot act on a size finding about one, so the difference the
  // gate makes must be exactly those two kinds — not "roughly" those two.
  it('collects skill/reference kinds only in authoring mode, and nothing else changes', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('prospec/specs/features/x.md', 'X'.repeat(8));
    write('.claude/skills/prospec-verify/SKILL.md', 'V'.repeat(4000)); // 1000 tokens > 700
    write('.claude/skills/prospec-verify/references/promotion-format.md', 'R'.repeat(8));

    const consuming = collect();
    expect(consuming.items.some((i) => i.kind === 'skill' || i.kind === 'reference')).toBe(false);

    write('src/templates/skills/prospec-verify.hbs', 'template source');
    const authoring = collect();

    const key = (i: { source_path: string; kind: string }): string => `${i.kind}:${i.source_path}`;
    const added = authoring.items.filter((i) => !consuming.items.some((c) => key(c) === key(i)));
    expect(added.map(key).sort()).toEqual([
      'reference:.claude/skills/prospec-verify/references/promotion-format.md',
      'skill:.claude/skills/prospec-verify/SKILL.md',
    ]);
    expect(consuming.items.every((c) => authoring.items.some((a) => key(a) === key(c)))).toBe(true);
  });

  it('counts a skill deployed to two agent paths once, keeping the larger copy', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('src/templates/skills/prospec-verify.hbs', 'template source');
    write('.claude/skills/prospec-verify/SKILL.md', 'A'.repeat(40)); // 10 tokens
    write('.agents/skills/prospec-verify/SKILL.md', 'B'.repeat(400)); // 100 tokens — larger
    write('.claude/skills/prospec-verify/references/plan-format.md', 'C'.repeat(400)); // 100 — larger
    write('.agents/skills/prospec-verify/references/plan-format.md', 'D'.repeat(40)); // 10

    const src = collect();
    expect(src.items.filter((i) => i.kind === 'skill')).toEqual([
      { source_path: '.agents/skills/prospec-verify/SKILL.md', kind: 'skill', tokens: 100, lines: 1 },
    ]);
    expect(src.items.filter((i) => i.kind === 'reference')).toEqual([
      {
        source_path: '.claude/skills/prospec-verify/references/plan-format.md',
        kind: 'reference',
        tokens: 100,
        lines: 1,
      },
    ]);
  });

  // The whole collector is evaluated as an ARGUMENT to runChecks(...), so a throw
  // here does not cost one item — it costs all fifteen check verdicts. `scanDirSync`
  // throws ScanError on exactly these shapes, which is why the walk here does not
  // use it. `it.skipIf` on Windows: chmod 0o000 does not revoke read there, so the
  // EACCES half cannot be built; the ENOTDIR half still runs everywhere.
  it('survives a references path that is a file rather than a directory', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('src/templates/skills/x.hbs', 'template source');
    write('.claude/skills/foo/SKILL.md', 'S'.repeat(8));
    write('.claude/skills/foo/references', 'not a directory');

    const src = collect();
    expect(src.available).toBe(true);
    expect(pathsOf(src, 'skill')).toEqual(['.claude/skills/foo/SKILL.md']);
    expect(pathsOf(src, 'reference')).toEqual([]);
  });

  // Scope note: this pins the COLLECTOR, not the whole run. An unreadable directory
  // under a `markdownRoots` path still aborts `runChecks` from
  // `collectReqReferences`' own `scanDirSync` — pre-existing, tracked separately.
  //
  // The `.hbs` write is load-bearing: without it the authoring gate short-circuits
  // the entire skill arm, and the "under a skill" half of this case would be
  // unreachable — a test that cannot fail for half of what it claims.
  it.skipIf(process.platform === 'win32')(
    'survives an unreadable directory under specs/features and under a skill',
    () => {
      write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
      write('src/templates/skills/x.hbs', 'template source');
      write('prospec/specs/features/live.md', 'L'.repeat(8));
      write('.claude/skills/foo/SKILL.md', 'S'.repeat(8));
      write('.claude/skills/foo/references/ok.md', 'R'.repeat(8));
      const lockedSpec = path.join(tmpDir, 'prospec/specs/features/locked');
      const lockedRef = path.join(tmpDir, '.claude/skills/foo/references/locked');
      mkdirSync(lockedSpec, { recursive: true });
      mkdirSync(lockedRef, { recursive: true });
      chmodSync(lockedSpec, 0o000);
      chmodSync(lockedRef, 0o000);

      const src = collect();
      expect(src.available).toBe(true);
      expect(pathsOf(src, 'spec')).toEqual(['prospec/specs/features/live.md']);
      expect(pathsOf(src, 'skill')).toEqual(['.claude/skills/foo/SKILL.md']);
      expect(pathsOf(src, 'reference')).toEqual(['.claude/skills/foo/references/ok.md']);

      chmodSync(lockedSpec, 0o755);
      chmodSync(lockedRef, 0o755);
    },
  );

  // `existsSync` says yes for a FILE too, and `readdirSync` then throws ENOTDIR —
  // the same all-fifteen-verdicts outage as the references case, from the L2 arm.
  it('survives a modules path that is a file rather than a directory', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('prospec/ai-knowledge/modules', 'not a directory');

    const src = collect();
    expect(src.available).toBe(true);
    expect(pathsOf(src, 'l2')).toEqual([]);
    expect(pathsOf(src, 'l1')).toContain('prospec/ai-knowledge/_conventions.md');
  });

  // A project may legitimately symlink a whole tree (a shared specs directory, a
  // skill's references). Refusing a symlinked walk ROOT was tried and reverted:
  // it zeroed every measurement for such a project — the budget failing OPEN on a
  // normal deployment. This pins that the root IS followed.
  it.skipIf(process.platform === 'win32')(
    'measures through a symlinked walk root, so a symlinked tree is not silently unmeasured',
    () => {
      write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
      write('prospec/specs/real-features/live.md', 'L'.repeat(4000)); // 1000 tokens > 800
      symlinkSync('real-features', path.join(tmpDir, 'prospec/specs/features'));

      expect(pathsOf(collect(), 'spec')).toEqual(['prospec/specs/features/live.md']);
    },
  );

  // The replaced `scanDirSync` guaranteed `followSymbolicLinks: false`. Losing
  // that turns one `features/loop -> ..` into tens of thousands of duplicate items
  // (measured: 29,524 from a single real spec), so the walk descends into real
  // directories only — a symlinked `.md` FILE stays a candidate.
  it.skipIf(process.platform === 'win32')(
    'does not descend into a symlinked directory, so a link loop cannot multiply items',
    () => {
      write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
      write('prospec/specs/features/live.md', 'L'.repeat(8));
      write('prospec/specs/features/nested/slice.md', 'N'.repeat(8));
      symlinkSync('..', path.join(tmpDir, 'prospec/specs/features/loop'));
      symlinkSync('live.md', path.join(tmpDir, 'prospec/specs/features/aliased.md'));

      expect(pathsOf(collect(), 'spec')).toEqual([
        'prospec/specs/features/aliased.md',
        'prospec/specs/features/live.md',
        'prospec/specs/features/nested/slice.md',
      ]);
    },
  );

  // The depth guard is the backstop for a real (non-symlink) tree. Without it a
  // pathological nesting walks unbounded; with it the walk stops and the run
  // survives. 10 levels is the same bound `scanDirSync` applies.
  it('stops descending past the depth bound instead of walking unbounded', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('prospec/specs/features/shallow.md', 'S'.repeat(8));
    const deep = 'prospec/specs/features/' + Array.from({ length: 12 }, (_, i) => `d${i}`).join('/');
    write(`${deep}/buried.md`, 'B'.repeat(8));

    const specs = pathsOf(collect(), 'spec');
    expect(specs).toContain('prospec/specs/features/shallow.md');
    expect(specs).not.toContain(`${deep}/buried.md`);
  });

  // A spec is not a credential: `scanDirSync` merges SENSITIVE_PATTERNS
  // (`**/*secret*`, `**/*credential*`, `**/*.env*`, `**/*.key`, `**/*.pem`), which
  // would drop these files silently — a budget gate failing OPEN.
  it('measures a Feature Spec whose name matches a sensitive-file pattern', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('prospec/specs/features/secret-rotation.md', 'S'.repeat(4000)); // 1000 tokens > 800
    write('prospec/specs/features/credential-vault.md', 'V'.repeat(4000));
    write('prospec/specs/features/env-setup.md', 'E'.repeat(8));

    expect(pathsOf(collect(), 'spec')).toEqual([
      'prospec/specs/features/credential-vault.md',
      'prospec/specs/features/env-setup.md',
      'prospec/specs/features/secret-rotation.md',
    ]);
  });

  // Deduplication exists for the copies DEPLOYMENT makes (one skill, many agent
  // paths). Keying a reference by basename alone also merges different skills'
  // files, and the smaller of two same-named references then vanishes — it could
  // never warn, however far over budget it was.
  it('keeps same-named references from DIFFERENT skills apart', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('src/templates/skills/x.hbs', 'template source');
    write('.claude/skills/prospec-plan/references/plan-format.md', 'A'.repeat(4000)); // 1000 tokens
    write('.claude/skills/prospec-ff/references/plan-format.md', 'B'.repeat(2800)); // 700 tokens

    expect(pathsOf(collect(), 'reference')).toEqual([
      '.claude/skills/prospec-ff/references/plan-format.md',
      '.claude/skills/prospec-plan/references/plan-format.md',
    ]);
  });

  it.skipIf(process.platform === 'win32')(
    'measures a skill deployed as a symlinked directory (readdir reports it as not-a-directory)',
    () => {
      write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
      write('src/templates/skills/x.hbs', 'template source');
      write('.claude/skills/real/SKILL.md', 'R'.repeat(4000)); // 1000 tokens
      symlinkSync('real', path.join(tmpDir, '.claude/skills/aliased'));

      expect(pathsOf(collect(), 'skill')).toEqual([
        '.claude/skills/aliased/SKILL.md',
        '.claude/skills/real/SKILL.md',
      ]);
    },
  );

  it('skips a skill directory entry that is not a directory, and a missing SKILL.md', () => {
    write('prospec/ai-knowledge/_conventions.md', 'C'.repeat(8));
    write('src/templates/skills/x.hbs', 'template source');
    write('.claude/skills/README.md', 'not a skill dir'); // file, not a directory
    mkdirSync(path.join(tmpDir, '.claude/skills/half-built'), { recursive: true }); // no SKILL.md
    write('.claude/skills/real/SKILL.md', 'S'.repeat(8));

    const src = collect();
    expect(pathsOf(src, 'skill')).toEqual(['.claude/skills/real/SKILL.md']);
  });
});

describe('enumerated reads survive a pathological entry (never abort the run)', () => {
  // Each of these collectors is evaluated as an argument to runChecks(...), so a
  // throw here took all thirteen other verdicts with it. A directory wearing a
  // `.md` name is the cheapest way to make the read — not the walk — fail.
  it('collectReqDefinitions skips a directory wearing a spec filename', () => {
    write('specs/features/real.md', '#### REQ-LIB-001: Real\n');
    mkdirSync(path.join(tmpDir, 'specs/features/oops.md'), { recursive: true });
    expect(collectReqDefinitions(path.join(tmpDir, 'specs/features')).ids).toEqual(['REQ-LIB-001']);
  });

  it('collectTaskStates skips a change whose tasks.md is a directory', () => {
    write('.prospec/changes/good/tasks.md', '- [x] T1 done\n');
    mkdirSync(path.join(tmpDir, '.prospec/changes/bad/tasks.md'), { recursive: true });
    const r = collectTaskStates(tmpDir);
    expect(r.available).toBe(true);
    expect(r.changes.map((c) => c.name)).toEqual(['good']);
  });

  // These two walk their roots through the glob scanner, which sets `onlyFiles`
  // — a directory never reaches their read, so the fixture must be a real FILE
  // whose read fails. chmod(0o000) does not revoke read access on Windows, so the
  // fixture is unbuildable there and the case is POSIX-gated (its siblings above
  // cover the same skip on every platform).
  it.skipIf(process.platform === 'win32')(
    'collectMarkdownLinks and collectReqReferences skip a file they cannot read',
    () => {
      write('specs/features/real.md', '[ok](./real.md) REQ-LIB-001\n');
      write('specs/features/locked.md', '[bad](./missing.md) REQ-LIB-999\n');
      chmodSync(path.join(tmpDir, 'specs/features/locked.md'), 0o000);
      const roots = ['specs'];

      const links = collectMarkdownLinks(roots, tmpDir);
      expect(links.available).toBe(true);
      // the unreadable file's broken link is never reported — it was never read
      expect(links.links.map((l) => l.raw_target)).toEqual(['./real.md']);
      expect(collectReqReferences(roots, tmpDir).map((r) => r.id)).toEqual(['REQ-LIB-001']);
    },
  );
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

  it('indexes a heading at any level, since the shared index is level-agnostic', () => {
    write('specs/features/a.md', '# REQ-A-001: h1\n\n## REQ-A-002: h2\n\n###### REQ-A-003: h6\n');
    expect(collectReqDefinitions(path.join(tmpDir, 'specs/features')).ids).toEqual([
      'REQ-A-001',
      'REQ-A-002',
      'REQ-A-003',
    ]);
  });

  it('does not index a REQ heading shown inside a fenced example', () => {
    // The inventory now shares `indexSpec`, which masks fenced blocks: a spec
    // that DOCUMENTS the heading shape no longer declares the example as a real
    // requirement. No current spec has one, so no id set changed when this
    // collector moved onto the shared index — but a reference to the example
    // would have counted as satisfied.
    write(
      'specs/features/a.md',
      '#### REQ-A-001: Real\n\n```md\n#### REQ-A-002: only an example\n```\n',
    );
    expect(collectReqDefinitions(path.join(tmpDir, 'specs/features')).ids).toEqual(['REQ-A-001']);
  });

  it('still indexes headings past an UNCLOSED fence rather than trusting the mask', () => {
    // An open fence masks the whole tail; a collector that trusted it would call
    // every following REQ undefined and turn each reference into a dangling one.
    write('specs/features/a.md', '```md\nopen fence, never closed\n\n#### REQ-A-001: Real\n');
    expect(collectReqDefinitions(path.join(tmpDir, 'specs/features')).ids).toEqual(['REQ-A-001']);
  });

  it('indexes a REQ defined only in a features/{feature}/ slice', () => {
    write(
      'specs/features/widget.md',
      '---\nfeature: widget\n---\n\n## Slices\n\n- [Extra](./widget/extra.md)\n\n#### REQ-WIDGET-001: main\n',
    );
    write('specs/features/widget/extra.md', '#### REQ-WIDGET-050: only in a slice\n');
    expect(collectReqDefinitions(path.join(tmpDir, 'specs/features')).ids).toEqual([
      'REQ-WIDGET-001',
      'REQ-WIDGET-050',
    ]);
  });

  it('lets a reference to a slice-only REQ resolve — req-references stays PASS', () => {
    write(
      'specs/features/widget.md',
      '---\nfeature: widget\n---\n\n## Slices\n\n- [Extra](./widget/extra.md)\n',
    );
    write('specs/features/widget/extra.md', '#### REQ-WIDGET-050: only in a slice\n');
    write('knowledge/modules/lib/README.md', 'implements REQ-WIDGET-050\n');
    const defs = collectReqDefinitions(path.join(tmpDir, 'specs/features'));
    const refs = collectReqReferences(['specs', 'knowledge'], tmpDir);
    const out = evaluateReqReferences(defs, refs);
    expect(out.result.status).toBe('pass');
    expect(out.findings).toEqual([]);
  });

  it('does not throw when a ## Slices link points at a missing slice file', () => {
    write(
      'specs/features/widget.md',
      '---\nfeature: widget\n---\n\n## Slices\n\n- [Gone](./widget/gone.md)\n\n#### REQ-WIDGET-001: main\n',
    );
    expect(collectReqDefinitions(path.join(tmpDir, 'specs/features')).ids).toEqual(['REQ-WIDGET-001']);
  });
});

describe('collectSpecCounters (REQ-LIB-042)', () => {
  const featuresDir = () => path.join(tmpDir, 'specs/features');

  const spec = (over: { story?: string; req?: string; body?: string } = {}): string =>
    `---
feature: widget
status: active
last_updated: 2026-08-01
story_count: ${over.story ?? '1'}
req_count: ${over.req ?? '2'}
---

# Widget

### US-1: a story

#### REQ-WIDGET-001: one

### REQ-WIDGET-002: two at h3

## Deprecated Requirements

#### REQ-WIDGET-003: retired
${over.body ?? ''}`;

  it('reports declared vs body-derived counts, counting REQ headings at any level', () => {
    write('specs/features/widget.md', spec());
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.available).toBe(true);
    expect(r.specs).toEqual([
      {
        source_path: 'specs/features/widget.md',
        feature: 'widget',
        declared: { story_count: 1, req_count: 2 },
        actual: { story_count: 1, req_count: 2 },
      },
    ]);
  });

  it('excludes Deprecated Requirements from the body count', () => {
    write('specs/features/widget.md', spec({ req: '3' }));
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.specs[0]!.declared.req_count).toBe(3);
    expect(r.specs[0]!.actual.req_count).toBe(2);
  });

  it('reports a null declaration for a missing counter field rather than inventing zero', () => {
    write('specs/features/widget.md', '---\nfeature: widget\nstatus: active\n---\n\n#### REQ-WIDGET-001: one\n');
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.specs[0]!.declared).toEqual({ story_count: null, req_count: null });
    expect(r.specs[0]!.actual).toEqual({ story_count: 0, req_count: 1 });
  });

  it('skips archived specs and files without frontmatter', () => {
    write('specs/features/widget.md', spec());
    write('specs/features/_archived-old.md', spec());
    write('specs/features/notes.md', '# no frontmatter\n');
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.specs.map((s) => s.feature)).toEqual(['widget']);
  });

  it('is unavailable when the features directory is absent', () => {
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/not found/);
    expect(r.specs).toEqual([]);
  });

  it('is unavailable when the directory holds no spec', () => {
    mkdirSync(featuresDir(), { recursive: true });
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/no feature specs/);
  });

  // A sample of zero is not a clean bill of health: reporting `available: true`
  // with an empty list made the check PASS over nothing checked.
  it('is unavailable when specs exist but none of them parses', () => {
    write('specs/features/a.md', '# no frontmatter at all\n');
    write('specs/features/b.md', 'still no frontmatter\n');
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/could be parsed \(frontmatter missing or unreadable\)/);
    expect(r.specs).toEqual([]);
  });

  it('costs one line, not the run, when a spec cannot be read', () => {
    write('specs/features/widget.md', spec());
    mkdirSync(path.join(tmpDir, 'specs/features/oops.md'), { recursive: true });
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.available).toBe(true);
    expect(r.specs.map((s) => s.feature)).toEqual(['widget']);
  });

  it('sums main + slice story/req counts to match the archive writer', () => {
    write(
      'specs/features/widget.md',
      '---\nfeature: widget\nstatus: active\nstory_count: 2\nreq_count: 2\n---\n\n# Widget\n\n' +
        '## Slices\n\n- [Extra](./widget/extra.md)\n\n### US-1: main\n\n#### REQ-WIDGET-001: one\n',
    );
    write('specs/features/widget/extra.md', '### US-2: sliced\n\n#### REQ-WIDGET-050: two\n');
    const r = collectSpecCounters(featuresDir(), tmpDir);
    expect(r.specs[0]).toMatchObject({
      feature: 'widget',
      declared: { story_count: 2, req_count: 2 },
      actual: { story_count: 2, req_count: 2 },
    });
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
    const r = collectGitTimestamps(tmpDir, MODULE_MAP, 'knowledge', []);
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

    const r = collectGitTimestamps(tmpDir, MODULE_MAP, 'knowledge', []);
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

  it('carries the newest sub-module commit beside the README commit (REQ-LIB-015)', () => {
    const git = (args: string[], date?: string) =>
      execFileSync('git', args, {
        cwd: tmpDir,
        stdio: 'pipe',
        encoding: 'utf-8',
        env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
      });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@test.dev']);
    git(['config', 'user.name', 'test']);

    write('src/types/x.ts', 'export const a = 1;\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'src'], '2026-06-10T00:00:00+00:00');

    write('knowledge/modules/types/README.md', '# types\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'readme'], '2026-06-11T00:00:00+00:00');

    // only the sub-module moves — the module's knowledge IS newer than its source
    write('knowledge/modules/types/schemas.md', '# schemas\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'sub-module'], '2026-06-12T00:00:00+00:00');

    const r = collectGitTimestamps(tmpDir, MODULE_MAP, 'knowledge', []);
    const types = r.modules.find((m) => m.name === 'types');
    expect(types?.last_readme_commit).toContain('2026-06-11');
    expect(types?.last_sub_module_commit).toContain('2026-06-12');
  });

  it('leaves the sub-module commit null when the module has none', () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    write('src/types/x.ts', 'export const a = 1;\n');
    write('knowledge/modules/types/README.md', '# types\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');

    const r = collectGitTimestamps(tmpDir, MODULE_MAP, 'knowledge', []);
    expect(r.modules.find((m) => m.name === 'types')?.last_sub_module_commit).toBeNull();
  });

  // A module path holds authored source AND build output. Only the former is
  // knowledge a README could describe, so only the former may move
  // `last_src_commit` (REQ-LIB-015). The same file still counts for
  // `computeChangeDigest` — see the digest suite below for that boundary.
  const LIB_MAP: ModuleMap = {
    modules: [{ name: 'lib', paths: ['src/lib'], keywords: [], relationships: { depends_on: [] } }],
  };

  const commitAt = (date: string, files: Record<string, string>) => {
    for (const [rel, content] of Object.entries(files)) write(rel, content);
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-q', '-m', date], {
      cwd: tmpDir,
      stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  };

  /** authored src @06-10, README @06-11 — the caller adds the commits under test. */
  const stagedLibRepo = () => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    commitAt('2026-06-10T00:00:00+00:00', { 'src/lib/authored.ts': 'export const a = 1;\n' });
    commitAt('2026-06-11T00:00:00+00:00', { 'knowledge/modules/lib/README.md': '# lib\n' });
  };

  const libHealth = (generatedArtifacts: readonly string[] = []) =>
    evaluateKnowledgeHealth(collectGitTimestamps(tmpDir, LIB_MAP, 'knowledge', generatedArtifacts)).knowledgeHealth
      ?.modules[0];

  it('moves last_src_commit when config is empty, meaning the generated artifact is not excluded', () => {
    stagedLibRepo();
    commitAt('2026-06-12T00:00:00+00:00', {
      [BUNDLED_TEMPLATES_SOURCE]: 'export const BUNDLED_TEMPLATES = {};\n',
    });

    expect(libHealth([])?.last_src_commit).toContain('2026-06-12');
    expect(libHealth([])?.stale).toBe(true);
  });

  it('does not move last_src_commit for an explicitly configured generated artifact (REQ-LIB-015)', () => {
    stagedLibRepo();
    commitAt('2026-06-12T00:00:00+00:00', {
      [BUNDLED_TEMPLATES_SOURCE]: 'export const BUNDLED_TEMPLATES = {};\n',
    });

    expect(libHealth([BUNDLED_TEMPLATES_SOURCE])?.last_src_commit).toContain('2026-06-10');
    // The whole point: no README edit could honestly clear this WARN, so it must
    // never be raised — `pnpm bundle` regenerates the file on every `.hbs` change.
    expect(libHealth([BUNDLED_TEMPLATES_SOURCE])?.stale).toBe(false);
  });

  it('falls back to the unexcluded timestamp when a configured glob covers the whole module (REQ-LIB-039)', () => {
    stagedLibRepo();

    // A user-writable glob can now cover every file a module has. The excluded
    // query then succeeds and returns EMPTY, which — folded into null — would
    // read as "not stale" for that module forever, silently. Fail-open is the
    // one outcome this must never produce, so the answer degrades to the
    // unexcluded timestamp instead: noisier, but true.
    expect(libHealth(['src/**'])?.last_src_commit).toContain('2026-06-10');
  });

  it('still reports stale when authored source moves after the generated artifact (REQ-LIB-015)', () => {
    stagedLibRepo();
    commitAt('2026-06-12T00:00:00+00:00', {
      [BUNDLED_TEMPLATES_SOURCE]: 'export const BUNDLED_TEMPLATES = {};\n',
    });
    commitAt('2026-06-13T00:00:00+00:00', { 'src/lib/authored.ts': 'export const a = 2;\n' });

    // The exclusion buys silence for build output only — widening it to the
    // module directory would turn every real knowledge gap into a fake green.
    expect(libHealth([BUNDLED_TEMPLATES_SOURCE])?.last_src_commit).toContain('2026-06-13');
    expect(libHealth([BUNDLED_TEMPLATES_SOURCE])?.stale).toBe(true);
  });

  it('counts a commit that touches a generated artifact AND authored source (REQ-LIB-015)', () => {
    stagedLibRepo();
    commitAt('2026-06-12T00:00:00+00:00', {
      [BUNDLED_TEMPLATES_SOURCE]: 'export const BUNDLED_TEMPLATES = {};\n',
      'src/lib/authored.ts': 'export const a = 3;\n',
    });

    // Pathspec exclusion filters FILES, not commits — the usual shape of a
    // `.hbs` change is exactly this mixed commit.
    expect(libHealth([BUNDLED_TEMPLATES_SOURCE])?.last_src_commit).toContain('2026-06-12');
    expect(libHealth([BUNDLED_TEMPLATES_SOURCE])?.stale).toBe(true);
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
    const r = collectGitTimestamps(cloneDir, MODULE_MAP, 'knowledge', []);
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

// The narrow sibling of computeChangeDigest (REQ-LIB-045). It exists precisely
// because computeChangeDigest excludes `.prospec/` — so the artifact archive copies
// VERBATIM into the trust zone has no fingerprint at all. These tests pin the two
// halves that matter: it MOVES with the delta-spec, and it moves with NOTHING else.
describe('computeDeltaSpecDigest (REQ-LIB-045)', () => {
  const changeDir = () => path.join(tmpDir, '.prospec/changes/c1');

  it('returns null when the change has no delta-spec — absence is never a digest', () => {
    write('.prospec/changes/c1/metadata.yaml', 'status: implemented\n');
    expect(computeDeltaSpecDigest(changeDir())).toBeNull();
  });

  it('returns null when the change directory does not exist at all', () => {
    expect(computeDeltaSpecDigest(changeDir())).toBeNull();
  });

  it('is stable for unchanged content and flips when the delta-spec changes', () => {
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nold body\n');
    const d0 = computeDeltaSpecDigest(changeDir());
    expect(d0).toBeTruthy();
    expect(computeDeltaSpecDigest(changeDir())).toBe(d0);
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\ncorrected body\n');
    expect(computeDeltaSpecDigest(changeDir())).not.toBe(d0);
  });

  // The whole point of the narrow scope: editing code, or any other artifact in the
  // same change, must NOT move this fingerprint — otherwise it degenerates into a
  // second copy of computeChangeDigest and re-imports the cost that keeps
  // `.prospec/` excluded there.
  it('does not move when anything other than the delta-spec changes', () => {
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const d0 = computeDeltaSpecDigest(changeDir());
    write('src/lib/x.ts', 'export const a = 1;\n');
    write('.prospec/changes/c1/plan.md', 'a plan\n');
    write('.prospec/changes/c1/metadata.yaml', 'status: verified\n');
    write('.prospec/changes/c2/delta-spec.md', 'another change\n');
    expect(computeDeltaSpecDigest(changeDir())).toBe(d0);
  });

  it('is unaffected by whether the directory is a git repository', () => {
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const outsideGit = computeDeltaSpecDigest(changeDir());
    execFileSync('git', ['init', '-q'], { cwd: tmpDir, stdio: 'pipe' });
    expect(computeDeltaSpecDigest(changeDir())).toBe(outsideGit);
  });

  // PB-013 / REQ-LIB-045: an unreadable source must degrade to an honest null, not
  // to a constant that would certify a stale landing block as current. Skipped as
  // root, where chmod 000 does not deny reads.
  it.skipIf(process.getuid?.() === 0)(
    'returns null — never a constant — when the delta-spec cannot be read',
    () => {
      write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
      const readable = computeDeltaSpecDigest(changeDir());
      chmodSync(path.join(changeDir(), 'delta-spec.md'), 0o000);
      const denied = computeDeltaSpecDigest(changeDir());
      chmodSync(path.join(changeDir(), 'delta-spec.md'), 0o644);
      expect(readable).toBeTruthy();
      expect(denied).toBeNull();
    },
  );
});

describe('collectDeltaSpecProvenance (REQ-LIB-045)', () => {
  const meta = (over = '') =>
    `name: c1\ncreated_at: 2026-08-08T00:00:00Z\nstatus: implemented\nscale: full\n${over}`;

  it('is unavailable — never an empty pass — when .prospec/changes/ is absent', () => {
    const src = collectDeltaSpecProvenance(tmpDir);
    expect(src.available).toBe(false);
    expect(src.reason).toMatch(/\.prospec\/changes/);
    expect(src.changes).toEqual([]);
  });

  it('enumerates status, scale, recorded and current digest per change', () => {
    write('.prospec/changes/c1/metadata.yaml', meta('delta_spec_provenance:\n  digest: recorded-abc\n  date: 2026-08-08\n'));
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const src = collectDeltaSpecProvenance(tmpDir);
    expect(src.available).toBe(true);
    expect(src.changes).toHaveLength(1);
    const c = src.changes[0]!;
    expect(c).toMatchObject({
      name: 'c1',
      status: 'implemented',
      scale: 'full',
      recorded_digest: 'recorded-abc',
      delta_spec_present: true,
    });
    expect(c.current_digest).toBe(computeDeltaSpecDigest(path.join(tmpDir, '.prospec/changes/c1')));
    expect(c.source_path).toContain('metadata.yaml');
  });

  it('reports a never-recorded baseline as null rather than omitting the change', () => {
    write('.prospec/changes/c1/metadata.yaml', meta());
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const src = collectDeltaSpecProvenance(tmpDir);
    expect(src.changes[0]!.recorded_digest).toBeNull();
    expect(src.changes[0]!.delta_spec_present).toBe(true);
  });

  // A quick change legitimately carries no delta-spec. The source stays AVAILABLE —
  // marking the whole source unavailable for one such change would blind the gate to
  // every other change in the directory.
  it('keeps the source available and flags the change when a scale carries no delta-spec', () => {
    write('.prospec/changes/quick1/metadata.yaml', 'name: quick1\ncreated_at: 2026-08-08T00:00:00Z\nstatus: implemented\nscale: quick\n');
    write('.prospec/changes/c1/metadata.yaml', meta());
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const src = collectDeltaSpecProvenance(tmpDir);
    expect(src.available).toBe(true);
    const quick = src.changes.find((c) => c.name === 'quick1')!;
    expect(quick.delta_spec_present).toBe(false);
    expect(quick.current_digest).toBeNull();
    expect(src.changes.find((c) => c.name === 'c1')!.delta_spec_present).toBe(true);
  });

  // A proven backfill never runs review, so `--record-review` never writes it a
  // baseline. Without surfacing the draft the evaluator could only read that as
  // "absent" and make every backfill permanently unarchivable.
  it('surfaces backfill-draft.md so the evaluator can exempt a proven backfill', () => {
    write('.prospec/changes/c1/metadata.yaml', meta());
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    write('.prospec/changes/bf/metadata.yaml', 'name: bf\ncreated_at: 2026-08-08T00:00:00Z\nstatus: implemented\nscale: backfill\n');
    write('.prospec/changes/bf/delta-spec.md', '**Spec:**\nbody\n');
    write('.prospec/changes/bf/backfill-draft.md', 'draft\n');
    const src = collectDeltaSpecProvenance(tmpDir);
    expect(src.changes.find((c) => c.name === 'bf')!.backfill_draft_present).toBe(true);
    expect(src.changes.find((c) => c.name === 'c1')!.backfill_draft_present).toBe(false);
  });

  it('skips a change whose metadata does not parse — that finding belongs to metadata-completeness', () => {
    write('.prospec/changes/broken/metadata.yaml', ':::not yaml:::\n  - [\n');
    write('.prospec/changes/c1/metadata.yaml', meta());
    write('.prospec/changes/c1/delta-spec.md', '**Spec:**\nbody\n');
    const src = collectDeltaSpecProvenance(tmpDir);
    expect(src.changes.map((c) => c.name)).toEqual(['c1']);
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

  it('flips when the generated bundle changes — the digest scope is NOT the staleness scope', () => {
    initRepo();
    write(BUNDLED_TEMPLATES_SOURCE, 'export const BUNDLED_TEMPLATES = {};\n');
    git('add', '.');
    git('commit', '-q', '-m', 'add bundle');
    const d0 = computeChangeDigest(tmpDir);
    write(BUNDLED_TEMPLATES_SOURCE, 'export const BUNDLED_TEMPLATES = { a: "1" };\n');
    // The SAME file is excluded from `last_src_commit` (collectGitTimestamps
    // above) because it carries no knowledge a README could describe — but it is
    // shipped code, so editing it must keep invalidating review/test provenance.
    // The two judgments are deliberately different scopes; this pins that apart.
    expect(computeChangeDigest(tmpDir)).not.toBe(d0);
  });

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

  it('rejects a verified change if its latest verify grade is B, even if a previous verify was S', () => {
    write(
      '.prospec/changes/c15/metadata.yaml',
      'name: c15\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n' +
        '  - skill: prospec-verify\n    date: "2026-07-06"\n    result: WARN\n    grade: B\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c15');
    expect(c?.missing_verify_grade).toBe(true);
  });

  it('accepts an archived change if ANY verify grade was S/A (historical timeline-unaware fallback)', () => {
    write(
      '.prospec/changes/c16/metadata.yaml',
      'name: c16\ncreated_at: "2026-07-05"\nstatus: archived\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n' +
        '  - skill: prospec-verify\n    date: "2026-07-06"\n    result: WARN\n    grade: B\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c16');
    expect(c?.missing_verify_grade).toBe(false);
  });

  it('accepts a verified change whose only verify entry is an S grade', () => {
    write(
      '.prospec/changes/c17/metadata.yaml',
      'name: c17\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n',
    );
    const c = collectMetadataCompleteness(tmpDir).changes.find((x) => x.name === 'c17');
    expect(c?.missing_verify_grade).toBe(false);
  });

  it('rejects a verified change with an empty quality_log or no prospec-verify entries', () => {
    write(
      '.prospec/changes/c18/metadata.yaml',
      'name: c18\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\nquality_log: []\n',
    );
    write(
      '.prospec/changes/c19/metadata.yaml',
      'name: c19\ncreated_at: "2026-07-05"\nstatus: verified\nscale: full\n' +
        'quality_log:\n  - skill: prospec-review\n    date: "2026-07-05"\n    result: PASS\n',
    );
    const r = collectMetadataCompleteness(tmpDir);
    expect(r.changes.find((x) => x.name === 'c18')?.missing_verify_grade).toBe(true);
    expect(r.changes.find((x) => x.name === 'c19')?.missing_verify_grade).toBe(true);
  });

  it('rejects an archived change with an empty quality_log or no prospec-verify entries', () => {
    // The `archived` branch keeps the any-entry scan, which is exactly where an
    // empty log can fail OPEN — asserting only the `verified` half leaves a
    // `quality_log.some(...) === false ? true : ...` mutant green.
    write(
      '.prospec/changes/c20/metadata.yaml',
      'name: c20\ncreated_at: "2026-07-05"\nstatus: archived\nscale: full\nquality_log: []\n',
    );
    write(
      '.prospec/changes/c21/metadata.yaml',
      'name: c21\ncreated_at: "2026-07-05"\nstatus: archived\nscale: full\n' +
        'quality_log:\n  - skill: prospec-review\n    date: "2026-07-05"\n    result: PASS\n',
    );
    const r = collectMetadataCompleteness(tmpDir);
    expect(r.changes.find((x) => x.name === 'c20')?.missing_verify_grade).toBe(true);
    expect(r.changes.find((x) => x.name === 'c21')?.missing_verify_grade).toBe(true);
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

  it('sees a REQ defined only in a slice for the feature↔module / prefix checks', () => {
    writeMap('features:\n  - feature: alpha\n    modules: [lib]\n    req_prefixes: []\n    status: active\n');
    write(
      'prospec/specs/features/alpha.md',
      '---\nfeature: alpha\n---\n\n## Slices\n\n- [Extra](./alpha/extra.md)\n\n#### REQ-LIB-001: main\n',
    );
    write('prospec/specs/features/alpha/extra.md', '#### REQ-LIB-050: sliced\n');
    const r = collectFeatureMapGovernance(featuresDir(), knowledgePath(), tmpDir, KMAP);
    const alpha = r.specs.find((s) => s.feature === 'alpha');
    expect(alpha?.reqs.map((q) => q.id)).toEqual(['REQ-LIB-001', 'REQ-LIB-050']);
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

describe('scriptPatternFor (REQ-LIB-037)', () => {
  it('does NOT guess a script for a digraphic language — Serbian is written both ways', () => {
    // Guessing Cyrillic from the name would flag 100% of a Latin-writing
    // Serbian project's artifacts: the mass false positive this check exists
    // to avoid (ledger `scan/false-positive-kills-trust`).
    expect(scriptPatternFor('Serbian')).toBeUndefined();
    expect(scriptPatternFor('Kazakh')).toBeUndefined();
    expect(scriptPatternFor('Uzbek')).toBeUndefined();
  });

  it('matches a language written in its own name, not only its English name', () => {
    expect(scriptPatternFor('Русский')!.test('Привет')).toBe(true);
    expect(scriptPatternFor('ไทย')!.test('สวัสดี')).toBe(true);
  });

  it('resolves a script for each covered writing system', () => {
    expect(scriptPatternFor('Traditional Chinese (Taiwan)')!.test('繁體')).toBe(true);
    expect(scriptPatternFor('Japanese')!.test('日本語')).toBe(true);
    expect(scriptPatternFor('Russian')!.test('Привет')).toBe(true);
    expect(scriptPatternFor('Greek')!.test('Γειά')).toBe(true);
  });

  it('does NOT match plain ASCII for a covered language', () => {
    // Without this the check would pass every English file in a zh-TW project.
    expect(scriptPatternFor('Traditional Chinese (Taiwan)')!.test('plain english prose')).toBe(false);
  });

  it('returns undefined for a Latin-script language — the declared blind spot', () => {
    expect(scriptPatternFor('Spanish')).toBeUndefined();
    expect(scriptPatternFor('English')).toBeUndefined();
  });

  it('names the RIGHT gap: a missing mapping vs a declared Latin orthography', () => {
    // The two causes are different gaps and the reason must say which. Claiming
    // "not in the table" for `Serbian (Latin)` contradicts a pinned behaviour —
    // `Serbian (Cyrillic)` IS in the table — and misleads the one project owner
    // who declared their orthography correctly.
    expect(scriptGapReason('Spanish')).toContain('not in the script table');
    expect(scriptGapReason('Serbian (Latin)')).toContain('declares a Latin orthography');
    expect(scriptGapReason('Serbian (Latin)')).not.toContain('not in the script table');
  });
});

describe('collectArtifactLanguage (REQ-LIB-037)', () => {
  const scope = (nativePaths: string[], language = 'Traditional Chinese (Taiwan)') => ({
    language,
    nativePaths,
  });
  const NATIVE = ['.prospec/changes/**', '.prospec/archive/**', 'prospec/specs/_archived-history/**'];

  it('reports the source unavailable when the language has no detectable script', () => {
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE, 'Spanish'));
    expect(src.available).toBe(false);
    expect(src.reason).toContain('Spanish');
    expect(src.files).toHaveLength(0);
  });

  it('is available with an empty sample when the project has no change artifacts', () => {
    // PASS, not skipped: the scan ran and found nothing to judge.
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.available).toBe(true);
    expect(src.files).toHaveLength(0);
  });

  it('samples every native path set, deterministically ordered', () => {
    write('.prospec/changes/x/proposal.md', 'English only prose.\n');
    write('prospec/specs/_archived-history/2026-01-01-x.md', 'English only prose.\n');
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.files).toEqual([
      { path: '.prospec/changes/x/proposal.md', hasScript: false },
      { path: 'prospec/specs/_archived-history/2026-01-01-x.md', hasScript: false },
    ]);
  });

  it('marks a file carrying the artifact language as clean', () => {
    write('.prospec/changes/x/proposal.md', '# 標題\n\n這份文件帶有中文字跡。\n');
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.files).toEqual([{ path: '.prospec/changes/x/proposal.md', hasScript: true }]);
  });

  it('never scans the gitignored archive copy, even though the scope names it', () => {
    // The scope IS passed `.prospec/archive/**` — exclusion is the collector's
    // decision, so a mutation that stops excluding it turns this red.
    write('.prospec/archive/2026-01-01-x/summary.md', 'English only prose.\n');
    write('.prospec/changes/y/plan.md', '中文計畫。\n');
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.files.map((f) => f.path)).toEqual(['.prospec/changes/y/plan.md']);
  });

  it('refuses a scope path that escapes the repo — never an out-of-tree file oracle', () => {
    // A `paths.base_dir` of `../outside` makes resolveLanguageScope emit an
    // escaping glob. Without containment the collector reads that tree and
    // writes `../` source_paths into the committed report.
    const outside = mkdtempSync(path.join(os.tmpdir(), 'drift-outside-'));
    try {
      mkdirSync(path.join(outside, 'specs/_archived-history'), { recursive: true });
      writeFileSync(path.join(outside, 'specs/_archived-history/SECRET.md'), 'English only.\n');
      const escaping = path.join(path.relative(tmpDir, outside), 'specs/_archived-history/**');
      const src = collectArtifactLanguage(tmpDir, scope([escaping]));
      expect(src.files).toHaveLength(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('records a SYMLINKED root that resolves outside the repo — the realpath guard', () => {
    // The lexical `..` guard catches a plain escaping path; only the realpath
    // guard catches a root that looks contained but symlinks out. Both must
    // record, not skip over — same family, different member.
    const outside = mkdtempSync(path.join(os.tmpdir(), 'drift-linked-'));
    try {
      mkdirSync(path.join(outside, 'specs/_archived-history'), { recursive: true });
      writeFileSync(path.join(outside, 'specs/_archived-history/x.md'), 'English only.\n');
      mkdirSync(path.join(tmpDir, 'linked'), { recursive: true });
      symlinkSync(path.join(outside, 'specs'), path.join(tmpDir, 'linked/specs'));
      const src = collectArtifactLanguage(
        tmpDir,
        scope(['linked/specs/_archived-history/**']),
      );
      expect(src.available).toBe(false);
      expect(src.reason).toContain('outside the repository');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('survives a dangling symlink instead of throwing out of the whole check run', () => {
    // One bad link used to take all thirteen sibling checks down with it.
    write('.prospec/changes/x/proposal.md', '中文提案。\n');
    symlinkSync(
      path.join(tmpDir, '.prospec/changes/x/missing.md'),
      path.join(tmpDir, '.prospec/changes/x/dangling.md'),
    );
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.available).toBe(true);
    expect(src.files.map((f) => f.path)).toEqual(['.prospec/changes/x/proposal.md']);
  });

  it('judges prose, not fenced code — a quoted native string does not make a file compliant', () => {
    write(
      '.prospec/changes/x/plan.md',
      'All prose here is English.\n\n```ts\nconst label = "中文";\n```\n',
    );
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.files).toEqual([{ path: '.prospec/changes/x/plan.md', hasScript: false }]);
  });

  it('ignores non-markdown files such as the CLI-serialised metadata.yaml', () => {
    write('.prospec/changes/x/metadata.yaml', 'name: x\nstatus: story\n');
    write('.prospec/changes/x/proposal.md', '中文提案。\n');
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.files.map((f) => f.path)).toEqual(['.prospec/changes/x/proposal.md']);
  });

  it('reports the real-world regression that motivated the check', () => {
    // The English review.md from add-harness-capability-flags: 12 rows whose
    // Summary column was authored in English under a zh-TW artifact language.
    write(
      '.prospec/changes/z/review.md',
      '# Review Findings: z\n\n| ID | Location | Severity | Lens | Status | Summary |\n|---|---|---|---|---|---|\n| HC-01 | src/x.ts:1 | critical | correctness | resolved | The loop spawn imperatives sit outside the conditional branch. |\n',
    );
    const src = collectArtifactLanguage(tmpDir, scope(NATIVE));
    expect(src.files).toEqual([{ path: '.prospec/changes/z/review.md', hasScript: false }]);
  });
});

describe('scriptPatternFor — Latin orthography rule (REQ-LIB-037)', () => {
  it.each([
    'Serbian (Latin)',
    'Hindi (Romanized)',
    'Persian (Latin)',
    'Urdu (Roman)',
    'Hebrew (transliterated)',
    'Japanese (Romaji)',
    'Greeklish',
    // Declared in the language's OWN script — the ASCII-only rule leaked these,
    // and this direction produces false positives, not honest skips.
    '日本語（ローマ字）',
    '中文拼音',
    'Русский (латиница)',
  ])('skips %s — a declared Latin orthography overrides the base-language name', (name) => {
    // Rule, not per-name special cases: the Serbian fix alone left every
    // sibling flagging 100% of a Latin-writing project's artifacts.
    expect(scriptPatternFor(name)).toBeUndefined();
  });

  it('still resolves the base language when no Latin orthography is declared', () => {
    expect(scriptPatternFor('Hindi')).toBeDefined();
    expect(scriptPatternFor('Persian')).toBeDefined();
    expect(scriptPatternFor('Serbian (Cyrillic)')).toBeDefined();
  });
});

describe('collectBudgetOverrides', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), 'prospec-budget-overrides-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns unavailable when .prospec.yaml is missing', () => {
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(false);
    if (!res.available) {
      expect(res.reason).toMatch(/not found|unreadable/);
    }
  });

  it('returns unavailable when token_budget is missing', () => {
    writeFileSync(path.join(cwd, '.prospec.yaml'), 'project:\n  name: test\n');
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(false);
    if (!res.available) {
      expect(res.reason).toMatch(/token_budget/);
    }
  });

  it('collects overrides greater than default with comment status', () => {
    writeFileSync(
      path.join(cwd, '.prospec.yaml'),
      `knowledge:
  token_budget:
    l1_per_file: 999999 # This one has a comment
    l2_per_module: 500000
    demand_knowledge_per_file: 15000 # Justification
`,
    );
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.overrides).toHaveLength(3);
      const l1 = res.overrides.find((o) => o.key === 'l1_per_file');
      expect(l1?.hasComment).toBe(true);
      const l2 = res.overrides.find((o) => o.key === 'l2_per_module');
      expect(l2?.hasComment).toBe(false);
      const demand = res.overrides.find((o) => o.key === 'demand_knowledge_per_file');
      expect(demand?.hasComment).toBe(true);
    }
  });

  it('credits a comment written above the block\'s first key, and only to that key', () => {
    // The YAML AST hangs a leading comment on the *collection* when the key it
    // introduces is the block's first — so reading only `key.commentBefore`
    // makes the most natural way to justify an override invisible.
    writeFileSync(
      path.join(cwd, '.prospec.yaml'),
      `knowledge:
  token_budget:
    # This project's L1 index catalogs a large architecture.
    l1_per_file: 999999
    l2_per_module: 500000
`,
    );
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.overrides.find((o) => o.key === 'l1_per_file')?.hasComment).toBe(true);
      expect(res.overrides.find((o) => o.key === 'l2_per_module')?.hasComment).toBe(false);
    }
  });

  it('credits a comment written above a later key to that key alone', () => {
    writeFileSync(
      path.join(cwd, '.prospec.yaml'),
      `knowledge:
  token_budget:
    l1_per_file: 999999
    # Deep contextual rules need the extra room.
    l2_per_module: 500000
`,
    );
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.overrides.find((o) => o.key === 'l1_per_file')?.hasComment).toBe(false);
      expect(res.overrides.find((o) => o.key === 'l2_per_module')?.hasComment).toBe(true);
    }
  });

  it('ignores overrides less than or equal to default', () => {
    writeFileSync(
      path.join(cwd, '.prospec.yaml'),
      `knowledge:
  token_budget:
    l1_per_file: 1800
    l2_per_module: 500
`,
    );
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.overrides).toHaveLength(0);
    }
  });

  it('returns unavailable on malformed yaml', () => {
    writeFileSync(path.join(cwd, '.prospec.yaml'), 'knowledge:\n  token_budget: [unclosed');
    const res = collectBudgetOverrides(cwd);
    expect(res.available).toBe(false);
    if (!res.available) {
      expect(res.reason).toMatch(/failed to parse/);
    }
  });
});

describe('collectCanonicalDocDrift', () => {
  const MOCK_CONFIG = {
    project: { name: 'prospec' },
    tech_stack: { language: 'typescript', package_manager: 'pnpm' },
  } as unknown as ProspecConfig;

  it('normalizes CRLF to LF for accurate matching', () => {
    const contexts = buildInitDocContexts(MOCK_CONFIG, tmpDir);
    const doc = CANONICAL_INIT_DOCS.find(d => d.output === 'README.md')!;
    const expected = renderInitDoc(doc, contexts);
    write('prospec/README.md', expected.replace(/\n/g, '\r\n'));
    
    const res = collectCanonicalDocDrift(MOCK_CONFIG, tmpDir);
    expect(res.available).toBe(true);
    if (res.available) {
      const readme = res.docs.find((f) => f.source_path === 'prospec/README.md');
      expect(readme).toBeDefined();
      expect(readme!.matches).toBe(true);
    }
  });

  it('reports drift when content differs', () => {
    write('prospec/README.md', '# prospec\n\nDrifted body\n');
    const res = collectCanonicalDocDrift(MOCK_CONFIG, tmpDir);
    expect(res.available).toBe(true);
    if (res.available) {
      const readme = res.docs.find((f) => f.source_path === 'prospec/README.md');
      expect(readme).toBeDefined();
      expect(readme!.matches).toBe(false);
    }
  });

  it('skips missing files without erroring (and returns unavailable if none exist)', () => {
    const res = collectCanonicalDocDrift(MOCK_CONFIG, tmpDir);
    expect(res.available).toBe(false);
  });

  it('matches exactly when contents are identical', () => {
    const contexts = buildInitDocContexts(MOCK_CONFIG, tmpDir);
    const doc = CANONICAL_INIT_DOCS.find(d => d.output === 'README.md')!;
    const expected = renderInitDoc(doc, contexts);
    
    write('prospec/README.md', expected);
    const res = collectCanonicalDocDrift(MOCK_CONFIG, tmpDir);
    expect(res.available).toBe(true);
    if (res.available) {
      const readme = res.docs.find((f) => f.source_path === 'prospec/README.md');
      expect(readme!.matches).toBe(true);
    }
  });

  it('ignores out-of-scope files like user-managed docs', () => {
    write('prospec/README.md', '# prospec\n\n> AI-augmented project with Prospec Skills and structured AI Knowledge\n\n## Tech Stack\n\n- **Language**: typescript\n- **Package Manager**: pnpm\n');
    write('prospec/specs/features/some.md', '# Not a canonical doc\n');
    const res = collectCanonicalDocDrift(MOCK_CONFIG, tmpDir);
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.docs.find((f) => f.source_path === 'prospec/specs/features/some.md')).toBeUndefined();
    }
  });
});
