import { describe, it, expect } from 'vitest';
import {
  assessRequirementCompliance,
} from '../../../src/lib/requirement-assessment.js';
import { iterateDeltaEntries } from '../../../src/lib/landing-fidelity.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import type { JudgmentItem, ScenarioFinding } from '../../../src/types/station.js';

describe('requirement-assessment (REQ-LIB-085, REQ-TYPES-104)', () => {
  const sampleDeltaSpec = `# Delta Spec

## ADDED

### REQ-TYPES-101: First requirement
**Feature:** core
**Story:** US-1
**Description:** First req description.
**Spec:**
Spec text for req 101.

### REQ-LIB-102: Second requirement
**Feature:** core
**Story:** US-1
**Description:** Second req description.
**Spec:**
Spec text for req 102.

\`\`\`markdown
### REQ-IGNORE-999: Fenced example
**Feature:** core
\`\`\`

## MODIFIED

### REQ-CLI-103: Third requirement
**Feature:** cli
**Story:** US-2
**Description:** Third req description.
**Spec:**
Spec text for req 103.

## REMOVED

### REQ-OLD-104: Fourth requirement
**Feature:** legacy
**Story:** US-2
**Description:** Removed requirement.
**Spec:**
This requirement was removed.
`;

  describe('iterateDeltaEntries with fences (T5)', () => {
    it('ignores headings inside code fences and extracts formal ADDED, MODIFIED, REMOVED entries', () => {
      const entries = iterateDeltaEntries(sampleDeltaSpec);
      const reqIds = entries.map((e) => e.reqId);
      expect(reqIds).toEqual([
        'REQ-TYPES-101',
        'REQ-LIB-102',
        'REQ-CLI-103',
        'REQ-OLD-104',
      ]);
      expect(reqIds).not.toContain('REQ-IGNORE-999');
    });
  });

  describe('assessRequirementCompliance', () => {
    const validItems: JudgmentItem[] = [
      {
        req_id: 'REQ-TYPES-101',
        result: 'PASS',
        evidence_kind: 'document',
        evidence: 'types/change.ts defines schema',
      },
      {
        req_id: 'REQ-LIB-102',
        result: 'PASS',
        evidence_kind: 'executable',
        evidence: 'unit test passed',
        repro: 'pnpm test test.ts',
      },
      {
        req_id: 'REQ-CLI-103',
        result: 'PASS',
        evidence_kind: 'executable',
        evidence: 'cli test passed',
        repro: 'pnpm test cli.test.ts',
      },
      {
        req_id: 'REQ-OLD-104',
        result: 'PASS',
        evidence_kind: 'document',
        evidence: 'verified removal from codebase',
      },
    ];

    it('returns not-applicable for scale: quick without creating synthetic REQ set', () => {
      const result = assessRequirementCompliance({
        scale: 'quick',
        deltaContent: sampleDeltaSpec,
        items: validItems,
      });
      expect(result.verdict).toBe('not-applicable');
      expect(result.isApplicable).toBe(false);
      expect(result.expectedReqIds).toEqual([]);
    });

    it.each(['PASS', 'FAIL', 'WARN'] as const)('R277-1 counts explicit not-adjudicated items while preserving %s floor', (floor) => {
      const result = assessRequirementCompliance({
        scale: 'full', deltaContent: sampleDeltaSpec,
        items: validItems.map((item, i) => ({ ...item, result: i === 0 ? 'not-adjudicated' : floor })),
        suppliedVerdict: floor, baselineStatus: 'frozen', contextStatus: 'valid',
      });
      expect(result.verdict).toBe(floor === 'PASS' ? 'not-adjudicated' : floor);
      expect(result.gapWarnings).toHaveLength(1);
      expect(result.gapWarnings[0]).toContain('REQ-TYPES-101');
    });

    it('normalizes empty delta spec with supplied PASS to not-adjudicated and adds gap warning (cannot yield vacuous PASS)', () => {
      const emptyDelta = `# Empty Delta\n## ADDED\nNo REQs here.\n`;
      const result = assessRequirementCompliance({
        scale: 'standard',
        deltaContent: emptyDelta,
        items: [],
        suppliedVerdict: 'PASS',
      });
      expect(result.verdict).toBe('not-adjudicated');
      expect(result.gapWarnings).toContain(
        'empty requirement set in delta-spec; cannot yield a vacuous PASS',
      );
    });

    it.each(['FAIL', 'WARN'] as const)('R277-16 retains a consistent %s finding floor with empty requirements', (result) => {
      const assessment = assessRequirementCompliance({
        scale: 'full', deltaContent: '## ADDED\n', suppliedVerdict: result,
        findings: [{ scenario_id: 'US-1.1', affected_req_ids: [], spec_location: 'delta-spec.md:1', result, summary: 'Missing scenario', evidence: 'No corresponding requirement' }],
      });
      expect(assessment.verdict).toBe(result);
      expect(assessment.gapWarnings).toHaveLength(1);
    });

    it('refuses unknown REQ id in judgment items', () => {
      const itemsWithUnknown = [
        ...validItems,
        {
          req_id: 'REQ-UNKNOWN-999',
          result: 'PASS' as const,
          evidence_kind: 'document' as const,
          evidence: 'unknown',
        },
      ];
      expect(() =>
        assessRequirementCompliance({
          scale: 'full',
          deltaContent: sampleDeltaSpec,
          items: itemsWithUnknown,
        }),
      ).toThrow(PrerequisiteError);
    });

    it('refuses duplicate REQ id in judgment items', () => {
      const itemsWithDuplicate = [...validItems, validItems[0]!];
      expect(() =>
        assessRequirementCompliance({
          scale: 'full',
          deltaContent: sampleDeltaSpec,
          items: itemsWithDuplicate,
        }),
      ).toThrow(PrerequisiteError);
    });

    it('fills missing items as not-adjudicated rows', () => {
      const partialItems = [validItems[0]!]; // only 101 provided, 102, 103, 104 missing
      const result = assessRequirementCompliance({
        scale: 'full',
        deltaContent: sampleDeltaSpec,
        items: partialItems,
        baselineStatus: 'frozen',
        contextStatus: 'valid',
      });
      expect(result.missingReqIds).toEqual(['REQ-LIB-102', 'REQ-CLI-103', 'REQ-OLD-104']);
      expect(result.items).toHaveLength(4);
      const missing102 = result.items.find((i) => i.req_id === 'REQ-LIB-102');
      expect(missing102?.result).toBe('not-adjudicated');
    });

    it('refuses supplied aggregate verdict less strict than item floor (e.g. aggregate PASS with item FAIL)', () => {
      const itemsWithFail: JudgmentItem[] = [
        validItems[0]!,
        { ...validItems[1]!, result: 'FAIL', repro: 'pnpm test' },
      ];
      expect(() =>
        assessRequirementCompliance({
          scale: 'full',
          deltaContent: sampleDeltaSpec,
          items: itemsWithFail,
          suppliedVerdict: 'PASS',
        }),
      ).toThrow(PrerequisiteError);
    });

    // Mandatory test combination 1: complete items + late-capture
    it('mandatory combo 1: full items + late-capture yields not-adjudicated with one gap warning', () => {
      const result = assessRequirementCompliance({
        scale: 'full',
        deltaContent: sampleDeltaSpec,
        items: validItems,
        suppliedVerdict: 'PASS',
        baselineStatus: 'late-capture',
        contextStatus: 'valid',
      });
      expect(result.verdict).toBe('not-adjudicated');
      expect(result.gapWarnings).toHaveLength(1);
      expect(result.gapWarnings[0]).toContain('late-capture');
    });

    // Mandatory test combination 2: complete items + missing context
    it('mandatory combo 2: full items + missing context yields not-adjudicated with one gap warning', () => {
      const result = assessRequirementCompliance({
        scale: 'full',
        deltaContent: sampleDeltaSpec,
        items: validItems,
        suppliedVerdict: 'PASS',
        baselineStatus: 'frozen',
        contextStatus: 'missing',
      });
      expect(result.verdict).toBe('not-adjudicated');
      expect(result.gapWarnings).toHaveLength(1);
      expect(result.gapWarnings[0]).toContain('context');
    });

    // Mandatory test combination 3: legacy aggregate FAIL + missing items
    it('mandatory combo 3: aggregate FAIL + missing items keeps FAIL as the floor (FAIL outranks gaps)', () => {
      const partialItems = [validItems[0]!]; // missing other 3
      const result = assessRequirementCompliance({
        scale: 'full',
        deltaContent: sampleDeltaSpec,
        items: partialItems,
        suppliedVerdict: 'FAIL',
        baselineStatus: 'frozen',
        contextStatus: 'valid',
      });
      expect(result.verdict).toBe('FAIL');
      expect(result.missingReqIds).toHaveLength(3);
    });

    it('finding FAIL establishes FAIL floor regardless of items', () => {
      const finding: ScenarioFinding = {
        scenario_id: 'US-1.1',
        affected_req_ids: ['REQ-TYPES-101'],
        spec_location: 'proposal.md:20',
        result: 'FAIL',
        summary: 'deviation detected',
        evidence: 'spec contradicts frozen scenario',
      };
      const result = assessRequirementCompliance({
        scale: 'full',
        deltaContent: sampleDeltaSpec,
        items: validItems,
        findings: [finding],
        baselineStatus: 'frozen',
        contextStatus: 'valid',
      });
      expect(result.verdict).toBe('FAIL');
    });

    it('all clean yields PASS when baseline is frozen and context is valid', () => {
      const result = assessRequirementCompliance({
        scale: 'full',
        deltaContent: sampleDeltaSpec,
        items: validItems,
        baselineStatus: 'frozen',
        contextStatus: 'valid',
      });
      expect(result.verdict).toBe('PASS');
      expect(result.gapWarnings).toHaveLength(0);
    });
  });
});
