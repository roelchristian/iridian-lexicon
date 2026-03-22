/**
 * Inflection rule engine.
 *
 * Given a normalized lexeme and the set of available inflection rules,
 * generates all paradigm forms.  Manual overrides are applied on top of
 * generated forms.
 *
 * The algorithm:
 *   1. Look up the lexeme's template_id in the rule set.
 *   2. If the rule inherits from other rules, resolve them depth-first.
 *   3. For each paradigm cell, pick the appropriate stem variant.
 *   4. Concatenate stem + suffix.
 *   5. Apply manual_overrides from the lexeme.
 *   6. Return a GeneratedForm[] array.
 */

import type {
  GeneratedForm,
} from '../types/index.js';
import type { NormalizedLexeme } from '../pipeline/normalizer.js';
import type { ValidatedInflectionRule } from '../schema/validators.js';

export type RuleIndex = Map<string, ValidatedInflectionRule>;

/**
 * Build an index of inflection rules by key.
 */
export function buildRuleIndex(
  rules: ValidatedInflectionRule[]
): RuleIndex {
  return new Map(rules.map((r) => [r.key, r]));
}

/**
 * Resolve a rule, merging inherited rules depth-first.
 * Local cells override inherited cells for the same slot.
 */
function resolveRule(
  key: string,
  index: RuleIndex,
  visited: Set<string> = new Set()
): ValidatedInflectionRule {
  if (visited.has(key)) {
    throw new Error(
      `Circular rule inheritance detected: ${[...visited, key].join(' → ')}`
    );
  }
  const rule = index.get(key);
  if (!rule) throw new Error(`Unknown inflection rule "${key}"`);

  if (!rule.inherits || rule.inherits.length === 0) return rule;

  visited.add(key);
  // Collect inherited cells
  const inheritedCells = new Map(
    rule.inherits.flatMap((parentKey) =>
      resolveRule(parentKey, index, new Set(visited)).cells.map(
        (c) => [c.slot, c] as const
      )
    )
  );

  // Local cells override inherited
  for (const cell of rule.cells) {
    inheritedCells.set(cell.slot, cell);
  }

  return {
    ...rule,
    cells: [...inheritedCells.values()],
  };
}

/**
 * Generate all inflected forms for a lexeme.
 *
 * Returns an array of GeneratedForm objects — one per paradigm cell,
 * plus one per manual override that doesn't correspond to a generated slot.
 */
export function generateForms(
  lexeme: NormalizedLexeme,
  ruleIndex: RuleIndex
): GeneratedForm[] {
  const forms: GeneratedForm[] = [];

  if (!lexeme.template_id) {
    // No template: only manual overrides become forms
    for (const [slot, form] of Object.entries(lexeme.manual_overrides)) {
      forms.push({
        lexeme_key: lexeme.key,
        slot,
        form,
        generated: false,
        overridden: false,
      });
    }
    return forms;
  }

  let rule: ValidatedInflectionRule;
  try {
    rule = resolveRule(lexeme.template_id, ruleIndex);
  } catch (err) {
    // Rule resolution failure: log and skip generation
    console.warn(
      `[rule-engine] Cannot generate forms for "${lexeme.key}": ${String(err)}`
    );
    return [];
  }

  // Build a stem map for quick lookup
  const stemMap = new Map(lexeme.stem_variants.map((sv) => [sv.label, sv.form]));
  const baseStem = stemMap.get('base') ?? lexeme.lemma;

  for (const cell of rule.cells) {
    // Pick the stem variant for this cell
    const stemVariantLabel = cell.stem_variant ?? 'base';
    const stem = stemMap.get(stemVariantLabel) ?? baseStem;

    // Concatenate stem + suffix.
    // Strip leading/trailing hyphens from suffix — they are morphological
    // notation in the YAML (e.g. "-a") but are not part of the phonological form.
    const suffix = cell.suffix.replace(/^-+|-+$/g, '');
    const generatedForm = stem + suffix;

    // Check for a manual override on this slot
    const override = lexeme.manual_overrides[cell.slot];
    const hasOverride = override !== undefined;

    forms.push({
      lexeme_key: lexeme.key,
      slot: cell.slot,
      form: hasOverride ? override : generatedForm,
      generated: !hasOverride,
      rule_key: rule.key,
      overridden: hasOverride,
    });
  }

  // Add any manual overrides for slots not covered by the rule
  const ruleSlots = new Set(rule.cells.map((c) => c.slot));
  for (const [slot, form] of Object.entries(lexeme.manual_overrides)) {
    if (!ruleSlots.has(slot)) {
      forms.push({
        lexeme_key: lexeme.key,
        slot,
        form,
        generated: false,
        overridden: false,
      });
    }
  }

  return forms;
}

/**
 * Generate forms for all lexemes in a dataset.
 */
export function generateAllForms(
  lexemes: NormalizedLexeme[],
  ruleIndex: RuleIndex
): GeneratedForm[] {
  return lexemes.flatMap((lex) => generateForms(lex, ruleIndex));
}
