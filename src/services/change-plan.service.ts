import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { isStatusBefore } from '../types/change.js';
import { resolveChange } from './change-resolver.js';

export interface ChangePlanOptions {
  change?: string;
  quiet?: boolean;
  /** Overwrite existing plan.md/delta-spec.md instead of refusing. */
  force?: boolean;
  cwd?: string;
}

export interface ChangePlanResult {
  changeName: string;
  changeDir: string;
  createdFiles: string[];
  relatedModules: string[];
}

/**
 * Execute the change plan workflow:
 *
 * 1. Resolve which change to work on (auto-detect / prompt / --change)
 * 2. Read proposal.md to validate prerequisite
 * 3. Render plan.md and delta-spec.md templates
 * 4. Update metadata.yaml status to 'plan'
 */
export async function execute(options: ChangePlanOptions): Promise<ChangePlanResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Read config (validates .prospec.yaml exists)
  await readConfig(cwd);

  // 2. Resolve change name
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Select the change to generate a plan for:',
  );

  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);

  // 3. Validate proposal.md exists (prerequisite for plan)
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (!fs.existsSync(proposalPath)) {
    throw new PrerequisiteError(
      `proposal.md does not exist in .prospec/changes/${changeName}/`,
      'Run `prospec change story` first to create a change request',
    );
  }

  // 3b. Refuse to clobber existing plan artifacts (which may carry hand/AI edits)
  // unless --force. Re-running the scaffold otherwise silently overwrites them.
  const planPath = path.join(changeDir, 'plan.md');
  const deltaSpecPath = path.join(changeDir, 'delta-spec.md');
  if (!options.force && (fs.existsSync(planPath) || fs.existsSync(deltaSpecPath))) {
    throw new PrerequisiteError(
      `plan.md/delta-spec.md already exist in .prospec/changes/${changeName}/`,
      'Re-run with --force to regenerate and overwrite the existing plan',
    );
  }

  // 4. Read metadata ONCE — validated at the boundary, and the Document keeps
  // comments/field order intact for the status write below.
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  const meta = fs.existsSync(metadataPath)
    ? readChangeMetadata(metadataPath, changeName)
    : null;
  const relatedModules = meta?.metadata.related_modules ?? [];

  // 5. Build template context
  const templateContext = {
    change_name: changeName,
    related_modules: relatedModules.length > 0
      ? relatedModules.map((name) => ({ name }))
      : undefined,
  };

  const createdFiles: string[] = [];

  // 6. Render plan.md
  const planContent = renderTemplate('change/plan.md.hbs', templateContext);
  await atomicWrite(planPath, planContent);
  createdFiles.push(`.prospec/changes/${changeName}/plan.md`);

  // 7. Render delta-spec.md
  const deltaSpecContent = renderTemplate('change/delta-spec.md.hbs', templateContext);
  await atomicWrite(deltaSpecPath, deltaSpecContent);
  createdFiles.push(`.prospec/changes/${changeName}/delta-spec.md`);

  // 8. Advance status to 'plan' forward-only, preserving metadata comments.
  // A --force regenerate on an already-advanced change must not regress status.
  if (meta && isStatusBefore(meta.metadata.status, 'plan')) {
    meta.doc.set('status', 'plan');
    await writeChangeMetadataDoc(metadataPath, meta.doc, changeName);
  }

  return {
    changeName,
    changeDir,
    createdFiles,
    relatedModules,
  };
}
