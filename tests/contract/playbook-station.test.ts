import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parsePlaybookEntries, PLAYBOOK_ENTRY_TOKEN_LIMIT } from '../../src/lib/lessons-ledger.js';
import { estimateTokens } from '../../src/lib/token-accounting.js';
import { formatLearnPlaybookOutput } from '../../src/cli/formatters/learn-output.js';
import { executePlaybook } from '../../src/services/learn.service.js';
import { normalizeStationName, SDD_STATIONS } from '../../src/types/status.js';

const PLAYBOOK = resolve('prospec/ai-knowledge/_playbook.md');
const ACTIVE_IDS = [
  'PB-001', 'PB-002', 'PB-003', 'PB-006', 'PB-007', 'PB-008', 'PB-010',
  'PB-011', 'PB-012', 'PB-013', 'PB-014', 'PB-015', 'PB-016', 'PB-017',
  'PB-018', 'PB-019', 'PB-020', 'PB-021', 'PB-022', 'PB-023', 'PB-024',
];
const COMPACT_IDS = ['PB-001', 'PB-003', 'PB-006', 'PB-007', 'PB-008', 'PB-014', 'PB-016', 'PB-018'];
// Only clauses not covered by each entry's Landing remain in live Guidance.
const RETAINED_GUIDANCE: Record<string, string> = {
  'PB-003': 'State the component’s own guarantees; reference another component’s REQ instead of describing its decision boundary. Derive set and condition wording from code predicates; quote registered canonical phrases verbatim. Use quantifiers (every, only, whenever, always, one per) and causal clauses (because, would) only when valid throughout the stated scope; otherwise delete them or reference the owning REQ.',
  'PB-008': 'On symbol or artifact moves, review prose and knowledge references; typechecking imports and adding a re-export do not finish that review.',
  'PB-014': "For CLI-produced artifacts, put per-field language assignments in the producing skill's format reference; identify artifact-language fields and English identifiers.",
  'PB-016': 'Finish source, test, knowledge and generated-count edits before recording tests or review; when an input changes, re-run the affected gates before recording provenance.',
  'PB-018': 'Build before any local subprocess smoke or workflow test that runs `dist/`; source-driven in-process e2e tests need no compiled binary. `pnpm test` has no pretest build.',
};

describe('repository playbook station migration', () => {
  it('declares valid stations for exactly the 21 active entries', () => {
    const entries = parsePlaybookEntries(readFileSync(PLAYBOOK, 'utf8')).filter((entry) => !entry.retired);
    expect(entries.map((entry) => entry.id)).toEqual(ACTIVE_IDS);
    for (const entry of entries) {
      expect(entry.stations, entry.id).not.toBeNull();
      expect(entry.stations, entry.id).not.toEqual([]);
      if (entry.stations === 'all' || entry.stations === null) continue;
      for (const station of entry.stations) expect(normalizeStationName(station), `${entry.id}: ${station}`).not.toBeNull();
    }
  });

  it('keeps each approved compact entry active, under the cap, with source, TTL and Landing', () => {
    const entries = parsePlaybookEntries(readFileSync(PLAYBOOK, 'utf8'));
    for (const id of COMPACT_IDS) {
      const entry = entries.find((candidate) => candidate.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.retired).toBe(false);
      expect(entry?.ttl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry?.tokens, id).toBeLessThanOrEqual(PLAYBOOK_ENTRY_TOKEN_LIMIT);
      expect(entry?.text).toMatch(/^- \*\*Source\*\*: .+\*\*Criteria\*\*: .+\*\*Kind\*\*: .+\*\*Approved-by\*\*:/m);
      expect(entry?.text).toContain('Landing:');
      expect(entry?.text).not.toMatch(/Incident narrative:|Absorbed ledger keys:/);
      const guidance = entry!.text.split('\n').filter((line) => line.startsWith('- **Guidance**:'));
      expect(guidance, id).toEqual(RETAINED_GUIDANCE[id] ? [`- **Guidance**: ${RETAINED_GUIDANCE[id]}`] : []);
    }
  });

  it('routes every station through service and formatter with a complete catalog and smaller output', async () => {
    const full = readFileSync(PLAYBOOK, 'utf8');
    const fullTokens = estimateTokens(full);
    for (const station of SDD_STATIONS) {
      const result = await executePlaybook({ cwd: process.cwd(), station });
      expect(result.mode, station).toBe('station');
      expect(result.catalog, station).toHaveLength(ACTIVE_IDS.length);
      const writes: string[] = [];
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writes.push(String(chunk));
        return true;
      });
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        formatLearnPlaybookOutput(result);
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }
      const output = writes.join('');
      expect(output, station).toContain(`${ACTIVE_IDS.length} active`);
      for (const id of ACTIVE_IDS) {
        expect(output.match(new RegExp(`^${id} ·`, 'gm'))?.length, `${station}: ${id}`).toBe(1);
      }
      for (const item of result.catalog) {
        const heading = item.entry.text.split('\n')[0];
        expect(output.includes(heading!), `${station}: ${item.entry.id}`).toBe(item.bodySelected);
      }
      expect(estimateTokens(output), station).toBeLessThan(fullTokens);
    }
  });
});
