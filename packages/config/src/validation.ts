/** Zod schema validation limits — shared across all tRPC routers */

export const LIMITS = {
  NAME_MAX: 255,
  DESCRIPTION_MAX: 2000,
  URL_MAX: 1000,
  ENDPOINT_MAX: 500,
  STATUS_MAX: 50,
  VERSION_MAX: 50,
  LIST_DEFAULT: 50,
  LIST_MAX: 100,
  LOG_TAIL_DEFAULT: 200,
  LOG_TAIL_MAX: 5000,
  AI_QUESTION_MAX: 2000,
  AI_PROMPT_MAX: 4000,
  RULES_ARRAY_MAX: 50,
  SCORE_MAX: 100,
} as const
