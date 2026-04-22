// CSLB adapter — California Contractors State License Board license lookup.
// Scrapes the public license detail page (no official API exists).
// Only supports California (state === "CA"). Other states fall back to stub.

import type { GCLookupRequest, GCLookupResult } from "./types";

const LICENSE_DETAIL_URL =
  "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx";

export class CSLBError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public vendor: string = "cslb",
  ) {
    super(message);
    this.name = "CSLBError";
  }
}

// Extracts text between a label and the next HTML tag boundary
function extractField(html: string, label: string): string | null {
  // CSLB uses patterns like: <td>Label</td><td>Value</td>
  // or <span id="...">Value</span> near label text
  const patterns = [
    // Pattern: label in one cell, value in next cell
    new RegExp(
      `${escapeRegex(label)}[\\s\\S]*?<(?:td|span)[^>]*>\\s*([^<]+?)\\s*</(?:td|span)>`,
      "i",
    ),
    // Pattern: label followed by value in a span with an ID
    new RegExp(
      `${escapeRegex(label)}[\\s\\S]{0,200}?<span[^>]*>\\s*([^<]+?)\\s*</span>`,
      "i",
    ),
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1] && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLicenseStatus(
  raw: string | null,
): GCLookupResult["license_status"] {
  if (!raw) return "expired";
  const lower = raw.toLowerCase();
  if (lower.includes("active")) return "active";
  if (lower.includes("suspend")) return "suspended";
  if (lower.includes("revoke") || lower.includes("cancel")) return "revoked";
  return "expired";
}

function parseInsuranceVerified(html: string): boolean {
  // CSLB shows workers' comp coverage or exempt status
  const wcSection = html.match(
    /Workers[\s']?\s*Comp[^<]*[\s\S]{0,500}/i,
  );
  if (!wcSection) return false;
  const section = wcSection[0];
  return (
    /policy\s*number/i.test(section) ||
    /exempt/i.test(section) ||
    /coverage/i.test(section)
  );
}

function parseDisciplinaryActions(html: string): string[] {
  const actions: string[] = [];
  // Look for complaint disclosure or disciplinary section
  const disclosureMatch = html.match(
    /Complaint\s*Disclosure[\s\S]{0,2000}/i,
  );
  if (disclosureMatch) {
    const section = disclosureMatch[0];
    // Extract individual items — typically listed in table rows
    const itemPattern = /<td[^>]*>\s*([^<]*(?:citation|violation|action|complaint)[^<]*)\s*<\/td>/gi;
    let match;
    while ((match = itemPattern.exec(section)) !== null) {
      const text = match[1].trim();
      if (text.length > 5) actions.push(text);
    }
    // If no specific items but disclosure section exists with content
    if (actions.length === 0 && /legal\s*action|citation|bond\s*claim/i.test(section)) {
      actions.push("Disciplinary action on file — review CSLB detail page");
    }
  }
  return actions;
}

/**
 * Look up a CA contractor license by number from CSLB.
 */
export async function lookupCSLB(
  req: GCLookupRequest,
): Promise<GCLookupResult> {
  if (!req.license_number) {
    throw new CSLBError(
      "License number is required for CSLB lookup. Name-only search is not yet supported.",
      400,
    );
  }

  const url = `${LICENSE_DETAIL_URL}?LicNum=${encodeURIComponent(req.license_number)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "PulseClose/1.0 (borrower-validation-platform)",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new CSLBError(
      `CSLB returned ${res.status}: ${res.statusText}`,
      res.status,
    );
  }

  const html = await res.text();

  // Check if the license was found
  if (
    html.includes("not a valid license number") ||
    html.includes("No information was found") ||
    html.includes("License number is required")
  ) {
    return {
      gc_name: req.gc_name,
      license_number: req.license_number,
      license_state: "CA",
      license_status: "expired",
      license_classification: null,
      expiration_date: null,
      disciplinary_actions: [],
      insurance_verified: false,
      source_url: url,
      raw_response: { _adapter: "cslb", _result: "not_found", _url: url },
    };
  }

  // Parse the license detail page
  const businessName = extractField(html, "Business Name") ??
    extractField(html, "Entity Name");
  const status = extractField(html, "License Status") ??
    extractField(html, "Status");
  const classification = extractField(html, "Classifications") ??
    extractField(html, "Class");
  const expiration = extractField(html, "Expiration Date") ??
    extractField(html, "Expire Date");

  return {
    gc_name: businessName ?? req.gc_name,
    license_number: req.license_number,
    license_state: "CA",
    license_status: parseLicenseStatus(status),
    license_classification: classification,
    expiration_date: expiration,
    disciplinary_actions: parseDisciplinaryActions(html),
    insurance_verified: parseInsuranceVerified(html),
    source_url: url,
    raw_response: {
      _adapter: "cslb",
      _url: url,
      _parsed: {
        businessName,
        status,
        classification,
        expiration,
      },
    },
  };
}
