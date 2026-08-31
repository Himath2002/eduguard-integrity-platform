import json
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
PROJECT_ROOT = BACKEND_ROOT.parent


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_step3_e2e_spec_covers_student_lecturer_admin_and_auth_paths() -> None:
    spec = read(PROJECT_ROOT / "frontend/tests/e2e/integrity-detection.spec.ts")

    assert "student opens plagiarism and AI integrity report details" in spec
    assert "lecturer opens detailed integrity report" in spec
    assert "admin opens integrity report details" in spec
    assert "unauthenticated integrity report routes redirect" in spec
    assert "/student/reports" in spec
    assert "/lecturer/reports" in spec
    assert "/admin/reports" in spec
    assert "integrity-highlighted-pdf" in spec
    assert "mode=ai" in spec
    assert "mode=plagiarism" in spec


def test_step3_postman_collection_is_valid_and_role_complete() -> None:
    collection_path = PROJECT_ROOT / "postman/integrity_detection.postman_collection.json"
    collection = json.loads(read(collection_path))

    names = {item["name"] for item in collection["item"]}
    required = {
        "Health check",
        "Student integrity reports list is lightweight",
        "Student report text includes preview evidence contract",
        "Student plagiarism highlighted PDF is controlled",
        "Student AI highlighted PDF is controlled",
        "Lecturer integrity reports list is lightweight",
        "Lecturer report text includes detailed source arrays",
        "Lecturer detailed plagiarism PDF is controlled",
        "Admin report text endpoint is controlled",
        "Admin AI highlighted PDF is controlled",
        "Integrity job polling has stable shape",
        "Invalid report mode never raw-crashes",
        "Missing submission report text is controlled",
    }

    assert required.issubset(names)
    assert collection["info"]["schema"].endswith("collection.json")

    serialized = json.dumps(collection)
    assert "{{studentIdent}}" in serialized
    assert "{{lecturerIdent}}" in serialized
    assert "{{submissionId}}" in serialized
    assert "integrity-highlighted-pdf?mode=ai" in serialized
    assert "integrity-highlighted-pdf?mode=plagiarism" in serialized
    assert "integrity-detailed-pdf" in serialized


def test_step3_k6_script_has_performance_thresholds_and_no_raw_500_guard() -> None:
    script = read(PROJECT_ROOT / "tests/performance/integrity_detection.k6.js")

    assert "integrity_uncontrolled_5xx" in script
    assert "count==0" in script
    assert "student_report_list_duration" in script
    assert "lecturer_report_list_duration" in script
    assert "report_text_duration" in script
    assert "job_polling_duration" in script
    assert "/student/${STUDENT}/reports" in script
    assert "/lecturer/${LECTURER}/reports" in script
    assert "/integrity/jobs/${SUBMISSION_ID}" in script
    assert "integrity-highlighted-pdf?mode=plagiarism" in script


def test_step3_traceability_document_maps_requirements_to_test_layers() -> None:
    doc = read(PROJECT_ROOT / "docs/test-strategy-and-traceability/integrity_detection_traceability.md")

    assert "Traceability matrix" in doc
    assert "Student report preview loads" in doc
    assert "Lecturer detailed report opens" in doc
    assert "Admin report access" in doc
    assert "Invalid report mode" in doc
    assert "No raw 500 during smoke load" in doc
    assert "python -m pytest app/tests/integrity_detection -q" in doc
    assert "npm run e2e -- integrity-detection.spec.ts" in doc
    assert "newman run postman/integrity_detection.postman_collection.json" in doc
    assert "k6 run tests/performance/integrity_detection.k6.js" in doc


def test_step3_notes_are_explicit_that_production_behavior_is_unchanged() -> None:
    notes = read(PROJECT_ROOT / "docs/test-strategy-and-traceability/integrity_detection_step3_notes.md")

    assert "No production functionality is changed" in notes
    assert "Playwright E2E" in notes
    assert "Postman regression" in notes
    assert "k6 smoke" in notes
