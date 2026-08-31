# User and Access Management Traceability

| Requirement | Test File | Test Case |
|---|---|---|
| Signup rejects invalid input | test_auth_validation.py | missing email, missing password, invalid email |
| Login rejects invalid credentials | test_login_and_tokens.py | wrong password, unknown user |
| Change password handles invalid cases | test_role_permissions.py / test_auth_negative_security.py | unknown user, same password, wrong current password |
| Login page renders correctly | LoginPage.test.tsx | renders email/password/sign in |
| Login form enables only when complete | LoginPage.test.tsx | button disabled/enabled behavior |
| Successful login routes by role | RoleVisibility.test.tsx | student, lecturer, admin route navigation |
| Protected routes block unauthorized access | ProtectedRoute.test.tsx | unauthenticated/wrong role redirected |
| Login page browser workflow works | user-access-management.spec.ts | page load, field visibility, button behavior |
| Auth endpoint performance smoke exists | user_access_management_login.k6.js | login latency smoke |
| API regression asset exists | user_access_management.postman_collection.json | login, signup, change-password checks |