/**
 * REST routes for rules inspection and form preview.
 *
 * GET  /api/rules             → all rules
 * GET  /api/rules/:key        → single rule by key
 * GET  /api/rules/:key/preview?lexeme=KEY → preview generated forms for a lexeme against a rule
 */

import { Router, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { getAllRules, getRuleByKey, getRulesByKind } from '../db.js';
import { buildRuleIndex, generateForms } from '../../rules/inflection.js';
import type { ValidatedInflectionRule } from '../../schema/validators.js';
import type { NormalizedLexeme } from '../../pipeline/normalizer.js';

export function rulesRouter(db: () => DatabaseSync): Router {
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

  // GET /api/rules/:key/preview?lexeme=KEY
  // Preview what forms would be generated if a lexeme used this rule
  router.get('/:key/preview', (req: Request, res: Response) => {
    try {
      const ruleRow = getRuleByKey(db(), req.params['key']!);
      if (!ruleRow || ruleRow['rule_kind'] !== 'inflection') {
        return res.status(404).json({ error: 'Inflection rule not found' });
      }

      const lexemeKey = (req.query as Record<string, string>)['lexeme'];
      if (!lexemeKey) {
        return res.status(400).json({ error: '?lexeme=KEY is required' });
      }

      // Build a minimal NormalizedLexeme from the DB entry for preview
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
        template_id: req.params['key'],
        stem_variants: stemVariants,
        manual_overrides: manualOverrides,
        usage_examples: [],
        attested_in: [],
        source_file: String(entryRow['source_file']),
      };

      const ruleData = ruleRow['data'] as ValidatedInflectionRule;
      const ruleIndex = buildRuleIndex([ruleData]);
      const forms = generateForms(mockLexeme, ruleIndex);

      res.json({ lexeme: lexemeKey, rule: req.params['key'], forms });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
