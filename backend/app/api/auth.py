import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.db.deps import get_db
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    GoogleAuthRequest,
    GoogleCompleteRequest,
    LoginRequest,
    SignupRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_SIGNUP_TOKEN_TTL_SECONDS = 15 * 60
ALLOWED_GOOGLE_SELF_SIGNUP_ROLES = {"student", "lecturer"}


def _serialize_user(user: User) -> dict:
    return {
        "userId": str(user.id),
        "role": user.role,
        "name": user.full_name,
        "username": user.username,
        "email": user.email,
    }


def _clean_email(value: str) -> str:
    return str(value or "").strip()


def _email_key(value: str) -> str:
    return _clean_email(value).lower()


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _clean_username(value: str) -> str:
    return _clean_text(value)


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _get_google_client_id() -> str:
    client_id = _clean_text(os.getenv("GOOGLE_CLIENT_ID"))
    if not client_id:
        raise HTTPException(
            status_code=500,
            detail="Google sign-in is not configured on the server",
        )
    return client_id


def _get_google_signup_secret() -> bytes:
    secret = (
        os.getenv("GOOGLE_SIGNUP_SECRET")
        or os.getenv("APP_SECRET_KEY")
        or os.getenv("DATABASE_URL")
        or os.getenv("GOOGLE_CLIENT_ID")
    )
    secret_text = _clean_text(secret)
    if not secret_text:
        raise HTTPException(
            status_code=500,
            detail="Google sign-in secret is not configured on the server",
        )
    return secret_text.encode("utf-8")


def _issue_google_signup_token(payload: dict[str, Any]) -> str:
    envelope = {
        **payload,
        "exp": int(time.time()) + GOOGLE_SIGNUP_TOKEN_TTL_SECONDS,
        "nonce": secrets.token_urlsafe(12),
    }
    body = json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded_body = _base64url_encode(body)
    signature = hmac.new(
        _get_google_signup_secret(), encoded_body.encode("ascii"), hashlib.sha256
    ).digest()
    encoded_signature = _base64url_encode(signature)
    return f"{encoded_body}.{encoded_signature}"


def _read_google_signup_token(token: str) -> dict[str, Any]:
    try:
        encoded_body, encoded_signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Google signup token") from exc

    expected_signature = hmac.new(
        _get_google_signup_secret(), encoded_body.encode("ascii"), hashlib.sha256
    ).digest()
    actual_signature = _base64url_decode(encoded_signature)

    if not hmac.compare_digest(expected_signature, actual_signature):
        raise HTTPException(status_code=400, detail="Invalid Google signup token")

    try:
        payload = json.loads(_base64url_decode(encoded_body).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Google signup token") from exc

    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=400, detail="Google signup session has expired")

    required_fields = ("sub", "email")
    if not all(_clean_text(payload.get(field)) for field in required_fields):
        raise HTTPException(status_code=400, detail="Google signup token is incomplete")

    return payload


def _suggest_username(email: str, name: str) -> str:
    base_source = _clean_text(name) or _clean_text(email).split("@", 1)[0] or "user"
    sanitized = "".join(ch for ch in base_source.lower() if ch.isalnum() or ch in {"_", "."})
    sanitized = sanitized.strip("._")
    if len(sanitized) < 3:
        sanitized = f"user{secrets.randbelow(9000) + 1000}"
    return sanitized[:50]


def _merge_auth_provider(current: str | None, *, linked_google: bool) -> str:
    current_value = _clean_text(current).lower()
    if not linked_google:
        return current_value or "local"
    if current_value == "google":
        return "google"
    if current_value == "local+google":
        return current_value
    if current_value == "local":
        return "local+google"
    return "google"


def _sync_google_profile(user: User, *, email: str, full_name: str, google_sub: str) -> None:
    user.email = email
    if full_name:
        user.full_name = full_name
    user.google_sub = google_sub
    user.auth_provider = _merge_auth_provider(user.auth_provider, linked_google=True)


def _verify_google_credential(credential: str) -> dict[str, Any]:
    client_id = _get_google_client_id()
    try:
        claims = id_token.verify_oauth2_token(
            credential,
            GoogleRequest(),
            audience=client_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    issuer = _clean_text(claims.get("iss"))
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")

    if not claims.get("email_verified"):
        raise HTTPException(
            status_code=400,
            detail="Google account email must be verified before signing in",
        )

    email = _clean_email(claims.get("email"))
    google_sub = _clean_text(claims.get("sub"))
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google credential is missing identity data")

    return {
        "email": email,
        "sub": google_sub,
        "name": _clean_text(claims.get("name")),
    }


@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    pw = payload.password.strip()

    if len(pw.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400, detail="Password must be 72 characters or less"
        )

    email = _clean_email(payload.email)
    username = payload.username.strip()
    full_name = payload.full_name.strip()

    existing_email = (
        db.query(User).filter(func.lower(User.email) == _email_key(email)).first()
    )
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists")

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        full_name=full_name,
        username=username,
        email=email,
        password=hash_password(pw),
        role=payload.role,
        auth_provider="local",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"mfa_required": False, **_serialize_user(user)}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = _clean_email(payload.email)

    user = db.query(User).filter(func.lower(User.email) == _email_key(email)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.password or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"mfa_required": False, **_serialize_user(user)}


@router.post("/google")
def login_with_google(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    claims = _verify_google_credential(payload.credential)
    email = claims["email"]
    google_sub = claims["sub"]
    full_name = claims.get("name") or email.split("@", 1)[0]

    user = db.query(User).filter(User.google_sub == google_sub).first()
    if user:
        if _email_key(user.email) != _email_key(email):
            conflicting_email_user = (
                db.query(User)
                .filter(func.lower(User.email) == _email_key(email), User.id != user.id)
                .first()
            )
            if conflicting_email_user:
                raise HTTPException(
                    status_code=409,
                    detail="That Google email is already linked to another EduGuard account",
                )
        _sync_google_profile(user, email=email, full_name=full_name, google_sub=google_sub)
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"mfa_required": False, **_serialize_user(user)}

    existing_email_user = (
        db.query(User).filter(func.lower(User.email) == _email_key(email)).first()
    )
    if existing_email_user:
        if existing_email_user.google_sub and existing_email_user.google_sub != google_sub:
            raise HTTPException(
                status_code=409,
                detail="That Google email is already linked to another EduGuard account",
            )
        _sync_google_profile(
            existing_email_user,
            email=email,
            full_name=full_name,
            google_sub=google_sub,
        )
        db.add(existing_email_user)
        db.commit()
        db.refresh(existing_email_user)
        return {"mfa_required": False, **_serialize_user(existing_email_user)}

    return {
        "mfa_required": False,
        "needs_completion": True,
        "signup_token": _issue_google_signup_token(
            {
                "sub": google_sub,
                "email": email,
                "name": full_name,
            }
        ),
        "email": email,
        "name": full_name,
        "suggested_username": _suggest_username(email=email, name=full_name),
    }


@router.post("/google/complete")
def complete_google_signup(payload: GoogleCompleteRequest, db: Session = Depends(get_db)):
    token_payload = _read_google_signup_token(payload.signup_token)
    google_sub = _clean_text(token_payload.get("sub"))
    email = _clean_email(token_payload.get("email"))
    full_name = _clean_text(token_payload.get("name")) or email.split("@", 1)[0]
    username = _clean_username(payload.username)

    if payload.role not in ALLOWED_GOOGLE_SELF_SIGNUP_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Google self-signup is only available for student and lecturer accounts",
        )

    existing_google_user = db.query(User).filter(User.google_sub == google_sub).first()
    if existing_google_user:
        return {"mfa_required": False, **_serialize_user(existing_google_user)}

    existing_email_user = (
        db.query(User).filter(func.lower(User.email) == _email_key(email)).first()
    )
    if existing_email_user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Please sign in again.",
        )

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        full_name=full_name,
        username=username,
        email=email,
        password=hash_password(secrets.token_urlsafe(32)),
        role=payload.role,
        auth_provider="google",
        google_sub=google_sub,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"mfa_required": False, **_serialize_user(user)}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db)):
    email = _clean_email(payload.email)
    user = db.query(User).filter(func.lower(User.email) == _email_key(email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account was not found")

    if not user.password or not verify_password(payload.current_password, user.password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_password = payload.new_password.strip()
    if len(new_password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 characters or less")

    if verify_password(new_password, user.password):
        raise HTTPException(status_code=400, detail="Choose a different new password")

    user.password = hash_password(new_password)
    user.auth_provider = _merge_auth_provider(user.auth_provider, linked_google=bool(user.google_sub))
    db.add(user)
    db.commit()
    return {"ok": True, "message": "Password updated"}
