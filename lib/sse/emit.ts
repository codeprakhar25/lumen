import { supabase } from '@/lib/clients/supabase'
import type { SseEvent, SseStageStart, SseStageComplete, SseStageError } from '@/lib/contract/shapes'
import { STAGE_LABELS } from '@/lib/contract/shapes'

// Sequence counter per analysis_id (in-memory within a single request lifetime)
const seqCounters = new Map<string, number>()

function nextSeq(analysisId: string): number {
  const n = (seqCounters.get(analysisId) ?? 0) + 1
  seqCounters.set(analysisId, n)
  return n
}

export async function emitEvent(analysisId: string, event: SseEvent): Promise<void> {
  const seq = nextSeq(analysisId)
  await supabase.from('pipeline_events').insert({
    analysis_id: analysisId,
    seq,
    event_type: event.type,
    stage: 'stage' in event ? event.stage : null,
    payload: event as object,
  })
}

export function stageStartPayload(analysisId: string, stage: string): SseStageStart {
  const meta = STAGE_LABELS[stage] ?? { label: `Stage ${stage}`, description: '' }
  return {
    type: 'stage_start',
    analysis_id: analysisId,
    stage,
    total_stages: 6,
    label: meta.label,
    description: meta.description,
    timestamp: new Date().toISOString(),
  }
}

export function stageCompletePayload(
  analysisId: string,
  stage: string,
  dataPreview: string,
  stageData: unknown
): SseStageComplete {
  const meta = STAGE_LABELS[stage] ?? { label: `Stage ${stage}`, description: '' }
  return {
    type: 'stage_complete',
    analysis_id: analysisId,
    stage,
    label: meta.label,
    data_preview: dataPreview,
    stage_data: stageData,
    timestamp: new Date().toISOString(),
  }
}

export function stageErrorPayload(
  analysisId: string,
  stage: string,
  error: string,
  recoverable = true
): SseStageError {
  const meta = STAGE_LABELS[stage] ?? { label: `Stage ${stage}`, description: '' }
  return {
    type: 'stage_error',
    analysis_id: analysisId,
    stage,
    label: `${meta.label} partially failed`,
    error,
    recoverable,
    timestamp: new Date().toISOString(),
  }
}

export function formatSseChunk(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
