import { InvalidArgumentError, Option, type Command } from 'commander';
import { DELEGATION_STATIONS, type DelegationStation } from '../../types/delegation.js';
import { PrerequisiteError } from '../../types/errors.js';
import { COMMAND_HELP_SPECS, renderCommandHelp } from '../../types/cli-help.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

function parseRound(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== value.trim()) {
    throw new InvalidArgumentError('expected a positive integer');
  }
  return parsed;
}

const OPERATIONS = ['receive', 'spawnFailed'];
const others = (self: string) => OPERATIONS.filter((o) => o !== self);

/**
 * Register the `delegate` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change delegate --station review --role lens-security --round 1
 *   prospec change delegate --receive <stem>
 *   prospec change delegate --spawn-failed <stem> --reason <text> [--accept-current-tree]
 */
export function registerChangeDelegateCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('delegate')
    .description('Issue, receive, or end a delegation ticket for a review or verify delegate')
    .addHelpText('after', renderCommandHelp(COMMAND_HELP_SPECS['change delegate']))
    .addOption(new Option('--station <station>', 'Delegating station (issue)').choices(DELEGATION_STATIONS).conflicts(OPERATIONS))
    .addOption(new Option('--role <role>', 'Delegate role, normalized to lowercase, e.g. lens-security, verifier-C-1, grader (issue)').conflicts(OPERATIONS))
    .addOption(new Option('--round <n>', "The station's own round counter (issue)").argParser(parseRound).conflicts(OPERATIONS))
    .addOption(new Option('--receive <stem>', 'Receive the payload of an issued ticket').conflicts(others('receive')))
    .addOption(new Option('--spawn-failed <stem>', 'End an open or refused ticket that will not be re-spawned').conflicts(others('spawnFailed')))
    .addOption(new Option('--reason <text>', 'Why the delegation ended (with --spawn-failed)').conflicts(['receive', 'station', 'role', 'round']))
    .addOption(
      new Option('--accept-current-tree', 'With --spawn-failed: end it although the repository changed, keeping the checkpoint — ONLY on an explicit human instruction').conflicts([
        'receive',
        'station',
        'role',
        'round',
      ]),
    )
    .option('--change <name>', 'Specify the change name')
    .action(
      async (options: {
        station?: DelegationStation;
        role?: string;
        round?: number;
        receive?: string;
        spawnFailed?: string;
        reason?: string;
        acceptCurrentTree?: boolean;
        change?: string;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);
        try {
          let mode: import('../../services/change-delegate.service.js').ChangeDelegateMode;
          if (options.receive !== undefined) {
            mode = { kind: 'receive', stem: options.receive };
          } else if (options.spawnFailed !== undefined) {
            if (options.reason === undefined) throw new PrerequisiteError('--spawn-failed requires --reason <text>', 'Say why the delegation ended, e.g. `--reason "spawn refused: rate limit"`');
            mode = { kind: 'spawn-failed', stem: options.spawnFailed, reason: options.reason, acceptCurrentTree: options.acceptCurrentTree === true };
          } else {
            if (options.acceptCurrentTree === true || options.reason !== undefined) {
              throw new PrerequisiteError('--reason and --accept-current-tree go with --spawn-failed <stem>', 'Pass --spawn-failed <stem> to end a ticket');
            }
            if (options.station === undefined || options.role === undefined || options.round === undefined) {
              throw new PrerequisiteError('Issuing a ticket requires --station, --role and --round', 'Pass all three to issue, or --receive / --spawn-failed <stem> to act on an issued ticket');
            }
            mode = { kind: 'issue', station: options.station, role: options.role, round: options.round };
          }
          const { execute } = await import('../../services/change-delegate.service.js');
          const { formatChangeDelegateOutput } = await import('../formatters/change-delegate-output.js');
          const result = await execute({ change: options.change, quiet: globalOpts.quiet, mode });
          formatChangeDelegateOutput(result, logLevel);
          if (result.kind === 'receipt-failed') process.exitCode = 1;
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
