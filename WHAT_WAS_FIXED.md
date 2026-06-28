# Campaign Builder fix — what was actually wrong

I read your actual repo (the zip you uploaded), not the README. Two real bugs,
confirmed by tracing the exact code path from `/events/{id}/output` through
to the React components.

## Bug 1 — Campaign Builder always showed empty sections (the one in your screenshot)

`api.getEventOutput()` returns the backend's response envelope:

```json
{ "event_id": 5, "status": "ready", "output": { "branding": {...}, "research": {...}, ... } }
```

But `CampaignBuilder.jsx` was reading `pkg.branding`, `pkg.research`, etc.
straight off that envelope instead of `pkg.output.branding`. Since the
envelope has no top-level `branding` key, every section was always
`undefined` — for every mission, every time, regardless of whether the
backend had generated real data. That's why only one tab rendered and its
content was a bare `—`.

**Fix:** `CampaignBuilder.jsx` now unwraps `response.output` before storing
it in state, and picks whichever section is actually available as the
starting tab instead of hardcoding `"branding"`.

## Bug 2 — a failed workflow run looked identical to "still loading," forever

If any agent step raises (e.g. a budget validation error), the backend sets
`event.status = "failed"` and stores `event.last_error`, but `final_package`
is never written. `AgentMonitor.jsx`'s polling loop only checked for
`status === "ready"` or `"launched"` — a failed run polled every 6 seconds
forever with no visible error, and Campaign Builder showed a permanently
empty page.

**Fix:** `AgentMonitor.jsx` now handles `stage === "failed"` from the
WebSocket stream and `status === "failed"` from the polling fallback. It
stops polling and shows an error banner with the actual failure reason and a
link to launch a new mission. `CampaignBuilder.jsx` also now treats an empty
output object as a load error (same "still running — check Agent Monitor"
banner) instead of silently rendering blank dashes.

Added two new translation keys (`agentMonitor.workflowFailed`,
`agentMonitor.tryAgain`) in all 7 languages your app already supports
(en/hi/kn/te/ta/ml/ur).

## Files changed

```
frontend/components/CampaignBuilder.jsx
frontend/components/AgentMonitor.jsx
frontend/lib/i18n/translations.js
```

## How to apply

Copy these three files over the matching paths in your local repo
(`C:\Users\skand\Desktop\hackathon-agent\frontend\...`), then:

```bash
cd C:\Users\skand\Desktop\hackathon-agent
docker compose up --build -d
```

Open `http://localhost:3000/campaign-builder?event_id=5` again.

- If mission #5's pipeline actually succeeded, you should now see all 6
  tabs (Research, Branding, Content, Social Media, Operations, Critic
  Review) populated.
- If mission #5's pipeline actually failed partway through, you'll now see
  a clear error banner instead of a blank panel — open Agent Monitor for
  that mission to see exactly which stage failed and why, then click
  "Launch a new mission" to retry.

## Note on the previous session's "fixes"

The earlier conversation in this thread referenced files like
`backend/app/services/workflow.py` and a `workflow_deterministic_fix.py`
patch — those don't exist in your actual repo (the real orchestrator file is
`backend/app/services/orchestrator.py`, and it already returns full
deterministic data for every agent when no Gemini key is set). That earlier
diagnosis was guessing from the README rather than the real code, so it
wasn't going to fix anything if applied. This fix is based on reading your
actual uploaded source.
