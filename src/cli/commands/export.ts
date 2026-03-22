import chalk from 'chalk';
import { runPipeline } from '../../pipeline/index.js';
import { runRuleEngine } from '../../rules/engine.js';
import { syncGrammarArtifacts } from '../../export/sync.js';

export async function cmdExport(repoRoot: string): Promise<boolean> {
  console.log(chalk.cyan('▶ Running import pipeline for export…'));

  const result = await runPipeline(repoRoot);
  if (!result.ok || !result.dataset) {
    console.log(chalk.red('✗ Validation failed. Export aborted.'));
    for (const err of result.validation.errors) {
      console.log(chalk.red(`  ${err.file}: ${err.message}`));
    }
    return false;
  }

  const { dataset } = result;
  console.log(chalk.cyan('▶ Running rule engine…'));
  const { generated_forms, warnings } = runRuleEngine(dataset);
  for (const w of warnings) console.log(chalk.yellow(`  ⚠ ${w}`));

  console.log(chalk.cyan('▶ Writing grammar artifacts to TEMP/…'));
  const manifest = await syncGrammarArtifacts(repoRoot, dataset, generated_forms);

  console.log(chalk.green('✓ Export complete:'));
  for (const f of manifest.files_written) {
    console.log(chalk.green(`  → ${f}`));
  }
  console.log(
    chalk.gray(
      `  (${manifest.lexeme_count} lexemes, ${manifest.morpheme_count} morphemes, ${manifest.form_count} forms)`
    )
  );
  return true;
}
