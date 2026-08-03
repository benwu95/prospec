import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { forbiddenArtifacts, isStatusBefore } from '../types/change.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeTasksOptions {
  change?: string;
  quiet?: boolean;
  /** Overwrite an existing tasks.md instead of refusing. */
  force?: boolean;
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
 * 2. Read metadata and apply the scale's forbidden-artifact contract
 * 3. Validate the plan.md prerequisite (skipped when the scale forbids a plan)
 * 4. Render tasks.md template
 * 5. Update metadata.yaml status to 'tasks'
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

  // 3. Read metadata ONCE — validated at the boundary, and the Document keeps
  // comments/field order intact for the status write below. It comes first
  // because the scale it carries decides which prerequisites even apply.
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  const meta = fs.existsSync(metadataPath)
    ? readChangeMetadata(metadataPath, changeName)
    : null;
  const relatedModules = meta?.metadata.related_modules ?? [];
  const forbidden = forbiddenArtifacts(meta?.metadata.scale);

  // 3a. A scale whose contract has no task list closes this station outright.
  if (forbidden.includes('tasks.md')) {
    throw new PrerequisiteError(
      `tasks.md must not exist under \`scale: ${meta?.metadata.scale}\` — it records existing code, so there is no work to schedule`,
      'Formalize the change with `/prospec-promote-backfill`, which enters the lifecycle at `implemented`',
    );
  }

  // 3b. Validate the input artifact this scale decomposes FROM. Normally plan.md;
  // when the scale's contract forbids a plan, proposal.md is the source (the
  // `story → tasks` quick path) — the station keeps a prerequisite either way, or
  // skipping the plan check would leave it with none at all.
  const planPath = path.join(changeDir, 'plan.md');
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (forbidden.includes('plan.md')) {
    if (!fs.existsSync(proposalPath)) {
      throw new PrerequisiteError(
        `proposal.md does not exist in .prospec/changes/${changeName}/`,
        'Run `prospec change story` first — with no plan by contract, tasks are decomposed from proposal.md',
      );
    }
  } else if (!fs.existsSync(planPath)) {
    throw new PrerequisiteError(
      `plan.md does not exist in .prospec/changes/${changeName}/`,
      'Run `prospec change plan` first to generate an implementation plan',
    );
  }

  // 3c. Refuse to clobber an existing tasks.md (which may carry progress edits)
  // unless --force — re-running the scaffold otherwise silently overwrites it.
  const tasksPath = path.join(changeDir, 'tasks.md');
  if (!options.force && fs.existsSync(tasksPath)) {
    throw new PrerequisiteError(
      `tasks.md already exists in .prospec/changes/${changeName}/`,
      'Re-run with --force to regenerate and overwrite the existing task list',
    );
  }

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
  await atomicWrite(tasksPath, tasksContent);
  createdFiles.push(`.prospec/changes/${changeName}/tasks.md`);

  // 7. Advance status to 'tasks' forward-only, preserving metadata comments.
  if (meta && isStatusBefore(meta.metadata.status, 'tasks')) {
    meta.doc.set('status', 'tasks');
    await writeChangeMetadataDoc(metadataPath, meta.doc, changeName);
  }

  return {
    changeName,
    changeDir,
    createdFiles,
    relatedModules,
  };
}
