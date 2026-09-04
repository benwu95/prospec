import {
  MODULE_README_CONTENT_FORMATS,
  MODULE_README_FORMAT_DATE,
  MODULE_README_MCP_VISIBILITIES,
  type ModuleReadmeExtensionDeclaration,
} from '../types/module-readme-format.js';
import type { ValidationFinding, ValidationVerdict } from './artifact-validators.js';
import { findTable, isSeparatorRow, splitTableRow } from './markdown-table.js';
import { hasUnclosedFence, withoutFencedBlocks } from './markdown-fences.js';
import { isSafeResourceName } from './knowledge-reader.js';
import { AUTO_START, AUTO_END, USER_START, USER_END } from './content-markers.js';

const FORMAT_MARKER = `<!-- prospec:module-readme-format ${MODULE_README_FORMAT_DATE} -->`;
const REGISTRY_HEADERS = ['ID', 'Heading', 'Content', 'Applies To', 'Required', 'MCP Visibility', 'Content Format'];
const CORE_HEADINGS = [
  '## Key Files',
  '## Public API',
  '## Dependencies',
  '## Modification Guide',
  '## Pitfalls',
] as const;

interface ManagedBlock {
  start: number;
  end: number;
}

interface ExtensionInstance {
  id: string;
  start: number;
  end: number;
  heading: string | null;
  headingLine: number | null;
}

export interface ModuleReadmeRegistryReport extends ValidationVerdict {
  declarations: ModuleReadmeExtensionDeclaration[];
}

export interface ModuleReadmeFormatFacts {
  declarations: ModuleReadmeExtensionDeclaration[];
  extensionIds: string[];
}

export interface ModuleReadmeFormatReport extends ValidationVerdict {
  facts: ModuleReadmeFormatFacts;
}

export interface ValidateModuleReadmeFormatInput {
  module: string;
  readme: string;
  convention: string;
}

function finding(findings: ValidationFinding[], line: number, message: string): void {
  findings.push({ level: 'FAIL', message: `line ${line}: ${message}` });
}

function maskedLines(content: string, findings: ValidationFinding[], label: string): string[] | null {
  const lines = content.split(/\r?\n/);
  if (hasUnclosedFence(lines)) {
    finding(findings, lines.length, `${label} has an unclosed Markdown fence; close it before validating format`);
    // The masked view of a document with an open fence is truncated, so every
    // downstream grammar check would fire on garbage. Stop with the one
    // actionable finding instead of a cascade of misleading ones.
    return null;
  }
  return withoutFencedBlocks(lines);
}

function markerIndexes(lines: string[], marker: string): number[] {
  return lines.flatMap((line, index) => (line.trim() === marker ? [index] : []));
}

function managedBlock(
  lines: string[],
  startMarker: string,
  endMarker: string,
  findings: ValidationFinding[],
  label: string,
): ManagedBlock | null {
  const starts = markerIndexes(lines, startMarker);
  const ends = markerIndexes(lines, endMarker);
  if (starts.length !== 1 || ends.length !== 1) {
    finding(findings, 1, `${label} must contain exactly one ${startMarker} and ${endMarker}`);
    return null;
  }
  const [start] = starts;
  const [end] = ends;
  if (start === undefined || end === undefined || start >= end) {
    finding(findings, (start ?? end ?? 0) + 1, `${label} markers are out of order`);
    return null;
  }
  return { start, end };
}

function parseAppliesTo(raw: string, line: number, findings: ValidationFinding[]): 'all' | readonly string[] | null {
  if (raw === 'all') return 'all';
  const names = raw.split(',').map((name) => name.trim());
  if (names.some((name) => !isSafeResourceName(name))) {
    finding(findings, line, '`Applies To` must be `all` or comma-separated safe module names');
    return null;
  }
  return names;
}

/** Parse the Project Section Extensions registry from the convention's preserved user block. */
export function parseModuleReadmeExtensions(convention: string): ModuleReadmeRegistryReport {
  const findings: ValidationFinding[] = [];
  const lines = maskedLines(convention, findings, 'Module README convention');
  if (lines === null) return { ok: false, findings, declarations: [] };
  const user = managedBlock(lines, USER_START, USER_END, findings, 'Module README convention user block');
  if (user === null) return { ok: false, findings, declarations: [] };

  const userLines = lines.slice(user.start + 1, user.end);
  const table = findTable(userLines, {
    isTarget: (headers) => headers.length === REGISTRY_HEADERS.length
      && headers.every((header, index) => header === REGISTRY_HEADERS[index]!.toLowerCase()),
  });
  if (table === null) {
    finding(findings, user.start + 2, 'Project Section Extensions table is missing or has invalid headers');
    return { ok: false, findings, declarations: [] };
  }
  if (!table.headers.every((header, index) => header === REGISTRY_HEADERS[index])) {
    finding(findings, user.start + table.start + 2, `registry header must be exactly ${REGISTRY_HEADERS.join(' | ')}`);
  }

  const declarations: ModuleReadmeExtensionDeclaration[] = [];
  const ids = new Set<string>();
  for (const [offset, row] of table.rows.entries()) {
    const line = user.start + table.start + offset + 4;
    if (row.length !== REGISTRY_HEADERS.length || row.some((cell) => cell.length === 0)) {
      finding(findings, line, 'each Project Section Extensions row needs seven non-empty cells');
      continue;
    }
    const [id, heading, content, appliesRaw, requiredRaw, visibilityRaw, contentFormatRaw] = row;
    if (id === undefined || heading === undefined || content === undefined || appliesRaw === undefined || requiredRaw === undefined || visibilityRaw === undefined || contentFormatRaw === undefined) continue;
    if (!isSafeResourceName(id)) {
      finding(findings, line, `extension ID '${id}' is not a safe resource name`);
      continue;
    }
    if (ids.has(id)) {
      finding(findings, line, `extension ID '${id}' is duplicated`);
      continue;
    }
    ids.add(id);
    const appliesTo = parseAppliesTo(appliesRaw, line, findings);
    if (appliesTo === null) continue;
    if (requiredRaw !== 'required' && requiredRaw !== 'optional') {
      finding(findings, line, '`Required` must be `required` or `optional`');
      continue;
    }
    if (!(MODULE_README_MCP_VISIBILITIES as readonly string[]).includes(visibilityRaw)) {
      finding(findings, line, '`MCP Visibility` must be `included` for raw README passthrough');
      continue;
    }
    if (!(MODULE_README_CONTENT_FORMATS as readonly string[]).includes(contentFormatRaw)) {
      finding(findings, line, '`Content Format` must be `markdown` or `field-table`');
      continue;
    }
    declarations.push({
      id,
      heading,
      content,
      appliesTo,
      required: requiredRaw === 'required',
      mcpVisibility: visibilityRaw as ModuleReadmeExtensionDeclaration['mcpVisibility'],
      contentFormat: contentFormatRaw as ModuleReadmeExtensionDeclaration['contentFormat'],
    });
  }
  return { ok: findings.every((item) => item.level !== 'FAIL'), findings, declarations };
}

/** Select extension declarations which apply to a safely named module. */
export function applicableModuleReadmeExtensions(
  declarations: readonly ModuleReadmeExtensionDeclaration[],
  module: string,
): ModuleReadmeExtensionDeclaration[] {
  return declarations.filter((declaration) => declaration.appliesTo === 'all' || declaration.appliesTo.includes(module));
}

/**
 * The extension's declared heading is the first non-empty line inside the block,
 * but ONLY when it is a genuine level-2 heading. A plain-text line whose text
 * happens to equal the registered heading must not pass as `## {heading}` — hence
 * the capture rather than a `^##\s+` strip (which could not tell the two apart).
 */
function extractInstanceHeading(
  lines: string[],
  startIndex: number,
  endIndex: number,
): { heading: string | null; headingLine: number | null } {
  const headingLine = lines.findIndex(
    (candidate, candidateIndex) => candidateIndex > startIndex && candidateIndex < endIndex && candidate.trim() !== '',
  );
  if (headingLine < 0) return { heading: null, headingLine: null };
  const h2 = /^##\s+(\S.*)$/.exec(lines[headingLine]!.trim());
  return { heading: h2 ? h2[1]!.trim() : null, headingLine };
}

function collectExtensionInstances(
  lines: string[],
  user: ManagedBlock,
  findings: ValidationFinding[],
): ExtensionInstance[] {
  const instances: ExtensionInstance[] = [];
  const startPattern = /^<!--\s*prospec:section-start\s+(.+?)\s*-->$/;
  const endPattern = /^<!--\s*prospec:section-end\s+(.+?)\s*-->$/;
  let open: { id: string; start: number } | null = null;

  for (const [index, line] of lines.entries()) {
    const start = startPattern.exec(line.trim());
    const end = endPattern.exec(line.trim());
    if (start === null && end === null) continue;
    if (index <= user.start || index >= user.end) {
      finding(findings, index + 1, 'extension section markers must be inside the README user block');
      continue;
    }
    if (start !== null) {
      const id = start[1]?.trim() ?? '';
      if (open !== null) {
        finding(findings, index + 1, `extension '${id}' starts before '${open.id}' ends`);
        continue;
      }
      open = { id, start: index };
      continue;
    }
    const id = end?.[1]?.trim() ?? '';
    if (open === null) {
      finding(findings, index + 1, `extension '${id}' ends without a matching start marker`);
      continue;
    }
    if (open.id !== id) {
      finding(findings, index + 1, `extension end ID '${id}' does not match start ID '${open.id}'`);
    }
    // Close the started block at this end marker even on a mismatch: recording the
    // opened extension keeps a mismatched end from also tripping the required /
    // "missing" check for the extension that WAS opened (one clear finding, not two).
    const { heading, headingLine } = extractInstanceHeading(lines, open.start, index);
    instances.push({ id: open.id, start: open.start, end: index, heading, headingLine });
    open = null;
  }
  if (open !== null) finding(findings, open.start + 1, `extension '${open.id}' has no matching end marker`);
  return instances;
}

function validateFieldTable(
  lines: string[],
  instance: ExtensionInstance,
  findings: ValidationFinding[],
): void {
  // `body` starts on the line AFTER the heading (or after the section-start marker
  // when there is none). Anchor every finding line to `bodyStart`: a table offset
  // is relative to the body, so adding it to `instance.start` would misreport.
  const bodyStart = instance.headingLine === null ? instance.start + 1 : instance.headingLine + 1;
  const body = lines.slice(bodyStart, instance.end);
  const table = findTable(body, {
    isTarget: (headers) => headers.length === 2 && headers[0] === 'field' && headers[1] === 'value',
  });
  if (table === null || !table.headers.every((header, index) => header === ['Field', 'Value'][index])) {
    finding(findings, bodyStart + (table?.start ?? 0) + 1, 'field-table extension needs the exact `| Field | Value |` header');
    return;
  }
  const separator = body[table.start + 1] ?? '';
  const separatorCells = splitTableRow(separator);
  if (!isSeparatorRow(separator) || separatorCells.length !== 2 || separatorCells.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    finding(findings, bodyStart + table.start + 2, 'field-table extension needs a valid two-column separator');
  }
  if (table.rows.length === 0) {
    finding(findings, bodyStart + table.start + 3, 'field-table extension needs at least one body row');
  }
  for (const [offset, row] of table.rows.entries()) {
    if (row.length !== 2 || row.some((cell) => cell.length === 0)) {
      finding(findings, bodyStart + table.start + offset + 3, 'field-table body rows need exactly two non-empty cells');
    }
  }
}

function validateCoreGrammar(lines: string[], findings: ValidationFinding[]): ManagedBlock | null {
  const title = lines[0]?.trim() ?? '';
  if (!/^#\s+\S/.test(title)) finding(findings, 1, 'Module README must start with one level-1 title');
  const summaryIndex = lines.findIndex((line, index) => index > 0 && line.trim() !== '');
  const hasSummary = summaryIndex >= 0 && /^>\s+\S/.test((lines[summaryIndex] ?? '').trim());
  if (!hasSummary) {
    finding(findings, Math.max(2, summaryIndex + 1), 'Module README needs one blockquote summary after its title');
  }
  const markers = markerIndexes(lines, FORMAT_MARKER);
  if (markers.length === 0) {
    // Anchor to the line the marker belongs on, not to the title: a reader who
    // omitted it needs to know where it goes, and line 1 sends them to the title.
    finding(
      findings,
      hasSummary ? summaryIndex + 2 : 1,
      `Module README needs exactly one ${FORMAT_MARKER} on the first non-blank line after the summary, above ${AUTO_START}`,
    );
  } else if (markers.length > 1) {
    finding(findings, 1, `Module README needs exactly one ${FORMAT_MARKER}`);
  }
  const auto = managedBlock(lines, AUTO_START, AUTO_END, findings, 'Module README auto block');
  const user = managedBlock(lines, USER_START, USER_END, findings, 'Module README user block');
  if (auto === null || user === null) return null;
  if (markers[0] !== undefined) {
    if (auto.start < markers[0]) {
      // Out-of-order header: the gaps below are not gaps at all, and scanning
      // them would report every line of the document as misplaced. One finding
      // that names the real problem beats a cascade of misleading ones.
      finding(findings, auto.start + 1, 'auto block must appear after the format marker');
    } else {
      // Both header gaps admit blank lines and nothing else — one rule, reported
      // at the same density on both sides so they cannot drift apart.
      if (hasSummary) {
        for (let i = summaryIndex + 1; i < markers[0]; i++) {
          if (lines[i]?.trim() !== '') {
            finding(findings, i + 1, 'only blank lines may separate the summary from the format marker');
          }
        }
      }
      for (let i = markers[0] + 1; i < auto.start; i++) {
        if (lines[i]?.trim() !== '') {
          finding(findings, i + 1, 'content is not allowed between format marker and auto block');
        }
      }
    }
  }
  if (auto.end >= user.start) {
    finding(findings, user.start + 1, 'user block must follow the auto block');
  } else {
    for (let i = auto.end + 1; i < user.start; i++) {
      if (lines[i]?.trim() !== '') {
        finding(findings, i + 1, 'content is not allowed between auto block and user block');
      }
    }
  }

  const autoHeadings: { heading: string; lineIndex: number }[] = [];
  for (let i = auto.start + 1; i < auto.end; i++) {
    const line = lines[i]?.trim() ?? '';
    if (/^##\s+/.test(line)) {
      autoHeadings.push({ heading: line, lineIndex: i });
    }
  }
  const seenHeadings = new Set<string>();
  for (const item of autoHeadings) {
    if (seenHeadings.has(item.heading)) {
      finding(findings, item.lineIndex + 1, `Core heading ${item.heading} is duplicated`);
    }
    seenHeadings.add(item.heading);
  }

  const positions = CORE_HEADINGS.map((heading) => lines.findIndex((line, index) => index > auto.start && index < auto.end && line.trim() === heading));
  for (const [index, position] of positions.entries()) {
    if (position < 0) finding(findings, auto.start + 1, `required Core heading missing: ${CORE_HEADINGS[index]}`);
    if (index > 0 && position >= 0 && positions[index - 1]! >= position) {
      finding(findings, position + 1, `Core heading ${CORE_HEADINGS[index]} is out of order`);
    }
  }
  const ripple = lines.findIndex((line, index) => index > auto.start && index < auto.end && line.trim() === '## Ripple Effects');
  const modification = positions[3] ?? -1;
  const pitfalls = positions[4] ?? -1;
  if (ripple >= 0 && (ripple < modification || ripple > pitfalls)) {
    finding(findings, ripple + 1, 'optional Ripple Effects must appear between Modification Guide and Pitfalls');
  }
  const subModules = lines.findIndex((line, index) => index > auto.start && index < auto.end && line.trim() === '## Sub-Modules');
  if (subModules >= 0 && subModules < pitfalls) {
    finding(findings, subModules + 1, 'optional Sub-Modules must follow Pitfalls');
  }
  return user;
}

/** Validate a Module README against the canonical Markdown registry without writing either file. */
export function validateModuleReadmeFormat(input: ValidateModuleReadmeFormatInput): ModuleReadmeFormatReport {
  const findings: ValidationFinding[] = [];
  if (!isSafeResourceName(input.module)) {
    finding(findings, 1, `'${input.module}' is not a safe module name`);
  }
  const registry = parseModuleReadmeExtensions(input.convention);
  findings.push(...registry.findings);
  const lines = maskedLines(input.readme, findings, 'Module README');
  if (lines === null) {
    return { ok: false, findings, facts: { declarations: registry.declarations, extensionIds: [] } };
  }
  const user = validateCoreGrammar(lines, findings);
  const instances = user === null ? [] : collectExtensionInstances(lines, user, findings);
  const declarations = applicableModuleReadmeExtensions(registry.declarations, input.module);
  const declaredById = new Map(registry.declarations.map((declaration) => [declaration.id, declaration]));
  const seen = new Set<string>();

  for (const instance of instances) {
    const declaration = declaredById.get(instance.id);
    if (declaration === undefined) {
      finding(findings, instance.start + 1, `extension '${instance.id}' is not registered`);
      continue;
    }
    if (!applicableModuleReadmeExtensions([declaration], input.module).length) {
      finding(findings, instance.start + 1, `extension '${instance.id}' does not apply to module '${input.module}'`);
    }
    if (seen.has(instance.id)) finding(findings, instance.start + 1, `extension '${instance.id}' is duplicated`);
    seen.add(instance.id);
    if (instance.heading !== declaration.heading) {
      finding(findings, instance.headingLine === null ? instance.start + 1 : instance.headingLine + 1, `extension '${instance.id}' must use heading '## ${declaration.heading}'`);
    }
    if (declaration.contentFormat === 'field-table') validateFieldTable(lines, instance, findings);
  }
  for (const declaration of declarations) {
    if (declaration.required && !seen.has(declaration.id)) {
      finding(findings, user === null ? 1 : user.start + 1, `required extension '${declaration.id}' is missing`);
    }
  }
  return {
    ok: findings.every((item) => item.level !== 'FAIL'),
    findings,
    facts: { declarations: registry.declarations, extensionIds: instances.map((instance) => instance.id) },
  };
}
