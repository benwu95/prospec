/**
 * Contract tests for Skill file format.
 *
 * Verifies that generated SKILL.md files conform to the expected format:
 * - YAML frontmatter with name and description
 * - Skill body with workflow instructions
 * - Reference files for skills that have them
 * - Agent entry config templates (all skills-dir under their skill paths)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderTemplate } from '../../src/lib/template.js';
import { BUNDLED_TEMPLATES } from '../../src/lib/bundled-templates.js';
import {
  AGENT_CONFIGS,
  SKILL_DEFINITIONS,
  intersectCapabilities,
} from '../../src/types/skill.js';
import { DRIFT_CHECK_IDS, KnowledgeHealthModuleSchema } from '../../src/types/drift-report.js';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET } from '../../src/types/config.js';
import { RELAYED_FIELD_MAX_CHARS } from '../../src/types/station.js';
import { getSkillReferences } from '../../src/services/agent-sync.service.js';
import {
  CHANGE_STATUSES,
  PROVENANCE_AUDITED_STATUSES,
  SCALE_FORBIDDEN_ARTIFACTS,
} from '../../src/types/change.js';
import { SDD_STATIONS } from '../../src/types/status.js';
import { findTable, splitTableRow } from '../../src/lib/markdown-table.js';
import { withoutFencedBlocks, hasUnclosedFence } from '../../src/lib/markdown-fences.js';
import { escapeYamlScalar, parseYaml } from '../../src/lib/yaml-utils.js';
import { bootstrapProductSpec } from '../../src/services/archive.service.js';
import { estimateTokens } from '../../src/lib/token-accounting.js';

const TEMPLATE_CONTEXT = {
  project_name: 'test-project',
  knowledge_base_path: 'prospec/ai-knowledge',
  constitution_path: 'prospec/CONSTITUTION.md',
  base_dir: 'prospec',
  tech_stack: { language: 'typescript', framework: 'express' },
  artifact_language: 'English',
  // Language scope injected by agent-sync from lib/language-policy — the same
  // resolved path sets the seeded Constitution rule renders (a single source, so
  // the two documents cannot declare contradictory scopes). Kept consistent with
  // `artifact_language` above: a fixture whose flag contradicts its language makes
  // every other entry-config render take the wrong branch.
  language_is_english: true,
  language_native_paths: '`.prospec/changes/**`, `prospec/specs/_archived-history/**`',
  language_english_paths: '`prospec/CONSTITUTION.md`, `prospec/ai-knowledge/**`',
  // Spread, never hand-listed: agent-sync injects the WHOLE resolved budget, and a
  // trio written out here left four fields undefined, which Handlebars renders as
  // the empty string — so a template naming a new budget stayed green.
  ...DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  // The delegated-payload ceilings agent-sync injects, spread for the same reason
  // as the budget above: a new relayed field must reach the fixture without a
  // second edit here, or its row renders empty and no assertion can miss it.
  ...Object.fromEntries(
    Object.entries(RELAYED_FIELD_MAX_CHARS).map(([f, m]) => [`relayed_max_${f}`, m]),
  ),
  // Harness capability flags injected by agent-sync from AGENT_CONFIGS. The
  // fixture models a fully-capable harness so the default renders exercise the
  // primary path; the degraded branch is rendered explicitly where it is asserted.
  can_spawn_subagent: true,
  can_worktree: true,
  can_background: true,
  trigger_words: 'test-trigger-alpha, test-trigger-beta',
  skills: SKILL_DEFINITIONS.map((s) => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers.join(', '),
    type: s.type,
    hasReferences: s.hasReferences,
  })),
};

// Sentinels owned by skills/_harness-capabilities.hbs — the single source for
// harness-degradation wording. Each lives in exactly one branch of that partial,
// so a consuming skill that re-inlines the prose (or a branch that leaks into the
// other) turns the assertions below red.
const CAPABILITY_LINE_LABEL = '**Harness capabilities**';
const DEGRADE_FLOOR = 'A degraded path is never a silent skip';
const RUNTIME_FALLBACK_SENTINEL = 'Should a spawn fail at runtime';
const NO_SPAWN_SENTINEL = 'no sub-agent primitive';

// slice from the heading line to the next ##/### heading; guard non-empty (PB-001)
//
// The boundary is decided on FENCE-MASKED lines while the body comes from the raw
// ones. A format reference legitimately shows a `## …` heading inside a fenced
// example (review-format.md's evidence section is one), and a slicer that stopped
// at it truncated the very section it was asked for — silently, so the
// assertions that ran against the stub still passed on the surviving half. When a
// fence is left open the mask hides the whole tail, so the honest move is to stop
// trusting it and fall back to raw lines (markdown-fences' own rule).
const sectionOf = (content: string, heading: string): string => {
  const lines = content.split('\n');
  const probe = hasUnclosedFence(lines) ? lines : withoutFencedBlocks(lines);
  const start = probe.findIndex((l) => l.startsWith(heading));
  expect(start, `section not found: ${heading}`).toBeGreaterThanOrEqual(0);
  let end = start + 1;
  while (end < probe.length && !/^#{2,3} /.test(probe[end]!)) end++;
  const body = lines.slice(start + 1, end).join('\n');
  expect(
    body.trim().length,
    `section not found or empty: ${heading}`,
  ).toBeGreaterThan(0);
  return body;
};

/** Collapse prose line wrapping so an assertion pins meaning, not wrap position. */
const flat = (text: string): string => text.replace(/\s+/g, ' ');

const KNOWLEDGE_LOADING_SKILLS = [
  'prospec-knowledge-generate',
  'prospec-knowledge-update',
  'prospec-plan',
  'prospec-implement',
  'prospec-verify',
];

describe('Knowledge budget rendering (no leaked symbol, values from injected context)', () => {
  // Sentinel budgets distinct from DEFAULT_KNOWLEDGE_TOKEN_BUDGET prove the rendered
  // numbers come from the injected context (agent-sync's resolveKnowledgeTokenBudget),
  // not a hardcoded literal in the template. Downstream projects can only read the
  // rendered number and a source they can inspect — never the internal TS symbol.
  // One distinct sentinel per budget field, DERIVED from the single source so a new
  // threshold gets one automatically. A hand-listed trio is what let the shared
  // partial keep a stale L2 row (naming Feature Specs at the module budget) while
  // every contract test stayed green: Handlebars renders an unknown variable as the
  // empty string, so an un-sentinelled field cannot be missed by any assertion.
  const BUDGET_SENTINELS = Object.fromEntries(
    Object.keys(DEFAULT_KNOWLEDGE_TOKEN_BUDGET).map((field, i) => [field, 4200 + i]),
  ) as Record<keyof typeof DEFAULT_KNOWLEDGE_TOKEN_BUDGET, number>;
  const ctx = { ...TEMPLATE_CONTEXT, ...BUDGET_SENTINELS, l1_per_file: 4242, l2_per_module: 2424, readme_max_lines: 77 };

  it('the shared loading-rules partial renders EVERY budget field', () => {
    const content = renderTemplate('skills/prospec-plan.hbs', { ...TEMPLATE_CONTEXT, ...BUDGET_SENTINELS });
    const table = content.slice(content.indexOf('## Progressive Knowledge Loading Strategy'));
    for (const [field, sentinel] of Object.entries(BUDGET_SENTINELS)) {
      expect(table, `${field} has no row in the loading-rules table`).toContain(String(sentinel));
    }
  });

  for (const name of KNOWLEDGE_LOADING_SKILLS) {
    it(`${name}: leaks no internal budget symbol and takes the L1 budget from context`, () => {
      const content = renderTemplate(`skills/${name}.hbs`, ctx);
      // negative — the internal TS constant name must never reach a downstream doc
      expect(content).not.toContain('DEFAULT_KNOWLEDGE_TOKEN_BUDGET');
      // positive — the L1 budget shown is the injected sentinel (via the shared partial)
      expect(content).toContain('4242');
      // no stale hardcoded default budget survived the variable-ization
      expect(content).not.toMatch(/1,800|1,000/);
    });
  }

  it('knowledge-generate takes the L2 token and README-line budgets from context too', () => {
    const content = renderTemplate('skills/prospec-knowledge-generate.hbs', ctx);
    expect(content).toContain('2424');
    expect(content).toContain('77');
  });
});

describe('Skill Format Contract', () => {
  describe('Skill template rendering', () => {
    for (const skill of SKILL_DEFINITIONS) {
      describe(`${skill.name}`, () => {
        it('should contain YAML frontmatter', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          // YAML frontmatter starts with ---
          expect(content.startsWith('---')).toBe(true);
          // Should have closing ---
          const secondDash = content.indexOf('---', 3);
          expect(secondDash).toBeGreaterThan(3);
        });

        it('should contain name field in frontmatter', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          const frontmatter = extractFrontmatter(content);
          // pin the per-skill value (name === filename === skill.name for all 15),
          // so a copy-pasted/duplicated name in the wrong template fails
          expect(frontmatter).toContain(`name: ${skill.name}`);
        });

        it('renders the frontmatter description from the single-source skill.description + Triggers (REQ-AGNT-031)', () => {
          // render exactly as the service does — skill_description is escaped for
          // the double-quoted YAML scalar (exercises the escaping path)
          const content = renderTemplate(`skills/${skill.name}.hbs`, {
            ...TEMPLATE_CONTEXT,
            skill_description: escapeYamlScalar(skill.description),
          });
          const frontmatter = extractFrontmatter(content);
          // single source: the escaped scalar must round-trip through YAML parse
          // back to skill.ts's raw description (+ Triggers suffix) — the registry
          // reads the same raw skill.description, so the two can no longer drift
          const parsed = parseYaml<{ description: string }>(frontmatter, `${skill.name}.hbs`);
          expect(parsed.description).toBe(
            `${skill.description} Triggers: ${TEMPLATE_CONTEXT.trigger_words}`,
          );
        });

        it('does not hardcode a description in the .hbs (single-source guard, mutation-verified)', () => {
          const src = fs.readFileSync(
            path.join(__dirname, '../../src/templates/skills', `${skill.name}.hbs`),
            'utf-8',
          );
          // the frontmatter description line must be the single-source template,
          // never a hardcoded string — hardcoding one turns this red
          expect(src).toContain(
            'description: "{{skill_description}} Triggers: {{trigger_words}}"',
          );
        });

      });
    }
  });

  describe('Trigger collision-free baselines (REQ-AGNT-033)', () => {
    // A cross-skill collision is: an exact duplicate trigger across two skills,
    // or one skill's trigger being a pure substring of another skill's trigger
    // (typing the longer would ambiguously match the shorter's skill). Same-skill
    // overlaps (e.g. `design` ⊂ `generate design`) are intentional and allowed.
    const detectCollisions = (
      defs: ReadonlyArray<{ name: string; triggers: string[] }>,
    ): string[] => {
      const flat = defs.flatMap((d) =>
        d.triggers.map((t) => ({ skill: d.name, t: t.toLowerCase() })),
      );
      const violations: string[] = [];
      for (let i = 0; i < flat.length; i++) {
        for (let j = 0; j < flat.length; j++) {
          if (i === j) continue;
          const a = flat[i]!;
          const b = flat[j]!;
          if (a.skill === b.skill) continue;
          if (a.t === b.t) {
            if (i < j) violations.push(`dup "${a.t}" in ${a.skill} & ${b.skill}`);
          } else if (b.t.includes(a.t)) {
            violations.push(`"${a.t}" (${a.skill}) ⊂ "${b.t}" (${b.skill})`);
          }
        }
      }
      return violations;
    };

    it('the baselines have zero cross-skill substring/duplicate collisions', () => {
      expect(detectCollisions(SKILL_DEFINITIONS)).toEqual([]);
    });

    it('the detector actually flags a collision (mutation guard)', () => {
      expect(
        detectCollisions([
          { name: 'a', triggers: ['plan'] },
          { name: 'b', triggers: ['quick plan'] },
        ]),
      ).not.toEqual([]);
    });

    it('this project .prospec.yaml Chinese triggers are collision-free (REQ-AGNT-033 AC3)', () => {
      // REQ-AGNT-033 brings the localized triggers into scope; guard this repo's
      // curated Chinese skill_triggers with the same detector so they cannot regress.
      const raw = fs.readFileSync(path.join(__dirname, '../../.prospec.yaml'), 'utf-8');
      const config = parseYaml<{ skill_triggers?: Record<string, string[]> }>(raw, '.prospec.yaml');
      const defs = Object.entries(config.skill_triggers ?? {}).map(([name, triggers]) => ({
        name,
        triggers,
      }));
      expect(defs.length).toBeGreaterThan(0);
      expect(detectCollisions(defs)).toEqual([]);
    });
  });

  describe('Trailing newline', () => {
    it('every skill template renders with exactly one trailing newline', () => {
      for (const skill of SKILL_DEFINITIONS) {
        const content = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
        expect(content.endsWith('\n'), `${skill.name} must end with a newline`).toBe(true);
        expect(
          content.endsWith('\n\n'),
          `${skill.name} must not end with a trailing blank line`,
        ).toBe(false);
      }
    });
  });

  describe('Reference templates', () => {
    // each reference's distinctive title heading pins the correct template
    // rendered — a non-empty smoke check would also pass a swapped template
    const REFERENCE_TEMPLATES: ReadonlyArray<readonly [string, string]> = [
      ['proposal-format.hbs', '# Proposal Format Reference'],
      ['plan-format.hbs', '# Plan Format Reference'],
      ['delta-spec-format.hbs', '# Delta Spec Format Reference'],
      ['tasks-format.hbs', '# Tasks Format Reference'],
      ['implementation-guide.hbs', '# Implementation Guide'],
      ['archive-format.hbs', '# Archive Summary Format Reference'],
      ['feature-spec-format.hbs', '# Feature Spec Format Reference'],
      ['product-spec-format.hbs', '# Product Spec Format Reference'],
      ['design-spec-format.hbs', '# Design Spec Format Reference'],
      ['interaction-spec-format.hbs', '# Interaction Spec Format Reference'],
      ['adapter-pencil.hbs', '# Platform Adapter: pencil.dev'],
      ['adapter-figma.hbs', '# Platform Adapter: Figma'],
      ['adapter-penpot.hbs', '# Platform Adapter: Penpot'],
      ['adapter-html.hbs', '# Platform Adapter: HTML'],
      ['review-format.hbs', '# Review Format Reference'],
      ['review-lenses-content.hbs', '# Review Lens Criteria Reference'],
      [
        'delegated-evidence-format.hbs',
        '# Delegated Payload Contract and Evidence Landing Format',
      ],
      ['debug-recovery-format.hbs', '# Debug & Recovery Reference'],
      ['drift-report-format.hbs', '# Drift Report (prospec-report.json) Format Reference'],
    ];

    for (const [ref, title] of REFERENCE_TEMPLATES) {
      it(`should render ${ref} with its title heading`, () => {
        const content = renderTemplate(
          `skills/references/${ref}`,
          TEMPLATE_CONTEXT,
        );
        expect(content).toContain(title);
      });
    }
  });

  // Regression guard for the document-drift-report-contract change (PB-001):
  // the drift-report reference must stay faithful to the frozen schema, and no
  // report-consuming skill may reinstate the phantom `knowledge_health.stale[]`
  // field (which never existed in DriftReportSchema and silently no-op'd learn's
  // freshness prioritization). Section-scoped + structural + negative + the
  // fidelity loop goes red if a DRIFT_CHECK_IDS entry is added without documenting it.
  describe('Drift report contract — schema fidelity + phantom-field guard (PB-001)', () => {
    const render = (t: string) => renderTemplate(t, TEMPLATE_CONTEXT);
    const REPORT_CONSUMERS = [
      'skills/prospec-verify.hbs',
      'skills/prospec-learn.hbs',
      'skills/references/promotion-format.hbs',
      'skills/references/drift-report-format.hbs',
    ];

    it('drift-report-format documents every DRIFT_CHECK_IDS entry (fidelity to the frozen schema)', () => {
      const ref = render('skills/references/drift-report-format.hbs');
      // Section-scope to the canonical id enumeration so ids restated elsewhere
      // (e.g. the "Gates skills read by id" line) cannot mask a deletion from the list.
      const enumStart = ref.indexOf('DRIFT_CHECK_IDS` set:');
      expect(enumStart, 'DRIFT_CHECK_IDS enumeration block not found').toBeGreaterThan(-1);
      const enumBlock = ref.slice(enumStart, ref.indexOf('Gates skills read by id', enumStart));
      for (const id of DRIFT_CHECK_IDS) {
        expect(enumBlock, `enumeration must document check id "${id}"`).toContain(id);
      }
    });

    it('drift-report-format documents knowledge_health as modules[] filtered by stale', () => {
      const ref = render('skills/references/drift-report-format.hbs');
      expect(ref).toContain('knowledge_health.modules');
      expect(ref).toContain('m.stale');
    });

    it('drift-report-format enumerates every knowledge_health module key the schema defines', () => {
      const ref = render('skills/references/drift-report-format.hbs');
      // Section-scope to the knowledge_health block so a key named elsewhere in
      // the document cannot stand in for one missing from THIS shape.
      const start = ref.indexOf('## `structural.knowledge_health`');
      expect(start, 'knowledge_health section not found').toBeGreaterThan(-1);
      const nextHeading = ref.indexOf('\n## ', start + 1);
      const section = ref.slice(start, nextHeading === -1 ? undefined : nextHeading);
      // The claim is about the documented JSON SHAPE, so scope to the fenced block:
      // prose mentioning a key elsewhere in the section must not stand in for the
      // shape listing it (deleting the key from the jsonc while keeping the prose
      // is exactly the omission this guard exists to catch).
      const fence = /```jsonc\n([\s\S]*?)```/.exec(section);
      expect(fence, 'knowledge_health section must carry a jsonc shape block').not.toBeNull();
      const shape = fence![1]!;
      expect(shape, 'jsonc shape block sliced empty').toContain('"modules"');
      // Derived from the Zod schema, never a hand-written list: a field added to
      // the frozen contract without documenting it here fails immediately.
      for (const key of Object.keys(KnowledgeHealthModuleSchema.shape)) {
        expect(shape, `knowledge_health shape must document the "${key}" key`).toContain(key);
      }
    });

    it('no report-consuming skill/reference reads the phantom knowledge_health.stale field', () => {
      for (const t of REPORT_CONSUMERS) {
        // Broader than the historical `stale[]` spelling — also catches a
        // dot-notation reintroduction (`knowledge_health.stale`).
        expect(
          render(t),
          `${t} must not read the non-existent field knowledge_health.stale`,
        ).not.toContain('knowledge_health.stale');
      }
    });

    it('report-consuming skills cite the real field knowledge_health.modules[]', () => {
      for (const t of [
        'skills/prospec-verify.hbs',
        'skills/prospec-learn.hbs',
        'skills/references/promotion-format.hbs',
      ]) {
        expect(render(t), `${t} must cite knowledge_health.modules[]`).toContain(
          'knowledge_health.modules[]',
        );
      }
    });
  });

  describe('Skill definitions', () => {
    it('should have 17 skill definitions', () => {
      expect(SKILL_DEFINITIONS).toHaveLength(17);
    });

    it('should include all expected skill names', () => {
      const names = SKILL_DEFINITIONS.map((s) => s.name);
      expect(names).toContain('prospec-explore');
      expect(names).toContain('prospec-new-story');
      expect(names).toContain('prospec-plan');
      expect(names).toContain('prospec-design');
      expect(names).toContain('prospec-tasks');
      expect(names).toContain('prospec-ff');
      expect(names).toContain('prospec-implement');
      expect(names).toContain('prospec-review');
      expect(names).toContain('prospec-verify');
      expect(names).toContain('prospec-learn');
      expect(names).toContain('prospec-knowledge-generate');
      expect(names).toContain('prospec-archive');
      expect(names).toContain('prospec-knowledge-update');
      expect(names).toContain('prospec-backfill-spec');
      expect(names).toContain('prospec-promote-backfill');
      expect(names).toContain('prospec-quickstart');
      expect(names).toContain('prospec-upgrade');
    });

    it('exactly the one-shot finishers are excludeFromEntryConfig (onboarding + upgrade)', () => {
      const excluded = SKILL_DEFINITIONS.filter((s) => s.excludeFromEntryConfig).map(
        (s) => s.name,
      );
      // Order-independent set: both periodic one-shot finishers, nothing else.
      // Mutation guard — adding/removing an entry-excluded skill turns this red.
      expect([...excluded].sort()).toEqual(['prospec-quickstart', 'prospec-upgrade']);
    });

    it('should have valid skill types', () => {
      const validTypes = ['Planning', 'Execution', 'Lifecycle'];
      for (const skill of SKILL_DEFINITIONS) {
        expect(validTypes).toContain(skill.type);
      }
    });

    it('skills with references should have hasReferences = true', () => {
      const skillsWithRefs = SKILL_DEFINITIONS.filter((s) => s.hasReferences);
      expect(skillsWithRefs.length).toBeGreaterThan(0);

      // Skills with references directories
      const refSkillNames = skillsWithRefs.map((s) => s.name);
      expect(refSkillNames).toContain('prospec-new-story');
      expect(refSkillNames).toContain('prospec-plan');
      expect(refSkillNames).toContain('prospec-design');
      expect(refSkillNames).toContain('prospec-tasks');
      expect(refSkillNames).toContain('prospec-ff');
      expect(refSkillNames).toContain('prospec-implement');
      expect(refSkillNames).toContain('prospec-review');
      expect(refSkillNames).toContain('prospec-verify');
      expect(refSkillNames).toContain('prospec-learn');
      expect(refSkillNames).toContain('prospec-archive');
      // backfill-spec externalizes feature-boundary-criteria (BL-039)
      expect(refSkillNames).toContain('prospec-backfill-spec');
      // promote-backfill bundles the four planning-format references it scaffolds against
      expect(refSkillNames).toContain('prospec-promote-backfill');
    });

    it('self-contained skills should have hasReferences = false', () => {
      // knowledge-generate / knowledge-update inline their canonical format
      // and defer to _module-readme-conventions.md — no references/ dir.
      // (backfill-spec moved to has-references in BL-039 — feature-boundary-criteria.)
      const selfContained = SKILL_DEFINITIONS.filter(
        (s) => !s.hasReferences,
      ).map((s) => s.name);
      expect(selfContained).toContain('prospec-knowledge-generate');
      expect(selfContained).toContain('prospec-knowledge-update');
    });
  });

  describe('Proposal format structure', () => {
    it('should contain 8+ required sections', () => {
      const content = renderTemplate(
        'skills/references/proposal-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('## Standard Format');
      expect(content).toContain('Background');
      expect(content).toContain('User Stories');
      expect(content).toContain('Stated Assumptions');
      expect(content).toContain('Edge Cases');
      expect(content).toContain('Functional Requirements');
      expect(content).toContain('Success Criteria');
      expect(content).toContain('Related Modules');
      expect(content).toContain('Open Questions');
      expect(content).toContain('Constitution Check');
    });

    it('should include INVEST and WHEN/THEN guidance', () => {
      const content = renderTemplate(
        'skills/references/proposal-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('INVEST');
      expect(content).toContain('WHEN');
      expect(content).toContain('THEN');
      expect(content).toContain('Priority');
    });

    it('should use Handlebars variables', () => {
      const content = renderTemplate(
        'skills/references/proposal-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('test-project');
      expect(content).toContain('prospec/ai-knowledge');
      expect(content).toContain('prospec/CONSTITUTION.md');
    });
  });

  describe('Feature spec format structure', () => {
    it('should contain Who & Why, User Stories, and Maintenance Rules', () => {
      const content = renderTemplate(
        'skills/references/feature-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Who & Why');
      expect(content).toContain('User Stories & Behavior Specifications');
      expect(content).toContain('Maintenance Rules');
      expect(content).toContain('Change History');
    });

    it('should define US-NNN User Story format', () => {
      const content = renderTemplate(
        'skills/references/feature-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('US-NNN');
      expect(content).toContain('As a');
      expect(content).toContain('I want');
      expect(content).toContain('So that');
    });

    it('should define REQ-XXX-NNN Behavior Spec format', () => {
      const content = renderTemplate(
        'skills/references/feature-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('REQ-{MODULE}-{NNN}');
      expect(content).toContain('Scenarios');
    });

    it('should contain Replace-in-Place maintenance rule', () => {
      const content = renderTemplate(
        'skills/references/feature-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Replace-in-Place');
      expect(content).toContain('Deprecation over Deletion');
    });

    it('should contain Deprecated Requirements and Edge Cases sections', () => {
      const content = renderTemplate(
        'skills/references/feature-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Deprecated Requirements');
      expect(content).toContain('Edge Cases');
      expect(content).toContain('Success Criteria');
    });
  });

  describe('Product spec format structure', () => {
    it('should contain Vision, Target Users, and Feature Map', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Vision');
      expect(content).toContain('Target Users');
      expect(content).toContain('Feature Map');
    });

    it('should contain Feature Map linking to features/', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('features/');
      expect(content).toContain('feature-slug');
    });

    it('should contain Product Principles and Roadmap', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Product Principles');
      expect(content).toContain('Roadmap');
    });

    it('should enforce 80 line limit guideline', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('80 lines');
    });

    // The two-month-old defect this pins: the reference required 7 sections while
    // the generator emitted 1, and nothing compared them. A reference no test
    // compares against is a wish (REQ-TESTS-075).
    it('requires exactly the sections the bootstrap emits, in both directions', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      const lines = content.split('\n');
      const masked = withoutFencedBlocks(lines);
      // The REQUIRED sections are the ones inside the reference's fenced examples;
      // the document's own headings (Purpose, Standard Format, …) sit outside them.
      const required = lines.filter((l, i) => masked[i] !== l && l.startsWith('## '));
      expect(required.length).toBeGreaterThan(0);

      const emitted = bootstrapProductSpec('test-project', [], '2026-01-01')
        .split('\n')
        .filter((l) => l.startsWith('## '));

      expect(new Set(emitted)).toEqual(new Set(required));
    });

    it('states the frontmatter ownership boundary that keeps authored keys alive', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      const start = content.indexOf('### 1. Frontmatter');
      expect(start).toBeGreaterThan(-1);
      const rest = content.slice(start);
      const next = rest.indexOf('\n### ', 1);
      const section = next === -1 ? rest : rest.slice(0, next);
      expect(section.trim().length).toBeGreaterThan(0);
      // REQ-SPEC-011 requires each half of the boundary to be stated by name —
      // a single sentence mentioning one key and the word "preserved" satisfied
      // the earlier assertion pair while the rest of the rule could vanish.
      const ownership = section.slice(section.indexOf('**Ownership**'));
      expect(ownership.trim().length).toBeGreaterThan(0);
      for (const authored of ['`version`', '`feature_count`']) {
        expect(ownership, `author-maintained key not named: ${authored}`).toContain(authored);
      }
      expect(ownership).toContain('`last_updated`');
      expect(ownership).toMatch(/bootstrap/i);
      expect(ownership).toMatch(/author-maintained|authored/i);
      expect(ownership).toMatch(/never generated|preserved byte for byte/i);
    });

    it('declares the Feature Map as the only machine-owned region, not a whole-file regeneration', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      const start = content.indexOf('## Generation Mode');
      expect(start).toBeGreaterThan(-1);
      const rest = content.slice(start + '## Generation Mode'.length);
      const nextHeading = rest.search(/\n## /);
      const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
      expect(section.trim().length).toBeGreaterThan(0);
      expect(section).toContain('machine-owned');
      expect(section).toContain('## Feature Map');
      expect(section).toMatch(/authored/i);
      // negative: the pre-fix wording claimed the whole file was synthesized
      expect(section).not.toContain('Auto-generated');
      expect(section).not.toMatch(/Manually written/i);
    });

    // A downstream author followed this reference exactly and still grew a second
    // Feature Map: it documented the ownership boundary but never said what a
    // decorated heading does. The rule is only usable if the remedy is stated here.
    it('states the near-miss heading refusal and its remedy', () => {
      const content = renderTemplate(
        'skills/references/product-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      const start = content.indexOf('## Generation Mode');
      const rest = content.slice(start + '## Generation Mode'.length);
      const nextHeading = rest.search(/\n## /);
      const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
      expect(section.trim().length).toBeGreaterThan(0);

      expect(section).toContain('## Feature Map (34 active)');
      expect(section).toMatch(/near miss/i);
      // both halves of the remedy, and the boundary that keeps it from over-reading
      expect(section).toMatch(/rename it/i);
      expect(section).toContain('## Feature Map Rationale');
      // every refusal is reported — the silent non-write is the defect being fixed
      expect(section).toMatch(/reported/i);
      expect(section).toContain('skip');
      // negative: refusing must not be described as taking the section over
      expect(section).not.toMatch(/splices? (over|into) (it|that section)/i);
    });
  });

  describe('Delta-spec Feature/Story routing fields', () => {
    it('should contain Feature routing field in ADDED format', () => {
      const content = renderTemplate(
        'skills/references/delta-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('**Feature:** {feature-slug}');
      expect(content).toContain('**Story:** US-{N}');
    });

    it('should contain Feature routing field in MODIFIED format', () => {
      const content = renderTemplate(
        'skills/references/delta-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      // Both ADDED and MODIFIED should have Feature/Story fields
      const featureCount = (content.match(/\*\*Feature:\*\*/g) ?? []).length;
      expect(featureCount).toBeGreaterThanOrEqual(2);
    });

    it('should explain routing to specs/features/', () => {
      const content = renderTemplate(
        'skills/references/delta-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('specs/features/');
      expect(content).toContain('Spec Sync');
    });

    // REQ-SPEC-012 (issue #211): `**Story**` semantics must match determineTargetSlice —
    // a trust-zone story number, never the proposal.md number that produced the
    // #203 misplacement. This is the PB-003 docs-claim pin: template prose that
    // describes CLI routing behavior is a tested assertion.
    it('documents `**Story**` as a TRUST-ZONE story number, not a proposal.md number (REQ-SPEC-012, issue #211)', () => {
      const content = renderTemplate('skills/references/delta-spec-format.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('trust-zone');
      expect(content).toContain('highest story number plus one');
      expect(content).toContain('archive resolves the REQ by its id');
      // Negative: the old, misleading semantics that caused the #211 misplacement
      // must be gone — an author following it routes an ADDED REQ by proposal number.
      expect(content).not.toContain('links this REQ to the User Story in proposal.md');
    });

    it('says a MODIFIED/REMOVED Feature header that does not host the REQ id is refused (REQ-SPEC-012 / REQ-SERVICES-096)', () => {
      const content = renderTemplate('skills/references/delta-spec-format.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('a header that resolves to a different feature');
    });

    // REQ-TEMPLATES-033 (issue #211): the plan-station gate is a RESOLUTION check
    // run mechanically, not a presence check an LLM passes by topic inference.
    it('prospec-plan Phase 5 Gate mechanizes MODIFIED/REMOVED Feature resolution but keeps ADDED Story an honest authoring rule (REQ-TEMPLATES-033, issue #211)', () => {
      const content = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('routing headers RESOLVE against the trust zone');
      expect(content).toContain('delta-spec-landing-fidelity');
      // PB-003: the gate must NOT overclaim — ADDED Story is not mechanically
      // checked (the check assesses MODIFIED/REMOVED only), so it is stated as an
      // authoring rule, and the old "checked mechanically ... ADDED" overclaim is gone.
      expect(content).toContain('an authoring rule, not a mechanical check');
    });
  });

  describe('Archive skill Feature Spec references', () => {
    it('should reference Feature Spec Sync, not Capability Spec Sync', () => {
      const content = renderTemplate(
        'skills/prospec-archive.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Feature Spec Sync');
      expect(content).not.toContain('Capability Spec Sync');
    });

    it('should reference specs/features/ path', () => {
      const content = renderTemplate(
        'skills/prospec-archive.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('specs/features/');
    });

    it('should not reference specs/history/ path', () => {
      const content = renderTemplate(
        'skills/prospec-archive.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).not.toContain('specs/history/');
    });

    it('should contain Product Spec Sync phase', () => {
      const content = renderTemplate(
        'skills/prospec-archive.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Product Spec Sync');
      expect(content).toContain('product.md');
      // the skill must not tell an agent the whole file is regenerated — that
      // check was unsatisfiable, and ticking it honestly is the point of the fix
      expect(content).not.toMatch(/regenerat\w*\s+product\.md/i);
    });

    it('should reference feature-spec-format in Startup Loading', () => {
      const content = renderTemplate(
        'skills/prospec-archive.hbs',
        TEMPLATE_CONTEXT,
      );
      const section = /^## Startup Loading\n([\s\S]*?)(?=^## )/m.exec(content)?.[1] ?? '';
      expect(section.trim().length).toBeGreaterThan(0);
      expect(section).toContain('feature-spec-format');
      expect(section).toContain('product-spec-format');
    });
  });

  describe('Capability → Feature migration completeness', () => {
    it('no skill template references the removed specs/capabilities/ path', () => {
      for (const skill of SKILL_DEFINITIONS) {
        const content = renderTemplate(
          `skills/${skill.name}.hbs`,
          TEMPLATE_CONTEXT,
        );
        expect(
          content,
          `${skill.name} still references specs/capabilities/`,
        ).not.toContain('specs/capabilities/');
      }
    });

    it('the deprecated capability-spec-format reference template is removed', () => {
      const refPath = path.join(
        __dirname,
        '../../src/templates/skills/references/capability-spec-format.hbs',
      );
      expect(fs.existsSync(refPath)).toBe(false);
    });
  });

  describe('Plan format Technical Summary', () => {
    it('should contain Technical Summary section', () => {
      const content = renderTemplate(
        'skills/references/plan-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Technical Summary');
      expect(content).toContain('Brownfield');
      expect(content).toContain('Greenfield');
    });

    it('should define both Brownfield and Greenfield formats', () => {
      const content = renderTemplate(
        'skills/references/plan-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Brownfield Mode');
      expect(content).toContain('Greenfield Mode');
      expect(content).toContain('Affected Module Overview');
      expect(content).toContain('Tech Stack Detection');
    });
  });

  describe('Plan User Story Flow diagram', () => {
    it('plan-format defines a conditional User Story Flow section with any-of structural signals', () => {
      const content = renderTemplate(
        'skills/references/plan-format.hbs',
        TEMPLATE_CONTEXT,
      );
      const section = sectionOf(content, '### 5. User Story Flow Diagram');
      // any-of structural signals — the concrete complexity criterion (AC1)
      expect(section).toContain('any-of');
      expect(section).toContain('Branching');
      expect(section).toContain('State machine');
      expect(section).toContain('Cross-module');
      // skip condition (AC2)
      expect(section).toMatch(/Skip/);
      // reuse of the project diagram conventions + guidance-not-gate framing (PB-003)
      expect(section).toContain('_diagram-conventions.md');
      expect(section).toContain('not a mechanical gate');
    });

    it('plan-format excludes the diagram block from the standard 120-line cap (AC2)', () => {
      const content = renderTemplate(
        'skills/references/plan-format.hbs',
        TEMPLATE_CONTEXT,
      );
      const guidelines = sectionOf(content, '## File Length Guidelines');
      expect(guidelines).toMatch(/User Story Flow diagram[\s\S]*excluded/i);
    });

    it('prospec-plan Phase 4 carries an on-demand diagram step, never in Startup Loading (AC3/AC5, BL-020)', () => {
      const content = renderTemplate(
        'skills/prospec-plan.hbs',
        TEMPLATE_CONTEXT,
      );
      // the on-demand sub-step exists in the workflow body
      expect(content).toContain('User Story Flow diagram');
      expect(content).toContain('on-demand');
      // negative assertion: the diagram read must NOT leak into Startup Loading (cache stability)
      const startup = sectionOf(content, '## Startup Loading');
      expect(startup).not.toContain('_diagram-conventions');
      expect(startup.toLowerCase()).not.toContain('flow diagram');
    });

    it('plan-format Section 5 and prospec-plan Phase 4 name the SAME any-of signal set (drift guard, PB-006)', () => {
      const planFormat = renderTemplate(
        'skills/references/plan-format.hbs',
        TEMPLATE_CONTEXT,
      ).toLowerCase();
      const skill = renderTemplate(
        'skills/prospec-plan.hbs',
        TEMPLATE_CONTEXT,
      ).toLowerCase();
      const section = sectionOf(planFormat, '### 5. user story flow diagram');
      // isolate the Phase 4 diagram sub-step paragraph — not the whole skill (PB-001 section-scoped)
      const subStep =
        /\*\*conditional[\s\S]*?(?=\n\n)/.exec(skill)?.[0] ?? '';
      expect(
        subStep.length,
        'diagram sub-step not found in prospec-plan Phase 4',
      ).toBeGreaterThan(0);
      // the shared complexity signals must appear in BOTH renderings —
      // editing the threshold in one file without the other turns this red
      for (const token of [
        'branching',
        '>= 2',
        'state transitions',
        '>= 3',
        'terminal states',
        'cross-module',
        'cross-actor',
      ]) {
        expect(
          section,
          `plan-format Section 5 missing signal token: ${token}`,
        ).toContain(token);
        expect(
          subStep,
          `prospec-plan Phase 4 missing signal token: ${token}`,
        ).toContain(token);
      }
    });
  });

  describe('Knowledge Quality Gate in Skills', () => {
    const SKILLS_WITH_QUALITY_GATE = [
      'prospec-new-story',
      'prospec-plan',
      'prospec-tasks',
      'prospec-implement',
      'prospec-verify',
    ];

    for (const skillName of SKILLS_WITH_QUALITY_GATE) {
      it(`${skillName} should contain Knowledge Quality Gate`, () => {
        const content = renderTemplate(
          `skills/${skillName}.hbs`,
          TEMPLATE_CONTEXT,
        );
        expect(content).toContain('Knowledge Quality Gate');
        expect(content).toContain('PASS');
        expect(content).toContain('WARN');
      });
    }
  });

  describe('Plan Brownfield/Greenfield detection', () => {
    it('should contain Context Mode Detection in prospec-plan', () => {
      const content = renderTemplate(
        'skills/prospec-plan.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Context Mode Detection');
      expect(content).toContain('Brownfield');
      expect(content).toContain('Greenfield');
    });

    it('should define detection criteria', () => {
      const content = renderTemplate(
        'skills/prospec-plan.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('>= 2 modules');
      expect(content).toContain('README.md');
    });
  });

  describe('prospec-design Skill structure', () => {
    it('should contain Generate Mode and Extract Mode', () => {
      const content = renderTemplate(
        'skills/prospec-design.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Generate Mode');
      expect(content).toContain('Extract Mode');
    });

    it('should contain a populated NEVER list with a concrete forbidden action', () => {
      const content = renderTemplate(
        'skills/prospec-design.hbs',
        TEMPLATE_CONTEXT,
      );
      // slice the section so the assertion pins a real forbidden-action bullet,
      // not just the heading (the bare 'NEVER' token was subsumed by '## NEVER')
      const never = sectionOf(content, '## NEVER');
      expect(never).toContain('**NEVER** skip user confirmation on detected mode');
    });

    // REQ-TEMPLATES-164: the structural half of the Phase 4 check delegates to
    // the CLI; component-coverage extraction stays the skill's judgment. The
    // two must not swap places — that is the whole point of the split.
    it('delegates the design-spec structure check to the CLI and keeps component extraction as judgment', () => {
      const content = renderTemplate('skills/prospec-design.hbs', TEMPLATE_CONTEXT);
      const phase4 = sectionOf(content, '### Phase 4: Design Verification');
      expect(phase4.length).toBeGreaterThan(200);
      expect(phase4).toContain('prospec validate design-spec');
      expect(phase4).toMatch(/Structure check \(CLI\)/);
      expect(phase4).toMatch(/Completeness check \(judgment\)/);
      // the judgment half must say the extraction is the skill's, not the CLI's
      expect(phase4).toMatch(/prose extraction is your call, never the CLI's/);
      // and the gate must cite the command's verdict, not a hand-run check
      const gate = phase4.slice(phase4.indexOf('Phase 4 Gate'));
      expect(gate).toContain('prospec validate design-spec');
    });

    it('should contain YAML frontmatter with design triggers', () => {
      const designDesc = SKILL_DEFINITIONS.find((s) => s.name === 'prospec-design')!.description;
      const content = renderTemplate('skills/prospec-design.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_description: designDesc,
      });
      const frontmatter = extractFrontmatter(content);
      expect(frontmatter).toContain('name: prospec-design');
      expect(frontmatter).toContain('Design Phase');
      expect(frontmatter).toContain('Triggers: test-trigger-alpha, test-trigger-beta');
    });

    it('should reference platform adapters', () => {
      const content = renderTemplate(
        'skills/prospec-design.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('adapter-pencil');
      expect(content).toContain('adapter-figma');
      expect(content).toContain('adapter-penpot');
      expect(content).toContain('adapter-html');
    });
  });

  describe('prospec-backfill-spec (extracted brownfield WHAT-layer skill)', () => {
    const render = () =>
      renderTemplate('skills/prospec-backfill-spec.hbs', TEMPLATE_CONTEXT);
    const renderDesign = () =>
      renderTemplate('skills/prospec-design.hbs', TEMPLATE_CONTEXT);

    it('pins the triangulation source→field mapping (REQ-TEMPLATES-104)', () => {
      const sec = sectionOf(render(), '### Phase 1:');
      expect(sec).toContain('code + tests');
      expect(sec).toContain('Acceptance Criteria');
      expect(sec).toContain('test names and assertions');
      expect(sec).toContain('*So that*');
      expect(sec).toContain('docs / README');
      expect(sec).toContain('role / value / target user');
      expect(sec).toContain('ai-knowledge');
      expect(sec).toContain('module routing only');
    });

    it('pins completeness discipline + countable-fact verification (REQ-TEMPLATES-104)', () => {
      const sec = sectionOf(render(), '### Phase 1:');
      expect(sec).toContain('enumerate');
      expect(sec).toContain('deferred');
      expect(sec).toContain('coverage must be visible');
      expect(sec).toContain('Verify countable facts');
      expect(sec).toContain('never state an exact count you did not count');
    });

    it('pins the route-compatible backfill-draft output (REQ-TEMPLATES-104)', () => {
      const sec = sectionOf(render(), '### Phase 2:');
      expect(sec).toContain('backfill-draft.md');
      expect(sec).toContain('route-compatible');
      expect(sec).toContain('**Feature:**');
      expect(sec).toContain('**Story:**');
    });

    it('scopes the >50% guardrail denominator to story-level intent (REQ-TEMPLATES-105)', () => {
      const sec = sectionOf(render(), '### Phase 2:');
      expect(sec).toContain('[NEEDS CLARIFICATION]');
      expect(sec).toContain('>50%');
      expect(sec).toContain('story-level intent');
      expect(sec).toContain('not counted toward the >50%');
      expect(sec).toContain('product/consumer name');
    });

    it('pins the trust-zone invariant and candidate-slug rule (REQ-TEMPLATES-106)', () => {
      const sec = sectionOf(render(), '### Phase 3:');
      expect(sec).toContain('never writes');
      expect(sec).toContain('prospec/specs/features/'); // base_dir-templated (TEMPLATE_CONTEXT.base_dir='prospec') — catches a hardcoded-path regression
      expect(sec).toContain('candidate feature slug');
      expect(sec).toContain('isSafeResourceName');
    });

    it('pins informational, no-auto-trigger WHAT-layer scoping (REQ-TEMPLATES-107)', () => {
      const sec = sectionOf(render(), '### Phase 4:');
      expect(sec).toContain('WHAT-layer');
      expect(sec).toContain('informational only');
      expect(sec).toContain('does not auto-trigger');
    });

    it('keeps backfill workflow content out of the stable Startup Loading prefix (REQ-TESTS-028 AC2)', () => {
      const sl = sectionOf(render(), '## Startup Loading');
      expect(sl).not.toContain('backfill-draft');
      expect(sl).not.toContain('>50%');
      expect(sl).not.toContain('triangulat');
    });

    it('pins feature-vertical-slice scoping + two-pass gather→cluster (REQ-TEMPLATES-104, REQ-TESTS-030)', () => {
      const sec = sectionOf(render(), '### Phase 1:');
      expect(sec).toContain('vertical slice');
      expect(sec).toContain('gather-by-module');
      expect(sec).toContain('cluster-by-feature');
      expect(sec).toContain('contribute to a candidate feature');
    });

    it('pins operationalized Pass-2 tracing with file:line evidence + 3-checkbox gate (REQ-TEMPLATES-109, REQ-TESTS-030)', () => {
      const sec = sectionOf(render(), '### Phase 1:');
      expect(sec).toContain('Enumerate entry points');
      expect(sec).toContain('file:line');
      expect(sec).toContain('Cross-slice de-dup');
      // Phase 1 Gate completeness: each behavior → exactly one slice or Deferred
      expect(sec).toContain('exactly one');
      expect(sec).toContain('Deferred');
    });

    it('pins cross-module integration edge as first-class AC conditioned on grounding (REQ-TEMPLATES-110, REQ-TESTS-030)', () => {
      const sec = sectionOf(render(), '### Phase 1:');
      expect(sec).toContain('cross-module');
      expect(sec).toContain('emitter and handler/sink');
      expect(sec).toContain(
        'never assert a cross-module flow whose handler/sink you did not locate',
      );
    });

    it('pins Phase 4 scoping by uncovered feature, not module (REQ-TEMPLATES-107, REQ-TESTS-030)', () => {
      const sec = sectionOf(render(), '### Phase 4:');
      expect(sec).toContain('uncovered feature');
      expect(sec).toContain('never by uncovered module');
    });

    it('pins the infrastructure-module-is-not-a-feature NEVER (REQ-TEMPLATES-112, REQ-TESTS-030)', () => {
      const sec = sectionOf(render(), '## NEVER');
      expect(sec).toContain('contributing modules');
      expect(sec).toContain('infrastructure module');
      expect(sec).toContain('feature that consumes it');
    });

    it('prospec-design no longer carries the backfill variant (REQ-DSGN-003, REQ-TESTS-028)', () => {
      const design = renderDesign();
      expect(design).not.toContain('input=code');
      expect(design).not.toContain('Phase 2b-code');
      expect(design).not.toContain('reverse-draft');
      expect(design).not.toContain('backfill');
    });

    it('prospec-design Phase 1 mode-detect drops the input=code row (REQ-DSGN-003)', () => {
      const sec = sectionOf(renderDesign(), '### Phase 1:');
      expect(sec).not.toContain('input=code');
      expect(sec).not.toContain('Phase 2b-code');
    });
  });

  describe('Design spec format structure', () => {
    it('should contain Visual Identity, Components, and Responsive Strategy', () => {
      const content = renderTemplate(
        'skills/references/design-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Visual Identity');
      expect(content).toContain('Components');
      expect(content).toContain('Responsive Strategy');
    });

    it('should contain design token examples', () => {
      const content = renderTemplate(
        'skills/references/design-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Token');
      expect(content).toContain('States');
    });
  });

  describe('Interaction spec format structure', () => {
    it('should contain States, Transitions, and Flows', () => {
      const content = renderTemplate(
        'skills/references/interaction-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('States');
      expect(content).toContain('Transitions');
      expect(content).toContain('Flows');
    });

    it('should mark DSL as draft', () => {
      const content = renderTemplate(
        'skills/references/interaction-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('draft');
    });
  });

  describe('Platform adapter structure', () => {
    const ADAPTERS = [
      'adapter-pencil.hbs',
      'adapter-figma.hbs',
      'adapter-penpot.hbs',
      'adapter-html.hbs',
    ];

    for (const adapter of ADAPTERS) {
      describe(adapter, () => {
        it('should contain Design Phase, Implement Phase, and Verify Phase', () => {
          const content = renderTemplate(
            `skills/references/${adapter}`,
            TEMPLATE_CONTEXT,
          );
          expect(content).toContain('Design Phase');
          expect(content).toContain('Implement Phase');
          expect(content).toContain('Verify Phase');
        });
      });
    }
  });

  describe('Modified templates — design integration', () => {
    it('prospec-implement should reference design-spec loading', () => {
      const content = renderTemplate(
        'skills/prospec-implement.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('design-spec.md');
      expect(content).toContain('interaction-spec.md');
      expect(content).toContain('MCP');
    });

    it('prospec-verify should contain design consistency dimension', () => {
      const content = renderTemplate(
        'skills/prospec-verify.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Design Consistency');
      expect(content).toContain('Visual Spec Compliance');
      expect(content).toContain('Interaction Spec Compliance');
    });

    it('prospec-tasks should reference design-spec in Startup Loading', () => {
      const content = renderTemplate(
        'skills/prospec-tasks.hbs',
        TEMPLATE_CONTEXT,
      );
      const section = /^## Startup Loading\n([\s\S]*?)(?=^## )/m.exec(content)?.[1] ?? '';
      expect(section.trim().length).toBeGreaterThan(0);
      expect(section).toContain('design-spec.md');
      expect(content).toContain('adapter MCP');
    });

    it('prospec-knowledge-generate refreshes raw-scan in Startup Loading via the required CLI — no fallback ladder (issue #107)', () => {
      const content = renderTemplate(
        'skills/prospec-knowledge-generate.hbs',
        TEMPLATE_CONTEXT,
      );
      const section = /^## Startup Loading\n([\s\S]*?)(?=^## )/m.exec(content)?.[1] ?? '';
      expect(section.trim().length).toBeGreaterThan(0);
      // raw-scan.md stays the read input (and the item-set baseline key)…
      expect(section).toContain('raw-scan.md');
      // …refreshed deterministically before reading, via `knowledge init --raw-scan-only`
      expect(section).toContain('prospec knowledge init --raw-scan-only');
      // the CLI is required (shared probe) — the pnpm exec / npx resolution ladder is gone
      expect(content).toContain('there is no fallback ladder and no approximate working-tree scan');
      expect(content).not.toContain('pnpm exec prospec knowledge init');
      expect(content).not.toContain('npx -y prospec knowledge init');
    });

    it('proposal-format should contain UI Scope section', () => {
      const content = renderTemplate(
        'skills/references/proposal-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('UI Scope');
      expect(content).toContain('full');
      expect(content).toContain('partial');
      expect(content).toContain('none');
    });
  });

  describe('Language neutrality — no hardcoded language directives', () => {
    for (const skill of SKILL_DEFINITIONS) {
      describe(`${skill.name}`, () => {
        it('should NOT contain "written in English" directive', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          expect(content).not.toContain('written in English');
        });

        it('should NOT contain "in the user\'s language" directive', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          expect(content).not.toContain("in the user's language");
        });

        it('should retain English section headings', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          // All skills must have these core structural headings in English
          expect(content).toContain('## Activation');
          expect(content).toContain('## NEVER');
        });
      });
    }
  });

  // issue #196 — templates render into ANY target project (non-prospec, non-TS,
  // any harness), so guidance must not hardcode prospec's own stack, layer
  // topology, or base-dir path. Guards the three regressions H1/M1/M2 + the LOW
  // pre-existing sibling, and prevents their reintroduction.
  describe('Project-agnostic template guidance (issue #196 — no prospec-specific hardcoding)', () => {
    const render = (t: string) => renderTemplate(t, TEMPLATE_CONTEXT);

    it('prospec-review Success Criteria uses the project test command, not a hardcoded `pnpm test` (H1)', () => {
      const criteria = sectionOf(render('skills/prospec-review.hbs'), '### Success Criteria');
      expect(criteria).not.toContain('pnpm test');
      expect(flat(criteria)).toContain('project-test-runner');
    });

    // PB-007 repo-wide sweep: no skill/reference body may prescribe prospec's own
    // layer topology or dependency direction as THE order — the very leak class
    // this change fixes. `tasks-format.hbs` is allowlisted: it deliberately shows
    // `Types → Lib → Services → CLI → Tests` as ONE of several `e.g.` examples,
    // paired with an explicit "Never hardcode a fixed framework layer topology" note.
    it('no skill or reference body hardcodes prospec-specific layer topology/direction (M1/LOW, sweep)', () => {
      // `tasks-format.hbs` deliberately shows `Types → Lib → Services → CLI → Tests`
      // as ONE of several `e.g.` examples, paired with an explicit "Never hardcode a
      // fixed framework layer topology" note — that is the single legitimate site.
      const TOPOLOGY_ALLOWLIST = new Set(['skills/references/tasks-format.hbs']);
      const templates = Object.keys(BUNDLED_TEMPLATES).filter(
        (k) =>
          (/^skills\/[^/]+\.hbs$/.test(k) || /^skills\/references\/[^/]+\.hbs$/.test(k)) &&
          !TOPOLOGY_ALLOWLIST.has(k),
      );
      // Non-empty guard: an empty list would make this test vacuously pass.
      expect(templates.length).toBeGreaterThan(20);
      for (const key of templates) {
        const content = render(key);
        expect(content, `${key} hardcodes forward layer topology`).not.toContain(
          'Types → Lib → Services → CLI',
        );
        expect(content, `${key} hardcodes dependency direction`).not.toContain(
          'cli → services → lib → types',
        );
      }
    });

    it('project-test-runner references the resolved constitution path, never a literal prospec/CONSTITUTION.md (M2)', () => {
      // Rendered against a RELOCATED base dir: a literal survives verbatim, while
      // the resolved `{{constitution_path}}` follows the relocation. Only the
      // relocated render can tell a hardcoded string apart from the variable.
      const relocated = renderTemplate('skills/references/project-test-runner.hbs', {
        ...TEMPLATE_CONTEXT,
        constitution_path: 'docs/CONSTITUTION.md',
        base_dir: 'docs',
        knowledge_base_path: 'docs/ai-knowledge',
      });
      expect(relocated).not.toContain('prospec/CONSTITUTION.md');
      expect(relocated).toContain('docs/CONSTITUTION.md');
    });
  });

  // issue #195 — situational awareness across station transitions: the entry
  // config must instruct a per-station skill reload, the cascade protocol must
  // define the LOAD-first execution loop, and NO skill/reference may name a
  // harness-specific tool or a plugin agent type (which a target project's
  // harness won't have). All harness-neutral / project-agnostic.
  describe('Situationally-aware station transitions (issue #195)', () => {
    const HARNESS_TOOLS = ['view_file', 'invoke_subagent'];
    const PLUGIN_AGENTS = ['code-reviewer', 'security-auditor', 'test-engineer'];

    it('entry.md renders a Station Transition Protocol using {{skill_path}}, no harness tool name (A, REQ-TEMPLATES-194)', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.claude/skills',
        surfaces_skill_frontmatter: true,
      });
      const section = sectionOf(content, '## Working with This Project');
      expect(section).toContain('Station Transition Protocol');
      // uses the resolved {{skill_path}} (renders to .claude/skills), never a
      // hardcoded dir; and ties the exact path to `prospec status`'s action line
      // (the authoritative source) rather than a per-station literal that is wrong
      // for story/promote (prospec-new-story / prospec-promote-backfill).
      expect(section).toContain('.claude/skills/');
      expect(section).toContain('prospec status');
      // also forbid reintroducing the per-station literal that is wrong for
      // story/promote (prospec-new-story / prospec-promote-backfill).
      expect(section).not.toContain('prospec-{station}');
      for (const t of HARNESS_TOOLS) expect(section).not.toContain(t);
    });

    it('cascade-protocol defines the per-station Step 1 [LOAD] loop, harness-neutral (C, REQ-TEMPLATES-195)', () => {
      const section = sectionOf(
        renderTemplate('skills/references/cascade-protocol.hbs', TEMPLATE_CONTEXT),
        '## Per-Station Execution Loop',
      );
      for (const step of ['Step 1 [LOAD]', 'Step 2 [ENTRY]', 'Step 3 [EXEC]', 'Step 4 [GATE]', 'Step 5 [NEXT]']) {
        expect(section).toContain(step);
      }
      for (const t of HARNESS_TOOLS) expect(section).not.toContain(t);
    });

    it('no skill/reference body names a plugin agent type or a harness tool (D, REQ-TEMPLATES-196, PB-007 sweep)', () => {
      const templates = Object.keys(BUNDLED_TEMPLATES).filter(
        (k) => /^skills\/[^/]+\.hbs$/.test(k) || /^skills\/references\/[^/]+\.hbs$/.test(k),
      );
      expect(templates.length).toBeGreaterThan(20);
      for (const key of templates) {
        const content = renderTemplate(key, TEMPLATE_CONTEXT);
        for (const a of PLUGIN_AGENTS) {
          expect(content, `${key} names plugin agent type "${a}"`).not.toContain(a);
        }
        for (const t of HARNESS_TOOLS) {
          expect(content, `${key} names harness tool "${t}"`).not.toContain(t);
        }
      }
    });

    it('review and verify still delegate fresh context via the harness-capabilities partial (D)', () => {
      for (const skill of ['prospec-review', 'prospec-verify']) {
        const content = renderTemplate(`skills/${skill}.hbs`, TEMPLATE_CONTEXT);
        expect(content, `${skill} must carry the capability line`).toContain(CAPABILITY_LINE_LABEL);
      }
    });

    it('no shipped reference footer hardcodes the upstream project name — footers render {{project_name}} (issue #196 project-agnostic-leak class)', () => {
      const refs = Object.keys(BUNDLED_TEMPLATES).filter((k) =>
        /^skills\/references\/[^/]+\.hbs$/.test(k),
      );
      expect(refs.length).toBeGreaterThan(20);
      for (const key of refs) {
        // render with a non-prospec project name: a footer that describes the
        // CONSUMING project must take its name from {{project_name}}, so it
        // renders "test-project" here — never the hardcoded upstream literal
        // that reads wrong in every downstream project.
        const content = renderTemplate(key, { ...TEMPLATE_CONTEXT, project_name: 'test-project' });
        expect(content, `${key} footer hardcodes the upstream project name`).not.toContain(
          'Project name: `prospec`',
        );
      }
    });
  });

  // issue #184 — passive checkpoint capture of session corrections. The entry
  // config gains a Checkpoint Correction Capture Protocol (harness-neutral,
  // resolved {{skill_path}}, ledger write kept out of the feature commit), and
  // promotion-format gains the single-source Generalizability Heuristic that
  // both the L0 protocol and Collect follow. Section-scoped + a negative
  // source-level harness-neutral guard, per PB-001.
  describe('Checkpoint correction capture (issue #184)', () => {
    const HARNESS_TOOLS = ['view_file', 'invoke_subagent'];

    const workingSection = () =>
      sectionOf(
        renderTemplate('agent-configs/entry.md.hbs', {
          ...TEMPLATE_CONTEXT,
          skill_path: '.claude/skills',
          surfaces_skill_frontmatter: true,
        }),
        '## Working with This Project',
      );

    it('entry.md renders a Checkpoint Correction Capture Protocol wired to learn upsert + downstream vocab (REQ-TEMPLATES-197)', () => {
      const section = workingSection();
      expect(section).toContain('Checkpoint Correction Capture Protocol');
      // reflection points are session end / before archive — NOT "before a
      // feature commit" (that would collide with Atomic Commits).
      expect(section).toContain('session end');
      expect(section).toContain('before archiving');
      expect(section).not.toContain('before a feature commit');
      // the CLI recorder + downstream vocab pointers + original-language desc.
      expect(section).toContain('prospec learn upsert');
      expect(section).toContain('module-map.yaml');
      expect(section).toContain('_glossary.md');
      expect(section).toContain('language the correction was given');
      // the Atomic-Commits separation clause.
      expect(section).toMatch(/never fold it into a feature commit/);
    });

    it('the checkpoint protocol is harness-neutral and hardcodes no skills-dir literal (REQ-TEMPLATES-197, negative, source-level)', () => {
      // Assert on the TEMPLATE source (not the resolved render) so a hardcoded
      // path or harness tool is caught even though THIS project resolves
      // {{skill_path}} to .claude/skills.
      const raw = BUNDLED_TEMPLATES['agent-configs/entry.md.hbs'];
      expect(raw, 'entry.md.hbs must be bundled').toBeTruthy();
      const protoStart = raw!.indexOf('**Checkpoint Correction Capture Protocol**');
      expect(protoStart, 'protocol not in template source').toBeGreaterThan(-1);
      const protoEnd = raw!.indexOf('\n\n1. **Before starting**', protoStart);
      expect(protoEnd, 'protocol paragraph boundary not found').toBeGreaterThan(protoStart);
      const proto = raw!.slice(protoStart, protoEnd);
      // uses the resolved variable, never a hardcoded harness dir.
      expect(proto).toContain('{{skill_path}}');
      expect(proto).not.toContain('.claude/skills');
      expect(proto).not.toContain('.agents/skills');
      for (const t of HARNESS_TOOLS) expect(proto).not.toContain(t);
    });

    it('promotion-format defines the single-source Generalizability Heuristic — capture + exclude, conversational scope (REQ-TEMPLATES-198 / REQ-TESTS-024)', () => {
      const ref = renderTemplate('skills/references/promotion-format.hbs', TEMPLATE_CONTEXT);
      const start = ref.indexOf('## Generalizability Heuristic');
      expect(start, 'Generalizability Heuristic section not found').toBeGreaterThan(-1);
      const nextHeading = ref.indexOf('\n## ', start + 1);
      const section = ref.slice(start, nextHeading === -1 ? undefined : nextHeading);
      // both sides of the filter live in the same section.
      expect(section).toContain('Capture');
      expect(section).toContain('Exclude');
      expect(section).toMatch(/architecture|layering/);
      expect(section).toMatch(/type-contract/);
      expect(section).toMatch(/mock/);
      expect(section).toMatch(/business/);
      // scoped to conversational capture; the section itself states Harvest's
      // structured sources are NOT re-filtered (so REQ-094 is untouched).
      expect(section).toContain('conversational');
      expect(section).toContain('NOT re-filtered');
      // project-agnostic: this reference renders verbatim into every downstream
      // project's promotion-format.md, so the heuristic must speak from THAT
      // project's own vantage — "this project's modules", never the upstream
      // "the downstream project's …" leak (issue #196 class).
      expect(section).toContain("this project's modules");
      expect(section).not.toContain('downstream project');
    });

    it('the Generalizability Heuristic reaches both the prospec-learn and prospec-archive reference copies', () => {
      // One .hbs source; both skills self-contain promotion-format, so the
      // single render proves the content each deployed copy carries.
      const ref = renderTemplate('skills/references/promotion-format.hbs', TEMPLATE_CONTEXT);
      expect(ref).toContain('## Generalizability Heuristic');
      for (const skill of ['prospec-learn', 'prospec-archive']) {
        const carries = getSkillReferences(skill).some((r) =>
          r.outputName.includes('promotion-format'),
        );
        expect(carries, `${skill} must self-contain promotion-format`).toBe(true);
      }
    });

    it('prospec-learn Collect routes session-correction folding through the Generalizability Heuristic, and its Startup read names it (REQ-TEMPLATES-198)', () => {
      const skill = renderTemplate('skills/prospec-learn.hbs', TEMPLATE_CONTEXT);
      // Collect's session-correction folding must ROUTE THROUGH the heuristic,
      // not merely inherit it via the whole-file read — this pins the claim
      // REQ-198 makes ("followed by Collect's session-correction folding"), so
      // the manual /prospec-learn path applies the same filter the L0 protocol does.
      const collect = sectionOf(skill, '### Collect');
      expect(collect).toContain('Generalizability Heuristic');
      expect(collect).toContain('session corrections');
      // and the Startup Loading read of promotion-format names the heuristic
      // among its stated purposes, so the read is framed for capture-filtering.
      const startup = sectionOf(skill, '## Startup Loading');
      expect(startup).toContain('Generalizability Heuristic');
    });
  });

  describe('Status lifecycle alignment', () => {
    it('plan-format should contain a Call Chain section before Implementation Steps', () => {
      const content = renderTemplate(
        'skills/references/plan-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('### 4. Call Chain');
      expect(content).toContain('### 5. User Story Flow Diagram');
      expect(content).toContain('### 6. Implementation Steps');
      expect(content).toContain('### 7. Risk Assessment');
    });

    it('prospec-plan should reference Call Chain and layering inspection', () => {
      const content = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('Call Chain');
      expect(content).toContain('layering violations');
    });

    it('prospec-verify should contain a Record & Status Update gate (S/A only, CLI-executed — issue #107)', () => {
      const content = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('## Record & Status Update (CLI-executed)');
      expect(content).toContain('status: verified');
      // the S/A advance and the B/C/D hold are `prospec verify record`'s, never hand-written
      expect(content).toContain('prospec verify record');
      expect(content).toMatch(/on\s+\*\*B\/C\/D\*\* leaves `status` unchanged/);
      expect(content).toContain('Call Chain ↔ layering');
      // the old hand-updated section name must not reappear
      expect(content).not.toMatch(/^## Status Update/m);
    });

    it('prospec-archive should gate on verified status only', () => {
      const content = renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('only `verified` changes are archivable');
      expect(content).not.toContain('offer to archive changes with other statuses');
    });

    it('archive spec-history summary lands in date-prefixed _archived-history/, never flat specs root (REQ-TESTS-033)', () => {
      // The committed audit-trail copy targets the drift-excluded _archived-history/ with a
      // {YYYY-MM-DD}- prefix (name-aligned with the .prospec/archive/ folder), never flat
      // specs/{change-name}.md (clutters specs root + gets scanned by req-references).
      const ref = renderTemplate('skills/references/archive-format.hbs', TEMPLATE_CONTEXT);
      const specArchiving = sectionOf(ref, '## Spec Archiving');
      expect(specArchiving).toContain('prospec/specs/_archived-history/{YYYY-MM-DD}-{change-name}.md');
      expect(specArchiving).not.toContain('prospec/specs/{change-name}.md'); // never flat root

      // The copy step must be explicit in the skill flow, not only buried in the reference.
      const skill = renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);
      expect(skill).toContain('specs/_archived-history/{YYYY-MM-DD}-{change-name}.md');
      expect(skill).not.toContain('specs/{change-name}.md'); // never flat root in the skill either
    });

    it('prospec-implement advances to implemented via `prospec change status` when tasks complete (issue #107)', () => {
      const content = renderTemplate(
        'skills/prospec-implement.hbs',
        TEMPLATE_CONTEXT,
      );
      // the transition is CLI-owned — the skill never hand-edits metadata.yaml
      expect(content).toContain('prospec change status implemented');
      expect(content).toContain('never edit metadata.yaml by hand');
    });

    it('lifecycle-owning skills should point to _status-lifecycle.md', () => {
      for (const name of [
        'prospec-new-story',
        'prospec-plan',
        'prospec-tasks',
        'prospec-implement',
        'prospec-verify',
        'prospec-archive',
      ]) {
        const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
        expect(content).toContain('_status-lifecycle.md');
      }
    });

    it('prospec-ff should load its own bundled references, not sibling dirs', () => {
      const content = renderTemplate('skills/prospec-ff.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('references/proposal-format.md');
      expect(content).toContain('references/plan-format.md');
      expect(content).toContain('references/delta-spec-format.md');
      expect(content).toContain('references/plan-verifier-rubric.md');
      expect(content).toContain('references/tasks-format.md');
      // must NOT reach into sibling skill directories (dangling in the
      // skills-dir layout shared by every agent)
      expect(content).not.toContain('prospec-new-story/references/');
      expect(content).not.toContain('prospec-plan/references/');
      expect(content).not.toContain('prospec-tasks/references/');
    });

    it('knowledge skills should defer to _module-readme-conventions.md', () => {
      for (const name of [
        'prospec-knowledge-generate',
        'prospec-knowledge-update',
      ]) {
        const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
        expect(content).toContain('_module-readme-conventions.md');
      }
    });

    it('convention reference templates should render', () => {
      for (const tmpl of [
        'init/status-lifecycle.md.hbs',
        'init/module-readme-conventions.md.hbs',
        'init/diagram-conventions.md.hbs',
      ]) {
        const content = renderTemplate(tmpl, TEMPLATE_CONTEXT);
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('verify dimension 4/5 grades pre-existing drift only, not Feature Spec freshness', () => {
      const content = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('Knowledge ↔ Implementation Consistency');
      expect(content).toContain('grades only pre-existing Knowledge drift');
      expect(content).toContain('not drift');
      expect(content).toContain('informational');
      // the old feature-spec-freshness gate must be gone
      expect(content).not.toContain(
        'Requirement exists in Feature Spec but has no corresponding description',
      );
    });

    it('status-lifecycle documents Feature Spec graduation at archive', () => {
      const content = renderTemplate(
        'init/status-lifecycle.md.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('graduation');
      expect(content).toContain('does NOT gate on Feature Spec freshness');
    });

    it('status-lifecycle syncs knowledge at the verify S/A commit prompt with the archive Entry Gate as backstop', () => {
      const content = renderTemplate(
        'init/status-lifecycle.md.hbs',
        TEMPLATE_CONTEXT,
      );
      // part b: prevention moved to the verify S/A commit prompt; Entry Gate demoted to backstop
      expect(content).toContain('prevention point is the `/prospec-verify` S/A commit prompt');
      expect(content).toContain('backstop');
      // the absolute single-checkpoint claim is gone
      expect(content).not.toContain('single mandatory knowledge-sync checkpoint');
      expect(content).not.toContain('any time before verify');
      expect(content).not.toContain('gates on **Knowledge ↔ code** consistency');
    });

    it('prospec-archive documents it is the sole Feature Spec writer', () => {
      const content = renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('sole writer');
    });
  });

  describe('AI Knowledge sub-modules', () => {
    it('module-readme-conventions defines sub-module extraction', () => {
      const content = renderTemplate(
        'init/module-readme-conventions.md.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('## Sub-Modules');
      expect(content).toContain('content-rich, functionally-independent');
      expect(content).toContain('modules/{module}/{sub-module}.md');
      expect(content).toContain('NOT listed in');
    });

    it('knowledge-generate may revise the bootstrap module map, confirm-first (REQ-TEMPLATES-170)', () => {
      const content = renderTemplate(
        'skills/prospec-knowledge-generate.hbs',
        TEMPLATE_CONTEXT,
      );
      // Section-scoped: Step 3 owns the boundary decision, so the authority must
      // live there — not incidentally elsewhere in the document.
      const section =
        /^### Step 3: Decide Module Boundaries\n([\s\S]*?)(?=^### )/m.exec(content)?.[1] ?? '';
      expect(section.trim().length).toBeGreaterThan(0);
      // 1. the detector's output is characterized as a draft…
      expect(section).toMatch(/draft/i);
      // 2. …the evidence it is judged against is named…
      expect(section).toContain('Directories Without Source Files');
      // 3. …and the write-back is gated on user confirmation, not autonomous.
      expect(section).toContain('module-map.yaml');
      expect(section).toContain('STOP. Ask the user to confirm the addition before writing');
      // 4. all three verbs are present — adding was not the whole contract.
      expect(section).toMatch(/\*\*Adding\*\*/);
      expect(section).toMatch(/\*\*Removing\*\*/);
      expect(section).toMatch(/\*\*Leaving alone\*\*/);
      // 5. declining leaves the file untouched…
      expect(section).toMatch(/byte-identical/);
      // 6. …and index.md is regenerated from module-map, never hand-edited.
      expect(section).toMatch(/index\.md.*regenerated from it/s);
      expect(section).toMatch(/never hand-edited/);
      // 7. the draft-vs-curated discriminator does not exist on disk, so the
      // skill must not gate on it — confirmation is the only signal.
      expect(section).toMatch(/[Nn]othing on disk marks a map as bootstrap-written/);
      // The grant of authority must not sit inside a draft-vs-curated antecedent
      // — the section itself says that predicate is unevaluable.
      expect(section).not.toMatch(/\*\*When `prospec knowledge init` had to bootstrap/);
      // All three arms of the leaving-alone rule, the empty section included.
      expect(section).toMatch(/when the section is empty/);
      // 8. a listed directory is not evidence that it is unmapped — check `paths`
      // first, because a curated map short-circuits detection entirely.
      expect(section).toMatch(/Check the existing\s+`paths` first/);
      expect(section).toMatch(/may already BE a module/);
      // Negative: the skill must not claim an existing map is untouchable, which
      // is exactly the reading that stranded bootstrap drafts (REQ-KNOW-003).
      expect(section).not.toMatch(/never (modify|change|edit) module-map/i);
      // Negative: nor may it overclaim the evidence section's coverage.
      expect(section).not.toMatch(/every directory the heuristic could not admit/i);
    });

    it('knowledge-generate extracts sub-modules instead of lossy trimming', () => {
      const content = renderTemplate(
        'skills/prospec-knowledge-generate.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Step 4.5');
      expect(content).toContain('## Sub-Modules');
      expect(content).toContain('content-rich, functionally-independent');
    });

    it('knowledge-update maintains and extracts sub-modules', () => {
      const content = renderTemplate(
        'skills/prospec-knowledge-update.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('## Sub-Modules');
      expect(content).toContain('sub-module');
    });

    it('knowledge-consuming skills also load linked sub-modules', () => {
      for (const name of [
        'prospec-implement',
        'prospec-plan',
        'prospec-verify',
        'prospec-tasks',
        'prospec-ff',
      ]) {
        const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
        expect(content).toContain('sub-module');
      }
    });
  });

  describe('knowledge-update verify stamping contract (REQ-TEMPLATES-162, REQ-TESTS-090)', () => {
    const knowledgeUpdate = () =>
      renderTemplate('skills/prospec-knowledge-update.hbs', TEMPLATE_CONTEXT);

    it('prospec-knowledge-update instructs running prospec knowledge verify in Phase 3e', () => {
      const phase3 = sectionOf(knowledgeUpdate(), '### Phase 3:');
      expect(phase3).toContain('prospec knowledge verify');
      expect(phase3).toContain('3e:');
      expect(phase3).toMatch(/prospec knowledge verify <modules\.\.\.>/);
      expect(phase3).toContain('last_verified');
    });

    it('prospec-knowledge-update includes knowledge freshness stamped in output contract', () => {
      const successCriteria = sectionOf(knowledgeUpdate(), '### Success Criteria');
      expect(successCriteria).toContain('prospec knowledge verify');
    });
  });

  describe('Agent config skill registry (per-agent frontmatter split)', () => {
    it('full table (non-frontmatter agent) renders skills-dir references for .agents/skills', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.agents/skills',
        surfaces_skill_frontmatter: false,
      });
      expect(content).toContain('.agents/skills/prospec-archive/references/');
      expect(content).toContain('### /prospec-archive');
      expect(content).not.toContain('.prospec/skills/');
      expect(content).not.toContain('.instructions.md');
    });

    it('full table omits a References line for self-contained skills', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.agents/skills',
        surfaces_skill_frontmatter: false,
      });
      expect(content).not.toContain(
        '.agents/skills/prospec-knowledge-generate/references/',
      );
      expect(content).not.toContain(
        '.agents/skills/prospec-knowledge-update/references/',
      );
    });

    it('slim registry (frontmatter-surfacing agent) drops the per-skill table', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.claude/skills',
        surfaces_skill_frontmatter: true,
      });
      // no per-skill table, no reference paths — Claude Code surfaces frontmatter
      expect(content).not.toContain('### /prospec-archive');
      expect(content).not.toContain('**Triggers**:');
      expect(content).not.toContain('.claude/skills/prospec-archive/references/');
      // still names the slash-command invocation contract + the frontmatter source
      expect(content).toContain('/prospec-');
      expect(content).toContain('SKILL.md');
    });

    it('registry defaults to the full table when the flag is absent (unknown agent)', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.agents/skills',
      });
      expect(content).toContain('### /prospec-archive');
    });

    it('is the single shared entry template — no per-agent templates remain', () => {
      for (const legacy of ['claude', 'antigravity', 'codex', 'copilot']) {
        expect(() =>
          renderTemplate(`agent-configs/${legacy}.md.hbs`, TEMPLATE_CONTEXT),
        ).toThrow();
      }
    });
  });

  describe('Agent config entry template', () => {
    it('should render entry.md.hbs without errors', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', TEMPLATE_CONTEXT);
      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    });

    it('should include project name', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('test-project');
    });
  });

  describe('Output Contract (BL-019)', () => {
    for (const skill of SKILL_DEFINITIONS) {
      describe(`${skill.name}`, () => {
        it('should contain an Output Contract section', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          expect(content).toContain('## Output Contract');
        });

        it('should define Success Criteria and Failure Conditions', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          expect(content).toContain('### Success Criteria');
          expect(content).toContain('### Failure Conditions');
        });
      });
    }
  });

  describe('Constitution executable rules (BL-031)', () => {
    const CONSTITUTION_CTX = {
      project_name: 'test-project',
      example_rules: [
        {
          severity: 'MUST',
          name: 'Authenticated endpoints',
          description: 'All endpoints require auth.',
          rationale: 'Prevent exposure.',
          check: 'auth dependency present',
        },
        {
          severity: 'SHOULD',
          name: 'Clean architecture',
          description: 'Logic in services.',
          rationale: 'Testability.',
        },
      ],
    };

    it('constitution template renders severity-tagged rules without placeholders', () => {
      const content = renderTemplate('init/constitution.md.hbs', CONSTITUTION_CTX);
      expect(content).toContain('[MUST]');
      expect(content).toContain('[SHOULD]');
      expect(content).toContain('Authenticated endpoints');
      expect(content).not.toContain('[Principle Name]');
      expect(content).not.toContain('[Describe the principle]');
      // only the rule WITH a check renders a Verify line (rule 2 has none)
      expect((content.match(/\*\*Verify\*\*/g) ?? []).length).toBe(1);
    });

    it('prospec-verify grades the Constitution by RFC-2119 severity', () => {
      const content = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      // section-scoped: whole-document `toContain('MUST')` survives gutting the
      // mapping, because MUST/SHOULD/MAY appear in unrelated sections too.
      const v3 = sectionOf(content, '### Verification 3/5: Constitution Full Audit');
      // the weight mapping itself, as one string — this is the only test pinning it
      expect(flat(v3)).toContain('**MUST → FAIL**, **SHOULD → WARN**');
      // the severities now come from the machine rule inventory, not a re-read
      expect(v3).toContain('Take each severity from the inventory');
      // MAY is advisory/informational — must NOT introduce a 4th grade state
      expect(v3).toContain('informational');
      expect(content).not.toContain('MAY → INFO');
    });
  });

  describe('Entry/Exit Gates (BL-003)', () => {
    const GATE_SKILLS = [
      'prospec-new-story',
      'prospec-plan',
      'prospec-tasks',
      'prospec-ff',
      'prospec-verify',
      'prospec-review',
      'prospec-learn',
    ];
    for (const name of GATE_SKILLS) {
      it(`${name} has an Entry Gate section`, () => {
        const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
        expect(content).toContain('## Entry Gate');
      });

      it(`${name} folds an Exit Gate that records to quality_log`, () => {
        const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
        expect(content).toContain('### Exit Gate (Constitution)');
        const exit = content.slice(content.indexOf('### Exit Gate'));
        expect(exit).toContain('quality_log');
        // guard the no-fourth-state invariant (MAY is informational, not INFO)
        expect(exit).not.toContain('INFO');
      });
    }
  });

  describe('knowledge sync gates at archive (BL-038)', () => {
    const renderArchive = () =>
      renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);
    const renderVerify = () =>
      renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);

    it('prospec-archive Entry Gate blocks until verified status and knowledge are synced', () => {
      const gate = sectionOf(renderArchive(), '## Entry Gate');
      expect(gate).toContain('`status: verified`');
      expect(gate).toContain('/prospec-knowledge-update');
      expect(gate).toContain('FAIL');
      // module extraction must cover removals too, or REMOVED-only changes never sync
      expect(gate).toContain('ADDED/MODIFIED/REMOVED');
    });

    it('prospec-archive Entry Gate passes a change that touches no modules', () => {
      const gate = sectionOf(renderArchive(), '## Entry Gate');
      expect(gate).toContain('touches no modules');
    });

    it('prospec-archive Phase 4 is a gate re-check, not an interactive prompt', () => {
      const content = renderArchive();
      expect(content).toContain('### Phase 4: Knowledge Sync Re-check');
      expect(content).not.toContain('Interactive Knowledge Update');
      expect(content).not.toContain('Update Knowledge for these modules now?');
    });

    it('prospec-archive forbids bypassing the gate instead of tolerating update failure', () => {
      const content = renderArchive();
      expect(content).not.toContain('let Knowledge update failure block archiving');
      expect(content).not.toContain('Knowledge can always be updated later');
      const never = sectionOf(content, '## NEVER');
      expect(never).toContain('bypass');
      expect(never).toContain('Entry Gate');
    });

    it('prospec-verify V4 reports this-change knowledge lag as informational with an archive-gate pointer', () => {
      const v4 = sectionOf(renderVerify(), '### Verification 4/5');
      expect(v4).toContain("This change's Knowledge lag — informational only");
      expect(v4).toContain('Entry Gate');
    });

    it('prospec-verify V4 graded checks cover only pre-existing drift', () => {
      const v4 = sectionOf(renderVerify(), '### Verification 4/5');
      const marker = "This change's Knowledge lag";
      const graded = v4.slice(0, v4.indexOf(marker));
      expect(graded.trim().length).toBeGreaterThan(0);
      expect(graded).toContain('pre-existing');
      expect(graded).not.toContain('delta-spec ADDED/MODIFIED');
      expect(graded).not.toMatch(/not updated → WARN/);
    });

    it('prospec-verify syncs knowledge at the commit prompt (part b), not by grading it', () => {
      const content = renderVerify();
      // part b: sync is folded into the S/A commit prompt (prevention); archive is the backstop
      expect(content).toContain('backstop');
      expect(content).not.toContain('Knowledge staleness (graded WARN)');
    });
  });

  describe('prospec-review skill — adversarial review→fix loop (BL-037)', () => {
    const render = () =>
      renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);

    it('has a Core Workflow with the review→fix loop', () => {
      const c = render();
      expect(c).toContain('## Core Workflow');
    });

    it('defines reviewer modes (B default / A opt-in)', () => {
      const c = render();
      const modes = c.slice(
        c.indexOf('### Reviewer Modes'),
        c.indexOf('### Review Lenses'),
      );
      expect(modes.length).toBeGreaterThan(0);
      expect(modes).toMatch(/single reviewer.*default|default.*single reviewer/i);
      expect(modes).toMatch(/parallel.*opt-?in|opt-?in.*parallel/i);
    });

    it('always layers the spec-aware (spec-architecture) lens', () => {
      const c = render();
      expect(c).toContain('spec-architecture');
      expect(c).toContain('delta-spec');
      expect(c).toContain('dependency direction');
    });

    it('loops with verifier-confirmed criticals, a hard cap, and human escalation', () => {
      const c = render();
      // Scope to the loop section ONLY — incidental NEVER/Output-Contract text
      // must not satisfy these (guards against the substring false-green).
      const flow = c.slice(
        c.indexOf('### The Loop'),
        c.indexOf('### Harness Degradation'),
      );
      expect(flow.length).toBeGreaterThan(0);
      expect(flow).toContain('independent verifier');
      expect(flow).toMatch(/existence/i);
      expect(flow).toContain('working tree');
      expect(flow).toMatch(/re-?run.*test|pnpm test/i);
      expect(flow).toMatch(/3 rounds|maximum 5|hard cap/i);
      expect(flow).toMatch(/escalat/i);
    });

    it('persists findings to review.md via `prospec review merge`; only criticals block, major → quality_log (issue #107)', () => {
      const c = render();
      // Scope to the Persistence section — the MANDATORY-read and
      // Success-Criteria mentions of review.md must not satisfy this.
      const persist = c.slice(
        c.indexOf('### Persistence'),
        c.indexOf('## Output Contract'),
      );
      expect(persist.length).toBeGreaterThan(0);
      expect(persist).toContain('review.md');
      // the cumulative review.md bookkeeping is CLI-owned (issue #107)
      expect(persist).toContain('prospec review merge --findings');
      expect(persist).toContain('merge by finding identity');
      // identity across rounds rides the reused `id` — the CLI never infers it from location
      expect(persist).toContain("reuse the prior round's `id`");
      expect(persist).toMatch(/carr(y|ied) forward/i);
      // major findings hand off to verify via quality_log (Exit Gate), not graded
      const exit = c.slice(c.indexOf('### Exit Gate'));
      expect(exit).toContain('quality_log');
    });

    it('states the resolved harness capabilities and review-specific degraded action (REQ-TEMPLATES-066)', () => {
      const capable = sectionOf(render(), '### Harness Degradation');
      // the capability line is rendered from the injected flags, not asked at runtime
      expect(capable).toContain(CAPABILITY_LINE_LABEL);
      expect(capable).toContain('`can_spawn_subagent`: yes');
      // review's own degraded action stays in review's prose, the judgment does not
      expect(capable).toMatch(/harness'?s own reviewer/i);
      expect(capable).toContain(DEGRADE_FLOOR);
    });

    it('renders a different, spawn-free instruction when the harness declares no sub-agents', () => {
      const degraded = sectionOf(
        renderTemplate('skills/prospec-review.hbs', {
          ...TEMPLATE_CONTEXT,
          can_spawn_subagent: false,
        }),
        '### Harness Degradation',
      );
      expect(degraded).toContain('`can_spawn_subagent`: no');
      expect(degraded).toContain(NO_SPAWN_SENTINEL);
      // the capable branch's runtime-fallback wording must NOT survive here
      expect(degraded).not.toContain(RUNTIME_FALLBACK_SENTINEL);
      // …and review's degraded action is still named, so the path is actionable
      expect(degraded).toMatch(/harness'?s own reviewer/i);
      expect(degraded).toContain(DEGRADE_FLOOR);
    });
  });

  describe('Commit boundary after verify(S/A) (BL-037)', () => {
    it('prospec-implement defers commit and points to /prospec-review', () => {
      const c = renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);
      expect(c).toContain('/prospec-review');
      expect(c).toMatch(/do not commit|defer commit|not commit during/i);
    });

    it('implementation-guide reference defers commit to the verify(S/A) boundary — no in-implement commit example (issue #207)', () => {
      const guide = renderTemplate('skills/references/implementation-guide.hbs', TEMPLATE_CONTEXT);
      const commit = sectionOf(guide, '### 5. Commit Strategy');
      // the contradiction (issue #207): the guide's §5 no longer instructs an
      // in-implement commit or ships a `git commit` worked example that a model
      // (weak ones especially) would follow, breaking atomic-by-feature + PB-016.
      expect(commit).not.toMatch(/git commit/i);
      expect(commit).not.toMatch(/git add/i);
      expect(commit).not.toMatch(/commit after completing/i);
      expect(commit).not.toMatch(/recommended commit strategy/i);
      // the actual boundary: defer to verify S/A, then one atomic-by-feature commit
      expect(commit).toMatch(/do not commit during implement/i);
      expect(commit).toContain('/prospec-verify');
      expect(commit).toMatch(/S\/A/);
      expect(commit).toMatch(/atomic-by-feature/i);
      // downstream-adaptive: message format defers to the target Constitution,
      // never this repo's own commit-convention details.
      expect(commit).toContain('CONSTITUTION.md');
      // consistency: the guide is the implement SKILL's MANDATORY reference, and
      // the SKILL states the same deferred-commit boundary.
      const skill = renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);
      expect(skill).toMatch(/do not commit during implement/i);
    });

    it('prospec-verify prompts the user to commit after S/A and never auto-commits', () => {
      const c = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      const tail = c.slice(c.indexOf('## Record & Status Update'));
      expect(tail).toMatch(/commit/i);
      expect(tail).toMatch(/prompt|remind/i);
      expect(tail).toMatch(/not auto-commit|do not commit automatically|never commit on/i);
    });
  });

  describe('prospec-learn skill — feedback promotion pipeline (BL-036)', () => {
    const render = () => renderTemplate('skills/prospec-learn.hbs', TEMPLATE_CONTEXT);

    it('has the five pipeline phases under Core Workflow, Sweep first', () => {
      const c = render();
      const flow = c.slice(c.indexOf('## Core Workflow'));
      expect(flow.length).toBeGreaterThan(0);
      const phases = [...flow.matchAll(/^### (\w+)$/gm)].map((m) => m[1]);
      // ordering, not mere presence: the staleness audit is a PRE-step, so a
      // Sweep appended after Collect would defeat its purpose and go red here
      expect(phases).toEqual(['Sweep', 'Collect', 'Score', 'Promote', 'Govern']);
    });

    it('Sweep states the four sweep tests, the evidence bar, and human approval', () => {
      const c = render();
      const sweep = c.slice(c.indexOf('### Sweep'), c.indexOf('### Collect'));
      expect(sweep.length).toBeGreaterThan(0);
      // the four tests — three expiry (mechanized / gone / contradicted) + desynchronized (issue #136)
      expect(sweep).toMatch(/mechanized/i);
      expect(sweep).toMatch(/no longer applicable/i);
      expect(sweep).toMatch(/contradicted/i);
      expect(sweep).toMatch(/desynchronized/i);
      // evidence bar: a mechanism without an executor is not a mechanism
      expect(sweep).toMatch(/executor/i);
      expect(sweep).toMatch(/nothing runs is not a mechanism/i);
      // retirement is a shared-tier write — same approval discipline as Promote
      expect(sweep).toMatch(/explicit human approval/i);
      expect(sweep).toContain('needs-review list');
      // both governed files are in scope, and the reference owns the semantics
      expect(sweep).toContain('promotion-format.md');
    });

    it('the ledger tier is protected against tidy-up deletion (NEVER + Failure Conditions)', () => {
      const c = render();
      const never = c.slice(c.indexOf('## NEVER'), c.indexOf('## Error Handling'));
      expect(never.length).toBeGreaterThan(0);
      expect(never).toMatch(/NEVER\*\* delete a ledger row/);
      expect(never).toMatch(/renumber a `PB-\{NNN\}` id/);
      expect(never).toMatch(/NEVER\*\* raise a retired row's `frequency`/);
      const fail = c.slice(c.indexOf('### Failure Conditions'), c.indexOf('### Output Summary'));
      expect(fail).toMatch(/deleted, or a counter changed, to tidy the file/);
    });

    it('Startup Loading reads the whole playbook — the Sweep and duplicate-check input', () => {
      const loading = sectionOf(render(), '## Startup Loading');
      expect(loading).toContain('_playbook.md');
      expect(loading).toMatch(/in full/i);
    });

    it('Score phase states an explicit numeric promotion rule (auditable/reproducible)', () => {
      const c = render();
      const score = c.slice(c.indexOf('### Score'), c.indexOf('### Promote'));
      expect(score.length).toBeGreaterThan(0);
      expect(score).toMatch(/frequency/i);
      expect(score).toMatch(/≥|>=/);
      expect(score).toMatch(/module/i);
    });

    it('Promote phase requires explicit human approval + version control across 3 tiers', () => {
      const c = render();
      const promote = c.slice(c.indexOf('### Promote'), c.indexOf('### Govern'));
      expect(promote.length).toBeGreaterThan(0);
      expect(promote).toMatch(/human approval|explicit approval/i);
      expect(promote).toMatch(/version control/i);
      // pipeline auto-writes the governed team tier + Constitution; routed by kind
      expect(promote).toContain('_playbook.md');
      expect(promote).toContain('ConstitutionRule');
      expect(promote).toMatch(/\bkind\b/);
    });

    it('Govern phase exists and the Exit Gate records to quality_log', () => {
      const c = render();
      const govern = c.slice(c.indexOf('### Govern'), c.indexOf('## Output Contract'));
      expect(govern.length).toBeGreaterThan(0);
      expect(govern).toMatch(/TTL|conflict/i);
      const exit = c.slice(c.indexOf('### Exit Gate'));
      expect(exit).toContain('quality_log');
    });
  });

  describe('feedback-promotion integration (BL-036)', () => {
    it('promotion-format reference renders with explicit rule + approval + ledger', () => {
      const c = renderTemplate(
        'skills/references/promotion-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(c).toMatch(/≥|>=/);
      expect(c).toMatch(/frequency/i);
      expect(c).toMatch(/approval/i);
      expect(c).toMatch(/ledger/i);
    });

    it('promotion-format owns the Staleness Sweep semantics: retire + compress, never delete', () => {
      const sweep = sectionOf(
        renderTemplate('skills/references/promotion-format.hbs', TEMPLATE_CONTEXT),
        '## Staleness Sweep (pre-Collect)',
      );
      expect(sweep.length).toBeGreaterThan(0);
      // the four sweep tests, as table rows — three expiry + desynchronized (issue #136)
      for (const test of ['mechanized', 'no longer applicable', 'contradicted', 'desynchronized']) {
        expect(sweep).toContain(`| ${test} |`);
      }
      // ledger tier: counters are the evidence, so the row survives its rule
      expect(sweep).toMatch(/never deleted, never re-keyed/);
      expect(sweep).toContain('`status: retired`');
      expect(sweep).toMatch(/`frequency`, `impact_modules` and `source_changes` stay untouched/);
      expect(sweep).toMatch(/never re-opened/);
      // playbook tier: permanent ids, tombstone form, and the machine skip
      expect(sweep).toMatch(/permanent and never reused/);
      expect(sweep).toContain('- **RETIRED {date}**');
      expect(sweep).toContain('## Retired Entries');
      expect(sweep).toMatch(/never returns to the needs-review list/);
      // the two boundaries that stop the sweep from eating live knowledge
      expect(sweep).toMatch(/Mechanized ≠ retired/);
      expect(sweep).toMatch(/`personal` row is the opposite case/);
      expect(sweep).toMatch(/never compressed/);
    });

    it('prospec-plan and prospec-implement load relevant playbook lessons', () => {
      for (const s of ['prospec-plan', 'prospec-implement']) {
        const c = renderTemplate(`skills/${s}.hbs`, TEMPLATE_CONTEXT);
        expect(c).toContain('_playbook');
      }
    });
  });

  describe('knowledge flywheel — durable ledger + archive auto-harvest (BL-029)', () => {
    const renderLearn = () =>
      renderTemplate('skills/prospec-learn.hbs', TEMPLATE_CONTEXT);
    const renderArchive = () =>
      renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);
    const renderFormat = () =>
      renderTemplate('skills/references/promotion-format.hbs', TEMPLATE_CONTEXT);

    // T8 — the ledger is version-controlled; the retired gitignored path must be gone
    it('learn + promotion-format reference the version-controlled ledger, never the retired gitignored path', () => {
      for (const c of [renderLearn(), renderFormat()]) {
        expect(c).toContain('_lessons-ledger.md');
        expect(c).not.toContain('.prospec/lessons.md');
        expect(c).not.toContain('personal ledger'); // M1: relocated file is no longer a personal tier
      }
    });

    it('learn carries forward the durable ledger; the threshold config file is intentionally kept', () => {
      const loading = sectionOf(renderLearn(), '## Startup Loading');
      expect(loading).toContain('_lessons-ledger.md');
      expect(loading).not.toContain('.prospec/lessons.md');
      // .prospec/lessons.yaml is threshold config (also offered via git-tracked .prospec.yaml), not the ledger
      expect(loading).toContain('.prospec/lessons.yaml');
    });

    // T9 — Phase 4.5 is an idempotent, non-fatal auto-harvest, not a passive pointer
    it('archive Phase 4.5 auto-harvests into the ledger — idempotent, non-fatal, tasks×kind aware', () => {
      const harvest = sectionOf(
        renderArchive(),
        '### Phase 4.5: Auto-Harvest Recurring Lessons',
      );
      expect(harvest).toContain('_lessons-ledger.md');
      expect(harvest).toMatch(/idempotent/i);
      expect(harvest).toMatch(/non-fatal/i);
      expect(harvest).toContain('quality_log');
      expect(harvest).toContain('review.md');
      expect(harvest).toContain('[M]'); // tasks×kind manual-skip dimension (frozen kind schema)
      expect(harvest).toContain('/prospec-learn'); // accumulates, then hands off — no auto-promote
    });

    // REQ-AGNT-015 — archive Phase 4.5 must cite its OWN bundled promotion-format,
    // never reach into the prospec-learn sibling dir (dangling in the flattened
    // skills-dir layout shared by every agent); the Score/Promote hand-off stays.
    it('archive Phase 4.5 cites its own bundled promotion-format, not the prospec-learn sibling', () => {
      const harvest = sectionOf(
        renderArchive(),
        '### Phase 4.5: Auto-Harvest Recurring Lessons',
      );
      // self-contained markdown link into archive's own references/ (the old
      // cross-skill citation used inline code with no such link)
      expect(harvest).toContain('](references/promotion-format.md)');
      // the reference is no longer attributed to the prospec-learn sibling skill
      expect(harvest).not.toMatch(/prospec-learn`'s/);
      // but the Score/Promote workflow hand-off to /prospec-learn remains
      expect(harvest).toContain('/prospec-learn');
    });

    // The retired-row refusal lives in `prospec learn upsert`, so it is only
    // mechanical while BOTH stations write through that command — pin the writer
    // at the archive end and the rule at the reference end, or reverting either
    // to "upsert into the ledger" leaves the guard on a path nothing reaches.
    it('archive Phase 4.5 harvests through `prospec learn upsert`, and the reference states the retired-row refusal', () => {
      const harvest = sectionOf(
        renderArchive(),
        '### Phase 4.5: Auto-Harvest Recurring Lessons',
      );
      expect(harvest).toContain('prospec learn upsert --lesson');
      expect(harvest).toMatch(/never hand-edited/);
      expect(harvest).toMatch(/`retired`/);
      const fmt = sectionOf(renderFormat(), '## Harvest (archive-time auto-extraction)');
      expect(fmt.length).toBeGreaterThan(0);
      expect(fmt).toMatch(/A `retired` row is never raised by harvest/);
      expect(fmt).toContain('prospec learn upsert');
      expect(fmt).toMatch(/untouched/);
    });

    it('archive Phase 4.5 is no longer a passive suggestion-only pointer', () => {
      const content = renderArchive();
      expect(content).toContain('### Phase 4.5: Auto-Harvest Recurring Lessons');
      expect(content).not.toContain('### Phase 4.5: Suggest Feedback Collection');
    });

    // T9 — learn Entry Gate must not false-block when the ledger has material but archives are wiped (PB-002)
    it('learn Entry Gate accepts a populated ledger OR an archived change (worktree false-block fix)', () => {
      const gate = sectionOf(renderLearn(), '## Entry Gate');
      expect(gate).toContain('_lessons-ledger.md');
      expect(gate).toMatch(/\bOR\b/);
      expect(gate).toMatch(/both/i);
    });

    // T9 — health drives PRIORITIZATION only; the must-NOT-auto-write rule is stated explicitly (PB-001 negative)
    it('health prioritization is prioritization-only and explicitly forbids auto-writing _conventions.md', () => {
      const score = sectionOf(renderLearn(), '### Score');
      expect(score).toContain('knowledge_health');
      expect(score).toMatch(/prioriti/i);
      expect(score).toMatch(/never auto-write/i);
      expect(score).toContain('_conventions.md');
      const fmt = renderFormat();
      expect(fmt).toMatch(/never auto-write/i);
      expect(fmt).toContain('_conventions.md');
    });

    // T9/REQ-072 — promotion-format is the single source for harvest + prioritization
    it('promotion-format defines Harvest (idempotent, tasks×kind, no auto-promote) and prioritization as single source', () => {
      const harvest = sectionOf(
        renderFormat(),
        '## Harvest (archive-time auto-extraction)',
      );
      expect(harvest).toMatch(/idempotent/i);
      expect(harvest).toContain('[M]');
      expect(harvest).toContain('kind: playbook');
      expect(harvest).toMatch(/auto-harvest ≠ auto-promote/i);
      const prio = sectionOf(
        renderFormat(),
        '## Review-Queue Prioritization (knowledge_health)',
      );
      expect(prio).toContain('knowledge_health');
      expect(prio).toMatch(/never auto-write/i);
    });
  });
});

describe('Boilerplate partials single source + generated marker (REQ-TEMPLATES-143/144, REQ-TESTS-047)', () => {
  const skillsDir = path.join(__dirname, '../../src/templates/skills');
  const src = (name: string) => fs.readFileSync(path.join(skillsDir, `${name}.hbs`), 'utf-8');
  const readPartial = (file: string) => fs.readFileSync(path.join(skillsDir, file), 'utf-8');
  // sentinel strings that live in exactly one place (the partial) post-extraction
  const HANDOFF = 'recommend the next step in the SDD workflow order';
  const OUTPUT_NOTE = 'self-assess and emit a concise Output Summary';

  it('Next-Step Handoff is a partial single source: users reference it, none holds an inline copy (PB-006)', () => {
    // Contract test derives expected skills from SDD_STATIONS instead of hardcoded file names (PB-001)
    const expectedUsers = [
      'prospec-ff',
      ...SDD_STATIONS.map((s) => (s === 'story' || s === 'promote' ? (s === 'story' ? 'prospec-new-story' : 'prospec-promote-backfill') : `prospec-${s}`)),
    ].sort();

    const users = SKILL_DEFINITIONS.map((s) => s.name)
      .filter((n) => src(n).includes('{{> next-step-handoff}}'))
      .sort();

    expect(users).toEqual(expectedUsers);
    // a user that reverts to an inline paste (dropping the include) turns this red
    for (const n of users) expect(src(n)).not.toContain(HANDOFF);
    expect(readPartial('_next-step-handoff.hbs')).toContain(HANDOFF); // single source holds it
  });

  it('Output Contract self-assess note is a partial single source: users reference it, none holds an inline copy (PB-006)', () => {
    const users = SKILL_DEFINITIONS.map((s) => s.name).filter((n) =>
      src(n).includes('{{> output-summary-note}}'),
    );
    expect(users.length).toBeGreaterThanOrEqual(15);
    for (const n of users) expect(src(n)).not.toContain(OUTPUT_NOTE);
    expect(readPartial('_output-summary-note.hbs')).toContain(OUTPUT_NOTE);
  });

  it('a referenced partial resolves into the rendered output (single source is live)', () => {
    // prospec-plan references both partials; removing an include drops the sentinel → red
    expect(src('prospec-plan')).toContain('{{> next-step-handoff}}');
    expect(src('prospec-plan')).toContain('{{> output-summary-note}}');
    const rendered = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
    expect(rendered).toContain(HANDOFF);
    expect(rendered).toContain(OUTPUT_NOTE);
  });

  it('every skill renders the consumer-agnostic generated marker (REQ-TEMPLATES-144)', () => {
    for (const skill of SKILL_DEFINITIONS) {
      const rendered = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
      // consumer-agnostic: warns the file is generated + overwritten, WITHOUT a
      // prospec-internal `src/templates/skills/…` path (absent in downstream projects)
      expect(rendered).toContain('Generated by `prospec agent sync`');
      expect(rendered).not.toContain('src/templates/skills/');
    }
  });

  it('deployed SKILL.md files hold the exact expanded partial blocks — byte-sync guard (REQ-TESTS-047)', () => {
    // Guards the invariant the refactor exists to protect: a whitespace/content
    // edit to a partial that is NOT followed by `agent sync` would silently drift
    // the committed .claude/.agents SKILL.md from the template — this asserts the
    // FULL expanded block (not just a sentinel) is present, so such drift → red.
    const repoRoot = path.join(__dirname, '../..');
    const kbp = 'prospec/ai-knowledge'; // this repo's knowledge_base_path
    const handoffExpanded = readPartial('_next-step-handoff.hbs')
      .replace(/\{\{knowledge_base_path\}\}/g, kbp)
      .trim();
    const outputNote = readPartial('_output-summary-note.hbs').trim();
    // The language-policy partial takes no variables, so its expansion is literal.
    // Left unguarded, rewording it and skipping `agent sync` leaves every deployed
    // SKILL.md instructing the old policy with a green suite.
    const policyExpanded = readPartial('_language-policy.hbs').trim();
    const agentDirs = ['.claude/skills', '.agents/skills'];
    for (const skill of SKILL_DEFINITIONS) {
      const usesHandoff = src(skill.name).includes('{{> next-step-handoff}}');
      const usesNote = src(skill.name).includes('{{> output-summary-note}}');
      const usesPolicy = src(skill.name).includes('{{> language-policy}}');
      for (const dir of agentDirs) {
        const deployed = fs.readFileSync(
          path.join(repoRoot, dir, skill.name, 'SKILL.md'),
          'utf-8',
        );
        expect(deployed, `${dir}/${skill.name}: missing generated marker`).toContain(
          'Generated by `prospec agent sync`',
        );
        if (usesHandoff) {
          expect(deployed, `${dir}/${skill.name}: next-step-handoff drift`).toContain(
            handoffExpanded,
          );
        }
        if (usesPolicy) {
          expect(deployed, `${dir}/${skill.name}: language-policy drift`).toContain(
            policyExpanded,
          );
        }
        if (usesNote) {
          expect(deployed, `${dir}/${skill.name}: output-summary-note drift`).toContain(
            outputNote,
          );
        }
      }
    }
  });
});

// Version-controlled baseline of the test-quality criteria table. Changing this
// list is the deliberate act of changing what the lens grades; adding a row
// without touching it fails, which is the point — the mutation-naming rule was
// once a row here and belongs in review-format.md instead.
const TEST_QUALITY_CRITERIA = [
  'A contract assertion is not **section-scoped** (slices the whole file, not heading → next heading; no non-empty guard)',
  'Content-presence asserted but **structural invariants** (item-set vs a version-controlled baseline, ordering, contiguity) and **negative assertions** for "must NOT appear" rules are missing',
  'A new assertion class was never **mutation-verified** (delete/corrupt the asserted feature → the test must go red)',
  'An assertion passes **vacuously** — the slice, glob, or collection it inspects can be empty and the expectation still holds (`expect(found).not.toContain(x)` over an empty `found`)',
];

describe('Mutation testing is an on-demand audit, never a gate (REQ-TEMPLATES-169, REQ-TESTS-066)', () => {
  it('the mutation-naming rule governs the reviewer\'s output, not the change', () => {
    // A criteria row states a property of the diff and carries a severity the
    // reviewer files against it. "Name your mutations" is a property of the
    // reviewer's own finding, so it lives in the finding format instead — a row
    // in the criteria table would carry a severity with nothing to file it on.
    const format = renderTemplate('skills/references/review-format.hbs', TEMPLATE_CONTEXT);
    const findingFormat = sectionOf(format, '## review.md Format');
    expect(findingFormat).toMatch(/name the mutations/i);
    expect(findingFormat).toMatch(/indistinguishable from none/i);

    const lens = renderTemplate('skills/references/review-lenses-content.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(lens, '## Test-Quality Lens (PB-001)');

    // Freeze the ROW SET, not one phrasing. A negative grep for "name the
    // mutations" is escaped by rewording it to "list the mutations" — the
    // defect returns and nothing fails. The criteria table is a closed set:
    // adding any row at all, however worded, breaks this baseline.
    const criteria = section
      .split('\n')
      .filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l) && !/\|\s*Criterion\s*\|/i.test(l))
      .map((l) => l.split('|')[1]?.trim());
    expect(criteria, 'criteria table not found — an empty set satisfies any baseline').toHaveLength(
      TEST_QUALITY_CRITERIA.length,
    );
    expect(criteria).toEqual(TEST_QUALITY_CRITERIA);

    expect(section, 'the pointer to where the rule does live is the reader\'s only path').toMatch(
      /review-format\.md/,
    );
    // The pointer must name the criterion it belongs to. "the row above" drifts
    // as rows are added, and lands the reader on whichever row happens to sit
    // last — a rule about mutation verification attached to a different row.
    expect(section, 'the pointer must name its referent, not point positionally').toMatch(
      /mutation-verified\*\* criterion/,
    );
    expect(section).not.toMatch(/the row above/i);
  });

  it('the test-quality lens names the vacuous-pass shape at major', () => {
    const lens = renderTemplate('skills/references/review-lenses-content.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(lens, '## Test-Quality Lens (PB-001)');
    const row = section.split('\n').find((l) => /vacuously/i.test(l));
    expect(row, 'vacuous-pass row not found in the criteria table').toBeDefined();
    expect(row).toMatch(/\|\s*major/i);
    // The row must state the mechanism, not just the label — "can be empty and
    // the expectation still holds" is what makes it checkable.
    expect(row).toMatch(/empty/i);
  });

  it('no CI workflow carries a mutation step — the non-gate decision, pinned', () => {
    // Measured cost: 9m09s for one module (26 static mutants x a 416-test
    // dependent suite). A gate at that price gets switched off rather than
    // satisfied, so "not in CI" is a design decision — and a decision nothing
    // pins is a sentence in a document that anyone can quietly reverse.
    const workflow = renderTemplate('init/prospec-check.yml.hbs', TEMPLATE_CONTEXT);
    expect(workflow).not.toMatch(/stryker|mutation|mutate/i);

    // Enumerate the directory rather than naming one file: ci.yml is the actual
    // gate (lint/typecheck/counts:check/build/test:coverage) and so is where a mutation step
    // would most plausibly be added. A future workflow is covered on arrival.
    const workflowDir = path.join(__dirname, '../../.github/workflows');
    const shipped = fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));
    // The vacuity guard is naming the file that must be there, not counting to
    // a magic number: a count pinned at today's total fires on a legitimate
    // workflow merge while reporting "none found".
    expect(shipped, 'ci.yml missing — an empty or filtered-out set passes vacuously').toContain(
      'ci.yml',
    );
    for (const file of shipped) {
      const body = fs.readFileSync(path.join(workflowDir, file), 'utf-8');
      expect(body, `${file} carries a mutation step`).not.toMatch(/stryker|mutation|mutate/i);
    }
  });
});

describe('Identity rule in the finding format (REQ-TEMPLATES-067, REQ-CLI-028)', () => {
  // The merge is CLI-owned but assigning the id is the reviewer's act, so the
  // format reference is the only place that responsibility survives the
  // handoff to the tool (PB-014). Mutation-verified against review-format.hbs,
  // re-bundling each time — renderTemplate reads bundled-templates, so a
  // .hbs-only edit proves nothing (H1 first reddened against a stale bundle):
  // H0 anchor rule → "reads identity off the Location string"; H1 "**opens a
  // new row**" → "updates that row"; H2 exception clause → "no exception
  // applies"; H3 "**predate this round**" → "exist"; H4 the same-round clause
  // → "they merge"; H5 "dedup by Location" reintroduced as a sibling bullet.
  // Each reddened exactly the assertion it targets, control green. That
  // establishes non-vacuity — the clause reaches the SHIPPED text — not that a
  // reworded restatement of the old rule would be caught.
  const identityBullet = (): string => {
    const format = renderTemplate('skills/references/review-format.hbs', TEMPLATE_CONTEXT);
    const bullets = sectionOf(format, '## review.md Format')
      .split(/\n- /)
      .map(flat);
    const matches = bullets.filter((b) => b.startsWith('**Identity is the reviewer-supplied'));
    expect(matches, 'the identity rule must be exactly one bullet, not scattered').toHaveLength(1);
    return matches[0]!;
  };

  it('states all three identity paths the merge engine implements', () => {
    const bullet = identityBullet();
    expect(bullet, 'the anchor rule: identity is never read off a location').toMatch(
      /never infers identity from the Location string/,
    );
    expect(bullet, 'an unknown id must be stated to open a row, not update one').toMatch(
      /id no existing row carries \*\*opens a new row\*\*/,
    );
    expect(bullet, 'the legacy adoption path is the one exception and must be named as such').toMatch(
      /exception is a row carrying no id at all/,
    );
    expect(bullet, 'an id-less finding keys only against rows older than this round').toMatch(
      /predate this round/,
    );
    expect(bullet, 'the cost of omitting an id must be bounded to cross-round tracking').toMatch(
      /two id-less findings you file at one Location in one round stay two rows/,
    );
  });

  it('the skill body teaches the same rule as the reference it points at', () => {
    // The reviewer reads SKILL.md before the on-demand reference, so a blanket
    // rule here outranks the corrected one there — pinning only the reference
    // leaves the site that is read FIRST unguarded.
    const skill = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
    const persistence = flat(sectionOf(skill, '### Persistence'));
    expect(persistence).toMatch(/An id no row carries opens a NEW row/);
    expect(persistence).toMatch(/predate this round/);
    expect(persistence).toMatch(/stay two rows/);
    expect(
      persistence,
      'the pre-fix blanket sentence must not return',
    ).not.toMatch(/a finding without an id keys by location\+lens/i);
  });

  it('never offers Location as an identity key', () => {
    // The negative half: "dedup by Location" is the wording that produced the
    // collapsed-rows defect (issue #116). A positive assertion elsewhere does
    // not stop the old sentence from being reintroduced next to it.
    const format = renderTemplate('skills/references/review-format.hbs', TEMPLATE_CONTEXT);
    expect(flat(sectionOf(format, '## review.md Format'))).not.toMatch(/dedup\w*\s+by\s+Location/i);

    const skill = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
    expect(flat(skill)).not.toMatch(/dedup\w*\s+by\s+Location/i);
  });
});

describe('Dropped-behavior graduation gate (REQ-TEMPLATES-168)', () => {
  it('Phase 3.5 step 0 introduces EVERY worklist, and never leaves "already landed" unqualified', () => {
    // The gate assertion below slices only the gate, so without this the whole
    // step-0 rewrite can revert silently — including the exact sentence
    // ("a REQ absent from the worklist already landed its authored spec text")
    // whose false confidence this change exists to remove.
    const phase = sectionOf(
      renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT),
      '### Phase 3.5: Feature Spec Sync',
    );
    expect(phase).toMatch(/graduation worklist/i);
    expect(phase).toMatch(/dropped behavior/i);
    // REQ-TEMPLATES-166 requires the phase to name every worklist the CLI
    // produces, not a subset — the three added by this change included, or the
    // agent is told to converge from an incomplete picture.
    for (const worklist of ['refusedRequirements', 'acknowledgedDrops', 'staleDeclarations']) {
      expect(phase, `step 0 must name ${worklist}`).toContain(worklist);
    }
    // a refusal points at the block the CLI named, which is NOT always `**Spec:**`
    expect(phase).toMatch(/Acceptance Criteria.{0,120}no `\*\*Spec:\*\*` block|no `\*\*Spec:\*\*` block.{0,120}Acceptance Criteria/is);
    // the qualifier must travel with the claim, in the same sentence
    expect(phase).toMatch(/landed.{0,80}does not mean.{0,20}lost nothing/is);
    expect(phase).not.toMatch(/already landed its authored spec text\.\s*$/m);
  });

  it('Phase 3.5 gate requires each dropped bullet to be confirmed or restored', () => {
    const gate = sectionOf(
      renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT),
      '> **Phase 3.5 Gate** — proceed when:',
    );
    expect(gate).toMatch(/dropped behavior/i);
    // Confirming a deliberate removal now means WRITING it into the entry's
    // `**Dropped:**` block. The old wording ("confirmed deliberate or restored")
    // was satisfiable by asserting it in conversation, which left nothing for a
    // later reader — or the CLI — to audit.
    expect(gate).toMatch(/restored into the `\*\*Spec:\*\*` block or written into/i);
    expect(gate).toContain('**Dropped:**');
    // the refusal is a DIFFERENT finding with a different fix, and the gate says so
    expect(gate).toMatch(/refused/i);
    expect(gate).toMatch(/does not release a refusal/i);
    // an empty report must not add ceremony — the item self-satisfies
    expect(gate).toMatch(/empty report satisfies/i);
  });

  it('delta-spec-format tells the author to write the resulting requirement, not the delta', () => {
    const ref = renderTemplate('skills/references/delta-spec-format.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(ref, '## The `**Spec:**` Block — What Lands in the Feature Spec');
    expect(section).toContain('not the delta');
    expect(section).toMatch(/replaces the\s+WHOLE body/i);
    // the machine backstop is named, so the two defences stay linked
    expect(section).toMatch(/archive CLI reports/i);
    // …and its limit is stated rather than left to be discovered (PB-003)
    expect(section).toMatch(/MODIFIED path only/i);
    expect(section).toMatch(/reported by neither worklist/i);
  });
});

describe('Harness capability flags replace per-station prose (REQ-TEMPLATES-167, REQ-TESTS-063)', () => {
  const skillsDir = path.join(__dirname, '../../src/templates/skills');
  const src = (name: string) => fs.readFileSync(path.join(skillsDir, `${name}.hbs`), 'utf-8');
  const partial = fs.readFileSync(
    path.join(skillsDir, '_harness-capabilities.hbs'),
    'utf-8',
  );
  const consumers = SKILL_DEFINITIONS.map((s) => s.name).filter((n) =>
    src(n).includes('{{> harness-capabilities'),
  );

  it('is consumed by at least two stations — the mechanism is reusable, not a one-off', () => {
    expect(consumers).toEqual(expect.arrayContaining(['prospec-review', 'prospec-verify']));
    expect(consumers.length).toBeGreaterThanOrEqual(2);
  });

  it('is a partial single source: the floor and both branches live only in the partial (PB-006)', () => {
    for (const sentinel of [DEGRADE_FLOOR, RUNTIME_FALLBACK_SENTINEL, NO_SPAWN_SENTINEL]) {
      expect(partial, `partial must own: ${sentinel}`).toContain(sentinel);
    }
    for (const name of SKILL_DEFINITIONS.map((s) => s.name)) {
      for (const sentinel of [DEGRADE_FLOOR, RUNTIME_FALLBACK_SENTINEL, NO_SPAWN_SENTINEL]) {
        expect(src(name), `${name} re-inlined: ${sentinel}`).not.toContain(sentinel);
      }
    }
  });

  it('no skill template judges harness capability in prose (repo-wide negative)', () => {
    // The whole point of the flags: the SHIPPED skill states a fact. A template
    // that asks the executing agent "can you spawn a sub-agent?" reintroduces the
    // per-station judgment this change removed. Each pattern is one of the prose
    // forms actually deleted here — a narrower regex let three of them back in.
    const SELF_JUDGMENT = [
      // A capability NOUN followed by a negation, under a conditional.
      /\b(if|when|where|whether|unless)\b[^.\n]{0,80}\b(sub-?agents?|harness|execution environment|spawn(ing)?)\b[^.\n]{0,60}\b(can'?t|cannot|not supported|unsupported|not possible|lacks?|does not support|doesn'?t support|are not available|is not available|unavailable)\b/i,
      // The same shape with the negation FIRST ("no sub-agent primitive exists").
      /\b(if|when|where|whether|unless)\b[^.\n]{0,80}\b(no|without)\s+sub-?agents?\b/i,
      // Asking the agent to work it out itself.
      /\b(decide|determine|check)\s+(whether|if)\b[^.\n]{0,60}\b(harness|sub-?agents?|execution environment)\b/i,
      // "if you cannot spawn …" — the judgment relocated onto the reader.
      /\b(if|when|unless)\b[^.\n]{0,60}\b(can'?t|cannot|unable to)\s+spawn\b/i,
    ];
    // Recursive: references/*.hbs render into the same shipped skill bundle, so
    // a non-recursive readdir would leave 21 files unguarded.
    const hbsFiles = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return hbsFiles(full);
        return e.name.endsWith('.hbs') ? [full] : [];
      });
    const scanned = hbsFiles(skillsDir);
    expect(scanned.length).toBeGreaterThan(SKILL_DEFINITIONS.length); // partials + references included
    // A sentence that names the RESOLVED value is legitimate — that is the
    // mechanism, not a judgment. Only sentences that ask about the environment
    // without referencing what sync resolved are offenders.
    const REFERENCES_RESOLVED = /capability line|can_spawn_subagent|can_worktree|can_background/i;
    const offenders = scanned
      .filter((f) =>
        fs
          .readFileSync(f, 'utf-8')
          .split(/(?<=[.:;])\s|\n/)
          .some((s) => !REFERENCES_RESOLVED.test(s) && SELF_JUDGMENT.some((re) => re.test(s))),
      )
      .map((f) => path.relative(skillsDir, f));
    expect(offenders).toEqual([]);
  });

  it('agent-sync is the ONLY src render site for skill templates (capability keys cannot be skipped)', () => {
    // Handlebars is non-strict: a render site that omits `can_spawn_subagent`
    // silently emits the degraded branch as confident prose. Nothing in the
    // type system prevents that, so pin the render sites instead — a new one
    // has to be added here, which is where it gets told to pass the flags.
    const srcDir = path.join(__dirname, '../../src');
    const tsFiles = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return tsFiles(full);
        return e.name.endsWith('.ts') ? [full] : [];
      });
    const sites = tsFiles(srcDir)
      .filter((f) => /renderTemplate\(\s*[`'"]skills\//.test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(srcDir, f))
      .sort();
    expect(sites).toEqual(['services/agent-sync.service.ts']);
  });

  it('never instructs a spawn outside the partial — the degraded render cannot contradict itself', () => {
    // A spawn imperative in the station prose is emitted unconditionally, so a
    // `can_spawn_subagent: false` render would say both "spawn the reviewer" and
    // "this harness has no sub-agent primitive". The mechanism is named ONLY in
    // the partial, which is the only capability-aware text.
    const SPAWN_IMPERATIVE = /\bspawn\s+(the|an|a)\s+/i;
    for (const name of consumers) {
      for (const capable of [true, false]) {
        const rendered = renderTemplate(`skills/${name}.hbs`, {
          ...TEMPLATE_CONTEXT,
          can_spawn_subagent: capable,
        });
        const outsidePartial = rendered
          .split('\n')
          .filter((l) => !l.includes(CAPABILITY_LINE_LABEL) && !l.includes(DEGRADE_FLOOR))
          .join('\n');
        expect(
          SPAWN_IMPERATIVE.test(outsidePartial),
          `${name} (can_spawn_subagent: ${capable}) instructs a spawn outside the partial`,
        ).toBe(false);
      }
    }
  });

  it('deployed SKILL.md files differ per agent, each matching its resolved capabilities', () => {
    // .claude/skills serves claude alone; .agents/skills is one file shared by
    // codex+copilot+antigravity, so its flags are the intersection of the three.
    const repoRoot = path.join(__dirname, '../..');
    const read = (dir: string) =>
      fs.readFileSync(path.join(repoRoot, dir, 'prospec-review', 'SKILL.md'), 'utf-8');
    const claudeDoc = read('.claude/skills');
    const agentsDoc = read('.agents/skills');

    const line = (doc: string) => {
      const found = doc.split('\n').find((l) => l.includes(CAPABILITY_LINE_LABEL));
      expect(found, 'capability line missing from deployed SKILL.md').toBeDefined();
      return found!;
    };
    const claudeCaps = AGENT_CONFIGS.claude.capabilities;
    const sharedCaps = intersectCapabilities(
      (['codex', 'copilot', 'antigravity'] as const).map((a) => AGENT_CONFIGS[a].capabilities),
    );
    // the registry currently differs on exactly this flag — if that ever stops
    // being true, this guard says so rather than silently testing nothing
    expect(claudeCaps.canWorktree).not.toBe(sharedCaps.canWorktree);
    expect(line(claudeDoc)).not.toBe(line(agentsDoc));
    expect(line(claudeDoc)).toContain(
      `\`can_worktree\`: ${claudeCaps.canWorktree ? 'yes' : 'no'}`,
    );
    expect(line(agentsDoc)).toContain(
      `\`can_worktree\`: ${sharedCaps.canWorktree ? 'yes' : 'no'}`,
    );
  });
});

describe('Dependency-layer knowledge — on-demand Context7 (BL-034)', () => {
  const renderPlan = () => renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
  const renderImplement = () =>
    renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);
  const renderPlanFormat = () =>
    renderTemplate('skills/references/plan-format.hbs', TEMPLATE_CONTEXT);

  // Section 2 of plan-format contains fenced ##/### lines, so sectionOf (regex,
  // fence-unaware) would truncate early — slice by literal heading bounds instead.
  const technicalSummaryOf = (content: string): string => {
    const start = content.indexOf('### 2. Technical Summary');
    const end = content.indexOf('### 3. Affected Modules');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return content.slice(start, end);
  };

  it('plan-format Technical Summary defines the optional, additive External Library Usage subsection', () => {
    const ts = technicalSummaryOf(renderPlanFormat());
    expect(ts).toContain('External Library Usage');
    expect(ts).toContain('on-demand');
    expect(ts).toContain('Context7');
    expect(ts).toMatch(/untrusted/i);
    expect(ts).toContain('NOT a gate');
    expect(ts).toContain('skip silently');
    expect(ts).toContain('informational');
    // additive — must not disturb the mutually-exclusive Brownfield/Greenfield formats
    expect(ts).toContain('additive');
  });

  it('plan Phase 4 carries the optional, scope-guarded Context7 step (graceful, untrusted, non-gating)', () => {
    const phase4 = sectionOf(renderPlan(), '### Phase 4: Design plan.md');
    expect(phase4).toContain('third-party library');
    expect(phase4).toContain('Context7 MCP is available');
    expect(phase4).toContain('resolve-library-id');
    expect(phase4).toContain('query-docs');
    expect(phase4).toContain('External Library Usage');
    expect(phase4).toMatch(/untrusted/i);
    expect(phase4).toContain('do NOT make it a gate');
    expect(phase4).toContain('skip silently');
    expect(phase4).toContain('informational');
  });

  it('implement Phase 3 carries the optional Context7 block — per-task lazy, quick-scale aware', () => {
    const phase3 = sectionOf(
      renderImplement(),
      '### Phase 3: Execute Implementation',
    );
    expect(phase3).toContain('third-party librar'); // library / libraries
    expect(phase3).toContain('Context7 MCP is available');
    expect(phase3).toContain('resolve-library-id');
    expect(phase3).toContain('query-docs');
    expect(phase3).toContain('scale: quick');
    expect(phase3).toMatch(/untrusted/i);
    expect(phase3).toContain('do NOT make it a gate');
    expect(phase3).toContain('skip silently');
    expect(phase3).toContain('NEVER bulk-load');
  });

  // G4 / KV-cache: the step is in-phase, never in the stable prefix. Negative
  // assertion — the Startup Loading section must not mention Context7 at all.
  it('the Context7 step never enters the stable prefix (absent from both Startup Loading sections)', () => {
    const planLoading = sectionOf(renderPlan(), '## Startup Loading');
    const implementLoading = sectionOf(renderImplement(), '## Startup Loading');
    expect(planLoading).not.toContain('Context7');
    expect(implementLoading).not.toContain('Context7');
    // guard the slice actually captured the [STABLE]-marked list (not an empty match)
    expect(planLoading).toContain('[STABLE]');
    expect(implementLoading).toContain('[STABLE]');
  });

  it('both skills state the untrusted / non-gating contract in NEVER', () => {
    const planNever = sectionOf(renderPlan(), '## NEVER');
    const implementNever = sectionOf(renderImplement(), '## NEVER');
    expect(planNever).toContain('Context7');
    expect(planNever).toMatch(/untrusted/i);
    expect(implementNever).toContain('Context7');
    expect(implementNever).toMatch(/untrusted/i);
  });
});

/**
 * Extract YAML frontmatter from a Markdown document.
 */
function extractFrontmatter(content: string): string {
  if (!content.startsWith('---')) return '';
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return '';
  return content.slice(3, endIndex).trim();
}

describe('Language Policy mechanism', () => {
  const ARTIFACT_SKILLS = [
    'prospec-new-story',
    'prospec-plan',
    'prospec-tasks',
    'prospec-ff',
    'prospec-design',
    'prospec-archive',
    'prospec-learn',
    'prospec-knowledge-generate',
    'prospec-knowledge-update',
  ];

  /** Slice a rendered document to one section: from its heading to the next ## heading. */
  function sectionOf(content: string, heading: string): string {
    const start = content.indexOf(heading);
    if (start === -1) return '';
    const rest = content.slice(start + heading.length);
    const next = rest.search(/\n## /);
    return next === -1 ? rest : rest.slice(0, next);
  }

  for (const name of ARTIFACT_SKILLS) {
    it(`${name} carries a Constitution-pointing Language Policy section`, () => {
      const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
      const section = sectionOf(content, '## Language Policy');
      expect(section.length).toBeGreaterThan(0);
      expect(section).toContain("the Constitution's Language Policy rule");
      expect(section).toContain('git commit messages in English');
    });
  }

  it('non-artifact skills (e.g. explore) have no Language Policy section', () => {
    const content = renderTemplate('skills/prospec-explore.hbs', TEMPLATE_CONTEXT);
    expect(content).not.toContain('## Language Policy');
  });

  it('skill frontmatter never hardcodes a document language (BL-018 neutrality)', () => {
    for (const skill of SKILL_DEFINITIONS) {
      const content = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
      expect(content).not.toContain('written in English');
      expect(content).not.toContain("in the user's language");
    }
  });

  it('entry config declares the artifact language in its own section', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', {
      ...TEMPLATE_CONTEXT,
      artifact_language: 'Traditional Chinese (Taiwan)',
      language_is_english: false,
      skill_path: '.claude/skills',
    });
    const section = sectionOf(content, '## Language Policy');
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain('**Traditional Chinese (Taiwan)**');
    // scoped to change artifacts; the AI Knowledge base is explicitly on the
    // English/exempt side — assert the association so a meaning-inverted rewrite
    // (Knowledge base in {{artifact_language}}) cannot pass on loose substrings.
    expect(section).toContain('change artifacts');
    expect(section).toMatch(/trust zone.*remains in English/);
    expect(section).toMatch(/exempt from the .* requirement/);
    // The path sets come from the injected scope, so the entry config and the
    // Constitution rule state one scope; a hardcoded list here is the drift the
    // #67 three-way alignment missed in the generator.
    expect(section).toContain('`prospec/ai-knowledge/**`');
    expect(section).toContain('`.prospec/changes/**`');
    // Named exceptions stay out of L0 — the entry config points at the rule.
    expect(section).toMatch(/Constitution's Language Policy rule/);
  });

  it('entry config states a single English zone for an English project', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', {
      ...TEMPLATE_CONTEXT,
      language_is_english: true,
      artifact_language: 'English',
      skill_path: '.claude/skills',
    });
    const section = sectionOf(content, '## Language Policy');
    expect(section).toMatch(/written in English/);
    expect(section).not.toMatch(/exempt/i);
    expect(section).not.toContain('`.prospec/changes/**`');
  });

  it('every skill frontmatter renders the synthesized trigger words', () => {
    for (const skill of SKILL_DEFINITIONS) {
      const content = renderTemplate(`skills/${skill.name}.hbs`, {
        ...TEMPLATE_CONTEXT,
        trigger_words: `marker-${skill.name}`,
      });
      const frontmatter = extractFrontmatter(content);
      expect(frontmatter).toContain(`Triggers: marker-${skill.name}`);
    }
  });
});

describe('Skill trigger baselines', () => {
  it('every skill definition has a non-empty English trigger baseline', () => {
    for (const skill of SKILL_DEFINITIONS) {
      expect(skill.triggers.length, `${skill.name} has no triggers`).toBeGreaterThan(0);
      for (const word of skill.triggers) {
        expect(word.trim().length).toBeGreaterThan(0);
      }
    }
  });

  // REQ-TESTS-053: machine-enforce REQ-AGNT-033's "keep >= 3 triggers" intent
  // (previously only spec text; the sole machine bound was > 0, so a 2-trigger
  // skill like the old prospec-plan slipped through). Shared predicate so the
  // mutation guard exercises the SAME logic the real assertion runs (cf. the
  // collision detector guard above) — loosening the bound breaks both.
  const skillsBelowMinTriggers = (
    defs: ReadonlyArray<{ name: string; triggers: string[] }>,
    min: number,
  ): string[] => defs.filter((s) => s.triggers.length < min).map((s) => s.name);

  it('every skill baseline has >= 3 triggers (REQ-TESTS-053)', () => {
    expect(skillsBelowMinTriggers(SKILL_DEFINITIONS, 3), 'skills with < 3 triggers').toEqual([]);
  });

  it('the >= 3 min-count check flags a 2-trigger skill in the real set (mutation guard)', () => {
    expect(
      skillsBelowMinTriggers(
        [...SKILL_DEFINITIONS, { name: 'mutant', triggers: ['a', 'b'] }],
        3,
      ),
    ).toEqual(['mutant']);
  });

  it('full-table entry config lists trigger words for every skill', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', {
      ...TEMPLATE_CONTEXT,
      artifact_language: 'English',
      skill_path: '.agents/skills',
      surfaces_skill_frontmatter: false,
    });
    for (const skill of SKILL_DEFINITIONS) {
      expect(content).toContain(`**Triggers**: ${skill.triggers.join(', ')}`);
    }
  });

  it('slim entry config lists no per-skill trigger words (frontmatter surfaces them)', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', {
      ...TEMPLATE_CONTEXT,
      artifact_language: 'English',
      skill_path: '.claude/skills',
      surfaces_skill_frontmatter: true,
    });
    expect(content).not.toContain('**Triggers**:');
  });
});

describe('Startup Loading cache-stable prefix ordering (REQ-TEMPLATES-080/081)', () => {
  const baseline = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../fixtures/startup-loading-baseline.json'),
      'utf-8',
    ),
  ) as Record<string, { items: string[]; mandatory: number }>;

  function startupLoadingSection(raw: string): string {
    const match = /^## Startup Loading\n([\s\S]*?)(?=^## )/m.exec(raw);
    expect(match, 'Startup Loading section must exist').not.toBeNull();
    const section = match![1]!;
    expect(section.trim().length, 'Startup Loading section must be non-empty').toBeGreaterThan(0);
    return section;
  }

  function numberedItems(section: string): string[] {
    return section
      .split('\n')
      .filter((line) => /^\d+\.\s+/.test(line))
      .map((line) => line.replace(/^\d+\.\s+/, ''));
  }

  function itemKey(body: string): string {
    const stripped = body.replace(/^\[(STABLE|DYNAMIC)\]\s+/, '');
    const backtick = /`([^`]+)`/.exec(stripped);
    return backtick ? backtick[1]! : stripped.replace(/\*\*/g, '').trim();
  }

  for (const skill of SKILL_DEFINITIONS) {
    describe(`${skill.name}`, () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, `../../src/templates/skills/${skill.name}.hbs`),
        'utf-8',
      );
      const section = () => startupLoadingSection(raw);

      it('every loading item carries a [STABLE] or [DYNAMIC] marker', () => {
        const items = numberedItems(section());
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          expect(item, `unmarked loading item: ${item.slice(0, 60)}`).toMatch(
            /^\[(STABLE|DYNAMIC)\]\s+/,
          );
        }
      });

      it('all [STABLE] items precede all [DYNAMIC] items', () => {
        const markers = numberedItems(section())
          .map((item) => /^\[(STABLE|DYNAMIC)\]/.exec(item)?.[1])
          .filter((m): m is string => m !== undefined);
        const firstDynamic = markers.indexOf('DYNAMIC');
        const lastStable = markers.lastIndexOf('STABLE');
        if (firstDynamic !== -1 && lastStable !== -1) {
          expect(lastStable, 'a [STABLE] item appears after a [DYNAMIC] item').toBeLessThan(firstDynamic);
        }
      });

      it('loading-item set matches the pre-reorder baseline (order-only change)', () => {
        const keys = numberedItems(section()).map(itemKey).sort();
        expect(keys).toEqual(baseline[skill.name]!.items);
      });

      it('MANDATORY marker count is unchanged from baseline', () => {
        expect(section().split('**MANDATORY**').length - 1).toBe(baseline[skill.name]!.mandatory);
      });

      it('numbered loading items are contiguous (no prose interrupts the list)', () => {
        const lines = section().split('\n');
        const indices = lines
          .map((line, i) => (/^\d+\.\s+/.test(line) ? i : -1))
          .filter((i) => i !== -1);
        for (const line of lines.slice(indices[0]!, indices[indices.length - 1]! + 1)) {
          // numbered item, indented sub-content, or blank — top-level prose breaks the list
          expect(line, `prose interrupts the loading list: ${line.slice(0, 60)}`).toMatch(
            /^(\d+\.\s+|\s+\S|\s*$)/,
          );
        }
      });
    });
  }
});

describe('task kind markers — frozen schema (BL-004/OPT-B3)', () => {
  const renderTasksFormat = () =>
    renderTemplate('skills/references/tasks-format.hbs', TEMPLATE_CONTEXT);

  it('tasks-format reference carries the frozen kind definition', () => {
    const def = sectionOf(renderTasksFormat(), '### 4. Task Kind Markers');
    expect(def).toContain('single frozen definition');
    expect(def).toContain('| `[M]` | `manual` |');
    expect(def).toContain('| `[V]` | `verification` |');
    expect(def).toContain('unmarked task **is** code');
  });

  it('frozen definition states consumer semantics: code-only denominator, list-not-count for [M]/[V]', () => {
    const def = sectionOf(renderTasksFormat(), '### 4. Task Kind Markers');
    expect(def).toContain('**code tasks only**');
    expect(def).toContain('never counted in the completion denominator');
    expect(def).toContain('warn without blocking');
  });

  it('frozen definition keeps old unmarked tasks.md valid and composes with [P]', () => {
    const def = sectionOf(renderTasksFormat(), '### 4. Task Kind Markers');
    expect(def).toContain('old tasks.md files without markers remain valid');
    expect(def).toContain('`[P]` before kind');
  });

  it('tasks.md.hbs cites the kind markers without restating the definition', () => {
    const content = renderTemplate('change/tasks.md.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('[kind?]');
    expect(content).toContain('unmarked = code');
    expect(content).toContain('tasks-format reference');
    // citation only — the definition table lives in tasks-format alone
    expect(content).not.toContain('| `[M]` | `manual` |');
  });

  it('prospec-tasks instructs kind tagging and cites the frozen definition', () => {
    const content = renderTemplate('skills/prospec-tasks.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('**Task kind tagging:**');
    expect(content).toContain('Task Kind Markers');
    expect(content).toContain('do not restate');
    expect(content).not.toContain('| `[M]` | `manual` |');
  });
});

describe('scale adapter — new-story complexity assessment (BL-004)', () => {
  const render = () =>
    renderTemplate('skills/prospec-new-story.hbs', TEMPLATE_CONTEXT);

  it('Phase 3.5 assesses scale with a criteria table and quick veto', () => {
    const phase = sectionOf(render(), '### Phase 3.5: Complexity Assessment (Scale)');
    expect(phase).toContain('| Criterion | quick | standard | full |');
    expect(phase).toContain('**Hard veto:**');
    expect(phase).toContain('do NOT propose `quick`');
    expect(phase).toContain('`/prospec-archive` Entry Gate re-checks');
  });

  it('Phase 3.5 determines scale autonomously in Draft-First or with user confirmation in interactive mode', () => {
    const phase = sectionOf(render(), '### Phase 3.5: Complexity Assessment (Scale)');
    expect(phase).toContain('Draft-First mode (default)');
    expect(phase).toContain('Interactive mode (`--interactive`)');
    // the confirmed value is CLI-written — the skill never hand-serializes metadata.yaml
    expect(phase).toContain('prospec change scale quick|standard|full');
    expect(phase).toContain('never edit metadata.yaml by hand');
  });

  it('quick produces a slim proposal: single story, no FR/SC enumeration', () => {
    const phase = sectionOf(render(), '### Phase 3.5: Complexity Assessment (Scale)');
    expect(phase).toContain('**Quick slim proposal:**');
    expect(phase).toContain('skip the FR/SC enumeration');
    expect(phase).toContain('2-3 WHEN/THEN');
  });

  it('NEVER section guards quick-with-spec-impact and requires explicit Stated Assumptions', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('spec-covered behavior');
    expect(never).toContain('## Stated Assumptions');
  });
});

describe('scale adapter — ff quick path and lifecycle (BL-004)', () => {
  const renderFf = () => renderTemplate('skills/prospec-ff.hbs', TEMPLATE_CONTEXT);
  const renderLifecycle = () =>
    renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT);

  it('ff runs the scale assessment in its story phase and routes quick past plan', () => {
    const content = renderFf();
    expect(content).toContain('**Scale routing:**');
    expect(content).toContain('SKIP Phase 3 entirely');
    expect(content).toContain('no module README loading');
    expect(content).toContain('Phase 3: Plan Generation (skipped when `scale: quick`)');
  });

  it('ff quick path produces no plan artifacts and advances story → tasks', () => {
    const content = renderFf();
    const flat = sectionOf(content, '### Phase 2: Story Generation').replace(/\s+/g, ' ');
    expect(flat).toContain('no plan.md, no delta-spec.md, and no module README loading');
    expect(content).toContain('`story → tasks` directly');
  });

  it('ff NEVER guards: quick is the only legal plan skip, transitions are CLI-owned (issue #107)', () => {
    const never = sectionOf(renderFf(), '## NEVER');
    expect(never).toContain('story → tasks under `scale: quick`');
    // every status transition goes through the prospec change commands, never a hand edit
    expect(never).toContain('the `prospec change` commands own every transition');
    expect(never).toContain('never hand-edit metadata.yaml');
    // The scale may be user-confirmed OR machine-assigned by `change auto-draft`
    // — both lifecycle copies say so, and this skill must not contradict them.
    expect(never).toContain('without a `scale: quick`');
    expect(never).toContain('assigned by `prospec change auto-draft`');
    expect(never).toContain('quick skips Plan and loads none');
  });

  it('lifecycle template records the quick story → tasks transition with archive backstop', () => {
    const content = renderLifecycle();
    expect(content).toContain('skipped when metadata `scale: quick`');
    expect(content).toContain('**quick path**: metadata `scale: quick` (user-confirmed');
    expect(content).toContain('re-checked at the `/prospec-archive` Entry Gate');
    expect(content).toContain('The only legal skip is `story → tasks` under a `scale: quick`');
    // A machine-assigned scale is as legal as a confirmed one — the document
    // must not state a blanket "user-confirmed" that `change auto-draft` breaks.
    expect(content).toContain('machine-assigned by `prospec change auto-draft`');
  });

  it('lifecycle template and ai-knowledge copy stay in sync on the quick path', () => {
    const tmpl = renderLifecycle();
    const copy = fs.readFileSync(
      path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
      'utf-8',
    );
    for (const marker of [
      'skipped when metadata `scale: quick`',
      '**quick path**: metadata `scale: quick` (user-confirmed',
      'The only legal skip is `story → tasks` under a `scale: quick`',
      'machine-assigned by `prospec change auto-draft`',
      // REQ-TEMPLATES-158 AC3: the executable-router pointer stays in both copies.
      '**Executable copy**: `prospec status` computes',
      // Review F4 ruling: the router does not suggest design under quick.
      'Under `scale: quick` the router does not suggest design',
      // The matrix rationale ships to every downstream project — pinning only the
      // symbol name would let the surrounding claim drift between the copies.
      'is the **executable copy**: `prospec change plan` / `prospec change tasks` refuse from it before writing anything',
      'so the table and the registry cannot disagree',
      'routes it to the `promote` station (`/prospec-promote-backfill`), never to plan or tasks',
      "That a station actually honours a given row is proven by that station's own tests, not by this table",
      // The two reasons a status sits outside the audit scope are different facts;
      // collapsing `archived` into "exempt" is how the gap stayed unacknowledged.
      'unreachable rather than exempt',
      // Without this the honest-red window reads as a bug and gets "fixed" by
      // loosening the gate rather than by re-recording after the commit (PB-016).
      'the verify S/A feature commit itself stales both baselines',
    ]) {
      expect(tmpl).toContain(marker);
      expect(copy).toContain(marker);
    }
  });

  // REQ-TESTS-072: the previous assertion proves the two DOCUMENTS agree; it
  // cannot prove either agrees with the code. This one pins the documented
  // matrix against `SCALE_FORBIDDEN_ARTIFACTS` — the drift this change exists
  // to close (a contract stated in prose that nothing implements).
  // The station order changed in this change; REQ-TYPES-070 claims `SDD_STATIONS`
  // matches the lifecycle doc, so the doc has to carry the order and the claim has
  // to be enforced — the pre-existing omission of `design` from the spec's copy of
  // that chain is exactly what an unenforced claim decays into.
  describe('station order ↔ SDD_STATIONS', () => {
    const parseOrder = (doc: string): string[] => {
      const section = sectionOf(doc, '## Station order');
      const chain = /^`([a-z-]+(?: → [a-z-]+)+)`$/m.exec(section)?.[1];
      expect(chain, 'no backticked station chain in the Station order section').toBeDefined();
      return chain!.split(' → ');
    };

    it('the lifecycle template order equals SDD_STATIONS', () => {
      expect(parseOrder(renderLifecycle())).toEqual([...SDD_STATIONS]);
    });

    it('the ai-knowledge copy order equals SDD_STATIONS', () => {
      const copy = fs.readFileSync(
        path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
        'utf-8',
      );
      expect(parseOrder(copy)).toEqual([...SDD_STATIONS]);
    });
  });

  describe('light-scale artifact matrix ↔ code registry', () => {
    const isMatrixHeader = (headers: string[]): boolean =>
      headers[0] === 'scale' && headers[1] === 'forbidden artifacts';

    /**
     * Every cell is tokenized WHOLE: an empty set must be written exactly `—`,
     * and every other token must be backtick-wrapped. Extracting only backticked
     * tokens would make un-backticked prose ("plan.md, delta-spec.md", or an
     * emptied cell) parse as "forbids nothing" — i.e. the empty-set rows could
     * never fail whatever the doc claimed (PB-001: the extraction key must cover
     * the whole target).
     */
    const parseMatrix = (doc: string): Record<string, string[]> => {
      // Section-scoped: a table sitting outside its own heading must not satisfy
      // this assertion, and a second contradicting table must not hide behind the
      // first one findTable happens to reach.
      const section = sectionOf(doc, '## Light-scale artifact matrix');
      expect(
        doc
          .split('\n')
          .filter(
            (l) =>
              l.trimStart().startsWith('|') &&
              isMatrixHeader(splitTableRow(l).map((h) => h.toLowerCase())),
          ),
        'exactly one matrix table may exist per document',
      ).toHaveLength(1);
      const table = findTable(section.split('\n'), { isTarget: isMatrixHeader });
      expect(table, 'Light-scale artifact matrix table not found in its section').not.toBeNull();
      const matrix: Record<string, string[]> = {};
      for (const row of table!.rows) {
        const scale = (row[0] ?? '').replace(/`/g, '').trim();
        const cell = (row[1] ?? '').trim();
        if (cell === '—') {
          matrix[scale] = [];
          continue;
        }
        matrix[scale] = cell
          .split(',')
          .map((token) => {
            const artifact = /^`([^`]+)`$/.exec(token.trim())?.[1];
            expect(
              artifact,
              `matrix cell for '${scale}' has a non-backticked entry (${token.trim()}); an empty set must be written '—'`,
            ).toBeDefined();
            return artifact!;
          })
          .sort();
      }
      return matrix;
    };

    const registry = Object.fromEntries(
      Object.entries(SCALE_FORBIDDEN_ARTIFACTS).map(([scale, artifacts]) => [
        scale,
        [...artifacts].sort(),
      ]),
    );

    it('the lifecycle template matrix equals the registry, both directions', () => {
      expect(parseMatrix(renderLifecycle())).toEqual(registry);
    });

    it('the ai-knowledge copy matrix equals the registry, both directions', () => {
      const copy = fs.readFileSync(
        path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
        'utf-8',
      );
      expect(parseMatrix(copy)).toEqual(registry);
    });

    it('names the registry as the executable copy, so the table is not a second source', () => {
      for (const doc of [
        renderLifecycle(),
        fs.readFileSync(
          path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
          'utf-8',
        ),
      ]) {
        expect(sectionOf(doc, '## Light-scale artifact matrix')).toContain(
          'SCALE_FORBIDDEN_ARTIFACTS',
        );
      }
    });
  });

  // REQ-TESTS-073: same shape as the matrix pin above, for the scope the two
  // provenance gates enforce. The defect it closes was precisely a scope stated
  // in prose ("judges only status==implemented") that no document reconciled
  // with the state it needed to guard.
  describe('provenance audit scope ↔ code registry', () => {
    const isScopeHeader = (headers: string[]): boolean =>
      headers[0] === 'status' && headers[1] === 'audited';

    /**
     * Both columns are tokenized WHOLE: the status must be backtick-wrapped and the
     * verdict must be exactly `Yes` or `No`. A loose `includes('Yes')` would let a
     * hedged cell ("Yes, but only …") or an emptied one still parse as a verdict, so
     * the `No` rows — the ones that make `archived`'s absence falsifiable — could
     * never fail whatever the doc claimed (PB-001: the key must cover the target).
     */
    const parseScope = (doc: string): Record<string, boolean> => {
      const section = sectionOf(doc, '## Provenance audit scope');
      expect(
        doc
          .split('\n')
          .filter(
            (l) =>
              l.trimStart().startsWith('|') &&
              isScopeHeader(splitTableRow(l).map((h) => h.toLowerCase())),
          ),
        'exactly one provenance audit-scope table may exist per document',
      ).toHaveLength(1);
      const table = findTable(section.split('\n'), { isTarget: isScopeHeader });
      expect(table, 'Provenance audit scope table not found in its section').not.toBeNull();
      const scope: Record<string, boolean> = {};
      for (const row of table!.rows) {
        const cell = (row[0] ?? '').trim();
        const status = /^`([^`]+)`$/.exec(cell)?.[1];
        expect(status, `audit-scope row carries a non-backticked status (${cell})`).toBeDefined();
        const verdict = (row[1] ?? '').trim();
        expect(
          ['Yes', 'No'],
          `audit-scope verdict for '${status}' must be exactly Yes or No, found '${verdict}'`,
        ).toContain(verdict);
        scope[status!] = verdict === 'Yes';
      }
      return scope;
    };

    // Keyed over EVERY lifecycle status, not only the audited ones: a table that
    // listed just the Yes rows would make dropping `archived` — or any other
    // exclusion — unfalsifiable.
    const expected = Object.fromEntries(
      CHANGE_STATUSES.map((status) => [
        status,
        (PROVENANCE_AUDITED_STATUSES as readonly string[]).includes(status),
      ]),
    );

    it('the lifecycle template scope equals the registry, both directions', () => {
      expect(parseScope(renderLifecycle())).toEqual(expected);
    });

    it('the ai-knowledge copy scope equals the registry, both directions', () => {
      const copy = fs.readFileSync(
        path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
        'utf-8',
      );
      expect(parseScope(copy)).toEqual(expected);
    });

    it('names the registry as the executable copy, so the table is not a second source', () => {
      for (const doc of [
        renderLifecycle(),
        fs.readFileSync(
          path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
          'utf-8',
        ),
      ]) {
        expect(sectionOf(doc, '## Provenance audit scope')).toContain(
          'PROVENANCE_AUDITED_STATUSES',
        );
      }
    });
  });
});

describe('scale adapter — plan tiered depth (OPT-B5)', () => {

  it('plan Entry Gate refuses quick changes and produces no artifacts for them', () => {
    const content = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
    const gate = sectionOf(content, '## Entry Gate');
    expect(gate).toContain('`metadata.scale` is not `quick`');
    expect(gate).toContain('NO plan.md/delta-spec.md');
    expect(gate).toContain('Absent `scale` reads as `standard`');
  });

  it('plan Phase 4 tiers depth by scale', () => {
    const content = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
    const phase = sectionOf(content, '### Phase 4: Design plan.md');
    expect(phase).toContain('**Scale-tiered depth**');
    expect(phase).toContain('keep under 120 lines');
    expect(phase).toContain('complete architecture analysis');
  });

  it('plan-format reference defines the three scale tiers', () => {
    const content = renderTemplate(
      'skills/references/plan-format.hbs',
      TEMPLATE_CONTEXT,
    );
    const tiers = sectionOf(content, '## Scale Tiers');
    expect(tiers).toContain('| `quick` |');
    expect(tiers).toContain('| `standard` (or absent) |');
    expect(tiers).toContain('| `full` |');
    expect(tiers).toContain('the 120-line cap does not apply');
  });
});

describe('backfill graduation — verify spec-fidelity contract (scale: backfill)', () => {
  const renderVerify = () =>
    renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);

  it('2/5 becomes the primary graded fidelity dimension under scale: backfill', () => {
    const v2 = sectionOf(renderVerify(), '### Verification 2/5');
    expect(v2).toContain('`metadata.scale: backfill`');
    expect(v2).toContain('primary graded dimension');
    expect(v2).toContain('spec-fidelity');
    expect(v2).toContain('file:line');
    expect(v2).toContain('NEVER an empty PASS');
  });

  it('3/5 records pre-existing code-quality MUST violations as informational under backfill', () => {
    const v3 = sectionOf(renderVerify(), '### Verification 3/5');
    expect(v3).toContain('`metadata.scale: backfill`');
    expect(v3).toContain('informational tech-debt note');
    expect(v3).toContain('not introduced by this backfill');
    expect(v3).toContain('does NOT lower the grade');
    expect(v3).toContain('not a new-code quality gate');
  });

  it('5/5 treats missing backfill tests as informational but a failing existing test as real FAIL', () => {
    const v5 = sectionOf(renderVerify(), '### Verification 5/5');
    expect(v5).toContain('`metadata.scale: backfill`');
    expect(v5).toContain('informational');
    expect(v5).toContain('real FAIL');
    expect(v5).toContain('never exempt a genuinely failing test');
  });

  it('Record & Status Update notes backfill S/A means fidelity, not code quality', () => {
    const status = sectionOf(renderVerify(), '## Record & Status Update');
    expect(status).toContain('`metadata.scale: backfill`');
    expect(status).toContain('faithful to the code');
  });

  it('NEVER guards: pre-existing debt cannot lower grade; fidelity + failing tests stay hard', () => {
    const never = sectionOf(renderVerify(), '## NEVER');
    expect(never).toContain('pre-existing code-quality violation');
    expect(never).toContain('not a new-code quality gate');
    expect(never).toContain('fidelity and real test failures stay hard');
  });

  it('Entry Gate binds the backfill quality relaxations to backfill-draft.md provenance', () => {
    const gate = sectionOf(renderVerify(), '## Entry Gate');
    expect(gate).toContain('`metadata.scale: backfill` provenance');
    expect(gate).toContain('`.prospec/changes/[name]/backfill-draft.md` exists');
    expect(gate).toContain('graded as standard');
    expect(gate).toContain('hand-editable metadata');
  });

  it('NEVER guards: backfill relaxations require the provenance check (marker alone is self-attested)', () => {
    const never = sectionOf(renderVerify(), '## NEVER');
    expect(never).toContain('without the Entry Gate\'s provenance check');
    expect(never).toContain('self-attested');
  });

  it('Entry Gate requires only proposal + delta-spec for backfill (no hollow plan/tasks)', () => {
    const gate = sectionOf(renderVerify(), '## Entry Gate');
    expect(gate).toContain('Exception — `metadata.scale: backfill`');
    expect(gate).toContain('only proposal.md + delta-spec.md');
    expect(gate).toContain('no forward plan and no task list');
  });

  it('1/5 task-completion is not-applicable for backfill (no tasks.md)', () => {
    const v1 = sectionOf(renderVerify(), '### Verification 1/5');
    expect(v1).toContain('`metadata.scale: backfill`');
    expect(v1).toContain('not-applicable');
    expect(v1).toContain('NEVER as PASS');
  });
});

describe('backfill graduation — archive acceptance + module derivation (scale: backfill)', () => {
  const renderArchive = () =>
    renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);

  it('Entry Gate derives backfill affected modules from related_modules + Feature→feature-map', () => {
    const gate = sectionOf(renderArchive(), '## Entry Gate');
    expect(gate).toContain('`metadata.scale: backfill`');
    expect(gate).toContain('metadata.related_modules');
    expect(gate).toContain('feature-map.yaml');
    expect(gate).toContain('never silently empty');
    // feature-slug REQ ids must NOT be the backfill module source
    expect(gate).toContain('REQ-prefix extraction does **not** map to modules');
  });

  it('Phase 4 reuses the backfill module set, not REQ-id prefixes', () => {
    const p4 = sectionOf(renderArchive(), '### Phase 4: Knowledge Sync Re-check');
    expect(p4).toContain('scale: backfill');
    expect(p4).toContain('related_modules');
    expect(p4).toContain('does not apply to feature-slug REQ IDs');
  });

  it('Phase 3.5 graduation key includes the backfill → delta-spec arm', () => {
    const p35 = sectionOf(renderArchive(), '### Phase 3.5: Feature Spec Sync');
    expect(p35).toContain('`backfill` → delta-spec');
  });

  // REQ-TEMPLATES-166: graduation starts from the CLI's preserved-body worklist
  // instead of re-reading every synced spec (REQ-SERVICES-072).
  it('Phase 3.5 starts graduation from the CLI graduation worklist and gates on it', () => {
    // Bound the slice at the next h3: the file's `sectionOf` stops only at the next
    // h2, which would span Phases 3.6/3.7/4/4.5 and let these assertions pass even
    // if the worklist step migrated to another station.
    const p35 = sectionOf(renderArchive(), '### Phase 3.5: Feature Spec Sync').split('\n### ')[0]!;
    expect(p35.trim().length, 'Phase 3.5 slice is non-empty').toBeGreaterThan(0);
    expect(p35).toContain('graduation worklist');
    expect(p35).toContain('did NOT replace');
    expect(p35).toContain('`**Spec:**` block');
    // the mechanical MODIFIED claim is now conditional, not unconditional
    expect(p35).toContain('only where the delta-spec carried a `**Spec:**` block');
    // and the gate names the convergence obligation
    expect(p35).toContain('no REQ left with only a title');
  });

  it('documents that the archive service does not auto-trigger knowledge-update or raw-scan', () => {
    const c = renderArchive();
    expect(c).toContain('does **not** auto-trigger a knowledge update or a raw-scan refresh');
    expect(c).toContain('only knowledge-sync path');
    // the removed reverse claim (service auto-triggers a safety net) must not reappear
    expect(c).not.toContain('auto-triggers a knowledge update');
  });

  it('Phase 2 skips the tasks-completion check for backfill (no tasks.md)', () => {
    const p2 = sectionOf(renderArchive(), '### Phase 2: Generate Summary');
    expect(p2).toContain('`scale: backfill` has no tasks.md — skip this step');
  });

  it('review Entry Gate omits plan/tasks for backfill (only proposal + delta-spec)', () => {
    const gate = sectionOf(
      renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT),
      '## Entry Gate',
    );
    expect(gate).toContain('Exception — `metadata.scale: backfill`');
    expect(gate).toContain('only proposal.md + delta-spec.md');
  });
});

describe('backfill graduation — promote-backfill skill (scale: backfill entry point)', () => {
  const render = () =>
    renderTemplate('skills/prospec-promote-backfill.hbs', TEMPLATE_CONTEXT);

  it('Entry Gate rejects an unresolved NEEDS CLARIFICATION draft', () => {
    const gate = sectionOf(render(), '## Entry Gate');
    expect(gate).toContain('[NEEDS CLARIFICATION]');
    expect(gate).toContain('no unresolved');
    expect(gate).toContain('backfill-draft.md');
  });

  it('metadata phase writes scale: backfill, status: implemented, non-empty related_modules', () => {
    const p = sectionOf(render(), '### Phase 4: metadata.yaml');
    expect(p).toContain('`scale: backfill`');
    expect(p).toContain('`status: implemented`');
    expect(p).toContain('related_modules');
  });

  it('produces the light scaffold via the CLI (story/scale/status/validate) — no hollow plan.md/tasks.md (issue #107)', () => {
    const c = render();
    // the two staged spec artifacts have their own workflow phases
    expect(c).toContain('### Phase 2: Scaffold + proposal.md');
    expect(c).toContain('### Phase 3: delta-spec.md');
    // metadata is CLI-written end-to-end: scaffold, scale, status, machine verdict
    expect(c).toContain('prospec change story');
    expect(c).toContain('--related-module');
    expect(c).toContain('prospec change scale backfill');
    expect(c).toContain('prospec change status implemented');
    expect(c).toContain('prospec validate promote-scaffold');
    // the hand-serialization instruction is gone (issue #107)
    expect(c).toContain('Never hand-serialize metadata.yaml');
    expect(c).not.toContain('Serialize as data');
    // backfill is a light scale: no plan/tasks phases (would be hollow make-work)
    expect(c).not.toContain('### Phase 3: plan.md');
    expect(c).not.toContain('### Phase 5: tasks.md');
    expect(c).toContain('No `plan.md` and no `tasks.md`');
    // and the no-plan/tasks rationale is explicit, not silent
    expect(c).toContain('hollow make-work');
  });

  it('NEVER writes the trust zone, carries unresolved intent, or empties related_modules', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('specs/features/'); // base_dir-templated trust zone
    expect(never).toContain('unresolved `[NEEDS CLARIFICATION]`');
    expect(never).toContain('leave `related_modules` empty');
    expect(never).toContain('but `backfill`'); // scale must be backfill
  });
});

describe('backfill graduation — lifecycle + format docs (scale: backfill)', () => {
  const renderLifecycle = () =>
    renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT);

  it('lifecycle template records the promote-backfill → implemented entry path', () => {
    const content = renderLifecycle();
    expect(content).toContain('**backfill path**: metadata `scale: backfill`');
    expect(content).toContain('the **backfill entry point**');
    expect(content).toContain('enters at `implemented`');
  });

  it('lifecycle template and ai-knowledge copy stay in sync on the backfill path', () => {
    const tmpl = renderLifecycle();
    const copy = fs.readFileSync(
      path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
      'utf-8',
    );
    for (const marker of [
      '**backfill path**: metadata `scale: backfill`',
      'the **backfill entry point**',
      'it enters at `implemented` under metadata `scale: backfill`',
    ]) {
      expect(tmpl).toContain(marker);
      expect(copy).toContain(marker);
    }
  });

  it('new-story marks scale: backfill as a promotion-time scale, not a new-story option', () => {
    const phase = sectionOf(
      renderTemplate('skills/prospec-new-story.hbs', TEMPLATE_CONTEXT),
      '### Phase 3.5: Complexity Assessment (Scale)',
    );
    expect(phase).toContain('`scale: backfill` is not a new-story-time option');
    expect(phase).toContain('promotion-time');
    // the new-story-time CLI write enumerates exactly the three sizes (issue #107)
    expect(phase).toContain('prospec change scale quick|standard|full');
  });

  it('delta-spec-format reference allows a feature-slug REQ-id for backfill', () => {
    const ref = renderTemplate(
      'skills/references/delta-spec-format.hbs',
      TEMPLATE_CONTEXT,
    );
    const naming = sectionOf(ref, '## REQ ID Naming Convention');
    expect(naming).toContain('Backfill (`scale: backfill`)');
    expect(naming).toContain('REQ-{FEATURE-SLUG}-{NUMBER}');
    expect(naming).toContain('need not be module-based');
  });

  // REQ-TEMPLATES-166: the landing-block contract — what the mechanical sync
  // copies, and what happens when it is missing (REQ-SERVICES-072).
  it('delta-spec-format defines the **Spec:** landing block with its preserve-and-report fallback', () => {
    const ref = renderTemplate('skills/references/delta-spec-format.hbs', TEMPLATE_CONTEXT);
    const block = sectionOf(ref, '## The `**Spec:**` Block — What Lands in the Feature Spec');
    expect(block.length).toBeGreaterThan(0);

    // lands verbatim, in spec form, in the TARGET spec's language
    expect(block).toContain('verbatim');
    expect(block).toContain('- WHEN …, THEN …');
    expect(block).toContain("target Feature Spec's language");

    // the per-entry contract: MODIFIED required, ADDED optional
    expect(block).toContain('**MODIFIED**');
    expect(block).toContain('REQUIRED');
    expect(block).toContain('preserved unchanged');
    expect(block).toContain('pending convergence');
    expect(block).toContain('**ADDED**');
    expect(block).toContain('Optional');
    expect(block).toContain('title only');

    // negative: Before/After/Reason must NOT be described as landing content
    expect(block).toContain('never copied into the Feature');

    // "verbatim" has an edge — the reference must state it (PB-003), and now also
    // what happens PAST that edge: a foreign label is a refusal, not a silent cut.
    expect(block).toContain('Where the block ends');
    expect(block).toContain('at any Markdown heading');
    expect(block).toMatch(/refuses that REQ/);
    expect(block).toMatch(/byte-identical/);
    // negative: the superseded promise must be gone, or authors keep writing the
    // shape that used to be silently truncated
    expect(block).not.toContain('is NOT landed, silently');
    // The declaration that releases a deliberate removal lives in its own h3, so
    // it is scoped separately — asserting it against the whole reference would let
    // the `**Dropped:**` line in the MODIFIED scaffold mask a deletion here.
    const declaration = sectionOf(ref, '### `**Dropped:**` — declaring a deliberate removal');
    expect(declaration).toMatch(/stale declaration/i);
    expect(declaration).toMatch(/holds the write/i);
    expect(declaration).toMatch(/--dry-run/);

    // both entry templates advertise the block (asserted on the whole reference:
    // the ADDED/MODIFIED sections embed fenced `### REQ-…` lines, which a
    // heading-scoped slice would truncate at)
    expect(ref).toContain('**Spec:** (optional for ADDED');
    expect(ref).toContain('**Spec:** (REQUIRED for MODIFIED');
  });

  it('delta-spec-format and feature-spec-format explain sub-module slices', () => {
    const delta = renderTemplate('skills/references/delta-spec-format.hbs', TEMPLATE_CONTEXT);
    const feature = renderTemplate('skills/references/feature-spec-format.hbs', TEMPLATE_CONTEXT);

    expect(delta).toContain('automatically resolved sub-module slice');
    expect(feature).toContain('split it into per-story slices');
    expect(feature).toContain('## Slices');
  });
});

describe('scale adapter — review quick degradation (REQ-TEMPLATES-090)', () => {
  const render = () =>
    renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);

  it('Entry Gate relaxes planning artifacts to proposal+tasks for quick only', () => {
    const gate = sectionOf(render(), '## Entry Gate');
    expect(gate).toContain('**Exception — `metadata.scale: quick`**');
    expect(gate).toContain('only proposal.md + tasks.md are required');
    expect(gate).toContain('do not FAIL on their absence');
    // the standard/full requirement must survive the exception
    expect(gate).toContain('proposal.md, plan.md, delta-spec.md, tasks.md');
  });

  it('spec-architecture lens degrades honestly under quick: not-applicable, never PASS', () => {
    const lenses = sectionOf(render(), '### Review Lenses');
    expect(lenses).toContain('**Quick degradation**');
    expect(lenses).toContain('`not-applicable`');
    expect(lenses).toContain('never report it as PASS');
    expect(lenses).toContain('dependency direction, module conventions, and ripple checks still run in full');
  });

  it('quick lens raises an early spec-impact warning ahead of the archive gate', () => {
    const lenses = sectionOf(render(), '### Review Lenses');
    expect(lenses).toContain('raise an early warning');
    expect(lenses).toContain('`/prospec-archive` Entry Gate re-checks');
  });
});

describe('scale adapter — verify kind-aware completion and quick reduction (REQ-TEMPLATES-088)', () => {
  const render = () =>
    renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);

  it('V1 completion denominator counts code tasks only; [M]/[V] listed, not graded', () => {
    const v1 = sectionOf(render(), '### Verification 1/5');
    expect(v1).toContain('**code tasks only**');
    expect(v1).toContain('never counted in the rate');
    expect(v1).toContain('listed as reminders, not graded');
    expect(v1).toContain('tasks-format reference');
  });

  it('V2 reports not-applicable for quick and never PASS', () => {
    const v2 = sectionOf(render(), '### Verification 2/5');
    expect(v2).toContain('`not-applicable`');
    expect(v2).toContain('NEVER as PASS');
    expect(v2).toContain('`/prospec-archive` Entry Gate');
  });

  it('Entry Gate relaxes planning artifacts for quick only', () => {
    const gate = sectionOf(render(), '## Entry Gate');
    expect(gate).toContain('**Exception — `metadata.scale: quick`**');
    expect(gate).toContain('only proposal.md + tasks.md are required');
  });

  it('NEVER guards the not-applicable honesty rule', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('report a `not-applicable` dimension as PASS');
    // quick (2/5 N/A) and backfill (1/5 N/A) are the only planning-doc exceptions
    expect(never).toContain('these are the only exceptions');
  });
});

describe('scale adapter — archive quick gates and kind-aware completion (REQ-TEMPLATES-089/010)', () => {
  const render = () =>
    renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);

  it('Entry Gate derives quick modules from diff paths via module-map, not REQ prefixes', () => {
    const gate = sectionOf(render(), '## Entry Gate');
    expect(gate).toContain('**actual diff file paths**');
    expect(gate).toContain('module-map.yaml');
    expect(gate).toContain('empty set and would silently pass');
    expect(gate).toContain('The path mapping is deterministic');
  });

  it('Entry Gate quick spec-impact check blocks on impact and records no-impact diagnostics', () => {
    const gate = sectionOf(render(), '## Entry Gate');
    expect(gate).toContain('**Quick spec-impact check**');
    expect(gate).toContain('LLM judgment step (do not claim determinism)');
    expect(gate).toContain('**Spec Impact** section appended to proposal.md');
    expect(gate).toContain('record the diagnostic conclusion in summary.md and skip graduation');
  });

  it('Phase 3.5 graduation key switches by scale', () => {
    const phase = sectionOf(render(), '### Phase 3.5: Feature Spec Sync');
    expect(phase).toContain('**Graduation key by scale**');
    expect(phase).toContain('`quick` → the proposal\'s **Spec Impact** section');
  });

  it('summary completion counts code tasks only; manual unchecked never blocks', () => {
    const phase = sectionOf(render(), '### Phase 2: Generate Summary');
    expect(phase).toContain('**code tasks only**');
    expect(phase).toContain('**warn and list them**');
    expect(phase).toContain('reminder only, never blocking');
  });

  it('NEVER forbids reading an empty REQ-prefix set as no-impact evidence', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('an absent delta-spec is not evidence of no impact');
    expect(never).toContain('the actual diff is');
  });
});

describe('scale adapter — implement quick awareness (round-2 fix)', () => {
  const render = () =>
    renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);

  it('treats proposal.md as the spec source when plan/delta-spec are absent (quick)', () => {
    const content = render();
    expect(content).toContain('absent for `scale: quick` by contract — proposal.md is the spec source');
    expect(content).toContain('extract intent and acceptance scenarios from proposal.md instead');
    expect(content).toContain('quick: against proposal.md acceptance scenarios');
  });

  it('does not route quick changes to /prospec-plan for spec clarification', () => {
    const errors = sectionOf(render(), '## Error Handling');
    expect(errors).toContain('supplement proposal.md instead');
    expect(errors).toContain('`/prospec-plan` refuses quick');
  });

  it('NEVER bullet names the quick spec source', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('quick: proposal.md acceptance scenarios are the spec');
  });
});

describe('Verify drift-engine integration (REQ-TEMPLATES-092)', () => {
  const render = () => renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);

  it('Startup Loading runs the engine as a [DYNAMIC] step — a missing engine is a probe STOP, never a fallback (issue #107)', () => {
    const loading = sectionOf(render(), '## Startup Loading');
    const engineItem = loading
      .split('\n')
      .find((l) => /^\d+\.\s+/.test(l) && l.includes('`prospec check --json`'));
    expect(engineItem, 'engine loading item missing').toBeTruthy();
    expect(engineItem).toContain('[DYNAMIC]');
    // the CLI is required: unavailability STOPs at the shared probe, it is not gradable
    expect(engineItem).toContain('a missing engine is a STOP at the probe, never a gradable state');
    expect(engineItem).toContain('never adjudicate a machine dimension yourself');
    expect(engineItem).not.toContain('drift engine unavailable');
    expect(engineItem).not.toMatch(/fall back/);
  });

  it('Verification 1/5 sources completion facts from the task-completion check', () => {
    const v1 = sectionOf(render(), '### Verification 1/5');
    expect(v1).toContain('`task-completion`');
    expect(flat(v1)).toContain('do not recount tasks.md by hand');
    // the check no longer merely supplies facts — its status IS the verdict
    expect(v1).toContain("Its status IS this dimension's result");
    expect(v1).toContain('never a manual PASS');
    // denominator semantics unchanged (MODIFIED REQ-TEMPLATES-088 keeps grading intact)
    expect(v1).toContain('code tasks only');
    expect(v1).toContain('never counted in the rate');
  });

  it('Verification 4/5 bases freshness on the knowledge_health report section', () => {
    const v4 = sectionOf(render(), '### Verification 4/5');
    expect(v4).toContain('`structural.knowledge_health`');
    expect(flat(v4)).toContain('git-timestamp staleness');
    expect(v4).toContain('never PASS');
    // semantic observations stay LLM work, layered on — but never overturning — the verdict
    expect(flat(v4)).toContain('**add** semantic observations');
    expect(v4).toContain('never overturn');
  });

  it('NEVER section forbids skipped-as-PASS and hand-adjudicating/relaying machine dimensions (issue #107)', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('skipped means unchecked');
    // machine dimensions are self-sourced by `prospec verify record` — never hand-fed
    expect(never).toContain('adjudicate a machine dimension yourself or relay one into `prospec verify record`');
    expect(never).not.toMatch(/fall back/);
  });

  it('Error Handling covers verify-record refusal and honest skips — the engine-unavailable fallback row is gone (issue #107)', () => {
    const errors = sectionOf(render(), '## Error Handling');
    // refusal path: rebuild the report, pass exactly the judgment set
    expect(errors).toContain('`prospec verify record` refuses');
    expect(errors).toContain('machine dimensions are self-sourced, never relayed');
    // an honest per-check skip carries into 5/5 as not-adjudicated
    expect(errors).toContain('`--record-tests` skips');
    expect(errors).toContain('not-adjudicated');
    // the old CLI-unavailable fallback wording must not reappear
    expect(errors).not.toContain('`prospec check` unavailable');
    expect(errors).not.toContain('drift engine unavailable');
  });
});

// US-18: Phase-1 start + per-phase gates (REQ-TEMPLATES-097).
// The 8 numbered-phase skills (survey 2026-06-13); the other 5 (explore,
// knowledge-generate, learn, review, verify) use non-numbered structure — exempt.
// Semantic decimal/sub-step phases (archive 3.5/3.6/4.5, new-story 3.5, design 2a/2b)
// are intentional insertions and are kept — only Phase 0 (ff) is corrected.
describe('US-18: Phase-1 start + per-phase gates', () => {
  const NUMBERED_PHASE_SKILLS = [
    'prospec-archive',
    'prospec-design',
    'prospec-ff',
    'prospec-implement',
    'prospec-knowledge-update',
    'prospec-new-story',
    'prospec-plan',
    'prospec-tasks',
  ];

  const renderSkill = (name: string) =>
    renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
  const phaseHeadings = (content: string): string[] =>
    content.match(/^#{3,4} Phase [^\n]+/gm) ?? [];

  it('prospec-ff starts at Phase 1 (no Phase 0)', () => {
    const content = renderSkill('prospec-ff');
    expect(content).not.toMatch(/^#{3,4} Phase 0\b/m);
    expect(content).toMatch(/^#{3,4} Phase 1\b/m);
  });

  for (const name of NUMBERED_PHASE_SKILLS) {
    it(`${name}: every non-terminal phase carries a gate checklist`, () => {
      const content = renderSkill(name);
      const phases = phaseHeadings(content);
      expect(phases.length).toBeGreaterThan(1);
      // one "**Phase X Gate**" per non-terminal phase (the terminal phase — a Summary, or
      // implement's Move-to-Next loop-back — carries no gate)
      const gates = (content.match(/Phase \S+ Gate/g) ?? []).length;
      expect(
        gates,
        `${name}: expected >= ${phases.length - 1} per-phase gates, found ${gates}`,
      ).toBeGreaterThanOrEqual(phases.length - 1);
    });
  }
});

// US-17: Constitution substantive-emptiness prompt (REQ-TEMPLATES-096).
// explore + knowledge-generate end-of-run check that the Constitution holds only
// the seeded example rules + Language Policy (no project-authored rules).
describe('US-17: Constitution emptiness prompt', () => {
  for (const name of ['prospec-explore', 'prospec-knowledge-generate']) {
    it(`${name} prompts when the Constitution is substantively empty`, () => {
      const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
      expect(content).toContain('substantively empty');
      expect(content).toContain('seeded example rules');
    });
  }
});

// US-20: implement progress anchoring (REQ-TEMPLATES-100). ff is N/A (no task loop).
describe('US-20: implement progress anchoring', () => {
  it('prospec-implement emits a Progress/Goal/Next anchor after each task', () => {
    const content = renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('Progress X/Y');
    expect(content).toContain('Progress Y/Y (Complete)');
  });
});

// US-19: status-aware handoff (REQ-TEMPLATES-098 / MODIFIED-061) + new-session detection (REQ-TEMPLATES-099).
describe('US-19: status-aware handoff + session detection', () => {
  const HANDOFF_SKILLS = [
    'prospec-plan',
    'prospec-tasks',
    'prospec-implement',
    'prospec-review',
    'prospec-verify',
    'prospec-archive',
  ];
  for (const name of HANDOFF_SKILLS) {
    it(`${name} ends with a streamlined status-aware next-step handoff`, () => {
      const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
      expect(content).toContain('Next-Step Handoff');
      expect(content).not.toContain('(Y/n)');
      expect(content).toContain('_status-lifecycle.md');
    });
  }

  it('entry config points session start at `prospec status` (routing as code)', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', TEMPLATE_CONTEXT);
    // Section-scoped (PB-001): slice Session Start to the next ## heading.
    const start = content.indexOf('## Session Start');
    expect(start).toBeGreaterThan(-1);
    const rest = content.slice(start + '## Session Start'.length);
    const next = rest.search(/\n## /);
    const section = next === -1 ? rest : rest.slice(0, next);
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain('prospec status');
    expect(section).toContain('_status-lifecycle.md');
    // required-CLI posture (issue #107): install/upgrade and STOP, no manual-scan fallback
    expect(section).toContain('never substitute manual steps');
    expect(section).not.toContain('fall back to scanning');
    expect(section).not.toContain('.prospec/changes/');
    // The prose station-order derivation is gone — the router owns it now.
    expect(section).not.toContain('suggested next step in the SDD workflow order');
    expect(section).not.toContain('own no status transition');
  });
});

describe('vendored engineering-heuristic references (REQ-TEMPLATES-083/084/085, REQ-AGNT-022)', () => {
  // Full MIT permission + warranty text, not a one-line credit — each rendered
  // references/ copy is a redistributed copy that must carry the notice.
  const MIT_PERMISSION = 'Permission is hereby granted, free of charge';
  const MIT_WARRANTY = 'WITHOUT WARRANTY OF ANY KIND';
  const MIT_COPYRIGHT = 'Copyright (c) 2025 Addy Osmani';
  const UPSTREAM_SHA = '662910cd1a23';

  describe('debug-recovery-format reference (verify)', () => {
    const render = () =>
      renderTemplate('skills/references/debug-recovery-format.hbs', TEMPLATE_CONTEXT);

    it('carries the full MIT notice + upstream SHA baseline', () => {
      const c = render();
      expect(c).toContain(MIT_COPYRIGHT);
      expect(c).toContain(MIT_PERMISSION);
      expect(c).toContain(MIT_WARRANTY);
      expect(c).toContain(UPSTREAM_SHA);
    });

    it('carries the root-cause triage playbook', () => {
      const c = render();
      expect(c).toContain('Reproduce first');
      expect(c).toContain('git bisect');
      expect(c).toMatch(/symptom .* root cause|symptom from root cause/i);
      expect(c).toMatch(/regression test/i);
      expect(c).toContain('untrusted'); // error output treated as untrusted data
    });
  });

  describe('review-lenses-content reference (review)', () => {
    const render = () =>
      renderTemplate('skills/references/review-lenses-content.hbs', TEMPLATE_CONTEXT);

    it('carries the full MIT notice + upstream SHA baseline', () => {
      const c = render();
      expect(c).toContain(MIT_COPYRIGHT);
      expect(c).toContain(MIT_PERMISSION);
      expect(c).toContain(MIT_WARRANTY);
      expect(c).toContain(UPSTREAM_SHA);
    });

    it('defines the three conditional lenses with concrete criteria', () => {
      const c = render();
      expect(c).toContain('Security & Data Integrity Lens');
      expect(c).toContain('Efficiency / Performance Lens');
      expect(c).toContain('Maintainability / DRY Lens');
      // concrete, checkable items from each lens
      expect(c).toMatch(/IDOR|SSRF|injection/);
      expect(c).toMatch(/N\+1/);
      expect(c).toMatch(/LCP|INP|CLS/);
      expect(c).toMatch(/DRY|Chesterton/);
    });

    it('pre-maps each criterion onto the critical/major/nit vocabulary', () => {
      const c = render();
      expect(c).toContain('critical');
      expect(c).toContain('major');
      expect(c).toContain('nit');
    });

    it('cites review-format as the single severity source, never redefines severity', () => {
      const c = render();
      expect(c).toContain('review-format.md');
      // review-format.hbs owns this exact definition sentence — it must not be duplicated here
      expect(c).not.toContain('A finding is critical only if');
    });
  });

  describe('skill bodies cite the references on demand (not Startup Loading)', () => {
    const sectionOf = (content: string, heading: string): string => {
      const lines = content.split('\n');
      const start = lines.findIndex((l) => l.trim() === heading);
      if (start === -1) return '';
      const rest = lines.slice(start + 1);
      const end = rest.findIndex((l) => /^#{2,3} /.test(l));
      return (end === -1 ? rest : rest.slice(0, end)).join('\n');
    };

    it('prospec-verify cites debug-recovery-format in Verification 5/5, not Startup Loading', () => {
      const c = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      // section-scoped: the citation lives in V5/5, not merely somewhere in the doc
      expect(sectionOf(c, '### Verification 5/5: Test Verification — `[machine]`')).toContain(
        'references/debug-recovery-format.md',
      );
      const startup = sectionOf(c, '## Startup Loading');
      expect(startup).not.toContain('debug-recovery-format');
    });

    it('prospec-review cites review-lenses-content in the lens section, not Startup Loading', () => {
      const c = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
      // section-scoped: the citation lives in the Review Lenses section, not merely somewhere in the doc
      expect(sectionOf(c, '### Review Lenses')).toContain(
        'references/review-lenses-content.md',
      );
      const startup = sectionOf(c, '## Startup Loading');
      expect(startup).not.toContain('review-lenses-content');
    });

    it('keeps the spec-architecture lens prospec-owned and non-replaceable', () => {
      const c = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
      expect(c).toMatch(/spec-architecture lens is always added by prospec/);
      expect(c).toContain('never replaced by the vendored lens criteria');
    });

    it('introduces no runtime dependency on the external plugin (no agent-skills: invocation)', () => {
      const verify = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      const review = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
      expect(verify).not.toContain('agent-skills:');
      expect(review).not.toContain('agent-skills:');
    });

    // The format refs moved OUT of Startup Loading (baseline item-set + MANDATORY
    // count guard the "not preloaded" side) MUST still be cited on-demand in the
    // consuming phase, or a future edit silently deploys a ref no phase reads.
    it('prospec-ff cites each format ref in its consuming phase, not as a Startup Loading MANDATORY item', () => {
      const c = renderTemplate('skills/prospec-ff.hbs', TEMPLATE_CONTEXT);
      expect(sectionOf(c, '### Phase 2: Story Generation')).toContain('references/proposal-format.md');
      expect(sectionOf(c, '### Phase 3: Plan Generation (skipped when `scale: quick`)')).toContain('references/plan-format.md');
      expect(sectionOf(c, '### Phase 3: Plan Generation (skipped when `scale: quick`)')).toContain('references/delta-spec-format.md');
      expect(sectionOf(c, '### Phase 3: Plan Generation (skipped when `scale: quick`)')).toContain('references/plan-verifier-rubric.md');
      expect(sectionOf(c, '### Phase 4: Tasks Generation')).toContain('references/tasks-format.md');
      expect(sectionOf(c, '## Startup Loading')).not.toContain('**MANDATORY**');
    });

    it('prospec-plan cites each format ref in its consuming phase, not as a Startup Loading MANDATORY item', () => {
      const c = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
      expect(sectionOf(c, '### Phase 4: Design plan.md')).toContain('references/plan-format.md');
      expect(sectionOf(c, '### Phase 5: Generate delta-spec.md')).toContain('references/delta-spec-format.md');
      expect(sectionOf(c, '### Phase 6: Architecture Verification (site-specific: dependency/layering)')).toContain('references/plan-verifier-rubric.md');
      expect(sectionOf(c, '## Startup Loading')).not.toContain('**MANDATORY**');
    });

    it('prospec-archive cites each format ref in its consuming phase, not as a Startup Loading MANDATORY item', () => {
      const c = renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);
      expect(sectionOf(c, '### Phase 2: Generate Summary')).toContain('references/archive-format.md');
      expect(sectionOf(c, '### Phase 3.5: Feature Spec Sync')).toContain('references/feature-spec-format.md');
      expect(sectionOf(c, '### Phase 3.6: Product Spec Sync')).toContain('references/product-spec-format.md');
      expect(sectionOf(c, '## Startup Loading')).not.toContain('**MANDATORY**');
    });
  });

  it('prospec-verify is registered as a reference-bearing skill', () => {
    const verify = SKILL_DEFINITIONS.find((s) => s.name === 'prospec-verify');
    expect(verify?.hasReferences).toBe(true);
  });
});

// Hierarchical-index migration path (REQ-KNOW-034): `prospec upgrade` back-fills a
// BASELINE root <base_dir>/index.md, but the consent-gated upgrade skill is the ONLY
// mechanism that migrates a legacy <kb>/_index.md's curated content into it — pin
// that instruction's existence and its data-loss guard.
describe('prospec-upgrade: legacy index migration step', () => {
  it('carries the index enrichment/migration instruction targeting the root index.md', () => {
    const content = renderTemplate('skills/prospec-upgrade.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('**Index enrichment / migration**');
    expect(content).toContain('_index.md');
    expect(content).toContain('/index.md');
  });

  it('instructs copying curated table rows verbatim; `prospec knowledge update` is now safe (no-clobber backfill, issue #107)', () => {
    const content = renderTemplate('skills/prospec-upgrade.hbs', TEMPLATE_CONTEXT);
    // the curated Keywords/Aliases/Rationale/Depends On cells exist nowhere else
    expect(content).toContain(
      'copy both the Core/Demand Conventions lists and the\n   curated `Modules` table rows verbatim'
    );
    // the rebuild prohibition flipped: knowledge update backfills curated columns no-clobber
    expect(content).toMatch(/A later\s+`prospec knowledge update` run is safe/);
    expect(content).toContain('no-clobber');
    expect(content).not.toMatch(/Do NOT run\s+`prospec knowledge update`/);
  });
});

// Issue #48: the skill's Step 2 scan scope comes from the report's Docs
// inventory (derived from INIT_DOC_REGISTRY) — a file list hardcoded in the
// template is exactly the drift that made upgrade miss `_glossary.md`.
describe('prospec-upgrade: inventory-driven doc refresh (issue #48)', () => {
  const render = () => renderTemplate('skills/prospec-upgrade.hbs', TEMPLATE_CONTEXT);

  it('Step 1 documents the Docs inventory report section (present/MISSING lines)', () => {
    const step1 = sectionOf(render(), '### Step 1');
    expect(step1).toContain('Docs inventory:');
    expect(step1).toContain('MISSING');
  });

  it('Step 2 takes its scan scope from the report inventory and offers to create MISSING docs', () => {
    const step2 = sectionOf(render(), '### Step 2');
    // pin the load-bearing instruction sentence, not just any mention of the
    // section name — the version-mismatch fallback also says `Docs inventory:`
    expect(step2).toContain("Take the scan scope from Step 1's `Docs inventory:` section");
    expect(step2).toContain('That list is the ONLY scan scope');
    expect(step2).toMatch(/marks MISSING.*offer to create/s);
    // version-mismatch fallback: an inventory-less report stops the step
    expect(step2).toContain('no `Docs inventory:` section');
    expect(step2).toContain('re-run `prospec upgrade`');
  });

  it('Step 2 carries NO hardcoded convention-doc scan list (negative — the #48 root cause)', () => {
    const step2 = sectionOf(render(), '### Step 2');
    // The Index Migration pair (`_index.md` → root `index.md`) is the only
    // per-file path allowed to remain; every convention-doc name must be gone.
    expect(step2).not.toContain('_status-lifecycle.md');
    expect(step2).not.toContain('_module-readme-conventions.md');
    expect(step2).not.toContain('_diagram-conventions.md');
    expect(step2).not.toContain('_glossary.md');
    expect(step2).not.toContain('_conventions.md');
    expect(step2).not.toContain('CONSTITUTION');
  });

  it('NEVER block forbids maintaining a file list inside the skill', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('**NEVER** scan from a file list maintained inside this skill');
    expect(never).toMatch(/create a doc the inventory marks MISSING without/);
  });
});

// The generator fix reaches only projects initialized after it; an existing
// CONSTITUTION.md is the owner's file and `prospec upgrade` never edits it. This
// step is the consent-gated migration path — the one authored-wording change the
// skill may propose, because that wording is an init seed.
describe('prospec-upgrade: seeded Language Policy migration (Step 2.5)', () => {
  const render = () => renderTemplate('skills/prospec-upgrade.hbs', TEMPLATE_CONTEXT);

  it('Step 1 documents the stale-wording report line and the block Step 2.5 needs', () => {
    const step1 = sectionOf(render(), '### Step 1');
    expect(step1).toContain('stale Language Policy wording:');
    expect(step1).toContain('Current Language Policy rule:');
  });

  it('Step 2.5 is report-gated, diff-first, consent-gated, and section-scoped', () => {
    const step = sectionOf(render(), '### Step 2.5');
    expect(step).toContain('stale Language Policy wording:');
    expect(step).toMatch(/Show a diff of the Language Policy section only/);
    expect(step).toMatch(/ask whether to rewrite/);
    expect(step).toMatch(/only that principle's `Description` \/ `Rationale` \/ `Verify` body/);
    expect(step).toMatch(/declines/);
  });

  // The retrieval source is the thing that made this step a no-op for every
  // downstream project: the constitution template carries no rule text, so an
  // instruction to fetch it there can never succeed.
  it('Step 2.5 takes the wording from the report and forbids the impossible retrieval', () => {
    const step = sectionOf(render(), '### Step 2.5');
    expect(step).toMatch(/Take the replacement wording from the report's `Current Language Policy rule:` block/);
    expect(step).toMatch(/Do NOT try\s+`prospec print-template init\/constitution\.md\.hbs`/);
  });

  it('Output Contract and NEVER pin the consent gate', () => {
    const criteria = sectionOf(render(), '### Success Criteria');
    expect(criteria).toMatch(/stale Language Policy wording.*consent/s);

    const never = sectionOf(render(), '## NEVER');
    expect(never).toMatch(/\*\*NEVER\*\* run Step 2\.5 unprompted/);

    const failures = sectionOf(render(), '### Failure Conditions');
    expect(failures).toMatch(/rewrote the Language Policy section without a diff and confirmation/);
  });

  it('promotion-format scopes the language exception to description and keeps status a bare enum', () => {
    const c = renderTemplate('skills/references/promotion-format.hbs', TEMPLATE_CONTEXT);
    const ledger = sectionOf(c, '## Lessons Ledger');
    expect(ledger).toMatch(/\*\*description\*\*: written in the language of the original correction/);
    expect(ledger).toMatch(/Language Policy names this column/);
    expect(ledger).toMatch(/Every other column stays English/);
    // status is a closed token set; provenance prose there is what put this repo's
    // own ledger outside both the enum and the language exception.
    expect(ledger).toMatch(/\*\*status\*\*:.*`retired`/);
    expect(ledger).toMatch(/a \*\*bare token\*\*/);
    expect(ledger).toMatch(/never appended to this column/);
  });
});

describe('Archive summary Review & Verify section (REQ-TEMPLATES-126)', () => {
  const render = () =>
    renderTemplate('skills/references/archive-format.hbs', TEMPLATE_CONTEXT);

  it('archive-format defines a Review & Verify section spec with grade, criticals/majors, and quality_log digest', () => {
    // The content categories must live in the section's own PROSE, not in its
    // fenced `## Review & Verify` example — an example demonstrating a category
    // is not the reference defining it. These assertions used to lean on
    // `sectionOf` stopping at the fence's `## ` line, which it no longer does
    // (that boundary silently truncated other sections), so mask the fence here
    // and pin the prose directly rather than depending on where a slice ends.
    const section = withoutFencedBlocks(
      sectionOf(render(), '### 6. Review & Verify').split('\n'),
    ).join('\n');
    expect(section.trim().length, 'prose-only slice is empty — every expectation below would pass vacuously').toBeGreaterThan(0);
    expect(section).toContain('quality grade');
    expect(section).toContain('critical');
    expect(section).toContain('major');
    expect(section).toContain('findings excerpt');
    expect(section).toContain('quality_log');
    // AC3: no-fabrication guard when evidence is absent
    expect(section).toMatch(/never fabricate/i);
  });

  it('Review & Verify sits between Completion and Knowledge Update (AC1 ordering)', () => {
    const content = render();
    const completionIdx = content.indexOf('### 5. Completion Summary');
    const reviewIdx = content.indexOf('### 6. Review & Verify');
    const knowledgeIdx = content.indexOf('Knowledge Update Hints');
    expect(completionIdx).toBeGreaterThan(-1);
    expect(reviewIdx).toBeGreaterThan(completionIdx);
    expect(knowledgeIdx).toBeGreaterThan(reviewIdx);
  });
});

describe('Archive skill writes the Review & Verify section (REQ-TEMPLATES-127)', () => {
  const render = () =>
    renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);

  it('Phase 2 assembles the section from quality_log/review.md/verify report and its Gate checks it', () => {
    const phase2 = sectionOf(render(), '### Phase 2: Generate Summary');
    expect(phase2).toContain('Review & Verify');
    expect(phase2).toContain('quality_log');
    expect(phase2).toContain('review.md');
    // no-fabrication rule carried into the write step
    expect(phase2).toMatch(/fabricate/i);
    // the Phase 2 Gate blockquote (inside the Phase 2 slice) checks the section
    expect(phase2).toMatch(/Phase 2 Gate[\s\S]*Review & Verify/);
  });

  it('NEVER guards against emitting a summary that lacks the Review & Verify section', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toMatch(/NEVER[\s\S]*Review & Verify/);
  });
});

describe('Lessons-ledger evidence points to committed _archived-history (REQ-TEMPLATES-128)', () => {
  it('Harvest names the committed _archived-history evidence pointer', () => {
    const content = renderTemplate(
      'skills/references/promotion-format.hbs',
      TEMPLATE_CONTEXT,
    );
    const harvest = sectionOf(content, '## Harvest (archive-time auto-extraction)');
    expect(harvest).toContain('_archived-history');
    // the name-aligned, date-prefixed committed record
    expect(harvest).toContain('{date}-{name}');
    expect(harvest).toMatch(/evidence/i);
  });
});

describe('Knowledge sync folded into the verify S/A commit prompt (REQ-TEMPLATES-129, REQ-CHNG-004)', () => {
  const verify = () => renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
  const archive = () => renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);

  it('verify commit prompt folds knowledge-update + count re-derivation into the feature commit', () => {
    const status = sectionOf(verify(), '## Record & Status Update');
    expect(status).toMatch(/Sync affected-module Knowledge/);
    expect(status).toContain('/prospec-knowledge-update');
    expect(status).toMatch(/Re-derive factual counts/);
    expect(status).toContain('into the feature commit');
    // framed as prevention with archive as backstop, not archive-deferred
    expect(status).toContain('backstop');
  });

  it('verify commit prompt instructs running prospec knowledge verify to stamp freshness', () => {
    const status = flat(sectionOf(verify(), '## Record & Status Update'));
    expect(status).toContain('prospec knowledge verify');
    expect(status).toContain('prospec knowledge verify <modules...>');
    expect(status).toContain('scale: backfill');
    expect(status).toContain(
      'sync only the READMEs named by `metadata.related_modules` (by description) and run `prospec knowledge verify <modules...>`',
    );
  });

  it('verify commit prompt stays generic — no repo-specific count command hardcoded', () => {
    // the template ships to every prospec project; `pnpm counts` is this repo's own
    expect(verify()).not.toContain('pnpm counts');
  });

  it('verify commit-prep avoids citing not-yet-graduated REQ ids (no req-references trip)', () => {
    expect(sectionOf(verify(), '## Record & Status Update')).toContain('not-yet-graduated REQ ids');
  });

  it('archive Entry Gate is a backstop that still FAILs on unsynced Knowledge (defense in depth)', () => {
    const gate = sectionOf(archive(), '## Entry Gate');
    expect(gate).toContain('backstop');
    expect(gate).toMatch(/FAIL/); // the hard refuse-to-archive check is preserved
    expect(gate).not.toContain('single mandatory'); // demoted from the absolute claim
  });

  it('lifecycle §What each gate checks is identical across canonical doc and shipped template (no dual-copy drift)', () => {
    const gateSection = (text: string): string => {
      const body = /## What each gate checks[^\n]*\n([\s\S]*?)(?=^## )/m.exec(text)?.[1] ?? '';
      expect(body.trim().length, '§What each gate checks not found').toBeGreaterThan(0);
      return body.trim();
    };
    const canonical = fs.readFileSync(
      path.join(process.cwd(), 'prospec/ai-knowledge/_status-lifecycle.md'),
      'utf-8',
    );
    const template = renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT);
    const canonicalSection = gateSection(canonical);
    expect(gateSection(template)).toBe(canonicalSection);
    // the new framing is present in both copies
    expect(canonicalSection).toContain('prevention point is the `/prospec-verify` S/A commit prompt');
    expect(canonicalSection).toContain('backstop');
  });
});

describe('mechanize-review-gate — review provenance gate + playbook fall-back (issue #66)', () => {
  const renderReview = () => renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
  const renderVerify = () => renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
  const renderImplement = () => renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);
  const renderLenses = () => renderTemplate('skills/references/review-lenses-content.hbs', TEMPLATE_CONTEXT);

  it('prospec-review records every round via `prospec change log` (incl. review-clean) and stamps the baseline (issue #107)', () => {
    const prov = sectionOf(renderReview(), '### Review Provenance (machine gate)');
    expect(prov).toContain('review-clean');
    // the round record is CLI-written, never a hand-serialized quality_log entry
    expect(prov).toContain('prospec change log --skill prospec-review');
    expect(prov).toContain('prospec check --record-review');
    // negative: a clean review that records nothing is called out as indistinguishable from no review
    expect(prov).toContain('indistinguishable from a review that never ran');
  });

  it('prospec-verify Entry Gate BLOCKS a non-backfill change with absent/stale review (not the old advisory note)', () => {
    const gate = sectionOf(renderVerify(), '## Entry Gate');
    expect(gate).toContain('Review provenance (blocking, non-backfill)');
    expect(gate).toContain('review-provenance');
    expect(gate).toContain('stale');
    expect(gate).toContain('do not proceed');
    // scale: backfill keeps the current recommended-only exemption
    expect(gate).toContain('`scale: backfill` review exemption');
    // negative: the bypassable "Absence does NOT block verify" language is gone
    expect(gate).not.toContain('Absence does NOT block verify');
  });

  it('prospec-verify NEVER forbids proceeding when review-provenance FAILs', () => {
    const never = sectionOf(renderVerify(), '## NEVER');
    expect(never).toContain('review-provenance');
    expect(never).toContain('review absent or stale');
  });

  it('residual playbook rules fall back to gates — PB-001 & PB-007 inline in prospec-implement NEVER', () => {
    const never = sectionOf(renderImplement(), '## NEVER');
    expect(never).toContain('PB-001');
    expect(never).toContain('mutation-verify');
    expect(never).toContain('PB-007');
    expect(never).toContain('grep EVERY consumer');
  });

  it('residual playbook rules fall back to lenses — PB-001/003/006/007 grep-hittable in review-lenses-content', () => {
    const lenses = renderLenses();
    expect(sectionOf(lenses, '## Docs-Claims / Measurement-Attribution Lens (PB-003)')).toContain('claim ⊆ implementation');
    expect(sectionOf(lenses, '## Parallel-Site Completeness Lens (PB-007)')).toContain('parallel consumer');
    expect(sectionOf(lenses, '## Test-Quality Lens (PB-001)')).toContain('mutation-verified');
    // PB-006 strengthened the existing DRY lens with the parallel-module clause
    expect(sectionOf(lenses, '## Maintainability / DRY Lens')).toContain('PB-006');
  });

  it('prospec-review Review Lenses reference the new docs-claims / parallel-site / test-quality lenses', () => {
    const lenses = sectionOf(renderReview(), '### Review Lenses');
    expect(lenses).toContain('docs-claims');
    expect(lenses).toContain('parallel-site');
    expect(lenses).toContain('test-quality');
  });
});

describe('detect-inlined-gate-desync — Inlined/Mechanized annotation anchors (issue #136)', () => {
  // Reads the REAL _playbook.md (not a rendered template): this is the governance
  // file whose annotations the desync Sweep and this structural guard both read.
  const playbook = fs.readFileSync(
    path.join(process.cwd(), 'prospec/ai-knowledge/_playbook.md'),
    'utf8',
  );
  const renderLenses = () => renderTemplate('skills/references/review-lenses-content.hbs', TEMPLATE_CONTEXT);

  // An annotation line carries a DATED bold lead — `**Inlined into gate {date}**`
  // or `**Mechanized {date}**`. Requiring the date excludes both the
  // `## Maintenance Rules` prose that merely *names* the concept (backticked, no
  // bold) and the `**Mechanized ≠ retired**` heading bullet (bold, but no date).
  const annotationLines = playbook
    .split('\n')
    .filter((l) => /\*\*(Inlined into gate|Mechanized) \d{4}-\d{2}-\d{2}\*\*/.test(l));

  // Parse a `Landing:` clause into { path, marker } pairs.
  // Grammar: `Landing:` then one or more `` `path` (marker) `` items, comma-separated.
  const parseLanding = (line: string): { anchorPath: string; marker: string }[] => {
    const idx = line.indexOf('Landing:');
    if (idx === -1) return [];
    const pairs: { anchorPath: string; marker: string }[] = [];
    // Sticky: consume only the CONTIGUOUS run of `path` (marker) items immediately
    // after `Landing:`, comma-separated, and stop at the first non-anchor char. A
    // mid-line annotation (PB-008) whose Landing clause is followed by unrelated
    // prose cannot leak a spurious pair, because the scan halts at the closing '.'.
    const re = /`([^`]+)`\s*\(([^)]+)\)(?:,\s*)?/y;
    re.lastIndex = idx + 'Landing:'.length;
    while (line[re.lastIndex] === ' ') re.lastIndex++;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const [, anchorPath, marker] = match;
      if (anchorPath && marker) pairs.push({ anchorPath, marker });
    }
    return pairs;
  };

  // A Landing path is either skill-relative (`references/*.hbs`, `prospec-*.hbs` →
  // src/templates/skills/) or a repo-relative code path (`tsconfig.typecheck.json`,
  // `src/**`). Resolve against both roots; null when it exists at neither.
  const resolveAnchorPath = (p: string): string | null => {
    const candidates = [
      path.join(process.cwd(), p),
      path.join(process.cwd(), 'src/templates/skills', p),
    ];
    return candidates.find((c) => fs.existsSync(c)) ?? null;
  };

  it('every Inlined/Mechanized annotation carries a non-empty Landing: anchor', () => {
    // Non-empty guard (PB-001 vacuous-pass shape): the filter must actually match
    // the six live annotations (PB-001/003/006/007/008/016), never an empty set.
    expect(annotationLines.length).toBeGreaterThanOrEqual(6);
    for (const line of annotationLines) {
      expect(line, `annotation missing Landing: clause → ${line.slice(0, 70)}`).toContain('Landing:');
      expect(
        parseLanding(line).length,
        `empty Landing anchor list → ${line.slice(0, 70)}`,
      ).toBeGreaterThan(0);
    }
  });

  it('every bold Inlined/Mechanized annotation lead is dated — no dateless annotation escapes the guard', () => {
    // A bold `**Inlined into gate …**` / `**Mechanized …**` lead, minus the
    // `**Mechanized ≠ retired**` maintenance-rule prose. The structural filter keys
    // on the DATED form; asserting equality means a dateless authoring slip cannot
    // slip past `annotationLines` and skip the Landing-anchor check unnoticed.
    const boldLeads = playbook
      .split('\n')
      .filter((l) => /\*\*(Inlined into gate|Mechanized) /.test(l) && !/Mechanized ≠ retired/.test(l));
    expect(boldLeads.length).toBeGreaterThanOrEqual(6); // non-empty guard
    expect(boldLeads.length).toBe(annotationLines.length);
  });

  it('every Landing anchor names an existing file that contains its marker', () => {
    const allPairs = annotationLines.flatMap(parseLanding);
    expect(allPairs.length).toBeGreaterThanOrEqual(6); // non-empty guard
    for (const { anchorPath, marker } of allPairs) {
      const resolved = resolveAnchorPath(anchorPath);
      expect(resolved, `Landing path does not resolve: ${anchorPath}`).not.toBeNull();
      const content = fs.readFileSync(resolved as string, 'utf8');
      expect(
        content.includes(marker),
        `marker "${marker}" absent from ${anchorPath}`,
      ).toBe(true);
    }
  });

  it('the docs-claims and parallel-site lenses carry PB-003/PB-007 CURRENT strengthened clauses', () => {
    const lenses = renderLenses();
    const docs = sectionOf(lenses, '## Docs-Claims / Measurement-Attribution Lens (PB-003)');
    expect(docs).toContain('who runs it and when'); // PB-003 2026-08-03 enforcement face
    expect(docs).toContain('nothing enforces'); // PB-003 2026-08-06 no-enforcer face
    const par = sectionOf(lenses, '## Parallel-Site Completeness Lens (PB-007)');
    expect(par).toContain('re-running the full lens each round'); // PB-007 2026-07-31 remediation
  });
});

describe('converge-constitution-audit — single full Constitution audit at verify (issue #66 scope 3)', () => {
  const render = (name: string) => renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);

  it('verify is the sole full-audit station (every principle)', () => {
    const v = render('prospec-verify');
    expect(sectionOf(v, '## Key Difference from Other Skills')).toContain('sole');
    expect(sectionOf(v, '### Verification 3/5: Constitution Full Audit')).toContain('every principle');
  });

  it('no other skill performs a full every-principle Constitution audit (negative)', () => {
    for (const s of SKILL_DEFINITIONS) {
      if (s.name === 'prospec-verify') continue;
      const c = render(s.name);
      expect(c, `${s.name} must not claim a Constitution full audit`).not.toContain('full audit');
      expect(c, `${s.name} must not audit every principle`).not.toContain('every principle');
    }
  });

  it('no skill instructs a generic multi-principle Constitution scan (negative)', () => {
    for (const s of SKILL_DEFINITIONS) {
      expect(render(s.name), `${s.name} must not do a generic 3+ principles scan`).not.toMatch(
        /3\+ most relevant|3 most relevant principles|Compare against 3/,
      );
    }
  });

  it('planning/execution stations check only their site-specific Constitution rule', () => {
    expect(
      sectionOf(render('prospec-new-story'), '### Phase 6: Constitution Check (site-specific: INVEST)'),
    ).toContain('INVEST');
    expect(
      sectionOf(render('prospec-plan'), '### Phase 6: Architecture Verification (site-specific: dependency/layering)'),
    ).toContain('dependency-direction/layering');
    expect(
      sectionOf(render('prospec-tasks'), '### Phase 6: Task Contract & Verifier Audit (site-specific: TDD & dependency/layering)'),
    ).toContain('TDD');
    expect(render('prospec-implement')).toContain('site-specific');
  });

  it('ff no longer forbids skipping the per-phase Constitution check (negative)', () => {
    expect(render('prospec-ff')).not.toContain('skip Constitution check at any phase');
  });

  it('orphaned Constitution [STABLE] loads removed from non-consuming skills (negative)', () => {
    for (const name of [
      'prospec-archive',
      'prospec-design',
      'prospec-backfill-spec',
      'prospec-promote-backfill',
      'prospec-knowledge-update',
    ]) {
      const startup = sectionOf(render(name), '## Startup Loading');
      expect(startup, `${name} Startup Loading must not load the Constitution (orphaned)`).not.toContain(
        'prospec/CONSTITUTION.md',
      );
    }
  });
});

describe('quick-scale-and-ceremony-cleanup — scale reduction + ceremony pruning (issue #67)', () => {
  const render = (name: string) => renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
  const QUALITY_GATE_TABLE = '| Check Item | PASS | WARN |';

  it('verify gives quick a genuine scale-aware reduction, not just a relabel', () => {
    const v = render('prospec-verify');
    const startup = sectionOf(v, '## Startup Loading');
    expect(startup).toContain('Scale-aware execution (`metadata.scale: quick`)');
    expect(startup).toContain('genuinely lighter');
    expect(v).toContain('Condensed report (`metadata.scale: quick`)');
  });

  it('verify has a single commit point — the checkpoint-commit escape hatch is gone (commit semantics unified)', () => {
    const v = render('prospec-verify');
    expect(v, 'the implement-vs-verify commit contradiction must be gone').not.toContain(
      'checkpoint-commit during implement',
    );
    expect(v).toContain('single commit point');
  });

  it('the full Knowledge Quality-Gate table lives only in verify — the four SDD stations carry a one-line note', () => {
    expect(render('prospec-verify')).toContain(QUALITY_GATE_TABLE);
    for (const name of ['prospec-new-story', 'prospec-plan', 'prospec-tasks', 'prospec-implement']) {
      const c = render(name);
      expect(c, `${name} must not restate the full Quality-Gate table`).not.toContain(QUALITY_GATE_TABLE);
      expect(c, `${name} must defer to verify for the full table`).toContain(
        'full per-station Quality-Gate table lives only in `/prospec-verify`',
      );
    }
  });

  it('new-story runs INVEST as an advisory check, not a hard gate (principle kept)', () => {
    const nc = render('prospec-new-story');
    const phase6 = sectionOf(nc, '### Phase 6: Constitution Check (site-specific: INVEST)');
    expect(phase6).toContain('advisory');
    expect(phase6).toContain('do not hard-block');
    expect(phase6).toContain('stays a Constitution `[MUST]`');
    expect(sectionOf(nc, '## NEVER')).toContain('hard-block a Story on the INVEST check');
  });

  it('tasks makes [P] and ~lines optional while keeping [M]/[V] kind markers required', () => {
    const t = render('prospec-tasks');
    const never = sectionOf(t, '## NEVER');
    expect(never).toContain('gate on `[P]` or `~lines`');
    expect(never, 'the forced-[P] NEVER must be gone').not.toContain('forget to mark `[P]`');
    expect(never).toContain("omit a non-code task's `[M]`/`[V]` kind marker");
    expect(t).toContain('Phase 4 (Optional): Mark Parallelization');
  });

  it('archive Entry Gate blocks archiving on the metadata-completeness machine check', () => {
    const gate = sectionOf(render('prospec-archive'), '## Entry Gate');
    expect(gate).toContain('Metadata completeness (machine-checked)');
    expect(gate).toContain('metadata-completeness');
    expect(gate).toContain('do not archive');
  });

  // REQ-TEMPLATES-171. Section-scoped, then narrowed to the bullet — a refinement of
  // the sibling assertion above, not a replacement for it. Of the markers below, only
  // `The CLI is required` occurs elsewhere in the Entry Gate (the metadata-completeness
  // bullet's trailing parenthetical); every other one is unique to this item, so section
  // scope alone would already go red on removal. The narrowing is what stops a WEAKER
  // marker list from passing on that neighbouring bullet.
  it('archive Entry Gate blocks archiving on all three provenance machine checks', () => {
    const gate = sectionOf(render('prospec-archive'), '## Entry Gate');
    const item = gate
      .split('\n')
      .find((l) => l.startsWith('- **Review, test and delta-spec provenance (machine-checked)**'));
    expect(item, 'the provenance Entry Gate item is missing').toBeDefined();
    for (const marker of [
      'review-provenance',
      'test-provenance',
      // The third gate closes the blind spot the other two share: they fingerprint
      // CODE, and the landing blocks archive copies verbatim are not code.
      'delta-spec-provenance',
      'Any FAIL → do not archive',
      // Its remedy points at the block, not at the code — naming a re-review here
      // would send the reader to fix something that is already correct.
      'Fix the block, not the code',
      // The two findings demand DIFFERENT fixes; naming only re-review sends the
      // reader down the wrong path when the cause was the commit moving HEAD.
      '/prospec-review',
      '--record-review',
      '--record-tests',
      '`skipped` is not a FAIL',
      // The remediation routes into a re-verify, and a re-verify that grades B/C/D
      // leaves an already-`verified` change at `verified` while `quality_log` keeps
      // the earlier S/A entry — so the bullet must say the status is not the pass.
      'does not reach S/A',
      'never archive on the strength of a `status` the latest verify did not earn',
      'The CLI is required',
    ]) {
      expect(item!, `provenance Entry Gate item is missing '${marker}'`).toContain(marker);
    }
  });

  // REQ-TEMPLATES-173. Widening the audit scope to `verified` made the review and
  // verify stations re-enterable; the prose that governs re-entry is what an agent
  // acts on, so each claim below is pinned — including a NEGATIVE for the Error
  // Handling row that used to refuse exactly this path.
  it('review and verify state their status Entry Gate item as a floor, re-enterable from verified', () => {
    const review = render('prospec-review');
    const reviewGate = sectionOf(review, '## Entry Gate');
    expect(reviewGate).toContain('`implemented` **or later**');
    expect(reviewGate).toContain('floor, not a ceiling');
    expect(reviewGate).toContain('`verified` change whose code moved after verify');
    // The Error Handling table once read "metadata status not `implemented` → Stop;
    // point to /prospec-implement", which refuses a `verified` re-entry and sends the
    // operator somewhere that cannot help. The refusal now keys on the SAME condition
    // the floor states — a status before `implemented` — so it covers `story`/`plan`
    // too; keying it on `tasks` alone would leave those two unrouted.
    const reviewErrors = sectionOf(review, '## Error Handling');
    expect(reviewErrors).toContain('BEFORE `implemented`');
    for (const status of ['`story`', '`plan`', '`tasks`']) {
      expect(reviewErrors, `the refusal row must name ${status}`).toContain(status);
    }
    expect(reviewErrors, 'the status-not-implemented refusal must not come back').not.toContain(
      'metadata status not `implemented`',
    );

    const verify = render('prospec-verify');
    expect(sectionOf(verify, '## Entry Gate')).toContain('`implemented` **or later**');
    expect(sectionOf(verify, '## Entry Gate')).toContain('floor, not a ceiling');
  });

  it('verify states that a re-entering verified change keeps `verified` on B/C/D and is not archivable', () => {
    const section = sectionOf(render('prospec-verify'), '## Record & Status Update');
    for (const marker of [
      'already-`verified` change, "unchanged" means it stays `verified`',
      'status never regresses',
      'NOT archivable',
    ]) {
      expect(section, `verify's re-entry boundary is missing '${marker}'`).toContain(marker);
    }
  });

  it('both lifecycle copies state the B/C/D re-entry case and review re-running after verified', () => {
    for (const doc of [
      renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT),
      fs.readFileSync(
        path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
        'utf-8',
      ),
    ]) {
      const gates = sectionOf(doc, '## Gates (why some transitions are conditional)');
      expect(gates).toContain('re-entering after a post-verify edit stays `verified`');
      // The parenthetical it replaced — "(stays `implemented`)" — is false on that path.
      expect(gates, 'the unconditional stays-implemented claim must not come back').not.toContain(
        'leaves `status` unchanged (stays `implemented`)',
      );
      expect(sectionOf(doc, '## Stations without a status transition')).toContain(
        're-runs **after** `verified`',
      );
    }
  });

  it('the shipped status-lifecycle template documents design as a no-status station (ui_scope-gated)', () => {
    const lifecycle = renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(lifecycle, '## Stations without a status transition');
    expect(section).toContain('/prospec-design');
    expect(section).toContain('ui_scope != none');
    expect(section).toContain('between `plan` and `tasks`');
  });
});

describe('Structured quality_log + escaped-defect registration (issue #61)', () => {
  it('prospec-verify Record & Status Update has the CLI append the structured grade + dimensions quality_log entry (issue #107)', () => {
    const verify = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(verify, '## Record & Status Update');
    expect(section).toContain('quality_log');
    expect(section).toContain('`grade`');
    expect(section).toContain('`dimensions`');
    // the entry is serialized by `prospec verify record`, never hand-written
    expect(section).toContain('prospec verify record');
    expect(section).toContain('never hand-write this entry');
    expect(section).toContain('hasVerifyGrade');
  });

  it('prospec-review records structured criticals/majors counts every round via `prospec change log` flags (issue #107)', () => {
    const review = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(review, '### Review Provenance (machine gate)');
    expect(section).toContain('--criticals-found');
    expect(section).toContain('--criticals-fixed');
    expect(section).toContain('--majors');
    // the counts come from the CLI's own round report, not a hand tally
    expect(section).toContain("`prospec review merge`'s round report");
  });

  it('the shipped status-lifecycle template documents the introduced_by convention + example', () => {
    const lifecycle = renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(lifecycle, '## Escaped-defect registration (`introduced_by`)');
    expect(section).toContain('introduced_by');
    expect(section).toMatch(/convention-only|does \*\*not\*\* verify/);
    expect(section).toContain('<change-name>');
    // REQ-TYPES-058 AC2: a concrete example value, not just the <change-name> placeholder
    expect(section).toMatch(/introduced_by:\s*[a-z][a-z0-9-]+/);
  });

  describe('verify dimension adjudication split (REQ-TEMPLATES-153..157)', () => {
    const verify = () => renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
    const review = () => renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);

    it('labels every dimension with its adjudicator and names the fact source', () => {
      const content = verify();
      // per-dimension labels — a reader must never have to guess who decided
      expect(content).toContain('### Verification 1/5: Task Completion — `[machine]`');
      expect(content).toContain('### Verification 2/5: Delta Spec Compliance — `[judgment]`');
      expect(content).toContain('### Verification 3/5: Constitution Full Audit — `[mixed]`');
      expect(content).toContain('### Verification 4/5: Knowledge ↔ Implementation Consistency — `[machine]`');
      expect(content).toContain('### Verification 5/5: Test Verification — `[machine]`');
      expect(content).toContain('### Verification 6 (Conditional): Design Consistency — `[judgment]`');
      // the ledger table binds each dimension to the check that decides it
      const ledger = sectionOf(content, '### Two adjudicators, two ledgers');
      for (const id of ['task-completion', 'knowledge-health', 'test-provenance', 'structural.constitution']) {
        expect(ledger, `ledger table must name ${id}`).toContain(id);
      }
      expect(ledger).toContain('verbatim');
    });

    it('states the review/verify boundary exactly once across the two skills', () => {
      const occurrences = [verify(), review()]
        .map((c) => (c.match(/open-ended defect discovery/g) ?? []).length)
        .reduce((a, b) => a + b, 0);
      expect(occurrences).toBe(1);
      // and it is verify that owns the statement
      expect(verify()).toContain('open-ended defect discovery');
      expect(review()).not.toContain('open-ended defect discovery');
    });

    it('review points at that single statement instead of restating it', () => {
      const lenses = sectionOf(review(), '### Review Lenses');
      expect(lenses).toContain('Key Difference from Other Skills');
      expect(lenses).toContain('do not restate');
      // review owns contradiction; completeness is verify's
      expect(lenses).toContain('contradicting');
    });

    it('defines not-adjudicated as distinct from not-applicable, with S unreachable', () => {
      const section = sectionOf(verify(), '### When a machine check skips');
      expect(section).toContain('not-adjudicated');
      expect(section).toContain('WARN');
      expect(section).toContain('Grade S becomes unreachable');
      expect(section).toContain('not-applicable');
      // the WARN is recorded by the CLI from the report, not hand-derived
      expect(section).toContain('prospec verify record');
    });

    // Issue #107 flip: the old #103 closed three-shape carve-out existed for
    // CLI-less projects; with the CLI required that population is empty, so the
    // A-budget is now total — every WARN counts, no exemption class.
    it('the engine-outage A-budget exclusion class is REMOVED — every WARN counts (issue #107)', () => {
      const section = flat(sectionOf(verify(), '### When a machine check skips'));
      expect(section).toMatch(/Every WARN counts against grade A's (?:(?:≤|<=)\s*2|at\s+most\s+two\s+WARNs?)\s+budget/i);
      expect(section).toContain('there is no exemption class');
      // the removal is explained, not silent: the CLI-required posture emptied the class
      expect(section).toContain('the carve-out is gone');
      // the closed-class enumeration must not reappear
      expect(section).not.toContain('closed class of exactly three shapes');
      expect(section).not.toContain('review-staleness');
      expect(section).not.toContain('Count only');
    });

    // Structure-aware (PB-001): with the exemption class gone (issue #107), no
    // restatement of the ≤ 2 WARN budget may reintroduce a carve-out — a scoped
    // copy is exactly how the #102 contradiction shipped in the other direction.
    it('no mention of the ≤ 2 WARN budget reintroduces an exclusion class (issue #107)', () => {
      const doc = flat(verify());
      const hits = [...doc.matchAll(/(?:(?:≤|<=)\s*2\s+(?:budget-counted\s+)?WARNs?|at\s+most\s+two\s+WARNs?)/gi)];
      // definition + rubric/merge-rule restatements
      expect(hits.length).toBeGreaterThanOrEqual(2);
      for (const m of hits) {
        const window = doc.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + 200);
        expect(window, `budget mention reintroduces a carve-out near: …${window.slice(150, 250)}…`).not.toMatch(
          /closed class|exactly three shapes|engine-unavailability exclusion|Count only/,
        );
      }
      // the total-budget rule is stated, and the old complement wording is gone
      expect(doc).toContain('there is no exemption class');
      expect(doc).not.toContain('Every WARN outside these three shapes counts');
    });

    it('forbids overturning a machine verdict and reporting not-adjudicated as PASS', () => {
      const never = sectionOf(verify(), '## NEVER');
      expect(never).toMatch(/NEVER\*\* overturn a machine dimension/);
      expect(never).toMatch(/NEVER\*\* adjudicate a machine dimension yourself/);
      expect(never).toContain('not-adjudicated');
      expect(never).toMatch(/NEVER\*\* grade 2\/5 or 6 in the implementation's own context/);
    });

    it('records the test run before reading the report, and grades 5/5 from test-provenance', () => {
      const content = verify();
      // The record step sits in Core Workflow, AFTER the Entry Gate — it costs a
      // suite run and mutates metadata, so a refused change must not pay for it.
      expect(sectionOf(content, '## Startup Loading')).not.toContain('--record-tests');
      const step0 = sectionOf(content, '### Step 0: Record the test run (before reading the report)');
      expect(step0).toContain('--record-tests');
      // flat() so the pin survives a semantics-preserving re-wrap of the prose
      expect(flat(step0)).toContain('after the Entry Gate');
      // ordering still matters, but it is now an instruction rather than document
      // order: the startup copy predates the record, so Step 0 must re-read it.
      expect(flat(step0)).toContain('re-run `prospec check --json` and re-read');
      const tests = sectionOf(content, '### Verification 5/5: Test Verification — `[machine]`');
      expect(tests).toContain('test-provenance');
      expect(tests).toContain('exit code');
      expect(tests).toContain('not-adjudicated');
      // backfill relaxation survives the mechanization, but a real failure never does
      expect(tests).toContain('never suppress a recorded non-zero exit');
    });

    it('requires a 1:1 Constitution audit against the machine rule inventory', () => {
      const section = sectionOf(verify(), '### Verification 3/5: Constitution Full Audit — `[mixed]`');
      expect(section).toContain('structural.constitution.rules[]');
      expect(section).toMatch(/statement count must be ≥ the inventory's entry count/);
      expect(section).toContain('never re-derive or re-assign it');
      // untagged rules still fall back to judgment grading (backward-compatible)
      expect(section).toContain('null');
    });

    it('requires fresh context for 2/5 and 6, with an explicit degradation disclosure', () => {
      const content = verify();
      const spec = sectionOf(content, '### Verification 2/5: Delta Spec Compliance — `[judgment]`');
      expect(spec).toContain('No mechanical oracle exists here');
      expect(flat(spec)).toContain("does not share the implementation's context");
      // the reviewer's inputs stay pinned; the MECHANISM is the partial's job,
      // so this prose must not name it (else the degraded render contradicts it)
      expect(flat(spec)).toContain('only the delta-spec, the code, and this contract as its inputs');
      // the harness question is answered by the shared partial's injected flags…
      expect(spec).toContain(CAPABILITY_LINE_LABEL);
      expect(spec).toContain(DEGRADE_FLOOR);
      // …while verify's own degraded action stays verify's: grading in-session is
      // recorded honestly via `--graded-by in-session`, which is a mechanical
      // grade cap (below S), not merely a disclosure WARN
      expect(spec).toContain('--graded-by in-session');
      expect(flat(spec)).toContain('caps the grade below S');
      // the judgment grading routes to the strongest available tier, named
      // abstractly — never a specific model or harness (REQ-TEMPLATES-155/199)
      expect(flat(spec)).toContain('strongest model / agent tier');
      const design = sectionOf(content, '### Verification 6 (Conditional): Design Consistency — `[judgment]`');
      expect(design).toContain('fresh context');
      // dimension 6 cross-references 2/5 rather than carrying a third copy
      expect(design).toContain('2/5');
      expect(design).not.toContain(CAPABILITY_LINE_LABEL);
    });

    it('reports two ledgers and caps the grade on a machine FAIL', () => {
      const section = sectionOf(verify(), '## Report Format');
      expect(section).toContain('Machine ledger');
      expect(section).toContain('Judgment ledger');
      expect(section).toContain('caps the grade at C');
      expect(section).toContain('makes S unreachable');
    });

    it('records dimensions with adjudicators via `prospec verify record` — judgment passed, machine self-sourced (issue #107)', () => {
      const section = sectionOf(verify(), '## Record & Status Update');
      // each quality_log dimension entry carries its adjudicator
      expect(section).toContain('adjudicator');
      // only the judgment dimensions are passed; none may be omitted
      expect(section).toContain('--dimension <name>=<result>');
      expect(section).toContain('`=not-applicable`, never omitted');
      // machine dimensions come from the report — an LLM relay is refused
      expect(section).toContain('self-sources the machine dimensions');
      expect(section).toContain('refuses an LLM relay of an engine verdict');
    });

    it('documents the new checks and the constitution section in the drift-report reference', () => {
      const ref = renderTemplate('skills/references/drift-report-format.hbs', TEMPLATE_CONTEXT);
      const checks = sectionOf(ref, '## `structural.checks[]` — one entry per check, keyed by `id`');
      expect(checks).toContain('test-provenance');
      expect(checks).toContain('constitution-severity');
      expect(checks).toContain('verbatim');
      const inventory = sectionOf(ref, '## `structural.constitution` (optional) — the rule inventory verify audits against');
      expect(inventory).toContain('severity');
      expect(inventory).toContain('null');
      expect(inventory).toContain('1:1');
      const sibling = sectionOf(ref, '## Sibling report — `escaped-defect-report.json`');
      expect(sibling).toContain('escaped_rate');
      expect(sibling).toContain('sample_count: 0');
      expect(sibling).toContain('archive_available');
    });

    it('documents test_provenance in the metadata-format reference, in canonical order', () => {
      const ref = renderTemplate('skills/references/metadata-format.hbs', TEMPLATE_CONTEXT);
      const order = sectionOf(ref, '## Canonical field order');
      expect(order).toContain('`review_provenance` → `test_provenance` → `introduced_by`');
      expect(order).toContain('--record-tests');
      const prov = sectionOf(ref, '### `test_provenance` — the recorded test run');
      expect(prov).toContain('exit_code');
      expect(prov).toContain('digest');
      // deliberately outside the required-field floor (no retroactive archive failures)
      expect(prov).toContain('not** part');
      const log = sectionOf(ref, '## `quality_log` entry shape');
      expect(log).toContain('not-adjudicated');
      expect(log).toContain('adjudicator');
    });

    it('the shipped status-lifecycle template records the machine adjudication of the verify gate', () => {
      const lifecycle = renderTemplate('init/status-lifecycle.md.hbs', TEMPLATE_CONTEXT);
      expect(lifecycle).toContain('adjudicated by `prospec check`');
      expect(lifecycle).toContain('not-adjudicated');
      expect(lifecycle).toContain('--escaped-defects');
    });
  });

  describe('judgment-station grading context + model-tier routing (issue #203)', () => {
    it('metadata-format documents the judgment grading-context fields', () => {
      const ref = renderTemplate('skills/references/metadata-format.hbs', TEMPLATE_CONTEXT);
      const log = sectionOf(ref, '## `quality_log` entry shape');
      expect(flat(log)).toContain('`graded_by` / `executor` / `spend`');
      expect(log).toContain('fresh-subagent');
      expect(log).toContain('in-session');
      // it states the where-required and the S-cap consequence
      expect(flat(log)).toContain('caps the grade below S');
    });

    // AC-3: the routing guidance is model/harness-agnostic — no vendor names.
    const JUDGMENT_STATION_TEMPLATES = [
      'skills/prospec-review.hbs',
      'skills/prospec-verify.hbs',
      'skills/prospec-plan.hbs',
      'skills/references/candidate-evaluation.hbs',
    ];
    // A grep guard, not a whitelist — model/vendor/harness names that must never
    // be hard-coded into a shipped template. `claude` legitimately appears only
    // as the `CLAUDE.md` entry-config filename, so that literal is masked before
    // scanning instead of exempting the name outright — a blanket exemption left
    // the likeliest leaks (claude/codex/copilot) unguarded (review SA-5/TQ-3).
    const FORBIDDEN_MODEL_NAMES = [
      'gpt', 'gemini', 'llama', 'mistral', 'anthropic', 'openai',
      'opus', 'sonnet', 'haiku', 'fable', 'cursor', 'windsurf',
      'codex', 'copilot',
    ];

    it.each(JUDGMENT_STATION_TEMPLATES)('%s routes to the strongest available tier, named abstractly', (tpl) => {
      const content = renderTemplate(tpl, TEMPLATE_CONTEXT);
      expect(flat(content)).toContain('strongest');
      const lower = content.toLowerCase();
      for (const name of FORBIDDEN_MODEL_NAMES) {
        expect(lower, `${tpl} must not name model/vendor "${name}"`).not.toContain(name);
      }
      const masked = lower.replaceAll('claude.md', '');
      expect(
        masked,
        `${tpl} must not name model/vendor "claude" (the CLAUDE.md filename is masked before this scan)`,
      ).not.toContain('claude');
    });
  });
});

describe('archive delegates deterministic mutations to the CLI (REQ-TEMPLATES-159, issue #98)', () => {
  const render = () => renderTemplate('skills/prospec-archive.hbs', TEMPLATE_CONTEXT);

  it('Phase 3 executes via prospec archive with a dry-run preview, never hand-run steps', () => {
    const phase3 = sectionOf(render(), '### Phase 3: Execute Archive');
    expect(phase3).toContain('prospec archive');
    expect(phase3).toContain('--dry-run');
    // the CLI is required (shared probe) — the binary resolution ladder is gone (issue #107)
    expect(phase3).toContain('code-executed by the CLI — do not hand-run them');
    expect(phase3).not.toContain('pnpm exec');
    expect(phase3).not.toContain('npx');
    // the old hand-run move instruction is gone
    expect(phase3).not.toContain('Move all artifacts');
    // the judgment summary still replaces the scaffold
    expect(phase3).toContain('Review & Verify');
  });

  it('Phase 3 has NO CLI-unavailable manual fallback — finalize is deferred to Phase 3.7, never hand-run (issue #107)', () => {
    const phase3 = sectionOf(render(), '### Phase 3: Execute Archive');
    // the manual fallback was removed with the required-CLI probe (STOP posture)
    expect(phase3).not.toContain('CLI unavailable');
    expect(flat(phase3)).not.toMatch(/fall back manually/);
    expect(flat(phase3)).not.toContain('never silently skip the mutations');
    // its replacement: the _archived-history copy + counter reconciliation move to 3.7
    expect(flat(phase3)).toContain('via `prospec archive finalize` in Phase 3.7');
  });

  it('Phase 3.7 Finalize owns the _archived-history copy + counter reconciliation, post-judgment (issue #107)', () => {
    const phase37 = sectionOf(render(), '### Phase 3.7: Finalize');
    expect(phase37).toContain('prospec archive finalize');
    expect(phase37).toContain('specs/_archived-history/{YYYY-MM-DD}-{change-name}.md');
    // refuses a scaffold summary — the Phase 2 record must be in place first
    expect(flat(phase37)).toContain('refuses while the file still lacks `## Review & Verify`');
    expect(flat(phase37)).toContain('story_count');
    expect(flat(phase37)).toContain('req_count');
    // rerun-safe and never un-archives
    expect(flat(phase37)).toMatch(/idempotent/i);
    expect(flat(phase37)).toContain('never un-archives');
  });

  it('Phase 3.5 reviews the mechanical sync instead of re-running it', () => {
    const phase35 = sectionOf(render(), '### Phase 3.5: Feature Spec Sync');
    expect(flat(phase35)).toContain('already performed the **mechanical** Feature Spec Sync');
    // the judgment work that stays with the skill
    expect(phase35).toContain('Converge wording');
    // counters moved out of the hand-reconciliation path (issue #107)
    expect(flat(phase35)).toContain(
      'Frontmatter counters are reconciled mechanically by `prospec archive finalize` in Phase 3.7',
    );
    expect(flat(phase35)).toContain('do not recount them by hand');
  });

  it('Phase 3.6 confirms the CLI outputs instead of re-deriving them', () => {
    const phase36 = sectionOf(render(), '### Phase 3.6: Product Spec Sync');
    expect(flat(phase36)).toContain('already wrote both outputs');
    expect(phase36).toContain('product.md');
    expect(phase36).toContain('feature-map.yaml');
    expect(phase36).not.toContain('Extract P0 User Stories');
    // the check must be satisfiable: it asks about the machine-owned region and
    // the preservation of everything else, never about a whole-file regeneration
    expect(flat(phase36)).toContain('outside that section is unchanged');
    expect(phase36).not.toContain('was regenerated');
  });

  // The append-a-duplicate defect passed the old Phase 3.6 check: the appended
  // section DID list every active Feature Spec. Two questions close that blind
  // spot — one about the machine's verdict, one only a reader can answer.
  it('Phase 3.6 asks whether the sync was declined, and looks for a renamed feature map', () => {
    const rendered = render();
    const phase36 = sectionOf(rendered, '### Phase 3.6: Product Spec Sync');
    expect(flat(phase36)).toContain('did **not** report a declined `product.md` sync');
    expect(flat(phase36)).toMatch(/near-miss/i);
    // the semantic half: lexical matching cannot see a differently-named map, and
    // its reach over SAME-name headings is narrow, so both are the reader's to spot
    expect(flat(phase36)).toMatch(/different name/i);
    expect(flat(phase36)).toContain('Feature Inventory');
    expect(flat(phase36)).toContain('lexical');
    expect(flat(phase36)).toContain('## Feature Map (draft) (2024)');

    const gate = sectionOf(rendered, '> **Phase 3.6 Gate**');
    expect(gate.trim().length).toBeGreaterThan(0);
    expect(flat(gate)).toContain('no declined `product.md` sync');
    expect(flat(gate)).toMatch(/another name/i);

    // `sectionOf` runs to the next `##`/`###`, and the Gate is quoted lines inside
    // Phase 3.6 — so `phase36` CONTAINS `gate`. Asserting over both is asserting
    // over the superset twice: the body half must be sliced off explicitly, or a
    // body-side regression passes on the Gate's copy of the wording alone.
    const gateStart = phase36.indexOf('> **Phase 3.6 Gate**');
    expect(gateStart).toBeGreaterThan(0);
    const body = phase36.slice(0, gateStart);
    expect(body).not.toContain('Phase 3.6 Gate');

    // A gate is an all-must-hold list: the product.md confirmation item has to
    // carry the same decline condition the body states, or a declined run leaves
    // the gate unsatisfiable and blocks Phase 3.7 — which cannot be skipped, the
    // bundle having already moved. REQ-TEMPLATES-175 requires the two to match,
    // so BOTH halves are asserted independently.
    for (const section of [body, gate]) {
      expect(flat(section)).toMatch(/when the sync ran/i);
    }

    // The remedy must be one the workflow can actually perform HERE: Phase 3 already
    // moved the bundle out of `.prospec/changes/`, so `prospec archive <name>` now
    // answers `not found` and exits 1 — an instruction to retry this change's sync
    // is a checkbox no agent can honestly tick.
    for (const section of [body, gate]) {
      expect(flat(section)).not.toMatch(/re-run/i);
      expect(flat(section)).toContain('next archive run');
    }
  });

  it('NEVER forbids hand-executing the deterministic mutations when the CLI is available', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('hand-execute the deterministic mutations');
    expect(never).toContain('--dry-run');
  });
});

// Issue #107 (restore-cli-first): the CLI is REQUIRED. Every skill probes it via
// one shared partial and STOPs when it is missing/too old — no template may carry
// a manual fallback for a CLI-owned mutation. Negatives mutation-verified.
describe('CLI-first contract — shared required probe, no manual fallbacks (issue #107)', () => {
  const TEMPLATES_DIR = path.join(__dirname, '../../src/templates');
  const PROBE_SENTENCE = 'Hand-executing a CLI-owned mutation is NEVER the fallback';

  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      );

  it('every one of the 17 skill templates includes {{> cli-probe}} exactly once', () => {
    expect(SKILL_DEFINITIONS).toHaveLength(17);
    for (const skill of SKILL_DEFINITIONS) {
      const src = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'skills', `${skill.name}.hbs`),
        'utf-8',
      );
      expect(
        src.split('{{> cli-probe}}').length - 1,
        `${skill.name}.hbs must include {{> cli-probe}} exactly once`,
      ).toBe(1);
      // and the partial actually renders into the skill body
      const rendered = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
      expect(rendered).toContain('## CLI Prerequisite (required)');
      expect(rendered.split(PROBE_SENTENCE).length - 1).toBe(1);
    }
  });

  it('the probe STOP sentence lives ONLY in _cli-probe.hbs (single source across src/templates)', () => {
    const carriers = walk(TEMPLATES_DIR)
      .filter((file) => fs.readFileSync(file, 'utf-8').includes(PROBE_SENTENCE))
      .map((file) => path.relative(TEMPLATES_DIR, file).replace(/\\/g, '/'));
    expect(carriers).toEqual(['skills/_cli-probe.hbs']);
  });

  it('_cli-probe.hbs takes the version floor from {{minimum_cli_version}} — never a hardcoded version literal', () => {
    const src = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'skills', '_cli-probe.hbs'),
      'utf-8',
    );
    expect(src).toContain('{{minimum_cli_version}}');
    expect(src).not.toMatch(/\b\d+\.\d+\.\d+\b/);
    // the variable is live: an injected sentinel reaches the rendered skill body
    const rendered = renderTemplate('skills/prospec-verify.hbs', {
      ...TEMPLATE_CONTEXT,
      minimum_cli_version: '9.9.9-sentinel',
    });
    expect(rendered).toContain('9.9.9-sentinel');
  });

  it('no template under skills/ or agent-configs/ carries a CLI-unavailable fallback phrase', () => {
    const FORBIDDEN = [
      'If the CLI is unavailable',
      'fall back manually',
      'degrade gracefully',
      'CLI resolution ladder',
    ];
    for (const dir of ['skills', 'agent-configs']) {
      for (const file of walk(path.join(TEMPLATES_DIR, dir))) {
        const src = fs.readFileSync(file, 'utf-8');
        const rel = path.relative(TEMPLATES_DIR, file).replace(/\\/g, '/');
        for (const phrase of FORBIDDEN) {
          expect(src, `${rel} must not contain "${phrase}"`).not.toContain(phrase);
        }
      }
    }
  });

  it('entry config Session Start requires the CLI (prospec status + version floor) — the scan fallback is gone', () => {
    const src = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'agent-configs', 'entry.md.hbs'),
      'utf-8',
    );
    const start = src.indexOf('## Session Start');
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf('\n## ', start + 1);
    const section = next === -1 ? src.slice(start) : src.slice(start, next);
    expect(section).toContain('prospec status');
    expect(section).toContain('{{minimum_cli_version}}');
    expect(section).toContain('never substitute manual steps');
    expect(section).not.toContain('fall back to scanning');
  });
});

// REQ-TEMPLATES-176/177: the two stations that judge a change against the
// permanent record read it by REQ, not by the file. Both wordings are the whole
// point of the change — an agent that reads a spec whole pays the cost this
// change exists to remove, and one that reads the delta-spec instead of the
// merged file re-opens PB-015.
describe('REQ-scoped Feature Spec reads at verify and archive', () => {
  const renderSkill = (name: string) => renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);

  it('verify Startup Loading item 7 reads the touched REQs, never the directory', () => {
    const loading = flat(sectionOf(renderSkill('prospec-verify'), '## Startup Loading'));
    const item = /7\. \[DYNAMIC\](.*?)(?=8\. \[DYNAMIC\])/.exec(loading)?.[1] ?? '';
    expect(item.trim().length, 'item 7 not found in Startup Loading').toBeGreaterThan(0);
    expect(item).toContain('prospec spec show');
    expect(item).toContain('--req');
    // REQ-TEMPLATES-080: every item stays annotated, and this one stays DYNAMIC.
    expect(loading).toContain('7. [DYNAMIC]');
    // REQ-TEMPLATES-134: quick still skips it.
    expect(item).toContain('scale: quick');
    // The negative half — a whole-file read is what this item replaced.
    expect(item).toMatch(/never read the whole/i);
    expect(item).not.toMatch(/Read `prospec\/specs\/features\/`/);
    // An ADDED REQ is absent by design (it graduates at archive), so the command
    // reports it unmatched and exits non-zero. Without saying so, the station reads
    // its own designed state as a blocking 2/5 failure — running this change's own
    // ADDED ids prints six `✗` lines and exits 1.
    expect(item).toMatch(/ADDED REQ is expected to be missing/i);
    expect(item).toMatch(/never a 2\/5 finding/);
  });

  it('archive Phase 3.5 reads every graduating REQ from the MERGED file (PB-015)', () => {
    const phase = flat(sectionOf(renderSkill('prospec-archive'), '### Phase 3.5: Feature Spec Sync'));
    expect(phase).toContain('prospec spec show');
    expect(phase).toContain('merged Feature Spec on disk');
    // The REQ SET comes from the graduation key, never from the worklists: each of
    // those is an exception report, so a cleanly-landed REQ appears in none of them
    // while still needing its wording converged. Narrowing the read to worklist
    // members silently skipped the most common case.
    expect(phase).toMatch(/every requirement this change graduates/i);
    // Two clauses, two assertions: written as one disjunction, deleting either
    // side stayed green and neither was actually pinned.
    expect(phase).toMatch(/worklists above do \*\*not\*\* define that set/);
    expect(phase).toMatch(/EXCEPTION report/);
    expect(phase).toMatch(/Graduation key by scale\*\* names that set/);
    // Reading the delta-spec entry instead of the merged file is the failure this
    // sentence exists to prevent; the prohibition must survive a reword.
    expect(phase).toMatch(/[Nn]ever substitute the delta-spec/);
    expect(phase).not.toContain('Read each Feature Spec the CLI reported as synced');
    expect(phase).not.toMatch(/worklists decide WHICH/);
  });
});

describe('issue registration documented in both references (REQ-TEMPLATES-178, issue #131)', () => {
  /** Slice from a heading to the next line-start `## ` (this file's convention). */
  function section(content: string, heading: string): string {
    const start = content.indexOf(heading);
    if (start === -1) return '';
    const rest = content.slice(start + heading.length);
    const next = rest.search(/\n## /);
    return next === -1 ? rest : rest.slice(0, next);
  }

  it('metadata-format places `issue` last in the canonical order and rows it with its command', () => {
    const ref = renderTemplate('skills/references/metadata-format.hbs', TEMPLATE_CONTEXT);
    const order = section(ref, '## Canonical field order');
    expect(order).toContain('`introduced_by` → `issue`');
    // the row, not merely the word: the field table is what a skill reads to
    // learn WHICH command owns the write
    expect(order).toMatch(/\|\s*`issue`\s*\|\s*no\s*\|\s*`prospec change story --issue`/);
  });

  it('metadata-format records the no-validation stance, the quoting consequence, and absence semantics', () => {
    const ref = renderTemplate('skills/references/metadata-format.hbs', TEMPLATE_CONTEXT);
    const entry = section(ref, '### `issue` — the external-tracker registration');
    expect(entry.length).toBeGreaterThan(0);
    // shape-free: the accepted forms and the explicit no-API claim. Scoped to
    // FORMAT on purpose — a bare "never validated" would contradict the
    // whitespace collapse the next assertion pins, and the CLI's own help.
    expect(entry).toMatch(/format is never validated/i);
    expect(entry).toMatch(/No API\s+is called/);
    expect(entry).toContain('another tracker');
    // the collapse, and that it is named as a safety measure rather than a
    // shape check — the distinction the reference exists to keep straight
    expect(entry).toMatch(/whitespace collapse/i);
    expect(entry).toContain('not a shape judgement');
    expect(entry).toContain('- **Quality Grade**:');
    // a `#`-leading value must be quoted or it reads back as a comment
    expect(entry).toContain('YAML comment');
    // absent ≠ blank — the distinction the conditional write exists to preserve
    expect(entry).toContain('never an empty string');
    // the field registers; the convention itself lives in the project's own docs
    expect(entry).toContain('contributor docs');
    // and it is not the escaped-defect field
    expect(entry).toContain('introduced_by');
  });

  it('the two change-creating skills ask for the tracker item and pass --issue at scaffold', () => {
    // ff folds it into the change-name confirmation on purpose: its NEVER block
    // caps Phase 1 at three questions, so a fourth interview question would
    // contradict the skill's own contract.
    const ff = renderTemplate('skills/prospec-ff.hbs', TEMPLATE_CONTEXT);
    const ffPhase1 = section(ff, '### Phase 1: Quick Interview');
    expect(ffPhase1).toMatch(/same\s+question/);
    expect(ffPhase1).toMatch(/optional/i);
    expect(ffPhase1).toContain('not a fourth interview question');
    expect(ffPhase1).toContain('never invent one');
    // scoped claim, not a blanket "validates nothing" — the readers collapse
    expect(ffPhase1).toMatch(/judges nothing about its shape/);
    expect(ffPhase1).toMatch(/collapse to one space/);
    expect(section(ff, '### Phase 2: Story Generation')).toContain('[--issue <ref>]');

    const ns = renderTemplate('skills/prospec-new-story.hbs', TEMPLATE_CONTEXT);
    const nsPhase2 = section(ns, '### Phase 2: Derive Change Name');
    expect(nsPhase2).toContain('same question');
    expect(nsPhase2).toMatch(/\*\*optional\*\*/);
    expect(nsPhase2).toContain('never invent one');
    expect(nsPhase2).toMatch(/judges nothing about its shape/);
    expect(nsPhase2).toMatch(/collapse to one space/);
    expect(section(ns, '### Phase 3: Create Scaffolding')).toContain('[--issue <ref>]');
  });

  it('archive-format carries the Issue line as omit-when-unregistered', () => {
    const ref = renderTemplate('skills/references/archive-format.hbs', TEMPLATE_CONTEXT);
    const overview = section(ref, '### 1. Change Overview');
    expect(overview).toContain('- **Issue**:');
    expect(overview).toMatch(/omit(ted)? the whole line|omitted \*\*entirely\*\*/);
    // this file IS the committed audit record, so the collapse is format contract
    expect(overview).toMatch(/\*\*single line\*\*/);
    expect(overview).toMatch(/whitespace collapse/i);
  });
});

// Version-controlled baseline: which stations speak the delegated-payload
// contract. Both stations delegate judgment to a fresh context, so both must
// deploy the ONE reference that defines it — a third station joining (or one
// dropping out) is a deliberate act that has to touch this list.
const DELEGATED_EVIDENCE_STATIONS = ['prospec-review', 'prospec-verify'];

describe('Delegated payload contract (issue #142 E)', () => {
  const REF = 'delegated-evidence-format.md';

  it('the reference is registered for exactly the delegating stations', () => {
    const registered = SKILL_DEFINITIONS.filter((s) =>
      getSkillReferences(s.name).some((r) => r.outputName === REF),
    )
      .map((s) => s.name)
      .sort();
    expect(registered).toEqual([...DELEGATED_EVIDENCE_STATIONS].sort());
  });

  it('each station cites the reference in its own references/ dir', () => {
    for (const station of DELEGATED_EVIDENCE_STATIONS) {
      const skill = renderTemplate(`skills/${station}.hbs`, TEMPLATE_CONTEXT);
      expect(skill, `${station} must cite ${REF} to make it reachable`).toContain(
        `references/${REF}`,
      );
    }
  });

  it('the ceilings render from the injected context, one row per relayed field', () => {
    // Sentinels distinct from the real constants prove the numbers come from
    // agent-sync's injection, not from a literal in the template that would be
    // free to drift from the schema that enforces the refusal.
    const sentinels = Object.fromEntries(
      Object.keys(RELAYED_FIELD_MAX_CHARS).map((f, i) => [`relayed_max_${f}`, 7100 + i]),
    );
    const ref = renderTemplate('skills/references/delegated-evidence-format.hbs', {
      ...TEMPLATE_CONTEXT,
      ...sentinels,
    });
    const table = sectionOf(ref, '## Relayed fields and their ceilings');
    for (const [field, sentinel] of Object.entries(sentinels)) {
      const name = field.replace('relayed_max_', '');
      const row = table.split('\n').find((l) => l.startsWith(`| \`${name}\``));
      expect(row, `no ceiling row for the relayed field \`${name}\``).toBeDefined();
      expect(row).toContain(String(sentinel));
    }
    // Negative: the internal constant's name must never leak to a downstream reader
    expect(ref).not.toContain('RELAYED_FIELD_MAX_CHARS');
    // evidence is the one field with no ceiling — stating that is the contract's point
    expect(table).toMatch(/`evidence`.*no ceiling/);
  });

  it('the reference forbids trading findings for budget', () => {
    const ref = renderTemplate('skills/references/delegated-evidence-format.hbs', TEMPLATE_CONTEXT);
    const table = sectionOf(ref, '## Relayed fields and their ceilings');
    expect(flat(table)).toMatch(/never dropped, merged, or summarized together to fit a budget/);
  });

  it('the reference admits a read-only probe as a repro and keeps it useful after the fix', () => {
    const ref = renderTemplate('skills/references/delegated-evidence-format.hbs', TEMPLATE_CONTEXT);
    const repro = sectionOf(ref, '## `repro` — what counts');
    expect(flat(repro)).toMatch(/read-only probe/);
    expect(flat(repro)).toMatch(/required on every `critical`/);
    expect(flat(repro)).toMatch(/after\*\* the fix|after the fix/);
  });

  it('the reference assigns the artifact language to summary and evidence (PB-014)', () => {
    const ref = renderTemplate('skills/references/delegated-evidence-format.hbs', TEMPLATE_CONTEXT);
    const language = sectionOf(ref, '## Language');
    expect(flat(language)).toMatch(/artifact language/);
    expect(flat(language)).toMatch(/`summary` and `evidence`/);
    expect(flat(language)).toMatch(/`repro` is a command/);
  });

  it('both stations forbid relaying evidence prose in their NEVER list', () => {
    for (const station of DELEGATED_EVIDENCE_STATIONS) {
      const never = sectionOf(renderTemplate(`skills/${station}.hbs`, TEMPLATE_CONTEXT), '## NEVER');
      const rule = never
        .split('\n')
        .filter((l) => l.startsWith('- **NEVER**'))
        .find((l) => /evidence prose/.test(l));
      expect(rule, `${station} has no NEVER forbidding an evidence-prose relay`).toBeDefined();
      expect(flat(rule!)).toMatch(/returns? the path|returns only its path/);
    }
  });

  it('review-format documents both evidence surfaces and defers the numbers', () => {
    const format = renderTemplate('skills/references/review-format.hbs', TEMPLATE_CONTEXT);
    const section = sectionOf(format, '## review.md Format');
    // the table header is the structural claim, not just the word "Repro"
    expect(section).toContain('| ID | Location | Severity | Lens | Status | Summary | Repro |');
    expect(section).toContain('<!-- prospec:evidence-section -->');
    expect(section).toContain('<!-- prospec:evidence-end -->');
    // Pin the CLAIM, not the word. `/cumulative across rounds|cumulative/` was a
    // self-subsuming disjunction — the second branch matched pre-existing prose
    // elsewhere in the same section, so deleting the sentence this assertion was
    // written for left it green.
    expect(flat(section)).toMatch(
      /a round that re-reports a finding without them keeps what the artifact holds/,
    );
    expect(flat(section)).toMatch(/round with no evidence writes no section at all/);
    // Negative: the ceilings live in ONE document — restating a number here is
    // the second copy free to drift (the defect the shared reference removes).
    expect(section).toContain('delegated-evidence-format.md');
    for (const max of Object.values(RELAYED_FIELD_MAX_CHARS)) {
      expect(section, `review-format restates the ${max}-character ceiling`).not.toContain(
        String(max),
      );
    }
  });

  it('review states that a critical carries a repro and is confirmed by running it', () => {
    const review = renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
    const loop = sectionOf(review, '### The Loop');
    expect(flat(loop)).toMatch(/running its `repro`/);
    const persistence = sectionOf(review, '### Persistence');
    expect(flat(persistence)).toMatch(/Every `critical` needs a `repro`/);
    expect(flat(persistence)).toMatch(/evidence never travels back/);
  });

  it('verify names both verdict forms as alternatives and points evidence at verify.md', () => {
    const verify = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
    const record = sectionOf(verify, '## Record & Status Update (CLI-executed)');
    expect(record).toContain('--dimensions <file>');
    expect(record).toContain('--dimension <name>=<result>');
    expect(flat(record)).toMatch(/\*\*alternatives\*\*, supplying both is refused/);
    expect(flat(record)).toMatch(/verify\.md/);
    expect(flat(record)).toMatch(/never enters `metadata\.yaml`/);
  });
});

describe('Shift-Left Architecture Verifier in /prospec-plan (issue #179)', () => {
  const REF = 'plan-verifier-rubric.md';

  it('plan-verifier-rubric.md is registered exactly for prospec-plan and prospec-ff', () => {
    const registeredSkills = SKILL_DEFINITIONS.filter((s) =>
      getSkillReferences(s.name).some((r) => r.outputName === REF),
    )
      .map((s) => s.name)
      .sort();
    expect(registeredSkills).toEqual(['prospec-ff', 'prospec-plan']);
  });

  it('plan-verifier-rubric.md is rendered and satisfies token budget <= 2500', () => {
    const content = renderTemplate('skills/references/plan-verifier-rubric.hbs', TEMPLATE_CONTEXT);
    const tokens = estimateTokens(content);
    expect(tokens).toBeLessThanOrEqual(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.reference_per_file);
  });

  it('plan-verifier-rubric.md defines 5 orthogonal criteria without hardcoding CLI layers', () => {
    const content = renderTemplate('skills/references/plan-verifier-rubric.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('Project Layering & Dependency Direction');
    expect(content).toContain('Blast Radius & Ripple Effects');
    expect(content).toContain('State Safety & Reversibility');
    expect(content).toContain('Delta-Spec Completeness');
    expect(content).toContain('Reuse & Single-Source');
    expect(content).toContain('Break-Glass Override');
    expect(content).toContain('Language- and Architecture-Agnostic Principle');
    // Must NOT hardcode CLI internal layers as universal rule
    expect(content).not.toContain('`cli → services → lib → types`');
  });

  it('prospec-plan Phase 6 instructs independent Architecture Verifier with degradation and override', () => {
    const plan = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
    const phase6 = sectionOf(plan, '### Phase 6: Architecture Verification (site-specific: dependency/layering)');
    expect(phase6).toContain('references/plan-verifier-rubric.md');
    expect(phase6).toContain('can_spawn_subagent');
    expect(phase6).toContain('Break-Glass Override');
    expect(phase6).toContain('quality_log');
  });

  it('no skill preloads plan-verifier-rubric in Startup Loading items (Prompt Prefix Cache protection)', () => {
    for (const skill of SKILL_DEFINITIONS) {
      const rendered = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
      const startup = sectionOf(rendered, '## Startup Loading');
      const items = startup
        .split('\n')
        .filter((l) => /^\d+\./.test(l.trim()))
        .join('\n');
      expect(items, `${skill.name} must not preload ${REF} in startup items`).not.toContain(REF);
    }
  });
});

describe('Multi-Candidate Architecture Selection in /prospec-plan (issue #180)', () => {
  const REF = 'candidate-evaluation.md';

  it('candidate-evaluation.md is registered exactly for prospec-plan', () => {
    const registeredSkills = SKILL_DEFINITIONS.filter((s) =>
      getSkillReferences(s.name).some((r) => r.outputName === REF),
    )
      .map((s) => s.name)
      .sort();
    expect(registeredSkills).toEqual(['prospec-plan']);
  });

  it('candidate-evaluation.md is rendered and satisfies token budget <= 2500', () => {
    const content = renderTemplate('skills/references/candidate-evaluation.hbs', TEMPLATE_CONTEXT);
    const tokens = estimateTokens(content);
    expect(tokens).toBeLessThanOrEqual(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.reference_per_file);
  });

  it('candidate-evaluation.md defines orthogonal candidate guidelines and symmetric tournament criteria', () => {
    const content = renderTemplate('skills/references/candidate-evaluation.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('Language- and Architecture-Agnostic Principle');
    expect(content).toContain('Option A: Pragmatic / Minimal Surface');
    expect(content).toContain('Option B: Decoupled / Clean Architecture');
    expect(content).toContain('Blast Radius & Complexity');
    expect(content).toContain('Constitution & Layering Adherence');
    expect(content).toContain('Extensibility vs. Simplicity');
    expect(content).toContain('Symmetric Pairwise Tournament Protocol');
    expect(content).toContain('Position-Swapped Evaluation');
    expect(content).toContain('Human Choice Override');
    // Must NOT hardcode CLI internal layers as universal rule
    expect(content).not.toContain('`cli → services → lib → types`');
  });

  it('prospec-plan Phase 4 instructs multi-candidate generation and tournament selection for scale: full', () => {
    const plan = renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
    const phase4 = sectionOf(plan, '### Phase 4: Design plan.md');
    expect(phase4).toContain('references/candidate-evaluation.md');
    expect(phase4).toContain('Best-of-N Candidate Generation');
    expect(phase4).toContain('Symmetric Pairwise Tournament');
    expect(phase4).toContain('can_spawn_subagent');
    expect(phase4).toContain('Human Choice Override');
    expect(phase4).toContain('Record Trade-offs in `plan.md`');
  });

  it('no skill preloads candidate-evaluation in Startup Loading items (Prompt Prefix Cache protection)', () => {
    for (const skill of SKILL_DEFINITIONS) {
      const rendered = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
      const startup = sectionOf(rendered, '## Startup Loading');
      const items = startup
        .split('\n')
        .filter((l) => /^\d+\./.test(l.trim()))
        .join('\n');
      expect(items, `${skill.name} must not preload ${REF} in startup items`).not.toContain(REF);
    }
  });
});

describe('Shift-Left Task Contract & DAG Dependency Verifier in /prospec-tasks (issue #181)', () => {
  const REF = 'tasks-verifier-rubric.md';

  it('tasks-verifier-rubric.md is registered exactly for prospec-tasks and prospec-ff', () => {
    const registeredSkills = SKILL_DEFINITIONS.filter((s) =>
      getSkillReferences(s.name).some((r) => r.outputName === REF),
    )
      .map((s) => s.name)
      .sort();
    expect(registeredSkills).toEqual(['prospec-ff', 'prospec-tasks']);
  });

  it('tasks-verifier-rubric.md is rendered and satisfies token budget <= 2500', () => {
    const content = renderTemplate('skills/references/tasks-verifier-rubric.hbs', TEMPLATE_CONTEXT);
    const tokens = estimateTokens(content);
    expect(tokens).toBeLessThanOrEqual(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.reference_per_file);
  });

  it('tasks-verifier-rubric.md defines 4 orthogonal criteria without hardcoding CLI layers', () => {
    const content = renderTemplate('skills/references/tasks-verifier-rubric.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('Bidirectional Contract Coverage');
    expect(content).toContain('DAG Dependency & Layering Topological Order');
    expect(content).toContain('TDD Module Test Closure');
    expect(content).toContain('Task Sizing & Schema Compliance');
    expect(content).toContain('Break-Glass Override');
    expect(content).toContain('Language- and Architecture-Agnostic Principle');
    // Must NOT hardcode CLI internal layers as universal rule
    expect(content).not.toContain('`cli → services → lib → types`');
  });

  it('prospec-tasks Phase 6 instructs independent Task Verifier with degradation and override', () => {
    const tasks = renderTemplate('skills/prospec-tasks.hbs', TEMPLATE_CONTEXT);
    const phase6 = sectionOf(tasks, '### Phase 6: Task Contract & Verifier Audit (site-specific: TDD & dependency/layering)');
    expect(phase6).toContain('references/tasks-verifier-rubric.md');
    expect(phase6).toContain('can_spawn_subagent');
    expect(phase6).toContain('Break-Glass Override');
    expect(phase6).toContain('quality_log');
  });

  it('no skill preloads tasks-verifier-rubric in Startup Loading items (Prompt Prefix Cache protection)', () => {
    for (const skill of SKILL_DEFINITIONS) {
      const rendered = renderTemplate(`skills/${skill.name}.hbs`, TEMPLATE_CONTEXT);
      const startup = sectionOf(rendered, '## Startup Loading');
      const items = startup
        .split('\n')
        .filter((l) => /^\d+\./.test(l.trim()))
        .join('\n');
      expect(items, `${skill.name} must not preload ${REF} in startup items`).not.toContain(REF);
    }
  });

  it('prospec-ff Phase 4 references and checks include tasks-verifier-rubric.md', () => {
    const ff = renderTemplate('skills/prospec-ff.hbs', TEMPLATE_CONTEXT);
    const startup = sectionOf(ff, '## Startup Loading');
    expect(startup).toContain('references/tasks-verifier-rubric.md');
    const phase4 = sectionOf(ff, '### Phase 4: Tasks Generation');
    expect(phase4).toContain('references/tasks-verifier-rubric.md');
    expect(phase4).toContain('Task Contract Verification');
  });

  it('tasks-format.hbs includes bidirectional contract traceability and verifier guidelines', () => {
    const content = renderTemplate('skills/references/tasks-format.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('Bidirectional Contract Traceability');
    expect(content).toContain('Forward REQ-ID Coverage');
    expect(content).toContain('Backward Plan Traceability');
  });
});

describe('Action Space Reform — Draft-First Protocol and Silence-Aware Logging (REQ-TEMPLATES-189..191, REQ-TESTS-092)', () => {
  const renderNewStory = () => renderTemplate('skills/prospec-new-story.hbs', TEMPLATE_CONTEXT);
  const renderProposalFormat = () => renderTemplate('skills/references/proposal-format.hbs', TEMPLATE_CONTEXT);
  const renderHandoff = () => renderTemplate('skills/_next-step-handoff.hbs', TEMPLATE_CONTEXT);

  it('prospec-new-story defines Action Space Spectrum with Draft-First default and --interactive fallback', () => {
    const content = renderNewStory();
    expect(content).toContain('## Action Space Spectrum (Draft-First Protocol)');
    expect(content).toContain('Action: Draft (Default)');
    expect(content).toContain('Action: Question');
    expect(content).toContain('Action: Stay Silent');
    expect(content).toContain('Action: Notify / Deliver');
    expect(content).toContain('Escape Hatch (`--interactive`)');
    expect(content).toContain('one question at a time');
  });

  it('proposal-format.md includes ## Stated Assumptions section', () => {
    const content = renderProposalFormat();
    expect(content).toContain('### 3. Stated Assumptions');
    expect(content).toContain('## Stated Assumptions');
    expect(content).toContain('Every autonomous inference not confirmed in prior interaction MUST be listed here');
    expect(content).toContain('artifact_language');
  });

  it('next-step handoff provides direct command recommendation without blocking (Y/n)', () => {
    const content = renderHandoff();
    expect(content).toContain('recommend the next step in the SDD workflow order');
    expect(content).not.toContain('(Y/n)');
    expect(content).toContain('without blocking on a separate confirmation turn');
  });

  it('prospec-new-story silences advisory checks to quality_log', () => {
    const phase6 = sectionOf(renderNewStory(), '### Phase 6: Constitution Check (site-specific: INVEST)');
    expect(phase6).toContain('silently via `prospec change log');
    expect(phase6).toContain('quality_log');
  });
});

describe("Autonomous Pipeline Cascading & Verifier Gates (issue #183)", () => {
  it("cascade-protocol.md, circuit-breaker.md, project-test-runner.md are registered in SKILL_REFERENCE_MAP", () => {
    const ffRefs = getSkillReferences("prospec-ff").map((r) => r.outputName);
    expect(ffRefs).toContain("cascade-protocol.md");
    expect(ffRefs).toContain("circuit-breaker.md");
    expect(ffRefs).toContain("project-test-runner.md");

    const implementRefs = getSkillReferences("prospec-implement").map((r) => r.outputName);
    expect(implementRefs).toContain("project-test-runner.md");

    const reviewRefs = getSkillReferences("prospec-review").map((r) => r.outputName);
    expect(reviewRefs).toContain("circuit-breaker.md");
    expect(reviewRefs).toContain("project-test-runner.md");
  });

  it("cascade references render and satisfy token budget <= 2500", () => {
    for (const refTemplate of ["cascade-protocol.hbs", "circuit-breaker.hbs", "project-test-runner.hbs"]) {
      const content = renderTemplate(`skills/references/${refTemplate}`, TEMPLATE_CONTEXT);
      const tokens = estimateTokens(content);
      expect(tokens, `${refTemplate} must be under budget`).toBeLessThanOrEqual(
        DEFAULT_KNOWLEDGE_TOKEN_BUDGET.reference_per_file,
      );
    }
  });

  it("cascade-protocol.md defines scale-driven paths, transition gates, and Tastemaker sign-off", () => {
    const content = renderTemplate("skills/references/cascade-protocol.hbs", TEMPLATE_CONTEXT);
    expect(content).toContain("Scale: Quick");
    expect(content).toContain("Scale: Standard");
    expect(content).toContain("Scale: Full");
    expect(content).toContain("Tastemaker Presentation & Human Gate");
    expect(content).toContain("NEVER");
    expect(content).toContain("Human Escape Hatch");
  });

  it("circuit-breaker.md defines 3-5 round limit, oscillation detection, and escalation protocol", () => {
    const content = renderTemplate("skills/references/circuit-breaker.hbs", TEMPLATE_CONTEXT);
    expect(content).toContain("Maximum Iteration Ceiling");
    expect(content).toContain("Oscillation Breaker");
    expect(content).toContain("FAIL → PASS → FAIL");
    expect(content).toContain("Escalation Protocol");
    expect(content).toContain("Trade-off Options for Developer");
  });

  it("project-test-runner.md defines multi-language test command resolution hierarchy", () => {
    const content = renderTemplate("skills/references/project-test-runner.hbs", TEMPLATE_CONTEXT);
    expect(content).toContain("Test Command Resolution Hierarchy");
    expect(content).toContain("Cargo.toml");
    expect(content).toContain("pytest");
    expect(content).toContain("go test");
    expect(content).toContain("Constitution Obedience");
  });

  it("prospec-ff integrates autonomous pipeline cascading and Tastemaker sign-off gate", () => {
    const content = renderTemplate("skills/prospec-ff.hbs", TEMPLATE_CONTEXT);
    expect(content).toContain("Autonomous Pipeline Cascading");
    expect(content).toContain("references/cascade-protocol.md");
    expect(content).toContain("references/circuit-breaker.md");
    expect(content).toContain("automatically commit, push, or archive");
  });
});


describe('reuse-and-single-source gate (issue #204)', () => {
  // Shared title strings — the rubric's own headings are the source the other sites
  // are compared against (PB-006 drift guard), so a rename in one place turns red.
  const REUSE_DIM = 'Reuse & Single-Source';
  const SIMPLER = 'Simpler Alternative';
  // Fragments of the two-condition definition. They are allowed in review-format.md
  // ONLY (the severity contract's single home); every other shipped template cites
  // the criterion BY NAME and never restates the conditions.
  const DEFINITION_FRAGMENTS = ['both conditions required', 'autonomous or write path'];
  // prospec-internal identifiers a project-agnostic shipped reference must never name.
  const PROSPEC_INTERNAL_NAMES = [
    'change-story.service',
    'normalizeIssueRef',
    'sanitizeTerminal',
    'attributionMap',
    'AlreadyExistsError',
  ];
  const renderRubric = () =>
    renderTemplate('skills/references/plan-verifier-rubric.hbs', TEMPLATE_CONTEXT);
  const renderPlanFormat = () =>
    renderTemplate('skills/references/plan-format.hbs', TEMPLATE_CONTEXT);
  const renderReviewFormat = () =>
    renderTemplate('skills/references/review-format.hbs', TEMPLATE_CONTEXT);
  const renderLenses = () =>
    renderTemplate('skills/references/review-lenses-content.hbs', TEMPLATE_CONTEXT);
  const renderPlanSkill = () => renderTemplate('skills/prospec-plan.hbs', TEMPLATE_CONTEXT);
  const renderReviewSkill = () => renderTemplate('skills/prospec-review.hbs', TEMPLATE_CONTEXT);
  const renderCascade = () =>
    renderTemplate('skills/references/cascade-protocol.hbs', TEMPLATE_CONTEXT);
  // Every shipped surface this change touches, plus the review skill that mirrors the
  // lens trigger — the scan set for the negative invariants below.
  const allTouched = (): [string, string][] => [
    ['plan-verifier-rubric', renderRubric()],
    ['plan-format', renderPlanFormat()],
    ['review-format', renderReviewFormat()],
    ['review-lenses-content', renderLenses()],
    ['prospec-plan', renderPlanSkill()],
    ['prospec-review', renderReviewSkill()],
    ['cascade-protocol', renderCascade()],
  ];
  const rubricDimensionTitles = (): string[] =>
    renderRubric()
      .split('\n')
      .filter((l) => /^### \d\. /.test(l))
      .map((l) => l.replace(/^### \d\. /, ''));
  const findRow = (rows: string[], prefix: string): string => {
    const row = rows.find((l) => l.startsWith(prefix));
    expect(row, `row not found: ${prefix}`).toBeDefined();
    return row!;
  };

  it('rubric counts five orthogonal dimensions and the fifth is Reuse & Single-Source', () => {
    const intro = sectionOf(renderRubric(), '## Evaluation Dimensions');
    expect(intro).toContain('five orthogonal dimensions');
    expect(intro).not.toContain('four orthogonal dimensions');
    const titles = rubricDimensionTitles();
    expect(titles).toHaveLength(5);
    expect(titles[4]).toBe(REUSE_DIM);
  });

  it('rubric dimension 5 adjudicates existing owners from the TARGET project knowledge base', () => {
    const dim5 = flat(sectionOf(renderRubric(), `### 5. ${REUSE_DIM}`));
    // Rule Source: the target project's own knowledge, never a prospec file name
    expect(dim5).toMatch(/Modification Guide/);
    expect(dim5).toMatch(/_conventions\.md/);
    expect(dim5).toMatch(/module map/i);
    // the surface classes, then the (a)/(b) disjunction pinned clause by clause
    for (const surface of ['writer', 'creator', 'parser', 'formatter']) expect(dim5).toContain(surface);
    expect(dim5).toMatch(/\(a\) name the existing owner/);
    expect(dim5).toMatch(/retrieval evidence that the verifier's own search confirms/);
    expect(dim5).toMatch(/\(b\) explicitly argue the rewrite/);
    // no new surface / no owner found are stated outcomes, never blanks
    expect(dim5).toMatch(/vacuous PASS/);
    expect(dim5).toMatch(/negative evidence/);
    // evidence collection is mechanical and delegable; only the verdict is the verifier's
    expect(dim5).toMatch(/fast executor/);
    expect(dim5).toMatch(/adjudicat/);
    // a standard (or absent-scale) plan without its Simpler Alternative is an unargued rewrite
    expect(dim5).toContain(`## ${SIMPLER}`);
    expect(dim5).toMatch(/`scale: standard` \(or absent/);
  });

  it('rubric Verdict table grades an unargued owner bypass FLAWS on its own terms, naming review-format only as the review-stage counterpart', () => {
    const verdict = sectionOf(renderRubric(), '## Verdict & Severity Contract');
    const rows = verdict.split('\n');
    expect(findRow(rows, '| **PASS**')).toContain('All 5 dimensions');
    expect(verdict).not.toContain('All 4 dimensions');
    const flaws = findRow(rows, '| **FLAWS**');
    expect(flaws).toMatch(/existing owner bypassed without a stated rationale/);
    expect(flaws).toContain(SIMPLER);
    // the plan-stage trigger is self-contained (any path); review-format is a pointer, not the rule
    expect(flat(verdict)).toMatch(/single-source bypass criterion/);
    expect(flat(verdict)).toMatch(/review-stage counterpart/);
    for (const fragment of DEFINITION_FRAGMENTS) expect(flat(verdict)).not.toContain(fragment);
  });

  it('plan-format Section 6 tells the author to name the owner or argue the rewrite (authoring counterpart of dimension 5)', () => {
    const s6 = flat(sectionOf(renderPlanFormat(), '### 6. Implementation Steps'));
    expect(s6).toMatch(/name the existing owner you delegate to/);
    expect(s6).toMatch(/found none/);
    expect(s6).toMatch(/argue the rewrite/);
    expect(s6).toContain(REUSE_DIM);
  });

  it('plan-format Section 8 Simpler Alternative sits after Risk Assessment with alternative-or-concede, a files/lines estimate, and the fenced skeleton', () => {
    const pf = renderPlanFormat();
    const s8Raw = sectionOf(pf, `### 8. ${SIMPLER}`);
    const s8 = flat(s8Raw);
    expect(s8).toMatch(/`standard`/);
    expect(s8).toMatch(/concede/);
    expect(s8).toMatch(/\bfiles\b/);
    expect(s8).toMatch(/\blines\b/);
    expect(s8).toMatch(/after Risk Assessment/);
    expect(s8).toMatch(/tournament/);
    // the concede branch is coherent: the Alternative row names the nearest alternative or is omitted with a reason
    expect(s8).toMatch(/nearest alternative/);
    // the fenced skeleton is pinned structurally, not by prose vocabulary
    expect(s8Raw.split('\n')).toContain(`## ${SIMPLER}`);
    const table = findTable(s8Raw.split('\n'), { isTarget: (h) => h[0] === 'approach' });
    expect(table, 'estimate table missing from the §8 skeleton').not.toBeNull();
    expect(table!.headers).toEqual(['Approach', 'Files', 'Lines (order of magnitude)']);
    expect(table!.rows.map((r) => r[0]?.split(':')[0])).toEqual(['Chosen', 'Alternative']);
    // §7 precedes §8 in the document, so the section numbering is honest
    expect(pf.indexOf('### 7. Risk Assessment')).toBeGreaterThanOrEqual(0);
    expect(pf.indexOf('### 7. Risk Assessment')).toBeLessThan(pf.indexOf(`### 8. ${SIMPLER}`));
  });

  it('plan-format Scale Tiers requires Simpler Alternative under standard and lets the tournament record stand in under full', () => {
    const rows = sectionOf(renderPlanFormat(), '## Scale Tiers').split('\n');
    expect(findRow(rows, '| `standard` (or absent) |')).toContain(SIMPLER);
    const full = findRow(rows, '| `full` |');
    expect(full).toMatch(/tournament/);
    // pre-existing pin kept intact
    expect(full).toContain('the 120-line cap does not apply');
  });

  it('plan-format.md stays within the reference token budget', () => {
    const tokens = estimateTokens(renderPlanFormat());
    expect(tokens).toBeLessThanOrEqual(DEFAULT_KNOWLEDGE_TOKEN_BUDGET.reference_per_file);
  });

  it('prospec-plan Phase 4 carries the reuse gate on the authoring side: section list, owner-naming instruction, scale summary, and gate', () => {
    const lines = sectionOf(renderPlanSkill(), '### Phase 4: Design plan.md').split('\n');
    const riskIdx = lines.findIndex((l) => l.startsWith('- **Risk Assessment**'));
    const simplerIdx = lines.findIndex((l) => l.startsWith(`- **${SIMPLER}**`));
    expect(riskIdx).toBeGreaterThanOrEqual(0);
    expect(simplerIdx).toBe(riskIdx + 1);
    expect(lines[simplerIdx]).toContain('references/plan-format.md');
    const steps = findRow(lines, '- **Implementation Steps**');
    expect(steps).toMatch(/name the existing owner/);
    expect(steps).toMatch(/argue the rewrite/);
    expect(steps).toContain('Section 6');
    const standardTier = findRow(lines, '- `standard` (or absent):');
    expect(standardTier).toContain('keep under 120 lines');
    expect(standardTier).toContain(SIMPLER);
    expect(findRow(lines, '- `full`:')).toMatch(/tournament/);
    const gate = lines.filter((l) => l.startsWith('> - [ ]'));
    expect(gate.length).toBeGreaterThan(0);
    expect(gate.some((l) => l.includes(SIMPLER) && l.includes('`standard` (or absent)'))).toBe(true);
  });

  it('prospec-plan Phase 6 enumerates the five dimensions in the rubric order with byte-identical titles', () => {
    const p6 = sectionOf(
      renderPlanSkill(),
      '### Phase 6: Architecture Verification (site-specific: dependency/layering)',
    );
    expect(p6).toContain('the 5 orthogonal dimensions');
    expect(p6).not.toMatch(/\b4 orthogonal/);
    const items = p6
      .split('\n')
      .filter((l) => /^\d\. \*\*/.test(l))
      .map((l) => l.replace(/^\d\. \*\*(.+?)\*\*.*$/, '$1'));
    expect(items).toEqual(rubricDimensionTitles());
    const gate = p6.split('\n').filter((l) => l.startsWith('> - [ ]'));
    expect(gate.some((l) => l.includes('5 orthogonal dimensions'))).toBe(true);
  });

  it('cascade-protocol plan→tasks gate requires five orthogonal dimensions', () => {
    const rows = sectionOf(renderCascade(), '## Station Transition Gates').split('\n');
    const planRow = findRow(rows, '| **plan** |');
    expect(planRow).toMatch(/five orthogonal dimensions/);
    expect(planRow).not.toMatch(/\b4 orthogonal/);
  });

  it('review-format critical list carries the two-condition single-source bypass criterion as its fourth and last item, with both terms defined', () => {
    const critRaw = sectionOf(renderReviewFormat(), '### critical — blocks the loop, auto-fixed (when drop-in)');
    const items = critRaw.split('\n').filter((l) => /^\d\. \*\*/.test(l));
    expect(items).toHaveLength(4);
    const crit = flat(critRaw);
    expect(crit).toMatch(/4\. \*\*Single-source bypass on an autonomous or write path\*\*/);
    expect(crit).toMatch(/documents as the single source/);
    expect(crit).toMatch(/existing service already provides/);
    for (const fragment of DEFINITION_FRAGMENTS) expect(crit).toContain(fragment);
    // the decisive second condition is operational: both of its terms are defined in place
    expect(crit).toMatch(/without a human in the loop/);
    expect(crit).toMatch(/creates or mutates an artifact/);
    expect(crit).toMatch(/stays major/);
  });

  it('review-format and prospec-review both trigger the maintainability lens on a re-implemented helper, not only on new abstractions', () => {
    const rows = sectionOf(renderReviewFormat(), '## Reviewer Lenses').split('\n');
    const cells = splitTableRow(findRow(rows, '| maintainability / DRY |'));
    expect(cells[1]).toContain('new abstractions introduced');
    expect(cells[1]).toContain('existing helper / guard / writer re-implemented');
    expect(cells[2]).toContain('documented single-source bypass');
    // parallel site: the skill body names the same trigger (both move together)
    const lenses = sectionOf(renderReviewSkill(), '### Review Lenses');
    expect(lenses).toContain('existing helper / guard / writer re-implemented');
  });

  it('review-lenses Maintainability table maps the bypass onto the review-format criterion by name — no PB id, no second definition', () => {
    const maint = sectionOf(renderLenses(), '## Maintainability / DRY Lens');
    // Locate the row by its CRITERION cell, never by the severity cell: a row found
    // through the phrase it is supposed to carry in the severity column would stay
    // green with its criterion blanked and its severity flipped (review R3-1).
    const row = maint
      .split('\n')
      .filter((l) => l.startsWith('| '))
      .find((l) => splitTableRow(l)[0]?.includes('documents as the single source'));
    expect(row, 'single-source bypass row not found by its criterion cell').toBeDefined();
    const [criterion, severity] = splitTableRow(row!);
    expect(criterion).toMatch(/delegate to the owner/);
    expect(severity).toMatch(/^critical\b/);
    expect(severity).not.toMatch(/^major/);
    expect(severity).toContain('single-source bypass criterion');
    expect(severity).toContain('review-format.md');
    expect(row).not.toMatch(/PB-\d+/);
    for (const fragment of DEFINITION_FRAGMENTS) expect(flat(maint)).not.toContain(fragment);
  });

  it('the two-condition definition lives in review-format only — every other touched surface cites it by name', () => {
    const reviewFormat = flat(renderReviewFormat());
    for (const fragment of DEFINITION_FRAGMENTS) expect(reviewFormat).toContain(fragment);
    const others = allTouched().filter(([name]) => name !== 'review-format');
    expect(others.length).toBe(6);
    for (const [name, rendered] of others) {
      expect(rendered.length).toBeGreaterThan(0);
      for (const fragment of DEFINITION_FRAGMENTS) {
        expect(flat(rendered), `${name} must cite the criterion by name, not restate "${fragment}"`).not.toContain(
          fragment,
        );
      }
    }
  });

  it('reuse-gate wording is project-agnostic — no touched surface names a prospec-internal service or helper', () => {
    const rendered = allTouched();
    expect(rendered.length).toBe(7);
    for (const [name, content] of rendered) {
      expect(content.length).toBeGreaterThan(0);
      for (const internal of PROSPEC_INTERNAL_NAMES) {
        expect(content, `${name} must not name ${internal}`).not.toContain(internal);
      }
    }
  });
});
