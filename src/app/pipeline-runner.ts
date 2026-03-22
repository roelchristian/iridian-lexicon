/**
 * Shared pipeline + rebuild helper used by API routes.
 */

import { runPipeline } from '../pipeline/index.js';
import { runRuleEngine } from '../rules/engine.js';
import { openDb, rebuildProjection } from '../db/builder.js';
import type { ValidationError } from '../types/index.js';

export async function runPipelineAndRebuild(
  repoRoot: string
): Promise<{ ok: boolean; errors: ValidationError[] }> {
  const result = await runPipeline(repoRoot);
  if (!result.ok || !result.dataset) {
    return { ok: false, errors: result.validation.errors };
  }

  const { generated_forms } = runRuleEngine(result.dataset);
  const db = openDb(repoRoot);
  rebuildProjection(db, result.dataset, generated_forms);
  db.close();

  return { ok: true, errors: [] };
}
