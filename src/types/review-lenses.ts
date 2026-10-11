export interface ReviewLensDefinition {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly label: string;
  readonly classification: 'must-run' | 'conditional';
  readonly summary: string;
}

export const REVIEW_LENSES = [
  {
    id: 'correctness',
    aliases: ['correctness & edge cases'],
    label: 'Correctness & edge cases',
    classification: 'must-run',
    summary: 'Logic, boundaries, errors and state transitions.',
  },
  {
    id: 'security',
    aliases: ['security & data integrity', 'security-data-integrity', 'security/data-integrity'],
    label: 'Security & data integrity',
    classification: 'must-run',
    summary: 'Injection, secrets, authorization, filesystem writes, preservation, model/tool trust and dependencies; web checks when applicable.',
  },
  {
    id: 'spec-architecture',
    aliases: [],
    label: 'Spec-architecture',
    classification: 'must-run',
    summary: 'REQ contradictions, dependencies, conventions and ripple.',
  },
  {
    id: 'performance',
    aliases: ['efficiency / performance', 'efficiency/performance'],
    label: 'Efficiency / performance',
    classification: 'conditional',
    summary: 'Hot paths, repeated I/O, resource use or latency-sensitive changes.',
  },
  {
    id: 'maintainability',
    aliases: ['maintainability / DRY', 'maintainability/DRY'],
    label: 'Maintainability / DRY',
    classification: 'conditional',
    summary: 'Abstractions, duplicated helpers/guards/writers, documented single-source bypass.',
  },
  {
    id: 'docs-claims',
    aliases: [],
    label: 'Docs-claims',
    classification: 'conditional',
    summary: 'Documentation claims affected by changed behavior or interfaces.',
  },
  {
    id: 'parallel-site-completeness',
    aliases: ['parallel-site completeness'],
    label: 'Parallel-site completeness',
    classification: 'conditional',
    summary: 'Sibling sites implementing the same changed behavior.',
  },
  {
    id: 'test-quality',
    aliases: [],
    label: 'Test-quality',
    classification: 'conditional',
    summary: 'Changed tests: behavior coverage, independent oracles and failure sensitivity.',
  },
] as const satisfies readonly ReviewLensDefinition[];
