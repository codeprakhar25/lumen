import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'
import { extractInvestors } from '@/lib/pipeline/extract-investors'
import { buildCandidates, industryToSectorTags } from '@/lib/pipeline/build-candidates'
import type { Competitor } from '@/lib/types'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Body = {
  analysisId?: string
  competitors?: Competitor[]
  founderStage?: string
  founderIndustry?: string
}

export async function POST(req: NextRequest) {
  const { analysisId, competitors, founderStage, founderIndustry } = (await req.json()) as Body
  if (!analysisId || !competitors || !founderStage) {
    return NextResponse.json({ error: 'analysisId, competitors, founderStage required' }, { status: 400 })
  }
  try {
    await supabase.from('founder_runs').update({ current_stage: '3' }).eq('analysis_id', analysisId)
    const rankedInvestors = extractInvestors(competitors, founderStage)
    const sectorTags = industryToSectorTags(founderIndustry)
    const allCandidates = await buildCandidates(rankedInvestors, sectorTags)
    const candidates = allCandidates.slice(0, 15)
    await supabase.from('founder_runs').update({
      current_stage: '4',
      investor_interest: rankedInvestors as unknown as object,
      candidate_universe: allCandidates as unknown as object,
    }).eq('analysis_id', analysisId)
    return NextResponse.json({
      rankedInvestors,
      allCandidatesCount: allCandidates.length,
      candidates,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'candidates failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
