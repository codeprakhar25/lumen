// Core domain types shared across the pipeline

export type FounderProfile = {
  domain: string
  company_name: string
  description: string
  industry: string
  sub_industry: string
  stage: string  // "Pre-Seed" | "Seed" | "Series A" | ...
  headcount: number | null
  founded_year: number | null
  location: { city: string; country: string; country_iso3: string } | null
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
  founders: FounderPerson[]
  categories: string[]  // Crustdata taxonomy categories
  crustdata_company_id: string | null
}

export type FounderPerson = {
  name: string
  title: string
  linkedin_url: string | null
  previous_company: string | null
  previous_title: string | null
  education: string | null
}

export type Competitor = {
  name: string
  domain: string
  stage: string | null
  headcount: number | null
  total_raised_usd: number | null
  crustdata_company_id: string | null
  investors: string[]
  last_fundraise_date: string | null
  last_round_type: string | null
}

export type InvestorHit = {
  investor_name: string
  deals_in_set: number
  companies_funded: string[]
  stages_invested: string[]
  total_deployed_in_set_usd: number
  latest_date: string | null
  comps_last_12mo: number
  interest_score: number  // 0..1
}

export type PartnerSignal = {
  type: 'linkedin_post' | 'blog_post' | 'conference_talk' | 'twitter_thread' | 'news' | 'other'
  title: string
  date: string
  days_ago: number
  relevance_score: number
  snippet: string
  url: string | null
}

export type Partner = {
  name: string
  firm: string
  title: string
  linkedin_url: string | null
  background: {
    previous_roles: Array<{ company: string; title: string; years?: string }>
    education: string[]
    notable_investments: string[]
    domains_of_focus: string[]
  }
  affinity_signals: {
    sector_experience: boolean
    operator_background_in_sector: boolean
    invested_in_competitor: boolean
    similar_founder_profile_backed: boolean
  }
  recent_signal: PartnerSignal | null
}

export type VcCandidate = {
  firm_name: string
  formerly: string | null
  source: ('comp_investor' | 'db_seeded')[]
  interest_score: number  // 0..1 from step 3
  // Populated in steps 5–9
  portfolio_deals_in_set: number
  competitors_funded: string[]
  partners: Partner[]
  sector_fit_score: number    // 0..25
  stage_alignment_score: number  // 0..25
  portfolio_gap_score: number  // 0..20
  partner_affinity_score: number // 0..15
  thesis_recency_score: number  // 0..15
  score: number  // 0..100 sum
  tier: 1 | 2 | null
  open_window: boolean
  conflict_flag: boolean
  data_quality: 'full' | 'partial' | 'thesis-only' | 'stale-portfolio'
  // AI-synthesized (step 11)
  reasons: string[]
  portfolio_gap_analysis: string
  thesis_alignment: string
  outreach_angle: string
}
