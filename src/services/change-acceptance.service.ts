/**
 * Acceptance Baseline Mutation Service (REQ-SERVICES-114, REQ-TYPES-103).
 *
 * Handles --freeze-scenarios and --amend-scenarios modes for an existing change:
 * validates inputs, decides freeze/amend via acceptance-baseline engine,
 * checks pre-write stability, and updates acceptance baseline + quality_log
 * in a single atomic metadata update without touching status or proposal.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  decideFreezeScenarios,
  decideAmendScenarios,
} from '../lib/acceptance-baseline.js';
import {
  readChangeMetadata,
  writeChangeMetadataDoc,
  appendQualityLogEntry,
} from '../lib/change-metadata.js';
import { todayIso } from '../lib/date-utils.js';
import { PrerequisiteError } from '../types/errors.js';
import type { NewQualityLogEntry } from '../types/change.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeAcceptanceOptions {
  name?: string;
  change?: string;
  mode: 'freeze' | 'amend';
  reason?: string;
  expectedDigest?: string;
  cwd?: string;
}

export interface ChangeAcceptanceResult {
  changeName: string;
  mode: 'freeze' | 'amend';
  revision: number;
  digest: string;
  origin: string;
  capturedStatus: string;
  scenariosCount: number;
  noop: boolean;
}

export async function execute(options: ChangeAcceptanceOptions): Promise<ChangeAcceptanceResult> {
  const cwd = options.cwd ?? process.cwd();
  const explicitName = options.name ?? options.change;
  if (!explicitName) {
    throw new PrerequisiteError('change name is required');
  }
  const changeName = await resolveChange(cwd, explicitName, true, '');
  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);

  const metadataPath = path.join(changeDir, 'metadata.yaml');
  if (!fs.existsSync(metadataPath)) {
    throw new PrerequisiteError(
      `metadata.yaml for change "${changeName}" does not exist`,
    );
  }

  const proposalPath = path.join(changeDir, 'proposal.md');
  if (!fs.existsSync(proposalPath)) {
    throw new PrerequisiteError(
      `proposal.md for change "${changeName}" does not exist in .prospec/changes/${changeName}/`,
    );
  }

  const preMetadataBytes = fs.readFileSync(metadataPath);
  const preProposalBytes = fs.readFileSync(proposalPath);
  const proposalContent = preProposalBytes.toString('utf8');

  const { metadata, doc } = readChangeMetadata(metadataPath, changeName);

  if (options.mode === 'freeze') {
    const decision = decideFreezeScenarios({
      metadata,
      proposalContent,
      proposalSource: 'proposal.md',
    });

    if (decision.kind === 'no-op') {
      const currentRev = metadata.acceptance?.revisions.find(
        (r) => r.revision === metadata.acceptance!.current_revision,
      );
      return {
        changeName,
        mode: 'freeze',
        revision: currentRev?.revision ?? 1,
        digest: currentRev?.digest ?? '',
        origin: currentRev?.origin ?? 'story',
        capturedStatus: currentRev?.captured_status ?? metadata.status,
        scenariosCount: currentRev?.scenarios.length ?? 0,
        noop: true,
      };
    }

    if (
      !preMetadataBytes.equals(fs.readFileSync(metadataPath)) ||
      !preProposalBytes.equals(fs.readFileSync(proposalPath))
    ) {
      throw new PrerequisiteError(
        `inputs for change "${changeName}" changed during freeze preparation; re-run freeze`,
      );
    }

    doc.set('acceptance', decision.updatedAcceptance);
    const logEntry: NewQualityLogEntry = {
      skill: 'prospec-new-story',
      date: todayIso(),
      result: 'PASS',
      warnings: [],
      baseline_revision: decision.newRevision.revision,
    };
    appendQualityLogEntry(doc, logEntry);

    await writeChangeMetadataDoc(metadataPath, doc, changeName);

    return {
      changeName,
      mode: 'freeze',
      revision: decision.newRevision.revision,
      digest: decision.newRevision.digest,
      origin: decision.newRevision.origin,
      capturedStatus: decision.newRevision.captured_status,
      scenariosCount: decision.newRevision.scenarios.length,
      noop: false,
    };
  }

  if (options.mode === 'amend') {
    if (!options.reason || options.reason.trim() === '') {
      throw new PrerequisiteError('amend-scenarios requires non-empty --reason');
    }
    if (!options.expectedDigest || options.expectedDigest.trim() === '') {
      throw new PrerequisiteError('amend-scenarios requires non-empty --expected-digest');
    }

    const decision = decideAmendScenarios({
      metadata,
      proposalContent,
      proposalSource: 'proposal.md',
      reason: options.reason,
      expectedDigest: options.expectedDigest,
    });

    if (decision.kind === 'no-op') {
      const currentRev = metadata.acceptance?.revisions.find(
        (r) => r.revision === metadata.acceptance!.current_revision,
      );
      return {
        changeName,
        mode: 'amend',
        revision: currentRev?.revision ?? 1,
        digest: currentRev?.digest ?? '',
        origin: currentRev?.origin ?? 'story',
        capturedStatus: currentRev?.captured_status ?? metadata.status,
        scenariosCount: currentRev?.scenarios.length ?? 0,
        noop: true,
      };
    }

    if (
      !preMetadataBytes.equals(fs.readFileSync(metadataPath)) ||
      !preProposalBytes.equals(fs.readFileSync(proposalPath))
    ) {
      throw new PrerequisiteError(
        `inputs for change "${changeName}" changed during amend preparation; re-run amend`,
      );
    }

    doc.set('acceptance', decision.updatedAcceptance);
    const logEntry: NewQualityLogEntry = {
      skill: 'prospec-new-story',
      date: todayIso(),
      result: 'PASS',
      warnings: [],
      baseline_revision: decision.newRevision.revision,
    };
    appendQualityLogEntry(doc, logEntry);

    await writeChangeMetadataDoc(metadataPath, doc, changeName);

    return {
      changeName,
      mode: 'amend',
      revision: decision.newRevision.revision,
      digest: decision.newRevision.digest,
      origin: decision.newRevision.origin,
      capturedStatus: decision.newRevision.captured_status,
      scenariosCount: decision.newRevision.scenarios.length,
      noop: false,
    };
  }

  throw new PrerequisiteError(`unsupported acceptance mode: ${options.mode}`);
}
