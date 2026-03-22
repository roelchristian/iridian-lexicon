# Iridian Lexicon

Canonical lexical data, rule sets, and editing app for the Iridian constructed language.

## Quick start

```bash
npm install
npm run validate      # validate all YAML source files
npm run rebuild       # full pipeline → SQLite rebuild
npm run dev:app       # start web app at http://localhost:3737
npm run export        # generate TEMP/ grammar artifacts
```

## Architecture

```
YAML (canonical source)  →  Pipeline  →  SQLite (local projection)
                                    ↓
                                 TEMP/  →  Grammar repo (at build time)
```

**YAML is the source of truth.** SQLite is a derived, rebuildable index — never edit it directly.
Grammar artifacts go into `TEMP/` only. The grammar repo is never edited here directly.

## Directory layout

```
lexemes/            ← one .yaml per lexeme
  nouns/
  verbs/
  modifiers/
  function-words/
morphemes/          ← one .yaml per morpheme
rules/
  inflection/       ← paradigm templates (InflectionRule)
  morphotactics/    ← word-building templates (MorphotacticRule)
  syntax/           ← clause templates (SyntaxRule)
TEMP/               ← generated grammar artifacts
src/                ← TypeScript source
```

## CLI

| Command | Description |
|---|---|
| `npm run validate` | Validate all YAML, report errors, no writes |
| `npm run cli -- migrate` | Preview files needing schema migration |
| `npm run cli -- migrate --rewrite` | Rewrite source files to current schema on disk |
| `npm run rebuild` | Full pipeline + SQLite rebuild |
| `npm run export` | Write `TEMP/` grammar artifacts |

## Web app

Start with `npm run dev:app`, then open:

- **http://localhost:3737** — Lexicon editing app
- **http://localhost:3737/manual** — User manual

## Grammar sync

Run `npm run export` to populate `TEMP/`:

```
TEMP/
├── lexicon-export.json       ← normalized JSON for downstream tools
├── iridian-lexicon.tex       ← \Lex{key} \Form{key}{slot} \Morph{key}
├── appendix-lexicon.tex      ← generated paradigm tables
└── sync-manifest.json
```

Copy these into the grammar repo's input directory. The macros fail loudly on unknown keys.

## Schema versions

- `source_schema_version` — YAML file format (currently `"1.0"`)
- `db_schema_version` — SQLite projection (currently `1`)

These are independent. A DB schema change requires a full `rebuild`; a YAML schema change may require `migrate --rewrite`.

## See also

[User manual](http://localhost:3737/manual) (requires the app to be running)
