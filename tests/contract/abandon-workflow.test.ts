import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderTemplate } from '../../src/lib/template.js';
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
function section(file: string, heading: string) {
  const body = read(file).split(heading)[1]?.split(/\n#{1,3} /)[0];
  expect(body, `${file}: ${heading}`).toBeTruthy(); return body!;
}
it('routes same-issue history through difference authoring before validation in story and ff', () => {
  for (const file of ['prospec-new-story', 'prospec-ff']) {
    const body = section(`src/templates/skills/${file}.hbs`, file === 'prospec-new-story' ? '### Phase 5:' : '### Phase 2:');
    expect(body.indexOf('retry_difference')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('retry_difference')).toBeLessThan(body.indexOf('prospec validate proposal'));
    expect(body).toMatch(/all scales|every scale/i);
    expect(body).not.toMatch(/Quick\/backfill are exempt/);
  }
});
it('defines metadata restoration boundaries, retry ownership and light-scale differences', () => {
  const metadata = section('src/templates/skills/references/metadata-format.hbs', '## Abandonment and retry');
  expect([...metadata.matchAll(/`(reason|at|from_status|escalation|overturned|premise_note|manifest)`/g)].map((m) => m[1]).sort())
    .toEqual(['at', 'escalation', 'from_status', 'manifest', 'overturned', 'premise_note', 'reason']);
  expect(metadata).toMatch(/-2.*-3/);
  expect(metadata).toContain('first available');
  expect(metadata).toMatch(/incomplete/i);
  expect(metadata).toContain('prospec change abandon'); expect(metadata).toContain('retry_of');
  const rendered = renderTemplate('skills/references/metadata-format.hbs', {});
  const assertRestoration = (text: string) => {
    const body = text.split('## Abandonment and retry\n')[1]?.split(/\n## /)[0];
    expect(body).toBeTruthy();
    expect(body).toContain('Preservation does not restore work');
    expect(body).toContain('human decision');
    expect(body).toContain('explicit authorization');
  };
  assertRestoration(rendered);
  for (const obligation of ['Preservation does not restore work', 'human decision', 'explicit authorization']) {
    const removed = rendered.replace(obligation, '');
    expect(removed).not.toBe(rendered);
    expect(() => assertRestoration(removed)).toThrow();
    const relocated = `${removed}\n## Elsewhere\n${obligation}\n`;
    expect(() => assertRestoration(relocated)).toThrow();
  }
  const proposal = section('src/templates/skills/references/proposal-format.hbs', '### Retrying an abandoned attempt');
  expect(proposal).toMatch(/quick.*backfill/); expect(proposal).toContain('difference-only'); expect(proposal).toContain('retry_difference');
});
it('keeps the abandon exit CLI-owned, preservation-first and outside successful archive', () => {
  const body = section('src/templates/skills/_escalation-guidance.hbs', '### Abandon an attempt');
  expect(body).toContain('prospec change abandon');
  expect(body.indexOf('Save work')).toBeGreaterThanOrEqual(0);
  expect(body.indexOf('metadata')).toBeGreaterThanOrEqual(0);
  expect(body.indexOf('Save work')).toBeLessThan(body.indexOf('metadata'));
  expect(body).toContain('.prospec/abandoned/');
  expect(body).toMatch(/partial|incomplete/); expect(body).not.toMatch(/git (reset|clean|checkout)|prospec archive/);
  for (const file of ['src/templates/init/status-lifecycle.md.hbs', 'prospec/ai-knowledge/_status-lifecycle.md']) {
    const terminal = section(file, '## Abandoned attempts');
    expect(terminal).toContain('retry_of'); expect(terminal).toContain('retry_difference'); expect(terminal).toContain('terminal');
    expect(terminal).toContain('.prospec/abandoned/'); expect(terminal).not.toContain('.prospec/archive/YYYY');
    expect(terminal).toMatch(/-2.*-3/);
    expect(terminal).toContain('preservedFileCount');
    expect(terminal).toContain('not restored');
    expect(terminal).toContain('human decision');
    expect(terminal).toContain('incomplete'); expect(terminal).toMatch(/not.*success|exclud/);
  }
});
it('documents the same command and recovery data in both CLI references', () => {
  for (const file of ['docs/reference/cli-reference.md', 'docs/reference/cli-reference.zh-TW.md']) {
    // The entry runs from its own command bullet to the next one, so its indented sub-bullets count and a sibling's do not.
    const text = read(file);
    const start = text.search(/^- \*\*`prospec change abandon/m);
    expect(start, file).toBeGreaterThanOrEqual(0);
    const rest = text.slice(start);
    const next = rest.slice(1).search(/^- \*\*`|^#/m);
    const entry = next < 0 ? rest : rest.slice(0, next + 1);
    expect(entry).toMatch(/-2.*-3/);
    expect(entry).toContain('preservedFileCount');
    expect(entry).toMatch(/not restored|未還原/);
    expect(entry).toMatch(/human decision|人類決定/);
    expect(entry).toMatch(/gitlink/);
    expect(entry).toContain('--reason'); expect(entry).toContain('--overturned'); expect(entry).toContain('retry_difference');
    expect(entry).toContain('.prospec/abandoned/'); expect(entry).not.toContain('.prospec/archive/');
    expect(entry).toContain('staged'); expect(entry).toContain('unstaged'); expect(entry).toContain('Prospec');
  }
});
