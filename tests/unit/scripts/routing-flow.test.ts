import { describe, it, expect } from 'vitest';
import {
  REGION_END,
  REGION_START,
  readRoutingRegion,
  renderRoutingFlow,
  replaceRoutingRegion,
} from '../../../scripts/routing-flow.js';
import { OTHERWISE, type RouteRule, type RoutingTable } from '../../../src/lib/status-router.js';

const rule = (id: string, overrides: Partial<RouteRule>): RouteRule => ({
  id, label: id, when: () => false, code: 'LIFECYCLE_NEXT', next: 'plan',
  gates: () => [], reasons: () => [], ...overrides,
});

const table: RoutingTable = {
  global: [rule('gate "quoted"', { code: 'PREMISE_INCOMPLETE', next: 'explore' })],
  branches: [
    {
      statuses: ['story'],
      rules: [
        rule('first?', { code: 'QUICK_SKIPS_PLAN', next: 'tasks' }),
        rule('halt?', { code: 'ESCALATE_TO_HUMAN', next: null }),
        rule('otherwise', { when: OTHERWISE }),
      ],
    },
    { statuses: ['abandoned', 'archived'], rules: [rule('otherwise', { when: OTHERWISE, code: 'TERMINAL', next: null })] },
  ],
};

describe('renderRoutingFlow', () => {
  const lines = renderRoutingFlow(table).split('\n');

  it('draws each scope as a ladder in rule order, Yes to the exit and No to the next rule', () => {
    expect(lines.slice(0, 2)).toEqual(['```mermaid', 'flowchart TD']);
    expect(lines).toContain('  g0{"gate #quot;quoted#quot;"} -->|Yes| g0L["PREMISE_INCOMPLETE<br>next: explore"]');
    expect(lines).toContain('  g0 -->|No| S{"status?"}');
    const story = lines.slice(lines.indexOf('  %% ═══ story ═══') + 1, lines.indexOf('  %% ═══ abandoned / archived ═══'));
    expect(story).toEqual([
      '  S -->|story| b0r0{"first?"} -->|Yes| b0r0L["QUICK_SKIPS_PLAN<br>next: tasks"]',
      '  b0r0 -->|No| b0r1{"halt?"} -->|Yes| b0r1L["ESCALATE_TO_HUMAN<br>next: null"]',
      '  b0r1 -->|No| b0r2L["LIFECYCLE_NEXT<br>next: plan"]',
    ]);
    expect(lines).toContain('  S -->|abandoned / archived| b1r0L["TERMINAL<br>next: null"]');
  });

  it('identifies an unconditional exit by OTHERWISE, not by its label', () => {
    const relabelled: RoutingTable = {
      global: [],
      branches: [{ statuses: ['story'], rules: [rule('anything', { when: OTHERWISE })] }],
    };
    expect(renderRoutingFlow(relabelled).split('\n').slice(2, 5)).toEqual([
      '  %% ═══ global rules ═══',
      '  S{"status?"}',
      '  %% ═══ story ═══',
    ]);
    expect(renderRoutingFlow(relabelled)).toContain('  S -->|story| b0r0L["LIFECYCLE_NEXT<br>next: plan"]');
    expect(renderRoutingFlow(relabelled)).not.toMatch(/-1\b/);
  });

  it('classes halts, terminals, stations and decisions, declaring only the classes it uses', () => {
    expect(lines).toContain('  class b0r1L readyNode');
    expect(lines).toContain('  class b1r0L successNode');
    expect(lines.filter((l) => l.startsWith('  classDef ')).map((l) => l.split(' ')[3]))
      .toEqual(['decisionNode', 'readyNode', 'stateNode', 'successNode']);
    expect(lines.at(-1)).toBe('```');
  });
});

describe('replaceRoutingRegion', () => {
  const doc = `# Title\n\nprose before\n${REGION_START}\nold\n${REGION_END}\nprose after\n`;

  it('rewrites only the region between the markers', () => {
    const next = replaceRoutingRegion(doc, 'new');
    expect(next).toBe(`# Title\n\nprose before\n${REGION_START}\nnew\n${REGION_END}\nprose after\n`);
    expect(readRoutingRegion(next)).toBe('new');
  });

  it.each([
    ['missing start', doc.replace(REGION_START, '')],
    ['missing end', doc.replace(REGION_END, '')],
    ['duplicated start', doc.replace(REGION_START, `${REGION_START}\n${REGION_START}`)],
    ['reversed markers', `${REGION_END}\nold\n${REGION_START}\n`],
  ])('refuses a document with %s', (_case, broken) => {
    expect(() => replaceRoutingRegion(broken, 'new')).toThrow(/exactly one/);
    expect(readRoutingRegion(broken)).toBeNull();
  });
});
