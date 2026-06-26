// Registry of Secretary-of-State business-entity bulk sources. Adding a state =
// add one entry here (SFTP/URL coords + a record mapper); the generic runner
// (ingest-sos.ts) handles download + unzip + upsert. Lands rows in
// public.sos_entities (00050) to de-rent Cobalt — see docs/RESEARCH-SOS-REPLACEMENT.md.
//
// FL Sunbiz is a fixed-width 1440-char ASCII record. Other states (CA CALICO,
// WA/CO/OR) will be added as separate configs with their own `kind`.

import { normName, sunbizDate, type SosEntityRow, type SosOfficer } from "./_sos-ingest";

export interface SftpCoords {
  host: string;
  port: number;
  username: string;
  password: string;
}

// A fixed-width SOS source served over SFTP (FL Sunbiz). `dailyDir`/`dailyFile`
// produce a SMALL work-day update file; `fullDir`/`fullFiles` are the heavy
// quarterly full split (10 files by last digit of the record).
export interface FixedWidthSource {
  state: string;
  source: string;
  kind: "fixed-width-sftp";
  sftp: SftpCoords;
  recordLength: number;
  dailyDir: string;
  dailyFileFor: (date: Date) => string; // yyyymmddc.txt
  fullDir: string;
  fullFiles: string[];                  // cordata.zip split into 10 by last digit
  map: (line: string) => SosEntityRow | null;
}

export type SosSource = FixedWidthSource;

// ── FL — Sunbiz cordata fixed-width 1440-char records (Ch.119 public) ─────────
// Layout per the documented cordata spec. 1-indexed start S, length L:
//   line.substring(S-1, S-1+L).trim()
const FL_SFTP: SftpCoords = {
  host: "sftp.floridados.gov",
  port: 22,
  username: "Public",
  password: "PubAccess1845!",
};

// Officer slots: 6 slots, each 128 chars wide, first starts at col 669.
const FL_OFFICER_SLOT_STARTS = [669, 797, 925, 1053, 1181, 1309];
// Within a slot, field offsets relative to the slot start (0-based) + length.
const FL_OFFICER_TITLE_OFF = 0;  // len 4
const FL_OFFICER_NAME_OFF = 5;   // len 42 (skip the +4 P/C type flag)
const FL_OFFICER_NAME_LEN = 42;
const FL_OFFICER_TITLE_LEN = 4;

// Sunbiz packs sub-fields (e.g. last/first name) into one fixed slot, padding
// with spaces, so a trimmed value still carries large internal runs ("BURGOS
//          GEORGE"). Collapse internal whitespace for clean display values; the
// canonical key (normName) tokenizes on non-alphanumerics so it's unaffected.
function flField(line: string, start: number, len: number): string {
  return line.substring(start - 1, start - 1 + len).replace(/\s+/g, " ").trim();
}

function flOfficers(line: string): SosOfficer[] {
  const out: SosOfficer[] = [];
  for (const slot of FL_OFFICER_SLOT_STARTS) {
    // Slot offsets are 0-based from the slot start; flField is 1-indexed.
    const title = flField(line, slot + FL_OFFICER_TITLE_OFF, FL_OFFICER_TITLE_LEN);
    const name = flField(line, slot + FL_OFFICER_NAME_OFF, FL_OFFICER_NAME_LEN);
    if (name) out.push({ name, title });
  }
  return out;
}

const FL: FixedWidthSource = {
  state: "FL",
  source: "fl_sunbiz",
  kind: "fixed-width-sftp",
  sftp: FL_SFTP,
  recordLength: 1440,
  dailyDir: "doc/cor",
  // Work-day update file: yyyymmddc.txt
  dailyFileFor: (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}c.txt`;
  },
  fullDir: "doc/quarterly/cor",
  // cordata.zip split into 10 by last digit (0-9) of the record.
  fullFiles: Array.from({ length: 10 }, (_, i) => `cordata${i}.zip`),
  map(line: string): SosEntityRow | null {
    // Records are 1440 chars; daily files may have trailing CR/short lines.
    if (!line || line.length < 205) return null;
    const documentNumber = flField(line, 1, 12);
    const name = flField(line, 13, 192);
    if (!documentNumber || !name) return null;

    const statusCode = flField(line, 205, 1).toUpperCase();
    const status = statusCode === "A" ? "active" : "dissolved";
    const filingType = flField(line, 206, 15) || null;
    const fileDate = sunbizDate(flField(line, 473, 8));
    const lastTxnDate = sunbizDate(flField(line, 496, 8));
    const fei = flField(line, 481, 14) || null;
    const raName = flField(line, 545, 42) || null;

    return {
      state: "FL",
      normalized_name: normName(name) ?? "",
      entity_name: name,
      entity_type: filingType,
      status,
      formation_date: fileDate,
      last_filing_date: lastTxnDate,
      registered_agent: raName,
      officers: flOfficers(line),
      source: "fl_sunbiz",
      source_url: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName",
      // Keep raw minimal — storage matters at millions of rows.
      raw: { document_number: documentNumber, fei },
    };
  },
};

export const SOURCES: SosSource[] = [FL];
