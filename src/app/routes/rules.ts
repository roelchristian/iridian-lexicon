/**
 * REST routes for rules inspection, form preview, and authoring.
 *
 * GET  /api/rules             → all rules (optional ?kind=inflection|morphotactic|syntax)
 * GET  /api/rules/:key        → single rule by key
 * GET  /api/rules/:key/preview?lexeme=KEY → preview generated forms for a lexeme against a rule
 * POST /api/rules/inflection  → create new inflection rule (writes YAML, rebuilds DB)
 * PUT  /api/rules/inflection/:key → update inflection rule (writes YAML, rebuilds DB)
 */

import { Router, type Request, type Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { DatabaseSync } from 'node:sqlite';
import { getAllRules, getEntriesForRule, getRuleByKey, getRulesByKind } from '../db.js';
import { buildRuleIndex, generateForms } from '../../rules/inflection.js';
import type { ValidatedInflectionRule } from '../../schema/validators.js';
import type { NormalizedLexeme } from '../../pipeline/normalizer.js';
import { runPipelineAndRebuild } from '../pipeline-runner.js';

export function rulesRouter(db: () => DatabaseSync, repoRoot: string): Router {
  const router = Router();

  // GET /api/rules
  router.get('/', (req: Request, res: Response) => {
    try {
      const { kind } = req.query as Record<string, string>;
      const rules = kind
        ? getRulesByKind(db(), kind as 'inflection' | 'morphotactic' | 'syntax')
        : getAllRules(db());
      res.json({ rules, count: rules.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/rules/inflection — create new inflection rule
  // Must be declared before /:key to avoid "inflection" being treated as a key.
  router.post('/inflection', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const key = String(body['key'] ?? '').trim();
      if (!key) return res.status(400).json({ error: 'key is required' });

      const filePath = path.join(repoRoot, 'rules', 'inflection', `${key}.yaml`);
      if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: `Rule already exists: ${filePath}` });
      }

      writeYamlRule(filePath, body);
      const { ok, errors } = await runPipelineAndRebuild(repoRoot);

      if (!ok) {
        fs.unlinkSync(filePath);
        return res.status(422).json({ error: 'Validation failed', errors });
      }

      const created = getRuleByKey(db(), key);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PUT /api/rules/inflection/:key — update existing inflection rule
  router.put('/inflection/:key', async (req: Request, res: Response) => {
    try {
      const key = req.params['key']!;
      const existing = getRuleByKey(db(), key) as Record<string, unknown> | undefined;
      if (!existing) return res.status(404).json({ error: 'Rule not found' });

      // Derive file path: either from DB source_file or convention
      const sourceFile = String(existing['source_file'] ?? `rules/inflection/${key}.yaml`);
      const filePath = sourceFile.startsWith('/')
        ? sourceFile
        : path.join(repoRoot, sourceFile);

      const backup = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;

      const body = req.body as Record<string, unknown>;
      writeYamlRule(filePath, { ...body, key });

      const { ok, errors } = await runPipelineAndRebuild(repoRoot);
      if (!ok) {
        if (backup !== null) fs.writeFileSync(filePath, backup, 'utf-8');
        return res.status(422).json({ error: 'Validation failed', errors });
      }

      const updated = getRuleByKey(db(), key);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/rules/:key
  router.get('/:key', (req: Request, res: Response) => {
    try {
      const rule = getRuleByKey(db(), req.params['key']!);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      res.json(rule);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/rules/:key/entries
  router.get('/:key/entries', (req: Request, res: Response) => {
    try {
      const rule = getRuleByKey(db(), req.params['key']!);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });

      const entries = getEntriesForRule(db(), req.params['key']!);
      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /api/rules/:key/preview?lexeme=KEY
  router.get('/:key/preview', (req: Request, res: Response) => {
    try {
      const ruleKey = req.params['key']!;
      const ruleRow = getRuleByKey(db(), ruleKey) as Record<string, unknown> | undefined;
      if (!ruleRow || ruleRow['rule_kind'] !== 'inflection') {
        return res.status(404).json({ error: 'Inflection rule not found' });
      }

      const lexemeKey = (req.query as Record<string, string>)['lexeme'];
      if (!lexemeKey) {
        return res.status(400).json({ error: '?lexeme=KEY is required' });
      }

      const entryRow = db().prepare("SELECT * FROM entries WHERE key = $key").get({ key: lexemeKey }) as Record<string, unknown> | undefined;
      if (!entryRow) {
        return res.status(404).json({ error: `Lexeme "${lexemeKey}" not found` });
      }

      const stemVariants = JSON.parse(String(entryRow['stem_variants_json'] ?? '[]'));
      const manualOverrides = JSON.parse(String(entryRow['manual_overrides_json'] ?? '{}'));

      const mockLexeme: NormalizedLexeme = {
        id: String(entryRow['id']),
        key: String(entryRow['key']),
        lemma: String(entryRow['lemma']),
        display_lemma: String(entryRow['display_lemma']),
        entry_kind: 'lexeme',
        major_category: String(entryRow['major_category']) as 'noun',
        subtype: String(entryRow['subtype']),
        glosses: JSON.parse(String(entryRow['glosses_json'])),
        notes: String(entryRow['notes'] ?? ''),
        tags: JSON.parse(String(entryRow['tags_json'] ?? '[]')),
        status: String(entryRow['status']) as 'active',
        schema_version: '1.0',
        stem_variants: stemVariants,
        manual_overrides: manualOverrides,
        usage_examples: [],
        attested_in: [],
        source_file: String(entryRow['source_file']),
        template_id: ruleKey,
      };

      const ruleData = ruleRow['data'] as ValidatedInflectionRule;
      const ruleIndex = buildRuleIndex([ruleData]);
      const forms = generateForms(mockLexeme, ruleIndex);

      res.json({ lexeme: lexemeKey, rule: ruleKey, forms });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeYamlRule(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = yaml.dump(data, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(filePath, content, 'utf-8');
}
