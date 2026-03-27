// Stub adapter — returns realistic demo data clearly labeled as "[DEMO]"
// This gets swapped out for real vendor adapters as API keys are wired.

import type {
  ValidationAdapter,
  SOSLookupRequest,
  SOSLookupResult,
  PropertySearchRequest,
  PropertyRecord,
  GCLookupRequest,
  GCLookupResult,
  LitigationSearchRequest,
  LitigationRecord,
} from "./types";

const STATES_DATA: Record<string, { agent: string; type: string }> = {
  CA: { agent: "CT Corporation System", type: "LLC" },
  TX: { agent: "Registered Agents Inc.", type: "LLC" },
  FL: { agent: "LegalInc Corporate Services", type: "LLC" },
  NY: { agent: "National Registered Agents", type: "Corp" },
  NV: { agent: "Nevada Registered Agent LLC", type: "LLC" },
  AZ: { agent: "Statutory Agent Services", type: "LLC" },
  CO: { agent: "Colorado Registered Agent", type: "LLC" },
  GA: { agent: "InCorp Services", type: "LLC" },
};

function randomDate(startYear: number, endYear: number): string {
  const year = startYear + Math.floor(Math.random() * (endYear - startYear));
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class StubAdapter implements ValidationAdapter {
  async lookupEntity(req: SOSLookupRequest): Promise<SOSLookupResult> {
    await delay(300 + Math.random() * 700);

    const stateInfo = STATES_DATA[req.state] ?? {
      agent: "Default Agent Services",
      type: "LLC",
    };

    // 80% active, 10% suspended, 10% not_found
    const roll = Math.random();
    const status =
      roll < 0.8 ? "active" : roll < 0.9 ? "suspended" : "not_found";

    const flags: string[] = [];
    if (status === "suspended") flags.push("Entity suspended — verify reinstatement");
    const formationDate = randomDate(2015, 2024);
    const daysSinceFormation = Math.floor(
      (Date.now() - new Date(formationDate).getTime()) / 86400000,
    );
    if (daysSinceFormation < 180) flags.push("Recently formed entity (<6 months)");

    return {
      entity_name: req.entity_name,
      state: req.state,
      entity_type: stateInfo.type,
      sos_status: status,
      formation_date: status !== "not_found" ? formationDate : null,
      last_filing_date:
        status === "active" ? randomDate(2024, 2026) : null,
      registered_agent: status !== "not_found" ? stateInfo.agent : null,
      source_url: `https://sos.${req.state.toLowerCase()}.gov/search [DEMO]`,
      flags,
      raw_response: { _demo: true, _adapter: "stub" },
    };
  }

  async searchProperties(req: PropertySearchRequest): Promise<PropertyRecord[]> {
    await delay(500 + Math.random() * 1000);

    const count = 2 + Math.floor(Math.random() * 6);
    const streets = [
      "Main St", "Oak Ave", "Elm Dr", "Pine Rd", "Maple Ln",
      "Cedar Blvd", "Birch Way", "Walnut St", "Cherry Ct", "Spruce Pl",
    ];
    const cities = [
      "Phoenix, AZ", "Los Angeles, CA", "Dallas, TX", "Miami, FL",
      "Atlanta, GA", "Denver, CO", "Las Vegas, NV", "Austin, TX",
    ];

    const records: PropertyRecord[] = [];
    for (let i = 0; i < count; i++) {
      const addr = `${100 + Math.floor(Math.random() * 9900)} ${streets[i % streets.length]}`;
      const city = cities[Math.floor(Math.random() * cities.length)];
      const acqPrice = 150000 + Math.floor(Math.random() * 500000);
      const completed = Math.random() > 0.25;
      const rehabCost = 20000 + Math.floor(Math.random() * 100000);
      const margin = 0.05 + Math.random() * 0.25;
      const salePrice = completed
        ? Math.round((acqPrice + rehabCost) * (1 + margin))
        : null;
      const holdMonths = 3 + Math.floor(Math.random() * 15);

      records.push({
        property_address: `${addr}, ${city}`,
        acquisition_date: randomDate(2019, 2025),
        disposition_date: completed ? randomDate(2023, 2026) : null,
        acquisition_price: acqPrice,
        disposition_price: salePrice,
        project_type: ["flip", "rehab", "ground_up", "hold"][
          Math.floor(Math.random() * 4)
        ] as PropertyRecord["project_type"],
        outcome: completed ? "completed" : "in_progress",
        hold_months: holdMonths,
        profit: salePrice ? salePrice - acqPrice - rehabCost : null,
        source: "ATTOM Property Records [DEMO]",
        raw_response: { _demo: true, _adapter: "stub" },
      });
    }

    return records;
  }

  async lookupGC(req: GCLookupRequest): Promise<GCLookupResult> {
    await delay(200 + Math.random() * 500);

    const roll = Math.random();
    const status =
      roll < 0.75 ? "active" : roll < 0.9 ? "expired" : "suspended";

    return {
      gc_name: req.gc_name,
      license_number: req.license_number ?? `GC-${Math.floor(Math.random() * 9000000) + 1000000}`,
      license_state: req.state,
      license_status: status,
      license_classification: "General Building Contractor (B)",
      expiration_date: randomDate(2025, 2028),
      disciplinary_actions:
        status === "suspended"
          ? ["Citation 2024-0312: Failure to maintain workers' comp coverage"]
          : [],
      insurance_verified: Math.random() > 0.2,
      source_url: `https://cslb.${req.state.toLowerCase()}.gov/lookup [DEMO]`,
      raw_response: { _demo: true, _adapter: "stub" },
    };
  }

  async searchLitigation(
    req: LitigationSearchRequest,
  ): Promise<LitigationRecord[]> {
    await delay(400 + Math.random() * 800);

    const checks: LitigationRecord[] = [
      {
        search_type: "bankruptcy",
        entity_name: req.entity_name || req.borrower_name,
        result: Math.random() > 0.9 ? "found" : "clear",
        details: null,
        case_number: null,
        source: "PACER [DEMO]",
        raw_response: { _demo: true, _adapter: "stub" },
      },
      {
        search_type: "foreclosure",
        entity_name: req.borrower_name,
        result: Math.random() > 0.85 ? "found" : "clear",
        details: null,
        case_number: null,
        source: "County Recorder [DEMO]",
        raw_response: { _demo: true, _adapter: "stub" },
      },
      {
        search_type: "lawsuit",
        entity_name: req.entity_name || req.borrower_name,
        result: Math.random() > 0.8 ? "found" : "clear",
        details: null,
        case_number: null,
        source: "State Court Records [DEMO]",
        raw_response: { _demo: true, _adapter: "stub" },
      },
      {
        search_type: "lis_pendens",
        entity_name: req.borrower_name,
        result: Math.random() > 0.9 ? "found" : "clear",
        details: null,
        case_number: null,
        source: "County Recorder [DEMO]",
        raw_response: { _demo: true, _adapter: "stub" },
      },
    ];

    // Add details to any "found" results
    for (const check of checks) {
      if (check.result === "found") {
        check.case_number = `${check.search_type.toUpperCase().slice(0, 3)}-${Math.floor(Math.random() * 90000) + 10000}`;
        check.details = getDemoDetails(check.search_type);
      }
    }

    return checks;
  }
}

function getDemoDetails(type: string): string {
  switch (type) {
    case "bankruptcy":
      return "Chapter 7 filing, case dismissed. No active proceedings.";
    case "foreclosure":
      return "Notice of Default filed 2022, resolved via loan modification.";
    case "lawsuit":
      return "Construction defect claim, settled out of court 2023.";
    case "lis_pendens":
      return "Lis pendens recorded, subsequently withdrawn.";
    default:
      return "Record found — review details.";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const stubAdapter = new StubAdapter();
