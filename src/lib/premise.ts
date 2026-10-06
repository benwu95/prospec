import * as path from 'node:path';
import { ChangeMetadataSchema, type ChangeScale } from '../types/change.js';
import { PrerequisiteError } from '../types/errors.js';
import { captureFileInputs } from './fs-utils.js';
import { resolveContainedTarget } from './knowledge-reader.js';
import { visit } from 'yaml';
import { PremiseSchema, PREMISE_LIMITATION, PREMISE_REMEDY, type PremiseAssessment } from '../types/premise.js';
import { fencedCodeBlocks, hasUnclosedFence, withoutFencedBlocks } from './markdown-fences.js';
import { parseYamlDocument } from './yaml-utils.js';
import { RetryLinkSchema, ABANDON_MANIFEST } from '../types/abandon.js';
import { normalizeIssueRef } from './change-metadata.js';
import { assertNoIncompleteAbandon, readAbandonedAttempt } from './abandon-history.js';
import { abandonedEntryFor } from './abandon-paths.js';
import { sha256 } from './repo-state.js';

function result(state: PremiseAssessment['state'], findings: string[] = []): PremiseAssessment {
  return { state, findings, remedy: state === 'blocked' ? PREMISE_REMEDY : '', limitation: PREMISE_LIMITATION };
}

/** Locate the real section, excluding outer fenced examples and subsequent headings. */
export function parsePremise(proposal: string): unknown {
  const lines = proposal.split(/\r?\n/);
  if (hasUnclosedFence(lines)) throw new Error('proposal.md contains an unclosed fence');
  const masked = withoutFencedBlocks(lines);
  const sections = masked.flatMap((line, index) => /^ {0,3}##[ \t]+Premise(?:[ \t]+#+)?[ \t]*$/.test(line) ? [index] : []);
  const start = sections[0];
  if (sections.length !== 1 || start === undefined) throw new Error('Expected exactly one unfenced ## Premise section');
  const next = masked.findIndex((line, index) => index > start && /^ {0,3}#{1,2}[ \t]+/.test(line));
  const section = lines.slice(start + 1, next < 0 ? lines.length : next);
  const blocks = fencedCodeBlocks(section).filter((block) => block.info === 'yaml');
  const block = blocks[0];
  if (blocks.length !== 1 || !block) throw new Error('Premise requires exactly one yaml fenced mapping');
  const doc = parseYamlDocument(section.slice(block.start + 1, block.end).join('\n'), 'proposal.md#Premise');
  visit(doc, { Alias() { throw new Error('Premise YAML aliases are not allowed'); } });
  return doc.toJS({ maxAliasCount: 0 });
}

function isPlaceholder(value: string): boolean {
  const text = value.trim();
  return text === '' || /NEEDS[ _-]CLARIFICATION/i.test(text)
    || /^(?:TBD|TODO|FIXME|pending|N\/A|\.{3}|…|待填|待確認|待查證)$/i.test(text)
    || /^<[^>]+>$/.test(text) || /^\[[^\]]+\]$/.test(text);
}

/** Pure structural decision. Origin remains separate from verification status. */
export function assessPremise(
  metadata: { premise_version?: unknown; scale?: unknown; retry_of?: unknown }, proposal: string | null,
): PremiseAssessment {
  if (metadata.premise_version !== undefined && metadata.premise_version !== 1) {
    return result('blocked', ['Unsupported premise_version; expected 1']);
  }
  const retry = RetryLinkSchema.array().safeParse(metadata.retry_of === undefined ? [] : metadata.retry_of);
  if (!retry.success) return result('blocked', ['retry_of: invalid history linkage']);
  if (retry.data.length > 0) {
    try {
      if (proposal === null) throw new Error('proposal.md is missing');
      const partial = PremiseSchema.partial().parse(parsePremise(proposal));
      if (partial.retry_difference === undefined || isPlaceholder(partial.retry_difference)) {
        return result('blocked', ['retry_difference: explain the substantive difference from the linked abandoned attempts']);
      }
    } catch (error) {
      return result('blocked', [error instanceof Error ? error.message : String(error)]);
    }
  }
  if (metadata.scale === 'quick' || metadata.scale === 'backfill') {
    return result('exempt', [`Premise is not required for scale: ${metadata.scale}`]);
  }
  if (metadata.premise_version === undefined) {
    return result('legacy', ['legacy change: no premise_version; Premise readiness was not verified']);
  }
  if (proposal === null) return result('blocked', ['proposal.md is missing']);
  try {
    const parsed = PremiseSchema.safeParse(parsePremise(proposal));
    if (!parsed.success) return result('blocked', parsed.error.issues.map((issue) => `${issue.path.join('.') || 'Premise'}: ${issue.message}`));
    const premise = parsed.data;
    const findings: string[] = [];
    const fields = {
      problem: premise.problem, source_ref: premise.source_ref, withdrawal: premise.withdrawal,
      'verification.by': premise.verification.by, 'verification.conclusion': premise.verification.conclusion,
      ...Object.fromEntries(Object.entries(premise.evidence).filter(([key]) => key !== 'kind').map(([key, value]) => [`evidence.${key}`, value])),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (isPlaceholder(value)) findings.push(`${key}: substantive non-placeholder text is required`);
    }
    if (premise.verification.status !== 'verified') findings.push('verification.status: pending; verify the premise before advancing');
    return { ...result(findings.length ? 'blocked' : 'ready', findings), premise };
  } catch (error) {
    return result('blocked', [error instanceof Error ? error.message : String(error)]);
  }
}

export interface PremiseCapture {
  assessment: PremiseAssessment;
  /** Refuse if the captured inputs or their containment changed before the first write. */
  recheck: () => void;
}

/** Read once through existing containment/schema owners; never infer legacy from I/O failure. */
export function readPremiseAssessment(changeDir: string, root: string, targetScale?: ChangeScale): PremiseCapture {
  const paths: Record<string, string> = { metadata: path.join(changeDir, 'metadata.yaml'), proposal: path.join(changeDir, 'proposal.md') };
  const assertNoPartial = (): void => assertNoIncompleteAbandon(root, path.basename(changeDir));
  const checkPaths = (): void => {
    for (const file of Object.values(paths)) {
      const target = resolveContainedTarget(file, root, { read: true });
      if (!target.ok) throw new Error(`${file}: ${target.reason}`);
    }
  };
  try {
    assertNoPartial();
    checkPaths();
    const capture = captureFileInputs({ ...paths });
    const metadataText = capture.values.metadata;
    if (metadataText == null) throw new Error('metadata.yaml is missing; applicability cannot be established');
    // Archive also admits pre-schema records; validate only this gate's fields.
    // Each writer retains its own metadata-completeness contract.
    const envelope = parseYamlDocument(metadataText, paths.metadata!).toJS();
    if (envelope?.status === 'abandoned') throw new Error('Abandoned change is terminal; create a new Story to retry');
    const metadata = ChangeMetadataSchema.pick({ premise_version: true, scale: true, retry_of: true, issue: true }).parse(envelope);
    for (const [index, link] of (metadata.retry_of ?? []).entries()) {
      const attempt = readAbandonedAttempt(root, link.archive);
      if (attempt.digest !== link.digest || attempt.issue !== normalizeIssueRef(metadata.issue)) {
        throw new Error(`Linked abandoned record changed: ${link.archive}`);
      }
      const dir = abandonedEntryFor(root, link.archive);
      paths[`history${index}`] = path.join(dir, 'metadata.yaml');
      paths[`manifest${index}`] = path.join(dir, ABANDON_MANIFEST);
    }
    checkPaths();
    const linkedCapture = captureFileInputs(paths);
    for (const [index, link] of (metadata.retry_of ?? []).entries()) {
      const text = linkedCapture.values[`history${index}`];
      if (text == null || sha256(text) !== link.digest) throw new Error(`Linked abandoned record changed: ${link.archive}`);
    }
    if (!capture.recheck()) throw new Error('Premise inputs changed during history capture');
    const assessment = assessPremise({ ...metadata, scale: targetScale ?? metadata.scale }, capture.values.proposal ?? null);
    return {
      assessment,
      recheck: () => {
        try {
          checkPaths();
          assertNoPartial();
          if (capture.recheck() && linkedCapture.recheck()) return;
        } catch { /* Fail closed, with the same actionable refusal below. */ }
        throw new PrerequisiteError('Premise inputs changed before writing', 'Re-run the command against the current proposal and metadata');
      },
    };
  } catch (error) {
    const assessment = result('blocked', [error instanceof Error ? error.message : String(error)]);
    return { assessment, recheck: () => { throw new PrerequisiteError('Premise inputs could not be read', PREMISE_REMEDY); } };
  }
}

/** Whether a verified Premise was proposed by the AI — the default plan-pause trigger.
 *  Only a ready assessment names a source; legacy, exempt and blocked never infer one. */
export function isAiProposedPremise(assessment: PremiseAssessment | undefined): boolean {
  return assessment?.state === 'ready' && assessment.premise?.source === 'ai-proposed';
}

/** Admission used by every advancing writer, with the same decision as validate/status. */
export function requirePremise(changeDir: string, root: string, targetScale?: ChangeScale): PremiseCapture {
  const captured = readPremiseAssessment(changeDir, root, targetScale);
  if (captured.assessment.state === 'blocked') {
    throw new PrerequisiteError(`Premise incomplete: ${captured.assessment.findings.join('; ')}`, PREMISE_REMEDY);
  }
  return captured;
}
