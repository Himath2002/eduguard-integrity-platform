# Integrity Detection Engine - Step 3 Advanced Test Strategy and Traceability

## Purpose

This is the final testing layer for the Integrity Detection Engine component. Step 1 covered the core AI/plagiarism engine and preprocessing. Step 2 covered report generation, resubmission refresh, failure fallback, and frontend highlight contracts. Step 3 adds the system-facing quality layer: browser workflows, API regression, performance smoke testing, and traceability evidence.

The Step 3 files do not change production behavior. They add repeatable tests that can be run after future changes to confirm the integrity engine still works with student, lecturer, and admin report flows.

## Test layers included in Step 3

| Layer | File | Purpose |
|---|---|---|
| Browser E2E | `frontend/tests/e2e/integrity-detection.spec.ts` | Verifies student, lecturer, admin, and unauthenticated report workflows using controlled API mocks. |
| API regression | `postman/integrity_detection.postman_collection.json` | Verifies report list, report text, PDF download, detailed PDF, job polling, invalid mode, and missing-report behavior. |
| Performance smoke | `tests/performance/integrity_detection.k6.js` | Verifies report summary/detail/job endpoints remain controlled under local smoke load, treats valid 4xx states as controlled, and fails on uncontrolled 5xx errors. |
| Quality asset tests | `backend/app/tests/integrity_detection/test_step3_quality_assets.py` | Validates that Step 3 assets exist, are parseable, and include the required role/API/performance coverage. |

## Traceability matrix

| Requirement | Step 1/2 coverage | Step 3 coverage |
|---|---|---|
| AI scoring returns stable frontend-safe evidence | `test_ai_detection_scoring.py`, `test_integrity_pipeline_contract.py` | E2E AI tab and Postman report-text contract |
| Plagiarism detection returns visible evidence | `test_plagiarism_matching.py`, `test_report_text_and_downloads.py` | E2E plagiarism modal and Postman report-text contract |
| Student report preview loads and toggles AI/plagiarism | Step 2 frontend unit tests | Student E2E report flow |
| Lecturer detailed report opens correctly | Step 2 backend report tests | Lecturer E2E report flow and Postman detailed PDF request |
| Admin report access uses admin endpoints | Step 2 URL contract tests | Admin E2E and Postman admin report-text/PDF checks |
| Highlighted PDF endpoints do not mismatch preview model | `test_report_text_and_downloads.py` | Postman student/lecturer/admin PDF smoke checks |
| Failed or not-ready reports are user-friendly | `test_integrity_jobs_and_failures.py`, `test_resubmission_integrity_refresh.py` | Student E2E controlled report-text failure check |
| Invalid report mode does not crash backend | `test_integrity_negative_security.py` | Postman invalid mode check |
| Job polling remains stable | `test_integrity_jobs_and_failures.py` | Postman job polling and k6 job polling trend |
| Report list endpoints stay lightweight | Step 2 contract tests | Postman list-summary checks and k6 list duration trends |
| No raw 500 during smoke load | Backend negative tests | k6 `integrity_uncontrolled_5xx` threshold |

## Dynamic testing approach

The Step 3 tests intentionally avoid brittle assertions such as exact AI percentages or exact plagiarism percentages. Instead, they verify stable behavior:

- report cards appear for valid mocked data,
- report modals load the correct plagiarism and AI evidence,
- PDF links use the correct role-specific endpoint and mode,
- controlled failures show a retry/not-ready message,
- Postman accepts expected controlled statuses for missing or not-ready reports,
- k6 fails when checks fail, uncontrolled 5xx responses occur, or local smoke response-time guardrails are exceeded. The response-time guardrails can be tuned with environment variables for stricter CI runs.

## Commands

### Backend integrity tests including Step 3 asset validation

```bash
cd backend
source .venv/bin/activate
python -m pytest app/tests/integrity_detection -q
```

### Frontend Step 2 unit tests

```bash
cd frontend
npm test -- --run reportHighlight.integrity.test.tsx integrityReportUrls.test.ts
```

### Step 3 browser E2E

```bash
cd frontend
npm run e2e -- integrity-detection.spec.ts
```

### Step 3 Postman API regression

```bash
newman run postman/integrity_detection.postman_collection.json   --env-var baseUrl=http://127.0.0.1:8000   --env-var studentIdent=60   --env-var lecturerIdent=lecturer1   --env-var submissionId=77
```

### Step 3 k6 performance smoke

```bash
k6 run tests/performance/integrity_detection.k6.js   -e BASE_URL=http://127.0.0.1:8000   -e STUDENT_IDENT=60   -e LECTURER_IDENT=lecturer1   -e SUBMISSION_ID=77
```

## Before committing Step 3

- [ ] Step 1 + Step 2 backend tests still pass.
- [ ] Step 2 frontend unit tests pass.
- [ ] Step 3 E2E passes with mocked routes.
- [ ] Postman collection runs against the local backend.
- [ ] k6 smoke test runs after backend and database are stable. Use real local student/lecturer/submission identifiers when available.
- [ ] No production file behavior is changed by Step 3.


### Optional k6 threshold tuning

The k6 smoke script uses local-development defaults that are safe for laptops and seeded databases. Stricter thresholds can be supplied without changing the script:

```bash
k6 run tests/performance/integrity_detection.k6.js \
  -e BASE_URL=http://127.0.0.1:8000 \
  -e STUDENT_IDENT=60 \
  -e LECTURER_IDENT=lecturer1 \
  -e SUBMISSION_ID=77 \
  -e VUS=5 \
  -e DURATION=45s \
  -e STUDENT_REPORT_P95_MS=3000 \
  -e LECTURER_REPORT_P95_MS=10000 \
  -e REPORT_TEXT_P95_MS=6000 \
  -e JOB_POLLING_P95_MS=1000
```
