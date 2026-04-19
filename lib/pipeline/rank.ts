// Step 10: Rank candidates into scored VcMatchShape[]
import type { CandidateFirm } from '@/lib/pipeline/build-candidates'
import type { PortfolioSignal } from '@/lib/pipeline/firm-portfolio'
import type { ThesisResult } from '@/lib/pipeline/thesis-signal'
import type { DeploymentSignal } from '@/lib/pipeline/deployment-signal'
import type { Partner } from '@/lib/types'
import {
  buildScoreBreakdown,
  totalScore,
  assignTier,
  isOpenWindow,
} from '@/lib/scoring/score-breakdown'
import type { VcMatchShape } from '@/lib/contract/shapes'

export type EnrichedCandidate = {
  candidate: CandidateFirm
  portfolio: PortfolioSignal
  thesis: ThesisResult
  deployment: DeploymentSignal
  partners: Partner[]
  firmStageModes: string[]  // modal round types from portfolio
}

export function rankCandidates(
  enriched: EnrichedCandidate[],
  founderStage: string,
  founderDomain: string
): VcMatchShape[] {
  const results: VcMatchShape[] = []

  for (const { candidate, portfolio, thesis, deployment, partners } of enriched) {
    if (portfolio.conflict_flag) continue  // hard drop

    const bd = buildScoreBreakdown({
      interestScore: candidate.interest_score,
      founderStage,
      firmStageModes: portfolio.all_round_types,
      edgarMonthsSince: deployment.edgar_months_since,
      conflictFlag: portfolio.conflict_flag,
      weakAdjacencyCount: portfolio.weak_adjacency_count,
      bestDaysAgo: thesis.best_days_ago,
      partner: partners[0] ?? null,
    })

    const score = totalScore(bd)
    const tier = assignTier(score)
    if (!tier) continue  // score < 60, drop

    const openWindow = isOpenWindow(bd, portfolio.portfolio_deals_in_set)

    const bestPartner = partners[0] ?? null
    const bestSignal = thesis.top_signals[0] ?? null

    const firmName = candidate.name
    // Detect rebrand (formerly) from alias map
    const { canonicalize } = require('@/lib/scoring/name-dedupe')
    const canon = canonicalize(firmName)
    const formerly = canon !== firmName ? firmName : null

    results.push({
      tier,
      firm_name: canon !== firmName ? canon : firmName,
      formerly,
      score: Math.round(score),
      score_breakdown: bd,
      check_size: null,  // TODO: derive from CSV or EDGAR
      stage_preference: portfolio.all_round_types.join(', ') || null,
      portfolio_deals_in_set: portfolio.portfolio_deals_in_set,
      competitors_funded: portfolio.competitors_funded,
      reasons: [],  // filled by AI synthesis (step 11)
      portfolio_gap_analysis: '',  // filled by AI synthesis
      thesis_alignment: '',  // filled by AI synthesis
      open_window: openWindow,
      recommended_partner: bestPartner ? {
        name: bestPartner.name,
        title: bestPartner.title,
        linkedin_url: bestPartner.linkedin_url,
        background_summary: '',  // filled by AI synthesis
        recent_signal: bestSignal ? {
          type: bestSignal.type,
          title: bestSignal.title,
          date: bestSignal.date,
          days_ago: bestSignal.days_ago,
          snippet: bestSignal.snippet,
          url: bestSignal.url ?? null,
        } : null,
        affinity_signals: bestPartner.affinity_signals,
        outreach_angle: '',  // filled by AI synthesis
      } : null,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}
