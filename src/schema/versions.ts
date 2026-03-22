/**
 * Schema version constants and compatibility tables.
 *
 * source_schema_version governs the YAML file format.
 * db_schema_version governs the SQLite projection schema.
 *
 * These are intentionally decoupled: upgrading the DB layout does not
 * require rewriting YAML files, and vice-versa.
 */

export const CURRENT_SOURCE_SCHEMA_VERSION = '1.0';
export const CURRENT_DB_SCHEMA_VERSION = 1;

/**
 * All source schema versions this build can read.
 * Versions not in this list will be rejected before any import.
 */
export const SUPPORTED_SOURCE_VERSIONS: ReadonlySet<string> = new Set([
  '1.0',
]);

/**
 * Versions that can be auto-migrated to the current version.
 * (Currently empty — only 1.0 exists.  Add older versions here as the
 * schema evolves and migration transforms are added to migrator.ts.)
 */
export const MIGRATABLE_VERSIONS: ReadonlySet<string> = new Set([
  // '0.9',  // example of a future older version
]);

export function isSupported(version: string): boolean {
  return SUPPORTED_SOURCE_VERSIONS.has(version);
}

export function isMigratable(version: string): boolean {
  return MIGRATABLE_VERSIONS.has(version) || isSupported(version);
}
