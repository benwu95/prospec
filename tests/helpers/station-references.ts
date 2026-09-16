/**
 * ONE definition of "a well-formed station reference registry", shared by the
 * types closure suite and the contract suites.
 *
 * Kept as a function over an arbitrary registry rather than as assertions over
 * the shipped one: an invariant only asserted against real, valid data never goes
 * red, so it proves nothing about the rule it claims to enforce. Feeding it a
 * deliberately broken registry is what makes each rule falsifiable.
 */
import { REFERENCE_LOAD_KINDS, type StationReferenceEntry } from '../../src/types/station-references.js';
import { CHANGE_SCALES } from '../../src/types/change.js';
import { UI_SCOPES } from '../../src/types/status.js';

export type StationReferenceRegistry = Readonly<Record<string, StationReferenceEntry>>;

/** Every way the registry can be malformed, as `<skill>: <problem>` lines. */
export function validateStationReferences(
  registry: StationReferenceRegistry,
  skillNames: readonly string[],
): string[] {
  const problems: string[] = [];
  const add = (skill: string, problem: string) => problems.push(`${skill}: ${problem}`);

  const declared = Object.keys(registry).sort();
  const shipped = [...skillNames].sort();
  for (const skill of shipped) if (!declared.includes(skill)) problems.push(`${skill}: no registry entry`);
  for (const skill of declared) if (!shipped.includes(skill)) problems.push(`${skill}: not a shipped skill`);

  for (const [skill, entry] of Object.entries(registry)) {
    const outputs = entry.files.map((file) => file.outputName);
    if (new Set(outputs).size !== outputs.length) add(skill, 'duplicate reference file');
    for (const file of entry.files) {
      if (!/\.hbs$/.test(file.templateName)) add(skill, `template ${file.templateName} is not a .hbs`);
      if (!/^[a-z0-9-]+\.md$/.test(file.outputName)) add(skill, `output ${file.outputName} is not a kebab .md`);
      if (file.title.trim() === '') add(skill, `${file.outputName} has no title`);
    }

    const ids = entry.uses.map((use) => use.id);
    if (new Set(ids).size !== ids.length) add(skill, 'duplicate use id');
    const used = new Set<string>();
    for (const use of entry.uses) {
      if (!REFERENCE_LOAD_KINDS.includes(use.loading)) add(skill, `${use.id} has unknown loading kind`);
      if (use.purpose.trim() === '') add(skill, `${use.id} has no purpose`);
      if (use.site.trim() === '') add(skill, `${use.id} has no site`);
      if (use.phase.trim() === '') add(skill, `${use.id} has no phase`);
      for (const scale of use.scales ?? []) {
        if (!CHANGE_SCALES.includes(scale)) add(skill, `${use.id} names unknown scale ${scale}`);
      }
      for (const scope of use.uiScopes ?? []) {
        if (!UI_SCOPES.includes(scope)) add(skill, `${use.id} names unknown UI scope ${scope}`);
      }
      if (use.target.kind !== 'reference') continue;
      if (!outputs.includes(use.target.reference)) {
        add(skill, `${use.id} points at undeclared ${use.target.reference}`);
      }
      used.add(use.target.reference);
    }
    for (const output of outputs) if (!used.has(output)) add(skill, `${output} has no load point`);

    const slotIds = entry.slots.map((slot) => slot.id);
    if (new Set(slotIds).size !== slotIds.length) add(skill, 'duplicate slot id');
    for (const slot of entry.slots) {
      if (slot.site.trim() === '') add(skill, `slot ${slot.id} has no site`);
      const members = slot.groups.flatMap((group) => group.uses);
      if (members.length === 0) add(skill, `slot ${slot.id} renders no use`);
      for (const id of members) {
        if (!ids.includes(id)) add(skill, `slot ${slot.id} names unknown use ${id}`);
      }
      // The `**MANDATORY**` marker is prose the slot owns while `loading` is data
      // the projections read; either one alone would let them disagree.
      const marked = `${slot.prefix ?? ''}${slot.suffix ?? ''}`.includes('**MANDATORY**');
      const kinds = members
        .map((id) => entry.uses.find((use) => use.id === id)?.loading)
        .filter((kind): kind is (typeof REFERENCE_LOAD_KINDS)[number] => kind !== undefined);
      if (kinds.length > 0 && kinds.every((kind) => kind === 'startup-mandatory') !== marked) {
        add(skill, `slot ${slot.id} marks MANDATORY inconsistently with its load points`);
      }
    }
  }
  return problems;
}
