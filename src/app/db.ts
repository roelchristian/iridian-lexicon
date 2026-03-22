/**
 * Re-exports DB query functions for use inside the app module.
 * This keeps the circular-reference surface area small.
 */
export {
  getAllEntries,
  getLexemes,
  getMorphemes,
  getEntryByKey,
  getEntryById,
  searchEntries,
  searchEntrySuggestions,
  getEntriesByCategory,
  getEntriesByStatus,
  getFormsForLexeme,
  getAllForms,
  getAllRules,
  getRuleByKey,
  getRulesByKind,
  getEntriesForRule,
  getExamplesForLexeme,
  getDbMeta,
  getAllAvailableTags,
  getTemplateSuggestions,
  getInflectionProfileSuggestions,
} from '../db/queries.js';
