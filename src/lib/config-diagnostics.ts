import { z } from 'zod';
import { ProspecConfigSchema, isRecord, type ConfigDiagnostic } from '../types/config.js';

const MAX_SUGGESTION_DISTANCE = 2;

function editDistance(left: string, right: string): number {
  const leftChars = [...left];
  const rightChars = [...right];
  if (Math.abs(leftChars.length - rightChars.length) > MAX_SUGGESTION_DISTANCE) {
    return MAX_SUGGESTION_DISTANCE + 1;
  }

  let previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);
  for (let row = 1; row <= leftChars.length; row++) {
    const current = [row];
    for (let column = 1; column <= rightChars.length; column++) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (leftChars[row - 1] === rightChars[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[rightChars.length]!;
}

function nearestKey(key: string, candidates: string[]): string | undefined {
  let nearest: string | undefined;
  let nearestDistance = MAX_SUGGESTION_DISTANCE + 1;
  let tied = false;
  for (const candidate of candidates) {
    const distance = editDistance(key, candidate);
    if (distance > MAX_SUGGESTION_DISTANCE) continue;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
      tied = false;
    } else if (distance === nearestDistance) {
      tied = true;
    }
  }
  return tied ? undefined : nearest;
}

export function collectConfigDiagnostics(
  parsed: unknown,
  rootSchema: z.core.$ZodType = ProspecConfigSchema,
): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];

  function walk(value: unknown, schema: z.core.$ZodType, parent: string[]): void {
    while (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
      schema = schema.unwrap();
    }
    if (!(schema instanceof z.ZodObject) || !isRecord(value)) return;

    const shape = schema.shape;
    const keys = Object.keys(shape);
    for (const [key, child] of Object.entries(value)) {
      const path = [...parent, key];
      if (Object.hasOwn(shape, key)) {
        walk(child, shape[key], path);
      } else {
        const suggestion = nearestKey(key, keys);
        diagnostics.push({ path, ...(suggestion === undefined ? {} : { suggestion }) });
      }
    }
  }

  walk(parsed, rootSchema, []);
  return diagnostics;
}
