import pLimit from 'p-limit'
import { supabase } from '@/lib/clients/supabase'
import { profileFounder } from './profile-founder'
import { findCompetitors } from './find-competitors'
import { extractInvestors } from './extract-investors'
import { buildCandidates } from './build-candidates'
import { fetchFirmPortfolio, analyzePortfolio } from './firm-portfolio'
import { fetchThesisSignals } from './thesis-signal'
import { discoverPartners } from './partner-discover'
import { computeDeploymentSignal } from './deployment-signal'
import { rankCandidates, type EnrichedCandidate } from './rank'
import { synthesizeMatches, applySynthesis } from './outreach-angle'
import { pCrustdata } from '@/lib/clients/crustdata'
import {
  emitEvent,
  stageStartPayload,
  stageCompletePayload,
  stageErrorPayload,
  formatSseChunk,
} from '@/lib/sse/emit'
import type { AnalysisResult, VcMatchShape } from '@/lib/contract/shapes'
import { ErrorCode } from '@/lib/contract/errors'

export type OrchestratorOpts = {
  analysisId: string
  domain: string
  controller: ReadableStreamDefaultController
  encoder: TextEncoder
}

function push(controller: ReadableStreamDefaultController, encoder: TextEncoder, chunk: string) {
  controller.enqueue(encoder.encode(chunk))
}

async function emit(
  opts: OrchestratorOpts,
  event: Parameters<typeof emitEvent>[1]
) {
  await emitEvent(opts.analysisId, event)
  push(opts.controller, opts.encoder, formatSseChunk(event))
}

export async function runPipeline(opts: OrchestratorOpts): Promise<void> {
  const { analysisId, domain } = opts
  const timings: Record<string, number> = {}
  const t = (label: string) => { timings[label] = Date.now() }

  try {
    // ── Stage 1: Company profile ─────────────────────────────────────────
    t('stage1_start')
    await emit(opts, stageStartPayload(analysisId, '1'))
    await supabase.from('founder_runs').update({ current_stage: '1' }).eq('analysis_id', analysisId)

    const founder = await profileFounder(domain)
    timings.stage1_ms = Date.now() - timings.stage1_start

    await emit(opts, stageCompletePayload(analysisId, '1',
      `${founder.company_name} → ${founder.industry} · ${founder.stage} · ${founder.headcount ?? '?'} people`,
      { company: founder }
    ))

    // ── Stage 2: Competitors ─────────────────────────────────────────────
    t('stage2_start')
    await emit(opts, stageStartPayload(analysisId, '2'))
    await supabase.from('founder_runs').update({ current_stage: '2' }).eq('analysis_id', analysisId)

    const competitors = await findCompetitors(founder)
    timings.stage2_ms = Date.now() - timings.stage2_start

    if (!competitors.length) {
      await emit(opts, stageCompletePayload(analysisId, '2',
        'No competitors found — using DB firms only',
        { competitors_count: 0, competitors: [] }
      ))
    } else {
      await emit(opts, stageCompletePayload(analysisId, '2',
        `Found ${competitors.length} companies: ${competitors.slice(0, 5).map(c => c.name).join(', ')}`,
        { competitors_count: competitors.length, competitors: competitors.slice(0, 10) }
      ))
    }

    // ── Stage 3: Investor network ────────────────────────────────────────
    t('stage3_start')
    await emit(opts, stageStartPayload(analysisId, '3'))
    await supabase.from('founder_runs').update({ current_stage: '3' }).eq('analysis_id', analysisId)

    const rankedInvestors = extractInvestors(competitors, founder.stage)

    // Store intermediate state
    await supabase.from('founder_runs').update({
      founder_profile: founder as object,
      competitors: competitors as unknown as object,
      investor_interest: rankedInvestors as unknown as object,
    }).eq('analysis_id', analysisId)

    timings.stage3_ms = Date.now() - timings.stage3_start
    await emit(opts, stageCompletePayload(analysisId, '3',
      `Extracted ${rankedInvestors.length} unique VC firms from ${competitors.length} competitors`,
      {
        unique_investors_count: rankedInvestors.length,
        funding_rounds_analyzed: competitors.reduce((s, c) => s + c.investors.length, 0),
        investor_frequency: rankedInvestors.slice(0, 8),
      }
    ))

    // ── Stage 4: Build candidates + preliminary rank ──────────────────────
    t('stage4_start')
    await emit(opts, stageStartPayload(analysisId, '4'))
    await supabase.from('founder_runs').update({ current_stage: '4' }).eq('analysis_id', analysisId)

    const allCandidates = await buildCandidates(rankedInvestors)
    // Cap enrichment at 15 top candidates to stay within Vercel timeout
    const candidates = allCandidates.slice(0, 15)
    await supabase.from('founder_runs').update({
      candidate_universe: allCandidates as unknown as object,
    }).eq('analysis_id', analysisId)

    timings.stage4_ms = Date.now() - timings.stage4_start
    const shortlisted = candidates.slice(0, 5)
    await emit(opts, stageCompletePayload(analysisId, '4',
      `Ranked ${allCandidates.length} firms → Top ${candidates.length} shortlisted for deep profiling`,
      {
        firms_analyzed: allCandidates.length,
        firms_shortlisted: candidates.length,
        shortlisted_firms: shortlisted.map(c => ({
          name: c.name,
          source: c.source,
          interest_score: c.interest_score,
        })),
      }
    ))

    // ── Stages 5a + 5b: Partner profiling + web intelligence (parallel) ──
    t('stage5_start')
    await supabase.from('founder_runs').update({ current_stage: '5a' }).eq('analysis_id', analysisId)

    const pEnrich = pLimit(8)
    const enriched: EnrichedCandidate[] = []

    await Promise.all(candidates.map(candidate => pEnrich(async () => {
      try {
        const [portfolio, partners, thesis] = await Promise.all([
          fetchFirmPortfolio(candidate.name, founder),
          discoverPartners(candidate.name, founder.industry),
          fetchThesisSignals(
            candidate.name,
            candidate.website,
            [],  // partner names discovered by Crustdata above
            founder
          ),
        ])

        const portfolioSignal = analyzePortfolio(
          portfolio,
          domain,
          competitors.map(c => c.name)
        )

        const deployment = await computeDeploymentSignal(candidate.name, portfolioSignal)

        // Set invested_in_competitor affinity if this firm backed a competitor
        const investedInCompetitor = candidate.source.includes('comp_investor')
        const enrichedPartners = partners.map(p => ({
          ...p,
          affinity_signals: {
            ...p.affinity_signals,
            invested_in_competitor: investedInCompetitor,
            sector_experience: investedInCompetitor || p.affinity_signals.sector_experience,
          },
        }))

        enriched.push({
          candidate,
          portfolio: portfolioSignal,
          thesis,
          deployment,
          partners: enrichedPartners,
          firmStageModes: portfolioSignal.all_round_types,
        })
      } catch (err) {
        console.error(`Enrichment failed for ${candidate.name}:`, err)
        // Add with neutral scores so the firm isn't dropped entirely
        enriched.push({
          candidate: { ...candidate, interest_score: candidate.interest_score * 0.5 },
          portfolio: {
            rounds_last_12mo: 0,
            all_round_types: [],
            conflict_flag: false,
            weak_adjacency_count: 0,
            portfolio_deals_in_set: 0,
            competitors_funded: [],
          },
          thesis: { thesis_score: 0, best_days_ago: null, top_signals: [] },
          deployment: { cadence_score: 0, edgar_months_since: null, seed_ratio: 0.5 },
          partners: [],
          firmStageModes: [],
        })
      }
    })))

    const partnerCount = enriched.reduce((s, e) => s + e.partners.length, 0)
    const signalCount = enriched.reduce((s, e) => s + e.thesis.top_signals.length, 0)
    timings.stage5_ms = Date.now() - timings.stage5_start

    // Emit 5a and 5b
    await Promise.all([
      emit(opts, stageCompletePayload(analysisId, '5a',
        `Profiled ${partnerCount} partners across ${enriched.length} firms`,
        {
          partners_profiled: partnerCount,
          partners: enriched.flatMap(e => e.partners).slice(0, 5),
        }
      )),
      emit(opts, stageCompletePayload(analysisId, '5b',
        `Found ${signalCount} relevant signals from posts and articles`,
        {
          total_signals: signalCount,
          signals_by_firm: enriched.slice(0, 5).map(e => ({
            firm: e.candidate.name,
            signals: e.thesis.top_signals,
          })),
        }
      )),
    ])

    // ── Stage 6: Score + synthesize ──────────────────────────────────────
    t('stage6_start')
    await emit(opts, stageStartPayload(analysisId, '6'))
    await supabase.from('founder_runs').update({ current_stage: '6' }).eq('analysis_id', analysisId)

    let rankedMatches: VcMatchShape[] = rankCandidates(enriched, founder.stage, domain)

    // AI synthesis in one batched call
    if (rankedMatches.length > 0) {
      try {
        const synth = await synthesizeMatches(
          rankedMatches,
          rankedInvestors,
          founder.description,
          founder.stage,
          founder.industry
        )
        rankedMatches = applySynthesis(rankedMatches, synth)

        const completedAt = new Date().toISOString()
        const durationMs = Date.now() - timings.stage1_start
        timings.stage6_ms = Date.now() - timings.stage6_start

        const result: AnalysisResult = {
          analysis_id: analysisId,
          status: 'complete',
          domain,
          created_at: new Date(timings.stage1_start).toISOString(),
          completed_at: completedAt,
          duration_seconds: Math.round(durationMs / 1000),
          company: {
            name: founder.company_name,
            domain: founder.domain,
            description: founder.description,
            industry: founder.industry,
            sub_industry: founder.sub_industry,
            stage: founder.stage,
            headcount: founder.headcount,
            founded_year: founder.founded_year,
            location: founder.location,
            funding: founder.funding,
            metrics: founder.metrics,
            founders: founder.founders,
            crustdata_company_id: founder.crustdata_company_id,
          },
          competitors: competitors.map(c => ({
            name: c.name,
            domain: c.domain,
            stage: c.stage,
            headcount: c.headcount,
            total_raised_usd: c.total_raised_usd,
            crustdata_company_id: c.crustdata_company_id,
            investors: c.investors,
          })),
          investor_network: {
            unique_investors_count: rankedInvestors.length,
            funding_rounds_analyzed: competitors.reduce((s, c) => s + c.investors.length, 0),
            investor_frequency: rankedInvestors.slice(0, 10).map(inv => ({
              investor_name: inv.investor_name,
              deals_in_set: inv.deals_in_set,
              companies_funded: inv.companies_funded,
              stages_invested: inv.stages_invested,
              total_deployed_in_set_usd: inv.total_deployed_in_set_usd,
            })),
          },
          vc_matches: rankedMatches,
          similar_founders: synth.similar_founders,
          pattern_analysis: synth.pattern_analysis,
        }

        await supabase.from('founder_runs').update({
          status: 'complete',
          current_stage: null,
          analysis_result: result as object,
          completed_at: completedAt,
          timings: timings as object,
        }).eq('analysis_id', analysisId)

        const tier1 = rankedMatches.filter(m => m.tier === 1).length
        await emit(opts, stageCompletePayload(analysisId, '6',
          `Top match: ${rankedMatches[0]?.firm_name ?? '—'} — ${rankedMatches[0]?.score ?? 0}% confidence`,
          {
            scoring_model: 'lumen-v1',
            scoring_dimensions: ['sector_fit', 'stage_alignment', 'portfolio_gap', 'partner_affinity', 'thesis_recency'],
            matches_count: rankedMatches.length,
            tier_1_count: tier1,
            tier_2_count: rankedMatches.length - tier1,
          }
        ))

        await emit(opts, { type: 'results_ready', analysis_id: analysisId, results: result })
      } catch (err) {
        await emit(opts, stageErrorPayload(analysisId, '6', `AI synthesis failed: ${err}`, false))
        throw Object.assign(new Error('AI scoring failed'), { code: ErrorCode.AI_SCORING_FAILED })
      }
    } else {
      throw Object.assign(new Error('No VC matches found after scoring'), { code: ErrorCode.NO_COMPETITORS })
    }
  } catch (err: unknown) {
    const error = err as Error & { code?: string }
    const code = error.code ?? 'UNKNOWN'
    await supabase.from('founder_runs').update({
      status: 'error',
      error_code: code,
      error_message: error.message,
    }).eq('analysis_id', analysisId)

    await emit(opts, {
      type: 'error',
      analysis_id: analysisId,
      error: error.message,
      code,
      timestamp: new Date().toISOString(),
    })
  }
}
