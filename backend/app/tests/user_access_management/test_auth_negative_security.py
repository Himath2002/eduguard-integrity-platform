from uuid import uuid4


def test_signup_rejects_duplicate_email(client, auth_routes):
    unique_suffix = uuid4().hex[:10]
    email = f"duplicate-{unique_suffix}@test.com"
    first_payload = {
        "email": email,
        "username": f"first-{unique_suffix}",
        "full_name": "First User",
        "password": "Password123!",
        "role": "student",
    }
    first_response = client.post(auth_routes["signup"], json=first_payload)
    assert first_response.status_code == 200

    duplicate_payload = {
        **first_payload,
        "username": f"second-{unique_suffix}",
        "full_name": "Second User",
    }
    response = client.post(auth_routes["signup"], json=duplicate_payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already exists"


def test_signup_rejects_too_long_password(client, auth_routes):
    payload = {
        "email": "longpw@test.com",
        "username": "longpwuser",
        "full_name": "Long Password User",
        "password": "a" * 73,
        "role": "student",
    }
    response = client.post(auth_routes["signup"], json=payload)

    assert response.status_code in (400, 422)


def test_change_password_rejects_same_new_password(client, auth_routes):
    payload = {
        "email": "student@test.com",
        "current_password": "Password123!",
        "new_password": "Password123!",
    }
    response = client.post(auth_routes["change_password"], json=payload)

    assert response.status_code in (400, 401, 404)


def test_google_complete_rejects_invalid_token_shape(client):
    payload = {
        "signup_token": "bad-token",
        "username": "googleuser",
        "role": "student",
    }
    response = client.post("/auth/google/complete", json=payload)

    assert response.status_code in (400, 422)


def test_login_rejects_malformed_payload_type(client, auth_routes):
    payload = {
        "email": ["not", "a", "string"],
        "password": 12345,
    }
    response = client.post(auth_routes["login"], json=payload)

    assert response.status_code == 422


def test_signup_rejects_missing_username(client, auth_routes):
    payload = {
        "email": "nousername@test.com",
        "full_name": "No Username",
        "password": "Password123!",
        "role": "student",
    }
    response = client.post(auth_routes["signup"], json=payload)

    assert response.status_code == 422
