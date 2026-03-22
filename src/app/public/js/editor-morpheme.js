// ── Morpheme editor drawer ───────────────────────────────────────────────────
import { state } from './state.js';
import { esc, toast } from './utils.js';
import { loadEntries, loadMorphemes, loadStatus, selectEntry } from './entries.js';
import { openDrawer, closeDrawer } from './drawer.js';

export function openMorphemeEditor(key) {
  state.drawerMode = key ? 'edit-morpheme' : 'new-morpheme';
  state.drawerKey  = key ?? null;
  document.getElementById('drawer-title').textContent = key ? `Edit morpheme: ${key}` : 'New Morpheme';
  document.getElementById('drawer-delete-btn').style.display = key ? '' : 'none';
  document.getElementById('drawer-save-btn').textContent = 'Save';

  const entry = key ? (state.currentEntry?.key === key ? state.currentEntry : null) : null;
  document.getElementById('drawer-body').innerHTML = buildMorphemeForm(entry, !!key);
  bindAllomorphButtons();
  bindMorphemeTagControls();
  openDrawer();
}

// ── Form builder ─────────────────────────────────────────────────────────────

function buildMorphemeForm(e, isEdit) {
  const selectedTags = e?.tags ?? [];
  const visibleTagSuggestions = [
    ...selectedTags,
    ...state.entrySuggestions.tags.filter((t) => !selectedTags.includes(t)),
  ].slice(0, 8);
  const activeTags = new Set(selectedTags);

  const tagOptions = state.entrySuggestions.tags.map(t => `<option value="${esc(t)}"></option>`).join('');
  const tagChips = visibleTagSuggestions.length
    ? visibleTagSuggestions.map(t =>
        `<button type="button" class="suggestion-chip${activeTags.has(t)?' active':''}" data-tag-value="${esc(t)}">${esc(t)}</button>`
      ).join('')
    : '<div class="suggestion-empty">No saved tags yet.</div>';

  // Gloss abbreviation suggestions from loaded glossary
  const glossAbbrOptions = Object.keys(state.glossary)
    .sort()
    .map(k => `<option value="${esc(k)}">${esc(k)} — ${esc(state.glossary[k]?.expansion ?? '')}</option>`)
    .join('');

  // Slot suggestions from paradigm feature names
  const slotSet = new Set();
  for (const cat of Object.values(state.paradigmDefaults)) {
    for (const cell of [...(cat.cells ?? []), ...(cat.neg_cells ?? [])]) {
      for (const f of (cell.features ?? [])) {
        if (f.feature) slotSet.add(f.feature);
      }
    }
  }
  const slotOptions = [...slotSet].sort().map(s => `<option value="${esc(s)}"></option>`).join('');

  const catSet = new Set(['case-system', 'TAM', 'voice', 'mood', 'definiteness', 'polarity', 'derivation']);
  const catOptions = [...catSet].sort().map(c => `<option value="${esc(c)}"></option>`).join('');

  const glossAbbrExample = Object.keys(state.glossary).length
    ? Object.keys(state.glossary).slice(0, 3).join(', ')
    : 'DIR, TRS.DEF, PF';

  const slotExample = slotSet.size ? [...slotSet].slice(0, 3).join(', ') : 'case, aspect, voice';

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

function getMorphemeTags() {
  const input = document.getElementById('mf-tags');
  if (!input) return [];
  return [...new Set(input.value.split(',').map(s=>s.trim()).filter(Boolean))];
}

function syncMorphemeTagInput(tags) {
  const input = document.getElementById('mf-tags');
  if (input) input.value = tags.join(', ');
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

// ── Collect & save ───────────────────────────────────────────────────────────

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

export async function saveMorpheme() {
  const btn = document.getElementById('drawer-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const isEdit  = state.drawerMode === 'edit-morpheme';
    const payload = collectMorphemeForm();
    if (!payload.key) { alert('Key is required'); return; }
    const url    = isEdit ? `/api/entries/${state.drawerKey}` : '/api/entries';
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
    btn.disabled = false; btn.textContent = 'Save';
  }
}
