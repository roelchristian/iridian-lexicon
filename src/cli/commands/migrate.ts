import chalk from 'chalk';
import { readAllSourceFiles, ALL_SOURCE_DIRS } from '../../pipeline/reader.js';
import { migrate, needsMigration, type RawEntry } from '../../schema/migrator.js';
import { rewriteMigration } from '../../pipeline/index.js';

export async function cmdMigrate(
  repoRoot: string,
  opts: { rewrite?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const { files } = readAllSourceFiles(ALL_SOURCE_DIRS, repoRoot);

  const needsMigrationFiles = files.filter((f) =>
    needsMigration(f.raw as RawEntry)
  );

  if (needsMigrationFiles.length === 0) {
    console.log(chalk.green('✓ All files are at the current schema version. Nothing to migrate.'));
    return;
  }

  console.log(
    chalk.cyan(`▶ ${needsMigrationFiles.length} file(s) need migration:`)
  );

  // Show preview for all files
  for (const f of needsMigrationFiles) {
    try {
      const { preview } = migrate(f.raw as RawEntry, f.relativePath);
      const from = preview.from_version;
      const to = preview.to_version;
      console.log(
        chalk.bold(`  ${f.relativePath}`) +
          chalk.gray(` ${from} → ${to}`)
      );
      if (preview.changes.length === 0) {
        console.log(chalk.gray('    (no field changes)'));
      }
      for (const change of preview.changes) {
        console.log(
          `    ${chalk.yellow(change.field)}: ` +
            chalk.red(JSON.stringify(change.old_value)) +
            ' → ' +
            chalk.green(JSON.stringify(change.new_value)) +
            chalk.gray(` (${change.reason})`)
        );
      }
    } catch (err) {
      console.log(chalk.red(`  ERROR in ${f.relativePath}: ${String(err)}`));
    }
  }

  if (opts.dryRun || !opts.rewrite) {
    if (!opts.rewrite) {
      console.log(
        chalk.yellow(
          '\n  Dry-run mode. Pass --rewrite to update files on disk.'
        )
      );
    }
    return;
  }

  // Perform actual rewrite
  console.log(chalk.cyan('\n▶ Rewriting files…'));
  const { written } = await rewriteMigration(repoRoot);
  for (const f of written) {
    console.log(chalk.green(`  ✓ Updated: ${f}`));
  }
  console.log(chalk.green(`\n✓ ${written.length} file(s) updated.`));
}
