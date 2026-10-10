import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderTemplate } from '../../src/lib/template.js';
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const depth = /^#+/.exec(heading)![0].length;
  const rest = text.slice(start + heading.length);
  const end = rest.search(new RegExp(`^#{1,${depth}} `, 'm'));
  const body = end < 0 ? rest : rest.slice(0, end);
  expect(body.trim()).not.toBe('');
  return body;
}
function assertArchive(text: string): void {
  const archive = section(text, '### Phase 3: Execute Archive');
  for (const token of ['archivePath', 'archiveIdentity', 'main worktree', 'source', 'prospec history import --from']) expect(archive).toContain(token);
  expect(archive.indexOf('archiveIdentity')).toBeLessThan(archive.indexOf('Overwrite'));
  expect(archive).not.toContain('moves the bundle to `.prospec/archive/');
  const finalize = section(text, '### Phase 3.7: Finalize');
  expect(finalize).toContain('--bundle <archiveIdentity>');
  expect(finalize).toContain('original source project');
  expect(finalize).not.toMatch(/latest bundle|most recent bundle/);
}
it('binds archive summary and finalize to returned identity on both deployed hosts', () => {
  for (const file of ['src/templates/skills/prospec-archive.hbs', '.agents/skills/prospec-archive/SKILL.md', '.claude/skills/prospec-archive/SKILL.md']) assertArchive(read(file));
});
it('mutation-verifies archive obligations within their owning sections', () => {
  const text = renderTemplate('skills/prospec-archive.hbs', {});
  assertArchive(text);
  for (const token of ['archivePath', 'archiveIdentity', 'main worktree', 'prospec history import --from', '--bundle <archiveIdentity>', 'original source project']) {
    const changed = text.replaceAll(token, '');
    expect(changed).not.toBe(text);
    expect(() => assertArchive(changed)).toThrow();
    expect(() => assertArchive(changed + `\n## Elsewhere\n${token}\n`)).toThrow();
  }
});
it('uses canonical roots for harvest and learn while keeping committed evidence in source', () => {
  const harvest = section(read('src/templates/skills/references/promotion-format.hbs'), '## Harvest');
  expect(harvest).toContain('archivePath'); expect(harvest).toContain('archiveIdentity');
  expect(harvest).not.toContain('harvest `.prospec/archive/');
  const learn = section(read('src/templates/skills/prospec-learn.hbs'), '## Entry Gate');
  expect(learn).toContain('prospec history paths --json'); expect(learn).toContain('paths.archiveRoot');
  expect(learn).toContain('diagnostics');
});
it('keeps shared abandon guidance on returned paths with manual recovery boundaries', () => {
  const abandon = section(read('src/templates/skills/_escalation-guidance.hbs'), '### Abandon an attempt');
  for (const token of ['archiveDir', 'main worktree', 'partial', 'not restored', 'explicit authorization']) expect(abandon).toContain(token);
  expect(abandon).not.toContain('Save work → move → terminal metadata');
});
it('documents history commands and storage boundaries in both CLI references', () => {
  for (const file of ['docs/reference/cli-reference.md', 'docs/reference/cli-reference.zh-TW.md']) {
    const text = read(file);
    const start = text.indexOf('- **`prospec history paths [--json]`**');
    const end = text.indexOf('- **`prospec change scale', start);
    expect(start).toBeGreaterThanOrEqual(0); expect(end).toBeGreaterThan(start);
    const body = text.slice(start, end);
    for (const token of ['paths.archiveRoot', 'paths.abandonedRoot', 'diagnostics', 'prospec history import --from', '--dry-run', 'main worktree', 'projectPrefix']) expect(body).toContain(token);
    expect(text).toContain('prospec archive finalize <name> [--bundle <identity>] [--dry-run]');
  }
});
