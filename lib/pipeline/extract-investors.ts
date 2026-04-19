// Step 3: Extract + score investors from competitor cap tables (pure in-memory)
import type { Competitor, InvestorHit } from '@/lib/types'
import { canonicalize } from '@/lib/scoring/name-dedupe'

export function extractInvestors(
  competitors: Competitor[],
  founderStage: string
): InvestorHit[] {
  const now = Date.now()
  const hits = new Map<string, {
    canon: string
    companies: string[]
    stages: string[]
    dates: number[]
    totalUsd: number
  }>()

  for (const comp of competitors) {
    for (const inv of comp.investors) {
      const canon = canonicalize(inv)
      if (!hits.has(canon)) hits.set(canon, { canon, companies: [], stages: [], dates: [], totalUsd: 0 })
      const h = hits.get(canon)!
      h.companies.push(comp.name)
      if (comp.last_round_type) h.stages.push(comp.last_round_type)
      if (comp.last_fundraise_date) h.dates.push(new Date(comp.last_fundraise_date).getTime())
      h.totalUsd += comp.total_raised_usd ?? 0
    }
  }

  const maxDeals = Math.max(1, ...Array.from(hits.values()).map(h => h.companies.length))

  const result: InvestorHit[] = []
  for (const [, h] of hits) {
    const latestTs = h.dates.length ? Math.max(...h.dates) : null
    const compsLast12mo = h.dates.filter(d => now - d < 365 * 24 * 60 * 60 * 1000).length
    const latestDate = latestTs ? new Date(latestTs).toISOString().slice(0, 10) : null

    // Recency bonus: 0..1 (1 = deal in last 30d, 0 = no deals)
    const recency = latestTs
      ? Math.max(0, 1 - (now - latestTs) / (365 * 24 * 60 * 60 * 1000))
      : 0

    // Stage alignment: do their rounds match the founder's stage?
    const stageMatch = h.stages.some(s =>
      s.toLowerCase().includes(founderStage.toLowerCase().split(' ')[0])
    ) ? 1 : 0.5

    const interestScore =
      0.5 * (h.companies.length / maxDeals) +
      0.3 * recency +
      0.2 * stageMatch

    result.push({
      investor_name: h.canon,
      deals_in_set: h.companies.length,
      companies_funded: [...new Set(h.companies)],
      stages_invested: [...new Set(h.stages)],
      total_deployed_in_set_usd: h.totalUsd,
      latest_date: latestDate,
      comps_last_12mo: compsLast12mo,
      interest_score: Math.min(1, interestScore),
    })
  }

  return result.sort((a, b) => b.interest_score - a.interest_score)
}
