# Social Media Dashboard setup

## Daily synchronization

Cloudflare Worker is the only scheduled synchronization mechanism. Its verified
Cron Trigger runs every day at `08:15 UTC` and writes the connected-source
results to Supabase. GitHub Actions and the retired Windows task were removed
to prevent duplicate, conflicting syncs.

The Worker configuration remains in
`workers/social-dashboard-sync/wrangler.jsonc`; it is required both to deploy
the Worker and to retain the Cron Trigger.
