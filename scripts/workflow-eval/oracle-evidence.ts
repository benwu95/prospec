import { assertValidChangeMetadata } from '../../src/lib/change-metadata.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';

type ChangeMetadata = ReturnType<typeof assertValidChangeMetadata>;

/**
 * The two oracle predicates BOTH adjudicators apply to a change's metadata. The
 * mediated scorer and the native adjudicator judge the same oracle fields, and while
 * each kept its own copy the receipt semantics could be changed on one side only
 * (round-2 M2-4). Each caller still owns its own failure wording; only the meaning
 * lives here.
 */
export const changeMetadataOf = (content: string | null, path: string): ChangeMetadata =>
  assertValidChangeMetadata(parseYaml(content ?? ''), path);

/** A station reached its terminal state — not merely wrote something. */
export const stateMatches = (metadata: ChangeMetadata, status: string): boolean => metadata.status === status;

/** A CLI-recorded verifier receipt: a logged entry whose own verdict is PASS or WARN. */
export const hasVerifierReceipt = (metadata: ChangeMetadata, skill: string): boolean =>
  metadata.quality_log?.some((entry) => entry.skill === skill &&
    (entry.verifier_verdict === 'PASS' || entry.verifier_verdict === 'WARN')) === true;
