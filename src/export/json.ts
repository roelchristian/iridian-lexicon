/**
 * JSON export — produces a normalized, self-contained export bundle
 * consumed by the grammar repo and any other downstream tooling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LexiconExport,
  NormalizedLexemeExport,
  NormalizedMorphemeExport,
  ExportMetadata,
  GeneratedForm,
} from '../types/index.js';
import type { NormalizedDataset } from '../pipeline/normalizer.js';
import type { ValidatedInflectionRule, ValidatedMorphotacticRule, ValidatedSyntaxRule } from '../schema/validators.js';
import { CURRENT_SOURCE_SCHEMA_VERSION } from '../schema/versions.js';

const EXPORT_SCHEMA_VERSION = '1.0';
const GENERATOR = 'iridian-lexicon' as const;

export function buildJsonExport(
  dataset: NormalizedDataset,
  generatedForms: GeneratedForm[]
): LexiconExport {
  // Group forms by lexeme key for fast inline lookup
  const formsByLexeme = new Map<string, GeneratedForm[]>();
  for (const gf of generatedForms) {
    const existing = formsByLexeme.get(gf.lexeme_key) ?? [];
    existing.push(gf);
    formsByLexeme.set(gf.lexeme_key, existing);
  }

  const lexemes: NormalizedLexemeExport[] = dataset.lexemes.map((lex) => ({
    id: lex.id,
    key: lex.key,
    lemma: lex.lemma,
    display_lemma: lex.display_lemma,
    major_category: lex.major_category,
    subtype: lex.subtype,
    glosses: lex.glosses,
    notes: lex.notes,
    tags: lex.tags,
    status: lex.status,
    template_id: lex.template_id,
    inflection_profile: lex.inflection_profile,
    forms: formsByLexeme.get(lex.key) ?? [],
    usage_examples: lex.usage_examples,
    attested_in: lex.attested_in,
  }));

  const morphemes: NormalizedMorphemeExport[] = dataset.morphemes.map(
    (m) => ({
      id: m.id,
      key: m.key,
      lemma: m.lemma,
      display_form: m.display_form,
      gloss_abbr: m.gloss_abbr,
      major_category: m.major_category,
      subtype: m.subtype,
      slot: m.slot,
      category: m.category,
      glosses: m.glosses,
      notes: m.notes,
      tags: m.tags,
      status: m.status,
    })
  );

  const metadata: ExportMetadata = {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    source_schema_version: CURRENT_SOURCE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    entry_count: lexemes.length + morphemes.length,
    generator: GENERATOR,
  };

  return {
    metadata,
    lexemes,
    morphemes,
    inflection_rules: dataset.inflection_rules.map((r) => r.rule as unknown as ValidatedInflectionRule),
    morphotactic_rules: dataset.morphotactic_rules.map((r) => r.rule as unknown as ValidatedMorphotacticRule),
    syntax_rules: dataset.syntax_rules.map((r) => r.rule as unknown as ValidatedSyntaxRule),
    generated_forms: generatedForms,
  };
}

/**
 * Write the JSON export to a file.
 * Output is stable for clean diffs: keys are sorted, indented with 2 spaces.
 */
export function writeJsonExport(
  exportData: LexiconExport,
  outputPath: string
): void {
  // Sort lexemes and morphemes by key for stable output
  const sorted: LexiconExport = {
    ...exportData,
    lexemes: [...exportData.lexemes].sort((a, b) => a.key.localeCompare(b.key)),
    morphemes: [...exportData.morphemes].sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
    inflection_rules: [...exportData.inflection_rules].sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}
