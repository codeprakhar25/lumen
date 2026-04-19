import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params

  const { data: run, error } = await supabase
    .from('founder_runs')
    .select('status, current_stage, analysis_result, error_code, error_message, completed_at')
    .eq('analysis_id', analysisId)
    .single()

  if (error || !run) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  if (run.status === 'complete' && run.analysis_result) {
    return NextResponse.json(run.analysis_result, { status: 200 })
  }

  if (run.status === 'error') {
    return NextResponse.json(
      {
        analysis_id: analysisId,
        status: 'error',
        error_code: run.error_code,
        error_message: run.error_message,
      },
      { status: 200 }
    )
  }

  return NextResponse.json(
    {
      analysis_id: analysisId,
      status: run.status,
      current_stage: run.current_stage,
    },
    { status: 202 }
  )
}
