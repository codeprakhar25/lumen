// Step 11: OpenAI batch synthesis for top matches
// One call produces reasons, portfolio_gap_analysis, thesis_alignment,
// background_summary, outreach_angle, similar_founders, pattern_analysis.
import { jsonComplete, pOpenAI } from '@/lib/clients/openai'
import type { VcMatchShape, AnalysisResult } from '@/lib/contract/shapes'
import type { InvestorHit } from '@/lib/types'

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          firm_name: { type: 'string' },
          reasons: { type: 'array', items: { type: 'string' } },
          portfolio_gap_analysis: { type: 'string' },
          thesis_alignment: { type: 'string' },
          partner_background_summary: { type: 'string' },
          outreach_angle: { type: 'string' },
        },
        required: ['firm_name', 'reasons', 'portfolio_gap_analysis', 'thesis_alignment', 'partner_background_summary', 'outreach_angle'],
        additionalProperties: false,
      },
    },
    similar_founders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          company: { type: 'string' },
          raise_summary: { type: 'string' },
          key_investors: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
        required: ['name', 'company', 'raise_summary', 'key_investors', 'note'],
        additionalProperties: false,
      },
    },
    pattern_analysis: { type: 'string' },
  },
  required: ['matches', 'similar_founders', 'pattern_analysis'],
  additionalProperties: false,
}

type SynthOutput = {
  matches: Array<{
    firm_name: string
    reasons: string[]
    portfolio_gap_analysis: string
    thesis_alignment: string
    partner_background_summary: string
    outreach_angle: string
  }>
  similar_founders: AnalysisResult['similar_founders']
  pattern_analysis: string
}

export async function synthesizeMatches(
  matches: VcMatchShape[],
  investorHits: InvestorHit[],
  founderDescription: string,
  founderStage: string,
  founderIndustry: string
): Promise<SynthOutput> {
  const hitMap = new Map(investorHits.map(h => [h.investor_name.toLowerCase(), h]))

  const matchSummaries = matches.slice(0, 10).map(m => {
    const hit = hitMap.get(m.firm_name.toLowerCase())
    const compBets = hit
      ? hit.companies_funded.map(c => `${c} (${hit.stages_invested[0] ?? '?'})`).slice(0, 3).join(', ')
      : 'none found'
    const partner = m.recommended_partner
    return `Firm: ${m.firm_name}
Score: ${m.score}/100 (sector_fit=${m.score_breakdown.sector_fit}, stage=${m.score_breakdown.stage_alignment}, gap=${m.score_breakdown.portfolio_gap}, affinity=${m.score_breakdown.partner_affinity}, thesis=${m.score_breakdown.thesis_recency})
Competitor bets: ${compBets}
Open window: ${m.open_window}
Partner: ${partner?.name ?? 'unknown'} (${partner?.title ?? ''})`
  }).join('\n\n')

  return pOpenAI(() =>
    jsonComplete<SynthOutput>(
      `You are Lumen's scoring engine. Write concise, specific, founder-facing content. No generic praise. Use concrete facts from the data.`,
      `Founder: ${founderDescription}
Stage: ${founderStage}
Industry: ${founderIndustry}

VC MATCHES:
${matchSummaries}

For each VC firm above, write:
- reasons: 3 bullet points explaining why this firm is a strong match (cite competitor bets and specific signals)
- portfolio_gap_analysis: 1-2 sentences on portfolio fit (gaps, adjacent bets)
- thesis_alignment: 1-2 sentences on how their thesis aligns
- partner_background_summary: 1-2 sentences on the recommended partner's relevance
- outreach_angle: 2-3 sentence cold-email opener using the competitor bet as the hook — specific, not generic

Also provide:
- similar_founders: 2-3 founders who raised at similar stage + sector + India. For each: name, company, raise_summary (e.g. "Series A, $5M"), key_investors (2-3 names), note (one short sentence — just the key fact, no filler)
- pattern_analysis: 2-3 punchy bullet points (use "•") on patterns of investors who back companies like this. No full paragraphs.`,
      SYNTHESIS_SCHEMA
    )
  )
}

export function applySynthesis(matches: VcMatchShape[], synth: SynthOutput): VcMatchShape[] {
  const synthMap = new Map(synth.matches.map(s => [s.firm_name.toLowerCase(), s]))
  return matches.map(m => {
    const s = synthMap.get(m.firm_name.toLowerCase())
    if (!s) return m
    return {
      ...m,
      reasons: s.reasons,
      portfolio_gap_analysis: s.portfolio_gap_analysis,
      thesis_alignment: s.thesis_alignment,
      recommended_partner: m.recommended_partner ? {
        ...m.recommended_partner,
        background_summary: s.partner_background_summary,
        outreach_angle: s.outreach_angle,
      } : null,
    }
  })
}
