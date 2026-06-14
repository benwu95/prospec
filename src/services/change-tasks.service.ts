import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { parseYaml, stringifyYaml } from '../lib/yaml-utils.js';
import type { ChangeMetadata } from '../types/change.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeTasksOptions {
  change?: string;
  quiet?: boolean;
  cwd?: string;
}

export interface ChangeTasksResult {
  changeName: string;
  changeDir: string;
  createdFiles: string[];
  relatedModules: string[];
}

/**
 * Execute the change tasks workflow:
 *
 * 1. Resolve which change to work on (auto-detect / prompt / --change)
 * 2. Read plan.md to validate prerequisite
 * 3. Render tasks.md template
 * 4. Update metadata.yaml status to 'tasks'
 */
export async function execute(options: ChangeTasksOptions): Promise<ChangeTasksResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Read config (validates .prospec.yaml exists)
  await readConfig(cwd);

  // 2. Resolve change name
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Select the change to generate a task list for:',
  );

  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);

  // 3. Validate plan.md exists (prerequisite for tasks)
  const planPath = path.join(changeDir, 'plan.md');
  if (!fs.existsSync(planPath)) {
    throw new PrerequisiteError(
      `plan.md does not exist in .prospec/changes/${changeName}/`,
      'Run `prospec change plan` first to generate an implementation plan',
    );
  }

  // 4. Read metadata ONCE — reused for related_modules and the status update
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  const metadata = fs.existsSync(metadataPath)
    ? parseYaml<ChangeMetadata>(fs.readFileSync(metadataPath, 'utf-8'), metadataPath)
    : null;
  const relatedModules = metadata?.related_modules ?? [];

  // 5. Build template context
  const templateContext = {
    change_name: changeName,
    related_modules: relatedModules.length > 0
      ? relatedModules.map((name) => ({ name }))
      : undefined,
  };

  const createdFiles: string[] = [];

  // 6. Render tasks.md
  const tasksContent = renderTemplate('change/tasks.md.hbs', templateContext);
  const tasksPath = path.join(changeDir, 'tasks.md');
  await atomicWrite(tasksPath, tasksContent);
  createdFiles.push(`.prospec/changes/${changeName}/tasks.md`);

  // 7. Update metadata.yaml status to 'tasks' (write the already-parsed object)
  if (metadata) {
    metadata.status = 'tasks';
    await atomicWrite(metadataPath, stringifyYaml(metadata));
  }

  return {
    changeName,
    changeDir,
    createdFiles,
    relatedModules,
  };
}
