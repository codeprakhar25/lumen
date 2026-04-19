import { NextRequest } from 'next/server'
import { supabase } from '@/lib/clients/supabase'
import { runPipeline } from '@/lib/pipeline/orchestrator'
import { formatSseChunk } from '@/lib/sse/emit'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params
  const domain = req.nextUrl.searchParams.get('domain')

  if (!domain) {
    return new Response('domain query param required', { status: 400 })
  }

  // Verify analysis exists
  const { data: run, error } = await supabase
    .from('founder_runs')
    .select('status, analysis_id')
    .eq('analysis_id', analysisId)
    .single()

  if (error || !run) {
    return new Response('Analysis not found', { status: 404 })
  }

  if (run.status === 'complete') {
    // Already done — load stored result and re-emit results_ready
    const { data: full } = await supabase
      .from('founder_runs')
      .select('analysis_result')
      .eq('analysis_id', analysisId)
      .single()

    const encoder = new TextEncoder()
    const chunk = formatSseChunk({
      type: 'results_ready',
      analysis_id: analysisId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results: (full?.analysis_result ?? {}) as any,
    })
    return new Response(encoder.encode(chunk), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runPipeline({ analysisId, domain, controller, encoder })
      } catch (err) {
        console.error('Pipeline top-level error:', err)
        const errChunk = formatSseChunk({
          type: 'error',
          analysis_id: analysisId,
          error: err instanceof Error ? err.message : String(err),
          code: 'UNKNOWN',
          timestamp: new Date().toISOString(),
        })
        controller.enqueue(encoder.encode(errChunk))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
