import { NextRequest, NextResponse } from 'next/server'
import { fetchFirmPortfolio, analyzePortfolio } from '@/lib/pipeline/firm-portfolio'
import { fetchThesisSignals } from '@/lib/pipeline/thesis-signal'
import { discoverPartners } from '@/lib/pipeline/partner-discover'
import { computeDeploymentSignal } from '@/lib/pipeline/deployment-signal'
import type { CandidateFirm } from '@/lib/pipeline/build-candidates'
import type { EnrichedCandidate } from '@/lib/pipeline/rank'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Body = {
  candidate?: CandidateFirm
  founder?: Parameters<typeof fetchFirmPortfolio>[1]
  domain?: string
  competitorNames?: string[]
}

export async function POST(req: NextRequest) {
  const { candidate, founder, domain, competitorNames } = (await req.json()) as Body
  if (!candidate || !founder || !domain || !competitorNames) {
    return NextResponse.json({ error: 'candidate, founder, domain, competitorNames required' }, { status: 400 })
  }
  try {
    const [portfolio, partners, thesis] = await Promise.all([
      fetchFirmPortfolio(candidate.name, founder),
      discoverPartners(candidate.name, founder.industry),
      fetchThesisSignals(candidate.name, candidate.website, [], founder),
    ])
    const portfolioSignal = analyzePortfolio(portfolio, domain, competitorNames)
    const deployment = await computeDeploymentSignal(candidate.name, portfolioSignal)

    const investedInCompetitor = candidate.source.includes('comp_investor')
    const enrichedPartners = partners.map(p => ({
      ...p,
      affinity_signals: {
        ...p.affinity_signals,
        invested_in_competitor: investedInCompetitor,
        sector_experience: investedInCompetitor || p.affinity_signals.sector_experience,
      },
    }))

    const enriched: EnrichedCandidate = {
      candidate,
      portfolio: portfolioSignal,
      thesis,
      deployment,
      partners: enrichedPartners,
      firmStageModes: portfolioSignal.all_round_types,
    }
    return NextResponse.json({ enriched })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'enrich failed'
    return NextResponse.json({ error: msg, firm: candidate.name }, { status: 502 })
  }
}
