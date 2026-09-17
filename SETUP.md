# Social Media Dashboard setup

## Daily synchronization

Cloudflare Worker is the only scheduled synchronization mechanism. Its verified
Cron Trigger runs every day at `08:15 UTC` and writes the connected-source
results to Supabase. GitHub Actions and the retired Windows task were removed
to prevent duplicate, conflicting syncs.

The Worker configuration remains in
`workers/social-dashboard-sync/wrangler.jsonc`; it is required both to deploy
the Worker and to retain the Cron Trigger.

## Architecture

```text
GA4 / Beehiiv / YouTube / Luma ──> Cloudflare Worker Cron ──> Supabase
                                         │                       │
Instagram + LinkedIn CSV imports ────────┘                       │
                                                                 ▼
Cloudflare Pages dashboard <── restricted dashboard endpoints ───┘
        ▲
        └── GitHub Actions: build and deploy Pages only
```

The dashboard lives in Cloudflare Pages (`social-dashboard-gild`). The Worker
(`social-dashboard-sync`) is the sole daily data writer. Supabase stores the
normalized results. GitHub Actions never synchronizes metrics; it only builds
and deploys the Pages site. This separation means no part of this dashboard
changes `gildhq.com`.

Public dashboard routes expose only the fields rendered by the dashboard.
Administration routes require the `x-analytics-admin-secret` header and the
`ANALYTICS_ADMIN_SECRET` Worker secret. Browser CORS is limited to the Pages
dashboard and local development origins.

## Instagram: approval checklist before implementation

1. Create a Meta app owned by GILD and add the Instagram Graph API product.
2. Confirm the GILD Instagram account is a Professional account (Business or
   Creator) linked to the correct Facebook Page.
3. Add the exact value of `META_REDIRECT_URI` from the environment to Meta's
   Valid OAuth Redirect URIs. Replace the example host with the real callback
   service before registration; it must match character-for-character.
4. Request Advanced Access/App Review for the read-only scopes
   `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, and
   `pages_read_engagement`. Submit the screencast and privacy-policy material
   Meta requests for the production app.
5. An administrator of the linked Facebook Page completes OAuth. Store only
   `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, and
   `GILD_INSTAGRAM_BUSINESS_ID` as Worker secrets; exchange/renew the token as
   Meta requires.
6. Only after approval, implement the connector and remove the imported-data
   label after a successful live sync.

## LinkedIn: approval checklist before implementation

1. Create or use the GILD LinkedIn developer app and request the Marketing API
   and/or Community Management API products needed for organization analytics.
2. Add the exact `LINKEDIN_REDIRECT_URI` value from the environment in the app
   configuration. Replace the example host with the real callback service
   before registration; it must match character-for-character.
3. Request the member-consent scopes `r_organization_admin` (organization and
   reporting data) and `r_organization_social` (organization post data). These
   scopes require LinkedIn approval for the relevant product.
4. Have a GILD LinkedIn Page administrator authorize the app. Confirm that the
   authorized member has the organization role required for analytics access.
5. Store `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
   `LINKEDIN_ACCESS_TOKEN`, and `LINKEDIN_ORGANIZATION_ID` as Worker secrets.
   Record token expiry and re-authorize before it expires.
6. Only after approval, implement and test the connector; until then, the
   dashboard explicitly says the CSV data is imported through 15 Sep 2026.

LinkedIn's current access and organization-role requirements are documented in
[the API permissions reference](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)
and [organization roles reference](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role).

## Adding a source

1. Verify the provider supports the metrics and date ranges needed by the
   dashboard, and obtain its approved read-only credentials.
2. Add placeholders to `.env.example` and add the actual values only as
   Cloudflare Worker secrets.
3. Create a normalized connector in `src/lib/analytics/connectors/`, add it to
   the Worker source list, and expose only required display fields through a
   dedicated dashboard route.
4. Add a source-status label that distinguishes live API data from imported
   data, then test both selected-date and daily Cron behavior.
5. Build and deploy through the Pages workflow; check the resulting preview
   before merging to `main`.
