/**
 * Zod validation schemas for all canonical YAML source types.
 *
 * These schemas serve dual purpose:
 *   1. Runtime validation of YAML files before they enter the pipeline.
 *   2. Type inference — each .parse() call narrows to the exact TS type.
 *
 * The schemas are intentionally strict: extra keys are stripped, required
 * fields must be present, enums are enforced.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const FeatureValueSchema = z.object({
  feature: z.string().min(1),
  value: z.string().min(1),
});

export const AllomorphRuleSchema = z.object({
  context: z.string().min(1),
  form: z.string().min(1),
  condition: z.string().optional(),
});

export const StemVariantSchema = z.object({
  label: z.string().min(1),
  form: z.string().min(1),
});

export const ExampleTokenSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('form'),
    key: z.string().min(1),
    slot: z.string().min(1),
    literal: z.string().optional(),
    gloss: z.string().optional(),
  }),
  z.object({
    type: z.literal('morpheme'),
    key: z.string().min(1),
    slot: z.string().optional(),
    literal: z.string().optional(),
    gloss: z.string().optional(),
  }),
  z.object({
    type: z.literal('literal'),
    literal: z.string().min(1),
    key: z.string().optional(),
    slot: z.string().optional(),
    gloss: z.string().optional(),
  }),
  z.object({
    type: z.literal('gloss'),
    gloss: z.string().min(1),
    key: z.string().optional(),
    slot: z.string().optional(),
    literal: z.string().optional(),
  }),
]);

export const UsageExampleSchema = z.object({
  id: z.string().min(1),
  source_lang: z.array(ExampleTokenSchema),
  gloss_line: z.array(ExampleTokenSchema),
  translation: z.string().min(1),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const EntryStatusSchema = z.enum(['active', 'draft', 'deprecated']);

const LexemeMajorCategorySchema = z.enum([
  'noun',
  'verb',
  'modifier',
  'function-word',
  'postposition',
]);

const MajorCategorySchema = z.enum([
  'noun',
  'verb',
  'modifier',
  'function-word',
  'postposition',
  'prefix',
  'suffix',
  'infix',
  'circumfix',
  'particle',
  'root',
]);

// ---------------------------------------------------------------------------
// Lexeme schema
// ---------------------------------------------------------------------------

export const LexemeEntrySchema = z
  .object({
    schema_version: z.string().min(1),
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'id must be lowercase alphanumeric with hyphens'),
    key: z
      .string()
      .regex(
        /^[a-zA-Z0-9_.:-]+$/,
        'key must be URL-safe alphanumeric with . _ : -'
      ),
    lemma: z.string().min(1),
    display_lemma: z.string().min(1),
    entry_kind: z.literal('lexeme'),
    major_category: LexemeMajorCategorySchema,
    subtype: z.string().min(1),
    glosses: z.array(z.string().min(1)).min(1),
    notes: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    status: EntryStatusSchema,
    template_id: z.string().optional(),
    inflection_profile: z.string().optional(),
    stem_variants: z.array(StemVariantSchema).optional().default([]),
    manual_overrides: z.record(z.string(), z.string()).optional().default({}),
    usage_examples: z.array(UsageExampleSchema).optional().default([]),
    attested_in: z.array(z.string()).optional().default([]),
  })
  .refine(
    (d) => d.template_id !== undefined || d.inflection_profile !== undefined,
    {
      message: 'Lexeme must have either template_id or inflection_profile',
      path: ['template_id'],
    }
  );

export type ValidatedLexemeEntry = z.infer<typeof LexemeEntrySchema>;

// ---------------------------------------------------------------------------
// Morpheme schema
// ---------------------------------------------------------------------------

export const MorphemeEntrySchema = z.object({
  schema_version: z.string().min(1),
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'id must be lowercase alphanumeric with hyphens'),
  key: z
    .string()
    .regex(
      /^[a-zA-Z0-9_.:-]+$/,
      'key must be URL-safe alphanumeric with . _ : -'
    ),
  lemma: z.string().min(1),
  display_lemma: z.string().min(1),
  entry_kind: z.literal('morpheme'),
  major_category: MajorCategorySchema,
  subtype: z.string().min(1),
  glosses: z.array(z.string().min(1)).min(1),
  notes: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  status: EntryStatusSchema,
  display_form: z.string().min(1),
  gloss_abbr: z.string().min(1),
  slot: z.string().min(1),
  category: z.string().min(1),
  allomorph_rules: z.array(AllomorphRuleSchema).optional().default([]),
  override_hook: z.string().optional(),
});

export type ValidatedMorphemeEntry = z.infer<typeof MorphemeEntrySchema>;

// ---------------------------------------------------------------------------
// Inflection rule schema
// ---------------------------------------------------------------------------

export const ParadigmCellSchema = z.object({
  slot: z.string().min(1),
  features: z.array(FeatureValueSchema),
  prefix: z.string().optional(), // prefix prepended before the stem; notation hyphens stripped at generation
  suffix: z.string(), // empty string is valid (zero morphology)
  stem_variant: z.string().optional(),
  morpheme_key: z.string().optional(),
  notes: z.string().optional(),
});

export const InflectionRuleSchema = z.object({
  schema_version: z.string().min(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  key: z.string().regex(/^[a-zA-Z0-9_.:-]+$/),
  friendly_name: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  category: z.string().min(1),
  feature_axes: z.array(z.array(z.string().min(1))).optional().default([]),
  cells: z.array(ParadigmCellSchema).min(1),
  inherits: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
});

export type ValidatedInflectionRule = z.infer<typeof InflectionRuleSchema>;

// ---------------------------------------------------------------------------
// Morphotactic rule schema
// ---------------------------------------------------------------------------

export const MorphotacticSlotSchema = z.object({
  name: z.string().min(1),
  position: z.number().int().nonnegative(),
  required: z.boolean(),
  allowed_morpheme_keys: z.array(z.string()).optional(),
  requires_co_occurrence: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
});

export const AlternationRuleSchema = z.object({
  name: z.string().min(1),
  context: z.string().min(1),
  result: z.string().min(1),
});

export const MorphotacticRuleSchema = z.object({
  schema_version: z.string().min(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  key: z.string().regex(/^[a-zA-Z0-9_.:-]+$/),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  word_class: z.string().min(1),
  slots: z.array(MorphotacticSlotSchema).min(1),
  alternations: z.array(AlternationRuleSchema).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
});

export type ValidatedMorphotacticRule = z.infer<typeof MorphotacticRuleSchema>;

// ---------------------------------------------------------------------------
// Syntax rule schema
// ---------------------------------------------------------------------------

export const SyntaxSlotConstraintSchema = z.object({
  position: z.number().int().nonnegative(),
  required_type: z.enum(['form', 'morpheme', 'literal']).optional(),
  required_key: z.string().optional(),
  required_slot: z.string().optional(),
  label: z.string().optional(),
  optional: z.boolean().optional(),
});

export const SyntaxRuleSchema = z.object({
  schema_version: z.string().min(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  key: z.string().regex(/^[a-zA-Z0-9_.:-]+$/),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  word_order: z.string().min(1),
  constraints: z.array(SyntaxSlotConstraintSchema).optional().default([]),
  strict_order: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
});

export type ValidatedSyntaxRule = z.infer<typeof SyntaxRuleSchema>;

// ---------------------------------------------------------------------------
// Discriminated union for any source file
// ---------------------------------------------------------------------------

export type AnyValidatedEntry =
  | ValidatedLexemeEntry
  | ValidatedMorphemeEntry
  | ValidatedInflectionRule
  | ValidatedMorphotacticRule
  | ValidatedSyntaxRule;

/**
 * Detect entry kind from a raw parsed YAML object before full validation.
 * Uses duck-typing on mandatory discriminating fields.
 */
export function detectEntryKind(
  raw: unknown
): 'lexeme' | 'morpheme' | 'inflection-rule' | 'morphotactic-rule' | 'syntax-rule' | 'unknown' {
  if (typeof raw !== 'object' || raw === null) return 'unknown';
  const obj = raw as Record<string, unknown>;
  const kind = obj['entry_kind'];
  if (kind === 'lexeme') return 'lexeme';
  if (kind === 'morpheme') return 'morpheme';
  // Rule files use a rule_kind field instead of entry_kind
  const ruleKind = obj['rule_kind'];
  if (ruleKind === 'inflection') return 'inflection-rule';
  if (ruleKind === 'morphotactic') return 'morphotactic-rule';
  if (ruleKind === 'syntax') return 'syntax-rule';
  // Fall back: try inferring from structural presence
  if ('cells' in obj && 'feature_axes' in obj) return 'inflection-rule';
  if ('slots' in obj && 'word_class' in obj) return 'morphotactic-rule';
  if ('constraints' in obj && 'word_order' in obj) return 'syntax-rule';
  return 'unknown';
}
