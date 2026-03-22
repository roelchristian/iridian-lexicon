/**
 * Shared primitive types used across lexemes, morphemes, and rules.
 */

export type EntryStatus = 'active' | 'draft' | 'deprecated';
export type EntryKind = 'lexeme' | 'morpheme' | 'rule';

export type MajorCategory =
  | 'noun'
  | 'verb'
  | 'modifier'
  | 'function-word'
  | 'postposition'
  | 'prefix'
  | 'suffix'
  | 'infix'
  | 'circumfix'
  | 'particle'
  | 'root';

/** The schema version embedded in every YAML source file. */
export type SourceSchemaVersion = string; // e.g. "1.0"

/** A feature–value pair used in paradigm feature matrices. */
export interface FeatureValue {
  feature: string;
  value: string;
}

/**
 * A single allomorph rule: when the phonological/morphological context
 * matches, use `form` instead of the default.
 */
export interface AllomorphRule {
  context: string;   // textual description or regex-like pattern
  form: string;
  condition?: string; // optional formal condition label
}

/** Stem variant: alternate stem form used in certain morphological contexts. */
export interface StemVariant {
  label: string;   // e.g. "strong", "weak", "vowel-initial"
  form: string;
}

/**
 * A usage example as a sequence of structured tokens.
 * Tokens reference lexeme forms, morphemes, or carry literal text.
 * This model is resilient to grammar changes because it doesn't rely
 * on parsing freeform strings.
 */
export interface ExampleToken {
  /** The token's role in the example. */
  type: 'form' | 'morpheme' | 'literal' | 'gloss';
  /**
   * Human-readable key of the referenced lexeme or morpheme.
   * Required for type 'form' and 'morpheme'.
   */
  key?: string;
  /**
   * The inflectional slot/form to use (e.g. "NOM.SG", "PST.3SG").
   * Required when type is 'form'; optional otherwise.
   */
  slot?: string;
  /**
   * Literal text for type 'literal' (untokenized material such as
   * a conjunction, punctuation, or a placeholder).
   */
  literal?: string;
  /**
   * Interlinear gloss string for type 'gloss'.
   * Used for building glossed examples.
   */
  gloss?: string;
}

/** A fully authored usage example attached to a lexeme or standalone. */
export interface UsageExample {
  id: string;
  source_lang: ExampleToken[];
  gloss_line: ExampleToken[];
  translation: string;
  notes?: string;
  tags?: string[];
}

/** A generated inflected form produced by the rule engine. */
export interface GeneratedForm {
  /** The lexeme key this form belongs to. */
  lexeme_key: string;
  /** The inflectional slot label, e.g. "NOM.SG". */
  slot: string;
  /** The surface form string. */
  form: string;
  /** Whether this is a rule-generated form (false = manual override). */
  generated: boolean;
  /** The rule key used to generate this form, if generated. */
  rule_key?: string;
  /** Whether a manual override has replaced the generated form. */
  overridden: boolean;
}
