/**
 * Canonical type for a morpheme source YAML entry.
 *
 * A morpheme is a bound or free grammatical element: prefix, suffix,
 * infix, circumfix, or particle.  Morphemes have display forms, gloss
 * abbreviations, slot/category metadata, and optional allomorph rules.
 */

import type {
  AllomorphRule,
  EntryStatus,
  MajorCategory,
  SourceSchemaVersion,
} from './common.js';

export interface MorphemeEntry {
  schema_version: SourceSchemaVersion;

  /** Stable machine identifier. */
  id: string;

  /** Human-readable stable key, e.g. "NOM", "PST", "AGT-suf". */
  key: string;

  /**
   * The underlying phonological form (base form, no allomorphic
   * conditioning applied).
   */
  lemma: string;

  /** Orthographic display form with diacritics if applicable. */
  display_lemma: string;

  entry_kind: 'morpheme';

  /** Morpheme category, e.g. "suffix", "prefix", "particle". */
  major_category: MajorCategory;

  /**
   * Finer subtype, e.g. "case-suffix", "tense-suffix",
   * "agreement-prefix", "derivational-suffix".
   */
  subtype: string;

  /**
   * Semantic/functional glosses.  First entry is the standard
   * Leipzig abbreviation or short gloss.
   */
  glosses: string[];

  notes: string;
  tags: string[];
  status: EntryStatus;

  /**
   * The canonical display form as it appears in interlinear glosses,
   * e.g. "-ra", "aN-".
   */
  display_form: string;

  /**
   * The Leipzig-style gloss abbreviation used in interlinear glosses,
   * e.g. "NOM", "PST", "AGT", "CAUS".
   */
  gloss_abbr: string;

  /**
   * The morphological slot this morpheme occupies within the word
   * template, e.g. "case", "tense", "aspect", "voice".
   */
  slot: string;

  /**
   * The grammatical category / paradigm dimension this morpheme
   * belongs to, e.g. "case-system", "TAM", "agreement".
   */
  category: string;

  /** Ordered list of allomorph conditioning rules. */
  allomorph_rules: AllomorphRule[];

  /**
   * Override hook: a key referencing custom logic in the rule engine
   * that should be invoked instead of the standard allomorph selection.
   */
  override_hook?: string;
}
