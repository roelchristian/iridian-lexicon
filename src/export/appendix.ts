/**
 * Generates a LaTeX appendix with paradigm tables for all active lexemes.
 *
 * The appendix is stable for diffs: lexemes are sorted by key, forms by slot.
 * Only 'active' status entries are included.
 */

import type { LexiconExport } from '../types/index.js';

function latexEscape(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, (c) => '\\' + c)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

export function buildAppendixLatex(
  exportData: LexiconExport,
  opts: { standalone?: boolean } = {}
): string {
  const { standalone = false } = opts;
  const lines: string[] = [];

  lines.push(
    '% ============================================================',
    '% Iridian Lexicon — auto-generated appendix',
    `% Generated: ${exportData.metadata.generated_at}`,
    '% DO NOT EDIT BY HAND.',
    '% ============================================================',
    '',
  );

  if (standalone) {
    lines.push(
      '\\documentclass[12pt]{book}',
      '\\usepackage{fontspec}',
      '\\begin{document}',
      '',
    );
  }

  lines.push(
    '\\appendix',
    '',
    '\\chapter{Lexical Appendix}',
    '',
  );

  // --- Nouns ---
  const nouns = exportData.lexemes
    .filter((l) => l.major_category === 'noun' && l.status === 'active')
    .sort((a, b) => a.key.localeCompare(b.key));

  if (nouns.length > 0) {
    lines.push('\\section{Nominal Paradigms}', '');
    for (const lex of nouns) {
      lines.push(
        `\\subsection*{\\textit{${latexEscape(lex.display_lemma)}} \\textnormal{(${latexEscape(lex.subtype)})}}`,
        `\\label{lex:${lex.key}}`,
        ''
      );

      const gloss = lex.glosses.map(latexEscape).join('; ');
      lines.push(
        `\\noindent\\textbf{Gloss:} ${gloss}\\\\`,
        ''
      );

      if (lex.forms.length > 0) {
        const sortedForms = [...lex.forms].sort((a, b) =>
          a.slot.localeCompare(b.slot)
        );
        lines.push(
          '\\begin{tabular}{ll}',
          '  \\hline',
          '  \\textbf{Slot} & \\textbf{Form} \\\\',
          '  \\hline',
        );
        for (const form of sortedForms) {
          lines.push(
            `  ${latexEscape(form.slot)} & \\textit{${latexEscape(form.form)}} \\\\`
          );
        }
        lines.push('  \\hline', '\\end{tabular}', '');
      }

      if (lex.notes) {
        lines.push(`\\noindent\\textit{Note:} ${latexEscape(lex.notes)}`, '');
      }
    }
  }

  // --- Verbs ---
  const verbs = exportData.lexemes
    .filter((l) => l.major_category === 'verb' && l.status === 'active')
    .sort((a, b) => a.key.localeCompare(b.key));

  if (verbs.length > 0) {
    lines.push('\\section{Verbal Paradigms}', '');
    for (const lex of verbs) {
      lines.push(
        `\\subsection*{\\textit{${latexEscape(lex.display_lemma)}} \\textnormal{(${latexEscape(lex.subtype)})}}`,
        `\\label{lex:${lex.key}}`,
        ''
      );

      const gloss = lex.glosses.map(latexEscape).join('; ');
      lines.push(`\\noindent\\textbf{Gloss:} ${gloss}\\\\`, '');

      if (lex.forms.length > 0) {
        const sortedForms = [...lex.forms].sort((a, b) =>
          a.slot.localeCompare(b.slot)
        );
        lines.push(
          '\\begin{tabular}{ll}',
          '  \\hline',
          '  \\textbf{Slot} & \\textbf{Form} \\\\',
          '  \\hline',
        );
        for (const form of sortedForms) {
          lines.push(
            `  ${latexEscape(form.slot)} & \\textit{${latexEscape(form.form)}} \\\\`
          );
        }
        lines.push('  \\hline', '\\end{tabular}', '');
      }
    }
  }

  // --- Morpheme inventory ---
  const morphemes = exportData.morphemes
    .filter((m) => m.status === 'active')
    .sort((a, b) => a.key.localeCompare(b.key));

  if (morphemes.length > 0) {
    lines.push('\\section{Morpheme Inventory}', '');
    lines.push(
      '\\begin{tabular}{llll}',
      '  \\hline',
      '  \\textbf{Key} & \\textbf{Form} & \\textbf{Gloss} & \\textbf{Slot} \\\\',
      '  \\hline',
    );
    for (const m of morphemes) {
      lines.push(
        `  ${latexEscape(m.key)} & \\textit{${latexEscape(m.display_form)}} & ${latexEscape(m.gloss_abbr)} & ${latexEscape(m.slot)} \\\\`
      );
    }
    lines.push('  \\hline', '\\end{tabular}', '');
  }

  if (standalone) {
    lines.push('\\end{document}');
  }
  lines.push('% End of appendix-lexicon.tex');
  return lines.join('\n') + '\n';
}
