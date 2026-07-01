# PulseClose — Validation Coverage (living doc)

**What we can validate, where, and how — at a glance.** The authoritative,
always-accurate version is the in-app page **`/dashboard/coverage`**, which is
code-driven (it reads the live keys + the same adapter constants). This doc is
the narrative companion. Last reviewed **2026-06-26**.

> Source of truth: [`src/lib/coverage/map.ts`](../src/lib/coverage/map.ts) +
> [`src/lib/adapters/sos-free.ts`](../src/lib/adapters/sos-free.ts) `FREE_SOS_STATES`
> + [`src/lib/adapters/gc-coverage.ts`](../src/lib/adapters/gc-coverage.ts) constants.
> Update those, and the page updates itself; update this doc to match.

---

## The headline

- **Two pillars are state-gated:** entity (Secretary of State) and GC license.
  The other three — litigation, sanctions, track record — are **nationwide**.
- **Run a full end-to-end in FL** — *once the statewide entity bulk is loaded.*
  Florida is the one state where **both** the entity lookup (Sunbiz bulk) **and**
  the GC license (DBPR bulk) can resolve free. CA joins the moment the CALICO key is set.

> ⚠️ **FL entity correction (2026-06-30):** the `fl_sunbiz` cache currently holds
> only **~3,167 rows** (one *daily* update file), NOT the statewide corpus — the
> `--full` load never ran because the SFTP path assumed a 10-way `cordata0-9.zip`
> split, but the server serves a **single `cordata.zip` (~1.74 GB)**. Path is fixed
> (`scripts/sos-sources.ts`) + the download is resumable, but the full load must run
> from **CI** (`refresh-sos-entities.yml`) — local pulls DNS-block at ~67%. Until
> then, an **arbitrary FL entity resolves via Cobalt (429), not free.** FL **GC**
> (DBPR, ~142k rows) IS fully cached. NY entities resolve free on-demand via the
> live DOS API regardless. See [pickup.md](../pickup.md) §Open Thread B.

---

## Entity — Secretary of State

Free official sources de-rent Cobalt; everything else falls through to Cobalt
(paid, and the **trial quota is currently exhausted in prod**).

| State | Source | Live/Bulk | Key needed? | Cost | Working now? |
|---|---|---|---|---|---|
| **CA** | CALICO (CA SOS API) | live-query + cache | **yes — CALICO key (free, self-serve)** | $0 | ⏳ once key set |
| **CO** | Socrata (open data) | live-query + cache | no | $0 | ✅ |
| **NY** | Socrata (open data) | live-query + cache | no | $0 | ✅ |
| **FL** | Sunbiz (SFTP bulk → `sos_entities`) | bulk | no | $0 | ⚠️ **partial — only ~3,167 rows cached; statewide `--full` load pending (CI)**; arbitrary entity → Cobalt |
| *all others* | Cobalt Intelligence (50-state) | live-query | yes — Cobalt key | ~$5 fresh / $0 cached | ⚠️ trial quota exhausted |

- Lookup order: `sos_entities` cache → free source (CALICO/Socrata/FL bulk) →
  Cobalt fallback → cache the result back.
- CALICO key: free, instant self-serve at `calicodev.sos.ca.gov` → subscribe to
  "BE Public Search". Set `CALICO_API_KEY` in Vercel + `.env.local`.

## GC license

No nationwide GC API exists. CA is a live scrape; WA/OR/FL/VA are official bulk
ingests (~400k licenses in `contractor_licenses`); TX/NY/PA have **no statewide
GC license** (municipal only) so they're structurally unverifiable at the state
level; everything else is manual until bulk ingest is added.

| State | Source | Working now? | Notes |
|---|---|---|---|
| **CA** | CSLB live scrape | ✅ | license # required |
| **WA** | WA L&I bulk | ✅ | ~159k records |
| **OR** | OR CCB bulk | ✅ | ~45k records |
| **FL** | FL DBPR bulk | ✅ | ~142k records |
| **VA** | VA DPOR bulk | ✅ | ~54k records (Class A/B/C) |
| **TX / NY / PA** | — | ❌ | no statewide GC license (municipal only) |
| *all others* | Manual review | ❌ | bulk ingest added as miss-telemetry shows volume |

- Bulk refresh crons: `refresh-contractor-licenses.yml` (WA/OR daily, FL/VA
  weekly). Misses logged to `gc_coverage_misses` to prioritize the next state.

## Nationwide (not state-gated)

| Pillar | Source | Notes |
|---|---|---|
| Litigation | CourtListener | federal civil + bankruptcy nationwide; state/county courts not yet |
| Sanctions / PEP | OpenSanctions → OFAC SDN | global; always-on free OFAC fallback |
| Track record | Realie → RentCast → Regrid | nationwide property + deed chain |

---

## Coverage matrix — best E2E targets

| State | Entity (SOS) | GC | Both free now? |
|---|---|---|---|
| **FL** | ⚠️ Sunbiz bulk (statewide load pending — see above) | ✅ DBPR bulk | ⚠️ **once the FL `--full` load runs (CI)** — then the best E2E target |
| CA | ⏳ CALICO (key pending) | ✅ CSLB scrape | ⏳ once CALICO key set |
| CO | ✅ Socrata | ❌ no statewide GC | entity only |
| NY | ✅ Socrata | ❌ no statewide GC | entity only |
| WA / OR / VA | ⚠️ Cobalt (exhausted) | ✅ bulk | GC only |
| TX | ⚠️ Cobalt (exhausted) | ❌ no statewide GC | neither free |

**To run a clean end-to-end today, use a Florida loan** (or set the CALICO key
and use California). Other states will return an incomplete entity check
(Cobalt 429) which — correctly — reads as **"Needs review,"** not a clean pass.
