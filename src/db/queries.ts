/**
 * Common query functions for the SQLite projection.
 *
 * All reads go through these functions so callers don't need to know
 * the DB schema layout.  All JSON columns are parsed before returning.
 */

import Database from 'better-sqlite3';
import type { GeneratedForm } from '../types/index.js';

// ---------------------------------------------------------------------------
// Row types (raw DB shapes)
// ---------------------------------------------------------------------------

interface EntryRow {
  id: string;
  key: string;
  lemma: string;
  display_lemma: string;
  entry_kind: 'lexeme' | 'morpheme';
  major_category: string;
  subtype: string;
  glosses_json: string;
  notes: string;
  tags_json: string;
  status: string;
  template_id: string | null;
  inflection_profile: string | null;
  stem_variants_json: string | null;
  manual_overrides_json: string | null;
  attested_in_json: string | null;
  display_form: string | null;
  gloss_abbr: string | null;
  slot: string | null;
  category: string | null;
  allomorph_rules_json: string | null;
  override_hook: string | null;
  source_file: string;
}

interface FormRow {
  lexeme_key: string;
  slot: string;
  form: string;
  generated: number;
  rule_key: string | null;
  overridden: number;
  generation_origin: string;
}

interface RuleRow {
  id: string;
  key: string;
  rule_kind: string;
  name: string;
  description: string;
  data_json: string;
  source_file: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEntry(row: EntryRow) {
  return {
    ...row,
    glosses: JSON.parse(row.glosses_json) as string[],
    tags: JSON.parse(row.tags_json) as string[],
    stem_variants: row.stem_variants_json
      ? JSON.parse(row.stem_variants_json)
      : undefined,
    manual_overrides: row.manual_overrides_json
      ? JSON.parse(row.manual_overrides_json)
      : undefined,
    attested_in: row.attested_in_json
      ? JSON.parse(row.attested_in_json)
      : undefined,
    allomorph_rules: row.allomorph_rules_json
      ? JSON.parse(row.allomorph_rules_json)
      : undefined,
  };
}

function parseForm(row: FormRow): GeneratedForm {
  return {
    lexeme_key: row.lexeme_key,
    slot: row.slot,
    form: row.form,
    generated: row.generated === 1,
    rule_key: row.rule_key ?? undefined,
    overridden: row.overridden === 1,
  };
}

// ---------------------------------------------------------------------------
// Entry queries
// ---------------------------------------------------------------------------

export function getAllEntries(db: Database.Database) {
  const rows = db.prepare('SELECT * FROM entries ORDER BY key').all() as EntryRow[];
  return rows.map(parseEntry);
}

export function getLexemes(db: Database.Database) {
  const rows = db
    .prepare("SELECT * FROM entries WHERE entry_kind = 'lexeme' ORDER BY key")
    .all() as EntryRow[];
  return rows.map(parseEntry);
}

export function getMorphemes(db: Database.Database) {
  const rows = db
    .prepare("SELECT * FROM entries WHERE entry_kind = 'morpheme' ORDER BY key")
    .all() as EntryRow[];
  return rows.map(parseEntry);
}

export function getEntryByKey(db: Database.Database, key: string) {
  const row = db
    .prepare('SELECT * FROM entries WHERE key = ?')
    .get(key) as EntryRow | undefined;
  return row ? parseEntry(row) : null;
}

export function getEntryById(db: Database.Database, id: string) {
  const row = db
    .prepare('SELECT * FROM entries WHERE id = ?')
    .get(id) as EntryRow | undefined;
  return row ? parseEntry(row) : null;
}

/** Full-text search across entries. */
export function searchEntries(db: Database.Database, query: string) {
  const rows = db
    .prepare(`
      SELECT e.* FROM entries e
      JOIN entries_fts fts ON e.rowid = fts.rowid
      WHERE entries_fts MATCH ?
      ORDER BY rank
    `)
    .all(query) as EntryRow[];
  return rows.map(parseEntry);
}

export function getEntriesByCategory(
  db: Database.Database,
  category: string
) {
  const rows = db
    .prepare('SELECT * FROM entries WHERE major_category = ? ORDER BY key')
    .all(category) as EntryRow[];
  return rows.map(parseEntry);
}

export function getEntriesByStatus(
  db: Database.Database,
  status: 'active' | 'draft' | 'deprecated'
) {
  const rows = db
    .prepare('SELECT * FROM entries WHERE status = ? ORDER BY key')
    .all(status) as EntryRow[];
  return rows.map(parseEntry);
}

// ---------------------------------------------------------------------------
// Generated forms
// ---------------------------------------------------------------------------

export function getFormsForLexeme(
  db: Database.Database,
  lexemeKey: string
): GeneratedForm[] {
  const rows = db
    .prepare('SELECT * FROM generated_forms WHERE lexeme_key = ? ORDER BY slot')
    .all(lexemeKey) as FormRow[];
  return rows.map(parseForm);
}

export function getAllForms(db: Database.Database): GeneratedForm[] {
  const rows = db
    .prepare('SELECT * FROM generated_forms ORDER BY lexeme_key, slot')
    .all() as FormRow[];
  return rows.map(parseForm);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function getAllRules(db: Database.Database) {
  const rows = db
    .prepare('SELECT * FROM rules ORDER BY rule_kind, key')
    .all() as RuleRow[];
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

export function getRuleByKey(db: Database.Database, key: string) {
  const row = db
    .prepare('SELECT * FROM rules WHERE key = ?')
    .get(key) as RuleRow | undefined;
  return row ? { ...row, data: JSON.parse(row.data_json) } : null;
}

export function getRulesByKind(
  db: Database.Database,
  kind: 'inflection' | 'morphotactic' | 'syntax'
) {
  const rows = db
    .prepare('SELECT * FROM rules WHERE rule_kind = ? ORDER BY key')
    .all(kind) as RuleRow[];
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export function getExamplesForLexeme(db: Database.Database, lexemeKey: string) {
  const rows = db
    .prepare('SELECT * FROM examples WHERE lexeme_key = ?')
    .all(lexemeKey) as Array<{
    id: string;
    lexeme_key: string;
    source_lang_json: string;
    gloss_line_json: string;
    translation: string;
    notes: string | null;
    tags_json: string;
    source_file: string;
  }>;
  return rows.map((r) => ({
    ...r,
    source_lang: JSON.parse(r.source_lang_json),
    gloss_line: JSON.parse(r.gloss_line_json),
    tags: JSON.parse(r.tags_json),
  }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function getDbMeta(db: Database.Database): Record<string, string> {
  const rows = db
    .prepare('SELECT key, value FROM db_meta')
    .all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
