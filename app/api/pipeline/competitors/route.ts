import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'
import { findCompetitors } from '@/lib/pipeline/find-competitors'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { analysisId, founder } = (await req.json()) as {
    analysisId?: string
    founder?: Parameters<typeof findCompetitors>[0]
  }
  if (!analysisId || !founder) {
    return NextResponse.json({ error: 'analysisId and founder required' }, { status: 400 })
  }
  try {
    await supabase.from('founder_runs').update({ current_stage: '2' }).eq('analysis_id', analysisId)
    const competitors = await findCompetitors(founder)
    await supabase.from('founder_runs').update({
      competitors: competitors as unknown as object,
    }).eq('analysis_id', analysisId)
    return NextResponse.json({ competitors })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'competitors failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
