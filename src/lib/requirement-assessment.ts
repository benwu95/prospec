/**
 * Pure Requirement Assessment and Judgment Floor Reducer (REQ-LIB-085, REQ-TYPES-104).
 *
 * Compares judgment items with formal delta entries, enforces coverage,
 * validates REQ IDs, computes FAIL/WARN floor, and normalizes gap states.
 */

import { iterateDeltaEntries } from './landing-fidelity.js';
import type { ChangeScale } from '../types/change.js';
import type {
  JudgmentDimensionVerdict,
  JudgmentItem,
  ScenarioFinding,
} from '../types/station.js';
import { PrerequisiteError } from '../types/errors.js';

export interface RequirementAssessmentOptions {
  scale: ChangeScale;
  deltaContent: string;
  items?: JudgmentItem[];
  findings?: ScenarioFinding[];
  suppliedVerdict?: JudgmentDimensionVerdict;
  baselineStatus?: 'frozen' | 'late-capture' | 'missing';
  contextStatus?: 'valid' | 'missing';
}

export interface RequirementAssessmentResult {
  verdict: JudgmentDimensionVerdict;
  isApplicable: boolean;
  expectedReqIds: string[];
  items: JudgmentItem[];
  missingReqIds: string[];
  gapWarnings: string[];
}

function assertAggregateFloor(
  suppliedVerdict: JudgmentDimensionVerdict | undefined,
  hasFail: boolean,
  hasWarn: boolean,
): void {
  if (suppliedVerdict) {
    if (hasFail && suppliedVerdict !== 'FAIL') {
      throw new PrerequisiteError(
        `supplied aggregate verdict "${suppliedVerdict}" is less strict than item/finding floor FAIL`,
      );
    }
    if (hasWarn && suppliedVerdict !== 'WARN' && suppliedVerdict !== 'FAIL') {
      throw new PrerequisiteError(
        `supplied aggregate verdict "${suppliedVerdict}" is less strict than item/finding floor WARN`,
      );
    }
  }
}

/**
 * Assess requirement compliance against the canonical delta-spec.
 */
export function assessRequirementCompliance(
  options: RequirementAssessmentOptions,
): RequirementAssessmentResult {
  const {
    scale,
    deltaContent,
    items,
    findings,
    suppliedVerdict,
    baselineStatus,
    contextStatus,
  } = options;

  // Scale quick bypasses REQ extraction; delta-spec-compliance is not-applicable
  if (scale === 'quick') {
    return {
      verdict: 'not-applicable',
      isApplicable: false,
      expectedReqIds: [],
      items: items ?? [],
      missingReqIds: [],
      gapWarnings: [],
    };
  }

  const entries = iterateDeltaEntries(deltaContent);
  const formalEntries = entries.filter((e) =>
    ['ADDED', 'MODIFIED', 'REMOVED'].includes(e.section),
  );

  if (formalEntries.length === 0) {
    // Empty set cannot yield a vacuous PASS (REQ-LIB-085)
    for (const item of items ?? []) {
      throw new PrerequisiteError(
        `unknown REQ id "${item.req_id}" in judgment items (expected empty requirement set)`,
      );
    }
    const findingFail = findings?.some((f) => f.result === 'FAIL') ?? false;
    const findingWarn = findings?.some((f) => f.result === 'WARN') ?? false;
    assertAggregateFloor(suppliedVerdict, findingFail, findingWarn);
    const hasFail = findingFail || suppliedVerdict === 'FAIL';
    const hasWarn = findingWarn || suppliedVerdict === 'WARN';

    let verdict: JudgmentDimensionVerdict;
    if (hasFail) {
      verdict = 'FAIL';
    } else if (hasWarn) {
      verdict = 'WARN';
    } else {
      verdict = 'not-adjudicated';
    }

    const gapWarnings: string[] = [
      'empty requirement set in delta-spec; cannot yield a vacuous PASS',
    ];
    return {
      verdict,
      isApplicable: true,
      expectedReqIds: [],
      items: [],
      missingReqIds: [],
      gapWarnings,
    };
  }

  const seenInDelta = new Set<string>();
  const expectedReqIds: string[] = [];
  for (const entry of formalEntries) {
    if (seenInDelta.has(entry.reqId)) {
      throw new PrerequisiteError(`duplicate REQ id "${entry.reqId}" in delta-spec`);
    }
    seenInDelta.add(entry.reqId);
    expectedReqIds.push(entry.reqId);
  }

  const expectedSet = new Set(expectedReqIds);
  const seenItemIds = new Set<string>();

  for (const item of items ?? []) {
    if (!expectedSet.has(item.req_id)) {
      throw new PrerequisiteError(
        `unknown REQ id "${item.req_id}" in judgment items (expected one of: ${expectedReqIds.join(', ')})`,
      );
    }
    if (seenItemIds.has(item.req_id)) {
      throw new PrerequisiteError(`duplicate REQ id "${item.req_id}" in judgment items`);
    }
    seenItemIds.add(item.req_id);
  }

  const itemMap = new Map((items ?? []).map((i) => [i.req_id, i]));
  const missingReqIds: string[] = [];
  const finalItems: JudgmentItem[] = [];

  for (const reqId of expectedReqIds) {
    const item = itemMap.get(reqId);
    if (item) {
      finalItems.push(item);
    } else {
      missingReqIds.push(reqId);
      finalItems.push({
        req_id: reqId,
        result: 'not-adjudicated',
        evidence_kind: 'document',
        evidence: 'requirement not evaluated in submission',
      });
    }
  }

  const hasFail =
    finalItems.some((i) => i.result === 'FAIL') ||
    (findings?.some((f) => f.result === 'FAIL') ?? false);
  const hasWarn =
    finalItems.some((i) => i.result === 'WARN') ||
    (findings?.some((f) => f.result === 'WARN') ?? false);

  assertAggregateFloor(suppliedVerdict, hasFail, hasWarn);

  const gaps: string[] = [];
  if (missingReqIds.length > 0) {
    gaps.push(`missing requirement judgments: ${missingReqIds.join(', ')}`);
  }
  const unadjudicated = (items ?? []).filter((item) => item.result === 'not-adjudicated');
  if (unadjudicated.length > 0) {
    gaps.push(`unadjudicated requirement judgments: ${unadjudicated.map((item) => item.req_id).join(', ')}`);
  }
  if (baselineStatus === 'late-capture') {
    gaps.push('acceptance baseline was captured or amended after story stage (late-capture)');
  } else if (baselineStatus === 'missing') {
    gaps.push('acceptance baseline is missing');
  }
  if (contextStatus === 'missing') {
    gaps.push('verification context projection is missing or invalid');
  }

  let verdict: JudgmentDimensionVerdict;
  if (hasFail || suppliedVerdict === 'FAIL') {
    verdict = 'FAIL';
  } else if (hasWarn || suppliedVerdict === 'WARN') {
    verdict = 'WARN';
  } else if (gaps.length > 0) {
    verdict = 'not-adjudicated';
  } else {
    verdict = suppliedVerdict ?? 'PASS';
  }

  const gapWarnings: string[] = gaps.length > 0 ? [gaps.join('; ')] : [];

  return {
    verdict,
    isApplicable: true,
    expectedReqIds,
    items: finalItems,
    missingReqIds,
    gapWarnings,
  };
}
