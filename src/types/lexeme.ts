/**
 * Canonical type for a lexeme source YAML entry.
 *
 * A lexeme is a full vocabulary item (noun, verb, modifier, function word).
 * Its inflected forms are derived by the rule engine from template_id +
 * stem_variants, with manual_overrides applied on top.
 */

import type {
  EntryStatus,
  MajorCategory,
  SourceSchemaVersion,
  StemVariant,
  UsageExample,
} from './common.js';

export type LexemeMajorCategory =
  | 'noun'
  | 'verb'
  | 'modifier'
  | 'function-word';

export interface LexemeEntry {
  /** Semver-style schema version for this YAML file format. */
  schema_version: SourceSchemaVersion;

  /** Stable UUID-like machine identifier. Never changes after creation. */
  id: string;

  /**
   * Human-readable, URL-safe, stable key used in YAML cross-references,
   * the app UI, and LaTeX macros.  e.g. "ara", "keth-run", "mir-NEG".
   */
  key: string;

  /** Unmarked citation form (plain text, no diacritics encoding). */
  lemma: string;

  /** Display lemma with any diacritics / orthographic conventions. */
  display_lemma: string;

  entry_kind: 'lexeme';

  major_category: LexemeMajorCategory;

  /**
   * Finer grammatical subtype, e.g. "common-noun", "agentive-verb",
   * "adverb", "determiner", "postposition".
   */
  subtype: string;

  /** English gloss(es) in order of primary to secondary meaning. */
  glosses: string[];

  /** Free-text notes on etymology, usage, semantic nuances. */
  notes: string;

  /** Searchable tags, e.g. ["body-part", "kinship", "archaic"]. */
  tags: string[];

  status: EntryStatus;

  /**
   * Key of the inflection rule / paradigm template to apply.
   * Either template_id or inflection_profile must be present.
   */
  template_id?: string;

  /**
   * Inline abbreviated inflection profile when a full template is
   * not appropriate.  This is a free-form descriptor understood by
   * the rule engine (e.g. "irregular" or a compact feature specification).
   */
  inflection_profile?: string;

  /**
   * Named stem variants consumed by the inflection template.
   * Keys match what the template expects, e.g. "strong", "weak".
   */
  stem_variants: StemVariant[];

  /**
   * Slot → surface form overrides that replace the generated form.
   * Keys are slot labels (e.g. "NOM.SG"), values are surface strings.
   */
  manual_overrides: Record<string, string>;

  /** Structured usage examples. */
  usage_examples: UsageExample[];

  /** Source references where this lexeme is attested. */
  attested_in: string[];
}
