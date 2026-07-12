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
      ['knowledge', knowledgeShape, obj.knowledge],
      [
        'knowledge.token_budget',
        knowledgeShape.token_budget.unwrap().shape,
        obj.knowledge?.token_budget as Record<string, unknown> | undefined,
      ],
    ];
    for (const [label, shape, value] of nested) {
      for (const key of Object.keys(shape)) {
        expect(value ?? {}, `${label}.${key} missing from config example`).toHaveProperty(key);
      }
    }
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
