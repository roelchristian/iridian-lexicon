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
  getEntriesByCategory,
  getEntriesByStatus,
  getFormsForLexeme,
  getAllForms,
  getAllRules,
  getRuleByKey,
  getRulesByKind,
  getExamplesForLexeme,
  getDbMeta,
} from '../db/queries.js';
