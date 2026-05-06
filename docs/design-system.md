# PulseClose Design System & Brand Guide

Last updated: 2026-05-05.

> **Scope note (added 2026-05-05).** This document covers brand /
> typography / color / voice for *both* surfaces:
>
> - **app.pulseclose.com** — the authenticated Next.js product. Sections
>   1-6 (brand, ICP, color, type, logo, components) and the "Dashboard"
>   layout in §7 apply directly. The dashboard sidebar nav was reduced
>   to 4 items in 2026-05-02 (Validations / Activity / Evaluate /
>   Investors / Usage + Settings) — see [docs/ROADMAP.md](ROADMAP.md)
>   G3.5 for context.
> - **pulseclose.com** — the WordPress marketing site (content
>   version-controlled in [wordpress/](../wordpress/), published via
>   `wordpress/scripts/publish-*.ts`). The "Public Pages" layout in §7,
>   §9 page-specific guidelines, and §13 content templates apply here.
>   The Next.js app's `robots.ts` correctly disallows crawlers because
>   the auth product is NOT for indexing.
>
> See [DISTRIBUTION-STRATEGY.md](DISTRIBUTION-STRATEGY.md) for the
> 2026 distribution strategy and [seo-strategy.md](seo-strategy.md) for
> the rescoped programmatic SEO play. Anything in §9 referring to
> ranking on Google should be read as **GEO/AEO** (Answer Engine
> Optimization) — the playbook in 2026 is to be cited inside the
> AI Overview / ChatGPT answer / Perplexity panel, not to rank below
> them.

This is the reference doc for anyone building pages for PulseClose. Every page — landing, blog, guides, glossary, dashboard — should feel like it came from the same company. Use this doc to stay consistent.

---

## 1. Brand Identity

### Name
**PulseClose** — one word, PascalCase. Never "Pulse Close", "pulseclose", or "PULSECLOSE."

### Tagline
Primary: **Borrower validation for bridge lenders.**
Secondary: **The highest-risk gap in bridge lending, finally closed.**

### What We Are
An automated borrower validation platform for bridge lenders. We replace manual due diligence (SOS lookups, track record calls, PACER searches, GC license checks) with a single search that returns a structured report in minutes.

### What We Are NOT
- Not a loan origination system (LOS)
- Not a CRM
- Not a fund management or investor relations tool
- Not a general background check service

### Voice & Tone

**Direct.** Say what the thing does. No hedging, no marketing-speak.
- Yes: "Check entity status across all 50 states in seconds."
- No: "Leverage our cutting-edge AI-powered platform to streamline your verification workflows."

**Competent.** Write like someone who underwrites loans, not someone who sells software.
- Yes: "Flags suspended entities, resigned agents, and formation dates under 6 months."
- No: "Our powerful tool helps you find important information about borrowers."

**Specific.** Use bridge lending terminology naturally. Our users know what lis pendens means.
- Yes: "PACER bankruptcy search, county foreclosure records, lis pendens."
- No: "Legal record searches and background screening."

**Confident but honest.** When something is beta or not yet automated, say so plainly.
- Yes: "County recorder search coming soon. Manual review recommended."
- No: Pretending stub data is real, or hiding limitations behind vague language.

### Personality Attributes

| Attribute | Expression |
|-----------|-----------|
| Professional | Clean layouts, restrained color use, no decorative illustrations |
| Trustworthy | Show data sources, label beta features, display confidence scores |
| Efficient | Dense information display, no unnecessary clicks, fast load times |
| Domain-expert | Use lending terminology without explanation, reference real processes |

### Things We Never Do
- Use buzzwords: "leverage", "synergy", "streamline", "cutting-edge", "next-gen"
- Use emojis in the product or marketing pages
- Use stock photos of handshakes, skyscrapers, or people pointing at screens
- Use gradients, glows, or heavy visual effects
- Over-promise on accuracy — always show confidence levels and data sources
- Call ourselves "AI-powered" as a headline feature (AI analysis is one component, not the product)

---

## 2. Ideal Customer Profiles

### Primary: The Origination Manager

**Title:** VP of Originations, Head of Lending, Director of Underwriting
**Company:** Bridge lending shop doing $20M-$500M in annual originations
**Team size:** 3-15 people
**Day-to-day:** Reviews incoming loan applications, decides which borrowers to approve

**Pain points:**
- Spends 30-60 minutes per borrower on manual checks (SOS websites, PACER, county records)
- Has been burned by a borrower who misrepresented their track record or had undisclosed litigation
- No standardized process — each analyst does checks differently
- Can't scale the underwriting team without also scaling this manual work

**What they care about:**
- Speed: "How fast can I get a borrower report?"
- Coverage: "Does this check all 50 states?"
- Accuracy: "Can I trust this data enough to make a lending decision?"
- Audit trail: "Can I show my investors/auditors what checks were run?"

**How they find us:**
- Searching for specific check types: "SOS entity lookup for lenders", "PACER search for private lenders"
- Peer recommendation from other bridge lenders at conferences (AAPL, IMN)
- Industry publications (Scotsman Guide, Originate Report)

### Secondary: The Solo Bridge Lender / Fund Principal

**Title:** Managing Partner, Principal, Owner
**Company:** Small bridge lending fund, $5M-$50M AUM, 1-5 people
**Day-to-day:** Sources deals, underwrites, manages portfolio — does everything

**Pain points:**
- Doing their own due diligence because they can't afford a team
- Missing things because they're stretched thin
- Needs to move fast to win deals but doesn't want to skip checks

**What they care about:**
- Price: "$35-50 per validation is cheaper than an hour of my time"
- Simplicity: "I enter a name and get a report"
- Credibility: "This makes me look more institutional to my investors"

**How they find us:**
- Searching for how-to guides: "how to verify borrower LLC", "bridge loan due diligence checklist"
- SaaS directories, Product Hunt
- LinkedIn content about bridge lending operations

### Tertiary: The Compliance / Risk Officer

**Title:** Chief Compliance Officer, Risk Manager
**Company:** Larger fund ($100M+) with regulatory obligations
**Day-to-day:** Ensures lending operations meet compliance standards

**What they care about:**
- Audit trail and documentation
- Consistency: "Every borrower gets the same checks"
- Regulatory alignment (FinCEN beneficial ownership, state licensing)

**How they find us:**
- Compliance-focused searches: "borrower screening requirements for private lenders"
- Referred internally by origination team after they start using the tool

---

## 3. Color System

All colors are defined as CSS custom properties in `globals.css`. Use semantic tokens, never raw hex values.

### Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--foreground` | `#0F172A` (Navy 950) | Primary text, headings, logo "Pulse" |
| `--primary` | `#3B82F6` (Blue 500) | Buttons, links, active states, logo "Close" |
| `--background` | `#F8FAFC` (Slate 50) | Page background |
| `--card` | `#FFFFFF` | Card surfaces, elevated content |
| `--muted-foreground` | `#64748B` (Slate 500) | Secondary text, descriptions, timestamps |
| `--border` | `#E2E8F0` (Slate 200) | Card borders, dividers, table lines |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--success` / `--chart-3` | `#22C55E` (Green 500) | Verified status, clear results, active entities |
| `--warning` / `--chart-4` | `#F59E0B` (Amber 500) | Partial status, expired licenses, low confidence |
| `--destructive` | `#EF4444` (Red 500) | Flagged status, found litigation, suspended entities |
| `--info` / `--chart-2` | `#8B5CF6` (Violet 500) | AI analysis, info badges, secondary chart series |

### Sidebar (Dark)

| Token | Hex | Usage |
|-------|-----|-------|
| `--sidebar` | `#0F172A` (Navy 950) | Sidebar background |
| `--sidebar-foreground` | `#E2E8F0` (Slate 200) | Sidebar text |
| `--sidebar-accent` | `#1E293B` (Navy 900) | Sidebar hover/active background |
| `--sidebar-primary` | `#3B82F6` (Blue 500) | Active nav item text, logo accent |
| `--sidebar-border` | `#334155` (Navy 800) | Sidebar dividers |

### Color Rules

1. **Blue is for actions and identity.** Buttons, links, the "Close" in PulseClose. Nothing else.
2. **Navy is for text and structure.** Headings, body text, sidebar, CTA backgrounds.
3. **Green/amber/red are for status only.** Never decorative. Always tied to a data state.
4. **White cards on slate background.** This creates the visual hierarchy. Cards are content containers.
5. **No gradients.** Flat, solid colors only.
6. **No opacity below 50% for text.** Muted text uses `--muted-foreground`, not transparent black.

---

## 4. Typography

### Font Stack

| Purpose | Font | Variable |
|---------|------|----------|
| Body, headings, UI | Geist Sans | `--font-geist-sans` |
| Code, data, case numbers | Geist Mono | `--font-geist-mono` |

Geist is loaded via `next/font/google` in `layout.tsx`. No other fonts.

### Type Scale

| Element | Class | Size | Weight |
|---------|-------|------|--------|
| Page title | `text-2xl font-bold tracking-tight` | 24px | 700 |
| Page subtitle | `text-muted-foreground text-sm mt-1` | 14px | 400 |
| Card title | `text-base` (via CardTitle) | 16px | 600 |
| Card description | `text-sm text-muted-foreground` | 14px | 400 |
| Body text | `text-sm` | 14px | 400 |
| Labels | `text-sm font-medium` | 14px | 500 |
| Small/metadata | `text-xs text-muted-foreground` | 12px | 400 |
| Data/mono | `font-mono text-sm` or `text-xs` | 14/12px | 400 |
| Hero headline | `text-4xl sm:text-5xl font-bold tracking-tight` | 36-48px | 700 |

### Typography Rules

1. **`tracking-tight` on all headings.** This is core to the Geist look.
2. **`tabular-nums` globally.** Already set in `globals.css`. Numbers align in tables.
3. **No `text-lg` or `text-xl` in the app.** Card titles are `text-base`. Page titles are `text-2xl`. This keeps everything dense and professional.
4. **Mono for data values.** Case numbers, API keys, dates in tables, dollar amounts in dense layouts.
5. **Never ALL CAPS for body text.** Only for very small labels (`text-xs uppercase tracking-wide`), and sparingly.

---

## 5. Logo

> **Updated 2026-05-06 (Z3).** Earlier guidance was "wordmark only —
> no icon." That changed when we needed a favicon for the bookmarklet
> drag-target. The mark below is now the canonical mark; the wordmark
> still holds for in-product surfaces and headers, but they always
> appear together in the lockup.

### The Mark

A pulse waveform on a Navy 950 rounded square. The waveform reads as
ECG/heartbeat — direct visual tie to "Pulse" in the name. Single
asymmetric QRS-style spike makes it ownable rather than generic.

```
┌──────────────┐
│   ╱╲         │
│──┘  ╲    ╱─  │     pulse line, Blue 500
│      ╲  ╱    │     on Navy 950 rounded square
│       ╲╱     │
└──────────────┘
```

**Files:**
- [`src/app/icon.svg`](../src/app/icon.svg) — 64×64 favicon (Next.js auto-serves)
- [`src/app/apple-icon.svg`](../src/app/apple-icon.svg) — 180×180 apple-touch-icon
- [`public/logo-mark.svg`](../public/logo-mark.svg) — standalone mark for embedding
- [`public/logo-wordmark.svg`](../public/logo-wordmark.svg) — horizontal lockup (mark + text)

### The Wordmark

```
PulseClose
```

- "Pulse" in `--foreground` (Navy 950)
- "Close" in `--primary` (Blue 500)
- Font: Geist Sans (system stack on PDF surfaces), `text-xl font-bold tracking-tight`

### Implementation

In React, use the mark + wordmark lockup wherever the logo appears
(sidebar, page headers, login). Inline SVG keeps the mark rendering
correctly on dark backgrounds via `currentColor`:

```tsx
<Link href="/dashboard" className="flex items-center gap-2">
  <svg viewBox="0 0 64 64" className="h-7 w-7">
    <rect width="64" height="64" rx="14" className="fill-sidebar-primary/15" />
    <path
      d="M 8 36 L 22 36 L 26 36 L 30 16 L 34 50 L 40 26 L 44 36 L 56 36"
      fill="none"
      className="stroke-sidebar-primary"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
  <span className="text-xl font-bold tracking-tight">
    <span className="text-sidebar-foreground">Pulse</span>
    <span className="text-sidebar-primary">Close</span>
  </span>
</Link>
```

For static surfaces (PDF handoff, OG images) reference the SVG file
directly via `<img src="/logo-mark.svg" />`.

### Logo Rules

1. **Lockup is mark + wordmark.** They appear together by default.
   Mark-only is reserved for tight surfaces (favicon, app icon, OG
   thumbnail) where the wordmark wouldn't fit.
2. **No tagline lockup.** Taglines go below as separate text.
3. **Minimum size:** mark 24×24px, wordmark `text-xl` (20px).
4. **Clear space:** At least 16px margin on all sides.
5. **Pulse path is fixed.** Don't redraw the waveform — use the SVG
   files. Different number of peaks or different shape breaks
   recognition.
6. **Never invert the mark colors.** Navy bg + Blue line is canonical.
   On dark surfaces, switch to Blue bg / White line via
   `currentColor`.

### Favicon / App Icon

The pulse mark IS the favicon. `src/app/icon.svg` is auto-served by
Next.js; no `<link rel="icon">` needed. The bookmarklet inherits the
favicon of whatever page the user drags it from.

---

## 6. Component Patterns

### Component Library

shadcn/ui (base-nova style) + Tailwind CSS v4 + Lucide icons.

All UI primitives live in `src/components/ui/`. Dashboard-specific components live in `src/components/dashboard/`.

### Cards

Cards are the primary content container. Every data section is a card.

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Section Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

Rules:
- Cards have white backgrounds on the slate page background
- Cards never nest inside other cards
- Cards use `border-border` (default) — colored borders only for status (e.g., `border-destructive/30` for flagged items)

### Badges

Badges communicate status. They are small, inline, and always tied to data.

| Variant | Usage |
|---------|-------|
| `default` (blue bg) | Verified, active, clear, current plan |
| `destructive` | Flagged, found, suspended, revoked |
| `secondary` | Beta labels, neutral metadata, role tags |
| `outline` | Manual/pending states, informational tags |

Rules:
- Always pair with a Lucide icon when communicating status (`CheckCircle2`, `XCircle`, `FlaskConical`)
- Badge text is short: 1-2 words max
- No emoji in badges

### Buttons

| Variant | Usage |
|---------|-------|
| `default` (blue) | Primary actions: Submit, Search, Validate, Start, Upgrade |
| `outline` | Secondary actions: Manage Billing, Cancel, Export |
| `ghost` | Tertiary actions: Sign in (nav), navigation links |
| `destructive` | Dangerous actions only (delete, revoke) |

Rules:
- One primary button per section
- Icons on the left (`mr-2 h-4 w-4`), arrows on the right (`ml-2`)
- Loading state: replace icon with `<Loader2 className="mr-2 h-4 w-4 animate-spin" />`
- For button-as-link, use `render` prop: `<Button render={<Link href="..." />}>`

### Tables

Tables display data-dense content: validations, team members, usage records.

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Value</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

Rules:
- Wrap in a card with no padding on CardContent (`className="p-0"`)
- Text in cells: `text-sm` for primary data, `text-muted-foreground` for secondary
- Mono font for case numbers, amounts, dates
- No zebra striping — rely on borders

### Forms

Forms are horizontal on desktop, stacked on mobile.

```tsx
<form className="flex flex-col sm:flex-row gap-4">
  <div className="flex-1 space-y-1.5">
    <Label htmlFor="field">Label</Label>
    <Input id="field" placeholder="..." />
  </div>
  <div className="flex items-end">
    <Button type="submit">Action</Button>
  </div>
</form>
```

Rules:
- Labels above inputs, always
- `space-y-1.5` between label and input
- Submit button aligns to bottom of the row
- Error messages: `<p className="text-sm text-destructive">`

### Empty States

When there's no data to show, center content vertically with an icon and description.

```tsx
<Card>
  <CardContent className="flex flex-col items-center justify-center py-16">
    <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
    <p className="text-muted-foreground text-sm max-w-md text-center">
      Description of what will appear here and how to trigger it.
    </p>
  </CardContent>
</Card>
```

### Loading States

Use Skeleton components from shadcn. Match the rough shape of the content being loaded.

```tsx
<Card>
  <CardContent className="p-6 space-y-4">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-20 w-full" />
  </CardContent>
</Card>
```

### Toast Notifications

Use Sonner via `toast()`. Three tones:
- `toast.success("Validation complete")` — green, good news
- `toast.error("Search failed")` — red, something broke
- `toast.warning("2 litigation records found")` — amber, needs attention
- `toast.info("API key copied")` — neutral, informational

---

## 7. Layout Patterns

### Public Pages (Landing, Blog, Guides, Glossary)

```
[Header: Logo left, nav right, max-w-6xl centered]
[Content: max-w-6xl centered, px-6]
[Footer: Logo left, copyright right, max-w-6xl centered]
```

- Header: `border-b border-border`, height `h-16`
- Content: full-width sections alternate between `bg-background` and `bg-card border-y`
- Dark CTA section: `bg-[#0F172A] text-white`
- Footer: `border-t border-border`

### Dashboard (Authenticated)

```
[Sidebar: w-64, fixed, dark bg] [Main: flex-1, overflow-y-auto]
                                  [Content: max-w-7xl, px-6 py-8]
```

- Sidebar: `bg-sidebar` (Navy 950), fixed left, 256px wide
- Main content: scrollable, padded, max-width capped
- Mobile: sidebar slides in as overlay, hamburger top-left

### Blog Post / Guide Layout

```
[Header]
[Breadcrumbs: text-sm text-muted-foreground]
[Article: max-w-3xl, prose-like spacing]
  [Title: text-3xl font-bold tracking-tight]
  [Meta: date, read time, author — text-sm text-muted-foreground]
  [Body: text-base leading-relaxed, headings at text-xl/text-lg]
  [CTA Card: border-primary bg-primary/5]
[Sidebar: related posts, table of contents — optional]
[Footer]
```

### Glossary Entry Layout

```
[Header]
[Breadcrumbs]
[Term: text-2xl font-bold]
[Definition: text-base, 2-3 paragraphs max]
[Why It Matters for Bridge Lenders: practical context]
[Related Terms: linked badges]
[CTA: "Automate [this check] with PulseClose"]
[Footer]
```

---

## 8. Imagery & Icons

### Icons

Lucide icons only. Already installed, consistent with shadcn/ui.

| Concept | Icon |
|---------|------|
| Entity / SOS | `Search` |
| Track Record / Properties | `Building2` |
| GC / Contractor | `HardHat` |
| Litigation / Legal | `Scale` |
| Validation / Shield | `Shield` |
| Usage / Analytics | `BarChart3` |
| Settings | `Settings` |
| Success / Clear | `CheckCircle2` |
| Error / Found | `XCircle` |
| Beta | `FlaskConical` |
| Warning | `AlertTriangle` |
| Arrow / CTA | `ArrowRight` |
| Loading | `Loader2` (with `animate-spin`) |

Rules:
- Icons are `h-4 w-4` in buttons and nav, `h-5 w-5` standalone, `h-8 w-8` in feature cards, `h-12 w-12` in empty states
- Icon color matches surrounding text unless it's a status indicator
- No filled/solid icon variants — line icons only

### Photography & Illustration

**None.** PulseClose uses no photos, illustrations, or decorative images.

The product is data and text. The visual identity comes from layout, typography, and color restraint. If we need visual breaks on marketing pages, use:
- Data examples (mock validation cards, sample results)
- Simple diagrams (workflow: input -> checks -> report)
- Screenshots of the actual product

If we ever add imagery, it should be:
- Real screenshots of the product
- Simple vector diagrams (single color, no gradients)
- Never stock photography

---

## 9. Page-Specific Guidelines

### Landing Page (`/`)

**Job:** Convince a bridge lender to sign up in under 60 seconds.

Structure:
1. Hero: Headline + subhead + two CTAs (primary: "Start validating", secondary: "Sign in")
2. Pain points: 5 bullet points with checkmarks. Things they're doing manually today.
3. Features: 4 cards, one per validation pillar. Icon + title + 2-sentence description.
4. Social proof (when available): Design partner name, number of validations run, etc.
5. CTA: Dark navy section. Pricing mention ($35-50/validation). Final "Get started free" button.
6. Footer: Minimal. Logo, one-line descriptor, copyright.

**No:**
- Pricing table on the landing page (that's in-app after signup)
- Feature comparison matrix
- Demo video (we don't have one yet, and a bad one is worse than none)
- Multiple CTAs competing for attention

### Blog Post (`/blog/[slug]`)

**Job:** Rank for informational/problem-aware keywords. Build trust. Funnel to signup.

Structure:
1. Title (H1): Specific, keyword-rich, under 60 characters
2. Meta line: Publication date, estimated read time
3. Body: 1,000-3,000 words. Short paragraphs (2-4 sentences). Subheadings every 200-300 words.
4. In-article CTA: One card-style CTA after the first major section. Non-intrusive.
5. Bottom CTA: Stronger CTA card at the end. "Try PulseClose free" or "See how PulseClose automates [this]."

**Writing rules:**
- Lead with the insight, not the setup
- Use specific numbers, not "many" or "several"
- Reference real processes (PACER, SOS websites, county recorder offices)
- Link to related guides and glossary terms (internal linking)
- No "In this article, we will discuss..." openers

### Programmatic Guide (`pulseclose.com/guides/sos-lookup/[state]`)

**Job (2026):** Get cited inside AI Overview / ChatGPT / Perplexity answers for queries like "how to look up an LLC in [state] for a bridge loan". Capture handoff from people researching manual lookups.

Structure (auto-generated by [`wordpress/scripts/publish-guides.ts`](../wordpress/scripts/publish-guides.ts)):
1. **FAQPage schema** with the canonical bridge-lender query shapes ("How do I look up…", "What entity statuses should bridge lenders watch for…", "What data is available…", "What are the common gotchas…").
2. **Named-expert byline** + last-reviewed date.
3. Title: "[State] Secretary of State Entity Search: Guide for Bridge Lenders"
4. **40-word direct answer** as H2 + first paragraph: "Use [Portal Name] (URL). [Online availability]. [Processing time] processing."
5. Entity-type chips (LLC, Corporation, LP, etc.).
6. "Step-by-step lookup" H3 with numbered instructions specific to that state.
7. "What data the [Portal] returns" H3 with a bullet list.
8. "[State] gotchas for lenders" H3 with state-specific issues (suspension triggers, different terminology, FTB minimum tax, etc.).
9. CTA card: "Skip the per-state ritual. PulseClose runs SOS validation across all 50 states automatically."

**Key:** Each page must have genuinely useful, state-specific content. The step-by-step instructions differ per state because every SOS website is different. Refresh the `last-reviewed` date monthly via re-running the publish script — Perplexity / ChatGPT have a recency bias and a refresh can move ranking 95 positions.

### Glossary Entry (`pulseclose.com/glossary/[term]`)

**Job (2026):** Get cited inside AI Overview / ChatGPT / Perplexity answers for "what is [term]" queries. Build topical authority. Create internal linking hub.

Structure (auto-generated by [`wordpress/scripts/publish-glossary.ts`](../wordpress/scripts/publish-glossary.ts)):
1. **FAQPage schema** as `<script type="application/ld+json">` — Q-A pairs explicit, not just embedded in prose. Highest-CTR structured-data shape for AI citations.
2. **Named-expert byline** + last-reviewed date: "Methodology authored by Zach Wade, Wade Intel — validated against production runs at Insignia Capital Corp."
3. Term as H2 ("What is [term]?") with **40-word direct answer** in the first paragraph after the H2.
4. "Why it matters to bridge lenders" H3 with 1-paragraph practical context.
5. Example if applicable.
6. CTA card: contextual, tied to the term (e.g., "Automate bankruptcy screening with PulseClose").
7. Related terms as in-line links to other glossary entries.

---

## 10. Spacing & Grid

### Spacing Scale

We use Tailwind's default spacing scale. Commonly used values:

| Token | Pixels | Usage |
|-------|--------|-------|
| `gap-2` | 8px | Between inline elements (badge + text, icon + label) |
| `gap-3` | 12px | Between small cards, list items |
| `gap-4` | 16px | Between form fields, between cards in a grid |
| `gap-6` | 24px | Between major sections within a page |
| `gap-8` | 32px | Between feature cards on landing page |
| `py-8` | 32px | Dashboard content top/bottom padding |
| `py-16` | 64px | Landing page section padding |
| `py-24` | 96px | Landing page hero padding |

### Grid

- Dashboard: single column, cards stack vertically. Occasional `grid sm:grid-cols-2` for stat cards or litigation results.
- Landing page: `grid sm:grid-cols-2` for feature cards. Single column for everything else.
- Max widths: `max-w-6xl` for public pages, `max-w-7xl` for dashboard content, `max-w-3xl` for blog/guide prose.

### Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| Mobile (<640px) | Single column. Sidebar hidden (hamburger). Forms stack vertically. |
| Tablet (640-1023px) | Two-column grids. Sidebar still hidden. |
| Desktop (1024px+) | Sidebar visible. Full layouts. |

---

## 11. Motion & Interaction

### Transitions

- Nav hover: `transition-colors` (150ms default)
- Card hover: none (cards are not interactive containers)
- Button hover: handled by shadcn defaults
- Sidebar mobile: `transition-transform` slide in/out

### Loading

- Page data loading: Skeleton placeholders matching content shape
- Button loading: `<Loader2 className="animate-spin" />` replaces the icon
- No full-page spinners
- No progress bars (our API calls are too fast to warrant them)

### Animation Rules

1. **No entrance animations.** Content appears immediately. No fade-in, no slide-up.
2. **No scroll animations.** No parallax, no reveal-on-scroll, no intersection observer effects.
3. **Spinner only for active user-initiated actions.** Search button loading, form submit.
4. **Transitions are for state changes, not decoration.** Hover, active, focus.

---

## 12. Accessibility

- All interactive elements are keyboard-accessible (shadcn handles this)
- Form inputs have associated `<Label>` elements with `htmlFor`
- Color is never the only indicator — always pair with text or icons (e.g., red badge + "Found" text)
- Focus rings: `outline-ring/50` (set globally in CSS)
- Minimum text contrast: 4.5:1 for body text, 3:1 for large text (our palette meets this)
- Alt text on any images we add (currently none)

---

## 13. Content Templates

### Page Title Pattern
```
[Noun/Action] | PulseClose
```
Examples:
- "Dashboard | PulseClose"
- "Entity Validation | PulseClose"
- "California SOS Entity Search: Guide for Lenders | PulseClose"
- "What Is Lis Pendens? | Bridge Lending Glossary | PulseClose"

### Meta Description Pattern
Under 155 characters. Action-oriented for product pages, informative for content pages.
- Product: "Validate bridge loan borrowers in minutes. Entity checks, track record, litigation screening, GC credentials — across all 50 states."
- Guide: "Step-by-step guide to searching the California Secretary of State for entity status, formation dates, and registered agents."
- Glossary: "Lis pendens definition for bridge lenders. What it means, how to search for it, and why it matters for loan underwriting."

### OG Image
Text-based, generated. Navy background, white text:
```
Line 1: Page title (Geist Sans Bold, 48px)
Line 2: PulseClose wordmark (Geist Sans Bold, 24px, "Close" in blue)
```
No photos, no decorative elements. Consistent with the text-first brand.
