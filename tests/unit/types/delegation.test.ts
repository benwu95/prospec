import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as delegation from '../../../src/types/delegation.js';
import {
  CheckpointSchema,
  DELEGATION_AWAIT,
  DELEGATION_STATES,
  DELEGATION_STATIONS,
  DelegationTicketSchema,
  GIT_OPERATION_MARKERS,
  GIT_STATE_FACETS,
  RepoStateSchema,
  formatDelegationRole,
  formatDelegationStem,
  isNormalizedRelativePath,
  parseDelegationStem,
} from '../../../src/types/delegation.js';

const DIGEST = 'a'.repeat(64);
const OID = 'b'.repeat(40);

const state = (overrides: Record<string, unknown> = {}) => ({
  content: { digest: DIGEST },
  head: { ref: 'refs/heads/main', commit: OID, operations: [] },
  index: { digest: DIGEST, blockers: [] },
  refs: { entries: [{ name: 'refs/heads/main', oid: OID }] },
  stash: { entries: [] },
  ...overrides,
});

const ticket = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  station: 'review',
  role: 'reviewer',
  round: 1,
  attempt: 1,
  state: 'open',
  issued_at_ms: 1_700_000_000_000,
  pre_spawn: state(),
  payload_path: '.prospec/changes/x/.delegated/review-reviewer-1-1.json',
  snapshot: { path: '/tmp/prospec-snapshot-review-reviewer-1-1-abc', nonce: 'c'.repeat(32) },
  checkpoint: { entries: [], index_sha256: DIGEST },
  ...overrides,
});

describe('delegation stem grammar (REQ-TYPES-108)', () => {
  it('round-trips station, role, round and attempt', () => {
    const stem = formatDelegationStem({ station: 'review', role: 'lens-security', round: 2, attempt: 3 });
    expect(stem).toBe('review-lens-security-2-3');
    expect(parseDelegationStem(stem)).toEqual({ station: 'review', role: 'lens-security', round: 2, attempt: 3 });
  });

  it('keeps a role that itself ends in digits unambiguous — the last two segments are round and attempt', () => {
    expect(parseDelegationStem('verify-grader-2-1-4')).toEqual({ station: 'verify', role: 'grader-2', round: 1, attempt: 4 });
  });

  it.each([
    'plan-reviewer-1-1',
    'review-Reviewer-1-1',
    'review-reviewer-0-1',
    'review-reviewer-1-01',
    'review--1-1',
    'review-reviewer-1',
    'review-reviewer-1-1.json',
  ])('rejects %s', (stem) => {
    expect(parseDelegationStem(stem)).toBeNull();
  });

  it('refuses to format a key the parser would not read back', () => {
    expect(() => formatDelegationStem({ station: 'review', role: 'Bad Role', round: 1, attempt: 1 })).toThrow();
    expect(() => formatDelegationStem({ station: 'review', role: 'reviewer', round: 0, attempt: 1 })).toThrow();
  });
});

describe('formatDelegationRole (REQ-TYPES-108)', () => {
  it.each([
    ['C-1', 'c-1'],
    ['verifier-C-1', 'verifier-c-1'],
    ['R3_S 2', 'r3-s-2'],
    ['--Lens//Security--', 'lens-security'],
  ])('normalizes %s to %s', (input, role) => {
    expect(formatDelegationRole(input)).toBe(role);
    expect(parseDelegationStem(`review-${formatDelegationRole(input)}-1-1`)).not.toBeNull();
  });

  it('refuses text with no role characters', () => {
    expect(() => formatDelegationRole('--__--')).toThrow();
  });
});

describe('isNormalizedRelativePath (REQ-TYPES-108)', () => {
  it.each(['src/a.ts', 'a', 'dir/sub/file.txt'])('accepts %s', (p) => {
    expect(isNormalizedRelativePath(p)).toBe(true);
  });

  it.each(['', '/abs', 'a//b', './a', 'a/./b', '../a', 'a/../b', '.git/config', 'sub/.git/x', 'a\\b', 'a\0b'])(
    'rejects %j',
    (p) => {
      expect(isNormalizedRelativePath(p)).toBe(false);
    },
  );
});

describe('RepoStateSchema (REQ-TYPES-108)', () => {
  it('accepts a fully readable state and one with an unreadable facet', () => {
    expect(RepoStateSchema.safeParse(state()).success).toBe(true);
    expect(RepoStateSchema.safeParse(state({ content: { unreadable: 'unmerged input' } })).success).toBe(true);
  });

  it('refuses an unknown operation marker and an extra facet', () => {
    expect(
      RepoStateSchema.safeParse(state({ head: { ref: null, commit: null, operations: ['PULL_HEAD'] } })).success,
    ).toBe(false);
    expect(RepoStateSchema.safeParse({ ...state(), config: {} }).success).toBe(false);
  });

  it('refuses an unreadable facet without its reason — never a stand-in value', () => {
    expect(RepoStateSchema.safeParse(state({ content: { unreadable: '' } })).success).toBe(false);
  });

  it('defines exactly the five facets, in one place', () => {
    expect(Object.keys(RepoStateSchema.shape)).toEqual([...GIT_STATE_FACETS]);
    expect(GIT_OPERATION_MARKERS).toContain('BISECT_LOG');
  });
});

describe('DelegationTicketSchema (REQ-TYPES-108)', () => {
  it('accepts an open ticket', () => {
    expect(DelegationTicketSchema.safeParse(ticket()).success).toBe(true);
  });

  it('is closed — an unmodeled key is refused rather than carried', () => {
    expect(DelegationTicketSchema.safeParse(ticket({ note: 'x' })).success).toBe(false);
  });

  it('refuses a checkpoint entry whose path is not normalized', () => {
    for (const path of ['../escape', '/abs', '.git/HEAD', 'a//b']) {
      const bad = ticket({ checkpoint: { entries: [{ path, kind: 'regular', sha256: DIGEST }], index_sha256: DIGEST } });
      expect(DelegationTicketSchema.safeParse(bad).success, path).toBe(false);
    }
    const good = ticket({ checkpoint: { entries: [{ path: 'src/a.ts', kind: 'regular', sha256: DIGEST }], index_sha256: DIGEST } });
    expect(DelegationTicketSchema.safeParse(good).success).toBe(true);
  });

  it('records a refusal with the changed facets and the full observed state', () => {
    const refusal = { reason: 'mutated', detail: 'content changed', observed: state(), changed: ['content'] };
    expect(DelegationTicketSchema.safeParse(ticket({ state: 'refused', refusal })).success).toBe(true);
    expect(DelegationTicketSchema.safeParse(ticket({ state: 'refused', refusal: { ...refusal, changed: ['config'] } })).success).toBe(false);
  });

  it('records a human acceptance even when a facet was unreadable', () => {
    const accepted = { state: state({ content: { unreadable: 'nested repository' } }) };
    expect(DelegationTicketSchema.safeParse(ticket({ state: 'failed', failure: { at_ms: 1, reason: 'x', accepted } })).success).toBe(true);
  });
});

describe('the delegation contract holds no restore surface (REQ-TYPES-108)', () => {
  it('has no restore record on the ticket and no ignored list on the checkpoint', () => {
    expect(Object.keys(DelegationTicketSchema.shape)).not.toContain('restore');
    expect(DelegationTicketSchema.safeParse(ticket({ restore: { at_ms: 1, complete: true } })).success).toBe(false);
    expect(Object.keys(CheckpointSchema.shape)).toEqual(['entries', 'index_sha256']);
  });

  it('exports no restore, journal, pre-image or restore-count name', () => {
    const names = Object.keys(delegation);
    expect(names.filter((name) => /restore|journal|pre_?image|leftover/i.test(name))).toEqual([]);
  });

  it('names no host, tool, model or vendor', () => {
    const source = fs.readFileSync(new URL('../../../src/types/delegation.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/claude|codex|copilot|antigravity|gemini|openai|anthropic/i);
  });
});

describe('delegation constants (REQ-TYPES-108)', () => {
  it('pins the delegable stations, the lifecycle states and the await bounds', () => {
    expect(DELEGATION_STATIONS).toEqual(['review', 'verify']);
    expect(DELEGATION_STATES).toEqual(['open', 'received', 'refused', 'failed', 'consumed']);
    expect(DELEGATION_AWAIT).toEqual({ idleMinutes: 10, maxPolls: 6, maxRespawns: 1 });
  });
});
