import { z } from 'zod'

const envSchema = z.object({
  CRUSTDATA_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PIPELINE_TIMEOUT_SECONDS: z.coerce.number().default(120),
  MAX_COMPETITORS: z.coerce.number().default(20),
  MAX_PARTNERS_PER_FIRM: z.coerce.number().default(3),
  WEB_SEARCH_QUERIES_MAX: z.coerce.number().default(10),
})

export const env = envSchema.parse(process.env)
