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

## Conectar Instagram

The Worker connector is present but disabled by default with
`IG_SYNC_ENABLED=false`. It reads account reach, impressions and follower count
plus the most recent configured media records and their likes, comments and
saves. It cannot contact Meta until the flag is enabled and the required
secrets are present.

1. In [Meta for Developers](https://developers.facebook.com/), create an app
   owned by GILD. Add **Facebook Login for Business** and the **Instagram Graph
   API** product.
2. Confirm that `@gild.hq` is a Professional Instagram account (Business or
   Creator) connected to the intended Facebook Page. A personal account cannot
   supply these Graph API insights.
3. In Facebook Login for Business, add the exact `META_REDIRECT_URI` value from
   `.env` to Valid OAuth Redirect URIs. Replace the example host in
   `.env.example` with the real HTTPS callback first; the two values must match
   character-for-character.
4. In App Review, request Advanced Access for `instagram_basic`,
   `instagram_manage_insights`, `pages_show_list`, and
   `pages_read_engagement`. Submit Meta's requested screencast, use-case and
   privacy-policy information before asking a non-admin to authorize the app.
5. In Graph API Explorer, choose the GILD app, request the four scopes above,
   generate a User Access Token as a Facebook Page administrator, and exchange
   it for a long-lived token:

   ```text
   GET https://graph.facebook.com/v20.0/oauth/access_token
       ?grant_type=fb_exchange_token
       &client_id={META_APP_ID}
       &client_secret={META_APP_SECRET}
       &fb_exchange_token={SHORT_LIVED_USER_TOKEN}
   ```

6. Obtain `INSTAGRAM_IG_USER_ID` from the connected professional account. Do
   not commit it with the token. Put these values in the local `.env` only for
   local testing: `INSTAGRAM_IG_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`,
   `META_APP_ID`, `META_APP_SECRET`, `INSTAGRAM_TOKEN_EXPIRES_AT`, and
   `IG_SYNC_ENABLED`.
7. Put the same sensitive values into the Worker one at a time, never in
   `wrangler.jsonc` or git:

   ```bash
   npx wrangler secret put INSTAGRAM_ACCESS_TOKEN --config workers/social-dashboard-sync/wrangler.jsonc
   npx wrangler secret put INSTAGRAM_IG_USER_ID --config workers/social-dashboard-sync/wrangler.jsonc
   npx wrangler secret put META_APP_ID --config workers/social-dashboard-sync/wrangler.jsonc
   npx wrangler secret put META_APP_SECRET --config workers/social-dashboard-sync/wrangler.jsonc
   npx wrangler secret put INSTAGRAM_TOKEN_EXPIRES_AT --config workers/social-dashboard-sync/wrangler.jsonc
   npx wrangler secret put INSTAGRAM_TOKEN_REFRESH_ENABLED --config workers/social-dashboard-sync/wrangler.jsonc
   npx wrangler secret put IG_SYNC_ENABLED --config workers/social-dashboard-sync/wrangler.jsonc
   ```

   Set `IG_SYNC_ENABLED` to the literal value `true` only after all four Meta
   values have been set and the app review is approved. `INSTAGRAM_SYNC_POST_LIMIT`
   defaults to 25 and may be supplied as a Worker secret if a different recent
   media count is needed.

The connector starts a long-lived-token exchange 14 days before the recorded
expiry and uses that result for the active sync. A Worker cannot replace its own
Wrangler secret, so the production rotation step will send the refreshed value
to a dedicated secret-rotation service that updates the Worker secret before
the 60-day expiry; leave refresh disabled until that service is approved.

If the token is absent, expired or revoked after the flag is enabled, Instagram
alone is marked `disconnected` in `analytics_sources`; the daily sync continues
for every other source.

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
