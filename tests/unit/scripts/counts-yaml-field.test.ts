import { describe, it, expect } from 'vitest';
import { applyYamlFieldCounts } from '../../../scripts/counts/yaml-field.js';
import type { ResolvedOccurrence } from '../../../scripts/counts/rewrite.js';

/**
 * `module-map.yaml` is the SOURCE the index table is generated from, so its
 * counted descriptions must be maintained alongside the derived docs. YAML folds
 * a long description across lines at arbitrary spaces, so a line-scoped anchor
 * misses it — these tests pin the field-scoped rewriter: anchors apply to the
 * logical (unfolded) value, and only the number span is rewritten in place.
 */

const DOC = 'prospec/ai-knowledge/module-map.yaml';

const YAML = `version: "1.0"
modules:
  - name: tests
    description: 4-layer test suite — 132 files, 2,773 tests (unit 1956 + contract
      708 + integration 43 + e2e 66). Validates every module — format contracts,
      the drift engine, and the MCP protocol.
    paths:
      - tests
    keywords:
      - vitest

  - name: lib
    description: Shared stateless helpers
    paths:
      - src/lib
`;

function occ(
  key: string,
  anchor: RegExp,
  truth: number,
  format: 'plain' | 'comma' = 'plain',
  module = 'tests',
): ResolvedOccurrence {
  return { key, occ: { doc: DOC, anchor, format, field: { module, key: 'description' } }, truth };
}

describe('applyYamlFieldCounts', () => {
  it('rewrites a count whose anchor phrase spans a YAML line fold', () => {
    // "…+ contract\n      708 + integration…" — no single line carries the phrase
    const resolved = [occ('tests.contract', /\+ contract (\d+) \+ integration/, 999)];

    const { content, changes } = applyYamlFieldCounts(YAML, resolved, DOC);

    expect(changes).toEqual([
      expect.objectContaining({ doc: DOC, key: 'tests.contract', from: '708', to: '999' }),
    ]);
    expect(content).toContain('999 + integration 43');
    // exactly one byte-run changed: the whole document equals the original with
    // that single number swapped — the fold positions are untouched (no reflow)
    expect(content).toBe(YAML.replace('708 + integration', '999 + integration'));
  });

  it('renders comma-grouped counts and reports the line it rewrote', () => {
    const resolved = [occ('tests.total', /files, ([\d,]+) tests \(unit /, 2775, 'comma')];

    const { content, changes } = applyYamlFieldCounts(YAML, resolved, DOC);

    expect(content).toContain('132 files, 2,775 tests (unit 1956');
    expect(changes[0]!.from).toBe('2,773');
    expect(changes[0]!.to).toBe('2,775');
    // line 4 is the `description:` line holding that number
    expect(changes[0]!.line).toBe(4);
  });

  it('is idempotent — a second pass over already-correct content changes nothing', () => {
    const resolved = [occ('tests.contract', /\+ contract (\d+) \+ integration/, 999)];

    const first = applyYamlFieldCounts(YAML, resolved, DOC);
    const second = applyYamlFieldCounts(first.content, resolved, DOC);

    expect(second.changes).toEqual([]);
    expect(second.content).toBe(first.content);
  });

  it('rewrites several counts in one field without disturbing each other', () => {
    const resolved = [
      occ('tests.total', /files, ([\d,]+) tests \(unit /, 2775, 'comma'),
      occ('tests.unit', /\(unit (\d+) \+ contract/, 1958),
      occ('tests.e2e', /\+ e2e (\d+)\)/, 70),
    ];

    const { content, changes } = applyYamlFieldCounts(YAML, resolved, DOC);

    expect(changes.map((c) => c.key).sort()).toEqual(['tests.e2e', 'tests.total', 'tests.unit']);
    expect(content).toContain('2,775 tests (unit 1958 + contract');
    expect(content).toContain('+ e2e 70)');
    expect(content).toContain('Shared stateless helpers');
  });

  it('leaves the document untouched when the module or field is absent', () => {
    const missingModule = [occ('tests.total', /files, ([\d,]+) tests/, 1, 'plain', 'nope')];
    const noMatch = [occ('tests.total', /never (\d+) matches/, 1)];

    for (const resolved of [missingModule, noMatch]) {
      const { content, changes } = applyYamlFieldCounts(YAML, resolved, DOC);
      expect(changes).toEqual([]);
      expect(content).toBe(YAML);
    }
  });

  it('ignores occurrences that target another doc or carry no field scope', () => {
    const otherDoc: ResolvedOccurrence = {
      key: 'tests.total',
      occ: {
        doc: 'README.md',
        anchor: /files, ([\d,]+) tests/,
        format: 'plain',
        field: { module: 'tests', key: 'description' },
      },
      truth: 1,
    };
    const lineScoped: ResolvedOccurrence = {
      key: 'tests.total',
      occ: { doc: DOC, anchor: /files, ([\d,]+) tests/, format: 'plain' },
      truth: 1,
    };

    const { content, changes } = applyYamlFieldCounts(YAML, [otherDoc, lineScoped], DOC);
    expect(changes).toEqual([]);
    expect(content).toBe(YAML);
  });
});
