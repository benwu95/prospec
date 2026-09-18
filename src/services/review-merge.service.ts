import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError, TestGateError } from '../types/errors.js';
import {
  ReviewFindingsInputSchema,
  REVIEW_RESOLVED_STATUSES,
  hasReviewStatus,
  type ReviewFinding,
  type TestEvidenceDecision,
  type TestGateOutcome,
} from '../types/station.js';
import { atomicWrite, readFileIfExists } from '../lib/fs-utils.js';
import {
  findUnsafeBlockField,
  EVIDENCE_MARKER_PREFIX,
} from '../lib/delegated-evidence.js';
import {
  parseReviewDocument,
  mergeFindings,
  roundCounts,
  escapedCellsFor,
  renderReviewDocument,
  parseReviewMetricsStrict,
  readTestFailureStreak,
  reduceTestFailureStreak,
  replaceReviewMetrics,
  evidenceBlocksFor,
  type ReviewRoundCounts,
  type TestFailureObservation,
} from '../lib/review-merge.js';
import {
  appendTestGateWarning,
  readChangeMetadata,
  writeChangeMetadataDoc,
} from '../lib/change-metadata.js';
import { assessCurrentTestEvidence } from '../lib/drift-assessment.js';
import { ReviewCircuitBreaker } from '../lib/review-circuit-breaker.js';
import type { Document } from 'yaml';
import type { CircuitBreakerState } from '../types/cascade.js';
import type { ChangeMetadata } from '../types/change.js';
import { resolveChange } from './change-resolver.js';

export interface ReviewMergeOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** Path to this round's findings JSON (an array of findings). */
  findingsPath: string;
  /** In-loop review round (starts at 1 on every entry into review). Omitted: the
   *  merge re-runs the round review.md records until `prospec change log` has
   *  closed it, then opens the next one. Explicit: that round or the next one. */
  round?: number;
  /** Self-reported token spend for this review round. */
  spend?: number;
  /** Total token spend budget for review loop. */
  budget?: number;
  /** Maximum allowed fix-induced ratio in round > 1 before tripping (default 0.5). */
  maxFixInducedRatio?: number;
  /** Maximum allowed review rounds before hard cap tripping (default 3). */
  maxRounds?: number;
  /** Maximum allowed oscillation flips before tripping (default 2). */
  maxFlips?: number;
  /** Lenses invoked in this round. */
  lenses?: string[];
}

/**
 * One critical of the round, reduced to what the orchestrating context needs to
 * confirm the defect exists before any fix: the claim, and the command that
 * shows it. Deliberately NOT carrying `evidence` — the prose is in review.md,
 * and keeping it out of here is the whole point of the contract.
 */
export interface ReviewCriticalDigest {
  id?: string;
  location: string;
  lens: string;
  summary: string;
  repro?: string;
}

export interface ReviewRoundStats extends ReviewRoundCounts {
  roundNumber: number;
  spend?: number;
  cumulativeSpend?: number;
  fixInducedRatio?: number;
  budget?: number;
}

export interface ReviewMergeResult {
  changeName: string;
  reviewPath: string;
  /** Cumulative table size after the merge. */
  totalRows: number;
  /** Evidence blocks the document holds after the merge. */
  evidenceBlocks: number;
  /** This ROUND's criticals as a bounded digest — the caller's whole intake. */
  criticals: ReviewCriticalDigest[];
  /** This ROUND's structured counts and metrics — the `change log` review fields. */
  round: ReviewRoundStats;
  /** Cells of this round's findings the table engine rewrote (`|` / line break). */
  escapedCells: number;
  /** Dual-axis circuit breaker evaluation state. */
  circuitBreaker?: CircuitBreakerState;
  /** How the fresh-test gate admitted this merge. */
  testGate: TestGateOutcome;
}

/** What the gate's decision means for the observed failure streak. */
function observationOf(decision: TestEvidenceDecision): TestFailureObservation {
  if (decision.verdict === 'pass') return { kind: 'green' };
  if (decision.verdict === 'refuse' && decision.failedAttemptId !== undefined) {
    return { kind: 'failed', attemptId: decision.failedAttemptId };
  }
  return { kind: 'none' };
}

function sameExemption(a: TestEvidenceDecision, b: TestEvidenceDecision): boolean {
  return a.verdict === 'exempt' && b.verdict === 'exempt' && a.exemption === b.exemption && a.reason === b.reason;
}

/**
 * `prospec review merge` — deterministic bookkeeping for the cumulative
 * review.md table. The reviewer supplies the round's findings as JSON (their
 * judgment, including cross-round identity via `id`); the merge, severity max,
 * carry-forward, and rendering are mechanical (lib/review-merge).
 */
export async function execute(options: ReviewMergeOptions): Promise<ReviewMergeResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change does this review round belong to?',
  );

  if (!fs.existsSync(options.findingsPath)) {
    throw new PrerequisiteError(
      `Findings file not found: ${options.findingsPath}`,
      'Write this round\'s findings as a JSON array and pass its path via --findings',
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(options.findingsPath, 'utf-8'));
  } catch {
    throw new PrerequisiteError(
      `Findings file is not valid JSON: ${options.findingsPath}`,
      'Emit the findings as a JSON array of {id?, location, severity, lens, status?, summary}',
    );
  }
  const parsed = ReviewFindingsInputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new PrerequisiteError(
      `Findings failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'Each finding needs location, severity (minor|major|critical), lens, and summary; a critical also needs repro, and repro/evidence need id',
    );
  }
  const findings: ReviewFinding[] = parsed.data;

  // Refuse BEFORE the first byte. Both halves of an evidence block are written
  // to review.md as raw lines — the prose AND the `id` that anchors it — so a
  // marker in either re-parses as structure and the document comes back
  // different than it went in. The guard therefore runs over the block as it
  // will be rendered, not over `evidence` alone: an earlier version checked only
  // the prose on the false premise that "the relayed fields land inside table
  // cells", and a crafted id duly forged a second block under another finding's
  // anchor, which last-wins parsing adopted in place of the genuine evidence.
  for (const f of findings) {
    if (f.id === undefined) continue;
    const unsafe = findUnsafeBlockField({ key: f.id, body: f.evidence ?? '' });
    if (unsafe !== undefined) {
      throw new PrerequisiteError(
        `Finding ${f.id} carries \`${EVIDENCE_MARKER_PREFIX}\` (or a line break) in its ${unsafe === 'key' ? 'id' : 'evidence'} — that marker is review.md's own block grammar`,
        `Remove or rephrase it in that finding's ${unsafe === 'key' ? 'id' : 'evidence'}; review.md was left untouched`,
      );
    }
  }

  const reviewPath = path.join(cwd, '.prospec', 'changes', changeName, 'review.md');
  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  let priorReviewRounds = 0;
  let metadata: ChangeMetadata | undefined;
  let metadataDoc: Document | undefined;
  let metadataBytes: Buffer | undefined;
  if (fs.existsSync(metadataPath)) {
    try {
      metadataBytes = fs.readFileSync(metadataPath);
      const read = readChangeMetadata(metadataPath, changeName);
      metadata = read.metadata;
      metadataDoc = read.doc;
      // Only completed review rounds count — the test gate's exemption WARN is
      // written under its own producer label precisely so it never lands here.
      const reviewEntries = (metadata.quality_log ?? []).filter((e) => e.skill === 'prospec-review');
      priorReviewRounds = reviewEntries.length;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  const existingContent = await readFileIfExists(reviewPath);
  // Strict: a duplicate or malformed metrics comment is refused before the first
  // byte — a corrupt streak must never read as zero.
  const docMetrics = parseReviewMetricsStrict(existingContent);
  const { rows } = parseReviewDocument(existingContent);

  const provenanceDigest = metadata?.review_provenance?.digest;
  const loopClosedSinceLastMerge =
    provenanceDigest !== undefined && provenanceDigest !== docMetrics.provenanceDigest;
  const loopBase = loopClosedSinceLastMerge
    ? (docMetrics.round ?? priorReviewRounds)
    : (docMetrics.loopBase ?? 0);

  const loggedRounds = priorReviewRounds;
  if (options.round !== undefined && docMetrics.round !== undefined) {
    const recordedInLoop = loopClosedSinceLastMerge ? 0 : docMetrics.round - loopBase;
    if (options.round < recordedInLoop || options.round > recordedInLoop + 1) {
      throw new PrerequisiteError(
        `--round ${options.round} is out of sequence: review.md records in-loop round ${recordedInLoop}`,
        recordedInLoop === 0
          ? 'A new review loop starts at --round 1'
          : `Pass --round ${recordedInLoop} to re-run the current round or --round ${recordedInLoop + 1} to open the next one`,
      );
    }
  }
  // Test gate (REQ-LIB-080 / REQ-CLI-028) — after every pre-existing input and
  // round refusal (those write nothing), before any merge. The TARGET's live
  // facts decide; a refusal's only permitted write is the bounded test-failure
  // metrics splice (REQ-SERVICES-098/086), never a findings merge.
  const breaker = new ReviewCircuitBreaker({
    maxReviewRounds: options.maxRounds,
    maxOscillationFlips: options.maxFlips,
    maxFixInducedRatio: options.maxFixInducedRatio,
    maxSpend: options.budget,
  });
  const threshold = breaker.getMaxConsecutiveTestFailures();
  let assessment = await assessCurrentTestEvidence(cwd, changeName);
  const decision = assessment.decision;
  const streak = readTestFailureStreak(docMetrics);
  const nextStreak = reduceTestFailureStreak(streak, observationOf(decision), threshold);
  breaker.setTestFailureStreak(nextStreak);

  const reviewBytesStable = async (): Promise<boolean> => (await readFileIfExists(reviewPath)) === existingContent;
  const metadataBytesStable = (): boolean =>
    metadataBytes === undefined ? !fs.existsSync(metadataPath) : fs.existsSync(metadataPath) && metadataBytes.equals(fs.readFileSync(metadataPath));
  const unstable = (warningRecorded: boolean): TestGateError =>
    new TestGateError({
      changeName,
      entrance: 'review merge',
      reason: 'test evidence, configuration, metadata or review.md changed before the write — nothing further was written',
      warningRecorded,
    });

  if (decision.verdict === 'refuse') {
    if (!assessment.recheck() || !(await reviewBytesStable()) || !metadataBytesStable()) throw unstable(false);
    // Only the test axis is judged on a refusal: the findings axes were reported
    // when their round merged, and re-feeding the stale table would re-trip them
    // under a test-refusal label.
    const blocked = breaker.checkCircuitBreaker();
    const streakChanged =
      nextStreak.consecutiveTestFailures !== streak.consecutiveTestFailures ||
      nextStreak.testFailureAttemptIds.join('\0') !== streak.testFailureAttemptIds.join('\0');
    if (streakChanged) {
      // A write failure propagates as itself: the count was NOT recorded.
      await atomicWrite(reviewPath, replaceReviewMetrics(existingContent, nextStreak));
    }
    throw new TestGateError({
      changeName,
      entrance: 'review merge',
      reason: decision.reason,
      ...(blocked.tripped ? { circuitBreaker: blocked } : {}),
    });
  }

  // Exemption: the WARN lands FIRST through the metadata owner, then the facts are
  // re-assessed and the review bytes re-read; a refusal after that point keeps the
  // truthful warning (the one disclosed metadata exception) and writes nothing else.
  let testGate: TestGateOutcome = { verdict: 'pass', warningRecorded: false };
  if (decision.verdict === 'exempt') {
    // An exemption ALWAYS persists its WARN: `assessCurrentTestEvidence` above
    // refuses an unreadable target record, so a document is always in hand here.
    // Asserting that keeps "no exemption merges without its audit trail" a
    // structural guarantee rather than a fall-through branch that would merge
    // with no `tests: not-adjudicated` entry at all.
    if (metadataDoc === undefined || metadata === undefined) {
      throw new PrerequisiteError(
        `metadata.yaml for change "${changeName}" is unavailable for the test-gate exemption warning`,
        `Restore .prospec/changes/${changeName}/metadata.yaml — an exemption is recorded in metadata or it is not granted`,
      );
    }
    const warningRecorded = appendTestGateWarning(metadataDoc, metadata, 'review merge', decision.reason);
    if (warningRecorded) {
      if (!assessment.recheck() || !(await reviewBytesStable()) || !metadataBytesStable()) throw unstable(false);
      await writeChangeMetadataDoc(metadataPath, metadataDoc, changeName);
      metadataBytes = fs.readFileSync(metadataPath);
      try {
        assessment = await assessCurrentTestEvidence(cwd, changeName);
      } catch (err) {
        throw new TestGateError({
          changeName,
          entrance: 'review merge',
          reason: `revalidation after the exemption warning failed: ${err instanceof Error ? err.message : String(err)}`,
          warningRecorded: true,
        });
      }
      if (!sameExemption(decision, assessment.decision) || !(await reviewBytesStable())) throw unstable(true);
    }
    testGate = { verdict: 'exempt', exemption: decision.exemption, reason: decision.reason, warningRecorded };
  }
  const warningRecorded = testGate.warningRecorded;

  let roundNumber: number;
  if (options.round !== undefined) {
    roundNumber = loopBase + options.round;
  } else if (loopClosedSinceLastMerge) {
    roundNumber = loopBase + 1;
  } else if (docMetrics.round !== undefined) {
    // A round is closed by `prospec change log`, never by the merge itself, so a
    // merge re-run before the log stays on the recorded round (byte-idempotent).
    roundNumber = loggedRounds >= docMetrics.round ? docMetrics.round + 1 : docMetrics.round;
  } else if (loggedRounds > 0) {
    roundNumber = loggedRounds + 1;
  } else if (rows.length > 0) {
    const maxOrigin = Math.max(...rows.map((r) => r.origin_round ?? 1), 1);
    roundNumber = maxOrigin + 1;
  } else {
    roundNumber = 1;
  }

  const finalRoundNumber = roundNumber;
  const inLoopRound = Math.max(1, finalRoundNumber - loopBase);
  const baseRound = loopBase + 1;

  const isNewRound = docMetrics.round === undefined || finalRoundNumber > docMetrics.round;
  const priorCumulative =
    docMetrics.spendBefore !== undefined
      ? docMetrics.spendBefore + (docMetrics.lastRoundSpend ?? 0)
      : (docMetrics.cumulativeSpend ?? 0);
  const spendBefore = loopClosedSinceLastMerge
    ? 0
    : isNewRound
      ? priorCumulative
      : (docMetrics.spendBefore ?? 0);
  const roundSpend = options.spend ?? (isNewRound ? undefined : docMetrics.lastRoundSpend);
  const hasSpendTracking =
    options.spend !== undefined ||
    docMetrics.spendBefore !== undefined ||
    docMetrics.lastRoundSpend !== undefined ||
    docMetrics.cumulativeSpend !== undefined;
  const cumulativeSpend = hasSpendTracking ? spendBefore + (roundSpend ?? 0) : undefined;

  const merged = mergeFindings(rows, findings, finalRoundNumber);

  const trials: Record<string, (boolean | undefined)[]> = loopClosedSinceLastMerge
    ? {}
    : { ...(docMetrics.trials ?? {}) };
  const slot = Math.max(0, inLoopRound - 1);
  for (const f of findings) {
    if (!f.id) continue;
    const passed = hasReviewStatus(REVIEW_RESOLVED_STATUSES, f.status);
    const history = [...(trials[f.id] ?? [])];
    history[slot] = passed;
    trials[f.id] = history;
  }

  // Evaluate Circuit Breaker
  breaker.setReviewRound(inLoopRound);
  if (cumulativeSpend !== undefined && cumulativeSpend > 0) {
    breaker.recordSpend(cumulativeSpend);
  }
  for (const [sig, hist] of Object.entries(trials)) {
    for (const passed of hist) {
      if (passed !== undefined) {
        breaker.recordTrial(sig, passed);
      }
    }
  }
  const circuitBreaker = breaker.checkCircuitBreaker({
    round: inLoopRound,
    findings: merged,
    baseRound,
  });

  const combinedLenses =
    options.lenses === undefined
      ? docMetrics.lenses
      : Array.from(new Set([...(docMetrics.lenses ?? []), ...options.lenses]));

  // Pre-write fence: the verdict, the target's metadata and review.md must be the
  // ones observed. After an exemption WARN the assessment is the re-obtained one.
  if (!assessment.recheck() || !(await reviewBytesStable()) || !metadataBytesStable()) throw unstable(warningRecorded);
  const rendered = renderReviewDocument(existingContent, merged, changeName, {
      round: finalRoundNumber,
      spendBefore: hasSpendTracking ? spendBefore : undefined,
      lastRoundSpend: roundSpend,
      cumulativeSpend,
      loopBase,
      provenanceDigest: provenanceDigest ?? docMetrics.provenanceDigest,
      lenses: combinedLenses && combinedLenses.length > 0 ? combinedLenses : undefined,
      trials,
      // A green merge clears the streak (rendered as absent); an exemption carries
      // the observed streak forward untouched — it never resets it.
      consecutiveTestFailures: nextStreak.consecutiveTestFailures,
      testFailureAttemptIds: nextStreak.testFailureAttemptIds,
    });
  try {
    await atomicWrite(reviewPath, rendered);
  } catch (err) {
    // After a persisted exemption WARN the outcome is warning-only and must say so;
    // otherwise the I/O failure is reported as itself.
    if (!warningRecorded) throw err;
    throw new TestGateError({
      changeName,
      entrance: 'review merge',
      reason: `review.md write failed after the exemption warning was recorded: ${err instanceof Error ? err.message : String(err)}`,
      warningRecorded: true,
    });
  }

  return {
    changeName,
    reviewPath: path.join('.prospec', 'changes', changeName, 'review.md'),
    totalRows: merged.length,
    evidenceBlocks: evidenceBlocksFor(merged).length,
    criticals: findings
      .filter((f) => f.severity === 'critical')
      .map((f) => ({
        id: f.id,
        location: f.location,
        lens: f.lens,
        summary: f.summary,
        repro: f.repro,
      })),
    round: {
      ...roundCounts(findings),
      roundNumber: finalRoundNumber,
      spend: roundSpend,
      cumulativeSpend: hasSpendTracking ? cumulativeSpend : undefined,
      fixInducedRatio: circuitBreaker?.fixInducedRatio,
      budget: options.budget,
    },
    escapedCells: escapedCellsFor(merged, findings),
    circuitBreaker,
    testGate,
  };
}
