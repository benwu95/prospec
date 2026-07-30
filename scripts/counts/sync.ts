import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { atomicWrite } from '../../src/lib/fs-utils.js';
import { COUNT_REGISTRY, REGISTRY_DOCS } from './registry.js';
import { deriveInventory } from './derive.js';
import { applyCounts, resolveOccurrences } from './rewrite.js';
import { applyYamlFieldCounts } from './yaml-field.js';
import type { CountReport, SkippedSource, TruthMap } from './types.js';

/** Test-suite truth or an honest skip reason (real impl runs vitest). */
export interface TestCountResult {
  counts: Record<string, number> | null;
  reason?: string;
}

/**
 * Combine the filesystem inventory with the (possibly unavailable) test counts
 * into a truth map. When the test source is unavailable, every test-suite count
 * key is reported as skipped — never written with a fabricated number.
 */
export function buildTruth(
  repoRoot: string,
  test: TestCountResult,
): { truth: TruthMap; skipped: SkippedSource[] } {
  const truth: TruthMap = { ...deriveInventory(repoRoot), ...(test.counts ?? {}) };
  const skipped: SkippedSource[] = [];
  if (test.counts === null) {
    for (const entry of COUNT_REGISTRY) {
      if (entry.source.kind === 'test-suite') {
        skipped.push({ key: entry.key, reason: test.reason ?? 'test source unavailable' });
      }
    }
  }
  return { truth, skipped };
}

export interface SyncOptions {
  repoRoot: string;
  /** Dry-run: report drift, write nothing. */
  check: boolean;
  /** count key → actual number; keys absent here are left untouched. */
  truth: TruthMap;
  /** Count keys skipped because their source was unavailable. */
  skipped?: SkippedSource[];
  /** Injected file writer (defaults to atomicWrite) for hermetic tests. */
  write?: (absPath: string, content: string) => Promise<void>;
}

/**
 * Rewrite every registry doc in place so each whitelisted count spot matches
 * `truth` (or, under `check`, collect the drift without writing). Only spots in
 * COUNT_REGISTRY are ever touched.
 */
export async function syncCounts(opts: SyncOptions): Promise<CountReport> {
  const write = opts.write ?? atomicWrite;
  const resolved = resolveOccurrences(COUNT_REGISTRY, opts.truth);
  const report: CountReport = { changes: [], written: [], skipped: opts.skipped ?? [] };

  for (const doc of REGISTRY_DOCS) {
    const abs = path.join(opts.repoRoot, doc);
    if (!existsSync(abs)) continue;
    // Two rewriters, one pass per doc: line-scoped for markdown, field-scoped for
    // YAML values that fold across lines. Each ignores the other's occurrences.
    const lineScoped = applyCounts(readFileSync(abs, 'utf-8'), resolved, doc);
    const fieldScoped = applyYamlFieldCounts(lineScoped.content, resolved, doc);
    const content = fieldScoped.content;
    const changes = [...lineScoped.changes, ...fieldScoped.changes];
    if (changes.length === 0) continue;
    report.changes.push(...changes);
    if (!opts.check) {
      await write(abs, content);
      report.written.push(doc);
    }
  }

  return report;
}

/**
 * Whether a `--check` run should fail (exit 1). A gate that cannot verify a
 * count must fail closed: drift OR a skipped source both fail. Otherwise a
 * broken test source would silently pass CI while test counts drift — the exact
 * PB-004 chore this tool exists to prevent.
 */
export function checkFailed(report: CountReport): boolean {
  return report.changes.length > 0 || report.skipped.length > 0;
}
