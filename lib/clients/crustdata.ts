import { env } from '@/lib/env'
import { cached, TTL } from '@/lib/cache'
import pLimit from 'p-limit'

export const pCrustdata = pLimit(5)

const BASE = 'https://api.crustdata.com'
const HEADERS = {
  'Authorization': `Bearer ${env.CRUSTDATA_API_KEY}`,
  'Content-Type': 'application/json',
  'x-api-version': '2025-11-01',
}

async function apiFetch(path: string, body: object): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Crustdata ${path} ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── Company enrich (v2) ────────────────────────────────────────────────────

export type CrustCompany = {
  basic_info: {
    name: string
    primary_domain: string
    website: string | null
    professional_network_url: string | null
    year_founded: number | null
    employee_count_range: string | null
    industries: string[]
  }
  funding: {
    total_investment_usd: number | null
    last_round_amount_usd: number | null
    last_fundraise_date: string | null
    last_round_type: string | null
    investors: string[]
  }
  taxonomy: {
    categories: string[]
    professional_network_industry: string | null
  }
  locations: { country?: string | null; state?: string | null; city?: string | null } | null
  headcount: { total: number | null; qoq_pct: number | null } | null
  web_traffic: { monthly_visitors: number | null; qoq_pct: number | null } | null
  crustdata_company_id: string
}

// Actual response shape from /company/enrich (v2):
// [{ matched_on, match_type, matches: [{ confidence_score, company_data: { crustdata_company_id, basic_info, ... } }] }]
export async function companyEnrich(domain: string): Promise<CrustCompany | null> {
  const cacheKey = `company_enrich:${domain}`
  return cached('cache_crustdata', cacheKey, TTL.CRUSTDATA, async () => {
    const data = await apiFetch('/company/enrich', {
      domains: [domain],
    }) as Array<{
      matched_on: string
      match_type: string
      matches: Array<{ confidence_score: number; company_data: CrustCompany & { crustdata_company_id: number } }>
    }>
    if (!Array.isArray(data) || !data.length) return null
    const best = data[0]?.matches?.[0]
    if (!best) return null
    const cd = best.company_data
    return {
      ...cd,
      crustdata_company_id: String(cd.crustdata_company_id),
    }
  })
}

// ── Company search (v2) ───────────────────────────────────────────────────

type SearchFilter = { field: string; type: string; value: unknown }
type SearchBody = {
  filters: SearchFilter[] | { op: 'and' | 'or'; conditions: unknown[] }
  fields?: string[]
  limit?: number
  cursor?: string | null
  sort?: { field: string; order: 'asc' | 'desc' }
}

export type CrustSearchResult = {
  companies: CrustCompany[]
  total_count: number
  next_cursor: string | null
}

export async function companySearch(body: SearchBody, cacheKey: string): Promise<CrustSearchResult> {
  return cached('cache_crustdata', cacheKey, TTL.CRUSTDATA, async () => {
    return apiFetch('/company/search', body) as Promise<CrustSearchResult>
  })
}

// Paginated search — fetches up to maxResults, respects p-limit
export async function companySearchAll(
  body: Omit<SearchBody, 'cursor'>,
  cacheKey: string,
  maxResults = 100
): Promise<CrustCompany[]> {
  return cached('cache_crustdata', cacheKey, TTL.CRUSTDATA, async () => {
    const results: CrustCompany[] = []
    let cursor: string | null = null
    do {
      const page = await apiFetch('/company/search', { ...body, cursor }) as CrustSearchResult
      results.push(...page.companies)
      cursor = page.next_cursor
    } while (cursor && results.length < maxResults)
    return results.slice(0, maxResults)
  })
}

// ── Person search (v2) ────────────────────────────────────────────────────

type EmploymentEntry = {
  name: string
  title: string
  start_date: string | null
  end_date: string | null
  crustdata_company_id: number | null
  company_professional_network_profile_url?: string | null
}

export type CrustPerson = {
  crustdata_person_id: number
  basic_profile: {
    name: string
    headline: string | null
    location?: { country?: string | null }
  }
  social_handles: {
    professional_network_identifier?: { profile_url: string | null }
  }
  experience: {
    employment_details: {
      current: EmploymentEntry[]
      past: EmploymentEntry[]
    }
  }
  education: {
    schools: Array<{ school: string; degree: string | null }>
  }
}

export async function personSearch(companyName: string, cacheKey: string): Promise<CrustPerson[]> {
  return cached('cache_crustdata', cacheKey, TTL.EDGAR, async () => {
    const data = await apiFetch('/person/search', {
      filters: {
        op: 'and',
        conditions: [
          { field: 'experience.employment_details.current.company_name', type: '=', value: companyName },
        ],
      },
      limit: env.MAX_PARTNERS_PER_FIRM + 2,
    }) as { profiles: CrustPerson[]; total_count: number }
    return data.profiles ?? []
  })
}

// ── Person enrich (v1) ────────────────────────────────────────────────────

export async function personEnrich(linkedinUrl: string): Promise<CrustPerson | null> {
  const cacheKey = `person_enrich:${linkedinUrl}`
  return cached('cache_crustdata', cacheKey, TTL.CRUSTDATA, async () => {
    const res = await fetch(
      `${BASE}/screener/person/enrich?linkedin_url=${encodeURIComponent(linkedinUrl)}`,
      { headers: { 'Authorization': `Bearer ${env.CRUSTDATA_API_KEY}` } }
    )
    if (!res.ok) return null
    return res.json() as Promise<CrustPerson>
  })
}
