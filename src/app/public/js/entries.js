// ── Entry list, rendering, search, and data-loading ─────────────────────────
import { state } from './state.js';
import { esc, highlightText, toast } from './utils.js';

// ── Data loading ─────────────────────────────────────────────────────────────

export async function loadParadigmDefaults() {
  try {
    const r = await fetch('/api/settings/paradigm-defaults');
    state.paradigmDefaults = await r.json();
  } catch { state.paradigmDefaults = {}; }
}

export async function loadGlossary() {
  try {
    const r = await fetch('/api/glosses');
    const { glosses } = await r.json();
    state.glossary = glosses ?? {};
  } catch {
    state.glossary = {};
  }
}

export async function loadEntrySuggestions() {
  try {
    const r = await fetch('/api/suggestions');
    const data = await r.json();
    state.entrySuggestions = {
      tags:      Array.isArray(data.tags)      ? data.tags      : [],
      templates: Array.isArray(data.templates) ? data.templates : [],
      profiles:  Array.isArray(data.profiles)  ? data.profiles  : [],
    };
  } catch {
    state.entrySuggestions = { tags: [], templates: [], profiles: [] };
  }
}

export async function loadMorphemes() {
  try {
    const r = await fetch('/api/entries?kind=morpheme');
    const { entries } = await r.json();
    state.morphemeList = Array.isArray(entries) ? entries : [];
  } catch {
    state.morphemeList = [];
  }
}

export async function loadStatus() {
  try {
    const r = await fetch('/api/admin/status');
    const { meta, counts } = await r.json();
    document.getElementById('db-subtitle').textContent =
      `v${meta.db_schema_version ?? '?'} · built ${meta.built_at ? new Date(meta.built_at).toLocaleString() : '—'}`;
    document.getElementById('status-entries').textContent =
      `${counts.lexemes} lexemes · ${counts.morphemes} morphemes`;
    document.getElementById('status-forms').textContent =
      `${counts.forms} generated forms`;
    document.getElementById('status-db').textContent =
      `${counts.rules} rules · ${counts.examples} examples`;
  } catch {
    document.getElementById('db-subtitle').textContent = 'DB not ready';
  }
}

export async function loadEntries() {
  const r = await fetch('/api/entries');
  const { entries } = await r.json();
  state.allEntries = entries;
  rerenderEntryList();
}

// ── Filtering & rendering ────────────────────────────────────────────────────

function getFilteredEntries() {
  const kind = document.getElementById('filter-kind')?.value ?? '';
  const cat  = document.getElementById('filter-cat')?.value  ?? '';
  let filtered = state.allEntries;
  if (kind) filtered = filtered.filter(e => e.entry_kind === kind);
  if (cat)  filtered = filtered.filter(e => e.major_category === cat);
  return filtered;
}

export function rerenderEntryList() {
  if (state.currentSearchQuery.trim()) {
    renderList(state.currentSearchResults, { query: state.currentSearchQuery, suggestionMode: true });
    return;
  }
  renderList(getFilteredEntries());
}

function renderList(entries, options = {}) {
  const { query = '', suggestionMode = false } = options;
  const list = document.getElementById('entry-list');
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state" style="height:200px"><p>No entries found</p></div>';
    return;
  }
  list.innerHTML = suggestionMode
    ? entries.map((suggestion) => renderSuggestionItem(suggestion, query)).join('')
    : entries.map((e) => renderEntryListItem(e)).join('');
}

function renderEntryListItem(e) {
  return `
    <div class="entry-item${state.currentEntry?.key === e.key ? ' active' : ''}"
         onclick="App.selectEntry('${e.key}')">
      <div style="display:flex;gap:6px;align-items:center">
        <span class="key">${esc(e.key)}</span>
        ${catBadge(e)}
        ${statusBadge(e.status)}
      </div>
      <div class="lemma">${esc(e.display_lemma)}</div>
      <div class="gloss">${esc(e.glosses.slice(0,2).join('; '))}</div>
    </div>
  `;
}

function renderSuggestionItem(suggestion, query) {
  const e = suggestion.entry;
  return `
    <div class="entry-item${state.currentEntry?.key === e.key ? ' active' : ''}"
         onclick="App.selectEntry('${e.key}')">
      <div style="display:flex;gap:6px;align-items:center">
        <span class="key">${highlightText(e.key, query)}</span>
        ${catBadge(e)}
        ${statusBadge(e.status)}
      </div>
      <div class="lemma">${highlightText(e.display_lemma, query)}</div>
      <div class="gloss">${highlightText(e.glosses.slice(0,2).join('; '), query)}</div>
      ${renderSuggestionMatchDetail(suggestion, query)}
    </div>
  `;
}

function renderSuggestionMatchDetail(suggestion, query) {
  if (suggestion.match_type === 'form') {
    const slot = suggestion.matched_slot
      ? ` <span class="match-slot">${esc(suggestion.matched_slot)}</span>`
      : '';
    return `<div class="match-note">Form match${slot}: ${highlightText(suggestion.matched_text, query)}</div>`;
  }
  if (suggestion.match_type === 'gloss') {
    return `<div class="match-note">Gloss match: ${highlightText(suggestion.matched_text, query)}</div>`;
  }
  if (suggestion.match_type === 'tag') {
    return `<div class="match-note">Tag match: ${highlightText(suggestion.matched_text, query)}</div>`;
  }
  if (suggestion.match_type === 'notes') {
    return `<div class="match-note">Notes match: ${highlightText(suggestion.matched_text, query)}</div>`;
  }
  return '';
}

export function catBadge(e) {
  if (e.entry_kind === 'morpheme') return '<span class="badge badge-morpheme">morpheme</span>';
  const cls = { noun:'badge-noun', verb:'badge-verb', modifier:'badge-modifier', 'function-word':'badge-fw' }[e.major_category] ?? '';
  return `<span class="badge ${cls}">${e.major_category}</span>`;
}

function statusBadge(s) {
  const cls = { active:'badge-active', draft:'badge-draft', deprecated:'badge-deprecated' }[s] ?? '';
  return s !== 'active' ? `<span class="badge ${cls}">${s}</span>` : '';
}

// ── Rule name helpers (used here and in rules.js) ────────────────────────────

export function getRuleDisplayName(rule) {
  const d = rule?.data ?? rule;
  return d?.friendly_name || d?.name || d?.key || '';
}

export function getRuleDisplayNameByKey(ruleKey) {
  const match = state.allRules.find((rule) => {
    const d = rule?.data ?? rule;
    return d?.key === ruleKey;
  });
  return match ? getRuleDisplayName(match) : ruleKey;
}

// ── Entry selection ──────────────────────────────────────────────────────────

const catAccent = {
  noun:           '#7dd3fc',
  verb:           '#6ee7b7',
  modifier:       '#fcd34d',
  'function-word':'#d8b4fe',
  postposition:   '#fb923c',
  prefix:         '#a5f3fc',
  suffix:         '#a5f3fc',
  morpheme:       '#c084fc',
};

export async function selectEntry(key) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-entry');
  panel.classList.add('active');
  panel.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  rerenderEntryList();

  const [entryRes, formsRes, examplesRes] = await Promise.all([
    fetch(`/api/entries/${key}`),
    fetch(`/api/entries/${key}/forms`),
    fetch(`/api/entries/${key}/examples`),
  ]);
  state.currentEntry = await entryRes.json();
  const { forms }    = await formsRes.json();
  const { examples } = await examplesRes.json();

  renderEntry(state.currentEntry, forms ?? [], examples ?? []);
  rerenderEntryList(); // refresh active state
}

function renderEntry(e, forms, examples) {
  const panel  = document.getElementById('panel-entry');
  const accent = catAccent[e.major_category] ?? 'var(--accent)';

  // ── Meta pills ────────────────────────────────────────────────────────
  const metaPills = [
    { label: 'Kind',     val: e.entry_kind,     mono: false },
    { label: 'Category', val: e.major_category, mono: false },
    ...(e.subtype ? [{ label: 'Subtype', val: e.subtype, mono: false }] : []),
    { label: 'Status',   val: e.status,         mono: false },
    ...(e.entry_kind === 'lexeme' && (e.template_id || e.inflection_profile)
      ? [{ label: e.template_id ? 'Template' : 'Profile',
           val: e.template_id ? getRuleDisplayNameByKey(e.template_id) : e.inflection_profile, mono: !e.template_id }]
      : []),
    ...(e.entry_kind === 'morpheme'
      ? [{ label: 'Slot', val: e.slot, mono: true },
         { label: 'Gloss abbr', val: e.gloss_abbr, mono: true }]
      : []),
    { label: 'File', val: e.source_file, mono: true },
  ];

  // ── Stem variants ─────────────────────────────────────────────────────
  const stems = (e.stem_variants ?? []).length
    ? `<div class="section-header" style="margin-top:0">Stem variants</div>
       <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">
         ${(e.stem_variants ?? []).map(sv =>
           `<span style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:4px 10px;font-size:12px">
              <span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.05em;display:block">${sv.label}</span>
              <em style="font-size:14px">${sv.form}</em>
            </span>`).join('')}
       </div>`
    : '';

  // ── Tags ──────────────────────────────────────────────────────────────
  const tagsHtml = (e.tags ?? []).length
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:20px">
         ${e.tags.map(t => `<span style="font-family:var(--font-mono);font-size:10px;background:var(--surface2);border:1px solid var(--border);padding:2px 7px;border-radius:4px;color:var(--text-muted)">${t}</span>`).join('')}
       </div>`
    : '';

  // ── Forms grid ────────────────────────────────────────────────────────
  const formsHtml = forms.length
    ? `<div class="section-header">Paradigm <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted)">(${forms.length} form${forms.length!==1?'s':''}${forms.some(f=>f.overridden)?' · ⚡ = manual override':''})</span></div>
       <div class="forms-grid" style="margin-bottom:20px">
         ${forms.map(f => `
           <div class="form-cell${f.overridden ? ' override' : ''}">
             <div class="slot">${renderSlotLabel(f.slot)}</div>
             <div class="form">${f.form}</div>
           </div>`).join('')}
       </div>`
    : '';

  // ── Examples ──────────────────────────────────────────────────────────
  const examplesHtml = examples.length
    ? `<div class="section-header">Usage examples <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted)">(${examples.length})</span></div>
       ${examples.map(ex => `
         <div class="example-card">
           <div class="source">${renderTokens(ex.source_lang)}</div>
           <div class="gloss">${renderGlossLine(ex.gloss_line)}</div>
           <div class="translation">'${ex.translation}'</div>
           ${ex.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${ex.notes}</div>` : ''}
         </div>`).join('')}`
    : '';

  panel.innerHTML = `
    <!-- Hero card -->
    <div class="entry-hero">
      <div class="hero-accent" style="background:${accent}"></div>
      <div class="hero-body">
        <div class="hero-top">
          <div class="hero-lemma">${e.display_lemma}</div>
          <button class="hero-edit-btn" onclick="${e.entry_kind === 'morpheme' ? `App.openMorphemeEditor('${e.key}')` : `App.openEntryEditor('${e.key}')`}">✎ Edit</button>
        </div>
        <div class="hero-chips">
          <span class="key-chip">${e.key}</span>
          ${catBadge(e)}
          ${statusBadge(e.status)}
        </div>
        <div class="hero-glosses">${e.glosses.join(' · ')}</div>
      </div>
    </div>

    <!-- Metadata strip -->
    <div class="meta-strip">
      ${metaPills.map(p => `
        <div class="meta-pill">
          <div class="ml">${p.label}</div>
          <div class="mv${p.mono?' mono':''}">${p.val}</div>
        </div>`).join('')}
    </div>

    ${e.notes ? `<div class="notes-block">${e.notes}</div>` : ''}
    ${e.attested_in?.length
      ? `<div style="margin-bottom:20px;font-size:12px;color:var(--text-muted)">Attested in: ${e.attested_in.map(a=>`<span style="font-family:var(--font-mono);font-size:11px;background:var(--surface2);padding:1px 6px;border-radius:4px;margin-left:4px">${a}</span>`).join('')}</div>`
      : ''}
    ${stems}
    ${tagsHtml}
    ${formsHtml}
    ${examplesHtml}
  `;
}

export function renderSlotLabel(slot) {
  const parts = slot.split(/([.\-=])/);
  return parts.map(part => {
    if (/^[.\-=]$/.test(part)) {
      return `<span class="gsep">${part}</span>`;
    }
    const entry = state.glossary[part];
    if (!entry) {
      return `<span class="gtok">${part}</span>`;
    }
    const tip = entry.domain
      ? `${entry.expansion} (${entry.domain})`
      : entry.expansion;
    return `<span class="gtok" data-tip="${tip}">${part}</span>`;
  }).join('');
}

function renderTokens(tokens) {
  return tokens.map(t => {
    if (t.type === 'literal')  return t.literal;
    if (t.type === 'form')     return `<em>${t.key}.${t.slot}</em>`;
    if (t.type === 'morpheme') return `<em>${t.key}</em>`;
    return t.gloss ?? '';
  }).join(' ');
}

function renderGlossLine(tokens) {
  return tokens.map(t => {
    const raw = t.gloss ?? t.literal ?? t.key ?? '';
    return renderSlotLabel(raw);
  }).join('<span class="gsep">-</span>');
}

// ── Search & filter ──────────────────────────────────────────────────────────

export function search(q) {
  state.currentSearchQuery = q;
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(async () => {
    const trimmed = q.trim();
    if (!trimmed) {
      state.currentSearchResults = [];
      rerenderEntryList();
      return;
    }
    const r = await fetch(`/api/entries/suggest?q=${encodeURIComponent(trimmed)}`);
    const { suggestions } = await r.json();
    state.currentSearchResults = Array.isArray(suggestions) ? suggestions : [];
    rerenderEntryList();
  }, 200);
}

export function applyFilters() {
  if (state.currentSearchQuery.trim()) {
    search(state.currentSearchQuery);
    return;
  }
  rerenderEntryList();
}
