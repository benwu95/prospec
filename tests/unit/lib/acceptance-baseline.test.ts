import { describe, it, expect } from 'vitest';
import {
  parseProposalScenarios,
  computeAcceptanceDigest,
  decideFreezeScenarios,
  decideAmendScenarios,
  checkAcceptanceReadiness,
  checkProposalMismatch,
} from '../../../src/lib/acceptance-baseline.js';
import type { ChangeMetadata } from '../../../src/types/change.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

describe('acceptance-baseline (REQ-LIB-084, REQ-TYPES-103)', () => {
  const sampleProposal = `# Test Change

## User Stories

### US-1: First story [P1]

As a user,
I want a feature,
So that value.

**Acceptance Scenarios:**
- WHEN action occurs, THEN result is produced.
  and continuation line is preserved.
- WHEN another action occurs, THEN another result is produced.

### US-2: Second story [P2]

As an admin,
I want admin feature,
So that admin value.

**Acceptance Scenarios:**
- WHEN admin logs in, THEN dashboard is visible.

\`\`\`markdown
### US-3: Fenced example
**Acceptance Scenarios:**
- WHEN inside code fence, THEN it must be ignored.
\`\`\`
`;

  describe('parseProposalScenarios', () => {
    it('R277-2 parses a complete CRLF proposal identically, including continuations and fences', () => {
      const lf = parseProposalScenarios(sampleProposal);
      const crlf = parseProposalScenarios(sampleProposal.replaceAll('\n', '\r\n'));
      expect(crlf).toEqual(lf);
      expect(computeAcceptanceDigest(crlf)).toBe(computeAcceptanceDigest(lf));
    });
    it('extracts scenarios with combined story id and ordinal, preserving continuation lines', () => {
      const scenarios = parseProposalScenarios(sampleProposal, 'proposal.md');
      expect(scenarios).toHaveLength(3);
      expect(scenarios[0]).toEqual({
        id: 'US-1.1',
        story_id: 'US-1',
        text: 'WHEN action occurs, THEN result is produced.\n  and continuation line is preserved.',
        source: expect.stringMatching(/^proposal\.md:\d+$/),
      });
      expect(scenarios[1]).toEqual({
        id: 'US-1.2',
        story_id: 'US-1',
        text: 'WHEN another action occurs, THEN another result is produced.',
        source: expect.stringMatching(/^proposal\.md:\d+$/),
      });
      expect(scenarios[2]).toEqual({
        id: 'US-2.1',
        story_id: 'US-2',
        text: 'WHEN admin logs in, THEN dashboard is visible.',
        source: expect.stringMatching(/^proposal\.md:\d+$/),
      });
    });

    it('ignores headings and scenarios inside fenced code blocks', () => {
      const scenarios = parseProposalScenarios(sampleProposal, 'proposal.md');
      expect(scenarios.some((s) => s.story_id === 'US-3')).toBe(false);
      expect(scenarios.some((s) => s.text.includes('inside code fence'))).toBe(false);
    });

    it('rejects proposal with known placeholders', () => {
      const placeholderProposal = `## User Stories
### US-1: Story
**Acceptance Scenarios:**
- WHEN [condition], THEN [expected outcome]
`;
      expect(() => parseProposalScenarios(placeholderProposal)).toThrow(PrerequisiteError);
    });

    it('rejects duplicate User Story IDs', () => {
      const duplicateUS = `## User Stories
### US-1: Story 1
**Acceptance Scenarios:**
- WHEN a, THEN b.
### US-1: Duplicate Story 1
**Acceptance Scenarios:**
- WHEN c, THEN d.
`;
      expect(() => parseProposalScenarios(duplicateUS)).toThrow(PrerequisiteError);
    });

    it('rejects User Story missing Acceptance Scenarios section', () => {
      const missingSection = `## User Stories
### US-1: Story 1
As a user...
### US-2: Story 2
**Acceptance Scenarios:**
- WHEN a, THEN b.
`;
      expect(() => parseProposalScenarios(missingSection)).toThrow(PrerequisiteError);
    });

    it('rejects empty scenarios block', () => {
      const emptyScenarios = `## User Stories
### US-1: Story 1
**Acceptance Scenarios:**
`;
      expect(() => parseProposalScenarios(emptyScenarios)).toThrow(PrerequisiteError);
    });
  });

  describe('computeAcceptanceDigest', () => {
    it('produces identical digest for LF and CRLF text', () => {
      const lfText = 'WHEN a,\nTHEN b.';
      const crlfText = 'WHEN a,\r\nTHEN b.';
      const scenariosLf = [{ id: 'US-1.1', text: lfText }];
      const scenariosCrlf = [{ id: 'US-1.1', text: crlfText }];

      const digestLf = computeAcceptanceDigest(scenariosLf);
      const digestCrlf = computeAcceptanceDigest(scenariosCrlf);

      expect(digestLf).toBe(digestCrlf);
    });

    it('is sensitive to scenario order and whitespace', () => {
      const s1 = { id: 'US-1.1', text: 'WHEN a, THEN b.' };
      const s2 = { id: 'US-1.2', text: 'WHEN c, THEN d.' };
      const d1 = computeAcceptanceDigest([s1, s2]);
      const d2 = computeAcceptanceDigest([s2, s1]);
      const d3 = computeAcceptanceDigest([{ ...s1, text: 'WHEN a,  THEN b.' }, s2]);

      expect(d1).not.toBe(d2);
      expect(d1).not.toBe(d3);
    });
  });

  describe('decideFreezeScenarios', () => {
    const baseMeta: ChangeMetadata = {
      name: 'freeze-test',
      created_at: '2026-09-20T00:00:00Z',
      status: 'story',
    };

    it('creates initial revision 1 with origin "story" when status is story', () => {
      const decision = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      expect(decision.kind).toBe('freeze');
      if (decision.kind === 'freeze') {
        expect(decision.newRevision.revision).toBe(1);
        expect(decision.newRevision.origin).toBe('story');
        expect(decision.newRevision.captured_status).toBe('story');
        expect(decision.newRevision.previous_digest).toBeUndefined();
        expect(decision.updatedAcceptance.current_revision).toBe(1);
        expect(decision.updatedAcceptance.revisions).toHaveLength(1);
      }
    });

    it('sets origin to "late-capture" when status is implemented', () => {
      const decision = decideFreezeScenarios({
        metadata: { ...baseMeta, status: 'implemented' },
        proposalContent: sampleProposal,
      });
      expect(decision.kind).toBe('freeze');
      if (decision.kind === 'freeze') {
        expect(decision.newRevision.origin).toBe('late-capture');
        expect(decision.newRevision.captured_status).toBe('implemented');
      }
    });

    it('returns no-op when re-freezing identical content', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      const metaWithBaseline: ChangeMetadata = {
        ...baseMeta,
        acceptance: freeze1.updatedAcceptance,
      };

      const decision = decideFreezeScenarios({
        metadata: metaWithBaseline,
        proposalContent: sampleProposal,
      });
      expect(decision.kind).toBe('no-op');
    });

    it('refuses freeze when already frozen with different content (directing to amend)', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      const metaWithBaseline: ChangeMetadata = {
        ...baseMeta,
        acceptance: freeze1.updatedAcceptance,
      };

      const alteredProposal = sampleProposal + '\n- WHEN new, THEN altered.\n';
      expect(() =>
        decideFreezeScenarios({
          metadata: metaWithBaseline,
          proposalContent: alteredProposal,
        }),
      ).toThrow(PrerequisiteError);
    });

    it('refuses freeze when status is verified or archived', () => {
      expect(() =>
        decideFreezeScenarios({
          metadata: { ...baseMeta, status: 'verified' },
          proposalContent: sampleProposal,
        }),
      ).toThrow(PrerequisiteError);

      expect(() =>
        decideFreezeScenarios({
          metadata: { ...baseMeta, status: 'archived' },
          proposalContent: sampleProposal,
        }),
      ).toThrow(PrerequisiteError);
    });
  });

  describe('decideAmendScenarios', () => {
    const baseMeta: ChangeMetadata = {
      name: 'amend-test',
      created_at: '2026-09-20T00:00:00Z',
      status: 'story',
    };

    it('creates revision 2 with previous_digest and reason', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      const metaWithBaseline: ChangeMetadata = {
        ...baseMeta,
        status: 'implemented',
        acceptance: freeze1.updatedAcceptance,
      };

      const newProposal = sampleProposal.replace(
        'dashboard is visible',
        'dashboard and settings are visible',
      );

      const decision = decideAmendScenarios({
        metadata: metaWithBaseline,
        proposalContent: newProposal,
        reason: 'added settings view requirement',
        expectedDigest: freeze1.newRevision.digest,
      });

      expect(decision.kind).toBe('amend');
      if (decision.kind === 'amend') {
        expect(decision.newRevision.revision).toBe(2);
        expect(decision.newRevision.previous_digest).toBe(freeze1.newRevision.digest);
        expect(decision.newRevision.reason).toBe('added settings view requirement');
        expect(decision.newRevision.origin).toBe('late-capture');
        expect(decision.newRevision.captured_status).toBe('implemented');
        expect(decision.updatedAcceptance.current_revision).toBe(2);
        expect(decision.updatedAcceptance.revisions).toHaveLength(2);
      }
    });

    it('returns no-op when amending with identical content and matching expected digest', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      const metaWithBaseline: ChangeMetadata = {
        ...baseMeta,
        acceptance: freeze1.updatedAcceptance,
      };

      const decision = decideAmendScenarios({
        metadata: metaWithBaseline,
        proposalContent: sampleProposal,
        reason: 'same content',
        expectedDigest: freeze1.newRevision.digest,
      });

      expect(decision.kind).toBe('no-op');
    });

    it('refuses amend when expectedDigest does not match current digest', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      const metaWithBaseline: ChangeMetadata = {
        ...baseMeta,
        acceptance: freeze1.updatedAcceptance,
      };

      expect(() =>
        decideAmendScenarios({
          metadata: metaWithBaseline,
          proposalContent: sampleProposal,
          reason: 'update',
          expectedDigest: 'wrong-digest-1234',
        }),
      ).toThrow(PrerequisiteError);
    });

    it('refuses amend without reason or expected digest', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      const metaWithBaseline: ChangeMetadata = {
        ...baseMeta,
        acceptance: freeze1.updatedAcceptance,
      };

      expect(() =>
        decideAmendScenarios({
          metadata: metaWithBaseline,
          proposalContent: sampleProposal,
          reason: '  ',
          expectedDigest: freeze1.newRevision.digest,
        }),
      ).toThrow(PrerequisiteError);
    });

    it('refuses amend on verified or archived status', () => {
      const freeze1 = decideFreezeScenarios({
        metadata: baseMeta,
        proposalContent: sampleProposal,
      });
      if (freeze1.kind !== 'freeze') throw new Error('expected freeze');

      expect(() =>
        decideAmendScenarios({
          metadata: { ...baseMeta, status: 'verified', acceptance: freeze1.updatedAcceptance },
          proposalContent: sampleProposal,
          reason: 'update',
          expectedDigest: freeze1.newRevision.digest,
        }),
      ).toThrow(PrerequisiteError);
    });
  });

  describe('checkAcceptanceReadiness', () => {
    it('returns not ready for pending acceptance (empty revisions)', () => {
      const meta: ChangeMetadata = {
        name: 'pending-test',
        created_at: '2026-09-20T00:00:00Z',
        status: 'story',
        acceptance: {
          version: 1,
          revisions: [],
        },
      };
      const r = checkAcceptanceReadiness(meta);
      expect(r.ready).toBe(false);
      expect(r.suggestion).toContain('--freeze-scenarios');
    });

    it('returns ready for frozen acceptance', () => {
      const meta: ChangeMetadata = {
        name: 'frozen-test',
        created_at: '2026-09-20T00:00:00Z',
        status: 'story',
        acceptance: {
          version: 1,
          current_revision: 1,
          revisions: [
            {
              revision: 1,
              digest: 'd1',
              captured_at: '2026-09-20T00:00:00Z',
              captured_status: 'story',
              origin: 'story',
              reason: 'initial',
              scenarios: [{ id: 'US-1.1', story_id: 'US-1', text: 't', source: 'p.md:1' }],
            },
          ],
        },
      };
      const r = checkAcceptanceReadiness(meta);
      expect(r.ready).toBe(true);
    });

    it('allows legacy metadata without acceptance contract with warning', () => {
      const meta: ChangeMetadata = {
        name: 'legacy-test',
        created_at: '2026-09-20T00:00:00Z',
        status: 'story',
      };
      const r = checkAcceptanceReadiness(meta);
      expect(r.ready).toBe(true);
      expect(r.legacy).toBe(true);
    });
  });

  describe('checkProposalMismatch', () => {
    it('detects when proposal scenarios differ from baseline', () => {
      const scenarios1 = parseProposalScenarios(sampleProposal);
      const revision1 = {
        revision: 1,
        digest: computeAcceptanceDigest(scenarios1),
        captured_at: '2026-09-20T00:00:00Z',
        captured_status: 'story' as const,
        origin: 'story' as const,
        reason: 'initial',
        scenarios: scenarios1,
      };

      expect(checkProposalMismatch(sampleProposal, revision1)).toBe(false);

      const modifiedProposal = sampleProposal.replace('dashboard is visible', 'something else');
      expect(checkProposalMismatch(modifiedProposal, revision1)).toBe(true);
    });
  });
});
