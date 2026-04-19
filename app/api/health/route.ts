import { NextResponse } from 'next/server'
import { supabase } from '@/lib/clients/supabase'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

async function probe(label: string, fn: () => Promise<unknown>): Promise<{ label: string; ok: boolean; latency_ms: number; error?: string }> {
  const t = Date.now()
  try {
    await fn()
    return { label, ok: true, latency_ms: Date.now() - t }
  } catch (err) {
    return { label, ok: false, latency_ms: Date.now() - t, error: String(err) }
  }
}

export async function GET() {
  const results = await Promise.all([
    probe('supabase', async () => {
      const { error } = await supabase.from('vc_firms').select('id').limit(1)
      if (error) throw error
    }),

    probe('crustdata', async () => {
      const res = await fetch('https://api.crustdata.com/company/enrich', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CRUSTDATA_API_KEY}`,
          'Content-Type': 'application/json',
          'x-api-version': '2025-11-01',
        },
        body: JSON.stringify({ domains: ['google.com'] }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }),

    probe('exa', async () => {
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': env.EXA_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: 'healthtech india venture capital', numResults: 1 }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }),

    probe('edgar', async () => {
      const url = 'https://efts.sec.gov/LATEST/search-index?q=%22Sequoia%22&dateRange=custom&startdt=2020-01-01&forms=D&hits.hits._source.file_date=desc&hits.hits.total.value=1'
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Lumen/1.0 (otgdev2002@gmail.com)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }),

    probe('openai', async () => {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }),
  ])

  const allOk = results.every(r => r.ok)

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks: results, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 207 }
  )
}
