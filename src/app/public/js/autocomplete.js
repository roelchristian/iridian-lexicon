// ── Morpheme autocomplete for rule-editor cell rows ──────────────────────────
// A single shared floating dropdown anchored to whichever prefix/suffix input
// is currently focused inside #cells-list.
import { state } from './state.js';
import { esc } from './utils.js';

let _acDrop = null;         // the dropdown DOM element
let _acActiveInput = null;  // input currently being autocompleted
let _acFocusIdx = -1;       // keyboard-nav index

function getAcDrop() {
  if (!_acDrop) {
    _acDrop = document.createElement('div');
    _acDrop.className = 'morpheme-ac-drop';
    _acDrop.style.display = 'none';
    document.body.appendChild(_acDrop);

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
  const raw  = _acActiveInput.value;
  const q    = raw.replace(/^-+|-+$/g, '').toLowerCase();
  const kind = _acActiveInput.dataset.morphemeAc; // 'prefix' or 'suffix'

  const matches = state.morphemeList.filter(m => {
    const lemmaClean = (m.lemma ?? '').replace(/^-+|-+$/g, '').toLowerCase();
    const form       = (m.display_form ?? m.lemma ?? '').replace(/^-+|-+$/g, '').toLowerCase();
    const abbr       = (m.gloss_abbr ?? '').toLowerCase();
    const glossText  = (m.glosses ?? []).join(' ').toLowerCase();
    if (!q) return m.major_category === kind;
    return lemmaClean.includes(q) || form.includes(q) || abbr.includes(q) || glossText.includes(q);
  });

  const typeMatches = !q ? matches : null;
  const finalMatches = (typeMatches && typeMatches.length === 0)
    ? state.morphemeList.slice(0, 12)
    : matches.slice(0, 12);

  if (!finalMatches.length) { acClose(); return; }

  finalMatches.sort((a, b) => {
    const aMatch = a.major_category === kind ? 0 : 1;
    const bMatch = b.major_category === kind ? 0 : 1;
    return aMatch - bMatch;
  });

  drop.innerHTML = finalMatches.map((m, i) => {
    const insertForm  = (m.display_form ?? m.lemma ?? '').replace(/^-+|-+$/g, '');
    const displayForm = m.display_form ?? m.lemma ?? '';
    const abbr        = m.gloss_abbr ?? m.key ?? '';
    const gloss       = (m.glosses ?? []).slice(0, 2).join(', ');
    const typeLabel   = m.major_category ?? '';
    return `<div class="ac-item${i === _acFocusIdx ? ' focused' : ''}" data-form="${esc(insertForm)}">
      <span class="ac-form">${esc(displayForm)}</span>
      <span class="ac-abbr">${esc(abbr)}</span>
      <span class="ac-gloss">${esc(gloss)}</span>
      <span class="ac-type">${esc(typeLabel)}</span>
    </div>`;
  }).join('');

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
  const drop  = getAcDrop();
  const items = [...drop.querySelectorAll('.ac-item')];
  if (!items.length) return;
  _acFocusIdx = Math.max(0, Math.min(items.length - 1, _acFocusIdx + delta));
  items.forEach((el, i) => el.classList.toggle('focused', i === _acFocusIdx));
  items[_acFocusIdx]?.scrollIntoView({ block: 'nearest' });
}

// Wire autocomplete via event delegation on cells-list.
// Called once after the rule editor is rendered into the DOM.
export function initCellAutocomplete() {
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
    if (e.key === 'ArrowDown')       { e.preventDefault(); acMoveFocus(+1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); acMoveFocus(-1); }
    else if (e.key === 'Enter') {
      const items = [...drop.querySelectorAll('.ac-item')];
      if (_acFocusIdx >= 0 && items[_acFocusIdx]) {
        e.preventDefault();
        acCommit(items[_acFocusIdx].dataset.form);
      }
    } else if (e.key === 'Escape') { acClose(); }
  });
}
