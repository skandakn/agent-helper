# API Contracts

## POST /events/launch

Request:

```json
{
  "theme": "Climate resilience tools for coastal cities",
  "goals": "Recruit builders and create sponsor-ready prototypes.",
  "audience": "Students, civic technologists, designers, and researchers",
  "venue": "Hybrid",
  "constraints": {
    "budget": 50000,
    "currency": "USD",
    "duration_days": 2,
    "team_size": 5,
    "location": "Hybrid"
  }
}
```

Response:

```json
{
  "event_id": 1,
  "run_id": 1,
  "status": "planning",
  "websocket_url": "ws://localhost:8000/ws/1"
}
```

## WebSocket /ws/{event_id}

Message:

```json
{
  "event_id": 1,
  "stage": "branding",
  "pct": 38,
  "status": "completed",
  "message": "Brand system ready.",
  "data": {}
}
```

## GET /events/{id}/output

Returns `LaunchPackage` after the workflow completes. Before completion, `output` may be an empty object.

## PATCH /events/{id}/output

Request:

```json
{
  "final_markdown": "# Edited package"
}
```

Persists human edits to the generated package record.

## GET /memory/search

Query params:

- `query`: required text query.
- `collection`: optional memory collection.
- `top_k`: optional result count, 1-20.
