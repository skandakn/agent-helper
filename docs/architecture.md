# Architecture

## System Flow

```mermaid
flowchart LR
  user["User (Next.js UI)"] --> api["FastAPI Backend"]
  api --> runner["Background Agent Runner"]
  runner --> orchestrator["Orchestrator"]
  orchestrator --> research["Research"]
  orchestrator --> branding["Branding"]
  orchestrator --> content["Content"]
  orchestrator --> social["Social Media"]
  orchestrator --> operations["Operations"]
  orchestrator --> critic["Critic"]
  research --> memory["Qdrant Memory"]
  branding --> memory
  content --> memory
  social --> memory
  operations --> memory
  runner --> db["PostgreSQL"]
  runner --> ws["WebSocket Broadcast"]
  ws --> user
```

## Workflow Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Next.js
  participant API as FastAPI
  participant R as Runner
  participant A as Agents
  participant DB as PostgreSQL
  participant M as Qdrant

  U->>UI: Submit hackathon brief
  UI->>API: POST /events/launch
  API->>DB: Create event and orchestrator run
  API-->>UI: event_id and WebSocket URL
  UI->>API: WS /ws/{event_id}
  API->>R: Background workflow
  R->>A: Research
  A->>M: Recall and write summaries
  R->>DB: Persist agent run
  R->>A: Branding, Content, Social, Operations, Critic
  R->>DB: Persist final package
  R-->>UI: Progress and done events
```

## Memory Collections

- `event_templates`: past event briefs, final package summaries, operations patterns.
- `sponsor_templates`: sponsor profiles, sectors, pitch angles.
- `marketing_assets`: landing pages, emails, rubrics, brand systems.
- `campaign_history`: social campaign plans and launch patterns.
- `user_preferences`: future per-user style preferences.

Memory writes store concise summaries with metadata. Raw conversation dumps are intentionally not stored.

## Production Notes

- Replace `Base.metadata.create_all` with Alembic before production rollout.
- Turn on `AGENT_RUNTIME=gemini` only after validating API quotas and output quality.
- Use managed secrets for `JWT_SECRET`, `GEMINI_API_KEY`, and `QDRANT_API_KEY`.
- Add auth enforcement to event/project routes once user ownership rules are finalized.
- Promote the deterministic runtime to a test fixture rather than a production fallback.
