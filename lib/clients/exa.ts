import { env } from '@/lib/env'
import { cached, TTL } from '@/lib/cache'
import pLimit from 'p-limit'

export const pExa = pLimit(5)

const EXA_URL = 'https://api.exa.ai/search'

export type ExaResult = {
  id: string
  title: string
  url: string
  publishedDate: string | null
  text: string | null
  highlights: string[]
  score: number
}

type ExaSearchOptions = {
  query: string
  numResults?: number
  includeDomains?: string[]
  excludeDomains?: string[]
  category?: string
  startPublishedDate?: string
  useAutoprompt?: boolean
  text?: boolean
  highlights?: boolean
}

export async function exaSearch(
  opts: ExaSearchOptions,
  cacheKey: string
): Promise<ExaResult[]> {
  return cached('cache_exa', cacheKey, TTL.EXA, async () => {
    const res = await fetch(EXA_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.EXA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: opts.query,
        numResults: opts.numResults ?? 5,
        type: 'neural',
        useAutoprompt: opts.useAutoprompt ?? false,
        ...(opts.includeDomains ? { includeDomains: opts.includeDomains } : {}),
        ...(opts.excludeDomains ? { excludeDomains: opts.excludeDomains } : {}),
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
        contents: {
          text: opts.text ?? false,
          highlights: { numSentences: 2, highlightsPerUrl: 1 },
        },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Exa ${res.status}: ${err.slice(0, 200)}`)
    }
    const data = await res.json() as { results: ExaResult[] }
    return data.results ?? []
  })
}

// Helpers for common patterns

export function firmBlogKey(firmName: string, sector: string) {
  return `exa_blog:${firmName}:${sector}`
}

export function firmNewsKey(firmName: string) {
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `exa_news:${firmName}:${sixMonthsAgo}`
}

export function partnerThesisKey(partnerName: string, sector: string) {
  return `exa_partner:${partnerName}:${sector}`
}

export function sixMonthsAgoISO(): string {
  return new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function daysAgo(dateStr: string): number {
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}
