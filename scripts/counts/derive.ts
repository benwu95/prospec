import fg from 'fast-glob';

/**
 * Truth derivation for factual counts. Two authoritative sources:
 *   - `deriveTestCounts` — pure; buckets a parsed `vitest run` report by layer.
 *   - `deriveInventory`  — filesystem glob over `src/templates/`.
 * Both return partial truth maps keyed by COUNT_REGISTRY keys.
 */

/** Minimal shape consumed from vitest's `--reporter=json` output. */
export interface VitestFileResult {
  /** Absolute or repo-relative test-file path. */
  name: string;
  assertionResults?: unknown[];
}
export interface VitestJsonReport {
  testResults?: VitestFileResult[];
}

const TEST_LAYERS = ['unit', 'contract', 'integration', 'e2e'] as const;

/**
 * Bucket a vitest json report into total + per-layer test counts + file count.
 * Per-file test count = `assertionResults.length`; a file is bucketed by the
 * `tests/<layer>/` segment in its path. Returns null when the report has no
 * usable results (caller then skips test counts with a reason — never writes a
 * fabricated number).
 */
export function deriveTestCounts(report: VitestJsonReport): Record<string, number> | null {
  const files = report.testResults;
  if (!Array.isArray(files) || files.length === 0) return null;

  const perLayer: Record<(typeof TEST_LAYERS)[number], number> = {
    unit: 0,
    contract: 0,
    integration: 0,
    e2e: 0,
  };
  let total = 0;
  for (const file of files) {
    const n = Array.isArray(file.assertionResults) ? file.assertionResults.length : 0;
    total += n;
    const path = file.name.replace(/\\/g, '/');
    const layer = TEST_LAYERS.find((l) => path.includes(`/tests/${l}/`));
    if (layer !== undefined) perLayer[layer] += n;
  }

  return {
    'tests.total': total,
    'tests.unit': perLayer.unit,
    'tests.contract': perLayer.contract,
    'tests.integration': perLayer.integration,
    'tests.e2e': perLayer.e2e,
    'tests.files': files.length,
  };
}

/** Count `.hbs` files under `src/templates/`, by category. */
export function deriveInventory(repoRoot: string): Record<string, number> {
  const count = (pattern: string): number =>
    fg.sync(pattern, { cwd: repoRoot, onlyFiles: true }).length;

  return {
    'templates.hbs.total': count('src/templates/**/*.hbs'),
    'templates.hbs.skills': count('src/templates/skills/prospec-*.hbs'),
    'templates.hbs.partials': count('src/templates/skills/_*.hbs'),
    'templates.hbs.references': count('src/templates/skills/references/**/*.hbs'),
    'templates.hbs.agentConfig': count('src/templates/agent-configs/*.hbs'),
    'templates.hbs.change': count('src/templates/change/*.hbs'),
    'templates.hbs.initKnowledge': count('src/templates/{init,knowledge}/**/*.hbs'),
  };
}
