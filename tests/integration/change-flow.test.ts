/**
 * Integration test: change management flow.
 *
 * Tests the complete change flow: story → plan → tasks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute as storyExecute } from '../../src/services/change-story.service.js';
import { execute as acceptanceExecute } from '../../src/services/change-acceptance.service.js';
import { execute as planExecute } from '../../src/services/change-plan.service.js';
import { execute as tasksExecute } from '../../src/services/change-tasks.service.js';
import { execute as scaleExecute } from '../../src/services/change-scale.service.js';
import { PrerequisiteError } from '../../src/types/errors.js';
import { ChangeMetadataSchema } from '../../src/types/change.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../src/lib/template.js', () => ({
  renderTemplate: vi.fn().mockImplementation((templateName: string) => {
    if (templateName.includes('metadata')) {
      return 'name: test\nstatus: story\ncreated_at: "2026-01-01T00:00:00.000Z"\nrelated_modules: []\ndescription: Test\n';
    }
    if (templateName.includes('proposal')) {
      return '# Proposal\n\n## User Story\n\n### US-1: Developer Story [P1]\n\n**Acceptance Scenarios:**\n- WHEN action occurs THEN result is expected\n';
    }
    if (templateName.includes('plan.md')) {
      return '# Plan\n\n## Implementation Steps\n';
    }
    if (templateName.includes('delta-spec')) {
      return '# Delta Spec\n\n## ADDED\n';
    }
    if (templateName.includes('tasks.md')) {
      return '# Tasks\n\n- [ ] T1 First task\n';
    }
    return '# Template Content\n';
  }),
  registerPartial: vi.fn(),
  registerPartialFromFile: vi.fn(),
  registerHelper: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}));

beforeEach(() => {
  vol.reset();
});

describe('Change Management Flow Integration', () => {
  it('should complete the full story → plan → tasks workflow', async () => {
    // Setup: create .prospec.yaml
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    // Step 1: Create story
    const storyResult = await storyExecute({
      name: 'add-feature',
      description: 'A new feature',
      cwd: '/project',
    });
    expect(storyResult.changeName).toBe('add-feature');
    expect(fs.existsSync('/project/.prospec/changes/add-feature/proposal.md')).toBe(true);
    expect(fs.existsSync('/project/.prospec/changes/add-feature/metadata.yaml')).toBe(true);

    // Freeze scenarios at story completion
    await acceptanceExecute({
      change: 'add-feature',
      cwd: '/project',
      mode: 'freeze',
    });

    // Step 2: Create plan
    const planResult = await planExecute({
      change: 'add-feature',
      cwd: '/project',
    });
    expect(planResult.changeName).toBe('add-feature');
    expect(fs.existsSync('/project/.prospec/changes/add-feature/plan.md')).toBe(true);
    expect(fs.existsSync('/project/.prospec/changes/add-feature/delta-spec.md')).toBe(true);

    // Verify metadata status updated to 'plan'
    const metadataAfterPlan = fs.readFileSync(
      '/project/.prospec/changes/add-feature/metadata.yaml',
      'utf-8',
    );
    expect(metadataAfterPlan).toContain('status: plan');

    // Step 3: Create tasks
    const tasksResult = await tasksExecute({
      change: 'add-feature',
      cwd: '/project',
    });
    expect(tasksResult.changeName).toBe('add-feature');
    expect(fs.existsSync('/project/.prospec/changes/add-feature/tasks.md')).toBe(true);

    // Verify metadata status updated to 'tasks'
    const metadataAfterTasks = fs.readFileSync(
      '/project/.prospec/changes/add-feature/metadata.yaml',
      'utf-8',
    );
    expect(metadataAfterTasks).toContain('status: tasks');
  });

  it('leaves metadata schema-valid after every station writes it', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/prospec/index.md': `# Module Index

| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
|--------|----------|---------|--------|-------------|-----------|------------|
| **lib** | lib, feature | 工具 | Active | Shared utilities | foundation | |
`,
    });
    const metadataPath = '/project/.prospec/changes/add-feature/metadata.yaml';
    const parseMetadata = () =>
      ChangeMetadataSchema.safeParse(
        parseYaml(fs.readFileSync(metadataPath, 'utf-8') as string, metadataPath),
      );

    await storyExecute({ name: 'add-feature', description: 'A new feature', cwd: '/project' });
    const afterStory = parseMetadata();
    expect(afterStory.success).toBe(true);
    // The bold Module cell must not reach metadata as part of the name.
    if (afterStory.success) expect(afterStory.data.related_modules).toEqual(['lib']);

    await acceptanceExecute({ change: 'add-feature', cwd: '/project', mode: 'freeze' });
    const afterFreeze = parseMetadata();
    expect(afterFreeze.success).toBe(true);
    if (afterFreeze.success) expect(afterFreeze.data.acceptance?.current_revision).toBe(1);

    await planExecute({ change: 'add-feature', cwd: '/project' });
    const afterPlan = parseMetadata();
    expect(afterPlan.success).toBe(true);
    if (afterPlan.success) expect(afterPlan.data.status).toBe('plan');

    await tasksExecute({ change: 'add-feature', cwd: '/project' });
    const afterTasks = parseMetadata();
    expect(afterTasks.success).toBe(true);
    if (afterTasks.success) expect(afterTasks.data.status).toBe('tasks');
  });

  it('should not allow plan without story', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });
    // Create change dir but no proposal.md
    vol.mkdirSync('/project/.prospec/changes/no-story', { recursive: true });

    await expect(
      planExecute({ change: 'no-story', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
  });

  it('should not allow tasks without plan', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    // Create story first
    await storyExecute({
      name: 'partial-flow',
      cwd: '/project',
    });

    // Try tasks without plan
    await expect(
      tasksExecute({ change: 'partial-flow', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
  });

  // REQ-TESTS-072 / SC-001: the quick path has a legal CLI route end to end.
  it('should complete the new quick story → scale → freeze → tasks workflow without plan artifacts', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await storyExecute({ name: 'quick-flow', cwd: '/project', description: 'quick' });
    await scaleExecute({ change: 'quick-flow', cwd: '/project', scale: 'quick' });
    await acceptanceExecute({ change: 'quick-flow', cwd: '/project', mode: 'freeze' });

    const result = await tasksExecute({ change: 'quick-flow', cwd: '/project' });

    expect(result.createdFiles).toContain('.prospec/changes/quick-flow/tasks.md');
    expect(fs.existsSync('/project/.prospec/changes/quick-flow/tasks.md')).toBe(true);
    expect(fs.existsSync('/project/.prospec/changes/quick-flow/plan.md')).toBe(false);
    expect(fs.existsSync('/project/.prospec/changes/quick-flow/delta-spec.md')).toBe(false);

    const metadata = ChangeMetadataSchema.parse(
      parseYaml(
        fs.readFileSync('/project/.prospec/changes/quick-flow/metadata.yaml', 'utf-8'),
      ),
    );
    expect(metadata.status).toBe('tasks');
    expect(metadata.scale).toBe('quick');
  });

  it('allows legacy quick change without acceptance block to run tasks directly', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
      '/project/.prospec/changes/legacy-quick/metadata.yaml':
        'name: legacy-quick\nstatus: story\nscale: quick\ncreated_at: "2026-01-01"\n',
      '/project/.prospec/changes/legacy-quick/proposal.md':
        '# Proposal: legacy-quick\n\nDescription\n',
    });

    const result = await tasksExecute({ change: 'legacy-quick', cwd: '/project' });
    expect(result.createdFiles).toContain('.prospec/changes/legacy-quick/tasks.md');
    expect(fs.existsSync('/project/.prospec/changes/legacy-quick/tasks.md')).toBe(true);
    const metadata = ChangeMetadataSchema.parse(
      parseYaml(
        fs.readFileSync('/project/.prospec/changes/legacy-quick/metadata.yaml', 'utf-8'),
      ),
    );
    expect(metadata.status).toBe('tasks');
  });

  it('should refuse the plan station once a change is marked quick', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test\n',
    });

    await storyExecute({ name: 'quick-flow', cwd: '/project', description: 'quick' });
    await scaleExecute({ change: 'quick-flow', cwd: '/project', scale: 'quick' });

    await expect(
      planExecute({ change: 'quick-flow', cwd: '/project' }),
    ).rejects.toThrow(PrerequisiteError);
    expect(fs.existsSync('/project/.prospec/changes/quick-flow/plan.md')).toBe(false);
  });
});
