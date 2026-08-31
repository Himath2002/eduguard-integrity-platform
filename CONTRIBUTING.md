# Contributing to EduGuard

Thank you for improving EduGuard. Keep changes focused, preserve the role and trust boundaries described in the README, and use synthetic data in every test or screenshot.

## Development checks

From `frontend/`:

```bash
npm ci
npm run check
```

From `backend/`, with `DATABASE_URL` pointing to a disposable PostgreSQL database:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest -q
```

## Pull requests

- Use a short branch name such as `feature/report-filtering` or `fix/submission-validation`.
- Prefer conventional commit subjects, for example `fix: reject duplicate submission attempts`.
- Explain the outcome and verification evidence in the pull request.
- Never commit real credentials, production data, or identifiable student work.
- Update documentation when configuration, commands, or trust boundaries change.
