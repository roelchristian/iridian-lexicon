/**
 * Export interface types — the shapes of artifacts produced for external
 * consumers (the grammar repo, downstream tooling).
 */

import type { GeneratedForm, UsageExample } from './common.js';
import type { LexemeEntry } from './lexeme.js';
import type { MorphemeEntry } from './morpheme.js';
import type { InflectionRule, MorphotacticRule, SyntaxRule } from './rules.js';

/** Metadata header included in every JSON export file. */
export interface ExportMetadata {
  export_schema_version: string;
  source_schema_version: string;
  generated_at: string; // ISO-8601
  entry_count: number;
  generator: 'iridian-lexicon';
}

/** Full JSON export of all lexical data — consumed by the grammar repo. */
export interface LexiconExport {
  metadata: ExportMetadata;
  lexemes: NormalizedLexemeExport[];
  morphemes: NormalizedMorphemeExport[];
  inflection_rules: InflectionRule[];
  morphotactic_rules: MorphotacticRule[];
  syntax_rules: SyntaxRule[];
  generated_forms: GeneratedForm[];
}

/**
 * A normalized, export-ready lexeme — all ids resolved, all generated
 * forms inlined, overrides already applied.
 */
export interface NormalizedLexemeExport {
  id: string;
  key: string;
  lemma: string;
  display_lemma: string;
  major_category: string;
  subtype: string;
  glosses: string[];
  notes: string;
  tags: string[];
  status: string;
  template_id?: string;
  inflection_profile?: string;
  forms: GeneratedForm[];
  usage_examples: UsageExample[];
  attested_in: string[];
}

export interface NormalizedMorphemeExport {
  id: string;
  key: string;
  lemma: string;
  display_form: string;
  gloss_abbr: string;
  major_category: string;
  subtype: string;
  slot: string;
  category: string;
  glosses: string[];
  notes: string;
  tags: string[];
  status: string;
}

/**
 * LaTeX macro table export — written as a .tex file included by the
 * grammar repo.  Provides \Lex{key}, \Form{key}{slot}, \Morph{key}.
 */
export interface LatexExport {
  /** The full .tex file content as a string. */
  content: string;
  /** Keys that were exported. */
  lexeme_keys: string[];
  morpheme_keys: string[];
  /** Slot labels available per key (for \Form validation). */
  form_slots: Record<string, string[]>;
}

/** Shape of a validation error returned from the pipeline. */
export interface ValidationError {
  file: string;
  field?: string;
  message: string;
  code: string;
}

/** Result of a full validation run. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  file_count: number;
  valid_count: number;
  invalid_count: number;
}

/** Result of a dry-run migration — shows proposed changes without writing. */
export interface MigrationPreview {
  file: string;
  from_version: string;
  to_version: string;
  changes: MigrationChange[];
}

export interface MigrationChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
}
