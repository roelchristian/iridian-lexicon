/**
 * Schema version migration for YAML source files.
 *
 * Migration happens in-memory during the pipeline's import step.
 * Files on disk are never rewritten unless the user explicitly runs
 * `cli migrate --rewrite`.
 *
 * Migration transforms are additive: each transform takes a raw object
 * at version N and upgrades it to version N+1.  Transforms are chained
 * until the object reaches CURRENT_SOURCE_SCHEMA_VERSION.
 */

import type { MigrationChange, MigrationPreview } from '../types/index.js';
import {
  CURRENT_SOURCE_SCHEMA_VERSION,
  isMigratable,
} from './versions.js';

export type RawEntry = Record<string, unknown>;

/** A single step in the migration chain. */
interface MigrationStep {
  from: string;
  to: string;
  transform: (raw: RawEntry) => { data: RawEntry; changes: MigrationChange[] };
}

/**
 * All migration steps, ordered from oldest to newest.
 * Add new entries here as the schema evolves.
 */
const MIGRATION_STEPS: MigrationStep[] = [
  // Example of a future migration:
  // {
  //   from: '0.9',
  //   to: '1.0',
  //   transform: (raw) => {
  //     const changes: MigrationChange[] = [];
  //     const data = { ...raw };
  //     // e.g. rename 'gloss' to 'glosses' and wrap in array
  //     if (typeof data['gloss'] === 'string') {
  //       changes.push({ field: 'glosses', old_value: data['gloss'], new_value: [data['gloss']], reason: 'gloss renamed to glosses array in 1.0' });
  //       data['glosses'] = [data['gloss']];
  //       delete data['gloss'];
  //     }
  //     data['schema_version'] = '1.0';
  //     return { data, changes };
  //   },
  // },
];

/**
 * Migrate a raw YAML object from its declared schema_version to the current
 * version.  Returns the migrated object and a list of changes made.
 *
 * Throws if the version is not migratable or is already current.
 */
export function migrate(
  raw: RawEntry,
  filePath: string
): { data: RawEntry; preview: MigrationPreview } {
  const fromVersion = String(raw['schema_version'] ?? 'unknown');

  if (fromVersion === CURRENT_SOURCE_SCHEMA_VERSION) {
    return {
      data: raw,
      preview: {
        file: filePath,
        from_version: fromVersion,
        to_version: fromVersion,
        changes: [],
      },
    };
  }

  if (!isMigratable(fromVersion)) {
    throw new Error(
      `Cannot migrate schema version "${fromVersion}" in ${filePath}: ` +
        `no migration path to ${CURRENT_SOURCE_SCHEMA_VERSION}`
    );
  }

  let current = { ...raw };
  const allChanges: MigrationChange[] = [];
  let currentVersion = fromVersion;

  // Walk the step chain
  while (currentVersion !== CURRENT_SOURCE_SCHEMA_VERSION) {
    const step = MIGRATION_STEPS.find((s) => s.from === currentVersion);
    if (!step) {
      throw new Error(
        `No migration step from version "${currentVersion}" found in ${filePath}`
      );
    }
    const { data, changes } = step.transform(current);
    current = data;
    allChanges.push(...changes);
    currentVersion = step.to;
  }

  return {
    data: current,
    preview: {
      file: filePath,
      from_version: fromVersion,
      to_version: CURRENT_SOURCE_SCHEMA_VERSION,
      changes: allChanges,
    },
  };
}

/**
 * Returns true if the raw entry needs migration (its version differs from
 * the current version).
 */
export function needsMigration(raw: RawEntry): boolean {
  const v = String(raw['schema_version'] ?? 'unknown');
  return v !== CURRENT_SOURCE_SCHEMA_VERSION;
}
