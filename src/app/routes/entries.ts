/**
 * REST routes for lexeme and morpheme CRUD.
 *
 * GET  /api/entries           → all entries (with optional ?category= ?status= ?q=)
 * GET  /api/entries/:key      → single entry by key
 * GET  /api/entries/:key/forms → generated forms for a lexeme
 * GET  /api/entries/:key/examples → usage examples for a lexeme
 *
 * POST   /api/entries         → create entry (writes YAML, rebuilds DB)
 * PUT    /api/entries/:key    → update entry (writes YAML, rebuilds DB)
 * DELETE /api/entries/:key    → delete entry (removes YAML, rebuilds DB)
 */

import { Router, type Request, type Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { DatabaseSync } from 'node:sqlite';
import {
  getAllEntries,
  getLexemes,
  getMorphemes,
  getEntryByKey,
  getFormsForLexeme,
  getExamplesForLexeme,
  searchEntries,
  searchEntrySuggestions,
  getEntriesByCategory,
  getEntriesByStatus,
} from '../db.js';
import { runPipelineAndRebuild } from '../pipeline-runner.js';

export function entriesRouter(
  db: () => DatabaseSync,
  repoRoot: string
): Router {
  const router = Router();

  // GET /api/entries
  router.get('/', (req: Request, res: Response) => {
    try {
      const { q, category, status, kind } = req.query as Record<string, string>;
      let entries;

      if (q) {
        entries = searchEntries(db(), q);
      } else if (category) {
        entries = getEntriesByCategory(db(), category);
      } else if (status) {
        entries = getEntriesByStatus(db(), status as 'active' | 'draft' | 'deprecated');
      } else if (kind === 'lexeme') {
        entries = getLexemes(db());
      } else if (kind === 'morpheme') {
        entries = getMorphemes(db());
      } else {
        entries = getAllEntries(db());
      }

      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/entries/suggest
  router.get('/suggest', (req: Request, res: Response) => {
    try {
      const q = String(req.query['q'] ?? '').trim();
      const limit = Number(req.query['limit'] ?? 20);
      const suggestions = q ? searchEntrySuggestions(db(), q, limit) : [];
      res.json({ suggestions, count: suggestions.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/entries/:key
  router.get('/:key', (req: Request, res: Response) => {
    try {
      const entry = getEntryByKey(db(), req.params['key']!);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/entries/:key/forms
  router.get('/:key/forms', (req: Request, res: Response) => {
    try {
      const forms = getFormsForLexeme(db(), req.params['key']!);
      res.json({ forms });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/entries/:key/examples
  router.get('/:key/examples', (req: Request, res: Response) => {
    try {
      const examples = getExamplesForLexeme(db(), req.params['key']!);
      res.json({ examples });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/entries — create new entry
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body['key'] || !body['entry_kind']) {
        return res.status(400).json({ error: 'key and entry_kind are required' });
      }

      const key = String(body['key']);
      const kind = String(body['entry_kind']) as 'lexeme' | 'morpheme';

      // Determine file path
      const filePath = resolveFilePath(repoRoot, key, kind, body);

      if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: `File already exists: ${filePath}` });
      }

      writeYamlEntry(filePath, body);
      const { ok, errors } = await runPipelineAndRebuild(repoRoot);

      if (!ok) {
        // Rollback
        fs.unlinkSync(filePath);
        return res.status(422).json({ error: 'Validation failed', errors });
      }

      const created = getEntryByKey(db(), key);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PUT /api/entries/:key — update existing entry
  router.put('/:key', async (req: Request, res: Response) => {
    try {
      const key = req.params['key']!;
      const existing = getEntryByKey(db(), key);
      if (!existing) return res.status(404).json({ error: 'Entry not found' });

      const filePath = path.join(repoRoot, existing['source_file'] as string);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Source file not found' });
      }

      // Backup original
      const backup = fs.readFileSync(filePath, 'utf-8');

      const body = req.body as Record<string, unknown>;
      writeYamlEntry(filePath, { ...body, key });

      const { ok, errors } = await runPipelineAndRebuild(repoRoot);
      if (!ok) {
        // Rollback
        fs.writeFileSync(filePath, backup, 'utf-8');
        return res.status(422).json({ error: 'Validation failed', errors });
      }

      const updated = getEntryByKey(db(), key);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/entries/:key
  router.delete('/:key', async (req: Request, res: Response) => {
    try {
      const key = req.params['key']!;
      const existing = getEntryByKey(db(), key);
      if (!existing) return res.status(404).json({ error: 'Entry not found' });

      const filePath = path.join(repoRoot, existing['source_file'] as string);
      const backup = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf-8')
        : null;

      if (backup !== null) fs.unlinkSync(filePath);

      const { ok, errors } = await runPipelineAndRebuild(repoRoot);
      if (!ok && backup !== null && filePath) {
        // Rollback
        fs.writeFileSync(filePath, backup, 'utf-8');
        return res.status(422).json({ error: 'Deletion caused validation error', errors });
      }

      res.json({ deleted: key });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveFilePath(
  repoRoot: string,
  key: string,
  kind: 'lexeme' | 'morpheme',
  body: Record<string, unknown>
): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (kind === 'morpheme') {
    return path.join(repoRoot, 'morphemes', `${safeKey}.yaml`);
  }
  const cat = String(body['major_category'] ?? 'nouns');
  const dirMap: Record<string, string> = {
    noun: 'nouns',
    verb: 'verbs',
    modifier: 'modifiers',
    'function-word': 'function-words',
    postposition: 'postpositions',
  };
  const subDir = dirMap[cat] ?? 'nouns';
  return path.join(repoRoot, 'lexemes', subDir, `${safeKey}.yaml`);
}

function writeYamlEntry(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(filePath, content, 'utf-8');
}
