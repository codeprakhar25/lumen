// Step 4: Build candidate universe — union competitor-investors with DB firms
import { supabase, type VcFirm } from '@/lib/clients/supabase'
import type { InvestorHit } from '@/lib/types'
import { canonicalize } from '@/lib/scoring/name-dedupe'

export type CandidateFirm = VcFirm & {
  source: ('comp_investor' | 'db_seeded')[]
  interest_score: number
  investor_hit: InvestorHit | null
}

// Map the founder's industry string to sector tag(s) used in vc_firms.sector_tags.
// Keep in sync with FOCUS_TAGS in lib/seed/load-csv.ts.
export function industryToSectorTags(industry: string | null | undefined): string[] {
  const s = (industry ?? '').toLowerCase()
  const tags: string[] = []
  if (/health|medical|medtech|clinical|pharma|diagnostic/.test(s)) tags.push('healthtech')
  if (/edtech|education|learning/.test(s)) tags.push('edtech')
  if (/saas|b2b software|enterprise software/.test(s)) tags.push('saas')
  if (/\bai\b|artificial intelligence|machine learning|generative|llm/.test(s)) tags.push('ai')
  if (/fintech|payments|lending|insurance|wealth/.test(s)) tags.push('fintech')
  if (/consumer|d2c|commerce/.test(s)) tags.push('consumer')
  if (/climate|clean(tech)?|renewable|ev/.test(s)) tags.push('climate')
  if (/deeptech|robotics|space|semiconductor/.test(s)) tags.push('deeptech')
  return tags
}

export async function buildCandidates(
  rankedInvestors: InvestorHit[],
  sectorTags: string[],
  maxCandidates = 40
): Promise<CandidateFirm[]> {
  // Load DB firms — overlap on any tag matching the founder's industry.
  // Fall back to the whole table if we couldn't infer a sector.
  let dbQuery = supabase.from('vc_firms').select('*')
  if (sectorTags.length) dbQuery = dbQuery.overlaps('sector_tags', sectorTags)
  const { data: dbFirms } = await dbQuery

  const db: VcFirm[] = dbFirms ?? []

  const investorMap = new Map<string, InvestorHit>()
  for (const inv of rankedInvestors.slice(0, 30)) {
    investorMap.set(canonicalize(inv.investor_name), inv)
  }

  const dbMap = new Map<string, VcFirm>()
  for (const f of db) {
    dbMap.set(canonicalize(f.name), f)
  }

  const candidates = new Map<string, CandidateFirm>()

  for (const [canon, inv] of investorMap) {
    candidates.set(canon, {
      id: '',
      name: inv.investor_name,
      sector: null,
      website: null,
      linkedin_company_url: null,
      hq: null,
      geography_focus: null,
      stage_focus: null,
      sector_tags: sectorTags.length ? sectorTags : null,
      healthtech_investment_count: null,
      last_investment_date: null,
      last_investment_company: null,
      notes: null,
      created_at: new Date().toISOString(),
      source: ['comp_investor'],
      interest_score: inv.interest_score,
      investor_hit: inv,
    })
  }

  for (const [canon, firm] of dbMap) {
    if (candidates.has(canon)) {
      const existing = candidates.get(canon)!
      candidates.set(canon, {
        ...firm,
        source: [...existing.source, 'db_seeded'],
        interest_score: existing.interest_score + 0.15,
        investor_hit: existing.investor_hit,
      })
    } else {
      candidates.set(canon, {
        ...firm,
        source: ['db_seeded'],
        interest_score: 0,
        investor_hit: null,
      })
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.interest_score - a.interest_score)
    .slice(0, maxCandidates)
}
