from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def backend_root() -> Path:
    """Return the backend project root directory."""
    return Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def repository_root(backend_root: Path) -> Path:
    """Return the repository root directory."""
    return backend_root.parent


@pytest.fixture(scope="session")
def shared_test_data_dir(repository_root: Path) -> Path:
    """Return the shared test data directory for component tests."""
    return repository_root / "tests" / "test-data"


@pytest.fixture(scope="session")
def client():
    """Shared FastAPI test client."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def student_user():
    return {
        "id": 101,
        "email": "student@test.com",
        "username": "student1",
        "password": "Password123!",
        "role": "student",
        "class_id": 1,
    }


@pytest.fixture
def lecturer_user():
    return {
        "id": 201,
        "email": "lecturer@test.com",
        "username": "lecturer1",
        "password": "Password123!",
        "role": "lecturer",
        "class_id": 1,
    }


@pytest.fixture
def admin_user():
    return {
        "id": 301,
        "email": "admin@test.com",
        "username": "admin1",
        "password": "Password123!",
        "role": "admin",
    }


@pytest.fixture
def auth_routes():
    return {
        "signup": "/auth/signup",
        "login": "/auth/login",
        "change_password": "/auth/change-password",
    }


@pytest.fixture
def bad_auth_header():
    return {"Authorization": "Bearer invalid-token"}