/**
 * Common query functions for the SQLite projection (node:sqlite).
 */

import { DatabaseSync } from 'node:sqlite';
import type { GeneratedForm } from '../types/index.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface EntryRow {
  id: string;
  key: string;
  lemma: string;
  display_lemma: string;
  entry_kind: string;
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
    stem_variants: row.stem_variants_json ? JSON.parse(row.stem_variants_json) : undefined,
    manual_overrides: row.manual_overrides_json ? JSON.parse(row.manual_overrides_json) : undefined,
    attested_in: row.attested_in_json ? JSON.parse(row.attested_in_json) : undefined,
    allomorph_rules: row.allomorph_rules_json ? JSON.parse(row.allomorph_rules_json) : undefined,
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
// Entries
// ---------------------------------------------------------------------------

export function getAllEntries(db: DatabaseSync) {
  return (db.prepare('SELECT * FROM entries ORDER BY key').all() as EntryRow[]).map(parseEntry);
}

export function getLexemes(db: DatabaseSync) {
  return (db.prepare("SELECT * FROM entries WHERE entry_kind = 'lexeme' ORDER BY key").all() as EntryRow[]).map(parseEntry);
}

export function getMorphemes(db: DatabaseSync) {
  return (db.prepare("SELECT * FROM entries WHERE entry_kind = 'morpheme' ORDER BY key").all() as EntryRow[]).map(parseEntry);
}

export function getEntryByKey(db: DatabaseSync, key: string) {
  const row = db.prepare('SELECT * FROM entries WHERE key = $key').get({ key }) as EntryRow | undefined;
  return row ? parseEntry(row) : null;
}

export function getEntryById(db: DatabaseSync, id: string) {
  const row = db.prepare('SELECT * FROM entries WHERE id = $id').get({ id }) as EntryRow | undefined;
  return row ? parseEntry(row) : null;
}

export function searchEntries(db: DatabaseSync, query: string) {
  try {
    const rows = db.prepare(`
      SELECT e.* FROM entries e
      JOIN entries_fts fts ON e.rowid = fts.rowid
      WHERE entries_fts MATCH $query
      ORDER BY rank
    `).all({ query }) as EntryRow[];
    return rows.map(parseEntry);
  } catch {
    // FTS5 unavailable — fall back to LIKE search
    const likeQ = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM entries
      WHERE key LIKE $q OR lemma LIKE $q OR notes LIKE $q OR glosses_json LIKE $q
      ORDER BY key
    `).all({ q: likeQ }) as EntryRow[];
    return rows.map(parseEntry);
  }
}

export function getEntriesByCategory(db: DatabaseSync, category: string) {
  return (db.prepare('SELECT * FROM entries WHERE major_category = $category ORDER BY key')
    .all({ category }) as EntryRow[]).map(parseEntry);
}

export function getEntriesByStatus(db: DatabaseSync, status: string) {
  return (db.prepare('SELECT * FROM entries WHERE status = $status ORDER BY key')
    .all({ status }) as EntryRow[]).map(parseEntry);
}

// ---------------------------------------------------------------------------
// Generated forms
// ---------------------------------------------------------------------------

export function getFormsForLexeme(db: DatabaseSync, lexemeKey: string): GeneratedForm[] {
  return (db.prepare('SELECT * FROM generated_forms WHERE lexeme_key = $lexeme_key ORDER BY slot')
    .all({ lexeme_key: lexemeKey }) as FormRow[]).map(parseForm);
}

export function getAllForms(db: DatabaseSync): GeneratedForm[] {
  return (db.prepare('SELECT * FROM generated_forms ORDER BY lexeme_key, slot')
    .all() as FormRow[]).map(parseForm);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function getAllRules(db: DatabaseSync) {
  return (db.prepare('SELECT * FROM rules ORDER BY rule_kind, key').all() as RuleRow[])
    .map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

export function getRuleByKey(db: DatabaseSync, key: string) {
  const row = db.prepare('SELECT * FROM rules WHERE key = $key').get({ key }) as RuleRow | undefined;
  return row ? { ...row, data: JSON.parse(row.data_json) } : null;
}

export function getRulesByKind(db: DatabaseSync, kind: string) {
  return (db.prepare('SELECT * FROM rules WHERE rule_kind = $kind ORDER BY key')
    .all({ kind }) as RuleRow[]).map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export function getExamplesForLexeme(db: DatabaseSync, lexemeKey: string) {
  const rows = db.prepare('SELECT * FROM examples WHERE lexeme_key = $lexeme_key')
    .all({ lexeme_key: lexemeKey }) as Array<{
    id: string; lexeme_key: string;
    source_lang_json: string; gloss_line_json: string;
    translation: string; notes: string | null; tags_json: string; source_file: string;
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

export function getDbMeta(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM db_meta').all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r['key'], r['value']]));
}
