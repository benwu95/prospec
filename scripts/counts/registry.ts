import type { CountEntry } from './types.js';

/**
 * COUNT_REGISTRY — the single source of truth for every factual count and
 * every whitelisted spot it appears in prospec's own docs.
 *
 * SAFETY (whitelist): only the occurrences listed here are ever rewritten.
 * `_lessons-ledger.md`, `prospec/specs/_archived-history/`, and
 * `.prospec/changes/` deliberately appear NOWHERE below — their count numbers
 * are historical narrative (e.g. the ledger's "1840→1860→1865") and must stay
 * frozen. Each `anchor` has exactly one capture group around the number and
 * enough literal context to match its intended line only.
 *
 * SCOPE (v1): test counts (total + per-layer + file count) and the `.hbs`
 * template inventory (total + the 6 category sub-counts, at their canonical
 * index.md inventory sentence). Deliberately NOT covered — module per-file
 * counts and CLI command/formatter counts (maintained by
 * `/prospec-knowledge-update`), and the templates-module-README per-directory
 * sub-count rows. These are registerable later; the completeness guard test
 * only asserts the listed anchors resolve, so deferral is explicit, not silent.
 */

const README = 'README.md';
const README_ZH = 'README.zh-TW.md';
const INDEX = 'prospec/index.md';
const TESTS_README = 'prospec/ai-knowledge/modules/tests/README.md';
const TEMPLATES_README = 'prospec/ai-knowledge/modules/templates/README.md';

export const COUNT_REGISTRY: CountEntry[] = [
  {
    key: 'tests.total',
    source: { kind: 'test-suite', layer: 'total' },
    occurrences: [
      { doc: README, anchor: /badge\/tests-(\d+)%20passing/, format: 'plain' },
      { doc: README, anchor: /Run all tests \((\d+) tests\)/, format: 'plain' },
      { doc: README, anchor: /\*\*Test Coverage\*\*: (\d+) tests across/, format: 'plain' },
      { doc: README_ZH, anchor: /badge\/測試-(\d+)%20通過/, format: 'plain' },
      { doc: README_ZH, anchor: /執行所有測試（(\d+) 個測試）/, format: 'plain' },
      { doc: README_ZH, anchor: /\*\*測試覆蓋率\*\*：(\d+) 個測試橫跨/, format: 'plain' },
      { doc: INDEX, anchor: /files, ([\d,]+) tests \(unit /, format: 'comma' },
      { doc: TESTS_README, anchor: /test files, ([\d,]+) tests \(unit /, format: 'comma' },
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
      { doc: TESTS_README, anchor: /, e2e (\d+)\)/, format: 'plain' },
    ],
  },
  {
    key: 'tests.files',
    source: { kind: 'test-suite', layer: 'files' },
    occurrences: [
      { doc: INDEX, anchor: /test suite — (\d+) files,/, format: 'plain' },
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
      { doc: TEMPLATES_README, anchor: /library — (\d+) `\.hbs` files across/, format: 'plain' },
    ],
  },
  {
    key: 'templates.hbs.skills',
    source: { kind: 'fs-glob', describe: 'src/templates/skills/prospec-*.hbs' },
    occurrences: [{ doc: INDEX, anchor: /template library — (\d+) skills \+/, format: 'plain' }],
  },
  {
    key: 'templates.hbs.partials',
    source: { kind: 'fs-glob', describe: 'src/templates/skills/_*.hbs' },
    occurrences: [{ doc: INDEX, anchor: /(\d+) shared partials/, format: 'plain' }],
  },
  {
    key: 'templates.hbs.references',
    source: { kind: 'fs-glob', describe: 'src/templates/skills/references/**/*.hbs' },
    occurrences: [{ doc: INDEX, anchor: /shared partials, (\d+) references/, format: 'plain' }],
  },
  {
    key: 'templates.hbs.agentConfig',
    source: { kind: 'fs-glob', describe: 'src/templates/agent-configs/*.hbs' },
    occurrences: [{ doc: INDEX, anchor: /references, (\d+) agent-config/, format: 'plain' }],
  },
  {
    key: 'templates.hbs.change',
    source: { kind: 'fs-glob', describe: 'src/templates/change/*.hbs' },
    occurrences: [{ doc: INDEX, anchor: /agent-config, (\d+) change,/, format: 'plain' }],
  },
  {
    key: 'templates.hbs.initKnowledge',
    source: { kind: 'fs-glob', describe: 'src/templates/{init,knowledge}/**/*.hbs' },
    occurrences: [{ doc: INDEX, anchor: /change, (\d+) init\/knowledge/, format: 'plain' }],
  },
];

/** All doc paths the registry touches (deduped) — for read/write iteration. */
export const REGISTRY_DOCS: string[] = [
  ...new Set(COUNT_REGISTRY.flatMap((e) => e.occurrences.map((o) => o.doc))),
];
