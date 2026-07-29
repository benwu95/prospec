import * as fs from 'node:fs';
import * as path from 'node:path';
import { readChangeMetadata } from '../lib/change-metadata.js';
import { readFileIfExists } from '../lib/fs-utils.js';
import { routeChange } from '../lib/status-router.js';
import { parseTaskLine } from '../lib/task-markers.js';
import type { VerifyGrade } from '../types/change.js';
import type {
  ChangeRoute,
  ChangeRouteError,
  ChangeRouteFacts,
  StatusReport,
  UiScope,
} from '../types/status.js';

/**
 * `prospec status` — deterministic SDD routing over `.prospec/changes/`.
 *
 * Read-only: scans every change directory, gathers the facts the pure router
 * (`lib/status-router.ts`) consumes, and reports each in-flight change's
 * current node, next station, blocking gates and reasons. Archived changes
 * are excluded (not in flight).
 *
 * Scanner tolerance (drift-sources precedent): a malformed record is reported
 * as a named error entry and never aborts the scan — but unlike the lenient
 * drift collectors, the metadata read itself goes through the canonical
 * schema-enforced `readChangeMetadata`, converting its throw per change.
 */

export interface StatusOptions {
  cwd?: string;
}

export async function execute(options: StatusOptions = {}): Promise<StatusReport> {
  const cwd = options.cwd ?? process.cwd();
  const changesDir = path.resolve(cwd, '.prospec/changes');

  const changes: ChangeRoute[] = [];
  const errors: ChangeRouteError[] = [];

  if (fs.existsSync(changesDir)) {
    const dirs = fs
      .readdirSync(changesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const name of dirs) {
      const changeDir = path.join(changesDir, name);
      const metadataPath = path.join(changeDir, 'metadata.yaml');
      if (!fs.existsSync(metadataPath)) {
        errors.push({ name, error: 'metadata.yaml missing' });
        continue;
      }
      try {
        const { metadata } = readChangeMetadata(metadataPath, name);
        if (metadata.status === 'archived') continue;
        changes.push(routeChange(await collectFacts(changeDir, name, metadata)));
      } catch (err) {
        errors.push({ name, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return { clean: changes.length === 0 && errors.length === 0, changes, errors };
}

/** Gather the on-disk facts one change's routing depends on. */
async function collectFacts(
  changeDir: string,
  name: string,
  metadata: ReturnType<typeof readChangeMetadata>['metadata'],
): Promise<ChangeRouteFacts> {
  const tasksText = await readFileIfExists(path.join(changeDir, 'tasks.md'));
  const codeTasks = tasksText
    .split('\n')
    .map(parseTaskLine)
    .filter((t): t is NonNullable<typeof t> => t !== null && t.kind === 'code');

  return {
    name,
    status: metadata.status,
    scale: metadata.scale ?? 'standard',
    hasTasks: fs.existsSync(path.join(changeDir, 'tasks.md')),
    hasDesignSpec: fs.existsSync(path.join(changeDir, 'design-spec.md')),
    uiScope: parseUiScope(await readFileIfExists(path.join(changeDir, 'proposal.md'))),
    codeTasksTotal: codeTasks.length,
    codeTasksDone: codeTasks.filter((t) => t.checked).length,
    hasReviewProvenance: metadata.review_provenance !== undefined,
    lastVerifyGrade: lastVerifyGrade(metadata.quality_log),
  };
}

/**
 * Extract the `**Scope:**` value under proposal.md's `## UI Scope` heading.
 * Absent section (or no recognizable value) → null: for deterministic routing
 * only an explicit full/partial engages the design station — the design
 * skill's "assume full and confirm" fallback is interactive, not a routing
 * fact.
 */
function parseUiScope(proposalText: string): UiScope | null {
  const heading = /^##\s+UI Scope\s*$/m.exec(proposalText);
  if (!heading) return null;
  const section = proposalText.slice(heading.index + heading[0].length);
  const nextHeading = /^##\s+/m.exec(section);
  const body = nextHeading ? section.slice(0, nextHeading.index) : section;
  // End-anchored: the proposal-format placeholder line `**Scope:** full |
  // partial | none` must not parse as a chosen `full`.
  const value = /^\*\*Scope:\*\*\s*(full|partial|none)\s*$/im.exec(body)?.[1];
  return value === undefined ? null : (value.toLowerCase() as UiScope);
}

/** Latest recorded `prospec-verify` grade, null when none. */
function lastVerifyGrade(
  qualityLog: Array<{ skill: string; grade?: VerifyGrade }> | undefined,
): VerifyGrade | null {
  if (qualityLog === undefined) return null;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry !== undefined && entry.skill === 'prospec-verify' && entry.grade !== undefined) {
      return entry.grade;
    }
  }
  return null;
}
