/**
 * Rule engine entry point.
 *
 * Orchestrates inflection generation, morphotactic checking, and syntax
 * validation across a full NormalizedDataset.
 */

import type { GeneratedForm } from '../types/index.js';
import type { NormalizedDataset } from '../pipeline/normalizer.js';
import type { ValidatedInflectionRule } from '../schema/validators.js';
import { buildRuleIndex, generateAllForms } from './inflection.js';

export interface EngineResult {
  generated_forms: GeneratedForm[];
  warnings: string[];
}

/**
 * Run the rule engine over a full dataset.
 * Returns all generated forms (with overrides already applied).
 */
export function runRuleEngine(dataset: NormalizedDataset): EngineResult {
  const warnings: string[] = [];

  // Build inflection rule index
  const inflectionRules = dataset.inflection_rules.map(
    (nr) => nr.rule as ValidatedInflectionRule
  );
  const ruleIndex = buildRuleIndex(inflectionRules);

  // Generate all paradigm forms
  const generated_forms = generateAllForms(dataset.lexemes, ruleIndex);

  // Warn about lexemes that have template_id but the rule isn't in the index
  for (const lex of dataset.lexemes) {
    if (lex.template_id && !ruleIndex.has(lex.template_id)) {
      warnings.push(
        `Lexeme "${lex.key}" references unknown template "${lex.template_id}"`
      );
    }
  }

  return { generated_forms, warnings };
}
