"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   Types — mirror lumen/plans/api_contract.md AnalysisResult
   ───────────────────────────────────────────────────────────── */

type Founder = {
  name: string;
  title: string;
  linkedin_url?: string;
  previous_company?: string;
  previous_title?: string;
  education?: string;
};

type Company = {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  sub_industry?: string;
  stage?: string;
  headcount?: number;
  founded_year?: number;
  location?: { city?: string; country?: string; country_iso3?: string };
  funding?: {
    total_raised_usd?: number;
    last_round?: string;
    last_round_date?: string;
    investors?: string[];
  };
  metrics?: {
    web_traffic_monthly?: number;
    web_traffic_qoq_pct?: number;
    headcount_qoq_pct?: number;
  };
  founders?: Founder[];
};

type Competitor = {
  name: string;
  domain: string;
  stage?: string;
  headcount?: number;
  total_raised_usd?: number;
  investors?: string[];
};

type InvestorFreq = {
  investor_name: string;
  deals_in_set: number;
  companies_funded: string[];
  stages_invested?: string[];
  total_deployed_in_set_usd?: number;
};

type PartnerProfile = {
  name: string;
  firm: string;
  title: string;
  linkedin_url?: string;
  background?: {
    previous_roles?: { company: string; title: string; years?: string }[];
    education?: string[];
    notable_investments?: string[];
    domains_of_focus?: string[];
  };
  affinity_signals?: Record<string, boolean>;
};

type WebSignal = {
  type: string;
  title: string;
  date?: string;
  days_ago?: number;
  relevance_score?: number;
  snippet?: string;
};

type SignalsByFirm = {
  firm: string;
  partner: string;
  signals: WebSignal[];
};

type VCMatch = {
  tier: 1 | 2;
  firm_name: string;
  formerly?: string | null;
  score: number;
  score_breakdown?: Record<string, number>;
  check_size?: string;
  stage_preference?: string;
  portfolio_deals_in_set?: number;
  competitors_funded?: string[];
  reasons?: string[];
  portfolio_gap_analysis?: string;
  thesis_alignment?: string;
  recommended_partner?: {
    name: string;
    title: string;
    linkedin_url?: string;
    background_summary?: string;
    recent_signal?: {
      type?: string;
      title?: string;
      date?: string;
      days_ago?: number;
      snippet?: string;
    };
    affinity_signals?: Record<string, boolean>;
  };
};

type SimilarFounder = {
  name: string;
  company: string;
  raise_summary?: string;
  key_investors?: string[];
  note?: string;
};

type AnalysisResult = {
  analysis_id: string;
  status: string;
  domain: string;
  duration_seconds?: number;
  company: Company;
  competitors: Competitor[];
  investor_network?: {
    unique_investors_count?: number;
    funding_rounds_analyzed?: number;
    investor_frequency?: InvestorFreq[];
  };
  vc_matches: VCMatch[];
  similar_founders?: SimilarFounder[];
  pattern_analysis?: string;
};

/* Stage_data cache keyed by backend stage id */
type StageId = "1" | "2" | "3" | "4" | "5a" | "5b" | "6";
type StageStore = Partial<Record<StageId, Record<string, unknown>>>;

/* ─────────────────────────────────────────────────────────────
   Style helpers (from v2)
   ───────────────────────────────────────────────────────────── */

const f = (w = 400, s = 14): React.CSSProperties => ({
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontWeight: w,
  fontSize: s,
});
const se = (s = 28): React.CSSProperties => ({
  fontFamily: "'Instrument Serif', serif",
  fontWeight: 400,
  fontSize: s,
});

/* ─────────────────────────────────────────────────────────────
   Data formatters
   ───────────────────────────────────────────────────────────── */

const STAGE_NAMES: Record<string, string> = {
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f: "Series F",
  series_g: "Series G",
  series_h: "Series H",
  series_i: "Series I",
  series_j: "Series J",
  series_unknown: "",
  undisclosed: "",
  non_equity_assistance: "",
  corporate_round: "Corporate",
  debt_financing: "Debt",
  post_ipo_debt: "Post-IPO debt",
  post_ipo_equity: "Post-IPO equity",
  post_ipo_secondary: "Post-IPO 2°",
  secondary_market: "Secondary",
  private_equity: "PE",
  convertible_note: "Convertible",
  grant: "Grant",
};
const STAGE_ORDER = [
  "Pre-seed", "Seed",
  "Series A", "Series B", "Series C", "Series D", "Series E",
  "Series F", "Series G", "Series H", "Series I", "Series J",
  "Corporate", "Convertible", "Debt", "PE", "Secondary",
  "Post-IPO debt", "Post-IPO equity", "Post-IPO 2°", "Grant",
];
function humanizeStages(raw?: string, max = 4): { text: string; moreCount: number } {
  if (!raw) return { text: "", moreCount: 0 };
  const seen = new Set<string>();
  const parts: string[] = [];
  raw.split(",").forEach((s) => {
    const key = s.trim().toLowerCase();
    if (!key) return;
    const mapped =
      key in STAGE_NAMES
        ? STAGE_NAMES[key]
        : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (!mapped || seen.has(mapped)) return;
    seen.add(mapped);
    parts.push(mapped);
  });
  parts.sort((a, b) => {
    const ai = STAGE_ORDER.indexOf(a);
    const bi = STAGE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const visible = parts.slice(0, max);
  return { text: visible.join(", "), moreCount: Math.max(0, parts.length - max) };
}

function toTitleCase(s: string): string {
  if (!s) return s;
  // If already has uppercase letters, leave it (e.g. "Tiger Global Management", "BlueOrchard").
  if (/[A-Z]/.test(s)) return s;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function tierFromScore(score: number): 1 | 2 | 3 {
  if (score >= 80) return 1;
  if (score >= 60) return 2;
  return 3;
}
const TIER_COLOR: Record<1 | 2 | 3, { fg: string; bg: string; label: string }> = {
  1: { fg: "#2D8B4E", bg: "#F0F7F2", label: "Strong match" },
  2: { fg: "#9A7B4F", bg: "#FAF6F0", label: "Promising" },
  3: { fg: "#777777", bg: "#EFEFEB", label: "Emerging" },
};

function formatHeadcount(n?: number | null): string | null {
  if (n == null) return null;
  return n.toLocaleString();
}

/* ─────────────────────────────────────────────────────────────
   Primitives
   ───────────────────────────────────────────────────────────── */

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 85 ? "#2D8B4E" : score >= 70 ? "#B8860B" : "#8B8B8B";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECEAE4" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
      />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatRecentSignal(vc: VCMatch): string | null {
  const s = vc.recommended_partner?.recent_signal;
  if (!s) return null;
  const parts: string[] = [];
  if (s.title) parts.push(s.title);
  if (s.days_ago != null) parts.push(`${s.days_ago}d ago`);
  const head = parts.join(" · ");
  if (s.snippet) return `${head}${head ? " — " : ""}${s.snippet}`;
  return head || null;
}

/* ─────────────────────────────────────────────────────────────
   MatchCard (v1)
   ───────────────────────────────────────────────────────────── */

function MatchCard({
  vc,
  index,
  expanded,
  onToggle,
}: {
  vc: VCMatch;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const derivedTier = tierFromScore(vc.score);
  const { fg: tierColor, bg: tierBg, label: tierLabel } = TIER_COLOR[derivedTier];
  const partner = vc.recommended_partner;
  const signalText = formatRecentSignal(vc);
  const stages = humanizeStages(vc.stage_preference, 4);
  const displayFirm = toTitleCase(vc.firm_name);

  return (
    <div
      onClick={onToggle}
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #E8E6E1",
        padding: "28px 32px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        animation: `fadeSlideUp 0.5s ease ${index * 0.12}s both`,
        boxShadow: expanded ? "0 8px 32px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <ScoreRing score={vc.score} size={60} />
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              ...f(700, 15),
              color: "#1A1A1A",
            }}
          >
            {vc.score}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h3 style={{ ...se(22), color: "#1A1A1A", margin: 0 }}>{displayFirm}</h3>
            <span
              style={{
                ...f(600, 11),
                color: tierColor,
                background: tierBg,
                padding: "3px 10px",
                borderRadius: 20,
                letterSpacing: 0.3,
              }}
            >
              {tierLabel}
            </span>
          </div>
          {vc.formerly && (
            <p style={{ ...f(400, 12), color: "#9A9A9A", margin: "0 0 8px" }}>{vc.formerly}</p>
          )}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {vc.check_size && (
              <span style={{ ...f(400, 13), color: "#6B6B6B" }}>
                Check: <strong style={{ color: "#1A1A1A" }}>{vc.check_size}</strong>
              </span>
            )}
            {stages.text && (
              <span style={{ ...f(400, 13), color: "#6B6B6B" }}>
                Stage: <strong style={{ color: "#1A1A1A" }}>{stages.text}</strong>
                {stages.moreCount > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "#F2F0EB",
                      color: "#8A8A8A",
                      ...f(500, 11),
                    }}
                  >
                    +{stages.moreCount} more
                  </span>
                )}
              </span>
            )}
            {vc.portfolio_deals_in_set != null && (
              <span style={{ ...f(400, 13), color: "#6B6B6B" }}>
                Competitors funded:{" "}
                <strong style={{ color: "#1A1A1A" }}>{vc.portfolio_deals_in_set}</strong>
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease",
            fontSize: 18,
            color: "#BFBFBF",
            flexShrink: 0,
            marginTop: 4,
          }}
        >
          ▾
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 24, animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "#FAFAF8", borderRadius: 10, padding: "20px 24px" }}>
              <h4 style={{ ...se(16), color: "#1A1A1A", margin: "0 0 14px" }}>Why this match</h4>
              {(vc.reasons ?? []).map((r, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}
                >
                  <span style={{ color: "#2D8B4E", fontSize: 14, marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ ...f(400, 13.5), color: "#3D3D3D", lineHeight: 1.5 }}>{r}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "#FAFAF8", borderRadius: 10, padding: "20px 24px" }}>
              <h4 style={{ ...se(16), color: "#1A1A1A", margin: "0 0 14px" }}>Recommended partner</h4>
              {partner ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #E8E6E1, #D4D2CD)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        ...se(18),
                        color: "#6B6B6B",
                      }}
                    >
                      {initials(partner.name)}
                    </div>
                    <div>
                      <p style={{ ...f(600, 14), color: "#1A1A1A", margin: 0 }}>
                        {partner.linkedin_url ? (
                          <a
                            href={partner.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#1A1A1A", textDecoration: "none" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {partner.name}
                          </a>
                        ) : (
                          partner.name
                        )}
                      </p>
                      <p style={{ ...f(400, 12), color: "#9A9A9A", margin: 0 }}>{partner.title}</p>
                    </div>
                  </div>
                  {partner.background_summary && (
                    <p style={{ ...f(400, 13), color: "#4D4D4D", lineHeight: 1.6, margin: "0 0 12px" }}>
                      {partner.background_summary}
                    </p>
                  )}
                  {signalText && (
                    <div
                      style={{
                        background: "#FFF8EB",
                        border: "1px solid #F0DDB8",
                        borderRadius: 8,
                        padding: "10px 14px",
                      }}
                    >
                      <p
                        style={{
                          ...f(400, 12),
                          color: "#8B6914",
                          margin: 0,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          lineHeight: 1.55,
                        }}
                      >
                        <strong>Recent signal:</strong> {signalText}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ ...f(400, 13), color: "#9A9A9A", margin: 0 }}>
                  Partner profile not available.
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 16 }}>
            {vc.portfolio_gap_analysis && (
              <div style={{ background: "#F0F7F2", borderRadius: 10, padding: "16px 20px" }}>
                <p
                  style={{
                    ...f(600, 12),
                    color: "#2D8B4E",
                    margin: "0 0 6px",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  Portfolio gap
                </p>
                <p style={{ ...f(400, 13), color: "#1A3D28", margin: 0, lineHeight: 1.5 }}>
                  {vc.portfolio_gap_analysis}
                </p>
              </div>
            )}
            {vc.thesis_alignment && (
              <div style={{ background: "#F4F1FC", borderRadius: 10, padding: "16px 20px" }}>
                <p
                  style={{
                    ...f(600, 12),
                    color: "#6B47B8",
                    margin: "0 0 6px",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  Investment thesis
                </p>
                <p style={{ ...f(400, 13), color: "#2D1F5E", margin: 0, lineHeight: 1.5 }}>
                  {vc.thesis_alignment}
                </p>
              </div>
            )}
          </div>

          {vc.competitors_funded && vc.competitors_funded.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...f(400, 12), color: "#9A9A9A" }}>Funded:</span>
              {vc.competitors_funded.map((c, i) => (
                <span
                  key={i}
                  style={{
                    ...f(500, 12),
                    color: "#4D4D4D",
                    background: "#F2F2F0",
                    padding: "4px 12px",
                    borderRadius: 20,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   HOME (v1)
   ───────────────────────────────────────────────────────────── */

function CountUp({ to, suffix = "", duration = 1400, delay = 0 }: { to: number; suffix?: string; duration?: number; delay?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, delay]);
  return <>{val}{suffix}</>;
}

function HomeView({
  query,
  setQuery,
  onStart,
  errorMessage,
}: {
  query: string;
  setQuery: (v: string) => void;
  onStart: () => void;
  errorMessage: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [btnHover, setBtnHover] = useState(false);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#FAFAF8",
        padding: "40px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aurora mesh — very soft, slowly drifting */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-20%",
          left: "-15%",
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(45,139,78,0.11), rgba(45,139,78,0) 65%)",
          filter: "blur(40px)",
          animation: "auroraA 18s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "-25%",
          right: "-10%",
          width: 540,
          height: 540,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(218,165,91,0.10), rgba(218,165,91,0) 65%)",
          filter: "blur(48px)",
          animation: "auroraB 22s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.025,
          backgroundImage: "radial-gradient(circle, #1A1A1A 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "15%",
          right: "18%",
          width: 180,
          height: 180,
          borderRadius: "50%",
          border: "1px solid #E8E6E1",
          opacity: 0.5,
          animation: "floatDrift 14s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          left: "12%",
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: "1px solid #E8E6E1",
          opacity: 0.3,
          animation: "floatDrift 18s ease-in-out infinite 1.5s reverse",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "68%",
          right: "10%",
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "1px dashed #E0DED8",
          opacity: 0.6,
          animation: "subtleRotate 40s linear infinite",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 640 }}>
        <div style={{ animation: "fadeSlideUp 0.8s ease" }}>
          <p
            style={{
              ...f(600, 12),
              letterSpacing: 2.5,
              textTransform: "uppercase",
              color: "#2D8B4E",
              margin: "0 0 24px",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#2D8B4E",
                display: "inline-block",
                animation: "liveDot 2.2s ease-in-out infinite",
              }}
            />
            Powered by Crustdata
          </p>
          <h1
            style={{
              ...se(72),
              color: "#1A1A1A",
              margin: "0 0 4px",
              letterSpacing: -1,
              background: "linear-gradient(100deg, #1A1A1A 0%, #1A1A1A 40%, #2D8B4E 50%, #1A1A1A 60%, #1A1A1A 100%)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "shimmerSweep 4.5s ease-in-out 0.6s infinite",
            }}
          >
            Lumen
          </h1>
          <p
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: "italic",
              fontSize: 22,
              color: "#9A9A9A",
              margin: "0 0 16px",
              fontWeight: 400,
            }}
          >
            The fundraising intelligence you deserve.
          </p>
          <p
            style={{
              ...f(400, 15),
              color: "#6B6B6B",
              margin: "0 auto 48px",
              lineHeight: 1.7,
              maxWidth: 480,
            }}
          >
            Paste your company URL or LinkedIn. In 30 seconds, get the VCs most likely to fund you
            — with partner-level recommendations, thesis alignment, and the exact pitch angle to
            use.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 0,
            maxWidth: 520,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #E0DED8",
            boxShadow: "0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)",
            overflow: "hidden",
            animation: "fadeSlideUp 0.8s ease 0.2s both, breathGlow 5.5s ease-in-out 1.2s infinite",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="paygrid.io or linkedin.com/company/paygrid"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onStart()}
            style={{
              flex: 1,
              padding: "18px 24px",
              fontSize: 16,
              border: "none",
              outline: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: "#1A1A1A",
              background: "transparent",
            }}
          />
          <button
            onClick={onStart}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              position: "relative",
              padding: "18px 32px",
              background: btnHover ? "#333" : "#1A1A1A",
              color: "#fff",
              border: "none",
              ...f(600, 14),
              cursor: "pointer",
              letterSpacing: 0.3,
              transition: "background 0.25s ease, transform 0.25s ease",
              transform: btnHover ? "translateY(-1px)" : "translateY(0)",
              overflow: "hidden",
            }}
          >
            <span style={{ position: "relative", zIndex: 1 }}>Find my VCs</span>
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "40%",
                height: "100%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
                animation: btnHover ? "gleamSweep 0.9s ease-out" : "none",
                pointerEvents: "none",
              }}
            />
          </button>
        </div>

        {errorMessage && (
          <p style={{ ...f(500, 13), color: "#B84848", marginTop: 18, animation: "fadeIn 0.3s ease" }}>
            {errorMessage}
          </p>
        )}

        <div
          style={{
            animation: "fadeSlideUp 0.8s ease 0.4s both",
            display: "flex",
            justifyContent: "center",
            gap: 40,
            marginTop: 48,
          }}
        >
          {[
            { num: 12, suffix: "M+", label: "Companies indexed" },
            { num: 250, suffix: "M+", label: "People profiles" },
            { num: 30, suffix: "s", label: "Time to results" },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                textAlign: "center",
                position: "relative",
                paddingLeft: i === 0 ? 0 : 20,
                borderLeft: i === 0 ? "none" : "1px solid rgba(26,26,26,0.08)",
              }}
            >
              <p style={{ ...se(24), color: "#1A1A1A", margin: "0 0 2px", fontVariantNumeric: "tabular-nums" }}>
                <CountUp to={s.num} suffix={s.suffix} duration={1400} delay={600 + i * 180} />
              </p>
              <p style={{ ...f(400, 12), color: "#9A9A9A", margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ANALYSIS VIEW (v2) — driven by real SSE stage_data
   ─────────────────────────────────────────────────────────────

   Stage mapping (backend → UI panel index):
     "1"  → 0  Company profile
     "2"  → 1  Competitors
     "3"  → 2  Investor network
     "4"  → 2  Ranking (same panel, brief tick)
     "5a" → 3  Partners
     "5b" → 4  Web signals
     "6"  → 5  Final scores
*/

const UI_STAGES = [
  { label: "Enriching company profile", api: "Company Enrich API" },
  { label: "Discovering competitors", api: "Company Search API" },
  { label: "Mapping investor networks", api: "Batch Enrich + Ranking" },
  { label: "Profiling VC partners", api: "Person Search + Enrich" },
  { label: "Scanning web intelligence", api: "Web Search API" },
  { label: "Scoring and ranking", api: "AI Synthesis Engine" },
] as const;

const PANEL_HEADER = [
  { k: "Company profile", d: "Enriched via Crustdata Company Enrich API" },
  { k: "Competitors found", d: "Discovered companies in your competitive set" },
  { k: "Investor network", d: "Extracted investors from competitor funding rounds" },
  { k: "VC partners", d: "Profiled partners across shortlisted firms" },
  { k: "Web signals", d: "Scanning recent posts, talks, and articles" },
  { k: "Match scores", d: "Scoring VCs across 5 weighted dimensions" },
] as const;

// Demo pacing constants — keep each UI panel visible this long regardless of
// how fast the backend streams. Data reveals REVEAL_MS into each window so the
// user sees skeleton → real content inside each 10s dwell.
const PANEL_DWELL_MS = 10_000;
const REVEAL_MS = 3_000;

// Which backend stage ids feed which UI panel index.
const STAGES_BY_PANEL: Record<number, StageId[]> = {
  0: ["1"],
  1: ["2"],
  2: ["3", "4"],
  3: ["5a"],
  4: ["5b"],
  5: ["6"],
};

function stageToUIIndex(stage: StageId): number {
  switch (stage) {
    case "1": return 0;
    case "2": return 1;
    case "3": return 2;
    case "4": return 2;
    case "5a": return 3;
    case "5b": return 4;
    case "6": return 5;
  }
}

function AnalysisView({
  query,
  activeIndex,
  completedIndex,
  stageStore,
}: {
  query: string;
  activeIndex: number;
  completedIndex: number;
  stageStore: StageStore;
}) {
  const panel = renderStagePanel(activeIndex, stageStore);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF8", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 48px",
          borderBottom: "1px solid #ECEAE4",
        }}
      >
        <span style={{ ...se(24), color: "#1A1A1A" }}>Lumen</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...f(400, 13), color: "#8B8B8B" }}>Analyzing</span>
          <span style={{ ...f(600, 13), color: "#1A1A1A" }}>{query}</span>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          maxWidth: 1080,
          width: "100%",
          margin: "0 auto",
          padding: "40px 48px",
        }}
      >
        {/* Pipeline sidebar */}
        <div style={{ width: 300, flexShrink: 0, paddingRight: 40 }}>
          <p style={{ ...f(600, 10.5), letterSpacing: 1.2, textTransform: "uppercase", color: "#C5C5C5", marginBottom: 6 }}>
            Intelligence pipeline
          </p>
          <p style={{ ...f(400, 12), color: "#8B8B8B", marginBottom: 24, lineHeight: 1.5 }}>
            6 stages across Crustdata Company, Person, and Web APIs
          </p>
          {UI_STAGES.map((s, i) => {
            const done = i <= completedIndex;
            const active = i === activeIndex && !done;
            const pending = i > activeIndex;
            return (
              <div key={i} style={{ display: "flex", gap: 14, position: "relative" }}>
                {i < UI_STAGES.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 30,
                      width: 1,
                      height: "calc(100% - 6px)",
                      background: done ? "#2D8B4E" : "#ECEAE4",
                      transition: "background 0.5s",
                    }}
                  />
                )}
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    ...f(600, 10.5),
                    transition: "all 0.4s",
                    background: done ? "#2D8B4E" : active ? "#fff" : "#F5F4F0",
                    color: done ? "#fff" : active ? "#2D8B4E" : "#C5C5C5",
                    border: active ? "2px solid #2D8B4E" : "2px solid transparent",
                    animation: active ? "pulseRing 2s ease infinite" : "none",
                  }}
                >
                  {done ? "✓" : active ? (
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        border: "2px solid #2D8B4E",
                        borderTopColor: "transparent",
                        animation: "spinSlow 0.8s linear infinite",
                      }}
                    />
                  ) : (
                    i + 1
                  )}
                </div>
                <div
                  style={{
                    flex: 1,
                    paddingBottom: 22,
                    opacity: pending ? 0.3 : 1,
                    transition: "opacity 0.4s",
                  }}
                >
                  <p style={{ ...f(active ? 600 : 500, 12.5), color: "#1A1A1A", marginBottom: 1 }}>{s.label}</p>
                  <p style={{ ...f(400, 10.5), color: "#AEAEAE", margin: 0 }}>{s.api}</p>
                </div>
              </div>
            );
          })}
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              background: "#fff",
              borderRadius: 9,
              border: "1px solid #ECEAE4",
            }}
          >
            <p style={{ ...f(500, 9.5), color: "#C5C5C5", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
              Data sources
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["Company Profiles", "Funding Rounds", "Headcount", "Web Traffic", "LinkedIn", "Social Posts", "News"].map(
                (s) => (
                  <span
                    key={s}
                    style={{
                      ...f(400, 9.5),
                      color: "#8B8B8B",
                      background: "#FAFAF8",
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}
                  >
                    {s}
                  </span>
                )
              )}
            </div>
          </div>
        </div>

        {/* Panel area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p
                style={{
                  ...f(600, 10.5),
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "#C5C5C5",
                  marginBottom: 3,
                }}
              >
                {PANEL_HEADER[activeIndex]?.k}
              </p>
              <p style={{ ...f(400, 12), color: "#8B8B8B", margin: 0 }}>{PANEL_HEADER[activeIndex]?.d}</p>
            </div>
            <span style={{ ...f(500, 11), color: "#AEAEAE" }}>
              Stage {activeIndex + 1}/{UI_STAGES.length}
            </span>
          </div>
          <div key={activeIndex}>{panel}</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Stage panels — render from real stage_data
   ───────────────────────────────────────────────────────────── */

function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ECEAE4",
        padding: "22px 26px",
        animation: "fadeIn 0.3s ease",
      }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 12,
            borderRadius: 6,
            background: "linear-gradient(90deg, #F5F4F0 0%, #ECEAE4 50%, #F5F4F0 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.6s linear infinite",
            marginBottom: 10,
            width: `${90 - i * 8}%`,
          }}
        />
      ))}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function renderStagePanel(activeIndex: number, store: StageStore): React.ReactNode {
  switch (activeIndex) {
    case 0: return <CompanyPanel data={(store["1"]?.company as Company | undefined) ?? null} />;
    case 1: return <CompetitorsPanel data={(store["2"]?.competitors as Competitor[] | undefined) ?? null} />;
    case 2: return (
      <InvestorFreqPanel
        data={(store["3"]?.investor_frequency as InvestorFreq[] | undefined) ?? null}
        shortlisted={(store["4"]?.shortlisted_firms as Array<{ name: string; preliminary_score: number; reason: string }> | undefined) ?? null}
      />
    );
    case 3: return <PartnersPanel data={(store["5a"]?.partners as PartnerProfile[] | undefined) ?? null} />;
    case 4: return <WebSignalsPanel data={(store["5b"]?.signals_by_firm as SignalsByFirm[] | undefined) ?? null} />;
    case 5: return <ScoresPanel store={store} />;
    default: return null;
  }
}

function CompanyPanel({ data }: { data: Company | null }) {
  if (!data) return <Skeleton lines={6} />;
  const loc = data.location?.city ?? data.location?.country ?? "—";
  const traffic = data.metrics?.web_traffic_monthly
    ? `${(data.metrics.web_traffic_monthly / 1000).toFixed(1)}K/mo`
    : "—";
  const growth = data.metrics?.web_traffic_qoq_pct != null
    ? `${data.metrics.web_traffic_qoq_pct >= 0 ? "+" : ""}${data.metrics.web_traffic_qoq_pct.toFixed(0)}% QoQ`
    : "—";
  const rows: [string, string][] = [
    ["Industry", data.industry ?? "—"],
    ["Stage", data.stage ?? "—"],
    ["Team", data.headcount ? `${data.headcount.toLocaleString()} people` : "—"],
    ["Location", loc],
    ["Traffic", traffic],
    ["Growth", growth],
  ];
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ECEAE4",
        padding: "22px 26px",
        animation: "cardAppear 0.5s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: "#1A1A1A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...se(19),
            color: "#fff",
          }}
        >
          {data.name?.[0] ?? "·"}
        </div>
        <div>
          <p style={{ ...f(600, 16), color: "#1A1A1A", margin: 0 }}>{data.name}</p>
          <p style={{ ...f(400, 12), color: "#AEAEAE", margin: 0 }}>
            {data.domain}
            {data.description ? ` · ${data.description}` : ""}
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {rows.map(([k, v], i) => (
          <div
            key={i}
            style={{
              background: "#FAFAF8",
              borderRadius: 8,
              padding: "9px 13px",
              animation: `countUp 0.3s ease ${i * 0.07}s both`,
            }}
          >
            <p style={{ ...f(500, 9), color: "#C5C5C5", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
              {k}
            </p>
            <p style={{ ...f(600, 13.5), color: "#1A1A1A", margin: 0 }}>{v}</p>
          </div>
        ))}
      </div>
      {data.founders && data.founders.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #F5F4F0", paddingTop: 12 }}>
          <p style={{ ...f(500, 9), color: "#C5C5C5", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Founders identified
          </p>
          {data.founders.map((fo, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 6,
                animation: `slideIn 0.3s ease ${0.3 + i * 0.1}s both`,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: i === 0 ? "#EEFBF3" : "#F3F0FB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...f(600, 9.5),
                  color: i === 0 ? "#2D8B4E" : "#6B47B8",
                }}
              >
                {initials(fo.name)}
              </div>
              <span style={{ ...f(600, 12), color: "#1A1A1A" }}>{fo.name}</span>
              {fo.previous_company && (
                <span style={{ ...f(400, 11), color: "#AEAEAE" }}>
                  Ex-{fo.previous_company}
                  {fo.previous_title ? ` (${fo.previous_title})` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitorsPanel({ data }: { data: Competitor[] | null }) {
  if (!data) return <Skeleton lines={5} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "cardAppear 0.5s ease" }}>
      {data.map((c, i) => (
        <div
          key={i}
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #ECEAE4",
            padding: "13px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: `slideIn 0.4s ease ${i * 0.08}s both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "#F5F4F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...f(600, 11),
                color: "#8B8B8B",
              }}
            >
              {c.name[0]}
            </div>
            <div>
              <p style={{ ...f(600, 12.5), color: "#1A1A1A", margin: 0 }}>{c.name}</p>
              <p style={{ ...f(400, 10.5), color: "#C5C5C5", margin: 0 }}>{c.domain}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {c.stage && (
              <span style={{ ...f(500, 10.5), color: "#8B8B8B", background: "#F5F4F0", padding: "2px 8px", borderRadius: 4 }}>
                {c.stage}
              </span>
            )}
            {c.total_raised_usd != null && (
              <span style={{ ...f(600, 12), color: "#1A1A1A" }}>{formatUSD(c.total_raised_usd)}</span>
            )}
            {c.headcount != null && (
              <span style={{ ...f(400, 11), color: "#AEAEAE" }}>{c.headcount.toLocaleString()} people</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function InvestorFreqPanel({
  data,
  shortlisted,
}: {
  data: InvestorFreq[] | null;
  shortlisted: Array<{ name: string; preliminary_score: number; reason: string }> | null;
}) {
  if (!data) return <Skeleton lines={6} />;
  const max = Math.max(...data.map((d) => d.deals_in_set), 1);
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ECEAE4",
        padding: "22px 26px",
        animation: "cardAppear 0.5s ease",
      }}
    >
      <p style={{ ...f(500, 9), color: "#C5C5C5", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 16 }}>
        Investor frequency across competitors
      </p>
      {data.slice(0, 10).map((inv, i) => {
        const pct = (inv.deals_in_set / max) * 100;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 7,
              animation: `slideIn 0.3s ease ${i * 0.06}s both`,
            }}
          >
            <span style={{ ...f(500, 11), color: "#1A1A1A", width: 140, flexShrink: 0, textAlign: "right" }}>
              {inv.investor_name}
            </span>
            <div style={{ flex: 1, height: 6, background: "#F5F4F0", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: inv.deals_in_set >= 2 ? "#2D8B4E" : "#D4D2CD",
                  animation: `widthGrow 0.8s ease ${0.2 + i * 0.06}s both`,
                }}
              />
            </div>
            <span style={{ ...f(500, 10.5), color: "#AEAEAE", width: 50, flexShrink: 0 }}>
              {inv.deals_in_set} {inv.deals_in_set === 1 ? "deal" : "deals"}
            </span>
          </div>
        );
      })}
      {shortlisted && shortlisted.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #F5F4F0", paddingTop: 10 }}>
          <p style={{ ...f(500, 11.5), color: "#2D8B4E", margin: 0 }}>
            Shortlisted {shortlisted.length} firms for deep profiling
          </p>
          <p style={{ ...f(400, 11), color: "#AEAEAE", marginTop: 4 }}>
            {shortlisted.slice(0, 3).map((s) => s.name).join(" · ")}
            {shortlisted.length > 3 ? ` +${shortlisted.length - 3}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function PartnersPanel({ data }: { data: PartnerProfile[] | null }) {
  if (!data) return <Skeleton lines={5} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "cardAppear 0.5s ease" }}>
      <p style={{ ...f(400, 12), color: "#8B8B8B", marginBottom: 4 }}>
        Profiling investment partners at each shortlisted firm
      </p>
      {data.slice(0, 5).map((p, i) => (
        <div
          key={i}
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #ECEAE4",
            padding: "16px 20px",
            animation: `slideIn 0.4s ease ${i * 0.12}s both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#ECEAE4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...f(600, 10),
                color: "#8B8B8B",
              }}
            >
              {initials(p.name)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...f(600, 12.5), color: "#1A1A1A", margin: 0 }}>{p.name}</p>
              <p style={{ ...f(400, 10.5), color: "#AEAEAE", margin: 0 }}>
                {p.title} · {p.firm}
              </p>
            </div>
          </div>
          {p.background?.notable_investments && p.background.notable_investments.length > 0 && (
            <p style={{ ...f(400, 11.5), color: "#6B6B6B", lineHeight: 1.5, margin: 0 }}>
              Notable: {p.background.notable_investments.slice(0, 4).join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  linkedin_post: "#0A66C2",
  blog_post: "#1A1A1A",
  conference_talk: "#D85A30",
  twitter_thread: "#1DA1F2",
  interview: "#6B6B6B",
};

function WebSignalsPanel({ data }: { data: SignalsByFirm[] | null }) {
  if (!data) return <Skeleton lines={5} />;
  const flat: Array<WebSignal & { firm: string; partner: string }> = [];
  data.forEach((f) => f.signals.forEach((s) => flat.push({ ...s, firm: f.firm, partner: f.partner })));
  flat.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ECEAE4",
        padding: "22px 26px",
        animation: "cardAppear 0.5s ease",
      }}
    >
      <p style={{ ...f(500, 9), color: "#C5C5C5", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>
        {flat.length} signals found across web, social, and news
      </p>
      {flat.slice(0, 6).map((s, i) => {
        const rel = Math.round((s.relevance_score ?? 0) * 100);
        const col = SOURCE_COLORS[s.type] ?? "#6B6B6B";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "10px 0",
              borderBottom: i < Math.min(flat.length - 1, 5) ? "1px solid #F5F4F0" : "none",
              animation: `slideIn 0.3s ease ${i * 0.1}s both`,
            }}
          >
            <span
              style={{
                ...f(500, 10),
                color: "#fff",
                background: col,
                padding: "2px 7px",
                borderRadius: 4,
                flexShrink: 0,
                marginTop: 2,
                textTransform: "capitalize",
              }}
            >
              {s.type.replace("_", " ")}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ ...f(500, 12), color: "#1A1A1A", margin: 0 }}>{s.title}</p>
              <p style={{ ...f(400, 10.5), color: "#AEAEAE", margin: 0 }}>
                {s.partner}
                {s.days_ago != null ? ` · ${s.days_ago}d ago` : ""}
              </p>
            </div>
            {rel > 0 && (
              <div
                style={{
                  background: rel >= 85 ? "#EEFBF3" : "#F5F4F0",
                  padding: "2px 8px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                <span style={{ ...f(600, 10.5), color: rel >= 85 ? "#2D8B4E" : "#8B8B8B" }}>{rel}%</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoresPanel({ store }: { store: StageStore }) {
  const meta = store["6"] as { matches_count?: number; tier_1_count?: number; tier_2_count?: number } | undefined;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ECEAE4",
        padding: "22px 26px",
        animation: "cardAppear 0.5s ease",
      }}
    >
      <p style={{ ...f(500, 9), color: "#C5C5C5", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 16 }}>
        Scoring across 5 weighted dimensions
      </p>
      {["Sector fit", "Stage alignment", "Portfolio gap", "Partner affinity", "Thesis recency"].map((dim, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ ...f(500, 12), color: "#1A1A1A", width: 150, flexShrink: 0 }}>{dim}</span>
          <div style={{ flex: 1, height: 6, background: "#F5F4F0", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                width: `${85 - i * 8}%`,
                height: "100%",
                borderRadius: 3,
                background: "#2D8B4E",
                animation: `widthGrow 1s ease ${i * 0.15}s both`,
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 14, borderTop: "1px solid #F5F4F0", paddingTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#2D8B4E",
            animation: "dotPulse 1.2s ease infinite",
          }}
        />
        <span style={{ ...f(500, 12.5), color: "#2D8B4E" }}>
          {meta?.matches_count
            ? `${meta.matches_count} matches · ${meta.tier_1_count ?? 0} strong, ${meta.tier_2_count ?? 0} worth exploring — preparing dashboard…`
            : "Preparing your dashboard…"}
        </span>
      </div>
    </div>
  );
}

function formatUSD(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

/* ─────────────────────────────────────────────────────────────
   DASHBOARD (v1)
   ───────────────────────────────────────────────────────────── */

const SIDEBAR_COLORS = ["#FFF1EC", "#EDF5FF", "#F0F7F2", "#FFF8EB", "#F4F1FC"];
const SIDEBAR_FG = ["#D85A30", "#185FA5", "#2D8B4E", "#C07D20", "#6B47B8"];

function Dashboard({ result }: { result: AnalysisResult }) {
  const [expandedCard, setExpandedCard] = useState(0);
  const [dashTab, setDashTab] = useState<"matches" | "competitors" | "founders">("matches");

  const sorted = [...result.vc_matches].sort((a, b) => b.score - a.score);
  const tier1 = sorted.filter((v) => tierFromScore(v.score) === 1);
  const tier2 = sorted.filter((v) => tierFromScore(v.score) === 2);
  const tier3 = sorted.filter((v) => tierFromScore(v.score) === 3);
  const company = result.company;

  const stage = company.stage ?? null;
  const headcount = formatHeadcount(company.headcount);
  const traffic =
    company.metrics?.web_traffic_monthly != null
      ? `${(company.metrics.web_traffic_monthly / 1000).toFixed(1)}K/mo`
      : null;
  const growth =
    company.metrics?.web_traffic_qoq_pct != null
      ? `${company.metrics.web_traffic_qoq_pct >= 0 ? "+" : ""}${company.metrics.web_traffic_qoq_pct.toFixed(0)}% QoQ`
      : null;

  const freq = result.investor_network?.investor_frequency ?? [];
  const freqMax = Math.max(...freq.map((f) => f.deals_in_set), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF8", display: "flex" }}>
      {/* Sidebar */}
      <div
        style={{
          width: 240,
          background: "#fff",
          borderRight: "1px solid #E8E6E1",
          padding: "28px 0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ padding: "0 24px", marginBottom: 36 }}>
          <h2 style={{ ...se(26), color: "#1A1A1A", margin: "0 0 2px" }}>Lumen</h2>
          <p style={{ ...f(400, 11), color: "#BFBFBF", margin: 0, letterSpacing: 0.5 }}>Fundraising intelligence</p>
        </div>

        {([
          { id: "matches", label: "VC matches", count: result.vc_matches.length },
          { id: "competitors", label: "Competitor map", count: result.competitors.length },
          { id: "founders", label: "Similar founders", count: result.similar_founders?.length ?? 0 },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDashTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "11px 24px",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              background: dashTab === tab.id ? "#F5F5F3" : "transparent",
              borderRight: dashTab === tab.id ? "2px solid #1A1A1A" : "2px solid transparent",
              ...f(dashTab === tab.id ? 600 : 400, 13.5),
              color: dashTab === tab.id ? "#1A1A1A" : "#8B8B8B",
              transition: "all 0.2s ease",
            }}
          >
            {tab.label}
            <span
              style={{
                ...f(500, 10.5),
                color: "#C5C5C5",
                background: "#F5F4F0",
                padding: "1px 7px",
                borderRadius: 4,
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}

        <div style={{ marginTop: "auto", padding: "20px 24px", borderTop: "1px solid #E8E6E1" }}>
          <p
            style={{
              ...f(600, 11),
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#BFBFBF",
              margin: "0 0 10px",
            }}
          >
            Analyzing
          </p>
          <p style={{ ...f(600, 14), color: "#1A1A1A", margin: "0 0 2px" }}>{company.name}</p>
          <p style={{ ...f(400, 12), color: "#9A9A9A", margin: "0 0 8px" }}>
            {company.industry ?? ""}
            {company.sub_industry ? ` — ${company.sub_industry}` : ""}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[company.stage, company.headcount ? `${company.headcount} people` : null, company.location?.city]
              .filter(Boolean)
              .map((t, i) => (
                <span
                  key={i}
                  style={{
                    ...f(500, 10.5),
                    color: "#6B6B6B",
                    background: "#F2F2F0",
                    padding: "3px 8px",
                    borderRadius: 6,
                  }}
                >
                  {t as string}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto", height: "100vh" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "rgba(250,250,248,0.85)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid #E8E6E1",
            padding: "16px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#1A1A1A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...se(20),
                color: "#fff",
              }}
            >
              {company.name[0]}
            </div>
            <div>
              <h3 style={{ ...f(600, 15), color: "#1A1A1A", margin: 0 }}>{company.name}</h3>
              <p style={{ ...f(400, 12), color: "#9A9A9A", margin: 0 }}>{company.description ?? company.domain}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {(
              [
                { label: "Stage", val: stage },
                { label: "Team", val: headcount },
                { label: "Traffic", val: traffic },
                { label: "Growth", val: growth },
              ] as Array<{ label: string; val: string | null }>
            )
              .filter((m) => m.val != null)
              .map((m, i) => (
                <div key={i} style={{ textAlign: "right" }}>
                  <p
                    style={{
                      ...f(600, 10),
                      color: "#BFBFBF",
                      margin: "0 0 1px",
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    {m.label}
                  </p>
                  <p style={{ ...f(600, 13), color: "#1A1A1A", margin: 0 }}>{m.val}</p>
                </div>
              ))}
          </div>
        </div>

        <div style={{ padding: "32px 40px 60px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
          {dashTab === "matches" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              {/* Founders card */}
              {company.founders && company.founders.length > 0 && (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 14,
                    border: "1px solid #E8E6E1",
                    padding: "20px 28px",
                    marginBottom: 28,
                    animation: "fadeSlideUp 0.5s ease",
                  }}
                >
                  <p
                    style={{
                      ...f(600, 11),
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "#BFBFBF",
                      margin: "0 0 14px",
                    }}
                  >
                    Founding team
                  </p>
                  <div style={{ display: "flex", gap: 24 }}>
                    {company.founders.map((fo, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            background: i % 2 === 0 ? "#E8F5EE" : "#EDE8F5",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            ...se(17),
                            color: i % 2 === 0 ? "#2D8B4E" : "#6B47B8",
                          }}
                        >
                          {initials(fo.name)}
                        </div>
                        <div>
                          <p style={{ ...f(600, 14), color: "#1A1A1A", margin: "0 0 1px" }}>
                            {fo.name}{" "}
                            <span style={{ ...f(400, 14), color: "#9A9A9A" }}>· {fo.title}</span>
                          </p>
                          <p style={{ ...f(400, 12), color: "#6B6B6B", margin: 0 }}>
                            {[fo.previous_company && `Ex-${fo.previous_company}`, fo.education]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div>
                  <h2 style={{ ...se(28), color: "#1A1A1A", margin: "0 0 4px" }}>Your VC matches</h2>
                  <p style={{ ...f(400, 13), color: "#9A9A9A", margin: 0 }}>
                    Ranked by sector fit, stage alignment, portfolio gap, and partner thesis
                  </p>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", ...f(400, 12), color: "#9A9A9A" }}>
                  <span>
                    <strong style={{ color: "#1A1A1A" }}>{result.competitors.length}</strong> competitors analyzed
                  </span>
                  <span>·</span>
                  <span>
                    <strong style={{ color: "#1A1A1A" }}>
                      {result.investor_network?.unique_investors_count ?? "—"}
                    </strong>{" "}
                    VCs discovered
                  </span>
                  <span>·</span>
                  <span>
                    <strong style={{ color: "#2D8B4E" }}>{result.vc_matches.length}</strong> top matches
                  </span>
                </div>
              </div>

              {(
                [
                  { list: tier1, color: "#2D8B4E", title: "Strong matches — invest in your space at your stage" },
                  { list: tier2, color: "#9A7B4F", title: "Promising — adjacent sector or stage activity" },
                  { list: tier3, color: "#777777", title: "Emerging — longer-shot thesis overlap" },
                ] as const
              )
                .filter((g) => g.list.length > 0)
                .map((g, gi, arr) => {
                  const offset = arr.slice(0, gi).reduce((n, x) => n + x.list.length, 0);
                  return (
                    <div key={g.title} style={{ marginBottom: gi < arr.length - 1 ? 32 : 0 }}>
                      <p
                        style={{
                          ...f(600, 11),
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color: g.color,
                          margin: "0 0 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{ width: 6, height: 6, borderRadius: "50%", background: g.color, display: "inline-block" }}
                        />
                        {g.title}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {g.list.map((vc, i) => {
                          const idx = offset + i;
                          return (
                            <MatchCard
                              key={vc.firm_name + idx}
                              vc={vc}
                              index={idx}
                              expanded={expandedCard === idx}
                              onToggle={() => setExpandedCard(expandedCard === idx ? -1 : idx)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {dashTab === "competitors" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <h2 style={{ ...se(28), color: "#1A1A1A", margin: "0 0 4px" }}>Competitive landscape</h2>
              <p style={{ ...f(400, 13), color: "#9A9A9A", margin: "0 0 28px" }}>
                Companies in your space used to reverse-engineer investor networks
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {result.competitors.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#fff",
                      borderRadius: 14,
                      border: "1px solid #E8E6E1",
                      padding: "24px 28px",
                      animation: `fadeSlideUp 0.5s ease ${i * 0.08}s both`,
                      display: "flex",
                      alignItems: "center",
                      gap: 24,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: SIDEBAR_COLORS[i % SIDEBAR_COLORS.length],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        ...se(20),
                        color: SIDEBAR_FG[i % SIDEBAR_FG.length],
                      }}
                    >
                      {c.name[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <h3 style={{ ...f(600, 16), color: "#1A1A1A", margin: 0 }}>{c.name}</h3>
                        {c.stage && (
                          <span
                            style={{
                              ...f(500, 11),
                              color: "#6B6B6B",
                              background: "#F2F2F0",
                              padding: "2px 10px",
                              borderRadius: 20,
                            }}
                          >
                            {c.stage}
                          </span>
                        )}
                      </div>
                      <p style={{ ...f(400, 12), color: "#9A9A9A", margin: 0 }}>{c.domain}</p>
                    </div>
                    <div style={{ textAlign: "right", marginRight: 20 }}>
                      <p
                        style={{
                          ...f(600, 10),
                          color: "#BFBFBF",
                          margin: "0 0 1px",
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        Headcount
                      </p>
                      <p style={{ ...f(700, 15), color: "#1A1A1A", margin: 0 }}>
                        {c.headcount != null ? c.headcount.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", marginRight: 20 }}>
                      <p
                        style={{
                          ...f(600, 10),
                          color: "#BFBFBF",
                          margin: "0 0 1px",
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        Funding
                      </p>
                      <p style={{ ...f(700, 15), color: "#1A1A1A", margin: 0 }}>
                        {c.total_raised_usd != null ? formatUSD(c.total_raised_usd) : "—"}
                      </p>
                    </div>
                    <div style={{ minWidth: 200 }}>
                      <p
                        style={{
                          ...f(600, 10),
                          color: "#BFBFBF",
                          margin: "0 0 6px",
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        Investors
                      </p>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(c.investors ?? []).slice(0, 3).map((inv, j) => (
                          <span
                            key={j}
                            style={{
                              ...f(500, 10.5),
                              color: "#4D4D4D",
                              background: "#F2F2F0",
                              padding: "2px 8px",
                              borderRadius: 6,
                            }}
                          >
                            {inv}
                          </span>
                        ))}
                        {(c.investors?.length ?? 0) > 3 && (
                          <span style={{ ...f(400, 10.5), color: "#9A9A9A", padding: "2px 4px" }}>
                            +{(c.investors?.length ?? 0) - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {freq.length > 0 && (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 14,
                    border: "1px solid #E8E6E1",
                    padding: "28px 32px",
                    marginTop: 28,
                    animation: "fadeSlideUp 0.5s ease 0.5s both",
                  }}
                >
                  <h3 style={{ ...se(20), color: "#1A1A1A", margin: "0 0 4px" }}>
                    Investor frequency across competitors
                  </h3>
                  <p style={{ ...f(400, 12), color: "#9A9A9A", margin: "0 0 20px" }}>
                    VCs who appear most often in your competitors&apos; cap tables
                  </p>
                  {freq.slice(0, 8).map((inv, i) => {
                    const pct = (inv.deals_in_set / freqMax) * 100;
                    return (
                      <div
                        key={i}
                        style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}
                      >
                        <span
                          style={{ ...f(500, 13), color: "#1A1A1A", width: 160, flexShrink: 0 }}
                        >
                          {inv.investor_name}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 8,
                            background: "#F2F2F0",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              borderRadius: 4,
                              background: i < 3 ? "#2D8B4E" : "#D4D2CD",
                              transition: "width 1s ease",
                            }}
                          />
                        </div>
                        <span
                          style={{
                            ...f(400, 12),
                            color: "#9A9A9A",
                            width: 60,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {inv.deals_in_set} {inv.deals_in_set === 1 ? "deal" : "deals"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {dashTab === "founders" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <h2 style={{ ...se(28), color: "#1A1A1A", margin: "0 0 4px" }}>Founders like you</h2>
              <p style={{ ...f(400, 13), color: "#9A9A9A", margin: "0 0 28px" }}>
                Founders in your space who successfully raised — and who funded them
              </p>

              {result.similar_founders && result.similar_founders.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {result.similar_founders.map((fo, i) => (
                    <div
                      key={i}
                      style={{
                        background: "#fff",
                        borderRadius: 14,
                        border: "1px solid #E8E6E1",
                        padding: "28px 32px",
                        animation: `fadeSlideUp 0.5s ease ${i * 0.1}s both`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
                        <div
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: "50%",
                            background: ["#E8F5EE", "#EDF5FF", "#FFF8EB"][i % 3],
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            ...se(20),
                            color: ["#2D8B4E", "#185FA5", "#C07D20"][i % 3],
                          }}
                        >
                          {initials(fo.name)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ ...f(600, 17), color: "#1A1A1A", margin: "0 0 2px" }}>{fo.name}</h3>
                          <p style={{ ...f(400, 13), color: "#6B6B6B", margin: "0 0 12px" }}>
                            Founder, {fo.company}
                          </p>
                          <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
                            {fo.raise_summary && (
                              <div>
                                <p
                                  style={{
                                    ...f(600, 10),
                                    color: "#BFBFBF",
                                    margin: "0 0 2px",
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                  }}
                                >
                                  Raised
                                </p>
                                <p style={{ ...f(600, 13), color: "#1A1A1A", margin: 0 }}>{fo.raise_summary}</p>
                              </div>
                            )}
                            {fo.key_investors && fo.key_investors.length > 0 && (
                              <div>
                                <p
                                  style={{
                                    ...f(600, 10),
                                    color: "#BFBFBF",
                                    margin: "0 0 2px",
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                  }}
                                >
                                  Key investors
                                </p>
                                <p style={{ ...f(600, 13), color: "#1A1A1A", margin: 0 }}>
                                  {fo.key_investors.join(", ")}
                                </p>
                              </div>
                            )}
                          </div>
                          {fo.note && (
                            <div
                              style={{
                                background: "#FAFAF8",
                                borderRadius: 8,
                                padding: "10px 16px",
                                borderLeft: "3px solid #E8E6E1",
                              }}
                            >
                              <p
                                style={{
                                  ...f(400, 12.5),
                                  color: "#4D4D4D",
                                  margin: 0,
                                  lineHeight: 1.6,
                                  fontStyle: "italic",
                                }}
                              >
                                {fo.note}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ ...f(400, 13), color: "#9A9A9A" }}>No similar founders surfaced for this query.</p>
              )}

              {result.pattern_analysis && (
                <div
                  style={{
                    background: "#F0F7F2",
                    borderRadius: 14,
                    padding: "24px 28px",
                    marginTop: 24,
                    border: "1px solid #D3E8DA",
                    animation: "fadeSlideUp 0.5s ease 0.4s both",
                  }}
                >
                  <h4 style={{ ...se(18), color: "#1A3D28", margin: "0 0 8px" }}>The pattern</h4>
                  <p style={{ ...f(400, 13.5), color: "#2D5A3E", margin: 0, lineHeight: 1.7 }}>
                    {result.pattern_analysis}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Top-level: state machine + SSE wiring
   ───────────────────────────────────────────────────────────── */

type View = "home" | "analyzing" | "dashboard" | "error";

export default function LumenPage() {
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [completedIndex, setCompletedIndex] = useState(-1);
  const [stageStore, setStageStore] = useState<StageStore>({});
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const pendingDataRef = useRef<Partial<Record<StageId, Record<string, unknown>>>>({});
  const pendingResultRef = useRef<AnalysisResult | null>(null);
  const revealedPanelsRef = useRef<Set<number>>(new Set());
  const metronomeRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const metronomeDoneRef = useRef(false);

  const clearPacing = useCallback(() => {
    pendingDataRef.current = {};
    pendingResultRef.current = null;
    revealedPanelsRef.current = new Set();
    metronomeDoneRef.current = false;
    if (metronomeRef.current != null) {
      window.clearTimeout(metronomeRef.current);
      metronomeRef.current = null;
    }
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const resetPipelineState = useCallback(() => {
    setActiveIndex(0);
    setCompletedIndex(-1);
    setStageStore({});
    setResult(null);
    setErrorMessage(null);
    esRef.current?.close();
    esRef.current = null;
    clearPacing();
  }, [clearPacing]);

  const openStream = useCallback((streamUrl: string) => {
    const es = new EventSource(streamUrl);
    esRef.current = es;

    const tryFinish = () => {
      if (metronomeDoneRef.current && pendingResultRef.current) {
        const r = pendingResultRef.current;
        pendingResultRef.current = null;
        setResult(r);
        setCompletedIndex(UI_STAGES.length - 1);
        window.setTimeout(() => setView("dashboard"), 800);
      }
    };

    const pushPanelData = (idx: number) => {
      const stagesInPanel = STAGES_BY_PANEL[idx] ?? [];
      const updates: Record<string, Record<string, unknown>> = {};
      for (const s of stagesInPanel) {
        const d = pendingDataRef.current[s];
        if (d) updates[s] = d;
      }
      if (Object.keys(updates).length > 0) {
        setStageStore((prev) => ({ ...prev, ...updates }));
      }
    };

    const activatePanel = (idx: number) => {
      setActiveIndex(idx);
      // Reveal data for this panel after a short skeleton window.
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        revealedPanelsRef.current.add(idx);
        pushPanelData(idx);
        setCompletedIndex((c) => Math.max(c, idx));
      }, REVEAL_MS);

      // Schedule next panel or completion.
      if (idx < UI_STAGES.length - 1) {
        metronomeRef.current = window.setTimeout(() => {
          metronomeRef.current = null;
          activatePanel(idx + 1);
        }, PANEL_DWELL_MS);
      } else {
        metronomeRef.current = window.setTimeout(() => {
          metronomeRef.current = null;
          metronomeDoneRef.current = true;
          tryFinish();
        }, PANEL_DWELL_MS);
      }
    };

    // Kick off the metronome at panel 0.
    activatePanel(0);

    const onStageComplete = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          stage: StageId;
          stage_data?: Record<string, unknown>;
        };
        pendingDataRef.current[data.stage] = data.stage_data ?? {};
        const idx = stageToUIIndex(data.stage);
        // If this panel has already had its reveal, push the late-arriving data live.
        if (revealedPanelsRef.current.has(idx)) {
          setStageStore((prev) => ({ ...prev, [data.stage]: data.stage_data ?? {} }));
        }
      } catch {}
    };

    const onStageError = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { recoverable?: boolean; error?: string };
        if (!data.recoverable) {
          setErrorMessage(data.error ?? "A stage failed.");
        }
      } catch {}
    };

    const onResultsReady = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { results: AnalysisResult };
        pendingResultRef.current = data.results;
        tryFinish();
      } catch {
        setErrorMessage("Malformed results payload.");
        setView("error");
      } finally {
        es.close();
        esRef.current = null;
      }
    };

    const onFatal = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { error?: string };
        setErrorMessage(data.error ?? "Pipeline failed.");
      } catch {
        setErrorMessage("Pipeline failed.");
      }
      setView("error");
      es.close();
      esRef.current = null;
      clearPacing();
    };

    es.addEventListener("stage_complete", onStageComplete as EventListener);
    es.addEventListener("stage_error", onStageError as EventListener);
    es.addEventListener("results_ready", onResultsReady as EventListener);
    es.addEventListener("error", onFatal as EventListener);
    es.onerror = () => {
      // Browser-level connection error (not a server-sent "error" event)
      if (esRef.current === es) {
        setErrorMessage("Lost connection to the analysis stream.");
        setView("error");
        es.close();
        esRef.current = null;
        clearPacing();
      }
    };
  }, [clearPacing]);

  const onStart = useCallback(async () => {
    const raw = (query || "paygrid.io").trim();
    if (!raw) return;
    const stripped = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    const isLinkedIn = /(^|\.)linkedin\.com(\/|$)/i.test(stripped);
    let domain = stripped;
    let linkedinUrl: string | undefined;
    if (isLinkedIn) {
      linkedinUrl = /^https?:\/\//i.test(raw) ? raw : `https://${stripped}`;
      const slugMatch = stripped.match(/linkedin\.com\/(?:company|in|school)\/([^/?#]+)/i);
      domain = slugMatch ? `${slugMatch[1]}.linkedin` : stripped;
    } else {
      domain = stripped.split("/")[0];
    }
    resetPipelineState();
    setView("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkedinUrl ? { domain, linkedin_url: linkedinUrl } : { domain }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Failed to start analysis (${res.status})`);
      }
      const payload = (await res.json()) as {
        analysis_id: string;
        status?: string;
        stream_url?: string;
        results_url?: string;
      };
      if (payload.status === "cached") {
        const resultsUrl = payload.results_url ?? `/api/results/${payload.analysis_id}`;
        const r = await fetch(resultsUrl);
        if (!r.ok) throw new Error(`Failed to load cached analysis (${r.status})`);
        const cached = (await r.json()) as AnalysisResult;
        setResult(cached);
        setCompletedIndex(UI_STAGES.length - 1);
        setView("dashboard");
        return;
      }
      const streamUrl = payload.stream_url ?? `/api/analyze/stream/${payload.analysis_id}`;
      openStream(streamUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start analysis.";
      setErrorMessage(message);
      setView("error");
    }
  }, [query, resetPipelineState, openStream]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  if (view === "dashboard" && result) {
    return <Dashboard result={result} />;
  }

  if (view === "analyzing") {
    return (
      <AnalysisView
        query={query || "paygrid.io"}
        activeIndex={activeIndex}
        completedIndex={completedIndex}
        stageStore={stageStore}
      />
    );
  }

  if (view === "error") {
    return (
      <HomeView
        query={query}
        setQuery={setQuery}
        onStart={onStart}
        errorMessage={errorMessage}
      />
    );
  }

  return (
    <HomeView
      query={query}
      setQuery={setQuery}
      onStart={onStart}
      errorMessage={errorMessage}
    />
  );
}
