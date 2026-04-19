import type { ScoreBreakdown } from '@/lib/contract/shapes'
import type { InvestorHit, Partner } from '@/lib/types'

// Thesis recency decay: most recent Exa signal → 0..15
export function thesisRecencyScore(bestDaysAgo: number | null): number {
  if (bestDaysAgo === null) return 0
  if (bestDaysAgo <= 14) return 15
  if (bestDaysAgo <= 30) return 12
  if (bestDaysAgo <= 60) return 8
  if (bestDaysAgo <= 90) return 4
  return 0
}

// Stage alignment: 25 exact, 15 adjacent, 5 distant
const STAGE_ORDER = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth']

function normalizeStage(s: string): string {
  const n = s.toLowerCase().replace(/[\s-]/g, '_')
  // Map Crustdata round types to standard stage names
  if (n.includes('pre_seed') || n.includes('pre-seed')) return 'pre_seed'
  if (n.includes('seed') && !n.includes('post')) return 'seed'
  if (n === 'series_a' || n === 'series a') return 'series_a'
  if (n === 'series_b' || n === 'series b') return 'series_b'
  if (n === 'series_c' || n === 'series_c+' || n === 'series c') return 'series_c'
  if (n.includes('series_d') || n.includes('series_e') || n.includes('series_f')) return 'growth'
  if (n === 'series_unknown' || n.includes('growth') || n.includes('expansion')) return 'growth'
  if (n.includes('venture') || n.includes('angel')) return 'pre_seed'
  if (n.includes('corporate') || n.includes('strategic') || n.includes('post_ipo') || n.includes('ipo')) return 'growth'
  if (n.includes('late') || n.includes('debt') || n.includes('secondary')) return 'growth'
  return n
}

export function stageAlignmentScore(
  founderStage: string,
  firmStageModes: string[],
  edgarMonthsSince: number | null
): number {
  const fIdx = STAGE_ORDER.indexOf(normalizeStage(founderStage))
  let best = 0
  for (const s of firmStageModes) {
    const idx = STAGE_ORDER.indexOf(normalizeStage(s))
    if (idx === -1) continue
    const diff = Math.abs(fIdx - idx)
    const pts = diff === 0 ? 25 : diff === 1 ? 15 : 5
    best = Math.max(best, pts)
  }
  // Cap at 10 if EDGAR fund is stale (>5 years old = >60 months)
  if (edgarMonthsSince !== null && edgarMonthsSince > 60) {
    best = Math.min(best, 10)
  }
  return best
}

// Portfolio gap: 20 base, minus conflict penalty
export function portfolioGapScore(
  conflictFlag: boolean,
  weakAdjacencyCount: number
): number {
  if (conflictFlag) return 0
  return Math.max(0, 20 - weakAdjacencyCount * 5)
}

// Partner affinity: sum of 4 boolean signals, each worth ~3.75 → 0..15
export function partnerAffinityScore(partner: Partner | null): number {
  if (!partner) return 0
  const sigs = partner.affinity_signals
  const count = [
    sigs.sector_experience,
    sigs.operator_background_in_sector,
    sigs.invested_in_competitor,
    sigs.similar_founder_profile_backed,
  ].filter(Boolean).length
  return Math.round(count * 3.75)
}

// Sector fit from interest score (0..1) → 0..25
export function sectorFitScore(interestScore: number): number {
  return Math.round(Math.min(1, interestScore) * 25)
}

// Compose all 5 dimensions
export function buildScoreBreakdown(opts: {
  interestScore: number
  founderStage: string
  firmStageModes: string[]
  edgarMonthsSince: number | null
  conflictFlag: boolean
  weakAdjacencyCount: number
  bestDaysAgo: number | null
  partner: Partner | null
}): ScoreBreakdown {
  return {
    sector_fit: sectorFitScore(opts.interestScore),
    stage_alignment: stageAlignmentScore(opts.founderStage, opts.firmStageModes, opts.edgarMonthsSince),
    portfolio_gap: portfolioGapScore(opts.conflictFlag, opts.weakAdjacencyCount),
    partner_affinity: partnerAffinityScore(opts.partner),
    thesis_recency: thesisRecencyScore(opts.bestDaysAgo),
  }
}

export function totalScore(bd: ScoreBreakdown): number {
  return bd.sector_fit + bd.stage_alignment + bd.portfolio_gap + bd.partner_affinity + bd.thesis_recency
}

export function assignTier(score: number): 1 | 2 | null {
  if (score >= 65) return 1
  if (score >= 45) return 2
  return null
}

export function isOpenWindow(bd: ScoreBreakdown, portfolioDealsInSet: number): boolean {
  return bd.sector_fit > 15 && bd.thesis_recency > 10 && portfolioDealsInSet === 0
}
