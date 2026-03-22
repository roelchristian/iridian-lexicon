/**
 * Pipeline orchestration.
 *
 * The full import pipeline is:
 *   1. Read YAML files
 *   2. Validate file shape (check entry_kind, schema_version presence)
 *   3. Migrate older source schema versions forward in-memory
 *   4. Validate migrated result against current Zod schema
 *   5. Cross-file validation (duplicate ids/keys, unknown refs)
 *   6. Normalize into internal model
 *   7. (Caller) Write/update SQLite projection
 *
 * SQLite is never touched if any validation step fails.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

import { readAllSourceFiles, ALL_SOURCE_DIRS } from './reader.js';
import { migrate, needsMigration, type RawEntry } from '../schema/migrator.js';
import { validateAll } from './validator.js';
import { normalizeAll, type NormalizedDataset } from './normalizer.js';
import type {
  ValidationError,
  ValidationResult,
  MigrationPreview,
} from '../types/index.js';

export interface PipelineResult {
  ok: boolean;
  dataset?: NormalizedDataset;
  validation: ValidationResult;
  migrationPreviews: MigrationPreview[];
}

/**
 * Run the full import pipeline.
 *
 * @param repoRoot  Absolute path to the lexicon repo root.
 * @param opts.strict  If true, any warning is treated as an error.
 */
export async function runPipeline(
  repoRoot: string,
  opts: { strict?: boolean } = {}
): Promise<PipelineResult> {
  const { files: rawFiles, errors: readErrors } = readAllSourceFiles(
    ALL_SOURCE_DIRS,
    repoRoot
  );

  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];
  const migrationPreviews: MigrationPreview[] = [];

  // Collect read errors as validation errors
  for (const re of readErrors) {
    allErrors.push({
      file: re.filePath,
      message: re.error,
      code: 'READ_ERROR',
    });
  }

  // Step 2 & 3: migrate each raw file in-memory
  const migratedFiles: Array<{
    source: (typeof rawFiles)[0];
    migratedRaw: RawEntry;
  }> = [];

  for (const rawFile of rawFiles) {
    const raw = rawFile.raw as RawEntry;
    try {
      const { data, preview } = migrate(raw, rawFile.relativePath);
      migratedFiles.push({ source: rawFile, migratedRaw: data });
      if (preview.changes.length > 0) migrationPreviews.push(preview);
    } catch (err) {
      allErrors.push({
        file: rawFile.relativePath,
        message: String(err),
        code: 'MIGRATION_ERROR',
      });
    }
  }

  // Steps 4 & 5: validate
  const { valid, errors: fileErrors, crossFileErrors } = validateAll(migratedFiles);

  for (const fe of fileErrors) {
    allErrors.push(...fe.errors);
  }
  allErrors.push(...crossFileErrors);

  const totalFiles = rawFiles.length;
  const validCount = valid.length;
  const invalidCount = totalFiles - validCount + readErrors.length;

  const finalErrors = opts.strict
    ? [...allErrors, ...allWarnings]
    : allErrors;

  if (finalErrors.length > 0) {
    return {
      ok: false,
      validation: {
        valid: false,
        errors: finalErrors,
        warnings: allWarnings,
        file_count: totalFiles,
        valid_count: validCount,
        invalid_count: invalidCount,
      },
      migrationPreviews,
    };
  }

  // Step 6: normalize
  const dataset = normalizeAll(valid);

  return {
    ok: true,
    dataset,
    validation: {
      valid: true,
      errors: [],
      warnings: allWarnings,
      file_count: totalFiles,
      valid_count: validCount,
      invalid_count: 0,
    },
    migrationPreviews,
  };
}

/**
 * Validate only — do not write anything.  Returns the ValidationResult.
 */
export async function validateOnly(
  repoRoot: string
): Promise<ValidationResult> {
  const result = await runPipeline(repoRoot);
  return result.validation;
}

/**
 * Rewrite source YAML files to the current schema version in-place.
 * Only files that actually need migration are written.
 *
 * This is a destructive operation and should only be called from
 * `cli migrate --rewrite`.
 */
export async function rewriteMigration(
  repoRoot: string
): Promise<{ written: string[]; previews: MigrationPreview[] }> {
  const { files: rawFiles } = readAllSourceFiles(ALL_SOURCE_DIRS, repoRoot);
  const written: string[] = [];
  const previews: MigrationPreview[] = [];

  for (const rawFile of rawFiles) {
    const raw = rawFile.raw as RawEntry;
    if (!needsMigration(raw)) continue;

    const { data, preview } = migrate(raw, rawFile.relativePath);
    previews.push(preview);

    // Write the migrated data back to disk as YAML
    const newContent = yaml.dump(data, {
      indent: 2,
      lineWidth: 100,
      noRefs: true,
      sortKeys: false,
    });
    fs.writeFileSync(rawFile.filePath, newContent, 'utf-8');
    written.push(rawFile.relativePath);
  }

  return { written, previews };
}
