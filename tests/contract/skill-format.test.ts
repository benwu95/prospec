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
import { renderTemplate } from '../../src/lib/template.js';
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';

const TEMPLATE_CONTEXT = {
  project_name: 'test-project',
  knowledge_base_path: 'docs/ai-knowledge',
  constitution_path: 'docs/CONSTITUTION.md',
  base_dir: 'docs',
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

describe('Skill Format Contract', () => {
  describe('Skill template rendering', () => {
    for (const skill of SKILL_DEFINITIONS) {
      describe(`${skill.name}`, () => {
        it('should render without errors', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          expect(content).toBeTruthy();
          expect(content.length).toBeGreaterThan(0);
        });

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
          expect(frontmatter).toContain('name:');
        });

        it('should contain description field in frontmatter', () => {
          const content = renderTemplate(
            `skills/${skill.name}.hbs`,
            TEMPLATE_CONTEXT,
          );
          const frontmatter = extractFrontmatter(content);
          expect(frontmatter).toContain('description:');
        });

      });
    }
  });

  describe('Reference templates', () => {
    const REFERENCE_TEMPLATES = [
      'proposal-format.hbs',
      'plan-format.hbs',
      'delta-spec-format.hbs',
      'tasks-format.hbs',
      'implementation-guide.hbs',
      'archive-format.hbs',
      'capability-spec-format.hbs',
      'feature-spec-format.hbs',
      'product-spec-format.hbs',
      'design-spec-format.hbs',
      'interaction-spec-format.hbs',
      'adapter-pencil.hbs',
      'adapter-figma.hbs',
      'adapter-penpot.hbs',
      'adapter-html.hbs',
      'review-format.hbs',
    ];

    for (const ref of REFERENCE_TEMPLATES) {
      it(`should render ${ref} without errors`, () => {
        const content = renderTemplate(
          `skills/references/${ref}`,
          TEMPLATE_CONTEXT,
        );
        expect(content).toBeTruthy();
        expect(content.length).toBeGreaterThan(0);
      });
    }
  });

  describe('Skill definitions', () => {
    it('should have 13 skill definitions', () => {
      expect(SKILL_DEFINITIONS).toHaveLength(13);
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
      expect(refSkillNames).toContain('prospec-learn');
      expect(refSkillNames).toContain('prospec-archive');
    });

    it('self-contained skills should have hasReferences = false', () => {
      // knowledge-generate / knowledge-update inline their canonical format
      // and defer to _module-readme-conventions.md — no references/ dir.
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
      expect(content).toContain('docs/ai-knowledge');
      expect(content).toContain('docs/CONSTITUTION.md');
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
      expect(content).toContain('feature-spec-format');
      expect(content).toContain('product-spec-format');
    });
  });

  describe('Capability spec format structure', () => {
    it('should contain Overview, Requirements, and Change History sections', () => {
      const content = renderTemplate(
        'skills/references/capability-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('## Purpose');
      expect(content).toContain('## Standard Format');
      expect(content).toContain('Overview');
      expect(content).toContain('Requirements');
      expect(content).toContain('Change History');
    });

    it('should include WHEN/THEN scenario format', () => {
      const content = renderTemplate(
        'skills/references/capability-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('WHEN');
      expect(content).toContain('THEN');
      expect(content).toContain('REQ ID');
    });

    it('should include maintenance rules', () => {
      const content = renderTemplate(
        'skills/references/capability-spec-format.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('Maintenance Rules');
      expect(content).toContain('ADDED');
      expect(content).toContain('MODIFIED');
      expect(content).toContain('REMOVED');
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

    it('should contain NEVER list', () => {
      const content = renderTemplate(
        'skills/prospec-design.hbs',
        TEMPLATE_CONTEXT,
      );
      expect(content).toContain('## NEVER');
      expect(content).toContain('NEVER');
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
      expect(content).toContain('design-spec.md');
      expect(content).toContain('adapter MCP');
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
      expect(content).toContain('### 5. Implementation Steps');
      expect(content).toContain('### 6. Risk Assessment');
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

    it('verify dimension 4/5 gates on Knowledge↔implementation, not Feature Spec freshness', () => {
      const content = renderTemplate('skills/prospec-verify.hbs', TEMPLATE_CONTEXT);
      expect(content).toContain('Knowledge ↔ Implementation Consistency');
      expect(content).toContain('gates on Knowledge tracking the code');
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
      expect(section).toContain('technical terms in English');
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
    expect(section).toContain('remain in English');
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
