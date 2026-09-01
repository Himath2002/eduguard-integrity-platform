# Integrity Detection Engine Test Suite

This folder contains the backend regression tests for the Integrity Detection Engine component.

## Step 1 - Core engine foundation

Covers text normalization, boilerplate/reference cleanup, chunking, AI probability interpretation, AI detector fail-open behavior, plagiarism matching, source metadata, generic phrase suppression, and stable pipeline contracts.

## Step 2 - Reports, resubmission, fallback, and UI contracts

Covers integrity job schema, safe error messages, highlighted PDF generation, report preview/download consistency, detailed plagiarism source evidence, failed/stuck retry behavior, resubmission cleanup, marked-submission locking, and negative/security validation.

## Step 3 - E2E/API/performance/traceability assets

Adds validation that final Step 3 testing assets exist and remain complete:

- `frontend/tests/e2e/integrity-detection.spec.ts`
- `postman/integrity_detection.postman_collection.json`
- `tests/performance/integrity_detection.k6.js`
- `docs/test-strategy-and-traceability/integrity_detection_traceability.md`

## Run

```bash
cd backend
source .venv/bin/activate
python -m pytest app/tests/integrity_detection -q
```

The tests are designed to be deterministic and offline-safe. They do not require live Hugging Face model downloads or real S3 uploads.


## Step 3 k6 note

The k6 smoke test is designed for local project verification. It fails on broken checks and uncontrolled 5xx responses, while allowing controlled 404/409 states when the supplied local submission ID does not exist. Response-time thresholds can be tightened with environment variables for CI or performance review runs.
