/**
 * Acceptance Baseline Pure Engine (REQ-LIB-084, REQ-TYPES-103).
 *
 * Extracts proposal acceptance scenarios, computes canonical digests,
 * and makes pure freeze/amend/readiness decisions without performing file I/O.
 */

import { withoutFencedBlocks } from './markdown-fences.js';
import { stripTrailingCr } from './text-lines.js';
import { computeAcceptanceDigest } from '../types/change.js';
export { computeAcceptanceDigest } from '../types/change.js';
import type {
  AcceptanceBaseline,
  AcceptanceOrigin,
  AcceptanceRevision,
  AcceptanceScenario,
  ChangeMetadata,
} from '../types/change.js';
import { PrerequisiteError } from '../types/errors.js';

const KNOWN_PLACEHOLDER_PATTERN = /\[(?:condition|expected outcome|short title|role|feature|value)\]/i;

interface StoryInProgress {
  id: string;
  hasScenariosHeader: boolean;
  scenarios: AcceptanceScenario[];
}

/**
 * Parse acceptance scenarios from proposal markdown.
 *
 * Scans User Stories, validates presence of substantive acceptance scenarios,
 * rejects duplicate story IDs, placeholders, or empty scenarios blocks,
 * and ignores code fences.
 */
export function parseProposalScenarios(
  content: string,
  source: string = 'proposal.md',
): AcceptanceScenario[] {
  const lines = content.split('\n').map(stripTrailingCr);
  const maskedLines = withoutFencedBlocks(lines);

  const stories: StoryInProgress[] = [];
  const seenStoryIds = new Set<string>();

  let currentStory: StoryInProgress | null = null;
  let inScenariosBlock = false;
  let currentScenario: { text: string; lineNumber: number } | null = null;

  const flushScenario = () => {
    if (currentScenario && currentStory) {
      if (KNOWN_PLACEHOLDER_PATTERN.test(currentScenario.text)) {
        throw new PrerequisiteError(
          `acceptance scenario in "${currentStory.id}" contains template placeholder: "${currentScenario.text}"`,
        );
      }
      const ordinal = currentStory.scenarios.length + 1;
      currentStory.scenarios.push({
        id: `${currentStory.id}.${ordinal}`,
        story_id: currentStory.id,
        text: currentScenario.text,
        source: `${source}:${currentScenario.lineNumber}`,
      });
      currentScenario = null;
    }
  };

  const finalizeStory = (story: StoryInProgress) => {
    flushScenario();
    if (!story.hasScenariosHeader) {
      throw new PrerequisiteError(
        `User Story "${story.id}" is missing an "**Acceptance Scenarios:**" section`,
      );
    }
    if (story.scenarios.length === 0) {
      throw new PrerequisiteError(
        `User Story "${story.id}" has an empty "**Acceptance Scenarios:**" section`,
      );
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = maskedLines[i]!;
    const lineNumber = i + 1;

    // Check for story heading: ### US-... or ## US-...
    const storyMatch = line.match(/^#{2,3}\s+(US-[^\s:]+)/);
    if (storyMatch) {
      if (currentStory) {
        finalizeStory(currentStory);
        currentStory = null;
      }
      inScenariosBlock = false;
      const storyId = storyMatch[1]!;
      if (seenStoryIds.has(storyId)) {
        throw new PrerequisiteError(`duplicate User Story identity "${storyId}" in proposal`);
      }
      seenStoryIds.add(storyId);
      currentStory = {
        id: storyId,
        hasScenariosHeader: false,
        scenarios: [],
      };
      stories.push(currentStory);
      continue;
    }

    if (!currentStory) {
      continue;
    }

    // If line is masked by fence, ignore it and do not parse as bullet or continuation
    if (line === '' && rawLine !== '') {
      flushScenario();
      continue;
    }

    // Check for Acceptance Scenarios header
    if (/^\*\*Acceptance Scenarios:\*\*/i.test(line.trim())) {
      flushScenario();
      currentStory.hasScenariosHeader = true;
      inScenariosBlock = true;
      continue;
    }

    // Check for block termination (new section, another field like **Independent Test:**, rule)
    if (inScenariosBlock) {
      const isTerminator =
        /^#{1,6}\s/.test(line) ||
        /^\*\*[A-Za-z][\w \-/]*:\*\*/.test(line.trim()) ||
        /^---+\s*$/.test(line);

      if (isTerminator) {
        flushScenario();
        inScenariosBlock = false;
        continue;
      }

      // Check for bullet item: - WHEN ... or * WHEN ... or 1. WHEN ...
      const bulletMatch = rawLine.match(/^[ \t]*(?:[-*]|\d+\.)\s+(.*)$/);
      if (bulletMatch) {
        flushScenario();
        currentScenario = {
          text: bulletMatch[1]!,
          lineNumber,
        };
        continue;
      }

      // Check for continuation line indented relative to bullet
      if (currentScenario && /^[ \t]+\S/.test(rawLine)) {
        currentScenario.text += `\n${rawLine}`;
        continue;
      }

      // Reject unparsed content instead of freezing only the recognized subset.
      if (rawLine.trim() !== '') {
        throw new PrerequisiteError(
          `unsupported acceptance scenario content at ${source}:${lineNumber}`,
          'Use -, *, or numbered-dot list items; indent continuation lines',
        );
      }
      flushScenario();
    }
  }

  if (currentStory) {
    finalizeStory(currentStory);
  }

  if (stories.length === 0) {
    throw new PrerequisiteError('no User Stories found in proposal');
  }

  return stories.flatMap((s) => s.scenarios);
}

export interface DecideFreezeOptions {
  metadata: ChangeMetadata;
  proposalContent: string;
  proposalSource?: string;
  capturedAt?: string;
}

export type DecideFreezeResult =
  | { kind: 'no-op' }
  | {
      kind: 'freeze';
      newRevision: AcceptanceRevision;
      updatedAcceptance: AcceptanceBaseline;
    };

/**
 * Pure decision for freezing proposal scenarios into a versioned baseline.
 */
export function decideFreezeScenarios(options: DecideFreezeOptions): DecideFreezeResult {
  const { metadata, proposalContent, proposalSource, capturedAt } = options;

  if (metadata.status === 'verified' || metadata.status === 'archived') {
    throw new PrerequisiteError(
      `cannot freeze acceptance scenarios for ${metadata.status} change "${metadata.name}"; create a new change instead`,
    );
  }

  const scenarios = parseProposalScenarios(proposalContent, proposalSource);
  const digest = computeAcceptanceDigest(scenarios);

  if (
    metadata.acceptance &&
    metadata.acceptance.revisions.length > 0 &&
    metadata.acceptance.current_revision
  ) {
    const currentRev = metadata.acceptance.revisions.find(
      (r) => r.revision === metadata.acceptance!.current_revision,
    );
    if (currentRev) {
      if (currentRev.digest === digest) {
        return { kind: 'no-op' };
      }
      throw new PrerequisiteError(
        `acceptance scenarios are already frozen with digest "${currentRev.digest}"; use --amend-scenarios with --reason and --expected-digest to amend`,
      );
    }
  }

  const origin: AcceptanceOrigin = metadata.status === 'story' ? 'story' : 'late-capture';
  const newRevision: AcceptanceRevision = {
    revision: 1,
    digest,
    captured_at: capturedAt ?? new Date().toISOString(),
    captured_status: metadata.status,
    origin,
    reason: 'initial freeze',
    scenarios,
  };

  const updatedAcceptance: AcceptanceBaseline = {
    version: 1,
    current_revision: 1,
    revisions: [newRevision],
  };

  return {
    kind: 'freeze',
    newRevision,
    updatedAcceptance,
  };
}

export interface DecideAmendOptions {
  metadata: ChangeMetadata;
  proposalContent: string;
  proposalSource?: string;
  reason: string;
  expectedDigest: string;
  capturedAt?: string;
}

export type DecideAmendResult =
  | { kind: 'no-op' }
  | {
      kind: 'amend';
      newRevision: AcceptanceRevision;
      updatedAcceptance: AcceptanceBaseline;
    };

/**
 * Pure decision for amending already-frozen acceptance scenarios.
 */
export function decideAmendScenarios(options: DecideAmendOptions): DecideAmendResult {
  const { metadata, proposalContent, proposalSource, reason, expectedDigest, capturedAt } = options;

  if (metadata.status === 'verified' || metadata.status === 'archived') {
    throw new PrerequisiteError(
      `cannot amend acceptance scenarios for ${metadata.status} change "${metadata.name}"; create a new change instead`,
    );
  }

  if (!reason || reason.trim() === '') {
    throw new PrerequisiteError('amend-scenarios requires non-empty --reason');
  }
  if (!expectedDigest || expectedDigest.trim() === '') {
    throw new PrerequisiteError('amend-scenarios requires non-empty --expected-digest');
  }

  if (
    !metadata.acceptance ||
    metadata.acceptance.revisions.length === 0 ||
    !metadata.acceptance.current_revision
  ) {
    throw new PrerequisiteError(
      'cannot amend acceptance scenarios: no frozen baseline exists; run --freeze-scenarios first',
    );
  }

  const currentRev = metadata.acceptance.revisions.find(
    (r) => r.revision === metadata.acceptance!.current_revision,
  );
  if (!currentRev) {
    throw new PrerequisiteError(
      `corrupt acceptance baseline: current revision ${metadata.acceptance.current_revision} not found`,
    );
  }

  if (currentRev.digest !== expectedDigest.trim()) {
    throw new PrerequisiteError(
      `expected-digest mismatch: current revision digest is "${currentRev.digest}", expected "${expectedDigest.trim()}"`,
    );
  }

  const scenarios = parseProposalScenarios(proposalContent, proposalSource);
  const digest = computeAcceptanceDigest(scenarios);

  if (digest === currentRev.digest) {
    return { kind: 'no-op' };
  }

  const nextRevisionNum =
    metadata.acceptance.revisions.reduce((max, r) => Math.max(max, r.revision), 0) + 1;
  const origin: AcceptanceOrigin = metadata.status === 'story' ? 'story' : 'late-capture';
  const newRevision: AcceptanceRevision = {
    revision: nextRevisionNum,
    digest,
    previous_digest: currentRev.digest,
    captured_at: capturedAt ?? new Date().toISOString(),
    captured_status: metadata.status,
    origin,
    reason: reason.trim(),
    scenarios,
  };

  const updatedAcceptance: AcceptanceBaseline = {
    ...metadata.acceptance,
    current_revision: nextRevisionNum,
    revisions: [...metadata.acceptance.revisions, newRevision],
  };

  return {
    kind: 'amend',
    newRevision,
    updatedAcceptance,
  };
}

export interface AcceptanceReadinessResult {
  ready: boolean;
  legacy?: boolean;
  reason?: string;
  suggestion?: string;
}

/**
 * Check whether acceptance baseline is ready for proceeding past story.
 */
export function checkAcceptanceReadiness(metadata: ChangeMetadata): AcceptanceReadinessResult {
  if (!metadata.acceptance) {
    return { ready: true, legacy: true };
  }
  if (
    !metadata.acceptance.revisions ||
    metadata.acceptance.revisions.length === 0 ||
    !metadata.acceptance.current_revision
  ) {
    return {
      ready: false,
      reason: 'acceptance scenarios have not been frozen',
      suggestion: 'run `prospec change story <name> --freeze-scenarios` before proceeding',
    };
  }
  return { ready: true };
}

/**
 * Check whether current proposal scenarios differ from the frozen baseline.
 */
export function checkProposalMismatch(
  proposalContent: string,
  baselineRevision: AcceptanceRevision,
  proposalSource: string = 'proposal.md',
): boolean {
  try {
    const currentScenarios = parseProposalScenarios(proposalContent, proposalSource);
    const currentDigest = computeAcceptanceDigest(currentScenarios);
    return currentDigest !== baselineRevision.digest;
  } catch {
    return true;
  }
}
