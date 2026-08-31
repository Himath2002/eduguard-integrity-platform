# EduGuard Document Management Traceability Matrix

This traceability sheet links the remaining Document Management testing work to concrete automated assets added across commits 1–6.

| Requirement / expectation | Layer | Automated asset | Status |
| --- | --- | --- | --- |
| File type validation blocks non-PDF uploads | Backend unit | `backend/app/tests/document_management/test_file_validation.py` | Implemented |
| Finalize flow rejects wrong bucket, missing upload, empty upload, oversized upload, wrong content type | Backend integration / negative | `backend/app/tests/document_management/test_submission_finalize.py` | Implemented |
| Student identity and ownership rules are enforced for submission access | Backend rule / permission | `backend/app/tests/document_management/test_submission_upload_rules.py` | Implemented |
| Upload UI rejects invalid file selection and surfaces validation clearly | Frontend unit | `frontend/src/features/student/tests/document_management/StudentAssignmentsPage.document-management.test.tsx` | Implemented |
| Upload UI drives the presign → storage upload → finalize flow with expected payloads | Frontend integration | `frontend/src/features/student/tests/document_management/StudentAssignmentsPage.document-management.test.tsx` | Implemented |
| Local upload endpoint rejects wrong role, wrong extension, wrong content type, and disallowed resubmission | Backend negative / security | `backend/app/tests/document_management/test_submission_negative_security.py` | Implemented |
| Valid student workflow succeeds in a browser session | E2E workflow | `frontend/tests/e2e/document-management.spec.ts` (`student uploads a valid PDF...`) | Implemented |
| Invalid upload shows a clear UI error | E2E workflow / negative | `frontend/tests/e2e/document-management.spec.ts` (`student sees a clear error...`) | Implemented |
| Network/storage interruption does not silently succeed | E2E resilience | `frontend/tests/e2e/document-management.spec.ts` (`student sees a resilient error...`) | Implemented |
| Unauthenticated access is blocked | E2E security | `frontend/tests/e2e/document-management.spec.ts` (`unauthenticated access...`) | Implemented |
| Lecturer can access the submitted work context in the correct class | E2E workflow | `frontend/tests/e2e/document-management.spec.ts` (`lecturer can view...`) | Implemented |
| Upload latency and response time can be measured under concurrent smoke load | Performance | `tests/performance/document_management_upload.k6.js` | Added |
| API regression checks are reusable by the team | Regression evidence | `postman/document_management.postman_collection.json` | Added |

## Evidence expectations
- Store backend pytest results, frontend Vitest results, and Playwright run output in the shared evidence area after each staging run.
- Save screenshots of the upload success, invalid upload, and blocked unauthorized access paths during milestone regression.
- Attach any open defect references next to the affected row above when an issue is found.
