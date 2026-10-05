import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    expect(body).toMatch(/all scales|every scale/);
    expect(body).not.toMatch(/Quick\/backfill are exempt/);
  }
});
it('defines retry linkage ownership and a light-scale difference-only contract', () => {
  const metadata = section('src/templates/skills/references/metadata-format.hbs', '## Abandonment and retry');
  expect([...metadata.matchAll(/`(reason|at|from_status|escalation|overturned|premise_note|manifest)`/g)].map((m) => m[1]).sort())
    .toEqual(['at', 'escalation', 'from_status', 'manifest', 'overturned', 'premise_note', 'reason']);
  expect(metadata).toContain('prospec change abandon'); expect(metadata).toContain('retry_of');
  const proposal = section('src/templates/skills/references/proposal-format.hbs', '### Retrying an abandoned attempt');
  expect(proposal).toMatch(/quick.*backfill/); expect(proposal).toContain('difference-only'); expect(proposal).toContain('retry_difference');
});
it('keeps the abandon exit CLI-owned, preservation-first and outside successful archive', () => {
  const body = section('src/templates/skills/_escalation-guidance.hbs', '### Abandon an attempt');
  expect(body).toContain('prospec change abandon');
  expect(body.indexOf('preservation')).toBeGreaterThanOrEqual(0);
  expect(body.indexOf('metadata')).toBeGreaterThanOrEqual(0);
  expect(body.indexOf('preservation')).toBeLessThan(body.indexOf('metadata'));
  expect(body).toContain('.prospec/abandoned/');
  expect(body).toMatch(/partial|incomplete/); expect(body).not.toMatch(/git (reset|clean|checkout)|prospec archive/);
  for (const file of ['src/templates/init/status-lifecycle.md.hbs', 'prospec/ai-knowledge/_status-lifecycle.md']) {
    const terminal = section(file, '## Abandoned attempts');
    expect(terminal).toContain('retry_of'); expect(terminal).toContain('retry_difference'); expect(terminal).toContain('terminal');
    expect(terminal).toContain('.prospec/abandoned/'); expect(terminal).not.toContain('.prospec/archive/YYYY');
    expect(terminal).toContain('incomplete'); expect(terminal).toMatch(/not.*success|exclud/);
  }
});
it('documents the same command and recovery data in both public READMEs', () => {
  for (const file of ['README.md', 'README.zh-TW.md']) {
    const line = read(file).split('\n').find((value) => value.startsWith('- **`prospec change abandon'));
    expect(line).toBeTruthy();
    expect(line).toContain('--reason'); expect(line).toContain('--overturned'); expect(line).toContain('retry_difference');
    expect(line).toContain('.prospec/abandoned/'); expect(line).not.toContain('.prospec/archive/');
    expect(line).toContain('staged'); expect(line).toContain('unstaged'); expect(line).toContain('Prospec');
  }
});
