// Step 6: Gather Exa thesis signals for firm + partners
import { exaSearch, pExa, firmBlogKey, firmNewsKey, partnerThesisKey, sixMonthsAgoISO, daysAgo, type ExaResult } from '@/lib/clients/exa'
import { pOpenAI, jsonComplete } from '@/lib/clients/openai'
import type { FounderProfile, PartnerSignal } from '@/lib/types'

export type ThesisResult = {
  thesis_score: number     // 0..1
  best_days_ago: number | null
  top_signals: PartnerSignal[]
}

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    relevance_score: { type: 'number' },
    best_snippet_index: { type: 'number' },
  },
  required: ['relevance_score', 'best_snippet_index'],
  additionalProperties: false,
}

function exaToSignal(r: ExaResult, type: PartnerSignal['type']): PartnerSignal {
  const date = r.publishedDate ?? new Date().toISOString()
  return {
    type,
    title: r.title,
    date,
    days_ago: daysAgo(date),
    relevance_score: r.score,
    snippet: r.highlights?.[0] ?? r.text?.slice(0, 200) ?? '',
    url: r.url,
  }
}

function guessSignalType(url: string): PartnerSignal['type'] {
  if (url.includes('linkedin.com')) return 'linkedin_post'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter_thread'
  if (url.includes('substack.com')) return 'blog_post'
  if (url.includes('youtube.com') || url.includes('spotify')) return 'conference_talk'
  return 'news'
}

export async function fetchThesisSignals(
  firmName: string,
  firmWebsite: string | null,
  partnerNames: string[],
  founder: FounderProfile
): Promise<ThesisResult> {
  const sector = `${founder.industry} ${founder.sub_industry} India`

  // Run all Exa queries in parallel
  const [blogResults, newsResults, ...partnerResults] = await Promise.all([
    pExa(() => exaSearch(
      {
        query: `${firmName} ${sector} investment thesis portfolio`,
        numResults: 5,
        ...(firmWebsite ? { includeDomains: [firmWebsite] } : {}),
        highlights: true,
      },
      firmBlogKey(firmName, sector)
    )).catch(() => [] as ExaResult[]),

    pExa(() => exaSearch(
      {
        query: `${firmName} ${sector} 2025 2026`,
        numResults: 5,
        category: 'news',
        startPublishedDate: sixMonthsAgoISO(),
        highlights: true,
      },
      firmNewsKey(firmName)
    )).catch(() => [] as ExaResult[]),

    ...partnerNames.slice(0, 3).map(pName =>
      pExa(() => exaSearch(
        {
          query: `${pName} ${sector} investment thesis`,
          numResults: 3,
          highlights: true,
        },
        partnerThesisKey(pName, sector)
      )).catch(() => [] as ExaResult[])
    ),
  ])

  const allResults: ExaResult[] = [
    ...blogResults,
    ...newsResults,
    ...partnerResults.flat(),
  ]

  if (!allResults.length) {
    return { thesis_score: 0, best_days_ago: null, top_signals: [] }
  }

  // OpenAI: score all hits against founder in one batched call
  const hitsText = allResults.slice(0, 15).map((r, i) =>
    `[${i}] ${r.title} — ${r.highlights?.[0] ?? r.text?.slice(0, 150) ?? ''}`
  ).join('\n')

  const scored = await pOpenAI(() =>
    jsonComplete<{ relevance_score: number; best_snippet_index: number }>(
      'You evaluate how relevant VC signals are to a specific founder. Return a JSON with relevance_score (0..1) and the index of the single most relevant snippet.',
      `Founder context: ${founder.description} (${founder.industry}, ${founder.sub_industry}, stage: ${founder.stage})

VC signals:
${hitsText}

Return the overall relevance_score (0..1) across all signals, and best_snippet_index (0-based) of the most founder-relevant result.`,
      SCORE_SCHEMA
    )
  ).catch(() => ({ relevance_score: 0.3, best_snippet_index: 0 }))

  const signals: PartnerSignal[] = allResults.map(r =>
    exaToSignal(r, guessSignalType(r.url))
  )

  const sorted = [...signals].sort((a, b) => {
    const ageA = a.days_ago
    const ageB = b.days_ago
    return ageA - ageB
  })

  const bestDaysAgo = sorted[0]?.days_ago ?? null

  return {
    thesis_score: scored.relevance_score,
    best_days_ago: bestDaysAgo,
    top_signals: sorted.slice(0, 3),
  }
}
