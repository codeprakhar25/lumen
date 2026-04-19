import { createHash } from 'crypto'
import { supabase } from '@/lib/clients/supabase'

type CacheTable = 'cache_exa' | 'cache_crustdata' | 'cache_edgar'

function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32)
}

export async function cached<T>(
  table: CacheTable,
  keyInput: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = hashKey(keyInput)
  const cutoff = new Date(Date.now() - ttlMs).toISOString()

  const { data } = await supabase
    .from(table)
    .select('response, cached_at')
    .eq('key', key)
    .gt('cached_at', cutoff)
    .single()

  if (data) return data.response as T

  const result = await fetcher()

  await supabase
    .from(table)
    .upsert({ key, response: result as object, cached_at: new Date().toISOString() })

  return result
}

export const TTL = {
  CRUSTDATA: 24 * 60 * 60 * 1000,  // 24h
  EXA: 24 * 60 * 60 * 1000,        // 24h
  EDGAR: 7 * 24 * 60 * 60 * 1000,  // 7d
}
