import { Router, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import {
  getAllAvailableTags,
  getInflectionProfileSuggestions,
  getTemplateSuggestions,
} from '../db.js';

export function suggestionsRouter(db: () => DatabaseSync): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      res.json({
        tags: getAllAvailableTags(db()),
        templates: getTemplateSuggestions(db()),
        profiles: getInflectionProfileSuggestions(db()),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/tags', (req: Request, res: Response) => {
    try {
      const q = String(req.query['q'] ?? '').trim().toLowerCase();
      const tags = getAllAvailableTags(db()).filter((tag) => !q || tag.toLowerCase().includes(q));
      res.json({ tags, count: tags.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/templates', (req: Request, res: Response) => {
    try {
      const q = String(req.query['q'] ?? '').trim().toLowerCase();
      const templates = getTemplateSuggestions(db()).filter((template) => {
        if (!q) return true;
        return [
          template.key,
          template.label,
          template.name,
          template.friendly_name ?? '',
          template.category ?? '',
        ].some((value) => value.toLowerCase().includes(q));
      });
      res.json({ templates, count: templates.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/profiles', (req: Request, res: Response) => {
    try {
      const q = String(req.query['q'] ?? '').trim().toLowerCase();
      const profiles = getInflectionProfileSuggestions(db()).filter((profile) => {
        if (!q) return true;
        return profile.value.toLowerCase().includes(q)
          || profile.categories.some((category) => category.toLowerCase().includes(q));
      });
      res.json({ profiles, count: profiles.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
