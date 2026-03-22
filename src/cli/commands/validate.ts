import chalk from 'chalk';
import { validateOnly } from '../../pipeline/index.js';
import type { ValidationResult } from '../../types/index.js';

export async function cmdValidate(repoRoot: string, opts: { strict?: boolean } = {}): Promise<boolean> {
  console.log(chalk.cyan('▶ Validating YAML source files…'));

  const result: ValidationResult = await validateOnly(repoRoot);

  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log(
      chalk.green(`✓ All ${result.file_count} file(s) valid.`)
    );
    return true;
  }

  if (result.errors.length > 0) {
    console.log(
      chalk.red(
        `✗ ${result.invalid_count} invalid file(s) out of ${result.file_count}.`
      )
    );
    for (const err of result.errors) {
      const field = err.field ? ` [${err.field}]` : '';
      console.log(
        chalk.red(`  ERROR`) +
          chalk.gray(` ${err.file}${field}`) +
          `\n    ${err.message}` +
          chalk.gray(` (${err.code})`)
      );
    }
  }

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      const field = warn.field ? ` [${warn.field}]` : '';
      console.log(
        chalk.yellow(`  WARN`) +
          chalk.gray(` ${warn.file}${field}`) +
          `\n    ${warn.message}`
      );
    }
  }

  return result.errors.length === 0;
}
