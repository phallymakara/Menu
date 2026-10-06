"""Regression test: the application starts and shuts down through its lifespan."""

from fastapi import status
from starlette.testclient import TestClient

from app.main import app


def test_lifespan_starts_and_stops_cleanly():
    """Entering the client runs startup (including the real-time broadcaster)."""
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "running"
