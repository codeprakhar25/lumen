# Lumen — Data Source Map

A VC-matcher for Indian founders. This README documents **where every piece of data comes from** across the pipeline.

## External sources

| Source | Auth | Role |
| --- | --- | --- |
| **Crustdata** | API key | Company enrichment, competitor search, portfolio pulls, partner discovery |
| **OpenAI** (`gpt-4o`) | API key | Industry/stage normalization, thesis scoring, match synthesis |
| **Exa** | API key | Neural web search — firm blogs, news, partner thesis signals |
| **EDGAR** (SEC) | none | Form D filings → fund deployment recency |
| **Supabase** | service role | `vc_firms` seed table + `founder_runs` state/cache |
| **Seed CSVs** (`data/india_*_vcs.csv`) | local | Sector-tagged VC list loaded into `vc_firms` |

## Pipeline stages → data sources

Each stage is a separate Next.js route under `app/api/pipeline/*`, orchestrated from the client with retry + per-firm parallelism.

### 1. Profile Founder — `app/api/pipeline/profile`
- **Crustdata** `/company/enrich` + `/company/search` → company name, domain, categories, funding, headcount, web traffic, location, founders
- **OpenAI** `gpt-4o` (JSON schema) → normalize `industry` / `sub_industry` / `stage` for the India context

### 2. Find Competitors — `app/api/pipeline/competitors`
- **Crustdata** `/company/search` (paginated) → filter by matching categories, exclude founder domain, India-based, founded < 12 yrs → competitor list with funding rounds and investors

### 3 & 4. Extract Investors + Build Candidates — `app/api/pipeline/candidates`
- **In-memory** from competitor data → dedupe investor names, score by deal frequency / recency / stage overlap
- **Supabase** `vc_firms` table → lookup by overlapping `sector_tags` (seeded from `data/india_*_vcs.csv`: healthtech, edtech, saas, ai, fintech, consumer, climate, deeptech)
- Merged list: competitors-derived investors ∪ sector-matched seed firms; boost when both sources agree

### 5. Enrich Firm (per-firm, parallel) — `app/api/pipeline/enrich-firm`
Runs concurrently per firm:

- **Firm portfolio** — **Crustdata** `/company/search` filtered by firm-as-investor → up to 100 portcos → cadence, round-type mix, conflicts, competitor overlap
- **Partner discovery** — **Crustdata** `/person/search` → partners at the firm with sector history
- **Thesis signal** — **Exa** neural search (3 queries: firm thesis, firm news ≤ 6mo, partner thesis) → blogs / news / LinkedIn / Twitter; **OpenAI** `gpt-4o` batch-scores 15 snippets for relevance to founder
- **Deployment signal** — **EDGAR** Form D search by firm name → months since latest filing; combined with portfolio cadence

### 6. Rank + Synthesize — `app/api/pipeline/rank`
- **In-memory** scoring: `interest_score + stage_alignment + portfolio_gap + partner_affinity + thesis_recency` → tier, drop on conflict or score < 60
- **OpenAI** `gpt-4o` (JSON schema, batched) → per-match `reasons`, `portfolio_gap_analysis`, `thesis_alignment`, `partner_background_summary`, `outreach_angle` + overall `similar_founders` and `pattern_analysis`

## Persistence — Supabase

- `founder_runs` — one row per analysis, keyed by `analysis_id` and deduped on `input` (domain) for cache hits. Stores `status`, `current_stage`, `founder_profile`, `competitors`, `investor_interest`, `candidate_universe`, `analysis_result`, timestamps.
- `vc_firms` — static seed from CSVs; queried in stage 3/4 by `sector_tags`.
- Cache: `/api/analyze` returns the latest `complete` run for the same `input` before starting a new pipeline.

## Crustdata endpoints used

`/company/enrich`, `/company/search`, `/person/search` — all wrapped in `lib/clients/crustdata.ts` with a shared rate-limit gate (`pCrustdata`).

## OpenAI usage

Single model (`gpt-4o`), always called with JSON schema mode. Three distinct prompts: founder normalization (stage 1), Exa snippet relevance scoring (stage 5), and match synthesis (stage 6).

## Dev

```bash
npm run dev        # http://localhost:3000
node scripts/clear-cache.mjs   # wipe cached founder_runs
```
