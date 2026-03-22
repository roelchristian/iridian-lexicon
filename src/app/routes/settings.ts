/**
 * GET /api/settings/paradigm-defaults
 *
 * Returns the parsed settings/paradigm-defaults.yaml as JSON.
 * The rule editor reads this to populate the "quick-fill" paradigm buttons
 * and the NEG-prefix radio group.
 *
 * Stateless — re-reads the file on every request so edits take effect
 * immediately without restarting the server.
 */

import { Router } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as parseYaml } from 'js-yaml';

export function settingsRouter(repoRoot: string): Router {
  const router = Router();

  router.get('/paradigm-defaults', (_req, res) => {
    const filePath = path.join(repoRoot, 'settings', 'paradigm-defaults.yaml');

    if (!fs.existsSync(filePath)) {
      res.json({ noun: null, verb: null });
      return;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseYaml(raw) as Record<string, unknown>;
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: `Failed to parse paradigm-defaults.yaml: ${String(err)}` });
    }
  });

  return router;
}
