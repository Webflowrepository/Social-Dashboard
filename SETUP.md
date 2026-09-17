# Social Media Dashboard setup

## Architecture

```text
GA4 / Beehiiv / YouTube / Luma ──> Cloudflare Worker Cron ──> Supabase
                                                                  │
Instagram / LinkedIn CSV imports ─────────────────────────────────┤
                                                                  ▼
Cloudflare Pages dashboard <── restricted dashboard endpoints ───┘
        ▲
        └── GitHub Actions: build and deploy Pages only
```

Cloudflare Worker (`social-dashboard-sync`) is the sole scheduled writer. Its
Cron Trigger runs daily at `08:15 UTC`. Cloudflare Pages
(`social-dashboard-gild`) hosts the dashboard, and Supabase stores normalized
data. GitHub Actions only builds and deploys Pages; it never synchronizes
metrics. This dashboard does not change `gildhq.com`.

Public dashboard routes expose only fields that the dashboard renders. Admin
routes require the `x-analytics-admin-secret` header and the
`ANALYTICS_ADMIN_SECRET` Worker secret. Browser CORS is limited to the Pages
dashboard and local development origins.

## Sources

| Source | Type | Update frequency | How to update |
| --- | --- | --- | --- |
| Google Analytics | Live API | Daily at 08:15 UTC | Worker Cron updates it automatically. |
| Beehiiv | Live API | Daily at 08:15 UTC | Worker Cron updates it automatically. |
| YouTube | Live API | Daily at 08:15 UTC | Worker Cron updates it automatically. |
| Luma | Live API | Daily at 08:15 UTC | Worker Cron updates it automatically. |
| Instagram | CSV import | Whenever a new export is available | Download the CSV and run `pnpm import:instagram -- path/to/file.csv --through YYYY-MM-DD`. |
| LinkedIn | CSV import | Whenever a new export is available | Replace its CSV in `data/imports/` and run `pnpm sync:social`. |
| Spotify | Not available | Never | No supported metric export exists for this account type. |

## Instagram and LinkedIn: CSV import

Instagram is deliberately **not** connected to Meta. The retained
`IG_SYNC_ENABLED=false` connector is blocked by Meta restriction and must be
reactivated only if that situation changes and the project explicitly approves
it. The CSV importer is the sole supported route; it does not use OAuth,
Facebook Login, App Review, or a token.

### Instagram (about two minutes)

1. In the Instagram professional account, open **Professional dashboard** →
   **See all insights** → **Export**, select the date range, and download the
   post-level CSV. If the app shows an Accounts Center export instead, select
   the professional account and export the insights/post activity CSV.
2. The file needs an ID or permalink, a published date, at least one post
   metric (`reach`, `impressions`, `views`, `likes`, `comments`, `shares`,
   `saves`, or `clicks`), and either an export/report-through date column or a
   date supplied on the command line. Common header variants are accepted.
3. From the repository root, preview the result without writing anything:

   ```bash
   pnpm import:instagram -- path/to/instagram.csv --through 2026-09-17 --dry-run
   ```

4. If the reported ignored rows are expected, run the same command without
   `--dry-run`:

   ```bash
   pnpm import:instagram -- path/to/instagram.csv --through 2026-09-17
   ```

   It upserts `analytics_sources`, `analytics_metrics`, and
   `content_performance`, so re-importing the same file never duplicates
   records. It also updates the dashboard source label to
   **Imported — through 2026-09-17**. The next Pages build/deploy publishes
   that label and the imported post data.

The command reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from a local
uncommitted `.env` file or the shell. Never put them in the CSV, source code,
or git.

### LinkedIn (about two minutes)

1. Open the GILD LinkedIn Page as an administrator, choose **Analytics**, then
   use **Export** to download the post/content CSV for the desired period.
2. Save the export as `data/imports/linkedin.csv` and run:

   ```bash
   pnpm sync:social
   ```

   This is an imported source, not a live LinkedIn API integration. Check the
   dashboard's imported-through label before publishing a Pages build.

## Adding a source

1. Verify that the provider supports the required metrics and date ranges.
2. For a live API, add empty placeholders to `.env.example`; place real values
   only in Cloudflare Worker secrets. For an import, document the accepted
   file format and explicit coverage date.
3. Add normalized metrics/content storage, expose only necessary display
   fields through a dashboard route, and label live versus imported data.
4. Test a selected date range and the daily Cron behavior before deploying a
   Pages preview.
