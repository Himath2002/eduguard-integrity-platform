def test_signup_rejects_missing_email(client, auth_routes):
    payload = {
        "username": "newuser",
        "full_name": "New User",
        "password": "Password123!",
        "role": "student",
    }
    response = client.post(auth_routes["signup"], json=payload)
    assert response.status_code in (400, 422)


def test_signup_rejects_missing_password(client, auth_routes):
    payload = {
        "email": "newuser@test.com",
        "username": "newuser",
        "full_name": "New User",
        "role": "student",
    }
    response = client.post(auth_routes["signup"], json=payload)
    assert response.status_code in (400, 422)


def test_signup_rejects_invalid_email(client, auth_routes):
    payload = {
        "email": "not-an-email",
        "username": "newuser",
        "full_name": "New User",
        "password": "Password123!",
        "role": "student",
    }
    response = client.post(auth_routes["signup"], json=payload)
    assert response.status_code in (400, 422)


def test_login_rejects_missing_email(client, auth_routes):
    payload = {
        "password": "Password123!",
    }
    response = client.post(auth_routes["login"], json=payload)
    assert response.status_code in (400, 422)


def test_login_rejects_missing_password(client, auth_routes):
    payload = {
        "email": "student@test.com",
    }
    response = client.post(auth_routes["login"], json=payload)
    assert response.status_code in (400, 422)


def test_login_rejects_empty_body(client, auth_routes):
    response = client.post(auth_routes["login"], json={})
    assert response.status_code in (400, 422)