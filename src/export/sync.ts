/**
 * Grammar repo sync step.
 *
 * Writes generated artifacts (JSON export, LaTeX macro table, appendix
 * stubs) into a TEMP/ staging folder inside the lexicon repo.
 *
 * The grammar repo build then copies from TEMP/ at compile time.
 * We NEVER edit any file inside the grammar repo directly from here.
 *
 * Folder layout written by this step:
 *
 *   TEMP/
 *   ├── lexicon-export.json      ← full normalized JSON export
 *   ├── iridian-lexicon.tex      ← \Lex / \Form / \Morph macro table
 *   ├── appendix-lexicon.tex     ← generated appendix (noun/verb tables)
 *   └── sync-manifest.json       ← metadata about this sync run
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { LexiconExport } from '../types/index.js';
import { buildJsonExport, writeJsonExport } from './json.js';
import { buildLatexExport, writeLatexExport } from './latex.js';
import { buildAppendixLatex } from './appendix.js';
import type { NormalizedDataset } from '../pipeline/normalizer.js';
import type { GeneratedForm } from '../types/index.js';

export const TEMP_DIR = 'TEMP';

export interface SyncManifest {
  generated_at: string;
  source_schema_version: string;
  lexeme_count: number;
  morpheme_count: number;
  form_count: number;
  files_written: string[];
}

export async function syncGrammarArtifacts(
  repoRoot: string,
  dataset: NormalizedDataset,
  generatedForms: GeneratedForm[]
): Promise<SyncManifest> {
  const tempDir = path.join(repoRoot, TEMP_DIR);
  fs.mkdirSync(tempDir, { recursive: true });

  const filesWritten: string[] = [];

  // 1. JSON export
  const exportData: LexiconExport = buildJsonExport(dataset, generatedForms);
  const jsonPath = path.join(tempDir, 'lexicon-export.json');
  writeJsonExport(exportData, jsonPath);
  filesWritten.push(path.relative(repoRoot, jsonPath));

  // 2. LaTeX macro table
  const latexExport = buildLatexExport(exportData);
  const latexPath = path.join(tempDir, 'iridian-lexicon.tex');
  writeLatexExport(latexExport, latexPath);
  filesWritten.push(path.relative(repoRoot, latexPath));

  // 3. Appendix LaTeX
  const appendix = buildAppendixLatex(exportData, { standalone: true });
  const appendixPath = path.join(tempDir, 'appendix-lexicon.tex');
  fs.writeFileSync(appendixPath, appendix, 'utf-8');
  filesWritten.push(path.relative(repoRoot, appendixPath));

  // 4. Sync manifest
  const manifest: SyncManifest = {
    generated_at: new Date().toISOString(),
    source_schema_version: exportData.metadata.source_schema_version,
    lexeme_count: exportData.lexemes.length,
    morpheme_count: exportData.morphemes.length,
    form_count: generatedForms.length,
    files_written: filesWritten,
  };
  const manifestPath = path.join(tempDir, 'sync-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  filesWritten.push(path.relative(repoRoot, manifestPath));

  return manifest;
}
