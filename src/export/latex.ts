/**
 * LaTeX macro export.
 *
 * Produces a .tex file defining:
 *   \Lex{key}         — display lemma of a lexeme
 *   \Form{key}{slot}  — a specific inflected form
 *   \Morph{key}       — display form of a morpheme
 *
 * The grammar repo \input{}s this file.  Any unknown key or slot causes
 * LaTeX to emit an \errmessage{} that fails the build loudly.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { LexiconExport, LatexExport } from '../types/index.js';

/** Escape a string for use inside a LaTeX \newcommand argument. */
function latexEscape(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, (c) => '\\' + c)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Convert a key to a LaTeX command name suffix.
 * Keys like "ara", "keth-run" become "ara", "kethrun" (hyphens stripped).
 * This is used internally to name the \newcommand; the public interface
 * still uses \Lex{key} with the original key string.
 */
function keyToMacroSuffix(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '');
}

export function buildLatexExport(exportData: LexiconExport): LatexExport {
  const lines: string[] = [];
  const lexemeKeys: string[] = [];
  const morphemeKeys: string[] = [];
  const formSlots: Record<string, string[]> = {};

  lines.push(
    '% ============================================================',
    '% Iridian Lexicon — auto-generated LaTeX macro table',
    `% Generated: ${exportData.metadata.generated_at}`,
    '% DO NOT EDIT BY HAND. Re-run `lexicon export` to update.',
    '% ============================================================',
    '',
    '% Guard against double-inclusion',
    '\\ifdefined\\IridianLexiconLoaded',
    '  \\endinput',
    '\\fi',
    '\\def\\IridianLexiconLoaded{}',
    '',
  );

  // ---------- \Lex dispatch table ----------
  lines.push(
    '% \\Lex{key} — display lemma of a lexeme',
    '\\newcommand{\\Lex}[1]{%',
    '  \\csname IrdLex@#1\\endcsname%',
    '}',
    '',
  );

  for (const lex of exportData.lexemes.sort((a, b) =>
    a.key.localeCompare(b.key)
  )) {
    const escaped = latexEscape(lex.display_lemma);
    lines.push(
      `\\expandafter\\def\\csname IrdLex@${lex.key}\\endcsname{${escaped}}`
    );
    lexemeKeys.push(lex.key);
  }

  lines.push('');

  // ---------- \Form dispatch table ----------
  lines.push(
    '% \\Form{key}{slot} — a specific inflected form',
    '\\newcommand{\\Form}[2]{%',
    '  \\csname IrdForm@#1@#2\\endcsname%',
    '}',
    '',
  );

  for (const lex of exportData.lexemes) {
    const slots: string[] = [];
    for (const form of lex.forms.sort((a, b) =>
      a.slot.localeCompare(b.slot)
    )) {
      const escaped = latexEscape(form.form);
      lines.push(
        `\\expandafter\\def\\csname IrdForm@${lex.key}@${form.slot}\\endcsname{${escaped}}`
      );
      slots.push(form.slot);
    }
    formSlots[lex.key] = slots;
  }

  lines.push('');

  // ---------- \Morph dispatch table ----------
  lines.push(
    '% \\Morph{key} — display form of a morpheme',
    '\\newcommand{\\Morph}[1]{%',
    '  \\csname IrdMorph@#1\\endcsname%',
    '}',
    '',
  );

  for (const m of exportData.morphemes.sort((a, b) =>
    a.key.localeCompare(b.key)
  )) {
    const escaped = latexEscape(m.display_form);
    lines.push(
      `\\expandafter\\def\\csname IrdMorph@${m.key}\\endcsname{${escaped}}`
    );
    morphemeKeys.push(m.key);
  }

  lines.push('');

  // ---------- Undefined-key error handler ----------
  lines.push(
    '% Undefined key / slot error handler',
    '% Redefine \\IrdKeyError in the grammar preamble to change behaviour.',
    '\\providecommand{\\IrdKeyError}[2]{%',
    '  \\errmessage{Iridian lexicon: unknown #1 "#2"}%',
    '}',
    '',
    '% Patch \\Lex, \\Form, \\Morph to call \\IrdKeyError on undefined CSnames',
    '\\renewcommand{\\Lex}[1]{%',
    '  \\ifcsname IrdLex@#1\\endcsname',
    '    \\csname IrdLex@#1\\endcsname',
    '  \\else',
    '    \\IrdKeyError{\\textbackslash Lex}{#1}%',
    '  \\fi',
    '}',
    '\\renewcommand{\\Form}[2]{%',
    '  \\ifcsname IrdForm@#1@#2\\endcsname',
    '    \\csname IrdForm@#1@#2\\endcsname',
    '  \\else',
    '    \\IrdKeyError{\\textbackslash Form\\{#1\\}}{#2}%',
    '  \\fi',
    '}',
    '\\renewcommand{\\Morph}[1]{%',
    '  \\ifcsname IrdMorph@#1\\endcsname',
    '    \\csname IrdMorph@#1\\endcsname',
    '  \\else',
    '    \\IrdKeyError{\\textbackslash Morph}{#1}%',
    '  \\fi',
    '}',
    '',
    '% End of iridian-lexicon.tex',
  );

  return {
    content: lines.join('\n') + '\n',
    lexeme_keys: lexemeKeys,
    morpheme_keys: morphemeKeys,
    form_slots: formSlots,
  };
}

export function writeLatexExport(
  latexExport: LatexExport,
  outputPath: string
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, latexExport.content, 'utf-8');
}
