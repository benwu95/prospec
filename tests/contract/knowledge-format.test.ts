/**
 * Contract tests for AI Knowledge output format.
 *
 * Verifies that generated knowledge files conform to the expected format:
 * - Module README follows Recipe-First format (≤100 lines)
 * - Module README contains required sections (Modification Guide, Ripple Effects, Pitfalls)
 * - index.md contains Rationale column and Loading Rules section
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderTemplate } from '../../src/lib/template.js';
import { buildIndexTemplateContext } from '../../src/lib/index-template.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';
import { FeatureMapSchema } from '../../src/types/feature-map.js';
import {
  INDEX_TABLE_HEADER,
  INDEX_TABLE_COLUMNS,
} from '../../src/types/knowledge.js';

describe('Knowledge Format Contract', () => {
  describe('Module README (Recipe-First format)', () => {
    const templateContext = {
      module_name: 'services',
      description: 'Business logic services',
      path: 'src/services',
      keywords: ['services', 'business', 'logic'],
      relationships: {
        depends_on: ['lib', 'types'],
        used_by: ['cli', 'commands'],
      },
      key_files: [
        { path: 'src/services/auth.service.ts', description: 'Authentication service' },
        { path: 'src/services/user.service.ts', description: 'User management service' },
        { path: 'src/services/knowledge.service.ts', description: 'Knowledge generation service' },
      ],
      key_exports: [
        { name: 'auth.execute()', description: 'Authentication service' },
        { name: 'user.execute()', description: 'User management service' },
        { name: 'knowledge.execute()', description: 'Knowledge generation service' },
      ],
    };

    it('should render without errors', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      // prove interpolation actually ran (static headers alone are not enough)
      expect(content).toContain('# services');
      expect(content).toContain('src/services/auth.service.ts');
      expect(content).toContain('auth.execute()');
    });

    it('stays ≤ 100 lines even for a large module (20 files/exports/dependents)', () => {
      // Each key_file, key_export, and used_by entry adds one rendered line on
      // top of the fixed scaffold, so a realistic large module is what pushes
      // the output toward the 100-line contract ceiling. A 3-item context
      // (~44 lines) can never approach it, making the bound vacuous.
      const N = 20;
      const largeContext = {
        ...templateContext,
        relationships: {
          depends_on: Array.from({ length: N }, (_, i) => `dep${i}`),
          used_by: Array.from({ length: N }, (_, i) => `consumer${i}`),
        },
        key_files: Array.from({ length: N }, (_, i) => ({
          path: `src/services/file${i}.service.ts`,
          description: `Service ${i}`,
        })),
        key_exports: Array.from({ length: N }, (_, i) => ({
          name: `service${i}.execute()`,
          description: `Service ${i}`,
        })),
      };
      const content = renderTemplate('knowledge/module-readme.hbs', largeContext);
      const lineCount = content.split('\n').length;
      // The large context must be near (but within) the ceiling — otherwise the
      // ≤100 bound is not actually exercised by this test.
      expect(lineCount).toBeGreaterThan(90);
      expect(lineCount).toBeLessThanOrEqual(100);
    });

    it('should contain Modification Guide section', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('## Modification Guide');
    });

    it('should contain Ripple Effects section', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('## Ripple Effects');
    });

    it('should contain Pitfalls section', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('## Pitfalls');
    });

    it('should contain Key Files section', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('## Key Files');
    });

    it('should contain Public API section', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('## Public API');
    });

    it('should contain Dependencies section', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('## Dependencies');
    });

    it('should contain prospec:auto markers', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('prospec:auto-start');
      expect(content).toContain('prospec:auto-end');
    });

    it('should contain prospec:user markers', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).toContain('prospec:user-start');
      expect(content).toContain('prospec:user-end');
    });

    it('should NOT contain api-surface, dependencies.md, or patterns.md references', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', templateContext);
      expect(content).not.toContain('api-surface.md');
      expect(content).not.toContain('dependencies.md');
      expect(content).not.toContain('patterns.md');
    });
  });

  describe('index.md format', () => {
    // The REAL context builder every emitter uses — a hand-built duplicate here
    // once masked init.service passing a raw column array and no base_dir.
    const templateContext = buildIndexTemplateContext({
      projectName: 'test-project',
      techStack: { language: 'typescript', framework: 'express' },
      baseDir: 'prospec',
      knowledgeBasePath: 'prospec/ai-knowledge',
      coreConventions: ['_conventions.md', '_glossary.md'],
      demandConventions: ['_playbook.md'],
    });

    it('should render without errors', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      // prove interpolation actually ran (template is mostly static otherwise)
      expect(content).toContain('test-project');
      expect(content).toContain('typescript');
    });

    it('should contain Rationale column header', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      expect(content).toContain('Rationale');
    });

    it('should contain Progressive Knowledge Loading Strategy section', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      expect(content).toContain('## Progressive Knowledge Loading Strategy');
    });

    it('should define L0, L1, L2, and L3 layers', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      expect(content).toContain('L0');
      expect(content).toContain('L1');
      expect(content).toContain('L2');
      expect(content).toContain('L3');
    });

    it('should not list api-surface, dependencies, or patterns as generated file types', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      // (Progressive Knowledge Loading Strategy may mention them as "not generated" — that's OK, we just want to ensure
      // they aren't generated as separate files per module)
      const moduleTableSection = content.split('## Progressive Knowledge Loading Strategy')[0] || '';
      expect(moduleTableSection).not.toContain('api-surface');
      expect(moduleTableSection).not.toContain('dependencies.md');
      expect(moduleTableSection).not.toContain('patterns.md');
    });

    it('should contain prospec:auto markers', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      expect(content).toContain('prospec:auto-start');
      expect(content).toContain('prospec:auto-end');
    });

    it('documents the optional ### {Category} grouping with a primary-only rule (REQ-KNOW-018)', () => {
      const content = renderTemplate('knowledge/index.md.hbs', templateContext);
      expect(content).toContain('### {Category}');
      expect(content).toMatch(/group/i);
      expect(content).toContain('primary');
      // the scaffold still keeps the flat-table contract intact
      expect(content).toContain('Rationale');
    });
  });

  describe('canonical index-table column schema is single-sourced (REQ-KNOW-005/020)', () => {
    const TEMPLATES = path.resolve(__dirname, '../../src/templates');

    it('init scaffold (shared context builder) renders base_dir and pipe-joined columns', () => {
      const content = renderTemplate(
        'knowledge/index.md.hbs',
        buildIndexTemplateContext({
          projectName: 'p',
          baseDir: 'prospec',
          knowledgeBasePath: 'prospec/ai-knowledge',
          coreConventions: ['_conventions.md'],
          demandConventions: [],
        }),
      );
      expect(content).toContain(INDEX_TABLE_COLUMNS.join(' | '));
      expect(content).toContain('Aliases');
      // base_dir must be substituted everywhere — an unsubstituted context
      // renders "`/index.md`" in the header and loading-strategy table
      expect(content).toContain('located at `prospec/index.md`');
      expect(content).not.toContain('`/index.md`');
      // columns arrive pre-joined from the builder, never comma-joined
      expect(content).not.toContain('Module,Keywords');
      // the stale 5-column header must be gone
      expect(content).not.toContain('| Module | Keywords | Status | Description | Depends On |');
    });

    it('knowledge/index.md.hbs format hint lists the canonical columns', () => {
      const content = renderTemplate(
        'knowledge/index.md.hbs',
        buildIndexTemplateContext({
          projectName: 'p',
          baseDir: 'prospec',
          knowledgeBasePath: 'prospec/ai-knowledge',
          coreConventions: [],
          demandConventions: [],
        }),
      );
      // Assert an independent literal of the documented schema, not the same
      // INDEX_TABLE_COLUMNS value fed into the context (which would move together).
      expect(content).toContain(
        'Module | Keywords | Aliases | Status | Description | Rationale | Depends On',
      );
    });

    it('knowledge-generate and knowledge-update skill docs use the canonical header verbatim', () => {
      for (const skill of ['prospec-knowledge-generate', 'prospec-knowledge-update']) {
        const raw = fs.readFileSync(path.join(TEMPLATES, 'skills', `${skill}.hbs`), 'utf-8');
        expect(raw).toContain(INDEX_TABLE_HEADER);
      }
    });
  });

  describe('module README Dependencies canonical labels (REQ-KNOW-021)', () => {
    const TEMPLATES = path.resolve(__dirname, '../../src/templates');

    it('module-readme scaffold renders **Depends on:** / **Used by:** labels', () => {
      const content = renderTemplate('knowledge/module-readme.hbs', {
        module_name: 'm',
        description: 'd',
        relationships: { depends_on: ['lib'], used_by: ['cli'] },
        key_files: [],
        key_exports: [],
      });
      expect(content).toContain('**Depends on:**');
      expect(content).toContain('**Used by:**');
    });

    it('knowledge-generate skeleton documents canonical Dependencies labels', () => {
      const raw = fs.readFileSync(
        path.join(TEMPLATES, 'skills', 'prospec-knowledge-generate.hbs'),
        'utf-8',
      );
      expect(raw).toContain('**Depends on:**');
      expect(raw).toContain('**Used by:**');
    });
  });

  describe('raw-scan.md section grouping (REQ-KNOW-022)', () => {
    it('renders sections grouped tech-profile then project-structure', () => {
      const content = renderTemplate('knowledge/raw-scan.md.hbs', {
        project_name: 'demo',
        tech_stack: { language: 'go', framework: '', package_manager: 'go modules', source: 'auto-detected' },
        entry_points: ['main.go'],
        directory_tree: 'src/',
        dependencies: [{ name: 'gin', version: 'v1.9.1' }],
        config_files: ['go.mod'],
        file_stats: { total_files: 3, scan_depth: 10 },
      });
      const order = ['## Tech Stack', '## Entry Points', '## Dependencies', '## Config Files', '## Directory Tree', '## File Stats'];
      const positions = order.map((h) => content.indexOf(h));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });
  });

  describe('feature-map.yaml.hbs format (REQ-TEMPLATES-113)', () => {
    const render = (features: unknown) =>
      renderTemplate('knowledge/feature-map.yaml.hbs', { features });

    it('renders 2-space items, 4-space keys and 6-space members, round-tripping to the schema', () => {
      const content = render([
        { feature: 'sdd-workflow', modules: ['services', 'lib'], req_prefixes: ['CHNG'], status: 'active' },
      ]);
      expect(content).toContain('features:');
      expect(content).toContain('  - feature: sdd-workflow');
      expect(content).toContain('    modules:');
      expect(content).toContain('      - services');
      expect(content).toContain('    req_prefixes:');
      expect(content).toContain('      - CHNG');
      expect(content).toContain('    status: active');
      const parsed = FeatureMapSchema.safeParse(parseYaml(content));
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.features[0]?.modules).toEqual(['services', 'lib']);
    });

    it('omits the req_prefixes key when none are declared (no empty key after bootstrap)', () => {
      const withEmpty = render([
        { feature: 'feedback-promotion', modules: ['templates'], req_prefixes: [], status: 'active' },
      ]);
      const withUndefined = render([
        { feature: 'feedback-promotion', modules: ['templates'], status: 'active' },
      ]);
      expect(withEmpty).not.toContain('req_prefixes');
      expect(withUndefined).not.toContain('req_prefixes');
      expect(FeatureMapSchema.safeParse(parseYaml(withEmpty)).success).toBe(true);
    });

    it('renders empty modules as an explicit [] (feature with only non-module REQs), not YAML null', () => {
      // a bare `modules:` parses to null and the schema rejects it — the [] is load-bearing
      const content = render([
        { feature: 'design-phase', modules: [], req_prefixes: ['DSGN'], status: 'active' },
      ]);
      expect(content).toContain('    modules: []');
      const parsed = FeatureMapSchema.safeParse(parseYaml(content));
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.features[0]?.modules).toEqual([]);
    });

    it('the real feature-map.yaml lists every module the mcp-server feature spans (BL-043)', () => {
      // mcp-server is feature-prefixed (REQ-MCP-*); seeding from REQ headings alone
      // under-curates it, so the full span is curated by hand and must not regress.
      const raw = fs.readFileSync(
        path.join(process.cwd(), 'prospec/ai-knowledge/feature-map.yaml'),
        'utf-8',
      );
      const mcp = FeatureMapSchema.parse(parseYaml(raw)).features.find(
        (f) => f.feature === 'mcp-server',
      );
      expect(mcp).toBeDefined();
      for (const m of ['cli', 'lib', 'services', 'tests', 'types']) {
        expect(mcp?.modules).toContain(m);
      }
    });
  });
});
