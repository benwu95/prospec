import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../lib/change-metadata.js';
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

/**
 * `prospec change related-modules <module...>` — replace an existing change's
 * `related_modules`, the one field `prospec change story` otherwise writes only
 * at creation. Names are judged by the module map the knowledge-sync gate
 * reads, and a registered module can never be removed: the gate checks every
 * `related_modules` name, so dropping one would let this command narrow it.
 * Every refusal happens before the write, leaving the file byte-identical.
 */
export async function execute(options: ChangeRelatedModulesOptions): Promise<ChangeRelatedModulesResult> {
  if (options.modules.length === 0) {
    throw new PrerequisiteError(
      'no module named',
      'Pass every module the change affects: `prospec change related-modules <module...>`',
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
  const kept = new Set(modules.map((m) => m.toLowerCase()));
  const dropped = from.filter((m) => known.has(m.toLowerCase()) && !kept.has(m.toLowerCase()));
  if (dropped.length > 0) {
    throw new PrerequisiteError(
      `removing a registered module would narrow the knowledge-sync gate: ${dropped.join(', ')}`,
      `Keep ${dropped.join(', ')} in the list; only a name module-map.yaml does not register may be dropped`,
    );
  }

  if (from.length === modules.length && from.every((m, i) => m === modules[i])) {
    return { changeName, from, modules, changed: false };
  }
  doc.set('related_modules', modules);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);
  return { changeName, from, modules, changed: true };
}
