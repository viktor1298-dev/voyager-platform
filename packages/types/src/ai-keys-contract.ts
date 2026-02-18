import { z } from 'zod'

export const aiKeyProviderSchema = z.enum(['openai', 'claude'])

export const aiKeyMetadataSchema = z.object({
  provider: aiKeyProviderSchema,
  model: z.string().min(1).max(120),
  maskedKey: z.string(),
  updatedAt: z.date(),
})

export const aiKeysSaveInputSchema = z.object({
  provider: aiKeyProviderSchema,
  apiKey: z.string().min(1),
  model: z.string().min(1).max(120),
})

export const aiKeysGetInputSchema = z
  .object({
    provider: aiKeyProviderSchema.optional(),
  })
  .optional()

export const aiKeysTestConnectionInputSchema = z.object({
  provider: aiKeyProviderSchema,
})

/**
 * Wrapped contract + legacy compatibility mirror fields.
 * Keeps adapters resilient during migration.
 */
export const aiKeysSaveOutputSchema = z.object({
  key: aiKeyMetadataSchema,
  provider: aiKeyProviderSchema,
  model: z.string().min(1).max(120),
  maskedKey: z.string(),
  updatedAt: z.date(),
})

/**
 * Wrapped list contract + compatibility alias `items`.
 */
export const aiKeysGetOutputSchema = z.object({
  keys: z.array(aiKeyMetadataSchema),
  items: z.array(aiKeyMetadataSchema),
})

export const aiKeysTestConnectionOutputSchema = z.object({
  success: z.literal(true),
  provider: aiKeyProviderSchema,
  model: z.string().min(1).max(120),
})

export type AiKeyMetadata = z.infer<typeof aiKeyMetadataSchema>
