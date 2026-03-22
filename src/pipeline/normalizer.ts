/**
 * Normalizer: converts validated entry data into the internal canonical
 * model (adding provenance, resolving defaults, etc.).
 *
 * The output of normalize() is what the DB builder and rule engine consume.
 */

import type {
  LexemeEntry,
  MorphemeEntry,
  GeneratedForm,
} from '../types/index.js';
import type {
  ValidatedLexemeEntry,
  ValidatedMorphemeEntry,
  ValidatedInflectionRule,
  ValidatedMorphotacticRule,
  ValidatedSyntaxRule,
} from '../schema/validators.js';
import type { ValidatedFile } from './validator.js';

export interface NormalizedLexeme extends LexemeEntry {
  /** Relative path to the source YAML file. */
  source_file: string;
}

export interface NormalizedMorpheme extends MorphemeEntry {
  source_file: string;
}

export interface NormalizedInflectionRule {
  source_file: string;
  rule: ValidatedInflectionRule;
}

export interface NormalizedMorphotacticRule {
  source_file: string;
  rule: ValidatedMorphotacticRule;
}

export interface NormalizedSyntaxRule {
  source_file: string;
  rule: ValidatedSyntaxRule;
}

export interface NormalizedDataset {
  lexemes: NormalizedLexeme[];
  morphemes: NormalizedMorpheme[];
  inflection_rules: NormalizedInflectionRule[];
  morphotactic_rules: NormalizedMorphotacticRule[];
  syntax_rules: NormalizedSyntaxRule[];
}

export function normalizeAll(validFiles: ValidatedFile[]): NormalizedDataset {
  const lexemes: NormalizedLexeme[] = [];
  const morphemes: NormalizedMorpheme[] = [];
  const inflection_rules: NormalizedInflectionRule[] = [];
  const morphotactic_rules: NormalizedMorphotacticRule[] = [];
  const syntax_rules: NormalizedSyntaxRule[] = [];

  for (const vf of validFiles) {
    const src = vf.source.relativePath;

    switch (vf.kind) {
      case 'lexeme': {
        const d = vf.data as ValidatedLexemeEntry;
        lexemes.push({
          ...d,
          source_file: src,
          // Ensure arrays are never undefined (Zod guarantees this but be explicit)
          stem_variants: d.stem_variants ?? [],
          manual_overrides: d.manual_overrides ?? {},
          usage_examples: d.usage_examples ?? [],
          attested_in: d.attested_in ?? [],
          tags: d.tags ?? [],
        });
        break;
      }
      case 'morpheme': {
        const d = vf.data as ValidatedMorphemeEntry;
        morphemes.push({
          ...d,
          source_file: src,
          allomorph_rules: d.allomorph_rules ?? [],
          tags: d.tags ?? [],
        });
        break;
      }
      case 'inflection-rule': {
        inflection_rules.push({ source_file: src, rule: vf.data as ValidatedInflectionRule });
        break;
      }
      case 'morphotactic-rule': {
        morphotactic_rules.push({ source_file: src, rule: vf.data as ValidatedMorphotacticRule });
        break;
      }
      case 'syntax-rule': {
        syntax_rules.push({ source_file: src, rule: vf.data as ValidatedSyntaxRule });
        break;
      }
    }
  }

  return { lexemes, morphemes, inflection_rules, morphotactic_rules, syntax_rules };
}
