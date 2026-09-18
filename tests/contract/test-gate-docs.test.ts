import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Public-doc contract for the fresh-test gates (REQ-TEMPLATES-234, REQ-CLI-043):
 * the bilingual CLI references and the root READMEs describe the same refusal
 * conditions, exemptions and counting limitation — in English technical tokens
 * both languages share, so parity is checked token by token.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');

/** The bullet block of one CLI-reference command entry (`- **\`prospec …\`**` → next bullet). */
function entryOf(doc: string, command: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`- **\`${command}`));
  expect(start, `entry not found: ${command}`).toBeGreaterThanOrEqual(0);
  let end = start + 1;
  while (end < lines.length && !lines[end]!.startsWith('- **`') && !lines[end]!.startsWith('#')) end++;
  const body = lines.slice(start, end).join('\n');
  expect(body.trim().length).toBeGreaterThan(0);
  return body;
}

const STATUS_TOKENS = ['implemented', 'prospec check --record-tests --change', 'tests: not-adjudicated', 'backfill'];
const MERGE_TOKENS = ['prospec check --record-tests --change', 'tests: not-adjudicated', 'test_failures', 'persistent_test_failure', 'ESCALATE_TO_HUMAN', '3'];

describe('reference/cli-reference*.md — change status and review merge refusal conditions', () => {
  const docs = { en: read('reference/cli-reference.md'), zh: read('reference/cli-reference.zh-TW.md') };

  it.each(Object.entries(docs))('%s: change status documents the fresh-green refusal, remediation and explicit exemptions', (_lang, doc) => {
    const entry = entryOf(doc, 'prospec change status');
    for (const token of STATUS_TOKENS) expect(entry, token).toContain(token);
    expect(entry).toMatch(/fresh|最新/);
  });

  it.each(Object.entries(docs))('%s: review merge distinguishes zero-write refusals from the metrics-only write and states the observed-attempt limitation', (_lang, doc) => {
    const entry = entryOf(doc, 'prospec review merge');
    for (const token of MERGE_TOKENS) expect(entry, token).toContain(token);
    expect(entry).toMatch(/metrics/);
    expect(entry).toMatch(/observ|觀測/);
    expect(entry).not.toMatch(/--max-test-failures|--threshold/);
  });

  it('both languages carry the same set of technical tokens (parity)', () => {
    for (const command of ['prospec change status', 'prospec review merge']) {
      const en = entryOf(docs.en, command);
      const zh = entryOf(docs.zh, command);
      for (const token of [...STATUS_TOKENS, ...MERGE_TOKENS]) {
        expect(en.includes(token), `${command}: ${token}`).toBe(zh.includes(token));
      }
    }
  });
});

describe('README workflow summaries — bilingual parity for the test gate', () => {
  it.each([
    ['README.md', 'Gated, resumable execution'],
    ['README.zh-TW.md', '受 gate 管理、可恢復的執行'],
  ])('%s names the fresh-green requirement on implemented and review merge in its workflow row', (file, rowTitle) => {
    const row = read(file).split('\n').find((l) => l.includes(rowTitle));
    expect(row, rowTitle).toBeDefined();
    expect(row).toContain('prospec check --record-tests');
    expect(row).toContain('implemented');
    expect(row).toContain('review merge');
    expect(row).toContain('not-adjudicated');
  });
});
