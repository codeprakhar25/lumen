import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'

function nanoid(n: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export async function POST(req: NextRequest) {
  let body: { domain?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const domain = body.domain?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!domain) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('founder_runs')
    .select('analysis_id, created_at')
    .eq('input', domain)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.analysis_id) {
    return NextResponse.json(
      {
        analysis_id: existing.analysis_id,
        status: 'cached',
        domain,
        created_at: existing.created_at,
        results_url: `/api/results/${existing.analysis_id}`,
        stream_url: `/api/analyze/stream/${existing.analysis_id}?domain=${encodeURIComponent(domain)}`,
      },
      { status: 200 }
    )
  }

  const analysisId = `ana_${nanoid(8)}`
  const createdAt = new Date().toISOString()

  const { error } = await supabase.from('founder_runs').insert({
    analysis_id: analysisId,
    input_type: 'domain',
    input: domain,
    status: 'pending',
    current_stage: null,
  })

  if (error) {
    console.error('Failed to create founder_run:', error)
    return NextResponse.json({ error: 'Failed to create analysis' }, { status: 500 })
  }

  return NextResponse.json(
    {
      analysis_id: analysisId,
      status: 'started',
      domain,
      created_at: createdAt,
      stream_url: `/api/analyze/stream/${analysisId}?domain=${encodeURIComponent(domain)}`,
    },
    { status: 202 }
  )
}
