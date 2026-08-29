# Agrivia.ai — how this site is hosted

Live site: **https://agrivia.ai**

This is **not** CloudFront. Do not run `terraform apply` for CloudFront. farmi-prod is still blocked from creating CloudFront distributions.

## What is live today

```
Browser
  │  https://agrivia.ai
  ▼
Cloudflare (proxied @ and www)  →  S3 website bucket s3://agrivia.ai
                                         (us-west-2)

api / api-dev  →  A 35.172.251.193   DNS only (grey cloud)
                 Leave grey. Orange-clouding api breaks the mobile app.
```

Porkbun nameservers for the domain must stay:

- `lady.ns.cloudflare.com`
- `matias.ns.cloudflare.com`

## Deploy website files

From this repo (`agrivia-web`):

```bash
cd /Users/subbaramreddybasireddy/Agrivia/agrivia-web/agrivia-web

aws s3 sync . s3://agrivia.ai \
  --exclude "terraform/*" \
  --exclude ".git/*" \
  --exclude ".DS_Store" \
  --exclude "*.md" \
  --exclude "cloudflare/*"
```

Then purge Cloudflare cache for `agrivia.ai` if the old page is still showing.

Do **not** sync to `agrivia-ai-static-website-prod`. That bucket is not the live origin.

## Website chat (same API as the apps)

iOS and Android call:

- `POST https://api.agrivia.ai/api/chat`
- body `{ deviceUuid, category, query, summarize: false }`
- `GET /api/welcome_greeting?device_uuid=&category=`
- `POST /api/chat/rate`

The website uses that same contract, with category locked to `General` and a browser UUID in localStorage. It does not call `/register`, location, or inventory endpoints.

Until the Cloudflare Worker at `cloudflare/chat-bff` is routed to `agrivia.ai/api/*`, the page calls `https://api.agrivia.ai/api` directly. After the Worker is attached, set `apiBasePath` in `js/config.js` to `"/api"` so the 1–2 rps cap sits in front of EC2.

Do not orange-cloud `api.agrivia.ai`.

## Local preview

```bash
cd /Users/subbaramreddybasireddy/Agrivia/agrivia-web/agrivia-web
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Affiliates

Do not apply to Skimlinks, Awin, FlexOffers, Admitad, or Impact until there are about 8–10 real guide **pages** (URLs under `/guides/`, not popups). We are not on those networks today. Do not put their badges or IDs on the site.
