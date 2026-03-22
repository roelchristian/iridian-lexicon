import chalk from 'chalk';
import { runPipeline } from '../../pipeline/index.js';
import { runRuleEngine } from '../../rules/engine.js';
import { openDb, needsRebuild, rebuildProjection } from '../../db/builder.js';

export async function cmdRebuild(repoRoot: string): Promise<boolean> {
  console.log(chalk.cyan('▶ Running import pipeline…'));

  const result = await runPipeline(repoRoot);

  if (!result.ok || !result.dataset) {
    console.log(chalk.red('✗ Validation failed. SQLite not updated.'));
    for (const err of result.validation.errors) {
      const field = err.field ? ` [${err.field}]` : '';
      console.log(chalk.red(`  ${err.file}${field}: ${err.message}`));
    }
    return false;
  }

  const { dataset } = result;
  const { file_count, valid_count } = result.validation;
  console.log(chalk.green(`✓ ${valid_count}/${file_count} files valid.`));

  if (result.migrationPreviews.length > 0) {
    console.log(
      chalk.yellow(
        `  ⚠ ${result.migrationPreviews.length} file(s) were migrated in-memory (source files not rewritten). ` +
          `Run \`cli migrate --rewrite\` to update them.`
      )
    );
  }

  // Run rule engine
  console.log(chalk.cyan('▶ Running rule engine…'));
  const engineResult = runRuleEngine(dataset);
  console.log(
    chalk.green(`✓ Generated ${engineResult.generated_forms.length} form(s).`)
  );
  for (const warn of engineResult.warnings) {
    console.log(chalk.yellow(`  ⚠ ${warn}`));
  }

  // Rebuild SQLite
  console.log(chalk.cyan('▶ Rebuilding SQLite projection…'));
  const db = openDb(repoRoot);
  rebuildProjection(db, dataset, engineResult.generated_forms);
  db.close();

  console.log(
    chalk.green(
      `✓ SQLite rebuilt with ${dataset.lexemes.length} lexemes, ` +
        `${dataset.morphemes.length} morphemes, ` +
        `${dataset.inflection_rules.length + dataset.morphotactic_rules.length + dataset.syntax_rules.length} rules.`
    )
  );
  return true;
}
