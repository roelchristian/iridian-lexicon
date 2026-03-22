/**
 * YAML file discovery and reading.
 *
 * Scans the canonical source directories and returns raw parsed objects.
 * Does not validate — that is the validator's job.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

export interface RawSourceFile {
  filePath: string;
  relativePath: string;
  raw: unknown;
}

/** Directories to scan for each entry kind. */
export const SOURCE_DIRS = {
  lexemes: [
    'lexemes/nouns',
    'lexemes/verbs',
    'lexemes/modifiers',
    'lexemes/function-words',
  ],
  morphemes: ['morphemes'],
  inflection_rules: ['rules/inflection'],
  morphotactic_rules: ['rules/morphotactics'],
  syntax_rules: ['rules/syntax'],
} as const;

/** All source directories combined. */
export const ALL_SOURCE_DIRS = [
  ...SOURCE_DIRS.lexemes,
  ...SOURCE_DIRS.morphemes,
  ...SOURCE_DIRS.inflection_rules,
  ...SOURCE_DIRS.morphotactic_rules,
  ...SOURCE_DIRS.syntax_rules,
];

/**
 * Discover all .yaml / .yml files under a directory (non-recursive by
 * default; pass recursive=true for nested subdirs).
 */
export function discoverYamlFiles(
  dir: string,
  repoRoot: string,
  recursive = false
): string[] {
  const absDir = path.resolve(repoRoot, dir);
  if (!fs.existsSync(absDir)) return [];

  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(absDir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...discoverYamlFiles(fullPath, repoRoot, true));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
    ) {
      files.push(fullPath);
    }
  }

  return files.sort(); // stable ordering for reproducible builds
}

/**
 * Read and parse a single YAML file.
 * Returns the raw parsed object and file metadata.
 * Throws a descriptive error if parsing fails.
 */
export function readYamlFile(filePath: string, repoRoot: string): RawSourceFile {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read file ${filePath}: ${String(err)}`);
  }

  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    throw new Error(`YAML parse error in ${filePath}: ${String(err)}`);
  }

  if (raw === null || raw === undefined) {
    throw new Error(`Empty or null YAML document in ${filePath}`);
  }

  return {
    filePath,
    relativePath: path.relative(repoRoot, filePath),
    raw,
  };
}

/**
 * Read all YAML source files from a list of directories.
 * Errors on individual files are collected and returned separately
 * so the caller can decide how to handle partial failures.
 */
export function readAllSourceFiles(
  dirs: readonly string[],
  repoRoot: string
): {
  files: RawSourceFile[];
  errors: Array<{ filePath: string; error: string }>;
} {
  const files: RawSourceFile[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const dir of dirs) {
    const yamlPaths = discoverYamlFiles(dir, repoRoot);
    for (const filePath of yamlPaths) {
      try {
        files.push(readYamlFile(filePath, repoRoot));
      } catch (err) {
        errors.push({ filePath, error: String(err) });
      }
    }
  }

  return { files, errors };
}
