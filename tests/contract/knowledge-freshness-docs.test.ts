import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The CLI reference pair describes `knowledge verify` and Knowledge Health by the source
// digest rule (REQ-SERVICES-090, REQ-LIB-015), in both languages.
const read = (file: string) => fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/reference', file), 'utf-8');

/** The bullet block under the `knowledge verify` command heading. */
function verifyEntry(doc: string): string {
  const start = doc.indexOf('- **`prospec knowledge verify <module>...`**');
  expect(start, 'knowledge verify entry not found').toBeGreaterThan(-1);
  const end = doc.indexOf('\n- **`', start + 1);
  const entry = doc.slice(start, end === -1 ? undefined : end);
  expect(entry.trim().length).toBeGreaterThan(0);
  return entry;
}

describe('CLI reference describes the source digest rule', () => {
  for (const file of ['cli-reference.md', 'cli-reference.zh-TW.md']) {
    it(`${file}: knowledge verify records source_digest and skips on an unchanged digest`, () => {
      const entry = verifyEntry(read(file));
      expect(entry).toContain('`source_digest`');
      expect(entry).toMatch(/digest/);
      expect(entry).toContain('`HEAD`');
    });

    it(`${file}: Knowledge Health compares the recorded source_digest with the current source`, () => {
      const line = read(file).split('\n').find((l) => /\*\*(Knowledge Health|知識庫健康)\*\*/.test(l));
      expect(line, 'Knowledge Health line not found').toBeDefined();
      expect(line).toContain('`source_digest`');
    });
  }
});
