// ── Application entry point — assembles window.App ───────────────────────────
import { state } from './state.js';
import { toast } from './utils.js';
import {
  loadParadigmDefaults, loadGlossary, loadEntrySuggestions,
  loadMorphemes, loadStatus, loadEntries,
  selectEntry, search, applyFilters,
} from './entries.js';
import { openEntryEditor, saveEntry, deleteCurrentEntry, setInflectionToggle } from './editor-lexeme.js';
import { openMorphemeEditor, saveMorpheme } from './editor-morpheme.js';
import { closeDrawer } from './drawer.js';
import {
  loadRuleList, filterRuleList, selectRule, openRuleEditor,
  addCellRow, saveRule, deleteRule, toggleRuleEntries,
  fillParadigm, setNegPrefix, onRuleCategoryChange, toggleNegativeLines,
} from './rules.js';

// ── Init ──────────────────────────────────────────────────────────────────────

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

// ── Admin actions ─────────────────────────────────────────────────────────────

async function rebuild() {
  document.getElementById('btn-rebuild').disabled = true;
  document.getElementById('btn-rebuild').textContent = '⟳ Rebuilding…';
  try {
    const r    = await fetch('/api/admin/rebuild', { method: 'POST' });
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
    const r    = await fetch('/api/admin/export', { method: 'POST' });
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

// ── Sidebar tabs ──────────────────────────────────────────────────────────────

function switchSidebarTab(tab, btn) {
  state.sidebarTab = tab;
  document.querySelectorAll('.sidebar-tabs button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('sidebar-entries').style.display = tab === 'entries' ? 'flex' : 'none';
  document.getElementById('sidebar-rules').style.display   = tab === 'rules'   ? 'flex' : 'none';

  if (tab === 'rules') {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-rules').classList.add('active');
    loadRuleList();
  } else {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-welcome').classList.add('active');
    state.currentEntry = null;
  }
}

// ── Drawer ────────────────────────────────────────────────────────────────────

async function saveDrawer() {
  if (state.drawerMode === 'new-entry'    || state.drawerMode === 'edit-entry')    await saveEntry();
  else if (state.drawerMode === 'new-morpheme' || state.drawerMode === 'edit-morpheme') await saveMorpheme();
}

// ── Expose as window.App (called by inline onclick handlers in HTML) ──────────

window.App = {
  init,
  // Entry list
  selectEntry, search, applyFilters,
  // Admin
  rebuild, exportArtifacts,
  // Sidebar
  switchSidebarTab,
  // Drawer
  closeDrawer, saveDrawer, deleteCurrentEntry,
  // Lexeme editor
  openEntryEditor, setInflectionToggle,
  // Morpheme editor
  openMorphemeEditor,
  // Rules
  openRuleEditor, selectRule, filterRuleList,
  addCellRow, saveRule, deleteRule, toggleRuleEntries,
  fillParadigm, setNegPrefix, onRuleCategoryChange, toggleNegativeLines,
};

// Kick off on DOMContentLoaded (module scripts are deferred by default,
// so the DOM is already parsed — but guard just in case).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
