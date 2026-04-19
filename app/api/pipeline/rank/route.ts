import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'
import { rankCandidates, type EnrichedCandidate } from '@/lib/pipeline/rank'
import { synthesizeMatches, applySynthesis } from '@/lib/pipeline/outreach-angle'
import type { AnalysisResult } from '@/lib/contract/shapes'
import type { Competitor, InvestorHit, FounderProfile } from '@/lib/types'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type FounderIn = FounderProfile

type Body = {
  analysisId?: string
  domain?: string
  founder?: FounderIn
  competitors?: Competitor[]
  rankedInvestors?: InvestorHit[]
  enriched?: EnrichedCandidate[]
  createdAt?: string
}

export async function POST(req: NextRequest) {
  const { analysisId, domain, founder, competitors, rankedInvestors, enriched, createdAt } =
    (await req.json()) as Body
  if (!analysisId || !domain || !founder || !competitors || !rankedInvestors || !enriched) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }
  try {
    await supabase.from('founder_runs').update({ current_stage: '6' }).eq('analysis_id', analysisId)
    let rankedMatches = rankCandidates(enriched, founder.stage, domain)
    if (rankedMatches.length === 0) {
      await supabase.from('founder_runs').update({
        status: 'error',
        error_code: 'NO_COMPETITORS',
        error_message: 'No VC matches after scoring',
      }).eq('analysis_id', analysisId)
      return NextResponse.json({ error: 'no matches' }, { status: 422 })
    }
    const synth = await synthesizeMatches(
      rankedMatches,
      rankedInvestors,
      founder.description,
      founder.stage,
      founder.industry
    )
    rankedMatches = applySynthesis(rankedMatches, synth)

    const startedAt = createdAt ? new Date(createdAt).getTime() : Date.now()
    const completedAt = new Date().toISOString()

    const result: AnalysisResult = {
      analysis_id: analysisId,
      status: 'complete',
      domain,
      created_at: createdAt ?? new Date(startedAt).toISOString(),
      completed_at: completedAt,
      duration_seconds: Math.round((Date.now() - startedAt) / 1000),
      company: {
        name: founder.company_name,
        domain: founder.domain,
        description: founder.description,
        industry: founder.industry,
        sub_industry: founder.sub_industry,
        stage: founder.stage,
        headcount: founder.headcount,
        founded_year: founder.founded_year,
        location: founder.location,
        funding: founder.funding,
        metrics: founder.metrics,
        founders: founder.founders,
        crustdata_company_id: founder.crustdata_company_id,
      },
      competitors: competitors.map(c => ({
        name: c.name,
        domain: c.domain,
        stage: c.stage,
        headcount: c.headcount,
        total_raised_usd: c.total_raised_usd,
        crustdata_company_id: c.crustdata_company_id,
        investors: c.investors,
      })),
      investor_network: {
        unique_investors_count: rankedInvestors.length,
        funding_rounds_analyzed: competitors.reduce((s, c) => s + c.investors.length, 0),
        investor_frequency: rankedInvestors.slice(0, 10).map(inv => ({
          investor_name: inv.investor_name,
          deals_in_set: inv.deals_in_set,
          companies_funded: inv.companies_funded,
          stages_invested: inv.stages_invested,
          total_deployed_in_set_usd: inv.total_deployed_in_set_usd,
        })),
      },
      vc_matches: rankedMatches,
      similar_founders: synth.similar_founders,
      pattern_analysis: synth.pattern_analysis,
    }

    await supabase.from('founder_runs').update({
      status: 'complete',
      current_stage: null,
      analysis_result: result as object,
      completed_at: completedAt,
    }).eq('analysis_id', analysisId)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'rank failed'
    await supabase.from('founder_runs').update({
      status: 'error',
      error_code: 'AI_SCORING_FAILED',
      error_message: msg,
    }).eq('analysis_id', analysisId)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
