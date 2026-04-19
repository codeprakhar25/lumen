import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'
import { profileFounder } from '@/lib/pipeline/profile-founder'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { analysisId, domain } = (await req.json()) as { analysisId?: string; domain?: string }
  if (!analysisId || !domain) {
    return NextResponse.json({ error: 'analysisId and domain required' }, { status: 400 })
  }
  try {
    await supabase.from('founder_runs').update({ status: 'pending', current_stage: '1' }).eq('analysis_id', analysisId)
    const founder = await profileFounder(domain)
    await supabase.from('founder_runs').update({
      founder_profile: founder as object,
    }).eq('analysis_id', analysisId)
    return NextResponse.json({ founder })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'profile failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
