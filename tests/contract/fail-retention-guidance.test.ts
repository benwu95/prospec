import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUNDLED_TEMPLATES } from '../../src/lib/bundled-templates.js';
import { CHANGE_STATUSES } from '../../src/types/change.js';
import { ConstitutionRuleJudgmentSchema } from '../../src/types/station.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const lifecycleKey = 'init/status-lifecycle.md.hbs';
const backfillKey = 'skills/references/verify-backfill.hbs';
const payloadKey = 'skills/references/delegated-evidence-format.hbs';
const metadataKey = 'skills/references/metadata-format.hbs';

function section(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.startsWith(heading));
  expect(start, `missing ${heading}`).toBeGreaterThanOrEqual(0);
  const depth = heading.match(/^#+/)![0].length;
  const end = lines.findIndex((line, i) => i > start && new RegExp(`^#{1,${depth}} `).test(line));
  const result = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  expect(result, `empty ${heading}`).not.toBe('');
  return result;
}

function assertLifecycle(content: string): void {
  const transitions = section(content, '## States and transitions');
  const row = transitions.split('\n').find((line) => line.startsWith('| `story` | `tasks` |'));
  expect(row).toBeDefined();
  const rules = section(content, '## Rules');
  const skip = rules.split('\n').find((line) => line.startsWith('- No skill may skip ahead'));
  expect(skip).toBeDefined();
  for (const scope of [row!, skip!]) {
    const choices = /\((Draft-First: [^)]+)\)/.exec(scope)?.[1]?.split('; ');
    expect(choices).toEqual([
      'Draft-First: autonomously selected',
      'interactive: human-confirmed',
      'auto-draft: machine-assigned by `prospec change auto-draft`',
    ]);
    expect(scope).not.toMatch(/\(user-confirmed|confirmed by the user, or/);
  }
  const declaration = rules.split('\n').find((line) => line.startsWith('- The only valid metadata statuses are '));
  expect(declaration).toBeDefined();
  const statuses = [...declaration!.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  expect(statuses).toEqual([...CHANGE_STATUSES]);
  expect(new Set(statuses).size).toBe(statuses.length);
  expect(content).not.toMatch(/six statuses|These six are the only valid statuses/);
  const gates = section(content, '## Gates (why some transitions are conditional)');
  expect(gates).toMatch(/Plan sign-off pause[\s\S]*AWAITING_HUMAN_PLAN_SIGNOFF/);
  expect(gates).toMatch(/halting at Tastemaker sign-off[\s\S]*without auto-committing or archiving/);
}

function assertBackfill(content: string): void {
  const constitution = section(content, '### Dimension 3/5: Constitution & Conventions');
  const entries = [...constitution.matchAll(/^- \*\*([^*]+)\*\*: (.+)$/gm)];
  expect(entries.map((entry) => entry[1])).toEqual([
    'Debt Eligibility', 'Complete Rule Audit', 'Applicable Rules', 'Floors & Evidence',
  ]);
  const [eligibility, coverage, applicable, floors] = entries.map((entry) => entry[2]!);
  expect(eligibility).toMatch(/proven backfill.*`applicability: pre-existing-code`.*`FAIL` or `WARN`.*non-empty `statement`/);
  expect(eligibility).toMatch(/code location.*not introduced by this backfill.*artifact compliance/);
  expect(eligibility).toMatch(/`not-adjudicated`.*remains applicable/);
  expect(coverage).toMatch(/^When claiming debt, supply every current Constitution rule exactly once.*unknown, duplicate, or missing rules.*refused/);
  expect(applicable).toMatch(/current artifacts or mixed scope.*remain applicable.*`FAIL`\/`WARN`/);
  expect(floors).toMatch(/Only eligible debt rules.*does NOT lower the grade/);
  expect(floors).toMatch(/aggregate Constitution `FAIL`.*legacy flags.*remain grade-bearing/);
  expect(floors).toMatch(/raw rule results, machine ledger, and statements.*`verify.md`/);
  expect(constitution).not.toMatch(/Any pre-existing.*does NOT lower the grade|exclude.*whole.*dimension/i);
  const tests = section(content, '### Dimension 5/5: Tests');
  expect([...tests.matchAll(/^- \*\*([^*]+)\*\*/gm)].map((entry) => entry[1])).toEqual([
    'Test Absence Tolerance', 'Real Test Failures', 'Applicability',
  ]);
  expect(tests).toMatch(/actually \*\*fails\*\* is a hard \*\*FAIL\*\*/);
  expect(tests).toMatch(/existing `test-provenance` adjudication.*actual `FAIL`.*never excluded/);
  const fidelity = section(content, '### Dimension 2/5: Specification Compliance');
  expect(fidelity).toMatch(/unavailable.*`not-adjudicated`.*Real `FAIL` verdicts are strictly preserved/);
}

function assertPayload(content: string): void {
  const projection = section(content, '### JudgmentDimensionsInputSchema projection');
  const rules = projection.split('\n').filter((line) => line.startsWith('- `constitution_rules`:'));
  expect(rules).toHaveLength(1);
  const fields = /audit entries \(([^)]+)\)/.exec(rules[0]!)?.[1];
  expect(fields).toBeDefined();
  expect([...fields!.matchAll(/`([^`]+)`/g)].map((match) => match[1])).toEqual(Object.keys(ConstitutionRuleJudgmentSchema.shape));
  expect(rules[0]).toMatch(/only `pre-existing-code`.*`FAIL` or `WARN`.*non-whitespace `statement`/);
  expect(rules[0]).not.toMatch(/verify-backfill\.md/);
}

const sources = (key: string) => [
  ['source', () => read(`src/templates/${key}`)],
  ['bundle', () => BUNDLED_TEMPLATES[key]!],
] as const;

function commandBlock(content: string, command: string): string {
  const start = content.indexOf('- **`' + command);
  expect(start, `missing command ${command}`).toBeGreaterThanOrEqual(0);
  const end = content.indexOf('\n- **', start + 1);
  const block = content.slice(start, end < 0 ? undefined : end);
  expect(block.trim()).not.toBe('');
  return block;
}

function assertPublication(content: string): void {
  const log = commandBlock(content, 'prospec change log --skill');
  const signatures = [...log.matchAll(/`error\.publication\.(metadata|signoff): \{ ([^}]+) \}`/g)];
  expect(signatures.map((match) => [match[1], match[2]!.split(', ')])).toEqual([
    ['metadata', ['metadataPath', 'claimPath', 'metadata_published']],
    ['signoff', ['metadataPath', 'decisionPath?', 'decision_published', 'metadata_recorded']],
  ]);
  expect(log).not.toMatch(/Refused — with nothing written — unless|以下任一不成立即拒絕且不寫入任何檔案/);
  expect(log).toMatch(/METADATA_WRITE_FAILED[\s\S]*SIGNOFF_WRITE_FAILED/);
  expect(log).toMatch(/`metadata_recorded: true`/);
  expect(log).toMatch(/`metadata_published: true`/);
  const fields = [...log.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  expect(fields.indexOf('error.publication.metadata: { metadataPath, claimPath, metadata_published }')).toBeLessThan(fields.indexOf('error.publication.signoff: { metadataPath, decisionPath?, decision_published, metadata_recorded }'));
  for (const mode of ['tests', 'review']) {
    const block = commandBlock(content, `prospec check --record-${mode}`);
    expect(block).toMatch(/`METADATA_WRITE_FAILED`[\s\S]*`--json`[\s\S]*stderr/);
    expect(block).toMatch(/`recorded: false`/);
    expect(block).toMatch(/`metadata_published`/);
  }
}

function assertQuickBranches(prose: string): void {
  expect(prose.trim()).not.toBe('');
  const branches = [...prose.matchAll(/Draft-First|interactive|auto-draft/g)].map((match) => match[0]);
  expect(branches).toEqual(['Draft-First', 'interactive', 'auto-draft']);
  expect(prose).toMatch(/Draft-First selects(?: it)? autonomously|selected autonomously in Draft-First|Draft-First 自主選擇/);
  expect(prose).toMatch(/interactive mode (?:asks the human to decide|uses the human's decision)|confirmed(?: by the human)? in interactive mode|interactive 模式(?:由人類(?:決定|確認)|確認)/);
  expect(prose).toMatch(/assigns?(?: it)? from the triggering|assigned by (?:`prospec change )?auto-draft|auto-draft`? (?:依觸發的 (?:drift )?check 指派|指派)/);
  expect(prose).not.toMatch(/user-confirmed [`<]|經使用者確認的 [`<]|you confirm before it is written|經你確認後/);
}

function assertScaleWriters(content: string): void {
  const fields = section(content, '## Canonical field order');
  const rows = fields.split('\n').filter((line) => line.startsWith('| `scale` |'));
  expect(rows).toHaveLength(1);
  const cells = rows[0]!.split('|').map((cell) => cell.trim());
  expect(cells).toHaveLength(6);
  expect(cells[3]!.split('; ')).toEqual(['`prospec change scale`', '`change auto-draft` (create)']);
}

describe('failure-retention guidance contracts', () => {
  for (const [name, load] of sources(metadataKey)) {
    it(`keeps metadata scale writers free of a human-only precondition: ${name}`, () => assertScaleWriters(load()));
  }
  for (const directory of ['.claude/skills', '.agents/skills']) {
    for (const station of ['new-story', 'ff']) {
      it(`deploys the same metadata scale writers: ${directory}/${station}`, () => assertScaleWriters(read(`${directory}/prospec-${station}/references/metadata-format.md`)));
    }
  }
  it.each([
    ['human-only precondition', '`prospec change scale`;', '`prospec change scale`, after user-confirmed assessment;'],
    ['missing auto-draft writer', '; `change auto-draft` (create)', ''],
  ])('rejects metadata scale writer drift: %s', (_, before, after) => {
    const original = read(`src/templates/${metadataKey}`);
    assertScaleWriters(original);
    const mutated = original.replace(before, after);
    expect(mutated).not.toBe(original);
    expect(() => assertScaleWriters(mutated)).toThrow();
  });
  for (const [name, load] of [...sources(lifecycleKey), ['Knowledge copy', () => read('prospec/ai-knowledge/_status-lifecycle.md')] as const]) {
    it(`keeps lifecycle decisions and status vocabulary aligned: ${name}`, () => assertLifecycle(load()));
  }
  for (const [name, load] of sources(backfillKey)) {
    it(`keeps backfill debt selective and actual failures grade-bearing: ${name}`, () => assertBackfill(load()));
  }
  for (const [name, load] of sources(payloadKey)) {
    it(`projects the executable per-rule payload: ${name}`, () => assertPayload(load()));
  }
  for (const directory of ['.claude/skills', '.agents/skills']) {
    it(`deploys the backfill policy: ${directory}`, () => assertBackfill(read(`${directory}/prospec-verify/references/verify-backfill.md`)));
    for (const station of ['verify', 'review']) {
      it(`deploys the shared payload without an unavailable reference: ${directory}/${station}`, () => assertPayload(read(`${directory}/prospec-${station}/references/delegated-evidence-format.md`)));
    }
  }

  it.each(['Draft-First', 'interactive', 'auto-draft'])('rejects a missing quick selection branch: %s', (branch) => {
    const original = read(`src/templates/${lifecycleKey}`);
    assertLifecycle(original);
    const mutated = original.replace(new RegExp(`${branch}: [^;)]+;? ?`), '');
    expect(mutated).not.toBe(original);
    expect(() => assertLifecycle(mutated)).toThrow();
  });
  it.each(CHANGE_STATUSES)('rejects a missing declared metadata status: %s', (status) => {
    const original = read(`src/templates/${lifecycleKey}`);
    assertLifecycle(original);
    const rules = section(original, '## Rules');
    const declaration = rules.split('\n').find((line) => line.startsWith('- The only valid metadata statuses are '))!;
    const mutated = original.replace(declaration, declaration.replace('`' + status + '`', ''));
    expect(mutated).not.toBe(original);
    expect(() => assertLifecycle(mutated)).toThrow();
  });
  it.each([
    ['debt conditions', 'Only proven backfill may mark a rule', 'Any backfill may mark a rule'],
    ['complete audit', 'every current Constitution rule exactly once', 'selected Constitution rules'],
    ['debt-only coverage condition', 'When claiming debt, supply', 'Supply'],
    ['current artifacts', 'current artifacts or mixed scope', 'legacy code only'],
    ['aggregate failures', 'aggregate Constitution `FAIL`', 'aggregate Constitution `PASS`'],
    ['actual tests', 'actual `FAIL` is never excluded', 'actual `FAIL` is excluded'],
  ])('rejects weakened backfill policy: %s', (_, before, after) => {
    const original = read(`src/templates/${backfillKey}`);
    assertBackfill(original);
    const mutated = original.replace(before, after);
    expect(mutated).not.toBe(original);
    expect(() => assertBackfill(mutated)).toThrow();
  });
  it('rejects an omitted nested applicability field', () => {
    const original = read(`src/templates/${payloadKey}`);
    assertPayload(original);
    const mutated = original.replace(' and `applicability`)', ')');
    expect(mutated).not.toBe(original);
    expect(() => assertPayload(mutated)).toThrow();
  });

  for (const language of ['', '.zh-TW']) {
    it(`documents partial metadata and sign-off publication without a zero-write promise: ${language || 'English'}`, () => assertPublication(read(`docs/reference/cli-reference${language}.md`)));
    it(`rejects an omitted publication milestone: ${language || 'English'}`, () => {
      const original = read(`docs/reference/cli-reference${language}.md`);
      assertPublication(original);
      const mutated = original.replace('decision_published, metadata_recorded }', 'decision_published }');
      expect(mutated).not.toBe(original);
      expect(() => assertPublication(mutated)).toThrow();
    });
    it(`removes the unconditional backfill S/A promise: ${language || 'English'}`, () => {
      const content = read(`docs/guides/backfill${language}.md`);
      const finalVerify = content.split('\n').find((line) => line.startsWith('5. '));
      expect(finalVerify).toBeDefined();
      const fields = [...finalVerify!.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      expect(fields).toEqual(expect.arrayContaining(['applicability: pre-existing-code', 'statement', 'FAIL', 'not-adjudicated']));
      expect(finalVerify).not.toMatch(/so a faithful draft reaches S\/A|因此忠實的草稿能達 S\/A/);
      expect(finalVerify).toMatch(/actual tests|實際 tests/);
      expect(finalVerify).toMatch(/aggregate Constitution/);
    });
    for (const page of ['workflow', 'how-it-works']) {
      it(`keeps the public quick selection branches scoped to their explanation: ${page}${language}`, () => {
        const content = read(`docs/concepts/${page}${language}.md`);
        const prose = page === 'workflow'
          ? section(content, language ? '## 相稱流程（Scale）' : '## Right-Sized Process (Scale)').split('\n\n')[0]!
          : content.split('\n').find((line) => line.startsWith(language ? '圖中顯示標準路徑' : 'The diagram shows the standard path'))!;
        assertQuickBranches(prose);
        const mutated = prose.replace('Draft-First', 'human confirmation');
        expect(mutated).not.toBe(prose);
        expect(() => assertQuickBranches(mutated)).toThrow();
      });
    }
  }
  it.each(['docs/index.html', 'docs/i18n.js'])('keeps the website quick explanation aligned: %s', (file) => {
    const content = read(file);
    const prose = content.split('\n').find((line) => /(?:data-i18n="how\.compound"|'how\.compound':)/.test(line))!;
    assertQuickBranches(prose);
    const mutated = prose.replace('interactive', 'autonomous');
    expect(mutated).not.toBe(prose);
    expect(() => assertQuickBranches(mutated)).toThrow();
  });
});
