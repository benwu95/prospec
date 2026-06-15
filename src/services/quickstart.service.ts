import { execute as initExecute } from './init.service.js';
import {
  execute as agentSyncExecute,
  type AgentSyncFullResult,
} from './agent-sync.service.js';
import { AlreadyExistsError } from '../types/errors.js';

export interface QuickstartOptions {
  name?: string;
  agents?: string[];
  language?: string;
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
  /** The slash command the user runs next, in their AI agent */
  nextStep: string;
}

/**
 * Orchestrate the deterministic half of onboarding: init + agent sync.
 *
 * Thin wrapper over two already-idempotent services (service-orchestrates-service,
 * cf. `change-resolver`). It deliberately does NOT run `knowledge init` —
 * raw-scan generation + knowledge generation need an LLM, so they belong to the
 * `/prospec-quickstart` skill, which keeps raw-scan.md fresh and chains into
 * `/prospec-knowledge-generate`.
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
  try {
    await initExecute({
      name: options.name,
      agents: options.agents,
      language: options.language,
      cwd,
    });
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

  return {
    steps,
    agentSync,
    nextStep: '/prospec-quickstart',
  };
}
