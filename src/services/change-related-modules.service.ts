import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
import { captureFileInputs } from '../lib/fs-utils.js';
import { readKnownModules } from '../lib/knowledge-sync.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeRelatedModulesOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The complete new list — every module the change affects. */
  modules: string[];
}

export interface ChangeRelatedModulesResult {
  changeName: string;
  from: string[];
  modules: string[];
  changed: boolean;
}

/** Replace the complete declared scope, preserving every other metadata field. */
export async function execute(options: ChangeRelatedModulesOptions): Promise<ChangeRelatedModulesResult> {
  if (!Array.isArray(options.modules)) {
    throw new PrerequisiteError(
      'Related module scope is unspecified or not an array',
      'Pass the complete list with `prospec change related-modules <module...>`, or --no-related-modules for an explicitly empty scope',
    );
  }
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change should the related modules be written to?',
  );
  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const inputs = captureFileInputs({ metadata: metadataPath });
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);

  const { knowledgePath } = resolveBasePaths(await readConfig(cwd), cwd);
  const { known, unreadable } = readKnownModules(knowledgePath, cwd);
  if (unreadable) {
    throw new PrerequisiteError(
      `${unreadable.cause} — no module name can be checked against it`,
      `${unreadable.remedy}, then re-run the command`,
    );
  }
  const unknown = options.modules.filter((m) => !known.has(m.toLowerCase()));
  if (unknown.length > 0) {
    throw new PrerequisiteError(
      `not a registered module: ${unknown.join(', ')}`,
      'Name modules that module-map.yaml registers; register a new module there first',
    );
  }

  const modules = [...new Set(options.modules.map((m) => known.get(m.toLowerCase())!))];
  const from = metadata.related_modules ?? [];

  if (doc.has('related_modules') && from.length === modules.length && from.every((m, i) => m === modules[i])) {
    return { changeName, from, modules, changed: false };
  }
  doc.set('related_modules', modules);
  if (!inputs.recheck()) {
    throw new PrerequisiteError(
      'Change metadata changed while determining related modules',
      'Review the current metadata and retry the complete scope declaration',
    );
  }
  await writeChangeMetadataDoc(metadataPath, doc, changeName);
  return { changeName, from, modules, changed: true };
}
