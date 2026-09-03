import * as path from 'node:path';
import { EXECUTOR_STATS_REPORT_FILENAME, type ExecutorStatsReport } from '../types/station.js';
import { aggregateExecutorStats } from '../lib/executor-stats.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { readChangeMetadataLeniently } from '../lib/change-metadata.js';
import { listArchivedChangeDirs } from './learn.service.js';

export interface LearnStatsOptions {
  cwd?: string;
  /** Additional archive directories (`--corpus`, repeatable); each must exist. */
  extraCorpusDirs?: string[];
  /** Also write the report to `executor-stats-report.json` under cwd. */
  json?: boolean;
  /** Injected clock for deterministic tests. */
  now?: () => Date;
}

export interface LearnStatsResult {
  report: ExecutorStatsReport;
  /** Set only when `json` was requested. */
  reportPath?: string;
}

/**
 * `prospec learn stats` — per-executor statistics over the archived changes.
 *
 * Read-only apart from the optional `--json` report file: it reads no config and
 * writes no change artifact. Archive metadata is read through the one lenient
 * reader (`readChangeMetadataLeniently`: a missing, unparseable or non-mapping
 * `metadata.yaml` is `null`, here counted as `skipped`, never fatal) and every
 * rule of the aggregation lives in `lib/executor-stats`.
 */
export async function execute(options: LearnStatsOptions = {}): Promise<LearnStatsResult> {
  const cwd = options.cwd ?? process.cwd();
  const archiveDir = path.join(cwd, '.prospec', 'archive');
  const dirs = await listArchivedChangeDirs(archiveDir, options.extraCorpusDirs, cwd);

  const records: unknown[] = [];
  let skipped = 0;
  for (const { dirPath } of dirs) {
    const parsed = readChangeMetadataLeniently(path.join(dirPath, 'metadata.yaml'));
    if (parsed === null) {
      skipped++;
      continue;
    }
    records.push(parsed);
  }

  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const report = aggregateExecutorStats(records, generatedAt, skipped);

  if (!options.json) return { report };
  const reportPath = path.resolve(cwd, EXECUTOR_STATS_REPORT_FILENAME);
  await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}
