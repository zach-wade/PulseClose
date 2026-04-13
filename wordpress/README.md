# PulseClose WordPress Marketing Site

This directory holds everything related to the marketing site at **pulseclose.com** (GoDaddy Managed WordPress).

The Next.js app at `app.pulseclose.com` is the authenticated product. **No marketing content goes in the Next.js app.** All public-facing pages, blog posts, glossary, and guides live here and get published to WordPress via the REST API.

## Directory structure

```
wordpress/
  README.md                # This file
  scripts/                 # Node/TS scripts for publishing to WordPress REST API
    wp-client.ts           # Reusable WP REST API client (auth, CRUD)
    audit.ts               # Fetch and report on existing WP pages
    publish-pages.ts       # Publish/update top-level pages (Home, About, etc.)
    publish-blog.ts        # Publish blog posts
    publish-glossary.ts    # Publish glossary parent + child pages
    publish-guides.ts      # Publish guides parent + state guide pages
  content/
    pages/                 # Top-level pages (HTML or markdown)
      home.md
      about.md
      features.md
      pricing.md
      demo.md
    posts/                 # Blog posts (markdown with frontmatter)
      bridge-loan-borrower-due-diligence.md
    glossary/              # Glossary terms (markdown with frontmatter)
      lis-pendens.md
      ...
    guides/                # Guide pages
      sos-lookup/
        california.md
        florida.md
        ...
  audit/                   # Snapshots of current WP state for comparison
    pages-snapshot.json
```

## WordPress credentials

Stored in `/Users/zachwade/PulseClose/.env.local`:
```
WP_URL=https://pulseclose.com
WP_USER=977280pwpadmin
WP_APP_PASSWORD=Vlp4 N1Yt UaYH yUWa qWzt qKy8
```

These were carried over from the archived BridgeFlow repo. The app password authenticates the admin user against the WordPress REST API.

## Workflow

1. Write content in markdown files under `content/`
2. Run the appropriate publish script to push to WordPress
3. Scripts are idempotent — they update existing pages by slug, create new ones if missing
4. Always publish as `draft` first, review on WP admin, then promote to `publish`

## Why not edit in WordPress directly?

- Version control: every change is in git
- Reproducible: scripts can re-publish from source if WP gets reset
- Programmatic SEO: 50 state guides + 100 county pages would be impossible to manage by hand
- Brand consistency: all content is generated from the same templates and follows the design system
