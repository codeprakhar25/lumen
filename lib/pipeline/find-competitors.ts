// Step 2: Find competitor companies via Crustdata forward search
import { companySearchAll, type CrustCompany, pCrustdata } from '@/lib/clients/crustdata'
import type { FounderProfile, Competitor } from '@/lib/types'
import { env } from '@/lib/env'

export async function findCompetitors(founder: FounderProfile): Promise<Competitor[]> {
  const cats = founder.categories.slice(0, 5)  // cap categories to avoid over-broad queries

  // Fan out across categories in parallel, then dedupe
  const results = await Promise.all(
    cats.map(cat => pCrustdata(() =>
      companySearchAll(
        {
          filters: {
            op: 'and',
            conditions: [
              { field: 'taxonomy.categories', type: 'in', value: [cat] },
              { field: 'basic_info.primary_domain', type: 'not_in', value: [founder.domain] },
              { field: 'basic_info.year_founded', type: '=>', value: new Date().getFullYear() - 12 },
            ],
          },
          limit: 50,
        },
        `competitors:${founder.domain}:${cat}`
      )
    ))
  )

  // Dedupe by domain and track how many categories each company matched
  const seen = new Map<string, { co: CrustCompany; matchCount: number }>()
  for (const [i, page] of results.entries()) {
    for (const co of page) {
      const d = co.basic_info.primary_domain
      if (!d) continue
      const existing = seen.get(d)
      if (!existing) {
        seen.set(d, { co, matchCount: 1 })
      } else {
        existing.matchCount++
      }
    }
  }

  // Require at least 2 category matches to filter out off-topic companies (e.g. Swiggy showing
  // up in health results because it has "Health Care" as one of 30 categories)
  const minCategoryMatches = cats.length >= 3 ? 2 : 1
  const all: CrustCompany[] = [...seen.values()]
    .filter(({ matchCount }) => matchCount >= minCategoryMatches)
    .map(({ co }) => co)

  // Client-side geo filter: keep India-based or no location info
  // locations is a dict { country, state, city } (not an array)
  const indiaFiltered = all.filter(co => {
    const loc = co.locations
    if (!loc || !loc.country) return true
    return loc.country === 'IND' || loc.country === 'India' || loc.country?.toLowerCase().includes('india')
  })

  // Exclude giant conglomerates (headcount > 20k) — they're not sector competitors
  const sizedFiltered = indiaFiltered.filter(co => {
    const hc = (co.headcount as { total?: number } | null)?.total ?? 0
    return hc === 0 || hc <= 20000
  })

  // Sort by total funding desc, keep top MAX_COMPETITORS
  const sorted = sizedFiltered
    .sort((a, b) => (b.funding?.total_investment_usd ?? 0) - (a.funding?.total_investment_usd ?? 0))
    .slice(0, env.MAX_COMPETITORS)

  return sorted.map(co => ({
    name: co.basic_info.name,
    domain: co.basic_info.primary_domain,
    stage: co.funding?.last_round_type ?? null,
    headcount: co.headcount?.total ?? null,
    total_raised_usd: co.funding?.total_investment_usd ?? null,
    crustdata_company_id: co.crustdata_company_id,
    investors: co.funding?.investors ?? [],
    last_fundraise_date: co.funding?.last_fundraise_date ?? null,
    last_round_type: co.funding?.last_round_type ?? null,
  }))
}
