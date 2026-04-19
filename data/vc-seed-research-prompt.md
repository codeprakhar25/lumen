# VC Seed Research Prompt

**Run this in:** Perplexity (Deep Research mode) · ChatGPT o3 with Search · Claude.ai with Research mode
**Save the JSON output to:** `lumen/data/vc-seed.json`

---

## Prompt (paste verbatim)

You are compiling a structured research dataset. No creative writing, no summaries, no prose outside the JSON. If you cannot verify a field from a primary source, set it to `null` and move on — fabrication is worse than nulls.

**Task:** Return a JSON object with `firms: []` containing **60 venture capital firms** that are actively investing in **India-based** or **India-adjacent cross-border** startups at **pre-seed / seed / Series A / Series B** stages, as of 2025–2026.

**Coverage targets (rough):**
- 35 India-HQ firms (Peak XV, Accel India, Lightspeed India, Nexus, Matrix/Z47, Chiratae, Elevation, Kalaari, Blume, Stellaris, 3one4, Better, Fireside, Prime, Omnivore, pi Ventures, Arali, India Quotient, YourNest, Leo, Iron Pillar, WestBridge, Inflection Point, A91, Jungle, etc.)
- 15 US/global firms highly active in India (Tiger Global, General Catalyst, Insight, Coatue, Ribbit, Y Combinator, Founders Fund, a16z India-adjacent, Goodwater, etc.)
- 10 thesis-focused operator / early funds (Antler India, All In Capital, 100x.vc, Neon Fund, Eximius, Accelyst, etc.)

**For each firm, return exactly this schema — no extra fields:**

```json
{
  "firm_name": "string",
  "aka": ["string"],
  "website": "https://...",
  "portfolio_page_url": "https://... (the actual /portfolio or /companies listing page, NOT the homepage)",
  "hq": "City, Country",
  "geography_focus": ["India" | "SEA" | "US" | "Global" | "MENA" | ...],
  "stage_focus": ["pre_seed" | "seed" | "series_a" | "series_b" | "growth"],
  "sector_tags": ["fintech","healthtech","saas","consumer","devtools","ai","climate","deeptech","edtech","commerce","logistics","mobility","crypto","media","gaming","b2b","agritech"],
  "typical_check_usd": { "min": number, "max": number } | null,
  "fund_legal_names": ["exact SEC-registrable fund names, e.g. 'Peak XV India & SEA Principals Holdings I'"],
  "partners": [
    {
      "name": "string",
      "title": "Managing Director" | "General Partner" | "Partner" | "Principal" | "Founding Partner",
      "linkedin_url": "https://www.linkedin.com/in/<handle>/ — MUST be verified, not guessed",
      "focus_sectors": ["string"],
      "verified_source_url": "URL to firm's team page / linkedin / interview confirming this person's role"
    }
  ],
  "known_portfolio_samples": ["5–10 well-known portfolio company names"],
  "notes": "string or empty"
}
```

**Hard rules:**

1. **LinkedIn URLs must be real.** Verify each one by visiting the firm's team page or the partner's public LinkedIn profile. If you cannot verify, set `linkedin_url: null`. Do NOT guess URLs from names.
2. **`fund_legal_names`** — these are the names that appear on SEC EDGAR Form D filings (e.g., "Peak XV India & SEA Principals Holdings I", "Chiratae Ventures India Investments V", "Stellaris Venture Partners India III"). If unknown, leave the array empty `[]` — do NOT invent. Search `sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<firm>&type=D` to find real filings.
3. **`portfolio_page_url`** — must be the scrapable listing page (e.g., `https://www.peakxv.com/portfolio`, `https://www.accel.com/companies`, `https://www.lightspeedindia.com/portfolio`). Verify the URL actually loads and shows a company list. If the firm has no public portfolio page, set to `null`.
4. Give **1–3 partners per firm** — not all of them, just the ones most visibly active on LinkedIn / public writing / podcasts (since our use case is matching founders to GPs with recent thesis signal).
5. Output **strict, parseable JSON**. No markdown fences, no comments, no trailing commas. Output the raw JSON only. If response limits force truncation, complete firm-by-firm and end with `"_truncated_at_firm_index": N` so the next run can resume.
6. Prefer **firms that post publicly on LinkedIn / Substack / podcasts** over quiet funds — our product depends on live GP thesis signal. Flag purely back-office funds with `"notes": "low public signal"`.

**Output:** one JSON object, starting with `{"firms": [`, ending with `]}`. No other text.

---

## How to run

- **Perplexity** → paste prompt → switch to "Deep Research" (gear icon) → let it run 10–15 min → "Copy JSON" → save to `lumen/data/vc-seed.json`.
- **If truncated** → reply `continue from firm index N` and concatenate the arrays manually.
- **Sanity check before saving**:
  ```bash
  node -e "JSON.parse(require('fs').readFileSync('lumen/data/vc-seed.json','utf8'))"
  ```
  (silent = valid; any output = broken JSON).

---

## After the file lands

I will:
1. Validate the file against a zod schema (`lib/vc-seed/schema.ts`).
2. Spot-check 5 random `linkedin_url` entries by hitting them.
3. Spot-check 3 random `portfolio_page_url` entries with Jina Reader.
4. Spot-check 3 random `fund_legal_names` on SEC EDGAR.
5. Load into Supabase (`vc_firms`, `vc_partners`, `vc_funds` tables).
6. Report the coverage stats (how many firms have verified LinkedIn / EDGAR / portfolio URL).
