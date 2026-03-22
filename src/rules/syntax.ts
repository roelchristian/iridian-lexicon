/**
 * Syntax rule validator.
 *
 * Validates example token sequences against syntax rule templates.
 * Operates entirely on structured ExampleToken objects, not raw strings.
 */

import type { ExampleToken, SyntaxRule } from '../types/index.js';

export interface SyntaxCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a token sequence against a syntax rule.
 *
 * If the rule uses strict_order, each constraint must match the token at
 * exactly the specified position.  If not strict, each constraint must be
 * satisfiable by some token in the sequence (regardless of position).
 */
export function checkSyntaxRule(
  rule: SyntaxRule,
  tokens: ExampleToken[]
): SyntaxCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rule.strict_order) {
    for (const constraint of rule.constraints) {
      const { position } = constraint;
      const token = tokens[position];

      if (token === undefined) {
        if (!constraint.optional) {
          errors.push(
            `Syntax rule "${rule.key}": expected token at position ${position} ` +
              `(${constraint.label ?? 'unlabeled'}) but sequence is too short`
          );
        }
        continue;
      }

      const err = matchConstraint(constraint, token, position, rule.key);
      if (err) errors.push(err);
    }
  } else {
    // Non-strict: each non-optional constraint must be satisfied by some token
    for (const constraint of rule.constraints) {
      const satisfied = tokens.some(
        (tok) => matchConstraint(constraint, tok, -1, rule.key) === null
      );
      if (!satisfied && !constraint.optional) {
        errors.push(
          `Syntax rule "${rule.key}": constraint for ` +
            `"${constraint.label ?? `position ${constraint.position}`}" ` +
            `is not satisfied by any token in the sequence`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Returns null if the token satisfies the constraint, or an error string.
 */
function matchConstraint(
  constraint: SyntaxRule['constraints'][0],
  token: ExampleToken,
  position: number,
  ruleKey: string
): string | null {
  const posLabel =
    constraint.label ?? (position >= 0 ? `position ${position}` : 'any position');

  if (
    constraint.required_type !== undefined &&
    token.type !== constraint.required_type
  ) {
    return (
      `Syntax rule "${ruleKey}" at ${posLabel}: ` +
      `expected token type "${constraint.required_type}" but got "${token.type}"`
    );
  }

  if (
    constraint.required_key !== undefined &&
    token.key !== constraint.required_key
  ) {
    return (
      `Syntax rule "${ruleKey}" at ${posLabel}: ` +
      `expected key "${constraint.required_key}" but got "${token.key ?? '(none)'}"`
    );
  }

  if (
    constraint.required_slot !== undefined &&
    token.slot !== constraint.required_slot
  ) {
    return (
      `Syntax rule "${ruleKey}" at ${posLabel}: ` +
      `expected slot "${constraint.required_slot}" but got "${token.slot ?? '(none)'}"`
    );
  }

  return null;
}

/**
 * Validate all examples in the dataset against relevant syntax rules.
 * Returns a map of example_id → check result.
 */
export function validateExamplesAgainstRules(
  examples: Array<{ id: string; source_lang: ExampleToken[]; syntax_rule_key?: string }>,
  rules: SyntaxRule[]
): Map<string, SyntaxCheckResult> {
  const ruleMap = new Map(rules.map((r) => [r.key, r]));
  const results = new Map<string, SyntaxCheckResult>();

  for (const ex of examples) {
    if (!ex.syntax_rule_key) continue;
    const rule = ruleMap.get(ex.syntax_rule_key);
    if (!rule) {
      results.set(ex.id, {
        valid: false,
        errors: [`Unknown syntax rule key "${ex.syntax_rule_key}"`],
        warnings: [],
      });
      continue;
    }
    results.set(ex.id, checkSyntaxRule(rule, ex.source_lang));
  }

  return results;
}
