import { describe, it, expect } from 'vitest';
import { WORKFLOW_REASON_CODES } from '../../src/types/status.js';
import { EscalationReportSchema } from '../../src/types/cascade.js';
import { validateConfig } from '../../src/lib/config.js';

describe('frozen registries append-only (T16, REQ-TYPES-070, REQ-TYPES-086, REQ-TYPES-101)', () => {
  it('WORKFLOW_REASON_CODES contains ESCALATE_TO_HUMAN and preserves frozen order (append-only)', () => {
    // The reason codes are consumed by automations — order and values are frozen.
    // ESCALATE_TO_HUMAN was appended to the routing section.
    const expectedRoutingCodes = [
      'LIFECYCLE_NEXT',
      'QUICK_SKIPS_PLAN',
      'PROMOTION_INCOMPLETE',
      'DESIGN_REQUIRED',
      'PLAN_VERIFIER_FAILED',
      'TASKS_VERIFIER_FAILED',
      'REVIEW_PENDING',
      'VERIFY_PENDING',
      'VERIFY_GRADE_BELOW_BAR',
      'KNOWLEDGE_UNSYNCED',
      'TERMINAL',
      'ESCALATE_TO_HUMAN',
    ];

    const expectedGateCodes = [
      'CHECK_UNPROVABLE',
      'TASKS_INCOMPLETE',
      'METADATA_INCOMPLETE',
      'REVIEW_STALE',
      'TESTS_STALE',
      'DELTA_SPEC_STALE',
    ];

    expect([...WORKFLOW_REASON_CODES]).toEqual([...expectedRoutingCodes, ...expectedGateCodes]);
    expect(WORKFLOW_REASON_CODES).toContain('ESCALATE_TO_HUMAN');
    // Ensure no duplicates
    expect(new Set(WORKFLOW_REASON_CODES).size).toBe(WORKFLOW_REASON_CODES.length);
  });

  it('EscalationReportSchema.type contains station_retry_limit_exceeded (append-only)', () => {
    const validStationRetry = EscalationReportSchema.safeParse({
      type: 'station_retry_limit_exceeded',
      message: 'the prospec-plan verifier has failed 3 consecutive times',
      tradeoffOptions: ['fix verifier flaws'],
    });
    expect(validStationRetry.success).toBe(true);

    const validPersistentTest = EscalationReportSchema.safeParse({
      type: 'persistent_test_failure',
      message: 'test failure loop',
      diagnostics: { count: 3, threshold: 3, attemptIds: ['a', 'b', 'c'] },
      tradeoffOptions: ['ESCALATE_TO_HUMAN'],
    });
    expect(validPersistentTest.success).toBe(true);

    const invalidType = EscalationReportSchema.safeParse({
      type: 'unknown_failure_type',
      message: 'test',
    });
    expect(invalidType.success).toBe(false);
  });

  it('ProspecConfigSchema parses legacy .prospec.yaml without workflow section', () => {
    const legacyYaml = `
project:
  name: legacy-project
tech_stack:
  language: typescript
agents:
  - claude
`;
    const parsed = validateConfig(legacyYaml);
    expect(parsed.project.name).toBe('legacy-project');
    expect(parsed.workflow).toBeUndefined();
  });

  it('ProspecConfigSchema parses config with empty or configured workflow section', () => {
    const emptyWorkflowYaml = `
project:
  name: test-proj
workflow: {}
`;
    const parsedEmpty = validateConfig(emptyWorkflowYaml);
    expect(parsedEmpty.workflow).toEqual({});

    const configuredWorkflowYaml = `
project:
  name: test-proj
workflow:
  max_station_retries: 5
`;
    const parsedConfigured = validateConfig(configuredWorkflowYaml);
    expect(parsedConfigured.workflow?.max_station_retries).toBe(5);
  });
});
