// ── Lexeme editor drawer ─────────────────────────────────────────────────────
import { state } from './state.js';
import { esc, toast, normalizeLemmaToKey } from './utils.js';
import { loadEntries, loadMorphemes, loadStatus, loadEntrySuggestions, selectEntry } from './entries.js';
import { openDrawer, closeDrawer } from './drawer.js';

export function openEntryEditor(key) {
  state.drawerMode = key ? 'edit-entry' : 'new-entry';
  state.drawerKey  = key ?? null;
  document.getElementById('drawer-title').textContent = key ? `Edit: ${key}` : 'New Lexeme Entry';
  document.getElementById('drawer-delete-btn').style.display = key ? '' : 'none';
  document.getElementById('drawer-save-btn').textContent = 'Save';

  const entry  = key ? (state.currentEntry?.key === key ? state.currentEntry : null) : null;
  const isEdit = !!key;
  document.getElementById('drawer-body').innerHTML = buildEntryForm(entry, isEdit);
  bindStemButtons();
  bindOverrideButtons();
  bindEntrySuggestionControls();
  bindLemmaAutofill(isEdit);
  if (entry?.template_id)           setInflectionToggle('template');
  else if (entry?.inflection_profile) setInflectionToggle('profile');
  else                                setInflectionToggle('template');
  openDrawer();
}

function bindLemmaAutofill(isEdit) {
  const lemmaEl   = document.getElementById('ef-lemma');
  const displayEl = document.getElementById('ef-display-lemma');
  const keyEl     = document.getElementById('ef-key');
  if (!lemmaEl) return;

  let displayTouched = isEdit && !!displayEl?.value;
  displayEl?.addEventListener('input', () => { displayTouched = true; });

  lemmaEl.addEventListener('input', () => {
    const lemma = lemmaEl.value;
    if (!isEdit && keyEl) keyEl.value = normalizeLemmaToKey(lemma);
    if (!displayTouched && displayEl) displayEl.value = lemma;
    const baseRow = document.querySelector('#sv-list .dyn-row.sv[data-auto-base]');
    if (baseRow) {
      const formInput = baseRow.querySelectorAll('input')[1];
      if (formInput) formInput.value = lemma;
    }
  });
}

// ── Form builder ─────────────────────────────────────────────────────────────

function buildEntryForm(e, isEdit) {
  const selectedTags = e?.tags ?? [];
  const visibleTagSuggestions = [
    ...selectedTags,
    ...state.entrySuggestions.tags.filter((tag) => !selectedTags.includes(tag)),
  ].slice(0, 8);

  const existingSv = e?.stem_variants ?? [];
  const svRows = existingSv.length
    ? existingSv.map(s => makeSvRowHtml(s.label, s.form, false)).join('')
    : makeSvRowHtml('base', e?.lemma ?? '', true);

  const mo = Object.entries(e?.manual_overrides ?? {}).map(([slot, form]) =>
    `<div class="dyn-row mo">
      <input placeholder="slot (e.g. GEN.PL)" value="${esc(slot)}">
      <input placeholder="form" value="${esc(form)}">
      <button class="del-btn" onclick="this.closest('.dyn-row').remove()">×</button>
     </div>`).join('');

  const tagOptions      = state.entrySuggestions.tags.map((tag) => `<option value="${esc(tag)}"></option>`).join('');
  const templateOptions = state.entrySuggestions.templates
    .map((t) => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('');
  const profileOptions  = state.entrySuggestions.profiles
    .map((p) => `<option value="${esc(p.value)}"></option>`).join('');

  const activeTags = new Set(selectedTags);
  const tagChips = visibleTagSuggestions.length
    ? visibleTagSuggestions.map((tag) =>
        `<button type="button" class="suggestion-chip${activeTags.has(tag) ? ' active' : ''}" data-tag-value="${esc(tag)}">${esc(tag)}</button>`
      ).join('')
    : '<div class="suggestion-empty">No saved tags yet.</div>';

  const templateChips = state.entrySuggestions.templates.length
    ? state.entrySuggestions.templates.map((t) =>
        `<button type="button" class="suggestion-chip${e?.template_id === t.key ? ' active' : ''}" data-template-value="${esc(t.key)}" title="${esc(t.name)}">${esc(t.friendly_name || t.name)}</button>`
      ).join('')
    : '<div class="suggestion-empty">No template rules found.</div>';

  const profileChips = state.entrySuggestions.profiles.length
    ? state.entrySuggestions.profiles.map((p) =>
        `<button type="button" class="suggestion-chip${e?.inflection_profile === p.value ? ' active' : ''}" data-profile-value="${esc(p.value)}">${esc(p.value)}<span class="meta">${p.usage_count}</span></button>`
      ).join('')
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
        ${state.entrySuggestions.tags.length > visibleTagSuggestions.length
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
  document.getElementById('add-sv-reduced').onclick = () => addSvRow('reduced', '');
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

// ── Tag / template / profile sync ────────────────────────────────────────────

function getNormalizedTags() {
  const input = document.getElementById('ef-tags');
  if (!input) return [];
  return [...new Set(input.value.split(',').map(s => s.trim()).filter(Boolean))];
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

export function setInflectionToggle(mode) {
  document.getElementById('toggle-template').classList.toggle('active', mode === 'template');
  document.getElementById('toggle-profile').classList.toggle('active', mode === 'profile');
  document.getElementById('inflection-template-field').style.display = mode === 'template' ? '' : 'none';
  document.getElementById('inflection-profile-field').style.display  = mode === 'profile'  ? '' : 'none';
}

// ── Collect & save ───────────────────────────────────────────────────────────

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

export async function saveEntry() {
  const btn = document.getElementById('drawer-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const payload = collectEntryForm();
    if (!payload.key)           { toast('Key is required', 'error'); return; }
    if (!payload.glosses.length) { toast('At least one gloss is required', 'error'); return; }

    const isEdit = state.drawerMode === 'edit-entry';
    const url    = isEdit ? `/api/entries/${state.drawerKey}` : '/api/entries';
    const method = isEdit ? 'PUT' : 'POST';

    const r    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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

export async function deleteCurrentEntry() {
  if (!state.drawerKey) return;
  if (!confirm(`Delete "${state.drawerKey}"? This removes the YAML file and cannot be undone.`)) return;
  try {
    const r    = await fetch(`/api/entries/${state.drawerKey}`, { method: 'DELETE' });
    const data = await r.json();
    if (!r.ok) { toast('✗ ' + (data.error ?? 'Delete failed'), 'error'); return; }
    toast(`✓ Deleted: ${state.drawerKey}`, 'success');
    closeDrawer();
    state.currentEntry = null;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-welcome').classList.add('active');
    await loadEntrySuggestions();
    await Promise.all([loadEntries(), loadMorphemes()]);
    await loadStatus();
  } catch(err) { toast('✗ ' + String(err), 'error'); }
}
