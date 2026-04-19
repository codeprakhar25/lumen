Lumen — Backend Technical Specification
Complete API reference, SSE event contracts, JSON schemas, and Crustdata integration guide.

Table of contents
Architecture overview
API routes
SSE event stream
JSON schemas
Crustdata API integration
Pipeline execution flow
AI scoring engine
Error handling

Architecture overview
Client (React)                    Backend (FastAPI)                   External
─────────────                    ─────────────────                   ────────
                                 
POST /api/analyze ──────────────► Pipeline Orchestrator
     { domain }                        │
                                       ├──► Stage 1 ──► Crustdata /company/enrich
SSE /api/analyze/stream/{id} ◄─────┐   ├──► Stage 2 ──► Crustdata /company/search
     event: stage_update       │   ├──► Stage 3 ──► Crustdata /company/enrich (batch)
     event: stage_data         │   ├──► Stage 4 ──► Internal ranking logic
     event: results_ready      │   ├──► Stage 5a ─► Crustdata /person/search + /person/enrich
                                   │   ├──► Stage 5b ─► Crustdata Web Search
GET /api/results/{id} ─────────────┘   └──► Stage 6 ──► Claude API (scoring + synthesis)
     full JSON response

Flow:
Client sends POST /api/analyze with a domain → receives an analysis_id
Client opens SSE connection to /api/analyze/stream/{analysis_id}
Backend runs 6 pipeline stages, emitting SSE events after each stage
Client renders real-time progress from SSE events
Final results_ready event signals completion
Client can also fetch full results via GET /api/results/{analysis_id}

API routes
POST /api/analyze
Starts a new analysis pipeline.
Request:
{
  "domain": "paygrid.io"
}

Response (202 Accepted):
{
  "analysis_id": "ana_7f3k9x2m",
  "status": "started",
  "domain": "paygrid.io",
  "created_at": "2026-04-19T11:04:32Z",
  "stream_url": "/api/analyze/stream/ana_7f3k9x2m"
}


GET /api/analyze/stream/{analysis_id}
SSE stream. Returns text/event-stream. See SSE event stream for full event specs.
Headers:
Accept: text/event-stream
Cache-Control: no-cache
Connection: keep-alive


GET /api/results/{analysis_id}
Returns the complete results after pipeline finishes. Can be polled if SSE is not used.
Response (200 OK):
Returns the full AnalysisResult schema. See complete results schema.
Response (202 Accepted — still processing):
{
  "analysis_id": "ana_7f3k9x2m",
  "status": "processing",
  "current_stage": 3,
  "total_stages": 6
}


SSE event stream
The stream emits events in order as each pipeline stage completes. Every event has a type field for routing on the client.
Event types
Event name
When emitted
Purpose
stage_start
A stage begins execution
Show loading state for that stage
stage_complete
A stage finishes successfully
Update progress, show preview data
stage_error
A stage fails (non-fatal)
Show warning, pipeline continues
results_ready
All stages complete
Deliver final ranked results
error
Fatal pipeline failure
Show error state, stop


Event: stage_start
event: stage_start
data: {
  "type": "stage_start",
  "analysis_id": "ana_7f3k9x2m",
  "stage": 1,
  "total_stages": 6,
  "label": "Enriching company profile",
  "description": "Fetching from Crustdata Company Enrich API",
  "timestamp": "2026-04-19T11:04:33Z"
}


Event: stage_complete
Each stage emits different data_preview and stage_data depending on what was computed.
Stage 1 — Company enrichment
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": 1,
  "label": "Company profile enriched",
  "data_preview": "paygrid.io → Fintech · Pre-Seed · 8 people",
  "stage_data": {
    "company": {
      "name": "PayGrid",
      "domain": "paygrid.io",
      "description": "API-first payments orchestration layer for Indian businesses",
      "industry": "Fintech",
      "sub_industry": "Payments Infrastructure",
      "stage": "Pre-Seed",
      "headcount": 8,
      "founded_year": 2025,
      "location": {
        "city": "Bangalore",
        "country": "India",
        "country_iso3": "IND"
      },
      "funding": {
        "total_raised_usd": 150000,
        "last_round": "Pre-Seed",
        "last_round_date": "2025-09-15",
        "investors": []
      },
      "metrics": {
        "web_traffic_monthly": 2300,
        "web_traffic_qoq_pct": 34.2,
        "headcount_qoq_pct": 12.5
      },
      "founders": [
        {
          "name": "Arjun Mehta",
          "title": "CEO & Co-founder",
          "linkedin_url": "https://linkedin.com/in/arjunmehta",
          "previous_company": "Razorpay",
          "previous_title": "Senior Engineer",
          "education": "IIT Bombay"
        },
        {
          "name": "Sneha Krishnan",
          "title": "CTO & Co-founder",
          "linkedin_url": "https://linkedin.com/in/snehak",
          "previous_company": "Stripe",
          "previous_title": "Staff Engineer",
          "education": "BITS Pilani"
        }
      ],
      "crustdata_company_id": "cd_889201"
    }
  },
  "timestamp": "2026-04-19T11:04:36Z"
}

Stage 2 — Competitor discovery
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": 2,
  "label": "Competitors discovered",
  "data_preview": "Found 5 companies: Razorpay, Cashfree, Juspay, Decentro, Setu",
  "stage_data": {
    "competitors_count": 5,
    "search_filters_used": {
      "industry": "Fintech",
      "sub_industry": "Payments Infrastructure",
      "country": "IND",
      "headcount_range": "1-5000",
      "funding_stage": ["Seed", "Series A", "Series B", "Series C", "Series D+"]
    },
    "competitors": [
      {
        "name": "Razorpay",
        "domain": "razorpay.com",
        "stage": "Series F",
        "headcount": 3200,
        "total_raised_usd": 741500000,
        "crustdata_company_id": "cd_112045"
      },
      {
        "name": "Cashfree",
        "domain": "cashfree.com",
        "stage": "Series B",
        "headcount": 520,
        "total_raised_usd": 35300000,
        "crustdata_company_id": "cd_223891"
      },
      {
        "name": "Juspay",
        "domain": "juspay.in",
        "stage": "Series C",
        "headcount": 850,
        "total_raised_usd": 98000000,
        "crustdata_company_id": "cd_334102"
      },
      {
        "name": "Decentro",
        "domain": "decentro.tech",
        "stage": "Series A",
        "headcount": 110,
        "total_raised_usd": 6500000,
        "crustdata_company_id": "cd_445678"
      },
      {
        "name": "Setu",
        "domain": "setu.co",
        "stage": "Acquired",
        "headcount": 200,
        "total_raised_usd": 18000000,
        "crustdata_company_id": "cd_556234"
      }
    ]
  },
  "timestamp": "2026-04-19T11:04:40Z"
}

Stage 3 — Investor network extraction
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": 3,
  "label": "Investor networks mapped",
  "data_preview": "Extracted 14 unique VC firms from 5 competitors",
  "stage_data": {
    "unique_investors_count": 14,
    "investor_frequency": [
      {
        "investor_name": "Y Combinator",
        "deals_in_set": 3,
        "companies_funded": ["Razorpay", "Cashfree", "Decentro"],
        "stages_invested": ["Seed"],
        "total_deployed_in_set_usd": 875000
      },
      {
        "investor_name": "Peak XV Partners",
        "deals_in_set": 2,
        "companies_funded": ["Razorpay", "Juspay"],
        "stages_invested": ["Seed", "Series A", "Series B"],
        "total_deployed_in_set_usd": 85000000
      },
      {
        "investor_name": "Accel",
        "deals_in_set": 2,
        "companies_funded": ["Cashfree", "Juspay"],
        "stages_invested": ["Seed", "Series A"],
        "total_deployed_in_set_usd": 22000000
      },
      {
        "investor_name": "Tiger Global",
        "deals_in_set": 1,
        "companies_funded": ["Razorpay"],
        "stages_invested": ["Series B", "Series C"],
        "total_deployed_in_set_usd": 130000000
      },
      {
        "investor_name": "Elevation Capital",
        "deals_in_set": 1,
        "companies_funded": ["Decentro"],
        "stages_invested": ["Seed", "Series A"],
        "total_deployed_in_set_usd": 3200000
      },
      {
        "investor_name": "Lightspeed",
        "deals_in_set": 1,
        "companies_funded": ["Setu"],
        "stages_invested": ["Series A"],
        "total_deployed_in_set_usd": 9000000
      },
      {
        "investor_name": "SoftBank",
        "deals_in_set": 1,
        "companies_funded": ["Juspay"],
        "stages_invested": ["Series C"],
        "total_deployed_in_set_usd": 60000000
      },
      {
        "investor_name": "Ribbit Capital",
        "deals_in_set": 1,
        "companies_funded": ["Razorpay"],
        "stages_invested": ["Series D"],
        "total_deployed_in_set_usd": 75000000
      }
    ],
    "funding_rounds_analyzed": 18
  },
  "timestamp": "2026-04-19T11:04:48Z"
}

Stage 4 — VC firm ranking and filtering
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": 4,
  "label": "VC firms ranked",
  "data_preview": "Ranked 14 firms → Top 5 shortlisted for deep profiling",
  "stage_data": {
    "firms_analyzed": 14,
    "firms_shortlisted": 5,
    "filtering_criteria": {
      "stage_match": "Invests at Pre-Seed or Seed",
      "geo_match": "Active in India",
      "portfolio_conflict": "No direct competitor at same layer",
      "min_deals_in_sector": 1
    },
    "shortlisted_firms": [
      { "name": "Peak XV Partners", "preliminary_score": 91, "reason": "2 deals in set, invests at seed, India-focused" },
      { "name": "Accel", "preliminary_score": 86, "reason": "2 deals in set, seed investor, Atoms pre-seed program" },
      { "name": "Matrix Partners India", "preliminary_score": 78, "reason": "Razorpay early backer, fintech thesis" },
      { "name": "Elevation Capital", "preliminary_score": 73, "reason": "Decentro backer, active seed investor in India" },
      { "name": "Lightspeed", "preliminary_score": 68, "reason": "Setu backer, payments thesis" }
    ],
    "filtered_out": [
      { "name": "Tiger Global", "reason": "Does not invest at Pre-Seed stage" },
      { "name": "SoftBank", "reason": "Does not invest at Pre-Seed stage" },
      { "name": "Ribbit Capital", "reason": "Series D+ only, no early-stage activity" },
      { "name": "GIC", "reason": "Sovereign fund, late-stage only" }
    ]
  },
  "timestamp": "2026-04-19T11:04:50Z"
}

Stage 5 — Partner profiling + web intelligence
These run in parallel. Two stage_complete events are emitted — 5a and 5b.
5a — Partner profiling:
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": "5a",
  "label": "VC partners profiled",
  "data_preview": "Profiled 8 partners across 5 firms",
  "stage_data": {
    "partners_profiled": 8,
    "partners": [
      {
        "name": "Rajan Anandan",
        "firm": "Peak XV Partners",
        "title": "Managing Director",
        "linkedin_url": "https://linkedin.com/in/rajananandan",
        "background": {
          "previous_roles": [
            { "company": "Google India", "title": "Managing Director", "years": "2011-2019" },
            { "company": "Microsoft India", "title": "MD", "years": "2006-2011" }
          ],
          "education": ["Stanford MBA", "MIT BS"],
          "notable_investments": ["Razorpay", "Juspay", "Meesho", "Cred"],
          "domains_of_focus": ["Fintech", "Consumer Internet", "SaaS"]
        },
        "affinity_signals": {
          "sector_experience": true,
          "operator_background_in_sector": false,
          "invested_in_competitor": true,
          "similar_founder_profile_backed": true
        }
      },
      {
        "name": "Prashanth Prakash",
        "firm": "Accel",
        "title": "Partner",
        "linkedin_url": "https://linkedin.com/in/prashanthp",
        "background": {
          "previous_roles": [
            { "company": "Wipro", "title": "VP Engineering", "years": "2002-2008" }
          ],
          "education": ["IIT Madras"],
          "notable_investments": ["Freshworks", "Cashfree", "Swiggy", "BrowserStack"],
          "domains_of_focus": ["B2B SaaS", "Fintech Infrastructure", "Developer Tools"]
        },
        "affinity_signals": {
          "sector_experience": true,
          "operator_background_in_sector": true,
          "invested_in_competitor": true,
          "similar_founder_profile_backed": true
        }
      },
      {
        "name": "Vikram Vaidyanathan",
        "firm": "Matrix Partners India",
        "title": "Managing Director",
        "linkedin_url": "https://linkedin.com/in/vikramv",
        "background": {
          "previous_roles": [
            { "company": "McKinsey", "title": "Engagement Manager", "years": "2005-2010" }
          ],
          "education": ["IIM Ahmedabad", "IIT Delhi"],
          "notable_investments": ["Razorpay", "Five Star Finance", "Country Delight"],
          "domains_of_focus": ["Fintech", "B2B", "Financial Services"]
        },
        "affinity_signals": {
          "sector_experience": true,
          "operator_background_in_sector": false,
          "invested_in_competitor": true,
          "similar_founder_profile_backed": true
        }
      }
    ]
  },
  "timestamp": "2026-04-19T11:04:58Z"
}

5b — Web intelligence:
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": "5b",
  "label": "Web intelligence gathered",
  "data_preview": "Found 23 relevant signals from posts and articles",
  "stage_data": {
    "total_signals": 23,
    "signals_by_firm": [
      {
        "firm": "Peak XV Partners",
        "partner": "Rajan Anandan",
        "signals": [
          {
            "type": "linkedin_post",
            "title": "Post about unbundling payment rails in India",
            "date": "2026-04-09",
            "days_ago": 10,
            "relevance_score": 0.94,
            "snippet": "The next wave of fintech in India won't be consumer apps — it will be infrastructure..."
          },
          {
            "type": "conference_talk",
            "title": "Panel at Bangalore Fintech Week",
            "date": "2026-03-22",
            "days_ago": 28,
            "relevance_score": 0.81,
            "snippet": "Discussed API-first approaches to financial infrastructure"
          }
        ]
      },
      {
        "firm": "Accel",
        "partner": "Prashanth Prakash",
        "signals": [
          {
            "type": "conference_talk",
            "title": "Bangalore Fintech Summit keynote",
            "date": "2026-03-29",
            "days_ago": 21,
            "relevance_score": 0.88,
            "snippet": "Spoke about infrastructure picks and shovels in fintech"
          },
          {
            "type": "blog_post",
            "title": "Accel blog: Why we love B2B infrastructure",
            "date": "2026-02-14",
            "days_ago": 64,
            "relevance_score": 0.72,
            "snippet": "Deep dive into why infrastructure companies compound better"
          }
        ]
      },
      {
        "firm": "Matrix Partners India",
        "partner": "Vikram Vaidyanathan",
        "signals": [
          {
            "type": "blog_post",
            "title": "Why India needs better payment rails",
            "date": "2026-04-05",
            "days_ago": 14,
            "relevance_score": 0.91,
            "snippet": "Published on Matrix blog about the opportunity in payments middleware"
          }
        ]
      },
      {
        "firm": "Lightspeed",
        "partner": "Harsha Kumar",
        "signals": [
          {
            "type": "twitter_thread",
            "title": "Thread on payments infra middleware moment",
            "date": "2026-04-12",
            "days_ago": 7,
            "relevance_score": 0.85,
            "snippet": "12-tweet thread about why payments infra needs a middleware layer"
          }
        ]
      }
    ]
  },
  "timestamp": "2026-04-19T11:05:02Z"
}

Stage 6 — AI scoring and synthesis
event: stage_complete
data: {
  "type": "stage_complete",
  "analysis_id": "ana_7f3k9x2m",
  "stage": 6,
  "label": "Scoring complete",
  "data_preview": "Top match: Peak XV Partners — 94% confidence",
  "stage_data": {
    "scoring_model": "lumen-v1",
    "scoring_dimensions": ["sector_fit", "stage_alignment", "portfolio_gap", "partner_affinity", "thesis_recency"],
    "matches_count": 5,
    "tier_1_count": 3,
    "tier_2_count": 2
  },
  "timestamp": "2026-04-19T11:05:08Z"
}


Event: results_ready
Emitted once after stage 6 completes. Contains the full final payload.
event: results_ready
data: {
  "type": "results_ready",
  "analysis_id": "ana_7f3k9x2m",
  "results": { ... }
}

The results object follows the AnalysisResult schema below.

Event: stage_error (non-fatal)
event: stage_error
data: {
  "type": "stage_error",
  "analysis_id": "ana_7f3k9x2m",
  "stage": "5b",
  "label": "Web intelligence partially failed",
  "error": "Rate limited on 2 of 5 web search queries. Proceeding with partial data.",
  "recoverable": true,
  "timestamp": "2026-04-19T11:05:01Z"
}


Event: error (fatal)
event: error
data: {
  "type": "error",
  "analysis_id": "ana_7f3k9x2m",
  "error": "Company not found in Crustdata. Ensure the domain is correct.",
  "code": "COMPANY_NOT_FOUND",
  "timestamp": "2026-04-19T11:04:35Z"
}


JSON schemas
AnalysisResult
The complete output returned by GET /api/results/{id} and in the results_ready SSE event.
{
  "analysis_id": "ana_7f3k9x2m",
  "status": "complete",
  "domain": "paygrid.io",
  "created_at": "2026-04-19T11:04:32Z",
  "completed_at": "2026-04-19T11:05:08Z",
  "duration_seconds": 36,

  "company": {
    "name": "string",
    "domain": "string",
    "description": "string",
    "industry": "string",
    "sub_industry": "string",
    "stage": "string",
    "headcount": "number",
    "founded_year": "number",
    "location": {
      "city": "string",
      "country": "string",
      "country_iso3": "string"
    },
    "funding": {
      "total_raised_usd": "number",
      "last_round": "string",
      "last_round_date": "string (YYYY-MM-DD)",
      "investors": ["string"]
    },
    "metrics": {
      "web_traffic_monthly": "number",
      "web_traffic_qoq_pct": "number",
      "headcount_qoq_pct": "number"
    },
    "founders": [
      {
        "name": "string",
        "title": "string",
        "linkedin_url": "string",
        "previous_company": "string",
        "previous_title": "string",
        "education": "string"
      }
    ],
    "crustdata_company_id": "string"
  },

  "competitors": [
    {
      "name": "string",
      "domain": "string",
      "stage": "string",
      "headcount": "number",
      "total_raised_usd": "number",
      "crustdata_company_id": "string",
      "investors": ["string"]
    }
  ],

  "investor_network": {
    "unique_investors_count": "number",
    "funding_rounds_analyzed": "number",
    "investor_frequency": [
      {
        "investor_name": "string",
        "deals_in_set": "number",
        "companies_funded": ["string"],
        "stages_invested": ["string"],
        "total_deployed_in_set_usd": "number"
      }
    ]
  },

  "vc_matches": [
    {
      "tier": "number (1 or 2)",
      "firm_name": "string",
      "formerly": "string | null",
      "score": "number (0-100)",
      "score_breakdown": {
        "sector_fit": "number (0-25)",
        "stage_alignment": "number (0-25)",
        "portfolio_gap": "number (0-20)",
        "partner_affinity": "number (0-15)",
        "thesis_recency": "number (0-15)"
      },
      "check_size": "string",
      "stage_preference": "string",
      "portfolio_deals_in_set": "number",
      "competitors_funded": ["string"],
      "reasons": ["string"],
      "portfolio_gap_analysis": "string",
      "thesis_alignment": "string",
      "recommended_partner": {
        "name": "string",
        "title": "string",
        "linkedin_url": "string",
        "background_summary": "string",
        "recent_signal": {
          "type": "string (linkedin_post | blog_post | conference_talk | twitter_thread)",
          "title": "string",
          "date": "string (YYYY-MM-DD)",
          "days_ago": "number",
          "snippet": "string"
        },
        "affinity_signals": {
          "sector_experience": "boolean",
          "operator_background_in_sector": "boolean",
          "invested_in_competitor": "boolean",
          "similar_founder_profile_backed": "boolean"
        }
      }
    }
  ],

  "similar_founders": [
    {
      "name": "string",
      "company": "string",
      "raise_summary": "string",
      "key_investors": ["string"],
      "note": "string"
    }
  ],

  "pattern_analysis": "string"
}


Score breakdown detail
Each VC match includes a score from 0–100, composed of five weighted dimensions:
{
  "score": 94,
  "score_breakdown": {
    "sector_fit": 24,
    "stage_alignment": 23,
    "portfolio_gap": 18,
    "partner_affinity": 15,
    "thesis_recency": 14
  }
}

Dimension
Max
What it measures
sector_fit
25
How many competitors in this space has this VC funded? Higher frequency = higher score.
stage_alignment
25
Does this VC invest at the founder's current stage? Exact match = 25, adjacent stage = 15, distant = 5.
portfolio_gap
20
Is there room in the portfolio? No conflict = 20. Adjacent but non-competing = 15. Direct conflict = 0.
partner_affinity
15
Does a specific partner have relevant background, previous sector experience, or operator history?
thesis_recency
15
Has the partner or firm posted/spoken about this space recently? More recent = higher score.

Tier assignment:
Tier 1 ("Strong match"): score >= 80
Tier 2 ("Worth exploring"): score >= 60 and score < 80
Filtered out: score < 60

Crustdata API integration
All Crustdata API calls use:
Base URL: https://api.crustdata.com
Headers:
  authorization: Bearer {CRUSTDATA_API_KEY}
  content-type: application/json
  x-api-version: 2025-11-01

Stage 1 → Company Enrich
Crustdata endpoint: POST /company/enrich
Request we send:
{
  "domains": ["paygrid.io"],
  "fields": [
    "basic_info",
    "headcount",
    "funding",
    "locations",
    "taxonomy",
    "web_traffic"
  ]
}

What we extract from response:
response.results[0].company_data.basic_info      → name, description, website, founded_year
response.results[0].company_data.taxonomy         → industry, sub_industry
response.results[0].company_data.headcount        → total, qoq_pct
response.results[0].company_data.funding          → total_investment_usd, rounds[], investors[]
response.results[0].company_data.locations        → hq_city, hq_country
response.results[0].company_data.web_traffic      → monthly_visitors, qoq_pct
response.results[0].crustdata_company_id          → stable ID for further lookups

Founder extraction: Use the company's LinkedIn URL from basic_info.professional_network_profile_url, then call Person Search filtered by that company to find founders (see stage 5a pattern).

Stage 2 → Company Search
Crustdata endpoint: POST /company/search
Request we send:
{
  "filters": [
    {
      "field": "taxonomy.professional_network_industry",
      "type": "in",
      "value": ["Financial Services", "Fintech"]
    },
    {
      "field": "locations.hq_country",
      "type": "eq",
      "value": "IND"
    },
    {
      "field": "headcount.total",
      "type": "=>",
      "value": 5
    },
    {
      "field": "funding.total_investment_usd",
      "type": "=>",
      "value": 500000
    }
  ],
  "fields": [
    "basic_info.name",
    "basic_info.website_domain",
    "headcount.total",
    "funding.total_investment_usd",
    "funding.latest_round_type"
  ],
  "limit": 20,
  "sort": {
    "field": "funding.total_investment_usd",
    "order": "desc"
  }
}

What we extract: List of competitor companies with their crustdata_company_id for batch enrichment in stage 3.

Stage 3 → Batch Company Enrich (competitors)
Crustdata endpoint: POST /company/enrich
For each competitor, enrich with funding details:
{
  "crustdata_company_ids": ["cd_112045", "cd_223891", "cd_334102", "cd_445678", "cd_556234"],
  "fields": [
    "funding"
  ]
}

What we extract:
For each competitor:
  response.results[i].company_data.funding.rounds[] → array of funding rounds
    Each round contains:
      .round_type        → "Seed", "Series A", etc.
      .amount_usd        → dollar amount
      .date              → round date
      .investors[]       → array of investor names

Post-processing: We flatten all investor names across all rounds across all competitors, deduplicate, and count frequency to build the investor_frequency table.

Stage 5a → Person Search + Enrich
Crustdata endpoint: POST /person/search
For each shortlisted VC firm, find investment partners:
{
  "filters": [
    {
      "field": "experience.current_company_name",
      "type": "eq",
      "value": "Peak XV Partners"
    },
    {
      "field": "experience.current_title",
      "type": "contains",
      "value": "Partner"
    }
  ],
  "fields": [
    "basic_profile.full_name",
    "basic_profile.headline",
    "basic_profile.professional_network_profile_url",
    "experience",
    "education"
  ],
  "limit": 5
}

Then enrich top partners:
Crustdata endpoint: POST /person/enrich
{
  "professional_network_profile_urls": [
    "https://www.linkedin.com/in/rajananandan"
  ],
  "fields": [
    "basic_profile",
    "experience",
    "education",
    "skills"
  ]
}

What we extract:
response[0].person_data.basic_profile    → name, headline, location
response[0].person_data.experience[]     → full career history (company, title, dates)
response[0].person_data.education[]      → degrees, institutions
response[0].person_data.skills[]         → skill tags


Stage 5b → Web Search
Crustdata endpoint: Web Search API
Run targeted queries for each shortlisted partner:
{
  "query": "Rajan Anandan fintech payments infrastructure India 2026",
  "num_results": 5,
  "fetch_content": false
}

Also run firm-level queries:
{
  "query": "Peak XV Partners payments investment India",
  "num_results": 5,
  "fetch_content": false
}

What we extract: Title, URL, date, snippet for each result. We filter for recency (last 90 days) and relevance to the founder's sector.

Pipeline execution flow
Time (seconds)    Stage                    API calls          Parallelizable?
──────────────    ─────                    ─────────          ───────────────
0-3               Stage 1: Company Enrich  1 call             No (blocking — need company data first)
3-7               Stage 2: Competitor      1 call             No (needs industry/stage from stage 1)
                  Search
7-15              Stage 3: Batch Enrich    1 call (batch of   No (needs competitor IDs from stage 2)
                  Competitors              5 companies)
15-17             Stage 4: Ranking +       0 calls            No (needs investor data from stage 3)
                  Filtering                (internal logic)
17-25             Stage 5a: Person         5 search +         YES — 5a and 5b run in parallel
                  Search + Enrich          5 enrich calls
17-25             Stage 5b: Web Search     5-10 calls         YES — runs parallel with 5a
25-35             Stage 6: AI Scoring      1 Claude API call  No (needs all data from stages 1-5)
──────────────
Total: ~30-40 seconds
Total Crustdata API calls: ~25-30
Total Claude API calls: 1


AI scoring engine
Claude API prompt structure
Stage 6 sends all collected data to Claude for scoring and synthesis.
System prompt:
You are Lumen's scoring engine. You analyze VC-founder fit based on structured data.

For each VC firm, output a JSON score from 0-100 with breakdown across five dimensions:
- sector_fit (0-25): Frequency of investments in the founder's sector
- stage_alignment (0-25): Whether the VC invests at the founder's current stage
- portfolio_gap (0-20): Whether adding this company creates a conflict or fills a gap
- partner_affinity (0-15): How well a specific partner's background aligns
- thesis_recency (0-15): How recent and relevant the VC/partner's public signals are

Also generate:
- reasons: 3-4 bullet points explaining the match
- portfolio_gap_analysis: 1-2 sentences on portfolio fit
- thesis_alignment: 1-2 sentences on investment thesis match
- pattern_analysis: For similar founders, identify the common pattern

Return valid JSON only. No markdown. No preamble.

User prompt:
Analyze VC fit for this founder:
COMPANY: {stage_1_data}
COMPETITORS: {stage_2_data}
INVESTOR NETWORK: {stage_3_data}
SHORTLISTED VCS: {stage_4_data}
PARTNER PROFILES: {stage_5a_data}
WEB SIGNALS: {stage_5b_data}

Score each shortlisted VC and return the full results JSON.


Error handling
Error codes
Code
Name
When
Client action
COMPANY_NOT_FOUND
Domain not in Crustdata
Stage 1 fails to match
Show "Company not found" — suggest checking domain
NO_COMPETITORS
Search returns 0 results
Stage 2 finds nothing
Show "No competitors found" — try broader industry
ENRICHMENT_PARTIAL
Some competitor enrichments fail
Stage 3 partial failure
Continue with available data, show warning
RATE_LIMITED
Crustdata rate limit hit
Any stage
Retry with exponential backoff (max 3 retries)
PERSON_NOT_FOUND
Partner not in Crustdata
Stage 5a
Skip that partner, continue
WEB_SEARCH_PARTIAL
Some web queries fail
Stage 5b
Continue with available signals
AI_SCORING_FAILED
Claude API error
Stage 6
Retry once, then return raw data without AI scoring
TIMEOUT
Pipeline exceeds 120s
Any stage
Return partial results with warning

Retry policy
Max retries: 3
Backoff: 1s → 2s → 4s (exponential)
Timeout per stage: 30s
Total pipeline timeout: 120s


Environment variables
CRUSTDATA_API_KEY=           # Crustdata API key
ANTHROPIC_API_KEY=           # Claude API key for scoring engine
PIPELINE_TIMEOUT_SECONDS=120 # Max pipeline duration
MAX_COMPETITORS=20           # Cap on competitor search results
MAX_PARTNERS_PER_FIRM=3      # Cap on partners profiled per VC firm
WEB_SEARCH_QUERIES_MAX=10    # Cap on web search calls


Example: full client-side SSE handler
const evtSource = new EventSource(`/api/analyze/stream/${analysisId}`);

evtSource.addEventListener("stage_start", (e) => {
  const data = JSON.parse(e.data);
  // Update UI: show spinner for data.stage, display data.label
  setCurrentStage(data.stage);
  setStageStatus(data.stage, "loading");
});

evtSource.addEventListener("stage_complete", (e) => {
  const data = JSON.parse(e.data);
  // Update UI: mark stage done, show data.data_preview
  setStageStatus(data.stage, "complete");
  setStagePreview(data.stage, data.data_preview);
  // Store stage_data for dashboard
  setStageData(data.stage, data.stage_data);
});

evtSource.addEventListener("stage_error", (e) => {
  const data = JSON.parse(e.data);
  if (data.recoverable) {
    // Show warning but continue
    setStageStatus(data.stage, "warning");
  }
});

evtSource.addEventListener("results_ready", (e) => {
  const data = JSON.parse(e.data);
  // Transition to dashboard with full results
  setResults(data.results);
  setView("dashboard");
  evtSource.close();
});

evtSource.addEventListener("error", (e) => {
  const data = JSON.parse(e.data);
  // Show error state
  setError(data.error);
  evtSource.close();
});


