// Contract shapes matching lumen/plans/api_contract.md

export type Location = {
  city: string
  country: string
  country_iso3: string
}

export type CompanyShape = {
  name: string
  domain: string
  description: string
  industry: string
  sub_industry: string
  stage: string
  headcount: number | null
  founded_year: number | null
  location: Location | null
  funding: {
    total_raised_usd: number | null
    last_round: string | null
    last_round_date: string | null
    investors: string[]
  }
  metrics: {
    web_traffic_monthly: number | null
    web_traffic_qoq_pct: number | null
    headcount_qoq_pct: number | null
  }
  founders: Array<{
    name: string
    title: string
    linkedin_url: string | null
    previous_company: string | null
    previous_title: string | null
    education: string | null
  }>
  crustdata_company_id: string | null
}

export type CompetitorShape = {
  name: string
  domain: string
  stage: string | null
  headcount: number | null
  total_raised_usd: number | null
  crustdata_company_id: string | null
  investors: string[]
}

export type InvestorFrequencyShape = {
  investor_name: string
  deals_in_set: number
  companies_funded: string[]
  stages_invested: string[]
  total_deployed_in_set_usd: number
}

export type RecentSignal = {
  type: 'linkedin_post' | 'blog_post' | 'conference_talk' | 'twitter_thread' | 'news' | 'other'
  title: string
  date: string
  days_ago: number
  snippet: string
  url?: string | null
}

export type RecommendedPartner = {
  name: string
  title: string
  linkedin_url: string | null
  background_summary: string
  recent_signal: RecentSignal | null
  affinity_signals: {
    sector_experience: boolean
    operator_background_in_sector: boolean
    invested_in_competitor: boolean
    similar_founder_profile_backed: boolean
  }
  outreach_angle: string
}

export type ScoreBreakdown = {
  sector_fit: number      // 0–25
  stage_alignment: number // 0–25
  portfolio_gap: number   // 0–20
  partner_affinity: number // 0–15
  thesis_recency: number  // 0–15
}

export type VcMatchShape = {
  tier: 1 | 2
  firm_name: string
  formerly: string | null
  score: number  // 0–100
  score_breakdown: ScoreBreakdown
  check_size: string | null
  stage_preference: string | null
  portfolio_deals_in_set: number
  competitors_funded: string[]
  reasons: string[]
  portfolio_gap_analysis: string
  thesis_alignment: string
  open_window: boolean
  recommended_partner: RecommendedPartner | null
}

export type SimilarFounder = {
  name: string
  company: string
  raise_summary: string
  key_investors: string[]
  note: string
}

export type AnalysisResult = {
  analysis_id: string
  status: 'complete' | 'processing' | 'error'
  domain: string
  created_at: string
  completed_at: string | null
  duration_seconds: number | null
  company: CompanyShape | null
  competitors: CompetitorShape[]
  investor_network: {
    unique_investors_count: number
    funding_rounds_analyzed: number
    investor_frequency: InvestorFrequencyShape[]
  }
  vc_matches: VcMatchShape[]
  similar_founders: SimilarFounder[]
  pattern_analysis: string
}

// SSE event payloads

export type SseStageStart = {
  type: 'stage_start'
  analysis_id: string
  stage: string
  total_stages: number
  label: string
  description: string
  timestamp: string
}

export type SseStageComplete = {
  type: 'stage_complete'
  analysis_id: string
  stage: string
  label: string
  data_preview: string
  stage_data: unknown
  timestamp: string
}

export type SseStageError = {
  type: 'stage_error'
  analysis_id: string
  stage: string
  label: string
  error: string
  recoverable: boolean
  timestamp: string
}

export type SseResultsReady = {
  type: 'results_ready'
  analysis_id: string
  results: AnalysisResult
}

export type SseFatalError = {
  type: 'error'
  analysis_id: string
  error: string
  code: string
  timestamp: string
}

export type SseEvent = SseStageStart | SseStageComplete | SseStageError | SseResultsReady | SseFatalError

export const STAGE_LABELS: Record<string, { label: string; description: string }> = {
  '1':  { label: 'Company profile enriched',  description: 'Fetching from Crustdata Company Enrich API' },
  '2':  { label: 'Competitors discovered',     description: 'Searching for similar companies via Crustdata' },
  '3':  { label: 'Investor networks mapped',   description: 'Extracting investor data from competitor cap tables' },
  '4':  { label: 'VC firms ranked',            description: 'Building candidate universe and preliminary ranking' },
  '5a': { label: 'VC partners profiled',       description: 'Finding and enriching investment partners via Crustdata' },
  '5b': { label: 'Web intelligence gathered',  description: 'Gathering thesis signals via Exa and SEC EDGAR' },
  '6':  { label: 'Scoring complete',           description: 'AI scoring and synthesis via OpenAI' },
}
