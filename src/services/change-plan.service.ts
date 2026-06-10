import * as fs from 'node:fs';
import * as path from 'node:path';
import { select } from '@inquirer/prompts';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig } from '../lib/config.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { parseYaml, stringifyYaml } from '../lib/yaml-utils.js';
import type { ChangeMetadata } from '../types/change.js';

export interface ChangePlanOptions {
  change?: string;
  quiet?: boolean;
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
  const changeName = await resolveChange(cwd, options.change, options.quiet);

  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);

  // 3. Validate proposal.md exists (prerequisite for plan)
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (!fs.existsSync(proposalPath)) {
    throw new PrerequisiteError(
      `proposal.md does not exist in .prospec/changes/${changeName}/`,
      'Run `prospec change story` first to create a change request',
    );
  }

  // 4. Read metadata for related_modules
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  let relatedModules: string[] = [];
  if (fs.existsSync(metadataPath)) {
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = parseYaml<ChangeMetadata>(metadataContent, metadataPath);
    relatedModules = metadata.related_modules ?? [];
  }

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
  const planPath = path.join(changeDir, 'plan.md');
  await atomicWrite(planPath, planContent);
  createdFiles.push(`.prospec/changes/${changeName}/plan.md`);

  // 7. Render delta-spec.md
  const deltaSpecContent = renderTemplate('change/delta-spec.md.hbs', templateContext);
  const deltaSpecPath = path.join(changeDir, 'delta-spec.md');
  await atomicWrite(deltaSpecPath, deltaSpecContent);
  createdFiles.push(`.prospec/changes/${changeName}/delta-spec.md`);

  // 8. Update metadata.yaml status to 'plan'
  await updateMetadataStatus(metadataPath);

  return {
    changeName,
    changeDir,
    createdFiles,
    relatedModules,
  };
}

/**
 * Resolve which change to work on.
 *
 * Strategy (per contracts/cli-commands.md):
 * 1. If --change is provided → use it directly
 * 2. Scan .prospec/changes/ directory
 * 3. If 1 change → auto-select
 * 4. If multiple → interactive prompt (or error in --quiet mode)
 * 5. If 0 changes → PrerequisiteError
 */
async function resolveChange(
  cwd: string,
  explicitChange: string | undefined,
  quiet: boolean | undefined,
): Promise<string> {
  if (explicitChange) {
    // Validate the specified change exists
    const changeDir = path.join(cwd, '.prospec', 'changes', explicitChange);
    if (!fs.existsSync(changeDir)) {
      throw new PrerequisiteError(
        `Change '${explicitChange}' not found`,
        'Verify the change name is correct, or run `prospec change story` to create a new change',
      );
    }
    return explicitChange;
  }

  const changesDir = path.join(cwd, '.prospec', 'changes');
  if (!fs.existsSync(changesDir)) {
    throw new PrerequisiteError(
      'No changes found',
      'Run `prospec change story <name>` first to create a change request',
    );
  }

  const entries = fs.readdirSync(changesDir, { withFileTypes: true });
  const changeNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (changeNames.length === 0) {
    throw new PrerequisiteError(
      'No changes found',
      'Run `prospec change story <name>` first to create a change request',
    );
  }

  if (changeNames.length === 1) {
    return changeNames[0]!;
  }

  // Multiple changes found
  if (quiet) {
    throw new PrerequisiteError(
      `Multiple changes found: ${changeNames.join(', ')}`,
      'Use `--change <name>` to specify which change to use',
    );
  }

  // Interactive prompt
  const selected = await select({
    message: 'Select the change to generate a plan for:',
    choices: changeNames.map((name) => ({ name, value: name })),
  });

  return selected;
}

/**
 * Update metadata.yaml status to 'plan'.
 * Preserves existing fields and comments where possible.
 */
async function updateMetadataStatus(
  metadataPath: string,
): Promise<void> {
  if (!fs.existsSync(metadataPath)) return;

  const content = fs.readFileSync(metadataPath, 'utf-8');
  const metadata = parseYaml<ChangeMetadata>(content, metadataPath);
  metadata.status = 'plan';
  const updated = stringifyYaml(metadata);
  await atomicWrite(metadataPath, updated);
}
