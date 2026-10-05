import { hasUnclosedFence, withoutFencedBlocks } from './markdown-fences.js';
import { renderMarkdownTable } from './markdown-table.js';
import { PrerequisiteError } from '../types/errors.js';
import { planningVerdictToGateResult } from '../types/station.js';
import { createHash } from 'node:crypto';
import { PLANNING_VERDICTS, ESCALATION_STATIONS, ESCALATION_TRIGGERS, type AcceptedAttempt, type GateResult, type PlanDecisionOption, type VerifyGrade, type EscalationHistory, type EscalationGrant, type EscalationRecord, type EscalationStation, type EscalationTrigger } from '../types/change.js';
import { BREAK_GLASS_PREFIX } from '../types/status.js';
import type { EscalationDecision, EscalationExit, EscalationFailureDetails, EscalationReport, PartialWriteOutcome } from '../types/cascade.js';

const EXIT_DESCRIPTIONS: Record<EscalationExit['id'], EscalationExit> = {
  'revert-and-redesign': {
    id: 'revert-and-redesign', label: 'revert-and-redesign',
    description: 'Stop the current repair direction. Review and revert the unstable patch with the developer, then redesign the approach.',
  },
  'manual-intervention': {
    id: 'manual-intervention', label: 'Manual intervention',
    description: 'ESCALATE_TO_HUMAN: inspect the blocking evidence with the developer before deciding the next action.',
  },
  're-scope': {
    id: 're-scope', label: 'Re-scope',
    description: 'Have the developer revise the proposal scope or create a new Story. Scenario amendments require the existing reason/digest and lifecycle gates; they neither regress status nor unlock this event. Verified and archived changes refuse amendments.',
  },
  abandon: {
    id: 'abandon', label: 'Abandon',
    description: 'Stop this attempt with the developer and retain its artifacts and reasons. Any working-tree rollback is a separate human decision.',
  },
  'break-glass': {
    id: 'break-glass', label: 'Break glass',
    description: 'Only an explicit nonempty human reason can authorize one new attempt for the persisted current event and station via change log --result WARN --warning "Manual override: <reason>". Tests remain an independent gate.',
  },
};

const TRIGGER_REMEDIES: Record<EscalationTrigger, string> = {
  oscillation: 'Reassess the alternating failures and the repair direction.',
  fix_induced_threshold_exceeded: 'Reassess newly surfaced findings; the ratio does not prove their cause.',
  persistent_test_failure: 'Diagnose the failing suite and establish fresh certified green test evidence before merging findings.',
  max_rounds_exceeded: 'Inspect the unresolved critical findings and the exhausted review round cap.',
  unrecoverable_critical: 'Inspect the blocking critical defect and decide whether the approach remains viable.',
  station_retry_limit_exceeded: 'Inspect the repeated verifier failures or below-bar grades and their unresolved requirements.',
};

export interface EscalationAnchor {
  station: EscalationStation;
  event_id: string | null;
  ordinal: number;
}

/** One policy for status, accepted results and persistence failures. No I/O or counters. */
export function escalationDecision(input: EscalationAnchor & { trigger: EscalationTrigger }): EscalationDecision {
  const redesign = input.trigger === 'oscillation' || input.trigger === 'fix_induced_threshold_exceeded';
  const recommended: EscalationExit['id'] = input.ordinal >= 2
    ? 're-scope' : redesign ? 'revert-and-redesign' : 'manual-intervention';
  const ids: EscalationExit['id'][] = input.ordinal >= 2
    ? ['re-scope', 'abandon', 'break-glass']
    : [recommended, 're-scope', 'abandon', 'break-glass'];
  const exits = ids.map((id) => ({
    ...EXIT_DESCRIPTIONS[id],
    ...(id === 'break-glass' ? { description: EXIT_DESCRIPTIONS[id].description.replace('change log --result', `prospec change log --change <name> --skill ${input.station} --result`) } : {}),
    ...(id === 'manual-intervention' ? {
      description: `${EXIT_DESCRIPTIONS[id].description} ${TRIGGER_REMEDIES[input.trigger]}`,
    } : {}),
  }));
  return { ...input, exits, recommended };
}

/** Keeps the legacy report contract while projecting its choices from the same decision. */
export function projectEscalationReport(report: EscalationReport, anchor: EscalationAnchor): EscalationReport {
  const decision = escalationDecision({ ...anchor, trigger: report.type });
  return {
    ...report, decision,
    tradeoffOptions: decision.exits.map((exit) => `${exit.label}: ${exit.description}`),
  };
}

/** A failed event write can report an observation, but cannot mint its ordinal or grant target. */
export function escalationFailureDetails(
  history: EscalationHistory,
  station: EscalationStation,
  observed?: EscalationTrigger,
  persisted: Partial<PartialWriteOutcome> = {},
): EscalationFailureDetails {
  const trigger = observed ?? history.pending?.trigger;
  return {
    history,
    ...(trigger === undefined ? {} : { decision: escalationDecision({
      station: observed === undefined ? history.pending!.station : station,
      event_id: observed === undefined ? history.pending!.event_id : null,
      ordinal: history.events.length, trigger,
    }) }),
    ...(observed === undefined ? {} : { observed_escalation: {
      trigger: observed, station, event_id: null, ordinal: null, persisted: false,
    } as const }),
    persistence: {
      event_persisted: false, metrics_persisted: false, artifact_persisted: false,
      accepted_persisted: false, grant_consumed: false, ...persisted,
    },
  };
}

/** The ledger view accepts legacy entries without weakening the new-write schema. */
export interface EscalationLogEntry {
  skill: string;
  result: string;
  warnings?: readonly string[];
  verifier_verdict?: string;
  grade?: string;
  round?: number;
  attempt_id?: string;
  escalation?: EscalationRecord;
  accepted?: AcceptedAttempt;
}

/** A reason is data; only the explicit composed-entry service path may turn it into a grant. */
export function manualOverrideReason(warnings: readonly string[] | undefined): string | undefined {
  for (const warning of warnings ?? []) {
    const text = warning.trimStart();
    if (text.startsWith(BREAK_GLASS_PREFIX)) {
      const reason = text.slice(BREAK_GLASS_PREFIX.length).trim();
      if (reason.length > 0) return reason;
    }
  }
  return undefined;
}

/** Chronological lower-bound projection. No mutation, migration or implicit retry default. */
export function reduceEscalationHistory(
  log: readonly EscalationLogEntry[] | undefined,
  maxStationRetries: number,
): EscalationHistory {
  const entries = log ?? [];
  const history: EscalationHistory = { events: [], pending: null, grants: [], completeness: 'complete' };
  const structured = new Set<string>();
  const streaks = new Map<string, number>();
  const legacyRetry = new Map<string, string>();
  let lastReviewRound: number | undefined;
  let legacyCleanReview = false;

  const addTrigger = (record: Extract<EscalationRecord, { kind: 'trigger' }>, sourceIndex?: number) => {
    let event = history.events.find((value) => value.event_id === record.event_id && value.station === record.station);
    if (event === undefined) {
      event = {
        event_id: record.event_id, station: record.station, trigger: record.trigger,
        ordinal: history.events.length + 1, legacy: record.legacy ?? false,
        ...(sourceIndex !== undefined ? { source_index: sourceIndex } : {}),
      };
      history.events.push(event);
    }
    if (record.legacy) history.completeness = 'legacy-partial';
    history.pending = { ...event, trigger: record.trigger };
  };
  const applyRecord = (record: EscalationRecord) => {
    if (record.kind === 'trigger') {
      if (record.station === 'prospec-review') legacyCleanReview = false;
      addTrigger(record, record.source_index);
      if (!record.legacy) structured.add(record.event_id);
    } else if (record.kind === 'resolve') {
      if (history.pending?.event_id === record.event_id && history.pending.station === record.station) history.pending = null;
      for (const grant of history.grants) {
        if (grant.event_id === record.event_id && grant.station === record.station && grant.consumed_by === null) grant.expired = true;
      }
    } else if (record.kind === 'override') {
      if (!history.grants.some((grant) => grant.grant_id === record.grant_id)) {
        history.grants.push({
          event_id: record.event_id, station: record.station, grant_id: record.grant_id,
          reason: record.reason, consumed_by: null,
        });
      }
    } else {
      const grant = history.grants.find((value) => value.grant_id === record.grant_id &&
        value.event_id === record.event_id && value.station === record.station);
      if (grant !== undefined && grant.consumed_by === null) grant.consumed_by = record.attempt_id;
    }
  };
  // A materialized legacy source keeps its original position even if a later
  // counts upsert replaces that row. This never suppresses an earlier raw event.
  const materialized = new Map<number, EscalationRecord[]>();
  for (const entry of entries) {
    const record = entry.skill === 'prospec-escalation' ? entry.escalation : undefined;
    if (record?.kind === 'trigger' && record.legacy && record.source_index !== undefined) {
      const at = materialized.get(record.source_index) ?? [];
      at.push(record);
      materialized.set(record.source_index, at);
    }
  }
  entries.forEach((entry, index) => {
    for (const record of materialized.get(index) ?? []) applyRecord(record);
    const record = entry.skill === 'prospec-escalation' ? entry.escalation : undefined;
    if (record !== undefined) {
      if (!(record.kind === 'trigger' && record.legacy && record.source_index !== undefined)) applyRecord(record);
      return;
    }
    if (entry.skill === 'prospec-review') {
      // Legacy review completion was recorded by an ordinary close, without a
      // dedicated resolve entry. It resolves only the still-legacy review event;
      // counts, overrides and closes cannot supersede a structured transition.
      if (isReviewCloseEntry(entry) && legacyCleanReview && entry.attempt_id === undefined && entry.result === 'PASS' &&
          history.pending?.station === 'prospec-review' && history.pending.legacy &&
          !structured.has(history.pending.event_id)) {
        applyRecord({ kind: 'resolve', event_id: history.pending.event_id, station: 'prospec-review' });
      }
      legacyCleanReview = isReviewRoundCountsEntry(entry) && entry.result === 'PASS';
      if (entry.round !== undefined) lastReviewRound = entry.round;
      for (const warning of entry.warnings ?? []) {
        const match = /^circuit breaker tripped:\s*(\w+)\s*$/i.exec(warning.trim());
        if (!match) continue;
        legacyCleanReview = false;
        history.completeness = 'legacy-partial';
        const trigger = ESCALATION_TRIGGERS.find((value) => value === match[1]);
        if (trigger === undefined) continue;
        const round = entry.round ?? lastReviewRound;
        const event_id = round === undefined ? `legacy:review:${index}` : `review:${round}`;
        if (!structured.has(event_id)) addTrigger({
          kind: 'trigger', event_id, station: 'prospec-review', trigger, legacy: true,
        }, index);
      }
    }
    const station = ESCALATION_STATIONS.find((value) => value === entry.skill);
    if (station === undefined) return;
    if (entry.attempt_id === undefined && (entry.verifier_verdict !== undefined || entry.grade !== undefined)) {
      history.completeness = 'legacy-partial';
    }
    const legacyReason = entry.attempt_id === undefined && entry.verifier_verdict === undefined &&
      entry.result === 'WARN' ? manualOverrideReason(entry.warnings) : undefined;
    if (legacyReason !== undefined) {
      history.completeness = 'legacy-partial';
      history.grants.push({
        event_id: null, station, grant_id: null, reason: legacyReason, consumed_by: null, legacy: true,
      });
    }
    // Preserve pre-escalation legacy resets, but an unbound marker cannot
    // clear an event that was already pending at this point in the ledger.
    const verdict = station === 'prospec-verify' ? entry.grade : verifierGateResultOf(entry, history.pending === null);
    if (verdict == null) return;
    const failed = station === 'prospec-verify' ? ['B', 'C', 'D'].includes(verdict) : verdict === 'FAIL';
    const passed = station === 'prospec-verify' ? ['S', 'A'].includes(verdict) : ['PASS', 'WARN'].includes(verdict);
    if (!failed && !passed) return;
    streaks.set(station, failed ? (streaks.get(station) ?? 0) + 1 : 0);
    if (passed) {
      const prior = legacyRetry.get(station);
      if (entry.attempt_id === undefined && history.pending?.event_id === prior) history.pending = null;
      legacyRetry.delete(station);
    } else if (entry.attempt_id === undefined && (streaks.get(station) ?? 0) >= maxStationRetries && !legacyRetry.has(station)) {
      const event_id = `legacy:retry:${station}:${index}`;
      legacyRetry.set(station, event_id);
      addTrigger({ kind: 'trigger', event_id, station, trigger: 'station_retry_limit_exceeded', legacy: true }, index);
    }
  });
  return history;
}

/** Snapshot only provable legacy anchors before a sink replaces or supersedes their source. */
export function legacyEscalationRecords(log: readonly EscalationLogEntry[], maxStationRetries: number): EscalationRecord[] {
  const existing = new Set(log.flatMap((entry) => entry.escalation?.kind === 'trigger' ? [entry.escalation.event_id] : []));
  return reduceEscalationHistory(log, maxStationRetries).events
    .filter((event) => event.legacy && !existing.has(event.event_id))
    .map((event) => ({
      kind: 'trigger', event_id: event.event_id, station: event.station, trigger: event.trigger,
      legacy: true, source_index: event.source_index,
    }));
}

/** Stable JSON identity. Unmeasurable values never collapse to a successful empty digest. */
export function canonicalDigest(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype) {
      return Object.fromEntries(Object.entries(input)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, canonical(item)]));
    }
    throw new TypeError('Attempt identity contains an unrepresentable input');
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/** Callers project their named causal inputs; output dates and paths are not those inputs. */
export function canonicalAttemptId(station: EscalationStation, value: unknown): string {
  return `${station}:${canonicalDigest(value)}`;
}

export type EscalationAdmission<E extends EscalationLogEntry> =
  | { kind: 'replay'; entry: E }
  | { kind: 'accept'; grant?: EscalationGrant }
  | { kind: 'refused'; decision: EscalationDecision };

export function applicableGrant(history: EscalationHistory, station: EscalationStation): EscalationGrant | undefined {
  const pending = history.pending;
  if (pending === null || pending.station !== station) return undefined;
  return [...history.grants].reverse().find((grant) => grant.event_id === pending.event_id &&
    grant.station === station && grant.grant_id !== null && !grant.legacy && !grant.expired && grant.consumed_by === null);
}

/** Admission is independent of tests/live-evidence gates, which each sink must still enforce. */
export function admitEscalation<E extends EscalationLogEntry>(
  history: EscalationHistory,
  log: readonly E[],
  station: EscalationStation,
  attemptId: string,
): EscalationAdmission<E> {
  const replay = log.find((entry) => entry.skill === station && entry.attempt_id === attemptId && entry.accepted !== undefined);
  if (replay !== undefined) return { kind: 'replay', entry: replay };
  const grant = applicableGrant(history, station);
  if (history.pending !== null && history.events.length >= 2 && grant === undefined) {
    return { kind: 'refused', decision: escalationDecision({
      event_id: history.pending.event_id, station: history.pending.station,
      trigger: history.pending.trigger, ordinal: history.events.length,
    }) };
  }
  return grant === undefined ? { kind: 'accept' } : { kind: 'accept', grant };
}

/** Returned transitions are committed alongside the accepted receipt, by the metadata owner. */
export function escalationTransitions(history: EscalationHistory, input: {
  station: EscalationStation;
  event_id: string;
  trigger: EscalationTrigger | null;
  attempt_id: string;
  grant?: EscalationGrant;
}): EscalationRecord[] {
  const records: EscalationRecord[] = [];
  if (input.grant?.grant_id && input.grant.event_id) {
    records.push({
      kind: 'consume', event_id: input.grant.event_id, station: input.station,
      grant_id: input.grant.grant_id, attempt_id: input.attempt_id,
    });
  }
  if (input.trigger !== null) {
    if (history.pending?.event_id !== input.event_id || history.pending.station !== input.station ||
        history.pending.trigger !== input.trigger) {
      records.push({ kind: 'trigger', event_id: input.event_id, station: input.station, trigger: input.trigger });
    }
  } else if (history.pending?.station === input.station) {
    records.push({ kind: 'resolve', event_id: history.pending.event_id, station: input.station });
  }
  return records;
}

export type ProvenanceEntry = { skill: string; result: string; warnings?: readonly string[]; verifier_verdict?: string; escalation?: EscalationRecord };

/** Round counts are metrics, never an ordinary review close. */
export function isReviewRoundCountsEntry(entry: { skill?: string; round?: number; escalation?: unknown; accepted?: unknown }): boolean {
  return entry.skill === 'prospec-review' && entry.round !== undefined &&
    entry.escalation === undefined && entry.accepted === undefined;
}

/** Ordinary review close signal; event transitions and accepted receipts do not close rounds. */
export function isReviewCloseEntry(entry: { skill?: string; round?: number; escalation?: unknown; accepted?: unknown }): boolean {
  return entry.skill === 'prospec-review' && entry.round === undefined &&
    entry.escalation === undefined && entry.accepted === undefined;
}

/**
 * The ONE per-entry plan/tasks verifier provenance rule: an entry stamped with a
 * known `verifier_verdict` is the verifier's word (`FLAWS` → FAIL), a Break-Glass
 * WARN counts as WARN, and every other entry — a station's own Exit Gate note, a
 * sign-off — is not a verifier result (null). An unknown stamp is not a verdict.
 */
export function verifierGateResultOf(entry: ProvenanceEntry, allowLegacyOverride = true): GateResult | null {
  if (entry.escalation !== undefined) return null;
  if (entry.verifier_verdict !== undefined) {
    const verdict = PLANNING_VERDICTS.find((v) => v === entry.verifier_verdict);
    return verdict === undefined ? null : planningVerdictToGateResult(verdict);
  }
  if (
    allowLegacyOverride && entry.result === 'WARN' && manualOverrideReason(entry.warnings) !== undefined
  ) {
    return 'WARN';
  }
  return null;
}

/** A station's latest entry that is a verifier result (scanned latest-first by provenance), or null. */
export function latestVerifierEntry<E extends ProvenanceEntry>(
  qualityLog: ReadonlyArray<E> | undefined,
  skill: string,
  history?: EscalationHistory,
): E | null {
  if (qualityLog === undefined) return null;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== skill) continue;
    if (verifierGateResultOf(entry, history?.pending == null) !== null) return entry;
  }
  return null;
}

/** A station's latest entry recorded from a verifier report (`verifier_verdict`), or null —
 *  unlike `latestVerifierEntry`, a Break-Glass WARN is skipped because it audited nothing. */
export function latestStampedVerifierEntry<E extends ProvenanceEntry>(
  qualityLog: ReadonlyArray<E> | undefined,
  skill: string,
): E | null {
  if (qualityLog === undefined) return null;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry !== undefined && entry.skill === skill && entry.verifier_verdict !== undefined) return entry;
  }
  return null;
}

/** A station's latest recorded verifier result, or null. */
export function latestVerifierResult(
  qualityLog: ReadonlyArray<ProvenanceEntry> | undefined,
  skill: string,
  history?: EscalationHistory,
): GateResult | null {
  const entry = latestVerifierEntry(qualityLog, skill, history);
  return entry === null ? null : verifierGateResultOf(entry, history?.pending == null);
}

/**
 * The option of the latest plan sign-off that still counts, or null. A sign-off
 * counts only when it sits after the latest plan verifier result and that result is
 * PASS/WARN — judged by quality_log position, because `date` is day-granular and two
 * re-plans on one day would be indistinguishable. A later verifier entry supersedes it.
 */
export function latestFreshPlanSignoff(
  qualityLog: ReadonlyArray<ProvenanceEntry & { signoff_option?: PlanDecisionOption }> | undefined,
  history?: EscalationHistory,
): PlanDecisionOption | null {
  if (qualityLog === undefined) return null;
  let latestSignoff: PlanDecisionOption | null = null;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== 'prospec-plan') continue;
    if (latestSignoff === null && entry.signoff_option !== undefined) {
      latestSignoff = entry.signoff_option;
      continue;
    }
    const result = verifierGateResultOf(entry, history?.pending == null);
    if (result === null) continue;
    return latestSignoff !== null && result !== 'FAIL' ? latestSignoff : null;
  }
  return null;
}

export function hasPlanSignoffAfterVerifier(
  qualityLog: Parameters<typeof latestFreshPlanSignoff>[0],
  history?: EscalationHistory,
): boolean {
  return latestFreshPlanSignoff(qualityLog, history) !== null;
}


/**
 * Consecutive below-bar grades (B, C, D) from the tail of quality_log.
 * An S or A resets the streak to 0. Non-verify entries or entries without
 * a grade are skipped.
 */
export function verifyBelowBarStreak(
  qualityLog: Array<{ skill: string; grade?: VerifyGrade }> | undefined,
): number {
  if (qualityLog === undefined) return 0;
  let streak = 0;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== 'prospec-verify' || entry.grade === undefined) {
      continue;
    }
    if (entry.grade === 'B' || entry.grade === 'C' || entry.grade === 'D') {
      streak++;
    } else if (entry.grade === 'S' || entry.grade === 'A') {
      break;
    }
  }
  return streak;
}

/**
 * Consecutive verifier FAIL results for a station from the tail of quality_log.
 *
 * Scanned from the latest entry backwards, using the identical provenance rule as
 * `latestVerifierResult` (`lib/change-metadata`): only an entry the sink stamped with `verifier_verdict` counts
 * (`FLAWS` → FAIL, `PASS` or `WARN` resets the streak), plus a Break-Glass `WARN`
 * whose warning opens with `BREAK_GLASS_PREFIX` (resets the streak). Every other
 * entry under the skill (the station's own unstamped Exit Gate PASS/WARN/FAIL) is
 * neither a verifier result nor able to hide one, so it is skipped.
 */
export function planningFlawsStreak(
  qualityLog:
    | Array<ProvenanceEntry>
    | undefined,
  skill: string,
  history?: EscalationHistory,
): number {
  if (qualityLog === undefined) return 0;
  let streak = 0;
  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry === undefined || entry.skill !== skill) continue;
    const result = verifierGateResultOf(entry, history?.pending == null);
    if (result === null) continue;
    // PASS, WARN or a Break-Glass WARN resets the streak
    if (result !== 'FAIL') break;
    streak++;
  }
  return streak;
}

const HISTORY_START = '<!-- prospec:escalation-history -->';
const HISTORY_END = '<!-- prospec:escalation-history-end -->';

function historyMarkers(lines: string[]): { starts: number[]; ends: number[] } {
  const visible = withoutFencedBlocks(lines).map(line => line.trim());
  return {
    starts: visible.flatMap((line, i) => line === HISTORY_START ? [i] : []),
    ends: visible.flatMap((line, i) => line === HISTORY_END ? [i] : []),
  };
}

/** Untrusted evidence may quote fenced history, but cannot introduce owned markup. */
export function hasUnsafeEscalationEvidence(content: string): boolean {
  const lines = content.split('\n');
  const { starts, ends } = historyMarkers(lines);
  return hasUnclosedFence(lines) || starts.length > 0 || ends.length > 0;
}

/** The same durable ledger projection appears in status, verify and archive. */
export function renderEscalationHistory(history: EscalationHistory): string {
  const events = renderMarkdownTable(['Ordinal', 'Station', 'Trigger', 'Event', 'State'], history.events.map(event => [
    String(event.ordinal), event.station, event.trigger, event.event_id,
    history.pending?.event_id === event.event_id ? 'pending' : 'not pending',
  ]));
  const grants = renderMarkdownTable(['Event', 'Station', 'Reason', 'Usage'], history.grants.map(grant => [
    grant.event_id ?? 'legacy — unbound', grant.station, grant.reason,
    grant.legacy ? 'legacy — not authorization' : grant.consumed_by ? `consumed by ${grant.consumed_by}` : grant.expired ? 'expired unused' : 'available for one attempt',
  ]));
  return [HISTORY_START, '## Escalation History', '',
    `Lifetime events: ${history.events.length}. Overrides: ${history.grants.length}. Completeness: ${history.completeness}.`, '',
    events, '', grants, HISTORY_END].join('\n');
}

/** Replace only the owned, unfenced block; keep every neighboring byte. */
export function upsertEscalationHistory(content: string, history: EscalationHistory): string {
  const lines = content.split('\n');
  if (hasUnclosedFence(lines)) throw new PrerequisiteError('Unclosed Markdown fence around escalation history', 'Close the fence before refreshing history');
  const { starts, ends } = historyMarkers(lines);
  if (starts.length === 0 && ends.length === 0) {
    if (history.events.length === 0 && history.grants.length === 0) return content;
    return `${content}${content.endsWith('\n') ? '\n' : '\n\n'}${renderEscalationHistory(history)}\n`;
  }
  if (starts.length !== 1 || ends.length !== 1 || starts[0]! >= ends[0]!) {
    throw new PrerequisiteError('Ambiguous escalation history markers', 'Keep one complete owned history block outside Markdown fences');
  }
  const start = lines.slice(0, starts[0]).reduce((n, line) => n + line.length + 1, 0);
  const end = lines.slice(0, ends[0]).reduce((n, line) => n + line.length + 1, 0) + lines[ends[0]!]!.replace(/\r$/, '').length;
  const newline = lines[starts[0]!]!.endsWith('\r') ? '\r\n' : '\n';
  return content.slice(0, start) + renderEscalationHistory(history).replaceAll('\n', newline) + content.slice(end);
}
