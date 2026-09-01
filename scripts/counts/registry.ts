import type { CountEntry, CountFormat, CountOccurrence } from './types.js';

/**
 * COUNT_REGISTRY — the single source of truth for every factual count and
 * every whitelisted spot it appears in prospec's own docs.
 *
 * SAFETY (whitelist): only the occurrences listed here are ever rewritten.
 * `_lessons-ledger.md`, `prospec/specs/_archived-history/`, and
 * `.prospec/changes/` deliberately appear NOWHERE below — their count numbers
 * are historical narrative (e.g. the ledger's "1840→1860→1865") and must stay
 * frozen. Each `anchor` has exactly one capture group around the number and
 * enough literal context to match its intended line only (or, for a
 * field-scoped occurrence, its intended YAML value only).
 *
 * SCOPE (v1): test counts (total + outcomes + per-layer + file count) and the `.hbs`
 * template inventory (total + the 6 category sub-counts, at their canonical
 * index.md inventory sentence — each paired with its `module-map.yaml` source via
 * `moduleMapTwin`, since index.md is GENERATED from it). Deliberately NOT covered — module per-file
 * counts and CLI command/formatter counts (maintained by
 * `/prospec-knowledge-update`), and the templates-module-README per-directory
 * sub-count rows. These are registerable later; the completeness guard test
 * only asserts the listed anchors resolve, so deferral is explicit, not silent.
 */

const README = 'README.md';
const README_ZH = 'README.zh-TW.md';
const DOCS_INDEX = 'docs/index.html';
const DOCS_I18N = 'docs/i18n.js';
const INDEX = 'prospec/index.md';
const TESTS_README = 'prospec/ai-knowledge/modules/tests/README.md';
const TEMPLATES_README = 'prospec/ai-knowledge/modules/templates/README.md';
const MODULE_MAP = 'prospec/ai-knowledge/module-map.yaml';

/**
 * A count in `index.md`'s Modules table lives in TWO places: the generated cell
 * and the `module-map.yaml` description it is generated FROM. Fixing only the
 * generated file means the next `prospec knowledge update` reverts it, so every
 * INDEX occurrence has a field-scoped module-map twin (same anchor — the cell is
 * a verbatim copy of the description).
 */
function moduleMapTwin(
  module: 'tests' | 'templates',
  anchor: RegExp,
  format: CountFormat = 'plain',
): CountOccurrence {
  return { doc: MODULE_MAP, anchor, format, field: { module, key: 'description' } };
}

export const COUNT_REGISTRY: CountEntry[] = [
  {
    key: 'tests.total',
    source: { kind: 'test-suite', layer: 'total' },
    occurrences: [
      { doc: README, anchor: /badge\/tests-(\d+)%20(?:passing|total)/, format: 'plain' },
      { doc: README, anchor: /Run all tests \((\d+) (?:tests|total)(?:; \d+ skipped)?\)/, format: 'plain' },
      {
        doc: README,
        anchor: /\*\*Test Coverage\*\*: (\d+) (?:tests(?: total)?|total tests)(?: \(\d+ passed; \d+ skipped\))? across/,
        format: 'plain',
      },
      { doc: README_ZH, anchor: /badge\/測試-(\d+)%20(?:通過|總計)/, format: 'plain' },
      {
        doc: README_ZH,
        anchor: /執行所有測試（(?:共 )?(\d+) 個(?:測試)?(?:；\d+ 個略過)?）/,
        format: 'plain',
      },
      {
        doc: README_ZH,
        anchor: /\*\*測試覆蓋率\*\*：(?:共 )?(\d+) 個測試(?:（\d+ 個通過；\d+ 個略過）)?(?:，)?橫跨/,
        format: 'plain',
      },
      {
        doc: DOCS_INDEX,
        anchor: /data-i18n="hero\.facts\.tests"><b>([\d,]+)<\/b> total ·/,
        format: 'comma',
      },
      {
        doc: DOCS_I18N,
        anchor: /'hero\.facts\.tests': '共 <b>([\d,]+)<\/b> 個測試 ·/,
        format: 'comma',
      },
      { doc: INDEX, anchor: /files, ([\d,]+) tests \(unit /, format: 'comma' },
      moduleMapTwin('tests', /files, ([\d,]+) tests \(unit /, 'comma'),
      { doc: TESTS_README, anchor: /test files, ([\d,]+) tests \(unit /, format: 'comma' },
    ],
  },
  {
    key: 'tests.passed',
    source: { kind: 'test-suite', layer: 'passed' },
    occurrences: [
      {
        doc: README,
        anchor: /\*\*Test Coverage\*\*: \d+ (?:tests(?: total)?|total tests) \((\d+) passed; \d+ skipped\) across/,
        format: 'plain',
      },
      {
        doc: README_ZH,
        anchor: /\*\*測試覆蓋率\*\*：(?:共 )?\d+ 個測試（(\d+) 個通過；\d+ 個略過）(?:，)?橫跨/,
        format: 'plain',
      },
      {
        doc: DOCS_INDEX,
        anchor: /hero\.facts\.tests">.* total · <b>([\d,]+)<\/b> passed ·/,
        format: 'comma',
      },
      {
        doc: DOCS_I18N,
        anchor: /'hero\.facts\.tests': '.* 個測試 · <b>([\d,]+)<\/b> 個通過 ·/,
        format: 'comma',
      },
    ],
  },
  {
    key: 'tests.skipped',
    source: { kind: 'test-suite', layer: 'skipped' },
    occurrences: [
      { doc: README, anchor: /Run all tests \(\d+ (?:tests|total); (\d+) skipped\)/, format: 'plain' },
      {
        doc: README,
        anchor: /\*\*Test Coverage\*\*: \d+ (?:tests(?: total)?|total tests) \(\d+ passed; (\d+) skipped\) across/,
        format: 'plain',
      },
      {
        doc: README_ZH,
        anchor: /執行所有測試（(?:共 )?\d+ 個(?:測試)?；(\d+) 個略過）/,
        format: 'plain',
      },
      {
        doc: README_ZH,
        anchor: /\*\*測試覆蓋率\*\*：(?:共 )?\d+ 個測試（\d+ 個通過；(\d+) 個略過）(?:，)?橫跨/,
        format: 'plain',
      },
      {
        doc: DOCS_INDEX,
        anchor: /hero\.facts\.tests">.* passed · <b>([\d,]+)<\/b> skipped/,
        format: 'comma',
      },
      {
        doc: DOCS_I18N,
        anchor: /'hero\.facts\.tests': '.* 個通過 · <b>([\d,]+)<\/b> 個略過/,
        format: 'comma',
      },
    ],
  },
  {
    key: 'tests.unit',
    source: { kind: 'test-suite', layer: 'unit' },
    occurrences: [
      {
        doc: README,
        anchor: /Unit tests \(types \+ lib \+ services \+ cli\): (\d+) tests/,
        format: 'plain',
      },
      {
        doc: README_ZH,
        anchor: /Unit tests（types \+ lib \+ services \+ cli）：(\d+) tests/,
        format: 'plain',
      },
      { doc: INDEX, anchor: /\(unit (\d+) \+ contract/, format: 'plain' },
      moduleMapTwin('tests', /\(unit (\d+) \+ contract/),
      { doc: TESTS_README, anchor: /\(unit (\d+), contract/, format: 'plain' },
    ],
  },
  {
    key: 'tests.contract',
    source: { kind: 'test-suite', layer: 'contract' },
    occurrences: [
      {
        doc: README,
        anchor: /Contract tests \(CLI output \+ Skill format\): (\d+) tests/,
        format: 'plain',
      },
      {
        doc: README_ZH,
        anchor: /Contract tests（CLI 輸出 \+ Skill 格式）：(\d+) tests/,
        format: 'plain',
      },
      { doc: INDEX, anchor: /\+ contract (\d+) \+ integration/, format: 'plain' },
      moduleMapTwin('tests', /\+ contract (\d+) \+ integration/),
      { doc: TESTS_README, anchor: /, contract (\d+), integration/, format: 'plain' },
    ],
  },
  {
    key: 'tests.integration',
    source: { kind: 'test-suite', layer: 'integration' },
    occurrences: [
      { doc: README, anchor: /Integration tests: (\d+) tests/, format: 'plain' },
      { doc: README_ZH, anchor: /Integration tests：(\d+) tests/, format: 'plain' },
      { doc: INDEX, anchor: /\+ integration (\d+) \+ e2e/, format: 'plain' },
      moduleMapTwin('tests', /\+ integration (\d+) \+ e2e/),
      { doc: TESTS_README, anchor: /, integration (\d+), e2e/, format: 'plain' },
    ],
  },
  {
    key: 'tests.e2e',
    source: { kind: 'test-suite', layer: 'e2e' },
    occurrences: [
      { doc: README, anchor: /E2E tests: (\d+) tests/, format: 'plain' },
      { doc: README_ZH, anchor: /E2E tests：(\d+) tests/, format: 'plain' },
      { doc: INDEX, anchor: /\+ e2e (\d+)\)/, format: 'plain' },
      moduleMapTwin('tests', /\+ e2e (\d+)\)/),
      { doc: TESTS_README, anchor: /, e2e (\d+)\)/, format: 'plain' },
    ],
  },
  {
    key: 'tests.files',
    source: { kind: 'test-suite', layer: 'files' },
    occurrences: [
      { doc: INDEX, anchor: /test suite — (\d+) files,/, format: 'plain' },
      moduleMapTwin('tests', /test suite — (\d+) files,/),
      { doc: TESTS_README, anchor: /memfs — (\d+) test files,/, format: 'plain' },
    ],
  },
  {
    key: 'templates.hbs.total',
    source: { kind: 'fs-glob', describe: 'src/templates/**/*.hbs' },
    occurrences: [
      { doc: README, anchor: /Handlebars templates \((\d+) \.hbs files\)/, format: 'plain' },
      { doc: README_ZH, anchor: /Handlebars 範本（(\d+) 個 \.hbs 檔案）/, format: 'plain' },
      { doc: INDEX, anchor: /\((\d+) `\.hbs`/, format: 'plain' },
      moduleMapTwin('templates', /\((\d+) `\.hbs`/),
      { doc: TEMPLATES_README, anchor: /library — (\d+) `\.hbs` files across/, format: 'plain' },
    ],
  },
  {
    key: 'templates.hbs.skills',
    source: { kind: 'fs-glob', describe: 'src/templates/skills/prospec-*.hbs' },
    occurrences: [
      { doc: INDEX, anchor: /template library — (\d+) skills \+/, format: 'plain' },
      moduleMapTwin('templates', /template library — (\d+) skills \+/),
    ],
  },
  {
    key: 'templates.hbs.partials',
    source: { kind: 'fs-glob', describe: 'src/templates/skills/_*.hbs' },
    occurrences: [
      { doc: INDEX, anchor: /(\d+) shared partials/, format: 'plain' },
      moduleMapTwin('templates', /(\d+) shared partials/),
    ],
  },
  {
    key: 'templates.hbs.references',
    source: { kind: 'fs-glob', describe: 'src/templates/skills/references/**/*.hbs' },
    occurrences: [
      { doc: INDEX, anchor: /shared partials, (\d+) references/, format: 'plain' },
      moduleMapTwin('templates', /shared partials, (\d+) references/),
    ],
  },
  {
    key: 'templates.hbs.agentConfig',
    source: { kind: 'fs-glob', describe: 'src/templates/agent-configs/*.hbs' },
    occurrences: [
      { doc: INDEX, anchor: /references, (\d+) agent-config/, format: 'plain' },
      moduleMapTwin('templates', /references, (\d+) agent-config/),
    ],
  },
  {
    key: 'templates.hbs.change',
    source: { kind: 'fs-glob', describe: 'src/templates/change/*.hbs' },
    occurrences: [
      { doc: INDEX, anchor: /agent-config, (\d+) change,/, format: 'plain' },
      moduleMapTwin('templates', /agent-config, (\d+) change,/),
    ],
  },
  {
    key: 'templates.hbs.initKnowledge',
    source: { kind: 'fs-glob', describe: 'src/templates/{init,knowledge}/**/*.hbs' },
    occurrences: [
      { doc: INDEX, anchor: /change, (\d+) init\/knowledge/, format: 'plain' },
      moduleMapTwin('templates', /change, (\d+) init\/knowledge/),
    ],
  },
];

/** All doc paths the registry touches (deduped) — for read/write iteration. */
export const REGISTRY_DOCS: string[] = [
  ...new Set(COUNT_REGISTRY.flatMap((e) => e.occurrences.map((o) => o.doc))),
];
