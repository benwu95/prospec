import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncToFeatureSpecs } from '../../src/services/archive.service.js';
import { collectDeltaSpecLandingFidelity, collectReqIdUniqueness } from '../../src/lib/drift-sources.js';
import { evaluateReqIdUniqueness } from '../../src/lib/drift-checker.js';
import { indexSpec, readSpecCounters } from '../../src/lib/spec-headings.js';

const ID = 'REQ-DEMO-002';
const RECORD = `#### ~~${ID}: retired~~\n**Removed**: 2026-01-01\n**Reason**: superseded\n- WHEN old, THEN retired\n`;
const HISTORY = '## Change History\n\n| Date | Change | Impact | Stories/REQs |\n|------|--------|--------|-------------|\n| 2026-01-01 | original | Added | REQ-DEMO-001 |\n';
const FRONT = '---\nfeature: demo\nstatus: active\nlast_updated: 2026-01-01\nstory_count: 1\nreq_count: 0\n---\n\n';
let root: string;
const features = () => path.join(root, 'prospec/specs/features');
const change = () => path.join(root, '.prospec/changes/safety');
function write(relative: string, content: string): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}
const read = (file = 'demo.md') => readFileSync(path.join(features(), file), 'utf8');
function delta(status = 'MODIFIED', body = '- WHEN new, THEN active', id = ID): void {
  write('.prospec/changes/safety/delta-spec.md', `## ${status}\n\n### ${id}: updated $& $1\n**Feature:** demo\n**Story:** US-1\n\n**Spec:**\n${body}\n\n**Dropped:**\n- WHEN old, THEN retired\n\n**Priority:** High\n`);
}
function sliced(body: string, history = HISTORY): void {
  write('prospec/specs/features/demo.md', `${FRONT}## Slices\n- [Requirements](./demo/reqs.md)\n- [History](./demo/history.md)\n`);
  write('prospec/specs/features/demo/reqs.md', body);
  write('prospec/specs/features/demo/history.md', history);
}
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'archive-spec-safety-'));
  write('.prospec/changes/safety/metadata.yaml', 'name: safety\ncreated_at: 2026-01-01T00:00:00.000Z\nstatus: tasks\n');
  delta();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Real files: the uniqueness collector traverses the filesystem, not memfs.
describe('retired requirements survive MODIFIED (#308)', () => {
  it.each(['deprecated', 'in-place', 'slice'])('preserves the %s record, inserts active and reports duplicate definitions', async (where) => {
    const body = `### US-1: demo\n\n${where === 'in-place' ? '' : '## Deprecated Requirements\n\n'}${RECORD}`;
    if (where === 'slice') sliced(body);
    else write('prospec/specs/features/demo.md', FRONT + body + '\n' + HISTORY);
    const result = await syncToFeatureSpecs(change(), features(), 'safety');
    const merged = read(where === 'slice' ? 'demo/reqs.md' : 'demo.md');
    expect(merged).toContain(RECORD);
    const active = indexSpec(merged).requirements.filter((r) => r.id === ID);
    expect(active).toHaveLength(1);
    expect(active[0]!.deprecated).toBe(false);
    expect(merged.slice(active[0]!.start, active[0]!.end)).toContain('- WHEN new, THEN active');
    expect(readSpecCounters(FRONT + merged)!.actual.req_count).toBe(1);
    expect(result.droppedBehavior).toEqual([]);
    expect(result.staleDeclarations).toEqual([]);
    const duplicates = evaluateReqIdUniqueness(collectReqIdUniqueness(features(), root));
    expect(duplicates.result.status).toBe('fail');
    expect(duplicates.findings).toHaveLength(2);
  });

  it.each(['mother', 'slice'])('selects active in a later slice after a struck %s definition', async (where) => {
    const active = `### US-1: demo\n### ${ID}: active\n- WHEN old, THEN retired\n\n`;
    sliced(where === 'slice' ? RECORD : '### US-0\n', active + HISTORY);
    if (where === 'mother') write('prospec/specs/features/demo.md', read().replace('## Slices', RECORD + '\n## Slices'));
    const before = read(where === 'mother' ? 'demo.md' : 'demo/reqs.md');
    const facts = collectDeltaSpecLandingFidelity(features(), root);
    expect(facts.entries[0]!.existingBody).toContain('- WHEN old, THEN retired');
    const result = await syncToFeatureSpecs(change(), features(), 'safety');
    expect(result.acknowledgedDrops).toHaveLength(1);
    expect(result.droppedBehavior).toEqual([]);
    expect(read('demo/history.md')).toContain(`### ${ID}: updated $& $1\n- WHEN new, THEN active`);
    expect(read(where === 'mother' ? 'demo.md' : 'demo/reqs.md')).toContain(RECORD);
    expect(indexSpec(read('demo/reqs.md')).requirements).toHaveLength(0);
    if (where === 'slice') expect(read('demo/reqs.md')).toBe(before);
  });
});

describe('fence-aware spec-sync anchors (#307)', () => {
  it.each(['Edge Cases', 'Deprecated Requirements', 'Change History'])('inserts ADDED before the first real %s, preserving all fenced headings', async (heading) => {
    const example = '```md\n## Edge Cases\n## Deprecated Requirements\n\n_(None)_\n## Change History\n```\n';
    const prefix = '### US-1: demo\n#### REQ-DEMO-001: existing\n' + example + '\n';
    sliced(prefix + `## ${heading}\n\n`);
    delta('ADDED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    const merged = read('demo/reqs.md');
    expect(merged.startsWith(prefix)).toBe(true);
    expect(merged).toContain(example);
    expect(merged.indexOf(`#### ${ID}:`)).toBeLessThan(merged.lastIndexOf(`## ${heading}`));
    expect(indexSpec(merged).requirements.find((r) => r.id === ID)?.deprecated).toBe(false);
  });

  it.each(['\n', '\r\n'])('REMOVED ignores fenced anchors and replaces only real leading placeholder (%j)', async (eol) => {
    const example = '```md\n## Deprecated Requirements\n\n_(None)_\n```\n'.replaceAll('\n', eol);
    const original = (FRONT + '### US-1\n').replaceAll('\n', eol) + example + `${eol}## Deprecated Requirements${eol}${eol}_(None)_${eol}${eol}## Other${eol}untouched${eol}`;
    write('prospec/specs/features/demo.md', original);
    delta('REMOVED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    const merged = read();
    expect(merged).toContain(example);
    expect(merged).toContain(`## Deprecated Requirements${eol}${eol}- **${ID}**: updated $& $1`);
    expect(merged).toContain(`${eol}${eol}## Other${eol}untouched${eol}`);
    expect(merged.split('_(None)_')).toHaveLength(2); // the example alone remains
  });

  it('REMOVED ignores a fenced non-empty Deprecated heading before the real section', async () => {
    const example = '~~~md\n## Deprecated Requirements\n- authored example\n~~~\n';
    write('prospec/specs/features/demo.md', FRONT + example + '\n## Deprecated Requirements\n- real existing entry\n');
    delta('REMOVED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    const merged = read();
    expect(merged).toContain(example);
    expect(merged.indexOf(`- **${ID}**`)).toBeGreaterThan(merged.lastIndexOf('## Deprecated Requirements'));
    expect(merged).toContain('- real existing entry\n');
  });

  it('does not treat a fenced example as blank leading space before a placeholder', async () => {
    const body = '## Deprecated Requirements\n\n```md\n_(None)_\n```\n_(None)_\n';
    write('prospec/specs/features/demo.md', FRONT + body);
    delta('REMOVED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    expect(read()).toContain('```md\n_(None)_\n```\n_(None)_\n');
    expect(read()).toContain(`- **${ID}**`);
  });

  it('only inserts history into its real section table, preserving outside and fenced tables', async () => {
    const table = '| Date | Change | Impact | Stories/REQs |\n|------|--------|--------|-------------|\n';
    const prefix = FRONT + '### US-1\n#### REQ-DEMO-001: existing\n' + table + '\n';
    const fenced = '```md\n' + table + '```\n';
    write('prospec/specs/features/demo.md', prefix + '## Change History\n' + fenced + '\n' + table + '\n## After\n' + table);
    delta('ADDED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    const merged = read();
    expect(merged).toContain(prefix.replace('last_updated: 2026-01-01', `last_updated: ${new Date().toISOString().slice(0, 10)}`));
    expect(merged).toContain(fenced);
    expect(merged).toContain('\n## After\n' + table);
    const history = merged.slice(merged.indexOf('## Change History'), merged.indexOf('## After'));
    expect(history).toContain('| safety | ADDED');
    expect(history.indexOf('| safety |')).toBeGreaterThan(history.indexOf('```\n'));
  });

  it('creates a missing history table within its section rather than at EOF', async () => {
    write('prospec/specs/features/demo.md', FRONT + '### US-1\n## Change History\nAuthored prose.\n\n## After\nUntouched.\n');
    delta('ADDED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    const merged = read();
    expect(merged.indexOf('| safety |')).toBeLessThan(merged.indexOf('## After'));
    expect(merged).toContain('Authored prose.\n\n## After\nUntouched.\n');
    expect(merged).toContain('| Date | Change | Impact | Stories/REQs |');
  });

  it.each(['mother', 'reqs', 'history'])('refuses an unclosed fence in %s before changing any file, including dry-run', async (where) => {
    sliced('### US-1\n## Deprecated Requirements\n' + RECORD);
    const file = where === 'mother' ? 'demo.md' : `demo/${where}.md`;
    write('prospec/specs/features/' + file, read(file) + '\n~~~md\n## Change History\n');
    const before = ['demo.md', 'demo/reqs.md', 'demo/history.md'].map((f) => read(f));
    for (const dryRun of [true, false]) {
      const result = await syncToFeatureSpecs(change(), features(), 'safety', dryRun);
      expect(result.files).toEqual([]);
      expect(result.refusedRequirements).toEqual([{ kind: 'unclosed-fence', feature: 'demo', reqId: ID, sourcePath: path.join(features(), file) }]);
      expect(result.pendingConvergence).toEqual([]);
      expect(['demo.md', 'demo/reqs.md', 'demo/history.md'].map((f) => read(f))).toEqual(before);
    }
  });
});

describe('section insertion boundary cases', () => {
  it('holds only the malformed feature at the sync layer', async () => {
    write('prospec/specs/features/demo.md', FRONT + '```\n');
    const malformed = read();
    write('.prospec/changes/safety/delta-spec.md', readFileSync(path.join(change(), 'delta-spec.md'), 'utf8') + '\n## ADDED\n\n### REQ-CLEAN-001: clean\n**Feature:** clean\n**Story:** US-1\n**Spec:**\nPreserved new feature.\n');
    const result = await syncToFeatureSpecs(change(), features(), 'safety');
    expect(result.refusedRequirements).toHaveLength(1);
    expect(read()).toBe(malformed);
    expect(read('clean.md')).toContain('Preserved new feature.');
  });

  it.each(['## Change History', '## Change History\n| Date | Change |\n|---|---|'])('keeps an EOF history anchor as a distinct line: %s', async (tail) => {
    write('prospec/specs/features/demo.md', FRONT + '### US-1\n' + tail);
    delta('ADDED');
    await syncToFeatureSpecs(change(), features(), 'safety');
    expect(read()).toMatch(/\n\| [0-9-]+ \| safety \|/);
    expect(read()).toContain(tail + '\n');
  });
});
