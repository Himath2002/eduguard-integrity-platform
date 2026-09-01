# Integrity Detection Engine - Step 3 Notes

Step 3 adds final workflow, API, performance, and traceability coverage for the Integrity Detection Engine component. It is designed as a separate substantial testing commit after Step 1 and Step 2.

## Added in this step

- Mocked Playwright E2E coverage for student, lecturer, admin, controlled report-not-ready, and unauthenticated report access.
- Postman regression collection for report list, report text, highlighted PDF, detailed PDF, job polling, invalid mode, and missing submission behavior.
- k6 smoke performance test for report summaries, report details, job polling, and PDF endpoint stability, with local-development thresholds that remain configurable for stricter CI runs.
- Traceability document mapping requirements to Step 1, Step 2, and Step 3 test layers.
- Backend asset validation tests that confirm Step 3 testing assets remain present and parseable.

## Production impact

No production functionality is changed by Step 3. This step adds test and documentation assets only.

- Valid 4xx responses such as missing local submission IDs are treated as controlled states in the k6 smoke test, while uncontrolled 5xx responses still fail the run.
