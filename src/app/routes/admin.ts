/**
 * Admin / operations routes.
 *
 * POST /api/admin/rebuild  → full pipeline + SQLite rebuild
 * POST /api/admin/export   → generate TEMP/ grammar artifacts
 * GET  /api/admin/status   → DB metadata, entry counts
 * GET  /api/admin/validate → run validation, return results without writing
 */

import { Router, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { getDbMeta } from '../db.js';
import { runPipelineAndRebuild } from '../pipeline-runner.js';
import { validateOnly } from '../../pipeline/index.js';
import { runPipeline } from '../../pipeline/index.js';
import { runRuleEngine } from '../../rules/engine.js';
import { syncGrammarArtifacts } from '../../export/sync.js';

export function adminRouter(
  db: () => DatabaseSync,
  repoRoot: string
): Router {
  const router = Router();

  // GET /api/admin/status
  router.get('/status', (req: Request, res: Response) => {
    try {
      const meta = getDbMeta(db());
      const counts = {
        lexemes: (db().prepare("SELECT COUNT(*) as n FROM entries WHERE entry_kind='lexeme'").get() as { n: number }).n,
        morphemes: (db().prepare("SELECT COUNT(*) as n FROM entries WHERE entry_kind='morpheme'").get() as { n: number }).n,
        rules: (db().prepare("SELECT COUNT(*) as n FROM rules").get() as { n: number }).n,
        forms: (db().prepare("SELECT COUNT(*) as n FROM generated_forms").get() as { n: number }).n,
        examples: (db().prepare("SELECT COUNT(*) as n FROM examples").get() as { n: number }).n,
      };
      res.json({ meta, counts });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/admin/validate
  router.get('/validate', async (_req: Request, res: Response) => {
    try {
      const result = await validateOnly(repoRoot);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/admin/rebuild
  router.post('/rebuild', async (_req: Request, res: Response) => {
    try {
      const { ok, errors } = await runPipelineAndRebuild(repoRoot);
      if (!ok) {
        return res.status(422).json({ ok: false, errors });
      }
      const counts = {
        lexemes: (db().prepare("SELECT COUNT(*) as n FROM entries WHERE entry_kind='lexeme'").get() as { n: number }).n,
        morphemes: (db().prepare("SELECT COUNT(*) as n FROM entries WHERE entry_kind='morpheme'").get() as { n: number }).n,
        forms: (db().prepare("SELECT COUNT(*) as n FROM generated_forms").get() as { n: number }).n,
      };
      res.json({ ok: true, counts });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/admin/export
  router.post('/export', async (_req: Request, res: Response) => {
    try {
      const result = await runPipeline(repoRoot);
      if (!result.ok || !result.dataset) {
        return res.status(422).json({ ok: false, errors: result.validation.errors });
      }
      const { generated_forms } = runRuleEngine(result.dataset);
      const manifest = await syncGrammarArtifacts(repoRoot, result.dataset, generated_forms);
      res.json({ ok: true, manifest });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
