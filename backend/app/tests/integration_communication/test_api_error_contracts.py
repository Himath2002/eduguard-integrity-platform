from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _json_or_empty(response):
    try:
        return response.json()
    except Exception:
        return {}


def test_health_endpoint_returns_standard_success_contract() -> None:
    response = client.get("/health")

    assert response.status_code == 200

    data = _json_or_empty(response)

    assert isinstance(data, dict)
    assert data, "Health endpoint should return a JSON object"

    # Different EduGuard versions may use "ok", "status", or service fields.
    # This keeps the test focused on communication contract stability.
    assert any(key in data for key in ["ok", "status", "service", "database", "db"]), (
        f"Unexpected health response shape: {data}"
    )


def test_unknown_route_returns_standard_404_error_contract() -> None:
    response = client.get("/integration-communication/unknown-route-for-test")

    assert response.status_code == 404

    data = _json_or_empty(response)

    assert isinstance(data, dict)
    assert "detail" in data
    assert data["detail"]


def test_malformed_json_returns_422_error_contract() -> None:
    response = client.post(
        "/auth/signup",
        content="{ invalid json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422

    data = _json_or_empty(response)

    assert isinstance(data, dict)
    assert "detail" in data
    assert data["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"username": "missing-required-fields"},
        {
            "full_name": "",
            "username": "",
            "email": "not-an-email",
            "password": "",
            "role": "invalid-role",
        },
    ],
)
def test_signup_rejects_invalid_request_payload_with_clear_error(payload: dict) -> None:
    response = client.post("/auth/signup", json=payload)

    assert response.status_code in {400, 422}

    data = _json_or_empty(response)

    assert isinstance(data, dict)
    assert "detail" in data
    assert data["detail"]


def test_wrong_method_returns_405_error_contract() -> None:
    response = client.post("/health")

    assert response.status_code == 405

    data = _json_or_empty(response)

    assert isinstance(data, dict)
    assert "detail" in data
    assert data["detail"]


def test_api_rejects_invalid_content_type_or_invalid_body_safely() -> None:
    response = client.post(
        "/auth/signup",
        content="plain text body that is not valid json",
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code in {400, 415, 422}

    data = _json_or_empty(response)

    assert isinstance(data, dict)
    assert "detail" in data
