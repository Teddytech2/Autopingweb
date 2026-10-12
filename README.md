# TEDDY-XMD AutoPing

A Vite + React dashboard and Vercel serverless API for checking website availability. The dashboard is public/read-only by default. It includes an on-demand URL preview frame for publisher-approved creatives or landing pages.

## Features

- Public read-only website status dashboard.
- External scheduled monitoring endpoint with shared-secret authentication.
- HTTP `HEAD` checks, with a small ranged `GET` fallback for servers that do not support `HEAD`.
- Stores the latest site status and up to 50 check results per site in Vercel KV / Upstash Redis.
- On-demand iframe preview of a URL; it does **not** automate ad impressions or clicks.
- Responsive dark purple interface.

## Important starter limitation

For safety, site creation/deletion is intentionally disabled because this is a public dashboard. Seed the `autoping:sites` key in KV with an array of site records, or add authenticated admin endpoints before exposing mutations. Do not put a database write token in frontend code. The included example website names in the UI are not automatically registered or checked.

Example record to seed in KV:

```json
[
  {
    "id": "site-teddy-pairing",
    "name": "TEDDY-XMD Pairing",
    "url": "https://example.com",
    "createdAt": "2026-10-12T10:00:00.000Z",
    "lastCheck": null,
    "status": "unknown",
    "latencyMs": null,
    "statusCode": null
  }
]
```

Only seed URLs you own or are authorized to monitor. Private IP ranges and localhost are rejected by URL validation in the helper; the scheduled endpoint should still only be used with trusted, pre-registered URLs. For production use, also implement DNS resolution checks against private/link-local IPs and redirect policy to further reduce SSRF risks.

## Requirements

- Node.js 20+
- Vercel account and CLI
- Vercel KV or Upstash Redis REST credentials
- External cron provider that can make an HTTPS request every minute

## Centralized configuration

The root `config.js` is the single main configuration file. It reads the Railway environment variables and centralizes the database name, cron secret, port, maximum sites per run, request timeout, history retention, user-agent string, and JSON body size. Change safe defaults there if needed; set credentials only in Railway Variables, never directly in source code.

## Environment variables

Set these in Vercel Project Settings → Environment Variables for Production (and Preview if needed):

| Name | Required | Purpose |
|---|---|---|
| `KV_REST_API_URL` | Yes | REST endpoint for your KV/Upstash Redis database |
| `KV_REST_API_TOKEN` | Yes | Server-side database token; never expose to Vite client variables |
| `CRON_SECRET` | Yes | Long random secret for authenticating scheduled checks |

Generate a secret with:

```bash
openssl rand -hex 32
```

Never prefix secrets with `VITE_`. Keep `.env` out of Git.

## Deploy to Vercel

1. Create a new GitHub repository and upload this project.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the Vite framework preset.
3. Create a Vercel KV / Upstash Redis database and copy its REST URL and token into the environment variables above.
4. Generate and add `CRON_SECRET`.
5. Deploy the project.
6. Seed the `autoping:sites` key in your KV database with JSON site records (example above). KV clients and dashboards vary; use the database's REST/CLI interface or a trusted admin tool. Do not add credentials to the browser.
7. Confirm `https://YOUR_DOMAIN/api/sites` returns `{ "sites": [...] }`.

## Configure an external cron service

Create a job that runs every minute:

- Method: `POST`
- URL: `https://YOUR_DOMAIN/api/cron`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- Body: empty

You can use an external scheduler such as cron-job.org, EasyCron, or a hosted GitHub Actions schedule. Use a service that supports custom headers and frequent schedules. Protect the secret; never put it in a public URL or client-side JavaScript.

Expected successful response:

```json
{ "ok": true, "checked": 1, "results": [], "ranAt": "..." }
```

Vercel serverless functions have execution limits. This starter checks up to 100 sites sequentially with an 8-second timeout per site, so a one-minute interval is not appropriate for 100 slow sites in a single invocation. For larger lists, batch checks, queue jobs, or use a dedicated monitoring worker/service. Some external schedulers have minimum intervals or paid tiers.

## Local development

```bash
npm install
cp .env.example .env
# Fill in your KV and cron values
npm run dev
```

`npm run dev` uses `vercel dev`, which serves the Vercel API functions locally. Alternatively use the Vercel CLI to link the project.

## API

- `GET /api/sites` — public read-only status list.
- `GET /api/history?siteId=...` — check history for one site.
- `POST /api/cron` — execute scheduled checks; requires `Authorization: Bearer <CRON_SECRET>`.

`GET /api/cron` is also supported for cron services that only issue GET requests, but POST is preferred.

## Ads preview behavior

The preview is a normal sandboxed iframe. Many ad providers send headers that prevent framing; those URLs will not preview here. Use a provider's official preview tool or a publisher-approved creative/landing-page URL instead. This tool intentionally does not auto-refresh ad pages, click ads, rotate fake visitors, bypass ad restrictions, or manufacture billable impressions.

## Security checklist before production

- Add authenticated administrator access before implementing site creation/deletion.
- Keep KV credentials and `CRON_SECRET` server-only.
- Use HTTPS for the deployed domain.
- Configure rate limiting for any future public mutation/test endpoint.
- Add DNS/IP validation and a redirect allowlist to prevent server-side request forgery.
- Monitor function duration and scheduler delivery failures.
- Only monitor sites you own or have permission to test.
- Do not treat a 2xx/3xx response as proof the full website is healthy; add content assertions if needed.
- Do not use this project to generate artificial ad impressions/clicks.
