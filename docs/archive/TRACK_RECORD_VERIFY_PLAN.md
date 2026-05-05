# Trust-but-Verify Track Record — Implementation Plan

## Why this exists

Realie/Regrid owner-name search returns **current holdings only**. We can see what
a borrower owns today, not what they bought and sold in the past. Without that
flip history, the AI risk memo currently misjudges experienced operators because
it has no way to verify a borrower's claim of "I've completed 30 flips."

The fix: instead of trying to find their flip history blindly (expensive deed
APIs, ~$1K/mo), let the borrower **submit the addresses** they claim to have
flipped. We verify each against Realie's recorded-deed data and surface the
truth: who owned it, when they bought, when they sold, for how much.

## End-state UX

On the validation detail page, a new "Verified Track Record" section.
Two ways to populate it:

1. **Analyst-paste** (MVP) — paste addresses one per line into a textarea.
2. **Borrower upload** (v2) — share-link to a borrower-facing form so borrower
   self-submits without analyst typing.

For each submitted address, the page shows:

| Address | Owner of record | Acquired | Sold | Hold | Buy price | Sell price | Profit | Match? |
|--|--|--|--|--|--|--|--|--|
| 123 Oak St | Smith Capital LLC → Jones Holdings | 2022-06 | 2024-03 | 21mo | $410K | $585K | +$175K | ✓ matches borrower entity |

Plus aggregate stats: claimed N → verified M, total realized profit, average hold,
flips that match the borrower entity vs. flips on properties they never owned.

## Data flow

```
analyst → POST /api/track-record/verify
            { validation_id, addresses: ["123 Oak St, ..."] }
              ↓
          For each address:
            1. realie.lookupByAddress(addr)   → property record + transfer chain
            2. Match transfer chain against borrower_name + entity_name
            3. Classify each transfer:
                 - "owned, sold"  → completed flip (profit = sell - buy)
                 - "owned, holding" → current hold
                 - "never owned"  → false claim
            4. Persist verified_track_record row
              ↓
          Return summary { verified, false_claims, realized_profit, ... }
```

## Realie endpoint to use

Realie offers an Address Lookup endpoint (separate from the owner-name endpoint
we currently use in `src/lib/adapters/realie.ts`). Per their docs:
- Owner Search (current)
- **Address Lookup** ← what we need
- Location Search, Parcel ID Lookup, Property Search

Each property returns a `transfers` array with grantor, grantee, transferDate,
transferPrice. The owner-name search already returns this — we re-use the same
mapping logic for address lookups.

**Action item:** confirm exact URL pattern before coding (one curl test):
likely `GET /api/public/premium/address/?address=...&state=...`.

## API surface

### `POST /api/track-record/verify`

```ts
Request:
{
  validation_id: uuid,
  addresses: string[]          // 1..50 addresses
}

Response:
{
  verified: VerifiedFlip[],
  summary: {
    submitted: number,
    matched_to_borrower: number,
    not_found: number,
    realized_profit: number,
    average_hold_months: number
  }
}

VerifiedFlip:
{
  submitted_address: string,
  resolved_address: string | null,
  match_status: "owned_and_sold" | "owned_and_held" | "never_owned" | "not_found",
  acquisition_date, acquisition_price,
  disposition_date, disposition_price,
  hold_months, profit,
  grantor_chain: { name, role: "buy_from"|"sold_to" }[],
  source: "Realie" | "..."
}
```

Rate-limit and cost identical to existing track-record search. One Realie call
per address. Reasonable cap: 50 addresses per request.

## Database

New table — keeps verified flips separate from current-portfolio entries so we
don't pollute the existing `track_record_entries` data:

```sql
create table public.verified_flips (
  id                  uuid primary key default gen_random_uuid(),
  validation_id       uuid not null references public.borrower_validations(id) on delete cascade,
  submitted_address   text not null,
  resolved_address    text,
  match_status        text not null check (match_status in (
                        'owned_and_sold','owned_and_held','never_owned','not_found'
                      )),
  acquisition_date    date,
  acquisition_price   numeric(14,2),
  disposition_date    date,
  disposition_price   numeric(14,2),
  hold_months         integer,
  profit              numeric(14,2),
  grantor_chain       jsonb not null default '[]',
  source              text not null default 'Realie',
  raw_response        jsonb,
  created_at          timestamptz not null default now()
);
```

## UI changes

- New component: `src/components/dashboard/verified-track-record.tsx` — table
  same shape as the portfolio table but with "Match?" column showing whether
  the deed chain ties back to the borrower/entity name.
- New form on the validation detail page: "Submit claimed addresses" textarea,
  POSTs to `/api/track-record/verify`.
- AI prompt update: include verified-flip stats in the analysis input so the
  memo can write "Verified 12 of 14 claimed flips, $2.4M realized profit,
  18-month avg hold" instead of staying silent on flip history.

## Phases

| Phase | Scope | Effort |
|--|--|--|
| 1 | Realie address-lookup adapter (`searchPropertyByAddress`) | half day |
| 2 | `POST /api/track-record/verify` + `verified_flips` table | half day |
| 3 | Match-status classifier (compare grantor names to borrower) | half day |
| 4 | Analyst-paste UI on validation detail page | half day |
| 5 | Pipe verified stats into AI prompt | 1 hour |
| 6 | Borrower-facing share-link form | 1 day (later) |

## Open questions

- **Name normalization for matching.** "Smith Capital LLC" on the deed may not
  exactly match the borrower's submitted entity name. Reuse the OFAC token
  matcher in `ofac.ts` or pull in a fuzzy library. Token-based with entity-suffix
  stripping is probably good enough.
- **Free-form address parsing.** Borrowers will submit "123 oak, sf" — Realie
  needs structured input. Consider running submitted strings through a parse
  step (Smarty? simple regex?) before calling the API.
- **Upsell hook.** Verified-flip search uses Realie credits. Should we cap free
  trial to N addresses per validation, or count each verify-call against the
  monthly check limit?
