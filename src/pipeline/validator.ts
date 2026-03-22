/**
 * Validation step in the pipeline.
 *
 * Takes a raw parsed YAML object (already migrated to current schema version),
 * detects its kind, and validates against the appropriate Zod schema.
 * Returns typed validated data or structured errors.
 */

import { ZodError } from 'zod';
import type { ValidationError } from '../types/index.js';
import {
  detectEntryKind,
  InflectionRuleSchema,
  LexemeEntrySchema,
  MorphemeEntrySchema,
  MorphotacticRuleSchema,
  SyntaxRuleSchema,
  type AnyValidatedEntry,
} from '../schema/validators.js';
import { CURRENT_SOURCE_SCHEMA_VERSION, isSupported } from '../schema/versions.js';
import type { RawSourceFile } from './reader.js';
import type { RawEntry } from '../schema/migrator.js';

export interface ValidatedFile {
  source: RawSourceFile;
  kind: string;
  data: AnyValidatedEntry;
}

export interface FileValidationError {
  source: RawSourceFile;
  errors: ValidationError[];
}

/**
 * Validate a single migrated raw entry against its schema.
 */
export function validateEntry(
  raw: RawEntry,
  filePath: string
): { ok: true; kind: string; data: AnyValidatedEntry } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // Check schema_version first
  const version = raw['schema_version'];
  if (typeof version !== 'string' || !isSupported(version)) {
    errors.push({
      file: filePath,
      field: 'schema_version',
      message: `Unsupported schema_version "${String(version)}". ` +
        `Current version is "${CURRENT_SOURCE_SCHEMA_VERSION}".`,
      code: 'UNSUPPORTED_VERSION',
    });
    return { ok: false, errors };
  }

  const kind = detectEntryKind(raw);

  if (kind === 'unknown') {
    errors.push({
      file: filePath,
      field: 'entry_kind',
      message:
        'Cannot determine entry kind. Ensure entry_kind is set to "lexeme" or "morpheme", ' +
        'or rule_kind is set to "inflection", "morphotactic", or "syntax".',
      code: 'UNKNOWN_ENTRY_KIND',
    });
    return { ok: false, errors };
  }

  // Select schema
  const schemaMap = {
    'lexeme': LexemeEntrySchema,
    'morpheme': MorphemeEntrySchema,
    'inflection-rule': InflectionRuleSchema,
    'morphotactic-rule': MorphotacticRuleSchema,
    'syntax-rule': SyntaxRuleSchema,
  } as const;

  const schema = schemaMap[kind as keyof typeof schemaMap];
  const result = schema.safeParse(raw);

  if (!result.success) {
    const zodErrors = flattenZodError(result.error, filePath);
    return { ok: false, errors: zodErrors };
  }

  return { ok: true, kind, data: result.data as AnyValidatedEntry };
}

function flattenZodError(err: ZodError, filePath: string): ValidationError[] {
  return err.issues.map((issue) => ({
    file: filePath,
    field: issue.path.join('.') || undefined,
    message: issue.message,
    code: issue.code.toUpperCase(),
  }));
}

/**
 * Validate all migrated files and check cross-file constraints
 * (duplicate ids, duplicate keys, unknown template references).
 */
export function validateAll(
  files: Array<{ source: RawSourceFile; migratedRaw: RawEntry }>
): {
  valid: ValidatedFile[];
  errors: FileValidationError[];
  crossFileErrors: ValidationError[];
} {
  const valid: ValidatedFile[] = [];
  const errors: FileValidationError[] = [];

  for (const { source, migratedRaw } of files) {
    const result = validateEntry(migratedRaw, source.relativePath);
    if (result.ok) {
      valid.push({ source, kind: result.kind, data: result.data });
    } else {
      errors.push({ source, errors: result.errors });
    }
  }

  // Cross-file validation
  const crossFileErrors: ValidationError[] = [];

  // Check duplicate ids
  const idMap = new Map<string, string[]>();
  for (const vf of valid) {
    const id = (vf.data as Record<string, unknown>)['id'] as string;
    if (!idMap.has(id)) idMap.set(id, []);
    idMap.get(id)!.push(vf.source.relativePath);
  }
  for (const [id, files] of idMap) {
    if (files.length > 1) {
      crossFileErrors.push({
        file: files.join(', '),
        field: 'id',
        message: `Duplicate id "${id}" found in: ${files.join(', ')}`,
        code: 'DUPLICATE_ID',
      });
    }
  }

  // Check duplicate keys
  const keyMap = new Map<string, string[]>();
  for (const vf of valid) {
    const key = (vf.data as Record<string, unknown>)['key'] as string;
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key)!.push(vf.source.relativePath);
  }
  for (const [key, files] of keyMap) {
    if (files.length > 1) {
      crossFileErrors.push({
        file: files.join(', '),
        field: 'key',
        message: `Duplicate key "${key}" found in: ${files.join(', ')}`,
        code: 'DUPLICATE_KEY',
      });
    }
  }

  // Check template_id references
  const ruleKeys = new Set(
    valid
      .filter((vf) => vf.kind === 'inflection-rule')
      .map((vf) => (vf.data as Record<string, unknown>)['key'] as string)
  );

  for (const vf of valid) {
    if (vf.kind !== 'lexeme') continue;
    const lexeme = vf.data as { template_id?: string; key: string };
    if (
      lexeme.template_id !== undefined &&
      !ruleKeys.has(lexeme.template_id)
    ) {
      crossFileErrors.push({
        file: vf.source.relativePath,
        field: 'template_id',
        message: `Unknown template_id "${lexeme.template_id}" referenced in lexeme "${lexeme.key}"`,
        code: 'UNKNOWN_TEMPLATE_REF',
      });
    }
  }

  return { valid, errors, crossFileErrors };
}
