/**
 * SQLite projection builder.
 *
 * Reads from a NormalizedDataset and writes the full SQLite projection.
 * On db_schema_version changes this module performs a full drop + recreate.
 *
 * The builder never touches YAML files.
 */

import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

import {
  DB_SCHEMA_VERSION,
  DDL_STATEMENTS,
  DROP_ALL_STATEMENTS,
} from './schema.js';
import type { NormalizedDataset } from '../pipeline/normalizer.js';
import type { GeneratedForm } from '../types/index.js';

const DB_FILENAME = 'iridian-lexicon.db';

export function getDbPath(repoRoot: string): string {
  return path.join(repoRoot, DB_FILENAME);
}

export function openDb(repoRoot: string): Database.Database {
  const dbPath = getDbPath(repoRoot);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Check if the DB needs a full rebuild due to schema version mismatch.
 */
export function needsRebuild(db: Database.Database): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM db_meta WHERE key = 'db_schema_version'")
      .get() as { value: string } | undefined;
    if (!row) return true;
    return Number(row.value) !== DB_SCHEMA_VERSION;
  } catch {
    return true; // Tables don't exist yet
  }
}

/**
 * Rebuild the entire SQLite projection from a NormalizedDataset + generated forms.
 * This is always a full replace: drop all tables, recreate, insert everything.
 */
export function rebuildProjection(
  db: Database.Database,
  dataset: NormalizedDataset,
  generatedForms: GeneratedForm[]
): void {
  const rebuild = db.transaction(() => {
    // Drop and recreate all tables
    for (const stmt of DROP_ALL_STATEMENTS.split(';').map((s) => s.trim()).filter(Boolean)) {
      db.exec(stmt + ';');
    }
    db.exec(DDL_STATEMENTS);

    // Write db_schema_version
    db.prepare(
      "INSERT INTO db_meta (key, value) VALUES ('db_schema_version', ?)"
    ).run(String(DB_SCHEMA_VERSION));
    db.prepare(
      "INSERT INTO db_meta (key, value) VALUES ('built_at', ?)"
    ).run(new Date().toISOString());

    const insertEntry = db.prepare(`
      INSERT INTO entries (
        id, key, lemma, display_lemma, entry_kind, major_category, subtype,
        glosses_json, notes, tags_json, status,
        template_id, inflection_profile, stem_variants_json,
        manual_overrides_json, attested_in_json,
        display_form, gloss_abbr, slot, category,
        allomorph_rules_json, override_hook,
        source_file
      ) VALUES (
        @id, @key, @lemma, @display_lemma, @entry_kind, @major_category, @subtype,
        @glosses_json, @notes, @tags_json, @status,
        @template_id, @inflection_profile, @stem_variants_json,
        @manual_overrides_json, @attested_in_json,
        @display_form, @gloss_abbr, @slot, @category,
        @allomorph_rules_json, @override_hook,
        @source_file
      )
    `);

    // Insert lexemes
    for (const lex of dataset.lexemes) {
      insertEntry.run({
        id: lex.id,
        key: lex.key,
        lemma: lex.lemma,
        display_lemma: lex.display_lemma,
        entry_kind: 'lexeme',
        major_category: lex.major_category,
        subtype: lex.subtype,
        glosses_json: JSON.stringify(lex.glosses),
        notes: lex.notes,
        tags_json: JSON.stringify(lex.tags),
        status: lex.status,
        template_id: lex.template_id ?? null,
        inflection_profile: lex.inflection_profile ?? null,
        stem_variants_json: JSON.stringify(lex.stem_variants),
        manual_overrides_json: JSON.stringify(lex.manual_overrides),
        attested_in_json: JSON.stringify(lex.attested_in),
        display_form: null,
        gloss_abbr: null,
        slot: null,
        category: null,
        allomorph_rules_json: null,
        override_hook: null,
        source_file: lex.source_file,
      });
    }

    // Insert morphemes
    for (const morph of dataset.morphemes) {
      insertEntry.run({
        id: morph.id,
        key: morph.key,
        lemma: morph.lemma,
        display_lemma: morph.display_lemma,
        entry_kind: 'morpheme',
        major_category: morph.major_category,
        subtype: morph.subtype,
        glosses_json: JSON.stringify(morph.glosses),
        notes: morph.notes,
        tags_json: JSON.stringify(morph.tags),
        status: morph.status,
        template_id: null,
        inflection_profile: null,
        stem_variants_json: null,
        manual_overrides_json: null,
        attested_in_json: null,
        display_form: morph.display_form,
        gloss_abbr: morph.gloss_abbr,
        slot: morph.slot,
        category: morph.category,
        allomorph_rules_json: JSON.stringify(morph.allomorph_rules),
        override_hook: morph.override_hook ?? null,
        source_file: morph.source_file,
      });
    }

    // Insert rules
    const insertRule = db.prepare(`
      INSERT INTO rules (id, key, rule_kind, name, description, category, word_class, word_order, data_json, tags_json, notes, source_file)
      VALUES (@id, @key, @rule_kind, @name, @description, @category, @word_class, @word_order, @data_json, @tags_json, @notes, @source_file)
    `);

    for (const { rule, source_file } of dataset.inflection_rules) {
      insertRule.run({
        id: rule.id,
        key: rule.key,
        rule_kind: 'inflection',
        name: rule.name,
        description: rule.description,
        category: rule.category,
        word_class: null,
        word_order: null,
        data_json: JSON.stringify(rule),
        tags_json: JSON.stringify(rule.tags),
        notes: rule.notes,
        source_file,
      });
    }

    for (const { rule, source_file } of dataset.morphotactic_rules) {
      insertRule.run({
        id: rule.id,
        key: rule.key,
        rule_kind: 'morphotactic',
        name: rule.name,
        description: rule.description,
        category: null,
        word_class: rule.word_class,
        word_order: null,
        data_json: JSON.stringify(rule),
        tags_json: JSON.stringify(rule.tags),
        notes: rule.notes,
        source_file,
      });
    }

    for (const { rule, source_file } of dataset.syntax_rules) {
      insertRule.run({
        id: rule.id,
        key: rule.key,
        rule_kind: 'syntax',
        name: rule.name,
        description: rule.description,
        category: null,
        word_class: null,
        word_order: rule.word_order,
        data_json: JSON.stringify(rule),
        tags_json: JSON.stringify(rule.tags),
        notes: rule.notes,
        source_file,
      });
    }

    // Insert generated forms
    const insertForm = db.prepare(`
      INSERT OR REPLACE INTO generated_forms
        (lexeme_key, slot, form, generated, rule_key, overridden, generation_origin)
      VALUES
        (@lexeme_key, @slot, @form, @generated, @rule_key, @overridden, @generation_origin)
    `);

    for (const gf of generatedForms) {
      insertForm.run({
        lexeme_key: gf.lexeme_key,
        slot: gf.slot,
        form: gf.form,
        generated: gf.generated ? 1 : 0,
        rule_key: gf.rule_key ?? null,
        overridden: gf.overridden ? 1 : 0,
        generation_origin: gf.generated ? 'rule-engine' : 'manual-override',
      });
    }

    // Insert examples and token links
    const insertExample = db.prepare(`
      INSERT INTO examples (id, lexeme_key, source_lang_json, gloss_line_json, translation, notes, tags_json, source_file)
      VALUES (@id, @lexeme_key, @source_lang_json, @gloss_line_json, @translation, @notes, @tags_json, @source_file)
    `);
    const insertTokenLink = db.prepare(`
      INSERT INTO token_links (example_id, token_index, token_type, referenced_key, referenced_slot, resolved)
      VALUES (@example_id, @token_index, @token_type, @referenced_key, @referenced_slot, @resolved)
    `);

    // Build a key set for token resolution
    const allKeys = new Set([
      ...dataset.lexemes.map((l) => l.key),
      ...dataset.morphemes.map((m) => m.key),
    ]);

    for (const lex of dataset.lexemes) {
      for (const ex of lex.usage_examples) {
        insertExample.run({
          id: ex.id,
          lexeme_key: lex.key,
          source_lang_json: JSON.stringify(ex.source_lang),
          gloss_line_json: JSON.stringify(ex.gloss_line),
          translation: ex.translation,
          notes: ex.notes ?? null,
          tags_json: JSON.stringify(ex.tags ?? []),
          source_file: lex.source_file,
        });

        // Resolve token links
        ex.source_lang.forEach((tok, idx) => {
          const refKey = tok.key ?? null;
          insertTokenLink.run({
            example_id: ex.id,
            token_index: idx,
            token_type: tok.type,
            referenced_key: refKey,
            referenced_slot: tok.slot ?? null,
            resolved: refKey !== null && allKeys.has(refKey) ? 1 : 0,
          });
        });
      }
    }

    // Rebuild FTS index
    db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
  });

  rebuild();
}
