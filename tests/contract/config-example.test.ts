import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { execute } from '../../src/services/config-example.service.js';
import { ProspecConfigSchema } from '../../src/types/config.js';

describe('config example completeness contract', () => {
  it('parses as valid YAML and passes ProspecConfigSchema.safeParse', async () => {
    const { content } = await execute();
    const result = ProspecConfigSchema.safeParse(parse(content));
    expect(result.success).toBe(true);
  });

  it('documents the `learn` thresholds the CLI reads (outside the loose schema shape, so pinned by name)', async () => {
    const { content } = await execute();
    const obj = parse(content) as { learn?: { thresholds?: Record<string, unknown>; lens_thresholds?: Record<string, unknown> } };
    expect(obj.learn?.thresholds).toEqual({ frequency: 3, impact_modules: 2 });
    expect(obj.learn?.lens_thresholds).toEqual({ consecutive_zero_threshold: 5, min_invocations: 3, min_yield: 0.1 });
  });

  it('states the base_dir range and symlink rule, and marks knowledge.base_path as fixed', async () => {
    const lines = (await execute()).content.split('\n');
    const commentAbove = (field: RegExp) => {
      const at = lines.findIndex((l) => field.test(l));
      expect(at, String(field)).toBeGreaterThan(0);
      const block: string[] = [];
      for (let i = at - 1; i >= 0 && /^\s*#/.test(lines[i]!); i--) block.unshift(lines[i]!.replace(/^\s*#\s?/, ''));
      return block.join(' ');
    };
    const base = commentAbove(/^ {2}base_dir: /);
    const knowledge = commentAbove(/^ {2}base_path: /);
    expect(base).toContain('single directory name beside .prospec.yaml');
    expect(base).toContain('`{base_dir}/specs` and `{base_dir}/ai-knowledge` must be ordinary directories');
    expect(base).toMatch(/not symlinks/);
    expect(knowledge).toContain('no longer configurable');
    expect(knowledge).toContain('always `{base_dir}/ai-knowledge`');
  });

  it('documents every top-level schema field (drift guard: a new field un-added turns this red)', async () => {
    const { content } = await execute();
    const obj = parse(content) as Record<string, unknown>;
    // Derived from the schema shape — the single source. Add a top-level field to
    // ProspecConfigSchema without adding it to the example and this assertion fails.
    for (const key of Object.keys(ProspecConfigSchema.shape)) {
      expect(obj).toHaveProperty(key);
    }
  });

  it('documents every nested schema field (derived from nested shapes — a nested addition turns this red)', async () => {
    const { content } = await execute();
    const obj = parse(content) as Record<string, Record<string, unknown> | undefined>;
    const top = ProspecConfigSchema.shape;
    const knowledgeShape = top.knowledge.unwrap().shape;
    // Each entry derives its expected key set from the nested schema's own shape,
    // so adding a field to any nested object without documenting it fails here.
    const nested: Array<[string, Record<string, unknown>, Record<string, unknown> | undefined]> = [
      ['project', top.project.shape, obj.project],
      ['tech_stack', top.tech_stack.unwrap().shape, obj.tech_stack],
      ['paths', top.paths.unwrap().shape, obj.paths],
      ['test_evidence', top.test_evidence.unwrap().shape, obj.test_evidence],
      ['knowledge', knowledgeShape, obj.knowledge],
      [
        'knowledge.token_budget',
        knowledgeShape.token_budget.unwrap().shape,
        obj.knowledge?.token_budget as Record<string, unknown> | undefined,
      ],
      ['workflow', top.workflow.unwrap().shape, obj.workflow],
    ];
    for (const [label, shape, value] of nested) {
      for (const key of Object.keys(shape)) {
        expect(value ?? {}, `${label}.${key} missing from config example`).toHaveProperty(key);
      }
    }
  });

  it('names neither shipped budget — they are not per-project settings — but explains where they come from', async () => {
    const { content } = await execute();
    const obj = parse(content) as { knowledge?: { token_budget?: Record<string, unknown> } };
    expect(obj.knowledge?.token_budget).not.toHaveProperty('skill_per_file');
    expect(obj.knowledge?.token_budget).not.toHaveProperty('reference_per_file');
    // The explanation must not smuggle the key names back in as prose (a grep for
    // the keys must stay at zero hits), so it is pinned by its own wording.
    expect(content).toMatch(/skill and reference budgets ship with the prospec version/);
    expect(content).not.toMatch(/skill_per_file|reference_per_file/);
  });

  it('carries no removed dead field (schema is closed on those)', async () => {
    const { content } = await execute();
    const obj = parse(content) as Record<string, Record<string, unknown>>;
    const project = obj.project ?? {};
    const knowledge = obj.knowledge ?? {};
    expect(project).not.toHaveProperty('version');
    expect(knowledge).not.toHaveProperty('files');
  });
});
