export * from './schema.js';
export * from './builder.js';
export * from './queries.js';

// Re-export the DatabaseSync type so callers don't need to import node:sqlite directly
export type { DatabaseSync } from 'node:sqlite';
