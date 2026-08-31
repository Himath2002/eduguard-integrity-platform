from __future__ import annotations

from pathlib import Path
from textwrap import dedent

from app.ai.risk import compute_ai_risk


def test_rough_student_draft_without_strong_ai_evidence_is_not_marked_as_ai() -> None:
    text = dedent(
        """
        Online class has changed the way students study in many ways, and some of it is good but some parts are confusing too. Before this, most students had to go to the classroom and ask the teacher directly when there was a problem. Now they can open the laptop, check the notes, watch a recording, and send the file from home. This is helpful because travelling takes time and some students are living far away from campus. Still, it is not always easy because internet signal can be weak and sometimes the student does not understand what is happening in the lesson.

        Another problem is that many people think online learning means everything becomes simple. Actually it can make the work more messy. A student may download one document, then another version is uploaded later, and after that the deadline is changed in a message. If the student is not checking the system every day, he or she can miss something important. Also, when the camera is off, the lecturer cannot really know whether everyone is following the topic or just sitting there quietly.

        I think online learning is useful when it is used carefully. It gives more chances for students who cannot always come to university, but it also needs clear instructions and some patience from both sides. The best way is not to say online class is perfect or bad. It depends on how people use it and whether they communicate clearly when something goes wrong.
        """
    ).strip()

    result = compute_ai_risk(text)

    assert result.risk_percent == 0
    assert result.detected is False
    assert result.risk_level == "low"
    assert result.spans == []


def test_repetitive_topic_words_alone_do_not_create_medium_ai_risk() -> None:
    text = dedent(
        """
        Mobile phones are used by students every day, so it is normal that the same words come again and again in a short essay about phones. Students use phones for lessons, messages, photos, calls, reminders, and sometimes for small jobs. This does not mean the writing is automatically made by artificial intelligence. It can simply mean the topic is narrow and the writer is repeating the main idea because there are not many other words to use.

        A student may also write in a simple way when the topic is familiar. The sentences may not be perfect, and the paragraphs may not have a beautiful academic shape. Still, the writing can be honest work. A fair detector should look for stronger evidence before it gives a high percentage, such as very formal template language, repeated artificial transitions, or a reference style that clearly looks machine generated.
        """
    ).strip()

    result = compute_ai_risk(text)

    assert result.risk_percent < 40
    assert result.detected is False
    assert result.risk_level == "low"


def test_ai_style_reference_document_still_scores_as_detected() -> None:
    ai_reference = Path(__file__).resolve().parents[2] / "ai" / "reference" / "ai_like" / "ai_01.txt"

    result = compute_ai_risk(ai_reference.read_text(encoding="utf-8"))

    assert result.risk_percent >= 60
    assert result.detected is True
    assert result.spans


def test_ai_span_impact_values_sum_to_overall_risk_percent() -> None:
    text = dedent(
        """
        In today's rapidly evolving digital landscape, the internet has become an essential tool for education, communication, and professional productivity. It enables learners to access information instantly, supports collaboration across distance, and creates opportunities for flexible work arrangements. Furthermore, online platforms provide scalable access to resources that were previously limited by geography or institutional availability. As a result, individuals and organizations can operate more efficiently while maintaining continuous communication.

        However, it is important to recognize that the internet also introduces challenges such as misinformation, privacy risks, and reduced separation between personal and professional life. Therefore, users must develop digital literacy skills, verify sources carefully, and make responsible decisions when sharing or consuming information. Overall, the internet remains a transformative force that can improve learning and work when it is used thoughtfully and ethically.
        """
    ).strip()

    result = compute_ai_risk(text)

    assert result.risk_percent > 0
    assert result.spans
    assert sum(span.contribution_percent for span in result.spans) == result.risk_percent
