def test_login_rejects_wrong_password(client, auth_routes, student_user):
    payload = {
        "email": student_user["email"],
        "password": "WrongPassword999!",
    }
    response = client.post(auth_routes["login"], json=payload)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_rejects_unknown_user(client, auth_routes):
    payload = {
        "email": "unknown@test.com",
        "password": "Password123!",
    }
    response = client.post(auth_routes["login"], json=payload)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_route_exists(client, auth_routes):
    response = client.post(auth_routes["login"], json={})
    assert response.status_code != 404


def test_signup_route_exists(client, auth_routes):
    response = client.post(auth_routes["signup"], json={})
    assert response.status_code != 404


def test_change_password_route_exists(client, auth_routes):
    response = client.post(auth_routes["change_password"], json={})
    assert response.status_code != 404