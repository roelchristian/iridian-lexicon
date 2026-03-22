// ── Rules management & rule editor ───────────────────────────────────────────
import { state } from './state.js';
import { esc, toast } from './utils.js';
import { loadEntrySuggestions, loadStatus, getRuleDisplayName, getRuleDisplayNameByKey } from './entries.js';
import { initCellAutocomplete } from './autocomplete.js';

// ── Rule list ────────────────────────────────────────────────────────────────

export async function loadRuleList() {
  try {
    const r = await fetch('/api/rules?kind=inflection');
    const { rules } = await r.json();
    state.allRules = rules ?? [];
    renderRuleList(state.allRules);
  } catch { renderRuleList([]); }
}

function renderRuleList(rules) {
  const el = document.getElementById('rule-list');
  if (!rules.length) {
    el.innerHTML = '<div class="empty-state" style="height:160px"><p>No inflection rules yet</p></div>';
    // Also clear inner list
    const inner = document.getElementById('rules-list-inner');
    if (inner) inner.innerHTML = el.innerHTML;
    return;
  }
  el.innerHTML = rules.map(r => {
    const d = r.data ?? r;
    const cellCount  = (d.cells ?? []).length;
    const displayName = getRuleDisplayName(d);
    return `<div class="entry-item${state.currentRuleKey===d.key?' active':''}" onclick="App.selectRule('${d.key}')">
      <div class="key">${esc(displayName)}</div>
      <div class="lemma" style="font-style:normal">${esc(d.name ?? '')}</div>
      <div class="gloss"><span style="font-family:var(--font-mono)">${esc(d.key)}</span> · ${cellCount} cell${cellCount!==1?'s':''} · ${esc(d.category ?? '')}</div>
    </div>`;
  }).join('');

  // Mirror into the rules panel left-column inner list
  const inner = document.getElementById('rules-list-inner');
  if (inner) inner.innerHTML = el.innerHTML;
}

export function filterRuleList(q) {
  const filtered = q
    ? state.allRules.filter(r => {
        const d = r.data ?? r;
        return (d.key + (d.friendly_name ?? '') + d.name + d.category + '').toLowerCase().includes(q.toLowerCase());
      })
    : state.allRules;
  renderRuleList(filtered);
}

export async function selectRule(key) {
  state.currentRuleKey = key;
  state.showAllRuleEntries = false;
  await loadSelectedRule(key);
}

export async function loadSelectedRule(key) {
  renderRuleList(state.allRules); // refresh active state
  try {
    const [ruleRes, entriesRes] = await Promise.all([
      fetch(`/api/rules/${key}`),
      fetch(`/api/rules/${key}/entries`),
    ]);
    const ruleRow    = await ruleRes.json();
    const entriesRow = await entriesRes.json();
    const rule       = ruleRow.data ?? ruleRow;
    renderRuleEditor(rule, true, entriesRow.entries ?? []);
  } catch(err) { toast('✗ ' + String(err), 'error'); }
}

export function openRuleEditor(key) {
  state.currentRuleKey      = key ?? null;
  state.showAllRuleEntries  = false;
  if (key) {
    selectRule(key);
  } else {
    renderRuleEditor(null, false, []);
  }
}

// ── Rule editor renderer ─────────────────────────────────────────────────────

export function renderRuleEditor(rule, isEdit, linkedEntries = []) {
  const col          = document.getElementById('rules-editor-col');
  const cells        = rule?.cells ?? [];
  const displayName  = getRuleDisplayName(rule);
  const visibleEntries = state.showAllRuleEntries ? linkedEntries : linkedEntries.slice(0, 30);
  const hasMoreEntries = linkedEntries.length > 30;
  syncVerbQuickFillState(rule);

  const cellRows = cells.map((c) => buildCellRow(c, {
    isNegDefault: (rule?.category ?? 'noun') === 'verb' && isDefaultNegCell(c),
  })).join('');

  col.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <h2 style="font-size:15px;font-weight:600;flex:1">${isEdit ? 'Edit Rule: ' + esc(displayName) : 'New Inflection Rule'}</h2>
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
                    ${state.showAllRuleEntries ? 'Show first 30' : `View all ${linkedEntries.length}`}
                  </button>
                </div>`
              : ''}`
          : `<div style="font-size:12px;color:var(--text-muted)">No lexemes currently use this rule.</div>`
        }
      </div>
    ` : ''}

    <div class="section-header">Paradigm Cells</div>

    <!-- Quick-fill bar -->
    <div id="rf-quickfill" style="margin-bottom:10px">
      <div id="rf-qf-noun" style="display:${(rule?.category??'noun')==='noun'?'flex':'none'};gap:8px;align-items:center;flex-wrap:wrap">
        <button onclick="App.fillParadigm('noun')"
          style="background:var(--surface2);border:1px solid var(--accent);color:var(--accent);padding:4px 12px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-sans);font-weight:600">
          ⚡ Fill noun paradigm
        </button>
        <span style="font-size:11px;color:var(--text-muted)">Appends DIR TRS IND + DEF variants from settings</span>
      </div>

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
            ${state.showNegativeLines ? 'Hide negative lines' : 'Show negative lines'}
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
  initCellAutocomplete();
}

// ── Feature datalist ─────────────────────────────────────────────────────────

function buildFeatureDatalist() {
  const seen    = new Set();
  const options = [];
  for (const cat of Object.values(state.paradigmDefaults)) {
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

// ── Cell row builder ─────────────────────────────────────────────────────────

export function buildCellRow(c, opts = {}) {
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

function createCellRowElement(cell, opts = {}) {
  const row = document.createElement('div');
  row.innerHTML = buildCellRow(cell, opts);
  return row.firstElementChild;
}

export function addCellRow() {
  const list = document.getElementById('cells-list');
  if (!list) return;
  list.appendChild(createCellRowElement(null));
}

// ── Paradigm quick-fill ──────────────────────────────────────────────────────

const DEFAULT_NEG_PREFIX = 'zá';

function getVerbDefaultDef() { return state.paradigmDefaults?.verb ?? {}; }
function getVerbNegCells()   { return getVerbDefaultDef().neg_cells ?? []; }
function getVerbNegSlotSet() { return new Set(getVerbNegCells().map(c => c.slot)); }

function isDefaultNegCell(cell) {
  return !!cell?.slot && getVerbNegSlotSet().has(cell.slot);
}

function inferNegPrefixFromRule(rule) {
  const cells    = rule?.cells ?? [];
  const negRows  = cells.filter(isDefaultNegCell);
  const prefixes = [...new Set(negRows.map(c => (c?.prefix ?? '').trim()).filter(Boolean))];
  if (prefixes.length === 1 && (prefixes[0] === 'zá' || prefixes[0] === 'zad')) return prefixes[0];
  return DEFAULT_NEG_PREFIX;
}

function syncVerbQuickFillState(rule) {
  state.showNegativeLines = false;
  state.negPrefix = inferNegPrefixFromRule(rule);
}

function buildNegPrefixButtons(category) {
  if (category !== 'verb') return '';
  const verbDef    = state.paradigmDefaults?.verb;
  const negPrefixes = verbDef?.neg_prefixes ?? [
    { value: 'zá',  label: 'zá (standard)' },
    { value: 'zad', label: 'zad (variant)'  },
  ];
  const opts = [...negPrefixes, { value: null, label: 'Irregular' }];
  return opts.map((o) =>
    `<button class="${o.value === state.negPrefix ? 'active' : (o.value === null && state.negPrefix === null ? 'active' : '')}"
      onclick="App.setNegPrefix(${o.value===null?'null':`'${o.value}'`}, this)"
      style="padding:5px 12px;font-size:11px;white-space:nowrap">${o.label}</button>`
  ).join('');
}

function getDefaultNegRows() {
  return [...document.querySelectorAll('#cells-list .dyn-row.cell[data-neg-default="true"]')];
}

function applyNegativeLineVisibility() {
  getDefaultNegRows().forEach((row) => {
    if (state.showNegativeLines) row.style.removeProperty('display');
    else row.style.display = 'none';
  });
  const btn = document.getElementById('neg-lines-visibility-btn');
  if (btn) btn.textContent = state.showNegativeLines ? 'Hide negative lines' : 'Show negative lines';
}

function updateDefaultNegRowsPrefix(value) {
  getDefaultNegRows().forEach((row) => {
    const prefixInput = row?.querySelectorAll('input')?.[1] ?? null;
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
    const nextCell = { ...cell, prefix: state.negPrefix ?? DEFAULT_NEG_PREFIX };
    list.appendChild(createCellRowElement(nextCell, { isNegDefault: true }));
    added = true;
  });

  applyNegativeLineVisibility();
  return added;
}

function removeDefaultNegRows() {
  getDefaultNegRows().forEach((row) => row.remove());
}

export function setNegPrefix(value, btn) {
  const hadNegRows = getDefaultNegRows().length > 0;
  if (value === null && hadNegRows) {
    const ok = confirm('You have unsaved negative lines. Switching to irregular negatives will remove them from the editor. Continue?');
    if (!ok) return;
  }

  state.negPrefix = value;
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

export function toggleNegativeLines(btn) {
  state.showNegativeLines = !state.showNegativeLines;
  applyNegativeLineVisibility();
  if (btn) btn.textContent = state.showNegativeLines ? 'Hide negative lines' : 'Show negative lines';
}

export function onRuleCategoryChange(cat) {
  const nounEl = document.getElementById('rf-qf-noun');
  const verbEl = document.getElementById('rf-qf-verb');
  if (nounEl) nounEl.style.display = cat === 'noun' ? 'flex' : 'none';
  if (verbEl) verbEl.style.display = cat === 'verb' ? 'block' : 'none';
}

export function fillParadigm(category) {
  const list = document.getElementById('cells-list');
  if (!list) return;

  const def = state.paradigmDefaults?.[category];
  if (!def) { toast(`No paradigm defaults found for "${category}"`, 'error'); return; }

  const cells = [...(def.cells ?? [])];

  if (category === 'verb') {
    const negCells = def.neg_cells ?? [];
    if (state.negPrefix !== null && negCells.length) {
      negCells.forEach(c => cells.push({ ...c, prefix: state.negPrefix }));
    }
  }

  const existingSlots = new Set(
    [...list.querySelectorAll('.dyn-row.cell input:first-child')].map(i => i.value.trim())
  );

  let added = 0;
  for (const c of cells) {
    if (existingSlots.has(c.slot)) continue;
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

export async function toggleRuleEntries() {
  if (!state.currentRuleKey) return;
  state.showAllRuleEntries = !state.showAllRuleEntries;
  await loadSelectedRule(state.currentRuleKey);
}

// ── Collect & save ───────────────────────────────────────────────────────────

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
    if (prefix)  cell.prefix = prefix;
    if (stemVar) cell.stem_variant = stemVar;
    cell.features = features;
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
    name:          document.getElementById('rf-name').value.trim(),
    description:   document.getElementById('rf-description').value.trim(),
    category:      document.getElementById('rf-category').value,
    feature_axes:  [],
    cells,
    inherits,
    tags,
    notes: document.getElementById('rf-notes').value.trim(),
  };
}

export async function saveRule(isEdit) {
  const btn = document.getElementById('rule-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const payload = collectRuleForm();
    if (!payload.key)           { toast('Key is required', 'error'); return; }
    if (!payload.name)          { toast('Name is required', 'error'); return; }
    if (!payload.cells.length)  { toast('At least one cell is required', 'error'); return; }

    const url    = isEdit ? `/api/rules/inflection/${state.currentRuleKey}` : '/api/rules/inflection';
    const method = isEdit ? 'PUT' : 'POST';

    const r    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json();

    if (!r.ok) {
      const msg = data.errors?.map(e=>e.message).join('; ') ?? data.error ?? 'Save failed';
      toast('✗ ' + msg, 'error');
      return;
    }

    toast(`✓ Rule ${isEdit ? 'updated' : 'created'}: ${payload.key}`, 'success');
    state.currentRuleKey = payload.key;
    await Promise.all([loadStatus(), loadEntrySuggestions()]);
    await loadRuleList();
    await loadSelectedRule(payload.key);
  } catch(err) { toast('✗ ' + String(err), 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Save Rule'; }
}

export async function deleteRule(key) {
  toast('Rule deletion not yet implemented — remove the YAML file manually.', 'error');
}
