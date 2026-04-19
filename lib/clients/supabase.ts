import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Server-side client with service role — never expose to browser
export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export type VcFirm = {
  id: string
  name: string
  sector: string | null
  website: string | null
  linkedin_company_url: string | null
  hq: string | null
  geography_focus: string[] | null
  stage_focus: string[] | null
  sector_tags: string[] | null
  healthtech_investment_count: number | null
  last_investment_date: string | null
  last_investment_company: string | null
  notes: string | null
  created_at: string
}

export type FounderRun = {
  id: string
  analysis_id: string
  input_type: string
  input: string
  status: string
  current_stage: string | null
  founder_profile: unknown
  competitors: unknown
  investor_interest: unknown
  candidate_universe: unknown
  analysis_result: unknown
  error_code: string | null
  error_message: string | null
  timings: unknown
  created_at: string
  completed_at: string | null
}
