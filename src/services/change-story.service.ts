import * as fs from 'node:fs';
import * as path from 'node:path';
import { AlreadyExistsError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { ensureDir, atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import {
  assertValidChangeMetadata,
  normalizeIssueRef,
  writeChangeMetadataObject,
} from '../lib/change-metadata.js';
import { stripCellEmphasis } from '../lib/knowledge-reader.js';
import type { ChangeScale, NewChangeMetadata } from '../types/change.js';
import { INDEX_COLUMN, INDEX_TABLE_COLUMNS } from '../types/knowledge.js';

export interface ChangeStoryOptions {
  name: string;
  description?: string;
  /** Explicit related modules — overrides keyword auto-matching (e.g. the
   *  promote-backfill path, whose modules come from traced file:line, not the
   *  change name). An empty array is an answer, not an absence: it suppresses
   *  the keyword fallback. Omit the key to ask for keyword matching. */
  relatedModules?: string[];
  /** Escaped-defect registration for bug-fix changes: the change that missed
   *  the defect (see _status-lifecycle.md). */
  introducedBy?: string;
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
}

/**
 * Execute the change story workflow:
 *
 * 1. Read config to validate project is initialized
 * 2. Validate change directory does not exist → AlreadyExistsError
 * 3. Match related modules from index.md keywords
 * 4. Render proposal.md and metadata.yaml templates
 * 5. Validate the metadata, THEN write both artifacts to .prospec/changes/{name}/
 *    — the directory included, so a validation failure leaves nothing behind
 *    (skipped entirely under `dryRun`, which still runs every check, so a
 *    caller previewing a create sees exactly the failures a real run would)
 */
export async function execute(options: ChangeStoryOptions): Promise<ChangeStoryResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = options.name;

  // 1. Read config (throws ConfigNotFound if not initialized)
  const config = await readConfig(cwd);

  // 2. Validate change directory does not exist
  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  if (fs.existsSync(changeDir)) {
    throw new AlreadyExistsError(`.prospec/changes/${changeName}`);
  }

  // 3. Explicit modules win over keyword auto-matching from index.md.
  // Keyed on the KEY's presence, not on the array being non-empty: a caller
  // that resolved the modules itself and found none is stating a fact, and
  // falling back to keyword guessing there attaches modules it just ruled out.
  const baseDir = resolveBasePaths(config, cwd).baseDir;
  const relatedModules =
    options.relatedModules !== undefined
      ? options.relatedModules.map((name) => ({
          name,
          description:
            matchRelatedModules(name, baseDir).find((m) => m.name === name)?.description ?? '',
        }))
      : matchRelatedModules(changeName, baseDir);

  // 5. Write artifacts — proposal.md renders from its Markdown template;
  // metadata.yaml is pure data, serialized with the yaml library (the same
  // path change-plan/change-tasks/archive already use to update it), so any
  // user-provided text is escaped correctly by construction.
  const proposalContext = {
    change_name: changeName,
    description: options.description,
    related_modules: relatedModules.length > 0 ? relatedModules : undefined,
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
    name: changeName,
    created_at: new Date().toISOString(),
    status: 'story',
    ...(options.scale ? ({ scale: options.scale } satisfies Partial<NewChangeMetadata>) : {}),
    ...(relatedModules.length > 0
      ? ({ related_modules: relatedModules.map((m) => m.name) } satisfies Partial<NewChangeMetadata>)
      : {}),
    ...(options.description
      ? ({ description: options.description } satisfies Partial<NewChangeMetadata>)
      : {}),
    ...(options.introducedBy
      ? ({ introduced_by: options.introducedBy } satisfies Partial<NewChangeMetadata>)
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
  };
}

/**
 * Match related modules by comparing change name keywords against index.md.
 *
 * Reads the index.md Markdown table and matches keywords from module entries
 * against words extracted from the kebab-case change name.
 */
function matchRelatedModules(
  changeName: string,
  baseDir: string,
): RelatedModule[] {
  const indexPath = path.join(baseDir, 'index.md');

  let indexContent: string;
  try {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  } catch {
    // No index.md — return empty (not an error, just no modules to match)
    return [];
  }

  // Extract words from kebab-case change name
  const changeWords = changeName
    .toLowerCase()
    .split('-')
    .filter((w) => w.length > 1);

  if (changeWords.length === 0) return [];

  // Parse index.md table rows against the canonical column schema
  // (types/knowledge.ts): | Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
  const lines = indexContent.split('\n');
  const modules: RelatedModule[] = [];

  for (const line of lines) {
    if (!line.startsWith('|')) continue;

    // Position-stable cells: drop only the boundary empties from the surrounding
    // pipes; keep empty middle cells so column indices stay aligned. Rows with
    // fewer columns than the canonical schema (e.g. the Loading Rules table) are
    // not module rows — skip them.
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());

    // Skip header/separator rows by their ROW ROLE, not a whole-line substring:
    // the separator row is all dash/colon cells; the header row's first cell is
    // the literal 'Module' label. A data row whose Description contains '---'
    // must NOT be mistaken for a separator (it was, under the old includes check).
    if (cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (cells[INDEX_COLUMN.MODULE]?.toLowerCase() === 'module') continue;

    if (cells.length < INDEX_TABLE_COLUMNS.length) continue;

    // The Module cell is rendered bold (`**types**`); the module NAME is the
    // undecorated text. Forwarding the cell verbatim writes a name no consumer
    // can resolve to a directory, and proposal.md.hbs bolds it a second time.
    const moduleName = stripCellEmphasis(cells[INDEX_COLUMN.MODULE] ?? '');
    if (!moduleName) continue;
    const keywordsCell = cells[INDEX_COLUMN.KEYWORDS];
    if (!keywordsCell) continue;
    // Drop empty keywords from stray/double commas — an empty keyword makes
    // `word.includes(keyword)` true for every change, matching every module.
    const keywords = keywordsCell
      .toLowerCase()
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const description = cells[INDEX_COLUMN.DESCRIPTION] ?? '';

    // Check if any change word matches any module keyword
    const isMatch = changeWords.some((word) =>
      keywords.some((keyword) => keyword.includes(word) || word.includes(keyword)),
    );

    if (isMatch) {
      modules.push({ name: moduleName, description });
    }
  }

  return modules;
}
