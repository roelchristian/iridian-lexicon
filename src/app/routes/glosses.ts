/**
 * GET /api/glosses
 *
 * Returns the parsed glossary from glosses/glossary.yaml as JSON.
 * The frontend fetches this once on startup and uses it to render
 * hover tooltips on slot label components (e.g. "PV" in "PV.PERF.NMLZ").
 *
 * Response shape:
 *   { glosses: Record<string, { expansion: string; description?: string; domain?: string }> }
 *
 * The route is stateless: it re-reads the YAML on every request so that
 * authoring changes take effect without restarting the server.
 */

import { Router } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as parseYaml } from 'js-yaml';

export function glossesRouter(repoRoot: string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const glossaryPath = path.join(repoRoot, 'glosses', 'glossary.yaml');

    if (!fs.existsSync(glossaryPath)) {
      // Return an empty glossary rather than a 404 — the UI degrades gracefully.
      res.json({ glosses: {} });
      return;
    }

    try {
      const raw = fs.readFileSync(glossaryPath, 'utf-8');
      const parsed = parseYaml(raw) as {
        glosses?: Record<string, { expansion: string; description?: string; domain?: string }>;
      };
      res.json({ glosses: parsed.glosses ?? {} });
    } catch (err) {
      res.status(500).json({ error: `Failed to parse glossary.yaml: ${String(err)}` });
    }
  });

  return router;
}
