# SalesBot — AI Video Sales Agent

Add one script line to a website and get an AI salesperson with a face and a voice. The agent talks to visitors in real time, answers from the product's own knowledge (RAG), gives live product walkthroughs in a real browser, recommends catalog items, scores every visitor as a Hot/Warm/Cold lead, hands over to a human on request, and records calls.

```html
<script src="https://<your-host>/widget3.js" data-product-id="PRODUCT_ID" async></script>
```

## Architecture

```
 Merchant website                      Merchant
 <script src=".../widget3.js">         Dashboard (React)
        │                                    │ REST + JWT
        ▼                                    ▼
 Widget (React, iframe) ◄── Socket.IO ──► Node/Express backend ──► MongoDB Atlas
        │   chat, audio, events            │  ├─ Call orchestrators (per call)
        │                                  │  ├─ LLM brain (Groq, native tool calling)
        │◄──── LiveKit (WebRTC) ──────────►│  ├─ RAG retrieval (BM25, optional hybrid)
        │   avatar video + voice           │  ├─ Explorer / Navigator (Playwright)
        │                                  │  ├─ Zoho CRM lead sync
        │                                  │  └─ Redis (Socket.IO adapter)
        │                          Python sidecar: Keyframe avatar agent (LiveKit)
        │                          Deepgram: STT (Nova-2) + TTS (Aura-2, streamed PCM)
```

## Repository layout

| Path | What it is |
|---|---|
| `backend/` | Node 20+ / Express 5 API, Socket.IO, orchestrators, RAG, Playwright explorer & navigator |
| `backend/public/widget3.js` | The one-line embed loader merchants put on their site |
| `frontend/widget3/` | The embedded visitor widget (React/Vite): avatar video, voice, product cards |
| `frontend/dashboard/` | Merchant dashboard: products, knowledge base, calls, leads, Live Console |
| `frontend/widget/`, `frontend/widget2/` | Earlier iterations (live demo walkthrough, 1-on-1 avatar chat) |
| `servers/` | Python sidecars: Keyframe avatar agent (LiveKit), local TTS fallback |
| `deploy/` | nginx config + EC2/Docker setup scripts |
| `docker-compose.yml` | backend, keyframe-agent, tts-server, redis, mongodb, browserless |

## Features

- **Product onboarding**: give a URL (+ optional login); a Playwright explorer crawls up to 15 pages, clicks past cookie-consent walls, extracts full page text, and an LLM builds a knowledge map + navigation shortcuts. Per-page exploration timing is shown in the dashboard.
- **RAG knowledge base**: page text, uploaded documents (PDF parsed client-side), owner notes and the catalog are chunked (~900 chars, 150 overlap) and searched with BM25 in 3–7 ms; set `OPENAI_API_KEY` to upgrade to hybrid search (embeddings + reciprocal rank fusion). Dashboard has a "test a question" panel showing exactly what the agent would read.
- **Voice**: Deepgram TTS streamed as raw PCM over Socket.IO, played gaplessly via Web Audio — ~0.4 s to first audio, captions synced to actual playback.
- **Live navigation**: the LLM clicks/types/navigates through numbered `data-zyx-id` element markers (never guessed CSS selectors), verifies each action, max 3 chained steps; visitors watch via CDP screencast.
- **Sales layer**: shoppable product cards, proactive nudges, one-call lead analysis (satisfaction + qualification + Hot/Warm/Cold), Zoho CRM sync, human handover to a Live Console, call recording via LiveKit Egress.
- **Security**: JWT (pinned HS256) + bcrypt, encrypted stored credentials, SSRF guard re-checked on every redirect, three rate-limit tiers, per-merchant data scoping, helmet, body-size limits, central error handler.

## Local development

```bash
# backend
cd backend
cp .env.example .env        # fill in at least MONGODB_URI, JWT_SECRET, ENCRYPTION_KEY, GROQ_API_KEY, DEEPGRAM_API_KEY
npm install
npm run dev                 # http://localhost:5000

# dashboard (and likewise widget3)
cd frontend/dashboard
npm install
npm run dev                 # http://localhost:5173
```

The server refuses to start if `JWT_SECRET`, `ENCRYPTION_KEY` or `MONGODB_URI` are missing, and logs a warning for each missing optional key (Groq, Deepgram, LiveKit, Redis) with what stops working. `GET /healthz` returns 200 when the API and MongoDB are up.

## Production deploy (single EC2 host)

The server runs everything with Docker Compose behind nginx (TLS via certbot, frontends served from `/var/www/salesbot`).

```bash
# one-time
bash deploy/setup_ec2_docker.sh

# each release (from your machine)
git bundle create /tmp/x.bundle <last-deployed>..<branch>
scp -i key.pem /tmp/x.bundle ubuntu@<host>:/tmp/

# on the server
cd ~/salesBot
git pull --ff-only /tmp/x.bundle <branch>
bash deploy/setup_nginx.sh          # publishes the built frontends + reloads nginx
docker compose restart backend      # or: up -d --build backend if package.json changed
curl -fsS localhost:5000/healthz    # verify
```

Frontends are committed pre-built (`dist/`), so the 1 GB-RAM host never needs to run Vite.

## Environment variables

See [`backend/.env.example`](backend/.env.example) — every variable is documented there, including scaling knobs (`MAX_CONCURRENT_SESSIONS`, `REDIS_URL`, `BROWSER_WS_ENDPOINT`) and security switches (`ALLOW_PRIVATE_URLS`, `TRUST_PROXY`).
