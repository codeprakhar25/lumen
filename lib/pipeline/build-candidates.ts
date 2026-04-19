// Step 4: Build candidate universe — union competitor-investors with DB firms
import { supabase, type VcFirm } from '@/lib/clients/supabase'
import type { InvestorHit } from '@/lib/types'
import { isSameFirm, canonicalize } from '@/lib/scoring/name-dedupe'

export type CandidateFirm = VcFirm & {
  source: ('comp_investor' | 'db_seeded')[]
  interest_score: number
  investor_hit: InvestorHit | null
}

export async function buildCandidates(
  rankedInvestors: InvestorHit[],
  maxCandidates = 40
): Promise<CandidateFirm[]> {
  // Load DB firms
  const { data: dbFirms } = await supabase
    .from('vc_firms')
    .select('*')
    .contains('sector_tags', ['healthtech'])

  const db: VcFirm[] = dbFirms ?? []

  // Build map: canonical name → InvestorHit
  const investorMap = new Map<string, InvestorHit>()
  for (const inv of rankedInvestors.slice(0, 30)) {
    investorMap.set(canonicalize(inv.investor_name), inv)
  }

  // Build map: canonical name → VcFirm
  const dbMap = new Map<string, VcFirm>()
  for (const f of db) {
    dbMap.set(canonicalize(f.name), f)
  }

  const candidates = new Map<string, CandidateFirm>()

  // Add investor-discovered firms
  for (const [canon, inv] of investorMap) {
    candidates.set(canon, {
      // Minimal VcFirm fields for investor-discovered (not in DB)
      id: '',
      name: inv.investor_name,
      sector: null,
      website: null,
      linkedin_company_url: null,
      hq: null,
      geography_focus: null,
      stage_focus: null,
      sector_tags: ['healthtech'],
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

  // Merge DB firms — if already present, boost; else add as db_seeded
  for (const [canon, firm] of dbMap) {
    if (candidates.has(canon)) {
      const existing = candidates.get(canon)!
      // Merge: prefer DB record's full data, but keep investor hit
      candidates.set(canon, {
        ...firm,
        source: [...existing.source, 'db_seeded'],
        interest_score: existing.interest_score + 0.15,  // source_boost
        investor_hit: existing.investor_hit,
      })
    } else {
      candidates.set(canon, {
        ...firm,
        source: ['db_seeded'],
        interest_score: 0,  // No competitor signal yet
        investor_hit: null,
      })
    }
  }

  const sorted = [...candidates.values()]
    .sort((a, b) => b.interest_score - a.interest_score)
    .slice(0, maxCandidates)

  return sorted
}
