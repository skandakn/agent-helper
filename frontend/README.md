# Launch Control — frontend

Next.js (pages router) frontend for the Hackathon Launch & Marketing Agent. Built standalone from
your coding prompt's spec — drop this `frontend/` folder in next to your existing `backend/` and it
slots into the same `docker-compose.yml`.

## Design

A launch-control console: ink-navy background, ignition-orange accent, agents shown as a vertical
"mission manifest" with callsigns (`R1` Research, `B2` Branding, `C3` Content, `S4` Social, `O5`
Operations, `QA` Critic). No UI framework — plain CSS with a token system in `styles/globals.css`,
so there's nothing to fight if you want to restyle it.

## Run it

```bash
cd frontend
cp .env.example .env.local   # point at your backend if it's not on localhost:8000
npm install
npm run dev
```

Or via the existing `docker-compose.yml` — no changes needed, it already builds `./frontend` and
maps `3000:3000`.

## Pages → backend routes

This matches your original coding prompt where it specified routes, and proposes a contract for
the few screens it didn't cover (dashboard listing, campaign editing, memory search, analytics,
settings). Everything in this second group degrades gracefully if the route returns 404 — the UI
falls back to data this browser already has locally rather than breaking.

| Page | Calls | Status |
|---|---|---|
| Dashboard | `GET /events?project_id=` | **Not in original spec.** Falls back to a `localStorage` cache of missions this browser has launched. Add this route to show every mission across all clients. |
| New Launch | `POST /events/launch` | ✅ In spec (`events.py`). |
| Agent Monitor | `WS /ws/{event_id}`, `GET /events/{id}/status` (backup poll) | ✅ In spec (`ws.py`, `events.py`). |
| Campaign Builder | `GET /events/{id}/output` | ✅ In spec. |
| Memory Explorer | `GET /memory/search?query=&collection=&top_k=` | **Not in original spec** (it only sketched `GET /memory/{query}`). Wraps `recall()` from `rag.py` — straightforward to add as a thin router. |
| Analytics | `GET /analytics/summary` | **Not in original spec** (the `analytics.py` router was scaffolded empty). Until it exists, the page computes stats from this browser's mission cache instead. |
| Settings | `api.checkHealth()` only (`GET /`) | No settings persisted server-side — secrets stay on the backend, this page never asks for or stores API keys. |

`services/api.js` has one function per row above — point a real route at it and the corresponding
fallback/error state disappears on its own.

## Notes

- WebSocket client (`services/websocket.js`) auto-reconnects with backoff, so a backend restart
  mid-run doesn't strand the Agent Monitor.
- `components/JsonBlock.jsx` renders whatever shape the agents hand back (Gemini's JSON isn't
  always identically shaped run to run) — section headers, bullet lists, hex-color swatches,
  nested cards — without assuming fixed fields.
- `npm audit` will flag a handful of unfixed Next.js 14.x advisories around middleware/App Router
  features (image optimizer, server components, rewrites). This app uses none of them (pages
  router only, no `next/image`, no middleware) — bumping to Next 16 to silence the audit would be
  a bigger lift than this MVP needs, but worth doing before any real production deploy.
