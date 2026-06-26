// Macro / recession-indicator overlay (FRED) — Damon's "build our own market
// intelligence" ask (ICC call 2026-06-25). A handful of free FRED series →
// one deterministic macro-context block that feeds the Module 6 judgment's
// market/exit dimensions and the investor memo, so models and LOIs carry a
// defensible Gundlach/Damodaran-style macro read without manual chart-pulling.
//
// Discipline (same spine as the rest of the product): the indicators + the
// regime label are DETERMINISTIC — computed here from the data, never by the AI.
// The AI narrates this context for the deal; it doesn't invent the macro read.
// AI never sets the number or the tier; it doesn't set the regime either.
//
// Best-effort: no FRED_API_KEY, or any fetch error, → getMacroContext() returns
// null and the judgment runs without the macro block (never fatal). Each series
// is fetched independently so one missing/renamed id degrades to "n/a", not a
// blank overlay.
//
// FRED key: free, instant self-serve at https://fred.stlouisfed.org/docs/api/api_key.html
// → set FRED_API_KEY.

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export type MacroSignal = "supportive" | "neutral" | "caution" | "warning";

export interface MacroIndicator {
  key: string;
  label: string;
  value: string; // formatted (e.g. "-0.42%", "4.8 mo", "0.53")
  asOf: string | null; // observation date
  read: string; // one-line plain-English interpretation
  signal: MacroSignal;
}

export interface MacroContext {
  asOf: string; // most-recent observation date across all series
  regime: string; // deterministic regime label
  regimeBasis: string; // how the label was derived (transparency)
  indicators: MacroIndicator[];
  source: string;
}

interface Obs {
  date: string;
  value: number;
}

// Fetch the latest `limit` numeric observations (most-recent first), dropping
// FRED's "." missing markers. Returns [] on any error so the caller degrades.
async function fetchSeries(seriesId: string, apiKey: string, limit: number): Promise<Obs[]> {
  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: String(limit),
    });
    const res = await fetch(`${FRED_BASE}?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`[macro/fred] ${seriesId} → HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { observations?: { date: string; value: string }[] };
    return (data.observations ?? [])
      .filter((o) => o.value !== "." && o.value !== "")
      .map((o) => ({ date: o.date, value: Number(o.value) }))
      .filter((o) => Number.isFinite(o.value));
  } catch (err) {
    console.warn(`[macro/fred] ${seriesId} fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;

// ── per-series interpreters (deterministic) ──────────────────────────────────

function yieldCurve(obs: Obs[]): MacroIndicator | null {
  const o = obs[0];
  if (!o) return null;
  const inverted = o.value < 0;
  return {
    key: "yield_curve",
    label: "Yield curve (10Y–2Y spread)",
    value: pct(o.value),
    asOf: o.date,
    read: inverted
      ? "Inverted — the market's classic lead indicator of recession; pressures bridge exits and refinance windows."
      : o.value < 0.5
        ? "Flat — late-cycle; little term premium, watch for re-inversion."
        : "Positively sloped — normal-functioning rate environment, supportive of takeout financing.",
    signal: inverted ? "caution" : o.value < 0.5 ? "neutral" : "supportive",
  };
}

function hyOas(obs: Obs[]): MacroIndicator | null {
  const o = obs[0];
  if (!o) return null;
  const v = o.value;
  const signal: MacroSignal = v < 3 ? "supportive" : v < 5 ? "neutral" : v < 7 ? "caution" : "warning";
  return {
    key: "hy_oas",
    label: "High-yield credit spread (ICE BofA OAS)",
    value: pct(v),
    asOf: o.date,
    read:
      signal === "supportive"
        ? "Tight — risk appetite healthy, capital available for refinancing."
        : signal === "neutral"
          ? "Moderate — credit open but pricing risk."
          : signal === "caution"
            ? "Widening — credit tightening; refinance/exit risk rising for leveraged borrowers."
            : "Stressed — credit markets pricing distress; takeout financing may not be available.",
    signal,
  };
}

function fedFunds(obs: Obs[]): MacroIndicator | null {
  const o = obs[0];
  if (!o) return null;
  return {
    key: "fed_funds",
    label: "Fed funds rate (effective)",
    value: pct(o.value),
    asOf: o.date,
    read: "Policy rate — the floor under bridge pricing and the cost of the takeout loan.",
    signal: "neutral", // contextual; cost level, not a directional signal on its own
  };
}

function inflationYoY(obs: Obs[]): MacroIndicator | null {
  // obs is the CPI index, desc. YoY = latest vs ~12 months prior.
  if (obs.length < 13) return obs[0]
    ? {
        key: "inflation",
        label: "Inflation (CPI YoY)",
        value: "n/a",
        asOf: obs[0].date,
        read: "Insufficient history to compute year-over-year.",
        signal: "neutral",
      }
    : null;
  const latest = obs[0];
  const prior = obs[12];
  const yoy = ((latest.value - prior.value) / prior.value) * 100;
  const signal: MacroSignal = yoy < 2 ? "supportive" : yoy <= 4 ? "neutral" : "caution";
  return {
    key: "inflation",
    label: "Inflation (CPI YoY)",
    value: pct(yoy, 1),
    asOf: latest.date,
    read:
      signal === "caution"
        ? "Above the Fed's comfort zone — keeps policy restrictive (higher-for-longer), pressuring exit caps."
        : signal === "supportive"
          ? "At/below target — supports rate cuts and cap-rate compression."
          : "Near target — neutral for the rate path.",
    signal,
  };
}

function unemploymentTrend(obs: Obs[]): MacroIndicator | null {
  const latest = obs[0];
  if (!latest) return null;
  const ref = obs[6] ?? obs[obs.length - 1]; // ~6 months prior
  const delta = ref ? latest.value - ref.value : 0;
  const rising = delta >= 0.3;
  return {
    key: "unemployment",
    label: "Unemployment rate (trend)",
    value: `${latest.value.toFixed(1)}%${ref ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pt / 6mo)` : ""}`,
    asOf: latest.date,
    read: rising
      ? "Rising — softening labor market; demand-side risk to rents and absorption."
      : "Stable/falling — labor market supportive of rent growth and occupancy.",
    signal: rising ? "caution" : "supportive",
  };
}

function sahmRule(obs: Obs[]): MacroIndicator | null {
  const o = obs[0];
  if (!o) return null;
  const v = o.value;
  const signal: MacroSignal = v >= 0.5 ? "warning" : v >= 0.3 ? "caution" : "supportive";
  return {
    key: "sahm",
    label: "Sahm Rule recession indicator",
    value: v.toFixed(2),
    asOf: o.date,
    read:
      signal === "warning"
        ? "Triggered (≥0.50) — real-time recession signal; underwrite exits conservatively."
        : signal === "caution"
          ? "Approaching the 0.50 trigger — labor momentum deteriorating."
          : "Well below the 0.50 recession trigger.",
    signal,
  };
}

function housingSupply(obs: Obs[]): MacroIndicator | null {
  const o = obs[0];
  if (!o) return null;
  const v = o.value; // months of supply of new houses
  const signal: MacroSignal = v <= 6 ? "supportive" : v <= 9 ? "caution" : "warning";
  return {
    key: "housing_supply",
    label: "New-home months of supply",
    value: `${v.toFixed(1)} mo`,
    asOf: o.date,
    read:
      signal === "supportive"
        ? "Balanced (~6 mo) — no national oversupply overhang."
        : signal === "caution"
          ? "Elevated — building inventory; watch for price softness in for-sale exits."
          : "Oversupplied — inventory overhang pressures for-sale exit values.",
    signal,
  };
}

// Deterministic regime label from the indicator signals. caution=1, warning=2;
// supportive/neutral=0. Conservative and transparent — never AI-set.
function deriveRegime(indicators: MacroIndicator[]): { regime: string; basis: string } {
  const score = indicators.reduce((s, i) => s + (i.signal === "warning" ? 2 : i.signal === "caution" ? 1 : 0), 0);
  const flagged = indicators.filter((i) => i.signal === "caution" || i.signal === "warning").map((i) => i.label);
  const regime =
    score <= 1 ? "Supportive / expansionary"
    : score <= 3 ? "Mid-cycle / mixed"
    : score <= 5 ? "Late-cycle / cautionary"
    : "Contractionary / recession-signal";
  const basis = `risk score ${score} across ${indicators.length} indicators${flagged.length ? ` (flagged: ${flagged.join("; ")})` : ""}`;
  return { regime, basis };
}

/**
 * Fetch the macro overlay from FRED. Returns null when FRED_API_KEY is unset or
 * no series resolved (caller proceeds without the macro block). Best-effort and
 * never throws.
 */
export async function getMacroContext(): Promise<MacroContext | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const [curve, oas, ff, cpi, unrate, sahm, msacsr] = await Promise.all([
    fetchSeries("T10Y2Y", apiKey, 1),
    fetchSeries("BAMLH0A0HYM2", apiKey, 1),
    fetchSeries("DFF", apiKey, 1),
    fetchSeries("CPIAUCSL", apiKey, 14),
    fetchSeries("UNRATE", apiKey, 7),
    fetchSeries("SAHMREALTIME", apiKey, 1),
    fetchSeries("MSACSR", apiKey, 1),
  ]);

  const indicators = [
    yieldCurve(curve),
    hyOas(oas),
    fedFunds(ff),
    inflationYoY(cpi),
    unemploymentTrend(unrate),
    sahmRule(sahm),
    housingSupply(msacsr),
  ].filter((x): x is MacroIndicator => x !== null);

  if (indicators.length === 0) return null;

  const asOf = indicators
    .map((i) => i.asOf)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()[0] ?? "";
  const { regime, basis } = deriveRegime(indicators);

  return { asOf, regime, regimeBasis: basis, indicators, source: "FRED (Federal Reserve Bank of St. Louis)" };
}

/** Serialize the macro context into the facts-block text the AI reasons from. */
export function formatMacroForFacts(ctx: MacroContext): string {
  const lines: string[] = [];
  lines.push(`MACRO CONTEXT (current regime — use for the market & exit dimensions; deterministic, from ${ctx.source}, as of ${ctx.asOf}):`);
  lines.push(`  REGIME: ${ctx.regime}  (${ctx.regimeBasis})`);
  for (const i of ctx.indicators) {
    lines.push(`  ${i.label}: ${i.value} [${i.signal}] — ${i.read}`);
  }
  return lines.join("\n");
}
