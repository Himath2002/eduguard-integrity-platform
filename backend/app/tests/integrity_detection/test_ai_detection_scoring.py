from __future__ import annotations

import pytest

from app.ai import ai_detection
from app.ai.ai_detection import AIDetectionResult, detect_ai
from app.ai.models import _pick_ai_probability


class FakeDetector:
    def __init__(self, outputs):
        self.outputs = outputs
        self.model = type("FakeModel", (), {"name_or_path": "fake-ai-detector-v1"})()
        self.calls: list[list[str]] = []

    def __call__(self, texts):
        self.calls.append(list(texts))
        return self.outputs[: len(texts)]


def test_detect_ai_returns_empty_result_for_empty_chunks() -> None:
    result = detect_ai([])

    assert result == AIDetectionResult(overall_score=0.0, chunks=[], model_name="")


def test_detect_ai_uses_ai_label_probability(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = FakeDetector([{"label": "AI", "score": 0.91}])
    monkeypatch.setattr(ai_detection, "get_ai_detector", lambda: detector)

    result = detect_ai([(1, "Highly formulaic generated looking text.")])

    assert result.overall_score == pytest.approx(0.91)
    assert result.model_name == "fake-ai-detector-v1"
    assert result.chunks[0].chunk_id == 1
    assert result.chunks[0].label == "AI"


def test_detect_ai_inverts_human_probability(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = FakeDetector([{"label": "HUMAN", "score": 0.82}])
    monkeypatch.setattr(ai_detection, "get_ai_detector", lambda: detector)

    result = detect_ai([(5, "Messy reflective human text.")])

    assert result.overall_score == pytest.approx(0.18)


def test_detect_ai_batches_large_inputs_without_losing_chunk_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    outputs = [{"label": "AI", "score": 0.5 + (idx / 100)} for idx in range(10)]
    detector = FakeDetector(outputs)
    monkeypatch.setattr(ai_detection, "get_ai_detector", lambda: detector)

    chunks = [(idx, f"chunk {idx}") for idx in range(10)]
    result = detect_ai(chunks)

    assert len(detector.calls) == 2
    assert [item.chunk_id for item in result.chunks] == list(range(10))
    assert 0.50 <= result.overall_score <= 0.59


def test_detect_ai_fails_open_when_detector_model_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_detection, "get_ai_detector", lambda: (_ for _ in ()).throw(RuntimeError("model missing")))

    result = detect_ai([(1, "Text still needs plagiarism analysis.")])

    assert result.overall_score == 0.0
    assert result.chunks == []
    assert "AI detector unavailable" in str(result.error)


@pytest.mark.parametrize(
    ("output", "expected"),
    [
        ({"label": "AI", "score": 0.76}, 0.76),
        ({"label": "HUMAN", "score": 0.76}, 0.24),
        ([{"label": "LABEL_0", "score": 0.2}, {"label": "FAKE", "score": 0.8}], 0.8),
        ({"label": "REAL", "score": 0.9}, 0.1),
        ({"label": "UNKNOWN", "score": 0.63}, 0.63),
    ],
)
def test_pick_ai_probability_supports_multiple_model_label_styles(output, expected: float) -> None:
    assert _pick_ai_probability(output) == pytest.approx(expected)


def test_pick_ai_probability_honours_explicit_positive_label() -> None:
    output = [{"label": "LABEL_0", "score": 0.3}, {"label": "LABEL_1", "score": 0.7}]

    assert _pick_ai_probability(output, positive_label="LABEL_1") == pytest.approx(0.7)
