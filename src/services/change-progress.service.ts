import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { parseTaskLine, type ParsedTaskLine } from '../lib/task-markers.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeProgressOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** Task to mark complete — its leading ID token (`T5`) or a 1-based ordinal. */
  complete?: string;
}

export interface ChangeProgressResult {
  changeName: string;
  /** The task text that was flipped this run (absent in report-only mode). */
  completedTask?: string;
  /** true when `--complete` named an already-checked task (no-op). */
  alreadyChecked: boolean;
  /** Code-task progress — the completion denominator counts code tasks only. */
  progress: { checked: number; total: number };
  /** First unchecked code task, in file order. */
  nextTask?: string;
  /** Unchecked [M]/[V] tasks — reminders, never counted or blocking. */
  uncheckedManual: string[];
  uncheckedVerification: string[];
  allCodeDone: boolean;
}

interface TaskLine {
  lineIndex: number;
  parsed: ParsedTaskLine;
}

function collectTasks(lines: string[]): TaskLine[] {
  const tasks: TaskLine[] = [];
  lines.forEach((line, lineIndex) => {
    const parsed = parseTaskLine(line);
    if (parsed) tasks.push({ lineIndex, parsed });
  });
  return tasks;
}

function findTarget(tasks: TaskLine[], selector: string): TaskLine | undefined {
  const wanted = selector.toLowerCase();
  const byToken = tasks.find(
    (t) => t.parsed.text.split(/\s+/)[0]?.toLowerCase() === wanted,
  );
  if (byToken) return byToken;
  if (/^\d+$/.test(selector)) {
    return tasks[Number.parseInt(selector, 10) - 1];
  }
  return undefined;
}

/**
 * `prospec change progress` — task checkbox bookkeeping over the frozen
 * task-kind grammar (`lib/task-markers.ts`, the same parser verify's
 * task-completion check reads).
 *
 * Without `--complete` it only reports: code-task X/Y, the next unchecked code
 * task, and unchecked [M]/[V] reminders. With `--complete <id|ordinal>` it
 * flips that task's checkbox first (idempotent on an already-checked task) —
 * the one mutation, preserving every other byte of tasks.md.
 */
export async function execute(options: ChangeProgressOptions): Promise<ChangeProgressResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change should report task progress?',
  );

  const tasksPath = path.join(cwd, '.prospec', 'changes', changeName, 'tasks.md');
  if (!fs.existsSync(tasksPath)) {
    throw new PrerequisiteError(
      `tasks.md not found for change '${changeName}'`,
      'Run `prospec change tasks` (or /prospec-tasks) first to create the task list',
    );
  }

  const lines = fs.readFileSync(tasksPath, 'utf-8').split('\n');
  let tasks = collectTasks(lines);
  if (tasks.length === 0) {
    throw new PrerequisiteError(
      `tasks.md for '${changeName}' contains no checkbox tasks`,
      'Populate the task list per the tasks-format reference before tracking progress',
    );
  }

  let completedTask: string | undefined;
  let alreadyChecked = false;

  if (options.complete !== undefined) {
    const target = findTarget(tasks, options.complete);
    if (!target) {
      throw new PrerequisiteError(
        `Task '${options.complete}' not found in tasks.md`,
        'Name the task by its leading ID token (e.g. T5) or its 1-based position in the list',
      );
    }
    if (target.parsed.checked) {
      alreadyChecked = true;
    } else {
      const line = lines[target.lineIndex]!;
      lines[target.lineIndex] = line.replace(/\[ \]/i, '[x]');
      await atomicWrite(tasksPath, lines.join('\n'));
      completedTask = target.parsed.text;
      tasks = collectTasks(lines);
    }
  }

  const codeTasks = tasks.filter((t) => t.parsed.kind === 'code');
  const checked = codeTasks.filter((t) => t.parsed.checked).length;
  const nextTask = codeTasks.find((t) => !t.parsed.checked)?.parsed.text;

  return {
    changeName,
    ...(completedTask !== undefined ? { completedTask } : {}),
    alreadyChecked,
    progress: { checked, total: codeTasks.length },
    ...(nextTask !== undefined ? { nextTask } : {}),
    uncheckedManual: tasks
      .filter((t) => t.parsed.kind === 'manual' && !t.parsed.checked)
      .map((t) => t.parsed.text),
    uncheckedVerification: tasks
      .filter((t) => t.parsed.kind === 'verification' && !t.parsed.checked)
      .map((t) => t.parsed.text),
    allCodeDone: codeTasks.length > 0 && checked === codeTasks.length,
  };
}
