/**
 * Disable ANSI color when stdout is not a TTY.
 *
 * picocolors enables color whenever `CI` is in the environment, even when
 * stdout is piped to a file (non-TTY). That corrupts captured streams — the
 * CI drift report is `tee`'d into a file and re-published as a GitHub PR
 * comment, where raw ANSI codes render as garbage. Setting NO_COLOR before
 * picocolors first loads disables it across every consumer (cli formatters and
 * lib/logger share the one picocolors singleton).
 *
 * This MUST be imported before any module that imports picocolors — keep it
 * the first import in the CLI entry point. An explicit NO_COLOR / FORCE_COLOR
 * from the user always wins.
 */
if (
  process.stdout.isTTY !== true &&
  !('NO_COLOR' in process.env) &&
  !('FORCE_COLOR' in process.env)
) {
  process.env.NO_COLOR = '1';
}
