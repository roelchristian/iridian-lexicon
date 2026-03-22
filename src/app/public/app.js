const App = (() => {
  let allEntries = [];
  let currentEntry = null;
  let searchTimer = null;
  let showAllRuleEntries = false;
  let currentSearchQuery = '';
  let currentSearchResults = [];

  // glossary: abbr → { expansion, description, domain }
  // Loaded once from /api/glosses on startup; used by renderSlotLabel().
  let glossary = {};
  // Loaded once from /api/settings/paradigm-defaults; used by quick-fill buttons.
  let paradigmDefaults = {};
  // Loaded once from /api/suggestions; used by entry-authoring autocomplete/chips.
  let entrySuggestions = { tags: [], templates: [], profiles: [] };
  // Loaded once from /api/entries?kind=morpheme; used by cell prefix/suffix autocomplete.
  let morphemeList = [];

  // ── Init ────────────────────────────────────────────────────────────
  async function init() {
    await Promise.all([
      loadGlossary(),
      loadParadigmDefaults(),
      loadEntrySuggestions(),
      loadMorphemes(),
      loadStatus(),
      loadEntries(),
      loadRuleList(),
    ]);
  }

  async function loadParadigmDefaults() {
    try {
      const r = await fetch('/api/settings/paradigm-defaults');
      paradigmDefaults = await r.json();
    } catch { paradigmDefaults = {}; }
  }

  async function loadGlossary() {
    try {
      const r = await fetch('/api/glosses');
      const { glosses } = await r.json();
      glossary = glosses ?? {};
    } catch {
      glossary = {}; // degrade gracefully — tooltips just won't appear
    }
  }

  async function loadEntrySuggestions() {
    try {
      const r = await fetch('/api/suggestions');
      const data = await r.json();
      entrySuggestions = {
        tags: Array.isArray(data.tags) ? data.tags : [],
        templates: Array.isArray(data.templates) ? data.templates : [],
        profiles: Array.isArray(data.profiles) ? data.profiles : [],
      };
    } catch {
      entrySuggestions = { tags: [], templates: [], profiles: [] };
    }
  }

  async function loadMorphemes() {
    try {
      const r = await fetch('/api/entries?kind=morpheme');
      const { entries } = await r.json();
      morphemeList = Array.isArray(entries) ? entries : [];
    } catch {
      morphemeList = [];
    }
  }

  async function loadStatus() {
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

  async function loadEntries() {
    const r = await fetch('/api/entries');
    const { entries } = await r.json();
    allEntries = entries;
    rerenderEntryList();
  }

  // ── Rendering ───────────────────────────────────────────────────────
  function getFilteredEntries() {
    const kind = document.getElementById('filter-kind')?.value ?? '';
    const cat = document.getElementById('filter-cat')?.value ?? '';
    let filtered = allEntries;
    if (kind) filtered = filtered.filter(e => e.entry_kind === kind);
    if (cat) filtered = filtered.filter(e => e.major_category === cat);
    return filtered;
  }

  function rerenderEntryList() {
    if (currentSearchQuery.trim()) {
      renderList(currentSearchResults, { query: currentSearchQuery, suggestionMode: true });
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
      <div class="entry-item${currentEntry?.key === e.key ? ' active' : ''}"
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
      <div class="entry-item${currentEntry?.key === e.key ? ' active' : ''}"
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

  function getRuleDisplayName(rule) {
    const d = rule?.data ?? rule;
    return d?.friendly_name || d?.name || d?.key || '';
  }

  function getRuleDisplayNameByKey(ruleKey) {
    const match = allRules.find((rule) => {
      const d = rule?.data ?? rule;
      return d?.key === ruleKey;
    });
    return match ? getRuleDisplayName(match) : ruleKey;
  }

  function catBadge(e) {
    if (e.entry_kind === 'morpheme') return '<span class="badge badge-morpheme">morpheme</span>';
    const cls = { noun:'badge-noun', verb:'badge-verb', modifier:'badge-modifier', 'function-word':'badge-fw' }[e.major_category] ?? '';
    return `<span class="badge ${cls}">${e.major_category}</span>`;
  }

  function statusBadge(s) {
    const cls = { active:'badge-active', draft:'badge-draft', deprecated:'badge-deprecated' }[s] ?? '';
    return s !== 'active' ? `<span class="badge ${cls}">${s}</span>` : '';
  }

  // ── Entry selection — loads info + forms + examples in one panel ──────
  async function selectEntry(key) {
    // Show a spinner immediately
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-entry');
    panel.classList.add('active');
    panel.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
    rerenderEntryList();

    // Fetch everything in parallel
    const [entryRes, formsRes, examplesRes] = await Promise.all([
      fetch(`/api/entries/${key}`),
      fetch(`/api/entries/${key}/forms`),
      fetch(`/api/entries/${key}/examples`),
    ]);
    currentEntry = await entryRes.json();
    const { forms }    = await formsRes.json();
    const { examples } = await examplesRes.json();

    renderEntry(currentEntry, forms ?? [], examples ?? []);
    rerenderEntryList(); // refresh active state
  }

  // Accent colour per category — gives the hero card a coloured left bar
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

  function renderEntry(e, forms, examples) {
    const panel = document.getElementById('panel-entry');
    const accent = catAccent[e.major_category] ?? 'var(--accent)';

    // ── Meta pills ─────────────────────────────────────────────────────
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

    // ── Stem variants ──────────────────────────────────────────────────
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

    // ── Tags ───────────────────────────────────────────────────────────
    const tagsHtml = (e.tags ?? []).length
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:20px">
           ${e.tags.map(t => `<span style="font-family:var(--font-mono);font-size:10px;background:var(--surface2);border:1px solid var(--border);padding:2px 7px;border-radius:4px;color:var(--text-muted)">${t}</span>`).join('')}
         </div>`
      : '';

    // ── Forms grid ─────────────────────────────────────────────────────
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

    // ── Examples ───────────────────────────────────────────────────────
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

  function renderStemVariants(svs) {
    if (!svs?.length) return '—';
    return svs.map(sv => `<code style="font-size:11px">${sv.label}: <em>${sv.form}</em></code>`).join(', ');
  }

  /**
   * Render a slot label (e.g. "PV.PERF.NMLZ" or "NEG-PV.PROG") as HTML
   * where each component is a hoverable .gtok span that shows its expansion
   * from the glossary on mouseover.
   *
   * Separators (. - =) are preserved as inert .gsep spans with no tooltip.
   */
  function renderSlotLabel(slot) {
    // Split on . - = keeping the separators themselves as tokens
    const parts = slot.split(/([.\-=])/);
    return parts.map(part => {
      if (/^[.\-=]$/.test(part)) {
        return `<span class="gsep">${part}</span>`;
      }
      const entry = glossary[part];
      if (!entry) {
        // Unknown abbreviation — still wrap so styling is consistent, but no tip
        return `<span class="gtok">${part}</span>`;
      }
      // Build tooltip text: expansion + domain hint if available
      const tip = entry.domain
        ? `${entry.expansion} (${entry.domain})`
        : entry.expansion;
      return `<span class="gtok" data-tip="${tip}">${part}</span>`;
    }).join('');
  }

  function renderTokens(tokens) {
    return tokens.map(t => {
      if (t.type === 'literal') return t.literal;
      if (t.type === 'form') return `<em>${t.key}.${t.slot}</em>`;
      if (t.type === 'morpheme') return `<em>${t.key}</em>`;
      return t.gloss ?? '';
    }).join(' ');
  }

  function renderGlossLine(tokens) {
    // Join gloss tokens with hyphens; each gloss value is itself passed
    // through renderSlotLabel so abbreviation components get tooltips.
    return tokens.map(t => {
      const raw = t.gloss ?? t.literal ?? t.key ?? '';
      return renderSlotLabel(raw);
    }).join('<span class="gsep">-</span>');
  }

  // ── Search & filter ──────────────────────────────────────────────────
  function search(q) {
    currentSearchQuery = q;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const trimmed = q.trim();
      if (!trimmed) {
        currentSearchResults = [];
        rerenderEntryList();
        return;
      }
      const r = await fetch(`/api/entries/suggest?q=${encodeURIComponent(trimmed)}`);
      const { suggestions } = await r.json();
      currentSearchResults = Array.isArray(suggestions) ? suggestions : [];
      rerenderEntryList();
    }, 200);
  }

  function applyFilters() {
    if (currentSearchQuery.trim()) {
      search(currentSearchQuery);
      return;
    }
    rerenderEntryList();
  }

  // ── Admin actions ────────────────────────────────────────────────────
  async function rebuild() {
    document.getElementById('btn-rebuild').disabled = true;
    document.getElementById('btn-rebuild').textContent = '⟳ Rebuilding…';
    try {
      const r = await fetch('/api/admin/rebuild', { method: 'POST' });
      const data = await r.json();
      if (data.ok) {
        toast('✓ Rebuilt: ' + data.counts.lexemes + ' lexemes, ' + data.counts.forms + ' forms', 'success');
        await loadStatus();
        await loadEntries();
      } else {
        toast('✗ ' + (data.errors?.[0]?.message ?? 'Rebuild failed'), 'error');
      }
    } catch { toast('✗ Server error', 'error'); }
    document.getElementById('btn-rebuild').disabled = false;
    document.getElementById('btn-rebuild').textContent = '⟳ Rebuild DB';
  }

  async function exportArtifacts() {
    document.getElementById('btn-export').disabled = true;
    document.getElementById('btn-export').textContent = '⬆ Exporting…';
    try {
      const r = await fetch('/api/admin/export', { method: 'POST' });
      const data = await r.json();
      if (data.ok) {
        toast('✓ Exported to TEMP/ (' + data.manifest.form_count + ' forms)', 'success');
      } else {
        toast('✗ Export failed', 'error');
      }
    } catch { toast('✗ Server error', 'error'); }
    document.getElementById('btn-export').disabled = false;
    document.getElementById('btn-export').textContent = '⬆ Export';
  }

  // ── Toast ────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3500);
  }

  // ── Sidebar tabs (Entries / Rules) ────────────────────────────────────
  let sidebarTab = 'entries';

  function switchSidebarTab(tab, btn) {
    sidebarTab = tab;
    document.querySelectorAll('.sidebar-tabs button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('sidebar-entries').style.display = tab === 'entries' ? 'flex' : 'none';
    document.getElementById('sidebar-rules').style.display   = tab === 'rules'   ? 'flex' : 'none';

    if (tab === 'rules') {
      // Show the rules panel in main, hide entry panels
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-rules').classList.add('active');
      loadRuleList();
    } else {
      // Return to entry view
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-welcome').classList.add('active');
      currentEntry = null;
    }
  }

  // ── Drawer ────────────────────────────────────────────────────────────
  let drawerMode = null; // 'new-entry' | 'edit-entry' | 'new-morpheme' | 'edit-morpheme' | 'new-rule' | 'edit-rule'
  let drawerKey  = null;

  function openDrawer() {
    document.getElementById('overlay').classList.add('show');
    document.getElementById('drawer').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('drawer').classList.remove('open');
    drawerMode = null;
    drawerKey  = null;
  }

  async function saveDrawer() {
    if (drawerMode === 'new-entry' || drawerMode === 'edit-entry') await saveEntry();
    else if (drawerMode === 'new-morpheme' || drawerMode === 'edit-morpheme') await saveMorpheme();
  }

  // ── Lemma key normalization ───────────────────────────────────────────
  // Replaces háček letters with digraphs, keeps accent marks, lowercases.
  function normalizeLemmaToKey(lemma) {
    return lemma
      .toLowerCase()
      .replace(/š/g, 'sh').replace(/č/g, 'ch').replace(/ž/g, 'zh')
      .replace(/đ/g, 'dj').replace(/ć/g, 'ch').replace(/ř/g, 'rz')
      .replace(/ě/g, 'e') .replace(/ñ/g, 'n')
      // keep a-z, accent marks, digits, hyphens; collapse everything else to hyphen
      .replace(/[^a-záéíóúýàèìòùāēīōūäëïöüãõ0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ── Entry editor (drawer) ─────────────────────────────────────────────
  function openEntryEditor(key) {
    drawerMode = key ? 'edit-entry' : 'new-entry';
    drawerKey  = key ?? null;
    document.getElementById('drawer-title').textContent = key ? `Edit: ${key}` : 'New Lexeme Entry';
    document.getElementById('drawer-delete-btn').style.display = key ? '' : 'none';
    document.getElementById('drawer-save-btn').textContent = 'Save';

    const entry = key ? (currentEntry?.key === key ? currentEntry : null) : null;
    const isEdit = !!key;
    document.getElementById('drawer-body').innerHTML = buildEntryForm(entry, isEdit);
    bindStemButtons();
    bindOverrideButtons();
    bindEntrySuggestionControls();
    bindLemmaAutofill(isEdit);
    if (entry?.template_id) setInflectionToggle('template');
    else if (entry?.inflection_profile) setInflectionToggle('profile');
    else setInflectionToggle('template');
    openDrawer();
  }

  function bindLemmaAutofill(isEdit) {
    const lemmaEl   = document.getElementById('ef-lemma');
    const displayEl = document.getElementById('ef-display-lemma');
    const keyEl     = document.getElementById('ef-key');
    if (!lemmaEl) return;

    // Track whether the user has manually touched the display lemma field
    let displayTouched = isEdit && !!displayEl?.value;
    displayEl?.addEventListener('input', () => { displayTouched = true; });

    lemmaEl.addEventListener('input', () => {
      const lemma = lemmaEl.value;

      // Auto-derive key from lemma (always readonly, so we just set .value)
      if (!isEdit && keyEl) keyEl.value = normalizeLemmaToKey(lemma);

      // Auto-fill display lemma only if not manually overridden
      if (!displayTouched && displayEl) displayEl.value = lemma;

      // Keep the auto-created base row in sync
      const baseRow = document.querySelector('#sv-list .dyn-row.sv[data-auto-base]');
      if (baseRow) {
        const formInput = baseRow.querySelectorAll('input')[1];
        if (formInput) formInput.value = lemma;
      }
    });
  }

  // ── Morpheme editor (drawer) ──────────────────────────────────────────
  function openMorphemeEditor(key) {
    drawerMode = key ? 'edit-morpheme' : 'new-morpheme';
    drawerKey  = key ?? null;
    document.getElementById('drawer-title').textContent = key ? `Edit morpheme: ${key}` : 'New Morpheme';
    document.getElementById('drawer-delete-btn').style.display = key ? '' : 'none';
    document.getElementById('drawer-save-btn').textContent = 'Save';

    // Use currentEntry if it matches; otherwise fall back to null (form renders empty)
    const entry = key ? (currentEntry?.key === key ? currentEntry : null) : null;
    document.getElementById('drawer-body').innerHTML = buildMorphemeForm(entry, !!key);
    bindAllomorphButtons();
    bindMorphemeTagControls();
    openDrawer();
  }

  function buildMorphemeForm(e, isEdit) {
    const selectedTags = e?.tags ?? [];
    const visibleTagSuggestions = [
      ...selectedTags,
      ...entrySuggestions.tags.filter((t) => !selectedTags.includes(t)),
    ].slice(0, 8);
    const activeTags = new Set(selectedTags);
    const tagOptions  = entrySuggestions.tags.map(t => `<option value="${esc(t)}"></option>`).join('');
    const tagChips    = visibleTagSuggestions.length
      ? visibleTagSuggestions.map(t => `<button type="button" class="suggestion-chip${activeTags.has(t)?' active':''}" data-tag-value="${esc(t)}">${esc(t)}</button>`).join('')
      : '<div class="suggestion-empty">No saved tags yet.</div>';

    // Gloss abbreviation suggestions — pulled from the loaded glossary
    const glossAbbrOptions = Object.keys(glossary)
      .sort()
      .map(k => `<option value="${esc(k)}">${esc(k)} — ${esc(glossary[k]?.expansion ?? '')}</option>`)
      .join('');

    // Slot suggestions — derive feature names from all paradigm cells
    const slotSet = new Set();
    for (const cat of Object.values(paradigmDefaults)) {
      for (const cell of [...(cat.cells ?? []), ...(cat.neg_cells ?? [])]) {
        for (const f of (cell.features ?? [])) {
          if (f.feature) slotSet.add(f.feature);
        }
      }
    }
    const slotOptions = [...slotSet].sort().map(s => `<option value="${esc(s)}"></option>`).join('');

    // Paradigm category suggestions — derive feature values (the dimension labels)
    const catSet = new Set(['case-system', 'TAM', 'voice', 'mood', 'definiteness', 'polarity', 'derivation']);
    const catOptions = [...catSet].sort().map(c => `<option value="${esc(c)}"></option>`).join('');

    // Gloss abbr placeholder — use actual Iridian abbreviations
    const glossAbbrExample = Object.keys(glossary).length
      ? Object.keys(glossary).slice(0, 3).join(', ')
      : 'DIR, TRS.DEF, PF';

    // Slot placeholder — use actual feature names from paradigm
    const slotExample = slotSet.size
      ? [...slotSet].slice(0, 3).join(', ')
      : 'case, aspect, voice';

    const allomorphRows = (e?.allomorph_rules ?? []).map(r =>
      `<div class="dyn-row ar">
        <input placeholder="conditioning context" value="${esc(r.context ?? '')}">
        <input placeholder="allomorph form" value="${esc(r.form ?? '')}">
        <input placeholder="condition tag" value="${esc(r.condition ?? '')}">
        <button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>
       </div>`).join('');

    return `
      <datalist id="mtag-suggestions">${tagOptions}</datalist>
      <datalist id="mgloss-abbr-suggestions">${glossAbbrOptions}</datalist>
      <datalist id="mslot-suggestions">${slotOptions}</datalist>
      <datalist id="mcat-suggestions">${catOptions}</datalist>

      <div class="ed-section">Identity</div>
      <div class="field-row2">
        <div class="field">
          <label>Key</label>
          <input type="text" id="mf-key" value="${esc(e?.key)}" ${isEdit?'readonly':''} placeholder="e.g. DIR, TRS.DEF">
        </div>
        <div class="field">
          <label>Status</label>
          <select id="mf-status">
            ${['active','draft','deprecated'].map(s=>`<option${e?.status===s?' selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row2">
        <div class="field">
          <label>Lemma <span class="opt">(base form)</span></label>
          <input type="text" id="mf-lemma" value="${esc(e?.lemma)}" placeholder="e.g. -ot, zá-">
        </div>
        <div class="field">
          <label>Display lemma</label>
          <input type="text" id="mf-display-lemma" value="${esc(e?.display_lemma)}" placeholder="e.g. -ot, zá-">
        </div>
      </div>
      <div class="field-row2">
        <div class="field">
          <label>Type</label>
          <select id="mf-category">
            ${['suffix','prefix','infix','circumfix','particle','clitic'].map(c=>`<option value="${c}"${(e?.major_category??'suffix')===c?' selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Subtype</label>
          <input type="text" id="mf-subtype" value="${esc(e?.subtype)}" placeholder="e.g. case-suffix, voice-prefix">
        </div>
      </div>

      <div class="ed-section">Gloss &amp; Slot</div>
      <div class="field-row2">
        <div class="field">
          <label>Display form</label>
          <input type="text" id="mf-display-form" value="${esc(e?.display_form)}" placeholder="e.g. -ot, zá-">
        </div>
        <div class="field">
          <label>Gloss abbreviation</label>
          <input type="text" id="mf-gloss-abbr" list="mgloss-abbr-suggestions" value="${esc(e?.gloss_abbr)}" placeholder="e.g. ${esc(glossAbbrExample)}">
        </div>
      </div>
      <div class="field-row2">
        <div class="field">
          <label>Slot <span class="opt">(feature dimension)</span></label>
          <input type="text" id="mf-slot" list="mslot-suggestions" value="${esc(e?.slot)}" placeholder="e.g. ${esc(slotExample)}">
        </div>
        <div class="field">
          <label>Paradigm category</label>
          <input type="text" id="mf-paradigm-cat" list="mcat-suggestions" value="${esc(e?.category)}" placeholder="e.g. case-system, TAM, voice">
        </div>
      </div>

      <div class="ed-section">Content</div>
      <div class="field">
        <label>Glosses <span class="opt">(one per line)</span></label>
        <textarea id="mf-glosses" rows="3">${(e?.glosses ?? []).join('\n')}</textarea>
      </div>
      <div class="field">
        <label>Notes <span class="opt">(optional)</span></label>
        <textarea id="mf-notes">${esc(e?.notes)}</textarea>
      </div>
      <div class="field">
        <label>Tags <span class="opt">(comma-separated)</span></label>
        <div class="field-group">
          <input type="text" id="mf-tags" list="mtag-suggestions" value="${selectedTags.join(', ')}" placeholder="e.g. case, nominal">
          <div class="suggestion-chips" id="morpheme-tag-chips">${tagChips}</div>
        </div>
      </div>

      <div class="ed-section">Allomorph Rules
        <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted);margin-left:8px">conditioning environments</span>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 26px;gap:5px;margin-bottom:4px">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);padding-left:4px">Context</span>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);padding-left:4px">Form</span>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);padding-left:4px">Condition tag</span>
        <span></span>
      </div>
      <div class="dyn-list" id="ar-list">${allomorphRows}</div>
      <button class="add-row-btn" id="add-ar">+ Add allomorph rule</button>
    `;
  }

  function bindAllomorphButtons() {
    document.getElementById('add-ar').onclick = () => {
      const row = document.createElement('div');
      row.className = 'dyn-row ar';
      row.innerHTML = `
        <input placeholder="context (e.g. stem ends in vowel)">
        <input placeholder="form (e.g. -ra)">
        <input placeholder="condition tag">
        <button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>`;
      document.getElementById('ar-list').appendChild(row);
    };
  }

  function bindMorphemeTagControls() {
    const input = document.getElementById('mf-tags');
    const syncChips = () => {
      const active = new Set(getMorphemeTags());
      document.querySelectorAll('#morpheme-tag-chips [data-tag-value]').forEach(c =>
        c.classList.toggle('active', active.has(c.dataset.tagValue)));
    };
    input?.addEventListener('input', syncChips);
    input?.addEventListener('change', () => {
      syncMorphemeTagInput(getMorphemeTags());
      syncChips();
    });
    document.querySelectorAll('#morpheme-tag-chips [data-tag-value]').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.tagValue;
        const next = new Set(getMorphemeTags());
        next.has(val) ? next.delete(val) : next.add(val);
        syncMorphemeTagInput([...next].sort((a,b)=>a.localeCompare(b)));
        syncChips();
      });
    });
    syncChips();
  }

  function getMorphemeTags() {
    const input = document.getElementById('mf-tags');
    if (!input) return [];
    return [...new Set(input.value.split(',').map(s=>s.trim()).filter(Boolean))];
  }

  function syncMorphemeTagInput(tags) {
    const input = document.getElementById('mf-tags');
    if (input) input.value = tags.join(', ');
  }

  function collectMorphemeForm() {
    const glosses = document.getElementById('mf-glosses').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const arRows = [...document.querySelectorAll('#ar-list .dyn-row.ar')].map(row => {
      const inputs = [...row.querySelectorAll('input')].map(i => i.value.trim());
      const [context, form, condition] = inputs;
      if (!context && !form) return null;
      const rule = { context: context || '', form: form || '' };
      if (condition) rule.condition = condition;
      return rule;
    }).filter(Boolean);

    const key = document.getElementById('mf-key').value.trim();
    return {
      schema_version: '1.0',
      entry_kind: 'morpheme',
      id: key.replace(/[^a-zA-Z0-9_-]/g, '-'),
      key,
      lemma: document.getElementById('mf-lemma').value.trim(),
      display_lemma: document.getElementById('mf-display-lemma').value.trim(),
      major_category: document.getElementById('mf-category').value,
      subtype: document.getElementById('mf-subtype').value.trim(),
      glosses,
      notes: document.getElementById('mf-notes').value.trim(),
      tags: getMorphemeTags(),
      status: document.getElementById('mf-status').value,
      display_form: document.getElementById('mf-display-form').value.trim(),
      gloss_abbr: document.getElementById('mf-gloss-abbr').value.trim(),
      slot: document.getElementById('mf-slot').value.trim(),
      category: document.getElementById('mf-paradigm-cat').value.trim(),
      allomorph_rules: arRows,
    };
  }

  async function saveMorpheme() {
    const btn = document.getElementById('drawer-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const isEdit = drawerMode === 'edit-morpheme';
      const payload = collectMorphemeForm();
      if (!payload.key) { alert('Key is required'); return; }
      const url = isEdit ? `/api/entries/${drawerKey}` : '/api/entries';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { alert('Error: ' + (data.error ?? JSON.stringify(data))); return; }
      toast(`✓ ${isEdit ? 'Updated' : 'Created'}: ${payload.key}`, 'success');
      closeDrawer();
      await Promise.all([loadEntries(), loadMorphemes()]);
      await loadStatus();
      if (data.key) selectEntry(data.key);
    } catch(err) {
      toast('✗ ' + String(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }

  function buildEntryForm(e, isEdit) {
    const selectedTags = e?.tags ?? [];
    const visibleTagSuggestions = [
      ...selectedTags,
      ...entrySuggestions.tags.filter((tag) => !selectedTags.includes(tag)),
    ].slice(0, 8);
    // Build stem variant rows; for new entries pre-add a 'base' row
    const existingSv = e?.stem_variants ?? [];
    const svRows = existingSv.length
      ? existingSv.map(s => makeSvRowHtml(s.label, s.form, false)).join('')
      : makeSvRowHtml('base', e?.lemma ?? '', true);  // pre-filled base for new entries
    const mo = Object.entries(e?.manual_overrides ?? {}).map(([slot, form]) =>
      `<div class="dyn-row mo">
        <input placeholder="slot (e.g. GEN.PL)" value="${esc(slot)}">
        <input placeholder="form" value="${esc(form)}">
        <button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>
       </div>`).join('');
    const tagOptions = entrySuggestions.tags.map((tag) => `<option value="${esc(tag)}"></option>`).join('');
    const templateOptions = entrySuggestions.templates
      .map((template) => `<option value="${esc(template.key)}">${esc(template.label)}</option>`)
      .join('');
    const profileOptions = entrySuggestions.profiles
      .map((profile) => `<option value="${esc(profile.value)}"></option>`)
      .join('');
    const activeTags = new Set(selectedTags);
    const tagChips = visibleTagSuggestions.length
      ? visibleTagSuggestions.map((tag) => `
          <button type="button" class="suggestion-chip${activeTags.has(tag) ? ' active' : ''}" data-tag-value="${esc(tag)}">${esc(tag)}</button>
        `).join('')
      : '<div class="suggestion-empty">No saved tags yet.</div>';
    const templateChips = entrySuggestions.templates.length
      ? entrySuggestions.templates.map((template) => `
          <button
            type="button"
            class="suggestion-chip${e?.template_id === template.key ? ' active' : ''}"
            data-template-value="${esc(template.key)}"
            title="${esc(template.name)}"
          >${esc(template.friendly_name || template.name)}</button>
        `).join('')
      : '<div class="suggestion-empty">No template rules found.</div>';
    const profileChips = entrySuggestions.profiles.length
      ? entrySuggestions.profiles.map((profile) => `
          <button
            type="button"
            class="suggestion-chip${e?.inflection_profile === profile.value ? ' active' : ''}"
            data-profile-value="${esc(profile.value)}"
          >${esc(profile.value)}<span class="meta">${profile.usage_count}</span></button>
        `).join('')
      : '<div class="suggestion-empty">No saved profiles yet.</div>';

    return `
      <datalist id="tag-suggestions">${tagOptions}</datalist>
      <datalist id="template-suggestions">${templateOptions}</datalist>
      <datalist id="profile-suggestions">${profileOptions}</datalist>

      <div class="ed-section">Identity</div>
      <div class="field-row2">
        <div class="field">
          <label>Key <span class="opt">(auto-generated from lemma)</span></label>
          <input type="text" id="ef-key" value="${esc(e?.key)}" readonly placeholder="derived from lemma" style="opacity:0.7;cursor:default">
        </div>
        <div class="field">
          <label>Status</label>
          <select id="ef-status">
            ${['active','draft','deprecated'].map(s => `<option${e?.status===s?' selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row2">
        <div class="field">
          <label>Lemma <span class="opt">(machine)</span></label>
          <input type="text" id="ef-lemma" value="${esc(e?.lemma)}" placeholder="e.g. piašt">
        </div>
        <div class="field">
          <label>Display lemma</label>
          <input type="text" id="ef-display-lemma" value="${esc(e?.display_lemma)}" placeholder="e.g. piašt-">
        </div>
      </div>
      <div class="field-row2">
        <div class="field">
          <label>Category</label>
          <select id="ef-category">
            ${['noun','verb','modifier','function-word','postposition'].map(c => `<option value="${c}"${e?.major_category===c?' selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Subtype</label>
          <input type="text" id="ef-subtype" value="${esc(e?.subtype)}" placeholder="e.g. common, transitive">
        </div>
      </div>

      <div class="ed-section">Content</div>
      <div class="field">
        <label>Glosses <span class="opt">(one per line)</span></label>
        <textarea id="ef-glosses" rows="3">${(e?.glosses ?? []).join('\n')}</textarea>
      </div>
      <div class="field">
        <label>Notes <span class="opt">(optional)</span></label>
        <textarea id="ef-notes">${esc(e?.notes)}</textarea>
      </div>
      <div class="field">
        <label>Tags <span class="opt">(comma-separated)</span></label>
        <div class="field-group">
          <input type="text" id="ef-tags" list="tag-suggestions" value="${(e?.tags ?? []).join(', ')}" placeholder="e.g. motion, transitive">
          <div class="suggestion-chips" id="entry-tag-chips">${tagChips}</div>
          ${entrySuggestions.tags.length > visibleTagSuggestions.length
            ? `<div class="hint">Showing top ${visibleTagSuggestions.length} tags. Keep typing to use the full list.</div>`
            : ''}
        </div>
      </div>

      <div class="ed-section">Inflection</div>
      <div class="toggle-row" id="inflection-toggle" style="margin-bottom:8px">
        <button id="toggle-template" onclick="App.setInflectionToggle('template')">Template ID</button>
        <button id="toggle-profile"  onclick="App.setInflectionToggle('profile')">Profile (invariant)</button>
      </div>
      <div id="inflection-template-field" class="field">
        <label>Template ID <span class="opt">(inflection rule key)</span></label>
        <div class="field-group">
          <input type="text" id="ef-template-id" list="template-suggestions" value="${esc(e?.template_id)}" placeholder="e.g. noun-class-a">
          <div class="suggestion-chips" id="entry-template-chips">${templateChips}</div>
        </div>
      </div>
      <div id="inflection-profile-field" class="field" style="display:none">
        <label>Inflection profile</label>
        <div class="field-group">
          <input type="text" id="ef-inflection-profile" list="profile-suggestions" value="${esc(e?.inflection_profile)}" placeholder="e.g. invariant, uninflected-modifier">
          <div class="suggestion-chips" id="entry-profile-chips">${profileChips}</div>
        </div>
      </div>

      <div class="ed-section">Stem Variants</div>
      <div class="dyn-list" id="sv-list">${svRows}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        <button class="add-row-btn" id="add-sv">+ Add</button>
        <button class="add-row-btn" id="add-sv-reduced" title="Adds a 'reduced' stem variant">+ Reduced</button>
        <button class="add-row-btn" id="add-sv-reduced-hs" title="Adds 'reduced-hard' and 'reduced-soft' stem variants">+ Reduced (hard &amp; soft)</button>
      </div>

      <div class="ed-section">Manual Overrides</div>
      <div class="dyn-list" id="mo-list">${mo}</div>
      <button class="add-row-btn" id="add-mo">+ Add override</button>
      <div class="hint" style="margin-top:4px;font-size:11px;color:var(--text-muted)">Override a specific slot with a hand-authored form.</div>
    `;
  }

  function makeSvRowHtml(label, form, isAutoBase) {
    return `<div class="dyn-row sv"${isAutoBase ? ' data-auto-base="true"' : ''}>
      <input placeholder="label (e.g. base)" value="${esc(label)}">
      <input placeholder="form" value="${esc(form)}">
      <button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>
    </div>`;
  }

  function addSvRow(label = '', form = '', isAutoBase = false) {
    if (label) {
      const dupe = [...document.querySelectorAll('#sv-list .dyn-row.sv input:first-child')]
        .some(i => i.value.trim() === label);
      if (dupe) { toast(`Stem variant "${label}" already exists`, 'error'); return false; }
    }
    const row = document.createElement('div');
    row.className = 'dyn-row sv';
    if (isAutoBase) row.dataset.autoBase = 'true';
    row.innerHTML = `<input placeholder="label (e.g. base)" value="${esc(label)}"><input placeholder="form" value="${esc(form)}"><button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>`;
    document.getElementById('sv-list').appendChild(row);
    return true;
  }

  function bindStemButtons() {
    document.getElementById('add-sv').onclick = () => addSvRow();

    document.getElementById('add-sv-reduced').onclick = () => {
      addSvRow('reduced', '');
    };

    document.getElementById('add-sv-reduced-hs').onclick = () => {
      addSvRow('reduced-hard', '');
      addSvRow('reduced-soft', '');
    };
  }

  function bindOverrideButtons() {
    document.getElementById('add-mo').onclick = () => {
      const row = document.createElement('div');
      row.className = 'dyn-row mo';
      row.innerHTML = `<input placeholder="slot (e.g. GEN.PL)"><input placeholder="form"><button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>`;
      document.getElementById('mo-list').appendChild(row);
    };
  }

  function getNormalizedTags() {
    const input = document.getElementById('ef-tags');
    if (!input) return [];
    return [...new Set(
      input.value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    )];
  }

  function syncTagInputFromSet(tags) {
    const input = document.getElementById('ef-tags');
    if (!input) return;
    input.value = tags.join(', ');
  }

  function syncTagChipState() {
    const active = new Set(getNormalizedTags());
    document.querySelectorAll('[data-tag-value]').forEach((chip) => {
      chip.classList.toggle('active', active.has(chip.dataset.tagValue));
    });
  }

  function syncTemplateChipState() {
    const current = document.getElementById('ef-template-id')?.value.trim() ?? '';
    document.querySelectorAll('[data-template-value]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.templateValue === current);
    });
  }

  function syncProfileChipState() {
    const current = document.getElementById('ef-inflection-profile')?.value.trim() ?? '';
    document.querySelectorAll('[data-profile-value]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.profileValue === current);
    });
  }

  function bindEntrySuggestionControls() {
    const tagsInput = document.getElementById('ef-tags');
    tagsInput?.addEventListener('input', syncTagChipState);
    tagsInput?.addEventListener('change', () => {
      syncTagInputFromSet(getNormalizedTags());
      syncTagChipState();
    });

    document.querySelectorAll('[data-tag-value]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const value = chip.dataset.tagValue;
        if (!value) return;
        const next = new Set(getNormalizedTags());
        if (next.has(value)) next.delete(value);
        else next.add(value);
        syncTagInputFromSet([...next].sort((a, b) => a.localeCompare(b)));
        syncTagChipState();
      });
    });

    const templateInput = document.getElementById('ef-template-id');
    templateInput?.addEventListener('input', syncTemplateChipState);
    templateInput?.addEventListener('change', syncTemplateChipState);
    document.querySelectorAll('[data-template-value]').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!templateInput) return;
        templateInput.value = chip.dataset.templateValue ?? '';
        setInflectionToggle('template');
        syncTemplateChipState();
      });
    });

    const profileInput = document.getElementById('ef-inflection-profile');
    profileInput?.addEventListener('input', syncProfileChipState);
    profileInput?.addEventListener('change', syncProfileChipState);
    document.querySelectorAll('[data-profile-value]').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!profileInput) return;
        profileInput.value = chip.dataset.profileValue ?? '';
        setInflectionToggle('profile');
        syncProfileChipState();
      });
    });

    syncTagChipState();
    syncTemplateChipState();
    syncProfileChipState();
  }

  function setInflectionToggle(mode) {
    document.getElementById('toggle-template').classList.toggle('active', mode === 'template');
    document.getElementById('toggle-profile').classList.toggle('active', mode === 'profile');
    document.getElementById('inflection-template-field').style.display = mode === 'template' ? '' : 'none';
    document.getElementById('inflection-profile-field').style.display  = mode === 'profile'  ? '' : 'none';
  }

  function collectEntryForm() {
    const glosses = document.getElementById('ef-glosses').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const tags    = getNormalizedTags();

    const svRows = [...document.querySelectorAll('#sv-list .dyn-row.sv')].map(row => {
      const [l, f] = [...row.querySelectorAll('input')].map(i => i.value.trim());
      return l && f ? { label: l, form: f } : null;
    }).filter(Boolean);

    const moRows = [...document.querySelectorAll('#mo-list .dyn-row.mo')];
    const overrides = {};
    moRows.forEach(row => {
      const [slot, form] = [...row.querySelectorAll('input')].map(i => i.value.trim());
      if (slot && form) overrides[slot] = form;
    });

    const useTemplate = document.getElementById('toggle-template').classList.contains('active');
    const payload = {
      schema_version: '1.0',
      entry_kind: 'lexeme',
      id: document.getElementById('ef-key').value.trim(),
      key: document.getElementById('ef-key').value.trim(),
      lemma: document.getElementById('ef-lemma').value.trim(),
      display_lemma: document.getElementById('ef-display-lemma').value.trim(),
      major_category: document.getElementById('ef-category').value,
      subtype: document.getElementById('ef-subtype').value.trim() || 'common',
      glosses,
      notes: document.getElementById('ef-notes').value.trim(),
      tags,
      status: document.getElementById('ef-status').value,
      stem_variants: svRows,
      manual_overrides: overrides,
    };
    if (useTemplate) {
      payload.template_id = document.getElementById('ef-template-id').value.trim();
    } else {
      payload.inflection_profile = document.getElementById('ef-inflection-profile').value.trim();
    }
    return payload;
  }

  async function saveEntry() {
    const btn = document.getElementById('drawer-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const payload = collectEntryForm();
      if (!payload.key) { toast('Key is required', 'error'); return; }
      if (!payload.glosses.length) { toast('At least one gloss is required', 'error'); return; }

      const isEdit = drawerMode === 'edit-entry';
      const url  = isEdit ? `/api/entries/${drawerKey}` : '/api/entries';
      const method = isEdit ? 'PUT' : 'POST';

      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();

      if (!r.ok) {
        const msg = data.errors?.map(e => e.message).join('; ') ?? data.error ?? 'Save failed';
        toast('✗ ' + msg, 'error');
        return;
      }

      toast(`✓ ${isEdit ? 'Updated' : 'Created'}: ${payload.key}`, 'success');
      closeDrawer();
      await loadEntrySuggestions();
      await Promise.all([loadEntries(), loadMorphemes()]);
      await loadStatus();
      if (data.key) selectEntry(data.key);
    } catch(err) {
      toast('✗ ' + String(err), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save';
    }
  }

  async function deleteCurrentEntry() {
    if (!drawerKey) return;
    if (!confirm(`Delete "${drawerKey}"? This removes the YAML file and cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/entries/${drawerKey}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) { toast('✗ ' + (data.error ?? 'Delete failed'), 'error'); return; }
      toast(`✓ Deleted: ${drawerKey}`, 'success');
      closeDrawer();
      currentEntry = null;
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-welcome').classList.add('active');
      await loadEntrySuggestions();
      await Promise.all([loadEntries(), loadMorphemes()]);
      await loadStatus();
    } catch(err) { toast('✗ ' + String(err), 'error'); }
  }

  // ── Rules management ─────────────────────────────────────────────────
  let allRules = [];
  let currentRuleKey = null;
  let negPrefix = 'zá';
  let showNegativeLines = false;

  async function loadRuleList() {
    try {
      const r = await fetch('/api/rules?kind=inflection');
      const { rules } = await r.json();
      allRules = rules ?? [];
      renderRuleList(allRules);
    } catch { renderRuleList([]); }
  }

  function renderRuleList(rules) {
    const el = document.getElementById('rule-list');
    if (!rules.length) {
      el.innerHTML = '<div class="empty-state" style="height:160px"><p>No inflection rules yet</p></div>';
      return;
    }
    el.innerHTML = rules.map(r => {
      const d = r.data ?? r;
      const cellCount = (d.cells ?? []).length;
      const displayName = getRuleDisplayName(d);
      return `<div class="entry-item${currentRuleKey===d.key?' active':''}" onclick="App.selectRule('${d.key}')">
        <div class="key">${esc(displayName)}</div>
        <div class="lemma" style="font-style:normal">${esc(d.name ?? '')}</div>
        <div class="gloss"><span style="font-family:var(--font-mono)">${esc(d.key)}</span> · ${cellCount} cell${cellCount!==1?'s':''} · ${esc(d.category ?? '')}</div>
      </div>`;
    }).join('');

    // Also render the inner rules list (rules panel left column)
    const inner = document.getElementById('rules-list-inner');
    if (inner) inner.innerHTML = el.innerHTML;
  }

  function filterRuleList(q) {
    const filtered = q
      ? allRules.filter(r => {
          const d = r.data ?? r;
          return (d.key + (d.friendly_name ?? '') + d.name + d.category + '').toLowerCase().includes(q.toLowerCase());
        })
      : allRules;
    renderRuleList(filtered);
  }

  async function selectRule(key) {
    currentRuleKey = key;
    showAllRuleEntries = false;
    await loadSelectedRule(key);
  }

  async function loadSelectedRule(key) {
    renderRuleList(allRules); // refresh active state
    try {
      const [ruleRes, entriesRes] = await Promise.all([
        fetch(`/api/rules/${key}`),
        fetch(`/api/rules/${key}/entries`),
      ]);
      const ruleRow = await ruleRes.json();
      const entriesRow = await entriesRes.json();
      const rule = ruleRow.data ?? ruleRow;
      renderRuleEditor(rule, true, entriesRow.entries ?? []);
    } catch(err) { toast('✗ ' + String(err), 'error'); }
  }

  function openRuleEditor(key) {
    currentRuleKey = key ?? null;
    showAllRuleEntries = false;
    if (key) {
      selectRule(key);
    } else {
      renderRuleEditor(null, false, []);
    }
    // Ensure rules panel is visible
    if (sidebarTab !== 'rules') switchSidebarTab('rules', document.getElementById('stab-rules'));
  }

  function renderRuleEditor(rule, isEdit, linkedEntries = []) {
    const col = document.getElementById('rules-editor-col');
    const cells = rule?.cells ?? [];
    const displayName = getRuleDisplayName(rule);
    const visibleEntries = showAllRuleEntries ? linkedEntries : linkedEntries.slice(0, 30);
    const hasMoreEntries = linkedEntries.length > 30;
    syncVerbQuickFillState(rule);

    const cellRows = cells.map((c) => buildCellRow(c, {
      isNegDefault: (rule?.category ?? 'noun') === 'verb' && isDefaultNegCell(c),
    })).join('');

    col.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <h2 style="font-size:15px;font-weight:600;flex:1">${isEdit ? 'Edit Rule: ' + displayName : 'New Inflection Rule'}</h2>
        ${isEdit ? `<button onclick="App.deleteRule('${rule?.key}')" style="background:transparent;border:1px solid var(--red);color:var(--red);padding:4px 10px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans)">Delete</button>` : ''}
        <button onclick="App.saveRule(${isEdit})" style="background:var(--accent);border:none;color:#0f1117;padding:5px 14px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans);font-weight:600" id="rule-save-btn">Save Rule</button>
      </div>

      <div class="section-header">Identity</div>
      <div class="field-row2" style="margin-bottom:10px">
        <div class="field">
          <label>Key</label>
          <input type="text" id="rf-key" value="${esc(rule?.key)}" ${isEdit?'readonly':''} placeholder="e.g. noun-class-a">
        </div>
        <div class="field">
          <label>Category</label>
          <select id="rf-category" onchange="App.onRuleCategoryChange(this.value)">
            ${['noun','verb','modifier','function-word','postposition'].map(c=>`<option value="${c}"${rule?.category===c?' selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Friendly Name <span class="opt">(optional, shown in the app)</span></label>
        <input type="text" id="rf-friendly-name" value="${esc(rule?.friendly_name)}" placeholder="e.g. Class I">
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Name</label>
        <input type="text" id="rf-name" value="${esc(rule?.name)}" placeholder="e.g. Class A nouns (regular)">
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Description <span class="opt">(optional)</span></label>
        <textarea id="rf-description" rows="2">${esc(rule?.description)}</textarea>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Inherits <span class="opt">(comma-separated rule keys)</span></label>
        <input type="text" id="rf-inherits" value="${(rule?.inherits??[]).join(', ')}" placeholder="e.g. base-noun-class">
      </div>

      ${isEdit ? `
        <div class="section-header">Linked Words <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted)">(${linkedEntries.length})</span></div>
        <div style="margin-bottom:16px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)">
          ${linkedEntries.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:8px">
                ${visibleEntries.map((entry) => `
                  <button
                    type="button"
                    onclick="App.selectEntry('${entry.key}')"
                    style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);color:var(--text);cursor:pointer;font:inherit">
                    <span style="font-weight:600">${esc(entry.display_lemma)}</span>
                    <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(entry.key)}</span>
                  </button>
                `).join('')}
              </div>
              ${hasMoreEntries
                ? `<div style="margin-top:12px">
                    <button
                      type="button"
                      onclick="App.toggleRuleEntries()"
                      style="background:transparent;border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans)">
                      ${showAllRuleEntries ? 'Show first 30' : `View all ${linkedEntries.length}`}
                    </button>
                  </div>`
                : ''}`
            : `<div style="font-size:12px;color:var(--text-muted)">No lexemes currently use this rule.</div>`
          }
        </div>
      ` : ''}

      <div class="section-header">Paradigm Cells</div>

      <!-- Quick-fill bar: shown for noun and verb only -->
      <div id="rf-quickfill" style="margin-bottom:10px">
        <!-- Noun quick-fill -->
        <div id="rf-qf-noun" style="display:${(rule?.category??'noun')==='noun'?'flex':'none'};gap:8px;align-items:center;flex-wrap:wrap">
          <button onclick="App.fillParadigm('noun')"
            style="background:var(--surface2);border:1px solid var(--accent);color:var(--accent);padding:4px 12px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans);font-weight:600">
            ⚡ Fill noun paradigm
          </button>
          <span style="font-size:11px;color:var(--text-muted)">Appends DIR TRS IND + DEF variants from settings</span>
        </div>

        <!-- Verb quick-fill + NEG prefix radio -->
        <div id="rf-qf-verb" style="display:${(rule?.category??'noun')==='verb'?'block':'none'}">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
            <button onclick="App.fillParadigm('verb')"
              style="background:var(--surface2);border:1px solid var(--accent);color:var(--accent);padding:4px 12px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans);font-weight:600">
              ⚡ Fill verb paradigm
            </button>
            <button
              type="button"
              id="neg-lines-visibility-btn"
              onclick="App.toggleNegativeLines(this)"
              style="background:transparent;border:1px solid var(--border);color:var(--text);padding:4px 12px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans)">
              ${showNegativeLines ? 'Hide negative lines' : 'Show negative lines'}
            </button>
            <span style="font-size:11px;color:var(--text-muted)">Adds the default paradigm now and keeps NEG lines hidden until you want to review them.</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);white-space:nowrap">NEG prefix</span>
            <div id="neg-prefix-toggle" class="toggle-row" style="width:auto;flex:0 0 auto">
              ${buildNegPrefixButtons(rule?.category)}
            </div>
          </div>
        </div>
      </div>

      <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        Features: <code style="font-family:var(--font-mono)">case:DIR, definiteness:DEF</code> &nbsp;·&nbsp;
        Prefix/suffix: hyphens stripped automatically (e.g. <code style="font-family:var(--font-mono)">-a</code> → <code style="font-family:var(--font-mono)">a</code>)
      </p>
      ${buildFeatureDatalist()}
      <div class="cell-col-heads">
        <span>Slot</span><span>Prefix</span><span>Suffix</span><span>Stem var</span><span>Features</span><span></span>
      </div>
      <div class="dyn-list" id="cells-list">${cellRows}</div>
      <button class="add-row-btn" onclick="App.addCellRow()">+ Add cell</button>

      <div class="section-header" style="margin-top:16px">Notes &amp; Tags</div>
      <div class="field" style="margin-bottom:8px">
        <label>Notes <span class="opt">(optional)</span></label>
        <textarea id="rf-notes" rows="2">${esc(rule?.notes)}</textarea>
      </div>
      <div class="field">
        <label>Tags <span class="opt">(comma-separated)</span></label>
        <input type="text" id="rf-tags" value="${(rule?.tags??[]).join(', ')}" placeholder="e.g. noun, agglutinative">
      </div>
    `;

    applyNegativeLineVisibility();
    // Wire morpheme autocomplete after the cells-list is in the DOM
    initCellAutocomplete();
  }

  // Build a <datalist> of feature bundle suggestions from paradigm-defaults cells
  function buildFeatureDatalist() {
    const seen = new Set();
    const options = [];
    for (const cat of Object.values(paradigmDefaults)) {
      for (const cell of [...(cat.cells ?? []), ...(cat.neg_cells ?? [])]) {
        const feats = (cell.features ?? []);
        if (!feats.length) continue;
        const str = feats.map(f => `${f.feature}:${f.value}`).join(', ');
        if (!seen.has(str)) {
          seen.add(str);
          options.push(`<option value="${esc(str)}"></option>`);
        }
      }
    }
    if (!options.length) return '';
    return `<datalist id="cell-feat-suggestions">${options.join('')}</datalist>`;
  }

  function buildCellRow(c, opts = {}) {
    const featsStr = (c?.features ?? []).map(f => `${f.feature}:${f.value}`).join(', ');
    return `<div class="dyn-row cell"${opts.isNegDefault ? ' data-neg-default="true"' : ''}>
      <input placeholder="slot e.g. NOM.SG" value="${esc(c?.slot)}" title="Slot label">
      <input placeholder="prefix" value="${esc(c?.prefix)}" title="Prefix (optional)">
      <input placeholder="suffix e.g. -a" value="${esc(c?.suffix)}" title="Suffix">
      <input placeholder="base" value="${esc(c?.stem_variant)}" title="Stem variant (defaults to 'base')">
      <input placeholder="case:DIR, definiteness:DEF" value="${featsStr}" title="Feature bundle" list="cell-feat-suggestions">
      <button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>
    </div>`;
  }

  // ── Paradigm quick-fill ───────────────────────────────────────────────
  const DEFAULT_NEG_PREFIX = 'zá';

  function getVerbDefaultDef() {
    return paradigmDefaults?.verb ?? {};
  }

  function getVerbNegCells() {
    return getVerbDefaultDef().neg_cells ?? [];
  }

  function getVerbNegSlotSet() {
    return new Set(getVerbNegCells().map(c => c.slot));
  }

  function isDefaultNegCell(cell) {
    return !!cell?.slot && getVerbNegSlotSet().has(cell.slot);
  }

  function inferNegPrefixFromRule(rule) {
    const cells = rule?.cells ?? [];
    const negRows = cells.filter(isDefaultNegCell);
    const prefixes = [...new Set(negRows.map(c => (c?.prefix ?? '').trim()).filter(Boolean))];
    if (prefixes.length === 1 && (prefixes[0] === 'zá' || prefixes[0] === 'zad')) return prefixes[0];
    return DEFAULT_NEG_PREFIX;
  }

  function syncVerbQuickFillState(rule) {
    showNegativeLines = false;
    negPrefix = inferNegPrefixFromRule(rule);
  }

  function buildNegPrefixButtons(category) {
    if (category !== 'verb') return '';
    // Build buttons from paradigmDefaults if available; fall back to hardcoded defaults
    const verbDef = paradigmDefaults?.verb;
    const negPrefixes = verbDef?.neg_prefixes ?? [
      { value: 'zá',  label: 'zá (standard)' },
      { value: 'zad', label: 'zad (variant)'  },
    ];
    const opts = [...negPrefixes, { value: null, label: 'Irregular' }];
    return opts.map((o) =>
      `<button class="${o.value === negPrefix ? 'active' : (o.value === null && negPrefix === null ? 'active' : '')}"
        onclick="App.setNegPrefix(${o.value===null?'null':`'${o.value}'`}, this)"
        style="padding:5px 12px;font-size:11px;white-space:nowrap">${o.label}</button>`
    ).join('');
  }

  function getDefaultNegRows() {
    return [...document.querySelectorAll('#cells-list .dyn-row.cell[data-neg-default="true"]')];
  }

  function applyNegativeLineVisibility() {
    getDefaultNegRows().forEach((row) => {
      if (showNegativeLines) row.style.removeProperty('display');
      else row.style.display = 'none';
    });
    const btn = document.getElementById('neg-lines-visibility-btn');
    if (btn) btn.textContent = showNegativeLines ? 'Hide negative lines' : 'Show negative lines';
  }

  function createCellRowElement(cell, opts = {}) {
    const row = document.createElement('div');
    row.innerHTML = buildCellRow(cell, opts);
    return row.firstElementChild;
  }

  // ── Morpheme autocomplete ─────────────────────────────────────────────
  // A single shared floating dropdown anchored to whichever prefix/suffix
  // input is currently focused inside #cells-list.

  let _acDrop = null;         // the dropdown DOM element
  let _acActiveInput = null;  // input currently being autocompleted
  let _acFocusIdx = -1;       // keyboard-nav index

  function getAcDrop() {
    if (!_acDrop) {
      _acDrop = document.createElement('div');
      _acDrop.className = 'morpheme-ac-drop';
      _acDrop.style.display = 'none';
      document.body.appendChild(_acDrop);

      // Mouse clicks on items
      _acDrop.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.ac-item');
        if (!item) return;
        e.preventDefault();
        acCommit(item.dataset.form);
      });
    }
    return _acDrop;
  }

  function acOpen(input) {
    _acActiveInput = input;
    acUpdate();
  }

  function acClose() {
    const drop = getAcDrop();
    drop.style.display = 'none';
    _acActiveInput = null;
    _acFocusIdx = -1;
  }

  function acUpdate() {
    if (!_acActiveInput) return;
    const drop = getAcDrop();
    const raw = _acActiveInput.value;
    // Strip leading/trailing hyphens for matching, but keep the raw value for display
    const q = raw.replace(/^-+|-+$/g, '').toLowerCase();
    const kind = _acActiveInput.dataset.morphemeAc; // 'prefix' or 'suffix'

    // Match morphemes: by lemma, display_form, gloss_abbr, or glosses
    const matches = morphemeList.filter(m => {
      // Prefer type-appropriate morphemes first but show all
      const lemmaClean = (m.lemma ?? '').replace(/^-+|-+$/g, '').toLowerCase();
      const form = (m.display_form ?? m.lemma ?? '').replace(/^-+|-+$/g, '').toLowerCase();
      const abbr = (m.gloss_abbr ?? '').toLowerCase();
      const glossText = (m.glosses ?? []).join(' ').toLowerCase();
      if (!q) {
        // No query: show morphemes matching the column type
        return m.major_category === kind;
      }
      return lemmaClean.includes(q) || form.includes(q) || abbr.includes(q) || glossText.includes(q);
    });

    // If no type-specific matches on empty query, fall back to all morphemes
    const typeMatches = !q ? matches : null;
    const finalMatches = (typeMatches && typeMatches.length === 0)
      ? morphemeList.slice(0, 12)
      : matches.slice(0, 12);

    if (!finalMatches.length) { acClose(); return; }

    // Sort: type-matching first
    finalMatches.sort((a, b) => {
      const aMatch = a.major_category === kind ? 0 : 1;
      const bMatch = b.major_category === kind ? 0 : 1;
      return aMatch - bMatch;
    });

    drop.innerHTML = finalMatches.map((m, i) => {
      // The value to insert: use display_form, strip outer hyphens
      const insertForm = (m.display_form ?? m.lemma ?? '').replace(/^-+|-+$/g, '');
      const displayForm = m.display_form ?? m.lemma ?? '';
      const abbr = m.gloss_abbr ?? m.key ?? '';
      const gloss = (m.glosses ?? []).slice(0, 2).join(', ');
      const typeLabel = m.major_category ?? '';
      return `<div class="ac-item${i === _acFocusIdx ? ' focused' : ''}" data-form="${esc(insertForm)}">
        <span class="ac-form">${esc(displayForm)}</span>
        <span class="ac-abbr">${esc(abbr)}</span>
        <span class="ac-gloss">${esc(gloss)}</span>
        <span class="ac-type">${esc(typeLabel)}</span>
      </div>`;
    }).join('');

    // Position below the input
    const rect = _acActiveInput.getBoundingClientRect();
    drop.style.left  = `${rect.left + window.scrollX}px`;
    drop.style.top   = `${rect.bottom + window.scrollY + 2}px`;
    drop.style.width = `${Math.max(rect.width, 240)}px`;
    drop.style.display = 'block';
  }

  function acCommit(form) {
    if (!_acActiveInput) return;
    _acActiveInput.value = form;
    _acActiveInput.dispatchEvent(new Event('input', { bubbles: true }));
    acClose();
    _acActiveInput.focus();
  }

  function acMoveFocus(delta) {
    const drop = getAcDrop();
    const items = [...drop.querySelectorAll('.ac-item')];
    if (!items.length) return;
    _acFocusIdx = Math.max(0, Math.min(items.length - 1, _acFocusIdx + delta));
    items.forEach((el, i) => el.classList.toggle('focused', i === _acFocusIdx));
    items[_acFocusIdx]?.scrollIntoView({ block: 'nearest' });
  }

  // Wire autocomplete via event delegation on cells-list (set up once after DOM ready)
  function initCellAutocomplete() {
    const list = document.getElementById('cells-list');
    if (!list || list._acWired) return;
    list._acWired = true;

    list.addEventListener('input', (e) => {
      if (e.target.dataset.morphemeAc) acOpen(e.target);
    });

    list.addEventListener('focus', (e) => {
      if (e.target.dataset.morphemeAc) { _acFocusIdx = -1; acOpen(e.target); }
    }, true);

    list.addEventListener('blur', (e) => {
      if (e.target.dataset.morphemeAc) setTimeout(acClose, 150);
    }, true);

    list.addEventListener('keydown', (e) => {
      if (!e.target.dataset.morphemeAc) return;
      const drop = getAcDrop();
      if (drop.style.display === 'none') return;
      if (e.key === 'ArrowDown')  { e.preventDefault(); acMoveFocus(+1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); acMoveFocus(-1); }
      else if (e.key === 'Enter') {
        const items = [...drop.querySelectorAll('.ac-item')];
        if (_acFocusIdx >= 0 && items[_acFocusIdx]) {
          e.preventDefault();
          acCommit(items[_acFocusIdx].dataset.form);
        }
      } else if (e.key === 'Escape') { acClose(); }
    });
  }

  function getNegPrefixInput(row) {
    return row?.querySelectorAll('input')?.[1] ?? null;
  }

  function updateDefaultNegRowsPrefix(value) {
    getDefaultNegRows().forEach((row) => {
      const prefixInput = getNegPrefixInput(row);
      if (prefixInput) prefixInput.value = value;
    });
  }

  function ensureDefaultNegRows() {
    const list = document.getElementById('cells-list');
    if (!list) return false;
    const negCells = getVerbNegCells();
    if (!negCells.length) return false;

    const existingSlots = new Set(
      [...list.querySelectorAll('.dyn-row.cell input:first-child')].map((i) => i.value.trim())
    );

    let added = false;
    negCells.forEach((cell) => {
      if (existingSlots.has(cell.slot)) return;
      const nextCell = { ...cell, prefix: negPrefix ?? DEFAULT_NEG_PREFIX };
      list.appendChild(createCellRowElement(nextCell, { isNegDefault: true }));
      added = true;
    });

    applyNegativeLineVisibility();
    return added;
  }

  function removeDefaultNegRows() {
    getDefaultNegRows().forEach((row) => row.remove());
  }

  function setNegPrefix(value, btn) {
    const hadNegRows = getDefaultNegRows().length > 0;
    if (value === null && hadNegRows) {
      const ok = confirm('You have unsaved negative lines. Switching to irregular negatives will remove them from the editor. Continue?');
      if (!ok) return;
    }

    negPrefix = value;
    document.querySelectorAll('#neg-prefix-toggle button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (value === null) {
      removeDefaultNegRows();
      applyNegativeLineVisibility();
      return;
    }

    if (!hadNegRows && document.querySelector('#cells-list .dyn-row.cell')) {
      ensureDefaultNegRows();
    }
    updateDefaultNegRowsPrefix(value);
    applyNegativeLineVisibility();
  }

  function toggleNegativeLines(btn) {
    showNegativeLines = !showNegativeLines;
    applyNegativeLineVisibility();
    if (btn) btn.textContent = showNegativeLines ? 'Hide negative lines' : 'Show negative lines';
  }

  function onRuleCategoryChange(cat) {
    const nounEl = document.getElementById('rf-qf-noun');
    const verbEl = document.getElementById('rf-qf-verb');
    if (nounEl) nounEl.style.display = cat === 'noun' ? 'flex' : 'none';
    if (verbEl) verbEl.style.display = cat === 'verb' ? 'block' : 'none';
  }

  function fillParadigm(category) {
    const list = document.getElementById('cells-list');
    if (!list) return;

    const def = paradigmDefaults?.[category];
    if (!def) { toast(`No paradigm defaults found for "${category}"`, 'error'); return; }

    const cells = [...(def.cells ?? [])];

    if (category === 'verb') {
      const negCells = def.neg_cells ?? [];
      if (negPrefix !== null && negCells.length) {
        // Inject chosen NEG prefix into each neg cell
        negCells.forEach(c => cells.push({ ...c, prefix: negPrefix }));
      }
      // Irregular: neg_cells not added
    }

    // Append rows (skip if slot already exists to avoid duplicates)
    const existingSlots = new Set(
      [...list.querySelectorAll('.dyn-row.cell input:first-child')].map(i => i.value.trim())
    );

    let added = 0;
    for (const c of cells) {
      if (existingSlots.has(c.slot)) continue; // don't duplicate
      const row = createCellRowElement(c, {
        isNegDefault: category === 'verb' && isDefaultNegCell(c),
      });
      list.appendChild(row);
      added++;
    }

    if (category === 'verb') applyNegativeLineVisibility();

    toast(added
      ? `✓ Added ${added} cell${added!==1?'s':''} (${cells.length - added} already present)`
      : 'All cells already present — nothing added', added ? 'success' : 'error');
  }

  function addCellRow() {
    const list = document.getElementById('cells-list');
    if (!list) return;
    list.appendChild(createCellRowElement(null));
  }

  async function toggleRuleEntries() {
    if (!currentRuleKey) return;
    showAllRuleEntries = !showAllRuleEntries;
    await loadSelectedRule(currentRuleKey);
  }

  function collectRuleForm() {
    const cells = [...document.querySelectorAll('#cells-list .dyn-row.cell')].map(row => {
      const inputs = [...row.querySelectorAll('input')].map(i => i.value.trim());
      const [slot, prefix, suffix, stemVar, featsStr] = inputs;
      if (!slot) return null;
      const features = featsStr ? featsStr.split(',').map(p => {
        const [feature, value] = p.split(':').map(s => s.trim());
        return feature && value ? { feature, value } : null;
      }).filter(Boolean) : [];
      const cell = { slot, suffix: suffix || '' };
      if (prefix) cell.prefix = prefix;
      if (stemVar) cell.stem_variant = stemVar;
      if (features.length) cell.features = features;
      else cell.features = [];
      return cell;
    }).filter(Boolean);

    const inherits = document.getElementById('rf-inherits').value.split(',').map(s=>s.trim()).filter(Boolean);
    const tags     = document.getElementById('rf-tags').value.split(',').map(s=>s.trim()).filter(Boolean);
    const key      = document.getElementById('rf-key').value.trim();

    return {
      schema_version: '1.0',
      rule_kind: 'inflection',
      id: key.replace(/[^a-z0-9-]/g, '-'),
      key,
      friendly_name: document.getElementById('rf-friendly-name').value.trim() || undefined,
      name:        document.getElementById('rf-name').value.trim(),
      description: document.getElementById('rf-description').value.trim(),
      category:    document.getElementById('rf-category').value,
      feature_axes: [],
      cells,
      inherits,
      tags,
      notes: document.getElementById('rf-notes').value.trim(),
    };
  }

  async function saveRule(isEdit) {
    const btn = document.getElementById('rule-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const payload = collectRuleForm();
      if (!payload.key) { toast('Key is required', 'error'); return; }
      if (!payload.name) { toast('Name is required', 'error'); return; }
      if (!payload.cells.length) { toast('At least one cell is required', 'error'); return; }

      const url    = isEdit ? `/api/rules/inflection/${currentRuleKey}` : '/api/rules/inflection';
      const method = isEdit ? 'PUT' : 'POST';

      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();

      if (!r.ok) {
        const msg = data.errors?.map(e=>e.message).join('; ') ?? data.error ?? 'Save failed';
        toast('✗ ' + msg, 'error');
        return;
      }

      toast(`✓ Rule ${isEdit ? 'updated' : 'created'}: ${payload.key}`, 'success');
      currentRuleKey = payload.key;
      await Promise.all([loadStatus(), loadEntrySuggestions()]);
      await loadRuleList();
      await loadSelectedRule(payload.key);
    } catch(err) { toast('✗ ' + String(err), 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save Rule'; }
  }

  async function deleteRule(key) {
    toast('Rule deletion not yet implemented — remove the YAML file manually.', 'error');
  }

  // ── Escape helper ─────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text, query) {
    const source = String(text ?? '');
    const tokens = [...new Set(
      String(query ?? '')
        .trim()
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean)
    )];
    if (!tokens.length) return esc(source);

    const regex = new RegExp(
      tokens
        .sort((a, b) => b.length - a.length)
        .map((token) => escapeRegExp(token))
        .join('|'),
      'gi'
    );

    let html = '';
    let lastIndex = 0;
    for (const match of source.matchAll(regex)) {
      const index = match.index ?? 0;
      html += esc(source.slice(lastIndex, index));
      html += `<strong>${esc(match[0])}</strong>`;
      lastIndex = index + match[0].length;
    }
    html += esc(source.slice(lastIndex));
    return html;
  }

  return {
    init, selectEntry, search, applyFilters, rebuild, exportArtifacts,
    // Editor
    openEntryEditor, openMorphemeEditor, closeDrawer, saveDrawer, deleteCurrentEntry,
    setInflectionToggle,
    // Rules
    switchSidebarTab, openRuleEditor, selectRule, filterRuleList,
    addCellRow, saveRule, deleteRule, toggleRuleEntries,
    fillParadigm, setNegPrefix, onRuleCategoryChange, toggleNegativeLines,
  };
})();

App.init();
