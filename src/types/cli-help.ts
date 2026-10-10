/**
 * Enriched help for the commands an agent calls directly from a station skill.
 *
 * The text lives in `types` for the same reason `SKILL_DEFINITIONS` does: it is
 * human-readable copy every layer may read — the enriched commands mount it, the
 * contract test walks it, and a station report may quote it — with exactly one
 * source. A command listed in `HELP_ENRICHED_COMMANDS` without a spec here fails
 * `pnpm typecheck`; a spec whose command is not registered fails the contract.
 */

import { GIT_STATE_FACETS } from './delegation.js';
import { DELEGATION_PRODUCER } from './station.js';

export const HELP_ENRICHED_COMMANDS = [
  'status',
  'history paths',
  'history import',
  'change log',
  'change delegate',
  'review merge',
  'verify record',
  'learn upsert',
  'learn playbook',
  'spec show',
  'constitution show',
] as const;

export type HelpEnrichedCommand = (typeof HELP_ENRICHED_COMMANDS)[number];

export const HELP_SECTION_LABELS = {
  whenToUse: 'When to use:',
  example: 'Example:',
  returns: 'Returns:',
} as const;

/**
 * The one sentence stating how the Markdown-table writers rewrite a cell. The
 * help prints it under `Returns:` and the success notice prints it when a cell
 * was actually rewritten — one constant, so the two cannot drift.
 */
export const ESCAPING_RULE_TEXT =
  'inside a table cell `|` is written as `\\|` and a newline is flattened to a space';

/**
 * Which engine owns the escaping a command performs. `markdown-table` is the
 * pipe-table writer (`review merge`, `learn upsert`); `yaml-scalar` is the
 * metadata serializer (`change log`), which performs no table escaping at all —
 * the kind keeps a command from being documented with a rule it does not apply.
 */
export interface EscapingDisclosure {
  kind: 'markdown-table' | 'yaml-scalar';
  text: string;
}

export interface CommandHelpSpec {
  /** When to run the command — and what it is NOT for. */
  whenToUse: string;
  /** One complete, runnable command line, starting with `prospec <command>`. */
  example: string;
  /** Further complete command lines for a command with more than one verdict form. */
  additionalExamples?: string[];
  /** What the command prints and writes. */
  returns: string;
  escaping?: EscapingDisclosure;
}

const TABLE_ESCAPING: EscapingDisclosure = {
  kind: 'markdown-table',
  text: `Stored text may differ from the input: ${ESCAPING_RULE_TEXT}; the success output says when that happened.`,
};

export const COMMAND_HELP_SPECS: Record<HelpEnrichedCommand, CommandHelpSpec> = {
  'history paths': {
    whenToUse: 'Inspect canonical archive and abandoned roots before reading terminal history or importing local-only bundles.',
    example: 'prospec history paths --json',
    returns: 'Read-only source and history paths plus local-only/conflict diagnostics. No files are written.',
  },
  'history import': {
    whenToUse: 'Copy legacy local terminal bundles from the same registered repository and project scope into canonical history. Sources are retained; this does not restore Git work.',
    example: 'prospec history import --from /path/to/linked-project --dry-run --json',
    returns: 'Per-entry imported, identical, conflicting, failed or planned outcomes. Conflicting or failed entries exit 1; dry-run performs no writes. Existing identities are never overwritten or renamed.',
  },
  status: {
    whenToUse:
      'Run at the start of a session, before any station skill: it names the in-flight change and the next station to enter. Not for reading a change\'s artifacts (read the files) and not for advancing a status (`prospec change status`).',
    example: 'prospec status --json',
    returns:
      'One block per in-flight change — name, status, the `next:` station, then the lines that apply: `issue:` when the change registered one, an `action:` line naming the next station\'s canonical Skill to invoke (`invoke skill prospec-<name>`) when a next station exists, a `fallback:` line giving the skill file to read when the host has no skill mechanism of its own — printed whenever the project configures an agent, absent when `next` is null — blocking `gate:` lines and unresolved `warn:` lines. A `HALT` next line (escalation, `AWAITING_HUMAN_PLAN_SIGNOFF` for a plan sign-off pause, or `KNOWLEDGE_INPUT_INVALID` for a knowledge-sync input no station repairs) names no station: a human acts next. `PROSPEC_PAUSE_AT` decides the plan pause for this run (empty or `none` = no pause); unset, a verified `ai-proposed` Premise pauses by default and `workflow.pause_at` decides the rest; an invalid value exits 1 with no report. With `--json` the same facts are written to stdout as JSON.',
  },
  'change log': {
    whenToUse:
      'At a station\'s Exit Gate, to record its PASS/WARN/FAIL entry; at plan or tasks, to sink the verifier report with `--verifier-report` instead; at a paused plan, to record the human\'s sign-off with `--skill prospec-plan --signoff <option>` (only on explicit human instruction; at full scale the option must equal candidates/decision.json `recommended_option`, at other scales it is `plan`, the plan version the latest verifier report audited). Not for advancing a status (`prospec change status`) and not for review/test provenance (`prospec check --record-review` / `--record-tests`).',
    example:
      'prospec change log --skill prospec-review --result WARN --warning "2 majors left open" --criticals-found 1 --criticals-fixed 1 --majors 2',
    additionalExamples: [
      'prospec change log --skill prospec-plan --signoff option-a --warning "approved as recommended"',
      'prospec change log --skill prospec-plan --signoff plan --warning "approved: change the retry bound to 2, then continue"',
    ],
    returns:
      'With --json, emits the outcome to stdout and structured refusals to stderr. Only an explicit composed WARN with a nonempty Manual override: reason grants one new attempt for the pending event and station; a report warning does not grant permission. Lifetime reasons and usage remain visible after later PASS. Appends one `quality_log` entry to metadata.yaml and prints its skill, date, result and warning count. A candidate sign-off also sets decision.json `graded_by: human`.',
    escaping: {
      kind: 'yaml-scalar',
      text: 'Free text is serialized as YAML data by the yaml library (quoted only when YAML requires it), so metacharacters cannot corrupt the file; this command writes YAML, not a Markdown table, so no table escaping applies.',
    },
  },
  'change delegate': {
    whenToUse:
      'At review or verify, around every delegate you spawn: issue a ticket before the spawn, receive the payload the moment the delegate returns (before you fix anything), and end a delegation that produced no admissible payload with `--spawn-failed`. When a receipt is refused as mutated, stop and hand it to the human — this command restores nothing. Not for plan, tasks or ff delegates (they have no ticket) and not for recording a gate result (`prospec change log`).',
    example: 'prospec change delegate --station review --role lens-security --round 1',
    additionalExamples: [
      'prospec change delegate --receive review-lens-security-1-1',
      'prospec change delegate --spawn-failed review-lens-security-1-1 --reason "spawn refused: rate limit"',
    ],
    returns:
      `Issue normalizes \`--role\`, records the pre-spawn repository state (${GIT_STATE_FACETS.join(', ')}; \`refs\` holds local refs only), a checkpoint — byte copies of the uncommitted and untracked non-ignored files and of the raw index, under the change's \`.delegated/\` directory — and a snapshot the CLI builds under the temporary directory, and prints the stem, the absolute payload path and the absolute snapshot path; it refuses while an open or refused attempt of the change started from a different tree. Receive prints \`received\`, or exits 1 naming why: a payload not yet written or not yet complete JSON, or a facet that cannot be read while every readable one is unchanged, leaves the ticket open; a schema failure, a stale payload, or any changed facet (named, with both values and the checkpoint path) refuses it, and after a mutation the flow stops for the human. \`--spawn-failed\` ends an open or refused ticket — first appending a \`${DELEGATION_PRODUCER}\` WARN — and refuses while any facet differs from the pre-spawn state, unless \`--accept-current-tree\` is passed on an explicit human instruction, which keeps the checkpoint and names its path. It detects and preserves; it prevents nothing and restores nothing — it never writes the working tree, the index, HEAD or refs.`,
  },
  'review merge': {
    whenToUse:
      'After a review round\'s findings JSON exists, to merge it into the cumulative review.md. Identity is the finding `id` — reuse last round\'s id for the same finding; the CLI never infers identity from the location text. Not for recording the gate (that is `prospec change log --skill prospec-review`).',
    example: 'prospec review merge --findings .tasks/review-round1.json --round 1',
    returns:
      'With --json, prints the same structured result to stdout and structured refusals to stderr (exit 1). Persisted escalation decisions own the exits; a repeated pending event requires one explicit, reasoned current-station grant. Replays do not consume grants. Prints the artifact path, cumulative row count, evidence block count, the round counts (`criticals_found=` …) and, per critical, its claim and repro command. Every merge first requires the target change\'s fresh green test attempt (`prospec check --record-tests --change <name>`): an input-validation or round-sequence refusal writes nothing, while an initial test-gate refusal exits 1 with the remediation and may write the bounded test-failure metrics into review.md\'s metrics comment — never findings. It counts the distinct failed attempts review merge itself observed (default threshold 3, a replayed attempt id never counts twice, a fresh green resets it), not the full suite history, and reports `persistent_test_failure` with ESCALATE_TO_HUMAN at the threshold. A project with no resolvable test command or a proven backfill merges with a `tests: not-adjudicated` WARN. After persisting an exemption WARN, a later refusal retains that WARN and reports a warning-only outcome. Consult the refusal reason for completed writes; any completed artifact write remains on disk. Ahead of every other check it settles the review delegations: an unreceived or refused latest attempt refuses the merge and writes nothing; otherwise it prints one delegation line — the received, failed and human-accepted counts and how many attempts were refused as mutated, or that the round was not covered by delegate mutation detection.',
    escaping: TABLE_ESCAPING,
  },
  'verify record': {
    whenToUse:
      'At verify, once the three judgment dimensions are graded in fresh context, to compute the S/A/B/C/D grade; the machine dimensions are self-sourced from the live drift assessment. Not for recording tests (`prospec check --record-tests`) and never for relaying an engine verdict by hand.',
    example: 'prospec verify record --dimensions .tasks/verify-dimensions.json',
    returns:
      'With --json, prints the outcome to stdout and refusal details to stderr. Accepted replay preserves grades and grant usage, repairing only its missing evidence. Durable override history remains visible after PASS. Prints the grade, the gate result and each dimension\'s verdict; on S/A it appends the `quality_log` entry and advances `status: verified` in one write. It refuses before writing when a judgment dimension lacks `graded_by`, the live assessment is unprovable, or a verify delegation is unreceived or refused; its normal output says whether the run was covered by delegate mutation detection.',
  },
  'learn upsert': {
    whenToUse:
      'At the archive harvest or a learn Collect pass, to upsert ONE lesson JSON into the lessons ledger. Identity is the lesson `key`, never the description text. Not for changing a row\'s status (a human hand edit) and not for arrays of lessons.',
    example: 'prospec learn upsert --lesson .tasks/lesson.json',
    returns:
      'Prints `Ledger entry created|incremented|unchanged`, warnings, suggest-promote details and playbook entries past TTL.',
    escaping: TABLE_ESCAPING,
  },
  'learn playbook': {
    whenToUse:
      'At plan or implement Startup, use --station to select entry bodies and optional --modules to sort the catalog by module match. Read any other active entry with --id. Not for promoting or retiring an entry (`/prospec-learn` with human approval) or the whole-file read `/prospec-learn` itself does.',
    example: 'prospec learn playbook --station implement --modules lib,cli',
    additionalExamples: ['prospec learn playbook --modules lib,cli', 'prospec learn playbook --id PB-007'],
    returns:
      'Prints one catalog line per active entry — id, title, kind, modules (or `modules: undeclared`), TTL. In station mode, the station selects bodies and modules only sort the catalog; entries without a station declaration remain available by --id. If all active entries lack declarations, legacy fallback uses the module selector and warns on stderr. An entry over the advisory 300-token cap warns on stderr without truncating its text. Retired entries never appear; an unknown id exits 1. A missing `_playbook.md` prints one line and exits 0.',
  },
  'spec show': {
    whenToUse:
      'When a station needs the requirement text a change touches — pass the delta-spec\'s REQ ids or story ids instead of reading a whole feature spec. Not for editing a spec (archive is its sole writer).',
    example: 'prospec spec show sdd-workflow --req REQ-CLI-028,REQ-CLI-037',
    returns:
      'Prints the selected requirement slices as Markdown on stdout (read-only). Each unmatched selector is named on stderr and the exit is non-zero; with no selector at all the whole spec prints.',
  },
  'constitution show': {
    whenToUse:
      'At a station\'s Startup Loading, to read the Constitution slice that station needs instead of the whole file: every section outside `## Principles` verbatim, plus each principle declaring `stations: all`, naming the station, or declaring nothing. `--rule` prints one rule by name. Not for grading compliance (`/prospec-verify`) and not for editing the Constitution.',
    example: 'prospec constitution show --station plan',
    additionalExamples: ['prospec constitution show --rule "Language Policy"'],
    returns:
      'Prints the slice on stdout exactly as it appears in the file (read-only, no trailing newline added; terminal control bytes are stripped). When the file has no `## Principles`, no rule declares `stations:`, or no rule matches, it fails open: stdout is the whole file, stderr names the reason in one `WARN` line, and the exit is 0. A sliced run names on stderr how many undeclared rules it kept; every station run ends stderr with `tokens: slice <n> / full <m> (estimateTokens)` (`tokens: full <m>` on fail-open). An unknown station or rule name exits 1 listing the valid ones.',
  },
};

/** Render one spec as the text Commander appends after the Options block. */
export function renderCommandHelp(spec: CommandHelpSpec): string {
  const returns = spec.escaping ? `${spec.returns} ${spec.escaping.text}` : spec.returns;
  return [
    '',
    HELP_SECTION_LABELS.whenToUse,
    `  ${spec.whenToUse}`,
    '',
    HELP_SECTION_LABELS.example,
    ...[spec.example, ...(spec.additionalExamples ?? [])].map((example) => `  $ ${example}`),
    '',
    HELP_SECTION_LABELS.returns,
    `  ${returns}`,
  ].join('\n');
}
