/**
 * Verification Context Assessment (REQ-SERVICES-115, REQ-TYPES-104).
 *
 * Single owner for reading, projecting, and rechecking the deterministic
 * verification context inputs (spec, proposal, frozen baseline, test attempt,
 * repository snapshot, and canonical context_id).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfigPath, resolveTestCommand, validateConfig } from './config.js';
import { readChangeMetadata } from './change-metadata.js';
import {
  computeChangeState,
  collectChangeTestEvidence,
} from './drift-sources.js';
import { evaluateChangeTestEvidence } from './drift-checker.js';
import { iterateDeltaEntries } from './landing-fidelity.js';
import { checkProposalMismatch } from './acceptance-baseline.js';
import type {
  CurrentVerificationContextAssessment,
  VerificationContext,
  VerificationContextBaseline,
  VerificationContextProposal,
  VerificationContextSnapshot,
  VerificationContextSpec,
  VerificationContextTestAttempt,
} from '../types/station.js';
import { ConfigNotFound, PrerequisiteError } from '../types/errors.js';

export function assessVerificationContext(
  cwd: string,
  changeName: string,
): CurrentVerificationContextAssessment {
  const configPath = resolveConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    throw new ConfigNotFound(configPath);
  }
  const configBytes = fs.readFileSync(configPath);
  const config = validateConfig(configBytes.toString('utf8'), configPath);
  const testCommand = resolveTestCommand(config, cwd);

  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  let metadataBytes: Buffer;
  try {
    metadataBytes = fs.readFileSync(metadataPath);
  } catch (error) {
    throw new PrerequisiteError(
      `metadata.yaml for change "${changeName}" cannot be read (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const { metadata } = readChangeMetadata(metadataPath, changeName);
  const scale = metadata.scale ?? 'standard';

  const proposalPath = path.join(changeDir, 'proposal.md');
  let proposalBytes: Buffer;
  try {
    proposalBytes = fs.readFileSync(proposalPath);
  } catch (error) {
    throw new PrerequisiteError(
      `proposal.md for change "${changeName}" cannot be read (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const proposalContent = proposalBytes.toString('utf8');
  const proposalDigest = createHash('sha256').update(proposalContent).digest('hex');
  const proposalSource = path.relative(cwd, proposalPath).replace(/\\/g, '/');
  const proposal: VerificationContextProposal = {
    source: proposalSource,
    digest: proposalDigest,
  };

  const deltaPath = path.join(changeDir, 'delta-spec.md');
  const deltaSource = path.relative(cwd, deltaPath).replace(/\\/g, '/');
  let deltaBytes: Buffer | null = null;
  let spec: VerificationContextSpec;

  if (scale === 'quick') {
    if (fs.existsSync(deltaPath)) {
      deltaBytes = fs.readFileSync(deltaPath);
      const content = deltaBytes.toString('utf8');
      const digest = createHash('sha256').update(content).digest('hex');
      spec = {
        source: deltaSource,
        content,
        digest,
        req_ids: [],
      };
    } else {
      const content = '';
      const digest = createHash('sha256').update(content).digest('hex');
      spec = {
        source: deltaSource,
        content,
        digest,
        req_ids: [],
      };
    }
  } else {
    try {
      deltaBytes = fs.readFileSync(deltaPath);
    } catch (error) {
      throw new PrerequisiteError(
        `delta-spec.md for change "${changeName}" cannot be read (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    const content = deltaBytes.toString('utf8');
    const digest = createHash('sha256').update(content).digest('hex');
    const entries = iterateDeltaEntries(content);
    const req_ids = entries
      .filter((e) => ['ADDED', 'MODIFIED', 'REMOVED'].includes(e.section))
      .map((e) => e.reqId);
    spec = {
      source: deltaSource,
      content,
      digest,
      req_ids,
    };
  }

  let baseline: VerificationContextBaseline;
  if (
    metadata.acceptance &&
    metadata.acceptance.revisions &&
    metadata.acceptance.revisions.length > 0 &&
    metadata.acceptance.current_revision
  ) {
    const currentRev = metadata.acceptance.revisions.find(
      (r) => r.revision === metadata.acceptance!.current_revision,
    );
    if (currentRev) {
      const proposalMismatch = checkProposalMismatch(proposalContent, currentRev, proposalSource);
      baseline = {
        status: 'frozen',
        revision: currentRev.revision,
        digest: currentRev.digest,
        scenarios: currentRev.scenarios,
        proposal_mismatch: proposalMismatch,
      };
    } else {
      baseline = { status: 'unavailable' };
    }
  } else if (metadata.acceptance) {
    baseline = { status: 'pending' };
  } else {
    baseline = { status: 'unavailable' };
  }

  const snapshotState = computeChangeState(cwd);
  if (snapshotState.digest === null) {
    throw new PrerequisiteError(
      `repository snapshot is unprovable for change "${changeName}": ${snapshotState.reason ?? 'not a git repository'}`,
    );
  }
  const snapshot: VerificationContextSnapshot = {
    digest: snapshotState.digest,
    scope: 'repository-inputs-v2',
  };

  const testObs = collectChangeTestEvidence(cwd, changeName, testCommand, snapshotState);
  const decision = evaluateChangeTestEvidence(testObs.facts);
  const attempt = testObs.facts.latestAttempt;

  let test_attempt: VerificationContextTestAttempt;
  if (decision.verdict === 'refuse' && decision.knownFailure) {
    const retainedFailure = testObs.facts.recordedExitCode !== 0 && testObs.facts.recordedDigest !== null;
    test_attempt = {
      status: 'failed',
      attempt_id: retainedFailure ? testObs.facts.recordedAttemptId : attempt?.id,
      exit_code: retainedFailure ? testObs.facts.recordedExitCode : attempt?.exitCode,
      command: retainedFailure ? testObs.facts.recordedCommand : attempt?.command,
      summary: [decision.reason, testObs.facts.commandUnavailableReason].filter(Boolean).join('; '),
    };
  } else if (testObs.facts.commandUnavailableReason !== null) {
    test_attempt = {
      status: 'no-command',
      summary: testObs.facts.commandUnavailableReason,
    };
  } else if (attempt === undefined) {
    test_attempt = {
      status: 'missing',
      summary: 'no test run recorded',
    };
  } else if (attempt.outcome === 'running') {
    test_attempt = {
      status: 'running',
      attempt_id: attempt.id,
      command: attempt.command,
      summary: 'test run is currently running',
    };
  } else if (attempt.outcome === 'failed') {
    test_attempt = {
      status: 'failed',
      attempt_id: attempt.id,
      exit_code: attempt.exitCode,
      command: attempt.command ?? testObs.facts.recordedCommand,
      summary: attempt.reason ?? 'test run failed with non-zero status',
    };
  } else if (decision.verdict === 'pass') {
    test_attempt = {
      status: 'passed',
      attempt_id: attempt.id,
      exit_code: 0,
      command: attempt.command,
      summary: 'test run passed against current repository inputs',
    };
  } else if (decision.verdict === 'refuse') {
    test_attempt = {
      status: 'stale',
      attempt_id: attempt.id,
      exit_code: attempt.exitCode ?? 0,
      command: attempt.command,
      summary: decision.reason,
    };
  } else if (decision.verdict === 'exempt') {
    test_attempt = {
      status: 'exempt',
      summary: decision.reason,
    };
  } else {
    test_attempt = {
      status: attempt.outcome,
      attempt_id: attempt.id,
      exit_code: attempt.exitCode,
      command: attempt.command,
    };
  }

  const canonicalPayload = {
    version: 1 as const,
    change_name: changeName,
    scale,
    spec,
    proposal,
    baseline,
    test_attempt,
    snapshot,
  };

  const context_id = createHash('sha256')
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');

  const context: VerificationContext = {
    ...canonicalPayload,
    context_id,
  };

  return {
    context,
    recheck: () => {
      try {
        if (!configBytes.equals(fs.readFileSync(configPath))) return false;
        if (!metadataBytes.equals(fs.readFileSync(metadataPath))) return false;
        if (!proposalBytes.equals(fs.readFileSync(proposalPath))) return false;
        if (deltaBytes !== null) {
          if (!deltaBytes.equals(fs.readFileSync(deltaPath))) return false;
        } else if (fs.existsSync(deltaPath)) {
          return false;
        }
        const currentSnapshot = computeChangeState(cwd);
        if (currentSnapshot.digest !== snapshot.digest) return false;
        return true;
      } catch {
        return false;
      }
    },
  };
}
