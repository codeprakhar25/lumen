// Step 8: Compute deployment signal from cadence + EDGAR
import { searchFormD, pEdgar } from '@/lib/clients/edgar'
import type { PortfolioSignal } from '@/lib/pipeline/firm-portfolio'

export type DeploymentSignal = {
  cadence_score: number      // 0..1 (log-scaled rounds/12mo)
  edgar_months_since: number | null
  seed_ratio: number         // 0..1
}

export async function computeDeploymentSignal(
  firmName: string,
  portfolioSignal: PortfolioSignal
): Promise<DeploymentSignal> {
  const edgar = await pEdgar(() => searchFormD(firmName))

  const rounds = portfolioSignal.rounds_last_12mo
  // Log-scaled: 0 rounds = 0, 1 = 0.3, 3 = 0.6, 6+ = 1.0
  const cadenceScore = Math.min(1, rounds > 0 ? Math.log(rounds + 1) / Math.log(7) : 0)

  const allRounds = portfolioSignal.all_round_types
  const seedRounds = allRounds.filter(r => /pre.?seed|seed/i.test(r)).length
  const seedRatio = allRounds.length > 0 ? seedRounds / allRounds.length : 0.5

  return {
    cadence_score: cadenceScore,
    edgar_months_since: edgar.months_since_filing,
    seed_ratio: seedRatio,
  }
}
