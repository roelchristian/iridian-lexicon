#!/usr/bin/env node
/**
 * Iridian Lexicon CLI
 *
 * Usage:
 *   npx tsx src/cli/index.ts validate            # validate all YAML files
 *   npx tsx src/cli/index.ts migrate             # show migration preview (dry-run)
 *   npx tsx src/cli/index.ts migrate --rewrite   # rewrite source files to current schema
 *   npx tsx src/cli/index.ts rebuild             # full SQLite rebuild from YAML
 *   npx tsx src/cli/index.ts export              # generate TEMP/ artifacts for grammar repo
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cmdValidate } from './commands/validate.js';
import { cmdMigrate } from './commands/migrate.js';
import { cmdRebuild } from './commands/rebuild.js';
import { cmdExport } from './commands/export.js';

// Resolve repo root as the directory containing this CLI
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const program = new Command();

program
  .name('lexicon')
  .description('Iridian Lexicon CLI — YAML validation, SQLite rebuild, grammar export')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate all YAML source files without writing anything')
  .option('--strict', 'Treat warnings as errors')
  .action(async (opts: { strict?: boolean }) => {
    const ok = await cmdValidate(REPO_ROOT, opts);
    process.exitCode = ok ? 0 : 1;
  });

program
  .command('migrate')
  .description(
    'Show migration preview for files at older schema versions. ' +
      'Pass --rewrite to update files on disk.'
  )
  .option('--rewrite', 'Rewrite source YAML files to current schema version')
  .option('--dry-run', 'Show changes without writing (default)')
  .action(async (opts: { rewrite?: boolean; dryRun?: boolean }) => {
    await cmdMigrate(REPO_ROOT, opts);
  });

program
  .command('rebuild')
  .description(
    'Full pipeline: validate YAML, generate forms, rebuild SQLite projection'
  )
  .action(async () => {
    const ok = await cmdRebuild(REPO_ROOT);
    process.exitCode = ok ? 0 : 1;
  });

program
  .command('export')
  .description(
    'Generate grammar artifacts into TEMP/ (JSON export, LaTeX macros, appendix). ' +
      'Does not edit the grammar repo directly.'
  )
  .action(async () => {
    const ok = await cmdExport(REPO_ROOT);
    process.exitCode = ok ? 0 : 1;
  });

program.parse();
