// Step 5: Fetch firm's full portfolio from Crustdata (reverse-investor lookup)
import { companySearchAll, pCrustdata } from '@/lib/clients/crustdata'
import type { FounderProfile } from '@/lib/types'

export type PortfolioEntry = {
  name: string
  domain: string
  categories: string[]
  last_fundraise_date: string | null
  last_round_type: string | null
  last_round_amount_usd: number | null
  co_investors: string[]
}

export async function fetchFirmPortfolio(
  firmName: string,
  founder: FounderProfile
): Promise<PortfolioEntry[]> {
  const companies = await pCrustdata(() =>
    companySearchAll(
      {
        filters: {
          op: 'and',
          conditions: [
            { field: 'funding.investors', type: 'in', value: [firmName] },
          ],
        },
        limit: 100,
      },
      `portfolio:${firmName}:${founder.domain}`
    )
  )

  return companies.map(co => ({
    name: co.basic_info.name,
    domain: co.basic_info.primary_domain,
    categories: (co.taxonomy?.categories ?? []) as string[],
    last_fundraise_date: co.funding?.last_fundraise_date ?? null,
    last_round_type: co.funding?.last_round_type ?? null,
    last_round_amount_usd: co.funding?.last_round_amount_usd ?? null,
    co_investors: co.funding?.investors?.filter((i: string) => i !== firmName) ?? [],
  }))
}

// Derive cadence and conflict info from portfolio
export type PortfolioSignal = {
  rounds_last_12mo: number
  all_round_types: string[]
  conflict_flag: boolean
  weak_adjacency_count: number
  portfolio_deals_in_set: number
  competitors_funded: string[]
}

export function analyzePortfolio(
  portfolio: PortfolioEntry[],
  founderDomain: string,
  competitorNames: string[]
): PortfolioSignal {
  const now = Date.now()
  const yr = 365 * 24 * 60 * 60 * 1000
  const eighteenMo = 18 * 30 * 24 * 60 * 60 * 1000

  const rounds12mo = portfolio.filter(p => {
    if (!p.last_fundraise_date) return false
    return now - new Date(p.last_fundraise_date).getTime() < yr
  }).length

  const allRoundTypes = [...new Set(portfolio.map(p => p.last_round_type).filter(Boolean) as string[])]

  // Conflict: a portfolio company is the exact founder domain AND funded < 18 months ago
  // Deliberately NOT matching by competitor names — those are too noisy (off-topic companies
  // share category tags). Only flag a true conflict if the exact founder domain is in portfolio.
  let conflictFlag = false
  const competitorsFunded: string[] = []
  const competitorDomains = new Set(competitorNames.map(n => n.toLowerCase()))

  for (const p of portfolio) {
    const isExactFounder = p.domain === founderDomain
    if (isExactFounder && p.last_fundraise_date &&
        now - new Date(p.last_fundraise_date).getTime() < eighteenMo) {
      conflictFlag = true
    }
    // Track competitor name matches for portfolio_deals_in_set (UI info only, not conflict)
    if (competitorDomains.has(p.name.toLowerCase())) {
      competitorsFunded.push(p.name)
    }
  }

  return {
    rounds_last_12mo: rounds12mo,
    all_round_types: allRoundTypes,
    conflict_flag: conflictFlag,
    weak_adjacency_count: 0,  // no penalty for portfolio size; conflict_flag handles hard drops
    portfolio_deals_in_set: competitorsFunded.length,
    competitors_funded: competitorsFunded,
  }
}
