/**
 * Enriched help for the commands an agent calls directly from a station skill.
 *
 * The text lives in `types` for the same reason `SKILL_DEFINITIONS` does: it is
 * human-readable copy every layer may read — the six commands mount it, the
 * contract test walks it, and a station report may quote it — with exactly one
 * source. A command listed in `HELP_ENRICHED_COMMANDS` without a spec here fails
 * `pnpm typecheck`; a spec whose command is not registered fails the contract.
 */

export const HELP_ENRICHED_COMMANDS = [
  'status',
  'change log',
  'review merge',
  'verify record',
  'learn upsert',
  'spec show',
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
  status: {
    whenToUse:
      'Run at the start of a session, before any station skill: it names the in-flight change and the next station to enter. Not for reading a change\'s artifacts (read the files) and not for advancing a status (`prospec change status`).',
    example: 'prospec status --json',
    returns:
      'One block per in-flight change — name, status, the `next:` station, then the lines that apply: `issue:` when the change registered one, an `action:` line naming the next station\'s canonical Skill to invoke (`invoke skill prospec-<name>`) when a next station exists, a `fallback:` line giving the skill file to read when the host has no skill mechanism of its own — printed whenever the project configures an agent, absent when `next` is null — blocking `gate:` lines and unresolved `warn:` lines. A `HALT` next line (escalation, or `AWAITING_HUMAN_PLAN_SIGNOFF` for an opt-in plan pause) names no station: a human acts next. `PROSPEC_PAUSE_AT` overrides `workflow.pause_at` for this run (empty or `none` = no pause); an invalid value exits 1 with no report. With `--json` the same facts are written to stdout as JSON.',
  },
  'change log': {
    whenToUse:
      'At a station\'s Exit Gate, to record its PASS/WARN/FAIL entry; at plan or tasks, to sink the verifier report with `--verifier-report` instead; at a paused full-scale plan, to record the human\'s sign-off with `--skill prospec-plan --signoff <option>` (only on explicit human instruction; the option must equal candidates/decision.json `recommended_option`). Not for advancing a status (`prospec change status`) and not for review/test provenance (`prospec check --record-review` / `--record-tests`).',
    example:
      'prospec change log --skill prospec-review --result WARN --warning "2 majors left open" --criticals-found 1 --criticals-fixed 1 --majors 2',
    additionalExamples: ['prospec change log --skill prospec-plan --signoff option-a --warning "approved as recommended"'],
    returns:
      'Appends one `quality_log` entry to metadata.yaml and prints its skill, date, result and warning count. A sign-off also sets decision.json `graded_by: human`.',
    escaping: {
      kind: 'yaml-scalar',
      text: 'Free text is serialized as YAML data by the yaml library (quoted only when YAML requires it), so metacharacters cannot corrupt the file; this command writes YAML, not a Markdown table, so no table escaping applies.',
    },
  },
  'review merge': {
    whenToUse:
      'After a review round\'s findings JSON exists, to merge it into the cumulative review.md. Identity is the finding `id` — reuse last round\'s id for the same finding; the CLI never infers identity from the location text. Not for recording the gate (that is `prospec change log --skill prospec-review`).',
    example: 'prospec review merge --findings .tasks/review-round1.json --round 1',
    returns:
      'Prints the artifact path, cumulative row count, evidence block count, the round counts (`criticals_found=` …) and, per critical, its claim and repro command. Every merge first requires the target change\'s fresh green test attempt (`prospec check --record-tests --change <name>`): an input-validation or round-sequence refusal writes nothing, while a test-gate refusal exits 1 with the remediation and may write ONLY the bounded test-failure metrics into review.md\'s metrics comment — never findings. It counts the distinct failed attempts review merge itself observed (default threshold 3, a replayed attempt id never counts twice, a fresh green resets it), not the full suite history, and reports `persistent_test_failure` with ESCALATE_TO_HUMAN at the threshold. A project with no resolvable test command or a proven backfill merges with a `tests: not-adjudicated` WARN.',
    escaping: TABLE_ESCAPING,
  },
  'verify record': {
    whenToUse:
      'At verify, once the three judgment dimensions are graded in fresh context, to compute the S/A/B/C/D grade; the machine dimensions are self-sourced from the live drift assessment. Not for recording tests (`prospec check --record-tests`) and never for relaying an engine verdict by hand.',
    example: 'prospec verify record --dimensions .tasks/verify-dimensions.json',
    returns:
      'Prints the grade, the gate result and each dimension\'s verdict; on S/A it appends the `quality_log` entry and advances `status: verified` in one write. It refuses before writing when a judgment dimension lacks `graded_by` or the live assessment is unprovable.',
  },
  'learn upsert': {
    whenToUse:
      'At the archive harvest or a learn Collect pass, to upsert ONE lesson JSON into the lessons ledger. Identity is the lesson `key`, never the description text. Not for changing a row\'s status (a human hand edit) and not for arrays of lessons.',
    example: 'prospec learn upsert --lesson .tasks/lesson.json',
    returns:
      'Prints `Ledger entry created|incremented|unchanged`, warnings, suggest-promote details and playbook entries past TTL.',
    escaping: TABLE_ESCAPING,
  },
  'spec show': {
    whenToUse:
      'When a station needs the requirement text a change touches — pass the delta-spec\'s REQ ids or story ids instead of reading a whole feature spec. Not for editing a spec (archive is its sole writer).',
    example: 'prospec spec show sdd-workflow --req REQ-CLI-028,REQ-CLI-037',
    returns:
      'Prints the selected requirement slices as Markdown on stdout (read-only). Each unmatched selector is named on stderr and the exit is non-zero; with no selector at all the whole spec prints.',
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
