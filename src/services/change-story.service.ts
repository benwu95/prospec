import * as fs from 'node:fs';
import * as path from 'node:path';
import { AlreadyExistsError, PrerequisiteError } from '../types/errors.js';
import type { AbandonedAttempt } from '../types/abandon.js';
import { matchingAbandoned, readAbandonHistory } from '../lib/abandon-history.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { ensureDir, atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import {
  assertValidChangeMetadata,
  normalizeIssueRef,
  writeChangeMetadataObject,
} from '../lib/change-metadata.js';
import { readIndex, parseIndexModules } from '../lib/knowledge-reader.js';
import type { ChangeScale, NewChangeMetadata } from '../types/change.js';

export interface ChangeStoryOptions {
  name: string;
  description?: string;
  /** Caller-declared scope. Empty explicitly declares no related modules;
   *  omission is refused because scope has not been determined. */
  relatedModules?: string[];
  /** External-tracker registration: the issue this change belongs to. Free-form
   *  (`#131`, a URL, another tracker's id) and never validated. */
  issue?: string;
  /** Pre-rendered proposal body. The auto-draft path supplies a drift-derived
   *  one; absent renders the standard `change/proposal.md.hbs` template. */
  proposalBody?: string;
  /** Pre-assigned scale. The auto-draft path knows the scale from the drift
   *  check that triggered it; absent leaves the key out for `change scale`. */
  scale?: ChangeScale;
  /** Resolve and validate everything — including the AlreadyExistsError
   *  collision check — but write nothing. */
  dryRun?: boolean;
  cwd?: string;
}

export interface RelatedModule {
  name: string;
  description: string;
}

export interface ChangeStoryResult {
  changeName: string;
  changeDir: string;
  /** The change's artifacts — under `dryRun`, the ones that WOULD be written.
   *  Read it together with `dryRun`; on its own it does not claim they exist. */
  createdFiles: string[];
  /** Whether this run only resolved and validated, writing nothing. */
  dryRun: boolean;
  relatedModules: RelatedModule[];
  description?: string;
  priorAttempts?: AbandonedAttempt[];
}

/**
 * Execute the change story workflow:
 *
 * 1. Read config to validate project is initialized
 * 2. Validate change directory does not exist → AlreadyExistsError
 * 3. Resolve descriptions for the explicitly declared modules
 * 4. Render proposal.md and metadata.yaml templates
 * 5. Validate the metadata, THEN write both artifacts to .prospec/changes/{name}/
 *    — the directory included, so a validation failure leaves nothing behind
 *    (skipped entirely under `dryRun`, which still runs every check, so a
 *    caller previewing a create sees exactly the failures a real run would)
 */
export async function execute(options: ChangeStoryOptions): Promise<ChangeStoryResult> {
  if (!Array.isArray(options.relatedModules)) {
    throw new PrerequisiteError(
      'Related module scope is unspecified or not an array',
      'Determine the complete scope and pass --related-module <name> for each module, or --no-related-modules for an explicitly empty scope',
    );
  }
  const cwd = options.cwd ?? process.cwd();
  const changeName = options.name;

  // 1. Read config (throws ConfigNotFound if not initialized)
  const config = await readConfig(cwd);

  // 2. Validate change directory does not exist
  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  if (fs.existsSync(changeDir)) {
    throw new AlreadyExistsError(`.prospec/changes/${changeName}`);
  }
  const history = readAbandonHistory(cwd);
  if (history.errors.length > 0) {
    throw new PrerequisiteError(`Cannot resolve abandoned history: ${history.errors.map((entry) => `${entry.name}: ${entry.error}`).join('; ')}`,
      'Inspect incomplete or unreadable archive entries before creating another attempt');
  }
  const priorAttempts = matchingAbandoned(history, options.issue);

  const baseDir = resolveBasePaths(config, cwd).baseDir;
  const index = readIndex(baseDir);
  const indexedModules = index === null ? [] : parseIndexModules(index);
  const relatedModules = options.relatedModules.map((name) => ({
    name,
    description: indexedModules.find((module) => module.name === name)?.description ?? '',
  }));

  // 5. Write artifacts — proposal.md renders from its Markdown template;
  // metadata.yaml is pure data, serialized with the yaml library (the same
  // path change-plan/change-tasks/archive already use to update it), so any
  // user-provided text is escaped correctly by construction.
  const proposalContext = {
    change_name: changeName,
    description: options.description,
    related_modules: relatedModules.length > 0 ? relatedModules : undefined,
    prior_attempts: priorAttempts,
  };

  const createdFiles: string[] = [];

  // metadata.yaml — BUILT and VALIDATED before anything is written. The write
  // helper validates too, but by then proposal.md is on disk: a metadata value
  // the schema refuses (a module name carrying markdown emphasis, say) would
  // leave a directory holding half a change, which the scan reports as an error
  // and the idempotency guard then refuses to re-draft. Validating up front
  // makes the whole scaffold all-or-nothing, and makes `dryRun` a real preview
  // rather than one that skips the only check that can fail.
  // The conditional spreads keep an absent key OUT of the YAML entirely (writing
  // `description: undefined` would serialize a null). `satisfies` restores the
  // excess-property check on each spread body — TypeScript does not apply it to
  // spread members, so without this a typo'd optional key would compile, pass the
  // loose read-side schema, and reach disk under the wrong name.
  const issue = normalizeIssueRef(options.issue);
  const metadata: NewChangeMetadata = {
    premise_version: 1,
    retry_of: priorAttempts.map(({ archive, digest }) => ({ archive, digest })),
    name: changeName,
    created_at: new Date().toISOString(),
    status: 'story',
    acceptance: {
      version: 1,
      revisions: [],
    },
    ...(options.scale ? ({ scale: options.scale } satisfies Partial<NewChangeMetadata>) : {}),
    related_modules: relatedModules.map((m) => m.name),
    ...(options.description
      ? ({ description: options.description } satisfies Partial<NewChangeMetadata>)
      : {}),
    // Absent/blank/multi-line semantics live in `normalizeIssueRef`, not here —
    // the status service and the archive summary read through the same helper.
    ...(issue !== undefined ? ({ issue } satisfies Partial<NewChangeMetadata>) : {}),
  };
  assertValidChangeMetadata(metadata, changeName);

  // proposal.md
  const proposalContent =
    options.proposalBody ?? renderTemplate('change/proposal.md.hbs', proposalContext);
  const proposalPath = path.join(changeDir, 'proposal.md');
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  if (!options.dryRun) {
    // The directory counts as a write: creating it before the validation above
    // left an empty husk when validation then threw, which the existence check
    // reports as "already exists" on every later attempt.
    //
    // Each write below is atomic on its own; the SEQUENCE is not. An ENOSPC or
    // EACCES between the proposal and the metadata would leave a directory the
    // collision check reports as "already exists" — by presence alone, never by
    // contents — so the change could never be repaired or re-drafted, and one
    // such husk is enough to silence `prospec status`'s drift signal for the
    // whole project. Unwinding restores the only state that is recoverable.
    await ensureDir(changeDir);
    try {
      await atomicWrite(proposalPath, proposalContent);
      await writeChangeMetadataObject(metadataPath, metadata);
    } catch (err) {
      await fs.promises.rm(changeDir, { recursive: true, force: true }).catch(() => {
        // The original failure is the one worth reporting; a cleanup that also
        // fails must not mask it.
      });
      throw err;
    }
  }
  createdFiles.push(
    `.prospec/changes/${changeName}/proposal.md`,
    `.prospec/changes/${changeName}/metadata.yaml`,
  );

  return {
    changeName,
    changeDir,
    createdFiles,
    relatedModules,
    dryRun: options.dryRun ?? false,
    description: options.description,
    priorAttempts,
  };
}
