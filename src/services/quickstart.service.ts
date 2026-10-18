import { execute as initExecute } from './init.service.js';
import {
  execute as agentSyncExecute,
  type AgentSyncFullResult,
} from './agent-sync.service.js';
import { AlreadyExistsError } from '../types/errors.js';
import type { GitignoreBlockResult } from '../types/gitignore-block.js';

export interface QuickstartOptions {
  name?: string;
  agents?: string[];
  language?: string;
  trustZoneLanguage?: string;
  cwd?: string;
}

export interface QuickstartStep {
  /** Step identifier */
  name: 'init' | 'agent-sync';
  /** `created` = the step ran and produced files; `skipped` = already done */
  status: 'created' | 'skipped';
}

export interface QuickstartResult {
  /** Per-step outcome, in execution order */
  steps: QuickstartStep[];
  /** The agent-sync result — carries hints (e.g. native-language triggers) */
  agentSync: AgentSyncFullResult;
  /** The `.gitignore` result of both steps, merged (REQ-SERVICES-130); absent when neither step ran the writer. */
  gitignore?: GitignoreBlockResult;
  /** The slash command the user runs next, in their AI agent */
  nextStep: string;
}

/**
 * Orchestrate the deterministic half of onboarding: init + agent sync.
 *
 * Thin wrapper over two already-idempotent services (service-orchestrates-service,
 * cf. `change-resolver`). It deliberately does NOT run `knowledge init` —
 * raw-scan generation + knowledge generation need an LLM, so they belong to the
 * `prospec-quickstart` skill, which keeps raw-scan.md fresh and chains into
 * `prospec-knowledge-generate`.
 *
 * 1. init — catch AlreadyExistsError on a re-run and mark the step `skipped`
 * 2. agent sync — idempotent overwrite; its hints (native-language triggers)
 *    are carried up for the formatter
 */
export async function execute(
  options: QuickstartOptions,
): Promise<QuickstartResult> {
  const cwd = options.cwd ?? process.cwd();
  const steps: QuickstartStep[] = [];

  // 1. init — re-run-safe: a pre-existing .prospec.yaml is "already initialized"
  let initGitignore: GitignoreBlockResult | undefined;
  try {
    ({ gitignore: initGitignore } = await initExecute({
      name: options.name,
      agents: options.agents,
      language: options.language,
      trustZoneLanguage: options.trustZoneLanguage,
      cwd,
    }));
    steps.push({ name: 'init', status: 'created' });
  } catch (err) {
    if (err instanceof AlreadyExistsError) {
      steps.push({ name: 'init', status: 'skipped' });
    } else {
      throw err;
    }
  }

  // 2. agent sync — idempotent; surfaces PrerequisiteError (no agents) to the CLI
  const agentSync = await agentSyncExecute({ cwd });
  steps.push({ name: 'agent-sync', status: 'created' });

  const gitignore = mergeGitignoreResults(initGitignore, agentSync.gitignore);
  return {
    steps,
    agentSync,
    ...(gitignore ? { gitignore } : {}),
    nextStep: 'prospec-quickstart',
  };
}

/**
 * One result for the run: init's `created` wins, then any `updated`, then the sync's status;
 * warnings of both, each once; the sync's suggested lines whole (else init's), since
 * interleaving two ordered lists would break the order each relies on.
 */
function mergeGitignoreResults(
  init: GitignoreBlockResult | undefined,
  sync: GitignoreBlockResult | undefined,
): GitignoreBlockResult | undefined {
  if (!init || !sync) return init ?? sync;
  const status = init.status === 'created' ? 'created'
    : init.status === 'updated' || sync.status === 'updated' ? 'updated'
    : sync.status;
  return {
    status,
    warnings: [...new Set([...init.warnings, ...sync.warnings])],
    suggestedLines: sync.suggestedLines.length > 0 ? sync.suggestedLines : init.suggestedLines,
  };
}
