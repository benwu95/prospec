/**
 * Types for the repo-internal factual-count sync tool (`pnpm counts`).
 *
 * Not shipped (scripts/ is excluded from the npm `files` list). Kills the
 * PB-004 `docs/duplicated-count-drift` manual re-derivation by making the
 * counts machine-generated from a single source of truth.
 */

/** How a count's truth is obtained. */
export type CountSource =
  /** Bucketed from a `vitest run` report by `tests/<layer>/` path. */
  | { kind: 'test-suite'; layer: 'total' | 'unit' | 'contract' | 'integration' | 'e2e' | 'files' }
  /** Counted from the filesystem; the truth is keyed by the entry's `key`. */
  | { kind: 'fs-glob'; describe: string };

/** How a number is rendered at a given occurrence. */
export type CountFormat =
  /** `1865` — bare digits. */
  | 'plain'
  /** `1,865` — thousands grouped with ASCII commas (deterministic, no ICU). */
  | 'comma';

/**
 * One whitelisted spot in a doc where a count appears. The `anchor` matches
 * exactly one line and captures ONLY the number (group 1) to rewrite; the rest
 * of the pattern is literal context making the match unique and safe. A spot
 * not listed here is never touched — that is what protects historical prose in
 * `_lessons-ledger.md` / `_archived-history/` / `.prospec/changes/`.
 */
export interface CountOccurrence {
  /** Repo-root-relative doc path. */
  doc: string;
  /** Single-capture-group regex; group 1 is the number span to replace. */
  anchor: RegExp;
  /** Rendering for the replacement number at this spot. */
  format: CountFormat;
}

/** A factual count: its key, how truth is derived, and every spot it appears. */
export interface CountEntry {
  /** Stable key, e.g. `tests.total`, `templates.hbs.references`. */
  key: string;
  source: CountSource;
  occurrences: CountOccurrence[];
}

/** count key → actual number. A key absent here had its source skipped. */
export type TruthMap = Readonly<Record<string, number>>;

/** One number that was (or would be) rewritten. */
export interface CountChange {
  doc: string;
  key: string;
  /** 1-based line number. */
  line: number;
  /** The number as currently written (matched span). */
  from: string;
  /** The number as it should be rendered. */
  to: string;
}

/** A count key whose truth source was unavailable — never written blindly. */
export interface SkippedSource {
  key: string;
  reason: string;
}

/** Result of a sync (write) or `--check` (dry-run) pass. */
export interface CountReport {
  /** In write mode: applied changes. In `--check`: would-be changes (drift). */
  changes: CountChange[];
  /** Docs written (empty under `--check`). */
  written: string[];
  /** Count keys skipped because their truth source was unavailable. */
  skipped: SkippedSource[];
}
