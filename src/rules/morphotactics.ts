/**
 * Morphotactic rule checker.
 *
 * Validates that a proposed set of morpheme slots in a word form is
 * consistent with the morphotactic rules for its word class.
 *
 * The checker operates on slot names (strings) rather than actual morpheme
 * objects, so it can be used during authoring before full lexeme resolution.
 */

import type { MorphotacticRule } from '../types/index.js';

export interface MorphotacticCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Check whether a set of filled slots is compatible with a morphotactic rule.
 *
 * @param rule       The morphotactic rule for this word class.
 * @param filledSlots  The slot names that are filled in the proposed form.
 * @param morphemeKeys Optional: the specific morpheme keys filling each slot
 *                     (for allowed_morpheme_keys checking).
 */
export function checkMorphotactics(
  rule: MorphotacticRule,
  filledSlots: string[],
  morphemeKeys?: Record<string, string>
): MorphotacticCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const filledSet = new Set(filledSlots);

  for (const slotDef of rule.slots) {
    const isFilled = filledSet.has(slotDef.name);

    // Required slot check
    if (slotDef.required && !isFilled) {
      errors.push(
        `Required slot "${slotDef.name}" is not filled in word class "${rule.word_class}"`
      );
      continue;
    }

    if (!isFilled) continue;

    // Allowed morpheme keys check
    if (
      slotDef.allowed_morpheme_keys !== undefined &&
      morphemeKeys !== undefined
    ) {
      const usedKey = morphemeKeys[slotDef.name];
      if (
        usedKey !== undefined &&
        !slotDef.allowed_morpheme_keys.includes(usedKey)
      ) {
        errors.push(
          `Morpheme "${usedKey}" is not allowed in slot "${slotDef.name}". ` +
            `Allowed: ${slotDef.allowed_morpheme_keys.join(', ')}`
        );
      }
    }

    // Co-occurrence requirements
    if (slotDef.requires_co_occurrence) {
      for (const required of slotDef.requires_co_occurrence) {
        if (!filledSet.has(required)) {
          errors.push(
            `Slot "${slotDef.name}" requires co-occurrence with "${required}", ` +
              `but "${required}" is not filled`
          );
        }
      }
    }

    // Exclusion constraints
    if (slotDef.excludes) {
      for (const excluded of slotDef.excludes) {
        if (filledSet.has(excluded)) {
          errors.push(
            `Slot "${slotDef.name}" cannot co-occur with "${excluded}"`
          );
        }
      }
    }
  }

  // Check for slots not defined in the rule
  const definedSlots = new Set(rule.slots.map((s) => s.name));
  for (const slot of filledSlots) {
    if (!definedSlots.has(slot)) {
      warnings.push(
        `Slot "${slot}" is not defined in morphotactic rule "${rule.key}" for word class "${rule.word_class}"`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
