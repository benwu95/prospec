import { describe, it, expect } from 'vitest';
import { FeatureMapSchema, FEATURE_STATUSES } from '../../../src/types/feature-map.js';

describe('FeatureMapSchema (REQ-TYPES-031)', () => {
  it('parses a well-formed feature entry', () => {
    const parsed = FeatureMapSchema.safeParse({
      features: [
        {
          feature: 'sdd-workflow',
          modules: ['services', 'templates', 'cli', 'lib', 'types', 'tests'],
          req_prefixes: ['CHNG', 'SPEC'],
          status: 'active',
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.features[0]?.modules).toContain('lib');
    expect(parsed.success && parsed.data.features[0]?.req_prefixes).toEqual(['CHNG', 'SPEC']);
  });

  it('defaults status to active when omitted', () => {
    const parsed = FeatureMapSchema.safeParse({
      features: [{ feature: 'token-measurement', modules: ['lib'] }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.features[0]?.status).toBe('active');
  });

  it('treats req_prefixes as optional (a feature whose REQs are all module-prefix)', () => {
    const parsed = FeatureMapSchema.safeParse({
      features: [{ feature: 'feedback-promotion', modules: ['templates', 'tests'], status: 'active' }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.features[0]?.req_prefixes).toBeUndefined();
  });

  it('rejects an unknown status', () => {
    const parsed = FeatureMapSchema.safeParse({
      features: [{ feature: 'x', modules: ['lib'], status: 'retired' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing feature key', () => {
    const parsed = FeatureMapSchema.safeParse({
      features: [{ modules: ['lib'], status: 'active' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects modules that are not a string array', () => {
    const parsed = FeatureMapSchema.safeParse({
      features: [{ feature: 'x', modules: [1, 2], status: 'active' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('exposes exactly the two feature statuses', () => {
    expect([...FEATURE_STATUSES].sort()).toEqual(['active', 'deprecated']);
  });
});
