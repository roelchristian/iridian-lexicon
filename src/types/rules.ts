/**
 * Rule types: inflection, morphotactics, and syntax.
 *
 * Rules are authored as YAML in rules/inflection/, rules/morphotactics/,
 * and rules/syntax/.  The rule engine reads these files to generate forms,
 * validate morpheme ordering, and validate example token sequences.
 */

import type { ExampleToken, FeatureValue, SourceSchemaVersion } from './common.js';

// ---------------------------------------------------------------------------
// Inflection Rules
// ---------------------------------------------------------------------------

/**
 * A single cell in a paradigm: a slot label and the morpheme sequence
 * or suffix string that produces the surface form for that cell.
 */
export interface ParadigmCell {
  /** Slot label, e.g. "NOM.SG", "PST.3SG", "IPFV.ACT.2PL". */
  slot: string;

  /**
   * Feature bundle for this cell as key–value pairs,
   * e.g. [{ feature: "case", value: "NOM" }, { feature: "number", value: "SG" }].
   */
  features: FeatureValue[];

  /**
   * A prefix string prepended before the stem variant.  Morphological
   * notation hyphens are stripped at generation time (e.g. "zá-" → "zá").
   * Omit or leave empty for no prefix.
   */
  prefix?: string;

  /**
   * The suffix/affix string appended to the chosen stem variant
   * to produce the surface form.  May be empty string for zero morphology.
   */
  suffix: string;

  /** Which stem variant label to use for this cell. Defaults to "base". */
  stem_variant?: string;

  /**
   * Key of the morpheme to attach.  Mutually exclusive with suffix when
   * the morpheme entry provides the phonological form.
   */
  morpheme_key?: string;

  /**
   * Notes on this specific paradigm cell, e.g. "irregular in literary
   * register".
   */
  notes?: string;
}

/**
 * An inflection rule defines a complete paradigm template.
 * Lexemes reference this rule by key via their template_id field.
 */
export interface InflectionRule {
  schema_version: SourceSchemaVersion;

  /** Stable machine identifier. */
  id: string;

  /** Human-readable stable key, e.g. "noun-class-a", "strong-verb-ii". */
  key: string;

  /** Descriptive name shown in the app UI. */
  name: string;

  description: string;

  /**
   * Which major category this rule applies to, e.g. "noun", "verb".
   */
  category: string;

  /**
   * The feature dimensions multiplied out to produce the paradigm cells,
   * e.g. [["NOM","ACC","DAT","GEN"], ["SG","PL"]].
   * These must correspond to the slot labels in cells.
   */
  feature_axes: string[][];

  /** All paradigm cells.  Must cover the full feature_axes cross-product. */
  cells: ParadigmCell[];

  /**
   * Keys of other inflection rules that this rule inherits from.
   * Inheritance is resolved depth-first; local cells override inherited ones.
   */
  inherits?: string[];

  tags: string[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Morphotactic Rules
// ---------------------------------------------------------------------------

/**
 * A slot definition within a word template.
 */
export interface MorphotacticSlot {
  /** Slot name / position label, e.g. "stem", "aspect", "tense", "case". */
  name: string;

  /** Linear position index (lower = closer to the word root). */
  position: number;

  /**
   * Whether this slot must be filled in every valid word form.
   */
  required: boolean;

  /**
   * Keys of morphemes allowed in this slot.  If omitted, any morpheme
   * with matching slot metadata is permitted.
   */
  allowed_morpheme_keys?: string[];

  /**
   * Slots that must co-occur with this slot when filled.
   */
  requires_co_occurrence?: string[];

  /**
   * Slots that cannot co-occur with this slot.
   */
  excludes?: string[];
}

/**
 * A morphotactic rule describes the template for word-building:
 * which slots exist, their linear order, and combinatorial constraints.
 */
export interface MorphotacticRule {
  schema_version: SourceSchemaVersion;
  id: string;
  key: string;
  name: string;
  description: string;

  /** Which word class this template applies to, e.g. "noun", "verb". */
  word_class: string;

  /** Ordered list of morphological slots. */
  slots: MorphotacticSlot[];

  /**
   * Conditioned alternation rules (phonological or morphological).
   * Each rule specifies a context condition and the resulting form change.
   */
  alternations: AlternationRule[];

  tags: string[];
  notes: string;
}

export interface AlternationRule {
  /** Short label for this alternation. */
  name: string;
  /** What triggers this alternation (formal or prose). */
  context: string;
  /** The transformation applied (formal or prose). */
  result: string;
}

// ---------------------------------------------------------------------------
// Syntax Rules
// ---------------------------------------------------------------------------

/**
 * A reusable example structure template (clause template, phrase template).
 * Syntax rules operate on structured ExampleToken sequences rather than
 * raw strings.
 */
export interface SyntaxSlotConstraint {
  /** Position within the token sequence (0-indexed). */
  position: number;
  /** Required token type at this position. */
  required_type?: 'form' | 'morpheme' | 'literal';
  /** Required key of the lexeme or morpheme at this position. */
  required_key?: string;
  /** Required slot/form label at this position. */
  required_slot?: string;
  /** Human-readable label for this slot, e.g. "subject", "verb", "object". */
  label?: string;
  /** Whether this slot position is optional. */
  optional?: boolean;
}

/**
 * A syntax rule defines a reusable clause/phrase template that example
 * token sequences can be validated against.
 */
export interface SyntaxRule {
  schema_version: SourceSchemaVersion;
  id: string;
  key: string;
  name: string;
  description: string;

  /**
   * Canonical word-order label for this template, e.g. "SOV", "SVO",
   * "topic-comment", "postpositional-phrase".
   */
  word_order: string;

  /** Slot constraints that the token sequence must satisfy. */
  constraints: SyntaxSlotConstraint[];

  /**
   * Whether slot order is strict (exactly as listed) or just a set
   * of constraints that may be satisfied in any order.
   */
  strict_order: boolean;

  tags: string[];
  notes: string;
}
