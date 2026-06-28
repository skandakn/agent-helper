"""Local smoke test for the FastAPI workflow without Docker.

This uses SQLite and disables Qdrant so the core API, persistence, background
workflow, and deterministic agents can be tested on a bare Windows machine.
"""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("POSTGRES_URL", "sqlite+aiosqlite:///./backend_smoke_api.db")
os.environ.setdefault("QDRANT_ENABLED", "false")
os.environ.setdefault("AGENT_RUNTIME", "deterministic")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    """Run a minimal end-to-end API smoke test."""

    if os.environ["POSTGRES_URL"].endswith("backend_smoke_api.db"):
        Path("backend_smoke_api.db").unlink(missing_ok=True)

    payload = {
        "theme": "Climate resilience tools for coastal cities",
        "goals": "Recruit builders and create sponsor-ready prototypes.",
        "audience": "Students, civic technologists, designers, and researchers",
        "constraints": {
            "budget": 50000,
            "currency": "USD",
            "duration_days": 2,
            "team_size": 5,
            "location": "Hybrid",
        },
    }

    with TestClient(app) as client:
        launch = client.post("/events/launch", json=payload)
        launch.raise_for_status()
        launch_data = launch.json()
        event_id = launch_data["event_id"]

        status = client.get(f"/events/{event_id}/status")
        status.raise_for_status()

        output = client.get(f"/events/{event_id}/output")
        output.raise_for_status()
        output_data = output.json()["output"]
        assert output_data, "Expected generated launch package"
        assert "Sponsor Pitch Outline" in output_data["final_markdown"]
        assert "Risk Analysis" in output_data["final_markdown"]

        runs = client.get("/agents", params={"event_id": event_id})
        runs.raise_for_status()
        assert len(runs.json()) >= 6, "Expected persisted agent runs"

        memory = client.get("/memory/search", params={"query": "climate sponsor"})
        memory.raise_for_status()

        patch = client.patch(
            f"/events/{event_id}/output",
            json={"final_markdown": output_data["final_markdown"] + "\n\nEdited smoke note."},
        )
        patch.raise_for_status()

        print(
            {
                "event_id": event_id,
                "status": status.json()["status"],
                "agent_runs": len(runs.json()),
                "memory_results": len(memory.json()["results"]),
                "brand": output_data["branding"]["selected_name"],
            }
        )


if __name__ == "__main__":
    main()
