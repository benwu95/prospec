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
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';

const TEMPLATE_CONTEXT = {
  project_name: 'test-project',
  knowledge_base_path: 'prospec/ai-knowledge',
  constitution_path: 'prospec/CONSTITUTION.md',
  base_dir: 'prospec',
  tech_stack: { language: 'typescript', framework: 'express' },
  artifact_language: 'English',
  trigger_words: 'test-trigger-alpha, test-trigger-beta',
  skills: SKILL_DEFINITIONS.map((s) => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers.join(', '),
    type: s.type,
    hasReferences: s.hasReferences,
  })),
};

// slice from the heading line to the next ##/### heading; guard non-empty (PB-001)
const sectionOf = (content: string, heading: string): string => {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // match to the next ##/### heading, or end-of-file for a trailing section
  const re = new RegExp(`^${esc}[^\\n]*\\n([\\s\\S]*?)(?=^#{2,3} |(?![\\s\\S]))`, 'm');
  const body = re.exec(content)?.[1] ?? '';
  expect(
    body.trim().length,
    `section not found or empty: ${heading}`,
  ).toBeGreaterThan(0);
  return body;
};

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

        it('should render a description field carrying the synthesized triggers', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          const frontmatter = extractFrontmatter(content);
          expect(frontmatter).toContain('description:');
          // the description suffix renders `Triggers: {{trigger_words}}`, so a
          // missing/empty/un-rendered description value (not just the key) fails
          expect(frontmatter).toContain(
            `Triggers: ${TEMPLATE_CONTEXT.trigger_words}`,
          );
        });

      });
    }
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
      ['debug-recovery-format.hbs', '# Debug & Recovery Reference'],
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

    it('should contain Product Spec Regeneration phase', () => {
      const content = renderTemplate(
        'skills/prospec-archive.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Product Spec Regeneration');
      expect(content).toContain('product.md');
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

    it('should contain YAML frontmatter with design triggers', () => {
      const content = renderTemplate(
        'skills/prospec-design.hbs',
        TEMPLATE_CONTEXT,
      );
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

    it('prospec-knowledge-generate refreshes raw-scan in Startup Loading with a CLI fallback ladder', () => {
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
      // CLI fallback ladder (Prerequisite): pnpm exec / npx — Windows-safe, no Python
      expect(content).toContain('pnpm exec prospec knowledge init --raw-scan-only');
      expect(content).toContain('npx -y prospec knowledge init --raw-scan-only');
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

    it('prospec-verify should contain a Status Update gate (S/A only)', () => {
      const content = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('## Status Update');
      expect(content).toContain('status: verified');
      expect(content).toContain('Grade B / C / D');
      expect(content).toContain('Call Chain ↔ layering');
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

    it('prospec-implement should set status: implemented when tasks complete', () => {
      const content = renderTemplate(
        'skills/prospec-implement.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('status: implemented');
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

    it('status-lifecycle documents the knowledge-sync checkpoint at the archive Entry Gate', () => {
      const content = renderTemplate(
        'init/status-lifecycle.md.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('single mandatory knowledge-sync checkpoint');
      expect(content).toContain('affected-module Knowledge is synced (archive Entry Gate)');
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

  describe('Agent config skill reference paths', () => {
    it('renders skills-dir references for the .claude/skills path', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.claude/skills',
      });
      expect(content).toContain('.claude/skills/prospec-archive/references/');
      expect(content).not.toContain('.prospec/skills/');
    });

    it('renders skills-dir references for the .agents/skills path', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.agents/skills',
      });
      expect(content).toContain('.agents/skills/prospec-archive/references/');
      expect(content).not.toContain('.prospec/skills/');
      expect(content).not.toContain('.instructions.md');
    });

    it('self-contained skills should not emit a References line', () => {
      const content = renderTemplate('agent-configs/entry.md.hbs', {
        ...TEMPLATE_CONTEXT,
        skill_path: '.claude/skills',
      });
      expect(content).not.toContain(
        '.claude/skills/prospec-knowledge-generate/references/',
      );
      expect(content).not.toContain(
        '.claude/skills/prospec-knowledge-update/references/',
      );
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
      expect(content).toContain('MUST');
      expect(content).toContain('SHOULD');
      expect(content).toContain('MAY');
      expect(content).toContain('Severity-graded');
      // MAY is advisory/informational — must NOT introduce a 4th grade state
      expect(content).toContain('informational');
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

    it('prospec-verify no longer grades this-change knowledge sync anywhere', () => {
      const content = renderVerify();
      expect(content).toContain('syncs at the `/prospec-archive` Entry Gate');
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
      expect(c).toContain('cli → services → lib → types');
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

    it('persists findings to review.md; only criticals block, major → quality_log', () => {
      const c = render();
      // Scope to the Persistence section — the MANDATORY-read and
      // Success-Criteria mentions of review.md must not satisfy this.
      const persist = c.slice(
        c.indexOf('### Persistence'),
        c.indexOf('## Output Contract'),
      );
      expect(persist.length).toBeGreaterThan(0);
      expect(persist).toContain('review.md');
      expect(persist).toMatch(/dedup|deduplicat/i);
      expect(persist).toMatch(/carr(y|ied) forward/i);
      // major findings hand off to verify via quality_log (Exit Gate), not graded
      const exit = c.slice(c.indexOf('### Exit Gate'));
      expect(exit).toContain('quality_log');
    });

    it('degrades on harnesses without sub-agents instead of silently skipping', () => {
      const c = render();
      expect(c).toMatch(/sub-?agent/i);
      expect(c).toMatch(/never.*silent|not.*skip|offer.*choice/i);
    });
  });

  describe('Commit boundary after verify(S/A) (BL-037)', () => {
    it('prospec-implement defers commit and points to /prospec-review', () => {
      const c = renderTemplate('skills/prospec-implement.hbs', TEMPLATE_CONTEXT);
      expect(c).toContain('/prospec-review');
      expect(c).toMatch(/do not commit|defer commit|not commit during/i);
    });

    it('prospec-verify prompts the user to commit after S/A and never auto-commits', () => {
      const c = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      const tail = c.slice(c.indexOf('## Status Update'));
      expect(tail).toMatch(/commit/i);
      expect(tail).toMatch(/prompt|remind/i);
      expect(tail).toMatch(/not auto-commit|do not commit automatically|never commit on/i);
    });
  });

  describe('prospec-learn skill — feedback promotion pipeline (BL-036)', () => {
    const render = () => renderTemplate('skills/prospec-learn.hbs', TEMPLATE_CONTEXT);

    it('has the four pipeline phases under Core Workflow', () => {
      const c = render();
      const flow = c.slice(c.indexOf('## Core Workflow'));
      expect(flow.length).toBeGreaterThan(0);
      expect(flow).toContain('### Collect');
      expect(flow).toContain('### Score');
      expect(flow).toContain('### Promote');
      expect(flow).toContain('### Govern');
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
      skill_path: '.claude/skills',
    });
    const section = sectionOf(content, '## Language Policy');
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain('**Traditional Chinese (Taiwan)**');
    expect(section).toContain('git commit messages always remain in English');
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

  it('entry config lists trigger words for every skill', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', {
      ...TEMPLATE_CONTEXT,
      artifact_language: 'English',
      skill_path: '.claude/skills',
    });
    for (const skill of SKILL_DEFINITIONS) {
      expect(content).toContain(`**Triggers**: ${skill.triggers.join(', ')}`);
    }
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

  it('Phase 3.5 requires user confirmation before writing scale', () => {
    const phase = sectionOf(render(), '### Phase 3.5: Complexity Assessment (Scale)');
    expect(phase).toContain('**never write `scale` without user confirmation**');
    expect(phase).toContain('scale: quick|standard|full');
  });

  it('quick produces a slim proposal: single story, no FR/SC enumeration', () => {
    const phase = sectionOf(render(), '### Phase 3.5: Complexity Assessment (Scale)');
    expect(phase).toContain('**Quick slim proposal:**');
    expect(phase).toContain('skip the FR/SC enumeration');
    expect(phase).toContain('2-3 WHEN/THEN');
  });

  it('NEVER section guards unconfirmed scale writes and quick-with-spec-impact', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('without explicit user confirmation');
    expect(never).toContain('spec-covered behavior');
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

  it('ff NEVER guards: quick is the only legal plan skip and needs user-confirmed scale', () => {
    const never = sectionOf(renderFf(), '## NEVER');
    expect(never).toContain('story → tasks only when `scale: quick`');
    expect(never).toContain('without a user-confirmed `scale: quick`');
    expect(never).toContain('quick skips Plan and loads none');
  });

  it('lifecycle template records the quick story → tasks transition with archive backstop', () => {
    const content = renderLifecycle();
    expect(content).toContain('skipped when metadata `scale: quick`');
    expect(content).toContain('**quick path**: metadata `scale: quick` (user-confirmed)');
    expect(content).toContain('re-checked at the `/prospec-archive` Entry Gate');
    expect(content).toContain('The only legal skip is `story → tasks` under a user-confirmed `scale: quick`');
  });

  it('lifecycle template and ai-knowledge copy stay in sync on the quick path', () => {
    const tmpl = renderLifecycle();
    const copy = fs.readFileSync(
      path.join(__dirname, '../../prospec/ai-knowledge/_status-lifecycle.md'),
      'utf-8',
    );
    for (const marker of [
      'skipped when metadata `scale: quick`',
      '**quick path**: metadata `scale: quick` (user-confirmed)',
      'The only legal skip is `story → tasks` under a user-confirmed `scale: quick`',
    ]) {
      expect(tmpl).toContain(marker);
      expect(copy).toContain(marker);
    }
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

  it('Status Update notes backfill S/A means fidelity, not code quality', () => {
    const status = sectionOf(renderVerify(), '## Status Update');
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

  it('documents that the auto knowledge-update is skipped for backfill (phantom-module guard)', () => {
    const c = renderArchive();
    expect(c).toContain('For `scale: backfill` the service **skips** the auto knowledge-update');
    expect(c).toContain('mint phantom modules');
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

  it('produces the light scaffold (proposal + delta-spec + metadata) — no hollow plan.md/tasks.md', () => {
    const c = render();
    // the two staged spec artifacts have their own workflow phases
    expect(c).toContain('### Phase 2: proposal.md');
    expect(c).toContain('### Phase 3: delta-spec.md');
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
    // the new-story-time options string stays exactly the three sizes
    expect(phase).toContain('scale: quick|standard|full');
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

  it('Startup Loading runs the engine as a [DYNAMIC] step with an explicit fallback', () => {
    const loading = sectionOf(render(), '## Startup Loading');
    const engineItem = loading
      .split('\n')
      .find((l) => /^\d+\.\s+/.test(l) && l.includes('`prospec check --json`'));
    expect(engineItem, 'engine loading item missing').toBeTruthy();
    expect(engineItem).toContain('[DYNAMIC]');
    expect(engineItem).toContain('drift engine unavailable');
    expect(engineItem).toContain('never fall back silently');
  });

  it('Verification 1/5 sources completion facts from the task-completion check', () => {
    const v1 = sectionOf(render(), '### Verification 1/5');
    expect(v1).toContain('`task-completion`');
    expect(v1).toContain('do not recount by hand');
    expect(v1).toContain('never treated as complete or PASS');
    // denominator semantics unchanged (MODIFIED REQ-TEMPLATES-088 keeps grading intact)
    expect(v1).toContain('code tasks only');
    expect(v1).toContain('never counted in the rate');
  });

  it('Verification 4/5 bases freshness on the knowledge_health report section', () => {
    const v4 = sectionOf(render(), '### Verification 4/5');
    expect(v4).toContain('`knowledge_health`');
    expect(v4).toContain('git-timestamp staleness');
    expect(v4).toContain('never presented as PASS');
    // semantic judgment stays LLM work (REQ-TEMPLATES-034 untouched)
    expect(v4).toContain('remain LLM work');
  });

  it('NEVER section forbids skipped-as-PASS and silent fallback', () => {
    const never = sectionOf(render(), '## NEVER');
    expect(never).toContain('skipped means unchecked');
    expect(never).toContain('fall back from the drift engine silently');
  });

  it('Error Handling covers engine unavailability with the explicit fallback wording', () => {
    const errors = sectionOf(render(), '## Error Handling');
    expect(errors).toContain('`prospec check` unavailable or fails');
    expect(errors).toContain('drift engine unavailable — falling back to manual checks');
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
    it(`${name} ends with a status-aware (Y/n) next-step handoff`, () => {
      const content = renderTemplate(`skills/${name}.hbs`, TEMPLATE_CONTEXT);
      expect(content).toContain('Next-Step Handoff');
      expect(content).toContain('(Y/n)');
      expect(content).toContain('_status-lifecycle.md');
    });
  }

  it('entry config detects in-progress changes at session start', () => {
    const content = renderTemplate('agent-configs/entry.md.hbs', TEMPLATE_CONTEXT);
    expect(content).toContain('Session Start');
    expect(content).toContain('.prospec/changes/');
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
      expect(sectionOf(c, '### Verification 5/5: Test Verification')).toContain(
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

  it('instructs copying curated table rows and forbids rebuilding via knowledge update', () => {
    const content = renderTemplate('skills/prospec-upgrade.hbs', TEMPLATE_CONTEXT);
    // the curated Keywords/Aliases/Rationale/Depends On cells exist nowhere else —
    // `prospec knowledge update` rebuilds only Module/Status/Description and guts them
    expect(content).toContain('copy the curated `Modules` table rows verbatim');
    expect(content).toMatch(/Do NOT run `prospec knowledge update`/);
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

describe('Archive summary Review & Verify section (REQ-TEMPLATES-126)', () => {
  const render = () =>
    renderTemplate('skills/references/archive-format.hbs', TEMPLATE_CONTEXT);

  it('archive-format defines a Review & Verify section spec with grade, criticals/majors, and quality_log digest', () => {
    // the content categories live in the intro prose BEFORE the fenced
    // `## Review & Verify` example, so the sectionOf slice (which stops at the
    // next line-start `## ` — including the one inside the fence) still sees them
    const section = sectionOf(render(), '### 6. Review & Verify');
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
