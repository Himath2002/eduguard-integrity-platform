def test_google_complete_rejects_invalid_role(client):
    payload = {
        "signup_token": "invalid-token",
        "username": "newgoogleuser",
        "role": "admin",
    }
    response = client.post("/auth/google/complete", json=payload)

    assert response.status_code in (400, 403, 422)


def test_change_password_rejects_unknown_user(client, auth_routes):
    payload = {
        "email": "unknown@test.com",
        "current_password": "OldPassword123!",
        "new_password": "NewPassword123!",
    }
    response = client.post(auth_routes["change_password"], json=payload)

    assert response.status_code == 404
    assert response.json()["detail"] == "User account was not found"


def test_change_password_rejects_wrong_current_password_for_missing_or_invalid_account(client, auth_routes, student_user):
    payload = {
        "email": student_user["email"],
        "current_password": "WrongPassword999!",
        "new_password": "NewPassword123!",
    }
    response = client.post(auth_routes["change_password"], json=payload)

    assert response.status_code in (401, 404)