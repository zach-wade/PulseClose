// GC license-validation coverage — pure constants + predicate, safe to import
// from client components (no server/adapter code here).
//
// CA is automated today via the CSLB scrape (cslb.ts). FL/TX/NY/OR are available
// through Cobalt's /contractorSearch endpoint but require a PAID contractor plan
// — our Cobalt key's contractor trial is exhausted ("Trial limit exceeded"), so
// they're pending an upgrade. Move a state from PENDING → AUTOMATED once the
// Cobalt contractor plan is enabled. See docs/VENDOR-CAPABILITY-MAP.md §GC.

export const GC_AUTOMATED_STATES = ["CA"] as const;
export const GC_COBALT_PENDING_STATES = ["FL", "TX", "NY", "OR"] as const;

/** Is GC license validation automatable for this state? (CA needs a license #.) */
export function isGCStateAutomated(state: string, licenseNumber?: string): boolean {
  const s = state.toUpperCase();
  if (s === "CA") return Boolean(licenseNumber);
  return (GC_AUTOMATED_STATES as readonly string[]).includes(s);
}

/** Is this a state Cobalt can cover once the contractor plan is enabled? */
export function isGCStateCobaltPending(state: string): boolean {
  return (GC_COBALT_PENDING_STATES as readonly string[]).includes(state.toUpperCase());
}
