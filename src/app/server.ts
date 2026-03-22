/**
 * Iridian Lexicon — local web app server.
 *
 * Start with:  npx tsx src/app/server.ts
 * Then open:   http://localhost:3737
 *
 * The server:
 *   • Serves the single-page editing app at /
 *   • Serves the user manual at /manual
 *   • Exposes REST API at /api/*
 *   • Opens (or creates) the SQLite projection on startup
 *   • Keeps the DB open as a singleton for the process lifetime
 */

import express from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';

import { openDb, needsRebuild } from '../db/builder.js';
import { runPipelineAndRebuild } from './pipeline-runner.js';
import { entriesRouter } from './routes/entries.js';
import { rulesRouter } from './routes/rules.js';
import { adminRouter } from './routes/admin.js';
import { glossesRouter } from './routes/glosses.js';
import { settingsRouter } from './routes/settings.js';
import { suggestionsRouter } from './routes/suggestions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env['PORT'] ?? 3737);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------
let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!_db) throw new Error('DB not initialized');
  return _db;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main() {
  console.log('Iridian Lexicon — starting up…');
  console.log(`  Repo root: ${REPO_ROOT}`);

  // Open DB
  _db = openDb(REPO_ROOT);

  // Auto-rebuild if DB is missing, empty, or at wrong schema version
  if (needsRebuild(_db)) {
    console.log('  SQLite projection missing or outdated — rebuilding…');
    const { ok, errors } = await runPipelineAndRebuild(REPO_ROOT);
    if (!ok) {
      console.error('  ⚠ Initial rebuild had validation errors:');
      for (const err of errors) {
        console.error(`    ${err.file}: ${err.message}`);
      }
      console.log('  App will still start; fix errors and POST /api/admin/rebuild.');
    } else {
      console.log('  ✓ SQLite rebuilt.');
    }
    // Re-open DB after rebuild
    _db.close();
    _db = openDb(REPO_ROOT);
  } else {
    console.log('  ✓ SQLite projection is current.');
  }

  // ---------------------------------------------------------------------------
  // Express app
  // ---------------------------------------------------------------------------
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Static assets
  if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
  }

  // API routes
  app.use('/api/entries', entriesRouter(getDb, REPO_ROOT));
  app.use('/api/rules', rulesRouter(getDb, REPO_ROOT));
  app.use('/api/admin', adminRouter(getDb, REPO_ROOT));
  app.use('/api/glosses', glossesRouter(REPO_ROOT));
  app.use('/api/settings', settingsRouter(REPO_ROOT));
  app.use('/api/suggestions', suggestionsRouter(getDb));

  // SPA fallback: serve index.html for /  and /manual
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  const manualPath = path.join(PUBLIC_DIR, 'manual.html');

  app.get('/', (_req, res) => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send('<h1>Iridian Lexicon</h1><p>UI assets not found. Run the build.</p>');
    }
  });

  app.get('/manual', (_req, res) => {
    if (fs.existsSync(manualPath)) {
      res.sendFile(manualPath);
    } else {
      res.status(404).send('<h1>Manual not found</h1>');
    }
  });

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  ✓ Iridian Lexicon running at http://localhost:${PORT}`);
    console.log(`    Editing app : http://localhost:${PORT}/`);
    console.log(`    User manual : http://localhost:${PORT}/manual`);
    console.log(`    API base    : http://localhost:${PORT}/api`);
    console.log('\n  Press Ctrl-C to stop.\n');
  });
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
