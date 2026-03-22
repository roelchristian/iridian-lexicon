/**
 * SQLite projection schema definitions.
 *
 * db_schema_version is versioned independently from source_schema_version.
 * When DB_SCHEMA_VERSION changes, a full rebuild from YAML is required.
 *
 * The DB is a derived, rebuildable projection.  It is never the source of
 * truth.  All provenance fields (source_file, generation_origin, etc.)
 * are stored so the app can show where every piece of data came from.
 */

export const DB_SCHEMA_VERSION = 1;

/**
 * All DDL statements for the current schema, in dependency order.
 * Drop and recreate tables on a full rebuild.
 */
export const DDL_STATEMENTS = `
-- Schema metadata / version tracking
CREATE TABLE IF NOT EXISTS db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Entries table: all lexemes and morphemes
CREATE TABLE IF NOT EXISTS entries (
  id                 TEXT PRIMARY KEY,
  key                TEXT NOT NULL UNIQUE,
  lemma              TEXT NOT NULL,
  display_lemma      TEXT NOT NULL,
  entry_kind         TEXT NOT NULL CHECK(entry_kind IN ('lexeme', 'morpheme')),
  major_category     TEXT NOT NULL,
  subtype            TEXT NOT NULL,
  glosses_json       TEXT NOT NULL,   -- JSON array of strings
  notes              TEXT NOT NULL DEFAULT '',
  tags_json          TEXT NOT NULL DEFAULT '[]',
  status             TEXT NOT NULL CHECK(status IN ('active', 'draft', 'deprecated')),
  -- Lexeme-only fields (NULL for morphemes)
  template_id        TEXT,
  inflection_profile TEXT,
  stem_variants_json TEXT,            -- JSON array of StemVariant
  manual_overrides_json TEXT,         -- JSON object slot→form
  attested_in_json   TEXT,            -- JSON array of strings
  -- Morpheme-only fields (NULL for lexemes)
  display_form       TEXT,
  gloss_abbr         TEXT,
  slot               TEXT,
  category           TEXT,
  allomorph_rules_json TEXT,          -- JSON array of AllomorphRule
  override_hook      TEXT,
  -- Provenance
  source_file        TEXT NOT NULL
);

-- Generated forms: inflected forms produced by the rule engine
CREATE TABLE IF NOT EXISTS generated_forms (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  lexeme_key       TEXT NOT NULL REFERENCES entries(key),
  slot             TEXT NOT NULL,
  form             TEXT NOT NULL,
  generated        INTEGER NOT NULL DEFAULT 1 CHECK(generated IN (0, 1)),
  rule_key         TEXT,              -- which inflection rule generated this
  overridden       INTEGER NOT NULL DEFAULT 0 CHECK(overridden IN (0, 1)),
  generation_origin TEXT NOT NULL,    -- 'rule-engine' | 'manual-override'
  UNIQUE(lexeme_key, slot)
);

-- Rules table: inflection, morphotactic, syntax rules
CREATE TABLE IF NOT EXISTS rules (
  id              TEXT NOT NULL,
  key             TEXT NOT NULL UNIQUE,
  rule_kind       TEXT NOT NULL CHECK(rule_kind IN ('inflection', 'morphotactic', 'syntax')),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT,              -- for inflection rules
  word_class      TEXT,              -- for morphotactic rules
  word_order      TEXT,              -- for syntax rules
  data_json       TEXT NOT NULL,     -- full rule data as JSON
  tags_json       TEXT NOT NULL DEFAULT '[]',
  notes           TEXT NOT NULL DEFAULT '',
  source_file     TEXT NOT NULL,
  PRIMARY KEY (id, rule_kind)
);

-- Examples: usage examples linked to lexemes
CREATE TABLE IF NOT EXISTS examples (
  id              TEXT PRIMARY KEY,
  lexeme_key      TEXT REFERENCES entries(key),  -- NULL for standalone examples
  source_lang_json TEXT NOT NULL,     -- JSON array of ExampleToken
  gloss_line_json  TEXT NOT NULL,     -- JSON array of ExampleToken
  translation     TEXT NOT NULL,
  notes           TEXT,
  tags_json       TEXT NOT NULL DEFAULT '[]',
  source_file     TEXT NOT NULL
);

-- Token links: resolved references from example tokens to entries
CREATE TABLE IF NOT EXISTS token_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  example_id      TEXT NOT NULL REFERENCES examples(id),
  token_index     INTEGER NOT NULL,   -- position in source_lang array
  token_type      TEXT NOT NULL,      -- 'form' | 'morpheme' | 'literal' | 'gloss'
  referenced_key  TEXT,               -- entry key being referenced
  referenced_slot TEXT,               -- slot, if type=form
  resolved        INTEGER NOT NULL DEFAULT 0  -- 1 if the reference was resolved
);

-- Search index: virtual table for full-text search across entries
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  key,
  lemma,
  display_lemma,
  glosses,
  notes,
  tags,
  content='entries',
  content_rowid='rowid'
);
`;

/** Statements to drop all tables (for full rebuild). */
export const DROP_ALL_STATEMENTS = `
DROP TABLE IF EXISTS token_links;
DROP TABLE IF EXISTS examples;
DROP TABLE IF EXISTS generated_forms;
DROP TABLE IF EXISTS rules;
DROP TABLE IF EXISTS entries_fts;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS db_meta;
`;
