// ── Shared mutable application state ────────────────────────────────────────
// All modules import this object and mutate its properties in place.
// ES module live bindings are read-only from outside the declaring module,
// so we use a single exported object whose properties are freely mutable.

export const state = {
  // Entry list
  allEntries: [],
  currentEntry: null,
  searchTimer: null,
  currentSearchQuery: '',
  currentSearchResults: [],

  // Lookup data (loaded once on init)
  glossary: {},          // abbr → { expansion, description, domain }
  paradigmDefaults: {},  // loaded from /api/settings/paradigm-defaults
  entrySuggestions: { tags: [], templates: [], profiles: [] },
  morphemeList: [],      // morpheme entries for cell autocomplete

  // Rules
  allRules: [],
  currentRuleKey: null,
  negPrefix: 'zá',
  showNegativeLines: false,
  showAllRuleEntries: false,

  // Drawer
  drawerMode: null, // 'new-entry' | 'edit-entry' | 'new-morpheme' | 'edit-morpheme'
  drawerKey: null,

  // Sidebar
  sidebarTab: 'entries',
};
