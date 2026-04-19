// Step 1: Profile founder from domain (or LinkedIn URL)
import { companyEnrich, companySearch } from '@/lib/clients/crustdata'
import { jsonComplete } from '@/lib/clients/openai'
import type { FounderProfile } from '@/lib/types'

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    industry: { type: 'string' },
    sub_industry: { type: 'string' },
    stage: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
  },
  required: ['industry', 'sub_industry', 'stage', 'categories', 'description'],
  additionalProperties: false,
}

export async function profileFounder(domain: string): Promise<FounderProfile> {
  // companyEnrich only returns basic_info; use companySearch by domain for full data
  const [enrichData, searchResult] = await Promise.all([
    companyEnrich(domain),
    companySearch(
      {
        filters: {
          op: 'and',
          conditions: [{ field: 'basic_info.primary_domain', type: 'in', value: [domain] }],
        },
        limit: 1,
      },
      `profile_search:${domain}`
    ),
  ])

  const fullData = searchResult.companies[0] ?? null
  const basicData = enrichData ?? fullData

  if (!basicData) {
    throw Object.assign(new Error(`Company not found for domain: ${domain}`), { code: 'COMPANY_NOT_FOUND' })
  }

  const companyName = basicData.basic_info.name
  // taxonomy.categories comes from search result (enrich doesn't have it)
  const rawCategories = (fullData?.taxonomy?.categories ?? basicData.taxonomy?.categories ?? []) as string[]
  const rawIndustry = (fullData?.taxonomy?.professional_network_industry ?? basicData.taxonomy?.professional_network_industry ?? '') as string

  const funding = (fullData?.funding ?? basicData.funding) as {
    total_investment_usd?: number | null
    last_round_type?: string | null
    last_fundraise_date?: string | null
    investors?: string[]
  } | null

  const headcountData = (fullData?.headcount ?? basicData.headcount) as { total?: number | null; qoq_pct?: number | null } | null
  const webTrafficData = (fullData?.web_traffic ?? basicData.web_traffic) as { monthly_visitors?: number | null; qoq_pct?: number | null } | null

  // locations is a dict {country, state, city} in search response
  const locRaw = fullData?.locations as { country?: string; state?: string | null; city?: string | null } | null

  // Use OpenAI to normalize industry/stage/categories for India VC context
  const classification = await jsonComplete<{
    industry: string
    sub_industry: string
    stage: string
    categories: string[]
    description: string
  }>(
    'You are a startup analyst specializing in Indian VC deals. Classify the company strictly from the data given.',
    `Company: ${companyName}
Domain: ${domain}
Crustdata categories: ${rawCategories.join(', ')}
Industry: ${rawIndustry}
Headcount: ${headcountData?.total ?? 'unknown'}
Total funding USD: ${funding?.total_investment_usd ?? 0}
Last round type: ${funding?.last_round_type ?? 'unknown'}

Return JSON with:
- industry: e.g. "Healthtech", "Fintech", "SaaS", "Consumer"
- sub_industry: e.g. "AI Diagnostics", "Digital Pharmacy", "Clinical Workflow"
- stage: exactly one of "Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"
- categories: 2-5 Crustdata-style category strings (keep existing + add relevant ones)
- description: one sentence describing what the company does`,
    CLASSIFY_SCHEMA
  )

  const crustdataId = String(basicData.crustdata_company_id ?? (fullData as { crustdata_company_id?: unknown } | null)?.crustdata_company_id ?? '')

  return {
    domain,
    company_name: companyName,
    description: classification.description,
    industry: classification.industry,
    sub_industry: classification.sub_industry,
    stage: classification.stage,
    headcount: headcountData?.total ?? null,
    founded_year: basicData.basic_info.year_founded ?? null,
    location: locRaw?.country ? {
      city: locRaw.city ?? '',
      country: locRaw.country ?? '',
      country_iso3: '',
    } : null,
    funding: {
      total_raised_usd: funding?.total_investment_usd ?? null,
      last_round: funding?.last_round_type ?? null,
      last_round_date: funding?.last_fundraise_date ?? null,
      investors: funding?.investors ?? [],
    },
    metrics: {
      web_traffic_monthly: webTrafficData?.monthly_visitors ?? null,
      web_traffic_qoq_pct: webTrafficData?.qoq_pct ?? null,
      headcount_qoq_pct: headcountData?.qoq_pct ?? null,
    },
    founders: [],
    categories: classification.categories,
    crustdata_company_id: crustdataId,
  }
}
