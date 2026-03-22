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
  category?: string | null;
  data_json: string;
  source_file: string;
}

interface TagJsonRow {
  tags_json: string;
}

interface TemplateSuggestion {
  key: string;
  label: string;
  name: string;
  friendly_name?: string;
  category?: string;
  usage_count: number;
}

interface ProfileSuggestion {
  value: string;
  usage_count: number;
  categories: string[];
}

interface FormSearchRow extends EntryRow {
  matched_form: string;
  matched_slot: string;
}

export interface EntrySearchSuggestion {
  entry: ReturnType<typeof parseEntry>;
  match_type: 'key' | 'lemma' | 'display_lemma' | 'gloss' | 'notes' | 'tag' | 'form';
  matched_text: string;
  matched_slot?: string;
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
    overridden: row.overridden === 1,
    ...(row.rule_key ? { rule_key: row.rule_key } : {}),
  };
}

function getMatchStrength(value: string | null | undefined, query: string): number | null {
  if (!value) return null;
  const haystack = value.toLocaleLowerCase();
  if (haystack === query) return 0;
  if (haystack.startsWith(query)) return 1;
  if (haystack.includes(query)) return 2;
  return null;
}

function compareSuggestions(a: RankedEntrySearchSuggestion, b: RankedEntrySearchSuggestion) {
  return a.score - b.score
    || a.entry.display_lemma.localeCompare(b.entry.display_lemma)
    || a.entry.key.localeCompare(b.entry.key);
}

interface RankedEntrySearchSuggestion extends EntrySearchSuggestion {
  score: number;
}

function rankEntryRow(row: EntryRow, normalizedQuery: string): RankedEntrySearchSuggestion | null {
  const entry = parseEntry(row);
  const candidates: Array<{
    type: RankedEntrySearchSuggestion['match_type'];
    text: string;
    score: number;
  }> = [];

  const keyStrength = getMatchStrength(entry.key, normalizedQuery);
  if (keyStrength !== null) candidates.push({ type: 'key', text: entry.key, score: keyStrength });

  const lemmaStrength = getMatchStrength(entry.lemma, normalizedQuery);
  if (lemmaStrength !== null) candidates.push({ type: 'lemma', text: entry.lemma, score: 10 + lemmaStrength });

  const displayStrength = getMatchStrength(entry.display_lemma, normalizedQuery);
  if (displayStrength !== null) candidates.push({ type: 'display_lemma', text: entry.display_lemma, score: 12 + displayStrength });

  for (const gloss of entry.glosses) {
    const glossStrength = getMatchStrength(gloss, normalizedQuery);
    if (glossStrength !== null) candidates.push({ type: 'gloss', text: gloss, score: 20 + glossStrength });
  }

  for (const tag of entry.tags) {
    const tagStrength = getMatchStrength(tag, normalizedQuery);
    if (tagStrength !== null) candidates.push({ type: 'tag', text: tag, score: 30 + tagStrength });
  }

  const notesStrength = getMatchStrength(entry.notes, normalizedQuery);
  if (notesStrength !== null) candidates.push({ type: 'notes', text: entry.notes, score: 40 + notesStrength });

  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => a.score - b.score || a.text.length - b.text.length)[0]!;
  return {
    entry,
    match_type: best.type,
    matched_text: best.text,
    score: best.score,
  };
}

function rankFormRow(row: FormSearchRow, normalizedQuery: string): RankedEntrySearchSuggestion | null {
  const { matched_form, matched_slot, ...entryRow } = row;
  const entry = parseEntry(entryRow);
  const formStrength = getMatchStrength(matched_form, normalizedQuery);
  if (formStrength === null) return null;
  return {
    entry,
    match_type: 'form',
    matched_text: matched_form,
    matched_slot,
    score: 15 + formStrength,
  };
}

function selectBetterSuggestion(
  current: RankedEntrySearchSuggestion | undefined,
  next: RankedEntrySearchSuggestion
) {
  if (!current) return next;
  return compareSuggestions(next, current) < 0 ? next : current;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export function getAllEntries(db: DatabaseSync) {
  return (db.prepare('SELECT * FROM entries ORDER BY key').all() as unknown as EntryRow[]).map(parseEntry);
}

export function getLexemes(db: DatabaseSync) {
  return (db.prepare("SELECT * FROM entries WHERE entry_kind = 'lexeme' ORDER BY key").all() as unknown as EntryRow[]).map(parseEntry);
}

export function getMorphemes(db: DatabaseSync) {
  return (db.prepare("SELECT * FROM entries WHERE entry_kind = 'morpheme' ORDER BY key").all() as unknown as EntryRow[]).map(parseEntry);
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
  return searchEntrySuggestions(db, query).map((suggestion) => suggestion.entry);
}

export function searchEntrySuggestions(db: DatabaseSync, query: string, limit = 25): EntrySearchSuggestion[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const likeQ = `%${normalizedQuery}%`;
  const entryRows = db.prepare(`
    SELECT *
    FROM entries
    WHERE lower(key) LIKE $q
      OR lower(lemma) LIKE $q
      OR lower(display_lemma) LIKE $q
      OR lower(glosses_json) LIKE $q
      OR lower(notes) LIKE $q
      OR lower(tags_json) LIKE $q
    ORDER BY key
  `).all({ q: likeQ }) as unknown as EntryRow[];

  const formRows = db.prepare(`
    SELECT
      e.*,
      gf.form AS matched_form,
      gf.slot AS matched_slot
    FROM generated_forms gf
    JOIN entries e ON e.key = gf.lexeme_key
    WHERE lower(gf.form) LIKE $q
    ORDER BY e.key, gf.slot
  `).all({ q: likeQ }) as unknown as FormSearchRow[];

  const ranked = new Map<string, RankedEntrySearchSuggestion>();

  for (const row of entryRows) {
    const match = rankEntryRow(row, normalizedQuery);
    if (!match) continue;
    ranked.set(match.entry.key, selectBetterSuggestion(ranked.get(match.entry.key), match));
  }

  for (const row of formRows) {
    const match = rankFormRow(row, normalizedQuery);
    if (!match) continue;
    ranked.set(match.entry.key, selectBetterSuggestion(ranked.get(match.entry.key), match));
  }

  return [...ranked.values()]
    .sort(compareSuggestions)
    .slice(0, Math.max(1, limit))
    .map(({ score: _score, ...suggestion }) => suggestion);
}

export function getEntriesByCategory(db: DatabaseSync, category: string) {
  return (db.prepare('SELECT * FROM entries WHERE major_category = $category ORDER BY key')
    .all({ category }) as unknown as EntryRow[]).map(parseEntry);
}

export function getEntriesByStatus(db: DatabaseSync, status: string) {
  return (db.prepare('SELECT * FROM entries WHERE status = $status ORDER BY key')
    .all({ status }) as unknown as EntryRow[]).map(parseEntry);
}

// ---------------------------------------------------------------------------
// Generated forms
// ---------------------------------------------------------------------------

export function getFormsForLexeme(db: DatabaseSync, lexemeKey: string): GeneratedForm[] {
  return (db.prepare('SELECT * FROM generated_forms WHERE lexeme_key = $lexeme_key ORDER BY slot')
    .all({ lexeme_key: lexemeKey }) as unknown as FormRow[]).map(parseForm);
}

export function getAllForms(db: DatabaseSync): GeneratedForm[] {
  return (db.prepare('SELECT * FROM generated_forms ORDER BY lexeme_key, slot')
    .all() as unknown as FormRow[]).map(parseForm);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function getAllRules(db: DatabaseSync) {
  return (db.prepare('SELECT * FROM rules ORDER BY rule_kind, key').all() as unknown as RuleRow[])
    .map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

export function getRuleByKey(db: DatabaseSync, key: string) {
  const row = db.prepare('SELECT * FROM rules WHERE key = $key').get({ key }) as RuleRow | undefined;
  return row ? { ...row, data: JSON.parse(row.data_json) } : null;
}

export function getRulesByKind(db: DatabaseSync, kind: string) {
  return (db.prepare('SELECT * FROM rules WHERE rule_kind = $kind ORDER BY key')
    .all({ kind }) as unknown as RuleRow[]).map((r) => ({ ...r, data: JSON.parse(r.data_json) }));
}

export function getEntriesForRule(db: DatabaseSync, ruleKey: string) {
  return (db.prepare(`
      SELECT * FROM entries
      WHERE entry_kind = 'lexeme' AND template_id = $ruleKey
      ORDER BY display_lemma, key
    `).all({ ruleKey }) as unknown as EntryRow[]).map(parseEntry);
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export function getExamplesForLexeme(db: DatabaseSync, lexemeKey: string) {
  const rows = db.prepare('SELECT * FROM examples WHERE lexeme_key = $lexeme_key')
    .all({ lexeme_key: lexemeKey }) as unknown as Array<{
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

// ---------------------------------------------------------------------------
// Suggestions / authoring metadata
// ---------------------------------------------------------------------------

export function getAllAvailableTags(db: DatabaseSync): string[] {
  const sources = [
    ...(db.prepare('SELECT tags_json FROM entries').all() as unknown as TagJsonRow[]),
    ...(db.prepare('SELECT tags_json FROM rules').all() as unknown as TagJsonRow[]),
    ...(db.prepare('SELECT tags_json FROM examples').all() as unknown as TagJsonRow[]),
  ];

  const tags = new Set<string>();
  for (const row of sources) {
    const parsed = JSON.parse(row.tags_json) as string[];
    for (const tag of parsed) {
      const clean = tag.trim();
      if (clean) tags.add(clean);
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function getTemplateSuggestions(db: DatabaseSync): TemplateSuggestion[] {
  const rules = db.prepare(`
      SELECT r.key, r.name, r.category, r.data_json,
             COUNT(e.key) AS usage_count
      FROM rules r
      LEFT JOIN entries e
        ON e.entry_kind = 'lexeme'
       AND e.template_id = r.key
      WHERE r.rule_kind = 'inflection'
      GROUP BY r.key, r.name, r.category, r.data_json
      ORDER BY r.key
    `).all() as unknown as Array<{
    key: string;
    name: string;
    category: string | null;
    data_json: string;
    usage_count: number;
  }>;

  return rules.map((rule) => {
    const data = JSON.parse(rule.data_json) as { friendly_name?: string };
    const friendlyName = data.friendly_name?.trim();
    return {
      key: rule.key,
      label: friendlyName ? `${friendlyName} (${rule.key})` : rule.key,
      name: rule.name,
      ...(friendlyName ? { friendly_name: friendlyName } : {}),
      ...(rule.category ? { category: rule.category } : {}),
      usage_count: rule.usage_count,
    };
  });
}

export function getInflectionProfileSuggestions(db: DatabaseSync): ProfileSuggestion[] {
  const rows = db.prepare(`
      SELECT inflection_profile, major_category
      FROM entries
      WHERE entry_kind = 'lexeme'
        AND inflection_profile IS NOT NULL
        AND TRIM(inflection_profile) <> ''
    `).all() as unknown as Array<{ inflection_profile: string; major_category: string }>;

  const profiles = new Map<string, { usage_count: number; categories: Set<string> }>();

  for (const row of rows) {
    const value = row.inflection_profile.trim();
    if (!value) continue;
    const existing = profiles.get(value) ?? { usage_count: 0, categories: new Set<string>() };
    existing.usage_count += 1;
    existing.categories.add(row.major_category);
    profiles.set(value, existing);
  }

  return [...profiles.entries()]
    .map(([value, meta]) => ({
      value,
      usage_count: meta.usage_count,
      categories: [...meta.categories].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}
