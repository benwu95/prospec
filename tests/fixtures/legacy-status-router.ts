/**
 * Characterization fixture: `routeChange` exactly as it stood before the router was
 * rewritten as an ordered rule table, copied verbatim with only its import paths and
 * name changed. `tests/unit/lib/status-router-equivalence.test.ts` compares the rule
 * table against it. The next change that alters routing output on purpose deletes this
 * fixture together with that test — the rule-table suite and the router unit tests
 * carry on without it.
 */
import type { ChangeRoute, ChangeRouteFacts, SddStation } from '../../src/types/status.js';
import { BREAK_GLASS_PREFIX, formatWorkflowReason, PLAN_SIGNOFF_REMEDIES, PLAN_VERSION_SIGNOFF_REMEDIES } from '../../src/types/status.js';
import { forbiddenArtifacts, isStatusBefore } from '../../src/types/change.js';
import { RELATED_MODULE_HALT_CONDITION } from '../../src/lib/knowledge-sync.js';
import { applicableGrant, escalationDecision } from '../../src/lib/escalation.js';

/** A recorded grade that did not (or would not) advance the status. */
function gradeBelowBar(grade: ChangeRouteFacts['lastVerifyGrade']): boolean {
  return grade !== null && grade !== 'S' && grade !== 'A';
}

/** `status` value → the station it marks as completed. */
const STATUS_STATION: Record<ChangeRouteFacts['status'], SddStation> = {
  story: 'story',
  plan: 'plan',
  tasks: 'tasks',
  implemented: 'implement',
  verified: 'verify',
  archived: 'archive',
  abandoned: 'archive',
};

/** Route one in-flight change to its next SDD station. Pure — no I/O. */
export function legacyRouteChange(facts: ChangeRouteFacts): ChangeRoute {
  const forbidden = forbiddenArtifacts(facts.scale);

  const base = {
    name: facts.name,
    ...(facts.premise === undefined ? {} : { premise: facts.premise }),
    status: facts.status,
    scale: facts.scale,
    // `implemented` marks `implement` as completed — except for a scale with no
    // task list, which never ran that station: its `implemented` came from the
    // promotion. Naming `implement` there would credit a station whose artifacts
    // that scale's contract forbids.
    current:
      facts.status === 'implemented' && forbidden.includes('tasks.md')
        ? 'promote'
        : STATUS_STATION[facts.status],
    // Display-only pass-through, spread conditionally: writing `issue:
    // facts.issue` would put the key on every route, and the formatter's
    // print-only-when-registered branch reads absence, not falsiness. The same
    // shape carries unresolved WARNs — absent when there are none.
    ...(facts.issue === undefined ? {} : { issue: facts.issue }),
    ...(facts.unresolvedWarnings === undefined || facts.unresolvedWarnings.length === 0
      ? {}
      : { unresolvedWarnings: facts.unresolvedWarnings }),
    ...(facts.escalationHistory === undefined ? {} : { escalationHistory: facts.escalationHistory }),
  } satisfies Omit<ChangeRoute, 'next' | 'code' | 'blockingGates' | 'reasons'>;

  // A scale with neither a plan nor a task list has NO forward planning station:
  // its lifecycle entry is the promotion itself, landing at `implemented`. Until
  // it gets there the promotion is simply incomplete — routing such a change to
  // plan or tasks names a station the CLI refuses.
  if (
    forbidden.includes('plan.md') &&
    forbidden.includes('tasks.md') &&
    facts.premise?.state !== 'blocked' &&
    isStatusBefore(facts.status, 'implemented')
  ) {
    return {
      ...base,
      next: 'promote',
      code: 'PROMOTION_INCOMPLETE',
      blockingGates: [
        'promotion scaffold complete — `prospec validate promote-scaffold` PASSes and `status: implemented` is set',
      ],
      reasons: [
        `scale: ${facts.scale} — its contract has no plan and no task list, so the lifecycle entry is the promotion itself; \`status: ${facts.status}\` is before \`implemented\`, so that promotion has not landed`,
      ],
    };
  }

  const history = facts.escalationHistory;
  if (facts.status !== 'archived' && facts.status !== 'abandoned' && history?.pending != null) {
    const pending = history.pending;
    const decision = escalationDecision({
      event_id: pending.event_id, station: pending.station,
      trigger: pending.trigger, ordinal: history.events.length,
    });
    const grant = applicableGrant(history, pending.station);
    const station = pending.station.slice('prospec-'.length) as 'plan' | 'tasks' | 'review' | 'verify';
    return {
      ...base, escalation: decision,
      next: grant === undefined ? null : station,
      code: grant === undefined ? 'ESCALATE_TO_HUMAN' : 'LIFECYCLE_NEXT',
      blockingGates: grant === undefined
        ? ['Present the CLI exits to the developer; a break-glass grant requires an explicit nonempty reason for this event and station']
        : ['One new accepted attempt is authorized; existing test and live-evidence gates still apply'],
      reasons: [`${pending.trigger}: ${history.events.length} lifetime escalation event(s); recommended: ${decision.recommended}`],
    };
  }

  if (facts.status !== 'archived' && facts.status !== 'abandoned' && facts.premise?.state === 'blocked') {
    return {
      ...base, next: 'explore', code: 'PREMISE_INCOMPLETE',
      blockingGates: facts.premise.findings,
      reasons: [facts.premise.remedy, facts.premise.limitation],
    };
  }

  switch (facts.status) {
    case 'story': {
      // A scale that also forbids tasks.md already returned above, so forbidding
      // plan.md here means exactly the quick skip — the second clause would be a
      // tautology, and a condition that cannot fail pins nothing.
      if (forbidden.includes('plan.md')) {
        return {
          ...base,
          next: 'tasks',
          code: 'QUICK_SKIPS_PLAN',
          blockingGates: ['tasks.md created (decomposed directly from proposal.md)'],
          reasons: [
            `scale: ${facts.scale} — story → tasks is the single legal skip; no plan.md/delta-spec.md by contract (re-checked at the prospec-archive Entry Gate)`,
          ],
        };
      }
      return {
        ...base,
        next: 'plan',
        code: 'LIFECYCLE_NEXT',
        blockingGates: ['plan.md + delta-spec.md created'],
        reasons: ['status `story` — next station per lifecycle order'],
      };
    }

    case 'plan': {
      // The plan verifier's recorded FLAWS (result FAIL) outranks every forward
      // edge, design included: a plan that failed its own audit is revised before
      // anything is built on it. Superseded only by a later PASS or Break-Glass
      // WARN — the service applies that reading, the router just trusts the fact.
      if (facts.lastPlanVerifierResult === 'FAIL') {
        if (history === undefined && facts.planFlawsStreak >= facts.maxStationRetries) {
          return {
            ...base,
            next: null,
            code: 'ESCALATE_TO_HUMAN',
            blockingGates: [
              `Architecture Verifier PASS/WARN recorded via \`prospec change log --skill prospec-plan --verifier-report <file>\` (or a documented Break-Glass \`--result WARN --warning "${BREAK_GLASS_PREFIX} …"\`)`,
            ],
            reasons: [
              `the prospec-plan verifier has failed ${facts.planFlawsStreak} consecutive times (limit: ${facts.maxStationRetries}) — escalating to human; resolve repeated architecture verifier flaws`,
            ],
          };
        }
        return {
          ...base,
          next: 'plan',
          code: 'PLAN_VERIFIER_FAILED',
          blockingGates: [
            `Architecture Verifier PASS/WARN recorded via \`prospec change log --skill prospec-plan --verifier-report <file>\` (or a documented Break-Glass \`--result WARN --warning "${BREAK_GLASS_PREFIX} …"\`)`,
          ],
          reasons: [
            'the latest recorded prospec-plan verifier result is FAIL — revise plan.md/delta-spec.md and re-run the Architecture Verifier; the status stays `plan`',
          ],
        };
      }
      // The pause applies to any scale whose contract has a plan — the same registry
      // reading as design below — and only after the FAIL branch, so a plan that failed
      // its own audit is revised before a human is asked to sign it.
      const pauseApplies = facts.pauseAtPlan && !forbidden.includes('plan.md');
      if (pauseApplies) {
        if (facts.lastPlanVerifierResult === null) {
          return {
            ...base,
            next: 'plan',
            code: 'PLAN_VERIFIER_PENDING',
            blockingGates: [
              'Architecture Verifier PASS/WARN recorded via `prospec change log --skill prospec-plan --verifier-report <file>`',
            ],
            reasons: [
              `scale: ${facts.scale} with the plan sign-off pause enabled — no plan verifier result is recorded yet, so there is nothing for a human to sign off`,
            ],
          };
        }
        if (!facts.planSignedOff && facts.planChangedSinceVerifier) {
          return {
            ...base,
            next: 'plan',
            code: 'PLAN_VERIFIER_PENDING',
            blockingGates: [
              'Architecture Verifier PASS/WARN for the current plan.md and delta-spec.md recorded via `prospec change log --skill prospec-plan --verifier-report <file>`',
            ],
            reasons: [
              `scale: ${facts.scale} with the plan sign-off pause enabled — plan.md or delta-spec.md changed after the plan verifier audited it, so a sign-off would cover an unaudited version; record a new verifier report first`,
            ],
          };
        }
        if (!facts.planSignedOff) {
          const full = facts.scale === 'full';
          return {
            ...base,
            next: null,
            code: 'AWAITING_HUMAN_PLAN_SIGNOFF',
            blockingGates: [
              full
                ? 'human plan sign-off newer than the latest plan verifier result, recorded via `prospec change log --skill prospec-plan --signoff <option>` (the option must equal candidates/decision.json `recommended_option`)'
                : 'human sign-off of the audited plan version, newer than the latest plan verifier result, recorded via `prospec change log --skill prospec-plan --signoff plan`',
            ],
            reasons: full
              ? [
                  'scale: full with the plan sign-off pause enabled — HALT and present the candidate summary, metrics table, in-session rationale and plan verifier report for a human decision',
                  `no decision.json or plan verifier report to sign (e.g. after \`change scale full\`, or only a Break-Glass override)? ${PLAN_SIGNOFF_REMEDIES}`,
                ]
              : [
                  `scale: ${facts.scale} with the plan sign-off pause enabled — HALT and present the direction summary of the audited plan for a human decision`,
                  `no plan verifier report to sign (only a Break-Glass override)? ${PLAN_VERSION_SIGNOFF_REMEDIES}`,
                ],
          };
        }
      }
      // Design hangs off the `plan` station, so a scale whose contract has no plan
      // is never routed to it — the lifecycle states this for quick, and keying it
      // on the registry rather than the scale name keeps the two from drifting.
      // (Reachable at this status only via a manual `change status plan`.)
      const designApplies =
        (facts.uiScope === 'full' || facts.uiScope === 'partial') &&
        !forbidden.includes('plan.md');
      if (designApplies && !facts.hasDesignSpec) {
        return {
          ...base,
          next: 'design',
          code: 'DESIGN_REQUIRED',
          blockingGates: ['design-spec.md + interaction-spec.md produced'],
          reasons: [
            `proposal ui_scope: ${facts.uiScope} — design sits between plan and tasks (owns no status transition; placed by workflow order)`,
          ],
        };
      }
      const reasons = ['status `plan` — next station per lifecycle order'];
      if (pauseApplies) {
        reasons.push('plan sign-off recorded — the pause is released');
      }
      if (designApplies && facts.hasDesignSpec) {
        reasons.push('design-spec.md present — the design station has already run');
      }
      return {
        ...base,
        next: 'tasks',
        code: 'LIFECYCLE_NEXT',
        blockingGates: ['tasks.md created'],
        reasons,
      };
    }

    case 'tasks': {
      if (facts.lastTasksVerifierResult === 'FAIL') {
        if (history === undefined && facts.tasksFlawsStreak >= facts.maxStationRetries) {
          return {
            ...base,
            next: null,
            code: 'ESCALATE_TO_HUMAN',
            blockingGates: [
              `Task Verifier PASS/WARN recorded via \`prospec change log --skill prospec-tasks --verifier-report <file>\` (or a documented Break-Glass \`--result WARN --warning "${BREAK_GLASS_PREFIX} …"\`)`,
            ],
            reasons: [
              `the prospec-tasks verifier has failed ${facts.tasksFlawsStreak} consecutive times (limit: ${facts.maxStationRetries}) — escalating to human; resolve repeated task verifier flaws`,
            ],
          };
        }
        return {
          ...base,
          next: 'tasks',
          code: 'TASKS_VERIFIER_FAILED',
          blockingGates: [
            `Task Verifier PASS/WARN recorded via \`prospec change log --skill prospec-tasks --verifier-report <file>\` (or a documented Break-Glass \`--result WARN --warning "${BREAK_GLASS_PREFIX} …"\`)`,
          ],
          reasons: [
            'the latest recorded prospec-tasks verifier result is FAIL — revise tasks.md and re-run the Task Verifier; the status stays `tasks`',
          ],
        };
      }
      // Honest gate state, never a vacuous pass: a missing tasks.md or an
      // empty code-task set is surfaced instead of reading as "all done".
      const gate = !facts.hasTasks
        ? 'tasks.md not found — prospec-tasks owns its creation'
        : facts.codeTasksTotal === 0
          ? 'no code tasks found in tasks.md — nothing measurable to complete'
          : `\`prospec change status implemented\` refuses until all code-task checkboxes are complete — currently ${facts.codeTasksDone}/${facts.codeTasksTotal} ([M]/[V] tasks are reminders, not blockers)`;
      return {
        ...base,
        next: 'implement',
        code: 'LIFECYCLE_NEXT',
        blockingGates: [gate],
        reasons: ['status `tasks` — next station per lifecycle order'],
      };
    }

    case 'implemented': {
      const reasons: string[] = [];
      if (facts.scale === 'backfill') {
        reasons.push(
          'scale: backfill — legal lifecycle entry at `implemented` (brownfield code pre-exists; no plan/tasks by design, not a skipped station)',
        );
      }
      if (!facts.hasReviewProvenance) {
        reasons.push(
          'review owns no status transition — placed by workflow order between implemented and verified (no review_provenance recorded yet)',
        );
        return {
          ...base,
          next: 'review',
          code: 'REVIEW_PENDING',
          blockingGates: [
            'adversarial review completed and its baseline recorded (`prospec check --record-review`)',
          ],
          reasons,
        };
      }
      const belowBar = gradeBelowBar(facts.lastVerifyGrade);
      if (belowBar) {
        if (history === undefined && facts.verifyBelowBarStreak >= facts.maxStationRetries) {
          reasons.push(
            `prospec-verify has produced below-bar grades ${facts.verifyBelowBarStreak} consecutive times (limit: ${facts.maxStationRetries}, latest: ${facts.lastVerifyGrade}) — escalating to human; fix the WARN/FAIL items and re-run prospec-verify`,
          );
          return {
            ...base,
            next: null,
            code: 'ESCALATE_TO_HUMAN',
            blockingGates: [
              'grade S or A required (no FAIL, ≤ 2 WARN); `prospec verify record` adjudicates machine dimensions from `prospec check` — follow its current assessment, refusal and remediation',
            ],
            reasons,
          };
        }
        reasons.push(
          `previous verify grade ${facts.lastVerifyGrade} did not advance the status — fix the WARN/FAIL items and re-run prospec-verify`,
        );
      } else {
        reasons.push('review_provenance recorded — verify is the next station');
      }
      return {
        ...base,
        next: 'verify',
        code: belowBar ? 'VERIFY_GRADE_BELOW_BAR' : 'VERIFY_PENDING',
        blockingGates: [
          'grade S or A required (no FAIL, ≤ 2 WARN); `prospec verify record` adjudicates machine dimensions from `prospec check` — follow its current assessment, refusal and remediation',
        ],
        reasons,
      };
    }

    case 'verified': {
      // The persisted status never regresses, but the LATEST grade decides the
      // route: a re-verify that landed B/C/D means the change is not archivable
      // until a fresh S/A — say so here, not at the archive refusal.
      if (gradeBelowBar(facts.lastVerifyGrade)) {
        if (history === undefined && facts.verifyBelowBarStreak >= facts.maxStationRetries) {
          return {
            ...base,
            next: null,
            code: 'ESCALATE_TO_HUMAN',
            blockingGates: [
              'a fresh grade S or A recorded by `prospec verify record` (no FAIL, ≤ 2 WARN)',
            ],
            reasons: [
              `status stays \`verified\` (forward-only) but prospec-verify has produced below-bar grades ${facts.verifyBelowBarStreak} consecutive times (limit: ${facts.maxStationRetries}, latest: ${facts.lastVerifyGrade}) — escalating to human; fix the WARN/FAIL items and re-run prospec-verify before archive`,
            ],
          };
        }
        return {
          ...base,
          next: 'verify',
          code: 'VERIFY_GRADE_BELOW_BAR',
          blockingGates: [
            'a fresh grade S or A recorded by `prospec verify record` (no FAIL, ≤ 2 WARN)',
          ],
          reasons: [
            `status stays \`verified\` (forward-only) but the latest prospec-verify grade is ${facts.lastVerifyGrade} — fix the WARN/FAIL items and re-run prospec-verify before archive; \`prospec archive\` would refuse this change`,
          ],
        };
      }
      // Each gap reason keeps its own code: the formatter prefixes every reason line
      // with the route's code, which a co-listed KNOWLEDGE_UNSYNCED reason does not share.
      const gapReasons = facts.knowledgeSyncReasons.map(formatWorkflowReason);
      // Only KNOWLEDGE_UNSYNCED is knowledge-update's to repair; any other reason
      // halts for a human rather than naming a station that cannot fix it.
      if (facts.knowledgeSyncReasons.some((r) => r.code !== 'KNOWLEDGE_UNSYNCED')) {
        return {
          ...base,
          next: null,
          code: 'KNOWLEDGE_INPUT_INVALID',
          blockingGates: [
            `knowledge-sync inputs repaired — every delta-spec REQ id canonical, module-map.yaml readable; resolve ${RELATED_MODULE_HALT_CONDITION}`,
          ],
          reasons: [
            'status `verified` — a knowledge-sync input no station repairs blocks archive; prospec-knowledge-update cannot fix it, so repair it and re-run prospec status',
            ...gapReasons,
          ],
        };
      }
      if (facts.knowledgeSyncReasons.length > 0) {
        return {
          ...base,
          next: 'knowledge-update',
          code: 'KNOWLEDGE_UNSYNCED',
          blockingGates: [
            'affected-module Knowledge synced (module-map.yaml last_verified updated via `prospec knowledge verify` or prospec-knowledge-update)',
          ],
          reasons: [
            'status `verified` — knowledge is not yet synced for affected modules; prospec-knowledge-update is the next station',
            ...gapReasons,
          ],
        };
      }
      return {
        ...base,
        next: 'archive',
        code: 'LIFECYCLE_NEXT',
        blockingGates: [
          '`prospec archive` refuses unless the change is `verified`',
          'affected-module Knowledge synced — `prospec archive` refuses otherwise (verify S/A commit prompt is the prevention; the archive Entry Gate is the backstop)',
          // `verified` is inside PROVENANCE_AUDITED_STATUSES, so these are live gates
          // on this edge, not just on the one before it. Equivalent commits keep
          // repository-input evidence current. Declared, not
          // evaluated: the router is I/O-free and never reads the drift report — the
          // station CLI (`prospec archive`) is the adjudicator that refuses on them.
          'review/test provenance current for the final inputs — `prospec archive` refuses on any FAIL (`prospec check` — re-record when inputs change; equivalent commits preserve evidence)',
        ],
        reasons: ['status `verified` — next station per lifecycle order'],
      };
    }

    case 'abandoned':
    case 'archived': {
      return {
        ...base,
        next: null,
        code: 'TERMINAL',
        blockingGates: [],
        reasons: ['terminal — linear flow complete; periodic prospec-learn applies'],
      };
    }
  }
}
