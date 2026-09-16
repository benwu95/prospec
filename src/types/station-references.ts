/**
 * The canonical station reference map.
 *
 * `STATION_REFERENCES` is the ONE place that knows which reference files a
 * shipped skill deploys, where in that skill's flow each one is read, what it is
 * read for, and under which conditions. Four projections derive from it and none
 * of them keeps a second copy:
 *
 * - the deployment inventory `agent sync` writes (and `getSkillReferences`
 *   exposes as a compatibility facade),
 * - the reference maps rendered into each SKILL.md's prose,
 * - the next-station map `prospec status` prints,
 * - the startup-mandatory dependency edges the workflow-eval policies declare.
 *
 * Kept in `types` as inert data with no imports beyond sibling type-only ones,
 * so a consumer on a hot path (status) can project it without pulling the
 * template engine in.
 */
import type { ChangeScale } from './change.js';
import type { UiScope } from './status.js';

/**
 * When a station reads a load point.
 *
 * `startup-mandatory` is the only kind the instructions mark `**MANDATORY**`, so
 * it is also the only kind that enters the workflow-eval startup inventory;
 * `in-phase` reads are deliberately outside that legacy startup-only metric.
 *
 * `startup-conditional` is the case that inventory is known to miss: a read the
 * instructions require before any phase work under a stated condition, declared
 * some other way than the literal marker (verify's backfill routing). Naming it
 * keeps the real requirement visible without silently widening a metric whose
 * recorded ceilings were measured without it.
 */
export const REFERENCE_LOAD_KINDS = [
  'startup-mandatory',
  'startup-conditional',
  'startup-dynamic',
  'in-phase',
] as const;

export type ReferenceLoadKind = (typeof REFERENCE_LOAD_KINDS)[number];

/** A reference file a skill deploys under its `references/` directory. */
export interface StationReferenceFile {
  /** Source template under `skills/references/`. */
  templateName: string;
  /** Deployed file name. */
  outputName: string;
  /** Human title, shown where a map names the document rather than the path. */
  title: string;
}

/**
 * What a load point points at: a reference this skill deploys, or a file the
 * host project owns (the implement station's conventions). A project target is
 * never deployed and never enters the deployment projection — it exists so the
 * mandatory inventory can declare the edge instead of hiding it.
 */
export type StationReferenceTarget =
  | { kind: 'reference'; reference: string }
  | { kind: 'project'; path: string };

/** One load point: this station reads this target, here, for this reason. */
export interface StationReferenceUse {
  /** Stable id, unique within the skill; slots name uses by this id. */
  id: string;
  /** Load-point label as the station calls it (`Startup Loading`, `Phase 4`). */
  phase: string;
  /**
   * Heading path in the rendered SKILL.md that must carry this citation, as
   * `## heading > ### heading`. The drift check verifies the citation is at this
   * site specifically, so a citation that survives only in another phase or in a
   * summary does not satisfy it.
   */
  site: string;
  target: StationReferenceTarget;
  /** One line: what the station reads it for. */
  purpose: string;
  loading: ReferenceLoadKind;
  /** Scales this load point applies to; absent means every scale. */
  scales?: readonly ChangeScale[];
  /** UI scopes this load point applies to; absent means every UI scope. */
  uiScopes?: readonly UiScope[];
  /** A runtime condition no caller can decide, kept as visible guidance. */
  conditionHint?: string;
}

/**
 * One comma-joined group inside a rendered slot: the references read together at
 * one point, plus the phrase naming that point.
 */
export interface StationReferenceSlotGroup {
  /** Text before the group's citations (a list bullet, an opening paren). */
  lead?: string;
  /** Ordered use ids. */
  uses: readonly string[];
  /** Separator between this group's citations (` and `, ` + `). */
  joiner: string;
  /** Separator before the last citation when it differs (`, and `). */
  lastJoiner?: string;
  /** Text after the group's citations (` at Phase 4`); empty for a single item. */
  tail: string;
  /** How each citation is written: a markdown link (default) or inline code. */
  style?: 'link' | 'code';
}

/**
 * A registry-owned prose slot — the one place a rendered reference map is
 * emitted into a skill template, named by `{{stationReferences skill slot}}`.
 */
export interface StationReferenceSlot {
  id: string;
  /**
   * Heading path the rendered text lands under — NOT necessarily a use's own
   * site: a Startup Loading summary of per-phase reads renders here while each
   * read it names still has to appear at its own phase.
   */
  site: string;
  /** Text before the first group. */
  prefix?: string;
  /** Text after the last group. */
  suffix?: string;
  /** Separator between groups; defaults to `, `. */
  groupSeparator?: string;
  groups: readonly StationReferenceSlotGroup[];
}

/** Everything the registry knows about one skill. */
export interface StationReferenceEntry {
  files: readonly StationReferenceFile[];
  uses: readonly StationReferenceUse[];
  slots: readonly StationReferenceSlot[];
}

const EMPTY: StationReferenceEntry = { files: [], uses: [], slots: [] };

/** The two halves of the "read these per phase, not at startup" summary, shared
 *  by every station that keeps one so the wording cannot drift between them. */
const PHASE_MAP_PREFIX =
  'Format references are read **per phase on demand**, NOT as Startup Loading items (keeps the stable prefix lean): ';
const PHASE_MAP_SUFFIX = '. Read each when entering its phase; do not preload them into the stable prefix.';

/**
 * Every shipped skill, including the ones that deploy nothing — an explicit
 * empty entry, never an absent key, so a projection can tell "no references"
 * from "unknown skill".
 */
export const STATION_REFERENCES: Readonly<Record<string, StationReferenceEntry>> = {
  'prospec-explore': EMPTY,
  'prospec-new-story': {
    files: [
      { templateName: 'proposal-format.hbs', outputName: 'proposal-format.md', title: 'Proposal Format' },
      { templateName: 'metadata-format.hbs', outputName: 'metadata-format.md', title: 'Metadata (metadata.yaml) Format' },
    ],
    uses: [
      {
        id: 'startup-proposal-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'proposal-format.md' },
        purpose: 'the proposal.md format the Story is written to',
        loading: 'startup-mandatory',
      },
      {
        id: 'startup-metadata-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'metadata-format.md' },
        purpose: 'metadata.yaml field semantics — the file itself is CLI-written',
        loading: 'startup-dynamic',
      },
      {
        id: 'phase-5-proposal-format',
        phase: 'Phase 5: Write proposal.md',
        site: 'Core Workflow > Phase 5: Write proposal.md',
        target: { kind: 'reference', reference: 'proposal-format.md' },
        purpose: 'the section set proposal.md must carry',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-proposal-format',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix: ' for proposal.md format specification',
        groups: [{ uses: ['startup-proposal-format'], joiner: '', tail: '' }],
      },
      {
        id: 'startup-metadata-format',
        site: 'Startup Loading',
        prefix: 'Read ',
        suffix:
          ' on demand for metadata.yaml FIELD SEMANTICS only — the file itself is CLI-written (`prospec change story` / `change scale` / `change log`), never hand-serialized',
        groups: [{ uses: ['startup-metadata-format'], joiner: '', tail: '' }],
      },
    ],
  },
  'prospec-plan': {
    files: [
      { templateName: 'plan-format.hbs', outputName: 'plan-format.md', title: 'Plan Format' },
      { templateName: 'delta-spec-format.hbs', outputName: 'delta-spec-format.md', title: 'Delta Spec Format' },
      { templateName: 'plan-verifier-rubric.hbs', outputName: 'plan-verifier-rubric.md', title: 'Architecture Verifier Rubric' },
      { templateName: 'candidate-evaluation.hbs', outputName: 'candidate-evaluation.md', title: 'Candidate Architecture Evaluation' },
    ],
    uses: [
      {
        id: 'phase-4-plan-format',
        phase: 'Phase 4: Design plan.md',
        site: 'Core Workflow > Phase 4: Design plan.md',
        target: { kind: 'reference', reference: 'plan-format.md' },
        purpose: 'the plan.md section set and its scale tiers',
        loading: 'in-phase',
      },
      {
        id: 'phase-4-candidate-evaluation',
        phase: 'Phase 4: Design plan.md',
        site: 'Core Workflow > Phase 4: Design plan.md',
        target: { kind: 'reference', reference: 'candidate-evaluation.md' },
        purpose: 'the multi-candidate tournament and its receipt protocol',
        loading: 'in-phase',
        scales: ['standard', 'full'],
        conditionHint: 'full scale, or a standard change where the developer asks for the tournament',
      },
      {
        id: 'phase-5-delta-spec-format',
        phase: 'Phase 5: Generate delta-spec.md',
        site: 'Core Workflow > Phase 5: Generate delta-spec.md',
        target: { kind: 'reference', reference: 'delta-spec-format.md' },
        purpose: 'the ADDED/MODIFIED/REMOVED shape and the routing headers',
        loading: 'in-phase',
      },
      {
        id: 'phase-6-plan-verifier-rubric',
        phase: 'Phase 6: Architecture Verification',
        site: 'Core Workflow > Phase 6: Architecture Verification (site-specific: dependency/layering)',
        target: { kind: 'reference', reference: 'plan-verifier-rubric.md' },
        purpose: 'the five verification dimensions and the receipt protocol',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-phase-map',
        site: 'Startup Loading',
        prefix: PHASE_MAP_PREFIX,
        suffix: PHASE_MAP_SUFFIX,
        groups: [
          { uses: ['phase-4-plan-format', 'phase-4-candidate-evaluation'], joiner: ' and ', tail: ' at Phase 4' },
          { uses: ['phase-5-delta-spec-format'], joiner: ' and ', tail: ' at Phase 5' },
          { uses: ['phase-6-plan-verifier-rubric'], joiner: ' and ', tail: ' at Phase 6' },
        ],
      },
    ],
  },
  'prospec-design': {
    files: [
      { templateName: 'design-spec-format.hbs', outputName: 'design-spec-format.md', title: 'Design Spec Format' },
      { templateName: 'interaction-spec-format.hbs', outputName: 'interaction-spec-format.md', title: 'Interaction Spec Format' },
      { templateName: 'adapter-pencil.hbs', outputName: 'adapter-pencil.md', title: 'Platform Adapter: pencil.dev' },
      { templateName: 'adapter-figma.hbs', outputName: 'adapter-figma.md', title: 'Platform Adapter: Figma' },
      { templateName: 'adapter-penpot.hbs', outputName: 'adapter-penpot.md', title: 'Platform Adapter: Penpot' },
      { templateName: 'adapter-html.hbs', outputName: 'adapter-html.md', title: 'Platform Adapter: HTML' },
    ],
    uses: [
      {
        id: 'startup-design-spec-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'design-spec-format.md' },
        purpose: 'the design-spec.md format',
        loading: 'startup-mandatory',
      },
      {
        id: 'startup-interaction-spec-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'interaction-spec-format.md' },
        purpose: 'the interaction-spec.md format',
        loading: 'startup-mandatory',
      },
      {
        id: 'startup-adapter-pencil',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'adapter-pencil.md' },
        purpose: 'the pencil.dev MCP surface this station reads design data through',
        loading: 'startup-dynamic',
        conditionHint: '`design.platform` is pencil',
      },
      {
        id: 'startup-adapter-figma',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'adapter-figma.md' },
        purpose: 'the Figma MCP surface this station reads design data through',
        loading: 'startup-dynamic',
        conditionHint: '`design.platform` is figma',
      },
      {
        id: 'startup-adapter-penpot',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'adapter-penpot.md' },
        purpose: 'the Penpot MCP surface this station reads design data through',
        loading: 'startup-dynamic',
        conditionHint: '`design.platform` is penpot',
      },
      {
        id: 'startup-adapter-html',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'adapter-html.md' },
        purpose: 'the HTML adapter, the zero-dependency fallback',
        loading: 'startup-dynamic',
        conditionHint: '`design.platform` is html, or unset',
      },
    ],
    slots: [
      {
        id: 'startup-design-spec-format',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix: ' for design-spec.md format',
        groups: [{ uses: ['startup-design-spec-format'], joiner: '', tail: '' }],
      },
      {
        id: 'startup-interaction-spec-format',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix: ' for interaction-spec.md format',
        groups: [{ uses: ['startup-interaction-spec-format'], joiner: '', tail: '' }],
      },
      {
        id: 'startup-adapters',
        site: 'Startup Loading',
        groupSeparator: '\n',
        groups: [
          { lead: '   - pencil → ', uses: ['startup-adapter-pencil'], joiner: '', tail: '' },
          { lead: '   - figma → ', uses: ['startup-adapter-figma'], joiner: '', tail: '' },
          { lead: '   - penpot → ', uses: ['startup-adapter-penpot'], joiner: '', tail: '' },
          { lead: '   - html → ', uses: ['startup-adapter-html'], joiner: '', tail: '' },
        ],
      },
    ],
  },
  'prospec-tasks': {
    files: [
      { templateName: 'tasks-format.hbs', outputName: 'tasks-format.md', title: 'Tasks Format' },
      { templateName: 'tasks-verifier-rubric.hbs', outputName: 'tasks-verifier-rubric.md', title: 'Task Verifier Rubric' },
    ],
    uses: [
      {
        id: 'startup-tasks-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'tasks-format.md' },
        purpose: 'the tasks.md format and its task kind markers',
        loading: 'startup-mandatory',
      },
      {
        id: 'phase-3-tasks-format',
        phase: 'Phase 3: Decompose by Architecture Layer',
        site: 'Core Workflow > Phase 3: Decompose by Architecture Layer',
        target: { kind: 'reference', reference: 'tasks-format.md' },
        purpose: 'the layer-order adaptation note the decomposition follows',
        loading: 'in-phase',
      },
      {
        id: 'phase-6-tasks-verifier-rubric',
        phase: 'Phase 6: Task Contract & Verifier Audit',
        site: 'Core Workflow > Phase 6: Task Contract & Verifier Audit (site-specific: TDD & dependency/layering)',
        target: { kind: 'reference', reference: 'tasks-verifier-rubric.md' },
        purpose: 'the four audit dimensions and the receipt protocol',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-tasks-format',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix: ' for tasks.md format',
        groups: [{ uses: ['startup-tasks-format'], joiner: '', tail: '' }],
      },
    ],
  },
  'prospec-ff': {
    files: [
      { templateName: 'proposal-format.hbs', outputName: 'proposal-format.md', title: 'Proposal Format' },
      { templateName: 'plan-format.hbs', outputName: 'plan-format.md', title: 'Plan Format' },
      { templateName: 'delta-spec-format.hbs', outputName: 'delta-spec-format.md', title: 'Delta Spec Format' },
      { templateName: 'plan-verifier-rubric.hbs', outputName: 'plan-verifier-rubric.md', title: 'Architecture Verifier Rubric' },
      { templateName: 'tasks-format.hbs', outputName: 'tasks-format.md', title: 'Tasks Format' },
      { templateName: 'tasks-verifier-rubric.hbs', outputName: 'tasks-verifier-rubric.md', title: 'Task Verifier Rubric' },
      { templateName: 'metadata-format.hbs', outputName: 'metadata-format.md', title: 'Metadata (metadata.yaml) Format' },
      { templateName: 'cascade-protocol.hbs', outputName: 'cascade-protocol.md', title: 'Autonomous Pipeline Cascading Protocol' },
      { templateName: 'circuit-breaker.hbs', outputName: 'circuit-breaker.md', title: 'Circuit Breakers & Runaway Cost Protection' },
      { templateName: 'project-test-runner.hbs', outputName: 'project-test-runner.md', title: 'Project Test Runner & Ecosystem Adapter' },
    ],
    uses: [
      {
        id: 'phase-2-proposal-format',
        phase: 'Phase 2: Story Generation',
        site: 'Core Workflow > Phase 2: Story Generation',
        target: { kind: 'reference', reference: 'proposal-format.md' },
        purpose: 'the proposal.md format the generated Story is written to',
        loading: 'in-phase',
      },
      {
        id: 'phase-2-metadata-format',
        phase: 'Phase 2: Story Generation',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'metadata-format.md' },
        purpose: 'metadata.yaml field semantics for the scaffolded change',
        loading: 'in-phase',
      },
      {
        id: 'phase-3-plan-format',
        phase: 'Phase 3: Plan Generation',
        site: 'Core Workflow > Phase 3: Plan Generation (skipped when `scale: quick`)',
        target: { kind: 'reference', reference: 'plan-format.md' },
        purpose: 'the plan.md section set the delegated plan station writes to',
        loading: 'in-phase',
        scales: ['standard', 'full'],
      },
      {
        id: 'phase-3-delta-spec-format',
        phase: 'Phase 3: Plan Generation',
        site: 'Core Workflow > Phase 3: Plan Generation (skipped when `scale: quick`)',
        target: { kind: 'reference', reference: 'delta-spec-format.md' },
        purpose: 'the delta-spec.md shape and routing headers',
        loading: 'in-phase',
        scales: ['standard', 'full'],
      },
      {
        id: 'phase-3-plan-verifier-rubric',
        phase: 'Phase 3: Plan Generation',
        site: 'Core Workflow > Phase 3: Plan Generation (skipped when `scale: quick`)',
        target: { kind: 'reference', reference: 'plan-verifier-rubric.md' },
        purpose: 'the architecture verification dimensions and receipt protocol',
        loading: 'in-phase',
        scales: ['standard', 'full'],
      },
      {
        id: 'phase-4-tasks-format',
        phase: 'Phase 4: Tasks Generation',
        site: 'Core Workflow > Phase 4: Tasks Generation',
        target: { kind: 'reference', reference: 'tasks-format.md' },
        purpose: 'the tasks.md format the decomposition follows',
        loading: 'in-phase',
      },
      {
        id: 'phase-4-tasks-verifier-rubric',
        phase: 'Phase 4: Tasks Generation',
        site: 'Core Workflow > Phase 4: Tasks Generation',
        target: { kind: 'reference', reference: 'tasks-verifier-rubric.md' },
        purpose: 'the task contract audit dimensions and receipt protocol',
        loading: 'in-phase',
      },
      {
        id: 'phase-5-cascade-protocol',
        phase: 'Phase 5: Autonomous Execution & Cascading',
        site: 'Core Workflow > Phase 5: Autonomous Execution & Cascading (when cascading active)',
        target: { kind: 'reference', reference: 'cascade-protocol.md' },
        purpose: 'the station-to-station cascade rules',
        loading: 'in-phase',
        conditionHint: 'cascading execution is active',
      },
      {
        id: 'phase-5-circuit-breaker',
        phase: 'Phase 5: Autonomous Execution & Cascading',
        site: 'Core Workflow > Phase 5: Autonomous Execution & Cascading (when cascading active)',
        target: { kind: 'reference', reference: 'circuit-breaker.md' },
        purpose: 'the runaway-cost breakers that stop a cascade',
        loading: 'in-phase',
        conditionHint: 'cascading execution is active',
      },
      {
        id: 'phase-5-project-test-runner',
        phase: 'Phase 5: Autonomous Execution & Cascading',
        site: 'Core Workflow > Phase 5: Autonomous Execution & Cascading (when cascading active)',
        target: { kind: 'reference', reference: 'project-test-runner.md' },
        purpose: 'how to resolve the project\'s own test command',
        loading: 'in-phase',
        conditionHint: 'cascading execution is active',
      },
    ],
    slots: [
      {
        id: 'startup-phase-map',
        site: 'Startup Loading',
        prefix: PHASE_MAP_PREFIX,
        suffix: PHASE_MAP_SUFFIX,
        groups: [
          { uses: ['phase-2-proposal-format', 'phase-2-metadata-format'], joiner: ' + ', tail: ' at Phase 2' },
          { uses: ['phase-3-plan-format', 'phase-3-delta-spec-format', 'phase-3-plan-verifier-rubric'], joiner: ' + ', tail: ' at Phase 3' },
          { uses: ['phase-4-tasks-format', 'phase-4-tasks-verifier-rubric'], joiner: ' + ', tail: ' at Phase 4' },
          { uses: ['phase-5-cascade-protocol', 'phase-5-circuit-breaker', 'phase-5-project-test-runner'], joiner: ' + ', tail: ' for cascading execution' },
        ],
      },
      {
        id: 'phase-5-cascade-list',
        site: 'Core Workflow > Phase 5: Autonomous Execution & Cascading (when cascading active)',
        prefix: 'Read ',
        suffix: ' on demand:',
        groups: [
          {
            uses: ['phase-5-cascade-protocol', 'phase-5-circuit-breaker', 'phase-5-project-test-runner'],
            joiner: ', ',
            lastJoiner: ', and ',
            tail: '',
          },
        ],
      },
    ],
  },
  'prospec-implement': {
    files: [
      { templateName: 'implementation-guide.hbs', outputName: 'implementation-guide.md', title: 'Implementation Guide' },
      { templateName: 'project-test-runner.hbs', outputName: 'project-test-runner.md', title: 'Project Test Runner & Ecosystem Adapter' },
    ],
    uses: [
      {
        id: 'startup-implementation-guide',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'implementation-guide.md' },
        purpose: 'the TDD, task-order, commit-boundary and quality-gate rules',
        loading: 'startup-mandatory',
      },
      {
        // Not a shipped reference: the HOST project's conventions. Declared so the
        // mandatory inventory carries the edge instead of scoring it as absent.
        id: 'startup-conventions',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'project', path: '{{knowledge_base_path}}/_conventions.md' },
        purpose: "the project's own service, file-write and content-preservation conventions",
        loading: 'startup-mandatory',
      },
      {
        id: 'phase-4-project-test-runner',
        phase: 'Phase 4: Verify Implementation',
        site: 'Core Workflow > Phase 4: Verify Implementation',
        target: { kind: 'reference', reference: 'project-test-runner.md' },
        purpose: 'how to resolve the project\'s own test command',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-implementation-guide',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix: ' for implementation guidelines',
        groups: [{ uses: ['startup-implementation-guide'], joiner: '', tail: '' }],
      },
    ],
  },
  'prospec-review': {
    files: [
      { templateName: 'review-format.hbs', outputName: 'review-format.md', title: 'Review Severity Contract and review.md Format' },
      { templateName: 'review-lenses-content.hbs', outputName: 'review-lenses-content.md', title: 'Review Lens Criteria (security / performance / maintainability)' },
      { templateName: 'delegated-evidence-format.hbs', outputName: 'delegated-evidence-format.md', title: 'Delegated Payload Contract and Evidence Landing Format' },
      { templateName: 'circuit-breaker.hbs', outputName: 'circuit-breaker.md', title: 'Circuit Breakers & Runaway Cost Protection' },
      { templateName: 'project-test-runner.hbs', outputName: 'project-test-runner.md', title: 'Project Test Runner & Ecosystem Adapter' },
    ],
    uses: [
      {
        id: 'startup-review-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'review-format.md' },
        purpose: 'the severity contract, review.md format and reviewer lenses',
        loading: 'startup-mandatory',
      },
      {
        id: 'lenses-review-lenses-content',
        phase: 'Review Lenses',
        site: 'Core Workflow > Review Lenses',
        target: { kind: 'reference', reference: 'review-lenses-content.md' },
        purpose: 'the severity-pre-mapped criteria behind each conditional lens',
        loading: 'in-phase',
        conditionHint: 'a conditional lens applies to this diff',
      },
      {
        id: 'severity-review-format',
        phase: 'Severity Routing',
        site: 'Core Workflow > Severity Routing',
        target: { kind: 'reference', reference: 'review-format.md' },
        purpose: 'what each severity blocks, fixes and forwards',
        loading: 'in-phase',
      },
      {
        id: 'loop-project-test-runner',
        phase: 'The Loop',
        site: 'Core Workflow > The Loop',
        target: { kind: 'reference', reference: 'project-test-runner.md' },
        purpose: 'the test command each fix round re-runs',
        loading: 'in-phase',
      },
      {
        id: 'loop-circuit-breaker',
        phase: 'The Loop',
        site: 'Core Workflow > The Loop',
        target: { kind: 'reference', reference: 'circuit-breaker.md' },
        purpose: 'the round cap and the dual-axis breakers that stop the loop',
        loading: 'in-phase',
      },
      {
        id: 'persistence-delegated-evidence-format',
        phase: 'Persistence',
        site: 'Core Workflow > Persistence',
        target: { kind: 'reference', reference: 'delegated-evidence-format.md' },
        purpose: 'the findings payload contract and where evidence lands',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-review-format',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix: ' for the severity contract, review.md format, and reviewer lenses',
        groups: [{ uses: ['startup-review-format'], joiner: '', tail: '' }],
      },
    ],
  },
  'prospec-verify': {
    files: [
      { templateName: 'verify-backfill.hbs', outputName: 'verify-backfill.md', title: 'Backfill Verification Reference' },
      { templateName: 'debug-recovery-format.hbs', outputName: 'debug-recovery-format.md', title: 'Debug & Recovery Triage Reference' },
      { templateName: 'drift-report-format.hbs', outputName: 'drift-report-format.md', title: 'Drift Report (prospec-report.json) Format' },
      // Shared with prospec-review deliberately: both stations delegate to a
      // fresh context, so the payload contract must have one text, not a copy
      // per station that can drift.
      { templateName: 'delegated-evidence-format.hbs', outputName: 'delegated-evidence-format.md', title: 'Delegated Payload Contract and Evidence Landing Format' },
      { templateName: 'cascade-protocol.hbs', outputName: 'cascade-protocol.md', title: 'Autonomous Pipeline Cascading Protocol' },
    ],
    uses: [
      {
        id: 'startup-drift-report-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'drift-report-format.md' },
        purpose: 'where each machine verdict lives in prospec-report.json',
        loading: 'startup-dynamic',
      },
      {
        // Required before Phase 1 under backfill, but declared by a routing
        // blockquote rather than the literal marker — hence startup-conditional,
        // which keeps it out of the legacy marker-derived startup inventory.
        id: 'startup-verify-backfill',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'verify-backfill.md' },
        purpose: 'the spec-fidelity contract and grade relaxations backfill verifies under',
        loading: 'startup-conditional',
        scales: ['backfill'],
        conditionHint: 'metadata.scale is backfill — stop and read it before Phase 1',
      },
      {
        id: 'entry-gate-verify-backfill',
        phase: 'Entry Gate',
        site: 'Entry Gate',
        target: { kind: 'reference', reference: 'verify-backfill.md' },
        purpose: 'which entry-gate artifacts and provenance backfill is exempt from',
        loading: 'in-phase',
        scales: ['backfill'],
      },
      {
        id: 'v1-verify-backfill',
        phase: 'Verification 1/5: Task Completion',
        site: 'Core Workflow > Verification 1/5: Task Completion — `[machine]`',
        target: { kind: 'reference', reference: 'verify-backfill.md' },
        purpose: 'how task completion is judged without a tasks.md',
        loading: 'in-phase',
        scales: ['backfill'],
      },
      {
        id: 'v2-delegated-evidence-format',
        phase: 'Verification 2/5: Delta Spec Compliance',
        site: 'Core Workflow > Verification 2/5: Delta Spec Compliance — `[judgment]`, fresh context required',
        target: { kind: 'reference', reference: 'delegated-evidence-format.md' },
        purpose: 'the delegated payload contract and where its evidence lands',
        loading: 'in-phase',
      },
      {
        id: 'v2-verify-backfill',
        phase: 'Verification 2/5: Delta Spec Compliance',
        site: 'Core Workflow > Verification 2/5: Delta Spec Compliance — `[judgment]`, fresh context required',
        target: { kind: 'reference', reference: 'verify-backfill.md' },
        purpose: 'the spec-fidelity contract this dimension grades under backfill',
        loading: 'in-phase',
        scales: ['backfill'],
      },
      {
        id: 'v3-verify-backfill',
        phase: 'Verification 3/5: Constitution Full Audit',
        site: 'Core Workflow > Verification 3/5: Constitution Full Audit — `[mixed]`',
        target: { kind: 'reference', reference: 'verify-backfill.md' },
        purpose: 'why this dimension is not-applicable under backfill',
        loading: 'in-phase',
        scales: ['backfill'],
      },
      {
        id: 'v4-drift-report-format',
        phase: 'Verification 4/5: Knowledge ↔ Implementation Consistency',
        site: 'Core Workflow > Verification 4/5: Knowledge ↔ Implementation Consistency — `[machine]`',
        target: { kind: 'reference', reference: 'drift-report-format.md' },
        purpose: 'the knowledge_health shape this dimension reads',
        loading: 'in-phase',
      },
      {
        id: 'v5-verify-backfill',
        phase: 'Verification 5/5: Test Verification',
        site: 'Core Workflow > Verification 5/5: Test Verification — `[machine]`',
        target: { kind: 'reference', reference: 'verify-backfill.md' },
        purpose: 'which test absences are informational under backfill',
        loading: 'in-phase',
        scales: ['backfill'],
      },
      {
        id: 'v5-debug-recovery-format',
        phase: 'Verification 5/5: Test Verification',
        site: 'Core Workflow > Verification 5/5: Test Verification — `[machine]`',
        target: { kind: 'reference', reference: 'debug-recovery-format.md' },
        purpose: 'the root-cause triage playbook a FAIL remediation follows',
        loading: 'in-phase',
        conditionHint: 'a test FAILs',
      },
      {
        id: 'record-cascade-protocol',
        phase: 'Record & Status Update',
        site: 'Record & Status Update (CLI-executed)',
        target: { kind: 'reference', reference: 'cascade-protocol.md' },
        purpose: 'the Tastemaker presentation and human commit gate',
        loading: 'in-phase',
        conditionHint: 'the grade reaches S/A',
      },
    ],
    slots: [],
  },
  'prospec-knowledge-generate': EMPTY,
  'prospec-archive': {
    files: [
      { templateName: 'archive-format.hbs', outputName: 'archive-format.md', title: 'Archive Summary Format' },
      { templateName: 'spec-graduation.hbs', outputName: 'spec-graduation.md', title: 'Feature Spec Graduation Reference' },
      { templateName: 'feature-spec-format.hbs', outputName: 'feature-spec-format.md', title: 'Feature Spec Format' },
      { templateName: 'product-spec-format.hbs', outputName: 'product-spec-format.md', title: 'Product Spec Format' },
      { templateName: 'promotion-format.hbs', outputName: 'promotion-format.md', title: 'Feedback Promotion Rule and Ledger Format' },
    ],
    uses: [
      {
        id: 'phase-2-archive-format',
        phase: 'Phase 2: Generate Summary',
        site: 'Core Workflow > Phase 2: Generate Summary',
        target: { kind: 'reference', reference: 'archive-format.md' },
        purpose: 'the summary.md sections, Review & Verify included',
        loading: 'in-phase',
      },
      {
        id: 'phase-3-5-spec-graduation',
        phase: 'Phase 3.5: Feature Spec Sync',
        site: 'Core Workflow > Phase 3.5: Feature Spec Sync',
        target: { kind: 'reference', reference: 'spec-graduation.md' },
        purpose: 'the five CLI worklists and the block-replaces-whole-body rule',
        loading: 'in-phase',
      },
      {
        id: 'phase-3-5-feature-spec-format',
        phase: 'Phase 3.5: Feature Spec Sync',
        site: 'Core Workflow > Phase 3.5: Feature Spec Sync',
        target: { kind: 'reference', reference: 'feature-spec-format.md' },
        purpose: 'where a graduated REQ sits inside its Feature Spec',
        loading: 'in-phase',
      },
      {
        id: 'phase-3-6-product-spec-format',
        phase: 'Phase 3.6: Product Spec Sync',
        site: 'Core Workflow > Phase 3.6: Product Spec Sync',
        target: { kind: 'reference', reference: 'product-spec-format.md' },
        purpose: 'the product.md Feature Map shape a bootstrapped file follows',
        loading: 'in-phase',
      },
      {
        id: 'phase-4-5-promotion-format',
        phase: 'Phase 4.5: Auto-Harvest Recurring Lessons',
        site: 'Core Workflow > Phase 4.5: Auto-Harvest Recurring Lessons',
        target: { kind: 'reference', reference: 'promotion-format.md' },
        purpose: 'the Harvest definition the auto-harvest follows',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-phase-map',
        site: 'Startup Loading',
        prefix: PHASE_MAP_PREFIX,
        suffix:
          '. (`references/promotion-format.md` is already read on demand at Phase 4.5.) Read each when entering its phase; do not preload them into the stable prefix.',
        groups: [
          { uses: ['phase-2-archive-format'], joiner: '', tail: ' at Phase 2/3 (summary + spec archiving)' },
          { uses: ['phase-3-5-feature-spec-format'], joiner: '', tail: ' at Phase 3.5' },
          { uses: ['phase-3-6-product-spec-format'], joiner: '', tail: ' at Phase 3.6' },
        ],
      },
    ],
  },
  'prospec-knowledge-update': EMPTY,
  'prospec-backfill-spec': {
    files: [
      { templateName: 'feature-boundary-criteria.hbs', outputName: 'feature-boundary-criteria.md', title: 'Feature Boundary Criteria' },
    ],
    uses: [
      {
        id: 'phase-1-feature-boundary-criteria',
        phase: 'Phase 1: Triangulate the sources, then cluster by feature',
        site: 'Core Workflow > Phase 1: Triangulate the sources, then cluster by feature (vertical slice)',
        target: { kind: 'reference', reference: 'feature-boundary-criteria.md' },
        purpose: 'the criteria that settle one feature vs sibling slugs',
        loading: 'in-phase',
      },
    ],
    slots: [],
  },
  'prospec-promote-backfill': {
    files: [
      { templateName: 'proposal-format.hbs', outputName: 'proposal-format.md', title: 'Proposal Format' },
      { templateName: 'delta-spec-format.hbs', outputName: 'delta-spec-format.md', title: 'Delta Spec Format' },
    ],
    uses: [
      {
        id: 'startup-proposal-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'proposal-format.md' },
        purpose: 'the proposal.md shape the scaffold must match',
        loading: 'startup-mandatory',
      },
      {
        id: 'startup-delta-spec-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'delta-spec-format.md' },
        purpose: 'the delta-spec.md shape the scaffold must match',
        loading: 'startup-mandatory',
      },
      {
        id: 'phase-2-proposal-format',
        phase: 'Phase 2: Scaffold + proposal.md',
        site: 'Core Workflow > Phase 2: Scaffold + proposal.md',
        target: { kind: 'reference', reference: 'proposal-format.md' },
        purpose: 'how each draft story becomes an INVEST User Story',
        loading: 'in-phase',
      },
      {
        id: 'phase-3-delta-spec-format',
        phase: 'Phase 3: delta-spec.md',
        site: 'Core Workflow > Phase 3: delta-spec.md',
        target: { kind: 'reference', reference: 'delta-spec-format.md' },
        purpose: 'how each draft AC candidate becomes a routed REQ',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-format-references',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Load the format references this scaffold must match: ',
        groups: [
          {
            uses: ['startup-proposal-format', 'startup-delta-spec-format'],
            joiner: ', ',
            tail: '',
            style: 'code',
          },
        ],
      },
    ],
  },
  'prospec-learn': {
    files: [
      { templateName: 'promotion-format.hbs', outputName: 'promotion-format.md', title: 'Feedback Promotion Rule and Ledger Format' },
      { templateName: 'drift-report-format.hbs', outputName: 'drift-report-format.md', title: 'Drift Report (prospec-report.json) Format' },
    ],
    uses: [
      {
        id: 'startup-promotion-format',
        phase: 'Startup Loading',
        site: 'Startup Loading',
        target: { kind: 'reference', reference: 'promotion-format.md' },
        purpose: 'the promotion rule, ledger and playbook formats, and the TTL/conflict fields',
        loading: 'startup-mandatory',
      },
      {
        id: 'sweep-promotion-format',
        phase: 'Sweep',
        site: 'Core Workflow > Sweep',
        target: { kind: 'reference', reference: 'promotion-format.md' },
        purpose: 'the Staleness Sweep tests, evidence bar and removal semantics',
        loading: 'in-phase',
      },
      {
        id: 'collect-promotion-format',
        phase: 'Collect',
        site: 'Core Workflow > Collect',
        target: { kind: 'reference', reference: 'promotion-format.md' },
        purpose: 'the Generalizability Heuristic that decides what to capture',
        loading: 'in-phase',
      },
      {
        id: 'score-promotion-format',
        phase: 'Score',
        site: 'Core Workflow > Score',
        target: { kind: 'reference', reference: 'promotion-format.md' },
        purpose: 'the scoring thresholds and review-queue prioritization',
        loading: 'in-phase',
      },
      {
        id: 'score-drift-report-format',
        phase: 'Score',
        site: 'Core Workflow > Score',
        target: { kind: 'reference', reference: 'drift-report-format.md' },
        purpose: 'where stale modules live in prospec-report.json',
        loading: 'in-phase',
      },
      {
        id: 'promote-promotion-format',
        phase: 'Promote',
        site: 'Core Workflow > Promote',
        target: { kind: 'reference', reference: 'promotion-format.md' },
        purpose: 'the routing by lesson kind across the three tiers',
        loading: 'in-phase',
      },
    ],
    slots: [
      {
        id: 'startup-promotion-format',
        site: 'Startup Loading',
        prefix: '**MANDATORY** — Read ',
        suffix:
          ' for the explicit promotion rule, the Generalizability Heuristic (what to capture), lessons-ledger format, playbook entry format, approval record, and TTL/conflict fields',
        groups: [{ uses: ['startup-promotion-format'], joiner: '', tail: '' }],
      },
    ],
  },
  'prospec-quickstart': EMPTY,
  'prospec-upgrade': EMPTY,
};

/**
 * Whether a skill deploys any reference file — DERIVED from the registry, never a
 * second hand-maintained boolean that can disagree with the files actually written.
 */
export function skillHasReferences(skillName: string): boolean {
  return (STATION_REFERENCES[skillName]?.files.length ?? 0) > 0;
}
