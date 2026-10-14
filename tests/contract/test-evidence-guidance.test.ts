import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { renderTemplate } from '../../src/lib/template.js';
import { TestEvidenceReuseSchema } from '../../src/types/change.js';

function section(content: string, heading: string): string {
  const start = content.indexOf(`${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const body = content.slice(start + heading.length + 1);
  const end = body.search(/^#{1,3} /m);
  const result = (end < 0 ? body : body.slice(0, end)).trim();
  expect(result).not.toBe('');
  return result;
}

function assertWorkflow(content: string): void {
  const body = section(content, '### Step 0: Record the test run (before reading the report)');
  const [paths, execution] = body.split('**Execution and refresh**');
  expect(execution).toBeDefined();
  const steps = [...paths!.matchAll(/^\d+\. \*\*([^*]+)\*\*([^]*?)(?=^\d+\. |$(?![^]))/gm)];
  expect(steps.map(match => match[1])).toEqual(['Default', 'Opt-in assessment']);
  expect(paths).toContain('Choose exactly one path');
  expect(steps[0]![2]).toMatch(/Unless `test_evidence.exclude_knowledge: true`[^]*execute below/);
  expect(steps[1]![2]).toMatch(/prospec check --json[^]*prospec-report\.json[^]*structural\.checks\[\][^]*subjects[^]*test_evidence\[<name>\]/);
  expect(steps[1]![2]).toMatch(/only when[^]*enumerated[^]*certified/);
  expect(steps[1]![2]).toMatch(/Otherwise execute below/);
  expect(steps[1]![2]).toContain('skipped or exempt');
  expect(paths).not.toContain('--record-tests');
  expect(body.match(/prospec check --record-tests --change <name>/g)).toHaveLength(1);
  expect(execution).toMatch(/For default or uncertified opt-in[^]*run `prospec check --record-tests --change <name>` once[^]*re-run `prospec check --json` and re-read/);
  expect(execution).not.toMatch(/If certification is missing[^]*re-run/);

}

function assertMetadataIdentity(content: string): void {
  const body = section(content, '### Opt-in test identity');
  const yaml = body.match(/```yaml\n([^]*?)\n```/);
  expect(yaml).not.toBeNull();
  expect(parse(yaml![1]!)).toEqual({ fingerprint_version: 'test-inputs-v1', scope: 'repository-inputs-without-knowledge-v1', test_policy: { version: 1, excluded_path: 'prospec/ai-knowledge' } });
  expect(body).toMatch(/test_attempt[^]*test_provenance/);
}

function assertReportExample(content: string): void {
  const body = section(content, '## `test_evidence` — optional certified reuse diagnostics');
  const example = body.match(/```json\n([^]*?)\n```/);
  expect(example).not.toBeNull();
  const payload = JSON.parse(example![1]!);
  expect(Object.keys(payload).sort()).toEqual(Object.keys(TestEvidenceReuseSchema.shape).sort());
  expect(TestEvidenceReuseSchema.safeParse(payload).success).toBe(true);
  expect(body).toMatch(/Require the target in `test-provenance`'s `subjects`/);
  expect(body).toMatch(/Missing\/skipped\/exempt\/unenumerated[^]*never certifies/);
}

describe('Knowledge test evidence guidance', () => {
  it('renders ordered default, certified opt-in, and fallback paths after the entry gate', () => {
    const text = renderTemplate('skills/prospec-verify.hbs', {});
    assertWorkflow(text);
    expect(text.indexOf('## Entry Gate')).toBeLessThan(text.indexOf('### Step 0:'));
    const missingCertification = text.replace(' and has certified `test_evidence[<name>]`', '');
    expect(missingCertification).not.toBe(text);
    expect(() => assertWorkflow(missingCertification)).toThrow();
    for (const [before, after] of [
      ['For default or uncertified opt-in', 'For uncertified opt-in'],
      ['Choose exactly one path', 'Follow these steps'],
      ['**re-run `prospec check --json` and re-read the report**', 'continue'],
      ['execute below.', 'run `prospec check --record-tests --change <name>` and execute below.'],
    ]) {
      const mutant = text.replace(before!, after!);
      expect(mutant).not.toBe(text);
      expect(() => assertWorkflow(mutant)).toThrow();
    }
  });

  it('ships disabled configuration and an explicit versioned metadata example', () => {
    const example = parse(renderTemplate('references/config-example.yaml.hbs', {}));
    expect(example.test_evidence).toEqual({ exclude_knowledge: false });
    const initial = parse(renderTemplate('init/prospec.yaml.hbs', { project_name: 'example', base_dir: 'prospec' }));
    expect(initial.test_evidence?.exclude_knowledge ?? false).toBe(false);
    const metadata = renderTemplate('skills/references/metadata-format.hbs', {});
    assertMetadataIdentity(metadata);
    const withoutVersion = metadata.replace('  version: 1\n', '');
    expect(withoutVersion).not.toBe(metadata);
    expect(() => assertMetadataIdentity(withoutVersion)).toThrow();
  });

  it('certifies only enumerated targets with a schema-valid original-run payload', () => {
    const report = renderTemplate('skills/references/drift-report-format.hbs', {});
    assertReportExample(report);
    for (const [before, after] of [
      ['"exit_code": 0', '"exit_code": 1'],
      ["Require the target in `test-provenance`'s `subjects` too.", ''],
    ]) {
      const mutant = report.replace(before!, after!);
      expect(mutant).not.toBe(report);
      expect(() => assertReportExample(mutant)).toThrow();
    }
  });

  it.each(['docs/reference/cli-reference.md', 'docs/reference/cli-reference.zh-TW.md'])('keeps the public policy in the evidence section of %s', file => {
    const text = readFileSync(file, 'utf8');
    const heading = file.endsWith('zh-TW.md') ? '#### 審查與測試證據' : '#### Review and test evidence';
    const start = text.indexOf(`${heading}\n`);
    expect(start).toBeGreaterThanOrEqual(0);
    const tail = text.slice(start + heading.length);
    const end = tail.indexOf('\n#### ');
    expect(end).toBeGreaterThan(0);
    const body = tail.slice(0, end);
    const keys = [...body.matchAll(/`(test_evidence\.exclude_knowledge|test-inputs-v1|repository-inputs-without-knowledge-v1)`/g)].map(m => m[1]);
    expect(new Set(keys)).toEqual(new Set(['test_evidence.exclude_knowledge', 'test-inputs-v1', 'repository-inputs-without-knowledge-v1']));
    expect(body).toContain('--record-tests');
    expect(body).toContain('CI');
  });
});
